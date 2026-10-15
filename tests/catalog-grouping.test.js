"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  groupCatalogItems, buildCatalogExportReport,
} = require("../app/core/catalog-app.js");

function item(code, name, stockClass = "", positions = [], history = [], suppliers = []) {
  return {
    code, name, detailedName:name, categories:[], units:["UN"], stockClass,
    positions, history, suppliers, replenishmentResponsibles:[],
    flags:{purchaseOnly:positions.length===0},
  };
}
function pos(branch, location, quantity, value, stockClass = "") {
  return {
    branchCode:branch,branchName:"Filial "+branch,localCode:location,
    localName:"Almoxarifado",locationKey:branch+"::"+location,
    quantity,stockValue:value,unitCost:quantity>0?value/quantity:0,
    minimum:5,maximum:20,stockClass,
  };
}
function purchase(supplier, branch, date, code) {
  return {
    sc:{code:"SC-"+code,status:"Aprovada",cancelled:"N"},
    of:{code,date,supplier,deliveryBranchCode:branch,status:"Em aberto"},
  };
}

test("Catálogo por fornecedor inclui todos os itens, sem restringir à necessidade de compra",()=>{
  const a=item("101","Peça A","",[pos("704","299",12,120)],[
    purchase("Fornecedor A","704","2026-09-01","OF-1"),
    purchase("Fornecedor B","704","2026-10-10","OF-2"),
  ]);
  const b=item("102","Peça B","",[pos("704","299",4,200)],[purchase("Fornecedor B","704","2026-10-11","OF-3")]);
  const c=item("103","Peça C","",[pos("704","299",2,30)],[],[]);
  const d=item("104","Peça D","",[],[purchase("Fornecedor X","705","2026-10-10","OF-4")]);
  const groups=groupCatalogItems([a,b,c,d],"supplier");
  assert.equal(groups.length,3);
  assert.deepEqual(groups.map((g)=>g.name),["Fornecedor a definir","Fornecedor B","Fornecedor X"]);
  assert.equal(groups[1].itemCodes.size,2);
  assert.equal(groups[1].quantity,16);
  assert.equal(groups[1].value,320);
  assert.equal(groups.flatMap(g=>g.entries).length,4);
  assert.equal(groups[2].entries[0].item.code,"104");
  assert.equal(groups[2].value,0);
});

test("Agrupamento por material mantém famílias e usa Nm Classe para não identificados",()=>{
  const sensor=item("201","Sensor de presença","Classe automática",[pos("704","299",4,40,"Instrumentação")]);
  const unmapped=item("202","Item genérico","",[pos("704","299",20,600,"Instrumentação")]);
  const unknown=item("203","Peça genérica","",[pos("704","299",1,15)]);
  const groups=groupCatalogItems([sensor,unmapped,unknown],"material");
  assert.deepEqual(groups.map(g=>g.name),["Instrumentação","Sensores","Outros materiais / classificar"]);
  assert.equal(groups[0].value,600);
  assert.equal(groups[0].entries[0].source,"Nm Classe (Saldo Online)");
  assert.equal(groups.at(-1).unclassified,true);
  assert.equal(groups.reduce((n,g)=>n+g.itemCodes.size,0),3);
});

test("Filial e local filtrados controlam totais do grupo, sem duplicar códigos",()=>{
  const itemMulti=item("301","Rolamento de teste","",[pos("704","299",3,30),pos("705","299",9,90)]);
  const selected=(it)=>(it.positions||[]).filter(p=>p.branchCode==="704");
  const groups=groupCatalogItems([itemMulti],"material",selected);
  assert.equal(groups.length,1);
  assert.equal(groups[0].quantity,3);
  assert.equal(groups[0].value,30);
  assert.equal(groups[0].itemCodes.size,1);
  assert.equal(groups[0].name,"Rolamentos");
});

test("Exportação do catálogo por grupo mantém todas as posições e colunas numéricas",()=>{
  const a=item("401","Sensor industrial","",[pos("704","299",2,30),pos("704","300",3,45)],[purchase("Fornecedor ABC","704","2026-10-01","OF-100")]);
  const b=item("402","Material genérico","",[pos("704","299",6,120,"Elétrica")]);
  const raw=buildCatalogExportReport([a,b]);
  const bySupplier=buildCatalogExportReport([a,b],"supplier");
  const byMaterial=buildCatalogExportReport([a,b],"material");
  assert.equal(raw.rows.length,3);
  assert.equal(bySupplier.rows.length,3);
  assert.equal(byMaterial.rows.length,3);
  assert.equal(bySupplier.headers[0],"Fornecedor sugerido");
  assert.equal(byMaterial.headers[0],"Tipo de material");
  assert.equal(bySupplier.filename,"catalogo-por-fornecedor.xls");
  assert.equal(byMaterial.filename,"catalogo-por-tipo-material.xls");
  const itemIndex=byMaterial.headers.indexOf("Código do item");
  assert.deepEqual(byMaterial.rows.map(r=>r[itemIndex]).sort(),["401","401","402"]);
  assert.equal(byMaterial.rows.find(r=>r[itemIndex]==="402")[0],"Elétrica");
  assert.ok(byMaterial.numericColumns.has(byMaterial.headers.indexOf("Saldo atual")));
  assert.ok(byMaterial.currencyColumns.has(byMaterial.headers.indexOf("Valor em estoque")));
  assert.equal(raw.headers[0],"Código do item");
  assert.equal(raw.filename,"catalogo-de-estoque.xls");
});

test("Catálogo conta itens distintos e não altera a sugestão de compras",()=>{
  const duplicate=item("500","Peça","",[pos("704","299",1,10),pos("705","299",2,20)],[]);
  const groups=groupCatalogItems([duplicate],"supplier");
  assert.equal(groups.length,1);
  assert.equal(groups[0].itemCodes.size,1);
  assert.equal(groups[0].quantity,3);
  assert.equal(groups[0].entries.length,1);
  assert.deepEqual(groupCatalogItems([duplicate],"item"),[]);
});

test("UI exibe três abas agrupadas, pagina grupos e mantém modal original do item",()=>{
  const html=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");
  const js=fs.readFileSync(path.join(__dirname,"../app/core/catalog-app.js"),"utf8");
  const css=fs.readFileSync(path.join(__dirname,"../app/styles/app.css"),"utf8");
  for(const id of ["catalogGroupViewItem","catalogGroupViewSupplier","catalogGroupViewMaterial","catalogGroupNote"]) {
    assert.match(html,new RegExp('id="'+id+'"'));
  }
  assert.match(js,/function renderCatalogGroupCard\(/);
  assert.match(js,/function appendCatalogGroupItems\(/);
  assert.match(js,/data-catalog-group-toggle/);
  assert.match(js,/data-catalog-group-more/);
  assert.match(js,/if \(trigger\) \{ openItem\(trigger\.dataset\.itemCode\); return; \}/);
  assert.match(css,/cards-grid\.is-catalog-group-view/);
  assert.match(css,/@media \(max-width:720px\)/);
});
