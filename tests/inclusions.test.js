"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { chronologicalFiles, compareInclusions } = require("../app/modules/comparativo-inclusoes.js");

const record = (code, balance, branch = "704", local = "299") => ({ code, displayCode:code, name:`Item ${code}`, balance, branch, local, usage:"Peças", unit:"UN", areas:["Almoxarifado"] });
const snapshot = (fileName, records) => ({ fileName, records });

test("ordena bases pelo ano e mês, ignorando arquivos não mensais", () => {
  assert.deepEqual(chronologicalFiles(["01 - Estoque_Out_2026.csv", "01 - Estoque_Dez_2025.csv", "00 - Saldo_Online.csv", "01 - Estoque_Set_2026.csv"]).map(x => x.name), ["01 - Estoque_Dez_2025.csv", "01 - Estoque_Set_2026.csv", "01 - Estoque_Out_2026.csv"]);
});

test("cada atualização compara com a anterior e mantém todos os códigos incluídos", () => {
  const files = chronologicalFiles(["01 - Estoque_Out_2026.csv", "01 - Estoque_Ago_2026.csv", "01 - Estoque_Set_2026.csv"]);
  const bases = [snapshot(files[0].name,[record("0001",2)]),snapshot(files[1].name,[record("1",4),record("0002",3)]),snapshot(files[2].name,[record("2",5),...Array.from({length:12},(_,i)=>record(String(i+3),1))])];
  const history = bases.slice(1).map((base,i) => compareInclusions(bases[i],base));
  assert.equal(history[0].count,1);
  assert.equal(history[1].count,12);
  assert.equal(history[1].balance,12);
  assert.equal(history[1].previous,files[1].name);
});

test("filtros recortam inclusões sem transformar mudança de filial em código novo", () => {
  const before = snapshot("set",[record("0007",1,"704")]);
  const after = snapshot("out",[record("7",2,"705"),record("008",3,"704","299"),record("8",4,"704","300")]);
  const result = compareInclusions(before,after,{branch:"704",local:"299",usage:"Peças",area:"Almoxarifado"});
  assert.equal(result.count,1);
  assert.equal(result.balance,3);
  assert.equal(result.items[0].code,"8");
});
