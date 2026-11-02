// Tests the Android JavaScript path (src/native/bridge.js → engine) against a stand-in for the
// Java FameNative bridge that follows its contract: one statement per exec (SQLCipher-Android's
// execSQL ignores anything after the first statement, so the stand-in refuses them outright),
// rows as JSON, typed binds, JSON {ok,result|error} envelopes, encrypted file.
// Run: npm run test:android-bridge
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(new URL('../desktop/package.json', import.meta.url));
const Database = require('better-sqlite3-multiple-ciphers');

const work = mkdtempSync(join(tmpdir(), 'fame-android-'));
const file = join(work, 'fame.db');
let conn = null;
let execCalls = 0;
let sawMulti = false;

const envelope = (fn) => {
  try {
    return JSON.stringify({ ok: true, result: fn() ?? null });
  } catch (e) {
    return JSON.stringify({ ok: false, error: /not a database/i.test(e.message) ? 'Wrong passphrase, or this is not a F.A.M.E database.' : e.message });
  }
};
const open = (passphrase) => {
  const c = new Database(file);
  c.pragma("cipher='sqlcipher'");
  c.pragma('legacy=4');
  c.pragma(`key='${passphrase.replace(/'/g, "''")}'`);
  try { c.prepare('SELECT count(*) FROM sqlite_master').get(); } catch (e) { c.close(); throw e; }
  c.pragma('foreign_keys = ON');
  return c;
};
const info = () => ({ persistence: 'Encrypted SQLite file (SQLCipher 4) in app-private storage', sqliteVersion: conn.prepare('select sqlite_version() v').get().v });
let exists = false;

globalThis.window = {
  Capacitor: { getPlatform: () => 'android' },
  FAMENative: {
    status: () => envelope(() => ({ platform: 'android', exists, unlocked: Boolean(conn), remembered: false, dirty: false, lastBackup: null })),
    create: (p) => envelope(() => { if (p.length < 8) throw new Error('short'); conn = open(p); exists = true; return info(); }),
    unlock: (p) => envelope(() => { if (!conn) conn = open(p); return info(); }),
    lock: () => envelope(() => { conn?.close(); conn = null; }),
    exec: (sql, bindJson, wantRows) => envelope(() => {
      execCalls += 1;
      if (!conn) throw new Error('The database is locked.');
      const args = JSON.parse(bindJson || '[]');
      let st;
      try { st = conn.prepare(sql); } catch (e) {
        if (e instanceof RangeError) { sawMulti = true; throw new Error('multi-statement SQL reached the Java bridge'); }
        throw e;
      }
      if (wantRows) {
        if (!st.reader) { st.run(args); return { rows: [] }; }
        return { rows: JSON.parse(JSON.stringify(st.all(args))) };
      }
      if (st.reader) st.all(args); else st.run(args);
      return null;
    })
  }
};
globalThis.btoa ??= (s) => Buffer.from(s, 'binary').toString('base64');

const { native, platform, splitStatements } = await import('../src/native/bridge.js');
let step = 0;
const ok = (m) => console.log(`  ok ${++step} - ${m}`);

try {
  assert.equal(platform, 'android');

  assert.deepEqual(splitStatements("CREATE TABLE a(x); INSERT INTO a VALUES ('x;y'); -- c;\nSELECT 1"), [
    'CREATE TABLE a(x)', "INSERT INTO a VALUES ('x;y')", '-- c;\nSELECT 1'
  ]);
  assert.equal(splitStatements('CREATE TRIGGER t AFTER INSERT ON a BEGIN UPDATE a SET x=1; DELETE FROM b; END; SELECT 2').length, 2);
  ok('statement splitter respects quotes, comments and trigger bodies');

  await assert.rejects(native.create('short', false));
  const created = await native.create('android passphrase', false);
  assert.match(created.persistence, /SQLCipher/);
  assert.equal(sawMulti, false);
  ok(`create + schema through ${execCalls} single-statement bridge calls`);

  const snap = await native.db('snapshot');
  const id = (c) => snap.accounts.find((a) => a.code === c).id;
  for (let i = 0; i < 300; i += 1) {
    await native.db('saveVoucher', {
      type: 'journal',
      voucherDate: '2026-06-15',
      narration: `Bridge ${i}`,
      lines: i % 2
        ? [{ accountId: id('101101'), debitMinor: 50000, creditMinor: 0 }, { accountId: id('402101'), debitMinor: 0, creditMinor: 50000 }]
        : [{ accountId: id('502101'), debitMinor: 20000, creditMinor: 0 }, { accountId: id('101101'), debitMinor: 0, creditMinor: 20000 }]
    });
  }
  const after = await native.db('snapshot');
  assert.equal(after.vouchers.length, 300);
  assert.ok(after.vouchers.some((v) => v.voucherNo === 'J-2627-0300'));
  ok('300 vouchers saved, numbering per series correct (J-2627-0300 exists)');

  const tb = await native.db('reportTrialBalance', { asOfDate: '2027-03-31' });
  const pl = await native.db('reportProfitLoss', { fromDate: '2026-04-01', toDate: '2027-03-31' });
  const bs = await native.db('reportBalanceSheet', { asOfDate: '2027-03-31' });
  assert.ok(tb && pl && bs);
  // Cash: 150 × ₹500 in − 150 × ₹200 out = ₹45,000 = 45,00,000 paise.
  const ledger = await native.db('reportLedger', { accountId: id('101101'), fromDate: '2026-04-01', toDate: '2027-03-31' });
  assert.match(JSON.stringify(ledger), /4500000/);
  ok('trial balance, P&L, balance sheet, ledger run; cash closing ₹45,000 found in ledger');

  // Errors from the engine and from SQL constraints come back as rejections, data unchanged.
  await assert.rejects(native.db('saveVoucher', { type: 'journal', voucherDate: '2026-06-15', lines: [] }), /two posting lines/);
  await assert.rejects(native.db('saveVoucher', {
    type: 'journal', voucherDate: '2026-06-15',
    lines: [{ accountId: 'missing', debitMinor: 1, creditMinor: 0 }, { accountId: id('101101'), debitMinor: 0, creditMinor: 1 }]
  }));
  assert.equal((await native.db('exportData')).data.vouchers.length, 300);
  ok('engine validation and FK failures reject cleanly and roll back');

  const backup = await native.db('exportData');
  await native.db('resetCompanyData');
  await native.db('importData', backup);
  assert.equal((await native.db('exportData')).data.vouchers.length, 300);
  ok('JSON export → reset → import through the bridge');

  await native.lock();
  await assert.rejects(native.db('snapshot'), /locked/);
  await assert.rejects(native.unlock('wrong passphrase', false), /Wrong passphrase/);
  await native.unlock('android passphrase', false);
  assert.equal((await native.db('exportData')).data.vouchers.length, 300);
  ok('lock, wrong passphrase refused, unlock');
  assert.equal(sawMulti, false);
  console.log(`\nAll ${step} checks passed (${execCalls} bridge calls).`);
} finally {
  conn?.close();
  rmSync(work, { recursive: true, force: true });
}
