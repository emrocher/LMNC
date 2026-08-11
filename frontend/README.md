# LMinecraft — frontend

The game itself: a single self-contained `index.html` (Three.js, no build
step) plus `config.js` which tells it where your backend lives.

## Run locally

Any static file server works, e.g.:

```bash
python3 -m http.server 8080
# or: npx serve .
```

Then open http://localhost:8080. Make sure the backend is running too (see
`../backend/README.md`) and that `config.js` points at it.


## Browser requirements

WebGL2 + Pointer Lock API (any modern desktop browser). Mobile isn't
supported by the current controls (keyboard + mouse only).
