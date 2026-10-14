"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  buildRepeatedPurchasesByMonth,
  buildRepeatedPurchasesExportReport,
  formatRepeatedPurchaseMonth,
} = require("../app/core/catalog-app.js");

function order(code, date, branch = "704", extra = {}) {
  return {
    sc: {
      code: extra.sc || "SC" + code,
      cancelled: extra.cancelled ? "S" : "N",
      status: "Compra confirmada",
      allocationCostCenter: "1500",
    },
    of: {
      code, date, deliveryBranchCode: branch, supplier: extra.supplier || "Fornecedor A",
      status: extra.status || "Aberta", requestedQuantity: extra.quantity ?? 10,
      unitValue: extra.unitValue ?? 5,
    },
    rec: { invoice: extra.invoice || "" },
    branchCode: branch,
  };
}
function item(code, history) {
  return { code, name: "Rolamento " + code, detailedName: "Rolamento industrial",
    positions: [{ branchCode: "704", localCode: "299", quantity: 5 }], history };
}

test("mesma OF repetida em recebimentos distintos conta como uma única compra", () => {
  const rows = buildRepeatedPurchasesByMonth([item("243.370", [
    order("OF100", "02/10/2026", "704", { invoice: "NF1", quantity: 20 }),
    order("OF100", "02/10/2026", "704", { invoice: "NF2", quantity: 20 }),
    order("OF101", "2026-10-10", "704", { invoice: "NF3", quantity: 3 }),
  ])]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].code, "243370");
  assert.equal(rows[0].month, "2026-10");
  assert.equal(rows[0].orders.length, 2);
  assert.deepEqual(rows[0].orders.map((x)=>x.code), ["OF101","OF100"]);
  assert.equal(rows[0].totalQuantity, 23);
  assert.equal(rows[0].knownAmount, 115);
  assert.equal(formatRepeatedPurchaseMonth("2026-10"), "10/2026");
});

test("separa compras por item, mês e filial e exclui OFs canceladas ou sem data", () => {
  const history = [
    order("OF1", "11/09/2026"),
    order("OF2", "12/09/2026"),
    order("OF3", "14/10/2026"),
    order("OF4", "18/10/2026"),
    order("OF5", "19/10/2026", "705"),
    order("OF6", "20/10/2026", "705"),
    order("OF7", "21/10/2026", "704", { cancelled: true }),
    order("OF8", "22/10/2026", "704", { status: "Cancelada" }),
    order("OF9", "", "704"),
  ];
  const groups = buildRepeatedPurchasesByMonth([item("111", history), item("222", [
    order("OF15", "14/10/2026")
  ])]);
  assert.equal(groups.length, 3);
  assert.deepEqual(groups.map((g)=>[g.code,g.branchCode,g.month,g.orders.length]), [
    ["111","704","2026-10",2],["111","705","2026-10",2],["111","704","2026-09",2],
  ]);
  assert.equal(buildRepeatedPurchasesByMonth([item("111", [order("OF1","14/10/2026")])]).length, 0);
});

test("inclui histórico mesmo sem sugestão de compra e não soma valores desconhecidos", () => {
  const stockItem = item("555", [order("OF1","05/10/2026", "704", {quantity: 0}),
    order("OF2","06/10/2026","704",{unitValue:0})]);
  stockItem.positions[0].quantity = 1000;
  const groups = buildRepeatedPurchasesByMonth([stockItem]);
  assert.equal(groups.length,1);
  assert.equal(groups[0].knownAmountCount,0);
  assert.equal(groups[0].knownAmount,0);
});

test("exportação por OF preserva datas como células Excel e permite auditoria", () => {
  const groups = buildRepeatedPurchasesByMonth([item("123", [
    order("100","2026-10-14","704",{quantity:5,unitValue:8}),
    order("101","2026-10-15","704",{quantity:10,unitValue:8}),
  ])]);
  const report=buildRepeatedPurchasesExportReport(groups, new Date(2026,9,16));
  const col=(name)=>report.headers.indexOf(name);
  assert.equal(report.rows.length, 2);
  assert.equal(report.filename, "compras-repetidas-por-mes.xls");
  assert.equal(report.rows[0][col("Código")],"123");
  assert.equal(report.rows[0][col("Competência")],"10/2026");
  assert.equal(report.rows[0][col("OFs distintas no mês")],2);
  assert.equal(report.rows[0][col("Data OF")],"15/10/2026");
  assert.ok(report.dateColumns.has(col("Data OF")));
  assert.ok(report.currencyColumns.has(col("Valor estimado OF")));
  assert.equal(report.rows.reduce((sum,row)=>sum+row[col("Valor estimado OF")],0),120);
  assert.match(report.filterSummary,/recebimentos repetidos/i);
});

test("quarta visão e filtro de competência são visíveis e responsivos", () => {
  const html=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");
  const css=fs.readFileSync(path.join(__dirname,"../app/styles/app.css"),"utf8");
  const js=fs.readFileSync(path.join(__dirname,"../app/core/catalog-app.js"),"utf8");
  for(const id of ["purchaseNeedViewItem","purchaseNeedViewSupplier","purchaseNeedViewMaterial","purchaseNeedViewRepeat",
    "purchaseNeedRepeatControls","purchaseNeedRepeatMonth"]) {
    assert.ok(html.includes('id="' + id + '"'), id);
  }
  assert.match(js,/state\.purchaseNeedView === "repeat"/);
  assert.match(css,/grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});
