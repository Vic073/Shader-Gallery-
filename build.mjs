import { build } from 'esbuild'
import { mkdir, writeFile, rm, cp } from 'node:fs/promises'
import { getShaderByName } from 'shaders/registry'
import { pages as manual } from './pages.mjs'
import { generatePages } from './gen.mjs'
const { pages, skipped } = generatePages(manual)
console.log(`Generated ${pages.length} pages (${manual.length} hand-tuned); skipped: ${skipped.join('; ')}`)

const OUT = new URL('./dist/', import.meta.url).pathname
await rm(OUT, { recursive: true, force: true })
await mkdir(OUT, { recursive: true })

/* ---------- validate presets + resolve control UI from package metadata ---------- */
const errors = []
const hexRe = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

function walk(list, fn) { for (const c of list) { fn(c); if (c.children) walk(c.children, fn) } }

for (const p of pages) {
  const byId = {}
  walk(p.components, (c) => {
    const meta = getShaderByName(c.type)
    if (!meta) { errors.push(`${p.slug}: unknown component ${c.type}`); return }
    if (byId[c.id]) errors.push(`${p.slug}: duplicate id ${c.id}`)
    byId[c.id] = { c, meta }
    const kids = (c.children || []).length
    if (meta.requiresChild && kids === 0) errors.push(`${p.slug}: ${c.type} requires a child`)
    if (meta.requiresChild === false && kids > 0) errors.push(`${p.slug}: ${c.type} takes no children`)
    for (const k of Object.keys(c.props || {})) {
      if (!meta.propsMetadata?.[k]) errors.push(`${p.slug}: ${c.type} has no prop "${k}"`)
    }
  })

  p.resolved = []
  for (const ref of p.controls) {
    const [id, prop] = ref.split('.')
    const hit = byId[id]
    if (!hit) { errors.push(`${p.slug}: control ${ref} targets missing id`); continue }
    const pm = hit.meta.propsMetadata?.[prop]
    if (!pm) { errors.push(`${p.slug}: ${hit.c.type} has no prop "${prop}"`); continue }
    const ui = pm.ui || {}
    const types = [].concat(ui.type)
    const current = hit.c.props?.[prop] ?? pm.default
    let kind = null
    if (types.includes('color')) kind = hexRe.test(current) ? 'color' : null
    else if (types.includes('select')) kind = ui.options?.length ? 'select' : null
    else if (types.includes('range')) kind = ui.min !== undefined && ui.max !== undefined ? 'range' : null
    else if (types.includes('checkbox')) kind = typeof current === 'boolean' ? 'toggle' : null
    if (!kind) { console.warn(`skip ${ref} (ui ${JSON.stringify(ui.type)}, value ${JSON.stringify(current)})`); continue }
    p.resolved.push({
      id, prop, kind, label: ui.label || prop, value: current,
      min: ui.min, max: ui.max, step: ui.step, options: ui.options,
      component: hit.c.type,
    })
  }

  // accent colors for gallery thumbnails
  const colors = []
  walk(p.components, (c) => {
    const meta = getShaderByName(c.type)
    for (const [k, pm] of Object.entries(meta?.propsMetadata || {})) {
      const v = c.props?.[k] ?? pm.default
      if ([].concat(pm.ui?.type).includes('color') && hexRe.test(v) && v.length <= 7) colors.push(v)
    }
  })
  const lum = (h) => { h = h.length === 4 ? '#' + [...h.slice(1)].map((x) => x + x).join('') : h; const n = parseInt(h.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 }
  const vivid = [...new Set(colors)].filter((c) => lum(c) > 0.12 && lum(c) < 0.9)
  if (vivid.length < 2) {
    let h = 0; for (const ch of p.slug) h = (h * 31 + ch.charCodeAt(0)) % 360
    vivid.push(`hsl(${h} 80% 58%)`, `hsl(${(h + 70) % 360} 85% 55%)`)
  }
  p.accent = vivid.slice(0, 3)
}

if (errors.length) { console.error('Validation failed:\n' + errors.join('\n')); process.exit(1) }
console.log(`Validated ${pages.length} pages OK`)

/* ---------- bundle the runtime ---------- */
await build({
  entryPoints: { app: 'src/app.js' },
  bundle: true, minify: true, format: 'esm', splitting: true, target: 'es2022',
  outdir: OUT, chunkNames: 'chunks/[name]-[hash]', logLevel: 'warning',
})
await writeFile(OUT + 'presets.json', JSON.stringify(Object.fromEntries(pages.map((p) => [p.slug, p.components]))))
await cp('src/style.css', OUT + 'style.css')
await cp('src/fonts', OUT + 'fonts', { recursive: true })

/* ---------- HTML ---------- */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const pad3 = (n) => String(n).padStart(3, '0')
const grad = (p) => {
  const a = p.accent
  return `radial-gradient(120% 120% at 20% 10%, ${a[0]}, transparent 60%), radial-gradient(100% 100% at 90% 90%, ${a[1]}, transparent 55%), ${a[2] || '#0b0b12'}`
}
const GITHUB = 'https://github.com/shader-effects-inc/shaders'

const head = (title, desc) => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#08080a">
<link rel="preload" href="fonts/geist.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="style.css">
<noscript><style>.io,.reveal{opacity:1!important;transform:none!important;filter:none!important;animation:none!important}</style></noscript>
</head>`

const cats = [...new Set(pages.map((p) => p.category))]

const idx = `${head('Shader Gallery', `${pages.length} live WebGPU shader effects you can tweak in real time, built with the open-source shaders package.`)}
<body class="home">
<section class="hero" id="hero">
  <canvas id="stage" aria-hidden="true"></canvas>
  <div class="fallback" id="fallback" hidden></div>
  <div class="veil" aria-hidden="true"></div>
  <header class="nav liquidGL">
    <a class="brand" href="index.html"><i></i>Shader Gallery</a>
    <a class="btn" href="#effects">Effects</a>
    <a class="btn" href="${GITHUB}">GitHub ↗</a>
  </header>
  <div class="hero-inner">
    <h1 class="display reveal" style="--i:0"><span>Shader</span><span>Gallery</span></h1>
    <div class="hero-side">
      <p class="eyebrow reveal" style="--i:2"><b>(Index)</b> N°01</p>
      <p class="lede reveal" style="--i:3">${pages.length} real-time WebGPU effects. Open any one, drag the sliders, and copy the code. Powered by the open-source <a href="${GITHUB}">shaders</a> package.</p>
      <div class="cta liquidGL reveal" style="--i:4"><a class="btn solid lg" href="#effects">Explore ${pages.length} effects ↓</a></div>
    </div>
  </div>
</section>

<main class="section" id="effects">
  <div class="section-head">
    <p class="eyebrow io"><b>(Effects)</b> N°02</p>
    <h2 class="io" style="--d:60">Every effect, tuned live.</h2>
  </div>
  <section class="filters glass" id="search" aria-label="Filter effects">
    <div class="row1">
      <label class="search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input id="q" type="search" placeholder="Search ${pages.length} effects" aria-label="Search effects" autocomplete="off"></label>
      <p class="count" id="count" aria-live="polite"></p>
    </div>
    <div class="chips" id="chips" role="group" aria-label="Filter by category">
      <button type="button" class="chip" data-cat="" aria-pressed="true">All<small>${pages.length}</small></button>
      ${cats.map((c) => `<button type="button" class="chip" data-cat="${esc(c)}" aria-pressed="false">${esc(c)}<small>${pages.filter((p) => p.category === c).length}</small></button>`).join('')}
    </div>
  </section>
  <section class="grid" id="grid" aria-label="All effects">
    ${pages.map((p, i) => `
    <a class="card io" style="--d:${(i % 4) * 60}" href="${p.slug}.html" data-slug="${p.slug}" data-cat="${esc(p.category)}" data-text="${esc((p.title + ' ' + p.category + ' ' + p.blurb).toLowerCase())}">
      <span class="thumb" style="background:${grad(p)}"><em>N°${pad3(i + 1)}</em><u aria-hidden="true">↗</u></span>
      <span class="cat">${esc(p.category)}</span>
      <strong>${esc(p.title)}</strong>
      <span class="blurb">${esc(p.blurb)}</span>
    </a>`).join('')}
    <p class="empty" id="empty" hidden>No effects match that search.</p>
  </section>
</main>
<footer class="foot">
  <span>Effects by <a href="https://shaders.com">Shaders</a> · MIT</span>
  <span>Glass by <a href="https://liquidgl.naughtyduk.com">liquidGL</a> · MIT</span>
  <span>Needs WebGPU: recent Chrome, Edge, Safari or Firefox</span>
</footer>
<script>window.__PAGE__=${JSON.stringify({
  home: true,
  components: [{ type: 'FlowingGradient', id: 'fx', props: { colorA: '#05060f', colorB: '#2a1fd6', colorC: '#d6336c', colorD: '#f4c28a', speed: 0.6, distortion: 0.75 } }],
})}</script>
<script type="module" src="app.js"></script>
</body></html>`
await writeFile(OUT + 'index.html', idx)

for (const [i, p] of pages.entries()) {
  let canUpload = false
  walk(p.components, (c) => { if (c.id === 'src') canUpload = true })
  const data = { slug: p.slug, title: p.title, components: p.components, controls: p.resolved, canUpload }
  const prev = pages[(i - 1 + pages.length) % pages.length], next = pages[(i + 1) % pages.length]
  const html = `${head(p.title + ' · Shader Gallery', p.blurb)}
<body class="detail">
<div class="scene">
  <section class="stage-wrap" id="stage-wrap">
    <canvas id="stage" aria-label="${esc(p.title)} shader preview"></canvas>
    <div class="fallback" id="fallback" hidden></div>
    <header class="nav liquidGL">
      <a class="brand" href="index.html"><i></i>Shader Gallery</a>
      <span class="crumbs"><a href="index.html#${encodeURIComponent(p.category)}">${esc(p.category)}</a><span aria-hidden="true">/</span><span aria-current="page">${esc(p.title)}</span></span>
      <a class="btn" href="index.html#search">Browse ${pages.length}</a>
    </header>
    <div class="title-block">
      <p class="eyebrow reveal" style="--i:0"><b>(${esc(p.category)})</b> N°${pad3(i + 1)}</p>
      <h1 class="display reveal" style="--i:1">${esc(p.title)}</h1>
      <p class="lede reveal" style="--i:2">${esc(p.blurb)}</p>
      ${p.hint ? `<p class="hint reveal" style="--i:3">${esc(p.hint)}</p>` : ''}
    </div>
    <div class="dock liquidGL" role="toolbar" aria-label="Page actions">
      <a class="btn" href="${prev.slug}.html" title="${esc(prev.title)}" aria-label="Previous: ${esc(prev.title)}">← Prev</a>
      <a class="btn" href="${next.slug}.html" title="${esc(next.title)}" aria-label="Next: ${esc(next.title)}">Next →</a>
      <span class="sep" aria-hidden="true"></span>
      <button id="reset" class="btn" type="button">Reset</button>
      <button id="glass" class="btn" type="button" aria-pressed="true" title="Toggle liquid-glass refraction">Glass</button>
      <button id="copy" class="btn solid" type="button">Copy code</button>
    </div>
  </section>
  <aside class="panel glass reveal" style="--i:3" aria-label="Controls">
    <div class="panel-head"><p class="eyebrow"><b>Controls</b></p><p class="eyebrow">${p.resolved.length} params</p></div>
    <div class="panel-body">
      <div class="panel-actions">
        <button id="share" class="btn sm" type="button" title="Copy a link that restores your current settings">Copy link</button>
        ${canUpload ? `<button id="imgbtn" class="btn sm" type="button" title="Run this effect on your own picture">Use your image</button>
        <button id="imgreset" class="btn sm" type="button" hidden>Demo source</button>
        <input id="imgfile" type="file" accept="image/*" hidden>` : ''}
      </div>
      <form id="controls" class="controls" onsubmit="return false">${p.resolved.length ? '' : '<p class="nocontrols">This effect has no adjustable parameters. It applies as-is.</p>'}</form>
      <details class="code" open>
        <summary>Code</summary>
        <div class="tabs" role="tablist" aria-label="Framework">
          ${['react:React', 'vue:Vue', 'svelte:Svelte', 'solid:Solid', 'js:JS'].map((t) => { const [k, l] = t.split(':'); return `<button class="tab" role="tab" type="button" data-fw="${k}" aria-selected="false">${l}</button>` }).join('')}
        </div>
        <pre id="code" aria-label="Generated code"></pre>
      </details>
    </div>
  </aside>
</div>
<script>window.__PAGE__=${JSON.stringify(data)}</script>
<script type="module" src="app.js"></script>
</body></html>`
  await writeFile(OUT + p.slug + '.html', html)
}
console.log('Built', pages.length + 1, 'pages →', OUT)
