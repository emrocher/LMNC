# Lucia's Minecraft — frontend

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

## Configuring the backend URL

Edit `config.js`:

```js
window.API_BASE_URL = 'https://your-backend-host.example.com';
```

This is the **only file you need to touch** when deploying — the rest of
the game talks to whatever URL is set here. No rebuild step, since there's
no bundler involved.

## Deploying (free options)

Since this is a static site (no server-side code), pretty much any static
host works:

- **GitHub Pages**: push this folder to a repo, enable Pages on it
  (Settings → Pages → deploy from branch). You'll get a URL like
  `https://yourname.github.io/lucias-minecraft-frontend/`.
- **Netlify / Vercel / Cloudflare Pages**: connect the repo, no build
  command needed (or "none" / static preset), publish directory = `.`.

Remember: deploy the **backend** first, grab its public URL, put it in
`config.js`, *then* deploy/redeploy the frontend so the shipped `config.js`
points at the right place.

## Browser requirements

WebGL2 + Pointer Lock API (any modern desktop browser). Mobile isn't
supported by the current controls (keyboard + mouse only).
