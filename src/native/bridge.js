// One API over the two native shells. In the browser (PWA) `platform` is null and nothing here runs.
//
//   Windows: window.FAMEDesktop.call(op, args)   — async IPC to Electron; the engine runs in a
//            Node worker thread against an encrypted SQLCipher file.
//   Android: window.FAMENative.<method>(...)     — synchronous Java bridge to an encrypted
//            SQLCipher file; the engine runs here in the page and sends it one SQL statement at a time.

const desktop = typeof window !== 'undefined' ? window.FAMEDesktop : undefined;
const isAndroidShell = typeof window !== 'undefined'
  && typeof window.Capacitor?.getPlatform === 'function'
  && window.Capacitor.getPlatform() === 'android';

export const platform = desktop ? 'windows' : isAndroidShell ? 'android' : null;
if (platform) window.FAME_PLATFORM = platform;

export const deviceWord = platform === 'android' ? 'phone' : 'PC';

/* ---------------- Android plumbing ---------------- */

export function androidBridgePresent() {
  return Boolean(window.FAMENative && typeof window.FAMENative.status === 'function');
}

function android(method, ...args) {
  if (!androidBridgePresent()) throw new Error('The F.A.M.E storage bridge is not available.');
  const out = JSON.parse(window.FAMENative[method](...args));
  if (!out.ok) throw new Error(out.error || 'Storage error');
  return out.result;
}

function normalizeBind(bind) {
  if (bind === undefined || bind === null) return [];
  const list = Array.isArray(bind) ? bind : [bind];
  return list.map((value) => {
    if (value === undefined) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'number' && !Number.isFinite(value)) return null;
    return value;
  });
}

/** Splits a script into statements (quotes, comments and CREATE TRIGGER bodies respected). */
export function splitStatements(sql) {
  const out = [];
  let current = '';
  let quote = null;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (quote) {
      current += ch;
      if (quote === '--' && ch === '\n') quote = null;
      else if (quote === '/*' && ch === '*' && next === '/') { current += next; i += 1; quote = null; }
      else if (quote === ch && quote !== '--' && quote !== '/*') quote = null;
      else if (quote === '[' && ch === ']') quote = null;
      continue;
    }
    if (ch === '-' && next === '-') { quote = '--'; current += ch; continue; }
    if (ch === '/' && next === '*') { quote = '/*'; current += ch; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; current += ch; continue; }
    if (ch === '[') { quote = '['; current += ch; continue; }
    if (ch === ';') {
      const trimmed = current.trim();
      const isTrigger = /^CREATE\s+(TEMP(ORARY)?\s+)?TRIGGER\b/i.test(trimmed);
      if (isTrigger && !/\bEND$/i.test(trimmed)) { current += ch; continue; }
      if (trimmed) out.push(trimmed);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

const RETURNS_ROWS = /^\s*(SELECT|WITH|VALUES|EXPLAIN)\b/i;

/** sqlite-wasm oo1 exec() contract, served by the Java bridge. */
function androidExec({ sql, bind, resultRows }) {
  const params = normalizeBind(bind);
  if (resultRows || RETURNS_ROWS.test(sql)) {
    const result = android('exec', sql, JSON.stringify(params), true);
    if (resultRows) for (const row of result.rows) resultRows.push(row);
    return;
  }
  const statements = params.length ? [sql] : splitStatements(sql);
  for (const statement of statements) android('exec', statement, JSON.stringify(params), false);
}

let androidEngine = null;
let androidQueue = Promise.resolve();

async function openAndroidEngine(info) {
  const engine = await import('../engine.js');
  engine.openEngine({ exec: androidExec, libVersion: info.sqliteVersion, persistence: info.persistence });
  androidEngine = engine;
}

function androidDb(type, payload) {
  const run = async () => {
    if (!androidEngine) throw new Error('The database is locked.');
    // Let the UI paint (spinners, button states) before a long synchronous report.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const handler = androidEngine.handlers[type];
    if (!handler) throw new Error(`Unknown database action: ${type}`);
    return handler(payload);
  };
  const next = androidQueue.then(run, run);
  androidQueue = next.catch(() => undefined);
  return next;
}

/* ---------------- shared API ---------------- */

const desktopCall = (op, args) => desktop.call(op, args);

function bytesToBase64(bytes) {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  return btoa(binary);
}

const CHUNK_BYTES = 2 * 1024 * 1024;

export const native = {
  async status() {
    return platform === 'windows' ? desktopCall('status') : android('status');
  },
  async create(passphrase, remember) {
    if (platform === 'windows') return desktopCall('create', { passphrase, remember });
    const info = android('create', passphrase, Boolean(remember));
    await openAndroidEngine(info);
    return info;
  },
  async unlock(passphrase, remember) {
    if (platform === 'windows') return desktopCall('unlock', { passphrase, remember });
    const info = android('unlock', passphrase, Boolean(remember));
    await openAndroidEngine(info);
    return info;
  },
  async unlockRemembered() {
    if (platform === 'windows') return desktopCall('unlockRemembered');
    const result = android('unlockRemembered');
    if (result.ok) await openAndroidEngine(result.info);
    return result;
  },
  async reattach() {
    // Android: the Java side is still unlocked after a page reload; reconnect the engine.
    if (platform !== 'android') return;
    const status = android('status');
    if (status.unlocked && !androidEngine) {
      const result = android('unlock', '', false);
      await openAndroidEngine(result);
    }
  },
  async forget() {
    return platform === 'windows' ? desktopCall('forget') : android('forget');
  },
  async lock() {
    if (platform === 'windows') return desktopCall('lock');
    androidEngine?.closeEngine();
    androidEngine = null;
    return android('lock');
  },
  async changePassphrase(oldPassphrase, newPassphrase) {
    return platform === 'windows'
      ? desktopCall('changePassphrase', { oldPassphrase, newPassphrase })
      : android('changePassphrase', oldPassphrase, newPassphrase);
  },
  async backupNow() {
    return platform === 'windows' ? desktopCall('backupNow') : android('backupNow');
  },
  async listBackups() {
    return platform === 'windows' ? desktopCall('listBackups') : android('listBackups');
  },
  async openBackupFolder() {
    return desktopCall('openBackupFolder');
  },
  async shareLatestBackup() {
    const path = android('latestBackupPath');
    if (!path) throw new Error('No backup yet. Tap "Back up now" first.');
    return android('share', path, 'application/octet-stream');
  },
  /** Streams a .fame backup file to the device in chunks, then swaps it in. */
  async restoreFromFile(file, passphrase, remember, onProgress = () => {}) {
    if (platform === 'windows') await desktopCall('restoreBegin');
    else android('restoreBegin');
    try {
      for (let offset = 0; offset < file.size; offset += CHUNK_BYTES) {
        const bytes = new Uint8Array(await file.slice(offset, offset + CHUNK_BYTES).arrayBuffer());
        if (platform === 'windows') await desktopCall('restoreChunk', { bytes });
        else android('restoreChunk', bytesToBase64(bytes));
        onProgress(Math.min(1, (offset + bytes.length) / file.size));
      }
    } catch (error) {
      if (platform === 'windows') await desktopCall('restoreAbort'); else android('restoreAbort');
      throw error;
    }
    if (platform === 'windows') return desktopCall('restoreCommit', { passphrase, remember });
    androidEngine?.closeEngine();
    androidEngine = null;
    const info = android('restoreCommit', passphrase, Boolean(remember));
    await openAndroidEngine(info);
    return info;
  },
  /** Android only: saves a download into Documents/FAME/Exports. */
  async saveExport(filename, blob) {
    android('exportBegin', filename);
    for (let offset = 0; offset < blob.size; offset += CHUNK_BYTES) {
      const bytes = new Uint8Array(await blob.slice(offset, offset + CHUNK_BYTES).arrayBuffer());
      android('exportChunk', bytesToBase64(bytes));
    }
    return android('exportEnd');
  },
  share(path, mime) { return android('share', path, mime || ''); },
  open(path, mime) { return android('open', path, mime || ''); },
  db(type, payload) {
    return platform === 'windows' ? desktopCall('db', { type, payload }) : androidDb(type, payload);
  }
};
