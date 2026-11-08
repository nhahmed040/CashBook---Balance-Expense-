package com.nhahmed.cashbook;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.JsResult;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Hosts the CashBook web app (bundled from /web) inside a WebView.
 * No internet permission is requested: everything runs offline.
 */
public class MainActivity extends Activity {

    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);      // localStorage for saved entries
        s.setAllowFileAccess(false);       // bundled assets still load
        s.setAllowContentAccess(false);

        web.addJavascriptInterface(new Bridge(), "AndroidBridge");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // Stay inside the bundled app; never navigate away.
                return !request.getUrl().toString().startsWith("file:///android_asset/");
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onJsConfirm(WebView view, String url, String message, final JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setPositiveButton(android.R.string.ok, (d, w) -> result.confirm())
                        .setNegativeButton(android.R.string.cancel, (d, w) -> result.cancel())
                        .setOnCancelListener(d -> result.cancel())
                        .show();
                return true;
            }
        });

        web.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
        }
        super.onDestroy();
    }

    /** Exposed to the page as window.AndroidBridge. */
    private class Bridge {
        @android.webkit.JavascriptInterface
        public void saveCsv(String name, String content) {
            String safe = name == null ? "cashbook.csv" : name.replaceAll("[^A-Za-z0-9._-]", "_");
            if (!safe.endsWith(".csv")) {
                safe = safe + ".csv";
            }
            String message;
            try {
                byte[] data = (content == null ? "" : content).getBytes(StandardCharsets.UTF_8);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentResolver resolver = getContentResolver();
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.MediaColumns.DISPLAY_NAME, safe);
                    values.put(MediaStore.MediaColumns.MIME_TYPE, "text/csv");
                    values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                    Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (uri == null) {
                        throw new IllegalStateException("Could not create file");
                    }
                    try (OutputStream out = resolver.openOutputStream(uri)) {
                        out.write(data);
                    }
                    message = "Saved to Downloads: " + safe;
                } else {
                    File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    File file = new File(dir, safe);
                    try (FileOutputStream out = new FileOutputStream(file)) {
                        out.write(data);
                    }
                    message = "Saved to " + file.getAbsolutePath();
                }
            } catch (Exception e) {
                message = "Export failed";
            }
            final String toast = message;
            runOnUiThread(() -> Toast.makeText(MainActivity.this, toast, Toast.LENGTH_LONG).show());
        }
    }
}
