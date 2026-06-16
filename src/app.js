import { dbCall } from './db-client.js';
import { decryptBackup, encryptBackup } from './crypto.js';

const moneyFormatter = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const quantityFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });
const appLocale = 'en-IN';
const APP_VERSION = 'v25';
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
  productCategories: [],
  productSubcategories: [],
  products: [],
  fixedAssets: [],
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
  voucherReportReturn: null,
  serviceWorkerReloaded: sessionStorage.getItem('fame-sw-reloaded') === '1',
  installPrompt: null,
  installMode: null
};

const els = {
  storageStatus: document.querySelector('#storageStatus'),
  companyDisplay: document.querySelector('#companyDisplay'),
  viewTitle: document.querySelector('#viewTitle'),
  navTabs: document.querySelectorAll('.nav-tab'),
  reportNavGroup: document.querySelector('#reportNavGroup'),
  reportNavItems: document.querySelectorAll('.nav-subtab'),
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
  accountOpeningFields: document.querySelector('#accountOpeningFields'),
  accountOpeningBalance: document.querySelector('#accountOpeningBalance'),
  accountOpeningSide: document.querySelector('#accountOpeningSide'),
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
  postDepreciation: document.querySelector('#postDepreciation'),
  reportDrilldown: document.querySelector('#reportDrilldown'),
  drilldownTitle: document.querySelector('#drilldownTitle'),
  drilldownMeta: document.querySelector('#drilldownMeta'),
  drilldownContent: document.querySelector('#drilldownContent'),
  closeDrilldown: document.querySelector('#closeDrilldown'),
  productList: document.querySelector('#productList'),
  productCategoryList: document.querySelector('#productCategoryList'),
  productSubcategoryList: document.querySelector('#productSubcategoryList'),
  productCategoryForm: document.querySelector('#productCategoryForm'),
  productCategoryId: document.querySelector('#productCategoryId'),
  productCategoryName: document.querySelector('#productCategoryName'),
  deleteProductCategory: document.querySelector('#deleteProductCategory'),
  clearProductCategory: document.querySelector('#clearProductCategory'),
  productSubcategoryForm: document.querySelector('#productSubcategoryForm'),
  productSubcategoryId: document.querySelector('#productSubcategoryId'),
  productSubcategoryCategory: document.querySelector('#productSubcategoryCategory'),
  productSubcategoryName: document.querySelector('#productSubcategoryName'),
  deleteProductSubcategory: document.querySelector('#deleteProductSubcategory'),
  clearProductSubcategory: document.querySelector('#clearProductSubcategory'),
  productForm: document.querySelector('#productForm'),
  productId: document.querySelector('#productId'),
  productName: document.querySelector('#productName'),
  productKind: document.querySelector('#productKind'),
  productCategory: document.querySelector('#productCategory'),
  productSubcategory: document.querySelector('#productSubcategory'),
  productOpeningQuantity: document.querySelector('#productOpeningQuantity'),
  productOpeningValue: document.querySelector('#productOpeningValue'),
  productHsnSac: document.querySelector('#productHsnSac'),
  productGstRate: document.querySelector('#productGstRate'),
  productItcAvailable: document.querySelector('#productItcAvailable'),
  productPurchaseAccount: document.querySelector('#productPurchaseAccount'),
  productSalesAccount: document.querySelector('#productSalesAccount'),
  deleteProduct: document.querySelector('#deleteProduct'),
  clearProduct: document.querySelector('#clearProduct'),
  fixedAssetList: document.querySelector('#fixedAssetList'),
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
  fixedAssetToggleField: document.querySelector('#fixedAssetToggleField'),
  voucherFixedAsset: document.querySelector('#voucherFixedAsset'),
  fixedAssetFields: document.querySelector('#fixedAssetFields'),
  fixedAssetPurchaseNameField: document.querySelector('#fixedAssetPurchaseNameField'),
  fixedAssetAccountField: document.querySelector('#fixedAssetAccountField'),
  fixedAssetMethodField: document.querySelector('#fixedAssetMethodField'),
  fixedAssetRateField: document.querySelector('#fixedAssetRateField'),
  fixedAssetScrapField: document.querySelector('#fixedAssetScrapField'),
  fixedAssetSaleField: document.querySelector('#fixedAssetSaleField'),
  fixedAssetName: document.querySelector('#fixedAssetName'),
  fixedAssetAccount: document.querySelector('#fixedAssetAccount'),
  fixedAssetMethod: document.querySelector('#fixedAssetMethod'),
  fixedAssetRate: document.querySelector('#fixedAssetRate'),
  fixedAssetScrap: document.querySelector('#fixedAssetScrap'),
  fixedAssetSaleSelect: document.querySelector('#fixedAssetSaleSelect'),
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
  backToReport: document.querySelector('#backToReport'),
  addLine: document.querySelector('#addLine'),
  deleteVoucher: document.querySelector('#deleteVoucher'),
  clearVoucher: document.querySelector('#clearVoucher'),
  exportForm: document.querySelector('#exportForm'),
  importForm: document.querySelector('#importForm'),
  exportPassword: document.querySelector('#exportPassword'),
  importPassword: document.querySelector('#importPassword'),
  importFile: document.querySelector('#importFile'),
  exportBiZip: document.querySelector('#exportBiZip'),
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
  companyStockValuationMethod: document.querySelector('#companyStockValuationMethod'),
  companyGstEnabled: document.querySelector('#companyGstEnabled'),
  newCompany: document.querySelector('#newCompany'),
  gstLockNote: document.querySelector('#gstLockNote'),
  installNotice: document.querySelector('#installNotice'),
  installNoticeText: document.querySelector('#installNoticeText'),
  installButton: document.querySelector('#installButton'),
  toast: document.querySelector('#toast')
};

function minorToMoney(value) {
  return moneyFormatter.format(Number(value || 0) / 100);
}

function minorToNumber(value) {
  return Number(value || 0) / 100;
}

function formatQuantity(value) {
  return quantityFormatter.format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return '';
  const iso = normalizeDateValue(value);
  const [year, month, day] = iso.split('-');
  return `${day}-${month}-${year}`;
}

function normalizeDateValue(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  let year;
  let month;
  let day;
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    [, year, month, day] = match;
  } else {
    match = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (!match) throw new Error('Enter dates in dd-mm-yyyy format.');
    [, day, month, year] = match;
  }
  const candidate = new Date(Number(year), Number(month) - 1, Number(day));
  if (
    candidate.getFullYear() !== Number(year)
    || candidate.getMonth() !== Number(month) - 1
    || candidate.getDate() !== Number(day)
  ) {
    throw new Error('Enter a valid date in dd-mm-yyyy format.');
  }
  return `${year}-${month}-${day}`;
}

function dateInputValue(input) {
  return normalizeDateValue(input.value);
}

function setDateInputValue(input, isoValue) {
  input.value = isoValue ? formatDate(isoValue) : '';
  const picker = input.parentElement?.querySelector('.calendar-native');
  if (picker) picker.value = isoValue || '';
}

function installCalendarPicker(input) {
  const wrapper = document.createElement('div');
  wrapper.className = 'date-control';
  input.parentNode.insertBefore(wrapper, input);
  wrapper.append(input);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'calendar-button secondary';
  button.setAttribute('aria-label', `Open calendar for ${input.closest('label')?.childNodes[0]?.textContent.trim() || 'date'}`);
  button.textContent = 'Calendar';

  const picker = document.createElement('input');
  picker.type = 'date';
  picker.className = 'calendar-native';
  picker.tabIndex = -1;
  picker.setAttribute('aria-hidden', 'true');

  button.addEventListener('click', () => {
    try {
      picker.value = dateInputValue(input);
    } catch {
      picker.value = '';
    }
    if (typeof picker.showPicker === 'function') picker.showPicker();
    else picker.click();
  });
  picker.addEventListener('change', () => {
    setDateInputValue(input, picker.value);
    input.setCustomValidity('');
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  wrapper.append(button, picker);
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

function signedOpeningBalanceMinor() {
  const amountMinor = moneyToMinor(els.accountOpeningBalance.value);
  return els.accountOpeningSide.value === 'credit' ? -amountMinor : amountMinor;
}

function setOpeningBalanceInputs(value) {
  const amountMinor = Number(value || 0);
  els.accountOpeningSide.value = amountMinor < 0 ? 'credit' : 'debit';
  els.accountOpeningBalance.value = Math.abs(amountMinor) ? minorToMoney(Math.abs(amountMinor)) : '';
}

function isBalanceSheetType(typeId) {
  return ['asset', 'liability', 'equity'].includes(typeId);
}

function currentAccountTypeId() {
  return state.subheads.find((subhead) => subhead.id === els.accountEntrySubhead.value)?.typeId
    || els.accountEntryType.value;
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

function isStandaloneApp() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function setInstallNotice(mode, message, buttonText) {
  state.installMode = mode;
  els.installNoticeText.textContent = message;
  els.installButton.textContent = buttonText;
  els.installNotice.classList.remove('hidden');
}

function hideInstallNotice() {
  state.installMode = null;
  els.installNotice.classList.add('hidden');
}

function renderInstallNotice() {
  if (isStandaloneApp()) {
    hideInstallNotice();
    return;
  }
  if (state.installPrompt) {
    setInstallNotice('install', 'Install F.A.M.E for desktop and offline use.', 'Install App');
    return;
  }
  if (localStorage.getItem('fame-install-reminder-version') !== APP_VERSION) {
    setInstallNotice('guide', 'Install F.A.M.E for desktop and offline use.', 'Install App');
    return;
  }
  hideInstallNotice();
}

function showUpdateNotice() {
  setInstallNotice('update', 'A new version is ready. Update F.A.M.E now.', 'Update App');
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
  if (level === 'account') {
    setOpeningBalanceInputs(0);
    renderAccountPersonalFields();
    renderAccountOpeningFields();
  }
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
  renderAccountOpeningFields();
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
    setOpeningBalanceInputs(row.openingBalanceMinor || 0);
    renderAccountPersonalFields();
    renderAccountOpeningFields();
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

function renderAccountOpeningFields() {
  const systemAdjustment = els.accountEntryCode.value === '302102';
  const showOpening = isBalanceSheetType(currentAccountTypeId());
  els.accountOpeningFields.classList.toggle('hidden', !showOpening);
  els.accountOpeningBalance.disabled = systemAdjustment;
  els.accountOpeningSide.disabled = systemAdjustment;
  if (!showOpening) setOpeningBalanceInputs(0);
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
  setDateInputValue(els.companyFinancialYearStart, company.financialYearStart || `${todayIso().slice(0, 4)}-04-01`);
  els.companyStockValuationMethod.value = company.stockValuationMethod || 'weighted_average';
  els.companyGstEnabled.checked = Boolean(company.gstEnabled);
  els.companyGstEnabled.disabled = state.hasTransactions;
  els.gstLockNote.classList.toggle('hidden', !state.hasTransactions);
}

function clearProductForm() {
  els.productForm.reset();
  els.productId.value = '';
  els.productOpeningQuantity.value = '0';
  els.productOpeningValue.value = '';
  els.productGstRate.value = '0';
  els.productItcAvailable.checked = true;
  els.deleteProduct.disabled = true;
  renderProductKindFields();
  renderProductCategoryOptions();
}

function clearProductCategoryForm() {
  els.productCategoryForm.reset();
  els.productCategoryId.value = '';
  els.deleteProductCategory.disabled = true;
}

function clearProductSubcategoryForm() {
  els.productSubcategoryForm.reset();
  els.productSubcategoryId.value = '';
  renderOptions(els.productSubcategoryCategory, state.productCategories, { label: (category) => category.name });
  els.deleteProductSubcategory.disabled = true;
}

function renderProductKindFields() {
  const isProduct = els.productKind.value === 'product';
  document.querySelectorAll('.product-stock-field').forEach((element) => {
    element.classList.toggle('hidden', !isProduct);
    element.querySelectorAll('input, select').forEach((control) => {
      control.disabled = !isProduct;
    });
  });
}

function productSubcategoriesForCategory(categoryId = els.productCategory.value) {
  return state.productSubcategories.filter((subcategory) => subcategory.categoryId === categoryId);
}

function renderProductCategoryOptions(selectedCategoryId = els.productCategory.value, selectedSubcategoryId = els.productSubcategory.value) {
  renderOptions(els.productCategory, state.productCategories, { label: (category) => category.name, empty: 'Select category' });
  if (state.productCategories.some((category) => category.id === selectedCategoryId)) {
    els.productCategory.value = selectedCategoryId;
  } else if (state.productCategories.length) {
    els.productCategory.value = state.productCategories[0].id;
  }
  const subcategories = productSubcategoriesForCategory(els.productCategory.value);
  renderOptions(els.productSubcategory, subcategories, { label: (subcategory) => subcategory.name, empty: 'Select sub-category' });
  if (subcategories.some((subcategory) => subcategory.id === selectedSubcategoryId)) {
    els.productSubcategory.value = selectedSubcategoryId;
  } else if (subcategories.length) {
    els.productSubcategory.value = subcategories[0].id;
  }
}

function renderProductCategoryMasters() {
  els.productCategoryList.innerHTML = state.productCategories.length
    ? `<div class="list-heading">Product Categories</div>${state.productCategories.map((category) => `
        <button class="product-row compact-row" type="button" data-category-id="${category.id}">
          <strong>${escapeHtml(category.name)}</strong>
          <span>${state.productSubcategories.filter((subcategory) => subcategory.categoryId === category.id).length} sub-categories</span>
        </button>
      `).join('')}`
    : '<div class="empty-list">No product categories created yet.</div>';
  els.productCategoryList.querySelectorAll('[data-category-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const category = state.productCategories.find((item) => item.id === button.dataset.categoryId);
      if (!category) return;
      els.productCategoryId.value = category.id;
      els.productCategoryName.value = category.name;
      els.deleteProductCategory.disabled = false;
    });
  });

  els.productSubcategoryList.innerHTML = state.productSubcategories.length
    ? `<div class="list-heading">Product Sub-categories</div>${state.productSubcategories.map((subcategory) => `
        <button class="product-row compact-row" type="button" data-subcategory-id="${subcategory.id}">
          <strong>${escapeHtml(subcategory.name)}</strong>
          <span>${escapeHtml(subcategory.categoryName)}</span>
        </button>
      `).join('')}`
    : '<div class="empty-list">No product sub-categories created yet.</div>';
  els.productSubcategoryList.querySelectorAll('[data-subcategory-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const subcategory = state.productSubcategories.find((item) => item.id === button.dataset.subcategoryId);
      if (!subcategory) return;
      els.productSubcategoryId.value = subcategory.id;
      renderOptions(els.productSubcategoryCategory, state.productCategories, { label: (category) => category.name });
      els.productSubcategoryCategory.value = subcategory.categoryId;
      els.productSubcategoryName.value = subcategory.name;
      els.deleteProductSubcategory.disabled = false;
    });
  });
  if (!els.productCategoryId.value) els.deleteProductCategory.disabled = true;
  if (!els.productSubcategoryId.value) els.deleteProductSubcategory.disabled = true;
  renderOptions(els.productSubcategoryCategory, state.productCategories, { label: (category) => category.name });
}

function renderProductMaster() {
  const purchaseAccounts = state.accounts.filter((account) => account.typeId === 'expense' && !account.isSystem);
  const salesAccounts = state.accounts.filter((account) => account.typeId === 'income' && !account.isSystem);
  const selectedPurchase = els.productPurchaseAccount.value;
  const selectedSales = els.productSalesAccount.value;
  const selectedCategory = els.productCategory.value;
  const selectedSubcategory = els.productSubcategory.value;
  document.querySelectorAll('.product-gst-field').forEach((element) => {
    element.classList.toggle('hidden', !state.company.gstEnabled);
  });
  renderProductKindFields();
  renderProductCategoryMasters();
  renderProductCategoryOptions(selectedCategory, selectedSubcategory);
  renderOptions(els.productPurchaseAccount, purchaseAccounts, { label: accountLabel });
  renderOptions(els.productSalesAccount, salesAccounts, { label: accountLabel });
  if (purchaseAccounts.some((account) => account.id === selectedPurchase)) els.productPurchaseAccount.value = selectedPurchase;
  if (salesAccounts.some((account) => account.id === selectedSales)) els.productSalesAccount.value = selectedSales;
  els.productList.innerHTML = state.products.length
    ? state.products.map((product) => `
      <button class="product-row" type="button" data-product-id="${product.id}">
        <strong>${escapeHtml(product.name)}</strong>
          <span>${escapeHtml(product.kind)}${product.kind === 'product'
            ? ` | ${escapeHtml(product.categoryName || 'Uncategorised')} / ${escapeHtml(product.subcategoryName || 'General')} | Op ${formatQuantity(product.openingQuantity)} / ${minorToMoney(product.openingValueMinor)}`
            : ''}${state.company.gstEnabled
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
      renderProductCategoryOptions(product.categoryId || '', product.subcategoryId || '');
      els.productOpeningQuantity.value = product.openingQuantity || '0';
      els.productOpeningValue.value = product.openingValueMinor ? minorToMoney(product.openingValueMinor) : '';
      els.productHsnSac.value = product.hsnSacCode || '';
      els.productGstRate.value = product.gstRate;
      els.productItcAvailable.checked = Boolean(product.itcAvailable);
      els.productPurchaseAccount.value = product.purchaseAccountId;
      els.productSalesAccount.value = product.salesAccountId;
      els.deleteProduct.disabled = false;
      renderProductKindFields();
    });
  });
  if (!els.productId.value) els.deleteProduct.disabled = true;
}

function fixedAssetAccounts() {
  return state.accounts.filter((account) => account.headCode === '104000' && account.code !== '104901' && !account.isSystem);
}

function renderFixedAssetModule() {
  els.fixedAssetList.innerHTML = state.fixedAssets.length
    ? state.fixedAssets.map((asset) => `
        <div class="product-row">
          <strong>${escapeHtml(asset.name)}</strong>
          <span>${escapeHtml(asset.assetAccountCode)} - ${escapeHtml(asset.assetAccountName)} | ${asset.depreciationMethod} ${asset.depreciationRate}% | Cost ${minorToMoney(asset.purchaseAmountMinor)} | Scrap ${minorToMoney(asset.scrapValueMinor)}${asset.saleDate ? ` | Sold ${formatDate(asset.saleDate)}` : ''}</span>
        </div>
      `).join('')
    : '<div class="empty-list">No fixed assets recorded yet. Mark a purchase voucher as Fixed Asset to create one.</div>';
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
      state.voucherReportReturn = els.reportDrilldown.contains(button) ? 'drilldown' : 'report';
      els.backToReport.classList.remove('hidden');
      fillVoucherForm(button.dataset.voucherId);
      switchView('entries');
    });
  });
}

function renderDaybook(data) {
  els.reportTitle.textContent = 'Daybook';
  els.reportMeta.textContent = dateRangeLabel(dateInputValue(els.reportFromDate), dateInputValue(els.reportToDate));
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
  els.reportMeta.textContent = dateRangeLabel(dateInputValue(els.reportFromDate), dateInputValue(els.reportToDate));
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
  els.reportMeta.textContent = dateRangeLabel(dateInputValue(els.reportFromDate), dateInputValue(els.reportToDate));
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
  els.reportMeta.textContent = dateRangeLabel(dateInputValue(els.reportFromDate), dateInputValue(els.reportToDate));
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
  els.reportMeta.textContent = `As at ${formatDate(dateInputValue(els.reportAsOfDate))} | FY from ${formatDate(data.financialYearStart)}`;
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

function renderFixedAssetRegister(data) {
  els.reportTitle.textContent = 'Fixed Asset Register';
  els.reportMeta.textContent = `As at ${formatDate(dateInputValue(els.reportAsOfDate))}`;
  reportKpis([
    { label: 'Cost', value: minorToMoney(data.totals.purchaseAmountMinor) },
    { label: 'Accum. Depn.', value: minorToMoney(data.totals.accumulatedDepreciationMinor) },
    { label: 'WDV', value: minorToMoney(data.totals.wdvMinor) },
    { label: 'Sale Value', value: minorToMoney(data.totals.saleAmountMinor) }
  ]);
  const headers = [
    { label: 'Sl.No.', amount: true }, { label: 'Asset' }, { label: 'Asset Account' },
    { label: 'Purchase Date' }, { label: 'Purchase Voucher' }, { label: 'Method' },
    { label: 'Rate %', amount: true }, { label: 'Cost', amount: true },
    { label: 'Scrap Value', amount: true }, { label: 'Accum. Depn.', amount: true },
    { label: 'WDV', amount: true }, { label: 'Status' }
  ];
  const body = data.rows.length
    ? data.rows.map((row) => `
        <tr>
          <td class="amount">${row.slNo}</td>
          <td>${escapeHtml(row.name)}</td>
          <td>${escapeHtml(`${row.assetAccountCode} - ${row.assetAccountName}`)}</td>
          <td>${formatDate(row.purchaseDate)}</td>
          <td>${row.purchaseVoucherId ? voucherButton({ voucherId: row.purchaseVoucherId, voucherNo: row.purchaseVoucherNo }) : ''}</td>
          <td>${escapeHtml(row.depreciationMethod)}</td>
          <td class="amount">${escapeHtml(row.depreciationRate)}</td>
          <td class="amount">${minorToMoney(row.purchaseAmountMinor)}</td>
          <td class="amount">${minorToMoney(row.scrapValueMinor)}</td>
          <td class="amount">${minorToMoney(row.accumulatedDepreciationMinor)}</td>
          <td class="amount">${minorToMoney(row.wdvMinor)}</td>
          <td>${escapeHtml(row.status)}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="12" class="empty">No fixed assets recorded.</td></tr>';
  els.reportContent.innerHTML = reportTable(headers, body);
  state.reportExport = {
    title: els.reportTitle.textContent,
    meta: els.reportMeta.textContent,
    headers: headers.map((header) => header.label),
    rows: data.rows.map((row) => [
      row.slNo, row.name, `${row.assetAccountCode} - ${row.assetAccountName}`,
      formatDate(row.purchaseDate), row.purchaseVoucherNo || '', row.depreciationMethod,
      Number(row.depreciationRate || 0), minorToNumber(row.purchaseAmountMinor),
      minorToNumber(row.scrapValueMinor), minorToNumber(row.accumulatedDepreciationMinor),
      minorToNumber(row.wdvMinor), row.status
    ])
  };
  bindReportLinks(els.reportContent);
}

function renderFixedAssetSchedule(data) {
  els.reportTitle.textContent = 'Fixed Asset Depreciation Schedule';
  els.reportMeta.textContent = `${formatDate(data.financialYearStart)} to ${formatDate(data.financialYearEnd)} | Posting date ${formatDate(dateInputValue(els.reportAsOfDate))}`;
  reportKpis([
    { label: 'Opening WDV', value: minorToMoney(data.totals.openingWdvMinor) },
    { label: 'Additions', value: minorToMoney(data.totals.additionMinor) },
    { label: 'Depreciation', value: minorToMoney(data.totals.depreciationMinor) },
    { label: 'Posted', value: minorToMoney(data.totals.postedDepreciationMinor) },
    { label: 'Outstanding', value: minorToMoney(data.totals.outstandingDepreciationMinor) },
    { label: 'Closing WDV', value: minorToMoney(data.totals.closingWdvMinor) }
  ]);
  const headers = [
    { label: 'Asset' }, { label: 'Method' }, { label: 'Rate %', amount: true },
    { label: 'Opening WDV', amount: true }, { label: 'Additions', amount: true },
    { label: 'Sale Value', amount: true }, { label: 'Depn. Days', amount: true },
    { label: 'CY Depn.', amount: true }, { label: 'Posted', amount: true },
    { label: 'Outstanding', amount: true }, { label: 'Accum. Depn.', amount: true },
    { label: 'Closing WDV', amount: true }, { label: 'Working Note' }
  ];
  const body = data.rows.length
    ? data.rows.map((row) => `
        <tr>
          <td>${escapeHtml(row.name)}</td>
          <td>${escapeHtml(row.depreciationMethod)}</td>
          <td class="amount">${escapeHtml(row.depreciationRate)}</td>
          <td class="amount">${minorToMoney(row.openingWdvMinor)}</td>
          <td class="amount">${minorToMoney(row.additionMinor)}</td>
          <td class="amount">${minorToMoney(row.disposalMinor)}</td>
          <td class="amount">${row.depreciationDays}</td>
          <td class="amount">${minorToMoney(row.depreciationMinor)}</td>
          <td class="amount">${minorToMoney(row.postedDepreciationMinor)}</td>
          <td class="amount">${minorToMoney(row.outstandingDepreciationMinor)}</td>
          <td class="amount">${minorToMoney(row.accumulatedDepreciationMinor)}</td>
          <td class="amount">${minorToMoney(row.closingWdvMinor)}</td>
          <td>${escapeHtml(row.workingNote)}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="13" class="empty">No fixed assets recorded.</td></tr>';
  els.reportContent.innerHTML = reportTable(headers, body);
  state.reportExport = {
    title: els.reportTitle.textContent,
    meta: els.reportMeta.textContent,
    headers: headers.map((header) => header.label),
    rows: data.rows.map((row) => [
      row.name, row.depreciationMethod, Number(row.depreciationRate || 0),
      minorToNumber(row.openingWdvMinor), minorToNumber(row.additionMinor),
      minorToNumber(row.disposalMinor), row.depreciationDays,
      minorToNumber(row.depreciationMinor), minorToNumber(row.postedDepreciationMinor),
      minorToNumber(row.outstandingDepreciationMinor), minorToNumber(row.accumulatedDepreciationMinor),
      minorToNumber(row.closingWdvMinor), row.workingNote
    ])
  };
}

function renderStockSummary(data) {
  els.reportTitle.textContent = 'Stock Summary';
  els.reportMeta.textContent = `${dateRangeLabel(dateInputValue(els.reportFromDate), dateInputValue(els.reportToDate))} | ${data.methodName}`;
  reportKpis([
    { label: 'Opening', value: `${formatQuantity(data.totals.openingQuantity)} / ${minorToMoney(data.totals.openingValueMinor)}` },
    { label: 'Inward', value: `${formatQuantity(data.totals.inwardQuantity)} / ${minorToMoney(data.totals.inwardValueMinor)}` },
    { label: 'Outward', value: `${formatQuantity(data.totals.outwardQuantity)} / ${minorToMoney(data.totals.outwardValueMinor)}` },
    { label: 'Closing', value: `${formatQuantity(data.totals.closingQuantity)} / ${minorToMoney(data.totals.closingValueMinor)}` }
  ]);
  const headers = [
    { label: 'Sl.No.', amount: true },
    { label: 'Category' },
    { label: 'Sub-category' },
    { label: 'Product' },
    { label: 'Opening Qty', amount: true },
    { label: 'Opening Value', amount: true },
    { label: 'Inward Qty', amount: true },
    { label: 'Inward Value', amount: true },
    { label: 'Outward Qty', amount: true },
    { label: 'Outward Value', amount: true },
    { label: 'Closing Qty', amount: true },
    { label: 'Closing Value', amount: true }
  ];
  const body = data.rows.length
    ? data.rows.map((row) => `
        <tr>
          <td class="amount">${row.slNo}</td>
          <td>${escapeHtml(row.categoryName)}</td>
          <td>${escapeHtml(row.subcategoryName)}</td>
          <td>${escapeHtml(row.productName)}</td>
          <td class="amount">${formatQuantity(row.openingQuantity)}</td>
          <td class="amount">${minorToMoney(row.openingValueMinor)}</td>
          <td class="amount">${formatQuantity(row.inwardQuantity)}</td>
          <td class="amount">${minorToMoney(row.inwardValueMinor)}</td>
          <td class="amount">${formatQuantity(row.outwardQuantity)}</td>
          <td class="amount">${minorToMoney(row.outwardValueMinor)}</td>
          <td class="amount">${formatQuantity(row.closingQuantity)}</td>
          <td class="amount">${minorToMoney(row.closingValueMinor)}</td>
        </tr>
      `).join('') + `
        <tr class="report-total-row">
          <td colspan="4">Total</td>
          <td class="amount">${formatQuantity(data.totals.openingQuantity)}</td>
          <td class="amount">${minorToMoney(data.totals.openingValueMinor)}</td>
          <td class="amount">${formatQuantity(data.totals.inwardQuantity)}</td>
          <td class="amount">${minorToMoney(data.totals.inwardValueMinor)}</td>
          <td class="amount">${formatQuantity(data.totals.outwardQuantity)}</td>
          <td class="amount">${minorToMoney(data.totals.outwardValueMinor)}</td>
          <td class="amount">${formatQuantity(data.totals.closingQuantity)}</td>
          <td class="amount">${minorToMoney(data.totals.closingValueMinor)}</td>
        </tr>
      `
    : '<tr><td colspan="12" class="empty">No product masters available for stock reporting.</td></tr>';
  els.reportContent.innerHTML = reportTable(headers, body);
  state.reportExport = {
    title: els.reportTitle.textContent,
    meta: els.reportMeta.textContent,
    headers: headers.map((header) => header.label),
    rows: [
      ...data.rows.map((row) => [
        row.slNo,
        row.categoryName,
        row.subcategoryName,
        row.productName,
        row.openingQuantity,
        minorToNumber(row.openingValueMinor),
        row.inwardQuantity,
        minorToNumber(row.inwardValueMinor),
        row.outwardQuantity,
        minorToNumber(row.outwardValueMinor),
        row.closingQuantity,
        minorToNumber(row.closingValueMinor)
      ]),
      [
        'Total', '', '', '',
        data.totals.openingQuantity, minorToNumber(data.totals.openingValueMinor),
        data.totals.inwardQuantity, minorToNumber(data.totals.inwardValueMinor),
        data.totals.outwardQuantity, minorToNumber(data.totals.outwardValueMinor),
        data.totals.closingQuantity, minorToNumber(data.totals.closingValueMinor)
      ]
    ]
  };
}

function renderStockMovement(data) {
  els.reportTitle.textContent = 'Stock Movement Register';
  els.reportMeta.textContent = `${dateRangeLabel(dateInputValue(els.reportFromDate), dateInputValue(els.reportToDate))} | ${data.methodName}`;
  reportKpis([
    { label: 'Inward', value: `${formatQuantity(data.totals.inwardQuantity)} / ${minorToMoney(data.totals.inwardValueMinor)}` },
    { label: 'Outward', value: `${formatQuantity(data.totals.outwardQuantity)} / ${minorToMoney(data.totals.outwardValueMinor)}` },
    { label: 'Closing', value: `${formatQuantity(data.totals.closingQuantity)} / ${minorToMoney(data.totals.closingValueMinor)}` }
  ]);
  const headers = [
    { label: 'Sl.No.', amount: true },
    { label: 'Date' },
    { label: 'Voucher' },
    { label: 'Type' },
    { label: 'Product' },
    { label: 'Movement' },
    { label: 'Qty', amount: true },
    { label: 'Rate', amount: true },
    { label: 'Value', amount: true },
    { label: 'Closing Qty', amount: true },
    { label: 'Closing Value', amount: true }
  ];
  const body = data.movementRows.length
    ? data.movementRows.map((row) => `
        <tr>
          <td class="amount">${row.slNo}</td>
          <td>${row.voucherDate ? formatDate(row.voucherDate) : ''}</td>
          <td>${row.voucherId ? voucherButton(row) : ''}</td>
          <td class="capitalize">${escapeHtml(row.type)}</td>
          <td>${escapeHtml(row.productName)}</td>
          <td>${escapeHtml(row.movementType)}</td>
          <td class="amount">${formatQuantity(row.quantity)}</td>
          <td class="amount">${minorToMoney(row.rateMinor)}</td>
          <td class="amount">${minorToMoney(row.valueMinor)}</td>
          <td class="amount">${formatQuantity(row.closingQuantity)}</td>
          <td class="amount">${minorToMoney(row.closingValueMinor)}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="11" class="empty">No stock movements in this period.</td></tr>';
  els.reportContent.innerHTML = reportTable(headers, body);
  state.reportExport = {
    title: els.reportTitle.textContent,
    meta: els.reportMeta.textContent,
    headers: headers.map((header) => header.label),
    rows: data.movementRows.map((row) => [
      row.slNo,
      row.voucherDate ? formatDate(row.voucherDate) : '',
      row.voucherNo || '',
      row.type,
      row.productName,
      row.movementType,
      row.quantity,
      minorToNumber(row.rateMinor),
      minorToNumber(row.valueMinor),
      row.closingQuantity,
      minorToNumber(row.closingValueMinor)
    ])
  };
  bindReportLinks(els.reportContent);
}

function renderBalanceSheet(data) {
  const assets = statementSection('Assets', data.rows.filter((row) => row.typeId === 'asset'));
  const liabilities = statementSection('Liabilities', data.rows.filter((row) => row.typeId === 'liability'));
  const equity = statementSection('Equity', data.rows.filter((row) => row.typeId === 'equity'));
  const difference = data.assetsMinor - data.liabilitiesAndEquityMinor;
  els.reportTitle.textContent = 'Balance Sheet';
  els.reportMeta.textContent = `As at ${formatDate(dateInputValue(els.reportAsOfDate))}`;
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
  els.reportMeta.textContent = `${modeLabel} | ${dateRangeLabel(dateInputValue(els.reportFromDate), dateInputValue(els.reportToDate))}`;
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
  const fromDate = dateInputValue(els.reportFromDate);
  const toDate = dateInputValue(els.reportToDate);
  const asOfDate = dateInputValue(els.reportAsOfDate);
  const taxJournalTypes = {
    salesJournal: 'sales',
    purchaseJournal: 'purchase',
    expenseJournal: 'expense',
    incomeJournal: 'income'
  };
  if (state.activeReport === 'daybook') {
    renderDaybook(await dbCall('reportDaybook', { fromDate, toDate }));
  } else if (taxJournalTypes[state.activeReport]) {
    renderTaxJournal(await dbCall('reportTaxJournal', {
      type: taxJournalTypes[state.activeReport],
      fromDate,
      toDate
    }));
  } else if (state.activeReport === 'ledger') {
    renderLedger(await dbCall('reportLedger', {
      accountId: els.reportAccount.value,
      fromDate,
      toDate
    }));
  } else if (state.activeReport === 'profitLoss') {
    renderProfitLoss(await dbCall('reportProfitLoss', { fromDate, toDate }));
  } else if (state.activeReport === 'trialBalance') {
    renderTrialBalance(await dbCall('reportTrialBalance', { asOfDate }));
  } else if (state.activeReport === 'stockSummary') {
    renderStockSummary(await dbCall('reportStockSummary', { fromDate, toDate }));
  } else if (state.activeReport === 'stockMovement') {
    renderStockMovement(await dbCall('reportStockMovement', { fromDate, toDate }));
  } else if (state.activeReport === 'fixedAssetRegister') {
    renderFixedAssetRegister(await dbCall('reportFixedAssetRegister', { asOfDate }));
  } else if (state.activeReport === 'fixedAssetSchedule') {
    renderFixedAssetSchedule(await dbCall('reportFixedAssetSchedule', { asOfDate }));
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
      fromDate,
      toDate
    }));
  } else {
    renderBalanceSheet(await dbCall('reportBalanceSheet', { asOfDate }));
  }
}

function setReportType(type, run = true) {
  state.activeReport = type;
  els.reportTabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.report === type));
  els.reportNavItems.forEach((tab) => tab.classList.toggle('active', tab.dataset.report === type));
  const isLedger = type === 'ledger';
  const isAsOfReport = ['balanceSheet', 'trialBalance', 'fixedAssetRegister', 'fixedAssetSchedule'].includes(type);
  const isTag = type === 'tag';
  const isTaxJournal = ['salesJournal', 'purchaseJournal', 'expenseJournal', 'incomeJournal'].includes(type);
  els.reportAccountField.classList.toggle('hidden', !isLedger);
  els.reportTagField.classList.toggle('hidden', !isTag);
  els.reportTagModeField.classList.toggle('hidden', !isTag);
  els.reportFromField.classList.toggle('hidden', isAsOfReport);
  els.reportToField.classList.toggle('hidden', isAsOfReport);
  els.reportAsOfField.classList.toggle('hidden', !isAsOfReport);
  els.postDepreciation.classList.toggle('hidden', type !== 'fixedAssetSchedule');
  if (isTaxJournal) els.reportSummary.innerHTML = '';
  if (run) runReport().catch((error) => showToast(error.message));
}

async function openAccountDrilldown(accountId) {
  const isAsOfReport = ['balanceSheet', 'trialBalance', 'fixedAssetRegister', 'fixedAssetSchedule'].includes(state.activeReport);
  const fromDate = isAsOfReport ? '' : dateInputValue(els.reportFromDate);
  const toDate = isAsOfReport ? dateInputValue(els.reportAsOfDate) : dateInputValue(els.reportToDate);
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
  const fixedAssetEligible = ['purchase', 'sales'].includes(els.voucherType.value);
  const fixedAssetEnabled = fixedAssetEligible && els.voucherFixedAsset.checked;
  const fixedAssetPurchase = fixedAssetEnabled && els.voucherType.value === 'purchase';
  const fixedAssetSale = fixedAssetEnabled && els.voucherType.value === 'sales';
  els.voucherLineEditor.classList.toggle('hidden', invoice);
  els.invoiceItemEditor.classList.toggle('hidden', !invoice);
  els.voucherPartyField.classList.toggle('hidden', !invoice);
  els.fixedAssetToggleField.classList.toggle('hidden', !fixedAssetEligible);
  els.fixedAssetFields.classList.toggle('hidden', !fixedAssetEnabled);
  els.fixedAssetPurchaseNameField.classList.toggle('hidden', !fixedAssetPurchase);
  els.fixedAssetAccountField.classList.toggle('hidden', !fixedAssetPurchase);
  els.fixedAssetMethodField.classList.toggle('hidden', !fixedAssetPurchase);
  els.fixedAssetRateField.classList.toggle('hidden', !fixedAssetPurchase);
  els.fixedAssetScrapField.classList.toggle('hidden', !fixedAssetPurchase);
  els.fixedAssetSaleField.classList.toggle('hidden', !fixedAssetSale);
  els.addLine.classList.toggle('hidden', invoice);
  els.addInvoiceItem.classList.toggle('hidden', !invoice);
  els.voucherPartyLabel.textContent = isOutwardInvoiceType() ? 'Customer' : 'Supplier';
  document.querySelectorAll('.invoice-gst-column').forEach((element) => element.classList.toggle('hidden', !gstEnabled));
  const selectedAssetAccount = els.fixedAssetAccount.value;
  renderOptions(els.fixedAssetAccount, fixedAssetAccounts(), { label: accountLabel, empty: 'Select fixed asset account' });
  if (fixedAssetAccounts().some((account) => account.id === selectedAssetAccount)) els.fixedAssetAccount.value = selectedAssetAccount;
  const selectedSoldAsset = els.fixedAssetSaleSelect.value;
  const saleAssets = state.fixedAssets.filter((asset) =>
    !asset.saleDate || asset.saleVoucherId === state.editingVoucherId
  );
  renderOptions(els.fixedAssetSaleSelect, saleAssets, {
    label: (asset) => `${asset.name} | ${asset.assetAccountCode} - ${asset.assetAccountName}`,
    empty: 'Select asset sold'
  });
  if (saleAssets.some((asset) => asset.id === selectedSoldAsset)) els.fixedAssetSaleSelect.value = selectedSoldAsset;
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

function getFixedAssetPayload() {
  const enabled = ['purchase', 'sales'].includes(els.voucherType.value) && els.voucherFixedAsset.checked;
  if (!enabled) return { enabled: false };
  if (els.voucherType.value === 'purchase') {
    return {
      enabled: true,
      name: els.fixedAssetName.value.trim(),
      assetAccountId: els.fixedAssetAccount.value,
      depreciationMethod: els.fixedAssetMethod.value,
      depreciationRate: Number(els.fixedAssetRate.value || 0),
      scrapValueMinor: moneyToMinor(els.fixedAssetScrap.value)
    };
  }
  return {
    enabled: true,
    assetId: els.fixedAssetSaleSelect.value
  };
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
  setDateInputValue(els.voucherDate, todayIso());
  els.voucherFixedAsset.checked = false;
  els.fixedAssetScrap.value = '';
  els.fixedAssetRate.value = '0';
  renderTagOptions(els.voucherTags);
  resetVoucherLinesForType();
}

function fillVoucherForm(voucherId) {
  const voucher = state.vouchers.find((item) => item.id === voucherId);
  if (!voucher) return resetVoucherForm();
  state.editingVoucherId = voucher.id;
  els.voucherType.value = voucher.type;
  setDateInputValue(els.voucherDate, voucher.voucherDate);
  els.referenceNo.value = voucher.referenceNo || '';
  els.invoiceNo.value = voucher.invoiceNo || '';
  setDateInputValue(els.invoiceDate, voucher.invoiceDate || '');
  els.narration.value = voucher.narration || '';
  els.voucherFixedAsset.checked = Boolean(voucher.fixedAsset);
  els.fixedAssetName.value = voucher.fixedAsset?.name || '';
  els.fixedAssetAccount.value = voucher.fixedAsset?.assetAccountId || '';
  els.fixedAssetMethod.value = voucher.fixedAsset?.depreciationMethod || 'SLM';
  els.fixedAssetRate.value = voucher.fixedAsset?.depreciationRate || '0';
  els.fixedAssetScrap.value = voucher.fixedAsset?.scrapValueMinor ? minorToMoney(voucher.fixedAsset.scrapValueMinor) : '';
  els.fixedAssetSaleSelect.value = voucher.fixedAsset?.id || '';
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
    productCategories: snapshot.productCategories || [],
    productSubcategories: snapshot.productSubcategories || [],
    products: snapshot.products || [],
    fixedAssets: snapshot.fixedAssets || [],
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
  renderFixedAssetModule();
  if (!state.reportDatesInitialized) {
    setDateInputValue(els.reportFromDate, financialYearStartIso(state.company.financialYearStart));
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
  if (els.reportNavGroup) els.reportNavGroup.open = viewName === 'reports' || els.reportNavGroup.open;
  if (viewName === 'reports') runReport().catch((error) => showToast(error.message));
}

function returnFromVoucherDrilldown() {
  const returnTarget = state.voucherReportReturn;
  state.voucherReportReturn = null;
  els.backToReport.classList.add('hidden');
  els.navTabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.view === 'reports'));
  els.views.forEach((view) => view.classList.toggle('active', view.id === 'reportsView'));
  els.viewTitle.textContent = 'Reports';
  if (returnTarget === 'drilldown') {
    els.reportDrilldown.classList.remove('hidden');
    els.reportDrilldown.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    els.reportDrilldown.classList.add('hidden');
    document.querySelector('#reportPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function closeAccountDrilldown() {
  els.reportDrilldown.classList.add('hidden');
  document.querySelector('#reportPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
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

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function exportBiZip() {
  const backup = await dbCall('exportData');
  const { buildBiExport } = await import('./bi-export.js');
  const blob = await buildBiExport(backup, companyDisplayName());
  downloadBlob(`fame-powerbi-${todayIso()}.zip`, blob);
}

async function parseBackupFile(file, password) {
  const parsed = JSON.parse(await file.text());
  if (parsed?.format === 'fame.encrypted.backup') {
    if (!password) throw new Error('Enter the backup password.');
    return decryptBackup(parsed, password);
  }
  if (parsed?.app === 'F.A.M.E') return parsed;
  throw new Error('This is not a valid F.A.M.E backup file.');
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
    openingBalanceMinor: level === 'account' && isBalanceSheetType(currentAccountTypeId())
      ? signedOpeningBalanceMinor()
      : 0,
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
  els.navTabs.forEach((tab) => tab.addEventListener('click', (event) => {
    const reportsActive = document.querySelector('#reportsView')?.classList.contains('active');
    if (tab.dataset.view === 'reports' && reportsActive && els.reportNavGroup && els.reportNavGroup.open) {
      event.preventDefault();
      event.stopPropagation();
      els.reportNavGroup.open = false;
      return;
    }
    state.voucherReportReturn = null;
    els.backToReport.classList.add('hidden');
    switchView(tab.dataset.view);
  }));
  els.reportNavItems.forEach((tab) => tab.addEventListener('click', () => {
    state.voucherReportReturn = null;
    els.backToReport.classList.add('hidden');
    switchView('reports');
    setReportType(tab.dataset.report);
  }));
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
  els.postDepreciation.addEventListener('click', async () => {
    const result = await dbCall('postFixedAssetDepreciation', {
      asOfDate: dateInputValue(els.reportAsOfDate)
    });
    await refreshSnapshot();
    await runReport();
    showToast(
      result.voucherCount
        ? `${result.voucherCount} depreciation journal(s) posted for ${minorToMoney(result.amountMinor)}.`
        : 'No outstanding depreciation to post.'
    );
  });
  els.closeDrilldown.addEventListener('click', closeAccountDrilldown);
  els.backToReport.addEventListener('click', returnFromVoucherDrilldown);
  els.headType.addEventListener('change', () => suggestCode('head', coaForms.head()).catch(() => undefined));
  els.subheadType.addEventListener('change', () => {
    renderHeadOptions(els.subheadHead, els.subheadType.value);
    suggestCode('subhead', coaForms.subhead()).catch(() => undefined);
  });
  els.subheadHead.addEventListener('change', () => suggestCode('subhead', coaForms.subhead()).catch(() => undefined));
  els.accountEntryType.addEventListener('change', () => {
    renderHeadOptions(els.accountEntryHead, els.accountEntryType.value);
    renderSubheadOptions(els.accountEntrySubhead, els.accountEntryHead.value);
    renderAccountOpeningFields();
    suggestCode('account', coaForms.account()).catch(() => undefined);
  });
  els.accountEntryHead.addEventListener('change', () => {
    renderSubheadOptions(els.accountEntrySubhead, els.accountEntryHead.value);
    renderAccountOpeningFields();
    suggestCode('account', coaForms.account()).catch(() => undefined);
  });
  els.accountEntrySubhead.addEventListener('change', () => {
    renderAccountOpeningFields();
    suggestCode('account', coaForms.account()).catch(() => undefined);
  });
  els.accountEntryCode.addEventListener('input', renderAccountOpeningFields);
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
  els.voucherFixedAsset.addEventListener('change', renderVoucherMode);
  els.fixedAssetAccount.addEventListener('change', updateInvoiceTotals);
  els.fixedAssetSaleSelect.addEventListener('change', updateInvoiceTotals);
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
      voucherDate: dateInputValue(els.voucherDate),
      referenceNo: els.referenceNo.value.trim(),
      invoiceNo: els.invoiceNo.value.trim(),
      invoiceDate: dateInputValue(els.invoiceDate),
      narration: els.narration.value.trim(),
      partyAccountId: isInvoiceType() ? els.voucherParty.value : null,
      tagIds: selectedValues(els.voucherTags),
      lines: isInvoiceType() ? [] : getVoucherLines().filter((line) => line.accountId && (line.debitMinor || line.creditMinor)),
      items: isInvoiceType() ? getInvoiceItems() : [],
      fixedAsset: getFixedAssetPayload()
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
      categoryId: els.productCategory.value,
      subcategoryId: els.productSubcategory.value,
      openingQuantity: els.productOpeningQuantity.value,
      openingValueMinor: moneyToMinor(els.productOpeningValue.value),
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
  els.productKind.addEventListener('change', renderProductKindFields);
  els.productCategory.addEventListener('change', () => renderProductCategoryOptions(els.productCategory.value, ''));
  els.productCategoryForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await dbCall('saveProductCategory', {
      id: els.productCategoryId.value || null,
      name: els.productCategoryName.value
    });
    clearProductCategoryForm();
    await refreshSnapshot();
    showToast('Product category saved.');
  });
  els.clearProductCategory.addEventListener('click', clearProductCategoryForm);
  els.deleteProductCategory.addEventListener('click', async () => {
    if (!els.productCategoryId.value) return showToast('Select a product category first.');
    await dbCall('deleteProductCategory', { id: els.productCategoryId.value });
    clearProductCategoryForm();
    await refreshSnapshot();
    showToast('Product category deleted.');
  });
  els.productSubcategoryForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await dbCall('saveProductSubcategory', {
      id: els.productSubcategoryId.value || null,
      categoryId: els.productSubcategoryCategory.value,
      name: els.productSubcategoryName.value
    });
    clearProductSubcategoryForm();
    await refreshSnapshot();
    showToast('Product sub-category saved.');
  });
  els.clearProductSubcategory.addEventListener('click', clearProductSubcategoryForm);
  els.deleteProductSubcategory.addEventListener('click', async () => {
    if (!els.productSubcategoryId.value) return showToast('Select a product sub-category first.');
    await dbCall('deleteProductSubcategory', { id: els.productSubcategoryId.value });
    clearProductSubcategoryForm();
    await refreshSnapshot();
    showToast('Product sub-category deleted.');
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
      financialYearStart: dateInputValue(els.companyFinancialYearStart),
      stockValuationMethod: els.companyStockValuationMethod.value,
      gstEnabled: els.companyGstEnabled.checked
    });
    await refreshSnapshot();
    setDateInputValue(els.reportFromDate, financialYearStartIso(state.company.financialYearStart));
    showToast('Configuration saved.');
  });
  els.newCompany.addEventListener('click', () => createNewCompany().catch((error) => showToast(error.message)));

  els.exportForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    downloadJson(`fame-backup-${todayIso()}.json`, await encryptBackup(await dbCall('exportData'), els.exportPassword.value));
    els.exportForm.reset();
  });
  els.exportBiZip.addEventListener('click', () => {
    exportBiZip()
      .then(() => showToast('Power BI ZIP export created.'))
      .catch((error) => showToast(error.message));
  });
  els.importForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await dbCall('importData', await parseBackupFile(els.importFile.files[0], els.importPassword.value));
    els.importForm.reset();
    state.reportDatesInitialized = false;
    await refreshSnapshot();
    showToast('Backup imported.');
  });
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.installPrompt = event;
    renderInstallNotice();
  });
  els.installButton.addEventListener('click', async () => {
    if (state.installMode === 'update') {
      window.location.reload();
      return;
    }
    if (state.installPrompt) {
      state.installPrompt.prompt();
      await state.installPrompt.userChoice;
      state.installPrompt = null;
      localStorage.setItem('fame-install-reminder-version', APP_VERSION);
      renderInstallNotice();
      return;
    }
    localStorage.setItem('fame-install-reminder-version', APP_VERSION);
    showToast('Use the browser menu or address-bar install icon to install F.A.M.E.');
    renderInstallNotice();
  });
}

async function prepareServiceWorker() {
  if (!('serviceWorker' in navigator)) return true;
  try {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!state.serviceWorkerReloaded) return;
      showUpdateNotice();
    });
    const handleRegistration = (registration) => {
      if (registration.waiting && navigator.serviceWorker.controller) showUpdateNotice();
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdateNotice();
        });
      });
    };
    if (window.crossOriginIsolated) {
      navigator.serviceWorker
        .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
        .then(handleRegistration)
        .catch((error) => console.warn('Service worker registration failed', error));
      return true;
    }
    if (!state.serviceWorkerReloaded) {
      const readyOrTimeout = navigator.serviceWorker
        .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
        .then((registration) => {
          handleRegistration(registration);
          return Promise.race([navigator.serviceWorker.ready, new Promise((resolve) => setTimeout(resolve, 2500))]);
        })
        .catch((error) => console.warn('Service worker registration failed', error));
      readyOrTimeout.finally(() => {
        sessionStorage.setItem('fame-sw-reloaded', '1');
        window.location.reload();
      });
      return false;
    }
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .then(handleRegistration)
      .catch((error) => console.warn('Service worker registration failed', error));
  } catch (error) {
    console.warn('Service worker registration failed', error);
  }
  return true;
}

async function boot() {
  document.documentElement.lang = appLocale;
  document.querySelectorAll('.date-input').forEach((input) => {
    installCalendarPicker(input);
    input.addEventListener('blur', () => {
      if (!input.value) return;
      try {
        setDateInputValue(input, dateInputValue(input));
        input.setCustomValidity('');
      } catch (error) {
        input.setCustomValidity(error.message);
      }
    });
    input.addEventListener('input', () => input.setCustomValidity(''));
  });
  renderStateOptions(els.accountState);
  renderStateOptions(els.companyState);
  bindEvents();
  renderInstallNotice();
  setDateInputValue(els.voucherDate, todayIso());
  setDateInputValue(els.reportToDate, todayIso());
  setDateInputValue(els.reportAsOfDate, todayIso());
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
