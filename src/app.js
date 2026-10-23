import { createShader } from 'shaders/js'

const page = window.__PAGE__
const canvas = document.getElementById('stage')
const fallback = document.getElementById('fallback')

function showFallback(reason) {
  if (!fallback || !fallback.hidden) return
  const msgs = {
    unsupported: 'This browser doesn’t support WebGPU yet.',
    'no-adapter': 'No compatible GPU was found for WebGPU.',
  }
  fallback.hidden = false
  fallback.innerHTML = `<strong>Can’t render this shader</strong><span>${msgs[reason] || 'WebGPU failed to start (' + reason + ').'} Try a recent version of Chrome, Edge, Safari or Firefox.</span>`
}

// Let the shader library size itself from CSS instead of pinning pixels.
canvas.style.width = '100%'
canvas.style.height = '100%'

const clone = (o) => JSON.parse(JSON.stringify(o))
const live = clone(page.components)          // current preset (tracks edits for the code box)
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

start().then(() => { if (!page.home) setupPanel() })

function setupPanel() {
  const form = document.getElementById('controls')
  const codeEl = document.getElementById('code')
  const defaults = new Map()
  const group = {}

  const renderCode = () => {
    const json = JSON.stringify({ components: live }, null, 2)
    codeEl.textContent =
`import { createShader } from 'shaders/js'

const canvas = document.getElementById('my-shader')
await createShader(canvas, ${json})`
  }

  const apply = (c, value) => {
    find(live, c.id).props = { ...find(live, c.id).props, [c.prop]: value }
    shader?.update(c.id, { [c.prop]: value })
    renderCode()
  }

  const hex7 = (v) => (/^#[0-9a-f]{3}$/i.test(v) ? '#' + [...v.slice(1)].map((ch) => ch + ch).join('') : v.slice(0, 7))

  for (const c of page.controls) {
    defaults.set(c, c.value)
    const key = `${c.id}.${c.prop}`
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
      const fmt = (v) => (Number.isInteger(+v) ? String(+v) : (+v).toFixed(2))
      out.textContent = fmt(c.value)
      input.addEventListener('input', () => { out.textContent = fmt(input.value); apply(c, +input.value) })
      row.append(input, out)
    } else if (c.kind === 'color') {
      input = Object.assign(document.createElement('input'), { type: 'color', value: hex7(c.value) })
      const out = document.createElement('output')
      out.textContent = input.value
      input.addEventListener('input', () => { out.textContent = input.value; apply(c, input.value) })
      row.append(input, out)
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
      copy.textContent = 'Copied'
    } catch {
      const r = document.createRange(); r.selectNodeContents(codeEl)
      getSelection().removeAllRanges(); getSelection().addRange(r)
      copy.textContent = 'Press Ctrl/Cmd+C'
    }
    setTimeout(() => (copy.textContent = 'Copy code'), 1600)
  })

  renderCode()
}
