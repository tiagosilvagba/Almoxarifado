const test = require("node:test");
const assert = require("node:assert/strict");
const { createAssistantEngine } = require("../app/ai/local-ai-engine.js");

function mockState() {
  const itemA = {
    code:"1001",
    name:"ROLAMENTO TESTE",
    detailedName:"ROLAMENTO INDUSTRIAL",
    categories:["MECANICA"],
    units:["UN"],
    suppliers:["FORNECEDOR A"],
    replenishmentResponsibles:["DANIEL CORREIA CUSTODIO"],
    positions:[{
      branchCode:"704", branchName:"ROLANDIA - AB.AVES", localCode:"9", localName:"ALMOXARIFADO",
      quantity:0, minimum:5, maximum:10, unitCost:20, stockValue:0,
      replenishmentResponsibles:["DANIEL CORREIA CUSTODIO"], responsibleAreas:["Almoxarifado"]
    }],
    history:[{
      branchCode:"704", branch:"ROLANDIA - AB.AVES",
      sc:{code:"5001",status:"ABERTA",date:"01/09/2026",requesterName:"TIAGO",allocationCostCenter:"1500",deliveryDate:"10/09/2026"}
    }]
  };

  const itemB = {
    code:"1002",
    name:"MOTOR TESTE",
    detailedName:"MOTOR ELETRICO",
    categories:["ELETRICA"],
    units:["UN"],
    suppliers:["FORNECEDOR B"],
    replenishmentResponsibles:["MARIA TESTE"],
    positions:[{
      branchCode:"704", branchName:"ROLANDIA - AB.AVES", localCode:"14", localName:"MANUTENCAO",
      quantity:20, minimum:5, maximum:10, unitCost:100, stockValue:2000,
      replenishmentResponsibles:["MARIA TESTE"], responsibleAreas:["Manutenção"]
    }],
    history:[{
      branchCode:"704", branch:"ROLANDIA - AB.AVES",
      sc:{code:"5002",status:"APROVADA",date:"01/08/2026",requesterName:"JOAO",allocationCostCenter:"2000"},
      of:{code:"7001",status:"ABERTA",date:"05/08/2026",deliveryDate:"10/08/2026",supplier:"FORNECEDOR B",requestedQuantity:10,deliveredQuantity:2,balance:8,unitValue:100}
    }]
  };

  const needA = {
    item:itemA,
    position:itemA.positions[0],
    averageMonthlyConsumption:5,
    netSuggested:10,
    estimatedValue:200,
    coveredQuantity:0,
    coverageSource:"Sem cobertura",
    rupture:true,
    scCodes:["5001"],
    ofCodes:[]
  };

  return {
    items:[itemA,itemB],
    filteredItems:[itemA,itemB],
    purchaseNeeds:[needA],
    minMaxReviews:[{
      item:itemA,position:itemA.positions[0],leadTimeDays:12,leadTimeSource:"real",
      averageMonthlyConsumption:5,suggestedMinimum:6,suggestedMaximum:12
    }]
  };
}

test("consulta livre combina responsável, saldo, consumo e ausência de OF", async () => {
  const state = mockState();
  const engine = createAssistantEngine({stateProvider:() => state});
  const result = await engine.ask("quais itens do Daniel estão zerados, com consumo acima de 2 e sem OF?");
  assert.equal(result.result.total,1);
  assert.equal(result.rows[0].itemCode,"1001");
  assert.ok(result.meta.filters.some((value) => /Daniel/i.test(value)));
  assert.ok(result.meta.filters.some((value) => /sem OF/i.test(value)));
});

test("agrupamento por fornecedor usa processos reais", async () => {
  const state = mockState();
  const engine = createAssistantEngine({stateProvider:() => state});
  const result = await engine.ask("qual fornecedor tem mais OF atrasada?");
  assert.equal(result.plan.dataset,"processos");
  assert.equal(result.result.type,"group");
  assert.equal(result.rows[0].group,"FORNECEDOR B");
});

test("pergunta de continuação reaproveita o conjunto anterior", async () => {
  const state = mockState();
  const engine = createAssistantEngine({stateProvider:() => state});
  await engine.ask("mostre os itens do Daniel");
  const next = await engine.ask("agora somente os zerados");
  assert.equal(next.meta.usedContext,true);
  assert.equal(next.result.total,1);
  assert.equal(next.rows[0].itemCode,"1001");
});

test("base de sem giro pode enriquecer a consulta sem pergunta pré cadastrada", async () => {
  const state = mockState();
  const engine = createAssistantEngine({stateProvider:() => state});
  engine.registerDataset("Itens Sem Giro",[{
    "CD Filial":"704",
    "CD Local Estoque":"9",
    "CD Item":"1001",
    "Item":"ROLAMENTO TESTE",
    "QT Saldo Atual":"0",
    "Valor Saldo Atual":"0",
    "Tempo Sem Consumo":"720"
  }]);
  const result = await engine.ask("itens sem giro há mais de 365 dias do Daniel");
  assert.equal(result.result.total,1);
  assert.equal(result.rows[0].noTurnDays,720);
});

test("comparativo mensal cruza snapshots carregados dinamicamente", async () => {
  const state = mockState();
  const engine = createAssistantEngine({stateProvider:() => state});
  engine.registerDataset("monthly:01 - Estoque_Ago_2026.csv",[
    {"CD Item":"1001","Item":"ROLAMENTO TESTE","Saldo Real":"5"},
    {"CD Item":"1002","Item":"MOTOR TESTE","Saldo Real":"10"}
  ]);
  engine.registerDataset("monthly:01 - Estoque_Set_2026.csv",[
    {"CD Item":"1001","Item":"ROLAMENTO TESTE","Saldo Real":"9"},
    {"CD Item":"1002","Item":"MOTOR TESTE","Saldo Real":"7"}
  ]);
  const result = await engine.ask("compare agosto com setembro e mostre os maiores aumentos");
  assert.equal(result.plan.dataset,"mensal");
  assert.equal(result.rows[0].itemCode,"1001");
  assert.equal(result.rows[0].delta,4);
});
