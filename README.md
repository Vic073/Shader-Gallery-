# Shader Gallery

Multi-page site: one page per effect from the open-source `shaders` package (WebGPU).

## Run it
    cd dist && python3 -m http.server 8080     # then open http://localhost:8080
(or `npx serve dist`). WebGPU needs a recent Chrome, Edge, Safari or Firefox, on localhost or HTTPS.

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
