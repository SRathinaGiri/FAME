---
name: fame
description: Develop, diagnose, document, test, and safely modify F.A.M.E (Financial Accounting under Modern Environment), its browser UI, SQLite-WASM accounting engine, PWA persistence, reports, invoices, backup format, and Python sample-data generator. Use for any task in the FAME repository involving accounting behavior, schema changes, vouchers, GST, inventory, fixed assets, reports, offline storage, imports/exports, or sample data.
---

# F.A.M.E

Work on F.A.M.E as a local-first accounting system, not as a generic static website. Preserve accounting integrity, offline persistence, backup compatibility, and report consistency with every change.

## Product model

Understand these product boundaries before editing:

- F.A.M.E means Financial Accounting under Modern Environment.
- Run the application entirely in the browser as an installable PWA.
- Keep accounting data on the user's device. There is no application server or shared cloud database.
- Use SQLite WASM in a module worker.
- Prefer OPFS persistence when cross-origin isolation is available.
- Use the IndexedDB-mirrored SQLite fallback on hosts such as GitHub Pages.
- Treat JSON backup/export, with optional password encryption, as the portable data-transfer mechanism between devices.
- Support Indian accounting conventions, Indian financial years, `en-IN` formatting, GSTIN/PAN fields, HSN/SAC, CGST/SGST/IGST, and rupee values stored as integer paise.

## Repository map

Read only the files relevant to the task, but use this map to avoid rediscovery:

- `index.html`: application shell, navigation, forms, report containers, invoice controls.
- `src/app.js`: UI state, rendering, input handling, report presentation/export, PDF invoices, backup UI, PWA lifecycle.
- `src/styles.css`: responsive application styling.
- `src/db-client.js`: promise-based message bridge to the SQLite worker.
- `src/sqlite-worker.js`: schema, migrations, accounting rules, persistence, CRUD, reports, import/export, worker handlers.
- `src/crypto.js`: PBKDF2-SHA256 and AES-256-GCM backup encryption compatible with the Python generator.
- `src/bi-export.js`: ZIP-of-CSVs and Power BI metadata export.
- `tools/sample_data_generator.py`: schema-compatible sample-company backup generator.
- `tools/requirements-sample-data.txt`: optional Python generator dependencies.
- `public/sw.js`: offline cache; increment its cache name with user-visible releases.
- `public/manifest.webmanifest`: installable PWA metadata.
- `vite.config.js`: `/FAME/` deployment base and isolation headers.
- `README.md`: user/developer overview and supported feature list.

## Accounting model

Preserve double-entry and referential integrity:

- Store monetary values in `*_minor` integer columns representing paise.
- Require every voucher's total debits to equal total credits.
- Use voucher types: `receipt`, `payment`, `purchase`, `sales`, `expense`, `income`, and `journal`.
- Keep voucher numbers unique and sequence them by type and financial year.
- Require personal party accounts for purchase, sales, expense, and income invoices.
- Do not change account structure after transactions exist except for permitted descriptive/personal fields.
- Keep system accounts and their codes stable, especially cash/bank, inventory, GST controls, accumulated profit/loss, opening-balance adjustment, sales/purchase, fixed-asset, accumulated-depreciation, depreciation-expense, and disposal gain/loss accounts.
- Recalculate GST from authoritative product rates and party/company states. Use CGST plus SGST for intra-state invoices and IGST for inter-state invoices.
- Keep voucher item totals equal to taxable value plus all tax components.
- Exclude fixed-asset acquisition/disposal invoices from inventory movement.
- Prevent stock sample data from becoming negative at any chronological point.
- Keep fixed-asset purchase, depreciation, disposal, and depreciation-entry records linked.
- Preserve opening-balance accounting: balance-sheet account openings flow through the automatic Opening Balance Adjustment Account.

## Data model

Treat `SCHEMA_VERSION`, `TABLES`, `ensureSchema`, `migrateSchema`, `exportData`, `replaceData`, and the Python generator as one compatibility surface.

Core tables:

- `settings`
- `account_types`, `head_accounts`, `subhead_accounts`, `accounts`
- `company_master`
- `product_categories`, `product_subcategories`, `products`
- `vouchers`, `voucher_lines`, `voucher_items`
- `fixed_assets`, `fixed_asset_depreciation_entries`
- `tags`, `coa_tags`, `voucher_tags`

When adding or changing a column:

1. Update `ensureSchema`.
2. Add a non-destructive migration in `migrateSchema` for existing installations.
3. Update all reads and writes.
4. Update backup restoration in `replaceData`.
5. Confirm generic export includes the column.
6. Update `tools/sample_data_generator.py`.
7. Test both an existing database migration and a generated-backup import.
8. Change `SCHEMA_VERSION` only when deliberately breaking backup compatibility. Do not rename the database merely for an additive migration.

## Supported workflows

Keep these user workflows functional:

- Dashboard totals, recent vouchers, and trial balance.
- Hierarchical chart of accounts and personal-account identity/address/GST fields.
- Product/service categories, subcategories, opening stock, GST and purchase/sales account bindings.
- Receipt, payment, invoice, expense, income, and journal entry.
- GST intra-state and inter-state posting.
- Printable/downloadable sales invoice PDFs.
- Fixed-asset purchase, depreciation schedules/journals, and disposal.
- Account and voucher tagging.
- Daybook, ledger, profit and loss, trial balance, balance sheet, tag, tax journal, stock, and fixed-asset reports.
- Excel/PDF report export and Power BI ZIP export.
- Plain or optionally password-encrypted backup/import and new-company reset.
- Installation, offline use, service-worker update, OPFS, and IndexedDB fallback.

## Sample-data requirements

Generate a dataset that is useful for testing all major workflows:

- Match the current schema and backup format exactly.
- Populate company and party names, postal addresses, states, GSTIN/PAN when enabled.
- Include all voucher types.
- Include intra-state and inter-state GST cases.
- Keep every voucher balanced and every foreign key valid.
- Produce products and services, categories, tags, opening stock, purchases, sales, receipts, payments, expenses, income, journals, fixed assets, depreciation journals, and disposals.
- Keep chronological product stock non-negative.
- Reconcile product opening inventory value to the Inventory Stock account opening balance.
- Generate deterministic output for a fixed seed except UUIDs, timestamps, and encryption randomness.
- Preserve unencrypted and AES-GCM encrypted backup compatibility. Require a password only when opening an encrypted backup; keep plain backup export and import password-free.

Validate generated data using counts, uniqueness, foreign-key coverage, voucher balance, GST arithmetic, stock chronology, fixed-asset links, and voucher-type coverage. Do not accept successful JSON generation alone as proof of correctness.

## Development workflow

1. Inspect `git status` and preserve unrelated user changes.
2. Trace a feature from HTML controls through `app.js`, `dbCall`, worker handler, schema/query, snapshot, and report rendering.
3. Make the smallest coherent change across all affected layers.
4. Increment both `APP_VERSION` in `src/app.js` and `CACHE_NAME` in `public/sw.js` for changes that deployed users must receive.
5. Run:

```text
npm run build
git diff --check
```

6. For sample-data or schema work, generate both GST and non-GST backups and run structural/accounting validation.
7. Test encrypted generation when Python `cryptography` is available.
8. Report whether files were only changed locally or also committed/pushed.

## Safety rules

- Never delete, reset, or replace a user's browser accounting data as part of ordinary testing.
- Use temporary output paths for generated audit datasets.
- Never expose backup passwords or decrypted accounting data.
- Do not silently weaken foreign keys, voucher balancing, GST validation, or persistence fallbacks.
- Do not assume a normal HTTP SQLite backend exists.
- Do not test by double-clicking `index.html`; use the Vite development server.
- Preserve GitHub Pages base-path behavior and offline asset paths.

## Useful commands

```text
npm install
npm run dev
npm run build
npm run preview
python tools/sample_data_generator.py
python tools/sample_data_generator.py --no-gui --transactions 1000 --accounts 100 --products 40 --assets 12 --financial-year-start 01-04
```
