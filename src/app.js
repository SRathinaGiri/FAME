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
const indiaStates = [
  ['AP', 'Andhra Pradesh'],
  ['AR', 'Arunachal Pradesh'],
  ['AS', 'Assam'],
  ['BR', 'Bihar'],
  ['CG', 'Chhattisgarh'],
  ['GA', 'Goa'],
  ['GJ', 'Gujarat'],
  ['HR', 'Haryana'],
  ['HP', 'Himachal Pradesh'],
  ['JH', 'Jharkhand'],
  ['KA', 'Karnataka'],
  ['KL', 'Kerala'],
  ['MP', 'Madhya Pradesh'],
  ['MH', 'Maharashtra'],
  ['MN', 'Manipur'],
  ['ML', 'Meghalaya'],
  ['MZ', 'Mizoram'],
  ['NL', 'Nagaland'],
  ['OD', 'Odisha'],
  ['PB', 'Punjab'],
  ['RJ', 'Rajasthan'],
  ['SK', 'Sikkim'],
  ['TN', 'Tamil Nadu'],
  ['TS', 'Telangana'],
  ['TR', 'Tripura'],
  ['UP', 'Uttar Pradesh'],
  ['UK', 'Uttarakhand'],
  ['WB', 'West Bengal'],
  ['AN', 'Andaman and Nicobar Islands'],
  ['CH', 'Chandigarh'],
  ['DN', 'Dadra and Nagar Haveli and Daman and Diu'],
  ['DL', 'Delhi'],
  ['JK', 'Jammu and Kashmir'],
  ['LA', 'Ladakh'],
  ['LD', 'Lakshadweep'],
  ['PY', 'Puducherry']
].map(([code, name]) => ({ code, name }));

const state = {
  accountTypes: [],
  heads: [],
  subheads: [],
  accounts: [],
  products: [],
  hasTransactions: false,
  coaRows: [],
  tags: [],
  coaTags: { head: {}, subhead: {}, account: {} },
  voucherTags: {},
  recent: [],
  vouchers: [],
  trialBalance: [],
  company: {},
  editingVoucherId: null,
  activeReport: 'daybook',
  reportExport: null,
  reportDatesInitialized: false,
  serviceWorkerReloaded: sessionStorage.getItem('fame-sw-reloaded') === '1',
  installPrompt: null
};

const els = {
  storageStatus: document.querySelector('#storageStatus'),
  companyDisplay: document.querySelector('#companyDisplay'),
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
  accountIsPersonal: document.querySelector('#accountIsPersonal'),
  accountPersonalFields: document.querySelector('#accountPersonalFields'),
  accountGstNo: document.querySelector('#accountGstNo'),
  accountPanNo: document.querySelector('#accountPanNo'),
  accountRegistration1: document.querySelector('#accountRegistration1'),
  accountRegistration2: document.querySelector('#accountRegistration2'),
  accountRegistration3: document.querySelector('#accountRegistration3'),
  accountState: document.querySelector('#accountState'),
  deleteAccount: document.querySelector('#deleteAccount'),
  clearAccount: document.querySelector('#clearAccount'),
  reportTabs: document.querySelectorAll('.report-tab'),
  reportForm: document.querySelector('#reportForm'),
  reportAccountField: document.querySelector('#reportAccountField'),
  reportAccount: document.querySelector('#reportAccount'),
  reportTagField: document.querySelector('#reportTagField'),
  reportTag: document.querySelector('#reportTag'),
  reportTagModeField: document.querySelector('#reportTagModeField'),
  reportTagModes: document.querySelectorAll('input[name="reportTagMode"]'),
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
  productList: document.querySelector('#productList'),
  productForm: document.querySelector('#productForm'),
  productId: document.querySelector('#productId'),
  productName: document.querySelector('#productName'),
  productKind: document.querySelector('#productKind'),
  productHsnSac: document.querySelector('#productHsnSac'),
  productGstRate: document.querySelector('#productGstRate'),
  productItcAvailable: document.querySelector('#productItcAvailable'),
  productPurchaseAccount: document.querySelector('#productPurchaseAccount'),
  productSalesAccount: document.querySelector('#productSalesAccount'),
  deleteProduct: document.querySelector('#deleteProduct'),
  clearProduct: document.querySelector('#clearProduct'),
  voucherForm: document.querySelector('#voucherForm'),
  voucherType: document.querySelector('#voucherType'),
  voucherDate: document.querySelector('#voucherDate'),
  referenceNo: document.querySelector('#referenceNo'),
  invoiceNo: document.querySelector('#invoiceNo'),
  invoiceDate: document.querySelector('#invoiceDate'),
  narration: document.querySelector('#narration'),
  voucherTags: document.querySelector('#voucherTags'),
  voucherEditSelect: document.querySelector('#voucherEditSelect'),
  voucherPartyField: document.querySelector('#voucherPartyField'),
  voucherPartyLabel: document.querySelector('#voucherPartyLabel'),
  voucherParty: document.querySelector('#voucherParty'),
  voucherLineEditor: document.querySelector('#voucherLineEditor'),
  voucherLines: document.querySelector('#voucherLines'),
  invoiceItemEditor: document.querySelector('#invoiceItemEditor'),
  invoiceItems: document.querySelector('#invoiceItems'),
  addInvoiceItem: document.querySelector('#addInvoiceItem'),
  invoiceTaxableTotal: document.querySelector('#invoiceTaxableTotal'),
  invoiceCgstTotal: document.querySelector('#invoiceCgstTotal'),
  invoiceSgstTotal: document.querySelector('#invoiceSgstTotal'),
  invoiceIgstTotal: document.querySelector('#invoiceIgstTotal'),
  invoiceGrandTotal: document.querySelector('#invoiceGrandTotal'),
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
  companyForm: document.querySelector('#companyForm'),
  companyName: document.querySelector('#companyName'),
  companyAddress: document.querySelector('#companyAddress'),
  companyState: document.querySelector('#companyState'),
  companyCountry: document.querySelector('#companyCountry'),
  companyGstNo: document.querySelector('#companyGstNo'),
  companyPanNo: document.querySelector('#companyPanNo'),
  companyRegistration1: document.querySelector('#companyRegistration1'),
  companyRegistration2: document.querySelector('#companyRegistration2'),
  companyRegistration3: document.querySelector('#companyRegistration3'),
  companyFinancialYearStart: document.querySelector('#companyFinancialYearStart'),
  companyGstEnabled: document.querySelector('#companyGstEnabled'),
  newCompany: document.querySelector('#newCompany'),
  gstLockNote: document.querySelector('#gstLockNote'),
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

function financialYearStartIso(configuredStart = '') {
  const today = todayIso();
  const [, month = '01', day = '01'] = String(configuredStart || '').split('-');
  const currentYearStart = `${today.slice(0, 4)}-${month}-${day}`;
  return today >= currentYearStart
    ? currentYearStart
    : `${Number(today.slice(0, 4)) - 1}-${month}-${day}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function companyDisplayName() {
  return String(state.company?.name || '').trim() || 'F.A.M.E';
}

function updateCompanyChrome() {
  const name = companyDisplayName();
  els.companyDisplay.textContent = name;
  document.title = name === 'F.A.M.E' ? 'F.A.M.E' : `${name} - F.A.M.E`;
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

function stateLabel(code) {
  const match = indiaStates.find((item) => item.code === code);
  return match ? `${match.name} (${match.code})` : code || '';
}

function renderStateOptions(select, selected = '') {
  renderOptions(select, indiaStates, {
    label: (item) => `${item.name} (${item.code})`,
    value: (item) => item.code,
    empty: 'Select State / UT',
    selected
  });
}

function accountMatchesFilter(account, filter) {
  if (!filter || filter === 'all') return true;
  if (filter === 'cashBank') return account.headCode === '101000';
  if (filter === 'purchase') return account.typeId === 'expense' && account.headCode === '501000';
  if (filter === 'sales') return account.typeId === 'income' && ['401000', '402000'].includes(account.headCode);
  return true;
}

function renderAccountOptions(select, { filter = 'all', preferredCodes = [] } = {}) {
  const accounts = state.accounts.filter((account) => !account.isSystem && accountMatchesFilter(account, filter));
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
    isPersonal: els.accountIsPersonal,
    gstNo: els.accountGstNo,
    panNo: els.accountPanNo,
    registration1: els.accountRegistration1,
    registration2: els.accountRegistration2,
    registration3: els.accountRegistration3,
    state: els.accountState,
    deleteButton: els.deleteAccount
  })
};

function updateCoaButtons() {
  for (const level of ['head', 'subhead', 'account']) {
    const controls = coaForms[level]();
    controls.deleteButton.disabled = !controls.id.value || controls.form.dataset.system === 'true';
  }
}

function clearCoaForm(level) {
  const controls = coaForms[level]();
  controls.form.reset();
  controls.form.dataset.system = 'false';
  controls.id.value = '';
  controls.name.disabled = false;
  controls.code.disabled = false;
  if (controls.subhead) controls.subhead.disabled = false;
  renderCoaMasters();
  if (level === 'account') renderAccountPersonalFields();
}

function renderCoaMasters() {
  renderStateOptions(els.accountState, els.accountState.value);
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
  controls.form.dataset.system = String(Boolean(row.isSystem));
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
  controls.name.disabled = Boolean(row.isSystem);
  if (row.level === 'account') {
    controls.isPersonal.checked = Boolean(row.isPersonal);
    controls.gstNo.value = row.gstNo || '';
    controls.panNo.value = row.panNo || '';
    controls.registration1.value = row.registration1 || '';
    controls.registration2.value = row.registration2 || '';
    controls.registration3.value = row.registration3 || '';
    controls.state.value = row.state || '';
    renderAccountPersonalFields();
  }
  renderTagOptions(controls.tags, currentCoaTagIds(row.level, row.id));
  const lockAccountStructure = row.level === 'account' && (row.hasTransactions || row.isSystem);
  controls.code.disabled = lockAccountStructure;
  if (controls.subhead) controls.subhead.disabled = lockAccountStructure;
  updateCoaButtons();
  controls.form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderAccountPersonalFields() {
  els.accountPersonalFields.classList.toggle('hidden', !els.accountIsPersonal.checked);
}

function renderCompanyMaster() {
  const company = state.company || {};
  els.companyName.value = company.name || '';
  els.companyAddress.value = company.address || '';
  renderStateOptions(els.companyState, company.state || '');
  els.companyCountry.value = company.country || '';
  els.companyGstNo.value = company.gstNo || '';
  els.companyPanNo.value = company.panNo || '';
  els.companyRegistration1.value = company.registration1 || '';
  els.companyRegistration2.value = company.registration2 || '';
  els.companyRegistration3.value = company.registration3 || '';
  els.companyFinancialYearStart.value = company.financialYearStart || `${todayIso().slice(0, 4)}-04-01`;
  els.companyGstEnabled.checked = Boolean(company.gstEnabled);
  els.companyGstEnabled.disabled = state.hasTransactions;
  els.gstLockNote.classList.toggle('hidden', !state.hasTransactions);
}

function clearProductForm() {
  els.productForm.reset();
  els.productId.value = '';
  els.productGstRate.value = '0';
  els.productItcAvailable.checked = true;
  els.deleteProduct.disabled = true;
}

function renderProductMaster() {
  const purchaseAccounts = state.accounts.filter((account) => account.typeId === 'expense' && !account.isSystem);
  const salesAccounts = state.accounts.filter((account) => account.typeId === 'income' && !account.isSystem);
  const selectedPurchase = els.productPurchaseAccount.value;
  const selectedSales = els.productSalesAccount.value;
  document.querySelectorAll('.product-gst-field').forEach((element) => {
    element.classList.toggle('hidden', !state.company.gstEnabled);
  });
  renderOptions(els.productPurchaseAccount, purchaseAccounts, { label: accountLabel });
  renderOptions(els.productSalesAccount, salesAccounts, { label: accountLabel });
  if (purchaseAccounts.some((account) => account.id === selectedPurchase)) els.productPurchaseAccount.value = selectedPurchase;
  if (salesAccounts.some((account) => account.id === selectedSales)) els.productSalesAccount.value = selectedSales;
  els.productList.innerHTML = state.products.length
    ? state.products.map((product) => `
        <button class="product-row" type="button" data-product-id="${product.id}">
          <strong>${escapeHtml(product.name)}</strong>
          <span>${escapeHtml(product.kind)}${state.company.gstEnabled
            ? ` | ${escapeHtml(product.hsnSacCode || 'No HSN/SAC')} | GST ${product.gstRate}%`
            : ''}</span>
        </button>
      `).join('')
    : '<div class="empty-list">No products or services created yet.</div>';
  els.productList.querySelectorAll('.product-row').forEach((button) => {
    button.addEventListener('click', () => {
      const product = state.products.find((item) => item.id === button.dataset.productId);
      if (!product) return;
      els.productId.value = product.id;
      els.productName.value = product.name;
      els.productKind.value = product.kind;
      els.productHsnSac.value = product.hsnSacCode || '';
      els.productGstRate.value = product.gstRate;
      els.productItcAvailable.checked = Boolean(product.itcAvailable);
      els.productPurchaseAccount.value = product.purchaseAccountId;
      els.productSalesAccount.value = product.salesAccountId;
      els.deleteProduct.disabled = false;
    });
  });
  if (!els.productId.value) els.deleteProduct.disabled = true;
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

function renderTaxJournal(data) {
  els.reportTitle.textContent = data.title;
  els.reportMeta.textContent = dateRangeLabel(els.reportFromDate.value, els.reportToDate.value);
  reportKpis([
    { label: 'Taxable', value: minorToMoney(data.totals.taxableMinor) },
    { label: 'CGST', value: minorToMoney(data.totals.cgstMinor) },
    { label: 'SGST', value: minorToMoney(data.totals.sgstMinor) },
    { label: 'IGST', value: minorToMoney(data.totals.igstMinor) },
    { label: 'Total', value: minorToMoney(data.totals.totalMinor) }
  ]);
  const body = data.rows.length
    ? data.rows.map((row) => `
        <tr>
          <td>${formatDate(row.voucherDate)}</td>
          <td>${voucherButton(row)}</td>
          <td>${escapeHtml(row.invoiceNo || row.referenceNo || '')}</td>
          <td>${escapeHtml(row.partyCode ? `${row.partyCode} - ${row.partyName}` : '')}</td>
          <td>${escapeHtml(stateLabel(row.partyState))}</td>
          <td>${escapeHtml(row.productName)}</td>
          <td>${escapeHtml(row.hsnSacCode || '')}</td>
          <td class="amount">${escapeHtml(row.quantity)}</td>
          <td class="amount">${escapeHtml(row.gstRate)}%</td>
          <td class="amount">${minorToMoney(row.taxableMinor)}</td>
          <td class="amount">${row.cgstMinor ? minorToMoney(row.cgstMinor) : ''}</td>
          <td class="amount">${row.sgstMinor ? minorToMoney(row.sgstMinor) : ''}</td>
          <td class="amount">${row.igstMinor ? minorToMoney(row.igstMinor) : ''}</td>
          <td class="amount">${minorToMoney(row.totalMinor)}</td>
        </tr>
      `).join('') + `
        <tr class="report-total-row">
          <td colspan="9">Total</td>
          <td class="amount">${minorToMoney(data.totals.taxableMinor)}</td>
          <td class="amount">${minorToMoney(data.totals.cgstMinor)}</td>
          <td class="amount">${minorToMoney(data.totals.sgstMinor)}</td>
          <td class="amount">${minorToMoney(data.totals.igstMinor)}</td>
          <td class="amount">${minorToMoney(data.totals.totalMinor)}</td>
        </tr>
      `
    : '<tr><td colspan="14" class="empty">No invoice items in this period.</td></tr>';
  const headers = [
    { label: 'Date' },
    { label: 'Voucher' },
    { label: 'Invoice / Ref.' },
    { label: 'Party' },
    { label: 'State' },
    { label: 'Product / Service' },
    { label: 'HSN/SAC' },
    { label: 'Qty', amount: true },
    { label: 'GST %', amount: true },
    { label: 'Taxable', amount: true },
    { label: 'CGST', amount: true },
    { label: 'SGST', amount: true },
    { label: 'IGST', amount: true },
    { label: 'Total', amount: true }
  ];
  els.reportContent.innerHTML = reportTable(headers, body);
  state.reportExport = {
    title: data.title,
    meta: els.reportMeta.textContent,
    headers: headers.map((header) => header.label),
    rows: [
      ...data.rows.map((row) => [
        formatDate(row.voucherDate),
        row.voucherNo,
        row.invoiceNo || row.referenceNo || '',
        row.partyCode ? `${row.partyCode} - ${row.partyName}` : '',
        stateLabel(row.partyState),
        row.productName,
        row.hsnSacCode || '',
        Number(row.quantity || 0),
        `${row.gstRate}%`,
        minorToNumber(row.taxableMinor),
        minorToNumber(row.cgstMinor),
        minorToNumber(row.sgstMinor),
        minorToNumber(row.igstMinor),
        minorToNumber(row.totalMinor)
      ]),
      ['Total', '', '', '', '', '', '', '', '', minorToNumber(data.totals.taxableMinor), minorToNumber(data.totals.cgstMinor), minorToNumber(data.totals.sgstMinor), minorToNumber(data.totals.igstMinor), minorToNumber(data.totals.totalMinor)]
    ]
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

function renderTrialBalance(data) {
  els.reportTitle.textContent = 'Trial Balance';
  els.reportMeta.textContent = `As at ${formatDate(els.reportAsOfDate.value)} | FY from ${formatDate(data.financialYearStart)}`;
  reportKpis([
    { label: 'Opening Debit', value: minorToMoney(data.totals.openingDebitMinor) },
    { label: 'Opening Credit', value: minorToMoney(data.totals.openingCreditMinor) },
    { label: 'CY Debit', value: minorToMoney(data.totals.cyDebitMinor) },
    { label: 'CY Credit', value: minorToMoney(data.totals.cyCreditMinor) },
    { label: 'Closing Debit', value: minorToMoney(data.totals.closingDebitMinor) },
    { label: 'Closing Credit', value: minorToMoney(data.totals.closingCreditMinor) }
  ]);
  const body = data.rows.length
    ? data.rows.map((row) => `
        <tr>
          <td class="amount">${row.slNo}</td>
          <td>${accountButton(row)}</td>
          <td>${escapeHtml(`${row.subheadCode} - ${row.subheadName}`)}</td>
          <td>${escapeHtml(`${row.headCode} - ${row.headName}`)}</td>
          <td>${escapeHtml(row.typeName)}</td>
          <td class="amount">${row.openingDebitMinor ? minorToMoney(row.openingDebitMinor) : ''}</td>
          <td class="amount">${row.openingCreditMinor ? minorToMoney(row.openingCreditMinor) : ''}</td>
          <td class="amount">${row.cyDebitMinor ? minorToMoney(row.cyDebitMinor) : ''}</td>
          <td class="amount">${row.cyCreditMinor ? minorToMoney(row.cyCreditMinor) : ''}</td>
          <td class="amount">${row.closingDebitMinor ? minorToMoney(row.closingDebitMinor) : ''}</td>
          <td class="amount">${row.closingCreditMinor ? minorToMoney(row.closingCreditMinor) : ''}</td>
        </tr>
      `).join('') + `
        <tr class="report-total-row">
          <td colspan="5">Total</td>
          <td class="amount">${minorToMoney(data.totals.openingDebitMinor)}</td>
          <td class="amount">${minorToMoney(data.totals.openingCreditMinor)}</td>
          <td class="amount">${minorToMoney(data.totals.cyDebitMinor)}</td>
          <td class="amount">${minorToMoney(data.totals.cyCreditMinor)}</td>
          <td class="amount">${minorToMoney(data.totals.closingDebitMinor)}</td>
          <td class="amount">${minorToMoney(data.totals.closingCreditMinor)}</td>
        </tr>
      `
    : '<tr><td colspan="11" class="empty">No accounts available.</td></tr>';
  const headers = [
    { label: 'Sl.No.', amount: true },
    { label: 'Name of the Account' },
    { label: 'Sub-Header' },
    { label: 'Header' },
    { label: 'Account Type' },
    { label: 'OpBalDebit', amount: true },
    { label: 'OpBalCredit', amount: true },
    { label: 'CYDebit', amount: true },
    { label: 'CYCredit', amount: true },
    { label: 'ClBalDebit', amount: true },
    { label: 'ClBalCredit', amount: true }
  ];
  els.reportContent.innerHTML = reportTable(headers, body);
  state.reportExport = {
    title: els.reportTitle.textContent,
    meta: els.reportMeta.textContent,
    headers: headers.map((header) => header.label),
    rows: [
      ...data.rows.map((row) => [
        row.slNo,
        `${row.accountCode} - ${row.accountName}`,
        `${row.subheadCode} - ${row.subheadName}`,
        `${row.headCode} - ${row.headName}`,
        row.typeName,
        minorToNumber(row.openingDebitMinor),
        minorToNumber(row.openingCreditMinor),
        minorToNumber(row.cyDebitMinor),
        minorToNumber(row.cyCreditMinor),
        minorToNumber(row.closingDebitMinor),
        minorToNumber(row.closingCreditMinor)
      ]),
      [
        'Total',
        '',
        '',
        '',
        '',
        minorToNumber(data.totals.openingDebitMinor),
        minorToNumber(data.totals.openingCreditMinor),
        minorToNumber(data.totals.cyDebitMinor),
        minorToNumber(data.totals.cyCreditMinor),
        minorToNumber(data.totals.closingDebitMinor),
        minorToNumber(data.totals.closingCreditMinor)
      ]
    ]
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

function selectedTagReportMode() {
  return [...els.reportTagModes].find((input) => input.checked)?.value || 'account';
}

function renderTagReport(data) {
  const modeLabel = data.mode === 'account' ? 'Account based' : 'Transaction based';
  els.reportTitle.textContent = `Tag Report: ${data.tag.name}`;
  els.reportMeta.textContent = `${modeLabel} | ${dateRangeLabel(els.reportFromDate.value, els.reportToDate.value)}`;
  reportKpis([
    { label: 'Debit', value: minorToMoney(data.totals.debitMinor) },
    { label: 'Credit', value: minorToMoney(data.totals.creditMinor) },
    { label: 'Net Balance', value: balanceText(data.totals.balanceMinor) }
  ]);
  const body = data.rows.length
    ? data.rows.map((row) => `
        <tr>
          <td>${accountButton(row)}</td>
          <td class="amount">${minorToMoney(row.debitMinor)}</td>
          <td class="amount">${minorToMoney(row.creditMinor)}</td>
          <td class="amount">${balanceText(row.balanceMinor)}</td>
        </tr>
      `).join('') + `
        <tr class="report-total-row">
          <td>Total</td>
          <td class="amount">${minorToMoney(data.totals.debitMinor)}</td>
          <td class="amount">${minorToMoney(data.totals.creditMinor)}</td>
          <td class="amount">${balanceText(data.totals.balanceMinor)}</td>
        </tr>
      `
    : '<tr><td colspan="4" class="empty">No accounts or transactions found for this tag and period.</td></tr>';
  els.reportContent.innerHTML = reportTable(
    [{ label: 'Account' }, { label: 'Debit', amount: true }, { label: 'Credit', amount: true }, { label: 'Net Balance', amount: true }],
    body
  );
  state.reportExport = {
    title: els.reportTitle.textContent,
    meta: els.reportMeta.textContent,
    headers: ['Account', 'Debit', 'Credit', 'Net Balance'],
    rows: [
      ...data.rows.map((row) => [
        `${row.accountCode} - ${row.accountName}`,
        minorToNumber(row.debitMinor),
        minorToNumber(row.creditMinor),
        balanceText(row.balanceMinor)
      ]),
      ['Total', minorToNumber(data.totals.debitMinor), minorToNumber(data.totals.creditMinor), balanceText(data.totals.balanceMinor)]
    ]
  };
  bindReportLinks(els.reportContent);
}

async function runReport() {
  els.reportDrilldown.classList.add('hidden');
  const taxJournalTypes = {
    salesJournal: 'sales',
    purchaseJournal: 'purchase',
    expenseJournal: 'expense',
    incomeJournal: 'income'
  };
  if (state.activeReport === 'daybook') {
    renderDaybook(await dbCall('reportDaybook', { fromDate: els.reportFromDate.value, toDate: els.reportToDate.value }));
  } else if (taxJournalTypes[state.activeReport]) {
    renderTaxJournal(await dbCall('reportTaxJournal', {
      type: taxJournalTypes[state.activeReport],
      fromDate: els.reportFromDate.value,
      toDate: els.reportToDate.value
    }));
  } else if (state.activeReport === 'ledger') {
    renderLedger(await dbCall('reportLedger', {
      accountId: els.reportAccount.value,
      fromDate: els.reportFromDate.value,
      toDate: els.reportToDate.value
    }));
  } else if (state.activeReport === 'profitLoss') {
    renderProfitLoss(await dbCall('reportProfitLoss', { fromDate: els.reportFromDate.value, toDate: els.reportToDate.value }));
  } else if (state.activeReport === 'trialBalance') {
    renderTrialBalance(await dbCall('reportTrialBalance', { asOfDate: els.reportAsOfDate.value }));
  } else if (state.activeReport === 'tag') {
    if (!els.reportTag.value) {
      els.reportTitle.textContent = 'Tag Report';
      els.reportMeta.textContent = 'Create and select a tag to run this report.';
      els.reportSummary.innerHTML = '';
      els.reportContent.innerHTML = '<div class="empty-list">No tags are available.</div>';
      state.reportExport = null;
      return;
    }
    renderTagReport(await dbCall('reportTag', {
      tagId: els.reportTag.value,
      mode: selectedTagReportMode(),
      fromDate: els.reportFromDate.value,
      toDate: els.reportToDate.value
    }));
  } else {
    renderBalanceSheet(await dbCall('reportBalanceSheet', { asOfDate: els.reportAsOfDate.value }));
  }
}

function setReportType(type, run = true) {
  state.activeReport = type;
  els.reportTabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.report === type));
  const isLedger = type === 'ledger';
  const isAsOfReport = type === 'balanceSheet' || type === 'trialBalance';
  const isTag = type === 'tag';
  const isTaxJournal = ['salesJournal', 'purchaseJournal', 'expenseJournal', 'incomeJournal'].includes(type);
  els.reportAccountField.classList.toggle('hidden', !isLedger);
  els.reportTagField.classList.toggle('hidden', !isTag);
  els.reportTagModeField.classList.toggle('hidden', !isTag);
  els.reportFromField.classList.toggle('hidden', isAsOfReport);
  els.reportToField.classList.toggle('hidden', isAsOfReport);
  els.reportAsOfField.classList.toggle('hidden', !isAsOfReport);
  if (isTaxJournal) els.reportSummary.innerHTML = '';
  if (run) runReport().catch((error) => showToast(error.message));
}

async function openAccountDrilldown(accountId) {
  const isAsOfReport = state.activeReport === 'balanceSheet' || state.activeReport === 'trialBalance';
  const fromDate = isAsOfReport ? '' : els.reportFromDate.value;
  const toDate = isAsOfReport ? els.reportAsOfDate.value : els.reportToDate.value;
  const data = state.activeReport === 'tag'
    ? await dbCall('reportTagTransactions', {
        tagId: els.reportTag.value,
        mode: selectedTagReportMode(),
        accountId,
        fromDate,
        toDate
      })
    : await dbCall('reportLedger', { accountId, fromDate, toDate });
  els.drilldownTitle.textContent = `${data.account.code} - ${data.account.name}`;
  const tagLabel = state.activeReport === 'tag'
    ? `${state.tags.find((tag) => tag.id === els.reportTag.value)?.name || 'Tag'} | `
    : '';
  els.drilldownMeta.textContent = `${tagLabel}${dateRangeLabel(fromDate, toDate)}`;
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
   <Row>${cell(companyDisplayName(), 'Meta')}</Row>
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
  const drawHeader = () => {
    document.setFontSize(11);
    document.setTextColor(31, 58, 95);
    document.text(companyDisplayName(), 40, 30);
    document.setFontSize(15);
    document.setTextColor(23, 32, 47);
    document.text(report.title, 40, 48);
    document.setFontSize(9);
    document.setTextColor(102, 112, 133);
    document.text(report.meta, 40, 63);
  };
  autoTable(document, {
    startY: 78,
    head: [report.headers],
    body: report.rows.map((row) => row.map((value) => typeof value === 'number' ? moneyFormatter.format(value) : String(value ?? ''))),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [31, 58, 95] },
    margin: { top: 78 },
    didDrawPage: drawHeader
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

function isInvoiceType(type = els.voucherType.value) {
  return ['purchase', 'sales', 'expense', 'income'].includes(type);
}

function isOutwardInvoiceType(type = els.voucherType.value) {
  return type === 'sales' || type === 'income';
}

function renderVoucherMode() {
  const invoice = isInvoiceType();
  const gstEnabled = Boolean(state.company.gstEnabled);
  els.voucherLineEditor.classList.toggle('hidden', invoice);
  els.invoiceItemEditor.classList.toggle('hidden', !invoice);
  els.voucherPartyField.classList.toggle('hidden', !invoice);
  els.addLine.classList.toggle('hidden', invoice);
  els.addInvoiceItem.classList.toggle('hidden', !invoice);
  els.voucherPartyLabel.textContent = isOutwardInvoiceType() ? 'Customer' : 'Supplier';
  document.querySelectorAll('.invoice-gst-column').forEach((element) => element.classList.toggle('hidden', !gstEnabled));
  if (invoice) {
    const selectedParty = els.voucherParty.value;
    const partyHeadCode = isOutwardInvoiceType() ? '102000' : '201000';
    const parties = state.accounts.filter((account) =>
      account.isPersonal && !account.isSystem && account.headCode === partyHeadCode
    );
    renderOptions(els.voucherParty, parties, {
      label: (account) => `${accountLabel(account)}${account.state ? ` | ${stateLabel(account.state)}` : ''}`,
      empty: `Select ${isOutwardInvoiceType() ? 'customer' : 'supplier'}`
    });
    if (parties.some((account) => account.id === selectedParty)) els.voucherParty.value = selectedParty;
  }
}

function invoiceIsInterstate() {
  if (!state.company.gstEnabled) return false;
  const party = state.accounts.find((account) => account.id === els.voucherParty.value);
  const companyState = String(state.company.state || '').trim().toLowerCase();
  const partyState = String(party?.state || '').trim().toLowerCase();
  return Boolean(companyState && partyState && companyState !== partyState);
}

function renderApplicableTaxColumns() {
  const gstEnabled = Boolean(state.company.gstEnabled);
  const party = state.accounts.find((account) => account.id === els.voucherParty.value);
  const statesKnown = Boolean(String(state.company.state || '').trim() && String(party?.state || '').trim());
  const interstate = statesKnown && invoiceIsInterstate();
  document.querySelectorAll('.invoice-cgst-column, .invoice-sgst-column').forEach((element) => {
    element.classList.toggle('hidden', !gstEnabled || (statesKnown && interstate));
  });
  document.querySelectorAll('.invoice-igst-column').forEach((element) => {
    element.classList.toggle('hidden', !gstEnabled || (statesKnown && !interstate));
  });
}

function calculateInvoiceItemRow(tr) {
  const product = state.products.find((item) => item.id === tr.querySelector('.item-product').value);
  const taxableMinor = moneyToMinor(tr.querySelector('.item-taxable').value);
  const gstRate = tr.dataset.gstRate === '' ? Number(product?.gstRate || 0) : Number(tr.dataset.gstRate || 0);
  const totalTaxMinor = state.company.gstEnabled ? Math.round(taxableMinor * gstRate / 100) : 0;
  const interstate = invoiceIsInterstate();
  const igstMinor = interstate ? totalTaxMinor : 0;
  const cgstMinor = interstate ? 0 : Math.floor(totalTaxMinor / 2);
  const sgstMinor = interstate ? 0 : totalTaxMinor - cgstMinor;
  tr.dataset.cgstMinor = String(cgstMinor);
  tr.dataset.sgstMinor = String(sgstMinor);
  tr.dataset.igstMinor = String(igstMinor);
  tr.querySelector('.item-cgst').textContent = minorToMoney(cgstMinor);
  tr.querySelector('.item-sgst').textContent = minorToMoney(sgstMinor);
  tr.querySelector('.item-igst').textContent = minorToMoney(igstMinor);
  tr.querySelector('.item-total').textContent = minorToMoney(taxableMinor + totalTaxMinor);
}

function addInvoiceItem(item = {}) {
  const tr = document.createElement('tr');
  tr.dataset.gstRate = item.gstRate == null ? '' : String(item.gstRate);
  tr.innerHTML = `
    <td><select class="item-product" required></select></td>
    <td><input class="item-quantity amount-input" type="number" min="0.0001" step="0.0001" value="${item.quantity || 1}"></td>
    <td><input class="item-taxable amount-input" inputmode="decimal" value="${item.taxableMinor ? minorToMoney(item.taxableMinor) : ''}" placeholder="0.00"></td>
    <td class="item-cgst amount invoice-gst-column invoice-cgst-column">0.00</td>
    <td class="item-sgst amount invoice-gst-column invoice-sgst-column">0.00</td>
    <td class="item-igst amount invoice-gst-column invoice-igst-column">0.00</td>
    <td class="item-total amount">0.00</td>
    <td><button class="icon-button remove-item" type="button" title="Remove item">X</button></td>
  `;
  renderOptions(tr.querySelector('.item-product'), state.products, {
    label: (product) => `${product.name} | ${product.kind}${state.company.gstEnabled ? ` | GST ${product.gstRate}%` : ''}`,
    empty: 'Select product / service'
  });
  if (item.productId) tr.querySelector('.item-product').value = item.productId;
  tr.querySelector('.item-product').addEventListener('change', () => {
    tr.dataset.gstRate = '';
  });
  tr.querySelector('.remove-item').addEventListener('click', () => {
    tr.remove();
    updateInvoiceTotals();
  });
  tr.querySelectorAll('input, select').forEach((control) => {
    control.addEventListener('input', updateInvoiceTotals);
    control.addEventListener('change', updateInvoiceTotals);
  });
  els.invoiceItems.append(tr);
  renderVoucherMode();
  updateInvoiceTotals();
}

function getInvoiceItems() {
  return [...els.invoiceItems.querySelectorAll('tr')].map((tr) => ({
    productId: tr.querySelector('.item-product').value,
    quantity: Number(tr.querySelector('.item-quantity').value || 0),
    taxableMinor: moneyToMinor(tr.querySelector('.item-taxable').value),
    cgstMinor: Number(tr.dataset.cgstMinor || 0),
    sgstMinor: Number(tr.dataset.sgstMinor || 0),
    igstMinor: Number(tr.dataset.igstMinor || 0)
  }));
}

function updateInvoiceTotals() {
  [...els.invoiceItems.querySelectorAll('tr')].forEach(calculateInvoiceItemRow);
  const items = getInvoiceItems();
  const taxable = items.reduce((sum, item) => sum + item.taxableMinor, 0);
  const cgst = items.reduce((sum, item) => sum + item.cgstMinor, 0);
  const sgst = items.reduce((sum, item) => sum + item.sgstMinor, 0);
  const igst = items.reduce((sum, item) => sum + item.igstMinor, 0);
  const total = taxable + cgst + sgst + igst;
  renderApplicableTaxColumns();
  els.invoiceTaxableTotal.textContent = minorToMoney(taxable);
  els.invoiceCgstTotal.textContent = minorToMoney(cgst);
  els.invoiceSgstTotal.textContent = minorToMoney(sgst);
  els.invoiceIgstTotal.textContent = minorToMoney(igst);
  els.invoiceGrandTotal.textContent = minorToMoney(total);
  els.voucherBalance.textContent = `Invoice Total ${minorToMoney(total)}`;
  els.voucherBalance.classList.remove('danger');
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
  els.invoiceItems.innerHTML = '';
  renderVoucherMode();
  if (isInvoiceType()) addInvoiceItem();
  else for (const line of lineDefaultsForType(els.voucherType.value)) addVoucherLine(line);
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
  if (isInvoiceType()) return updateInvoiceTotals();
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
  els.invoiceItems.innerHTML = '';
  renderVoucherMode();
  if (isInvoiceType(voucher.type)) {
    els.voucherParty.value = voucher.partyAccountId || '';
    (voucher.items || []).forEach(addInvoiceItem);
    updateInvoiceTotals();
  } else {
    voucher.lines.forEach((line) => addVoucherLine({
      accountId: line.accountId,
      description: line.description || '',
      debit: line.debitMinor ? minorToMoney(line.debitMinor) : '',
      credit: line.creditMinor ? minorToMoney(line.creditMinor) : ''
    }));
  }
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
  const selectedReportTag = els.reportTag.value;
  Object.assign(state, {
    accountTypes: snapshot.accountTypes || [],
    heads: snapshot.heads || [],
    subheads: snapshot.subheads || [],
    accounts: snapshot.accounts || [],
    products: snapshot.products || [],
    hasTransactions: Boolean(snapshot.hasTransactions),
    coaRows: snapshot.coaRows || [],
    tags: snapshot.tags || [],
    coaTags: snapshot.coaTags || { head: {}, subhead: {}, account: {} },
    voucherTags: snapshot.voucherTags || {},
    recent: snapshot.recent || [],
    vouchers: snapshot.vouchers || [],
    trialBalance: snapshot.trialBalance || [],
    company: snapshot.company || {}
  });
  els.storageStatus.textContent = `${snapshot.meta.persistence} | SQLite ${snapshot.meta.sqliteVersion}`;
  updateCompanyChrome();
  renderCoaMasters();
  renderTree();
  renderDashboard();
  renderCompanyMaster();
  renderProductMaster();
  if (!state.reportDatesInitialized) {
    els.reportFromDate.value = financialYearStartIso(state.company.financialYearStart);
    state.reportDatesInitialized = true;
  }
  renderTagList();
  renderTagOptions(els.voucherTags);
  renderVoucherSelect();
  renderVoucherMode();
  renderTagTargets();
  renderOptions(els.reportAccount, state.accounts, { label: accountLabel });
  renderOptions(els.reportTag, state.tags, { label: (tag) => tag.name });
  if (selectedReportAccount && state.accounts.some((account) => account.id === selectedReportAccount)) {
    els.reportAccount.value = selectedReportAccount;
  }
  if (selectedReportTag && state.tags.some((tag) => tag.id === selectedReportTag)) {
    els.reportTag.value = selectedReportTag;
  }
}

function switchView(viewName) {
  els.navTabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.view === viewName));
  els.views.forEach((view) => view.classList.toggle('active', view.id === `${viewName}View`));
  els.viewTitle.textContent = [...els.navTabs].find((tab) => tab.dataset.view === viewName)?.textContent || 'F.A.M.E';
  if (viewName === 'reports') runReport().catch((error) => showToast(error.message));
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

async function createNewCompany() {
  const backupRequired = window.confirm(
    'Do you need a backup of the existing data before creating a new company? Press OK to open Backup, or Cancel to continue without backup.'
  );
  if (backupRequired) {
    switchView('backup');
    showToast('Export a backup before creating a new company.');
    return;
  }
  const confirmed = window.confirm(
    'This will permanently reset all company configuration, masters, products, tags, vouchers, and reports on this device. Continue?'
  );
  if (!confirmed) return;
  await dbCall('resetCompanyData');
  state.reportDatesInitialized = false;
  await refreshSnapshot();
  resetVoucherForm();
  switchView('configuration');
  showToast('New company created. Enter the company details to continue.');
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
    tagIds: selectedValues(controls.tags),
    isPersonal: controls.isPersonal?.checked || false,
    gstNo: controls.gstNo?.value,
    panNo: controls.panNo?.value,
    registration1: controls.registration1?.value,
    registration2: controls.registration2?.value,
    registration3: controls.registration3?.value,
    state: controls.state?.value
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
  els.reportTagModes.forEach((input) => input.addEventListener('change', () => {
    if (state.activeReport === 'tag') runReport().catch((error) => showToast(error.message));
  }));
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
  els.accountIsPersonal.addEventListener('change', renderAccountPersonalFields);
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
  els.voucherParty.addEventListener('change', updateInvoiceTotals);
  els.addLine.addEventListener('click', () => addVoucherLine(addedLineDefaultForType(els.voucherType.value)));
  els.addInvoiceItem.addEventListener('click', () => addInvoiceItem());
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
      partyAccountId: isInvoiceType() ? els.voucherParty.value : null,
      tagIds: selectedValues(els.voucherTags),
      lines: isInvoiceType() ? [] : getVoucherLines().filter((line) => line.accountId && (line.debitMinor || line.creditMinor)),
      items: isInvoiceType() ? getInvoiceItems() : []
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
  els.productForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await dbCall('saveProduct', {
      id: els.productId.value || null,
      name: els.productName.value,
      kind: els.productKind.value,
      hsnSacCode: els.productHsnSac.value,
      gstRate: els.productGstRate.value,
      itcAvailable: els.productItcAvailable.checked,
      purchaseAccountId: els.productPurchaseAccount.value,
      salesAccountId: els.productSalesAccount.value
    });
    await refreshSnapshot();
    clearProductForm();
    showToast('Product / service saved.');
  });
  els.clearProduct.addEventListener('click', clearProductForm);
  els.deleteProduct.addEventListener('click', async () => {
    if (!els.productId.value) return showToast('Select a product or service first.');
    await dbCall('deleteProduct', { id: els.productId.value });
    await refreshSnapshot();
    clearProductForm();
    showToast('Product / service deleted.');
  });
  els.companyForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await dbCall('saveCompanyMaster', {
      name: els.companyName.value,
      address: els.companyAddress.value,
      state: els.companyState.value,
      country: els.companyCountry.value,
      gstNo: els.companyGstNo.value,
      panNo: els.companyPanNo.value,
      registration1: els.companyRegistration1.value,
      registration2: els.companyRegistration2.value,
      registration3: els.companyRegistration3.value,
      financialYearStart: els.companyFinancialYearStart.value,
      gstEnabled: els.companyGstEnabled.checked
    });
    await refreshSnapshot();
    els.reportFromDate.value = financialYearStartIso(state.company.financialYearStart);
    showToast('Configuration saved.');
  });
  els.newCompany.addEventListener('click', () => createNewCompany().catch((error) => showToast(error.message)));

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
  renderStateOptions(els.accountState);
  renderStateOptions(els.companyState);
  bindEvents();
  els.voucherDate.value = todayIso();
  els.reportFromDate.value = `${todayIso().slice(0, 4)}-01-01`;
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
