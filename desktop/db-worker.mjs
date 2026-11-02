// F.A.M.E for Windows — database worker thread.
// Owns the one connection to the encrypted database file and runs the same accounting engine
// as the PWA. Runs off the main process thread so long reports never freeze the window.
//
// File format: SQLCipher 4 (via SQLite3 Multiple Ciphers, cipher=sqlcipher, legacy=4), so a
// database or backup made on Windows opens on the Android app with the same passphrase.
import { parentPort, workerData } from 'node:worker_threads';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { openEngine, closeEngine, handlers } from './engine/engine.mjs';

const { dataDir, backupDir } = workerData;
const DB_FILE = path.join(dataDir, 'fame.db');
const RESTORE_TMP = path.join(dataDir, 'restore.tmp');
const BACKUP_KEEP = 14;
const BACKUP_RE = /^FAME-\d{4}-\d{2}-\d{2}\.fame$/;

let raw = null;
let dirty = false;
let restoreFd = null;
let lastBackup = readJson(path.join(dataDir, 'backup-status.json'));

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function quote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function checkPassphrase(passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < 8) {
    throw new Error('The passphrase must have at least 8 characters.');
  }
}

/** Opens (or creates) an encrypted database and proves the key is right. */
function openEncrypted(file, passphrase, { readonly = false } = {}) {
  const conn = new Database(file, { readonly, fileMustExist: readonly });
  try {
    conn.pragma("cipher='sqlcipher'");
    conn.pragma('legacy=4');
    conn.pragma(`key=${quote(passphrase)}`);
    conn.prepare('SELECT count(*) AS n FROM sqlite_master').get();
    return conn;
  } catch (error) {
    conn.close();
    if (error && error.code === 'SQLITE_NOTADB') throw new Error('Wrong passphrase, or this is not a F.A.M.E database.');
    throw error;
  }
}

function normalizeBind(bind) {
  if (bind === undefined || bind === null) return [];
  const list = Array.isArray(bind) ? bind : [bind];
  return list.map((value) => {
    if (value === undefined) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    return value;
  });
}

/** Adapts better-sqlite3 to the sqlite-wasm oo1 exec() contract the engine is written against. */
function makeDriver(conn) {
  const cache = new Map();
  const prepare = (sql) => {
    let statement = cache.get(sql);
    if (!statement) {
      statement = conn.prepare(sql);
      if (cache.size > 400) cache.delete(cache.keys().next().value);
      cache.set(sql, statement);
    }
    return statement;
  };
  return {
    libVersion: conn.prepare('SELECT sqlite_version() AS v').get().v,
    persistence: 'Encrypted SQLite file (SQLCipher 4) on this PC',
    afterWrite: () => { markDirty(); },
    exec({ sql, bind, resultRows }) {
      const params = normalizeBind(bind);
      let statement;
      try {
        statement = prepare(sql);
      } catch (error) {
        // Schema scripts hold several statements; they never carry bind values.
        if (error instanceof RangeError && !params.length) {
          conn.exec(sql);
          return;
        }
        throw error;
      }
      if (statement.reader) {
        const rows = statement.all(params);
        if (resultRows) for (const row of rows) resultRows.push(row);
      } else {
        statement.run(params);
      }
    }
  };
}

function markDirty() {
  if (!dirty) {
    dirty = true;
    parentPort.postMessage({ event: 'dirty' });
  }
}

function attach(conn) {
  raw = conn;
  const info = openEngine(makeDriver(conn));
  return info;
}

function close() {
  closeEngine();
  if (raw) raw.close();
  raw = null;
}

function requireOpen() {
  if (!raw) throw new Error('The database is locked.');
}

/* ---------------- backups ---------------- */

function stamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

// The file is a rollback-journal database and this thread is its only writer, so between
// requests it is always complete and consistent: a byte copy is a valid encrypted backup.
function copyDatabaseTo(target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  fs.copyFileSync(DB_FILE, tmp);
  fs.renameSync(tmp, target);
}

function pruneBackups() {
  const dated = fs.readdirSync(backupDir).filter((name) => BACKUP_RE.test(name)).sort();
  for (const name of dated.slice(0, Math.max(0, dated.length - BACKUP_KEEP))) {
    try { fs.unlinkSync(path.join(backupDir, name)); } catch { /* in use or gone */ }
  }
}

function backup({ force = false } = {}) {
  requireOpen();
  if (!force && !dirty && lastBackup) return { skipped: true, ...lastBackup };
  const file = path.join(backupDir, `FAME-${stamp()}.fame`);
  copyDatabaseTo(file);
  copyDatabaseTo(path.join(backupDir, 'FAME-latest.fame'));
  pruneBackups();
  dirty = false;
  lastBackup = { at: Date.now(), file, bytes: fs.statSync(file).size };
  fs.writeFileSync(path.join(dataDir, 'backup-status.json'), JSON.stringify(lastBackup));
  return lastBackup;
}

function listBackups() {
  try {
    return fs.readdirSync(backupDir)
      .filter((name) => name.endsWith('.fame'))
      .map((name) => {
        const stat = fs.statSync(path.join(backupDir, name));
        return { name, bytes: stat.size, modifiedAt: stat.mtimeMs };
      })
      .sort((a, b) => b.modifiedAt - a.modifiedAt);
  } catch {
    return [];
  }
}

/* ---------------- operations ---------------- */

const ops = {
  status() {
    const exists = fs.existsSync(DB_FILE);
    return {
      exists,
      unlocked: Boolean(raw),
      dbPath: DB_FILE,
      backupDir,
      bytes: exists ? fs.statSync(DB_FILE).size : 0,
      lastBackup,
      dirty
    };
  },

  create({ passphrase }) {
    checkPassphrase(passphrase);
    if (fs.existsSync(DB_FILE)) throw new Error('A F.A.M.E database already exists on this PC.');
    fs.mkdirSync(dataDir, { recursive: true });
    const info = attach(openEncrypted(DB_FILE, passphrase));
    markDirty();
    return info;
  },

  unlock({ passphrase }) {
    if (raw) return { alreadyOpen: true };
    if (!fs.existsSync(DB_FILE)) throw new Error('No database yet. Create one first.');
    return attach(openEncrypted(DB_FILE, passphrase));
  },

  lock() {
    if (raw && dirty) {
      try { backup(); } catch (error) { console.error('[fame] backup on lock failed', error); }
    }
    close();
    return {};
  },

  async db({ type, payload }) {
    requireOpen();
    const handler = handlers[type];
    if (!handler) throw new Error(`Unknown database action: ${type}`);
    return handler(payload);
  },

  backup: (args) => backup(args || {}),
  listBackups,

  changePassphrase({ oldPassphrase, newPassphrase }) {
    requireOpen();
    checkPassphrase(newPassphrase);
    openEncrypted(DB_FILE, oldPassphrase, { readonly: true }).close();
    raw.pragma(`rekey=${quote(newPassphrase)}`);
    // Older backups keep the passphrase they were made with; start a fresh one with the new one.
    backup({ force: true });
    return {};
  },

  restoreBegin() {
    fs.mkdirSync(dataDir, { recursive: true });
    if (restoreFd !== null) fs.closeSync(restoreFd);
    restoreFd = fs.openSync(RESTORE_TMP, 'w');
    return {};
  },

  restoreChunk({ bytes }) {
    if (restoreFd === null) throw new Error('Restore was not started.');
    fs.writeSync(restoreFd, Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    return {};
  },

  restoreAbort() {
    if (restoreFd !== null) fs.closeSync(restoreFd);
    restoreFd = null;
    try { fs.unlinkSync(RESTORE_TMP); } catch { /* none */ }
    return {};
  },

  restoreCommit({ passphrase }) {
    if (restoreFd === null) throw new Error('Restore was not started.');
    fs.closeSync(restoreFd);
    restoreFd = null;
    try {
      const probe = openEncrypted(RESTORE_TMP, passphrase, { readonly: true });
      const looksRight = probe.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'voucher_lines'").get();
      probe.close();
      if (!looksRight) throw new Error('This backup does not contain F.A.M.E accounting data.');
    } catch (error) {
      try { fs.unlinkSync(RESTORE_TMP); } catch { /* none */ }
      throw error;
    }
    if (raw) {
      // Keep the data being replaced, whatever happens next.
      try { copyDatabaseTo(path.join(backupDir, `FAME-before-restore-${Date.now()}.fame`)); } catch (error) { console.error(error); }
      close();
    } else if (fs.existsSync(DB_FILE)) {
      copyDatabaseTo(path.join(backupDir, `FAME-before-restore-${Date.now()}.fame`));
    }
    for (const suffix of ['-journal', '-wal', '-shm']) {
      try { fs.unlinkSync(DB_FILE + suffix); } catch { /* none */ }
    }
    fs.renameSync(RESTORE_TMP, DB_FILE);
    const info = attach(openEncrypted(DB_FILE, passphrase));
    dirty = true;
    backup({ force: true });
    return info;
  }
};

parentPort.on('message', async ({ id, op, args }) => {
  try {
    const fn = ops[op];
    if (!fn) throw new Error(`Unknown operation: ${op}`);
    parentPort.postMessage({ id, ok: true, result: await fn(args || {}) });
  } catch (error) {
    parentPort.postMessage({ id, ok: false, error: (error && error.message) || String(error) });
  }
});
