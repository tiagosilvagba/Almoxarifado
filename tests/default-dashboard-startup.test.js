"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { resetInitialPageToDashboard, pageForHash } = require("../app/core/catalog-app.js");

function createWindow(hash) {
  const calls = [];
  const location = { pathname: "/Almoxarifado/", search: "?origem=interno", hash };
  return {
    location,
    calls,
    history: {
      replaceState(...args) {
        calls.push(args);
        const url = args[2];
        location.hash = url.includes("#") ? url.slice(url.indexOf("#")) : "";
      },
    },
  };
}

test("cada abertura pelo navegador começa no Dashboard sem empilhar histórico", () => {
  const oldPage = createWindow("#necessidade-compra");
  resetInitialPageToDashboard(oldPage);
  assert.equal(oldPage.location.hash, "#dashboard");
  assert.equal(oldPage.calls.length, 1);
  assert.equal(oldPage.calls[0][2], "/Almoxarifado/?origem=interno#dashboard");

  const hashless = createWindow("");
  resetInitialPageToDashboard(hashless);
  assert.equal(hashless.location.hash, "#dashboard");
  assert.equal(hashless.calls.length, 1);

  const dashboard = createWindow("#dashboard");
  resetInitialPageToDashboard(dashboard);
  assert.equal(dashboard.calls.length, 0);
});

test("reiniciar no Dashboard não impede navegar pelas outras abas depois", () => {
  assert.equal(pageForHash("#consumo"), "consumo");
  assert.equal(pageForHash("#historico-estoque"), "historico-estoque");
  assert.equal(pageForHash("#instrucoes"), "instrucoes");
  const core = fs.readFileSync(path.join(__dirname,"../app/core/catalog-app.js"),"utf8");
  assert.match(core, /bindEvents\(\);\s*\/\/[^\n]*[\s\S]*?resetInitialPageToDashboard\(\);\s*navigateToPage\("dashboard", false\)/);
  assert.match(core, /window\.addEventListener\("hashchange", \(\) => navigateToPage\(pageFromHash\(\), false\)\)/);
});
