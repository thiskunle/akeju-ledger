// Copyright (c) 2026 Adekunle Akeju. All rights reserved except as licensed.
// Akeju Ledger, created by Adekunle Akeju. SPDX-License-Identifier: AGPL-3.0-or-later
// Records stay in this browser. Nothing in the app makes a network request.
const KEY = "akeju-ledger:v1";

export function loadEntries() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return { entries: Array.isArray(parsed) ? parsed : [], ok: true };
  } catch {
    return { entries: [], ok: false };
  }
}

export function saveEntries(entries) {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}
