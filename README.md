# Akeju Ledger

**Created by Adekunle Akeju, founder of GramByte Technologies Inc.**

A business income and expense tracker that keeps your records in your own browser. There is no account, no server and no tracking.

## What it does

- Records income and expenses by date, client or vendor, and category
- Tracks HST or GST collected and paid, and shows the amount to remit, with a one-click 13% Ontario HST
- Shows income, expenses and profit by year and month, with a chart and a table
- Totals each category for your accountant
- Exports CSV, and backs up and restores your whole ledger

## Run it

```
npm start
```

Then open http://localhost:4173. Your data is saved in that browser only, so download a backup regularly.

## Privacy and security

- A strict Content Security Policy blocks all network connections and outside scripts.
- User text is only ever written as text, so a description cannot inject code.
- CSV exports neutralize spreadsheet formula injection.
- Imported files are validated field by field, and rejected rows are reported.
- Money is stored in whole cents, so totals never drift.

## Tests

```
npm test
npx playwright test
```

## Not tax advice

This is a record-keeping tool. Tax categories and amounts should be confirmed with your accountant.

## License and credit

AGPL-3.0-or-later, with an attribution requirement. See [NOTICE.md](NOTICE.md). Copyright (c) 2026 Adekunle Akeju.
