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
