"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  purchaseNeedLeadTimeInfo,
  suggestedPurchaseDeliveryDate,
  buildPurchaseNeedsExportReport,
} = require("../app/core/catalog-app.js");

function exampleNeed() {
  const item = {
    code: "243370", name: "Rolamento", detailedName: "Rolamento principal",
    categories: [], units: ["UN"], suppliers: [], history: [],
  };
  return {
    item,
    position: {
      branchCode: "704", branchName: "ROLANDIA - ALM. PREPARADOS",
      localCode: "299", localType: "E", localName: "Estoque",
      quantity: 3, minimum: 15, maximum: 40,
      shelf: "A0", division: "01", forecast: 0, unitCost: 30, stockValue: 90,
      replenishmentResponsibles: ["Repositor"],
    },
    target: 40, suggested: 37, openOfBalance: 10, pendingScQuantity: 0,
    coveredQuantity: 10, coverageSource: "OF", ofCodes: ["987"], scCodes: [],
    netSuggested: 27, referencePrice: 30, estimatedValue: 810,
    averageMonthlyConsumption: 7, rupture: false,
  };
}

test("entrega sugerida soma dias corridos sobre o dia local da geração", () => {
  const emitted = new Date(2026, 9, 13, 23, 48);
  assert.equal(suggestedPurchaseDeliveryDate(emitted, 0), "13/10/2026");
  assert.equal(suggestedPurchaseDeliveryDate(emitted, 20), "02/11/2026");
  assert.equal(suggestedPurchaseDeliveryDate(emitted, 20.5), "03/11/2026");
  assert.equal(suggestedPurchaseDeliveryDate(new Date(2026, 11, 31), 2), "02/01/2027");
  assert.equal(suggestedPurchaseDeliveryDate(new Date(2028, 1, 28), 1), "29/02/2028");
  assert.equal(suggestedPurchaseDeliveryDate(new Date(2026, 9, 13), null), "");
  assert.equal(suggestedPurchaseDeliveryDate(new Date(2026, 9, 13), -1), "");
  assert.equal(suggestedPurchaseDeliveryDate(new Date(2026, 9, 13), NaN), "");
});

test("lead time da necessidade prioriza histórico real e não mistura filial/local", () => {
  const need = exampleNeed();
  const reviews = [
    { item: need.item, position: need.position, leadTimeSource: "real", leadTimeDays: 15 },
    { item: need.item, position: need.position, leadTimeSource: "real", leadTimeDays: 25 },
    { item: need.item, position: need.position, leadTimeSource: "estimated", leadTimeDays: 30 },
    { item: need.item, position: { branchCode: "705", localCode: "299" }, leadTimeSource: "real", leadTimeDays: 90 },
  ];
  const lead = purchaseNeedLeadTimeInfo(need, reviews);
  assert.equal(lead.days, 20);
  assert.equal(lead.source, "Histórico real");
  assert.equal(purchaseNeedLeadTimeInfo(need, []).days, null);
  const estimated = purchaseNeedLeadTimeInfo(need, [{ item: need.item, position: need.position, leadTimeSource: "estimated", leadTimeDays: 30 }]);
  assert.equal(estimated.days, 30);
  assert.equal(estimated.source, "Referência estimada");
});

test("Excel tem data-base e entrega sugerida por item com células reais de data", () => {
  const need = exampleNeed();
  const base = new Date(2026, 9, 13, 16, 30);
  const reviews = [{ item: need.item, position: need.position, leadTimeSource: "real", leadTimeDays: 20 }];
  const report = buildPurchaseNeedsExportReport([need], base, reviews);
  assert.equal(report.filename, "necessidade-de-compra.xls");
  assert.equal(report.generatedAt, base);
  assert.equal(report.headers.length, report.rows[0].length);
  const col = (name) => report.headers.indexOf(name);
  assert.equal(report.rows[0][col("Data do relatório")], "13/10/2026");
  assert.equal(report.rows[0][col("Lead Time Total (dias)")], 20);
  assert.equal(report.rows[0][col("Origem Lead Time")], "Histórico real");
  assert.equal(report.rows[0][col("Data sugerida de entrega")], "02/11/2026");
  assert.ok(report.dateColumns.has(col("Data do relatório")));
  assert.ok(report.dateColumns.has(col("Data sugerida de entrega")));
  assert.ok(report.numericColumns.has(col("Lead Time Total (dias)")));
  assert.equal(report.rows[0][col("Compra líquida")], 27);
  assert.equal(report.rows[0][col("Valor estimado da compra")], 810);
  assert.ok(report.currencyColumns.has(col("Valor estimado da compra")));
  assert.match(report.filterSummary, /dias corridos/);

  const nextDay = buildPurchaseNeedsExportReport([need], new Date(2026, 9, 14, 8), reviews);
  assert.equal(nextDay.rows[0][col("Data do relatório")], "14/10/2026");
  assert.equal(nextDay.rows[0][col("Data sugerida de entrega")], "03/11/2026");
});

test("sem histórico ou referência não apresenta previsão fictícia", () => {
  const need = exampleNeed();
  const report = buildPurchaseNeedsExportReport([need], new Date(2026, 9, 13), []);
  const days = report.headers.indexOf("Lead Time Total (dias)");
  const due = report.headers.indexOf("Data sugerida de entrega");
  assert.equal(report.rows[0][days], "");
  assert.equal(report.rows[0][due], "");
  assert.equal(report.rows[0][report.headers.indexOf("Origem Lead Time")], "Sem histórico");
  const empty = buildPurchaseNeedsExportReport([], new Date(2026, 9, 13), []);
  assert.equal(empty.rows.length, 0);
  assert.equal(empty.headers.length, report.headers.length);
});
