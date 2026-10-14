"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildRepeatedPurchasesByMonth, getItemPurchaseCommitments, pageForHash } = require("../app/core/catalog-app.js");
const {
  monthForOrder, analyzeWarehouseIntelligence, buildIntelligenceExport, planForFinding,
} = require("../app/modules/inteligencia-almoxarifado.js");

const helpers = { buildRepeatedPurchasesByMonth, getItemPurchaseCommitments };
const position = (quantity = 0, maximum = 40, minimum = 10, localCode = "299", branchCode = "704") => ({
  quantity, maximum, minimum, localCode, branchCode,
  unitCost: 5, replenishmentResponsibles: ["Alexsandro"],
  partition: "AP",
});
function item(code = "407919", positions = [position()], history = []) {
  return { code, name: "Peça de manutenção", flags: {}, positions, history };
}
function record(ofCode, date, quantity = 10, balance = 0, cc = "1500", filial = "704") {
  return {
    branchCode: filial,
    sc: { code: "SC" + ofCode, status: "Compra confirmada", allocationCostCenter: cc,
      destinationBranch: filial, quantity, sequence: "1" },
    of: { code: ofCode, date, status: "Emitida", closed: "N", deliveryBranchCode: filial,
      requestedQuantity: quantity, unitValue: 5, balance },
  };
}
function analyze(items, options = {}) {
  return analyzeWarehouseIntelligence(items, helpers, options);
}

test("converte competência apenas para datas OF válidas", () => {
  assert.equal(monthForOrder("14/10/2026"), "2026-10");
  assert.equal(monthForOrder("2026-10-14"), "2026-10");
  assert.equal(monthForOrder("31/02/2026"), "");
  assert.equal(monthForOrder(""), "");
});

test("OFs realmente distintas no mês geram uma anomalia; recebimentos duplicados não", () => {
  const input = item("243370", [position(20, 40)], [
    record("OF1", "02/10/2026", 7), record("OF1", "02/10/2026", 7),
    record("OF2", "12/10/2026", 9), record("OF3", "05/09/2026", 3),
  ]);
  const { findings, summary } = analyze([input]);
  assert.equal(summary.repeated, 1);
  const repeat = findings.find((row) => row.type === "repeat");
  assert.equal(repeat.month, "2026-10");
  assert.equal(repeat.count, 2);
  assert.deepEqual(repeat.ofCodes, ["OF2","OF1"]);
  assert.equal(repeat.quantity, 16);
  assert.equal(repeat.estimatedImpact, 80);
});

test("zero com parâmetros e sem SC/OF válida fica crítico; CCU diferente não cobre", () => {
  const zero = item("101", [position(0)], [record("OFG1", "10/10/2026", 2, 15, "2000")]);
  const negative = item("102", [position(-3, 20, 5, "5")]);
  const result = analyze([zero, negative]);
  assert.equal(result.summary.zero, 2);
  assert.equal(result.summary.critical, 2);
  for (const issue of result.findings.filter((f) => f.type === "zero")) {
    assert.match(issue.evidence, /CCU 1500/);
    assert.equal(issue.plan.when.includes("hoje"), true);
  }
});

test("cobertura por OF aberta ou SC ativa CCU 1500 impede falso zerado", () => {
  const withOf = item("201", [position(0)], [record("OF1","14/10/2026",10,10)]);
  const withSc = item("202", [position(0)], [{
    sc: { code:"SC202", status:"Aguardando aprovação", cancelled:"N",
      allocationCostCenter:"1500", destinationBranch:"704", quantity:20, sequence:"1" },
  }]);
  const { findings } = analyze([withOf, withSc]);
  assert.equal(findings.some((r) => r.type === "zero"), false);
});

test("projeção de compra bem acima do máximo gera alerta, sem repetir OFs por NF", () => {
  const src = item("301", [position(20, 30, 10)], [
    record("OF900", "14/10/2026", 8, 25),
    record("OF900", "14/10/2026", 8, 25),
  ]);
  const { findings } = analyze([src]);
  const issue = findings.find((x) => x.type === "excess");
  assert.ok(issue);
  assert.equal(issue.referenceMaximum, 30);
  assert.equal(issue.quantity, 15); // 20 + 25 - 30
  assert.equal(issue.estimatedImpact, 75);
  assert.equal(findings.some((r) => r.type === "repeat"), false);
});

test("OF única muito acima do máximo no mês mais recente é auditada mesmo já recebida", () => {
  const src = item("302", [position(10, 30, 10)], [
    record("OF300", "14/10/2026", 50, 0),
  ]);
  const findings = analyze([src]).findings;
  assert.equal(findings.length, 1);
  assert.equal(findings[0].type, "excess");
  assert.match(findings[0].evidence, /2026-10/);
});

test("falta de máximo não é tratada como excesso, e filial diferente não se mistura", () => {
  const itemWithoutMax = item("401", [position(2,0,0)], [record("OF1","14/10/2026",200,50)]);
  const anotherBranch = item("402", [position(25,30)], [record("OF2","14/10/2026",100,90,"1500","705")]);
  const findings = analyze([itemWithoutMax,anotherBranch]).findings;
  assert.equal(findings.some((r) => r.type === "excess"), false);
});

test("cada anomalia possui 7 campos 5W2H e exportação fiel", () => {
  const inputs = [
    item("501",[position(0)]),
    item("502",[position(15,20)],[record("OF1","10/10/2026",5),record("OF2","13/10/2026",5)]),
    item("503",[position(10,20)],[record("OF3","14/10/2026",40)]),
  ];
  const output = analyze(inputs);
  for(const issue of output.findings) {
    const plan = planForFinding(issue);
    assert.deepEqual(Object.keys(plan), ["what","why","where","when","who","how","howMuch"]);
    assert.equal(Object.values(plan).every((x) => typeof x === "string" && x.length), true);
  }
  const xls=buildIntelligenceExport(output.findings);
  assert.equal(xls.rows.length, output.findings.length);
  assert.equal(xls.headers.includes("5W2H - Como"), true);
  assert.equal(xls.headers.includes("5W2H - Quanto"), true);
  assert.ok(xls.currencyColumns.has(10));
});

test("nova aba está integrada ao bootstrap e aos estados de navegação", () => {
  const html = fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");
  const script = fs.readFileSync(path.join(__dirname,"../script.js"),"utf8");
  assert.ok(html.includes('id="page-inteligencia-almoxarifado"'));
  assert.ok(html.includes('id="wiExport"'));
  assert.ok(html.includes('id="wiResults"'));
  assert.match(script, /MODULES\.intelligence/);
  assert.equal(pageForHash("#inteligencia-almoxarifado"), "inteligencia-almoxarifado");
});
