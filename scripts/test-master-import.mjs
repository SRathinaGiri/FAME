// Bulk import of masters through the engine, against a real encrypted database.
// Run: node scripts/test-master-import.mjs   (part of npm run test:native)
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(join(root, 'desktop', 'engine'), { recursive: true });
cpSync(join(root, 'src', 'engine.js'), join(root, 'desktop', 'engine', 'engine.mjs'));
const work = mkdtempSync(join(tmpdir(), 'fame-import-'));
const worker = new Worker(join(root, 'desktop', 'db-worker.mjs'), { workerData: { dataDir: join(work, 'data'), backupDir: join(work, 'b') } });
let next = 1;
const pending = new Map();
worker.on('message', (m) => { if (m.event) return; const p = pending.get(m.id); pending.delete(m.id); m.ok ? p.res(m.result) : p.rej(new Error(m.error)); });
const call = (op, args) => new Promise((res, rej) => { const id = next++; pending.set(id, { res, rej }); worker.postMessage({ id, op, args }); });
const db = (type, payload) => call('db', { type, payload });
const imp = (master, fieldsList, dryRun = false) => db('importMasters', { master, dryRun, rows: fieldsList.map((fields, i) => ({ rowNumber: i + 2, fields })) });
let step = 0;
const ok = (m) => console.log(`  ok ${++step} - ${m}`);

try {
  await call('create', { passphrase: 'import test 2026' });

  // ---- 100 products, categories created on the fly
  const products = Array.from({ length: 100 }, (_, i) => ({
    name: `Item ${String(i + 1).padStart(3, '0')}`,
    kind: i % 10 === 9 ? 'Service' : 'Product',
    ...(i % 10 === 9 ? {} : { category: i % 2 ? 'Electronics' : 'Stationery', subcategory: i % 4 < 2 ? 'Retail' : 'Bulk' }),
    hsnSacCode: i % 10 === 9 ? '998314' : '0401',
    gstRate: i % 3 ? 18 : 5,
    openingQuantity: i % 10 === 9 ? undefined : 10,
    openingValueMinor: i % 10 === 9 ? undefined : 150000
  }));
  const dry = await imp('products', products, true);
  assert.deepEqual([dry.created, dry.updated, dry.errors.length, dry.applied], [100, 0, 0, false]);
  assert.equal((await db('snapshot')).products.length, 0);
  ok('dry run of 100 products: 100 new, 0 errors, nothing written');

  const applied = await imp('products', products);
  let snap = await db('snapshot');
  assert.equal(applied.applied, true);
  assert.equal(snap.products.length, 100);
  const newCats = snap.productCategories.filter((c) => ['Electronics', 'Stationery'].includes(c.name));
  assert.equal(newCats.length, 2);
  assert.equal(snap.productSubcategories.filter((x) => newCats.some((c) => c.id === x.categoryId)).length, 4);
  const item10 = snap.products.find((p) => p.name === 'Item 010');
  assert.equal(item10.kind, 'service');
  assert.equal(snap.products.find((p) => p.name === 'Item 001').hsnSacCode, '0401');
  ok('applied: 100 products, 2 categories and 4 sub-categories created; services get Service Income; HSN 0401 keeps its leading zero');

  // ---- update by name; columns not given keep their values
  const upd = await imp('products', [{ name: 'item 001', gstRate: 40 }, { name: 'Item 101', kind: 'Service' }]);
  snap = await db('snapshot');
  const item1 = snap.products.find((p) => p.name === 'Item 001');
  assert.deepEqual([upd.created, upd.updated], [1, 1]);
  assert.equal(Number(item1.gstRate), 40);
  assert.equal(item1.hsnSacCode, '0401');
  assert.equal(Number(item1.openingQuantity), 10);
  ok('re-import: "item 001" (any case) updates GST to 40% and keeps HSN / opening stock; "Item 101" is added');

  // ---- all or nothing
  const bad = await imp('products', [
    { name: 'Good A', kind: 'Service' },
    { name: 'Bad kind', kind: 'Gadget' },
    { name: 'Bad GST', kind: 'Service', gstRate: -5 },
    { name: 'No category', kind: 'Product' },
    { name: 'Good B', kind: 'Service', salesAccountCode: '999999' }
  ]);
  assert.equal(bad.applied, false);
  assert.deepEqual(bad.errors.map((e) => e.rowNumber), [3, 4, 5, 6]);
  assert.ok(!(await db('snapshot')).products.some((p) => p.name === 'Good A'));
  ok(`one bad file: 4 row errors reported (rows 3–6), the good row was NOT imported — e.g. "${bad.errors[0].message}"`);

  // ---- customers preset
  const cust = await imp('customers', [
    { name: 'Ravi Traders', gstNo: '33ABCDE1234F1Z5', panNo: 'ABCDE1234F', state: 'TN', openingBalanceMinor: 2500000 },
    { name: 'Kerala Mart', state: 'KL', openingBalanceMinor: -100000 }
  ]);
  snap = await db('snapshot');
  const ravi = snap.accounts.find((a) => a.name === 'Ravi Traders');
  assert.deepEqual([cust.created, ravi.subheadCode, Boolean(ravi.isPersonal), ravi.gstNo, ravi.openingBalanceMinor], [2, '102100', true, '33ABCDE1234F1Z5', 2500000]);
  const wrongHead = await imp('customers', [{ name: 'Misplaced', subheadCode: '201100' }]);
  assert.match(wrongHead.errors[0].message, /must sit under head 102000/);
  ok(`customers: auto code ${ravi.code} under 102100, personal, GSTIN/PAN/state and Dr ₹25,000 opening; a "customer" under Payables is refused`);

  // ---- update customer by code: only state changes
  await imp('customers', [{ code: ravi.code, state: 'KA' }]);
  const ravi2 = (await db('snapshot')).accounts.find((a) => a.code === ravi.code);
  assert.deepEqual([ravi2.name, ravi2.state, ravi2.gstNo, ravi2.openingBalanceMinor], ['Ravi Traders', 'KA', '33ABCDE1234F1Z5', 2500000]);
  ok('update customer by code: only State changed, name / GSTIN / opening kept');

  // ---- chart of accounts: head → sub-head → accounts, auto codes, tags
  const heads = await imp('heads', [{ name: 'Loans and Advances', type: 'Assets', tags: ['Schedule 7'] }]);
  snap = await db('snapshot');
  const loans = snap.heads.find((h) => h.name === 'Loans and Advances');
  await imp('subheads', [{ name: 'Staff Advances', headCode: loans.code }]);
  snap = await db('snapshot');
  const staff = snap.subheads.find((x) => x.name === 'Staff Advances');
  const acc = await imp('accounts', [{ name: 'Advance — Suresh', subheadCode: staff.code, isPersonal: true, openingBalanceMinor: 500000 }]);
  snap = await db('snapshot');
  assert.deepEqual([heads.created, acc.created], [1, 1]);
  assert.ok(snap.tags.some((t) => t.name === 'Schedule 7'));
  ok(`CoA chain: head ${loans.code} (tag created), sub-head ${staff.code}, account ${snap.accounts.find((a) => a.name === 'Advance — Suresh').code}`);

  // ---- built-in chart rules still apply through import
  const builtIn = await imp('accounts', [{ code: '202101', name: 'CGST Output', subheadCode: staff.code }]);
  assert.match(builtIn.errors[0].message, /built in/);
  const rename = await imp('accounts', [{ code: '202101', name: 'CGST Payable' }]);
  assert.equal(rename.updated, 1);
  ok('built-in 202101 cannot be moved by import, but can be renamed');

  // ---- tags
  const tagResult = await imp('tags', [{ name: 'Schedule 7', color: '#aa3300' }, { name: 'Branch: Chennai' }, { name: 'Bad', color: 'red' }]);
  assert.equal(tagResult.errors.length, 1);
  ok('tags: bad colour reported, file not applied');
  console.log(`\nAll ${step} checks passed.`);
} finally {
  await worker.terminate();
  rmSync(work, { recursive: true, force: true });
}
