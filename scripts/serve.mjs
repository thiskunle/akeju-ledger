// Copyright (c) 2026 Adekunle Akeju. All rights reserved except as licensed.
// Akeju Ledger, created by Adekunle Akeju. SPDX-License-Identifier: AGPL-3.0-or-later
// Minimal local server. Binds to this computer only and refuses paths outside the project.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";

const root = process.cwd();
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
const port = Number(process.env.PORT ?? 4173);

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = normalize(join(root, path === "/" ? "index.html" : path));
  const allowed = file === join(root, "index.html") || file.startsWith(join(root, "src") + sep);
  if (!allowed || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end("Not found");
    return;
  }
  res.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream", "X-Content-Type-Options": "nosniff" });
  createReadStream(file).pipe(res);
}).listen(port, "127.0.0.1", () => console.log(`Akeju Ledger by Adekunle Akeju: http://localhost:${port}`));
