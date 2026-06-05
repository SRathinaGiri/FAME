import sqlite3InitModule from './vendor/sqlite/index.mjs';

const SCHEMA_VERSION = 1;
let sqlite3;
let db;
let readyPromise;
let persistence = 'starting';
let mirrorToIndexedDb = false;

const TABLES = ['settings', 'accounts', 'vouchers', 'voucher_lines'];
const IDB_NAME = 'fame-sqlite-fallback';
const IDB_STORE = 'snapshots';
const IDB_KEY = 'latest';

const seedAccounts = [
  ['1000', 'Assets', 'asset', null, 'debit', 1],
  ['1100', 'Cash and Bank', 'asset', '1000', 'debit', 1],
  ['1110', 'Cash in Hand', 'asset', '1100', 'debit', 0],
  ['1120', 'Bank Accounts', 'asset', '1100', 'debit', 0],
  ['1200', 'Accounts Receivable', 'asset', '1000', 'debit', 0],
  ['1300', 'Inventory', 'asset', '1000', 'debit', 0],
  ['2000', 'Liabilities', 'liability', null, 'credit', 1],
  ['2100', 'Accounts Payable', 'liability', '2000', 'credit', 0],
  ['2200', 'Duties and Taxes Payable', 'liability', '2000', 'credit', 0],
  ['3000', 'Equity', 'equity', null, 'credit', 1],
  ['3100', 'Owner Capital', 'equity', '3000', 'credit', 0],
  ['3200', 'Retained Earnings', 'equity', '3000', 'credit', 0],
  ['4000', 'Income', 'income', null, 'credit', 1],
  ['4100', 'Sales', 'income', '4000', 'credit', 0],
  ['4200', 'Service Income', 'income', '4000', 'credit', 0],
  ['5000', 'Expenses', 'expense', null, 'debit', 1],
  ['5100', 'Purchases', 'expense', '5000', 'debit', 0],
  ['5200', 'Operating Expenses', 'expense', '5000', 'debit', 1],
  ['5210', 'Rent Expense', 'expense', '5200', 'debit', 0],
  ['5220', 'Salary Expense', 'expense', '5200', 'debit', 0]
];

function exec(sql, bind) {
  db.exec({ sql, bind });
}

function all(sql, bind) {
  const resultRows = [];
  db.exec({ sql, bind, rowMode: 'object', resultRows });
  return resultRows;
}

function one(sql, bind) {
  return all(sql, bind)[0] || null;
}

function transaction(callback) {
  exec('BEGIN');
  try {
    const result = callback();
    exec('COMMIT');
    return result;
  } catch (error) {
    exec('ROLLBACK');
    throw error;
  }
}

function openSnapshotStore() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(IDB_STORE);
    };
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

async function persistIfMirrored() {
  if (mirrorToIndexedDb) {
    await writeIndexedDbSnapshot(exportData());
  }
}

function ensureSchema() {
  exec('PRAGMA foreign_keys = ON');
  exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('asset','liability','equity','income','expense')),
      parent_id TEXT REFERENCES accounts(id) ON DELETE RESTRICT,
      normal_side TEXT NOT NULL CHECK (normal_side IN ('debit','credit')),
      is_group INTEGER NOT NULL DEFAULT 0 CHECK (is_group IN (0,1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS vouchers (
      id TEXT PRIMARY KEY,
      voucher_no TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK (type IN ('receipt','payment','purchase','sales','journal')),
      voucher_date TEXT NOT NULL,
      reference_no TEXT,
      invoice_no TEXT,
      invoice_date TEXT,
      narration TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS voucher_lines (
      id TEXT PRIMARY KEY,
      voucher_id TEXT NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
      description TEXT,
      debit_minor INTEGER NOT NULL DEFAULT 0 CHECK (debit_minor >= 0),
      credit_minor INTEGER NOT NULL DEFAULT 0 CHECK (credit_minor >= 0),
      sort_order INTEGER NOT NULL DEFAULT 0,
      CHECK ((debit_minor = 0 AND credit_minor > 0) OR (credit_minor = 0 AND debit_minor > 0))
    );
    CREATE INDEX IF NOT EXISTS idx_accounts_parent ON accounts(parent_id);
    CREATE INDEX IF NOT EXISTS idx_voucher_lines_voucher ON voucher_lines(voucher_id);
    CREATE INDEX IF NOT EXISTS idx_voucher_lines_account ON voucher_lines(account_id);
  `);

  const existing = one('SELECT value FROM settings WHERE key = ?', ['schema_version']);
  if (!existing) {
    transaction(() => {
      exec('INSERT INTO settings (key, value) VALUES (?, ?)', ['schema_version', String(SCHEMA_VERSION)]);
      for (const [code, name, type, parentCode, normalSide, isGroup] of seedAccounts) {
        const parent = parentCode ? one('SELECT id FROM accounts WHERE code = ?', [parentCode]) : null;
        exec(
          `INSERT INTO accounts (id, code, name, type, parent_id, normal_side, is_group)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [crypto.randomUUID(), code, name, type, parent?.id || null, normalSide, isGroup]
        );
      }
    });
  }
}

async function init() {
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    const isGitHubPagesBuild = self.location.pathname.includes('/FAME/');
    sqlite3 = await sqlite3InitModule({
      disable: {
        vfs: {
          opfs: isGitHubPagesBuild,
          'opfs-sahpool': true,
          'opfs-wl': true
        }
      },
      print: () => {},
      printErr: (...args) => console.error(...args)
    });
    if (!isGitHubPagesBuild && 'opfs' in sqlite3) {
      db = new sqlite3.oo1.OpfsDb('/fame.sqlite3', 'ct');
      persistence = 'OPFS persistent SQLite database';
    } else {
      db = new sqlite3.oo1.DB('/fame.sqlite3', 'ct');
      mirrorToIndexedDb = true;
      persistence = isGitHubPagesBuild
        ? 'IndexedDB-mirrored SQLite fallback for GitHub Pages'
        : 'IndexedDB-mirrored SQLite fallback; OPFS unavailable';
    }
    ensureSchema();
    if (mirrorToIndexedDb) {
      const snapshot = await readIndexedDbSnapshot();
      if (snapshot?.app === 'F.A.M.E' && snapshot.schemaVersion === SCHEMA_VERSION) {
        replaceData(snapshot);
      } else {
        await persistIfMirrored();
      }
    }
    return { sqliteVersion: sqlite3.version.libVersion, persistence };
  })();
  return readyPromise;
}

function listAccounts() {
  return all(`
    SELECT id, code, name, type, parent_id AS parentId, normal_side AS normalSide,
           is_group AS isGroup, created_at AS createdAt, updated_at AS updatedAt
    FROM accounts
    ORDER BY code
  `);
}

async function createAccount(account) {
  const code = String(account.code || '').trim();
  const name = String(account.name || '').trim();
  if (!code || !name) throw new Error('Account code and name are required.');
  transaction(() => {
    exec(
      `INSERT INTO accounts (id, code, name, type, parent_id, normal_side, is_group)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        code,
        name,
        account.type,
        account.parentId || null,
        account.normalSide,
        account.isGroup ? 1 : 0
      ]
    );
  });
  await persistIfMirrored();
  return listAccounts();
}

function nextVoucherNo(type, date) {
  const yyyymm = String(date || '').slice(0, 7).replace('-', '');
  const prefix = `${type.toUpperCase().slice(0, 3)}-${yyyymm}`;
  const row = one('SELECT COUNT(*) AS count FROM vouchers WHERE voucher_no LIKE ?', [`${prefix}-%`]);
  return `${prefix}-${String((row?.count || 0) + 1).padStart(4, '0')}`;
}

async function saveVoucher(voucher) {
  const lines = (voucher.lines || []).filter((line) => line.accountId);
  if (!voucher.type || !voucher.voucherDate) throw new Error('Voucher type and date are required.');
  if (lines.length < 2) throw new Error('A voucher needs at least two posting lines.');
  const debit = lines.reduce((sum, line) => sum + Number(line.debitMinor || 0), 0);
  const credit = lines.reduce((sum, line) => sum + Number(line.creditMinor || 0), 0);
  if (debit <= 0 || debit !== credit) throw new Error('Debit and credit totals must match.');
  const id = crypto.randomUUID();
  const voucherNo = nextVoucherNo(voucher.type, voucher.voucherDate);
  transaction(() => {
    exec(
      `INSERT INTO vouchers
       (id, voucher_no, type, voucher_date, reference_no, invoice_no, invoice_date, narration)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        voucherNo,
        voucher.type,
        voucher.voucherDate,
        voucher.referenceNo || null,
        voucher.invoiceNo || null,
        voucher.invoiceDate || null,
        voucher.narration || null
      ]
    );
    lines.forEach((line, index) => {
      exec(
        `INSERT INTO voucher_lines
         (id, voucher_id, account_id, description, debit_minor, credit_minor, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          id,
          line.accountId,
          line.description || null,
          Number(line.debitMinor || 0),
          Number(line.creditMinor || 0),
          index
        ]
      );
    });
  });
  await persistIfMirrored();
  return { id, voucherNo };
}

function getRecentVouchers() {
  return all(`
    SELECT v.id, v.voucher_no AS voucherNo, v.type, v.voucher_date AS voucherDate,
           v.invoice_no AS invoiceNo, v.narration,
           SUM(vl.debit_minor) AS amountMinor
    FROM vouchers v
    JOIN voucher_lines vl ON vl.voucher_id = v.id
    GROUP BY v.id
    ORDER BY v.voucher_date DESC, v.created_at DESC
    LIMIT 12
  `);
}

function getTrialBalance() {
  return all(`
    SELECT a.id, a.code, a.name, a.type,
           COALESCE(SUM(vl.debit_minor), 0) AS debitMinor,
           COALESCE(SUM(vl.credit_minor), 0) AS creditMinor
    FROM accounts a
    LEFT JOIN voucher_lines vl ON vl.account_id = a.id
    GROUP BY a.id
    HAVING debitMinor <> 0 OR creditMinor <> 0
    ORDER BY a.code
  `);
}

function getSnapshot() {
  const accounts = listAccounts();
  const recent = getRecentVouchers();
  const trialBalance = getTrialBalance();
  return {
    meta: { persistence, sqliteVersion: sqlite3.version.libVersion },
    accounts,
    recent,
    trialBalance
  };
}

function exportData() {
  const data = {};
  for (const table of TABLES) {
    data[table] = all(`SELECT * FROM ${table} ORDER BY rowid`);
  }
  return {
    app: 'F.A.M.E',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data
  };
}

function replaceData(backup) {
  if (!backup || backup.app !== 'F.A.M.E' || backup.schemaVersion !== SCHEMA_VERSION || !backup.data) {
    throw new Error('Backup format or schema version is not compatible.');
  }
  exec('PRAGMA foreign_keys = OFF');
  try {
    transaction(() => {
      exec('DELETE FROM voucher_lines');
      exec('DELETE FROM vouchers');
      exec('DELETE FROM accounts');
      exec('DELETE FROM settings');
      for (const row of backup.data.settings || []) {
        exec('INSERT INTO settings (key, value) VALUES (?, ?)', [row.key, row.value]);
      }
      for (const row of backup.data.accounts || []) {
        exec(
          `INSERT INTO accounts
           (id, code, name, type, parent_id, normal_side, is_group, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.id,
            row.code,
            row.name,
            row.type,
            row.parent_id,
            row.normal_side,
            row.is_group,
            row.created_at,
            row.updated_at
          ]
        );
      }
      for (const row of backup.data.vouchers || []) {
        exec(
          `INSERT INTO vouchers
           (id, voucher_no, type, voucher_date, reference_no, invoice_no, invoice_date, narration, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.id,
            row.voucher_no,
            row.type,
            row.voucher_date,
            row.reference_no,
            row.invoice_no,
            row.invoice_date,
            row.narration,
            row.created_at,
            row.updated_at
          ]
        );
      }
      for (const row of backup.data.voucher_lines || []) {
        exec(
          `INSERT INTO voucher_lines
           (id, voucher_id, account_id, description, debit_minor, credit_minor, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            row.id,
            row.voucher_id,
            row.account_id,
            row.description,
            row.debit_minor,
            row.credit_minor,
            row.sort_order
          ]
        );
      }
    });
  } finally {
    exec('PRAGMA foreign_keys = ON');
  }
}

async function importData(backup) {
  replaceData(backup);
  await persistIfMirrored();
  return getSnapshot();
}

const handlers = {
  init,
  snapshot: getSnapshot,
  createAccount,
  saveVoucher,
  exportData,
  importData
};

self.addEventListener('message', async (event) => {
  const { id, type, payload } = event.data;
  try {
    await init();
    const handler = handlers[type];
    if (!handler) throw new Error(`Unknown database action: ${type}`);
    const result = await handler(payload);
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    console.error(error);
    self.postMessage({ id, ok: false, error: error.message || String(error) });
  }
});
