"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildRepeatedPurchasesByMonth, getItemPurchaseCommitments, pageForHash } = require("../app/core/catalog-app.js");
const {
  monthForOrder, stockArea, analyzeMinMaxObsolescence, analyzeWarehouseIntelligence, analyzeWarehouseIntelligenceInBatches, buildIntelligenceExport, planForFinding,
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

test("projeção de zerar em menos de 30 dias sem cobertura é alta, não ruptura já ocorrida", () => {
  const input = item("760", [position(5, 40, 10, "299")]);
  const consumption = { records: [{
    code: "760", branchCode: "704", localCode: "299",
    monthlyTotals: { "08/2026": 20, "09/2026": 22, "10/2026": 19 },
  }] };
  const result = analyzeWarehouseIntelligence([input], helpers, { consumption });
  const finding = result.findings.find((f) => f.type === "zero");
  assert.ok(finding);
  assert.equal(finding.projected, true);
  assert.equal(finding.severity, "alta");
  assert.ok(finding.coverageDays > 0 && finding.coverageDays < 30);
  assert.match(finding.plan.what, /Antecipar reposição/);
  const covered = item("760",[position(5, 40, 10, "299")], [record("OFNEW","14/10/2026",10,10)]);
  assert.equal(analyzeWarehouseIntelligence([covered], helpers, { consumption }).findings.some((f)=>f.type==="zero"), false);
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

test("análise em lotes produz os mesmos achados da análise original e cede controle ao navegador", async () => {
  const inputs = Array.from({ length: 137 }, (_, index) => {
    const code = String(10000 + index);
    if (index % 4 === 0) return item(code, [position(0)]);
    if (index % 4 === 1) return item(code, [position(20, 30)], [
      record("OF" + code + "1", "01/10/2026", 10),
      record("OF" + code + "2", "10/10/2026", 12),
    ]);
    if (index % 4 === 2) return item(code, [position(10, 20)], [
      record("OF" + code, "12/10/2026", 50),
    ]);
    return item(code, [position(35, 40)]);
  });
  const direct = analyzeWarehouseIntelligence(inputs, helpers);
  let yielded = 0;
  const progress = [];
  const batched = await analyzeWarehouseIntelligenceInBatches(inputs, helpers, {}, {
    batchSize: 25,
    yieldStep: async () => { yielded += 1; },
    progress: (done, total) => progress.push([done, total]),
  });
  assert.deepEqual(batched, direct);
  assert.equal(yielded, 5);
  assert.deepEqual(progress.at(-1), [137, 137]);
  assert.equal(progress[0][0], 25);
});

test("navegação pode cancelar análise parcial sem entregar resultados incompletos", async () => {
  const inputs = Array.from({ length: 65 }, (_, i) => item(String(i + 5000), [position(0)]));
  let scanned = 0;
  const result = await analyzeWarehouseIntelligenceInBatches(inputs, helpers, {}, {
    batchSize: 25,
    progress: (done) => { scanned = done; },
    cancelled: () => scanned >= 25,
    yieldStep: async () => {},
  });
  assert.equal(result, null);
  assert.equal(scanned, 25);
});

test("aba Inteligência tem ícone no mobile e não recria lista de itens para cada anomalia", () => {
  const core = fs.readFileSync(path.join(__dirname, "../app/modules/inteligencia-almoxarifado.js"), "utf8");
  const features = fs.readFileSync(path.join(__dirname, "../app/layers/features.js"), "utf8");
  assert.match(features, /"inteligencia-almoxarifado": '<svg/);
  assert.match(core, /visibleFilter\(f, context\)/);
  assert.match(core, /itemCodes: new Set\(\(st\?\.filteredItems/);
  assert.match(core, /analyzeWarehouseIntelligenceInBatches\(sourceItems/);
});

test("local >599 na filial 704, inclusive 0600, é classificado como Alm. Preparados", () => {
  assert.equal(stockArea({branchCode: "704", localCode: "600", branchName: "ROLANDIA - AB.AVES"}), "ROLANDIA - ALM. PREPARADOS");
  assert.equal(stockArea({branchCode: "0704", localCode: "0600", branchName: "ROLANDIA - AB.AVES"}), "ROLANDIA - ALM. PREPARADOS");
  assert.equal(stockArea({branchCode: "704", localCode: "599", branchName: "ROLANDIA - AB.AVES"}), "ROLANDIA - AB.AVES");
  assert.equal(stockArea({branchCode: "705", localCode: "600", branchName: "Outra filial"}), "Outra filial");
});

test("mínimo/máximo obsoletos: detecta divergência histórica, demonstra proposta e 5W2H", () => {
  const src = item("407919", [position(100, 200, 90, "600")]);
  const consumption = { records: [{
    code: "407919", branchCode: "704", localCode: "600",
    monthlyTotals: { "07/2026": 10, "08/2026": 12, "09/2026": 11, "10/2026": 10 },
  }] };
  const output = analyzeWarehouseIntelligence([src], helpers, { consumption });
  const issue = output.findings.find((f) => f.type === "parameter");
  assert.ok(issue);
  assert.equal(output.summary.parameter, 1);
  assert.equal(issue.stockArea, "ROLANDIA - ALM. PREPARADOS");
  assert.equal(issue.currentMinimum, 90);
  assert.equal(issue.currentMaximum, 200);
  assert.ok(issue.suggestedMinimum < issue.currentMinimum);
  assert.ok(issue.suggestedMaximum < issue.currentMaximum);
  assert.equal(issue.leadTimeSource, "estimated");
  assert.equal(issue.consideredMonthCount, 4);
  assert.match(issue.plan.how, /aprovação/);
  assert.match(issue.plan.how, /mín/);
  const report = buildIntelligenceExport(output.findings);
  assert.ok(report.headers.includes("Mínimo referência"));
  assert.ok(report.headers.includes("Máximo referência"));
  assert.ok(report.numericColumns.has(report.headers.indexOf("Consumo médio/mês")));
  assert.equal(report.rows[0][report.headers.indexOf("Área de estoque")], "ROLANDIA - ALM. PREPARADOS");
});

test("mínimo/máximo: histórico insuficiente não gera falso alerta, e limite baixo pode ser crítico", () => {
  const low = item("123", [position(5, 10, 2, "7")]);
  const missing = analyzeWarehouseIntelligence([low], helpers, { consumption: { records: [{
    code: "123", branchCode: "704", localCode: "7",
    monthlyTotals: { "08/2026": 50, "09/2026": 60 },
  }] } });
  assert.equal(missing.summary.parameter, 0);
  const enough = analyzeWarehouseIntelligence([low], helpers, { consumption: { records: [{
    code: "123", branchCode: "704", localCode: "7",
    monthlyTotals: { "07/2026": 50, "08/2026": 60, "09/2026": 55 },
  }] } });
  const anomaly = enough.findings.find((f) => f.type === "parameter");
  assert.ok(anomaly);
  assert.equal(anomaly.severity, "alta");
  assert.ok(anomaly.suggestedMinimum > 2);
  assert.ok(anomaly.suggestedMaximum > 10);
});

test("mínimo/máximo: lead time real altera referência, sem alterar cadastro", () => {
  const src = item("345", [position(20, 30, 10, "600")]);
  const pos = src.positions[0];
  const monthly = { monthlyTotals: { "07/2026": 30, "08/2026": 30, "09/2026": 30 } };
  const estimated = analyzeMinMaxObsolescence(src, pos, monthly, null, {});
  const real = analyzeMinMaxObsolescence(src, pos, monthly, {leadTimeSource:"real",leadTimeDays:60}, {});
  assert.ok(real);
  assert.ok(estimated);
  assert.ok(real.suggestedMinimum > estimated.suggestedMinimum);
  assert.equal(real.leadTimeSource, "real");
  assert.equal(pos.minimum, 10);
  assert.equal(pos.maximum, 30);
  const noConsumption = analyzeMinMaxObsolescence(src, pos, {monthlyTotals: {}}, null, {});
  assert.equal(noConsumption, null);
});

test("aba inteligência oferece filtro de parâmetros obsoletos, ícone e módulo versionado", () => {
  const html = fs.readFileSync(path.join(__dirname, "../index.html"),"utf8");
  const script = fs.readFileSync(path.join(__dirname, "../script.js"),"utf8");
  const features = fs.readFileSync(path.join(__dirname, "../app/layers/features.js"),"utf8");
  assert.match(html, /value="parameter">Mínimo\/máximo/);
  assert.match(features, /"inteligencia-almoxarifado": '<svg/);
  assert.match(script, /inteligencia-almoxarifado\.js\?v=10\.7\./);
});
