"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  purchaseNeedMaterialType,
  groupPurchaseNeedsByMaterialType,
  buildMaterialGroupedPurchaseExport,
  buildPurchaseNeedsExportReport,
} = require("../app/core/catalog-app.js");

function need(code, categories, net, price = 10, extra = {}) {
  const item = {
    code, name: "Item " + code, detailedName: "Descrição " + code,
    categories, units: ["UN"], suppliers: [], history: [],
  };
  const position = {
    branchCode: extra.branchCode || "704",
    branchName: "Rolândia", localCode: extra.local || "299",
    localName: "Almoxarifado", locationKey: "704::299",
    quantity: 2, minimum: 10, maximum: 30, unitCost: price, stockValue: 2 * price,
    replenishmentResponsibles: ["Alexsandro"],
  };
  return {
    item, position, target: 30, suggested: net, netSuggested: net,
    coveredQuantity: 0, openOfBalance: 0, pendingScQuantity: 0,
    ofCodes: [], scCodes: [], coverageSource: "Sem cobertura",
    estimatedValue: net * price, referencePrice: price,
    averageMonthlyConsumption: 3, rupture: false,
    key: "item-" + code + "-" + position.localCode,
    ...extra,
  };
}

test("o tipo de material identifica a família real da peça e preserva subgrupo/classe", () => {
  const first = need("243370", ["Materiais Elétricos", "Motores", "Baixa tensão"], 10);
  assert.deepEqual(purchaseNeedMaterialType(first), {
    name: "Motores", source: "Cadastro",
    details: ["Motores", "Baixa tensão"],
  });
  assert.deepEqual(purchaseNeedMaterialType(need("1", [], 10)), {
    name: "Outros materiais / classificar", source: "Família não identificada", details: [],
  });
  assert.equal(purchaseNeedMaterialType(need("1", ["", "Peças Mecânicas", "Rolamentos"], 10)).name, "Rolamentos");
  const named = need("567", ["Materiais Elétricos"], 10);
  named.item.name = "Sensor indutivo M12";
  assert.equal(purchaseNeedMaterialType(named).name, "Sensores");
  assert.equal(purchaseNeedMaterialType(named).source, "Nome do item");
  named.item.name = "Rolamento 6204 com sensor integrado";
  assert.equal(purchaseNeedMaterialType(named).name, "Rolamentos");
});

test("agrupa sem multiplicar categorias e não sugere compras já cobertas ou Cavaco", () => {
  const a = need("100", ["Ferramentas", "Manuais", "Aço"], 5, 10);
  const b = need("101", ["FERRAMENTAS", "Elétricas"], 3, 20, {local:"7"});
  const c = need("100", ["Ferramentas"], 2, 10, {local:"8"});
  const unknown = need("200", [], 4, 8);
  const covered = need("300", ["Ferramentas"], 0, 10);
  const cavaco = need("400", ["Ferramentas"], 25, 10, { cavacoAlert: true });
  const original = [a, b, c, unknown, covered, cavaco];
  const groups = groupPurchaseNeedsByMaterialType(original);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].materialType, "Ferramentas");
  assert.equal(groups[0].entries.length, 3);
  assert.equal(groups[0].itemCodes.size, 2);
  assert.equal(groups[0].estimatedValue, 130);
  assert.equal(groups[1].materialType, "Outros materiais / classificar");
  assert.equal(groups[1].estimatedValue, 32);
  assert.equal(groups.flatMap((group)=>group.entries).length, 4);
  assert.equal(groups[0].entries[0].classification.details.length, 2);
  assert.equal(covered.netSuggested, 0);
  assert.equal(cavaco.netSuggested, 25);
  assert.deepEqual(groupPurchaseNeedsByMaterialType([covered, cavaco]), []);
});

test("não mistura faixas e mantém o recorte de filtro recebido", () => {
  const rupture = need("101", ["Peças"], 10, 10, {rupture:true});
  const risk = need("102", ["Peças"], 10, 10, {position: {
    branchCode:"704",localCode:"299",quantity:3,minimum:10,maximum:30
  }});
  const outside = need("103", ["EPI", "Luvas"], 10);
  const current = groupPurchaseNeedsByMaterialType([rupture, risk]);
  assert.equal(current.length,1);
  assert.equal(current[0].itemCodes.size,2);
  assert.equal(current[0].ruptures,1);
  assert.equal(current[0].risks,1);
  assert.equal(groupPurchaseNeedsByMaterialType([outside])[0].materialType,"Equipamentos de proteção");
});

test("exportação Por tipo preserva dados da compra, valor total e células de data do Excel", () => {
  const a = need("100", ["Ferramentas","Manuais"], 5, 20);
  const b = need("101", ["Ferramentas","Elétricas"], 3, 30);
  const c = need("102", [], 2, 10);
  const covered = need("103", ["Ferramentas"], 0, 10);
  const date = new Date(2026, 9, 14);
  const original = buildPurchaseNeedsExportReport([a,b,c,covered], date, []);
  const report = buildMaterialGroupedPurchaseExport([a,b,c,covered], date, []);
  const col = (header) => report.headers.indexOf(header);
  assert.equal(original.rows.length, 4);
  assert.equal(report.rows.length, 3);
  assert.equal(report.filename,"necessidade-de-compra-por-tipo-material.xls");
  assert.equal(report.headers[0],"Tipo de material");
  assert.equal(report.headers[1],"Subgrupo / classe");
  assert.equal(report.rows[0][col("Tipo de material")], "Ferramentas");
  assert.equal(report.rows[0][col("Subgrupo / classe")], "Manuais");
  assert.equal(report.rows[0][col("Compra líquida")],5);
  assert.equal(report.rows[1][col("Compra líquida")],3);
  assert.equal(report.rows[2][col("Tipo de material")], "Outros materiais / classificar");
  assert.equal(report.rows.reduce((sum,row)=>sum+Number(row[col("Valor estimado da compra")]),0),210);
  assert.ok(report.numericColumns.has(col("Compra líquida")));
  assert.ok(report.currencyColumns.has(col("Valor estimado da compra")));
  assert.ok(report.dateColumns.has(col("Data do relatório")));
  assert.ok(report.dateColumns.has(col("Data sugerida de entrega")));
  assert.equal(report.rows[0][col("Data do relatório")], "14/10/2026");
  assert.match(report.filterSummary, /categoria|material/);
});

test("nova opção existe em mobile e não há aspas extras na chamada ao script", () => {
  const html = fs.readFileSync(path.join(__dirname, "../index.html"),"utf8");
  const js = fs.readFileSync(path.join(__dirname, "../app/core/catalog-app.js"),"utf8");
  const css = fs.readFileSync(path.join(__dirname, "../app/styles/app.css"),"utf8");
  for (const id of ["purchaseNeedViewItem","purchaseNeedViewSupplier","purchaseNeedViewMaterial"]) {
    assert.ok(html.includes('id="' + id + '"'));
  }
  assert.ok(html.indexOf('id="purchaseNeedViewItem"') < html.indexOf('id="purchaseNeedViewSupplier"'));
  assert.ok(html.indexOf('id="purchaseNeedViewSupplier"') < html.indexOf('id="purchaseNeedViewMaterial"'));
  assert.match(html, /id="purchaseNeedViewMaterial"[^>]+aria-pressed="false"/);
  assert.doesNotMatch(html, /script\.js\?v=[^"]+""/);
  assert.match(js, /state\.purchaseNeedView === "material"/);
  assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
});
