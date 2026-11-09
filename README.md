# CashBook – Balance & Expense

A simple, offline cash book for Android (and the browser). Record cash in and cash out, see your balance, and keep several books.

## Features

- **Construction projects** (Projects tab), separate from your cash books:
  - **Budget vs actual** by cost code (materials, labour, equipment, subcontract, transport, fuel, permits, overhead, other), with over-budget warnings
  - **Supplier bills** with part payments and a "who you owe" list; paying a bill can create the cash-out entry in a linked book
  - **Client payments**: contract sum, advance, payment certificates with retention, VAT and withholding, and what the client still owes
  - **Daily labour**: workers, daily rates, attendance by day, and weekly wages that post to your costs
  - **Linked cash books**: link one or more cash books to a project so real cash and project costs agree
  - Project report export (CSV)
- **Multiple cashbooks** (Shop, Home, Project…), each with its own balance
- **Add, edit and delete entries** (tap an entry to edit it)
- **Search and filters** by category, remark, type and date range
- **Reports**: monthly totals, cash in/out by category, and a 6-month chart
- **Backup and restore**: save all data to a `.json` file and load it on another phone; CSV files can be imported into the current book
- **Export** the current book to CSV (saved to Downloads)
- **Dark mode** (follows the system, or choose light/dark)
- **PIN lock** (4–8 digits; locks again when you leave the app)
- **Currency** (ETB, USD, EUR, GBP, KES, SAR, AED, or none) and **languages**: English, Afaan Oromoo, አማርኛ
- Data stays on your device. The app requests no permissions and has no internet access.

> The Afaan Oromoo and Amharic text should be checked by a native speaker (`web/i18n.js`, `web/i18n-projects.js`).
> New projects start with VAT 15% and retention 5% as placeholders. Set VAT, withholding tax, retention and advance to what your contract says.
> The PIN is a simple lock for casual privacy, not strong encryption.

## Get the Android APK

The APK is built automatically by GitHub Actions.

1. Open the **Actions** tab of this repo and choose the latest **Build APK** run
2. Download the **CashBook-apk** artifact (a zip containing `CashBook.apk`)
3. Unzip it on your phone and open `CashBook.apk`; allow "Install unknown apps" if Android asks

To publish a downloadable release, push a tag such as `v1.2`: the workflow attaches `CashBook.apk` to that release. You can also run a build manually from the Actions tab.

### Updating

Builds are signed with a fixed key (`app/cashbook.keystore`), so a new APK installs over the old one and keeps your data. This key is public in the repo on purpose: it is for sideloading your own build only, not for app stores.

> Updating from 1.1 to 1.2 keeps all your data. Versions before 1.1 were signed with a throwaway key. To move from one of those, **export your data first** (Settings → Export this book, per book), uninstall the old app, install 1.1, then use **Restore from file** to import the CSV.

## Build locally

Needs JDK 17, the Android SDK and Gradle 8.7:

```bash
gradle assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
```

## Project layout

| Path | Purpose |
| --- | --- |
| `web/` | The app itself (`index.html`, `style.css`, `app.js`, `logic.js`, `i18n.js`, `i18n-projects.js`), also runnable in a browser |
| `app/` | Android wrapper (a WebView that loads `web/` from the APK) |
| `.github/workflows/build-apk.yml` | Builds the APK on every push |

To try the web version only, open `web/index.html` in a browser.

## Notes

This is an independent project and is not affiliated with any commercial cashbook or wallet app.
