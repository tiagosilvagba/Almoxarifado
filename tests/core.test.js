"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  numericMedian,
  ofGenerationBucketFor,
  generationDaysBetween,
  isWarehouseSc,
  isClosedOf,
  inventoryWorker,
  pageForHash,
} = require("../app/core/catalog-app.js");
const {
  DELIVERY_TOTAL,
  DELIVERY_PARTIAL,
  isFollowUpRecord,
  followUpDeliveryState,
  buildFollowUpRows,
  followUpStockBalance,
  filterFollowUpRows,
  availableFollowUpValues,
  buildFollowUpExportReport,
  formatDateBr,
} = require("../app/modules/follow-up.js");

test("numericMedian calcula amostras pares e ímpares", () => {
  assert.equal(numericMedian([9, 1, 5]), 5);
  assert.equal(numericMedian([1, 3, 7, 9]), 5);
});

test("faixas do tempo de geração de OF respeitam os limites", () => {
  assert.equal(ofGenerationBucketFor(7)?.id, "up-to-7");
  assert.equal(ofGenerationBucketFor(8)?.id, "8-to-15");
  assert.equal(ofGenerationBucketFor(31)?.id, "above-30");
});

test("diferença entre criação da SC e OF é calculada em dias", () => {
  assert.equal(generationDaysBetween("01/09/2026", "11/09/2026"), 10);
});

test("regras essenciais de estoque permanecem estáveis", () => {
  assert.equal(isWarehouseSc({ allocationCostCenter: "1500" }), true);
  assert.equal(isWarehouseSc({ allocationCostCenter: "2000" }), false);
  assert.equal(isClosedOf({ closed: "S" }), true);
});

test("follow-up aceita somente compra confirmada, OF aberta e saldo pendente", () => {
  const valid = {
    sc: { code: "100", status: "Compra confirmada", cancelled: "N" },
    of: { code: "200", closed: "N", requestedQuantity: 10, deliveredQuantity: 0, balance: 10 },
  };
  assert.equal(isFollowUpRecord(valid), true);
  assert.equal(followUpDeliveryState(valid.of), DELIVERY_TOTAL);
  assert.equal(isFollowUpRecord({ ...valid, sc: { ...valid.sc, status: "Comprador negociando" } }), false);
  assert.equal(isFollowUpRecord({ ...valid, of: { ...valid.of, closed: "S" } }), false);
  assert.equal(isFollowUpRecord({ ...valid, of: { ...valid.of, balance: 0, deliveredQuantity: 10 } }), false);
});

test("follow-up identifica entrega parcial e consolida recebimentos repetidos", () => {
  const record = {
    branch: "Filial A",
    sc: { code: "100", sequence: "1", status: "Compra confirmada", cancelled: "N" },
    of: { code: "200", closed: "N", requestedQuantity: 10, deliveredQuantity: 4, balance: 6, unitValue: 5 },
  };
  assert.equal(followUpDeliveryState(record.of), DELIVERY_PARTIAL);
  const rows = buildFollowUpRows([{ code: "ABC", name: "Item", history: [record, { ...record, rec: { invoice: "NF-2" } }] }], Date.UTC(2026, 8, 16));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].quantity, 6);
  assert.equal(rows[0].value, 30);
  assert.equal(rows[0].deliveryStatus, DELIVERY_PARTIAL);
});

test("follow-up exibe entrega prevista em dd/mm/aaaa sem inverter dia e mês", () => {
  const baseSc = { code: "100", status: "Compra confirmada", cancelled: "N", deliveryDate: "05/10/2026" };
  const baseOf = { code: "200", closed: "N", requestedQuantity: 2, deliveredQuantity: 0, balance: 2 };
  const rows = buildFollowUpRows([
    { code: "ABC", history: [{ sc: baseSc, of: { ...baseOf, deliveryDate: "2026-09-28T00:00:00Z" } }] },
    { code: "DEF", history: [{ sc: { ...baseSc, code: "101" }, of: { ...baseOf, code: "201" } }] },
  ], Date.UTC(2026, 8, 28));
  assert.equal(rows.find((row) => row.code === "ABC").delivery, "28/09/2026");
  assert.equal(rows.find((row) => row.code === "DEF").delivery, "05/10/2026");
  assert.equal(formatDateBr("09/11/2026"), "09/11/2026");
  assert.equal(formatDateBr("2026-11-09"), "09/11/2026");
  assert.equal(formatDateBr(""), "—");
});

test("exportação do follow-up inclui o recorte completo, ordena e formata as datas e valores", () => {
  const base = {
    branch: "Filial A",
    sc: { code: "100", status: "Compra confirmada", cancelled: "N" },
    of: { code: "200", date: "01/09/2026", deliveryDate: "2026-10-09", closed: "N", requestedQuantity: 10, deliveredQuantity: 3, balance: 7, unitValue: 12 },
  };
  const filtered = buildFollowUpRows([
    { code: "ABC", name: "Peça A", history: [base] },
    { code: "DEF", name: "Peça B", history: [{ ...base, sc: { ...base.sc, code: "101" }, of: { ...base.of, code: "201", date: "15/09/2026", deliveryDate: "05/11/2026" } }] },
  ], Date.UTC(2026, 8, 28));
  const report = buildFollowUpExportReport(filtered, "Filial A · Entrega parcial");
  assert.equal(report.filename, "follow-up-de-ofs.xls");
  assert.equal(report.rows.length, 2);
  assert.equal(report.headers.length, 17);
  assert.equal(report.headers[12], "Saldo atual");
  assert.equal(report.headers[13], "Qtd. OF");
  assert.equal(report.rows[0][12], null);
  assert.equal(report.rows[0][7], "200");
  assert.equal(report.rows[0][2], "01/09/2026");
  assert.equal(report.rows[0][10], "09/10/2026");
  assert.equal(report.rows[1][10], "05/11/2026");
  assert.equal(report.rows[0][15], 7);
  assert.equal(report.rows[0][16], 84);
  assert.deepEqual([...report.dateColumns], [2, 10]);
  assert.deepEqual([...report.currencyColumns], [16]);
  assert.match(report.filterSummary, /Filial A/);
  assert.equal(buildFollowUpExportReport([]).rows.length, 0);
});

test("filial 704 e local 299 classificam repartição JF em Alm. Preparados, inclusive no cache", async () => {
  const abAves = "ROLANDIA - AB. AVES";
  const position = (branchCode, localCode, partition) => ({
    branchCode, localCode, partition,
    branchName: abAves,
    branchKey: `${branchCode}::branch::${abAves}`,
    locationKey: `${branchCode}::${localCode}`,
  });
  const positions = [
    position("704", "299", "JF"),
    position("704", "299", "AP"),
    position("704", "299", "XX"),
    position("705", "299", "JF"),
    position("704", "300", "JF"),
    position("704", "295", "XX"),
  ];
  const payload = { items: [{ code: "123456", positions }], consumption: { records: [] } };
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const oldFetch = global.fetch;
  const oldSelf = global.self;
  const messages = [];
  try {
    global.fetch = async () => ({ ok: true, arrayBuffer: async () => encoded.buffer });
    global.self = { postMessage: (message) => messages.push(message) };
    inventoryWorker();
    await global.self.onmessage({ data: { optimizedDataUrl: "https://example.test/catalog.json" } });
    const result = messages.find((message) => message.type === "complete")?.payload;
    assert.ok(result, "o catálogo otimizado deve ser carregado");
    const resolved = result.items[0].positions;
    assert.equal(resolved[0].branchName, "ROLANDIA - ALM. PREPARADOS");
    assert.equal(resolved[0].branchKey, "704::branch::ROLANDIA - ALM. PREPARADOS");
    assert.equal(resolved[1].branchName, "ROLANDIA - ALM. PREPARADOS");
    assert.equal(resolved[2].branchName, abAves);
    assert.equal(resolved[3].branchName, abAves);
    assert.equal(resolved[4].branchName, abAves);
    assert.equal(resolved[5].branchName, "ROLANDIA - ALM. PREPARADOS");
    assert.equal(resolved[0].locationKey, "704::299");
  } finally {
    global.fetch = oldFetch;
    if (oldSelf === undefined) delete global.self;
    else global.self = oldSelf;
  }
});

test("follow-up apresenta saldo atual apenas da filial da OF e respeita zeros", () => {
  const item = {
    code: "243370", name: "Peça teste",
    positions: [
      { branchCode: "704", localCode: "101", quantity: 12 },
      { branchCode: "0704", localCode: "299", quantity: 3 },
      { branchCode: "705", localCode: "299", quantity: 900 },
    ],
    history: [
      {
        branch: "ROLANDIA", branchCode: "704",
        sc: { code: "100", status: "Compra confirmada", branchCode: "704" },
        of: { code: "200", deliveryBranchCode: "704", balance: 5, closed: "N", unitValue: 10 },
      },
    ],
  };
  const row = buildFollowUpRows([item])[0];
  assert.equal(row.stockBalance, 15);
  assert.equal(row.quantity, 5);
  assert.equal(followUpStockBalance(item, { branchCode: "705" }), 900);
  assert.equal(followUpStockBalance(item, { branchCode: "706" }), null);
  assert.equal(followUpStockBalance({ positions: [{ branchCode: "704", quantity: 0 }] }, { branchCode: "704" }), 0);
  assert.equal(followUpStockBalance({ positions: [] }, { branchCode: "704" }), null);
  assert.equal(followUpStockBalance(item, { of: { deliveryBranchCode: "705" }, branchCode: "704" }), 900);
  const report = buildFollowUpExportReport([row]);
  assert.equal(report.rows[0][12], 15);
  assert.ok(report.numericColumns.has(12));
});

test("flags do follow-up são dinâmicos e o fornecedor acompanha os outros filtros", () => {
  const data = [
    { branch: "704", supplier: "Fornecedor A", requester: "João", deliveryStatus: DELIVERY_TOTAL, days: 4, item: "100" },
    { branch: "704", supplier: "Fornecedor B", requester: "João", deliveryStatus: DELIVERY_PARTIAL, days: 40, item: "200" },
    { branch: "705", supplier: "Fornecedor C", requester: "Maria", deliveryStatus: DELIVERY_TOTAL, days: 8, item: "300" },
  ];
  const selected = {
    branch: new Set(["704"]), supplier: new Set(), delivery: new Set(), requester: new Set(), age: new Set(),
  };
  assert.deepEqual(availableFollowUpValues(data, selected, "supplier"), ["Fornecedor A", "Fornecedor B"]);
  selected.delivery.add(DELIVERY_TOTAL);
  assert.deepEqual(availableFollowUpValues(data, selected, "supplier"), ["Fornecedor A"]);
  selected.supplier.add("Fornecedor A");
  assert.deepEqual(availableFollowUpValues(data, selected, "supplier"), ["Fornecedor A"]);
  assert.deepEqual(availableFollowUpValues(data, selected, "branch"), ["704"]);
  assert.deepEqual(filterFollowUpRows(data, selected).map((row) => row.item), ["100"]);
  assert.deepEqual(availableFollowUpValues(data, selected, "supplier", "200"), []);
  assert.deepEqual(availableFollowUpValues(data, selected, "supplier", "", (row) => row.branch !== "704"), []);
  selected.delivery.clear();
  selected.branch.clear();
  selected.supplier.clear();
  assert.deepEqual(availableFollowUpValues(data, selected, "supplier", "200"), ["Fornecedor B"]);
  assert.deepEqual(availableFollowUpValues(data, selected, "supplier", "", (row) => row.branch === "705"), ["Fornecedor C"]);
});

test("índice rápido de Instruções não redireciona para Dashboard", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
  const anchors = [...html.matchAll(/<a href="#(instr-[a-z0-9-]+)">/g)].map((match) => match[1]);
  assert.equal(anchors.length, 13, "as 13 entradas do índice precisam estar presentes");
  for (const anchor of anchors) {
    assert.match(html, new RegExp('id="' + anchor + '"'), "destino inexistente: " + anchor);
    assert.equal(pageForHash("#" + anchor), "instrucoes", "aba incorreta para " + anchor);
  }
  assert.equal(pageForHash("#instrucoes"), "instrucoes");
  assert.equal(pageForHash("#dashboard"), "dashboard");
  assert.equal(pageForHash("#follow-up"), "follow-up");
  assert.equal(pageForHash("#codigo-desconhecido"), "dashboard");
});
