import { createShader } from 'shaders/js'

const page = window.__PAGE__
const canvas = document.getElementById('stage')
const fallback = document.getElementById('fallback')
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

/* ---------- storage (can throw in private windows) ---------- */
const store = {
  get(k) { try { return localStorage.getItem(k) } catch { return null } },
  set(k, v) { try { localStorage.setItem(k, v) } catch { /* ignore */ } },
}

/* ---------- shader ---------- */
function showFallback(reason) {
  if (!fallback || !fallback.hidden) return
  const msgs = {
    unsupported: 'This browser doesn’t support WebGPU yet.',
    'no-adapter': 'No compatible GPU was found for WebGPU.',
  }
  fallback.hidden = false
  fallback.innerHTML = `<strong>Can’t render this shader</strong><span>${msgs[reason] || 'WebGPU failed to start (' + reason + ').'} Try a recent version of Chrome, Edge, Safari or Firefox.</span>`
}

canvas.style.width = '100%'
canvas.style.height = '100%'

const clone = (o) => JSON.parse(JSON.stringify(o))
const live = clone(page.components) // current preset, tracks edits for the code box
const find = (list, id) => {
  for (const c of list) {
    if (c.id === id) return c
    const hit = c.children && find(c.children, id)
    if (hit) return hit
  }
}

let shader = null
async function start() {
  if (!('gpu' in navigator)) return showFallback('unsupported')
  try {
    shader = await createShader(canvas, { components: clone(page.components) }, { onError: showFallback })
  } catch (err) {
    console.error(err)
    showFallback('init-failed')
  }
}

/* ---------- liquid glass (liquidGL) ----------
   CSS glass (backdrop-filter) is always there as the base layer. liquidGL adds real
   refraction on top of the `.liquidGL` elements once the page has rendered a few frames.
   If it fails for any reason the CSS glass simply stays. */
let lenses = []
const glassOff = new URLSearchParams(location.search).get('glass') === 'off' || store.get('glass') === 'off'

async function enableGlass() {
  if (lenses.length) return true
  try {
    const mod = await import('liquid-gl')
    const lg = window.liquidGL || mod.default
    const made = lg({
      target: '.liquidGL',
      snapshot: page.home ? '#hero' : 'body',
      zIndex: 5,
      resolution: 1.5,
      refraction: 0.02,
      bevelDepth: 0.12,
      bevelWidth: 0.22,
      aberration: 0.15,
      frost: 1.5,
      tint: 'rgba(12,12,18,0.14)',
      specular: true,
      shadow: true,
      interaction: 'fluid',
      interactionStrength: 0.3,
      on: { init() { document.documentElement.classList.add('gl') } },
    })
    lenses = [].concat(made).filter(Boolean)
    return true
  } catch (err) {
    console.warn('liquidGL unavailable, using CSS glass', err)
    document.documentElement.classList.remove('gl')
    return false
  }
}
function disableGlass() {
  for (const l of lenses) { try { l.destroy() } catch { /* ignore */ } }
  lenses = []
  document.documentElement.classList.remove('gl')
}

/* ---------- pointer-tracked highlights (glass, buttons, cards) ---------- */
let raf = 0
document.addEventListener('pointermove', (e) => {
  const el = e.target.closest?.('.glass, .liquidGL, .btn, .card')
  if (!el || raf) return
  raf = requestAnimationFrame(() => {
    raf = 0
    const r = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${e.clientX - r.left}px`)
    el.style.setProperty('--my', `${e.clientY - r.top}px`)
  })
}, { passive: true })

/* ---------- scroll reveals ---------- */
function setupReveal() {
  const items = [...document.querySelectorAll('.io')]
  if (!('IntersectionObserver' in window) || reduceMotion) { items.forEach((i) => i.classList.add('in')); return }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) }
  }, { rootMargin: '0px 0px -8% 0px' })
  items.forEach((i) => io.observe(i))
}

/* ---------- home: search + category filter ---------- */
function setupHome() {
  const q = document.getElementById('q')
  const chips = [...document.querySelectorAll('.chip')]
  const cards = [...document.querySelectorAll('.card')]
  const count = document.getElementById('count')
  const empty = document.getElementById('empty')
  let cat = ''

  const run = () => {
    const term = q.value.trim().toLowerCase()
    let n = 0
    for (const c of cards) {
      const show = (!cat || c.dataset.cat === cat) && (!term || c.dataset.text.includes(term))
      c.hidden = !show
      if (show) n++
    }
    empty.hidden = n > 0
    count.textContent = `${n} / ${cards.length}`
    chips.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === cat)))
  }
  const fromHash = () => {
    const h = decodeURIComponent(location.hash.slice(1))
    if (h === 'search') {
      document.getElementById('effects').scrollIntoView()
      q.focus({ preventScroll: true })
    } else if (h && chips.some((b) => b.dataset.cat === h)) {
      cat = h; run()
      document.getElementById('effects').scrollIntoView()
    }
  }
  chips.forEach((b) => b.addEventListener('click', () => { cat = b.dataset.cat; run() }))
  q.addEventListener('input', run)
  window.addEventListener('hashchange', fromHash)
  run(); fromHash()
}

/* ---------- home: live previews on the cards you can see ----------
   A small pool of real shaders runs on the visible cards closest to the middle of the screen
   (the rest keep their gradient). As you scroll, cards that leave are stopped and new ones start,
   a few at a time so scrolling never stalls. The library shares one GPU device across all of them. */
function setupPreviews() {
  const grid = document.getElementById('grid')
  if (!grid || !('gpu' in navigator) || reduceMotion) return
  const MAX = matchMedia('(hover: none)').matches ? 3 : 8
  const cards = [...grid.querySelectorAll('.card')]
  const visible = new Set()
  const live = new Map()      // card -> { canvas, inst }
  const failed = new Set()
  let presets = null, hovered = null, pending = 0, starting = false
  const load = async () => (presets ??= await (await fetch('presets.json')).json())

  const stop = (card) => {
    const a = live.get(card)
    if (!a) return
    live.delete(card)
    try { a.inst?.destroy() } catch { /* ignore */ }
    a.canvas.remove()
  }

  async function start(card) {
    const comps = (await load())[card.dataset.slug]
    if (!comps || !visible.has(card) || live.has(card)) return
    const canvas = document.createElement('canvas')
    canvas.className = 'live'
    card.querySelector('.thumb').prepend(canvas)
    const a = { canvas, inst: null }
    live.set(card, a)
    try {
      const inst = await createShader(canvas, { components: clone(comps) }, {
        onError: () => { failed.add(card); stop(card) },
      })
      if (live.get(card) !== a) { inst.destroy(); return }   // scrolled away while starting
      a.inst = inst
      requestAnimationFrame(() => canvas.classList.add('on'))
    } catch {
      failed.add(card); stop(card)
    }
  }

  // Decide who should be live: hovered card first, then visible cards nearest the viewport centre.
  async function reconcile() {
    pending = 0
    const mid = innerHeight / 2
    const want = [...visible]
      .filter((c) => !c.hidden && !failed.has(c))
      .sort((x, y) => {
        if (x === hovered) return -1
        if (y === hovered) return 1
        const dx = Math.abs(x.getBoundingClientRect().top + 110 - mid)
        const dy = Math.abs(y.getBoundingClientRect().top + 110 - mid)
        return dx - dy
      })
      .slice(0, MAX)
    const wantSet = new Set(want)
    for (const c of [...live.keys()]) if (!wantSet.has(c)) stop(c)
    if (starting) return
    starting = true
    for (const c of want) {
      if (live.has(c)) continue
      await start(c)
      await new Promise((r) => setTimeout(r, 90))          // stagger: one new shader at a time
    }
    starting = false
    // The visible set may have changed while we were starting; catch up (failed cards are excluded, so this ends).
    if (want.some((c) => !live.has(c) && !failed.has(c) && visible.has(c) && !c.hidden)) schedule()
  }
  const schedule = () => { if (!pending) pending = setTimeout(reconcile, 140) }

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) { e.isIntersecting ? visible.add(e.target) : visible.delete(e.target) }
    schedule()
  }, { rootMargin: '-6% 0px -6% 0px' })
  cards.forEach((c) => io.observe(c))

  addEventListener('scroll', schedule, { passive: true })
  addEventListener('resize', schedule)
  document.getElementById('q')?.addEventListener('input', schedule)
  document.getElementById('chips')?.addEventListener('click', () => setTimeout(schedule, 60))

  grid.addEventListener('pointerover', (e) => {
    const c = e.target.closest?.('.card')
    if (c && c !== hovered) { hovered = c; schedule() }
  })
  grid.addEventListener('pointerleave', () => { hovered = null })

  // Pause everything when the tab is hidden.
  document.addEventListener('visibilitychange', () => {
    for (const a of live.values()) { try { document.hidden ? a.inst?.pause() : a.inst?.resume() } catch { /* ignore */ } }
  })
  addEventListener('pagehide', () => [...live.keys()].forEach(stop))
}

/* ---------- effect page: controls + code ---------- */
function setupPanel() {
  const form = document.getElementById('controls')
  const codeEl = document.getElementById('code')
  const defaults = new Map()

  const renderCode = () => {
    const json = JSON.stringify({ components: live }, null, 2)
    codeEl.textContent =
`import { createShader } from 'shaders/js'

const canvas = document.getElementById('my-shader')
await createShader(canvas, ${json})`
  }

  const apply = (c, value) => {
    const node = find(live, c.id)
    node.props = { ...node.props, [c.prop]: value }
    shader?.update(c.id, { [c.prop]: value })
    renderCode()
  }

  const hex7 = (v) => (/^#[0-9a-f]{3}$/i.test(v) ? '#' + [...v.slice(1)].map((ch) => ch + ch).join('') : v.slice(0, 7))
  const fmt = (v) => (Number.isInteger(+v) ? String(+v) : (+v).toFixed(2))
  const fill = (input) => {
    const min = +input.min, max = +input.max
    input.style.setProperty('--p', `${max > min ? ((+input.value - min) / (max - min)) * 100 : 0}%`)
  }

  for (const c of page.controls) {
    defaults.set(c, c.value)
    const row = document.createElement('label')
    row.className = 'row ' + c.kind
    const name = document.createElement('span')
    name.className = 'name'
    name.textContent = c.label
    if (page.controls.some((o) => o !== c && o.id !== c.id)) {
      const tag = document.createElement('em')
      tag.textContent = c.component
      name.append(tag)
    }
    row.append(name)

    let input
    if (c.kind === 'range') {
      input = Object.assign(document.createElement('input'), {
        type: 'range', min: c.min ?? 0, max: c.max ?? 1, step: c.step ?? 'any', value: c.value,
      })
      const out = document.createElement('output')
      out.textContent = fmt(c.value)
      fill(input)
      input.addEventListener('input', () => { out.textContent = fmt(input.value); fill(input); apply(c, +input.value) })
      row.append(out, input)
    } else if (c.kind === 'color') {
      input = Object.assign(document.createElement('input'), { type: 'color', value: hex7(c.value) })
      const out = document.createElement('output')
      out.textContent = input.value
      input.addEventListener('input', () => { out.textContent = input.value; apply(c, input.value) })
      row.append(out, input)
    } else if (c.kind === 'select') {
      input = document.createElement('select')
      for (const o of c.options) input.add(new Option(o.label, o.value, false, o.value === c.value))
      input.addEventListener('change', () => apply(c, input.value))
      row.append(input)
    } else if (c.kind === 'toggle') {
      input = Object.assign(document.createElement('input'), { type: 'checkbox', checked: !!c.value })
      input.addEventListener('change', () => apply(c, input.checked))
      row.append(input)
    }
    c._input = input
    form.append(row)
  }

  document.getElementById('reset').addEventListener('click', () => {
    for (const c of page.controls) {
      const v = defaults.get(c)
      if (c.kind === 'toggle') c._input.checked = !!v
      else c._input.value = c.kind === 'color' ? hex7(v) : v
      c._input.dispatchEvent(new Event(c.kind === 'select' || c.kind === 'toggle' ? 'change' : 'input'))
    }
  })

  const copy = document.getElementById('copy')
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(codeEl.textContent)
      copy.textContent = 'Copied ✓'
    } catch {
      const r = document.createRange(); r.selectNodeContents(codeEl)
      getSelection().removeAllRanges(); getSelection().addRange(r)
      copy.textContent = 'Press Ctrl/Cmd+C'
    }
    setTimeout(() => (copy.textContent = 'Copy code'), 1600)
  })

  const glassBtn = document.getElementById('glass')
  const sync = () => glassBtn.setAttribute('aria-pressed', String(lenses.length > 0))
  glassBtn.addEventListener('click', async () => {
    if (lenses.length) { disableGlass(); store.set('glass', 'off') }
    else { store.set('glass', 'on'); await enableGlass() }
    sync()
  })

  // keyboard: ← → move between effects
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || /input|select|textarea/i.test(e.target.tagName)) return
    const a = document.querySelector(e.key === 'ArrowLeft' ? '.dock a[aria-label^=Previous]' : e.key === 'ArrowRight' ? '.dock a[aria-label^=Next]' : null)
    if (a) a.click()
  })

  renderCode()
  sync()
}

/* ---------- boot ---------- */
setupReveal()
if (page.home) { setupHome(); setupPreviews() }

start().then(async () => {
  if (!page.home) setupPanel()
  // Let the first shader frames land before liquidGL takes its snapshot.
  if (!glassOff) {
    await new Promise((r) => setTimeout(r, 600))
    await enableGlass()
    document.getElementById('glass')?.setAttribute('aria-pressed', String(lenses.length > 0))
  } else {
    document.getElementById('glass')?.setAttribute('aria-pressed', 'false')
  }
})
