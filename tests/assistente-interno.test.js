
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const assistant = require("../app/modules/assistente-interno.js");

function rows() {
  return [
    {
      code:"1001",name:"ROLAMENTO 6204",branchCode:"704",branchName:"ROLÂNDIA",localCode:"299",
      responsible:"DANIEL CORREIA CUSTODIO",area:"ALMOXARIFADO",supplier:"FORNECEDOR A",requester:"JOAO",
      category:"ROLAMENTOS",unit:"UN",balance:0,minimum:2,maximum:5,stockValue:0,averageConsumption:4,
      purchaseNeed:5,purchaseValue:500,coveredQuantity:0,openOfBalance:0,leadTime:15,scToOfDays:3,ofToReceiptDays:7,
      pendingScDays:10,scCount:0,ofCount:0,receiptCount:0,hasSc:false,hasOf:false,pendingSc:false,hasOpenOf:false,overdueOf:false,rupture:true,
      search:"1001 rolamento 6204 704 299 daniel correia custodio almoxarifado rolamentos"
    },
    {
      code:"1002",name:"CORREIA A32",branchCode:"704",branchName:"ROLÂNDIA",localCode:"14",
      responsible:"MARIA SILVA",area:"MANUTENCAO",supplier:"FORNECEDOR B",requester:"PEDRO",
      category:"CORREIAS",unit:"UN",balance:12,minimum:2,maximum:8,stockValue:1200,averageConsumption:1,
      purchaseNeed:0,purchaseValue:0,coveredQuantity:0,openOfBalance:3,leadTime:20,scToOfDays:4,ofToReceiptDays:9,
      pendingScDays:0,scCount:1,ofCount:1,receiptCount:0,hasSc:true,hasOf:true,pendingSc:false,hasOpenOf:true,overdueOf:true,rupture:false,
      search:"1002 correia a32 704 14 maria silva manutencao fornecedor b correias of aberta of atrasada"
    }
  ];
}

test("interpreta responsável, zerado e ausência de compras em pergunta livre", () => {
  const source=rows();
  const plan=assistant.parsePlan("quais itens do Daniel estão zerados e sem SC ou OF?",source);
  const result=assistant.runPlan(plan,source);
  assert.equal(result.totalMatched,1);
  assert.equal(result.rows[0].code,"1001");
});

test("interpreta agrupamento por responsável", () => {
  const source=rows();
  const plan=assistant.parsePlan("agrupe o valor de reposição por responsável",source);
  assert.equal(plan.groupBy,"responsible");
  const result=assistant.runPlan(plan,source);
  assert.ok(Array.isArray(result.groups));
  assert.equal(result.groups.length,2);
});

test("interpreta acima do máximo e ordenação top", () => {
  const source=rows();
  const plan=assistant.parsePlan("top 20 itens acima do máximo por valor de estoque",source);
  const result=assistant.runPlan(plan,source);
  assert.equal(result.totalMatched,1);
  assert.equal(result.rows[0].code,"1002");
  assert.equal(plan.limit,20);
});

test("mantém contexto em pergunta de continuação", () => {
  const source=rows();
  const first=assistant.parsePlan("itens da filial 704 com consumo",source);
  const next=assistant.parsePlan("agora somente os zerados",source,first);
  const result=assistant.runPlan(next,source);
  assert.equal(result.totalMatched,1);
  assert.equal(result.rows[0].code,"1001");
});
