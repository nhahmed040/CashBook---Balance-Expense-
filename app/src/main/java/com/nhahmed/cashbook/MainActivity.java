package com.nhahmed.cashbook;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.webkit.JsResult;
import android.webkit.ValueCallback;
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
import java.nio.file.Files;

/**
 * Hosts the CashBook web app (bundled from /web) inside a WebView.
 * No internet permission is requested: everything runs offline.
 */
public class MainActivity extends Activity {

    private static final int REQ_PICK_FILE = 1001;
    private static final int MAX_PHOTO_CHARS = 4000000;

    private WebView web;
    private WebView printView; // kept so the print job's WebView is not garbage-collected
    private ValueCallback<Uri[]> filePathCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);      // localStorage for saved entries
        s.setAllowFileAccess(false);       // bundled assets still load
        s.setAllowContentAccess(true);     // needed to read the file picked for restore

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

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;
                try {
                    // Photos ask for "image/*"; the restore/import pickers use file extensions, so any file.
                    String type = "*/*";
                    String[] accept = params == null ? null : params.getAcceptTypes();
                    if (accept != null && accept.length > 0 && accept[0] != null && accept[0].startsWith("image/")) {
                        type = accept[0];
                    }
                    Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType(type);
                    startActivityForResult(Intent.createChooser(intent, null), REQ_PICK_FILE);
                } catch (Exception e) {
                    filePathCallback = null;
                    callback.onReceiveValue(null);
                    return false;
                }
                return true;
            }
        });

        web.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_PICK_FILE) {
            if (filePathCallback != null) {
                Uri[] result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
                filePathCallback.onReceiveValue(result);
                filePathCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
        }
        if (printView != null) {
            printView.destroy();
        }
        super.onDestroy();
    }

    private File photoFile(String id) {
        // Ids are plain numbers; anything else is refused so a page can never reach other files.
        if (id == null || !id.matches("[0-9]{1,20}")) {
            return null;
        }
        File dir = new File(getFilesDir(), "photos");
        if (!dir.exists() && !dir.mkdirs()) {
            return null;
        }
        return new File(dir, id + ".txt");
    }

    /** Exposed to the page as window.AndroidBridge. */
    private class Bridge {
        /**
         * Saves a text file to the phone.
         * Returns a short description of where it went, or "" if saving failed.
         */
        @android.webkit.JavascriptInterface
        public String saveFile(String name, String mime, String content) {
            String safe = name == null ? "cashbook.txt" : name.replaceAll("[^A-Za-z0-9._-]", "_");
            if (safe.isEmpty()) {
                safe = "cashbook.txt";
            }
            String type = "application/json".equals(mime) || "text/csv".equals(mime) ? mime : "text/plain";
            try {
                byte[] data = (content == null ? "" : content).getBytes(StandardCharsets.UTF_8);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentResolver resolver = getContentResolver();
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.MediaColumns.DISPLAY_NAME, safe);
                    values.put(MediaStore.MediaColumns.MIME_TYPE, type);
                    values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                    Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (uri == null) {
                        return "";
                    }
                    try (OutputStream out = resolver.openOutputStream(uri)) {
                        if (out == null) {
                            return "";
                        }
                        out.write(data);
                    }
                    return "Downloads/" + safe;
                } else {
                    File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    if (dir == null) {
                        return "";
                    }
                    File file = new File(dir, safe);
                    try (FileOutputStream out = new FileOutputStream(file)) {
                        out.write(data);
                    }
                    return file.getAbsolutePath();
                }
            } catch (Exception e) {
                return "";
            }
        }

        /** Opens Android's print dialog for an HTML document (choose "Save as PDF" there). */
        @android.webkit.JavascriptInterface
        public void printHtml(final String title, final String html) {
            runOnUiThread(() -> {
                try {
                    final String name = title == null || title.isEmpty() ? "CashBook" : title;
                    if (printView != null) {
                        printView.destroy();
                    }
                    final WebView wv = new WebView(MainActivity.this);
                    wv.getSettings().setJavaScriptEnabled(false);
                    final boolean[] started = {false};
                    wv.setWebViewClient(new WebViewClient() {
                        @Override
                        public void onPageFinished(WebView view, String url) {
                            if (started[0]) {
                                return;
                            }
                            started[0] = true;
                            PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                            pm.print(name, view.createPrintDocumentAdapter(name), new PrintAttributes.Builder().build());
                        }
                    });
                    printView = wv;
                    wv.loadDataWithBaseURL(null, html == null ? "" : html, "text/html", "UTF-8", null);
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "Could not open the print dialog", Toast.LENGTH_LONG).show();
                }
            });
        }

        /** Stores a photo (a JPEG data URL) in the app's private files. Returns true on success. */
        @android.webkit.JavascriptInterface
        public boolean photoPut(String id, String dataUrl) {
            File f = photoFile(id);
            if (f == null || dataUrl == null || dataUrl.length() > MAX_PHOTO_CHARS || !dataUrl.startsWith("data:image/")) {
                return false;
            }
            try (FileOutputStream out = new FileOutputStream(f)) {
                out.write(dataUrl.getBytes(StandardCharsets.UTF_8));
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        /** Returns the stored photo data URL, or "" if there is none. */
        @android.webkit.JavascriptInterface
        public String photoGet(String id) {
            File f = photoFile(id);
            if (f == null || !f.isFile()) {
                return "";
            }
            try {
                return new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8);
            } catch (Exception e) {
                return "";
            }
        }

        @android.webkit.JavascriptInterface
        public void photoDelete(String id) {
            File f = photoFile(id);
            if (f != null && f.isFile()) {
                //noinspection ResultOfMethodCallIgnored
                f.delete();
            }
        }
    }
}
