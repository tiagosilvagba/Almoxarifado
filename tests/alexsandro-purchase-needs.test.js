"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  alexsandroPurchaseCriterion,
  isPurchaseNeedEligiblePosition,
  isActionableOrAlexsandroNeed,
  purchaseNeedPriorityLabel,
  purchaseNeedCriterionLabel,
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

test("Alexsandro: crítico abaixo do mínimo, risco no mínimo ou acima, só abaixo do máximo", () => {
  assert.equal(alexsandroPurchaseCriterion(position(0)), "Crítico");
  assert.equal(alexsandroPurchaseCriterion(position(14)), "Crítico");
  assert.equal(alexsandroPurchaseCriterion(position(15)), "Risco de ruptura");
  assert.equal(alexsandroPurchaseCriterion(position(16)), "Risco de ruptura");
  assert.equal(alexsandroPurchaseCriterion(position(39)), "Risco de ruptura");
  assert.equal(alexsandroPurchaseCriterion(position(40)), "");
  assert.equal(alexsandroPurchaseCriterion(position(41)), "");
  assert.equal(alexsandroPurchaseCriterion(position(7, 0, 40)), "Risco de ruptura");
  assert.equal(alexsandroPurchaseCriterion(position(-1, 0, 40)), "Crítico");
  assert.equal(alexsandroPurchaseCriterion(position(10, 15, 0)), "");
  assert.equal(alexsandroPurchaseCriterion(position(10, 15, null)), "");
});

test("Escopo por responsável real do local; não afeta outras posições nem toda a filial 704", () => {
  assert.equal(alexsandroPurchaseCriterion(position(20,15,40,["Cristiane"])), "");
  assert.equal(alexsandroPurchaseCriterion(position(20,15,40,[])), "");
  assert.equal(alexsandroPurchaseCriterion(position(20,15,40,["João","ALEXSANDRO ARAUJO CAZUZA"])), "Risco de ruptura");
  assert.equal(alexsandroPurchaseCriterion(position(20,15,40,["ALEXANDRE"])), "");
  assert.equal(alexsandroPurchaseCriterion(position(20,15,40,["alexsandro araújo cazuza"])), "Risco de ruptura");
});

test("Todos os itens de Alexsandro abaixo do máximo entram no acompanhamento, mesmo cobertos por OF/SC", () => {
  const alertRisk = position(25);
  const critical = position(10);
  const others = position(25,15,40,["Cristiane"]);
  assert.equal(isPurchaseNeedEligiblePosition(alertRisk,false), true);
  assert.equal(isPurchaseNeedEligiblePosition(critical,false), true);
  assert.equal(isPurchaseNeedEligiblePosition(others,false), false);
  assert.equal(isPurchaseNeedEligiblePosition(others,true), true);
  assert.equal(isActionableOrAlexsandroNeed(need(alertRisk,0,"Risco de ruptura")),true);
  assert.equal(isActionableOrAlexsandroNeed(need(critical,0,"Crítico")),true);
  assert.equal(isActionableOrAlexsandroNeed(need(others,0,"")),false);
  assert.equal(isActionableOrAlexsandroNeed(need(others,10,"")),true);
});

test("Card, modal e exportação mantêm classificação, sem aumentar compra líquida de item já coberto", () => {
  const risk = need(position(20),0,"Risco de ruptura");
  const critical = need(position(10),30,"Crítico");
  const normal = need(position(10,15,40,["Cristiane"]),30,"");
  assert.equal(purchaseNeedPriorityLabel(risk),"Risco de ruptura");
  assert.equal(purchaseNeedPriorityLabel(critical),"Crítico");
  assert.equal(purchaseNeedPriorityLabel(normal),"Abaixo do mínimo com saldo");
  assert.match(purchaseNeedCriterionLabel(risk), /saldo entre mínimo e máximo/);
  assert.match(purchaseNeedCriterionLabel(critical), /saldo abaixo do mínimo/);
  assert.equal(purchaseNeedCriterionLabel(normal),"Reposição até o máximo");
  const report=buildPurchaseNeedsExportReport([risk,critical,normal],new Date(2026,9,13),[]);
  const col=(name)=>report.headers.indexOf(name);
  assert.equal(report.rows.length,3);
  assert.equal(report.rows[0][col("Prioridade")],"Risco de ruptura");
  assert.equal(report.rows[0][col("Compra líquida")],0);
  assert.equal(report.rows[0][col("Valor estimado da compra")],0);
  assert.match(report.rows[0][col("Critério")],/Risco de ruptura/);
  assert.equal(report.rows[1][col("Prioridade")],"Crítico");
  assert.equal(report.rows[1][col("Compra líquida")],30);
  assert.equal(report.rows[2][col("Prioridade")],"Abaixo do mínimo com saldo");
});
