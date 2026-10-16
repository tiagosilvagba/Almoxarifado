"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ROOT = path.resolve(__dirname,"..");

class Element {
  constructor(tag="span") {
    this.tagName = tag;
    this.children = [];
    this.attributes = {};
    this._text = "";
    this.classSet = new Set();
    this.classList = {
      add: (...names) => names.forEach(name => this.classSet.add(name)),
      remove: (...names) => names.forEach(name => this.classSet.delete(name)),
      contains: name => this.classSet.has(name),
    };
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this.children.length
    ? this.children.map(child => child.textContent).join("")
    : this._text; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; this._text = ""; }
  get childElementCount() { return this.children.length; }
  setAttribute(name,value) { this.attributes[name] = String(value); }
  addEventListener() {}
}

function coreTimestampFn(window, badge) {
  const source=fs.readFileSync(path.join(ROOT,"app/core/catalog-app.js"),"utf8");
  const match=source.match(/function updateBaseTimestamp\(value\) \{[\s\S]*?\n\}\n\nfunction showError/);
  assert.ok(match,"função original de horário encontrada");
  const declaration=match[0].replace(/\n\nfunction showError$/, "");
  return vm.runInNewContext(declaration+"\nupdateBaseTimestamp;", {
    window, ui:{baseUpdateBadge:badge}, Date, Intl,
  });
}

test("mantém as datas por arquivo mesmo depois que o Dashboard conclui o carregamento",async()=>{
  const badge=new Element();
  badge.classList.add("is-hidden");
  const window={addEventListener(){}};
  const document={
    readyState:"complete",
    getElementById(id) { return id==="baseUpdateBadge"?badge:id==="refreshButton"?new Element("button"):null; },
    createElement(tag) { return new Element(tag); },
    addEventListener() {},
  };
  const metadata={
    saldo:{file:"00 - Saldo_Online.csv",updatedAt:"2026-10-15T12:15:35Z"},
    compras:{file:"01 - Compras_Almox_Parte_04.CSV",updatedAt:"2026-10-15T11:58:01Z"},
    consumo:{file:"03 - Consumo.csv",updatedAt:"2026-09-02T16:31:17Z"},
  };
  const context={
    window,document,Date,Intl,setTimeout:()=>0,
    fetch:async()=>({ok:true,json:async()=>metadata}),
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT,"app/modules/saldo-update-time.js"),"utf8"),context);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(badge.childElementCount,3,"os três arquivos são exibidos");
  assert.match(badge.textContent,/Saldo on-line/);
  assert.match(badge.textContent,/Compras/);
  assert.match(badge.textContent,/Consumo/);

  const updateBaseTimestamp=coreTimestampFn(window,badge);
  updateBaseTimestamp("2026-10-16T17:07:00Z");
  assert.equal(badge.childElementCount,3,"cálculo final do Dashboard não remove os horários");
  assert.doesNotMatch(badge.textContent,/Base atualizada em/);

  badge.textContent="Base atualizada em 16/10/2026, 14:07";
  assert.equal(window.almoxSaldoUpdateTime.restoreBadge(),true);
  assert.equal(badge.childElementCount,3,"a restauração recupera os indicadores após sobrescrita");
  assert.match(badge.children[0].title,/00 - Saldo_Online.csv/);
  assert.match(badge.children[1].title,/Parte_04.CSV/);
});

test("na falta dos metadados, mantém aviso geral como fallback",()=>{
  const badge=new Element();
  const updateBaseTimestamp=coreTimestampFn({},badge);
  updateBaseTimestamp("2026-10-16T17:07:00Z");
  assert.match(badge.textContent,/Base atualizada em/);
  assert.equal(badge.classList.contains("is-hidden"),false);
});
