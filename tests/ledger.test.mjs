// Copyright (c) 2026 Adekunle Akeju. All rights reserved except as licensed.
// Akeju Ledger, created by Adekunle Akeju. SPDX-License-Identifier: AGPL-3.0-or-later
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  byCategory, byMonth, entryKey, filterEntries, formatMoney, fromBackup, fromCsv, hstOn, parseCsvRows, parseMoney, plainMoney, summarize, toCsv, validate,
} from "../src/ledger.js";

const entry = (over = {}) => ({
  id: "1", createdAt: 1, date: "2026-03-15", type: "expense", description: "Laptop", party: "Store", category: "Office supplies",
  amountCents: 10000, taxCents: 1300, note: "", ...over,
});

test("parseMoney handles valid and hostile input", () => {
  assert.equal(parseMoney("1,234.50"), 123450);
  assert.equal(parseMoney("$10"), 1000);
  assert.equal(parseMoney("0.1"), 10);
  assert.equal(parseMoney("19.99"), 1999);
  for (const bad of ["", "abc", "-5", "1.234", "1e5", null, "99999999999999999999"]) assert.equal(parseMoney(bad), null, String(bad));
});

test("formatMoney and plainMoney", () => {
  assert.equal(formatMoney(123456789), "$1,234,567.89");
  assert.equal(formatMoney(-5), "-$0.05");
  assert.equal(plainMoney(1205), "12.05");
});

test("adding many small amounts does not drift", () => {
  const items = Array.from({ length: 1000 }, () => entry({ type: "income", amountCents: parseMoney("0.10"), taxCents: 0 }));
  assert.equal(summarize(items).income, 10000);
});

test("HST rounds to the cent", () => {
  assert.equal(hstOn(10000), 1300);
  assert.equal(hstOn(1999), 260);
});

test("validate catches each bad field", () => {
  assert.deepEqual(validate(entry()), []);
  assert.ok(validate(entry({ date: "2026-02-30" })).length);
  assert.ok(validate(entry({ type: "gift" })).length);
  assert.ok(validate(entry({ description: "  " })).length);
  assert.ok(validate(entry({ category: "Services" })).length, "income category on an expense");
  assert.ok(validate(entry({ amountCents: 0 })).length);
  assert.ok(validate(entry({ amountCents: NaN })).length);
  assert.ok(validate(entry({ taxCents: -1 })).length);
});

test("summarize computes profit and tax position", () => {
  const t = summarize([entry({ type: "income", category: "Services", amountCents: 50000, taxCents: 6500 }), entry()]);
  assert.deepEqual(t, { income: 50000, expenses: 10000, profit: 40000, taxCollected: 6500, taxPaid: 1300, taxOwing: 5200 });
});

test("a period with more HST paid than collected shows a negative owing", () => {
  assert.equal(summarize([entry()]).taxOwing, -1300);
});

test("filter by year, month, type and search", () => {
  const items = [entry(), entry({ id: "2", date: "2025-03-15", description: "Old" }), entry({ id: "3", date: "2026-04-01", type: "income", category: "Services", description: "Invoice 7", party: "Acme" })];
  assert.equal(filterEntries(items, { year: "2026" }).length, 2);
  assert.equal(filterEntries(items, { year: "2026", month: "04" })[0].id, "3");
  assert.equal(filterEntries(items, { year: "2026", type: "expense" })[0].id, "1");
  assert.equal(filterEntries(items, { year: "2026", search: "ACME" })[0].id, "3");
});

test("byMonth and byCategory", () => {
  const items = [entry(), entry({ id: "2", amountCents: 500 }), entry({ id: "3", date: "2026-12-01", type: "income", category: "Services", amountCents: 900 })];
  const months = byMonth(items, "2026");
  assert.equal(months[2].expenses, 10500);
  assert.equal(months[11].income, 900);
  assert.deepEqual(byCategory(items, "expense"), [{ category: "Office supplies", cents: 10500 }]);
});

test("CSV round trip keeps commas, quotes and new lines", () => {
  const original = [entry({ description: 'Desk, "oak"\nlarge', party: "A, B", note: "x" })];
  const { entries, skipped } = fromCsv(toCsv(original));
  assert.deepEqual(skipped, []);
  assert.equal(entries[0].description, original[0].description);
  assert.equal(entries[0].party, "A, B");
  assert.equal(entries[0].amountCents, 10000);
  assert.equal(entries[0].taxCents, 1300);
});

test("CSV export neutralizes spreadsheet formulas, and import restores the text", () => {
  for (const payload of ['=HYPERLINK("http://evil")', "+1+1", "-2", "@SUM(A1)"]) {
    const csv = toCsv([entry({ description: payload })]);
    const cells = parseCsvRows(csv)[1];
    assert.equal(cells[2], `'${payload}`);
    assert.equal(fromCsv(csv).entries[0].description, payload);
  }
});

test("CSV import reports bad rows and keeps good ones", () => {
  const csv = "date,type,description,category,amount\n2026-01-01,income,Job,Services,100\n2026-13-01,income,Bad,Services,100\n";
  const { entries, skipped } = fromCsv(csv);
  assert.equal(entries.length, 1);
  assert.match(skipped[0], /Row 3/);
});

test("CSV import names missing columns and tolerates a byte order mark", () => {
  assert.match(fromCsv("foo,bar\n1,2\n").skipped[0], /date/);
  assert.equal(fromCsv("﻿date,type,description,category,amount\n2026-01-01,income,Job,Services,1\n").entries.length, 1);
});

test("backup import rejects malformed data", () => {
  assert.match(fromBackup("{nope").skipped[0], /could not be read/);
  assert.match(fromBackup('{"x":1}').skipped[0], /not an Akeju/);
  const { entries, skipped } = fromBackup(JSON.stringify({ entries: [entry(), { date: "x" }, null] }));
  assert.equal(entries.length, 1);
  assert.equal(skipped.length, 2);
});

test("backup import drops unknown fields", () => {
  const { entries } = fromBackup(JSON.stringify({ entries: [{ ...entry(), evil: "<script>" }] }));
  assert.equal(entries[0].evil, undefined);
});

test("entryKey identifies duplicates", () => {
  assert.equal(entryKey(entry()), entryKey(entry({ id: "9" })));
  assert.notEqual(entryKey(entry()), entryKey(entry({ amountCents: 1 })));
});
