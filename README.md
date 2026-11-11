# CashBook – Balance & Expense

A simple, offline cash book for Android (and the browser). Record cash in and cash out, see your balance, and keep several books.

## Features

- **Construction projects** (Projects tab), separate from your cash books:
  - **Budget vs actual** by cost code (materials, labour, equipment, subcontract, transport, fuel, permits, overhead, other), with over-budget warnings
  - **Supplier bills** with part payments and a "who you owe" list; paying a bill can create the cash-out entry in a linked book
  - **Client payments**: contract sum, advance, payment certificates with retention, VAT and withholding, and what the client still owes
  - **Daily labour**: workers, daily rates, attendance by day, and weekly wages that post to your costs
  - **Linked cash books**: link one or more cash books to a project so real cash and project costs agree
  - **Bill of quantities (BoQ)**: add items or import them from CSV, record work done to date per item, see physical progress, and create the next payment certificate from the progress (only work not yet certified)
  - **Printable payment certificate and project statement** (A4): opens the Android print dialog, where you choose "Save as PDF" or print
  - **Photos** on cash entries, supplier bills and the project (site progress), stored on the phone
  - Project report export (CSV)
- **Multiple cashbooks** (Shop, Home, Project…), each with its own balance
- **Add, edit and delete entries** (tap an entry to edit it)
- **Search and filters** by category, remark, type and date range
- **Reports**: monthly totals, cash in/out by category, and a 6-month chart
- **Backup and restore**: save all data to a `.json` file and load it on another phone; CSV files can be imported into the current book. Photos are backed up separately (Settings → Backup photos) and restored with the same Restore button
- **Export** the current book to CSV (saved to Downloads)
- **Dark mode** (follows the system, or choose light/dark)
- **PIN lock** (4–8 digits; locks again when you leave the app)
- **Currency** (ETB, USD, EUR, GBP, KES, SAR, AED, or none) and **languages**: English, Afaan Oromoo, አማርኛ
- **Ethiopian calendar (E.C.)** as an alternative to Gregorian (Settings → Calendar): dates are shown, picked (day/month/year with 13 months incl. Pagume) and grouped into months in the Ethiopian calendar, including reports and printed certificates. Dates are still stored as Gregorian, so CSV exports and backups stay compatible
- **Online backup and shared books** (optional, Settings → Online backup & shared books): back up all data to your own free Firebase project and restore it on another phone, and share a cash book with another person. The owner chooses per invite whether the other person can **edit** or **view only**, can change a person's role later, remove them, or stop sharing. Changes sync automatically (and with "Sync now"); edits made on both phones merge entry by entry, the newest edit wins. Photos, projects and PINs are not uploaded.
- Data stays on your device unless you turn on online backup or sharing. The only permission is Internet, used only for that.

> The Afaan Oromoo and Amharic text should be checked by a native speaker (`web/i18n.js`, `web/i18n-projects.js`, `web/i18n-more.js`).
> New projects start with VAT 15% and retention 5% as placeholders. Set VAT, withholding tax, retention and advance to what your contract says.
> The PIN is a simple lock for casual privacy, not strong encryption.

## Get the Android APK

The APK is built automatically by GitHub Actions.

1. Open the **Actions** tab of this repo and choose the latest **Build APK** run
2. Download the **CashBook-apk** artifact (a zip containing `CashBook.apk`)
3. Unzip it on your phone and open `CashBook.apk`; allow "Install unknown apps" if Android asks

To publish a downloadable release, push a tag such as `v1.3`: the workflow attaches `CashBook.apk` to that release. You can also run a build manually from the Actions tab.

### Updating

Builds are signed with a fixed key (`app/cashbook.keystore`), so a new APK installs over the old one and keeps your data. This key is public in the repo on purpose: it is for sideloading your own build only, not for app stores.

> Updating from 1.1 or 1.2 to 1.3 keeps all your data. Versions before 1.1 were signed with a throwaway key. To move from one of those, **export your data first** (Settings → Export this book, per book), uninstall the old app, install 1.1, then use **Restore from file** to import the CSV.

## Build locally

Needs JDK 17, the Android SDK and Gradle 8.7:

```bash
gradle assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
```

## Project layout

| Path | Purpose |
| --- | --- |
| `web/` | The app itself (`index.html`, `style.css`, `app.js`, `logic.js`, `print.js`, `photos.js`, `i18n*.js`), also runnable in a browser |
| `app/` | Android wrapper (a WebView that loads `web/` from the APK) |
| `.github/workflows/build-apk.yml` | Builds the APK on every push |

To try the web version only, open `web/index.html` in a browser.

## Notes

This is an independent project and is not affiliated with any commercial cashbook or wallet app.

## Online backup and sharing: one-time setup (about 5 minutes)

The app has no server of its own. You create a free Firebase project that belongs to you, and every person who shares books uses the same project.

1. Go to <https://console.firebase.google.com>, sign in with Google, **Add project** (turn Google Analytics off).
2. **Build → Authentication → Get started → Email/Password → Enable → Save.**
3. **Build → Realtime Database → Create database** (pick any location, start in locked mode). Copy the database URL shown at the top, like `https://yourproject-default-rtdb.firebaseio.com`.
4. In Realtime Database open the **Rules** tab, replace everything with the contents of [`firebase-rules.json`](firebase-rules.json) (also shown in the app under *Show database rules*) and **Publish**.
5. **Project settings (gear) → General → Your apps → Web (`</>`)** and register an app; copy the `apiKey` value.
6. In CashBook go to Settings → Online backup, enter the database URL, the Web API key, your email and a password, and tap **Create account**. Other people use the same URL and key with their own email.

The app is already connected to the project in `web/cloud-config.js` (database URL and Web API key), so users only enter an email and password. To use another Firebase project, edit that file or use Settings → Online backup → Advanced.

To share a book: open it, Settings → **Share this book online**, pick *View only* or *Can edit*, **Create invite code**, and send the code. The other person signs in and pastes it under **Join a shared book**.

Notes: the free Firebase plan is plenty for cash books. Anyone with your database URL and key can try to create an account, so only give them to people you trust, and you can turn sign-ups off or delete users in the Firebase console. Online backup keeps the latest copy only.
