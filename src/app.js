// Copyright (c) 2026 Adekunle Akeju. All rights reserved except as licensed.
// Akeju Ledger, created by Adekunle Akeju. SPDX-License-Identifier: AGPL-3.0-or-later
import {
  EXPENSE_CATEGORIES, INCOME_CATEGORIES, byCategory, byMonth, entryKey, filterEntries, formatMoney, fromBackup, fromCsv,
  hstOn, parseMoney, plainMoney, summarize, toCsv, validate,
} from "./ledger.js";
import { loadEntries, saveEntries } from "./store.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SVG = "http://www.w3.org/2000/svg";
const PHONE = matchMedia("(max-width: 560px)");
const $ = (id) => document.getElementById(id);

// Text only ever enters the page through textContent, so entries cannot inject markup.
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const c of children) el.append(c);
  return el;
}

function s(tag, attrs = {}) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

const today = () => new Date().toLocaleDateString("en-CA");
const loaded = loadEntries();
const state = {
  entries: loaded.entries,
  year: today().slice(0, 4), month: "all", type: "all", search: "",
  editingId: null, lastDeleted: null,
};

function persist() {
  if (!saveEntries(state.entries)) say("This browser refused to save. Download a backup now so you do not lose your entries.", true);
}

function say(text, isError = false, action) {
  const box = $("status");
  box.replaceChildren(text);
  box.classList.toggle("is-error", isError);
  if (action) box.append(" ", h("button", { type: "button", class: "link", onclick: action.run }, action.label));
}

function setType(type) {
  const select = $("category");
  const keep = select.value;
  const options = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  select.replaceChildren(h("option", { value: "" }, "Choose a category"), ...options.map((c) => h("option", { value: c }, c)));
  if (options.includes(keep)) select.value = keep;
  $("party-label-text").textContent = type === "income" ? "Client" : "Vendor";
}

function readForm() {
  const f = $("entry-form");
  const taxText = f.tax.value.trim();
  return {
    type: f.type.value, date: f.date.value, description: f.description.value.trim(), party: f.party.value.trim(),
    category: f.category.value, amountCents: parseMoney(f.amount.value) ?? NaN,
    taxCents: taxText === "" ? 0 : parseMoney(taxText) ?? NaN, note: f.note.value.trim(),
  };
}

function resetForm() {
  const f = $("entry-form");
  const type = f.type.value;
  f.reset();
  f.type.value = type;
  f.date.value = today();
  setType(type);
  state.editingId = null;
  $("save").textContent = "Save entry";
  $("cancel").hidden = true;
  $("form-title").textContent = "New entry";
}

function startEdit(entry) {
  const f = $("entry-form");
  state.editingId = entry.id;
  f.type.value = entry.type;
  setType(entry.type);
  f.date.value = entry.date;
  f.description.value = entry.description;
  f.party.value = entry.party ?? "";
  f.category.value = entry.category;
  f.amount.value = plainMoney(entry.amountCents);
  f.tax.value = entry.taxCents ? plainMoney(entry.taxCents) : "";
  f.note.value = entry.note ?? "";
  $("save").textContent = "Save changes";
  $("cancel").hidden = false;
  $("form-title").textContent = "Edit entry";
  f.description.focus();
}

function submit(event) {
  event.preventDefault();
  const entry = readForm();
  const problems = validate(entry);
  if (problems.length) return say(problems.join(" "), true);
  if (state.editingId) {
    const old = state.entries.find((e) => e.id === state.editingId);
    Object.assign(old, entry);
    say("Entry updated.");
  } else {
    state.entries.push({ ...entry, id: crypto.randomUUID(), createdAt: Date.now() });
    state.year = entry.date.slice(0, 4);
    say("Entry saved.");
  }
  persist();
  resetForm();
  render();
}

function remove(entry) {
  state.entries = state.entries.filter((e) => e.id !== entry.id);
  persist();
  render();
  say(`Deleted "${entry.description}".`, false, {
    label: "Undo",
    run: () => { state.entries.push(entry); persist(); render(); say("Entry restored."); },
  });
}

function download(name, type, text) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importFile(file) {
  const text = await file.text();
  const { entries, skipped } = file.name.toLowerCase().endsWith(".json") ? fromBackup(text) : fromCsv(text);
  const seen = new Set(state.entries.map(entryKey));
  let added = 0, duplicates = 0;
  for (const entry of entries) {
    const key = entryKey(entry);
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    state.entries.push({ ...entry, id: crypto.randomUUID(), createdAt: Date.now() + added });
    added++;
  }
  persist();
  render();
  say(`Imported ${added} ${added === 1 ? "entry" : "entries"}. ${duplicates} already here. ${skipped.length} skipped.${skipped.length ? " " + skipped.slice(0, 3).join(" ") : ""}`, skipped.length > 0 && added === 0);
}

function renderPeriodControls() {
  const years = new Set([today().slice(0, 4), state.year, ...state.entries.map((e) => e.date.slice(0, 4))]);
  const select = $("year");
  select.replaceChildren(...[...years].sort().reverse().map((y) => h("option", { value: y }, y)));
  select.value = state.year;
}

function renderStatement(totals) {
  const cells = [
    ["Income", totals.income], ["Expenses", totals.expenses], ["Profit before tax", totals.profit],
    ["HST collected", totals.taxCollected], ["HST paid", totals.taxPaid],
    [totals.taxOwing < 0 ? "HST refund due" : "HST to remit", Math.abs(totals.taxOwing)],
  ];
  $("statement").replaceChildren(...cells.map(([label, cents]) => h("div", {}, h("dt", {}, label), h("dd", {}, formatMoney(cents)))));
}

function niceMax(value) {
  if (value <= 0) return 100000;
  const power = 10 ** Math.floor(Math.log10(value));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * power >= value) return m * power;
  return 10 * power;
}

function renderChart(entries) {
  const months = byMonth(entries, state.year);
  const svg = $("chart");
  const tip = $("tip");
  const max = niceMax(Math.max(...months.flatMap((m) => [m.income, m.expenses])));
  const narrow = PHONE.matches;
  const [W, H, left, top, bottom] = narrow ? [340, 200, 52, 10, 26] : [720, 220, 62, 10, 26];
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const plot = H - top - bottom;
  const band = (W - left) / 12;
  const y = (v) => top + plot - (v / max) * plot;
  svg.replaceChildren();
  for (const tick of [0, 0.5, 1]) {
    const v = max * tick;
    svg.append(Object.assign(s("line", { x1: left, x2: W, y1: y(v), y2: y(v), class: "grid" })));
    const label = s("text", { x: left - 8, y: y(v) + 4, "text-anchor": "end", class: "axis" });
    label.textContent = formatMoney(v).replace(/\.00$/, "");
    svg.append(label);
  }
  const barW = Math.max(6, Math.min(16, band / 2 - 4));
  const bar = (x, v, cls) => {
    if (v <= 0) return null;
    const barH = Math.max(2, (v / max) * plot);
    const r = Math.min(4, barH / 2);
    const base = top + plot;
    return s("path", { class: cls, d: `M${x} ${base}V${base - barH + r}q0 ${-r} ${r} ${-r}h${barW - 2 * r}q${r} 0 ${r} ${r}V${base}z` });
  };
  months.forEach((m, i) => {
    const cx = left + band * i + band / 2;
    const g = s("g", { class: "month" });
    const hit = s("rect", { x: left + band * i, y: top, width: band, height: plot + bottom, class: "hit" });
    g.append(hit);
    for (const b of [bar(cx - barW - 1, m.income, "bar-income"), bar(cx + 1, m.expenses, "bar-expense")]) if (b) g.append(b);
    const label = s("text", { x: cx, y: H - 8, "text-anchor": "middle", class: "axis" });
    label.textContent = narrow ? MONTHS[i][0] : MONTHS[i];
    g.append(label);
    g.addEventListener("pointerenter", () => {
      tip.replaceChildren(h("strong", {}, `${MONTHS[i]} ${state.year}`), h("span", {}, `Income ${formatMoney(m.income)}`), h("span", {}, `Expenses ${formatMoney(m.expenses)}`));
      tip.hidden = false;
      const box = svg.getBoundingClientRect();
      tip.style.left = `${Math.min(box.width - 150, Math.max(0, (cx / W) * box.width - 70))}px`;
    });
    g.addEventListener("pointerleave", () => { tip.hidden = true; });
    svg.append(g);
  });
  $("month-table-body").replaceChildren(...months.map((m) => h("tr", {}, h("th", { scope: "row" }, MONTHS[m.month]), h("td", {}, formatMoney(m.income)), h("td", {}, formatMoney(m.expenses)), h("td", {}, formatMoney(m.income - m.expenses)))));
}

function renderCategories(entries) {
  const list = (type) => {
    const rows = byCategory(entries, type);
    return rows.length ? rows.map((r) => h("li", {}, h("span", {}, r.category), h("span", { class: "num" }, formatMoney(r.cents)))) : [h("li", { class: "quiet" }, "Nothing in this period.")];
  };
  $("cat-income").replaceChildren(...list("income"));
  $("cat-expense").replaceChildren(...list("expense"));
}

function renderRows(entries) {
  const body = $("rows");
  $("empty").hidden = entries.length > 0;
  $("table-wrap").hidden = entries.length === 0;
  body.replaceChildren(...entries.map((e) => {
    const sign = e.type === "income" ? "" : "-";
    return h("tr", {},
      h("td", { class: "date" }, e.date),
      h("td", { class: "desc" }, h("span", { class: "what" }, e.description), h("span", { class: "who" }, [e.party, e.category].filter(Boolean).join(", "))),
      h("td", { class: `num ${e.type}` }, sign + formatMoney(e.amountCents)),
      h("td", { class: "num tax" }, e.taxCents ? formatMoney(e.taxCents) : ""),
      h("td", { class: "actions" },
        h("button", { type: "button", class: "link", "aria-label": `Edit ${e.description}`, onclick: () => startEdit(e) }, "Edit"),
        h("button", { type: "button", class: "link", "aria-label": `Delete ${e.description}`, onclick: () => remove(e) }, "Delete")));
  }));
}

function render() {
  renderPeriodControls();
  const entries = filterEntries(state.entries, state);
  renderStatement(summarize(entries));
  renderChart(state.entries);
  renderCategories(entries);
  renderRows(entries);
  $("count").textContent = `${entries.length} ${entries.length === 1 ? "entry" : "entries"}`;
}

const f = $("entry-form");
f.addEventListener("submit", submit);
f.addEventListener("change", (e) => { if (e.target.name === "type") setType(f.type.value); });
$("cancel").addEventListener("click", () => { resetForm(); say(""); });
$("add-hst").addEventListener("click", () => {
  const cents = parseMoney(f.amount.value);
  if (cents === null) return say("Enter the amount first, then add HST.", true);
  f.tax.value = plainMoney(hstOn(cents));
  say("");
});
$("month").replaceChildren(h("option", { value: "all" }, "All months"), ...MONTHS.map((m, i) => h("option", { value: String(i + 1).padStart(2, "0") }, m)));
for (const [id, key] of [["year", "year"], ["month", "month"], ["filter-type", "type"]]) {
  $(id).addEventListener("change", (e) => { state[key] = e.target.value; render(); });
}
$("search").addEventListener("input", (e) => { state.search = e.target.value; render(); });
$("export-csv").addEventListener("click", () => download(`akeju-ledger-${state.year}.csv`, "text/csv", toCsv(filterEntries(state.entries, state))));
$("backup").addEventListener("click", () => download(`akeju-ledger-backup-${today()}.json`, "application/json", JSON.stringify({ app: "Akeju Ledger by Adekunle Akeju", entries: state.entries }, null, 2)));
$("import").addEventListener("change", (e) => { const [file] = e.target.files; if (file) importFile(file); e.target.value = ""; });

PHONE.addEventListener("change", render);
f.date.value = today();
setType("income");
render();
if (!loaded.ok) say("Your saved entries could not be read. Restore a backup to continue.", true);
