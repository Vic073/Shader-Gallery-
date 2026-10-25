# Shader Gallery

Multi-page site: one page per effect from the open-source `shaders` package (WebGPU).

## Run it
    cd dist && python3 -m http.server 8080     # then open http://localhost:8080
(or `npx serve dist`). Open it over http(s), not by double-clicking the HTML files: the scripts are ES modules. WebGPU needs a recent Chrome, Edge, Safari or Firefox, on localhost or HTTPS.

## Rebuild / add a page
    npm install
    node build.mjs
Every component in the package gets a page automatically (`gen.mjs`). To hand-tune one, add an entry to `pages.mjs` with the same slug (kebab-case of the component name), e.g. `flowing-gradient`: pick any component from https://shaders.com/docs/components,
list the props you want as controls, and the sliders/pickers are generated from the package's metadata.

## Credits
- Effects: `shaders` (MIT), https://github.com/shader-effects-inc/shaders
- Liquid glass refraction: `liquid-gl` / liquidGL (MIT), https://liquidgl.naughtyduk.com
- Fonts: Geist and Geist Mono via Fontsource (SIL OFL 1.1), self-hosted in `dist/fonts`

## Glass off switch
Append `?glass=off` to any URL, or use the "Glass" button on an effect page. The CSS glass stays; only the GL refraction is removed.

## Features
- Live controls per effect, generated from the package's own prop metadata
- Code tabs for React, Vue, Svelte, Solid and JS, produced by the package's codegen
- Shareable links: your tweaks are stored in the URL (`#v=...`); "Copy link" copies it. Links are validated and clamped on load
- "Use your image": run wrapper effects (blurs, distortions, stylize, transitions...) on your own picture. It stays in your browser, and never goes into the link
- Live previews on the cards in view (capped pool), `?glass=off` to disable GL glass
