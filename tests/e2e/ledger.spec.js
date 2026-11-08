// Copyright (c) 2026 Adekunle Akeju. All rights reserved except as licensed.
// Akeju Ledger, created by Adekunle Akeju. SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "@playwright/test";

async function add(page, { kind = "Income", date = "2026-03-15", description, party = "", category, amount, tax }) {
  await page.locator(".kind span", { hasText: new RegExp(`^${kind}$`) }).click();
  await page.locator('input[name="date"]').fill(date);
  await page.getByLabel("Description").fill(description);
  if (party) await page.locator('input[name="party"]').fill(party);
  await page.locator("#category").selectOption(category);
  await page.getByLabel("Amount before tax").fill(amount);
  if (tax) await page.getByLabel("HST or GST").fill(tax);
  await page.getByRole("button", { name: "Save entry" }).click();
}

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") page.errors.push(m.text()); });
  await page.goto("/");
});

test.afterEach(async ({ page }) => {
  expect(page.errors).toEqual([]);
});

test("starts empty, with the author credited", async ({ page }) => {
  await expect(page.getByText("No entries for this period")).toBeVisible();
  await expect(page.locator("footer")).toContainText("created by Adekunle Akeju");
});

test("records income and expense and computes the statement", async ({ page }) => {
  await add(page, { description: "Website project", party: "Acme", category: "Services", amount: "1,000", tax: "130" });
  await add(page, { kind: "Expense", description: "Hosting", party: "Host Co", category: "Software and subscriptions", amount: "100", tax: "13" });
  await page.getByLabel("Year").selectOption("2026");
  const statement = page.locator("#statement");
  await expect(statement).toContainText("$1,000.00");
  await expect(statement).toContainText("$900.00");
  await expect(statement).toContainText("HST to remit");
  await expect(statement).toContainText("$117.00");
  await expect(page.locator("#chart .bar-income")).toHaveCount(1);
  await expect(page.locator("#chart .bar-expense")).toHaveCount(1);
});

test("the Add HST button fills 13%", async ({ page }) => {
  await page.getByLabel("Amount before tax").fill("200");
  await page.getByRole("button", { name: "Add 13% Ontario HST" }).click();
  await expect(page.getByLabel("HST or GST")).toHaveValue("26.00");
});

test("bad input shows the problems and saves nothing", async ({ page }) => {
  await page.getByLabel("Description").fill("x");
  await page.getByRole("button", { name: "Save entry" }).click();
  await expect(page.locator("#status")).toContainText("Choose a category");
  await expect(page.getByText("No entries for this period")).toBeVisible();
});

test("entries survive a reload", async ({ page }) => {
  await add(page, { description: "Kept", category: "Services", amount: "5" });
  await page.reload();
  await page.getByLabel("Year").selectOption("2026");
  await expect(page.getByText("Kept", { exact: true })).toBeVisible();
});

test("edit updates an entry and delete can be undone", async ({ page }) => {
  await add(page, { description: "Draft", category: "Services", amount: "5" });
  await page.getByRole("button", { name: "Edit Draft" }).click();
  await page.getByLabel("Description").fill("Final");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator(".what")).toHaveText("Final");
  await page.getByRole("button", { name: "Delete Final" }).click();
  await expect(page.getByText("No entries for this period")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".what")).toHaveText("Final");
});

test("script in a description stays as text", async ({ page }) => {
  await add(page, { description: "<img src=x onerror=window.pwned=1>", category: "Services", amount: "5" });
  await expect(page.locator(".what")).toHaveText("<img src=x onerror=window.pwned=1>");
  expect(await page.evaluate(() => window.pwned)).toBeUndefined();
  expect(await page.locator("#rows img").count()).toBe(0);
});

test("the app makes no outside network requests", async ({ page, baseURL }) => {
  const outside = [];
  page.on("request", (r) => { if (!r.url().startsWith(baseURL) && !r.url().startsWith("blob:")) outside.push(r.url()); });
  await page.reload();
  await add(page, { description: "Private", category: "Services", amount: "5" });
  expect(outside).toEqual([]);
});

test("CSV export can be imported again without duplicates", async ({ page }) => {
  await add(page, { description: "Exported, job", category: "Services", amount: "50", tax: "6.50" });
  await page.getByLabel("Year").selectOption("2026");
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export this view to CSV" }).click()]);
  await page.locator("#import").setInputFiles(await file.path().then((p) => ({ name: "books.csv", mimeType: "text/csv", buffer: require_(p) })));
  await expect(page.locator("#status")).toContainText("Imported 0 entries. 1 already here.");
});

test("a backup restores into an empty browser", async ({ page }) => {
  await add(page, { description: "Backed up", category: "Services", amount: "50" });
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download backup" }).click()]);
  const buffer = require_(await file.path());
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator("#import").setInputFiles({ name: "backup.json", mimeType: "application/json", buffer });
  await expect(page.locator("#status")).toContainText("Imported 1 entry");
  await page.getByLabel("Year").selectOption("2026");
  await expect(page.getByText("Backed up", { exact: true })).toBeVisible();
});

test("phone width has no sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await add(page, { description: "A long description that should wrap and not push the page sideways at all", category: "Services", amount: "123456.78" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

import { readFileSync } from "node:fs";
function require_(path) { return readFileSync(path); }
