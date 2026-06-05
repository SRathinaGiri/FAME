import { dbCall } from './db-client.js';
import { decryptBackup, encryptBackup } from './crypto.js';

const moneyFormatter = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  accountForm: document.querySelector('#accountForm'),
  coaItemId: document.querySelector('#coaItemId'),
  coaLevel: document.querySelector('#coaLevel'),
  accountType: document.querySelector('#accountType'),
  headAccount: document.querySelector('#headAccount'),
  subheadAccount: document.querySelector('#subheadAccount'),
  accountCode: document.querySelector('#accountCode'),
  accountName: document.querySelector('#accountName'),
  accountTags: document.querySelector('#accountTags'),
  deleteCoaItem: document.querySelector('#deleteCoaItem'),
  clearCoaForm: document.querySelector('#clearCoaForm'),
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
  if (filter === 'cashBank') return account.headCode === '1100';
  if (filter === 'purchase') return account.typeId === 'expense' && account.headCode === '5100';
  if (filter === 'sales') return account.typeId === 'income' && ['4100', '4200'].includes(account.headCode);
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

function renderCoaMasters() {
  renderOptions(els.accountType, state.accountTypes, { label: (type) => type.name });
  renderOptions(els.headAccount, filteredHeads(), { label: (head) => `${head.code} - ${head.name}` });
  renderOptions(els.subheadAccount, filteredSubheads(), { label: (subhead) => `${subhead.code} - ${subhead.name}` });
  renderTagOptions(els.accountTags);
  updateCoaFieldVisibility();
}

function filteredHeads() {
  return state.heads.filter((head) => !els.accountType.value || head.typeId === els.accountType.value);
}

function filteredSubheads() {
  return state.subheads.filter((subhead) => !els.headAccount.value || subhead.headId === els.headAccount.value);
}

async function suggestCode() {
  const payload = {
    level: els.coaLevel.value,
    typeId: els.accountType.value,
    headId: els.headAccount.value,
    subheadId: els.subheadAccount.value
  };
  const result = await dbCall('suggestCoaCode', payload);
  els.accountCode.value = result.code;
  els.accountCode.placeholder = result.code;
}

function updateCoaFieldVisibility() {
  const level = els.coaLevel.value;
  els.accountType.closest('label').classList.toggle('hidden', level !== 'head');
  els.headAccount.closest('label').classList.toggle('hidden', level === 'head');
  els.subheadAccount.closest('label').classList.toggle('hidden', level !== 'account');
  els.deleteCoaItem.disabled = !els.coaItemId.value;
  if (!els.coaItemId.value) suggestCode().catch(() => undefined);
}

function clearCoaForm() {
  els.accountForm.reset();
  els.coaItemId.value = '';
  els.accountCode.disabled = false;
  els.subheadAccount.disabled = false;
  renderCoaMasters();
}

function fillCoaForm(row) {
  if (!row || row.level === 'type') return;
  els.coaItemId.value = row.id;
  els.coaLevel.value = row.level;
  if (row.level === 'head') {
    els.accountType.value = row.typeId;
  } else if (row.level === 'subhead') {
    const head = state.heads.find((item) => item.id === row.headId);
    els.accountType.value = head?.typeId || '';
    renderOptions(els.headAccount, filteredHeads(), { label: (headRow) => `${headRow.code} - ${headRow.name}` });
    els.headAccount.value = row.headId;
  } else {
    const subhead = state.subheads.find((item) => item.id === row.subheadId);
    const head = state.heads.find((item) => item.id === subhead?.headId);
    els.accountType.value = head?.typeId || '';
    renderOptions(els.headAccount, filteredHeads(), { label: (headRow) => `${headRow.code} - ${headRow.name}` });
    els.headAccount.value = head?.id || '';
    renderOptions(els.subheadAccount, filteredSubheads(), { label: (subheadRow) => `${subheadRow.code} - ${subheadRow.name}` });
    els.subheadAccount.value = row.subheadId;
  }
  els.accountCode.value = row.code;
  els.accountName.value = row.name;
  renderTagOptions(els.accountTags, currentCoaTagIds(row.level, row.id));
  const lockAccountStructure = row.level === 'account' && row.hasTransactions;
  els.accountCode.disabled = lockAccountStructure;
  els.subheadAccount.disabled = lockAccountStructure;
  updateCoaFieldVisibility();
}

function renderTree() {
  els.accountTree.innerHTML = state.coaRows
    .map((row) => {
      const tagIds = row.level === 'type' ? [] : currentCoaTagIds(row.level, row.id);
      return `
        <button class="tree-row ${row.level}" type="button" data-level="${row.level}" data-id="${row.id}" style="--depth:${depthForLevel(row.level)}">
          <span class="account-code">${row.code}</span>
          <span>${row.name}</span>
          <span class="account-type">${levelLabel(row.level)}</span>
          <span class="tag-cell">${renderTagChips(tagIds)}</span>
        </button>
      `;
    })
    .join('');
  els.accountTree.querySelectorAll('.tree-row').forEach((button) => {
    button.addEventListener('click', () => fillCoaForm(state.coaRows.find((row) => row.level === button.dataset.level && row.id === button.dataset.id)));
  });
}

function depthForLevel(level) {
  return { type: 0, head: 1, subhead: 2, account: 3 }[level] || 0;
}

function levelLabel(level) {
  return { type: 'Type', head: 'Head', subhead: 'Sub-head', account: 'Account' }[level] || level;
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
            <td>${voucher.voucherDate}</td>
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

function lineDefaultsForType(type) {
  if (type === 'receipt') return [{ accountFilter: 'cashBank', lockedSide: 'debit', preferredCodes: ['1111', '1121'], selectFirst: true }, { lockedSide: 'credit' }];
  if (type === 'payment') return [{ accountFilter: 'cashBank', lockedSide: 'credit', preferredCodes: ['1111', '1121'], selectFirst: true }, { lockedSide: 'debit' }];
  if (type === 'purchase') return [{ accountFilter: 'purchase', lockedSide: 'debit', preferredCodes: ['5111'], selectFirst: true }, { lockedSide: 'credit' }];
  if (type === 'sales') return [{ accountFilter: 'sales', lockedSide: 'credit', preferredCodes: ['4111', '4211'], selectFirst: true }, { lockedSide: 'debit' }];
  return [{}, {}];
}

function addedLineDefaultForType(type) {
  if (type === 'receipt') return { lockedSide: 'credit' };
  if (type === 'payment') return { lockedSide: 'debit' };
  if (type === 'purchase') return { lockedSide: 'credit', preferredCodes: ['2111', '1111', '1121'] };
  if (type === 'sales') return { lockedSide: 'debit', preferredCodes: ['1211', '1111', '1121'] };
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
    label: (voucher) => `${voucher.voucherNo} - ${voucher.voucherDate} - ${voucher.type}`
  });
}

function resetVoucherForm() {
  state.editingVoucherId = null;
  els.voucherForm.reset();
  els.voucherEditSelect.value = '';
  els.voucherDate.value = new Date().toISOString().slice(0, 10);
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
    renderOptions(els.tagTarget, state.vouchers, { label: (voucher) => `${voucher.voucherNo} - ${voucher.voucherDate}`, value: (voucher) => voucher.id });
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
}

function switchView(viewName) {
  els.navTabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.view === viewName));
  els.views.forEach((view) => view.classList.toggle('active', view.id === `${viewName}View`));
  els.viewTitle.textContent = [...els.navTabs].find((tab) => tab.dataset.view === viewName)?.textContent || 'F.A.M.E';
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
  els.coaLevel.addEventListener('change', clearCoaForm);
  els.accountType.addEventListener('change', () => {
    renderOptions(els.headAccount, filteredHeads(), { label: (head) => `${head.code} - ${head.name}` });
    updateCoaFieldVisibility();
  });
  els.headAccount.addEventListener('change', () => {
    renderOptions(els.subheadAccount, filteredSubheads(), { label: (subhead) => `${subhead.code} - ${subhead.name}` });
    updateCoaFieldVisibility();
  });
  els.subheadAccount.addEventListener('change', updateCoaFieldVisibility);
  els.clearCoaForm.addEventListener('click', clearCoaForm);
  els.accountForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await dbCall('saveCoaItem', {
      id: els.coaItemId.value || null,
      level: els.coaLevel.value,
      typeId: els.accountType.value,
      headId: els.headAccount.value,
      subheadId: els.subheadAccount.value,
      code: els.accountCode.value,
      name: els.accountName.value,
      tagIds: selectedValues(els.accountTags)
    });
    clearCoaForm();
    await refreshSnapshot();
    showToast('CoA master saved.');
  });
  els.deleteCoaItem.addEventListener('click', async () => {
    await dbCall('deleteCoaItem', { id: els.coaItemId.value, level: els.coaLevel.value });
    clearCoaForm();
    await refreshSnapshot();
    showToast('CoA master deleted.');
  });

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
    downloadJson(`fame-backup-${new Date().toISOString().slice(0, 10)}.json`, await encryptBackup(await dbCall('exportData'), els.exportPassword.value));
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
  bindEvents();
  els.voucherDate.value = new Date().toISOString().slice(0, 10);
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
