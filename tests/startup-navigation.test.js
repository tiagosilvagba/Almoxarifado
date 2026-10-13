"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const compat = fs.readFileSync(path.join(ROOT, "app/layers/compat-v2.js"), "utf8");
const start = compat.indexOf("function isDesktopNavigationMode() {");
const end = compat.indexOf("function installZeroWithoutScStockFilter() {");
assert.ok(start >= 0 && end > start, "funções de navegação devem estar disponíveis");
const navigationCode = compat.slice(start, end);

function setupNavigation(desktop) {
  const bootClasses = new Set(["app-booting"]);
  const cssProperties = () => {
    const values = new Map();
    return {
      setProperty(name, value, priority) { values.set(name, { value, priority }); },
      removeProperty(name) { values.delete(name); },
      getPropertyValue(name) { return values.get(name)?.value || ""; },
    };
  };
  const nav = { style: cssProperties(), querySelectorAll: () => [] };
  const navWrap = {
    style: cssProperties(),
    parentElement: { id: "header" },
    dataset: {},
    querySelector: (selector) => selector === ".app-nav" ? nav : null,
  };
  const main = { style: cssProperties() };
  const body = {
    classList: { contains: (name) => bootClasses.has(name) },
    appendChild(node) { node.parentElement = body; },
  };
  const docClasses = new Set();
  const document = {
    body,
    documentElement: {
      classList: {
        add: (name) => docClasses.add(name),
        remove: (name) => docClasses.delete(name),
      },
    },
    querySelector(selector) {
      if (selector === ".app-nav-wrap") return navWrap;
      if (selector === "main.main-content") return main;
      if (selector === ".topbar") return { getBoundingClientRect: () => ({ height: 86 }) };
      return null;
    },
  };
  let notifyReady = null;
  class MutationObserver {
    constructor(callback) { notifyReady = callback; }
    observe() {}
    disconnect() {}
  }
  const window = {
    matchMedia: () => ({ matches: desktop }),
    addEventListener() {},
    setTimeout() { return 1; },
    clearTimeout() {},
  };
  const context = vm.createContext({ document, window, MutationObserver });
  vm.runInContext(navigationCode, context);
  vm.runInContext("installNavigationRepair()", context);
  return {
    body, navWrap,
    completeLoad() {
      bootClasses.delete("app-booting");
      bootClasses.add("app-ready");
      assert.equal(typeof notifyReady, "function", "restauração deve aguardar carregamento");
      notifyReady();
    },
  };
}

test("menu lateral fica oculto durante a inicialização e é restaurado no desktop", () => {
  const { body, navWrap, completeLoad } = setupNavigation(true);
  assert.equal(navWrap.style.getPropertyValue("display"), "none");
  assert.equal(navWrap.style.getPropertyValue("visibility"), "hidden");
  assert.notEqual(navWrap.parentElement, body);
  completeLoad();
  assert.equal(navWrap.parentElement, body);
  assert.equal(navWrap.style.getPropertyValue("display"), "block");
  assert.equal(navWrap.style.getPropertyValue("visibility"), "visible");
});

test("menu inferior do mobile volta após liberar o carregamento", () => {
  const { body, navWrap, completeLoad } = setupNavigation(false);
  assert.equal(navWrap.style.getPropertyValue("display"), "none");
  completeLoad();
  assert.equal(navWrap.parentElement, body);
  assert.equal(navWrap.style.getPropertyValue("display"), "");
  assert.equal(navWrap.style.getPropertyValue("visibility"), "");
  assert.equal(navWrap.style.getPropertyValue("pointer-events"), "");
});

test("tela de inicialização cobre a navegação de alto z-index", () => {
  const css = fs.readFileSync(path.join(ROOT, "app/styles/app.css"), "utf8");
  assert.match(css, /\.startup-screen\s*\{\s*z-index:\s*2147483647\s*!important/);
  assert.match(css, /body\.app-booting\s+\.app-nav-wrap\s*\{/);
});
