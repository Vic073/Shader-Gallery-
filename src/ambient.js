// A tiny WebGL stand-in for browsers with no WebGPU (the shaders package is WebGPU-only).
// It is NOT the effect: it's a soft animated gradient in the page's palette, so the page
// still feels alive and the real effect isn't mistaken for a blank screen.

const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'
const FS = `precision mediump float;
uniform vec2 r;uniform float t;uniform vec3 a,b,c,d;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);}
void main(){
  vec2 uv=gl_FragCoord.xy/r;vec2 q=uv*vec2(r.x/r.y,1.)*1.6;float tt=t*.07;
  vec2 w=vec2(n(q+tt),n(q+vec2(5.2,1.3)-tt));
  float f=n(q+2.*w+tt*1.3),g=n(q*1.7-w*1.5-tt);
  vec3 col=mix(a,b,smoothstep(.15,.85,f));
  col=mix(col,c,smoothstep(.3,.9,g)*.75);
  col=mix(col,d,smoothstep(.55,1.,f*g*1.9)*.6);
  col*=(1.-.3*length(uv-.5))*.8;
  gl_FragColor=vec4(col,1.);
}`

let probe
function toRGB(css) {
  probe ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  probe.canvas.width = probe.canvas.height = 1
  probe.fillStyle = '#000'
  probe.fillStyle = css           // invalid colors are ignored, leaving black
  probe.fillRect(0, 0, 1, 1)
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data
  return [r / 255, g / 255, b / 255]
}

export function startAmbient(host, palette, { still = false } = {}) {
  const canvas = document.createElement('canvas')
  canvas.className = 'ambient'
  canvas.setAttribute('aria-hidden', 'true')
  host.prepend(canvas)

  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' })
  if (!gl) { canvas.remove(); return null }

  const compile = (type, src) => {
    const s = gl.createShader(type)
    gl.shaderSource(s, src); gl.compileShader(s)
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null
  }
  const vs = compile(gl.VERTEX_SHADER, VS), fs = compile(gl.FRAGMENT_SHADER, FS)
  const prog = gl.createProgram()
  if (!vs || !fs) { canvas.remove(); return null }
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.remove(); return null }
  gl.useProgram(prog)

  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW) // one big triangle
  const loc = gl.getAttribLocation(prog, 'p')
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

  const cols = (palette && palette.length ? palette : ['#1c7ed6', '#f06595']).map(toRGB)
  const u = (n) => gl.getUniformLocation(prog, n)
  ;['a', 'b', 'c', 'd'].forEach((k, i) => gl.uniform3fv(u(k), cols[i % cols.length]))
  const uR = u('r'), uT = u('t')

  const size = () => {
    // Half resolution is plenty for a soft gradient and keeps low-end phones cool.
    const scale = Math.min(devicePixelRatio || 1, 2) * 0.5
    const w = Math.max(2, Math.round(canvas.clientWidth * scale)), h = Math.max(2, Math.round(canvas.clientHeight * scale))
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
    gl.viewport(0, 0, w, h)
    gl.uniform2f(uR, w, h)
  }
  const ro = new ResizeObserver(() => { size(); if (still) draw(8) })
  ro.observe(canvas)

  const draw = (t) => { gl.uniform1f(uT, t); gl.drawArrays(gl.TRIANGLES, 0, 3) }
  let raf = 0, alive = true
  const t0 = performance.now()
  const loop = () => { if (!alive) return; draw((performance.now() - t0) / 1000 + 8); raf = requestAnimationFrame(loop) }
  size()
  still ? draw(8) : loop()

  return {
    destroy() {
      alive = false; cancelAnimationFrame(raf); ro.disconnect()
      gl.getExtension('WEBGL_lose_context')?.loseContext()
      canvas.remove()
    },
  }
}
