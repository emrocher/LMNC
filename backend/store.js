






const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let cache = {};
if (fs.existsSync(DATA_FILE)) {
  try {
    cache = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (err) {
    console.error('[store] Failed to parse existing data file, starting empty:', err.message);
    cache = {};
  }
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




function namespacedKey(key, shared) {
  return (shared ? 'shared:' : 'private:') + key;
}

function get(key, shared) {
  const k = namespacedKey(key, shared);
  return Object.prototype.hasOwnProperty.call(cache, k) ? cache[k] : null;
}

function set(key, value, shared) {
  const k = namespacedKey(key, shared);
  cache[k] = value;
  scheduleWrite();
  return true;
}

function del(key, shared) {
  const k = namespacedKey(key, shared);
  const existed = Object.prototype.hasOwnProperty.call(cache, k);
  delete cache[k];
  if (existed) scheduleWrite();
  return existed;
}

function list(prefix, shared) {
  const nsPrefix = namespacedKey(prefix || '', shared);
  const stripLen = (shared ? 'shared:' : 'private:').length;
  return Object.keys(cache)
    .filter((k) => k.startsWith(nsPrefix))
    .map((k) => k.slice(stripLen));
}

module.exports = { get, set, del, list };
