const tableMetadata = {
  settings: { primaryKey: 'key' },
  account_types: { primaryKey: 'id' },
  head_accounts: { primaryKey: 'id', relationships: 'type_id -> account_types.id' },
  subhead_accounts: { primaryKey: 'id', relationships: 'head_id -> head_accounts.id' },
  accounts: { primaryKey: 'id', relationships: 'subhead_id -> subhead_accounts.id' },
  company_master: { primaryKey: 'id' },
  products: { primaryKey: 'id', relationships: 'purchase_account_id -> accounts.id; sales_account_id -> accounts.id' },
  fixed_assets: { primaryKey: 'id', relationships: 'asset_account_id -> accounts.id; purchase_voucher_id -> vouchers.id; sale_voucher_id -> vouchers.id' },
  tags: { primaryKey: 'id' },
  coa_tags: { primaryKey: 'entity_type + entity_id + tag_id', relationships: 'tag_id -> tags.id' },
  vouchers: { primaryKey: 'id', relationships: 'party_account_id -> accounts.id' },
  voucher_lines: { primaryKey: 'id', relationships: 'voucher_id -> vouchers.id; account_id -> accounts.id' },
  voucher_items: { primaryKey: 'id', relationships: 'voucher_id -> vouchers.id; product_id -> products.id' },
  voucher_tags: { primaryKey: 'voucher_id + tag_id', relationships: 'voucher_id -> vouchers.id; tag_id -> tags.id' },
  fixed_asset_depreciation_entries: { primaryKey: 'id', relationships: 'asset_id -> fixed_assets.id; voucher_id -> vouchers.id' }
};

function csvValue(value) {
  if (value == null) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function rowsToCsv(rows, configuredHeaders = []) {
  const headers = configuredHeaders.length
    ? configuredHeaders
    : [...new Set(rows.flatMap((row) => Object.keys(row)))];
  if (!headers.length) return '\ufeff';
  const lines = [
    headers.map(csvValue).join(','),
    ...rows.map((row) => headers.map((header) => csvValue(row[header])).join(','))
  ];
  return `\ufeff${lines.join('\r\n')}\r\n`;
}

function powerQueryReadme(companyName, exportedAt) {
  return `F.A.M.E Power BI / CSV Export
================================

Company: ${companyName}
Exported at: ${exportedAt}

Contents
--------
- tables/*.csv: one UTF-8 CSV for every F.A.M.E database table.
- manifest.csv: table names, row counts, primary keys, and relationships.
- relationships.csv: relationship definitions for a Power BI data model.
- power-query-folder-template.pq: optional Power Query template.

Recommended Power BI import
---------------------------
1. Extract this ZIP to a permanent folder.
2. In Power BI Desktop select Get Data > Folder.
3. Select the extracted "tables" folder.
4. Choose Transform Data.
5. Filter the Extension column to ".csv".
6. Either combine selected tables or create one query per CSV.
7. Use relationships.csv to configure the model relationships.

Important
---------
- This ZIP and its CSV files are not encrypted. Store them securely.
- Amount columns ending in "_minor" are stored in paise. Divide by 100 for rupees.
- Dates are exported in ISO yyyy-mm-dd format for reliable BI parsing.
- IDs are text keys. Do not convert them to numbers.
- coa_tags uses entity_type and entity_id as a polymorphic link to the relevant master table.
- This export is for analysis. Use the encrypted JSON backup for restoring F.A.M.E.
`;
}

function powerQueryFolderTemplate() {
  return `// Replace the path, then duplicate this query and set TableFile for each required table.
let
    ExportFolder = "C:\\\\FAME-PowerBI\\\\tables",
    TableFile = "vouchers.csv",
    Source = Csv.Document(
        File.Contents(ExportFolder & "\\\\" & TableFile),
        [Delimiter = ",", Encoding = 65001, QuoteStyle = QuoteStyle.Csv]
    ),
    Headers = Table.PromoteHeaders(Source, [PromoteAllScalars = true])
in
    Headers
`;
}

export async function buildBiExport(backup, companyName, outputType = 'blob') {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const tablesFolder = zip.folder('tables');
  const manifest = [];
  const relationships = [];

  for (const [tableName, rows] of Object.entries(backup.data || {})) {
    tablesFolder.file(`${tableName}.csv`, rowsToCsv(rows, backup.tableColumns?.[tableName] || []));
    const metadata = tableMetadata[tableName] || {};
    manifest.push({
      table_name: tableName,
      file_name: `tables/${tableName}.csv`,
      row_count: rows.length,
      primary_key: metadata.primaryKey || '',
      relationships: metadata.relationships || ''
    });
    for (const relationship of String(metadata.relationships || '').split(';').map((item) => item.trim()).filter(Boolean)) {
      const [fromColumn, target] = relationship.split('->').map((item) => item.trim());
      const [toTable, toColumn] = target.split('.');
      relationships.push({
        from_table: tableName,
        from_column: fromColumn,
        to_table: toTable,
        to_column: toColumn,
        cardinality: 'many-to-one'
      });
    }
  }

  zip.file('manifest.csv', rowsToCsv(manifest));
  zip.file('relationships.csv', rowsToCsv(relationships));
  zip.file('README.txt', powerQueryReadme(companyName, backup.exportedAt));
  zip.file('power-query-folder-template.pq', powerQueryFolderTemplate());
  zip.file('source-backup-metadata.json', JSON.stringify({
    app: backup.app,
    schemaVersion: backup.schemaVersion,
    exportedAt: backup.exportedAt,
    tableColumns: backup.tableColumns,
    company: companyName
  }, null, 2));

  return zip.generateAsync({
    type: outputType,
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
}
