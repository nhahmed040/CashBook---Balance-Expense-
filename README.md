# CashBook – Balance & Expense

A simple, offline cash book that runs in the browser. Record cash in and cash out, see your running balance, and export your entries.

## Features

- Add **cash in** and **cash out** entries with amount, date, category and remark
- Live totals: cash in, cash out and net balance
- Filter the list by cash in / cash out
- Delete single entries or clear everything
- Export all entries to CSV
- Data is stored only in your browser (`localStorage`); nothing is sent anywhere

## Run it

No build step. Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page structure |
| `style.css` | Styling (mobile-first) |
| `app.js` | Entry logic, totals, storage, CSV export |

## Notes

This is an independent project and is not affiliated with any commercial cashbook or wallet app.
