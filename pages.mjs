// Page definitions. Each page = one shader (or small stack) from the `shaders` package.
// `controls` lists "componentId.prop" entries; the UI for each (slider / color / select)
// is generated at build time from the package's own prop metadata.

const dark = (id = 'bg', a = '#05060f', b = '#0b0f24') => ({
  type: 'LinearGradient', id, props: { colorA: a, colorB: b, angle: 90 },
})

export const pages = [
  {
    slug: 'aurora', title: 'Aurora', category: 'Textures',
    blurb: 'Shimmering northern-light curtains with adjustable rays, waviness and palette.',
    components: [dark(), { type: 'Aurora', id: 'fx', props: { height: 140 } }],
    controls: ['fx.colorA', 'fx.colorB', 'fx.colorC', 'fx.intensity', 'fx.curtainCount', 'fx.waviness', 'fx.rayDensity', 'fx.speed'],
  },
  {
    slug: 'plasma', title: 'Plasma', category: 'Textures',
    blurb: 'Classic warped plasma, retuned for the GPU. Drag density and warp to taste.',
    components: [{ type: 'Plasma', id: 'fx', props: { colorA: '#ff3d81', colorB: '#1b0b52' } }],
    controls: ['fx.colorA', 'fx.colorB', 'fx.density', 'fx.warp', 'fx.intensity', 'fx.contrast', 'fx.speed'],
  },
  {
    slug: 'flowing-gradient', title: 'Flowing Gradient', category: 'Textures',
    blurb: 'Four colors blended in OKLCH that drift and fold into each other.',
    components: [{ type: 'FlowingGradient', id: 'fx', props: {} }],
    controls: ['fx.colorA', 'fx.colorB', 'fx.colorC', 'fx.colorD', 'fx.distortion', 'fx.speed', 'fx.seed'],
  },
  {
    slug: 'liquid-metal', title: 'Liquid Metal', category: 'Shape Effects',
    blurb: 'A rippling chrome surface with environment reflections and dispersion.',
    components: [dark('bg', '#08080c', '#14141c'), { type: 'LiquidMetal', id: 'fx', props: { scale: 1.6 } }],
    controls: ['fx.lightColor', 'fx.darkColor', 'fx.scale', 'fx.turbulence', 'fx.ripple', 'fx.warp', 'fx.dispersion', 'fx.speed'],
  },
  {
    slug: 'nebula', title: 'Nebula', category: 'Shape Effects',
    blurb: 'Volumetric gas, dust and twinkling stars wrapped around a glowing core.',
    components: [dark('bg', '#02030a', '#05061a'), { type: 'Nebula', id: 'fx', props: { scale: 1.8 } }],
    controls: ['fx.coreColor', 'fx.gasColor', 'fx.veilColor', 'fx.scale', 'fx.density', 'fx.dust', 'fx.stars', 'fx.speed'],
  },
  {
    slug: 'kaleidoscope', title: 'Kaleidoscope', category: 'Distortions',
    blurb: 'A distortion that wraps any layer beneath it. Here it folds a flowing gradient.',
    components: [{
      type: 'Kaleidoscope', id: 'fx', props: { segments: 8 },
      children: [{ type: 'FlowingGradient', id: 'src', props: { colorA: '#0b132b', colorB: '#1c7ed6', colorC: '#f06595', colorD: '#ffd43b', speed: 1.4 } }],
    }],
    controls: ['fx.segments', 'fx.angle', 'fx.edges', 'src.distortion', 'src.speed'],
  },
  {
    slug: 'glitch', title: 'Glitch', category: 'Stylize',
    blurb: 'RGB splits, block tearing and scanlines applied to a live plasma feed.',
    components: [{
      type: 'Glitch', id: 'fx', props: { intensity: 0.6 },
      children: [{ type: 'Plasma', id: 'src', props: { colorA: '#00e0ff', colorB: '#1a0033', speed: 1.2 } }],
    }],
    controls: ['fx.intensity', 'fx.rgbShift', 'fx.blockDensity', 'fx.colorBarIntensity', 'fx.mirrorAmount', 'fx.scanlineIntensity', 'fx.speed'],
  },
  {
    slug: 'halftone', title: 'Halftone', category: 'Stylize',
    blurb: 'Print-style dots, in simple or CMYK mode, over a drifting gradient.',
    components: [{
      type: 'Halftone', id: 'fx', props: { style: 'cmyk', frequency: 70 },
      children: [{ type: 'FlowingGradient', id: 'src', props: { colorA: '#ff2d55', colorB: '#ffd60a', colorC: '#30d5c8', colorD: '#5e5ce6', speed: 0.8 } }],
    }],
    controls: ['fx.style', 'fx.frequency', 'fx.angle', 'fx.misprint', 'fx.misprintAngle', 'fx.paperColor'],
  },
  {
    slug: 'dither', title: 'Dither', category: 'Stylize',
    blurb: 'Seven dithering algorithms, from Bayer matrices to Floyd–Steinberg.',
    components: [{
      type: 'Dither', id: 'fx', props: { pattern: 'bayer8', pixelSize: 4, colorA: '#0a0a0a', colorB: '#7CFFB2' },
      children: [{ type: 'Aurora', id: 'src', props: { colorA: '#ffffff', colorB: '#bbbbbb', colorC: '#888888', height: 140 } }],
    }],
    controls: ['fx.pattern', 'fx.pixelSize', 'fx.threshold', 'fx.spread', 'fx.colorA', 'fx.colorB'],
  },
  {
    slug: 'reaction-diffusion', title: 'Reaction Diffusion', category: 'Interactive',
    blurb: 'A living Turing-pattern simulation. Move the cursor over it to paint.',
    components: [dark('bg', '#04141f', '#062a3d'), { type: 'ReactionDiffusion', id: 'fx', props: { preset: 'coral' } }],
    controls: ['fx.preset', 'fx.speed', 'fx.brushSize', 'fx.brushStrength', 'fx.colorC', 'fx.colorB', 'fx.contrast', 'fx.relief'],
    hint: 'Move your cursor over the canvas to paint.',
  },
  {
    slug: 'cursor-trail', title: 'Cursor Trail', category: 'Interactive',
    blurb: 'A gradient ribbon that follows your pointer, layered over a dark backdrop.',
    components: [dark('bg', '#07070d', '#120a24'), { type: 'CursorTrail', id: 'fx', props: { radius: 0.6, length: 0.8 } }],
    controls: ['fx.colorA', 'fx.colorB', 'fx.radius', 'fx.length', 'fx.shrink', 'fx.softness'],
    hint: 'Move your cursor over the canvas.',
  },
  {
    slug: 'voronoi', title: 'Voronoi', category: 'Textures',
    blurb: 'Animated cellular patterns with soft or sharp borders.',
    components: [{ type: 'Voronoi', id: 'fx', props: { colorA: '#4361ee', colorB: '#f72585', colorBorder: '#0b0b1a', scale: 7 } }],
    controls: ['fx.colorA', 'fx.colorB', 'fx.colorBorder', 'fx.scale', 'fx.edgeIntensity', 'fx.edgeSoftness', 'fx.speed'],
  },
  {
    slug: 'godrays', title: 'Godrays', category: 'Textures',
    blurb: 'Volumetric light shafts streaming in from a point you control.',
    components: [dark('bg', '#050814', '#0d1330'), { type: 'Godrays', id: 'fx', props: { center: { x: 0.2, y: 0 } } }],
    controls: ['fx.rayColor', 'fx.density', 'fx.intensity', 'fx.spotty', 'fx.speed'],
  },
]
