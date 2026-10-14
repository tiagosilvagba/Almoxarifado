#!/usr/bin/env node
/**
 * Histórico auditável do estoque, disparado pelo workflow que processa CSVs.
 * Guarda versões completas de posições de estoque (sem histórico volumoso de compras).
 * Nunca sobrescreve versões anteriores. Sem alterações nas fontes não há captura duplicada.
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "data", "historico-estoque");
const INDEX = path.join(DIR, "index.json");
const MANIFEST = path.join(ROOT, "data-manifest.json");
const CATALOG = path.join(ROOT, "data", "catalog.json.gz");

const safeNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const text = (value) => String(value ?? "").trim();
const code = (value) => text(value).replace(/\./g, "");
const branch = (value) => {
  const cleaned = text(value);
  return /^\d+$/.test(cleaned) ? cleaned.replace(/^0+(?=\d)/, "") : cleaned;
};

export function compactStock(items) {
  const rows = [];
  for (const item of items || []) {
    if (item.flags?.inactiveOnly || !Array.isArray(item.positions) || !item.positions.length) continue;
    const itemCode = code(item.code);
    if (!itemCode) continue;
    for (const p of item.positions) {
      // Uma linha por posição de estoque, incluindo zerados parametrizados.
      const qty = safeNumber(p.quantity);
      const cost = safeNumber(p.unitCost);
      const value = safeNumber(p.stockValue);
      rows.push([
        itemCode, text(item.name || item.detailedName), branch(p.branchCode),
        text(p.localCode), text(p.partition), text(p.division), text(p.shelf),
        qty ?? 0, cost, value === null && cost !== null ? (qty ?? 0) * cost : value,
        safeNumber(p.minimum), safeNumber(p.maximum),
      ]);
    }
  }
  rows.sort((a, b) => a[0].localeCompare(b[0], "pt-BR", { numeric:true })
    || a[2].localeCompare(b[2], "pt-BR", { numeric:true })
    || a[3].localeCompare(b[3], "pt-BR", { numeric:true })
    || a[4].localeCompare(b[4], "pt-BR", { numeric:true }));
  return rows;
}

export function stockSummary(rows) {
  let quantity = 0, value = 0, pricedPositions = 0;
  const codes = new Set();
  for (const row of rows) {
    codes.add(row[0]);
    quantity += row[7] || 0;
    if (Number.isFinite(row[9])) { value += row[9]; pricedPositions++; }
  }
  return {
    items: codes.size, positions: rows.length, quantity,
    value, pricedPositions, unpricedPositions: rows.length - pricedPositions,
  };
}

export async function sourceSignature(root = ROOT) {
  const manifest = JSON.parse(await fs.readFile(path.join(root, "data-manifest.json"), "utf8"));
  // O manifesto possui hash de todos os CSVs da raiz. Consumo mensal também entra no hash.
  const sources = manifest.map(({ path, sha, size }) => [path, sha, size])
    .sort((a, b) => a[0].localeCompare(b[0]));
  const monthlyDir = path.join(root, "consumo-mensal");
  const monthly = await fs.readdir(monthlyDir).catch(() => []);
  for (const name of monthly.sort()) {
    if (!/\.csv$/i.test(name)) continue;
    const contents = await fs.readFile(path.join(monthlyDir, name));
    sources.push(["consumo-mensal/" + name, crypto.createHash("sha256").update(contents).digest("hex").slice(0, 16), contents.length]);
  }
  const digest = crypto.createHash("sha256").update(JSON.stringify(sources)).digest("hex");
  return { digest, sourceCount: sources.length, sourceFiles: sources.map((s) => s[0]) };
}

export function snapshotDocument(rows, createdAt, sourceDigest) {
  return {
    schema: 1, capturedAt: createdAt, sourceDigest,
    columns: ["codigo","descricao","filial","local","reparticao","divisao","prateleira",
      "saldo","custoUnitario","valorEstoque","minimo","maximo"],
    rows,
  };
}

export async function buildStockHistory({
  root = ROOT, at = new Date().toISOString(), sourceCommit = process.env.GITHUB_SHA || "",
} = {}) {
  const dir = path.join(root, "data", "historico-estoque");
  const indexFile = path.join(dir, "index.json");
  const signature = await sourceSignature(root);
  let index = { schema: 1, entries: [] };
  try { index = JSON.parse(await fs.readFile(indexFile, "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  if (!Array.isArray(index.entries)) throw new Error("Índice de histórico inválido.");
  // Só comparar com a ÚLTIMA captura: se o usuário restaurar uma base antiga,
  // isso é uma nova atualização operacional e deve ganhar outra data histórica.
  const latest = index.entries[index.entries.length - 1];
  if (latest?.sourceDigest === signature.digest) {
    console.log("Histórico: fontes inalteradas desde a última captura.");
    return { created: false, entry: null };
  }

  // Garantir que todos os CSVs foram consolidados antes de capturar a versão.
  const raw = await fs.readFile(path.join(root, "data", "catalog.json.gz"));
  const catalog = JSON.parse(gunzipSync(raw).toString("utf8"));
  if (!Array.isArray(catalog.items) || !catalog.items.length) {
    throw new Error("Catálogo vazio: snapshot não gravado.");
  }
  const rows = compactStock(catalog.items);
  if (!rows.length) throw new Error("Catálogo sem posições válidas: snapshot não gravado.");
  const document = snapshotDocument(rows, at, signature.digest);
  const compressed = gzipSync(Buffer.from(JSON.stringify(document)), { level: 9 });
  const timestamp = at.replace(/[:.]/g, "-");
  const id = timestamp + "-" + signature.digest.slice(0, 10);
  const file = id + ".json.gz";
  await fs.mkdir(dir, { recursive: true });
  // w/x impede sobregravação acidental mesmo em disparos no mesmo segundo.
  await fs.writeFile(path.join(dir, file), compressed, { flag: "wx" });
  const entry = {
    id, date: at, localDate: new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date(at)),
    path: "data/historico-estoque/" + file,
    sourceDigest: signature.digest, sourceCount: signature.sourceCount,
    sourceCommit: text(sourceCommit), bytes: compressed.length,
    ...stockSummary(rows),
  };
  index.entries.push(entry);
  index.entries.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  await fs.writeFile(indexFile, JSON.stringify(index, null, 2) + "\n", "utf8");
  console.log("Histórico criado: " + file + " (" + rows.length + " posições).");
  return { created: true, entry };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildStockHistory().catch((err) => { console.error(err); process.exitCode = 1; });
}
