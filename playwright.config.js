// Copyright (c) 2026 Adekunle Akeju. All rights reserved except as licensed.
// Akeju Ledger, created by Adekunle Akeju. SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: "http://localhost:4173", channel: process.env.CI ? undefined : "msedge" },
  webServer: { command: "npm start", url: "http://localhost:4173", reuseExistingServer: false },
});
