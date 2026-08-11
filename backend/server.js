const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const store = require('./store');

const PORT = process.env.PORT || 3001;




const ADMIN_USERNAMES = (process.env.ADMIN_USERNAMES || '')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';

const app = express();
app.use(cors()); 
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: "lucias-minecraft-backend" });
});


app.get('/api/storage/:key', (req, res) => {
  const key = decodeURIComponent(req.params.key);
  const shared = req.query.shared === 'true';
  const value = store.get(key, shared);
  if (value === null) return res.status(404).json({ error: 'not_found' });
  res.json({ key, value, shared });
});


app.post('/api/storage', (req, res) => {
  const { key, value, shared } = req.body || {};
  if (typeof key !== 'string' || !key.length) {
    return res.status(400).json({ error: 'key_required' });
  }
  if (key.length > 200) {
    return res.status(400).json({ error: 'key_too_long' });
  }
  store.set(key, value, !!shared);
  if (shared) {
    if (key.startsWith('account:')) notifyAdmins('accounts');
    else if (key === 'maps:list') notifyAdmins('maps');
  }
  res.json({ key, value, shared: !!shared });
});


app.delete('/api/storage/:key', (req, res) => {
  const key = decodeURIComponent(req.params.key);
  const shared = req.query.shared === 'true';
  const deleted = store.del(key, shared);
  res.json({ key, deleted, shared });
});


app.get('/api/storage-list', (req, res) => {
  const prefix = req.query.prefix || '';
  const shared = req.query.shared === 'true';
  const keys = store.list(prefix, shared);
  res.json({ keys, prefix, shared });
});


app.get('/api/rooms/:mapId/count', (req, res) => {
  const mapId = req.params.mapId;
  const count = Object.keys(mapPlayers.get(mapId) || {}).length;
  res.json({ mapId, count });
});


function requireAdminSecret(req, res) {
  const secret = req.query.secret || '';
  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
    res.status(403).json({ error: 'forbidden' });
    return false;
  }
  return true;
}






function parseStoredJSON(raw, fallback) {
  if (raw == null) return fallback;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

app.get('/api/admin/accounts', (req, res) => {
  if (!requireAdminSecret(req, res)) return;
  const keys = store.list('account:', true);
  const onlineUsernames = new Set(Array.from(allPlayers.values()).map((p) => (p.username || '').toLowerCase()));
  const accounts = keys.map((k) => {
    const acc = parseStoredJSON(store.get(k, true), {});
    return {
      username: acc.username,
      displayName: acc.displayName,
      appearance: acc.appearance,
      online: onlineUsernames.has((acc.username || '').toLowerCase()),
    };
  });
  res.json({ accounts });
});





app.delete('/api/admin/accounts/:username', (req, res) => {
  if (!requireAdminSecret(req, res)) return;
  const username = req.params.username.toLowerCase();
  const key = 'account:' + username;
  if (store.get(key, true) === null) return res.status(404).json({ error: 'not_found' });
  store.del(key, true);
  for (const [socketId, p] of allPlayers.entries()) {
    if ((p.username || '').toLowerCase() === username) {
      const sock = io.sockets.sockets.get(socketId);
      if (sock) sock.disconnect(true);
    }
  }
  notifyAdmins('accounts');
  res.json({ ok: true });
});

app.get('/api/admin/maps', (req, res) => {
  if (!requireAdminSecret(req, res)) return;
  const list = parseStoredJSON(store.get('maps:list', true), []);
  const maps = list.map((m) => ({ ...m, online: Object.keys(mapPlayers.get(m.id) || {}).length }));
  res.json({ maps });
});






app.delete('/api/admin/maps/:mapId', (req, res) => {
  if (!requireAdminSecret(req, res)) return;
  const mapId = req.params.mapId;
  const list = parseStoredJSON(store.get('maps:list', true), []);
  const idx = list.findIndex((m) => m.id === mapId);
  if (idx === -1) return res.status(404).json({ error: 'not_found' });
  list.splice(idx, 1);
  store.set('maps:list', JSON.stringify(list), true);

  const keys = store.list('map:' + mapId + ':', true);
  keys.forEach((k) => store.del(k, true));

  const players = mapPlayers.get(mapId);
  if (players) {
    Object.keys(players).forEach((socketId) => {
      const sock = io.sockets.sockets.get(socketId);
      if (sock) {
        sock.emit('map_deleted', { mapId });
        sock.leave(mapId);
        sock.data.mapId = null;
      }
      allPlayers.delete(socketId);
    });
    mapPlayers.delete(mapId);
  }
  mapClocks.delete(mapId);

  notifyAdmins('maps');
  res.json({ ok: true, deletedKeys: keys.length });
});

app.get('/api/admin/online', (req, res) => {
  if (!requireAdminSecret(req, res)) return;
  res.json({ players: Array.from(allPlayers.values()) });
});


const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });





const ADMIN_ROOM = 'admin-room';
function notifyAdmins(reason) {
  io.to(ADMIN_ROOM).emit('admin:changed', { reason });
}


const mapPlayers = new Map();

const allPlayers = new Map();

function roomPlayers(mapId) {
  return mapPlayers.get(mapId) || {};
}


const DAY_LENGTH = 720; 
const mapClocks = new Map(); 

function getMapClock(mapId) {
  if (!mapClocks.has(mapId)) {
    const saved = store.get('map:' + mapId + ':clock', true);
    mapClocks.set(mapId, typeof saved === 'number' ? saved : Math.random() * DAY_LENGTH);
  }
  return mapClocks.get(mapId);
}

function persistMapClock(mapId) {
  if (mapClocks.has(mapId)) store.set('map:' + mapId + ':clock', mapClocks.get(mapId), true);
}









const DAY_TIME_SCALE = 0.6;
const NIGHT_TIME_SCALE = 0.6;
function sunHeightAt(elapsedVal) {
  const t = (elapsedVal % DAY_LENGTH) / DAY_LENGTH;
  const angle = t * Math.PI * 2 - Math.PI / 2;
  return Math.sin(angle);
}

let clockTick = 0;
setInterval(() => {
  clockTick++;
  mapPlayers.forEach((players, mapId) => {
    const current = getMapClock(mapId);
    const scale = sunHeightAt(current) > 0 ? DAY_TIME_SCALE : NIGHT_TIME_SCALE;
    mapClocks.set(mapId, current + scale);
  });
  
  
  if (clockTick % 5 === 0) {
    mapPlayers.forEach((players, mapId) => {
      io.to(mapId).emit('time_sync', { elapsed: mapClocks.get(mapId) });
    });
  }
}, 1000);




setInterval(() => {
  mapPlayers.forEach((players, mapId) => persistMapClock(mapId));
}, 20000);

io.on('connection', (socket) => {
  socket.data.mapId = null;
  socket.data.isAdmin = false;

  socket.on('admin_identify', (payload = {}, cb) => {
    const { username, secret } = payload;
    const ok = !!ADMIN_SECRET && secret === ADMIN_SECRET
      && ADMIN_USERNAMES.includes((username || '').toLowerCase());
    socket.data.isAdmin = ok;
    if (ok) socket.join(ADMIN_ROOM);
    if (cb) cb({ ok });
  });

  socket.on('join_map', (payload = {}) => {
    const { mapId, username, displayName, appearance, x, y, z, yaw, pitch, heldItem, zootLit } = payload;
    if (!mapId || !username) return;

    
    if (socket.data.mapId && socket.data.mapId !== mapId) {
      leaveCurrentMap(socket);
    }

    socket.data.mapId = mapId;
    socket.data.username = username;
    socket.join(mapId);

    if (!mapPlayers.has(mapId)) mapPlayers.set(mapId, {});
    
    
    const state = { username, displayName, appearance, x, y, z, yaw, pitch, heldItem: heldItem || null, zootLit: !!zootLit, ts: Date.now() };
    mapPlayers.get(mapId)[socket.id] = state;
    allPlayers.set(socket.id, { ...state, mapId });

    
    
    
    const others = Object.entries(roomPlayers(mapId))
      .filter(([id]) => id !== socket.id)
      .map(([id, s]) => ({ id, ...s }));
    socket.emit('map_roster', { players: others, elapsed: getMapClock(mapId) });

    
    socket.to(mapId).emit('player_joined', { id: socket.id, ...state });
    notifyAdmins('online');
  });

  socket.on('player_move', (pos = {}) => {
    const mapId = socket.data.mapId;
    if (!mapId) return;
    const players = roomPlayers(mapId);
    const state = players[socket.id];
    
    
    if (!state) return;
    state.x = pos.x; state.y = pos.y; state.z = pos.z; state.yaw = pos.yaw; state.pitch = pos.pitch;
    state.heldItem = pos.heldItem || null; state.zootLit = !!pos.zootLit;
    state.ts = Date.now();
    allPlayers.set(socket.id, { ...state, mapId });
    socket.to(mapId).emit('player_update', { id: socket.id, ...state });
  });

  
  
  socket.on('world_event', (evt = {}) => {
    const mapId = socket.data.mapId;
    if (!mapId) return;
    socket.to(mapId).emit('world_event', { ...evt, from: socket.id });
  });

  socket.on('leave_map', () => leaveCurrentMap(socket));
  socket.on('disconnect', () => leaveCurrentMap(socket));

  
  
  
  
  socket.on('sleep_skip_night', () => {
    const mapId = socket.data.mapId;
    if (!mapId) return;
    const next = Math.ceil((getMapClock(mapId) + 1) / DAY_LENGTH) * DAY_LENGTH;
    mapClocks.set(mapId, next);
    io.to(mapId).emit('time_sync', { elapsed: next });
  });

  

  
  
  
  
  
  
  
  socket.on('admin_spectate', (payload = {}, cb) => {
    if (!socket.data.isAdmin) return cb && cb({ error: 'not_admin' });
    const { targetUsername, mode, adminUsername, adminDisplayName, adminAppearance } = payload;

    const entry = Array.from(allPlayers.entries()).find(([, p]) => p.username === targetUsername);
    if (!entry) return cb && cb({ error: 'target_not_found' });
    const [targetId, targetState] = entry;
    const mapId = targetState.mapId;

    if (socket.data.mapId) leaveCurrentMap(socket);

    socket.join(mapId);
    socket.data.mapId = mapId;
    socket.data.username = adminUsername || socket.data.username;

    if (mode === 'visible') {
      if (!mapPlayers.has(mapId)) mapPlayers.set(mapId, {});
      const state = {
        username: adminUsername, displayName: displayNameFor(adminDisplayName),
        appearance: adminAppearance, x: targetState.x, y: targetState.y, z: targetState.z,
        yaw: targetState.yaw, pitch: targetState.pitch, ts: Date.now(),
      };
      mapPlayers.get(mapId)[socket.id] = state;
      allPlayers.set(socket.id, { ...state, mapId });
      socket.to(mapId).emit('player_joined', { id: socket.id, ...state });
      notifyAdmins('online');
    }
    
    

    cb && cb({ ok: true, mapId, target: { id: targetId, ...targetState }, elapsed: getMapClock(mapId) });
  });

  socket.on('admin_stop_spectate', () => leaveCurrentMap(socket));

  function displayNameFor(name) {
    return name ? ('👁 ' + name) : '👁 Admin';
  }

  function leaveCurrentMap(sock) {
    const mapId = sock.data.mapId;
    if (!mapId) return;
    const players = mapPlayers.get(mapId);
    if (players) {
      delete players[sock.id];
      if (Object.keys(players).length === 0) {
        mapPlayers.delete(mapId);
        
        
        
        persistMapClock(mapId);
        mapClocks.delete(mapId);
      }
    }
    allPlayers.delete(sock.id);
    sock.leave(mapId);
    sock.to(mapId).emit('player_left', { id: sock.id });
    sock.data.mapId = null;
    notifyAdmins('online');
  }
});

httpServer.listen(PORT, () => {
  console.log(`Lucia's Minecraft backend listening on http://localhost:${PORT}`);
  if (!ADMIN_SECRET || ADMIN_USERNAMES.length === 0) {
    console.log('[admin] ADMIN_USERNAMES and/or ADMIN_SECRET not set — admin features are disabled.');
  }
});
