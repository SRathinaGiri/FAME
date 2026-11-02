// PWA database worker: sqlite-wasm driver for the shared engine.
// OPFS when the host is cross-origin isolated; otherwise an in-memory database mirrored to IndexedDB.
// The Windows and Android apps do not use this file — they run the same engine against an
// encrypted SQLCipher file on the device's file system (see src/native/).
import sqlite3InitModule from './vendor/sqlite/index.mjs';
import { openEngine, handlers, exportData, replaceData, SCHEMA_VERSION } from './engine.js';

const DB_FILE = '/fame-v11.sqlite3';
const IDB_NAME = 'fame-sqlite-fallback-v11';
const IDB_STORE = 'snapshots';
const IDB_KEY = 'latest';

let readyPromise;
let mirrorToIndexedDb = false;

function openSnapshotStore() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(IDB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open IndexedDB snapshot store.'));
  });
}

async function readIndexedDbSnapshot() {
  const idb = await openSnapshotStore();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readonly');
    const request = tx.objectStore(IDB_STORE).get(IDB_KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error('Could not read local snapshot.'));
    tx.oncomplete = () => idb.close();
    tx.onerror = () => {
      idb.close();
      reject(tx.error || new Error('Could not read local snapshot.'));
    };
  });
}

async function writeIndexedDbSnapshot(snapshot) {
  const idb = await openSnapshotStore();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(snapshot, IDB_KEY);
    tx.oncomplete = () => {
      idb.close();
      resolve();
    };
    tx.onerror = () => {
      idb.close();
      reject(tx.error || new Error('Could not write local snapshot.'));
    };
  });
}

async function init() {
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    const isGitHubPagesBuild = self.location.pathname.includes('/FAME/');
    const sqlite3 = await sqlite3InitModule({
      disable: { vfs: { opfs: isGitHubPagesBuild, 'opfs-sahpool': true, 'opfs-wl': true } },
      print: () => {},
      printErr: (...args) => console.error(...args)
    });
    let db;
    let persistence;
    if (!isGitHubPagesBuild && 'opfs' in sqlite3) {
      db = new sqlite3.oo1.OpfsDb(DB_FILE, 'c');
      persistence = 'OPFS persistent SQLite database';
    } else {
      db = new sqlite3.oo1.DB(DB_FILE, 'c');
      mirrorToIndexedDb = true;
      persistence = isGitHubPagesBuild
        ? 'IndexedDB-mirrored SQLite fallback for GitHub Pages'
        : 'IndexedDB-mirrored SQLite fallback; OPFS unavailable';
    }
    const info = openEngine({
      exec: (options) => db.exec(options),
      libVersion: sqlite3.version.libVersion,
      persistence,
      afterWrite: mirrorToIndexedDb ? () => writeIndexedDbSnapshot(exportData()) : null
    });
    if (mirrorToIndexedDb) {
      const snapshot = await readIndexedDbSnapshot();
      if (snapshot?.app === 'F.A.M.E' && snapshot.schemaVersion === SCHEMA_VERSION) replaceData(snapshot);
      else await writeIndexedDbSnapshot(exportData());
    }
    return info;
  })();
  return readyPromise;
}

self.addEventListener('message', async (event) => {
  const { id, type, payload } = event.data;
  try {
    await init();
    const handler = handlers[type];
    if (!handler) throw new Error(`Unknown database action: ${type}`);
    self.postMessage({ id, ok: true, result: await handler(payload) });
  } catch (error) {
    console.error(error);
    self.postMessage({ id, ok: false, error: error.message || String(error) });
  }
});
