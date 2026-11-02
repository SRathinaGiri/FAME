# F.A.M.E

Financial Accounting under Modern Environment.

## Install F.A.M.E

F.A.M.E is distributed as a **Windows app** and an **Android app**. Download the latest version from
[Releases](https://github.com/SRathinaGiri/FAME/releases/latest):

| Device | File | How to install |
| --- | --- | --- |
| Windows 10/11 | `FAME-Windows-Setup-v….exe` | Run it. If SmartScreen warns about an unknown publisher, choose **More info › Run anyway**. |
| Android 7+ | `FAME-v….apk` | Open it on the phone and allow **Install unknown apps** for your browser or file manager when asked. |

On first start, choose a passphrase. Your books are kept in an encrypted database file on the
device, with automatic daily backups in `Documents/FAME/Backups`. There is no way to recover a
forgotten passphrase.

### The web (PWA) version is retired

The browser version kept the books in browser storage, which the browser can clear without asking.
It no longer offers installation and only shows a notice to move to the app. To move your data:

1. Open the web version, go to **Backup › Export Backup** and save the JSON file (set a password if you like).
2. Install the Windows or Android app and create your encrypted database.
3. In the app, go to **Backup › Import Backup** and choose that file.

Downloading the source code is only necessary for developers.

F.A.M.E is a local-first accounting app. The first module includes:

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

F.A.M.E ships as a Windows desktop app and an Android app. They run the same accounting
engine as the retired PWA, but **nothing is kept in browser storage**: the books live in an encrypted
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
- **Moving from the PWA.** Export a JSON backup in the browser version (Backup › Export Backup),
  create the encrypted database in the app, then use Backup › Import Backup.
- Android cloud backup and device-to-device transfer are switched off for the app's data; keep the
  `.fame` files somewhere safe yourself (use "Share latest backup…" to send one to Drive).

### Building

```bash
npm ci && npm ci --prefix desktop
npm run test:native          # encrypted engine end-to-end + Android bridge path
npm run build:desktop && npm start --prefix desktop     # run the Windows app (on Windows)
npm run build:android        # then open android/ in Android Studio, or ./gradlew assembleDebug
```

GitHub Actions builds both on every push to `main` and publishes them as the latest release
(older releases are removed). Running a workflow by hand on another branch publishes a pre-release
for testing:

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

Pushing to `main` still deploys the web build to `https://srathingiri.github.io/FAME/`, but only so
that existing browser users can export their data: it shows a retirement notice and no install
option. Once users have moved, switch it off in **Settings › Pages** (Source: *None*) and delete
`.github/workflows/pages.yml`.
