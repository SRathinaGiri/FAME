import { dbCall } from './db-client.js';
import { decryptBackup, encryptBackup } from './crypto.js';

const moneyFormatter = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const state = {
  accounts: [],
  recent: [],
  trialBalance: [],
  installPrompt: null,
  serviceWorkerReloaded: sessionStorage.getItem('fame-sw-reloaded') === '1'
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
  accountParent: document.querySelector('#accountParent'),
  accountType: document.querySelector('#accountType'),
  accountNormalSide: document.querySelector('#accountNormalSide'),
  voucherForm: document.querySelector('#voucherForm'),
  voucherType: document.querySelector('#voucherType'),
  voucherDate: document.querySelector('#voucherDate'),
  referenceNo: document.querySelector('#referenceNo'),
  invoiceNo: document.querySelector('#invoiceNo'),
  invoiceDate: document.querySelector('#invoiceDate'),
  narration: document.querySelector('#narration'),
  quickCounter: document.querySelector('#quickCounter'),
  quickSettlement: document.querySelector('#quickSettlement'),
  quickAmount: document.querySelector('#quickAmount'),
  applyTemplate: document.querySelector('#applyTemplate'),
  voucherLines: document.querySelector('#voucherLines'),
  voucherBalance: document.querySelector('#voucherBalance'),
  addLine: document.querySelector('#addLine'),
  exportForm: document.querySelector('#exportForm'),
  importForm: document.querySelector('#importForm'),
  exportPassword: document.querySelector('#exportPassword'),
  importPassword: document.querySelector('#importPassword'),
  importFile: document.querySelector('#importFile'),
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

function leafAccounts() {
  return state.accounts.filter((account) => !account.isGroup);
}

function accountByCode(code) {
  return state.accounts.find((account) => account.code === code);
}

function renderAccountOptions(select, { includeGroups = false, emptyLabel = null, preferredCodes = [] } = {}) {
  const accounts = state.accounts.filter((account) => includeGroups || !account.isGroup);
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
  els.accountParent.innerHTML = '';
  els.accountParent.append(new Option('No parent', ''));
  for (const account of state.accounts) {
    els.accountParent.append(new Option(accountLabel(account), account.id));
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
      `;
      fragment.append(row, build(account.id, depth + 1));
    }
    return fragment;
  }

  els.accountTree.replaceChildren(build());
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
              <td class="amount">${minorToMoney(voucher.amountMinor)}</td>
            </tr>
          `
        )
        .join('')
    : '<tr><td colspan="4" class="empty">No vouchers posted yet.</td></tr>';

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

function addVoucherLine(line = {}) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><select class="line-account" required></select></td>
    <td><input class="line-description" value="${line.description || ''}" placeholder="Line note"></td>
    <td><input class="line-debit amount-input" inputmode="decimal" value="${line.debit || ''}" placeholder="0.00"></td>
    <td><input class="line-credit amount-input" inputmode="decimal" value="${line.credit || ''}" placeholder="0.00"></td>
    <td><button class="icon-button remove-line" type="button" title="Remove line">X</button></td>
  `;
  const accountSelect = tr.querySelector('.line-account');
  renderAccountOptions(accountSelect);
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
    debitMinor: moneyToMinor(tr.querySelector('.line-debit').value),
    creditMinor: moneyToMinor(tr.querySelector('.line-credit').value)
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

function applyVoucherPattern() {
  const amount = moneyToMinor(els.quickAmount.value);
  if (!amount) {
    showToast('Enter an amount before applying a pattern.');
    return;
  }
  const type = els.voucherType.value;
  const counter = els.quickCounter.value;
  const settlement = els.quickSettlement.value;
  if (!counter || !settlement) {
    showToast('Select both accounts for the pattern.');
    return;
  }
  clearVoucherLines();
  if (type === 'receipt') {
    addVoucherLine({ accountId: settlement, debit: minorToMoney(amount) });
    addVoucherLine({ accountId: counter, credit: minorToMoney(amount) });
  } else if (type === 'payment') {
    addVoucherLine({ accountId: counter, debit: minorToMoney(amount) });
    addVoucherLine({ accountId: settlement, credit: minorToMoney(amount) });
  } else if (type === 'purchase') {
    addVoucherLine({ accountId: counter, debit: minorToMoney(amount) });
    addVoucherLine({ accountId: settlement, credit: minorToMoney(amount) });
  } else if (type === 'sales') {
    addVoucherLine({ accountId: settlement, debit: minorToMoney(amount) });
    addVoucherLine({ accountId: counter, credit: minorToMoney(amount) });
  } else {
    addVoucherLine({ accountId: counter, debit: minorToMoney(amount) });
    addVoucherLine({ accountId: settlement, credit: minorToMoney(amount) });
  }
}

function refreshVoucherSelects() {
  renderAccountOptions(els.quickCounter, {
    preferredCodes: ['4100', '5100', '1200', '2100', '5210']
  });
  renderAccountOptions(els.quickSettlement, {
    preferredCodes: ['1110', '1120', '1200', '2100']
  });
  for (const select of els.voucherLines.querySelectorAll('.line-account')) {
    const oldValue = select.value;
    renderAccountOptions(select);
    select.value = oldValue;
  }
}

function resetVoucherForm() {
  els.voucherForm.reset();
  setDefaultDate();
  clearVoucherLines();
  addVoucherLine();
  addVoucherLine();
  refreshVoucherSelects();
}

async function refreshSnapshot() {
  const snapshot = await dbCall('snapshot');
  state.accounts = snapshot.accounts;
  state.recent = snapshot.recent;
  state.trialBalance = snapshot.trialBalance;
  els.storageStatus.textContent = `${snapshot.meta.persistence} | SQLite ${snapshot.meta.sqliteVersion}`;
  renderDashboard();
  renderParentOptions();
  renderTree();
  refreshVoucherSelects();
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
  });
  els.accountForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await dbCall('createAccount', {
      code: document.querySelector('#accountCode').value,
      name: document.querySelector('#accountName').value,
      type: els.accountType.value,
      parentId: els.accountParent.value || null,
      normalSide: els.accountNormalSide.value,
      isGroup: document.querySelector('#accountIsGroup').checked
    });
    els.accountForm.reset();
    await refreshSnapshot();
    showToast('Account created.');
  });

  els.addLine.addEventListener('click', () => addVoucherLine());
  els.applyTemplate.addEventListener('click', applyVoucherPattern);
  els.voucherType.addEventListener('change', () => {
    els.invoiceNo.closest('label').classList.toggle('muted-control', !['purchase', 'sales'].includes(els.voucherType.value));
    els.invoiceDate.closest('label').classList.toggle('muted-control', !['purchase', 'sales'].includes(els.voucherType.value));
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
  if (leafAccounts().length >= 2) {
    addVoucherLine();
    addVoucherLine();
  }
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
