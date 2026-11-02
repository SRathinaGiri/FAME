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
- Bill-wise settlement of receipts against customer invoices and payments against supplier bills, including partial and multi-bill allocations
- FIFO auto-adjustment of unapplied receipts/payments from customer and supplier ledger reports
- GST sales, purchase, expense, and income journals with export support
- Fixed asset purchase/sale tracking, day-prorated SLM/WDV schedules, depreciation journals, and disposal working notes
- Trial balance and recent voucher dashboard
- Optional password-encrypted JSON backup export/import
- Full database ZIP-of-CSVs export with Power BI relationship metadata and Power Query guidance
- New company reset flow with backup prompt

## Windows and Android apps

F.A.M.E also ships as a Windows desktop app and an Android app. They run the same accounting
engine as the PWA, but **nothing is kept in browser storage**: the books live in an encrypted
database file on the device.

| | Windows | Android |
| --- | --- | --- |
| Shell | Electron (`desktop/`) | Capacitor (`android/`) |
| Database file | `%APPDATA%\F.A.M.E\data\fame.db` | app-private `databases/fame.db` |
| Encryption | SQLCipher 4 via SQLite3 Multiple Ciphers | SQLCipher for Android 4.20 |
| Remembered passphrase (optional) | Windows DPAPI (`safeStorage`) | Android Keystore (AES-GCM) |
| Automatic backups | `Documents\FAME\Backups` | `Documents/FAME/Backups` |
| Exports (PDF, Excel, ZIP, JSON) | Windows "Save As" dialog | `Documents/FAME/Exports`, with Open / Share |

- **Passphrase.** On first start the app asks for a passphrase (8+ characters). It derives the
  database key (SQLCipher 4: PBKDF2-HMAC-SHA512, 256,000 iterations, AES-256). There is no
  recovery: a forgotten passphrase can only be answered by a backup whose passphrase you know.
- **Backups.** About a minute after the last change, and whenever the app is closed or sent to the
  background, an encrypted byte copy of the database is written to `Documents/FAME/Backups`
  (`FAME-YYYY-MM-DD.fame`, last 14 days kept, plus `FAME-latest.fame`). The same `.fame` file opens on
  either platform with the passphrase that was in use when it was made. Restoring keeps the replaced
  data as `FAME-before-restore-….fame`.
- **Moving from the PWA.** Export a JSON backup in the browser version (Backup › Backup Export),
  create the encrypted database in the app, then use Backup › Backup Import.
- Android cloud backup and device-to-device transfer are switched off for the app's data; keep the
  `.fame` files somewhere safe yourself (use "Share latest backup…" to send one to Drive).

### Building

```bash
npm ci && npm ci --prefix desktop
npm run test:native          # encrypted engine end-to-end + Android bridge path
npm run build:desktop && npm start --prefix desktop     # run the Windows app (on Windows)
npm run build:android        # then open android/ in Android Studio, or ./gradlew assembleDebug
```

GitHub Actions builds both on every push to `native-apps` (pre-releases) and `main` (official
release; older ones are removed):

- `.github/workflows/windows-app.yml` → `FAME-Windows-Setup-v….exe`
- `.github/workflows/android-apk.yml` → signed `FAME-v….apk` and `.aab` (Google Play)

The Android build needs a permanent signing key in repository secrets
`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD` and (if the alias is not `fame`)
`ANDROID_KEY_ALIAS`. Create one once and keep it safe — every update must be signed with it:

```bash
keytool -genkeypair -v -keystore fame-release.keystore -alias fame -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 fame-release.keystore   # paste into ANDROID_KEYSTORE_BASE64
```

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

Backups may be created and imported without a password. Supplying `--password` writes a F.A.M.E encrypted backup JSON compatible with the Backup import flow. When a password is supplied, it must contain at least eight characters.
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

Export/import remains the recommended backup path before changing phones, clearing browser storage, or reinstalling. Use optional password encryption when the backup contains sensitive or real accounting data.
