import { build } from 'esbuild'
import { mkdir, writeFile, rm, cp } from 'node:fs/promises'
import { getShaderByName } from 'shaders/registry'
import { pages } from './pages.mjs'

const OUT = new URL('./dist/', import.meta.url).pathname
await rm(OUT, { recursive: true, force: true })
await mkdir(OUT, { recursive: true })

/* ---------- validate presets + resolve control UI from package metadata ---------- */
const errors = []
const hexRe = /^#[0-9a-f]{3,8}$/i

function walk(list, fn) { for (const c of list) { fn(c); if (c.children) walk(c.children, fn) } }

for (const p of pages) {
  const byId = {}
  walk(p.components, (c) => {
    const meta = getShaderByName(c.type)
    if (!meta) { errors.push(`${p.slug}: unknown component ${c.type}`); return }
    byId[c.id] = { c, meta }
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
    else if (types.includes('select')) kind = 'select'
    else if (types.includes('range')) kind = 'range'
    else if (types.includes('toggle') || types.includes('boolean')) kind = 'toggle'
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
  p.accent = [...new Set(colors)].slice(0, 4)
}

if (errors.length) { console.error('Validation failed:\n' + errors.join('\n')); process.exit(1) }
console.log(`Validated ${pages.length} pages OK`)

/* ---------- bundle the runtime ---------- */
await build({
  entryPoints: ['src/app.js'],
  bundle: true, minify: true, format: 'iife', target: 'es2022',
  outfile: OUT + 'app.js', logLevel: 'warning',
})
await cp('src/style.css', OUT + 'style.css')

/* ---------- HTML ---------- */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const grad = (p) => {
  const a = p.accent.length >= 2 ? p.accent : ['#4361ee', '#f72585']
  return `radial-gradient(120% 120% at 20% 10%, ${a[0]}, transparent 60%), radial-gradient(100% 100% at 90% 90%, ${a[1]}, transparent 55%), ${a[2] || '#0b0b14'}`
}

const nav = (active) => `
<header class="nav">
  <a class="brand" href="index.html"><span class="dot"></span>Shader Gallery</a>
  <nav class="links" aria-label="Shaders">
    ${pages.map((p) => `<a href="${p.slug}.html"${p.slug === active ? ' aria-current="page"' : ''}>${esc(p.title)}</a>`).join('')}
  </nav>
</header>`

const head = (title, desc) => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<link rel="stylesheet" href="style.css"></head>`

const idx = `${head('Shader Gallery', 'A gallery of WebGPU shader effects built with the open-source shaders package.')}
<body class="home">
${nav('')}
<main>
  <section class="hero">
    <canvas id="stage" aria-hidden="true"></canvas>
    <div class="hero-copy">
      <p class="eyebrow">${pages.length} live WebGPU effects</p>
      <h1>Shader Gallery</h1>
      <p class="lede">One page per effect. Tweak every parameter in real time and copy the code. Powered by the open-source <a href="https://github.com/shader-effects-inc/shaders">shaders</a> package.</p>
    </div>
    <div class="fallback" id="fallback" hidden></div>
  </section>
  <section class="grid" aria-label="All shaders">
    ${pages.map((p) => `
    <a class="card" href="${p.slug}.html">
      <span class="thumb" style="background:${grad(p)}"></span>
      <span class="cat">${esc(p.category)}</span>
      <strong>${esc(p.title)}</strong>
      <span class="blurb">${esc(p.blurb)}</span>
    </a>`).join('')}
  </section>
  <footer class="foot">Effects by <a href="https://shaders.com">Shaders</a> (MIT). Needs a WebGPU-capable browser (recent Chrome, Edge, Safari or Firefox).</footer>
</main>
<script>window.__PAGE__=${JSON.stringify({
  home: true,
  components: [{ type: 'FlowingGradient', id: 'fx', props: { colorA: '#05060f', colorB: '#3a0ca3', colorC: '#f72585', colorD: '#4cc9f0', speed: 0.7, distortion: 0.7 } }],
})}</script>
<script src="app.js"></script>
</body></html>`
await writeFile(OUT + 'index.html', idx)

for (const p of pages) {
  const data = { slug: p.slug, title: p.title, components: p.components, controls: p.resolved }
  const i = pages.indexOf(p)
  const prev = pages[(i - 1 + pages.length) % pages.length], next = pages[(i + 1) % pages.length]
  const html = `${head(p.title + ' · Shader Gallery', p.blurb)}
<body class="detail">
${nav(p.slug)}
<main class="layout">
  <section class="stage-wrap">
    <canvas id="stage" aria-label="${esc(p.title)} shader preview"></canvas>
    <div class="fallback" id="fallback" hidden></div>
    ${p.hint ? `<p class="hint">${esc(p.hint)}</p>` : ''}
  </section>
  <aside class="panel">
    <p class="eyebrow">${esc(p.category)}</p>
    <h1>${esc(p.title)}</h1>
    <p class="lede">${esc(p.blurb)}</p>
    <form id="controls" class="controls" onsubmit="return false"></form>
    <button id="reset" class="btn ghost" type="button">Reset</button>
    <details class="code" open>
      <summary>Code</summary>
      <pre id="code" aria-label="Generated code"></pre>
      <button id="copy" class="btn" type="button">Copy code</button>
    </details>
    <div class="pager">
      <a href="${prev.slug}.html">← ${esc(prev.title)}</a>
      <a href="${next.slug}.html">${esc(next.title)} →</a>
    </div>
  </aside>
</main>
<script>window.__PAGE__=${JSON.stringify(data)}</script>
<script src="app.js"></script>
</body></html>`
  await writeFile(OUT + p.slug + '.html', html)
}
console.log('Built', pages.length + 1, 'pages →', OUT)
