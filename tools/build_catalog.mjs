#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { gzip } from "node:zlib";
import { createRequire } from "node:module";

const gzipAsync = promisify(gzip);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = path.join(ROOT, "data");
const require = createRequire(import.meta.url);
const { inventoryWorker } = require(path.join(ROOT, "app/core/catalog-app.js"));
const BASE_URL = "http://local/";

globalThis.fetch = async (input) => {
  const url = new URL(typeof input === "string" ? input : input.url, BASE_URL);
  const localPath = path.join(ROOT, decodeURIComponent(url.pathname.replace(/^\//, "")));
  try {
    return new Response(await fs.readFile(localPath), { status: 200 });
  } catch {
    return new Response("Arquivo não encontrado", { status: 404 });
  }
};

let resolveWorker;
let rejectWorker;
const workerResult = new Promise((resolve, reject) => {
  resolveWorker = resolve;
  rejectWorker = reject;
});

globalThis.self = {
  location: { href: BASE_URL },
  postMessage(message) {
    if (message.type === "error") rejectWorker(new Error(message.message));
    if (message.type === "complete") resolveWorker(message.payload);
    if (message.type === "progress" && message.percent != null) {
      process.stdout.write(`${Math.round(message.percent)}% ${message.message}\n`);
    }
  },
};

inventoryWorker();
self.onmessage({
  data: {
    optimizedDataUrl: "",
    saldoUrl: `${BASE_URL}00%20-%20Saldo_Online.csv`,
    comprasApiUrl: `${BASE_URL}data-manifest.json`,
    commitsApiUrl: "",
    comprasFallbackUrl: "",
    replenishmentUrl: `${BASE_URL}02%20-%20Responsaveis_Reposi%C3%A7%C3%A3o.CSV`,
    consumoUrl: `${BASE_URL}03%20-%20Consumo.csv`,
  },
});

const payload = await workerResult;
payload.baseUpdatedAt ||= new Date().toISOString();
const json = JSON.stringify(payload);
const compressed = await gzipAsync(Buffer.from(json), { level: 9 });

await fs.mkdir(OUTPUT_DIR, { recursive: true });
await fs.writeFile(path.join(OUTPUT_DIR, "catalog.json.gz"), compressed);
await fs.writeFile(path.join(OUTPUT_DIR, "catalog-meta.json"), `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  items: payload.items.length,
  saldoRows: payload.saldoRows,
  comprasRows: payload.comprasRows,
  comprasFiles: payload.comprasFiles,
  consumptionRows: payload.consumption?.rowCount || 0,
  uncompressedBytes: Buffer.byteLength(json),
  compressedBytes: compressed.byteLength,
}, null, 2)}\n`);

console.log(`Base otimizada: ${(compressed.byteLength / 1048576).toFixed(1)} MB.`);
