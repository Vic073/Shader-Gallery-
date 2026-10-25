"""Render each effect page headlessly with software WebGPU and read the pixels straight
off the canvas texture (screenshots can't see WebGPU canvases in headless software mode).
Usage: python3 tools/grab.py OUTDIR slug [slug ...]   (expects the site served on :8099)
"""
import asyncio, base64, io, json, sys, time
from playwright.async_api import async_playwright
from PIL import Image, ImageStat

ARGS = ['--no-sandbox', '--enable-unsafe-webgpu', '--enable-features=WebGPU',
        '--use-webgpu-adapter=swiftshader', '--enable-unsafe-swiftshader']
BASE = 'http://localhost:8099'

HOOK = r"""
(() => {
  const ctxs = new Set();
  window.__keep = [];                       // keep adapters/devices alive (GC can drop the Dawn instance)
  const ra0 = GPU.prototype.requestAdapter;
  GPU.prototype.requestAdapter = async function (...a) { const r = await ra0.apply(this, a); window.__keep.push(this, r); return r; };
  const rd0 = GPUAdapter.prototype.requestDevice;
  GPUAdapter.prototype.requestDevice = async function (...a) { const r = await rd0.apply(this, a); window.__keep.push(this, r, r.queue); return r; };
  const cfg0 = GPUCanvasContext.prototype.configure;
  GPUCanvasContext.prototype.configure = function (c) {
    c = { ...c, usage: (c.usage ?? 0x10) | 0x01 };   // add COPY_SRC
    this.__dev = c.device; ctxs.add(this);
    return cfg0.call(this, c);
  };
  const sub0 = GPUQueue.prototype.submit;
  window.__grab = false; window.__frame = null; window.__frames = 0;
  GPUQueue.prototype.submit = function (cbs) {
    const r = sub0.call(this, cbs);
    window.__frames++;
    if (window.__grab) {
      window.__grab = false;
      // Same task, after the library has finished encoding this frame: the canvas still holds the
      // current texture, so drawImage() snapshots it (a later task would see it cleared).
      queueMicrotask(() => {
        try {
          for (const ctx of ctxs) {
            const c = ctx.canvas, t = document.createElement('canvas');
            t.width = c.width; t.height = c.height;
            const x = t.getContext('2d'); x.drawImage(c, 0, 0);
            window.__frame = { w: t.width, h: t.height, fmt: 'rgba', b64: t.toDataURL('image/png').split(',')[1], png: true };
            break;
          }
        } catch (e) { window.__err = String(e); window.__frame = null; window.__grab = true; }
      });
    }
    return r;
  };
})();
"""

async def grab(b, slug, outdir, size=(800, 600), settle=2.5, move=False):
    pg = await b.new_page(viewport={'width': size[0], 'height': size[1]})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)[:140]))
    await pg.add_init_script(HOOK)
    await pg.goto(f'{BASE}/{slug}.html?glass=off', wait_until='load')
    await pg.add_style_tag(content='.nav,.title-block,.dock,.panel{display:none!important}.stage-wrap{height:100dvh!important;min-height:0!important}')
    if move:
        for i in range(24):
            await pg.mouse.move(size[0] * (0.15 + 0.7 * i / 24), size[1] * (0.5 + 0.3 * __import__('math').sin(i / 3)))
            await pg.wait_for_timeout(40)
    await pg.wait_for_timeout(int(settle * 1000))
    await pg.evaluate("window.__grab = true")
    frame = None
    for _ in range(80):
        frame = await pg.evaluate("window.__frame")
        if frame: break
        await pg.wait_for_timeout(100)
    fb = await pg.evaluate("!document.getElementById('fallback').hidden")
    res = {'slug': slug, 'fallback': fb, 'errors': errs, 'ok': False}
    if frame:
        img = Image.open(io.BytesIO(base64.b64decode(frame['b64']))).convert('RGBA')
        bg = Image.new('RGBA', img.size, (0, 0, 0, 255)); bg.alpha_composite(img); img = bg.convert('RGB')
        st = ImageStat.Stat(img)
        res.update(ok=True, mean=[round(v) for v in st.mean], std=round(sum(st.stddev) / 3, 1), fmt=frame['fmt'], size=[frame['w'], frame['h']])
        img.save(f'{outdir}/{slug}.png')
    else:
        res['grab_error'] = await pg.evaluate("window.__err || 'no frame'")
    await pg.close()
    return res

async def main():
    outdir, slugs = sys.argv[1], sys.argv[2:]
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=ARGS)
        for s in slugs:
            t = time.time()
            r = await grab(b, s, outdir, move=s in ('cursor-trail',))
            r['sec'] = round(time.time() - t, 1)
            print(json.dumps(r))
        await b.close()

if __name__ == '__main__':
    asyncio.run(main())
