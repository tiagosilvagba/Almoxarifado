"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  alexsandroPurchaseCriterion,
  isPurchaseNeedEligiblePosition,
  isActionableOrAlexsandroNeed,
  purchaseNeedPriorityLabel,
  purchaseNeedCriterionLabel,
  summarizePurchaseNeedStockRisk,
  buildPurchaseNeedsExportReport,
} = require("../app/core/catalog-app.js");

const RESPONSIBLE = "ALEXSANDRO ARAUJO CAZUZA";
function position(quantity, minimum = 15, maximum = 40, responsables = [RESPONSIBLE]) {
  return {
    branchCode: "704", branchName: "ROLANDIA - AB.AVES", localCode: "299",
    localName: "Peças", locationKey: "704::299",
    quantity, minimum, maximum,
    replenishmentResponsibles: responsables,
    shelf: "A0", division: "01", unitCost: 10, stockValue: quantity * 10,
  };
}
function need(p, netSuggested, criterion) {
  return {
    item: { code: "407919", name: "Correia", detailedName: "Correia industrial", categories: [], units: [], suppliers: [], history: [] },
    position: p, target: p.maximum, suggested: Math.max(p.maximum-p.quantity,0),
    openOfBalance: p.maximum-p.quantity-netSuggested, pendingScQuantity: 0,
    coveredQuantity: p.maximum-p.quantity-netSuggested, coverageSource: "OF", ofCodes: ["OF100"], scCodes: [],
    netSuggested, referencePrice: 10, estimatedValue: netSuggested*10,
    averageMonthlyConsumption: 5, rupture: p.quantity<=0, alexsandroCriterion: criterion,
  };
}

test("Alexsandro: ruptura <=0, risco positivo abaixo do mínimo e analisar de mínimo a máximo", () => {
  assert.equal(alexsandroPurchaseCriterion(position(-1)), "Ruptura");
  assert.equal(alexsandroPurchaseCriterion(position(0)), "Ruptura");
  assert.equal(alexsandroPurchaseCriterion(position(1)), "Risco de ruptura");
  assert.equal(alexsandroPurchaseCriterion(position(14)), "Risco de ruptura");
  assert.equal(alexsandroPurchaseCriterion(position(15)), "Analisar");
  assert.equal(alexsandroPurchaseCriterion(position(16)), "Analisar");
  assert.equal(alexsandroPurchaseCriterion(position(39)), "Analisar");
  assert.equal(alexsandroPurchaseCriterion(position(40)), "");
  assert.equal(alexsandroPurchaseCriterion(position(41)), "");
  assert.equal(alexsandroPurchaseCriterion(position(7, 0, 40)), "Analisar");
  assert.equal(alexsandroPurchaseCriterion(position(-1, 0, 40)), "Ruptura");
  assert.equal(alexsandroPurchaseCriterion(position(10, 15, 0)), "");
  assert.equal(alexsandroPurchaseCriterion(position(10, 15, null)), "");
});

test("A classificação especial vale apenas para o responsável do local", () => {
  assert.equal(alexsandroPurchaseCriterion(position(20,15,40,["Cristiane"])), "");
  assert.equal(alexsandroPurchaseCriterion(position(20,15,40,[])), "");
  assert.equal(alexsandroPurchaseCriterion(position(20,15,40,["João","ALEXSANDRO ARAUJO CAZUZA"])), "Analisar");
  assert.equal(alexsandroPurchaseCriterion(position(20,15,40,["ALEXANDRE"])), "");
  assert.equal(alexsandroPurchaseCriterion(position(10,15,40,["alexsandro araújo cazuza"])), "Risco de ruptura");
});

test("Alexsandro: manter abaixo do máximo, inclusive compra coberta, sem mudar os outros", () => {
  const analyze = position(25);
  const risk = position(10);
  const others = position(25,15,40,["Cristiane"]);
  assert.equal(isPurchaseNeedEligiblePosition(analyze,false), true);
  assert.equal(isPurchaseNeedEligiblePosition(risk,false), true);
  assert.equal(isPurchaseNeedEligiblePosition(others,false), false);
  assert.equal(isPurchaseNeedEligiblePosition(others,true), true);
  assert.equal(isActionableOrAlexsandroNeed(need(analyze,0,"Analisar")),true);
  assert.equal(isActionableOrAlexsandroNeed(need(risk,0,"Risco de ruptura")),true);
  assert.equal(isActionableOrAlexsandroNeed(need(others,0,"")),false);
  assert.equal(isActionableOrAlexsandroNeed(need(others,10,"")),true);
});

test("Cards, detalhes e Excel mostram as três faixas sem duplicar compras cobertas", () => {
  const rupture = need(position(0),40,"Ruptura");
  const risk = need(position(10),30,"Risco de ruptura");
  const analyze = need(position(20),0,"Analisar");
  const normal = need(position(10,15,40,["Cristiane"]),30,"");
  assert.equal(purchaseNeedPriorityLabel(rupture),"Ruptura");
  assert.equal(purchaseNeedPriorityLabel(risk),"Risco de ruptura");
  assert.equal(purchaseNeedPriorityLabel(analyze),"Analisar");
  assert.equal(purchaseNeedPriorityLabel(normal),"Risco de ruptura");
  assert.match(purchaseNeedCriterionLabel(rupture), /saldo zerado ou negativo/);
  assert.match(purchaseNeedCriterionLabel(risk), /saldo positivo abaixo do mínimo/);
  assert.match(purchaseNeedCriterionLabel(analyze), /saldo no mínimo ou acima dele/);
  assert.equal(purchaseNeedCriterionLabel(normal),"Reposição até o máximo");
  const report=buildPurchaseNeedsExportReport([rupture,risk,analyze,normal],new Date(2026,9,13),[]);
  const col=(name)=>report.headers.indexOf(name);
  assert.equal(report.rows.length,4);
  assert.equal(report.rows[0][col("Prioridade")],"Ruptura");
  assert.equal(report.rows[1][col("Prioridade")],"Risco de ruptura");
  assert.equal(report.rows[2][col("Prioridade")],"Analisar");
  assert.equal(report.rows[2][col("Compra líquida")],0);
  assert.equal(report.rows[2][col("Valor estimado da compra")],0);
  assert.match(report.rows[2][col("Critério")],/Analisar/);
  assert.equal(report.rows[3][col("Prioridade")],"Risco de ruptura");
});

test("Resumo apresenta rupturas, risco e análise com intervalos disjuntos", () => {
  const row = (quantity, minimum, maximum, extra = {}) => ({
    position: { quantity, minimum, maximum },
    ...extra,
  });
  const visible = [
    row(-3, 10, 40),
    row(0, 10, 40),
    row(4, 10, 40),
    row(9, 10, 40),
    row(10, 10, 40),
    row(11, 10, 40),
    row(39, 10, 40),
    row(40, 10, 40),
    row(50, 10, 40),
    row(12, 10, 40, { cavacoAlert: true }),
    row(20, 10, 0),
  ];
  assert.deepEqual(summarizePurchaseNeedStockRisk(visible), { ruptures: 2, risk: 2, analyze: 3 });
  assert.deepEqual(summarizePurchaseNeedStockRisk([row(15, 10, 20)]), { ruptures: 0, risk: 0, analyze: 1 });
  assert.deepEqual(summarizePurchaseNeedStockRisk([row(10, 10, 10)]), { ruptures: 0, risk: 0, analyze: 0 });
  assert.deepEqual(summarizePurchaseNeedStockRisk([row(1, 10, 0)]), { ruptures: 0, risk: 1, analyze: 0 });
  assert.deepEqual(summarizePurchaseNeedStockRisk([]), { ruptures: 0, risk: 0, analyze: 0 });
});

test("Mobile: os três KPIs são renderizados primeiro com grade responsiva de duas colunas", () => {
  const html=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");
  const css=fs.readFileSync(path.join(__dirname,"../app/styles/app.css"),"utf8");
  for(const id of ["purchaseNeedRuptures","purchaseNeedRisk","purchaseNeedAnalyze"]){
    assert.match(html, new RegExp('id="'+id+'"'));
  }
  assert.ok(html.indexOf('id="purchaseNeedRuptures"') < html.indexOf('id="purchaseNeedItems"'));
  assert.ok(html.indexOf('id="purchaseNeedRisk"') < html.indexOf('id="purchaseNeedItems"'));
  assert.ok(html.indexOf('id="purchaseNeedAnalyze"') < html.indexOf('id="purchaseNeedItems"'));
  assert.match(css, /#page-necessidade-compra \.need-summary--replenishment/);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important/);
});
