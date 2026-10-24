// Generates a page definition for every component in the shaders registry.
// Hand-tuned pages in pages.mjs override the auto-generated ones (matched by slug).
import { getAllShaders } from 'shaders/registry'

/** Components that can't make a meaningful standalone page. Reason is shown in the build log. */
export const SKIP = {
  Group: 'layout container with no visual of its own',
  WebcamTexture: 'needs camera permission',
  HTMLInCanvas: 'needs HTML content to draw',
  DisplacementMap: 'needs a second layer wired in as its displacement source',
}

export const kebab = (n) => n.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2').toLowerCase()
export const humanize = (n) => n.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')

const BG = () => ({ type: 'LinearGradient', id: 'bg', props: { colorA: '#05060f', colorB: '#14163a', angle: 90 } })
// Something with edges, color and motion, so blurs / distortions / stylizers have visible work to do.
const DETAIL = () => ({ type: 'Voronoi', id: 'src', props: { colorA: '#4361ee', colorB: '#f72585', colorBorder: '#0b0b1a', scale: 6, speed: 0.4 } })
// Smooth tonal range, better for color adjustments.
const TONES = () => ({ type: 'FlowingGradient', id: 'src', props: { colorA: '#0b132b', colorB: '#1c7ed6', colorC: '#f06595', colorD: '#ffd43b', speed: 0.8 } })

function components(meta) {
  const fx = { type: meta.name, id: 'fx', props: {} }
  if (meta.requiresChild) {
    fx.children = [meta.category === 'Adjustments' ? TONES() : DETAIL()]
    // Transitions wipe content away, so give them something to reveal.
    if (meta.category === 'Transitions' || meta.category === 'Shape Effects') return [BG(), fx]
    return [fx]
  }
  if (meta.category === 'Textures') return [fx]
  return [BG(), fx] // shapes, interactive, shape effects, stylize generators
}

const SKIP_PROPS = new Set(['colorSpace', 'origin', 'center', 'position'])
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

function pickControls(meta, comps) {
  const fx = comps.find((c) => c.id === 'fx')
  const out = []
  for (const [prop, pm] of Object.entries(meta.propsMetadata || {})) {
    if (out.length >= 10) break
    if (SKIP_PROPS.has(prop)) continue
    const ui = pm.ui || {}
    const types = [].concat(ui.type)
    const value = fx.props[prop] ?? pm.default
    if (ui.condition) {
      const ok = Object.entries(ui.condition).every(([k, want]) => {
        const have = fx.props[k] ?? meta.propsMetadata[k]?.default
        return [].concat(want).includes(have)
      })
      if (!ok) continue
    }
    let kind = null
    if (types.includes('color')) kind = HEX.test(value) ? 'color' : null
    else if (types.includes('select')) kind = ui.options?.length ? 'select' : null
    else if (types.includes('range')) kind = ui.min !== undefined && ui.max !== undefined && typeof value === 'number' ? 'range' : null
    else if (types.includes('checkbox')) kind = typeof value === 'boolean' ? 'toggle' : null
    if (!kind) continue
    out.push(`fx.${prop}`)
  }
  return out
}

export function generatePages(manual) {
  const manualBySlug = new Map(manual.map((p) => [p.slug, p]))
  const skipped = []
  const pages = []
  for (const meta of getAllShaders()) {
    if (SKIP[meta.name]) { skipped.push(`${meta.name} (${SKIP[meta.name]})`); continue }
    const slug = kebab(meta.name)
    const base = {
      slug, title: humanize(meta.name), category: meta.category,
      blurb: (meta.description || '').replace(/\s+/g, ' ').trim() || `The ${humanize(meta.name)} effect.`,
      component: meta.name,
    }
    const hand = manualBySlug.get(slug)
    if (hand) { pages.push({ ...base, ...hand, category: meta.category, auto: false }); continue }
    const comps = components(meta)
    pages.push({ ...base, components: comps, controls: pickControls(meta, comps), auto: true })
  }
  const order = ['Textures', 'Shape Effects', 'Interactive', 'Distortions', 'Stylize', 'Blurs', 'Adjustments', 'Transitions', 'Shapes', 'Utilities']
  pages.sort((a, b) => (order.indexOf(a.category) - order.indexOf(b.category)) || a.title.localeCompare(b.title))
  return { pages, skipped }
}
