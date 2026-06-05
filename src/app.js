import { dbCall } from './db-client.js';
import { decryptBackup, encryptBackup } from './crypto.js';

const moneyFormatter = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const state = {
  accounts: [],
  tags: [],
  accountTags: {},
  voucherTags: {},
  recent: [],
  vouchers: [],
  trialBalance: [],
  installPrompt: null,
  serviceWorkerReloaded: sessionStorage.getItem('fame-sw-reloaded') === '1',
  accountCodeTouched: false
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
  accountForm: document.querySelector('#accountForm'),
  accountCode: document.querySelector('#accountCode'),
  accountName: document.querySelector('#accountName'),
  accountTags: document.querySelector('#accountTags'),
  accountParent: document.querySelector('#accountParent'),
  accountType: document.querySelector('#accountType'),
  accountNormalSide: document.querySelector('#accountNormalSide'),
  accountIsGroup: document.querySelector('#accountIsGroup'),
  voucherForm: document.querySelector('#voucherForm'),
  voucherType: document.querySelector('#voucherType'),
  voucherDate: document.querySelector('#voucherDate'),
  referenceNo: document.querySelector('#referenceNo'),
  invoiceNo: document.querySelector('#invoiceNo'),
  invoiceDate: document.querySelector('#invoiceDate'),
  narration: document.querySelector('#narration'),
  voucherTags: document.querySelector('#voucherTags'),
  voucherLines: document.querySelector('#voucherLines'),
  voucherBalance: document.querySelector('#voucherBalance'),
  addLine: document.querySelector('#addLine'),
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

function moneyToMinor(value) {
  const numeric = Number(String(value || '').replace(/,/g, '').trim());
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.round(numeric * 100);
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.add('hidden'), 3200);
}

function accountLabel(account) {
  return `${account.code} - ${account.name}`;
}

function tagLabel(tag) {
  return tag.name;
}

function selectedValues(select) {
  return [...select.selectedOptions].map((option) => option.value).filter(Boolean);
}

function renderTagOptions(select, selectedIds = []) {
  const selected = new Set(selectedIds);
  select.innerHTML = '';
  for (const tag of state.tags) {
    const option = new Option(tagLabel(tag), tag.id);
    option.selected = selected.has(tag.id);
    select.append(option);
  }
}

function renderTagChips(tagIds = []) {
  if (!tagIds.length) return '<span class="muted-text">None</span>';
  return tagIds
    .map((tagId) => state.tags.find((tag) => tag.id === tagId))
    .filter(Boolean)
    .map((tag) => `<span class="tag-chip" style="--tag-color: ${tag.color}">${tag.name}</span>`)
    .join('');
}

function leafAccounts() {
  return state.accounts.filter((account) => !account.isGroup);
}

function accountByCode(code) {
  return state.accounts.find((account) => account.code === code);
}

function isDescendantOf(account, parentCode) {
  const parent = accountByCode(parentCode);
  if (!parent) return false;
  let current = account;
  while (current?.parentId) {
    if (current.parentId === parent.id) return true;
    current = state.accounts.find((candidate) => candidate.id === current.parentId);
  }
  return false;
}

function accountMatchesFilter(account, filter) {
  if (!filter || filter === 'all') return true;
  if (filter === 'cashBank') return isDescendantOf(account, '1100') || ['1110', '1120'].includes(account.code);
  if (filter === 'purchase') return account.code === '5100' || isDescendantOf(account, '5100');
  if (filter === 'sales') return account.code === '4100' || isDescendantOf(account, '4100');
  return true;
}

function renderAccountOptions(
  select,
  { includeGroups = false, emptyLabel = null, preferredCodes = [], filter = 'all' } = {}
) {
  const accounts = state.accounts.filter((account) => (includeGroups || !account.isGroup) && accountMatchesFilter(account, filter));
  const preferred = preferredCodes
    .map((code) => accounts.find((account) => account.code === code))
    .filter(Boolean);
  const rest = accounts.filter((account) => !preferred.includes(account));
  select.innerHTML = '';
  if (emptyLabel) {
    select.append(new Option(emptyLabel, ''));
  }
  for (const account of [...preferred, ...rest]) {
    select.append(new Option(accountLabel(account), account.id));
  }
}

function renderParentOptions() {
  const oldValue = els.accountParent.value;
  const selectedType = els.accountType.value;
  const parents = state.accounts.filter((account) => account.type === selectedType && account.isGroup);
  els.accountParent.innerHTML = '';
  els.accountParent.append(new Option('No parent', ''));
  for (const account of parents) {
    els.accountParent.append(new Option(accountLabel(account), account.id));
  }
  if (oldValue && [...els.accountParent.options].some((option) => option.value === oldValue)) {
    els.accountParent.value = oldValue;
  } else {
    const rootParent = parents.find((account) => !account.parentId && account.isGroup);
    if (rootParent) els.accountParent.value = rootParent.id;
  }
}

function suggestRootCode(type) {
  const baseByType = {
    asset: 1000,
    liability: 2000,
    equity: 3000,
    income: 4000,
    expense: 5000
  };
  const usedCodes = new Set(
    state.accounts
      .filter((account) => account.type === type && /^\d+$/.test(account.code))
      .map((account) => Number(account.code))
  );
  let candidate = baseByType[type] || 1000;
  while (usedCodes.has(candidate)) candidate += 100;
  return String(candidate);
}

function inferNextChildCode(parent, siblings) {
  const numericCodes = siblings
    .map((account) => Number(account.code))
    .filter((code) => Number.isInteger(code) && code > 0)
    .sort((a, b) => a - b);

  if (!numericCodes.length) {
    const parentCode = Number(parent.code);
    const step = parent.code.endsWith('00') ? 100 : 10;
    return Number.isInteger(parentCode) ? String(parentCode + step) : `${parent.code}10`;
  }

  const gaps = [];
  for (let index = 1; index < numericCodes.length; index += 1) {
    const gap = numericCodes[index] - numericCodes[index - 1];
    if (gap > 0) gaps.push(gap);
  }
  const step = gaps.length ? Math.min(...gaps) : parent.code.endsWith('00') ? 100 : 10;
  return String(Math.max(...numericCodes) + step);
}

function suggestAccountCode() {
  const parent = state.accounts.find((account) => account.id === els.accountParent.value);
  if (!parent) return suggestRootCode(els.accountType.value);
  const siblings = state.accounts.filter((account) => account.parentId === parent.id && /^\d+$/.test(account.code));
  return inferNextChildCode(parent, siblings);
}

function updateSuggestedAccountCode({ force = false } = {}) {
  const suggested = suggestAccountCode();
  const current = els.accountCode.value.trim();
  const previousGenerated = els.accountCode.dataset.generated || '';
  const shouldApply = force || !state.accountCodeTouched || !current || current === previousGenerated;
  els.accountCode.dataset.generated = suggested;
  els.accountCode.placeholder = suggested;
  if (shouldApply) {
    els.accountCode.value = suggested;
    state.accountCodeTouched = false;
  }
}

function renderTree() {
  const byParent = new Map();
  for (const account of state.accounts) {
    const key = account.parentId || 'root';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(account);
  }

  function build(parentId = 'root', depth = 0) {
    const group = byParent.get(parentId) || [];
    const fragment = document.createDocumentFragment();
    for (const account of group) {
      const row = document.createElement('div');
      row.className = `tree-row ${account.isGroup ? 'group' : ''}`;
      row.style.setProperty('--depth', depth);
      row.innerHTML = `
        <span class="account-code">${account.code}</span>
        <span>${account.name}</span>
        <span class="account-type">${account.type}</span>
        <span class="tag-cell">${renderTagChips(state.accountTags[account.id] || [])}</span>
      `;
      fragment.append(row, build(account.id, depth + 1));
    }
    return fragment;
  }

  els.accountTree.replaceChildren(build());
}

function renderTagList() {
  els.tagList.innerHTML = state.tags.length
    ? state.tags
        .map(
          (tag) => `
            <div class="tag-row">
              <span class="tag-chip" style="--tag-color: ${tag.color}">${tag.name}</span>
              <span class="muted-text">${tag.color}</span>
            </div>
          `
        )
        .join('')
    : '<div class="empty-list">No tags created yet.</div>';
}

function renderTagTargets() {
  const targetType = els.tagTargetType.value;
  const previousValue = els.tagTarget.value;
  els.tagTarget.innerHTML = '';
  if (targetType === 'account') {
    for (const account of state.accounts) {
      els.tagTarget.append(new Option(`${accountLabel(account)}${account.isGroup ? ' (heading)' : ''}`, account.id));
    }
  } else {
    for (const voucher of state.vouchers) {
      els.tagTarget.append(new Option(`${voucher.voucherNo} - ${voucher.voucherDate} - ${voucher.type}`, voucher.id));
    }
  }
  if ([...els.tagTarget.options].some((option) => option.value === previousValue)) {
    els.tagTarget.value = previousValue;
  }
  renderSelectedTargetTags();
}

function renderSelectedTargetTags() {
  const targetType = els.tagTargetType.value;
  const targetId = els.tagTarget.value;
  const tagIds = targetType === 'account' ? state.accountTags[targetId] || [] : state.voucherTags[targetId] || [];
  renderTagOptions(els.tagAssignmentTags, tagIds);
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
        .map(
          (voucher) => `
            <tr>
              <td>${voucher.voucherNo}</td>
              <td>${voucher.voucherDate}</td>
              <td class="capitalize">${voucher.type}</td>
              <td>${renderTagChips(state.voucherTags[voucher.id] || [])}</td>
              <td class="amount">${minorToMoney(voucher.amountMinor)}</td>
            </tr>
          `
        )
        .join('')
    : '<tr><td colspan="5" class="empty">No vouchers posted yet.</td></tr>';

  els.trialBalanceRows.innerHTML = state.trialBalance.length
    ? state.trialBalance
        .map(
          (row) => `
            <tr>
              <td>${row.code} - ${row.name}</td>
              <td class="amount">${minorToMoney(row.debitMinor)}</td>
              <td class="amount">${minorToMoney(row.creditMinor)}</td>
            </tr>
          `
        )
        .join('')
    : '<tr><td colspan="3" class="empty">No postings yet.</td></tr>';
}

function lineDefaultsForType(type) {
  if (type === 'receipt') {
    return [
      { accountFilter: 'cashBank', lockedSide: 'debit', preferredCodes: ['1110', '1120'] },
      { lockedSide: 'credit' }
    ];
  }
  if (type === 'payment') {
    return [
      { accountFilter: 'cashBank', lockedSide: 'credit', preferredCodes: ['1110', '1120'] },
      { lockedSide: 'debit' }
    ];
  }
  if (type === 'purchase') {
    return [
      { accountFilter: 'purchase', lockedSide: 'debit', preferredCodes: ['5100'] },
      { lockedSide: 'credit', preferredCodes: ['2100', '1110', '1120'] }
    ];
  }
  if (type === 'sales') {
    return [
      { accountFilter: 'sales', lockedSide: 'credit', preferredCodes: ['4100'] },
      { lockedSide: 'debit', preferredCodes: ['1200', '1110', '1120'] }
    ];
  }
  return [{}, {}];
}

function addedLineDefaultForType(type) {
  if (type === 'receipt') return { lockedSide: 'credit' };
  if (type === 'payment') return { lockedSide: 'debit' };
  if (type === 'purchase') return { lockedSide: 'credit', preferredCodes: ['2100', '1110', '1120'] };
  if (type === 'sales') return { lockedSide: 'debit', preferredCodes: ['1200', '1110', '1120'] };
  return {};
}

function resetVoucherLinesForType() {
  clearVoucherLines();
  for (const line of lineDefaultsForType(els.voucherType.value)) {
    addVoucherLine(line);
  }
}

function addVoucherLine(line = {}) {
  const tr = document.createElement('tr');
  const debitDisabled = line.lockedSide === 'credit' ? 'disabled' : '';
  const creditDisabled = line.lockedSide === 'debit' ? 'disabled' : '';
  tr.innerHTML = `
    <td><select class="line-account" required></select></td>
    <td><input class="line-description" value="${line.description || ''}" placeholder="Line note"></td>
    <td><input class="line-debit amount-input" inputmode="decimal" value="${line.debit || ''}" placeholder="0.00" ${debitDisabled}></td>
    <td><input class="line-credit amount-input" inputmode="decimal" value="${line.credit || ''}" placeholder="0.00" ${creditDisabled}></td>
    <td><button class="icon-button remove-line" type="button" title="Remove line">X</button></td>
  `;
  tr.dataset.accountFilter = line.accountFilter || 'all';
  tr.dataset.lockedSide = line.lockedSide || '';
  tr.dataset.preferredCodes = JSON.stringify(line.preferredCodes || []);
  const accountSelect = tr.querySelector('.line-account');
  renderAccountOptions(accountSelect, {
    filter: tr.dataset.accountFilter,
    preferredCodes: JSON.parse(tr.dataset.preferredCodes)
  });
  if (line.accountId) accountSelect.value = line.accountId;
  tr.querySelector('.remove-line').addEventListener('click', () => {
    tr.remove();
    updateVoucherBalance();
  });
  tr.querySelectorAll('input, select').forEach((input) => input.addEventListener('input', updateVoucherBalance));
  els.voucherLines.append(tr);
  updateVoucherBalance();
}

function clearVoucherLines() {
  els.voucherLines.innerHTML = '';
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
  const balanced = debit === credit;
  els.voucherBalance.textContent = balanced ? `Balanced ${minorToMoney(debit)}` : `Difference ${minorToMoney(debit - credit)}`;
  els.voucherBalance.classList.toggle('danger', !balanced);
}

function setDefaultDate() {
  els.voucherDate.value = new Date().toISOString().slice(0, 10);
}

function refreshVoucherSelects() {
  for (const select of els.voucherLines.querySelectorAll('.line-account')) {
    const row = select.closest('tr');
    const oldValue = select.value;
    renderAccountOptions(select, {
      filter: row.dataset.accountFilter || 'all',
      preferredCodes: JSON.parse(row.dataset.preferredCodes || '[]')
    });
    if ([...select.options].some((option) => option.value === oldValue)) {
      select.value = oldValue;
    }
  }
}

function resetVoucherForm() {
  els.voucherForm.reset();
  renderTagOptions(els.voucherTags);
  setDefaultDate();
  resetVoucherLinesForType();
}

async function refreshSnapshot() {
  const snapshot = await dbCall('snapshot');
  state.accounts = snapshot.accounts;
  state.tags = snapshot.tags || [];
  state.accountTags = snapshot.accountTags || {};
  state.voucherTags = snapshot.voucherTags || {};
  state.recent = snapshot.recent;
  state.vouchers = snapshot.vouchers || [];
  state.trialBalance = snapshot.trialBalance;
  els.storageStatus.textContent = `${snapshot.meta.persistence} | SQLite ${snapshot.meta.sqliteVersion}`;
  renderDashboard();
  renderParentOptions();
  renderTree();
  renderTagList();
  renderTagOptions(els.accountTags);
  renderTagOptions(els.voucherTags);
  renderTagTargets();
  refreshVoucherSelects();
  updateSuggestedAccountCode();
}

function switchView(viewName) {
  for (const tab of els.navTabs) tab.classList.toggle('active', tab.dataset.view === viewName);
  for (const view of els.views) view.classList.toggle('active', view.id === `${viewName}View`);
  const activeTab = [...els.navTabs].find((tab) => tab.dataset.view === viewName);
  els.viewTitle.textContent = activeTab?.textContent || 'F.A.M.E';
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

function bindEvents() {
  els.navTabs.forEach((tab) => tab.addEventListener('click', () => switchView(tab.dataset.view)));
  els.accountType.addEventListener('change', () => {
    els.accountNormalSide.value = ['asset', 'expense'].includes(els.accountType.value) ? 'debit' : 'credit';
    renderParentOptions();
    updateSuggestedAccountCode();
  });
  els.accountParent.addEventListener('change', () => updateSuggestedAccountCode());
  els.accountCode.addEventListener('input', () => {
    state.accountCodeTouched = els.accountCode.value.trim() !== (els.accountCode.dataset.generated || '');
  });
  els.accountForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await dbCall('createAccount', {
      code: els.accountCode.value,
      name: els.accountName.value,
      type: els.accountType.value,
      parentId: els.accountParent.value || null,
      normalSide: els.accountNormalSide.value,
      isGroup: els.accountIsGroup.checked,
      tagIds: selectedValues(els.accountTags)
    });
    els.accountForm.reset();
    state.accountCodeTouched = false;
    await refreshSnapshot();
    updateSuggestedAccountCode({ force: true });
    showToast('Account created.');
  });

  els.addLine.addEventListener('click', () => addVoucherLine(addedLineDefaultForType(els.voucherType.value)));
  els.voucherType.addEventListener('change', () => {
    els.invoiceNo.closest('label').classList.toggle('muted-control', !['purchase', 'sales'].includes(els.voucherType.value));
    els.invoiceDate.closest('label').classList.toggle('muted-control', !['purchase', 'sales'].includes(els.voucherType.value));
    resetVoucherLinesForType();
  });

  els.tagForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await dbCall('createTag', {
      name: els.tagName.value,
      color: els.tagColor.value
    });
    els.tagForm.reset();
    els.tagColor.value = '#247d68';
    await refreshSnapshot();
    showToast('Tag created.');
  });

  els.tagTargetType.addEventListener('change', renderTagTargets);
  els.tagTarget.addEventListener('change', renderSelectedTargetTags);
  els.tagAssignmentForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = { tagIds: selectedValues(els.tagAssignmentTags) };
    if (els.tagTargetType.value === 'account') {
      await dbCall('setAccountTags', { accountId: els.tagTarget.value, ...payload });
    } else {
      await dbCall('setVoucherTags', { voucherId: els.tagTarget.value, ...payload });
    }
    await refreshSnapshot();
    showToast('Tags saved.');
  });

  els.voucherForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const lines = getVoucherLines().filter((line) => line.accountId && (line.debitMinor || line.creditMinor));
    const result = await dbCall('saveVoucher', {
      type: els.voucherType.value,
      voucherDate: els.voucherDate.value,
      referenceNo: els.referenceNo.value.trim(),
      invoiceNo: els.invoiceNo.value.trim(),
      invoiceDate: els.invoiceDate.value,
      narration: els.narration.value.trim(),
      tagIds: selectedValues(els.voucherTags),
      lines
    });
    await refreshSnapshot();
    resetVoucherForm();
    showToast(`Posted ${result.voucherNo}.`);
  });

  els.exportForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = await dbCall('exportData');
    const encrypted = await encryptBackup(data, els.exportPassword.value);
    downloadJson(`fame-backup-${new Date().toISOString().slice(0, 10)}.json`, encrypted);
    els.exportForm.reset();
    showToast('Encrypted backup exported.');
  });

  els.importForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const file = els.importFile.files[0];
    const encrypted = JSON.parse(await file.text());
    const data = await decryptBackup(encrypted, els.importPassword.value);
    await dbCall('importData', data);
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

async function boot() {
  bindEvents();
  setDefaultDate();
  await dbCall('init');
  await refreshSnapshot();
  if (leafAccounts().length >= 2) resetVoucherLinesForType();
  if ('serviceWorker' in navigator) {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`;
    navigator.serviceWorker
      .register(swUrl, { scope: import.meta.env.BASE_URL })
      .then(async (registration) => {
        await navigator.serviceWorker.ready;
        if (!window.crossOriginIsolated && !state.serviceWorkerReloaded) {
          sessionStorage.setItem('fame-sw-reloaded', '1');
          window.location.reload();
        }
        return registration;
      })
      .catch((error) => console.warn('Service worker registration failed', error));
  }
}

boot().catch((error) => {
  console.error(error);
  els.storageStatus.textContent = error.message;
  showToast(error.message);
});
