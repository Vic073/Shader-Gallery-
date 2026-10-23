# Shader Gallery

Multi-page site: one page per effect from the open-source `shaders` package (WebGPU).

## Run it
    cd dist && python3 -m http.server 8080     # then open http://localhost:8080
(or `npx serve dist`). WebGPU needs a recent Chrome, Edge, Safari or Firefox, on localhost or HTTPS.

## Rebuild / add a page
    npm install
    node build.mjs
Edit `pages.mjs` to add a shader: pick any component from https://shaders.com/docs/components,
list the props you want as controls, and the sliders/pickers are generated from the package's metadata.
