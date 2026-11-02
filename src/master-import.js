// Bulk import of masters: field chooser → Excel / CSV template → check → import (all or nothing).
// Excel files are written and read here with JSZip (no spreadsheet library): one "Data" sheet,
// a "Lists" sheet feeding the dropdowns, and an "Instructions" sheet.

const MAX_ROWS = 5000;

/* ---------------- master definitions ---------------- */
// type: text | code | codeRef | money | number | yesno | enum | state | tags | gstin | pan | color
// required = the column cannot be left out of the template. On update, a blank cell keeps the value.

const partyFields = (word) => [
  { key: 'code', label: 'Code', type: 'code', hint: 'Leave blank for a new code. An existing code updates that account.' },
  { key: 'name', label: 'Name', required: true, example: word === 'customer' ? 'Ravi Traders' : 'Kumar Suppliers' },
  { key: 'subheadCode', label: 'Sub-head', type: 'codeRef', list: word === 'customer' ? 'customerSubheads' : 'supplierSubheads', hint: `Blank = ${word === 'customer' ? '102100 Accounts Receivable' : '201100 Accounts Payable'}.` },
  { key: 'openingBalance', label: 'Opening Balance', type: 'money', pair: 'openingSide', example: '25000' },
  { key: 'openingSide', label: 'Dr / Cr', type: 'enum', options: ['Dr', 'Cr'], hint: `Blank = ${word === 'customer' ? 'Dr' : 'Cr'}.`, pairOf: 'openingBalance' },
  { key: 'address', label: 'Address', example: '12 Main Road, Sivakasi' },
  { key: 'state', label: 'State / UT', type: 'state', example: 'Tamil Nadu (TN)' },
  { key: 'gstNo', label: 'GSTIN', type: 'gstin', example: '33ABCDE1234F1Z5' },
  { key: 'panNo', label: 'PAN', type: 'pan', example: 'ABCDE1234F' },
  { key: 'registration1', label: 'Registration 1' },
  { key: 'registration2', label: 'Registration 2' },
  { key: 'registration3', label: 'Registration 3' },
  { key: 'tags', label: 'Tags', type: 'tags', hint: 'Comma separated; new tags are created.' }
];

export const MASTERS = {
  customers: {
    label: 'Customers',
    note: 'Personal accounts under 102000 Receivables (any sub-head). Matched on Code.',
    fields: partyFields('customer')
  },
  suppliers: {
    label: 'Suppliers / Vendors',
    note: 'Personal accounts under 201000 Payables (any sub-head). Matched on Code.',
    fields: partyFields('supplier')
  },
  products: {
    label: 'Products / Services',
    note: 'Matched on Name (any letter case). Missing categories and sub-categories are created.',
    fields: [
      { key: 'name', label: 'Name', required: true, example: 'A4 Copier Paper' },
      { key: 'kind', label: 'Kind', type: 'enum', options: ['Product', 'Service'], required: true, example: 'Product' },
      { key: 'category', label: 'Category', list: 'categories', hint: 'Needed for a Product.', example: 'Stationery' },
      { key: 'subcategory', label: 'Sub-category', list: 'subcategories', hint: 'Needed for a Product.', example: 'Paper' },
      { key: 'hsnSacCode', label: 'HSN / SAC', example: '4802' },
      { key: 'gstRate', label: 'GST Rate %', type: 'number', example: '18' },
      { key: 'itcAvailable', label: 'ITC Available', type: 'yesno', hint: 'Blank = Yes.' },
      { key: 'purchaseAccountCode', label: 'Purchase Account', type: 'codeRef', list: 'purchaseAccounts', hint: 'Blank = 501101 Purchases.' },
      { key: 'salesAccountCode', label: 'Sales Account', type: 'codeRef', list: 'salesAccounts', hint: 'Blank = 401101 Sales (402101 for a Service).' },
      { key: 'openingQuantity', label: 'Opening Quantity', type: 'number', example: '100' },
      { key: 'openingValue', label: 'Opening Value', type: 'money', example: '25000' }
    ]
  },
  productCategories: {
    label: 'Product Categories',
    note: 'Matched on Name.',
    fields: [{ key: 'name', label: 'Name', required: true, example: 'Stationery' }]
  },
  productSubcategories: {
    label: 'Product Sub-categories',
    note: 'Matched on Category + Name. A missing category is created.',
    fields: [
      { key: 'category', label: 'Category', required: true, list: 'categories', example: 'Stationery' },
      { key: 'name', label: 'Name', required: true, example: 'Paper' }
    ]
  },
  accounts: {
    label: 'Chart of Accounts — Accounts',
    note: 'Matched on Code. Import heads and sub-heads first if the file uses new ones.',
    fields: [
      { key: 'code', label: 'Code', type: 'code', hint: 'Leave blank for a new code. An existing code updates that account.' },
      { key: 'name', label: 'Name', required: true, example: 'Petty Cash' },
      { key: 'subheadCode', label: 'Sub-head', type: 'codeRef', required: true, list: 'subheads', example: '101100' },
      { key: 'openingBalance', label: 'Opening Balance', type: 'money', pair: 'openingSide', hint: 'Balance-sheet accounts only.' },
      { key: 'openingSide', label: 'Dr / Cr', type: 'enum', options: ['Dr', 'Cr'], hint: 'Blank = Dr.', pairOf: 'openingBalance' },
      { key: 'isPersonal', label: 'Personal Account', type: 'yesno', hint: 'Yes for customers, suppliers, staff.' },
      { key: 'address', label: 'Address' },
      { key: 'state', label: 'State / UT', type: 'state' },
      { key: 'gstNo', label: 'GSTIN', type: 'gstin' },
      { key: 'panNo', label: 'PAN', type: 'pan' },
      { key: 'registration1', label: 'Registration 1' },
      { key: 'registration2', label: 'Registration 2' },
      { key: 'registration3', label: 'Registration 3' },
      { key: 'tags', label: 'Tags', type: 'tags', hint: 'Comma separated; new tags are created.' }
    ]
  },
  subheads: {
    label: 'Chart of Accounts — Sub-heads',
    note: 'Matched on Code.',
    fields: [
      { key: 'code', label: 'Code', type: 'code', hint: 'Leave blank for a new code.' },
      { key: 'name', label: 'Name', required: true, example: 'Staff Advances' },
      { key: 'headCode', label: 'Head', type: 'codeRef', required: true, list: 'heads', example: '102000' },
      { key: 'tags', label: 'Tags', type: 'tags' }
    ]
  },
  heads: {
    label: 'Chart of Accounts — Heads',
    note: 'Matched on Code.',
    fields: [
      { key: 'code', label: 'Code', type: 'code', hint: 'Leave blank for a new code.' },
      { key: 'name', label: 'Name', required: true, example: 'Loans and Advances' },
      { key: 'type', label: 'Account Type', type: 'enum', required: true, list: 'accountTypes', example: 'Assets' },
      { key: 'tags', label: 'Tags', type: 'tags' }
    ]
  },
  tags: {
    label: 'Tags',
    note: 'Matched on Name.',
    fields: [
      { key: 'name', label: 'Name', required: true, example: 'Branch: Chennai' },
      { key: 'color', label: 'Colour', type: 'color', example: '#247d68' }
    ]
  }
};

/* ---------------- lists and existing rows from the current snapshot ---------------- */

function buildLists(ctx) {
  const { state, states } = ctx;
  const accounts = state.accounts.filter((a) => !a.isSystem);
  const codeName = (row) => `${row.code} - ${row.name}`;
  return {
    enumKind: ['Product', 'Service'],
    yesno: ['Yes', 'No'],
    drcr: ['Dr', 'Cr'],
    accountTypes: state.accountTypes.map((t) => t.name),
    states: states.map((s) => `${s.name} (${s.code})`),
    heads: state.heads.map(codeName),
    subheads: state.subheads.map(codeName),
    customerSubheads: state.subheads.filter((s) => state.heads.find((h) => h.id === s.headId)?.code === '102000').map(codeName),
    supplierSubheads: state.subheads.filter((s) => state.heads.find((h) => h.id === s.headId)?.code === '201000').map(codeName),
    purchaseAccounts: accounts.filter((a) => a.typeId === 'expense').map(codeName),
    salesAccounts: accounts.filter((a) => a.typeId === 'income').map(codeName),
    categories: state.productCategories.map((c) => c.name),
    subcategories: [...new Set(state.productSubcategories.map((s) => s.name))]
  };
}

function listFor(field) {
  if (field.list) return field.list;
  if (field.type === 'yesno') return 'yesno';
  if (field.type === 'state') return 'states';
  if (field.key === 'openingSide') return 'drcr';
  if (field.key === 'kind') return 'enumKind';
  return null;
}

function tagNames(ctx, level, id) {
  const ids = ctx.state.coaTags?.[level]?.[id] || [];
  return ids.map((tagId) => ctx.state.tags.find((t) => t.id === tagId)?.name).filter(Boolean).join(', ');
}

function stateText(ctx, code) {
  const match = ctx.states.find((s) => s.code === code);
  return match ? `${match.name} (${match.code})` : code || '';
}

const money = (minor) => (minor ? (Math.abs(Number(minor)) / 100).toFixed(2) : '');

function existingRows(masterKey, ctx) {
  const { state } = ctx;
  const headOf = (subhead) => state.heads.find((h) => h.id === subhead?.headId);
  const accountRow = (a) => ({
    code: a.code, name: a.name, subheadCode: a.subheadCode,
    openingBalance: money(a.storedOpeningBalanceMinor ?? a.openingBalanceMinor),
    openingSide: Number(a.storedOpeningBalanceMinor ?? a.openingBalanceMinor) < 0 ? 'Cr' : (Number(a.storedOpeningBalanceMinor ?? a.openingBalanceMinor) > 0 ? 'Dr' : ''),
    isPersonal: a.isPersonal ? 'Yes' : 'No', address: a.address, state: stateText(ctx, a.state),
    gstNo: a.gstNo, panNo: a.panNo, registration1: a.registration1, registration2: a.registration2,
    registration3: a.registration3, tags: tagNames(ctx, 'account', a.id)
  });
  switch (masterKey) {
    case 'customers':
      return state.accounts.filter((a) => a.isPersonal && a.headCode === '102000').map(accountRow);
    case 'suppliers':
      return state.accounts.filter((a) => a.isPersonal && a.headCode === '201000').map(accountRow);
    case 'accounts':
      return state.accounts.filter((a) => !a.isSystem).map(accountRow);
    case 'subheads':
      return state.subheads.map((s) => ({ code: s.code, name: s.name, headCode: headOf(s)?.code || '', tags: tagNames(ctx, 'subhead', s.id) }));
    case 'heads':
      return state.heads.map((h) => ({ code: h.code, name: h.name, type: state.accountTypes.find((t) => t.id === h.typeId)?.name || '', tags: tagNames(ctx, 'head', h.id) }));
    case 'products':
      return state.products.map((p) => ({
        name: p.name, kind: p.kind === 'service' ? 'Service' : 'Product', category: p.categoryName, subcategory: p.subcategoryName,
        hsnSacCode: p.hsnSacCode, gstRate: String(p.gstRate ?? ''), itcAvailable: p.itcAvailable ? 'Yes' : 'No',
        purchaseAccountCode: p.purchaseAccountCode, salesAccountCode: p.salesAccountCode,
        openingQuantity: p.kind === 'service' ? '' : String(p.openingQuantity ?? ''),
        openingValue: p.kind === 'service' ? '' : money(p.openingValueMinor)
      }));
    case 'productCategories':
      return state.productCategories.map((c) => ({ name: c.name }));
    case 'productSubcategories':
      return state.productSubcategories.map((s) => ({ category: state.productCategories.find((c) => c.id === s.categoryId)?.name || '', name: s.name }));
    case 'tags':
      return state.tags.map((t) => ({ name: t.name, color: t.color }));
    default:
      return [];
  }
}

/* ---------------- Excel (xlsx) writer ---------------- */

const xmlEscape = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

function columnName(index) {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

function cellXml(ref, value, style) {
  const s = style ? ` s="${style}"` : '';
  if (value === null || value === undefined || value === '') return style ? `<c r="${ref}"${s}/>` : '';
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}

function sheetXml(rows, { widths = [], freeze = false, textColumns = [], validations = [] } = {}) {
  const cols = widths.length
    ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"${textColumns.includes(i) ? ' style="2"' : ''}/>`).join('')}</cols>`
    : '';
  const view = freeze
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  const data = rows.map((row, r) => `<row r="${r + 1}">${row.map((cell, c) => {
    const value = cell && typeof cell === 'object' ? cell.v : cell;
    const style = cell && typeof cell === 'object' ? cell.s : (textColumns.includes(c) && r > 0 ? 2 : 0);
    return cellXml(`${columnName(c)}${r + 1}`, value, style);
  }).join('')}</row>`).join('');
  const dv = validations.length
    ? `<dataValidations count="${validations.length}">${validations.map((v) => `<dataValidation type="list" allowBlank="1" showErrorMessage="${v.strict ? 1 : 0}" errorStyle="${v.strict ? 'stop' : 'warning'}" sqref="${v.sqref}"><formula1>${xmlEscape(v.formula)}</formula1></dataValidation>`).join('')}</dataValidations>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${view}<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${data}</sheetData>${dv}<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F3A5F"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF247D68"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="49" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="49" fontId="1" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

export async function buildExcelTemplate(masterKey, fieldKeys, { includeExisting, ctx }) {
  const { default: JSZip } = await import('jszip');
  const master = MASTERS[masterKey];
  const fields = master.fields.filter((f) => fieldKeys.includes(f.key));
  const lists = buildLists(ctx);
  const header = fields.map((f) => ({ v: `${f.label}${f.required ? ' *' : ''}`, s: f.required ? 3 : 1 }));
  const body = includeExisting ? existingRows(masterKey, ctx).map((row) => fields.map((f) => row[f.key] ?? '')) : [];
  const dataRows = [header, ...body];
  const lastRow = Math.max(MAX_ROWS, body.length + 500);

  // Lists sheet: one column per dropdown used by this template.
  const listKeys = [...new Set(fields.map(listFor).filter(Boolean))].filter((k) => lists[k]?.length);
  const listTitles = { enumKind: 'Kind', yesno: 'Yes / No', drcr: 'Dr / Cr', accountTypes: 'Account Types', states: 'States / UTs', heads: 'Heads', subheads: 'Sub-heads', customerSubheads: 'Customer Sub-heads', supplierSubheads: 'Supplier Sub-heads', purchaseAccounts: 'Purchase Accounts', salesAccounts: 'Sales Accounts', categories: 'Categories', subcategories: 'Sub-categories' };
  const longest = Math.max(1, ...listKeys.map((k) => lists[k].length));
  const listRows = [listKeys.map((k) => ({ v: listTitles[k] || k, s: 1 }))];
  for (let i = 0; i < longest; i += 1) listRows.push(listKeys.map((k) => lists[k][i] ?? ''));

  const validations = fields.map((f, i) => {
    const listKey = listFor(f);
    const col = listKeys.indexOf(listKey);
    if (col < 0) return null;
    const letter = columnName(col);
    // Fixed choices are enforced; masters lists only warn (a new category or code is fine).
    const strict = ['yesno', 'drcr', 'enumKind', 'accountTypes'].includes(listKey);
    return { sqref: `${columnName(i)}2:${columnName(i)}${lastRow}`, formula: `Lists!$${letter}$2:$${letter}$${lists[listKey].length + 1}`, strict };
  }).filter(Boolean);
  const textColumns = fields.map((f, i) => (['money', 'number'].includes(f.type) ? -1 : i)).filter((i) => i >= 0);

  const instructions = [
    [{ v: `F.A.M.E import template — ${master.label}`, s: 4 }],
    [master.note],
    ['Fill one record per row on the "Data" sheet. Columns marked * are compulsory. Do not rename the header row.'],
    ['A row whose key already exists updates that record; a blank cell keeps the current value.'],
    ['The whole file is checked first. If any row has a problem, nothing is imported and the problems are listed by row.'],
    ['Amounts: plain numbers (25000 or 25000.50), no ₹ sign needed. Dropdowns come from the "Lists" sheet.'],
    [],
    [{ v: 'Column', s: 1 }, { v: 'Compulsory', s: 1 }, { v: 'What to enter', s: 1 }, { v: 'Example', s: 1 }],
    ...fields.map((f) => [f.label, f.required ? 'Yes' : '', describe(f), f.example || ''])
  ];

  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="Data" sheetId="1" r:id="rId1"/><sheet name="Lists" sheetId="2" r:id="rId2"/><sheet name="Instructions" sheetId="3" r:id="rId3"/></sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file('xl/styles.xml', STYLES);
  zip.file('xl/worksheets/sheet1.xml', sheetXml(dataRows, {
    widths: fields.map((f) => Math.min(48, Math.max(12, f.label.length + 4, ...(f.key === 'address' ? [36] : [])))),
    freeze: true, textColumns, validations
  }));
  zip.file('xl/worksheets/sheet2.xml', sheetXml(listRows, { widths: listKeys.map(() => 34), freeze: true }));
  zip.file('xl/worksheets/sheet3.xml', sheetXml(instructions, { widths: [24, 12, 70, 26] }));
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function describe(f) {
  const base = {
    code: '6-digit code',
    codeRef: '6-digit code (pick from the list; "102100 - Accounts Receivable" is fine)',
    money: 'Amount in rupees',
    number: 'Number',
    yesno: 'Yes or No',
    enum: `One of: ${(f.options || []).join(', ') || 'see the list'}`,
    state: 'State / UT name or its code (TN, KL, …)',
    tags: 'Tag names separated by commas',
    gstin: '15-character GSTIN',
    pan: '10-character PAN',
    color: 'Colour as #RRGGBB'
  }[f.type] || 'Text';
  return f.hint ? `${base}. ${f.hint}` : base;
}

export function buildCsvTemplate(masterKey, fieldKeys, { includeExisting, ctx }) {
  const master = MASTERS[masterKey];
  const fields = master.fields.filter((f) => fieldKeys.includes(f.key));
  const rows = [fields.map((f) => `${f.label}${f.required ? ' *' : ''}`)];
  if (includeExisting) for (const row of existingRows(masterKey, ctx)) rows.push(fields.map((f) => row[f.key] ?? ''));
  const csv = rows.map((row) => row.map((value) => {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }).join(',')).join('\r\n');
  // BOM so Excel opens it as UTF-8 (₹, regional names).
  return new Blob(['﻿', csv, '\r\n'], { type: 'text/csv;charset=utf-8' });
}

/* ---------------- readers ---------------- */

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i += 1; } else if (ch === '"') quoted = false; else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.map((cells, index) => ({ rowNumber: index + 1, cells }));
}

function colIndex(ref) {
  const letters = ref.match(/^[A-Z]+/)[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const textOf = (node) => [...node.getElementsByTagName('t')].map((t) => t.textContent).join('');

export async function parseXlsx(arrayBuffer) {
  const { default: JSZip } = await import('jszip');
  let zip;
  try {
    zip = await JSZip.loadAsync(arrayBuffer);
  } catch {
    throw new Error('This is not a valid Excel (.xlsx) file. Old .xls files: save as .xlsx or CSV first.');
  }
  const parser = new DOMParser();
  const read = async (path) => {
    const file = zip.file(path);
    return file ? parser.parseFromString(await file.async('string'), 'application/xml') : null;
  };
  const workbook = await read('xl/workbook.xml');
  const rels = await read('xl/_rels/workbook.xml.rels');
  if (!workbook || !rels) throw new Error('The Excel file has no workbook.');
  const sheets = [...workbook.getElementsByTagName('sheet')];
  const sheet = sheets.find((s) => s.getAttribute('name')?.toLowerCase() === 'data') || sheets[0];
  const rid = sheet.getAttribute('r:id') || sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  const rel = [...rels.getElementsByTagName('Relationship')].find((r) => r.getAttribute('Id') === rid);
  let target = rel.getAttribute('Target').replace(/^\//, '');
  if (!target.startsWith('xl/')) target = `xl/${target}`;
  const shared = await read('xl/sharedStrings.xml');
  const strings = shared ? [...shared.getElementsByTagName('si')].map(textOf) : [];
  const doc = await read(target);
  const out = [];
  for (const rowNode of doc.getElementsByTagName('row')) {
    const rowNumber = Number(rowNode.getAttribute('r')) || out.length + 1;
    const cells = [];
    for (const c of rowNode.getElementsByTagName('c')) {
      const ref = c.getAttribute('r');
      const index = ref ? colIndex(ref) : cells.length;
      const t = c.getAttribute('t');
      const v = c.getElementsByTagName('v')[0]?.textContent ?? '';
      let value;
      if (t === 's') value = strings[Number(v)] ?? '';
      else if (t === 'inlineStr') value = textOf(c.getElementsByTagName('is')[0] || c);
      else if (t === 'b') value = v === '1' ? 'Yes' : 'No';
      else value = v;
      cells[index] = value;
    }
    out.push({ rowNumber, cells: Array.from(cells, (value) => value ?? '') });
  }
  return out;
}

/* ---------------- header matching and row conversion ---------------- */

const norm = (value) => String(value || '').toLowerCase().replace(/\*/g, '').replace(/[^a-z0-9]/g, '');

const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;

function amountMinor(text) {
  const clean = String(text).replace(/[₹,\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(clean)) return NaN;
  return Math.round(Number(clean) * 100);
}

export function convertRows(masterKey, sheetRows, ctx) {
  const master = MASTERS[masterKey];
  const errors = [];
  const warnings = [];
  const headerIndex = sheetRows.findIndex((r) => r.cells.some((c) => String(c).trim()));
  if (headerIndex < 0) return { rows: [], errors: [{ rowNumber: 1, message: 'The file is empty.' }], warnings };
  const header = sheetRows[headerIndex].cells.map(norm);
  const columns = {};
  master.fields.forEach((f) => {
    const at = header.findIndex((h) => h === norm(f.label) || h === norm(f.key));
    if (at >= 0) columns[f.key] = at;
  });
  const missing = master.fields.filter((f) => f.required && columns[f.key] === undefined);
  if (missing.length) {
    errors.push({ rowNumber: sheetRows[headerIndex].rowNumber, message: `Missing compulsory column(s): ${missing.map((f) => f.label).join(', ')}. Use a template downloaded from F.A.M.E.` });
  }
  const known = new Set(Object.values(columns));
  sheetRows[headerIndex].cells.forEach((h, i) => {
    if (String(h).trim() && !known.has(i)) warnings.push(`Column "${h}" is not used by this master and was ignored.`);
  });
  const data = sheetRows.slice(headerIndex + 1).filter((r) => r.cells.some((c) => String(c ?? '').trim()));
  if (data.length > MAX_ROWS) errors.push({ rowNumber: 0, message: `At most ${MAX_ROWS} rows per file; this file has ${data.length}.` });
  const isParty = masterKey === 'customers' || masterKey === 'suppliers';
  const keySeen = new Map();
  const rows = [];
  for (const { rowNumber, cells } of data) {
    const fields = {};
    const problems = [];
    for (const f of master.fields) {
      if (columns[f.key] === undefined) continue;
      const raw = String(cells[columns[f.key]] ?? '').trim();
      if (!raw) continue;
      switch (f.type) {
        case 'code': case 'codeRef': {
          const m = raw.match(/^(\d{6})(\s|-|$)/);
          if (!m) problems.push(`${f.label} "${raw}" must start with a 6-digit code.`); else fields[f.key] = m[1];
          break;
        }
        case 'money': {
          const minor = amountMinor(raw);
          if (!Number.isFinite(minor) || minor < 0) problems.push(`${f.label} "${raw}" is not a valid amount.`); else fields[f.key] = minor;
          break;
        }
        case 'number': {
          const n = Number(raw.replace(/,/g, ''));
          if (!Number.isFinite(n) || n < 0) problems.push(`${f.label} "${raw}" is not a valid number.`); else fields[f.key] = n;
          break;
        }
        case 'yesno': {
          const v = raw.toLowerCase();
          if (['yes', 'y', 'true', '1'].includes(v)) fields[f.key] = true;
          else if (['no', 'n', 'false', '0'].includes(v)) fields[f.key] = false;
          else problems.push(`${f.label} must be Yes or No (found "${raw}").`);
          break;
        }
        case 'enum': {
          if (f.options && !f.options.some((o) => o.toLowerCase() === raw.toLowerCase())) problems.push(`${f.label} must be one of ${f.options.join(', ')} (found "${raw}").`);
          else fields[f.key] = raw;
          break;
        }
        case 'state': {
          const v = raw.toLowerCase();
          const match = ctx.states.find((s) => s.code.toLowerCase() === v || s.name.toLowerCase() === v
            || `${s.name} (${s.code})`.toLowerCase() === v);
          if (!match) problems.push(`State / UT "${raw}" is not recognised.`); else fields[f.key] = match.code;
          break;
        }
        case 'tags':
          fields[f.key] = raw.split(',').map((t) => t.trim()).filter(Boolean);
          break;
        case 'gstin': {
          const v = raw.toUpperCase().replace(/\s/g, '');
          if (!GSTIN_RE.test(v)) problems.push(`GSTIN "${raw}" is not in the 15-character GSTIN format.`); else fields[f.key] = v;
          break;
        }
        case 'pan': {
          const v = raw.toUpperCase().replace(/\s/g, '');
          if (!PAN_RE.test(v)) problems.push(`PAN "${raw}" is not in the AAAAA9999A format.`); else fields[f.key] = v;
          break;
        }
        case 'color':
          fields[f.key] = raw;
          break;
        default:
          fields[f.key] = raw;
      }
    }
    // Opening balance + Dr / Cr → one signed amount (Dr positive), as the account form stores it.
    if (fields.openingBalance !== undefined) {
      const side = String(fields.openingSide || (masterKey === 'suppliers' ? 'Cr' : 'Dr')).toLowerCase();
      fields.openingBalanceMinor = side === 'cr' ? -fields.openingBalance : fields.openingBalance;
    }
    delete fields.openingBalance;
    delete fields.openingSide;
    if (fields.openingValue !== undefined) {
      fields.openingValueMinor = fields.openingValue;
      delete fields.openingValue;
    }
    if (isParty) fields.isPersonal = true;
    // The same record twice in one file is almost always a mistake.
    const key = { products: fields.name?.toLowerCase(), productCategories: fields.name?.toLowerCase(), tags: fields.name?.toLowerCase(), productSubcategories: fields.category && fields.name ? `${fields.category}|${fields.name}`.toLowerCase() : null }[masterKey] ?? fields.code;
    if (key) {
      if (keySeen.has(key)) problems.push(`Same record as row ${keySeen.get(key)}.`);
      else keySeen.set(key, rowNumber);
    }
    if (problems.length) problems.forEach((message) => errors.push({ rowNumber, message }));
    else rows.push({ rowNumber, fields });
  }
  return { rows, errors, warnings, dataRows: data.length };
}

/* ---------------- screen ---------------- */

export function initMasterImport(ctx) {
  const view = document.querySelector('#importView');
  if (!view) return;
  const $ = (sel) => view.querySelector(sel);
  const masterSelect = $('#importMaster');
  const fieldsBox = $('#importFields');
  const fileInput = $('#importMasterFile');
  const report = $('#importReport');
  const applyButton = $('#importApply');
  let checked = null; // { masterKey, rows, fileName }

  masterSelect.innerHTML = Object.entries(MASTERS).map(([key, m]) => `<option value="${key}">${m.label}</option>`).join('');

  function renderFields() {
    const master = MASTERS[masterSelect.value];
    $('#importMasterNote').textContent = master.note;
    fieldsBox.innerHTML = master.fields.filter((f) => !f.pairOf).map((f) => `
      <label class="import-field${f.required ? ' required' : ''}">
        <input type="checkbox" value="${f.key}" ${f.required ? 'checked disabled' : 'checked'}>
        <span>${f.label}${f.pair ? ' + Dr / Cr' : ''}${f.required ? ' <em>compulsory</em>' : ''}</span>
      </label>`).join('');
    resetCheck();
  }

  function selectedKeys() {
    const master = MASTERS[masterSelect.value];
    const keys = [...fieldsBox.querySelectorAll('input:checked')].map((i) => i.value);
    master.fields.forEach((f) => { if (f.pairOf && keys.includes(f.pairOf)) keys.push(f.key); });
    return master.fields.map((f) => f.key).filter((k) => keys.includes(k));
  }

  function resetCheck() {
    checked = null;
    applyButton.disabled = true;
    applyButton.textContent = 'Import';
    report.innerHTML = '';
  }

  const fileStem = () => `fame-${masterSelect.value}-template-${ctx.todayIso()}`;
  const fresh = () => ({ ...ctx, state: ctx.getState() });

  $('#importDownloadXlsx').addEventListener('click', async () => {
    try {
      const blob = await buildExcelTemplate(masterSelect.value, selectedKeys(), { includeExisting: $('#importIncludeExisting').checked, ctx: fresh() });
      ctx.downloadBlob(`${fileStem()}.xlsx`, blob);
    } catch (error) { ctx.showToast(error.message); }
  });
  $('#importDownloadCsv').addEventListener('click', () => {
    const blob = buildCsvTemplate(masterSelect.value, selectedKeys(), { includeExisting: $('#importIncludeExisting').checked, ctx: fresh() });
    ctx.downloadBlob(`${fileStem()}.csv`, blob);
  });
  $('#importSelectAll').addEventListener('click', () => {
    const boxes = [...fieldsBox.querySelectorAll('input:not(:disabled)')];
    const all = boxes.every((b) => b.checked);
    boxes.forEach((b) => { b.checked = !all; });
  });
  masterSelect.addEventListener('change', renderFields);
  fileInput.addEventListener('change', resetCheck);

  async function readFile(file) {
    if (/\.csv$/i.test(file.name) || file.type === 'text/csv') return parseCsv(await file.text());
    if (/\.xlsx$/i.test(file.name)) return parseXlsx(await file.arrayBuffer());
    throw new Error('Choose an .xlsx or .csv file.');
  }

  function renderReport(result, conversion, applied) {
    const errors = [...conversion.errors, ...(result?.errors || [])].sort((a, b) => a.rowNumber - b.rowNumber);
    const created = result?.created ?? 0;
    const updated = result?.updated ?? 0;
    const head = applied
      ? `<p class="import-ok">Imported: ${created} new, ${updated} updated.</p>`
      : errors.length
        ? `<p class="import-bad">${errors.length} problem(s) found in ${conversion.dataRows} data row(s). Nothing has been imported. Fix the rows below and check again.</p>`
        : `<p class="import-ok">The file is clean: ${conversion.dataRows} row(s) — ${created} new, ${updated} to update. Press Import to apply.</p>`;
    const warn = conversion.warnings.length ? `<ul class="field-note">${conversion.warnings.map((w) => `<li>${ctx.escapeHtml(w)}</li>`).join('')}</ul>` : '';
    const table = errors.length ? `
      <div class="table-wrap"><table><thead><tr><th>Row</th><th>Problem</th></tr></thead><tbody>
      ${errors.map((e) => `<tr><td>${e.rowNumber || '—'}</td><td>${ctx.escapeHtml(e.message)}</td></tr>`).join('')}
      </tbody></table></div>` : '';
    report.innerHTML = head + warn + table;
  }

  $('#importCheck').addEventListener('click', async () => {
    resetCheck();
    const file = fileInput.files[0];
    if (!file) return ctx.showToast('Choose the filled .xlsx or .csv file.');
    try {
      const masterKey = masterSelect.value;
      const conversion = convertRows(masterKey, await readFile(file), fresh());
      let result = null;
      if (conversion.rows.length && !conversion.errors.some((e) => e.rowNumber === 0 || /Missing compulsory/.test(e.message))) {
        result = await ctx.dbCall('importMasters', { master: masterKey, rows: conversion.rows, dryRun: true });
      } else if (!conversion.rows.length && !conversion.errors.length) {
        conversion.errors.push({ rowNumber: 0, message: 'The file has no data rows.' });
      }
      renderReport(result, conversion, false);
      if (result && !result.errors.length && !conversion.errors.length) {
        checked = { masterKey, rows: conversion.rows, conversion };
        applyButton.disabled = false;
        applyButton.textContent = `Import ${conversion.rows.length} row(s)`;
      }
    } catch (error) {
      report.innerHTML = `<p class="import-bad">${ctx.escapeHtml(error.message)}</p>`;
    }
  });

  applyButton.addEventListener('click', async () => {
    if (!checked) return;
    applyButton.disabled = true;
    try {
      const result = await ctx.dbCall('importMasters', { master: checked.masterKey, rows: checked.rows, dryRun: false });
      renderReport(result, checked.conversion, result.applied);
      if (result.applied) {
        await ctx.refreshSnapshot();
        ctx.showToast(`Imported ${result.created} new and ${result.updated} updated ${MASTERS[checked.masterKey].label.toLowerCase()}.`);
        fileInput.value = '';
      }
    } catch (error) {
      ctx.showToast(error.message);
    } finally {
      checked = null;
      applyButton.textContent = 'Import';
    }
  });

  renderFields();
}
