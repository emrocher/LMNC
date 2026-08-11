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

async function main() {
  const a = io(URL, { transports: ['websocket'] });
  const b = io(URL, { transports: ['websocket'] });

  await Promise.all([
    new Promise(r => a.on('connect', r)),
    new Promise(r => b.on('connect', r)),
  ]);
  check('both clients connected', a.connected && b.connected);

  let countBefore = await httpGet('/api/rooms/map_test/count');
  check('room count is 0 before anyone joins', countBefore.body.count === 0);

  let bRoster = null;
  b.on('map_roster', (roster) => { bRoster = roster; });

  a.emit('join_map', { mapId: 'map_test', username: 'alice', displayName: 'Alice', appearance: {skin:'#fff'}, x: 1, y: 2, z: 3, yaw: 0 });
  await new Promise(r => setTimeout(r, 150));

  let aSawJoin = null;
  a.on('player_joined', (p) => { aSawJoin = p; });

  b.emit('join_map', { mapId: 'map_test', username: 'bob', displayName: 'Bob', appearance: {skin:'#000'}, x: 4, y: 5, z: 6, yaw: 1 });
  await new Promise(r => setTimeout(r, 150));

  check('bob received roster containing alice', bRoster && bRoster.length === 1 && bRoster[0].username === 'alice');
  check('alice was notified bob joined', aSawJoin && aSawJoin.username === 'bob');

  let countAfterJoin = await httpGet('/api/rooms/map_test/count');
  check('room count is 2 after both joined', countAfterJoin.body.count === 2);

  let aSawMove = null;
  a.on('player_update', (p) => { aSawMove = p; });
  b.emit('player_move', { x: 9, y: 9, z: 9, yaw: 2 });
  await new Promise(r => setTimeout(r, 150));
  check('alice received bob move update', aSawMove && aSawMove.x === 9 && aSawMove.username === 'bob');

  let bSawWorldEvent = null;
  b.on('world_event', (e) => { bSawWorldEvent = e; });
  a.emit('world_event', { type: 'block_change', x: 1, y: 2, z: 3, val: 5 });
  await new Promise(r => setTimeout(r, 150));
  check('bob received world_event from alice', bSawWorldEvent && bSawWorldEvent.type === 'block_change' && bSawWorldEvent.val === 5);

  let aSawLeft = null;
  a.on('player_left', (p) => { aSawLeft = p; });
  b.disconnect();
  await new Promise(r => setTimeout(r, 200));
  check('alice notified bob left', !!aSawLeft);

  let countAfterLeave = await httpGet('/api/rooms/map_test/count');
  check('room count is 1 after bob left', countAfterLeave.body.count === 1);

  a.disconnect();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
