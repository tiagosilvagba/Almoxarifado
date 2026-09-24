"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const css = fs.readFileSync(path.join(root, "app/styles/app.css"), "utf8");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app/core/catalog-app.js"), "utf8");
const compat = fs.readFileSync(path.join(root, "app/layers/compat-v2.js"), "utf8");
const noTurn = fs.readFileSync(path.join(root, "app/modules/itens-sem-giro.js"), "utf8");
const followUp = fs.readFileSync(path.join(root, "app/modules/follow-up.js"), "utf8");

function luminance(hex) {
  const value = hex.replace("#", "");
  const normalized = value.length === 3
    ? [...value].map((part) => part + part).join("")
    : value;
  const channels = [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255)
    .map((channel) => channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4);
  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
}

function contrast(first, second) {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function themeDeclarations(theme) {
  const values = {};
  for (const match of css.matchAll(/html\[data-theme="([^"]+)"\]\{([^}]*)\}/g)) {
    if (match[1] !== theme) continue;
    for (const declaration of match[2].matchAll(/(--a11y-[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})/g)) {
      values[declaration[1]] = declaration[2];
    }
  }
  return values;
}

test("todos os temas expostos possuem pares WCAG AA", () => {
  const themeSelect = index.match(/<select id="themeSelect"[\s\S]*?<\/select>/);
  assert.ok(themeSelect, "seletor de temas não encontrado");
  const nativeThemes = [...themeSelect[0].matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]);
  const customSection = compat.match(/const CUSTOM_THEMES = \[([\s\S]*?)\];/);
  assert.ok(customSection, "temas adicionais não encontrados");
  const customThemes = [...customSection[1].matchAll(/\["([^"]+)"/g)].map((match) => match[1]);
  const themes = [...new Set([...nativeThemes, ...customThemes])];
  assert.ok(themes.length >= 24, "a lista de temas ficou incompleta");

  for (const theme of themes) {
    const values = themeDeclarations(theme);
    const pairs = [
      ["--a11y-surface", "--a11y-text", "texto principal"],
      ["--a11y-surface", "--a11y-muted", "texto auxiliar"],
      ["--a11y-field-bg", "--a11y-field-text", "campos"],
      ["--a11y-accent-bg", "--a11y-accent-text", "ações"],
      ["--a11y-chrome-bg", "--a11y-chrome-text", "cabeçalho e navegação"],
    ];
    for (const [background, foreground, label] of pairs) {
      assert.ok(values[background], theme + ": falta " + background);
      assert.ok(values[foreground], theme + ": falta " + foreground);
      const ratio = contrast(values[background], values[foreground]);
      assert.ok(ratio >= 4.5, theme + ": contraste insuficiente em " + label + " (" + ratio.toFixed(2) + ":1)");
    }
  }
});

test("módulos dinâmicos participam do contrato de contraste", () => {
  const requiredSelectors = [
    ".modal-shell",
    ".excel-filter__menu",
    ".fu-card",
    ".fu-panel",
    ".nt-kpi",
    ".nt-panel",
    ".month-compare-metric",
    ".month-consideration",
    ".consumption-panel",
    ".consumption-summary>article",
    "svg text",
  ];
  for (const selector of requiredSelectors) {
    assert.ok(css.includes(selector), "cobertura ausente para " + selector);
  }
  assert.ok(css.includes("Contrato universal de contraste — versão 10.6"));
});

test("folha principal mantém chaves balanceadas", () => {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let depth = 0;
  for (const character of withoutComments) {
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
    assert.ok(depth >= 0, "chave de fechamento sem abertura");
  }
  assert.equal(depth, 0, "há bloco CSS sem fechamento");
});


test("filtros de período da OF usam multisseleção dependente", () => {
  const ids = [
    "ofGenerationYearFilter",
    "ofGenerationMonthFilter",
    "ofGenerationWeekFilter",
    "ofGenerationDateFilter",
  ];
  for (const id of ids) {
    assert.match(index, new RegExp('<select id="' + id + '" multiple'));
    assert.ok(app.includes('"' + id + '"'), "filtro ausente da inicialização: " + id);
  }
  assert.ok(app.includes('ofGenerationPeriod: { year: [], month: [], week: [], date: [] }'));
  assert.ok(app.includes("selected.includes(value)"));
  assert.ok(app.includes("setFilterValues(control, validSelected)"));
  const multiFilterBlock = app.match(/const MULTI_FILTER_IDS = \[([\s\S]*?)\];/)?.[1] || "";
  for (const id of ids) assert.ok(multiFilterBlock.includes(id), "filtro OF deve reutilizar controle Excel estável: " + id);
});

test("item sem foto pesquisa e exibe resultados externos automaticamente", () => {
  assert.ok(app.includes("function loadAutomaticWebImages(item)"));
  assert.ok(app.includes("searchOpenverseImages"));
  assert.ok(app.includes("searchWikimediaImages"));
  assert.ok(app.includes("Imagens encontradas automaticamente"));
  assert.ok(app.includes("item?.detailedName"));
  assert.ok(css.includes(".web-image-results"));
});

test("navegação possui transição suave com alternativa leve", () => {
  assert.ok(app.includes("function animatePageEntry(panel)"));
  assert.ok(app.includes('panel.classList.add("page-entering")'));
  assert.ok(css.includes("@keyframes page-soft-focus-in"));
  assert.ok(css.includes("@keyframes page-soft-focus-mobile"));
  assert.ok(css.includes("prefers-reduced-motion:reduce"));
});

test("painel global usa um único componente de filtro reconstruído", () => {
  assert.ok(app.includes('select.hidden = true'));
  assert.ok(app.includes('select.dataset.filterSource = "true"'));
  assert.ok(app.includes("function setExcelFilterOpen(select, open)"));
  assert.ok(app.includes("excel-filter__backdrop"));
  assert.ok(app.includes("excel-filter__footer"));
  assert.ok(css.includes('select[data-filter-source="true"]'));
  assert.ok(css.includes("Painel de filtros reconstruído — versão 10.6"));
});


test("itens sem giro e follow up reutilizam os filtros globais visíveis", () => {
  assert.ok(app.includes("window.__almoxCreateMultiFilter = initializeExcelFilterControl"));
  assert.ok(app.includes("window.__almoxSyncMultiFilter = syncExcelFilterControl"));
  assert.ok(css.includes(".embedded-filter-panel"));
  for (const id of ["ntTimeSelect", "ntBranchSelect", "ntLocalSelect"]) {
    assert.ok(noTurn.includes('id="' + id + '"'), "filtro sem giro ausente: " + id);
  }
  for (const id of ["fuDeliverySelect", "fuBranchSelect", "fuSupplierSelect", "fuRequesterSelect", "fuAgeSelect"]) {
    assert.ok(followUp.includes('id="' + id + '"'), "filtro follow up ausente: " + id);
  }
  assert.ok(noTurn.includes("window.__almoxCreateMultiFilter?.(e)"));
  assert.ok(followUp.includes("windowObject.__almoxCreateMultiFilter?.(element)"));
  assert.ok(followUp.includes("selected.requester.has(row.requester)"));
  assert.ok(followUp.includes("sc.requesterName"));
  assert.ok(!noTurn.includes("nt-chip"));
  assert.ok(!followUp.includes("fu-chip"));
});
