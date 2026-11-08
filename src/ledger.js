// Copyright (c) 2026 Adekunle Akeju. All rights reserved except as licensed.
// Akeju Ledger, created by Adekunle Akeju. SPDX-License-Identifier: AGPL-3.0-or-later
// Pure bookkeeping logic. All money is stored as integer cents so totals never drift.

export const INCOME_CATEGORIES = ["Services", "Product sales", "Interest", "Other income"];
export const EXPENSE_CATEGORIES = [
  "Advertising", "Bank charges", "Business taxes and fees", "Contractors", "Insurance", "Meals and entertainment",
  "Office supplies", "Professional fees", "Rent", "Software and subscriptions", "Telephone and internet",
  "Travel", "Vehicle", "Wages", "Other expense",
];
export const HST_RATE = 0.13;

export function parseMoney(text) {
  const clean = String(text ?? "").trim().replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const [whole, fraction = ""] = clean.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function formatMoney(cents) {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, "0")}`;
}

export function plainMoney(cents) {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

export function hstOn(cents) {
  return Math.round(cents * HST_RATE);
}

function isRealDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Returns a list of problems, written for the person filling in the form. */
export function validate(entry) {
  const problems = [];
  if (!isRealDate(entry.date)) problems.push("Enter a real date.");
  if (entry.type !== "income" && entry.type !== "expense") problems.push("Choose income or expense.");
  if (!entry.description?.trim()) problems.push("Add a description.");
  else if (entry.description.length > 200) problems.push("Keep the description under 200 characters.");
  const allowed = entry.type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  if (!allowed.includes(entry.category)) problems.push("Choose a category.");
  if (!Number.isSafeInteger(entry.amountCents) || entry.amountCents <= 0) problems.push("Enter an amount above zero.");
  if (!Number.isSafeInteger(entry.taxCents) || entry.taxCents < 0) problems.push("Enter a tax amount of zero or more.");
  return problems;
}

export function inPeriod(entry, year, month) {
  if (!entry.date.startsWith(`${year}-`)) return false;
  return month === "all" || entry.date.slice(5, 7) === month;
}

export function filterEntries(entries, { year, month = "all", type = "all", search = "" }) {
  const term = search.trim().toLowerCase();
  return entries
    .filter((e) => inPeriod(e, year, month) && (type === "all" || e.type === type))
    .filter((e) => !term || [e.description, e.party, e.category, e.note].some((v) => (v ?? "").toLowerCase().includes(term)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

export function summarize(entries) {
  const totals = { income: 0, expenses: 0, profit: 0, taxCollected: 0, taxPaid: 0, taxOwing: 0 };
  for (const e of entries) {
    if (e.type === "income") { totals.income += e.amountCents; totals.taxCollected += e.taxCents; }
    else { totals.expenses += e.amountCents; totals.taxPaid += e.taxCents; }
  }
  totals.profit = totals.income - totals.expenses;
  totals.taxOwing = totals.taxCollected - totals.taxPaid;
  return totals;
}

export function byMonth(entries, year) {
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i, income: 0, expenses: 0 }));
  for (const e of entries) {
    if (!e.date.startsWith(`${year}-`)) continue;
    months[Number(e.date.slice(5, 7)) - 1][e.type === "income" ? "income" : "expenses"] += e.amountCents;
  }
  return months;
}

export function byCategory(entries, type) {
  const totals = new Map();
  for (const e of entries) if (e.type === type) totals.set(e.category, (totals.get(e.category) ?? 0) + e.amountCents);
  return [...totals].map(([category, cents]) => ({ category, cents })).sort((a, b) => b.cents - a.cents);
}

const COLUMNS = ["date", "type", "description", "party", "category", "amount", "tax", "note"];

// A cell beginning with these can run as a formula when the CSV is opened in a spreadsheet.
function neutralize(text) {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function restore(text) {
  return /^'[=+\-@\t\r]/.test(text) ? text.slice(1) : text;
}

function cell(text) {
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(entries) {
  const rows = [...entries].sort((a, b) => a.date.localeCompare(b.date)).map((e) => [
    e.date, e.type, neutralize(e.description), neutralize(e.party ?? ""), e.category,
    plainMoney(e.amountCents), plainMoney(e.taxCents), neutralize(e.note ?? ""),
  ].map(cell).join(","));
  return [COLUMNS.join(","), ...rows].join("\r\n") + "\r\n";
}

export function parseCsvRows(text) {
  const rows = [];
  let row = [], value = "", quoted = false;
  const source = text.replace(/^﻿/, "");
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') { value += '"'; i++; }
      else if (c === '"') quoted = false;
      else value += c;
    } else if (c === '"' && value === "") quoted = true;
    else if (c === ",") { row.push(value); value = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && source[i + 1] === "\n") i++;
      row.push(value); value = "";
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
    } else value += c;
  }
  if (value !== "" || row.length) { row.push(value); if (row.some((v) => v !== "")) rows.push(row); }
  return rows;
}

/** Returns { entries, skipped }, where skipped lists each rejected row and why. */
export function fromCsv(text) {
  const rows = parseCsvRows(text);
  if (!rows.length) return { entries: [], skipped: ["The file is empty."] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const missing = COLUMNS.filter((c) => !["party", "note", "tax"].includes(c) && !header.includes(c));
  if (missing.length) return { entries: [], skipped: [`The file has no column named: ${missing.join(", ")}.`] };
  const entries = [], skipped = [];
  rows.slice(1).forEach((row, index) => {
    const get = (name) => row[header.indexOf(name)]?.trim() ?? "";
    const entry = {
      date: get("date"), type: get("type").toLowerCase(), description: restore(get("description")),
      party: restore(get("party")), category: get("category"), amountCents: parseMoney(get("amount")),
      taxCents: get("tax") === "" ? 0 : parseMoney(get("tax")), note: restore(get("note")),
    };
    const problems = validate(entry);
    if (problems.length) skipped.push(`Row ${index + 2}: ${problems.join(" ")}`);
    else entries.push(entry);
  });
  return { entries, skipped };
}

/** Parses a backup file. Anything not matching the entry shape is reported, never loaded. */
export function fromBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { return { entries: [], skipped: ["This backup file could not be read."] }; }
  if (!Array.isArray(data?.entries)) return { entries: [], skipped: ["This is not an Akeju Ledger backup."] };
  const entries = [], skipped = [];
  data.entries.forEach((raw, i) => {
    const entry = {
      date: raw?.date, type: raw?.type, description: String(raw?.description ?? ""), party: String(raw?.party ?? ""),
      category: raw?.category, amountCents: raw?.amountCents, taxCents: raw?.taxCents, note: String(raw?.note ?? ""),
    };
    const problems = validate(entry);
    if (problems.length) skipped.push(`Entry ${i + 1}: ${problems.join(" ")}`);
    else entries.push(entry);
  });
  return { entries, skipped };
}

export function entryKey(e) {
  return [e.date, e.type, e.description, e.party ?? "", e.category, e.amountCents, e.taxCents].join("|");
}
