<div align="center">

# 📒 F.A.M.E

### Financial Accounting under Modern Environment

**Double-entry accounting with GST invoices, stock and fixed assets, for Windows and Android. Your books stay in an encrypted file on your own device.**

[![Version](https://img.shields.io/badge/version-0.33-3b82f6?style=flat-square)](https://github.com/SRathinaGiri/FAME/releases)
[![Windows](https://img.shields.io/badge/Windows-10%20%7C%2011-0078d4?style=flat-square&logo=windows&logoColor=white)](https://github.com/SRathinaGiri/FAME/releases)
[![Android](https://img.shields.io/badge/Android-7%2B-3ddc84?style=flat-square&logo=android&logoColor=white)](https://github.com/SRathinaGiri/FAME/releases)
[![Offline](https://img.shields.io/badge/works-100%25%20offline-10b981?style=flat-square)](#-your-data)
[![Encryption](https://img.shields.io/badge/database-SQLCipher%20AES--256-8b5cf6?style=flat-square)](#-your-data)

### [⬇ Download for Windows or Android](https://github.com/SRathinaGiri/FAME/releases)

🪔 *Part of the [Diwali Mega Gift Week 2026](https://srathinagiri.github.io/#gift-week): one free app every day, 6–12 November. Open fresh books this new year.*

</div>

---

## ✨ What it does

- **Chart of accounts** with headings and sub-headings, and tags for accounts and vouchers.
- **Vouchers:** receipt, payment, purchase invoice, sales invoice, expense, income and journal.
- **GST-aware invoices:** product and service masters with HSN/SAC, GST rates and ITC eligibility. Intra-state CGST + SGST and inter-state IGST are worked out automatically.
- **Bill-wise settlement:** match receipts to customer invoices and payments to supplier bills, including part payments and one payment across several bills. Unapplied amounts can be adjusted FIFO from the party ledger.
- **Stock:** stock summary and stock movement register, valued on FIFO or weighted average.
- **Fixed assets:** purchases and sales, day-prorated SLM / WDV depreciation schedules, depreciation journals and disposal working notes.
- **Reports:** trial balance, profit and loss account, balance sheet, ledgers, GST sales / purchase / expense / income journals, fixed asset register, and a dashboard of recent vouchers.
- **Import and export:** bulk import of masters from an Excel or CSV template, exports to PDF and Excel, and a full ZIP of CSVs ready for Power BI (relationships and Power Query notes included).

## 📲 Install

Open the **[Releases](https://github.com/SRathinaGiri/FAME/releases)** page on the device you want to use.

| Device | File | How to install |
|---|---|---|
| **Windows 10/11** | `FAME-Windows-Setup-v….exe` | Run it. If SmartScreen warns about an unknown publisher, choose **More info › Run anyway** (the installer is not code-signed). |
| **Android 7+** | `FAME-v….apk` | Open it on the phone and allow **Install unknown apps** for your browser or file manager when asked. |

> The `.aab` file in the Android release is for the Google Play Store. Phone users should install the `.apk`.

**First start:** choose a passphrase (8+ characters). It encrypts your books. **There is no way to recover a forgotten passphrase**, so keep it safe.

## 🔒 Your data

- **No account, no cloud, no tracking.** Your books live in one encrypted database file on your device.
- **Automatic backups** to `Documents › FAME › Backups`: about a minute after your last change and whenever the app closes (last 14 days, plus `FAME-latest.fame`).
- A `.fame` backup opens on **either Windows or Android** with the passphrase that was in use when it was made. Use **Share latest backup…** to send one to Drive.
- Android cloud backup is switched off for the app's data, so keeping copies of the `.fame` files is up to you.

## ⚠️ Please note

- F.A.M.E is bookkeeping software for individuals and small businesses. It is provided as is, **without any warranty**.
- It **has not been certified or tested for statutory compliance**. Verify GST figures, depreciation and financial statements before filing or relying on them.
- Companies that must keep books with an audit trail (edit log) under the proviso to Rule 3(1) of the Companies (Accounts) Rules, 2014 should confirm the software meets that requirement before using it for statutory books.

## 🌐 Moving from the old browser version

The browser (PWA) version is retired, because browsers can clear their storage, and your books with it. It now only shows a notice to move to the app.

1. Open the web version, go to **Backup › Export Backup** and save the JSON file.
2. Install the Windows or Android app and create your encrypted database.
3. In the app, go to **Backup › Import Backup** and choose that file.

---

## 🛠 For developers

<details>
<summary><b>How the apps are built</b></summary>

| | Windows | Android |
|---|---|---|
| Shell | Electron (`desktop/`) | Capacitor (`android/`) |
| Database file | `%APPDATA%\F.A.M.E\data\fame.db` | app-private `databases/fame.db` |
| Encryption | SQLCipher 4 via SQLite3 Multiple Ciphers | SQLCipher for Android 4.20 |
| Remembered passphrase (optional) | Windows DPAPI (`safeStorage`) | Android Keystore (AES-GCM) |
| Automatic backups | `Documents\FAME\Backups` | `Documents/FAME/Backups` |
| Exports (PDF, Excel, ZIP, JSON) | Windows "Save As" dialog | `Documents/FAME/Exports`, with Open / Share |

The passphrase derives the database key with SQLCipher 4 defaults: PBKDF2-HMAC-SHA512, 256,000 iterations, AES-256. Restoring a backup keeps the replaced data as `FAME-before-restore-….fame`.

```bash
npm ci && npm ci --prefix desktop
npm run test:native          # encrypted engine end-to-end + settlement rules + master import + Android bridge
npm run build:desktop && npm start --prefix desktop     # run the Windows app (on Windows)
npm run build:android        # then open android/ in Android Studio, or ./gradlew assembleDebug
```

**CI:** GitHub Actions builds both apps on every push to `main` and publishes them as the latest release (older releases are removed). Running a workflow by hand on another branch publishes a pre-release for testing.

- `.github/workflows/windows-app.yml` → `FAME-Windows-Setup-v….exe`
- `.github/workflows/android-apk.yml` → signed `FAME-v….apk` and `.aab`

The Android build needs a permanent signing key in the repository secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD` and (if the alias is not `fame`) `ANDROID_KEY_ALIAS`. Every update must be signed with the same key.

```bash
keytool -genkeypair -v -keystore fame-release.keystore -alias fame -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 fame-release.keystore   # paste into ANDROID_KEYSTORE_BASE64
```

</details>

<details>
<summary><b>Web build and sample data</b></summary>

```bash
npm install
npm run dev        # http://127.0.0.1:5173/
npm run build && npm run preview
```

The web build uses SQLite WASM with OPFS, which needs cross-origin isolation headers (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`). The Vite config sends them.

**Sample data** (an electronics trading company), from a Tkinter tool or the command line:

```bash
pip install -r tools/requirements-sample-data.txt
python tools/sample_data_generator.py
python tools/sample_data_generator.py --no-gui --transactions 1000 --accounts 100 --products 40 --assets 12 --financial-year-start 01-04 --password "change-me"
```

`--password` (8+ characters) writes an encrypted backup JSON compatible with **Backup › Import Backup**. `--financial-year-start` uses `dd-mm` and defaults to `01-04`.

**GitHub Pages:** pushing to `main` still deploys the web build to <https://srathinagiri.github.io/FAME/>, but only so that existing browser users can export their data. Once they have moved, switch it off in **Settings › Pages** (Source: *None*) and delete `.github/workflows/pages.yml`.

</details>

## 📄 License

© S. Rathinagiri. All rights reserved. The Windows and Android apps are free to download and use. The source code is published for transparency and may not be copied, modified or redistributed without permission.
