# CashBook – Balance & Expense

A simple, offline cash book for Android (and the browser). Record cash in and cash out, see your running balance, and export your entries to CSV.

## Features

- Add **cash in** and **cash out** entries with amount, date, category and remark
- Live totals: cash in, cash out and net balance
- Filter the list by cash in / cash out
- Delete single entries or clear everything
- Export all entries to CSV (saved to your phone's Downloads folder in the Android app)
- Data stays on your device (`localStorage`); the app requests no permissions and has no internet access

## Get the Android APK

The APK is built automatically by GitHub Actions.

1. Open the **Actions** tab of this repo and choose the latest **Build APK** run
2. Download the **CashBook-apk** artifact (a zip containing `CashBook.apk`)
3. Unzip it on your phone and open `CashBook.apk`; allow "Install unknown apps" if Android asks

To publish a downloadable release, push a tag such as `v1.0`: the workflow attaches `CashBook.apk` to that release.

You can also trigger a build manually from the Actions tab (**Run workflow**).

> The workflow builds a *debug-signed* APK, which is fine for installing on your own phone. For Google Play you would need a release keystore.

## Build locally

Needs JDK 17, the Android SDK and Gradle 8.7:

```bash
gradle assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
```

## Project layout

| Path | Purpose |
| --- | --- |
| `web/` | The app itself (`index.html`, `style.css`, `app.js`), also runnable in a browser |
| `app/` | Android wrapper (a WebView that loads `web/` from the APK) |
| `.github/workflows/build-apk.yml` | Builds the APK on every push |

To try the web version only, open `web/index.html` in a browser.

## Notes

This is an independent project and is not affiliated with any commercial cashbook or wallet app.
