const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL || '';

let cache = {};

function namespacedKey(key, shared) {
  return (shared ? 'shared:' : 'private:') + key;
}

function get(key, shared) {
  const k = namespacedKey(key, shared);
  return Object.prototype.hasOwnProperty.call(cache, k) ? cache[k] : null;
}

function list(prefix, shared) {
  const nsPrefix = namespacedKey(prefix || '', shared);
  const stripLen = (shared ? 'shared:' : 'private:').length;
  return Object.keys(cache)
    .filter((k) => k.startsWith(nsPrefix))
    .map((k) => k.slice(stripLen));
}

let set, del, init;

if (DATABASE_URL) {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
  });

  init = async function init() {
    await pool.query('CREATE TABLE IF NOT EXISTS kv_store (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
    const { rows } = await pool.query('SELECT k, v FROM kv_store');
    cache = {};
    for (const row of rows) cache[row.k] = row.v;
    console.log(`[store] loaded ${rows.length} keys from Postgres`);
  };

  set = function set(key, value, shared) {
    const k = namespacedKey(key, shared);
    cache[k] = value;
    pool.query('INSERT INTO kv_store (k, v) VALUES ($1, $2) ON CONFLICT (k) DO UPDATE SET v = $2', [k, value])
      .catch((err) => console.error('[store] postgres write failed:', err.message));
    return true;
  };

  del = function del(key, shared) {
    const k = namespacedKey(key, shared);
    const existed = Object.prototype.hasOwnProperty.call(cache, k);
    delete cache[k];
    if (existed) {
      pool.query('DELETE FROM kv_store WHERE k = $1', [k])
        .catch((err) => console.error('[store] postgres delete failed:', err.message));
    }
    return existed;
  };
} else {
  const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
  const DATA_FILE = path.join(DATA_DIR, 'store.json');

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  let writeTimer = null;
  let writing = false;
  let pendingWriteAgain = false;

  function flushToDisk() {
    if (writing) {
      pendingWriteAgain = true;
      return;
    }
    writing = true;
    const tmpFile = DATA_FILE + '.tmp';
    const json = JSON.stringify(cache);
    fs.writeFile(tmpFile, json, (err) => {
      if (err) {
        console.error('[store] write failed:', err.message);
        writing = false;
        return;
      }
      fs.rename(tmpFile, DATA_FILE, (err2) => {
        writing = false;
        if (err2) console.error('[store] rename failed:', err2.message);
        if (pendingWriteAgain) {
          pendingWriteAgain = false;
          scheduleWrite();
        }
      });
    });
  }

  function scheduleWrite() {
    clearTimeout(writeTimer);
    writeTimer = setTimeout(flushToDisk, 250);
  }

  init = async function init() {
    if (fs.existsSync(DATA_FILE)) {
      try {
        cache = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      } catch (err) {
        console.error('[store] Failed to parse existing data file, starting empty:', err.message);
        cache = {};
      }
    }
    console.log(`[store] loaded ${Object.keys(cache).length} keys from local file (DATABASE_URL not set)`);
  };

  set = function set(key, value, shared) {
    const k = namespacedKey(key, shared);
    cache[k] = value;
    scheduleWrite();
    return true;
  };

  del = function del(key, shared) {
    const k = namespacedKey(key, shared);
    const existed = Object.prototype.hasOwnProperty.call(cache, k);
    delete cache[k];
    if (existed) scheduleWrite();
    return existed;
  };
}

module.exports = { get, set, del, list, init };
