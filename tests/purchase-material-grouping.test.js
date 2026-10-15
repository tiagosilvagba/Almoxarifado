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
  groupCatalogItems,
  buildCatalogExportReport,
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


test("material sem família identificável usa Nm Classe da posição do Saldo Online", () => {
  const a = need("407919", ["Grupo geral", "Subgrupo geral"], 12, 15);
  a.position.stockClass = "Instrumentação Industrial";
  a.item.stockClass = "Classe desatualizada";
  assert.deepEqual(purchaseNeedMaterialType(a), {
    name: "Instrumentação Industrial",
    source: "Nm Classe (Saldo Online)",
    details: ["Grupo geral", "Subgrupo geral"],
  });
  const b = need("407920", ["Grupo geral"], 5, 8);
  b.item.stockClass = "Material de limpeza";
  assert.equal(purchaseNeedMaterialType(b).name, "Material de limpeza");
  const c = need("407921", ["Grupo geral"], 6, 8);
  c.position.stockClass = "A classificar";
  assert.equal(purchaseNeedMaterialType(c).name, "Outros materiais / classificar");
  const groups = groupPurchaseNeedsByMaterialType([a, b, c]);
  assert.equal(groups.length, 3);
  assert.equal(groups.flatMap((group) => group.entries).length, 3);
  assert.ok(groups.some((group) => group.materialType === "Instrumentação Industrial"));
  assert.ok(groups.some((group) => group.materialType === "Material de limpeza"));
  assert.equal(groups.at(-1).materialType, "Outros materiais / classificar");
  const report = buildMaterialGroupedPurchaseExport([a, b, c], new Date(2026,9,15), []);
  assert.ok(report.rows.some((r) => r[0] === "Instrumentação Industrial"));
  assert.ok(report.rows.some((r) => r[0] === "Material de limpeza"));
});

test("classificação pela descrição permanece prioritária e respeita a posição", () => {
  const a = need("407922", ["Grupo geral"], 9);
  a.item.name = "Sensor de temperatura";
  a.position.stockClass = "Automação";
  assert.equal(purchaseNeedMaterialType(a).name, "Sensores");
  const b = need("407923", ["Grupo geral"], 3);
  b.item.stockClass = "Linha geral";
  b.position.stockClass = "Materiais hidráulicos";
  assert.equal(purchaseNeedMaterialType(b).name, "Materiais hidráulicos");
  assert.equal(purchaseNeedMaterialType(b).source, "Nm Classe (Saldo Online)");
});

test("o leitor CSV mantém a coluna Nm Classe separada em itens e posições", () => {
  const code = fs.readFileSync(path.join(__dirname, "../app/core/catalog-app.js"), "utf8");
  assert.match(code, /const className = clean\(get\("Nm Classe"\)\)/);
  assert.match(code, /stockClass: className/);
  assert.match(code, /if \(className && \(!item\.stockClass/);
  assert.match(code, /item\.categories = \[\.\.\.item\._categories\]/);
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


test("parafusos, porcas, arruelas, rebites e fixadores recebem UMA família apesar do Nm Classe", () => {
  const variants = [
    ["701", "PARAFUSO SEXTAVADO M10", "Parafusos e porcas"],
    ["702", "PORCA SEXTAVADA M10", "Manutenção Industrial e Mecânica"],
    ["703", "ARRUELA LISA M10", "Materiais de Manutenção"],
    ["704", "REBITE POP ALUMINIO 4MM", "Fixadores"],
    ["705", "PRISIONEIRO M12", "Manutenção Industrial e Mecânica"],
    ["706", "CHUMBADOR PARABOLT M12", "Hidráulica"],
    ["707", "ABRACADEIRA INOX", "Manutenção industrial e mecânica"],
    ["708", "BARRA ROSCADA ACO", "Outros"],
    ["709", "BUCHA NYLON 8MM", "Materiais mecânicos"],
    ["710", "PRESILHA METALICA", "Manutenção industrial e mecânica"],
  ];
  const entries=variants.map(([code,name,stockClass])=>{
    const n=need(code,["Manutenção Industrial e Mecânica",stockClass],5);
    n.item.name=name;n.item.detailedName=name;
    n.item.stockClass=stockClass;n.position.stockClass=stockClass;
    return n;
  });
  for(const n of entries){
    const classification=purchaseNeedMaterialType(n);
    assert.equal(classification.name,"Parafusos e porcas",n.item.name);
    assert.equal(classification.source,"Nome do item",n.item.name);
  }
  const groups=groupPurchaseNeedsByMaterialType(entries);
  assert.equal(groups.length,1);
  assert.equal(groups[0].materialType,"Parafusos e porcas");
  assert.equal(groups[0].itemCodes.size,variants.length);
  assert.equal(groups[0].estimatedValue,variants.length*50);
  const report=buildMaterialGroupedPurchaseExport(entries,new Date(2026,9,15),[]);
  assert.equal(report.rows.length,variants.length);
  assert.ok(report.rows.every(row=>row[0]==="Parafusos e porcas"));
});

test("prioriza nome e descrição: classe contábil genérica não prevalece sobre o material",()=>{
  const a=need("720",["Manutenção Industrial e Mecânica"],5);
  a.item.name="MATERIAL PARA MANUTENCAO";
  a.item.detailedName="Rebite alumínio cabeça redonda";
  a.position.stockClass="Manutenção Industrial e Mecânica";
  assert.deepEqual(purchaseNeedMaterialType(a),{
    name:"Parafusos e porcas",source:"Descrição detalhada",
    details:[],
  });
  const b=need("721",["Manutenção Industrial e Mecânica"],3);
  b.item.name="ROLAMENTO 6204 PARA MOTOR";
  b.position.stockClass="Parafusos e porcas";
  assert.equal(purchaseNeedMaterialType(b).name,"Rolamentos");
  const c=need("722",["Manutenção Industrial e Mecânica"],4);
  c.item.name="Parafuso para válvula de pressão";
  c.position.stockClass="Valvulas";
  assert.equal(purchaseNeedMaterialType(c).name,"Parafusos e porcas");
});

test("mesma padronização no catálogo: um código em dois locais conta uma vez",()=>{
  const variants=[
    ["800","PARAFUSO SEXTAVADO","Parafusos e porcas",12,60],
    ["801","PORCA M10","Manutenção industrial e mecânica",5,25],
    ["802","REBITE POP","Fixadores",6,30],
  ];
  const items=variants.map(([code,name,stockClass,qty,value])=>({
    code,name,detailedName:name,categories:[stockClass],stockClass,
    flags:{},units:["UN"],suppliers:[],history:[],
    positions:[{branchCode:"704",localCode:"299",stockClass,quantity:qty,stockValue:value}],
  }));
  items[0].positions.push({branchCode:"704",localCode:"300",quantity:3,stockValue:15,stockClass:"Manutenção industrial e mecânica"});
  const groups=groupCatalogItems(items,"material");
  assert.equal(groups.length,1);
  assert.equal(groups[0].name,"Parafusos e porcas");
  assert.equal(groups[0].itemCodes.size,3);
  assert.equal(groups[0].quantity,26);
  assert.equal(groups[0].value,130);
  const exportData=buildCatalogExportReport(items,"material");
  assert.equal(exportData.rows.length,4,"todas as posições devem constar da planilha");
  assert.ok(exportData.rows.every(row=>row[0]==="Parafusos e porcas"));
  assert.equal(exportData.rows.reduce((sum,row)=>sum+row[exportData.headers.indexOf("Valor em estoque")],0),130);
});

test("famílias similares são padronizadas sem confundir ferramenta e peça",()=>{
  const scenarios=[
    ["REBITADOR MANUAL","Ferramentas"],
    ["LUVA DE REDUCAO SOLDAVEL","Tubos e conexões"],
    ["LUVA NITRILICA","Equipamentos de proteção"],
    ["LUVA DE ACOPLAMENTO","Acoplamentos"],
    ["BUCHA BRONZE","Buchas"],
    ["MOTOR REDUTOR TRIFASICO","Redutores"],
    ["MOTOBOMBA CENTRIFUGA","Bombas"],
    ["MANCAL FLANGEADO","Mancais"],
    ["FILTRO CARTUCHO","Filtros"],
    ["CABO DE ACO 3MM","Cabos de aço"],
    ["CABO ELETRICO FLEXIVEL","Cabos elétricos"],
    ["DETERGENTE ALCALINO","Materiais de limpeza"],
    ["FITA ADESIVA TRANSPARENTE","Embalagens"],
  ];
  for (const [name,expected] of scenarios) {
    const n=need("901",["Manutenção Industrial e Mecânica"],5);
    n.item.name=name;n.position.stockClass="Manutenção Industrial e Mecânica";
    assert.equal(purchaseNeedMaterialType(n).name,expected,name);
  }
});
