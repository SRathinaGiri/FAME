// Accounting rules for receipts / payments and the built-in chart, against a real encrypted DB.
// Run: node scripts/test-settlement-rules.mjs   (part of npm run test:native)
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(join(root, 'desktop', 'engine'), { recursive: true });
cpSync(join(root, 'src', 'engine.js'), join(root, 'desktop', 'engine', 'engine.mjs'));
const work = mkdtempSync(join(tmpdir(), 'fame-rules-'));
const worker = new Worker(join(root, 'desktop', 'db-worker.mjs'), { workerData: { dataDir: join(work, 'data'), backupDir: join(work, 'b') } });
let next = 1;
const pending = new Map();
worker.on('message', (m) => { if (m.event) return; const p = pending.get(m.id); pending.delete(m.id); m.ok ? p.res(m.result) : p.rej(new Error(m.error)); });
const call = (op, args) => new Promise((res, rej) => { const id = next++; pending.set(id, { res, rej }); worker.postMessage({ id, op, args }); });
const db = (type, payload) => call('db', { type, payload });
let step = 0;
const ok = (m) => console.log(`  ok ${++step} - ${m}`);
const D = '2026-07-01';

try {
  await call('create', { passphrase: 'rules test 2026' });
  let snap = await db('snapshot');
  const code = (c) => snap.accounts.find((a) => a.code === c).id;
  const row = (level, c) => snap.coaRows.find((r) => r.level === level && r.code === c);

  // ---- built-in chart protection
  const recv = row('head', '102000');
  assert.equal(recv.isBuiltIn, true);
  await assert.rejects(db('saveCoaItem', { level: 'head', id: recv.id, typeId: recv.typeId, code: '102500', name: recv.name }), /built in/);
  await assert.rejects(db('saveCoaItem', { level: 'head', id: recv.id, typeId: 'liability', code: '102000', name: recv.name }), /built in/);
  await db('saveCoaItem', { level: 'head', id: recv.id, typeId: recv.typeId, code: '102000', name: 'Sundry Debtors' });
  const gst = row('account', '202101');
  await assert.rejects(db('saveCoaItem', { level: 'account', id: gst.id, subheadId: gst.subheadId, code: '202109', name: 'CGST' }), /built in/);
  await assert.rejects(db('deleteCoaItem', { level: 'account', id: code('102101') }), /built-in/);
  await assert.rejects(db('deleteCoaItem', { level: 'subhead', id: row('subhead', '102100').id }), /built-in|accounts/);
  ok('built-in heads/sub-heads/accounts: code, type, parent locked and not deletable; renaming 102000 allowed');

  // a customer under a user-created sub-head of Receivables
  await db('saveCoaItem', { level: 'subhead', headId: recv.id, code: '102200', name: 'Retail Debtors' });
  snap = await db('snapshot');
  await db('saveCoaItem', { level: 'account', subheadId: snap.subheads.find((s) => s.code === '102200').id, code: '102201', name: 'Ravi Traders', isPersonal: true });
  snap = await db('snapshot');
  const ravi = code('102201');
  await db('saveProduct', { name: 'Consulting', kind: 'service', gstRate: 0, purchaseAccountId: code('501101'), salesAccountId: code('402101') });
  const prod = (await db('snapshot')).products[0].id;
  const inv1 = (await db('saveVoucher', { type: 'sales', voucherDate: D, partyAccountId: ravi, items: [{ productId: prod, quantity: 1, taxableMinor: 1000000 }] })).id;
  const inv2 = (await db('saveVoucher', { type: 'sales', voucherDate: D, partyAccountId: ravi, items: [{ productId: prod, quantity: 1, taxableMinor: 500000 }] })).id;
  const receipt = (amount, extra = {}) => ({
    type: 'receipt', voucherDate: D,
    lines: [{ accountId: code('101101'), debitMinor: amount, creditMinor: 0 }, { accountId: ravi, debitMinor: 0, creditMinor: amount }],
    ...extra
  });

  // ---- party selected: amount must equal the invoices adjusted
  await assert.rejects(db('saveVoucher', receipt(1050000, { partyAccountId: ravi, allocations: [{ invoiceVoucherId: inv1, amountMinor: 1000000 }] })), /must equal the bills adjusted/);
  await assert.rejects(db('saveVoucher', receipt(1000000, { partyAccountId: ravi, allocations: [] })), /must equal/);
  const r1 = (await db('saveVoucher', receipt(1000000, { partyAccountId: ravi, allocations: [{ invoiceVoucherId: inv1, amountMinor: 1000000 }] }))).id;
  ok('customer selected: 10,500 against a 10,000 invoice refused; exact 10,000 accepted');

  // ---- no party: an unadjusted receipt crediting the customer's account
  await assert.rejects(db('saveVoucher', receipt(200000, { allocations: [{ invoiceVoucherId: inv2, amountMinor: 200000 }] })), /Select the customer/);
  const r2 = (await db('saveVoucher', receipt(200000))).id;
  const rent = (await db('saveVoucher', {
    type: 'payment', voucherDate: D,
    lines: [{ accountId: code('502101'), debitMinor: 300000, creditMinor: 0 }, { accountId: code('101101'), debitMinor: 0, creditMinor: 300000 }]
  })).id;
  assert.ok(r2 && rent);
  ok('no party: unadjusted receipt from the customer saved; plain rent payment (no supplier) also saves now');

  // ---- FIFO picks up the unadjusted receipt
  const fifo = await db('autoAllocatePartySettlements', { accountId: ravi, throughDate: D });
  assert.equal(fifo.amountMinor, 200000);
  let bills = await db('openBills', { settlementType: 'receipt', partyAccountId: ravi, settlementDate: D });
  assert.deepEqual(bills.map((b) => b.outstandingMinor), [300000]);
  ok('FIFO adjusts the unadjusted 2,000 receipt to invoice 2 (outstanding 5,000 → 3,000)');

  // editing that unadjusted receipt keeps the FIFO adjustment, but cannot go below it
  await db('saveVoucher', { id: r2, ...receipt(250000), narration: 'edited' });
  bills = await db('openBills', { settlementType: 'receipt', partyAccountId: ravi, settlementDate: D });
  assert.deepEqual(bills.map((b) => b.outstandingMinor), [300000]);
  await assert.rejects(db('saveVoucher', { id: r2, ...receipt(100000) }), /already adjusted to bills \(FIFO\)/);
  ok('editing a FIFO-adjusted unadjusted receipt keeps its adjustment; reducing below it is refused');

  // clearing the customer on a hand-adjusted receipt drops its adjustments
  await db('saveVoucher', { id: r1, ...receipt(1000000) });
  bills = await db('openBills', { settlementType: 'receipt', partyAccountId: ravi, settlementDate: D });
  assert.deepEqual(bills.map((b) => b.outstandingMinor).sort(), [1000000, 300000].sort());
  ok('clearing the customer on a hand-adjusted receipt releases invoice 1 again');
  console.log(`\nAll ${step} checks passed.`);
} finally {
  await worker.terminate();
  rmSync(work, { recursive: true, force: true });
}
