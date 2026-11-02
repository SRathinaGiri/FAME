// F.A.M.E for Windows (Electron).
//
// Storage: the accounting database is an encrypted SQLCipher 4 file at
//   %APPDATA%\F.A.M.E\data\fame.db
// owned by a worker thread (db-worker.mjs) that runs the same engine as the web app. Nothing is
// kept in browser storage. Automatic encrypted backups go to Documents\FAME\Backups.
//
// The page is served from inside the installer over a private app:// origin; the preload exposes
// one small IPC surface (FAMEDesktop.call) and nothing else from Node or Electron.
'use strict';

const { app, BrowserWindow, protocol, ipcMain, shell, Menu, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { Worker } = require('node:worker_threads');

const SCHEME = 'app';
const HOST = 'fame';
const ORIGIN = `${SCHEME}://${HOST}`;
const WEB_ROOT = path.join(__dirname, 'app-www');
const AUTO_BACKUP_DELAY_MS = 60 * 1000;

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } }
]);

if (!app.requestSingleInstanceLock()) {
  // A second copy would open the same database file.
  app.quit();
  process.exit(0);
}

/* ---------------- static files ---------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.wasm': 'application/wasm',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8'
};

function inside(base, target) {
  const rel = path.relative(base, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

async function serve(request) {
  const url = new URL(request.url);
  if (url.host !== HOST) return new Response('Not found', { status: 404 });
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(WEB_ROOT, rel));
  if (!inside(WEB_ROOT, file)) return new Response('Forbidden', { status: 403 });
  try {
    const body = await fsp.readFile(file);
    return new Response(body, {
      headers: {
        'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-cache',
        'content-security-policy': "default-src 'self' blob: data:; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' blob: data:; worker-src 'self' blob:; object-src 'self' blob:"
      }
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

/* ---------------- database worker ---------------- */

const dataDir = () => path.join(app.getPath('userData'), 'data');
const backupDir = () => path.join(app.getPath('documents'), 'FAME', 'Backups');
const vaultFile = () => path.join(app.getPath('userData'), 'vault.json');

let worker = null;
let nextId = 1;
const pending = new Map();
let backupTimer = null;

function startWorker() {
  fs.mkdirSync(dataDir(), { recursive: true });
  worker = new Worker(path.join(__dirname, 'db-worker.mjs'), { workerData: { dataDir: dataDir(), backupDir: backupDir() } });
  worker.on('message', (msg) => {
    if (msg.event === 'dirty') return scheduleBackup();
    const request = pending.get(msg.id);
    if (!request) return;
    pending.delete(msg.id);
    if (msg.ok) request.resolve(msg.result); else request.reject(new Error(msg.error));
  });
  worker.on('error', (error) => {
    console.error('[fame] database worker crashed', error);
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  });
}

function dbOp(op, args = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, op, args });
  });
}

function scheduleBackup() {
  clearTimeout(backupTimer);
  backupTimer = setTimeout(() => {
    backupTimer = null;
    dbOp('backup').catch((error) => console.error('[fame] automatic backup failed', error));
  }, AUTO_BACKUP_DELAY_MS);
}

/* ---------------- remembered passphrase (Windows DPAPI via safeStorage) ---------------- */

function readVault() {
  try { return JSON.parse(fs.readFileSync(vaultFile(), 'utf8')); } catch { return {}; }
}

function rememberPassphrase(passphrase) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows cannot protect a saved passphrase on this account.');
  const sealed = safeStorage.encryptString(passphrase).toString('base64');
  fs.writeFileSync(vaultFile(), JSON.stringify({ sealed }));
}

function forgetPassphrase() {
  try { fs.unlinkSync(vaultFile()); } catch { /* none */ }
}

function rememberedPassphrase() {
  const { sealed } = readVault();
  if (!sealed || !safeStorage.isEncryptionAvailable()) return null;
  try { return safeStorage.decryptString(Buffer.from(sealed, 'base64')); } catch { return null; }
}

/* ---------------- IPC surface ---------------- */

const nativeOps = {
  async status() {
    const status = await dbOp('status');
    return { ...status, platform: 'windows', remembered: Boolean(readVault().sealed) };
  },
  async create({ passphrase, remember }) {
    const info = await dbOp('create', { passphrase });
    if (remember) rememberPassphrase(passphrase); else forgetPassphrase();
    return info;
  },
  async unlock({ passphrase, remember }) {
    const info = await dbOp('unlock', { passphrase });
    if (remember) rememberPassphrase(passphrase);
    return info;
  },
  async unlockRemembered() {
    const passphrase = rememberedPassphrase();
    if (!passphrase) return { ok: false };
    try {
      return { ok: true, info: await dbOp('unlock', { passphrase }) };
    } catch {
      return { ok: false }; // stale (e.g. passphrase changed elsewhere); ask the user
    }
  },
  async forget() { forgetPassphrase(); return {}; },
  async lock() { return dbOp('lock'); },
  async changePassphrase({ oldPassphrase, newPassphrase }) {
    await dbOp('changePassphrase', { oldPassphrase, newPassphrase });
    if (readVault().sealed) rememberPassphrase(newPassphrase);
    return {};
  },
  async backupNow() { return dbOp('backup', { force: true }); },
  async listBackups() { return dbOp('listBackups'); },
  async openBackupFolder() {
    fs.mkdirSync(backupDir(), { recursive: true });
    await shell.openPath(backupDir());
    return {};
  },
  async restoreBegin() { return dbOp('restoreBegin'); },
  async restoreChunk({ bytes }) { return dbOp('restoreChunk', { bytes }); },
  async restoreAbort() { return dbOp('restoreAbort'); },
  async restoreCommit({ passphrase, remember }) {
    const info = await dbOp('restoreCommit', { passphrase });
    if (remember || readVault().sealed) rememberPassphrase(passphrase);
    return info;
  },
  async db({ type, payload }) { return dbOp('db', { type, payload }); }
};

function fromOurPage(event) {
  try {
    const u = new URL(event.senderFrame.url);
    return u.protocol === `${SCHEME}:` && u.host === HOST;
  } catch {
    return false;
  }
}

ipcMain.handle('fame:native', async (event, op, args) => {
  if (!fromOurPage(event)) throw new Error('Not allowed');
  if (!Object.prototype.hasOwnProperty.call(nativeOps, op)) throw new Error(`Unknown operation ${op}`);
  return nativeOps[op](args || {});
});

/* ---------------- window ---------------- */

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360, height: 900, minWidth: 380, minHeight: 560,
    backgroundColor: '#f4f7fb',
    title: 'F.A.M.E',
    icon: path.join(__dirname, 'app-www', 'icons', 'fame-icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Invoice / report previews open PDFs in a child window (Chromium's built-in PDF viewer).
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url === 'about:blank' || url === '' || url.startsWith('blob:') || url.startsWith(ORIGIN + '/')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          backgroundColor: '#ffffff',
          webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, plugins: true }
        }
      };
    }
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(ORIGIN + '/')) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });
  // Exports (PDF, Excel, CSV ZIP, JSON backup) use the normal Windows "Save As" dialog.
  mainWindow.webContents.session.on('will-download', (event, item) => {
    const folder = path.join(app.getPath('documents'), 'FAME');
    fs.mkdirSync(folder, { recursive: true });
    item.setSaveDialogOptions({ defaultPath: path.join(folder, item.getFilename()) });
  });

  mainWindow.loadURL(`${ORIGIN}/index.html`);
}

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.whenReady().then(() => {
  protocol.handle(SCHEME, serve);
  Menu.setApplicationMenu(null);
  startWorker();
  createWindow();
});

// Take a final backup (if anything changed) and close the database cleanly before exit.
let quitting = false;
app.on('before-quit', (event) => {
  if (quitting || !worker) return;
  event.preventDefault();
  quitting = true;
  clearTimeout(backupTimer);
  const done = () => app.exit(0);
  Promise.race([dbOp('lock'), new Promise((resolve) => setTimeout(resolve, 20000))]).then(done, done);
});

app.on('window-all-closed', () => app.quit());
