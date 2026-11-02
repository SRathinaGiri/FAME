package com.srathinagiri.fame;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.util.Log;
import android.webkit.JavascriptInterface;

import androidx.core.content.FileProvider;

import net.zetetic.database.sqlcipher.SQLiteDatabase;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * F.A.M.E for Android — native database bridge.
 *
 * The accounting database is an encrypted SQLCipher 4 file in the app's private storage
 * (/data/data/com.srathinagiri.fame/databases/fame.db). The web app's engine runs in the
 * WebView and sends SQL here through this synchronous JavaScript interface; nothing is kept
 * in WebView / browser storage.
 *
 * Every call returns JSON: {"ok":true,"result":...} or {"ok":false,"error":"..."}.
 * All database work runs on one dedicated thread so SQLCipher's transaction state (which is
 * per-thread) is always on the same connection.
 *
 * Backups: byte copies of the encrypted file in Documents/FAME/Backups (one per day, 14 kept,
 * plus FAME-latest.fame). They survive uninstall and open on the Windows app as well.
 */
public class FameNative {
    private static final String TAG = "FAME";
    private static final String DB_NAME = "fame.db";
    private static final int BACKUP_KEEP = 14;
    private static final long AUTO_BACKUP_DELAY_MS = 60_000L;
    private static final String PREFS = "fame_vault";
    private static final String KEY_ALIAS = "fame_vault_key";

    private final Activity activity;
    private final Context context;
    private final ExecutorService dbThread = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Runnable autoBackup = () -> runAsync(() -> { backupInternal(false); return null; });

    private SQLiteDatabase db;
    private boolean dirty = false;
    private File restoreTmp;
    private OutputStream restoreOut;
    private File exportTmp;
    private OutputStream exportOut;
    private String exportName;

    static {
        System.loadLibrary("sqlcipher");
    }

    public FameNative(Activity activity) {
        this.activity = activity;
        this.context = activity.getApplicationContext();
    }

    /* ------------------------------------------------------------------ plumbing */

    private interface Op {
        Object run() throws Exception;
    }

    private String call(Op op) {
        try {
            Object result = dbThread.submit((Callable<Object>) op::run).get();
            JSONObject out = new JSONObject();
            out.put("ok", true);
            out.put("result", result == null ? JSONObject.NULL : result);
            return out.toString();
        } catch (ExecutionException e) {
            return error(e.getCause() != null ? e.getCause() : e);
        } catch (Throwable e) {
            return error(e);
        }
    }

    private void runAsync(Op op) {
        dbThread.submit(() -> {
            try {
                op.run();
            } catch (Throwable e) {
                Log.w(TAG, "background task failed", e);
            }
        });
    }

    private static String error(Throwable e) {
        String message = e.getMessage() != null ? e.getMessage() : e.toString();
        Log.w(TAG, message, e);
        String lower = message.toLowerCase(Locale.ROOT);
        if (lower.contains("file is not a database") || lower.contains("notadb")) {
            message = "Wrong passphrase, or this is not a F.A.M.E database.";
        }
        try {
            JSONObject out = new JSONObject();
            out.put("ok", false);
            out.put("error", message);
            return out.toString();
        } catch (Exception ignored) {
            return "{\"ok\":false,\"error\":\"Unknown error\"}";
        }
    }

    private File dbFile() {
        return context.getDatabasePath(DB_NAME);
    }

    private File backupDir() {
        File docs = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS);
        return new File(docs, "FAME/Backups");
    }

    private File exportDir() {
        File docs = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS);
        return new File(docs, "FAME/Exports");
    }

    private static void checkPassphrase(String passphrase) {
        if (passphrase == null || passphrase.length() < 8) {
            throw new IllegalArgumentException("The passphrase must have at least 8 characters.");
        }
    }

    /** Opens (or creates) the encrypted file and proves the key by reading the schema. */
    private static SQLiteDatabase openEncrypted(File file, String passphrase, boolean create) {
        SQLiteDatabase conn = create
                ? SQLiteDatabase.openOrCreateDatabase(file, passphrase, null, null)
                : SQLiteDatabase.openDatabase(file.getAbsolutePath(), passphrase, null, SQLiteDatabase.OPEN_READWRITE, null, null);
        try {
            Cursor c = conn.rawQuery("SELECT count(*) FROM sqlite_master");
            c.moveToFirst();
            c.close();
            return conn;
        } catch (RuntimeException e) {
            conn.close();
            throw e;
        }
    }

    private void attach(SQLiteDatabase conn) {
        db = conn;
        db.setForeignKeyConstraintsEnabled(true);
    }

    private JSONObject openInfo() throws Exception {
        JSONObject info = new JSONObject();
        info.put("persistence", "Encrypted SQLite file (SQLCipher 4) in app-private storage");
        Cursor c = db.rawQuery("SELECT sqlite_version()");
        c.moveToFirst();
        info.put("sqliteVersion", c.getString(0));
        c.close();
        return info;
    }

    private void requireOpen() {
        if (db == null) throw new IllegalStateException("The database is locked.");
    }

    private void markDirty() {
        dirty = true;
        main.removeCallbacks(autoBackup);
        main.postDelayed(autoBackup, AUTO_BACKUP_DELAY_MS);
    }

    /* ------------------------------------------------------------------ status / vault */

    @JavascriptInterface
    public String status() {
        return call(() -> {
            JSONObject s = new JSONObject();
            File f = dbFile();
            s.put("platform", "android");
            s.put("exists", f.exists());
            s.put("unlocked", db != null);
            s.put("dbPath", f.getAbsolutePath());
            s.put("backupDir", "Documents/FAME/Backups");
            s.put("bytes", f.exists() ? f.length() : 0);
            s.put("dirty", dirty);
            s.put("remembered", prefs().contains("sealed"));
            String last = prefs().getString("lastBackup", null);
            s.put("lastBackup", last == null ? JSONObject.NULL : new JSONObject(last));
            return s;
        });
    }

    @JavascriptInterface
    public String create(String passphrase, boolean remember) {
        return call(() -> {
            checkPassphrase(passphrase);
            File f = dbFile();
            if (f.exists()) throw new IllegalStateException("A F.A.M.E database already exists on this phone.");
            File parent = f.getParentFile();
            if (parent != null) parent.mkdirs();
            attach(openEncrypted(f, passphrase, true));
            if (remember) remember(passphrase); else forgetInternal();
            markDirty();
            return openInfo();
        });
    }

    @JavascriptInterface
    public String unlock(String passphrase, boolean remember) {
        return call(() -> {
            if (db == null) {
                File f = dbFile();
                if (!f.exists()) throw new IllegalStateException("No database yet. Create one first.");
                attach(openEncrypted(f, passphrase, false));
            }
            if (remember) remember(passphrase);
            return openInfo();
        });
    }

    @JavascriptInterface
    public String unlockRemembered() {
        return call(() -> {
            JSONObject out = new JSONObject();
            String passphrase = recall();
            if (passphrase == null || !dbFile().exists()) {
                out.put("ok", false);
                return out;
            }
            try {
                if (db == null) attach(openEncrypted(dbFile(), passphrase, false));
                out.put("ok", true);
                out.put("info", openInfo());
            } catch (RuntimeException e) {
                out.put("ok", false); // stale: the passphrase was changed or the file restored
            }
            return out;
        });
    }

    @JavascriptInterface
    public String forget() {
        return call(() -> {
            forgetInternal();
            return null;
        });
    }

    @JavascriptInterface
    public String lock() {
        return call(() -> {
            if (db != null && dirty) backupInternal(false);
            closeDb();
            return null;
        });
    }

    private void closeDb() {
        if (db != null) db.close();
        db = null;
    }

    private SharedPreferences prefs() {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Seals the passphrase with a non-exportable AES key held by Android Keystore. */
    private void remember(String passphrase) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, vaultKey());
        byte[] sealed = cipher.doFinal(passphrase.getBytes(StandardCharsets.UTF_8));
        JSONObject box = new JSONObject();
        box.put("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP));
        box.put("ct", Base64.encodeToString(sealed, Base64.NO_WRAP));
        prefs().edit().putString("sealed", box.toString()).apply();
    }

    private String recall() {
        String raw = prefs().getString("sealed", null);
        if (raw == null) return null;
        try {
            JSONObject box = new JSONObject(raw);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, vaultKey(),
                    new GCMParameterSpec(128, Base64.decode(box.getString("iv"), Base64.NO_WRAP)));
            byte[] plain = cipher.doFinal(Base64.decode(box.getString("ct"), Base64.NO_WRAP));
            return new String(plain, StandardCharsets.UTF_8);
        } catch (Exception e) {
            Log.w(TAG, "saved passphrase unreadable", e);
            return null;
        }
    }

    private void forgetInternal() {
        prefs().edit().remove("sealed").apply();
    }

    private SecretKey vaultKey() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(KEY_ALIAS)) {
            return ((KeyStore.SecretKeyEntry) ks.getEntry(KEY_ALIAS, null)).getSecretKey();
        }
        KeyGenerator gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        gen.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
        return gen.generateKey();
    }

    /* ------------------------------------------------------------------ SQL */

    /**
     * One SQL statement. bindJson is a JSON array of values. With wantRows the result is
     * {"rows":[{column:value,...},...]}; otherwise the statement is executed for its effect.
     */
    @JavascriptInterface
    public String exec(String sql, String bindJson, boolean wantRows) {
        return call(() -> {
            requireOpen();
            Object[] args = toArgs(bindJson);
            if (wantRows) {
                return rows(sql, args);
            }
            if (args.length == 0) db.execSQL(sql); else db.execSQL(sql, args);
            if (!isReadOnlyStatement(sql)) markDirty();
            return null;
        });
    }

    private static boolean isReadOnlyStatement(String sql) {
        String head = sql.trim().toUpperCase(Locale.ROOT);
        return head.startsWith("SELECT") || head.startsWith("BEGIN") || head.startsWith("PRAGMA");
    }

    private static Object[] toArgs(String bindJson) throws Exception {
        if (bindJson == null || bindJson.isEmpty()) return new Object[0];
        JSONArray arr = new JSONArray(bindJson);
        Object[] args = new Object[arr.length()];
        for (int i = 0; i < arr.length(); i++) {
            Object v = arr.get(i);
            if (v == JSONObject.NULL) args[i] = null;
            else if (v instanceof Boolean) args[i] = ((Boolean) v) ? 1L : 0L;
            else if (v instanceof Integer) args[i] = ((Integer) v).longValue();
            else if (v instanceof Long) args[i] = v;
            else if (v instanceof Number) {
                double d = ((Number) v).doubleValue();
                args[i] = (d == Math.rint(d) && Math.abs(d) < 9.007199254740992E15) ? (Object) (long) d : (Object) d;
            } else args[i] = String.valueOf(v);
        }
        return args;
    }

    private JSONObject rows(String sql, Object[] args) throws Exception {
        // Built by hand: much faster than JSONObject for large reports.
        StringBuilder sb = new StringBuilder(4096);
        sb.append("{\"rows\":[");
        Cursor c = db.rawQuery(sql, args);
        try {
            String[] names = c.getColumnNames();
            String[] quoted = new String[names.length];
            for (int i = 0; i < names.length; i++) quoted[i] = JSONObject.quote(names[i]);
            boolean firstRow = true;
            while (c.moveToNext()) {
                if (!firstRow) sb.append(',');
                firstRow = false;
                sb.append('{');
                for (int i = 0; i < names.length; i++) {
                    if (i > 0) sb.append(',');
                    sb.append(quoted[i]).append(':');
                    switch (c.getType(i)) {
                        case Cursor.FIELD_TYPE_NULL:
                            sb.append("null");
                            break;
                        case Cursor.FIELD_TYPE_INTEGER:
                            sb.append(c.getLong(i));
                            break;
                        case Cursor.FIELD_TYPE_FLOAT: {
                            double d = c.getDouble(i);
                            if (Double.isNaN(d) || Double.isInfinite(d)) sb.append("null");
                            else sb.append(d);
                            break;
                        }
                        case Cursor.FIELD_TYPE_BLOB:
                            sb.append(JSONObject.quote(Base64.encodeToString(c.getBlob(i), Base64.NO_WRAP)));
                            break;
                        default:
                            sb.append(JSONObject.quote(c.getString(i)));
                    }
                }
                sb.append('}');
            }
        } finally {
            c.close();
        }
        sb.append("]}");
        return new JSONObject(sb.toString());
    }

    /* ------------------------------------------------------------------ backups */

    private static String today() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(new Date());
    }

    private static void copy(File from, File to) throws Exception {
        File parent = to.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) {
            throw new IllegalStateException("Cannot create folder " + parent);
        }
        File tmp = new File(to.getAbsolutePath() + ".tmp");
        try (InputStream in = new FileInputStream(from); OutputStream out = new FileOutputStream(tmp)) {
            byte[] buf = new byte[1 << 16];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        }
        if (to.exists() && !to.delete()) throw new IllegalStateException("Cannot replace " + to);
        if (!tmp.renameTo(to)) throw new IllegalStateException("Cannot write " + to);
    }

    /**
     * Byte copy of the database file. It uses a rollback journal and this thread is its only
     * writer, so between calls the file is complete and consistent. Falls back to the app's
     * own external folder if Documents is not writable (e.g. permission refused on Android 9).
     */
    private JSONObject backupInternal(boolean force) throws Exception {
        requireOpen();
        main.removeCallbacks(autoBackup);
        String last = prefs().getString("lastBackup", null);
        if (!force && !dirty && last != null) {
            JSONObject skipped = new JSONObject(last);
            skipped.put("skipped", true);
            return skipped;
        }
        File dir = backupDir();
        File dated = new File(dir, "FAME-" + today() + ".fame");
        try {
            copy(dbFile(), dated);
        } catch (Exception e) {
            Log.w(TAG, "Documents not writable, using app folder", e);
            dir = new File(context.getExternalFilesDir(null), "Backups");
            dated = new File(dir, "FAME-" + today() + ".fame");
            copy(dbFile(), dated);
        }
        copy(dbFile(), new File(dir, "FAME-latest.fame"));
        prune(dir);
        dirty = false;
        JSONObject info = new JSONObject();
        info.put("at", System.currentTimeMillis());
        info.put("file", dated.getAbsolutePath());
        info.put("bytes", dated.length());
        prefs().edit().putString("lastBackup", info.toString()).apply();
        return info;
    }

    private static void prune(File dir) {
        File[] files = dir.listFiles((d, name) -> name.matches("FAME-\\d{4}-\\d{2}-\\d{2}\\.fame"));
        if (files == null || files.length <= BACKUP_KEEP) return;
        Arrays.sort(files, (a, b) -> a.getName().compareTo(b.getName()));
        for (int i = 0; i < files.length - BACKUP_KEEP; i++) {
            //noinspection ResultOfMethodCallIgnored
            files[i].delete();
        }
    }

    @JavascriptInterface
    public String backupNow() {
        return call(() -> backupInternal(true));
    }

    /** Called from MainActivity.onPause: back up straight away if anything changed. */
    void backupIfDirty() {
        runAsync(() -> {
            if (db != null && dirty) backupInternal(false);
            return null;
        });
    }

    @JavascriptInterface
    public String listBackups() {
        return call(() -> {
            JSONArray list = new JSONArray();
            File[] files = backupDir().listFiles((d, name) -> name.endsWith(".fame"));
            if (files != null) {
                Arrays.sort(files, (a, b) -> Long.compare(b.lastModified(), a.lastModified()));
                for (File f : files) {
                    JSONObject o = new JSONObject();
                    o.put("name", f.getName());
                    o.put("bytes", f.length());
                    o.put("modifiedAt", f.lastModified());
                    list.put(o);
                }
            }
            return list;
        });
    }

    @JavascriptInterface
    public String changePassphrase(String oldPassphrase, String newPassphrase) {
        return call(() -> {
            requireOpen();
            checkPassphrase(newPassphrase);
            openEncrypted(dbFile(), oldPassphrase, false).close();
            db.changePassword(newPassphrase);
            if (prefs().contains("sealed")) remember(newPassphrase);
            dirty = true;
            // Older backups keep the passphrase they were made with.
            backupInternal(true);
            return null;
        });
    }

    /* ------------------------------------------------------------------ restore (chunked) */

    @JavascriptInterface
    public String restoreBegin() {
        return call(() -> {
            abortRestore();
            restoreTmp = new File(context.getCacheDir(), "restore.tmp");
            restoreOut = new FileOutputStream(restoreTmp);
            return null;
        });
    }

    @JavascriptInterface
    public String restoreChunk(String base64) {
        return call(() -> {
            if (restoreOut == null) throw new IllegalStateException("Restore was not started.");
            restoreOut.write(Base64.decode(base64, Base64.NO_WRAP));
            return null;
        });
    }

    @JavascriptInterface
    public String restoreAbort() {
        return call(() -> {
            abortRestore();
            return null;
        });
    }

    private void abortRestore() {
        try {
            if (restoreOut != null) restoreOut.close();
        } catch (Exception ignored) {
        }
        restoreOut = null;
        if (restoreTmp != null) //noinspection ResultOfMethodCallIgnored
            restoreTmp.delete();
        restoreTmp = null;
    }

    @JavascriptInterface
    public String restoreCommit(String passphrase, boolean remember) {
        return call(() -> {
            if (restoreOut == null) throw new IllegalStateException("Restore was not started.");
            restoreOut.close();
            restoreOut = null;
            try {
                SQLiteDatabase probe = openEncrypted(restoreTmp, passphrase, false);
                Cursor c = probe.rawQuery("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'voucher_lines'");
                boolean looksRight = c.moveToFirst();
                c.close();
                probe.close();
                if (!looksRight) throw new IllegalStateException("This backup does not contain F.A.M.E accounting data.");
            } catch (RuntimeException e) {
                abortRestore();
                throw e;
            }
            File live = dbFile();
            if (live.exists()) {
                try {
                    copy(live, new File(backupDir(), "FAME-before-restore-" + System.currentTimeMillis() + ".fame"));
                } catch (Exception e) {
                    copy(live, new File(new File(context.getExternalFilesDir(null), "Backups"),
                            "FAME-before-restore-" + System.currentTimeMillis() + ".fame"));
                }
            }
            closeDb();
            for (String suffix : new String[]{"-journal", "-wal", "-shm"}) {
                //noinspection ResultOfMethodCallIgnored
                new File(live.getAbsolutePath() + suffix).delete();
            }
            File parent = live.getParentFile();
            if (parent != null) parent.mkdirs();
            copy(restoreTmp, live);
            abortRestore();
            attach(openEncrypted(live, passphrase, false));
            if (remember || prefs().contains("sealed")) remember(passphrase);
            dirty = true;
            backupInternal(true);
            return openInfo();
        });
    }

    /* ------------------------------------------------------------------ exports (downloads) */

    @JavascriptInterface
    public String exportBegin(String filename) {
        return call(() -> {
            String safe = filename == null ? "download" : filename.replaceAll("[\\\\/:*?\"<>|]+", "_");
            if (safe.length() > 120) safe = safe.substring(safe.length() - 120);
            exportName = safe;
            exportTmp = new File(context.getCacheDir(), "export.tmp");
            exportOut = new FileOutputStream(exportTmp);
            return null;
        });
    }

    @JavascriptInterface
    public String exportChunk(String base64) {
        return call(() -> {
            if (exportOut == null) throw new IllegalStateException("Export was not started.");
            exportOut.write(Base64.decode(base64, Base64.NO_WRAP));
            return null;
        });
    }

    @JavascriptInterface
    public String exportEnd() {
        return call(() -> {
            if (exportOut == null) throw new IllegalStateException("Export was not started.");
            exportOut.close();
            exportOut = null;
            File target = new File(exportDir(), exportName);
            String where = "Documents/FAME/Exports/" + exportName;
            try {
                copy(exportTmp, target);
            } catch (Exception e) {
                target = new File(new File(context.getExternalFilesDir(null), "Exports"), exportName);
                copy(exportTmp, target);
                where = target.getAbsolutePath();
            }
            //noinspection ResultOfMethodCallIgnored
            exportTmp.delete();
            JSONObject out = new JSONObject();
            out.put("name", exportName);
            out.put("path", target.getAbsolutePath());
            out.put("where", where);
            return out;
        });
    }

    /** Opens the Android share sheet for a file this app wrote (an export or a backup). */
    @JavascriptInterface
    public String share(String absolutePath, String mimeType) {
        return call(() -> {
            File f = new File(absolutePath);
            boolean allowed = isInside(f, exportDir()) || isInside(f, backupDir())
                    || isInside(f, context.getExternalFilesDir(null));
            if (!allowed || !f.exists()) throw new IllegalArgumentException("Cannot share this file.");
            Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", f);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mimeType == null || mimeType.isEmpty() ? "application/octet-stream" : mimeType);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, f.getName());
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            activity.runOnUiThread(() -> activity.startActivity(chooser));
            return null;
        });
    }

    /** Opens a saved export (e.g. an invoice PDF) in the phone's viewer, from where it can be printed. */
    @JavascriptInterface
    public String open(String absolutePath, String mimeType) {
        return call(() -> {
            File f = new File(absolutePath);
            boolean allowed = isInside(f, exportDir()) || isInside(f, context.getExternalFilesDir(null));
            if (!allowed || !f.exists()) throw new IllegalArgumentException("Cannot open this file.");
            Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", f);
            Intent view = new Intent(Intent.ACTION_VIEW);
            view.setDataAndType(uri, mimeType == null || mimeType.isEmpty() ? "application/octet-stream" : mimeType);
            view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(view, f.getName());
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            activity.runOnUiThread(() -> activity.startActivity(chooser));
            return null;
        });
    }

    @JavascriptInterface
    public String latestBackupPath() {
        return call(() -> {
            String last = prefs().getString("lastBackup", null);
            if (last == null) return JSONObject.NULL;
            File dated = new File(new JSONObject(last).getString("file"));
            File latest = new File(dated.getParentFile(), "FAME-latest.fame");
            return latest.exists() ? latest.getAbsolutePath() : (dated.exists() ? dated.getAbsolutePath() : JSONObject.NULL);
        });
    }

    private static boolean isInside(File file, File dir) {
        if (dir == null) return false;
        try {
            String f = file.getCanonicalPath();
            String d = dir.getCanonicalPath();
            return f.startsWith(d + File.separator);
        } catch (Exception e) {
            return false;
        }
    }

    void shutdown() {
        main.removeCallbacks(autoBackup);
        dbThread.submit(() -> {
            try {
                if (db != null && dirty) backupInternal(false);
            } catch (Exception e) {
                Log.w(TAG, "backup on exit failed", e);
            }
            closeDb();
        });
        dbThread.shutdown();
    }
}
