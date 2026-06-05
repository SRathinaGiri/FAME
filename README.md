# F.A.M.E

Financial Accounting under Mobile Environment.

F.A.M.E is a local-first accounting PWA built as a self-contained browser app. The first module includes:

- PWA shell and offline cache
- SQLite WASM database running in a module worker
- OPFS-first persistence with transient fallback when OPFS is unavailable
- Hierarchical chart of accounts
- Receipt, payment, purchase invoice, sales invoice, and journal voucher entry
- Trial balance and recent voucher dashboard
- Password-encrypted JSON backup export/import

## Development

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173/`.

SQLite OPFS requires cross-origin isolation headers. The Vite config sends:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

## Build

```bash
npm run build
npm run preview
```

The app is static after build and can be hosted by any server that sends the required isolation headers for OPFS.
