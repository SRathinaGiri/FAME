import { dbCall } from './db-client.js';
import { decryptBackup, encryptBackup } from './crypto.js';

const moneyFormatter = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const timeZoneLocale = {
  'Asia/Calcutta': 'en-IN',
  'Asia/Kolkata': 'en-IN',
  'Asia/Colombo': 'en-LK',
  'Asia/Dhaka': 'en-BD',
  'Asia/Karachi': 'en-PK',
  'Asia/Kathmandu': 'en-NP',
  'Europe/London': 'en-GB',
  'Australia/Sydney': 'en-AU',
  'Pacific/Auckland': 'en-NZ'
};
const deviceTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const appLocale = timeZoneLocale[deviceTimeZone] || navigator.languages?.[0] || navigator.language || 'en-IN';
const dateFormatter = new Intl.DateTimeFormat(appLocale, { day: '2-digit', month: '2-digit', year: 'numeric' });

const state = {
  accountTypes: [],
  heads: [],
  subheads: [],
  accounts: [],
  coaRows: [],
  tags: [],
  coaTags: { head: {}, subhead: {}, account: {} },
  voucherTags: {},
  recent: [],
  vouchers: [],
  trialBalance: [],
  editingVoucherId: null,
  activeReport: 'daybook',
  reportExport: null,
  serviceWorkerReloaded: sessionStorage.getItem('fame-sw-reloaded') === '1',
  installPrompt: null
};

const els = {
  storageStatus: document.querySelector('#storageStatus'),
  viewTitle: document.querySelector('#viewTitle'),
  navTabs: document.querySelectorAll('.nav-tab'),
  views: document.querySelectorAll('.view'),
  totalDebit: document.querySelector('#totalDebit'),
  totalCredit: document.querySelector('#totalCredit'),
  balanceStatus: document.querySelector('#balanceStatus'),
  accountCount: document.querySelector('#accountCount'),
  recentVouchers: document.querySelector('#recentVouchers'),
  trialBalanceRows: document.querySelector('#trialBalanceRows'),
  accountTree: document.querySelector('#accountTree'),
  headForm: document.querySelector('#headForm'),
  headItemId: document.querySelector('#headItemId'),
  headType: document.querySelector('#headType'),
  headCode: document.querySelector('#headCode'),
  headName: document.querySelector('#headName'),
  headTags: document.querySelector('#headTags'),
  deleteHead: document.querySelector('#deleteHead'),
  clearHead: document.querySelector('#clearHead'),
  subheadForm: document.querySelector('#subheadForm'),
  subheadItemId: document.querySelector('#subheadItemId'),
  subheadType: document.querySelector('#subheadType'),
  subheadHead: document.querySelector('#subheadHead'),
  subheadCode: document.querySelector('#subheadCode'),
  subheadName: document.querySelector('#subheadName'),
  subheadTags: document.querySelector('#subheadTags'),
  deleteSubhead: document.querySelector('#deleteSubhead'),
  clearSubhead: document.querySelector('#clearSubhead'),
  postingAccountForm: document.querySelector('#postingAccountForm'),
  accountItemId: document.querySelector('#accountItemId'),
  accountEntryType: document.querySelector('#accountEntryType'),
  accountEntryHead: document.querySelector('#accountEntryHead'),
  accountEntrySubhead: document.querySelector('#accountEntrySubhead'),
  accountEntryCode: document.querySelector('#accountEntryCode'),
  accountEntryName: document.querySelector('#accountEntryName'),
  accountEntryTags: document.querySelector('#accountEntryTags'),
  deleteAccount: document.querySelector('#deleteAccount'),
  clearAccount: document.querySelector('#clearAccount'),
  reportTabs: document.querySelectorAll('.report-tab'),
  reportForm: document.querySelector('#reportForm'),
  reportAccountField: document.querySelector('#reportAccountField'),
  reportAccount: document.querySelector('#reportAccount'),
  reportFromField: document.querySelector('#reportFromField'),
  reportFromDate: document.querySelector('#reportFromDate'),
  reportToField: document.querySelector('#reportToField'),
  reportToDate: document.querySelector('#reportToDate'),
  reportAsOfField: document.querySelector('#reportAsOfField'),
  reportAsOfDate: document.querySelector('#reportAsOfDate'),
  reportTitle: document.querySelector('#reportTitle'),
  reportMeta: document.querySelector('#reportMeta'),
  reportSummary: document.querySelector('#reportSummary'),
  reportContent: document.querySelector('#reportContent'),
  exportReportExcel: document.querySelector('#exportReportExcel'),
  exportReportPdf: document.querySelector('#exportReportPdf'),
  reportDrilldown: document.querySelector('#reportDrilldown'),
  drilldownTitle: document.querySelector('#drilldownTitle'),
  drilldownMeta: document.querySelector('#drilldownMeta'),
  drilldownContent: document.querySelector('#drilldownContent'),
  closeDrilldown: document.querySelector('#closeDrilldown'),
  voucherForm: document.querySelector('#voucherForm'),
  voucherType: document.querySelector('#voucherType'),
  voucherDate: document.querySelector('#voucherDate'),
  referenceNo: document.querySelector('#referenceNo'),
  invoiceNo: document.querySelector('#invoiceNo'),
  invoiceDate: document.querySelector('#invoiceDate'),
  narration: document.querySelector('#narration'),
  voucherTags: document.querySelector('#voucherTags'),
  voucherEditSelect: document.querySelector('#voucherEditSelect'),
  voucherLines: document.querySelector('#voucherLines'),
  voucherBalance: document.querySelector('#voucherBalance'),
  addLine: document.querySelector('#addLine'),
  deleteVoucher: document.querySelector('#deleteVoucher'),
  clearVoucher: document.querySelector('#clearVoucher'),
  exportForm: document.querySelector('#exportForm'),
  importForm: document.querySelector('#importForm'),
  exportPassword: document.querySelector('#exportPassword'),
  importPassword: document.querySelector('#importPassword'),
  importFile: document.querySelector('#importFile'),
  tagList: document.querySelector('#tagList'),
  tagForm: document.querySelector('#tagForm'),
  tagName: document.querySelector('#tagName'),
  tagColor: document.querySelector('#tagColor'),
  tagAssignmentForm: document.querySelector('#tagAssignmentForm'),
  tagTargetType: document.querySelector('#tagTargetType'),
  tagTarget: document.querySelector('#tagTarget'),
  tagAssignmentTags: document.querySelector('#tagAssignmentTags'),
  installButton: document.querySelector('#installButton'),
  toast: document.querySelector('#toast')
};

function minorToMoney(value) {
  return moneyFormatter.format(Number(value || 0) / 100);
}

function minorToNumber(value) {
  return Number(value || 0) / 100;
}

function formatDate(value) {
  if (!value) return '';
  const [year, month, day] = String(value).split('-').map(Number);
  if (!year || !month || !day) return value;
  return dateFormatter.format(new Date(year, month - 1, day));
}

function todayIso() {
  const today = new Date();
  const local = new Date(today.getTime() - today.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function yearStartIso() {
  return `${todayIso().slice(0, 4)}-01-01`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function dateRangeLabel(fromDate, toDate) {
  if (fromDate && toDate) return `${formatDate(fromDate)} to ${formatDate(toDate)}`;
  if (fromDate) return `From ${formatDate(fromDate)}`;
  if (toDate) return `Up to ${formatDate(toDate)}`;
  return 'All dates';
}

function balanceText(value) {
  const amount = Number(value || 0);
  if (amount === 0) return '0.00';
  return `${minorToMoney(Math.abs(amount))} ${amount > 0 ? 'Dr' : 'Cr'}`;
}

function moneyToMinor(value) {
  const numeric = Number(String(value || '').replace(/,/g, '').trim());
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric * 100) : 0;
}

function selectedValues(select) {
  return [...select.selectedOptions].map((option) => option.value).filter(Boolean);
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.add('hidden'), 3200);
}

function renderOptions(select, rows, { label, value = (row) => row.id, empty = null, selected = null } = {}) {
  select.innerHTML = '';
  if (empty) select.append(new Option(empty, ''));
  for (const row of rows) {
    const option = new Option(label(row), value(row));
    if (selected && option.value === selected) option.selected = true;
    select.append(option);
  }
}

function renderTagOptions(select, selectedIds = []) {
  renderOptions(select, state.tags, {
    label: (tag) => tag.name,
    selected: null
  });
  const selected = new Set(selectedIds);
  for (const option of select.options) option.selected = selected.has(option.value);
}

function renderTagChips(tagIds = []) {
  if (!tagIds.length) return '';
  return tagIds
    .map((tagId) => state.tags.find((tag) => tag.id === tagId))
    .filter(Boolean)
    .map((tag) => `<span class="tag-chip" style="--tag-color:${tag.color}">${tag.name}</span>`)
    .join('');
}

function accountLabel(account) {
  return `${account.code} - ${account.name}`;
}

function accountMatchesFilter(account, filter) {
  if (!filter || filter === 'all') return true;
  if (filter === 'cashBank') return account.headCode === '101000';
  if (filter === 'purchase') return account.typeId === 'expense' && account.headCode === '501000';
  if (filter === 'sales') return account.typeId === 'income' && ['401000', '402000'].includes(account.headCode);
  return true;
}

function renderAccountOptions(select, { filter = 'all', preferredCodes = [] } = {}) {
  const accounts = state.accounts.filter((account) => accountMatchesFilter(account, filter));
  const preferred = preferredCodes.map((code) => accounts.find((account) => account.code === code)).filter(Boolean);
  const rest = accounts.filter((account) => !preferred.includes(account));
  renderOptions(select, [...preferred, ...rest], { label: accountLabel, empty: 'Select account' });
}

function currentCoaTagIds(level, id) {
  return state.coaTags[level]?.[id] || [];
}

function headsForType(typeId) {
  return state.heads.filter((head) => !typeId || head.typeId === typeId);
}

function subheadsForHead(headId) {
  return state.subheads.filter((subhead) => !headId || subhead.headId === headId);
}

function renderHeadOptions(select, typeId, selected = null) {
  renderOptions(select, headsForType(typeId), { label: (head) => `${head.code} - ${head.name}`, selected });
}

function renderSubheadOptions(select, headId, selected = null) {
  renderOptions(select, subheadsForHead(headId), { label: (subhead) => `${subhead.code} - ${subhead.name}`, selected });
}

async function suggestCode(level, controls) {
  const payload = { level, typeId: controls.type?.value, headId: controls.head?.value, subheadId: controls.subhead?.value };
  const result = await dbCall('suggestCoaCode', payload);
  controls.code.value = result.code;
  controls.code.placeholder = result.code;
}

const coaForms = {
  head: () => ({
    form: els.headForm,
    id: els.headItemId,
    type: els.headType,
    code: els.headCode,
    name: els.headName,
    tags: els.headTags,
    deleteButton: els.deleteHead
  }),
  subhead: () => ({
    form: els.subheadForm,
    id: els.subheadItemId,
    type: els.subheadType,
    head: els.subheadHead,
    code: els.subheadCode,
    name: els.subheadName,
    tags: els.subheadTags,
    deleteButton: els.deleteSubhead
  }),
  account: () => ({
    form: els.postingAccountForm,
    id: els.accountItemId,
    type: els.accountEntryType,
    head: els.accountEntryHead,
    subhead: els.accountEntrySubhead,
    code: els.accountEntryCode,
    name: els.accountEntryName,
    tags: els.accountEntryTags,
    deleteButton: els.deleteAccount
  })
};

function updateCoaButtons() {
  for (const level of ['head', 'subhead', 'account']) {
    const controls = coaForms[level]();
    controls.deleteButton.disabled = !controls.id.value;
  }
}

function clearCoaForm(level) {
  const controls = coaForms[level]();
  controls.form.reset();
  controls.id.value = '';
  controls.code.disabled = false;
  if (controls.subhead) controls.subhead.disabled = false;
  renderCoaMasters();
}

function renderCoaMasters() {
  renderOptions(els.headType, state.accountTypes, { label: (type) => type.name });
  renderOptions(els.subheadType, state.accountTypes, { label: (type) => type.name });
  renderHeadOptions(els.subheadHead, els.subheadType.value);
  renderOptions(els.accountEntryType, state.accountTypes, { label: (type) => type.name });
  renderHeadOptions(els.accountEntryHead, els.accountEntryType.value);
  renderSubheadOptions(els.accountEntrySubhead, els.accountEntryHead.value);
  renderTagOptions(els.headTags);
  renderTagOptions(els.subheadTags);
  renderTagOptions(els.accountEntryTags);
  updateCoaButtons();
  if (!els.headItemId.value) suggestCode('head', coaForms.head()).catch(() => undefined);
  if (!els.subheadItemId.value) suggestCode('subhead', coaForms.subhead()).catch(() => undefined);
  if (!els.accountItemId.value) suggestCode('account', coaForms.account()).catch(() => undefined);
}

function fillCoaForm(row) {
  if (!row || row.level === 'type') return;
  const controls = coaForms[row.level]();
  controls.id.value = row.id;
  if (row.level === 'head') {
    controls.type.value = row.typeId;
  } else if (row.level === 'subhead') {
    const head = state.heads.find((item) => item.id === row.headId);
    controls.type.value = head?.typeId || '';
    renderHeadOptions(controls.head, controls.type.value, row.headId);
  } else {
    const subhead = state.subheads.find((item) => item.id === row.subheadId);
    const head = state.heads.find((item) => item.id === subhead?.headId);
    controls.type.value = head?.typeId || '';
    renderHeadOptions(controls.head, controls.type.value, head?.id || '');
    renderSubheadOptions(controls.subhead, controls.head.value, row.subheadId);
  }
  controls.code.value = row.code;
  controls.name.value = row.name;
  renderTagOptions(controls.tags, currentCoaTagIds(row.level, row.id));
  const lockAccountStructure = row.level === 'account' && row.hasTransactions;
  controls.code.disabled = lockAccountStructure;
  if (controls.subhead) controls.subhead.disabled = lockAccountStructure;
  updateCoaButtons();
  controls.form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderTree() {
  const typeRows = state.coaRows.filter((row) => row.level === 'type');
  els.accountTree.innerHTML = typeRows
    .map((type) => treeDetails(type, state.coaRows.filter((head) => head.level === 'head' && head.parentId === type.id)))
    .join('');
  els.accountTree.querySelectorAll('.tree-action').forEach((button) => {
    button.addEventListener('click', () => fillCoaForm(state.coaRows.find((row) => row.level === button.dataset.level && row.id === button.dataset.id)));
  });
}

function levelLabel(level) {
  return { type: 'Type', head: 'Head', subhead: 'Sub-head', account: 'Account' }[level] || level;
}

function treeDetails(row, children) {
  const isType = row.level === 'type';
  const isLeaf = !children.length;
  const tagIds = isType ? [] : currentCoaTagIds(row.level, row.id);
  const childMarkup = children.map((child) => {
    const childRows =
      child.level === 'head'
        ? state.coaRows.filter((subhead) => subhead.level === 'subhead' && subhead.parentId === child.id)
        : state.coaRows.filter((account) => account.level === 'account' && account.parentId === child.id);
    return treeDetails(child, childRows);
  }).join('');
  const content = `
    <summary class="tree-summary ${row.level}">
      <span class="tree-caret">${isLeaf ? '' : '>'}</span>
      <button class="tree-action" type="button" data-level="${row.level}" data-id="${row.id}" ${isType ? 'disabled' : ''}>
        <span class="account-code">${row.code}</span>
        <span>${row.name}</span>
        <span class="account-type">${levelLabel(row.level)}</span>
        <span class="tag-cell">${renderTagChips(tagIds)}</span>
      </button>
    </summary>
    ${childMarkup ? `<div class="tree-children">${childMarkup}</div>` : ''}
  `;
  return `<details class="tree-node ${row.level}" ${isType ? 'open' : ''}>${content}</details>`;
}

function renderDashboard() {
  const totalDebit = state.trialBalance.reduce((sum, row) => sum + Number(row.debitMinor || 0), 0);
  const totalCredit = state.trialBalance.reduce((sum, row) => sum + Number(row.creditMinor || 0), 0);
  els.totalDebit.textContent = minorToMoney(totalDebit);
  els.totalCredit.textContent = minorToMoney(totalCredit);
  els.balanceStatus.textContent = totalDebit === totalCredit ? 'Balanced' : minorToMoney(totalDebit - totalCredit);
  els.balanceStatus.classList.toggle('danger-text', totalDebit !== totalCredit);
  els.accountCount.textContent = String(state.accounts.length);
  els.recentVouchers.innerHTML = state.recent.length
    ? state.recent
        .map((voucher) => `
          <tr>
            <td>${voucher.voucherNo}</td>
            <td>${formatDate(voucher.voucherDate)}</td>
            <td class="capitalize">${voucher.type}</td>
            <td>${renderTagChips(state.voucherTags[voucher.id] || [])}</td>
            <td class="amount">${minorToMoney(voucher.amountMinor)}</td>
          </tr>
        `)
        .join('')
    : '<tr><td colspan="5" class="empty">No vouchers posted yet.</td></tr>';
  els.trialBalanceRows.innerHTML = state.trialBalance.length
    ? state.trialBalance
        .map((row) => `
          <tr>
            <td>${row.code} - ${row.name}</td>
            <td class="amount">${minorToMoney(row.debitMinor)}</td>
            <td class="amount">${minorToMoney(row.creditMinor)}</td>
          </tr>
        `)
        .join('')
    : '<tr><td colspan="3" class="empty">No postings yet.</td></tr>';
}

function reportTable(headers, body) {
  return `
    <table>
      <thead><tr>${headers.map((header) => `<th class="${header.amount ? 'amount' : ''}">${escapeHtml(header.label)}</th>`).join('')}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

function reportKpis(items) {
  els.reportSummary.innerHTML = items
    .map((item) => `<div class="report-kpi"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></div>`)
    .join('');
}

function voucherButton(row) {
  return `<button class="report-link voucher-link" type="button" data-voucher-id="${row.voucherId}">${escapeHtml(row.voucherNo)}</button>`;
}

function accountButton(row) {
  return `<button class="report-link account-drill" type="button" data-account-id="${row.accountId}">${escapeHtml(row.accountCode)} - ${escapeHtml(row.accountName)}</button>`;
}

function bindReportLinks(container) {
  container.querySelectorAll('.account-drill').forEach((button) => {
    button.addEventListener('click', () => openAccountDrilldown(button.dataset.accountId));
  });
  container.querySelectorAll('.voucher-link').forEach((button) => {
    button.addEventListener('click', () => {
      fillVoucherForm(button.dataset.voucherId);
      switchView('entries');
    });
  });
}

function renderDaybook(data) {
  els.reportTitle.textContent = 'Daybook';
  els.reportMeta.textContent = dateRangeLabel(els.reportFromDate.value, els.reportToDate.value);
  reportKpis([
    { label: 'Debit', value: minorToMoney(data.totals.debitMinor) },
    { label: 'Credit', value: minorToMoney(data.totals.creditMinor) }
  ]);
  const body = data.rows.length
    ? data.rows.map((row) => `
        <tr>
          <td>${formatDate(row.voucherDate)}</td>
          <td>${voucherButton(row)}</td>
          <td class="capitalize">${escapeHtml(row.type)}</td>
          <td>${escapeHtml(row.accountCode)} - ${escapeHtml(row.accountName)}</td>
          <td>${escapeHtml(row.description || row.narration || '')}</td>
          <td class="amount">${row.debitMinor ? minorToMoney(row.debitMinor) : ''}</td>
          <td class="amount">${row.creditMinor ? minorToMoney(row.creditMinor) : ''}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="7" class="empty">No transactions in this period.</td></tr>';
  els.reportContent.innerHTML = reportTable(
    [{ label: 'Date' }, { label: 'Voucher' }, { label: 'Type' }, { label: 'Account' }, { label: 'Details' }, { label: 'Debit', amount: true }, { label: 'Credit', amount: true }],
    body
  );
  state.reportExport = {
    title: 'Daybook',
    meta: els.reportMeta.textContent,
    headers: ['Date', 'Voucher', 'Type', 'Account', 'Details', 'Debit', 'Credit'],
    rows: data.rows.map((row) => [
      formatDate(row.voucherDate),
      row.voucherNo,
      row.type,
      `${row.accountCode} - ${row.accountName}`,
      row.description || row.narration || '',
      minorToNumber(row.debitMinor),
      minorToNumber(row.creditMinor)
    ])
  };
  bindReportLinks(els.reportContent);
}

function ledgerTable(data) {
  const openingRow = `
    <tr class="report-group-row">
      <td></td><td></td><td></td><td>Opening Balance</td><td></td><td></td>
      <td class="amount">${balanceText(data.openingBalanceMinor)}</td>
    </tr>
  `;
  const rows = data.rows.map((row) => `
    <tr>
      <td>${formatDate(row.voucherDate)}</td>
      <td>${voucherButton(row)}</td>
      <td class="capitalize">${escapeHtml(row.type)}</td>
      <td>${escapeHtml(row.description || row.narration || '')}</td>
      <td class="amount">${row.debitMinor ? minorToMoney(row.debitMinor) : ''}</td>
      <td class="amount">${row.creditMinor ? minorToMoney(row.creditMinor) : ''}</td>
      <td class="amount">${balanceText(row.runningBalanceMinor)}</td>
    </tr>
  `).join('');
  const closingRow = `
    <tr class="report-total-row">
      <td colspan="6">Closing Balance</td>
      <td class="amount">${balanceText(data.closingBalanceMinor)}</td>
    </tr>
  `;
  return reportTable(
    [{ label: 'Date' }, { label: 'Voucher' }, { label: 'Type' }, { label: 'Particulars' }, { label: 'Debit', amount: true }, { label: 'Credit', amount: true }, { label: 'Balance', amount: true }],
    openingRow + rows + closingRow
  );
}

function renderLedger(data) {
  els.reportTitle.textContent = `Ledger: ${data.account.code} - ${data.account.name}`;
  els.reportMeta.textContent = dateRangeLabel(els.reportFromDate.value, els.reportToDate.value);
  reportKpis([
    { label: 'Opening', value: balanceText(data.openingBalanceMinor) },
    { label: 'Closing', value: balanceText(data.closingBalanceMinor) }
  ]);
  els.reportContent.innerHTML = ledgerTable(data);
  state.reportExport = {
    title: els.reportTitle.textContent,
    meta: els.reportMeta.textContent,
    headers: ['Date', 'Voucher', 'Type', 'Particulars', 'Debit', 'Credit', 'Balance'],
    rows: [
      ['', '', '', 'Opening Balance', '', '', balanceText(data.openingBalanceMinor)],
      ...data.rows.map((row) => [
        formatDate(row.voucherDate),
        row.voucherNo,
        row.type,
        row.description || row.narration || '',
        minorToNumber(row.debitMinor),
        minorToNumber(row.creditMinor),
        balanceText(row.runningBalanceMinor)
      ]),
      ['', '', '', 'Closing Balance', '', '', balanceText(data.closingBalanceMinor)]
    ]
  };
  bindReportLinks(els.reportContent);
}

function groupStatementRows(rows) {
  const heads = new Map();
  for (const row of rows) {
    if (!heads.has(row.headId)) heads.set(row.headId, { id: row.headId, code: row.headCode, name: row.headName, rows: [], subheads: new Map() });
    const head = heads.get(row.headId);
    head.rows.push(row);
    if (!head.subheads.has(row.subheadId)) {
      head.subheads.set(row.subheadId, { id: row.subheadId, code: row.subheadCode, name: row.subheadName, rows: [] });
    }
    head.subheads.get(row.subheadId).rows.push(row);
  }
  return [...heads.values()];
}

function statementSection(label, rows) {
  const exportRows = [];
  const body = [`<tr class="report-total-row"><td>${escapeHtml(label)}</td><td></td></tr>`];
  exportRows.push([label, '']);
  for (const head of groupStatementRows(rows)) {
    const headTotal = head.rows.reduce((sum, row) => sum + Number(row.amountMinor || 0), 0);
    body.push(`<tr class="report-group-row"><td>${escapeHtml(head.code)} - ${escapeHtml(head.name)}</td><td class="amount">${minorToMoney(headTotal)}</td></tr>`);
    exportRows.push([`${head.code} - ${head.name}`, minorToNumber(headTotal)]);
    for (const subhead of head.subheads.values()) {
      const subheadTotal = subhead.rows.reduce((sum, row) => sum + Number(row.amountMinor || 0), 0);
      body.push(`<tr><td class="report-indent-1"><strong>${escapeHtml(subhead.code)} - ${escapeHtml(subhead.name)}</strong></td><td class="amount">${minorToMoney(subheadTotal)}</td></tr>`);
      exportRows.push([`  ${subhead.code} - ${subhead.name}`, minorToNumber(subheadTotal)]);
      for (const row of subhead.rows) {
        body.push(`<tr><td class="report-indent-2">${accountButton(row)}</td><td class="amount">${minorToMoney(row.amountMinor)}</td></tr>`);
        exportRows.push([`    ${row.accountCode} - ${row.accountName}`, minorToNumber(row.amountMinor)]);
      }
    }
  }
  return { html: body.join(''), exportRows };
}

function renderProfitLoss(data) {
  const income = statementSection('Income', data.rows.filter((row) => row.typeId === 'income'));
  const expenses = statementSection('Expenses', data.rows.filter((row) => row.typeId === 'expense'));
  const resultLabel = data.profitMinor >= 0 ? 'Net Profit' : 'Net Loss';
  els.reportTitle.textContent = 'Profit and Loss Account';
  els.reportMeta.textContent = dateRangeLabel(els.reportFromDate.value, els.reportToDate.value);
  reportKpis([
    { label: 'Income', value: minorToMoney(data.incomeMinor) },
    { label: 'Expenses', value: minorToMoney(data.expenseMinor) },
    { label: resultLabel, value: minorToMoney(Math.abs(data.profitMinor)) }
  ]);
  els.reportContent.innerHTML = reportTable(
    [{ label: 'Particulars' }, { label: 'Amount', amount: true }],
    `${income.html}${expenses.html}<tr class="report-total-row"><td>${resultLabel}</td><td class="amount">${minorToMoney(Math.abs(data.profitMinor))}</td></tr>`
  );
  state.reportExport = {
    title: els.reportTitle.textContent,
    meta: els.reportMeta.textContent,
    headers: ['Particulars', 'Amount'],
    rows: [...income.exportRows, ['Total Income', minorToNumber(data.incomeMinor)], ...expenses.exportRows, ['Total Expenses', minorToNumber(data.expenseMinor)], [resultLabel, minorToNumber(Math.abs(data.profitMinor))]]
  };
  bindReportLinks(els.reportContent);
}

function renderBalanceSheet(data) {
  const assets = statementSection('Assets', data.rows.filter((row) => row.typeId === 'asset'));
  const liabilities = statementSection('Liabilities', data.rows.filter((row) => row.typeId === 'liability'));
  const equity = statementSection('Equity', data.rows.filter((row) => row.typeId === 'equity'));
  const difference = data.assetsMinor - data.liabilitiesAndEquityMinor;
  els.reportTitle.textContent = 'Balance Sheet';
  els.reportMeta.textContent = `As at ${formatDate(els.reportAsOfDate.value)}`;
  reportKpis([
    { label: 'Assets', value: minorToMoney(data.assetsMinor) },
    { label: 'Liabilities and Equity', value: minorToMoney(data.liabilitiesAndEquityMinor) },
    { label: 'Difference', value: minorToMoney(difference) }
  ]);
  els.reportContent.innerHTML = reportTable(
    [{ label: 'Particulars' }, { label: 'Amount', amount: true }],
    `${assets.html}
     <tr class="report-total-row"><td>Total Assets</td><td class="amount">${minorToMoney(data.assetsMinor)}</td></tr>
     ${liabilities.html}${equity.html}
     <tr><td class="report-indent-1"><strong>Current Profit / (Loss)</strong></td><td class="amount">${minorToMoney(data.profitMinor)}</td></tr>
     <tr class="report-total-row"><td>Total Liabilities and Equity</td><td class="amount">${minorToMoney(data.liabilitiesAndEquityMinor)}</td></tr>`
  );
  state.reportExport = {
    title: els.reportTitle.textContent,
    meta: els.reportMeta.textContent,
    headers: ['Particulars', 'Amount'],
    rows: [
      ...assets.exportRows,
      ['Total Assets', minorToNumber(data.assetsMinor)],
      ...liabilities.exportRows,
      ...equity.exportRows,
      ['Current Profit / (Loss)', minorToNumber(data.profitMinor)],
      ['Total Liabilities and Equity', minorToNumber(data.liabilitiesAndEquityMinor)],
      ['Difference', minorToNumber(difference)]
    ]
  };
  bindReportLinks(els.reportContent);
}

async function runReport() {
  els.reportDrilldown.classList.add('hidden');
  if (state.activeReport === 'daybook') {
    renderDaybook(await dbCall('reportDaybook', { fromDate: els.reportFromDate.value, toDate: els.reportToDate.value }));
  } else if (state.activeReport === 'ledger') {
    renderLedger(await dbCall('reportLedger', {
      accountId: els.reportAccount.value,
      fromDate: els.reportFromDate.value,
      toDate: els.reportToDate.value
    }));
  } else if (state.activeReport === 'profitLoss') {
    renderProfitLoss(await dbCall('reportProfitLoss', { fromDate: els.reportFromDate.value, toDate: els.reportToDate.value }));
  } else {
    renderBalanceSheet(await dbCall('reportBalanceSheet', { asOfDate: els.reportAsOfDate.value }));
  }
}

function setReportType(type, run = true) {
  state.activeReport = type;
  els.reportTabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.report === type));
  const isLedger = type === 'ledger';
  const isBalanceSheet = type === 'balanceSheet';
  els.reportAccountField.classList.toggle('hidden', !isLedger);
  els.reportFromField.classList.toggle('hidden', isBalanceSheet);
  els.reportToField.classList.toggle('hidden', isBalanceSheet);
  els.reportAsOfField.classList.toggle('hidden', !isBalanceSheet);
  if (run) runReport().catch((error) => showToast(error.message));
}

async function openAccountDrilldown(accountId) {
  const isBalanceSheet = state.activeReport === 'balanceSheet';
  const fromDate = isBalanceSheet ? '' : els.reportFromDate.value;
  const toDate = isBalanceSheet ? els.reportAsOfDate.value : els.reportToDate.value;
  const data = await dbCall('reportLedger', { accountId, fromDate, toDate });
  els.drilldownTitle.textContent = `${data.account.code} - ${data.account.name}`;
  els.drilldownMeta.textContent = dateRangeLabel(fromDate, toDate);
  els.drilldownContent.innerHTML = ledgerTable(data);
  els.reportDrilldown.classList.remove('hidden');
  bindReportLinks(els.drilldownContent);
  els.reportDrilldown.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function safeFilename(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function exportCurrentReportExcel() {
  const report = state.reportExport;
  if (!report) return showToast('Run a report first.');
  const cell = (value, style = '') => {
    const numeric = typeof value === 'number';
    const styleAttribute = style ? ` ss:StyleID="${style}"` : numeric ? ' ss:StyleID="Money"' : '';
    return `<Cell${styleAttribute}><Data ss:Type="${numeric ? 'Number' : 'String'}">${escapeHtml(value)}</Data></Cell>`;
  };
  const headerRow = `<Row>${report.headers.map((header) => cell(header, 'Header')).join('')}</Row>`;
  const bodyRows = report.rows.map((row) => `<Row>${row.map((value) => cell(value)).join('')}</Row>`).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Title"><Font ss:Bold="1" ss:Size="16"/></Style>
  <Style ss:ID="Meta"><Font ss:Color="#667085"/></Style>
  <Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#DCE6F2" ss:Pattern="Solid"/></Style>
  <Style ss:ID="Money"><NumberFormat ss:Format="#,##0.00"/></Style>
 </Styles>
 <Worksheet ss:Name="${escapeHtml(report.title.slice(0, 31))}">
  <Table>
   <Row>${cell(report.title, 'Title')}</Row>
   <Row>${cell(report.meta, 'Meta')}</Row>
   ${headerRow}
   ${bodyRows}
  </Table>
 </Worksheet>
</Workbook>`;
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeFilename(report.title)}-${todayIso()}.xls`;
  link.click();
  URL.revokeObjectURL(url);
}

async function exportCurrentReportPdf() {
  const report = state.reportExport;
  if (!report) return showToast('Run a report first.');
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const document = new jsPDF({ orientation: report.headers.length > 5 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  document.setFontSize(16);
  document.text(report.title, 40, 40);
  document.setFontSize(10);
  document.setTextColor(102, 112, 133);
  document.text(report.meta, 40, 58);
  autoTable(document, {
    startY: 72,
    head: [report.headers],
    body: report.rows.map((row) => row.map((value) => typeof value === 'number' ? moneyFormatter.format(value) : String(value ?? ''))),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [31, 58, 95] }
  });
  document.save(`${safeFilename(report.title)}-${todayIso()}.pdf`);
}

function lineDefaultsForType(type) {
  if (type === 'receipt') return [{ accountFilter: 'cashBank', lockedSide: 'debit', preferredCodes: ['101101', '101201'], selectFirst: true }, { lockedSide: 'credit' }];
  if (type === 'payment') return [{ accountFilter: 'cashBank', lockedSide: 'credit', preferredCodes: ['101101', '101201'], selectFirst: true }, { lockedSide: 'debit' }];
  if (type === 'purchase') return [{ accountFilter: 'purchase', lockedSide: 'debit', preferredCodes: ['501101'], selectFirst: true }, { lockedSide: 'credit' }];
  if (type === 'sales') return [{ accountFilter: 'sales', lockedSide: 'credit', preferredCodes: ['401101', '402101'], selectFirst: true }, { lockedSide: 'debit' }];
  return [{}, {}];
}

function addedLineDefaultForType(type) {
  if (type === 'receipt') return { lockedSide: 'credit' };
  if (type === 'payment') return { lockedSide: 'debit' };
  if (type === 'purchase') return { lockedSide: 'credit', preferredCodes: ['201101', '101101', '101201'] };
  if (type === 'sales') return { lockedSide: 'debit', preferredCodes: ['102101', '101101', '101201'] };
  return {};
}

function addVoucherLine(line = {}) {
  const tr = document.createElement('tr');
  tr.dataset.accountFilter = line.accountFilter || 'all';
  tr.dataset.preferredCodes = JSON.stringify(line.preferredCodes || []);
  tr.innerHTML = `
    <td><select class="line-account" required></select></td>
    <td><input class="line-description" value="${line.description || ''}" placeholder="Line note"></td>
    <td><input class="line-debit amount-input" inputmode="decimal" value="${line.debit || ''}" placeholder="0.00" ${line.lockedSide === 'credit' ? 'disabled' : ''}></td>
    <td><input class="line-credit amount-input" inputmode="decimal" value="${line.credit || ''}" placeholder="0.00" ${line.lockedSide === 'debit' ? 'disabled' : ''}></td>
    <td><button class="icon-button remove-line" type="button" title="Remove line">X</button></td>
  `;
  const accountSelect = tr.querySelector('.line-account');
  renderAccountOptions(accountSelect, { filter: tr.dataset.accountFilter, preferredCodes: JSON.parse(tr.dataset.preferredCodes) });
  if (line.accountId) accountSelect.value = line.accountId;
  else if (line.selectFirst && accountSelect.options.length > 1) accountSelect.selectedIndex = 1;
  tr.querySelector('.remove-line').addEventListener('click', () => {
    tr.remove();
    updateVoucherBalance();
  });
  tr.querySelectorAll('input, select').forEach((input) => input.addEventListener('input', updateVoucherBalance));
  els.voucherLines.append(tr);
  updateVoucherBalance();
}

function resetVoucherLinesForType() {
  els.voucherLines.innerHTML = '';
  for (const line of lineDefaultsForType(els.voucherType.value)) addVoucherLine(line);
}

function getVoucherLines() {
  return [...els.voucherLines.querySelectorAll('tr')].map((tr) => ({
    accountId: tr.querySelector('.line-account').value,
    description: tr.querySelector('.line-description').value.trim(),
    debitMinor: tr.querySelector('.line-debit').disabled ? 0 : moneyToMinor(tr.querySelector('.line-debit').value),
    creditMinor: tr.querySelector('.line-credit').disabled ? 0 : moneyToMinor(tr.querySelector('.line-credit').value)
  }));
}

function updateVoucherBalance() {
  const lines = getVoucherLines();
  const debit = lines.reduce((sum, line) => sum + line.debitMinor, 0);
  const credit = lines.reduce((sum, line) => sum + line.creditMinor, 0);
  els.voucherBalance.textContent = debit === credit ? `Balanced ${minorToMoney(debit)}` : `Difference ${minorToMoney(debit - credit)}`;
  els.voucherBalance.classList.toggle('danger', debit !== credit);
}

function renderVoucherSelect() {
  renderOptions(els.voucherEditSelect, state.vouchers, {
    empty: 'New voucher',
    label: (voucher) => `${voucher.voucherNo} - ${formatDate(voucher.voucherDate)} - ${voucher.type}`
  });
}

function resetVoucherForm() {
  state.editingVoucherId = null;
  els.voucherForm.reset();
  els.voucherEditSelect.value = '';
  els.voucherDate.value = todayIso();
  renderTagOptions(els.voucherTags);
  resetVoucherLinesForType();
}

function fillVoucherForm(voucherId) {
  const voucher = state.vouchers.find((item) => item.id === voucherId);
  if (!voucher) return resetVoucherForm();
  state.editingVoucherId = voucher.id;
  els.voucherType.value = voucher.type;
  els.voucherDate.value = voucher.voucherDate;
  els.referenceNo.value = voucher.referenceNo || '';
  els.invoiceNo.value = voucher.invoiceNo || '';
  els.invoiceDate.value = voucher.invoiceDate || '';
  els.narration.value = voucher.narration || '';
  renderTagOptions(els.voucherTags, state.voucherTags[voucher.id] || []);
  els.voucherLines.innerHTML = '';
  voucher.lines.forEach((line) => addVoucherLine({
    accountId: line.accountId,
    description: line.description || '',
    debit: line.debitMinor ? minorToMoney(line.debitMinor) : '',
    credit: line.creditMinor ? minorToMoney(line.creditMinor) : ''
  }));
}

function renderTagList() {
  els.tagList.innerHTML = state.tags.length
    ? state.tags.map((tag) => `<div class="tag-row"><span class="tag-chip" style="--tag-color:${tag.color}">${tag.name}</span><span class="muted-text">${tag.color}</span></div>`).join('')
    : '<div class="empty-list">No tags created yet.</div>';
}

function renderTagTargets() {
  if (els.tagTargetType.value === 'account') {
    const rows = state.coaRows.filter((row) => row.level !== 'type');
    renderOptions(els.tagTarget, rows, { label: (row) => `${row.code} - ${row.name} (${levelLabel(row.level)})`, value: (row) => `${row.level}:${row.id}` });
  } else {
    renderOptions(els.tagTarget, state.vouchers, { label: (voucher) => `${voucher.voucherNo} - ${formatDate(voucher.voucherDate)}`, value: (voucher) => voucher.id });
  }
  renderSelectedTargetTags();
}

function renderSelectedTargetTags() {
  if (els.tagTargetType.value === 'account') {
    const [level, id] = els.tagTarget.value.split(':');
    renderTagOptions(els.tagAssignmentTags, currentCoaTagIds(level, id));
  } else {
    renderTagOptions(els.tagAssignmentTags, state.voucherTags[els.tagTarget.value] || []);
  }
}

async function refreshSnapshot() {
  const snapshot = await dbCall('snapshot');
  const selectedReportAccount = els.reportAccount.value;
  Object.assign(state, {
    accountTypes: snapshot.accountTypes || [],
    heads: snapshot.heads || [],
    subheads: snapshot.subheads || [],
    accounts: snapshot.accounts || [],
    coaRows: snapshot.coaRows || [],
    tags: snapshot.tags || [],
    coaTags: snapshot.coaTags || { head: {}, subhead: {}, account: {} },
    voucherTags: snapshot.voucherTags || {},
    recent: snapshot.recent || [],
    vouchers: snapshot.vouchers || [],
    trialBalance: snapshot.trialBalance || []
  });
  els.storageStatus.textContent = `${snapshot.meta.persistence} | SQLite ${snapshot.meta.sqliteVersion}`;
  renderCoaMasters();
  renderTree();
  renderDashboard();
  renderTagList();
  renderTagOptions(els.voucherTags);
  renderVoucherSelect();
  renderTagTargets();
  renderOptions(els.reportAccount, state.accounts, { label: accountLabel });
  if (selectedReportAccount && state.accounts.some((account) => account.id === selectedReportAccount)) {
    els.reportAccount.value = selectedReportAccount;
  }
}

function switchView(viewName) {
  els.navTabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.view === viewName));
  els.views.forEach((view) => view.classList.toggle('active', view.id === `${viewName}View`));
  els.viewTitle.textContent = [...els.navTabs].find((tab) => tab.dataset.view === viewName)?.textContent || 'F.A.M.E';
  if (viewName === 'reports' && !state.reportExport) runReport().catch((error) => showToast(error.message));
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function saveCoaForm(level) {
  const controls = coaForms[level]();
  await dbCall('saveCoaItem', {
    id: controls.id.value || null,
    level,
    typeId: controls.type?.value,
    headId: controls.head?.value,
    subheadId: controls.subhead?.value,
    code: controls.code.value,
    name: controls.name.value,
    tagIds: selectedValues(controls.tags)
  });
  clearCoaForm(level);
  await refreshSnapshot();
  showToast(`${levelLabel(level)} saved.`);
}

async function deleteCoaForm(level) {
  const controls = coaForms[level]();
  await dbCall('deleteCoaItem', { id: controls.id.value, level });
  clearCoaForm(level);
  await refreshSnapshot();
  showToast(`${levelLabel(level)} deleted.`);
}

function bindEvents() {
  els.navTabs.forEach((tab) => tab.addEventListener('click', () => switchView(tab.dataset.view)));
  els.reportTabs.forEach((tab) => tab.addEventListener('click', () => setReportType(tab.dataset.report)));
  els.reportForm.addEventListener('submit', (event) => {
    event.preventDefault();
    runReport().catch((error) => showToast(error.message));
  });
  els.exportReportExcel.addEventListener('click', () => exportCurrentReportExcel().catch((error) => showToast(error.message)));
  els.exportReportPdf.addEventListener('click', () => exportCurrentReportPdf().catch((error) => showToast(error.message)));
  els.closeDrilldown.addEventListener('click', () => els.reportDrilldown.classList.add('hidden'));
  els.headType.addEventListener('change', () => suggestCode('head', coaForms.head()).catch(() => undefined));
  els.subheadType.addEventListener('change', () => {
    renderHeadOptions(els.subheadHead, els.subheadType.value);
    suggestCode('subhead', coaForms.subhead()).catch(() => undefined);
  });
  els.subheadHead.addEventListener('change', () => suggestCode('subhead', coaForms.subhead()).catch(() => undefined));
  els.accountEntryType.addEventListener('change', () => {
    renderHeadOptions(els.accountEntryHead, els.accountEntryType.value);
    renderSubheadOptions(els.accountEntrySubhead, els.accountEntryHead.value);
    suggestCode('account', coaForms.account()).catch(() => undefined);
  });
  els.accountEntryHead.addEventListener('change', () => {
    renderSubheadOptions(els.accountEntrySubhead, els.accountEntryHead.value);
    suggestCode('account', coaForms.account()).catch(() => undefined);
  });
  els.accountEntrySubhead.addEventListener('change', () => suggestCode('account', coaForms.account()).catch(() => undefined));
  els.clearHead.addEventListener('click', () => clearCoaForm('head'));
  els.clearSubhead.addEventListener('click', () => clearCoaForm('subhead'));
  els.clearAccount.addEventListener('click', () => clearCoaForm('account'));
  els.headForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await saveCoaForm('head');
  });
  els.subheadForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await saveCoaForm('subhead');
  });
  els.postingAccountForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await saveCoaForm('account');
  });
  els.deleteHead.addEventListener('click', () => deleteCoaForm('head'));
  els.deleteSubhead.addEventListener('click', () => deleteCoaForm('subhead'));
  els.deleteAccount.addEventListener('click', () => deleteCoaForm('account'));

  els.voucherType.addEventListener('change', resetVoucherLinesForType);
  els.addLine.addEventListener('click', () => addVoucherLine(addedLineDefaultForType(els.voucherType.value)));
  els.clearVoucher.addEventListener('click', resetVoucherForm);
  els.voucherEditSelect.addEventListener('change', () => fillVoucherForm(els.voucherEditSelect.value));
  els.deleteVoucher.addEventListener('click', async () => {
    if (!state.editingVoucherId) return showToast('Select a voucher first.');
    await dbCall('deleteVoucher', { id: state.editingVoucherId });
    await refreshSnapshot();
    resetVoucherForm();
    showToast('Voucher deleted.');
  });
  els.voucherForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const result = await dbCall('saveVoucher', {
      id: state.editingVoucherId,
      type: els.voucherType.value,
      voucherDate: els.voucherDate.value,
      referenceNo: els.referenceNo.value.trim(),
      invoiceNo: els.invoiceNo.value.trim(),
      invoiceDate: els.invoiceDate.value,
      narration: els.narration.value.trim(),
      tagIds: selectedValues(els.voucherTags),
      lines: getVoucherLines().filter((line) => line.accountId && (line.debitMinor || line.creditMinor))
    });
    await refreshSnapshot();
    resetVoucherForm();
    showToast(result.id ? 'Voucher saved.' : 'Voucher saved.');
  });

  els.tagForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await dbCall('createTag', { name: els.tagName.value, color: els.tagColor.value });
    els.tagForm.reset();
    els.tagColor.value = '#247d68';
    await refreshSnapshot();
    showToast('Tag created.');
  });
  els.tagTargetType.addEventListener('change', renderTagTargets);
  els.tagTarget.addEventListener('change', renderSelectedTargetTags);
  els.tagAssignmentForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (els.tagTargetType.value === 'account') {
      const [entityType, entityId] = els.tagTarget.value.split(':');
      await dbCall('setCoaTags', { entityType, entityId, tagIds: selectedValues(els.tagAssignmentTags) });
    } else {
      await dbCall('setVoucherTags', { voucherId: els.tagTarget.value, tagIds: selectedValues(els.tagAssignmentTags) });
    }
    await refreshSnapshot();
    showToast('Tags saved.');
  });

  els.exportForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    downloadJson(`fame-backup-${todayIso()}.json`, await encryptBackup(await dbCall('exportData'), els.exportPassword.value));
    els.exportForm.reset();
  });
  els.importForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await dbCall('importData', await decryptBackup(JSON.parse(await els.importFile.files[0].text()), els.importPassword.value));
    els.importForm.reset();
    await refreshSnapshot();
    showToast('Backup imported.');
  });
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.installPrompt = event;
    els.installButton.classList.remove('hidden');
  });
  els.installButton.addEventListener('click', async () => {
    if (!state.installPrompt) return;
    state.installPrompt.prompt();
    await state.installPrompt.userChoice;
    state.installPrompt = null;
    els.installButton.classList.add('hidden');
  });
}

async function prepareServiceWorker() {
  if (!('serviceWorker' in navigator)) return true;
  try {
    if (window.crossOriginIsolated) {
      navigator.serviceWorker
        .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
        .catch((error) => console.warn('Service worker registration failed', error));
      return true;
    }
    if (!state.serviceWorkerReloaded) {
      const readyOrTimeout = navigator.serviceWorker
        .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
        .then(() => Promise.race([navigator.serviceWorker.ready, new Promise((resolve) => setTimeout(resolve, 2500))]))
        .catch((error) => console.warn('Service worker registration failed', error));
      readyOrTimeout.finally(() => {
        sessionStorage.setItem('fame-sw-reloaded', '1');
        window.location.reload();
      });
      return false;
    }
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch((error) => console.warn('Service worker registration failed', error));
  } catch (error) {
    console.warn('Service worker registration failed', error);
  }
  return true;
}

async function boot() {
  document.documentElement.lang = appLocale;
  document.querySelectorAll('input[type="date"]').forEach((input) => input.setAttribute('lang', appLocale));
  bindEvents();
  els.voucherDate.value = todayIso();
  els.reportFromDate.value = yearStartIso();
  els.reportToDate.value = todayIso();
  els.reportAsOfDate.value = todayIso();
  setReportType('daybook', false);
  if (!(await prepareServiceWorker())) {
    return;
  }
  await dbCall('init');
  await refreshSnapshot();
  resetVoucherForm();
}

boot().catch((error) => {
  console.error(error);
  els.storageStatus.textContent = error.message;
  showToast(error.message);
});
