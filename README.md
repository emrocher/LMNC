# Lucia's Minecraft

A voxel game (accounts, maps, survival/creative, multiplayer via polling) split into
two independent parts so you can develop/deploy them separately:

```
lucias-minecraft/
  backend/     Node.js + Express API (accounts, maps, world data). Deploy this
               to any Node host (Render, Railway, Fly.io, a VPS, etc).
  frontend/    The game itself (single index.html + config.js). Deploy this
               as a static site (GitHub Pages, Netlify, Vercel, Cloudflare
               Pages, or literally any static file host).
```

The frontend talks to the backend over plain HTTP (`fetch`), so once both
are deployed you just need to point `frontend/config.js` at your backend's
public URL — see `frontend/README.md`.

## Quick start (local dev)

Terminal 1 — backend:
```bash
cd backend
npm install
npm start
# -> http://localhost:3001
```

Terminal 2 — frontend (any static file server works):
```bash
cd frontend
python3 -m http.server 8080
# -> http://localhost:8080
```

Open http://localhost:8080 in your browser. `frontend/config.js` already
points at `http://localhost:3001` by default, so this works out of the box.

## Suggested workflow

1. Push `backend/` to its own GitHub repo, deploy it (see `backend/README.md`
   for a few free-hosting options). You'll get a public URL like
   `https://your-app.onrender.com`.
2. Edit `frontend/config.js` and set `window.API_BASE_URL` to that URL.
3. Push `frontend/` to its own GitHub repo and deploy it as a static site
   (or use GitHub Pages directly on that repo) — see `frontend/README.md`.
4. Share the frontend's URL with friends. Everyone who opens it plays on
   the same shared backend (same accounts, same maps).

## Notes / limitations

- Multiplayer is now **real-time over WebSocket** (Socket.io): player
  positions, block placing/breaking, chests, record players, and vinyl
  records (including which track is playing) are all pushed instantly to
  everyone else on the same map — no polling delay, no reload needed. See
  "Real-time architecture" below if you want to add more synced actions
  (the event channel is designed to be easy to extend).
- Passwords are stored as plain text in the backend's JSON store — this is
  a hobby project store, not a production auth system. Don't reuse a real
  password here.
- The backend stores everything in a single `backend/data/store.json` file
  (no external database required). That's plenty for a project like this,
  but it means only one backend instance should run at a time (no
  horizontal scaling) — fine for a small friend-group server.

## Real-time architecture (for building player-to-player actions)

The backend keeps one Socket.io "room" per map (`mapId`). Three event types
flow through it:

- `join_map` / `player_joined` / `map_roster` / `player_left` — presence.
- `player_move` / `player_update` — position + facing, ~8 times/second.
- `world_event` (generic, bidirectional) — anything else. The server just
  relays whatever you send to everyone else in the room (adding
  `from: socket.id`) — it doesn't need to understand the payload. The
  frontend currently sends these types:
  - `block_change` — `{x, y, z, val}`
  - `turntable_place` / `turntable_remove` — `{id, x, y, z, rotY}` / `{id}`
  - `chest_place` / `chest_remove` — `{id, x, y, z, rotY}` / `{id}`
  - `chest_contents` — `{id, contents}` (sent after every Put/Take)
  - `bed_place` / `bed_remove` — `{id, x, y, z, rotY}` / `{id}`
  - `vinyl_place` / `vinyl_remove` — `{turntableId, trackId}` / `{turntableId}`
    (each client independently loads and plays the same fixed track URL —
    audio itself isn't streamed, only "which track" is synced, so playback
    start times may drift slightly between players)

  To add a new player-to-player action, emit a new `type` from the
  frontend (`broadcastWorldEvent('hit_player', {targetId, ...})`, etc.)
  and add a matching branch in `handleRemoteWorldEvent()` on the receiving
  end — no backend changes needed for most new interactions since it just
  relays by room.

## Admin mode

Off by default. Set `ADMIN_USERNAMES` and `ADMIN_SECRET` on the backend
(see `backend/README.md`) to unlock an Admin Panel (⚙ button on the menu
screen) that lists every account and map, shows who's online, and lets you
jump into any online player's session as a ghost (fully invisible),
through their exact POV, or as a normal visible teleport. Keep
`ADMIN_SECRET` private — anyone with it (and an allowed username) gets
these powers.

