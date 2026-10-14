"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const zlib = require("node:zlib");
const { compareSnapshots, summarize } = require("../app/modules/historico-estoque.js");

test("compara posições por código sem pontos, filial e endereço; identifica inclusões e saídas", () => {
  const old = { rows: [
    ["243.370", "Peça", "0704", "299", "", "", "", 20, 5, 100, 10, 30],
    ["555", "Outro", "704", "301", "", "", "", 3, 4, 12, 0, 20],
  ] };
  const newer = { rows: [
    ["243370", "Peça", "704", "299", "", "", "", 8, 5, 40, 10, 30],
    ["999", "Nova peça", "704", "301", "", "", "", 4, 2, 8, 0, 10],
  ] };
  const rows = compareSnapshots(old, newer);
  assert.equal(rows.length, 3);
  assert.equal(rows.find((r) => r.code === "243370").deltaQty, -12);
  assert.equal(rows.find((r) => r.code === "243370").deltaValue, -60);
  assert.equal(rows.find((r) => r.code === "555").status, "Retirado");
  assert.equal(rows.find((r) => r.code === "999").status, "Incluído");
  const s = summarize(rows);
  assert.equal(s.changed, 3);
  assert.equal(s.startQty, 23);
  assert.equal(s.endQty, 12);
  assert.equal(s.startValue, 112);
  assert.equal(s.endValue, 48);
});

test("soma lançamentos repetidos na mesma posição sem misturar repartições", () => {
  const old = { rows: [
    ["42", "Parafuso", "704", "299", "A", "", "", 5, 1, 5],
    ["42", "Parafuso", "704", "299", "A", "", "", 7, 1, 7],
    ["42", "Parafuso", "704", "299", "B", "", "", 10, 1, 10],
  ] };
  const newVersion = { rows: [
    ["42", "Parafuso", "704", "299", "A", "", "", 11, 1, 11],
    ["42", "Parafuso", "704", "299", "B", "", "", 10, 1, 10],
  ] };
  const rows = compareSnapshots(old, newVersion);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((r) => r.partition === "A").deltaQty, -1);
  assert.equal(rows.find((r) => r.partition === "B").status, "Sem alteração");
});

test("gerador persiste versões separadas e não cria duplicatas sem mudança de CSV", async () => {
  const { buildStockHistory } = await import("../tools/build_stock_history.mjs");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "almox-stock-history-"));
  try {
    await fs.mkdir(path.join(root, "data"), { recursive: true });
    await fs.mkdir(path.join(root, "consumo-mensal"), { recursive: true });
    const writeCatalog = (qty) => fs.writeFile(path.join(root, "data", "catalog.json.gz"), zlib.gzipSync(
      JSON.stringify({ items: [{ code: "243.370", name: "Peça X", flags: {},
        positions: [{ branchCode: "0704", localCode: "299", partition: "A",
          quantity: qty, unitCost: 5, stockValue: qty * 5 }] }] })));
    const manifest = (digest) => fs.writeFile(path.join(root, "data-manifest.json"),
      JSON.stringify([{ path: "00 - Saldo_Online.csv", sha: digest, size: 100 }]));
    await writeCatalog(10);
    await manifest("hash1");
    const first = await buildStockHistory({ root, at: "2026-10-14T16:00:00.000Z", sourceCommit: "abc" });
    assert.equal(first.created, true);
    assert.equal(first.entry.positions, 1);
    assert.equal(first.entry.quantity, 10);
    assert.equal(first.entry.value, 50);
    const repeat = await buildStockHistory({ root, at: "2026-10-14T17:00:00.000Z" });
    assert.equal(repeat.created, false);
    await writeCatalog(18);
    await manifest("hash2");
    const second = await buildStockHistory({ root, at: "2026-12-03T16:00:00.000Z" });
    assert.equal(second.created, true);
    const index = JSON.parse(await fs.readFile(path.join(root, "data", "historico-estoque", "index.json")));
    assert.equal(index.entries.length, 2);
    const earlier = JSON.parse(zlib.gunzipSync(await fs.readFile(path.join(root, first.entry.path))).toString());
    const later = JSON.parse(zlib.gunzipSync(await fs.readFile(path.join(root, second.entry.path))).toString());
    assert.equal(earlier.rows[0][0], "243370");
    assert.equal(compareSnapshots(earlier, later)[0].deltaQty, 8);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("aba, versão e workflow estão ligados ao histórico em arquivos separados", async () => {
  const root = path.join(__dirname, "..");
  const html = await fs.readFile(path.join(root, "index.html"), "utf8");
  const script = await fs.readFile(path.join(root, "script.js"), "utf8");
  const core = await fs.readFile(path.join(root, "app/core/catalog-app.js"), "utf8");
  const workflow = await fs.readFile(path.join(root, ".github/workflows/update-data-manifest.yml"), "utf8");
  assert.match(html, /id="page-historico-estoque"/);
  assert.match(script, /MODULES\.stockHistory/);
  assert.match(core, /"historico-estoque"/);
  assert.match(workflow, /node tools\/build_stock_history\.mjs/);
  assert.match(workflow, /data\/historico-estoque/);
});