import sqlite3InitModule from './vendor/sqlite/index.mjs';

const SCHEMA_VERSION = 3;
const DB_FILE = '/fame-v3.sqlite3';
const IDB_NAME = 'fame-sqlite-fallback-v3';
const IDB_STORE = 'snapshots';
const IDB_KEY = 'latest';
const TABLES = [
  'settings',
  'account_types',
  'head_accounts',
  'subhead_accounts',
  'accounts',
  'tags',
  'coa_tags',
  'vouchers',
  'voucher_lines',
  'voucher_tags'
];

let sqlite3;
let db;
let readyPromise;
let persistence = 'starting';
let mirrorToIndexedDb = false;

const seedTypes = [
  ['asset', 'Assets', 'debit', 1000],
  ['liability', 'Liabilities', 'credit', 2000],
  ['equity', 'Equity', 'credit', 3000],
  ['income', 'Income', 'credit', 4000],
  ['expense', 'Expenses', 'debit', 5000]
];

const seedHeads = [
  ['1100', 'Cash and Bank', 'asset'],
  ['1200', 'Receivables', 'asset'],
  ['1300', 'Inventory', 'asset'],
  ['2100', 'Payables', 'liability'],
  ['2200', 'Duties and Taxes', 'liability'],
  ['3100', 'Capital', 'equity'],
  ['3200', 'Retained Earnings', 'equity'],
  ['4100', 'Sales', 'income'],
  ['4200', 'Service Income', 'income'],
  ['5100', 'Purchases', 'expense'],
  ['5200', 'Operating Expenses', 'expense']
];

const seedSubheads = [
  ['1110', 'Cash', '1100'],
  ['1120', 'Bank', '1100'],
  ['1210', 'Accounts Receivable', '1200'],
  ['1310', 'Stock', '1300'],
  ['2110', 'Accounts Payable', '2100'],
  ['2210', 'Duties and Taxes Payable', '2200'],
  ['3110', 'Owner Capital', '3100'],
  ['3210', 'Retained Earnings', '3200'],
  ['4110', 'Product Sales', '4100'],
  ['4210', 'Service Income', '4200'],
  ['5110', 'Purchase Accounts', '5100'],
  ['5210', 'Rent', '5200'],
  ['5220', 'Salary', '5200']
];

const seedAccounts = [
  ['1111', 'Cash in Hand', '1110'],
  ['1121', 'Bank Account', '1120'],
  ['1211', 'General Customer', '1210'],
  ['1311', 'Inventory Stock', '1310'],
  ['2111', 'General Supplier', '2110'],
  ['2211', 'Tax Payable', '2210'],
  ['3111', 'Owner Capital', '3110'],
  ['3211', 'Retained Earnings', '3210'],
  ['4111', 'Sales', '4110'],
  ['4211', 'Service Income', '4210'],
  ['5111', 'Purchases', '5110'],
  ['5211', 'Rent Expense', '5210'],
  ['5221', 'Salary Expense', '5220']
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

async function persistIfMirrored() {
  if (mirrorToIndexedDb) await writeIndexedDbSnapshot(exportData());
}

function ensureSchema() {
  exec('PRAGMA foreign_keys = ON');
  exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS account_types (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      normal_side TEXT NOT NULL CHECK (normal_side IN ('debit','credit')),
      base_code INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS head_accounts (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      type_id TEXT NOT NULL REFERENCES account_types(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS subhead_accounts (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      head_id TEXT NOT NULL REFERENCES head_accounts(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      subhead_id TEXT NOT NULL REFERENCES subhead_accounts(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      color TEXT NOT NULL DEFAULT '#247d68',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS coa_tags (
      entity_type TEXT NOT NULL CHECK (entity_type IN ('head','subhead','account')),
      entity_id TEXT NOT NULL,
      tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (entity_type, entity_id, tag_id)
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
    CREATE TABLE IF NOT EXISTS voucher_tags (
      voucher_id TEXT NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (voucher_id, tag_id)
    );
    CREATE INDEX IF NOT EXISTS idx_heads_type ON head_accounts(type_id);
    CREATE INDEX IF NOT EXISTS idx_subheads_head ON subhead_accounts(head_id);
    CREATE INDEX IF NOT EXISTS idx_accounts_subhead ON accounts(subhead_id);
    CREATE INDEX IF NOT EXISTS idx_voucher_lines_voucher ON voucher_lines(voucher_id);
    CREATE INDEX IF NOT EXISTS idx_voucher_lines_account ON voucher_lines(account_id);
  `);

  const existing = one('SELECT value FROM settings WHERE key = ?', ['schema_version']);
  if (!existing) seedDatabase();
}

function seedDatabase() {
  transaction(() => {
    exec('INSERT INTO settings (key, value) VALUES (?, ?)', ['schema_version', String(SCHEMA_VERSION)]);
    for (const [id, name, normalSide, baseCode] of seedTypes) {
      exec('INSERT INTO account_types (id, name, normal_side, base_code) VALUES (?, ?, ?, ?)', [id, name, normalSide, baseCode]);
    }
    for (const [code, name, typeId] of seedHeads) {
      exec('INSERT INTO head_accounts (id, code, name, type_id) VALUES (?, ?, ?, ?)', [crypto.randomUUID(), code, name, typeId]);
    }
    for (const [code, name, headCode] of seedSubheads) {
      const head = one('SELECT id FROM head_accounts WHERE code = ?', [headCode]);
      exec('INSERT INTO subhead_accounts (id, code, name, head_id) VALUES (?, ?, ?, ?)', [crypto.randomUUID(), code, name, head.id]);
    }
    for (const [code, name, subheadCode] of seedAccounts) {
      const subhead = one('SELECT id FROM subhead_accounts WHERE code = ?', [subheadCode]);
      exec('INSERT INTO accounts (id, code, name, subhead_id) VALUES (?, ?, ?, ?)', [crypto.randomUUID(), code, name, subhead.id]);
    }
  });
}

async function init() {
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    const isGitHubPagesBuild = self.location.pathname.includes('/FAME/');
    sqlite3 = await sqlite3InitModule({
      disable: { vfs: { opfs: isGitHubPagesBuild, 'opfs-sahpool': true, 'opfs-wl': true } },
      print: () => {},
      printErr: (...args) => console.error(...args)
    });
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
    ensureSchema();
    if (mirrorToIndexedDb) {
      const snapshot = await readIndexedDbSnapshot();
      if (snapshot?.app === 'F.A.M.E' && snapshot.schemaVersion === SCHEMA_VERSION) replaceData(snapshot);
      else await persistIfMirrored();
    }
    return { sqliteVersion: sqlite3.version.libVersion, persistence };
  })();
  return readyPromise;
}

function listAccountTypes() {
  return all('SELECT id, name, normal_side AS normalSide, base_code AS baseCode FROM account_types ORDER BY base_code');
}

function listHeads() {
  return all(`
    SELECT h.id, h.code, h.name, h.type_id AS typeId, t.name AS typeName,
           t.normal_side AS normalSide, h.created_at AS createdAt, h.updated_at AS updatedAt
    FROM head_accounts h
    JOIN account_types t ON t.id = h.type_id
    ORDER BY t.base_code, h.code
  `);
}

function listSubheads() {
  return all(`
    SELECT s.id, s.code, s.name, s.head_id AS headId, h.code AS headCode, h.name AS headName,
           h.type_id AS typeId, t.name AS typeName, t.normal_side AS normalSide,
           s.created_at AS createdAt, s.updated_at AS updatedAt
    FROM subhead_accounts s
    JOIN head_accounts h ON h.id = s.head_id
    JOIN account_types t ON t.id = h.type_id
    ORDER BY t.base_code, h.code, s.code
  `);
}

function listPostingAccounts() {
  return all(`
    SELECT a.id, a.code, a.name, a.subhead_id AS subheadId, s.code AS subheadCode, s.name AS subheadName,
           h.id AS headId, h.code AS headCode, h.name AS headName,
           h.type_id AS typeId, t.name AS typeName, t.normal_side AS normalSide,
           a.created_at AS createdAt, a.updated_at AS updatedAt,
           EXISTS(SELECT 1 FROM voucher_lines vl WHERE vl.account_id = a.id) AS hasTransactions
    FROM accounts a
    JOIN subhead_accounts s ON s.id = a.subhead_id
    JOIN head_accounts h ON h.id = s.head_id
    JOIN account_types t ON t.id = h.type_id
    ORDER BY t.base_code, h.code, s.code, a.code
  `);
}

function listCoaRows() {
  const rows = [];
  for (const type of listAccountTypes()) {
    rows.push({ id: type.id, level: 'type', code: String(type.baseCode), name: type.name, typeId: type.id, typeName: type.name, normalSide: type.normalSide });
    for (const head of listHeads().filter((item) => item.typeId === type.id)) {
      rows.push({ ...head, level: 'head', parentId: type.id, isHeader: true });
      for (const subhead of listSubheads().filter((item) => item.headId === head.id)) {
        rows.push({ ...subhead, level: 'subhead', parentId: head.id, isHeader: true });
        for (const account of listPostingAccounts().filter((item) => item.subheadId === subhead.id)) {
          rows.push({ ...account, level: 'account', parentId: subhead.id, isHeader: false });
        }
      }
    }
  }
  return rows;
}

function listTags() {
  return all('SELECT id, name, color, created_at AS createdAt, updated_at AS updatedAt FROM tags ORDER BY name COLLATE NOCASE');
}

function getTagLinks(entityType) {
  const rows = all('SELECT entity_id AS entityId, tag_id AS tagId FROM coa_tags WHERE entity_type = ? ORDER BY entity_id, tag_id', [entityType]);
  return rows.reduce((map, row) => {
    if (!map[row.entityId]) map[row.entityId] = [];
    map[row.entityId].push(row.tagId);
    return map;
  }, {});
}

function getVoucherTagLinks() {
  const rows = all('SELECT voucher_id AS voucherId, tag_id AS tagId FROM voucher_tags ORDER BY voucher_id, tag_id');
  return rows.reduce((map, row) => {
    if (!map[row.voucherId]) map[row.voucherId] = [];
    map[row.voucherId].push(row.tagId);
    return map;
  }, {});
}

function replaceCoaTagLinks(entityType, entityId, tagIds = []) {
  exec('DELETE FROM coa_tags WHERE entity_type = ? AND entity_id = ?', [entityType, entityId]);
  for (const tagId of [...new Set(tagIds.filter(Boolean))]) {
    exec('INSERT INTO coa_tags (entity_type, entity_id, tag_id) VALUES (?, ?, ?)', [entityType, entityId, tagId]);
  }
}

function replaceVoucherTagLinks(voucherId, tagIds = []) {
  exec('DELETE FROM voucher_tags WHERE voucher_id = ?', [voucherId]);
  for (const tagId of [...new Set(tagIds.filter(Boolean))]) {
    exec('INSERT INTO voucher_tags (voucher_id, tag_id) VALUES (?, ?)', [voucherId, tagId]);
  }
}

function nextCode({ level, typeId, headId, subheadId }) {
  let codes = [];
  let fallback = 1000;
  if (level === 'head') {
    const type = one('SELECT base_code AS baseCode FROM account_types WHERE id = ?', [typeId]);
    fallback = type?.baseCode || 1000;
    codes = all('SELECT code FROM head_accounts WHERE type_id = ?', [typeId]);
    const max = Math.max(fallback, ...codes.map((row) => Number(row.code)).filter(Number.isFinite));
    return String(max === fallback && !codes.length ? fallback : max + 100);
  }
  if (level === 'subhead') {
    const head = one('SELECT code FROM head_accounts WHERE id = ?', [headId]);
    fallback = Number(head?.code || 1000) + 10;
    codes = all('SELECT code FROM subhead_accounts WHERE head_id = ?', [headId]);
    const max = Math.max(fallback - 10, ...codes.map((row) => Number(row.code)).filter(Number.isFinite));
    return String(max + 10);
  }
  const subhead = one('SELECT code FROM subhead_accounts WHERE id = ?', [subheadId]);
  fallback = Number(subhead?.code || 1000) + 1;
  codes = all('SELECT code FROM accounts WHERE subhead_id = ?', [subheadId]);
  const max = Math.max(fallback - 1, ...codes.map((row) => Number(row.code)).filter(Number.isFinite));
  return String(max + 1);
}

async function suggestCoaCode(payload) {
  return { code: nextCode(payload || {}) };
}

async function saveCoaItem(item) {
  const level = item.level;
  const code = String(item.code || '').trim();
  const name = String(item.name || '').trim();
  if (!code || !name) throw new Error('Code and name are required.');
  transaction(() => {
    if (level === 'head') {
      if (!item.typeId) throw new Error('Account type is required.');
      if (item.id) {
        const current = one('SELECT type_id AS typeId FROM head_accounts WHERE id = ?', [item.id]);
        const hasTx = one(`
          SELECT 1 AS yes
          FROM voucher_lines vl
          JOIN accounts a ON a.id = vl.account_id
          JOIN subhead_accounts s ON s.id = a.subhead_id
          WHERE s.head_id = ?
          LIMIT 1
        `, [item.id]);
        if (hasTx && current?.typeId !== item.typeId) throw new Error('Cannot change the account type for a head account with transactions.');
        exec('UPDATE head_accounts SET code = ?, name = ?, type_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [code, name, item.typeId, item.id]);
      }
      else item.id = crypto.randomUUID(), exec('INSERT INTO head_accounts (id, code, name, type_id) VALUES (?, ?, ?, ?)', [item.id, code, name, item.typeId]);
      replaceCoaTagLinks('head', item.id, item.tagIds || []);
    } else if (level === 'subhead') {
      if (!item.headId) throw new Error('Head account is required.');
      if (item.id) {
        const current = one('SELECT head_id AS headId FROM subhead_accounts WHERE id = ?', [item.id]);
        const hasTx = one(`
          SELECT 1 AS yes
          FROM voucher_lines vl
          JOIN accounts a ON a.id = vl.account_id
          WHERE a.subhead_id = ?
          LIMIT 1
        `, [item.id]);
        if (hasTx && current?.headId !== item.headId) throw new Error('Cannot change the head account for a sub-head with transactions.');
        exec('UPDATE subhead_accounts SET code = ?, name = ?, head_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [code, name, item.headId, item.id]);
      }
      else item.id = crypto.randomUUID(), exec('INSERT INTO subhead_accounts (id, code, name, head_id) VALUES (?, ?, ?, ?)', [item.id, code, name, item.headId]);
      replaceCoaTagLinks('subhead', item.id, item.tagIds || []);
    } else if (level === 'account') {
      if (!item.subheadId) throw new Error('Sub-head account is required.');
      const hasTx = item.id ? one('SELECT 1 AS yes FROM voucher_lines WHERE account_id = ? LIMIT 1', [item.id]) : null;
      if (item.id) {
        if (hasTx) exec('UPDATE accounts SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [name, item.id]);
        else exec('UPDATE accounts SET code = ?, name = ?, subhead_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [code, name, item.subheadId, item.id]);
      } else {
        item.id = crypto.randomUUID();
        exec('INSERT INTO accounts (id, code, name, subhead_id) VALUES (?, ?, ?, ?)', [item.id, code, name, item.subheadId]);
      }
      replaceCoaTagLinks('account', item.id, item.tagIds || []);
    } else {
      throw new Error('Unknown CoA master level.');
    }
  });
  await persistIfMirrored();
  return getSnapshot();
}

async function deleteCoaItem({ level, id }) {
  if (!id) throw new Error('Select an item to delete.');
  transaction(() => {
    if (level === 'head') {
      const used = one('SELECT 1 AS yes FROM subhead_accounts WHERE head_id = ? LIMIT 1', [id]);
      if (used) throw new Error('Cannot delete a head account with sub-head accounts.');
      replaceCoaTagLinks('head', id, []);
      exec('DELETE FROM head_accounts WHERE id = ?', [id]);
    } else if (level === 'subhead') {
      const used = one('SELECT 1 AS yes FROM accounts WHERE subhead_id = ? LIMIT 1', [id]);
      if (used) throw new Error('Cannot delete a sub-head account with accounts.');
      replaceCoaTagLinks('subhead', id, []);
      exec('DELETE FROM subhead_accounts WHERE id = ?', [id]);
    } else if (level === 'account') {
      const used = one('SELECT 1 AS yes FROM voucher_lines WHERE account_id = ? LIMIT 1', [id]);
      if (used) throw new Error('Cannot delete an account with transactions.');
      replaceCoaTagLinks('account', id, []);
      exec('DELETE FROM accounts WHERE id = ?', [id]);
    }
  });
  await persistIfMirrored();
  return getSnapshot();
}

async function createTag(tag) {
  const name = String(tag.name || '').trim();
  const color = String(tag.color || '#247d68').trim() || '#247d68';
  if (!name) throw new Error('Tag name is required.');
  transaction(() => exec('INSERT INTO tags (id, name, color) VALUES (?, ?, ?)', [crypto.randomUUID(), name, color]));
  await persistIfMirrored();
  return listTags();
}

async function setCoaTags({ entityType, entityId, tagIds }) {
  if (!entityType || !entityId) throw new Error('Select a CoA item to tag.');
  transaction(() => replaceCoaTagLinks(entityType, entityId, tagIds));
  await persistIfMirrored();
  return getSnapshot();
}

async function setVoucherTags({ voucherId, tagIds }) {
  if (!voucherId) throw new Error('Select a voucher to tag.');
  transaction(() => replaceVoucherTagLinks(voucherId, tagIds));
  await persistIfMirrored();
  return getSnapshot();
}

function accountMatchesFilter(account, filter) {
  if (!filter || filter === 'all') return true;
  if (filter === 'cashBank') return account.headCode === '1100';
  if (filter === 'purchase') return account.typeId === 'expense' && account.headCode === '5100';
  if (filter === 'sales') return account.typeId === 'income' && ['4100', '4200'].includes(account.headCode);
  return true;
}

function nextVoucherNo(type, date) {
  const yyyymm = String(date || '').slice(0, 7).replace('-', '');
  const prefix = `${type.toUpperCase().slice(0, 3)}-${yyyymm}`;
  const row = one('SELECT COUNT(*) AS count FROM vouchers WHERE voucher_no LIKE ?', [`${prefix}-%`]);
  return `${prefix}-${String((row?.count || 0) + 1).padStart(4, '0')}`;
}

function getVoucherLinesPayload(voucherId) {
  return all(`
    SELECT vl.id, vl.account_id AS accountId, a.code AS accountCode, a.name AS accountName,
           vl.description, vl.debit_minor AS debitMinor, vl.credit_minor AS creditMinor, vl.sort_order AS sortOrder
    FROM voucher_lines vl
    JOIN accounts a ON a.id = vl.account_id
    WHERE vl.voucher_id = ?
    ORDER BY vl.sort_order
  `, [voucherId]);
}

async function saveVoucher(voucher) {
  const lines = (voucher.lines || []).filter((line) => line.accountId);
  if (!voucher.type || !voucher.voucherDate) throw new Error('Voucher type and date are required.');
  if (lines.length < 2) throw new Error('A voucher needs at least two posting lines.');
  const debit = lines.reduce((sum, line) => sum + Number(line.debitMinor || 0), 0);
  const credit = lines.reduce((sum, line) => sum + Number(line.creditMinor || 0), 0);
  if (debit <= 0 || debit !== credit) throw new Error('Debit and credit totals must match.');
  let id = voucher.id;
  transaction(() => {
    if (id) {
      exec(
        `UPDATE vouchers
         SET type = ?, voucher_date = ?, reference_no = ?, invoice_no = ?, invoice_date = ?, narration = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [voucher.type, voucher.voucherDate, voucher.referenceNo || null, voucher.invoiceNo || null, voucher.invoiceDate || null, voucher.narration || null, id]
      );
      exec('DELETE FROM voucher_lines WHERE voucher_id = ?', [id]);
    } else {
      id = crypto.randomUUID();
      exec(
        `INSERT INTO vouchers (id, voucher_no, type, voucher_date, reference_no, invoice_no, invoice_date, narration)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, nextVoucherNo(voucher.type, voucher.voucherDate), voucher.type, voucher.voucherDate, voucher.referenceNo || null, voucher.invoiceNo || null, voucher.invoiceDate || null, voucher.narration || null]
      );
    }
    lines.forEach((line, index) => {
      exec(
        `INSERT INTO voucher_lines (id, voucher_id, account_id, description, debit_minor, credit_minor, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [crypto.randomUUID(), id, line.accountId, line.description || null, Number(line.debitMinor || 0), Number(line.creditMinor || 0), index]
      );
    });
    replaceVoucherTagLinks(id, voucher.tagIds || []);
  });
  await persistIfMirrored();
  return { id };
}

async function deleteVoucher({ id }) {
  if (!id) throw new Error('Select a voucher to delete.');
  transaction(() => exec('DELETE FROM vouchers WHERE id = ?', [id]));
  await persistIfMirrored();
  return getSnapshot();
}

function getRecentVouchers() {
  return all(`
    SELECT v.id, v.voucher_no AS voucherNo, v.type, v.voucher_date AS voucherDate,
           v.invoice_no AS invoiceNo, v.narration, SUM(vl.debit_minor) AS amountMinor
    FROM vouchers v
    JOIN voucher_lines vl ON vl.voucher_id = v.id
    GROUP BY v.id
    ORDER BY v.voucher_date DESC, v.created_at DESC
    LIMIT 12
  `);
}

function getVoucherList() {
  return all(`
    SELECT v.id, v.voucher_no AS voucherNo, v.type, v.voucher_date AS voucherDate,
           v.reference_no AS referenceNo, v.invoice_no AS invoiceNo, v.invoice_date AS invoiceDate,
           v.narration, SUM(vl.debit_minor) AS amountMinor
    FROM vouchers v
    JOIN voucher_lines vl ON vl.voucher_id = v.id
    GROUP BY v.id
    ORDER BY v.voucher_date DESC, v.created_at DESC
    LIMIT 500
  `).map((voucher) => ({ ...voucher, lines: getVoucherLinesPayload(voucher.id) }));
}

function getTrialBalance() {
  return all(`
    SELECT a.id, a.code, a.name,
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
  const postingAccounts = listPostingAccounts();
  return {
    meta: { persistence, sqliteVersion: sqlite3.version.libVersion, schemaVersion: SCHEMA_VERSION },
    accountTypes: listAccountTypes(),
    heads: listHeads(),
    subheads: listSubheads(),
    accounts: postingAccounts,
    coaRows: listCoaRows(),
    tags: listTags(),
    coaTags: {
      head: getTagLinks('head'),
      subhead: getTagLinks('subhead'),
      account: getTagLinks('account')
    },
    voucherTags: getVoucherTagLinks(),
    recent: getRecentVouchers(),
    vouchers: getVoucherList(),
    trialBalance: getTrialBalance()
  };
}

function exportData() {
  const data = {};
  for (const table of TABLES) data[table] = all(`SELECT * FROM ${table} ORDER BY rowid`);
  return { app: 'F.A.M.E', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data };
}

function replaceData(backup) {
  if (!backup || backup.app !== 'F.A.M.E' || backup.schemaVersion !== SCHEMA_VERSION || !backup.data) {
    throw new Error('Backup format or schema version is not compatible with this build.');
  }
  exec('PRAGMA foreign_keys = OFF');
  try {
    transaction(() => {
      for (const table of [...TABLES].reverse()) exec(`DELETE FROM ${table}`);
      for (const row of backup.data.settings || []) exec('INSERT INTO settings (key, value) VALUES (?, ?)', [row.key, row.value]);
      for (const row of backup.data.account_types || []) exec('INSERT INTO account_types (id, name, normal_side, base_code) VALUES (?, ?, ?, ?)', [row.id, row.name, row.normal_side, row.base_code]);
      for (const row of backup.data.head_accounts || []) exec('INSERT INTO head_accounts (id, code, name, type_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [row.id, row.code, row.name, row.type_id, row.created_at, row.updated_at]);
      for (const row of backup.data.subhead_accounts || []) exec('INSERT INTO subhead_accounts (id, code, name, head_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [row.id, row.code, row.name, row.head_id, row.created_at, row.updated_at]);
      for (const row of backup.data.accounts || []) exec('INSERT INTO accounts (id, code, name, subhead_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [row.id, row.code, row.name, row.subhead_id, row.created_at, row.updated_at]);
      for (const row of backup.data.tags || []) exec('INSERT INTO tags (id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [row.id, row.name, row.color, row.created_at, row.updated_at]);
      for (const row of backup.data.coa_tags || []) exec('INSERT INTO coa_tags (entity_type, entity_id, tag_id) VALUES (?, ?, ?)', [row.entity_type, row.entity_id, row.tag_id]);
      for (const row of backup.data.vouchers || []) exec('INSERT INTO vouchers (id, voucher_no, type, voucher_date, reference_no, invoice_no, invoice_date, narration, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [row.id, row.voucher_no, row.type, row.voucher_date, row.reference_no, row.invoice_no, row.invoice_date, row.narration, row.created_at, row.updated_at]);
      for (const row of backup.data.voucher_lines || []) exec('INSERT INTO voucher_lines (id, voucher_id, account_id, description, debit_minor, credit_minor, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)', [row.id, row.voucher_id, row.account_id, row.description, row.debit_minor, row.credit_minor, row.sort_order]);
      for (const row of backup.data.voucher_tags || []) exec('INSERT INTO voucher_tags (voucher_id, tag_id) VALUES (?, ?)', [row.voucher_id, row.tag_id]);
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
  suggestCoaCode,
  saveCoaItem,
  deleteCoaItem,
  createTag,
  setCoaTags,
  setVoucherTags,
  saveVoucher,
  deleteVoucher,
  exportData,
  importData
};

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
