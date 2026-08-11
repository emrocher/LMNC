const { io } = require('socket.io-client');
const http = require('http');

const URL = 'http://localhost:3001';
let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('OK  -', name); }
  else { fail++; console.log('FAIL-', name); }
}
function httpGet(path) {
  return new Promise((resolve, reject) => {
    http.get(URL + path, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
    }).on('error', reject);
  });
}
function emitAck(socket, event, payload) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; resolve({ error: 'ack_timeout' }); } }, 3000);
    socket.emit(event, payload, (res) => {
      if (!done) { done = true; clearTimeout(timer); resolve(res); }
    });
  });
}
setTimeout(() => { console.log('GLOBAL TIMEOUT - aborting'); process.exit(1); }, 15000);

async function main() {
  // alice = joueur normal, bob = joueur normal, admin = compte admin
  const alice = io(URL, { transports: ['websocket'] });
  const bob = io(URL, { transports: ['websocket'] });
  const admin = io(URL, { transports: ['websocket'] });
  await Promise.all([
    new Promise(r => alice.on('connect', r)),
    new Promise(r => bob.on('connect', r)),
    new Promise(r => admin.on('connect', r)),
  ]);

  alice.emit('join_map', { mapId: 'map_admin_test', username: 'alice', displayName: 'Alice', appearance: {}, x: 1, y: 2, z: 3, yaw: 0, pitch: 0 });
  await new Promise(r => setTimeout(r, 150));
  bob.emit('join_map', { mapId: 'map_admin_test', username: 'bob', displayName: 'Bob', appearance: {}, x: 5, y: 2, z: 5, yaw: 0, pitch: 0 });
  await new Promise(r => setTimeout(r, 150));

  // --- identification admin ---
  const badAuth = await emitAck(admin, 'admin_identify', { username: 'root', secret: 'wrong' });
  check('bad admin secret rejected', badAuth.ok === false);

  const goodAuth = await emitAck(admin, 'admin_identify', { username: 'root', secret: 'test-secret-123' });
  check('correct admin identify accepted', goodAuth.ok === true);

  // --- REST admin endpoints ---
  const noSecret = await httpGet('/api/admin/online');
  check('REST admin endpoint rejects missing secret', noSecret.status === 403);

  const withSecret = await httpGet('/api/admin/online?secret=test-secret-123');
  check('REST admin online lists alice+bob', withSecret.status === 200 && withSecret.body.players.length === 2);

  // --- ghost spectate: bob doit ne RIEN voir/recevoir de l'admin ---
  let bobSawJoin = false, bobSawUpdate = false;
  bob.on('player_joined', () => { bobSawJoin = true; });
  bob.on('player_update', (p) => { if (p.username !== 'alice') bobSawUpdate = true; });

  const ghostRes = await emitAck(admin, 'admin_spectate', { targetUsername: 'alice', mode: 'ghost', adminUsername: 'root' });
  check('ghost spectate returns target alice', ghostRes.ok === true && ghostRes.target.username === 'alice');

  admin.emit('player_move', { x: 99, y: 99, z: 99, yaw: 1, pitch: 0 });
  await new Promise(r => setTimeout(r, 200));
  check('bob did NOT see admin join while ghosting', !bobSawJoin);
  check('bob did NOT receive admin movement while ghosting', !bobSawUpdate);

  // l'admin fantome doit tout de meme recevoir les mises a jour d'alice (il est dans la room)
  let adminSawAliceMove = false;
  admin.on('player_update', (p) => { if (p.username === 'alice') adminSawAliceMove = true; });
  alice.emit('player_move', { x: 10, y: 2, z: 10, yaw: 0.5, pitch: 0 });
  await new Promise(r => setTimeout(r, 200));
  check('admin (ghost) still receives alice movement updates', adminSawAliceMove);

  admin.emit('admin_stop_spectate', {});
  await new Promise(r => setTimeout(r, 150));

  // --- visible spectate: bob DOIT voir l'admin rejoindre ---
  bobSawJoin = false;
  const visibleRes = await emitAck(admin, 'admin_spectate', { targetUsername: 'bob', mode: 'visible', adminUsername: 'root', adminDisplayName: 'RootAdmin' });
  check('visible spectate returns target bob', visibleRes.ok === true && visibleRes.target.username === 'bob');
  await new Promise(r => setTimeout(r, 200));
  check('bob DID see admin join while visible', bobSawJoin);

  // --- non-admin ne peut pas spectate ---
  const forbidden = await emitAck(bob, 'admin_spectate', { targetUsername: 'alice', mode: 'ghost' });
  check('non-admin socket cannot use admin_spectate', forbidden.error === 'not_admin');

  admin.disconnect(); alice.disconnect(); bob.disconnect();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
