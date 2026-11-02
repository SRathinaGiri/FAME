// End-to-end test of the Windows database worker: real encrypted file, real engine.
// Run: npm run test:native-db   (needs `npm ci` in desktop/ for better-sqlite3-multiple-ciphers)
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(join(root, 'desktop', 'engine'), { recursive: true });
cpSync(join(root, 'src', 'engine.js'), join(root, 'desktop', 'engine', 'engine.mjs'));

const work = mkdtempSync(join(tmpdir(), 'fame-native-'));
const dataDir = join(work, 'data');
const backupDir = join(work, 'Documents', 'FAME', 'Backups');
const VOUCHERS = Number(process.env.FAME_TEST_VOUCHERS || 5000);

function startWorker() {
  const worker = new Worker(join(root, 'desktop', 'db-worker.mjs'), { workerData: { dataDir, backupDir } });
  let next = 1;
  const pending = new Map();
  worker.on('message', (msg) => {
    if (msg.event) return;
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    msg.ok ? p.resolve(msg.result) : p.reject(new Error(msg.error));
  });
  const call = (op, args) => new Promise((resolve, reject) => {
    const id = next++;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, op, args });
  });
  const db = (type, payload) => call('db', { type, payload });
  const count = async () => (await db('exportData')).data.vouchers.length;
  return { call, db, count, stop: () => worker.terminate() };
}

const PASS = "correct horse 'battery'";
const NEW_PASS = 'new passphrase 2026';
let w = startWorker();
let step = 0;
const ok = (msg) => console.log(`  ok ${++step} - ${msg}`);

try {
  assert.equal((await w.call('status')).exists, false);
  await assert.rejects(w.call('create', { passphrase: 'short' }), /at least 8/);
  const info = await w.call('create', { passphrase: PASS });
  assert.match(info.persistence, /SQLCipher/);
  ok(`created encrypted database (SQLite ${info.sqliteVersion})`);

  const snap = await w.db('snapshot');
  const code = (c) => snap.accounts.find((a) => a.code === c).id;
  const cash = code('101101');
  const sales = code('401101');
  const rent = code('502101');
  assert.ok(cash && sales && rent);
  ok(`seeded chart of accounts (${snap.accounts.length} posting accounts)`);

  const t0 = Date.now();
  let lap = Date.now();
  const laps = [];
  for (let i = 0; i < VOUCHERS; i += 1) {
    if (i && i % 1000 === 0) { laps.push(Date.now() - lap); lap = Date.now(); }
    const day = String((i % 28) + 1).padStart(2, '0');
    const month = String((i % 12) + 1).padStart(2, '0');
    const amount = 1000 + (i % 97) * 100;
    await w.db('saveVoucher', {
      type: 'journal',
      voucherDate: `2026-${month}-${day}`,
      narration: `Test entry ${i}`,
      lines: i % 3
        ? [{ accountId: cash, debitMinor: amount, creditMinor: 0 }, { accountId: sales, debitMinor: 0, creditMinor: amount }]
        : [{ accountId: rent, debitMinor: amount, creditMinor: 0 }, { accountId: cash, debitMinor: 0, creditMinor: amount }]
    });
  }
  laps.push(Date.now() - lap);
  ok(`saved ${VOUCHERS} vouchers in ${Date.now() - t0} ms (per 1000: ${laps.join(', ')} ms)`);

  const t1 = Date.now();
  const tb = await w.db('reportTrialBalance', { asOfDate: '2027-03-31' });
  const tbMs = Date.now() - t1;
  const json = JSON.stringify(tb);
  assert.ok(json.length > 100);
  const t2 = Date.now();
  const ledger = await w.db('reportLedger', { accountId: cash, fromDate: '2026-04-01', toDate: '2027-03-31' });
  ok(`trial balance ${tbMs} ms, cash ledger ${Date.now() - t2} ms (${ledger.rows?.length ?? '?'} rows)`);

  const t3 = Date.now();
  const snap2 = await w.db('snapshot');
  assert.equal(snap2.vouchers.length, Math.min(VOUCHERS, 500));
  assert.equal(await w.count(), VOUCHERS);
  ok(`dashboard snapshot ${Date.now() - t3} ms`);

  // The file on disk must not be readable without the key.
  const head = readFileSync(join(dataDir, 'fame.db')).subarray(0, 16).toString('latin1');
  assert.notEqual(head, 'SQLite format 3\u0000');
  assert.ok(!readFileSync(join(dataDir, 'fame.db')).includes(Buffer.from('Test entry 1')));
  ok('database file is encrypted (no SQLite header, no plaintext narration)');

  const b1 = await w.call('backup', { force: true });
  assert.ok(readdirSync(backupDir).includes('FAME-latest.fame'));
  ok(`backup written (${b1.bytes} bytes)`);

  await w.call('lock');
  await assert.rejects(w.db('snapshot'), /locked/);
  await assert.rejects(w.call('unlock', { passphrase: 'wrong passphrase' }), /Wrong passphrase/);
  await w.call('unlock', { passphrase: PASS });
  assert.equal(await w.count(), VOUCHERS);
  ok('lock / wrong passphrase rejected / unlock');

  await assert.rejects(w.call('changePassphrase', { oldPassphrase: 'nope nope', newPassphrase: NEW_PASS }), /Wrong passphrase/);
  await w.call('changePassphrase', { oldPassphrase: PASS, newPassphrase: NEW_PASS });
  await w.call('lock');
  await assert.rejects(w.call('unlock', { passphrase: PASS }), /Wrong passphrase/);
  await w.call('unlock', { passphrase: NEW_PASS });
  ok('passphrase changed (rekey) and old one no longer opens it');

  // JSON export / import through the engine still works (migration path from the PWA).
  const exported = await w.db('exportData');
  await w.db('resetCompanyData');
  assert.equal(await w.count(), 0);
  await w.db('importData', exported);
  assert.equal(await w.count(), VOUCHERS);
  ok('JSON backup export → reset → import round trip');

  // Restore the latest .fame backup in 1 MB chunks. Changing the passphrase wrote a fresh
  // backup, so the latest backup opens with the NEW passphrase only.
  await w.db('resetCompanyData');
  const bytes = readFileSync(join(backupDir, 'FAME-latest.fame'));
  await w.call('restoreBegin');
  for (let i = 0; i < bytes.length; i += 1 << 20) await w.call('restoreChunk', { bytes: new Uint8Array(bytes.subarray(i, i + (1 << 20))) });
  await assert.rejects(w.call('restoreCommit', { passphrase: PASS }), /Wrong passphrase/);
  await w.call('restoreBegin');
  for (let i = 0; i < bytes.length; i += 1 << 20) await w.call('restoreChunk', { bytes: new Uint8Array(bytes.subarray(i, i + (1 << 20))) });
  await w.call('restoreCommit', { passphrase: NEW_PASS });
  assert.equal(await w.count(), VOUCHERS);
  assert.ok(readdirSync(backupDir).some((n) => n.startsWith('FAME-before-restore-')));
  ok('restore from .fame backup (wrong passphrase refused, previous data kept as before-restore copy)');

  // A non-FAME file must be refused.
  writeFileSync(join(work, 'junk.bin'), 'not a database');
  await w.call('restoreBegin');
  await w.call('restoreChunk', { bytes: new Uint8Array(readFileSync(join(work, 'junk.bin'))) });
  await assert.rejects(w.call('restoreCommit', { passphrase: NEW_PASS }));
  assert.equal(await w.count(), VOUCHERS);
  ok('junk restore refused, live data untouched');

  // Survives a restart of the worker (i.e. app restart).
  await w.call('lock');
  await w.stop();
  w = startWorker();
  await w.call('unlock', { passphrase: NEW_PASS });
  assert.equal(await w.count(), VOUCHERS);
  ok('data persists across restart');
  console.log(`\nAll ${step} checks passed.`);
} finally {
  await w.stop();
  rmSync(work, { recursive: true, force: true });
}
