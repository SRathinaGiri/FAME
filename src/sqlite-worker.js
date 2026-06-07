import sqlite3InitModule from './vendor/sqlite/index.mjs';

const SCHEMA_VERSION = 6;
const DB_FILE = '/fame-v6.sqlite3';
const IDB_NAME = 'fame-sqlite-fallback-v6';
const IDB_STORE = 'snapshots';
const IDB_KEY = 'latest';
const TABLES = [
  'settings',
  'account_types',
  'head_accounts',
  'subhead_accounts',
  'accounts',
  'company_master',
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
  ['asset', 'Assets', 'debit', 100000],
  ['liability', 'Liabilities', 'credit', 200000],
  ['equity', 'Equity', 'credit', 300000],
  ['income', 'Income', 'credit', 400000],
  ['expense', 'Expenses', 'debit', 500000]
];

const seedHeads = [
  ['101000', 'Cash and Bank', 'asset'],
  ['102000', 'Receivables', 'asset'],
  ['103000', 'Inventory', 'asset'],
  ['201000', 'Payables', 'liability'],
  ['202000', 'Duties and Taxes', 'liability'],
  ['301000', 'Capital', 'equity'],
  ['302000', 'Accumulated Profit and Loss', 'equity'],
  ['401000', 'Sales', 'income'],
  ['402000', 'Service Income', 'income'],
  ['501000', 'Purchases', 'expense'],
  ['502000', 'Operating Expenses', 'expense']
];

const seedSubheads = [
  ['101100', 'Cash', '101000'],
  ['101200', 'Bank', '101000'],
  ['102100', 'Accounts Receivable', '102000'],
  ['103100', 'Stock', '103000'],
  ['201100', 'Accounts Payable', '201000'],
  ['202100', 'Duties and Taxes Payable', '202000'],
  ['301100', 'Owner Capital', '301000'],
  ['302100', 'Accumulated Profit and Loss', '302000'],
  ['401100', 'Product Sales', '401000'],
  ['402100', 'Service Income', '402000'],
  ['501100', 'Purchase Accounts', '501000'],
  ['502100', 'Rent', '502000'],
  ['502200', 'Salary', '502000']
];

const seedAccounts = [
  ['101101', 'Cash in Hand', '101100'],
  ['101201', 'Bank Account', '101200'],
  ['102101', 'General Customer', '102100'],
  ['103101', 'Inventory Stock', '103100'],
  ['201101', 'General Supplier', '201100'],
  ['202101', 'Tax Payable', '202100'],
  ['301101', 'Owner Capital', '301100'],
  ['302101', 'Accumulated Profit and Loss', '302100'],
  ['401101', 'Sales', '401100'],
  ['402101', 'Service Income', '402100'],
  ['501101', 'Purchases', '501100'],
  ['502101', 'Rent Expense', '502100'],
  ['502201', 'Salary Expense', '502200']
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
      is_personal INTEGER NOT NULL DEFAULT 0,
      gst_no TEXT,
      pan_no TEXT,
      registration_1 TEXT,
      registration_2 TEXT,
      registration_3 TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS company_master (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      name TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL DEFAULT '',
      country TEXT NOT NULL DEFAULT '',
      gst_no TEXT NOT NULL DEFAULT '',
      pan_no TEXT NOT NULL DEFAULT '',
      registration_1 TEXT NOT NULL DEFAULT '',
      registration_2 TEXT NOT NULL DEFAULT '',
      registration_3 TEXT NOT NULL DEFAULT '',
      financial_year_start TEXT NOT NULL DEFAULT '',
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
           a.is_personal AS isPersonal, a.gst_no AS gstNo, a.pan_no AS panNo,
           a.registration_1 AS registration1, a.registration_2 AS registration2,
           a.registration_3 AS registration3,
           (a.code = '302101') AS isSystem,
           a.created_at AS createdAt, a.updated_at AS updatedAt,
           EXISTS(SELECT 1 FROM voucher_lines vl WHERE vl.account_id = a.id) AS hasTransactions
    FROM accounts a
    JOIN subhead_accounts s ON s.id = a.subhead_id
    JOIN head_accounts h ON h.id = s.head_id
    JOIN account_types t ON t.id = h.type_id
    ORDER BY t.base_code, h.code, s.code, a.code
  `);
}

function getCompanyMaster() {
  return one(`
    SELECT name, address, state, country, gst_no AS gstNo, pan_no AS panNo,
           registration_1 AS registration1, registration_2 AS registration2,
           registration_3 AS registration3, financial_year_start AS financialYearStart
    FROM company_master WHERE id = 1
  `) || {
    name: '', address: '', state: '', country: '', gstNo: '', panNo: '',
    registration1: '', registration2: '', registration3: '', financialYearStart: ''
  };
}

function financialYearStartFor(date) {
  if (!date) return '';
  const configured = getCompanyMaster().financialYearStart || '2000-04-01';
  const [, month = '04', day = '01'] = configured.split('-');
  const year = Number(date.slice(0, 4));
  const currentYearStart = `${year}-${month}-${day}`;
  return date >= currentYearStart ? currentYearStart : `${year - 1}-${month}-${day}`;
}

function profitLossBefore(date) {
  if (!date) return 0;
  const result = one(`
    SELECT
      COALESCE(SUM(CASE WHEN h.type_id = 'income' THEN vl.credit_minor - vl.debit_minor ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN h.type_id = 'expense' THEN vl.debit_minor - vl.credit_minor ELSE 0 END), 0)
      AS profitMinor
    FROM voucher_lines vl
    JOIN vouchers v ON v.id = vl.voucher_id
    JOIN accounts a ON a.id = vl.account_id
    JOIN subhead_accounts s ON s.id = a.subhead_id
    JOIN head_accounts h ON h.id = s.head_id
    WHERE v.voucher_date < ?
  `, [date]);
  return Number(result?.profitMinor || 0);
}

async function saveCompanyMaster(company = {}) {
  const name = String(company.name || '').trim();
  const financialYearStart = String(company.financialYearStart || '').trim();
  if (!name) throw new Error('Company name is required.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(financialYearStart)) throw new Error('Select a financial year start date.');
  transaction(() => exec(`
    INSERT INTO company_master (
      id, name, address, state, country, gst_no, pan_no,
      registration_1, registration_2, registration_3, financial_year_start, updated_at
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, address = excluded.address, state = excluded.state,
      country = excluded.country, gst_no = excluded.gst_no, pan_no = excluded.pan_no,
      registration_1 = excluded.registration_1, registration_2 = excluded.registration_2,
      registration_3 = excluded.registration_3,
      financial_year_start = excluded.financial_year_start, updated_at = CURRENT_TIMESTAMP
  `, [
    name, String(company.address || '').trim(), String(company.state || '').trim(),
    String(company.country || '').trim(), String(company.gstNo || '').trim(),
    String(company.panNo || '').trim(), String(company.registration1 || '').trim(),
    String(company.registration2 || '').trim(), String(company.registration3 || '').trim(),
    financialYearStart
  ]));
  await persistIfMirrored();
  return getSnapshot();
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

function codeNumber(row) {
  const value = Number(row.code);
  return Number.isFinite(value) ? value : 0;
}

function sixDigit(value) {
  return String(value).padStart(6, '0');
}

function nextCode({ level, typeId, headId, subheadId }) {
  if (level === 'head') {
    const type = one('SELECT base_code AS baseCode FROM account_types WHERE id = ?', [typeId]);
    const typeBase = Number(type?.baseCode || 100000);
    const typeDigit = Math.floor(typeBase / 100000);
    const codes = all('SELECT code FROM head_accounts WHERE type_id = ?', [typeId]).map(codeNumber);
    const usedSegments = codes.map((code) => Math.floor((code % 100000) / 1000));
    const nextSegment = Math.max(0, ...usedSegments) + 1;
    if (nextSegment > 99) throw new Error('This account type has reached the 99 head-account code limit.');
    return sixDigit(typeDigit * 100000 + nextSegment * 1000);
  }
  if (level === 'subhead') {
    const head = one('SELECT code FROM head_accounts WHERE id = ?', [headId]);
    const headCode = Number(head?.code || 100000);
    const prefix = Math.floor(headCode / 1000) * 1000;
    const codes = all('SELECT code FROM subhead_accounts WHERE head_id = ?', [headId]).map(codeNumber);
    const usedSegments = codes.map((code) => Math.floor((code % 1000) / 100));
    const nextSegment = Math.max(0, ...usedSegments) + 1;
    if (nextSegment > 9) throw new Error('This head account has reached the 9 sub-head code limit.');
    return sixDigit(prefix + nextSegment * 100);
  }
  const subhead = one('SELECT code FROM subhead_accounts WHERE id = ?', [subheadId]);
  const subheadCode = Number(subhead?.code || 100000);
  const prefix = Math.floor(subheadCode / 100) * 100;
  const codes = all('SELECT code FROM accounts WHERE subhead_id = ?', [subheadId]).map(codeNumber);
  const usedSegments = codes.map((code) => code % 100);
  const nextSegment = Math.max(0, ...usedSegments) + 1;
  if (nextSegment > 99) throw new Error('This sub-head account has reached the 99 account code limit.');
  return sixDigit(prefix + nextSegment);
}

async function suggestCoaCode(payload) {
  return { code: nextCode(payload || {}) };
}

async function saveCoaItem(item) {
  const level = item.level;
  const code = String(item.code || '').trim();
  const name = String(item.name || '').trim();
  if (!code || !name) throw new Error('Code and name are required.');
  if (!/^\d{6}$/.test(code)) throw new Error('Account code must be exactly 6 digits.');
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
      const currentAccount = item.id ? one('SELECT code FROM accounts WHERE id = ?', [item.id]) : null;
      if (currentAccount?.code === '302101' && (code !== '302101' || name !== 'Accumulated Profit and Loss')) {
        throw new Error('The Accumulated Profit and Loss account is maintained by the system.');
      }
      const personal = item.isPersonal ? 1 : 0;
      const personalFields = personal
        ? [
            String(item.gstNo || '').trim(), String(item.panNo || '').trim(),
            String(item.registration1 || '').trim(), String(item.registration2 || '').trim(),
            String(item.registration3 || '').trim()
          ]
        : ['', '', '', '', ''];
      const hasTx = item.id ? one('SELECT 1 AS yes FROM voucher_lines WHERE account_id = ? LIMIT 1', [item.id]) : null;
      if (item.id) {
        if (hasTx) exec(`
          UPDATE accounts SET name = ?, is_personal = ?, gst_no = ?, pan_no = ?,
            registration_1 = ?, registration_2 = ?, registration_3 = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [name, personal, ...personalFields, item.id]);
        else exec(`
          UPDATE accounts SET code = ?, name = ?, subhead_id = ?, is_personal = ?,
            gst_no = ?, pan_no = ?, registration_1 = ?, registration_2 = ?,
            registration_3 = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `, [code, name, item.subheadId, personal, ...personalFields, item.id]);
      } else {
        item.id = crypto.randomUUID();
        exec(`
          INSERT INTO accounts (
            id, code, name, subhead_id, is_personal, gst_no, pan_no,
            registration_1, registration_2, registration_3
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [item.id, code, name, item.subheadId, personal, ...personalFields]);
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
      const account = one('SELECT code FROM accounts WHERE id = ?', [id]);
      if (account?.code === '302101') throw new Error('The Accumulated Profit and Loss account cannot be deleted.');
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
  if (filter === 'cashBank') return account.headCode === '101000';
  if (filter === 'purchase') return account.typeId === 'expense' && account.headCode === '501000';
  if (filter === 'sales') return account.typeId === 'income' && ['401000', '402000'].includes(account.headCode);
  return true;
}

function voucherSeriesPrefix(type, date) {
  const financialYearStart = financialYearStartFor(date);
  if (!financialYearStart) throw new Error('A valid voucher date is required.');
  const startYear = Number(financialYearStart.slice(0, 4));
  const endYear = startYear + 1;
  const yearCode = type === 'sales'
    ? `${startYear}${String(endYear).slice(-2)}`
    : `${String(startYear).slice(-2)}${String(endYear).slice(-2)}`;
  const typeCode = {
    receipt: 'R',
    payment: 'V',
    purchase: 'P',
    sales: 'S',
    journal: 'J'
  }[type];
  if (!typeCode) throw new Error('Unknown voucher type.');
  return `${typeCode}-${yearCode}`;
}

function nextVoucherNo(type, date, excludeId = '') {
  const prefix = voucherSeriesPrefix(type, date);
  const rows = all(`
    SELECT voucher_no AS voucherNo
    FROM vouchers
    WHERE voucher_no LIKE ?
      AND (? = '' OR id <> ?)
  `, [`${prefix}-%`, excludeId, excludeId]);
  const nextSequence = rows.reduce((maximum, row) => {
    const sequence = Number(String(row.voucherNo).slice(prefix.length + 1));
    return Number.isInteger(sequence) ? Math.max(maximum, sequence) : maximum;
  }, 0) + 1;
  return `${prefix}-${String(nextSequence).padStart(4, '0')}`;
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
      const existing = one('SELECT type, voucher_date AS voucherDate, voucher_no AS voucherNo FROM vouchers WHERE id = ?', [id]);
      if (!existing) throw new Error('The selected voucher was not found.');
      const existingPrefix = voucherSeriesPrefix(existing.type, existing.voucherDate);
      const requestedPrefix = voucherSeriesPrefix(voucher.type, voucher.voucherDate);
      const voucherNo = existingPrefix === requestedPrefix
        ? existing.voucherNo
        : nextVoucherNo(voucher.type, voucher.voucherDate, id);
      exec(
        `UPDATE vouchers
         SET voucher_no = ?, type = ?, voucher_date = ?, reference_no = ?, invoice_no = ?, invoice_date = ?, narration = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [voucherNo, voucher.type, voucher.voucherDate, voucher.referenceNo || null, voucher.invoiceNo || null, voucher.invoiceDate || null, voucher.narration || null, id]
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

function reportDaybook({ fromDate = '', toDate = '' } = {}) {
  const rows = all(`
    SELECT v.id AS voucherId, v.voucher_no AS voucherNo, v.type,
           v.voucher_date AS voucherDate, v.reference_no AS referenceNo,
           v.invoice_no AS invoiceNo, v.narration,
           vl.sort_order AS sortOrder, vl.description,
           a.id AS accountId, a.code AS accountCode, a.name AS accountName,
           vl.debit_minor AS debitMinor, vl.credit_minor AS creditMinor
    FROM vouchers v
    JOIN voucher_lines vl ON vl.voucher_id = v.id
    JOIN accounts a ON a.id = vl.account_id
    WHERE (? = '' OR v.voucher_date >= ?)
      AND (? = '' OR v.voucher_date <= ?)
    ORDER BY v.voucher_date, v.voucher_no, vl.sort_order
  `, [fromDate, fromDate, toDate, toDate]);
  const totals = rows.reduce(
    (sum, row) => ({
      debitMinor: sum.debitMinor + Number(row.debitMinor || 0),
      creditMinor: sum.creditMinor + Number(row.creditMinor || 0)
    }),
    { debitMinor: 0, creditMinor: 0 }
  );
  return { rows, totals };
}

function reportLedger({ accountId, fromDate = '', toDate = '' } = {}) {
  if (!accountId) throw new Error('Select an account for the ledger.');
  const account = one(`
    SELECT a.id, a.code, a.name, h.type_id AS typeId, t.normal_side AS normalSide
    FROM accounts a
    JOIN subhead_accounts s ON s.id = a.subhead_id
    JOIN head_accounts h ON h.id = s.head_id
    JOIN account_types t ON t.id = h.type_id
    WHERE a.id = ?
  `, [accountId]);
  if (!account) throw new Error('The selected account was not found.');
  const openingFromDate = ['income', 'expense'].includes(account.typeId)
    ? financialYearStartFor(fromDate || toDate)
    : '';
  const opening = fromDate
    ? one(`
        SELECT COALESCE(SUM(vl.debit_minor - vl.credit_minor), 0) AS balanceMinor
        FROM voucher_lines vl
        JOIN vouchers v ON v.id = vl.voucher_id
        WHERE vl.account_id = ?
          AND (? = '' OR v.voucher_date >= ?)
          AND v.voucher_date < ?
      `, [accountId, openingFromDate, openingFromDate, fromDate])
    : { balanceMinor: 0 };
  const rows = all(`
    SELECT v.id AS voucherId, v.voucher_no AS voucherNo, v.type,
           v.voucher_date AS voucherDate, v.reference_no AS referenceNo,
           v.invoice_no AS invoiceNo, v.narration, vl.description,
           vl.debit_minor AS debitMinor, vl.credit_minor AS creditMinor
    FROM voucher_lines vl
    JOIN vouchers v ON v.id = vl.voucher_id
    WHERE vl.account_id = ?
      AND (? = '' OR v.voucher_date >= ?)
      AND (? = '' OR v.voucher_date <= ?)
    ORDER BY v.voucher_date, v.voucher_no, vl.sort_order
  `, [accountId, fromDate, fromDate, toDate, toDate]);
  const accumulatedProfitMinor = account.code === '302101'
    ? profitLossBefore(financialYearStartFor(toDate || fromDate))
    : 0;
  let runningBalanceMinor = Number(opening.balanceMinor || 0) - accumulatedProfitMinor;
  const runningRows = rows.map((row) => {
    runningBalanceMinor += Number(row.debitMinor || 0) - Number(row.creditMinor || 0);
    return { ...row, runningBalanceMinor };
  });
  return {
    account,
    openingBalanceMinor: Number(opening.balanceMinor || 0) - accumulatedProfitMinor,
    closingBalanceMinor: runningBalanceMinor,
    rows: runningRows
  };
}

function reportProfitLoss({ fromDate = '', toDate = '' } = {}) {
  const rows = all(`
    SELECT a.id AS accountId, a.code AS accountCode, a.name AS accountName,
           s.id AS subheadId, s.code AS subheadCode, s.name AS subheadName,
           h.id AS headId, h.code AS headCode, h.name AS headName,
           h.type_id AS typeId,
           COALESCE(SUM(vl.debit_minor), 0) AS debitMinor,
           COALESCE(SUM(vl.credit_minor), 0) AS creditMinor
    FROM accounts a
    JOIN subhead_accounts s ON s.id = a.subhead_id
    JOIN head_accounts h ON h.id = s.head_id
    JOIN voucher_lines vl ON vl.account_id = a.id
    JOIN vouchers v ON v.id = vl.voucher_id
    WHERE h.type_id IN ('income', 'expense')
      AND (? = '' OR v.voucher_date >= ?)
      AND (? = '' OR v.voucher_date <= ?)
    GROUP BY a.id
    ORDER BY h.type_id, h.code, s.code, a.code
  `, [fromDate, fromDate, toDate, toDate]).map((row) => ({
    ...row,
    amountMinor:
      row.typeId === 'income'
        ? Number(row.creditMinor || 0) - Number(row.debitMinor || 0)
        : Number(row.debitMinor || 0) - Number(row.creditMinor || 0)
  }));
  const incomeMinor = rows.filter((row) => row.typeId === 'income').reduce((sum, row) => sum + row.amountMinor, 0);
  const expenseMinor = rows.filter((row) => row.typeId === 'expense').reduce((sum, row) => sum + row.amountMinor, 0);
  return { rows, incomeMinor, expenseMinor, profitMinor: incomeMinor - expenseMinor };
}

function reportBalanceSheet({ asOfDate = '' } = {}) {
  const financialYearStart = financialYearStartFor(asOfDate);
  const rows = all(`
    SELECT a.id AS accountId, a.code AS accountCode, a.name AS accountName,
           s.id AS subheadId, s.code AS subheadCode, s.name AS subheadName,
           h.id AS headId, h.code AS headCode, h.name AS headName,
           h.type_id AS typeId,
           COALESCE(SUM(vl.debit_minor), 0) AS debitMinor,
           COALESCE(SUM(vl.credit_minor), 0) AS creditMinor
    FROM accounts a
    JOIN subhead_accounts s ON s.id = a.subhead_id
    JOIN head_accounts h ON h.id = s.head_id
    LEFT JOIN voucher_lines vl ON vl.account_id = a.id
      AND EXISTS (
        SELECT 1 FROM vouchers v
        WHERE v.id = vl.voucher_id AND (? = '' OR v.voucher_date <= ?)
      )
    WHERE h.type_id IN ('asset', 'liability', 'equity')
    GROUP BY a.id
    ORDER BY h.type_id, h.code, s.code, a.code
  `, [asOfDate, asOfDate]).map((row) => {
    const amountMinor =
      row.typeId === 'asset'
        ? Number(row.debitMinor || 0) - Number(row.creditMinor || 0)
        : Number(row.creditMinor || 0) - Number(row.debitMinor || 0);
    return { ...row, amountMinor };
  });
  const accumulatedProfitMinor = profitLossBefore(financialYearStart);
  const accumulatedAccount = rows.find((row) => row.accountCode === '302101');
  if (accumulatedAccount) accumulatedAccount.amountMinor += accumulatedProfitMinor;
  const visibleRows = rows.filter((row) => row.amountMinor !== 0);
  const currentProfit = one(`
    SELECT
      COALESCE(SUM(CASE WHEN h.type_id = 'income' THEN vl.credit_minor - vl.debit_minor ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN h.type_id = 'expense' THEN vl.debit_minor - vl.credit_minor ELSE 0 END), 0)
      AS profitMinor
    FROM voucher_lines vl
    JOIN vouchers v ON v.id = vl.voucher_id
    JOIN accounts a ON a.id = vl.account_id
    JOIN subhead_accounts s ON s.id = a.subhead_id
    JOIN head_accounts h ON h.id = s.head_id
    WHERE (? = '' OR v.voucher_date >= ?)
      AND (? = '' OR v.voucher_date <= ?)
  `, [financialYearStart, financialYearStart, asOfDate, asOfDate]);
  const assetsMinor = visibleRows.filter((row) => row.typeId === 'asset').reduce((sum, row) => sum + row.amountMinor, 0);
  const liabilitiesMinor = visibleRows.filter((row) => row.typeId === 'liability').reduce((sum, row) => sum + row.amountMinor, 0);
  const equityMinor = visibleRows.filter((row) => row.typeId === 'equity').reduce((sum, row) => sum + row.amountMinor, 0);
  const profitMinor = Number(currentProfit?.profitMinor || 0);
  return {
    rows: visibleRows,
    financialYearStart,
    accumulatedProfitMinor,
    assetsMinor,
    liabilitiesMinor,
    equityMinor,
    profitMinor,
    liabilitiesAndEquityMinor: liabilitiesMinor + equityMinor + profitMinor
  };
}

function reportTag({ tagId, mode = 'account', fromDate = '', toDate = '' } = {}) {
  if (!tagId) throw new Error('Select a tag for the report.');
  const tag = one('SELECT id, name, color FROM tags WHERE id = ?', [tagId]);
  if (!tag) throw new Error('The selected tag was not found.');
  if (!['account', 'transaction'].includes(mode)) throw new Error('Select a valid tag report type.');

  const accountTagFilter = `
    EXISTS (
      SELECT 1
      FROM coa_tags ct
      WHERE ct.tag_id = ?
        AND (
          (ct.entity_type = 'account' AND ct.entity_id = a.id)
          OR (ct.entity_type = 'subhead' AND ct.entity_id = s.id)
          OR (ct.entity_type = 'head' AND ct.entity_id = h.id)
        )
    )
  `;
  const rows = mode === 'account'
    ? all(`
        SELECT a.id AS accountId, a.code AS accountCode, a.name AS accountName,
               COALESCE(SUM(vl.debit_minor), 0) AS debitMinor,
               COALESCE(SUM(vl.credit_minor), 0) AS creditMinor
        FROM accounts a
        JOIN subhead_accounts s ON s.id = a.subhead_id
        JOIN head_accounts h ON h.id = s.head_id
        LEFT JOIN voucher_lines vl ON vl.account_id = a.id
          AND EXISTS (
            SELECT 1 FROM vouchers v
            WHERE v.id = vl.voucher_id
              AND (? = '' OR v.voucher_date >= ?)
              AND (? = '' OR v.voucher_date <= ?)
          )
        WHERE ${accountTagFilter}
        GROUP BY a.id
        ORDER BY a.code
      `, [fromDate, fromDate, toDate, toDate, tagId])
    : all(`
        SELECT a.id AS accountId, a.code AS accountCode, a.name AS accountName,
               COALESCE(SUM(vl.debit_minor), 0) AS debitMinor,
               COALESCE(SUM(vl.credit_minor), 0) AS creditMinor
        FROM voucher_tags vt
        JOIN vouchers v ON v.id = vt.voucher_id
        JOIN voucher_lines vl ON vl.voucher_id = v.id
        JOIN accounts a ON a.id = vl.account_id
        WHERE vt.tag_id = ?
          AND (? = '' OR v.voucher_date >= ?)
          AND (? = '' OR v.voucher_date <= ?)
        GROUP BY a.id
        ORDER BY a.code
      `, [tagId, fromDate, fromDate, toDate, toDate]);

  const normalizedRows = rows.map((row) => ({
    ...row,
    debitMinor: Number(row.debitMinor || 0),
    creditMinor: Number(row.creditMinor || 0),
    balanceMinor: Number(row.debitMinor || 0) - Number(row.creditMinor || 0)
  }));
  const totals = normalizedRows.reduce(
    (sum, row) => ({
      debitMinor: sum.debitMinor + row.debitMinor,
      creditMinor: sum.creditMinor + row.creditMinor,
      balanceMinor: sum.balanceMinor + row.balanceMinor
    }),
    { debitMinor: 0, creditMinor: 0, balanceMinor: 0 }
  );
  return { tag, mode, rows: normalizedRows, totals };
}

function reportTagTransactions({ tagId, mode = 'account', accountId, fromDate = '', toDate = '' } = {}) {
  if (!tagId || !accountId) throw new Error('Select a tag and account for drill-down.');
  if (mode === 'account') return reportLedger({ accountId, fromDate, toDate });
  if (mode !== 'transaction') throw new Error('Select a valid tag report type.');
  const account = one('SELECT id, code, name FROM accounts WHERE id = ?', [accountId]);
  if (!account) throw new Error('The selected account was not found.');
  const rows = all(`
    SELECT v.id AS voucherId, v.voucher_no AS voucherNo, v.type,
           v.voucher_date AS voucherDate, v.reference_no AS referenceNo,
           v.invoice_no AS invoiceNo, v.narration, vl.description,
           vl.debit_minor AS debitMinor, vl.credit_minor AS creditMinor
    FROM voucher_tags vt
    JOIN vouchers v ON v.id = vt.voucher_id
    JOIN voucher_lines vl ON vl.voucher_id = v.id
    WHERE vt.tag_id = ? AND vl.account_id = ?
      AND (? = '' OR v.voucher_date >= ?)
      AND (? = '' OR v.voucher_date <= ?)
    ORDER BY v.voucher_date, v.voucher_no, vl.sort_order
  `, [tagId, accountId, fromDate, fromDate, toDate, toDate]);
  let runningBalanceMinor = 0;
  return {
    account,
    openingBalanceMinor: 0,
    closingBalanceMinor: rows.reduce(
      (balance, row) => balance + Number(row.debitMinor || 0) - Number(row.creditMinor || 0),
      0
    ),
    rows: rows.map((row) => {
      runningBalanceMinor += Number(row.debitMinor || 0) - Number(row.creditMinor || 0);
      return { ...row, runningBalanceMinor };
    })
  };
}

function getSnapshot() {
  const postingAccounts = listPostingAccounts();
  return {
    meta: { persistence, sqliteVersion: sqlite3.version.libVersion, schemaVersion: SCHEMA_VERSION },
    accountTypes: listAccountTypes(),
    heads: listHeads(),
    subheads: listSubheads(),
    accounts: postingAccounts,
    company: getCompanyMaster(),
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
      for (const row of backup.data.accounts || []) exec(`
        INSERT INTO accounts (
          id, code, name, subhead_id, is_personal, gst_no, pan_no,
          registration_1, registration_2, registration_3, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        row.id, row.code, row.name, row.subhead_id, row.is_personal || 0,
        row.gst_no || '', row.pan_no || '', row.registration_1 || '',
        row.registration_2 || '', row.registration_3 || '', row.created_at, row.updated_at
      ]);
      for (const row of backup.data.company_master || []) exec(`
        INSERT INTO company_master (
          id, name, address, state, country, gst_no, pan_no,
          registration_1, registration_2, registration_3, financial_year_start, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        row.id, row.name, row.address, row.state, row.country, row.gst_no, row.pan_no,
        row.registration_1, row.registration_2, row.registration_3,
        row.financial_year_start, row.updated_at
      ]);
      for (const row of backup.data.tags || []) exec('INSERT INTO tags (id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [row.id, row.name, row.color, row.created_at, row.updated_at]);
      for (const row of backup.data.coa_tags || []) exec('INSERT INTO coa_tags (entity_type, entity_id, tag_id) VALUES (?, ?, ?)', [row.entity_type, row.entity_id, row.tag_id]);
      for (const row of backup.data.vouchers || []) exec('INSERT INTO vouchers (id, voucher_no, type, voucher_date, reference_no, invoice_no, invoice_date, narration, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [row.id, row.voucher_no, row.type, row.voucher_date, row.reference_no, row.invoice_no, row.invoice_date, row.narration, row.created_at, row.updated_at]);
      for (const row of backup.data.voucher_lines || []) exec('INSERT INTO voucher_lines (id, voucher_id, account_id, description, debit_minor, credit_minor, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)', [row.id, row.voucher_id, row.account_id, row.description, row.debit_minor, row.credit_minor, row.sort_order]);
      for (const row of backup.data.voucher_tags || []) exec('INSERT INTO voucher_tags (voucher_id, tag_id) VALUES (?, ?)', [row.voucher_id, row.tag_id]);
      exec(`
        INSERT INTO settings (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `, ['schema_version', String(SCHEMA_VERSION)]);
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
  saveCompanyMaster,
  reportDaybook,
  reportLedger,
  reportProfitLoss,
  reportBalanceSheet,
  reportTag,
  reportTagTransactions,
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
