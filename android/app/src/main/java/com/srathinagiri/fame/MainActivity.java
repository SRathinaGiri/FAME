package com.srathinagiri.fame;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private FameNative fameNative;

    @Override
    protected void load() {
        super.load();
        // The web app talks to the encrypted database through window.FAMENative.
        fameNative = new FameNative(this);
        getBridge().getWebView().addJavascriptInterface(fameNative, "FAMENative");

        // Android 10 and older need storage permission to keep backups in Documents/FAME.
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.Q
                && ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, 41);
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        // Leaving the app (home button, switching apps, screen off): back up now if anything changed.
        if (fameNative != null) fameNative.backupIfDirty();
    }

    @Override
    public void onDestroy() {
        if (fameNative != null) fameNative.shutdown();
        super.onDestroy();
    }
}
