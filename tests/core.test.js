"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  numericMedian,
  ofGenerationBucketFor,
  generationDaysBetween,
  isWarehouseSc,
  isClosedOf,
} = require("../app/core/catalog-app.js");
const {
  DELIVERY_TOTAL,
  DELIVERY_PARTIAL,
  isFollowUpRecord,
  followUpDeliveryState,
  buildFollowUpRows,
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
  assert.equal(report.headers.length, 16);
  assert.equal(report.rows[0][7], "200");
  assert.equal(report.rows[0][2], "01/09/2026");
  assert.equal(report.rows[0][10], "09/10/2026");
  assert.equal(report.rows[1][10], "05/11/2026");
  assert.equal(report.rows[0][14], 7);
  assert.equal(report.rows[0][15], 84);
  assert.deepEqual([...report.dateColumns], [2, 10]);
  assert.deepEqual([...report.currencyColumns], [15]);
  assert.match(report.filterSummary, /Filial A/);
  assert.equal(buildFollowUpExportReport([]).rows.length, 0);
});
