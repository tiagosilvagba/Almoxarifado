"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname,"..");
const read = (file) => fs.readFileSync(path.join(root,file),"utf8");
const source = read("app/modules/grouped-sidebar.js");
const styles = read("app/styles/grouped-sidebar.css");
const index = read("index.html");
const bootstrap = read("script.js");

test("o menu agrupado é JavaScript válido e está incluído na inicialização",() => {
  assert.doesNotThrow(() => new vm.Script(source));
  assert.match(index,/app\/styles\/grouped-sidebar\.css\?v=/);
  assert.match(bootstrap,/groupedSidebar: "\.\/app\/modules\/grouped-sidebar\.js\?v=/);
  assert.match(bootstrap,/await optional\(MODULES\.groupedSidebar/);
});

test("todas as abas atuais, inclusive as injetadas, possuem um grupo",() => {
  const groupSource = source.match(/const GROUPS = (\[[\s\S]*?\]);\s*const ICONS/);
  assert.ok(groupSource,"deve existir um mapeamento declarativo");
  const groups = vm.runInNewContext(groupSource[1]);
  const mappedPages = groups.flatMap(group => Array.from(group.pages));
  const actualPages = [...index.matchAll(/class="app-nav__tab[^"]*"[^>]*data-page="([^"]+)"/g)]
    .map(match => match[1]);
  const injectedPages = [
    "comparativo-mensal",
    "itens-sem-giro",
    "compras-fora-cc1500",
    "follow-up"
  ];
  for (const page of [...actualPages,...injectedPages]) {
    assert.ok(mappedPages.includes(page),"sem grupo: " + page);
  }
  assert.equal(new Set(mappedPages).size,mappedPages.length,"uma aba não pode estar em dois grupos");
  assert.match(source,/const unmatched = tabs\.filter/,"abas futuras devem aparecer em Outras abas");
});

test("a camada de navegação reutiliza o clique original sem alterar o roteamento",() => {
  assert.match(source,/tab\.click\(\)/);
  assert.match(source,/MutationObserver\(scheduleRender\)/);
  assert.match(source,/MutationObserver\(syncActive\)/);
  assert.match(source,/safeWrite\(compact \? "compact" : "expanded"\)/);
  assert.match(read("app/modules/layout-fix.js"),/sideWidth\(\)/);
});

test("os dois modos e o drawer mobile têm regras isoladas",() => {
  assert.match(styles,/\.almox-nav-compact/);
  assert.match(styles,/\.almox-nav-expanded/);
  assert.match(styles,/\.almox-menu__popup/);
  assert.match(styles,/@media \(max-width:900px\)/);
  assert.match(styles,/\.almox-menu__mobile-open/);
  assert.match(styles,/prefers-reduced-motion:reduce/);
});
