# Lucia's Minecraft — backend

Express API + Socket.io used as the persistence and real-time layer for
the game: accounts, maps list, per-map world diffs, chests, turntables are
served over plain HTTP; player positions and world edits (block
place/break) are pushed live over WebSocket.

No database server required — data is kept in memory and written through to
a single JSON file (`data/store.json`) on disk, debounced every ~250ms.
This keeps deployment dead simple (no native modules, no DB to provision).

## Run locally

```bash
npm install
npm start        # http://localhost:3001
```

Set `PORT` and/or `DATA_DIR` env vars to override defaults:

```bash
PORT=4000 DATA_DIR=/var/data/lucia npm start
```

Run the real-time smoke test (spins up two fake clients and checks
join/roster/move/world-event/leave all work):

```bash
npm run test:realtime
npm run test:admin       # tests admin auth + ghost/pov/visible spectate
```

## Admin mode

Set two environment variables to enable it:

```bash
ADMIN_USERNAMES=yourusername ADMIN_SECRET=some-long-random-string npm start
```

- `ADMIN_USERNAMES` — comma-separated list of game usernames (from the
  frontend's login, case-insensitive) allowed to use admin features.
- `ADMIN_SECRET` — a shared passphrase the frontend's Admin Panel must
  supply. Anyone with both the right username *and* this secret can act as
  admin, so keep it private (don't commit it, don't put it in a public
  frontend build).

With these set, the admin can, from the frontend's Admin Panel (small ⚙
button on the menu screen):
- See every account that's ever registered, and who's online right now.
- See every map and how many players are currently on each.
- Jump into any online player's game in one of three ways:
  - **Ghost teleport** — join their world and look around, completely
    invisible (no avatar, no broadcast of your movement).
  - **POV** — same, but your camera locks onto exactly what they're
    looking at (their position + where they're aiming).
  - **Visible teleport** — join right next to them as a normal, visible
    player.

If `ADMIN_SECRET` is left unset, all admin socket/REST endpoints reject
every request — the feature is off by default.

## REST API (persistence)

All game data is stored as opaque JSON blobs under string keys, mirroring a
simple key-value store:

| Method | Path                          | Body / Query                        |
|--------|-------------------------------|--------------------------------------|
| GET    | `/api/health`                 | —                                     |
| GET    | `/api/storage/:key`           | `?shared=true`                        |
| POST   | `/api/storage`                | `{ key, value, shared }`              |
| DELETE | `/api/storage/:key`           | `?shared=true`                        |
| GET    | `/api/storage-list`           | `?prefix=map:123:player:&shared=true` |
| GET    | `/api/rooms/:mapId/count`     | —  (how many players are live on this map right now) |
| GET    | `/api/admin/accounts`         | `?secret=...` (all accounts + online status) |
| GET    | `/api/admin/maps`             | `?secret=...` (all maps + online count) |
| GET    | `/api/admin/online`           | `?secret=...` (everyone currently connected, with position) |

`GET /api/storage/:key` returns `404` if the key doesn't exist. `:key` must
be URL-encoded (e.g. `account:steve` → `account%3Asteve`).

## WebSocket API (real-time, Socket.io)

| Event (client → server) | Payload |
|--------------------------|---------|
| `join_map`               | `{ mapId, username, displayName, appearance, x, y, z, yaw }` |
| `player_move`             | `{ x, y, z, yaw }` |
| `world_event`             | `{ type, ...anything }` — relayed as-is to everyone else in the room |
| `leave_map`               | — (also happens automatically on disconnect) |
| `admin_identify`           | `{username, secret}` → ack `{ok}` |
| `admin_spectate`           | `{targetUsername, mode: 'ghost'\|'pov'\|'visible', adminUsername, adminDisplayName, adminAppearance}` → ack `{ok, mapId, target}` |
| `admin_stop_spectate`      | — |

| Event (server → client) | Payload |
|---------------------------|---------|
| `map_roster`               | array of players already in the room, sent once on join |
| `player_joined`            | `{ id, username, displayName, appearance, x, y, z, yaw }` |
| `player_update`            | same shape, sent on every `player_move` from someone else |
| `player_left`               | `{ id }` |
| `world_event`               | whatever was sent, plus `from: <socket id>` |

Everything is scoped to a Socket.io "room" named after the map's id, so
players on different maps never see each other's events.

## Deploying (free options)

Any host that can run a long-lived Node process works (WebSocket needs a
persistent connection, so serverless/edge functions with short timeouts
won't work well here — pick a regular Node host). A few with generous free
tiers as of writing:

- **Render** (render.com): new "Web Service" → connect your GitHub repo →
  Build command `npm install`, Start command `npm start`. Add a persistent
  disk mounted at `/opt/render/project/src/data` if you want data to survive
  redeploys (otherwise it's reset on each deploy, since the filesystem is
  ephemeral on the free tier).
- **Railway** (railway.app): similar flow, detects Node automatically.
- **Fly.io**: `fly launch` in this folder, attach a small volume for `data/`
  if you want persistence across deploys.
- A cheap VPS + `pm2`/`systemd` also works great and gives you a real
  persistent disk by default.

Whichever you pick, note the public URL it gives you (e.g.
`https://lucias-minecraft-backend.onrender.com`) — you'll paste that into
`frontend/config.js`.

## Security note

This is a hobby-project auth system: usernames/passwords are stored as
plain JSON, there's no rate limiting, no HTTPS enforcement (your host
usually terminates TLS for you), and CORS/WebSocket origins are wide open
(`*`) so any frontend can call it. Fine for a small friend-group game;
don't put real credentials in it.
