// Unlock / first-run screen and the "This PC / This phone" backup panel for the native apps.
import { androidBridgePresent, deviceWord, native, platform } from './bridge.js';

const MIN_PASSPHRASE = 8;

function el(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatBytes(bytes) {
  if (!bytes) return '0 KB';
  const units = ['bytes', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toLocaleString('en-IN', { maximumFractionDigits: unit > 1 ? 1 : 0 })} ${units[unit]}`;
}

function formatWhen(ms) {
  if (!ms) return 'not yet';
  return new Date(ms).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

let noticeTimer;
export function nativeNotice(message, action) {
  let box = document.querySelector('#nativeNotice');
  if (!box) {
    box = el('<div id="nativeNotice" class="native-notice hidden" role="status" aria-live="polite"><span></span><button type="button" class="secondary hidden"></button></div>');
    document.body.append(box);
  }
  const [text, button] = box.children;
  text.textContent = message;
  button.classList.toggle('hidden', !action);
  button.onclick = null;
  if (action) {
    button.textContent = action.label;
    button.onclick = () => { box.classList.add('hidden'); action.run(); };
  }
  box.classList.remove('hidden');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => box.classList.add('hidden'), action ? 9000 : 5000);
}

/* ---------------- unlock / setup overlay ---------------- */

const restoreBlock = (id) => `
  <details class="vault-restore" id="${id}">
    <summary>Restore from a F.A.M.E device backup (.fame) instead</summary>
    <p class="field-note">Use a backup made by F.A.M.E on Windows or Android. Enter the passphrase that was in use when that backup was made.</p>
    <label>Backup file <input type="file" name="restoreFile" accept=".fame,application/octet-stream"></label>
    <label>Backup passphrase <input type="password" name="restorePassphrase" autocomplete="current-password"></label>
    <button type="button" class="secondary" data-action="restore">Restore backup</button>
  </details>`;

function overlayHtml(mode) {
  const remember = `
    <label class="vault-check">
      <input type="checkbox" name="remember">
      <span>Unlock automatically on this ${deviceWord}
        <small>The passphrase is sealed by ${platform === 'windows' ? 'your Windows account' : 'the Android Keystore'}. Anyone who can use this ${deviceWord} unlocked can then open F.A.M.E.</small>
      </span>
    </label>`;
  if (mode === 'setup') {
    return `
      <div class="vault-overlay" id="vaultOverlay">
        <form class="vault-card panel" novalidate>
          <div class="brand-mark">F</div>
          <h2>Protect your accounts</h2>
          <p class="muted-text">F.A.M.E keeps your books in an encrypted database file on this ${deviceWord}, not in browser storage.
            Choose a passphrase of at least ${MIN_PASSPHRASE} characters.</p>
          <p class="vault-warning">There is no "forgot passphrase". Without it, the data can only come back from a backup you can open.</p>
          <label>Passphrase <input type="password" name="passphrase" autocomplete="new-password" minlength="${MIN_PASSPHRASE}" required></label>
          <label>Repeat passphrase <input type="password" name="confirm" autocomplete="new-password" required></label>
          ${remember}
          <p class="vault-error hidden" role="alert"></p>
          <button type="submit">Create encrypted database</button>
          <p class="field-note">Coming from the browser version? Create the database here, then open <b>Backup › Backup Import</b> and import your JSON backup.</p>
          ${restoreBlock('vaultRestore')}
        </form>
      </div>`;
  }
  return `
    <div class="vault-overlay" id="vaultOverlay">
      <form class="vault-card panel" novalidate>
        <div class="brand-mark">F</div>
        <h2>Unlock F.A.M.E</h2>
        <p class="muted-text">Enter the passphrase for the encrypted database on this ${deviceWord}.</p>
        <label>Passphrase <input type="password" name="passphrase" autocomplete="current-password" required autofocus></label>
        ${remember}
        <p class="vault-error hidden" role="alert"></p>
        <button type="submit">Unlock</button>
        ${restoreBlock('vaultRestore')}
      </form>
    </div>`;
}

function showOverlay(mode) {
  return new Promise((resolve) => {
    const overlay = el(overlayHtml(mode));
    document.body.append(overlay);
    document.body.classList.add('vault-locked');
    const form = overlay.querySelector('form');
    const error = overlay.querySelector('.vault-error');
    const buttons = () => overlay.querySelectorAll('button');
    const fail = (message) => {
      error.textContent = message;
      error.classList.remove('hidden');
      buttons().forEach((b) => { b.disabled = false; });
    };
    const busy = () => {
      error.classList.add('hidden');
      buttons().forEach((b) => { b.disabled = true; });
    };
    const done = (info) => {
      overlay.remove();
      document.body.classList.remove('vault-locked');
      resolve(info);
    };
    form.passphrase.focus();

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const passphrase = form.passphrase.value;
      const remember = form.remember.checked;
      if (passphrase.length < MIN_PASSPHRASE) return fail(`Use at least ${MIN_PASSPHRASE} characters.`);
      if (mode === 'setup' && passphrase !== form.confirm.value) return fail('The two passphrases do not match.');
      busy();
      try {
        done(mode === 'setup' ? await native.create(passphrase, remember) : await native.unlock(passphrase, remember));
      } catch (e) {
        fail(e.message);
        form.passphrase.select();
      }
    });

    overlay.querySelector('[data-action="restore"]').addEventListener('click', async () => {
      const file = form.restoreFile.files[0];
      const passphrase = form.restorePassphrase.value;
      if (!file) return fail('Choose the .fame backup file.');
      if (!passphrase) return fail('Enter the passphrase of that backup.');
      busy();
      try {
        done(await native.restoreFromFile(file, passphrase, form.remember.checked));
      } catch (e) {
        fail(e.message);
      }
    });
  });
}

/** Resolves once the encrypted database is open. Called by db-client before 'init'. */
export async function ensureUnlocked() {
  if (platform === 'android' && !androidBridgePresent()) {
    // The Java bridge attaches as the WebView starts; on a very fast first paint it can miss
    // the first document. One reload picks it up.
    if (!sessionStorage.getItem('fame-bridge-reload')) {
      sessionStorage.setItem('fame-bridge-reload', '1');
      window.location.reload();
      await new Promise(() => {});
    }
    throw new Error('The encrypted storage bridge did not start. Close F.A.M.E fully and open it again.');
  }
  sessionStorage.removeItem('fame-bridge-reload');
  installDownloadHandling();
  const status = await native.status();
  if (status.unlocked) {
    await native.reattach();
  } else if (status.exists && status.remembered && (await native.unlockRemembered()).ok) {
    // unlocked silently
  } else {
    await showOverlay(status.exists ? 'unlock' : 'setup');
  }
  installDevicePanel();
}

/* ---------------- device panel in the Backup view ---------------- */

function panelHtml() {
  const shareOrOpen = platform === 'windows'
    ? '<button type="button" class="secondary" data-action="folder">Open backups folder</button>'
    : '<button type="button" class="secondary" data-action="share">Share latest backup…</button>';
  return `
    <section class="panel native-device-panel" id="nativeDevicePanel">
      <div class="panel-heading">
        <div>
          <h2>Encrypted storage on this ${deviceWord}</h2>
          <p class="muted-text">Your books live in an encrypted SQLCipher database file, not in browser storage.
            After changes, an encrypted copy is saved to <b>Documents › FAME › Backups</b> (one per day, last 14 days kept).
            Copy those .fame files to another disk or cloud folder now and then. A .fame backup opens on both the Windows and Android apps with its passphrase.</p>
        </div>
      </div>
      <div class="native-status" data-slot="status">Reading status…</div>
      <div class="native-actions">
        <button type="button" data-action="backup">Back up now</button>
        ${shareOrOpen}
        <button type="button" class="secondary" data-action="lock">Lock now</button>
      </div>
      <div class="split-grid native-forms">
        <form class="form-grid" data-form="restore">
          <h3>Restore a .fame backup</h3>
          <label>Backup file <input type="file" name="file" accept=".fame,application/octet-stream" required></label>
          <label>Passphrase of that backup <input type="password" name="passphrase" autocomplete="current-password" required></label>
          <p class="field-note">The data on this ${deviceWord} is replaced. It is saved first as a "before-restore" backup.</p>
          <button type="submit" class="danger">Restore and replace</button>
        </form>
        <form class="form-grid" data-form="passphrase">
          <h3>Change passphrase</h3>
          <label>Current passphrase <input type="password" name="old" autocomplete="current-password" required></label>
          <label>New passphrase <input type="password" name="next" autocomplete="new-password" minlength="${MIN_PASSPHRASE}" required></label>
          <label>Repeat new passphrase <input type="password" name="confirm" autocomplete="new-password" required></label>
          <p class="field-note">Older backups still need the passphrase they were made with.</p>
          <button type="submit">Change passphrase</button>
          <button type="button" class="secondary" data-action="forget">Stop unlocking automatically</button>
        </form>
      </div>
    </section>`;
}

async function refreshPanel(panel) {
  const slot = panel.querySelector('[data-slot="status"]');
  try {
    const s = await native.status();
    const last = s.lastBackup;
    slot.innerHTML = `
      <dl class="native-facts">
        <dt>Database file</dt><dd>${escapeHtml(s.dbPath)} (${formatBytes(s.bytes)})</dd>
        <dt>Last backup</dt><dd>${last ? `${escapeHtml(formatWhen(last.at))} — ${escapeHtml(last.file)}` : 'not yet'}</dd>
        <dt>Unsaved to backup</dt><dd>${s.dirty ? 'yes — a backup runs about a minute after your last change' : 'no'}</dd>
        <dt>Unlocks automatically</dt><dd>${s.remembered ? 'yes' : 'no'}</dd>
      </dl>`;
    panel.querySelector('[data-action="forget"]').classList.toggle('hidden', !s.remembered);
  } catch (error) {
    slot.textContent = error.message;
  }
}

function installDevicePanel() {
  const view = document.querySelector('#backupView');
  if (!view || document.querySelector('#nativeDevicePanel')) return;
  const panel = el(panelHtml());
  view.prepend(panel);
  refreshPanel(panel);
  // Refresh whenever the Backup view is opened.
  document.querySelector('.nav-tab[data-view="backup"]')?.addEventListener('click', () => refreshPanel(panel));

  const run = async (button, task) => {
    button.disabled = true;
    try {
      await task();
    } catch (error) {
      nativeNotice(error.message);
    } finally {
      button.disabled = false;
      refreshPanel(panel);
    }
  };

  panel.querySelector('[data-action="backup"]').addEventListener('click', (e) => run(e.currentTarget, async () => {
    const info = await native.backupNow();
    nativeNotice(`Encrypted backup saved: ${info.file}`);
  }));
  panel.querySelector('[data-action="folder"]')?.addEventListener('click', (e) => run(e.currentTarget, () => native.openBackupFolder()));
  panel.querySelector('[data-action="share"]')?.addEventListener('click', (e) => run(e.currentTarget, () => native.shareLatestBackup()));
  panel.querySelector('[data-action="lock"]').addEventListener('click', (e) => run(e.currentTarget, async () => {
    await native.lock();
    window.location.reload();
  }));
  panel.querySelector('[data-action="forget"]').addEventListener('click', (e) => run(e.currentTarget, async () => {
    await native.forget();
    nativeNotice('F.A.M.E will ask for the passphrase next time.');
  }));

  const restoreForm = panel.querySelector('[data-form="restore"]');
  restoreForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const button = restoreForm.querySelector('button[type="submit"]');
    const file = restoreForm.file.files[0];
    if (!file) return;
    if (!window.confirm(`Replace all accounting data on this ${deviceWord} with "${file.name}"?`)) return;
    run(button, async () => {
      await native.restoreFromFile(file, restoreForm.passphrase.value, false, (p) => {
        button.textContent = `Restoring… ${Math.round(p * 100)}%`;
      });
      window.location.reload();
    }).finally(() => { button.textContent = 'Restore and replace'; });
  });

  const passForm = panel.querySelector('[data-form="passphrase"]');
  passForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (passForm.next.value.length < MIN_PASSPHRASE) return nativeNotice(`Use at least ${MIN_PASSPHRASE} characters.`);
    if (passForm.next.value !== passForm.confirm.value) return nativeNotice('The new passphrases do not match.');
    run(passForm.querySelector('button[type="submit"]'), async () => {
      await native.changePassphrase(passForm.old.value, passForm.next.value);
      passForm.reset();
      nativeNotice('Passphrase changed. A fresh backup was made with the new passphrase.');
    });
  });
}

/* ---------------- downloads on Android ---------------- */

// The Android WebView ignores <a download>. Exports (PDF, Excel, ZIP, JSON backups) are saved
// into Documents/FAME/Exports instead, with a button to open or share the file.
let downloadsInstalled = false;
function installDownloadHandling() {
  if (platform !== 'android' || downloadsInstalled) return;
  downloadsInstalled = true;
  const blobs = new Map();
  const originalCreate = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (object) => {
    const url = originalCreate(object);
    if (object instanceof Blob) {
      blobs.set(url, object);
      setTimeout(() => blobs.delete(url), 120000);
    }
    return url;
  };

  const mimeFor = (name, blob) => blob?.type || (name.endsWith('.pdf') ? 'application/pdf' : '');

  async function save(href, filename) {
    const name = filename || 'download';
    try {
      const blob = blobs.get(href) || await (await fetch(href)).blob();
      const saved = await native.saveExport(name, blob);
      const mime = mimeFor(name, blob);
      nativeNotice(`Saved to ${saved.where}`, mime === 'application/pdf'
        ? { label: 'Open', run: () => native.open(saved.path, mime) }
        : { label: 'Share', run: () => native.share(saved.path, mime) });
    } catch (error) {
      nativeNotice(`Could not save the file: ${error.message}`);
    }
  }

  const isDownload = (a) => a instanceof HTMLAnchorElement && a.hasAttribute('download') && /^(blob:|data:)/.test(a.href || '');
  const originalClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function click(...args) {
    if (isDownload(this)) return void save(this.href, this.getAttribute('download'));
    return originalClick.apply(this, args);
  };
  const originalDispatch = HTMLAnchorElement.prototype.dispatchEvent;
  HTMLAnchorElement.prototype.dispatchEvent = function dispatchEvent(event) {
    if (event?.type === 'click' && isDownload(this)) {
      save(this.href, this.getAttribute('download'));
      return false;
    }
    return originalDispatch.call(this, event);
  };
  document.addEventListener('click', (event) => {
    const a = event.target?.closest?.('a[download]');
    if (a && isDownload(a)) {
      event.preventDefault();
      save(a.href, a.getAttribute('download'));
    }
  }, true);
}
