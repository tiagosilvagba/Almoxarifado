"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  suggestPurchaseNeedSupplier, groupPurchaseNeedsBySupplier,
  buildSupplierGroupedPurchaseExport, buildPurchaseNeedsExportReport,
} = require("../app/core/catalog-app.js");

function mockNeed(code, branch, local, quantity, price, history = [], suppliers = []) {
  const item = {
    code, name: "Peça " + code, detailedName: "Descrição " + code,
    categories: [], units: ["UN"], suppliers, history,
  };
  const position = {
    branchCode: branch, branchName: "Filial " + branch,
    localCode: local, localName: "Almoxarifado",
    quantity: 2, minimum: 5, maximum: 20, unitCost: price, stockValue: price * 2,
    replenishmentResponsibles: ["Alexsandro"],
  };
  return {
    item, position, target: 20, suggested: quantity, netSuggested: quantity,
    estimatedValue: quantity * price, referencePrice: price,
    openOfBalance: 0, pendingScQuantity: 0, coveredQuantity: 0,
    ofCodes: [], scCodes: [], coverageSource: "Sem cobertura",
    averageMonthlyConsumption: 3, rupture: false, key: "need-" + code + "-" + local,
  };
}
const hist = (name, branch = "704", date = "2026-10-10", code = "OF1", canceled = false) => ({
  sc: { code: "SC-" + code, cancelled: canceled ? "S" : "N", status: "Compra confirmada" },
  of: { code, supplier: name, date, deliveryBranchCode: branch, status: "Em aberto" },
});

test("sugere fornecedor da OF mais recente na filial exata, sem misturar outra filial", () => {
  const history = [
    hist("Fornecedor Alfa", "704", "2026-09-30", "OF111"),
    hist("Fornecedor Beta", "705", "2026-10-14", "OF222"),
    hist("Fornecedor Gama", "704", "2026-10-12", "OF333"),
    hist("Fornecedor Cancelado", "704", "2026-10-13", "OF444", true),
  ];
  const need = mockNeed("243370", "704", "5", 12, 5, history, ["Fornecedor Alfa", "Fornecedor Gama"]);
  assert.deepEqual(suggestPurchaseNeedSupplier(need), {
    name: "Fornecedor Gama", source: "Última OF na mesma filial",
    alternatives: ["Fornecedor Alfa", "Fornecedor Gama"],
  });
  assert.equal(suggestPurchaseNeedSupplier(mockNeed("243370", "706", "5", 10, 5, history, ["A", "B"])).name, "Fornecedor a definir");
});

test("sem OF na filial usa fornecedor único conhecido, mas múltiplos ficam a definir", () => {
  const one = suggestPurchaseNeedSupplier(mockNeed("22","704","5", 10, 4, [], ["Fornecedor Único"]));
  assert.equal(one.name, "Fornecedor Único");
  assert.match(one.source, /confirmar/);
  const multiple = suggestPurchaseNeedSupplier(mockNeed("23","704","5", 10, 4, [], ["Um", "Dois"]));
  assert.equal(multiple.name, "Fornecedor a definir");
  assert.match(multiple.source, /Múltiplos/);
  const none = suggestPurchaseNeedSupplier(mockNeed("24","704","5", 10, 4, [], []));
  assert.equal(none.name, "Fornecedor a definir");
  assert.equal(none.source, "Sem fornecedor identificado");
});

test("agrupa uma única vez por posição, exclui coberturas e Cavaco sem modificar entrada", () => {
  const a = mockNeed("111", "704", "1", 8, 20, [hist("AÇOS BRASIL")]);
  const b = mockNeed("222", "704", "2", 4, 10, [hist("Aços Brasil")]);
  const c = mockNeed("111", "704", "3", 3, 20, [hist("AÇOS BRASIL")]);
  const covered = { ...mockNeed("333", "704", "2", 0, 20, [hist("Aços Brasil")]), netSuggested: 0 };
  const cavaco = { ...mockNeed("444", "704", "1", 100, 2, [hist("Aços Brasil")]), cavacoAlert: true };
  const unknown = mockNeed("555", "704", "4", 5, 7, [], ["A", "B"]);
  const needs = [a,b,c,covered,cavaco,unknown];
  const groups = groupPurchaseNeedsBySupplier(needs);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].supplier, "AÇOS BRASIL");
  assert.equal(groups[0].entries.length, 3);
  assert.equal(groups[0].itemCodes.size, 2);
  assert.equal(groups[0].estimatedValue, 260);
  assert.equal(groups[1].supplier, "Fornecedor a definir");
  assert.equal(groups[1].estimatedValue, 35);
  assert.equal(groups.flatMap((g) => g.entries).length, 4);
  assert.equal(covered.netSuggested, 0);
  assert.equal(cavaco.netSuggested, 100);
});

test("exportação Por fornecedor mantém colunas originais, datas Excel e rastreabilidade", () => {
  const need1 = mockNeed("243370", "704", "299", 15, 9, [hist("Fornecedor 1")]);
  const need2 = mockNeed("243371", "704", "7", 20, 10, [hist("Fornecedor 1")]);
  const noBuyer = mockNeed("243372", "704", "5", 1, 7, []);
  const covered = mockNeed("243373", "704", "5", 0, 7, []);
  const input = [need1, noBuyer, need2, covered];
  const ref = new Date(2026,9,14);
  const original = buildPurchaseNeedsExportReport(input, ref, []);
  const report = buildSupplierGroupedPurchaseExport(input, ref, []);
  assert.equal(report.rows.length, 3);
  assert.equal(original.rows.length, 4);
  assert.equal(report.headers[0], "Fornecedor sugerido");
  assert.equal(report.headers[1], "Origem da sugestão");
  const col = (name) => report.headers.indexOf(name);
  assert.equal(report.rows[0][col("Fornecedor sugerido")], "Fornecedor 1");
  assert.equal(report.rows[0][col("Código")], "243370");
  assert.equal(report.rows[0][col("Compra líquida")], 15);
  assert.equal(report.rows[1][col("Fornecedor sugerido")], "Fornecedor 1");
  assert.equal(report.rows[2][col("Fornecedor sugerido")], "Fornecedor a definir");
  assert.equal(report.rows.reduce((n,row)=> n + Number(row[col("Valor estimado da compra")]),0),342);
  assert.ok(report.numericColumns.has(col("Compra líquida")));
  assert.ok(report.currencyColumns.has(col("Valor estimado da compra")));
  assert.ok(report.dateColumns.has(col("Data do relatório")));
  assert.ok(report.dateColumns.has(col("Data sugerida de entrega")));
  assert.equal(report.filename, "necessidade-de-compra-por-fornecedor.xls");
});

test("botões móveis Por item/Por fornecedor existem e continuam alcançáveis por teclado", () => {
  const html = fs.readFileSync(path.join(__dirname, "../index.html"),"utf8");
  const css = fs.readFileSync(path.join(__dirname, "../app/styles/app.css"),"utf8");
  for (const id of ["purchaseNeedViewItem", "purchaseNeedViewSupplier", "purchaseNeedSupplierNote"]) {
    assert.ok(html.includes('id="' + id + '"'));
  }
  assert.match(html, /id="purchaseNeedViewSupplier"[^>]*aria-pressed="false"/);
  assert.match(css, /\.supplier-need-group__heading:focus-visible/);
  assert.match(css, /@media \(max-width: 720px\)/);
});
