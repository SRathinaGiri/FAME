# F.A.M.E

Financial Accounting under Modern Environment.

## Install F.A.M.E

End users do not need to download the source code, install Node.js, or run
commands.

1. Open [F.A.M.E](https://srathingiri.github.io/FAME/) in Google Chrome or
   Microsoft Edge. These browsers are recommended for installation.
2. Install the application using one of these options:
   - Click **Install F.A.M.E** if the button appears inside F.A.M.E.
   - In Edge, click the **App available** icon in the address bar, or open
     **... > Apps > Install F.A.M.E**.
   - In Chrome, click the install icon in the address bar, or open the browser
     menu and select **Install F.A.M.E**.
3. Launch F.A.M.E from the desktop, Start menu, or home screen like a normal
   application.

After the first successful load, the installed PWA can work offline. Application
data is stored locally on the user's device, so encrypted backups should be
created regularly.

Firefox installation support depends on the operating system and Firefox
version. Its browser menu or address bar may provide a web-app installation
option, but F.A.M.E's own install button may not appear. Use Chrome or Edge for
the simplest installation experience.

Downloading the GitHub source code is only necessary for developers. Do not
double-click `index.html`; browser security prevents the SQLite WASM module and
its database worker from running from a `file://` URL.

F.A.M.E is a local-first accounting PWA built as a self-contained browser app. The first module includes:

- PWA shell and offline cache
- SQLite WASM database running in a module worker
- OPFS-first persistence with transient fallback when OPFS is unavailable
- Hierarchical chart of accounts
- Receipt, payment, purchase invoice, sales invoice, expense, income, and journal voucher entry
- Tags for accounts, heading accounts, and vouchers
- Product and service masters with HSN/SAC, GST rates, and ITC eligibility
- GST-aware purchase and sales invoices with intra-state CGST/SGST and inter-state IGST
- GST sales, purchase, expense, and income journals with export support
- Fixed asset purchase/sale tracking, day-prorated SLM/WDV schedules, depreciation journals, and disposal working notes
- Trial balance and recent voucher dashboard
- Password-encrypted JSON backup export/import
- Full database ZIP-of-CSVs export with Power BI relationship metadata and Power Query guidance
- New company reset flow with backup prompt

## Development

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173/`.

## Sample Data

Generate sample electronics trading company data with the Tkinter utility:

```bash
pip install -r tools/requirements-sample-data.txt
python tools/sample_data_generator.py
```

CLI mode is also available:

```bash
python tools/sample_data_generator.py --no-gui --transactions 1000 --accounts 100 --products 40 --assets 12 --financial-year-start 01-04 --password "change-me"
```

Supplying `--password` writes a F.A.M.E encrypted backup JSON compatible with the Backup import flow. F.A.M.E requires an 8-character minimum password for backup import, and the generator enforces the same rule.
The financial-year start uses `dd-mm` format and defaults to `01-04`.

SQLite OPFS requires cross-origin isolation headers. The Vite config sends:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

## Build

```bash
npm run build
npm run preview
```

The app is static after build and can be hosted by any server that sends the required isolation headers for OPFS.

## GitHub Pages

Pushing to `main` deploys the app to GitHub Pages with the `/FAME/` base path:

```text
https://srathingiri.github.io/FAME/
```

GitHub Pages does not provide configurable COOP/COEP response headers. F.A.M.E therefore uses:

- OPFS-backed SQLite when the host/browser supports the required isolation headers
- IndexedDB-mirrored SQLite fallback on GitHub Pages, so installed mobile use can still keep local data

Encrypted export/import remains the recommended backup path before changing phones, clearing browser storage, or reinstalling.
