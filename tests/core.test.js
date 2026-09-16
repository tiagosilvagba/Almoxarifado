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
