"use strict";

/* Bootstrap 2.0 — preserva a aplicação estável, garante o menu e carrega o comparativo mensal. */
const ALMOX_STABLE_APP = "https://cdn.jsdelivr.net/gh/tiagosilvagba/Almoxarifado@0eacb92e7f010bd56a1324d8730a407759925eff/script.js";
const ALMOX_STABLE_FALLBACK = "https://raw.githubusercontent.com/tiagosilvagba/Almoxarifado/0eacb92e7f010bd56a1324d8730a407759925eff/script.js";
const MONTHLY_COMPARISON_MODULE = "./comparativo-mensal.js?v=20260914-3";
const MONTHLY_COMPARISON_FALLBACK = "https://raw.githubusercontent.com/tiagosilvagba/Almoxarifado/main/comparativo-mensal.js?v=20260914-3";

const NAV_ICONS = Object.freeze({
  dashboard: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13h6V4H4v9Zm10 7h6V11h-6v9ZM4 20h6v-3H4v3Zm10-13h6V4h-6v3Z"/></svg>',
  "comparativo-mensal": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V9m6 10V5m6 14v-7m4 7H2"/><path d="m3 7 5-3 5 4 7-5"/></svg>',
  catalogo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4z"/><path d="M8 5v14M4 10h16"/></svg>',
  "necessidade-compra": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h15l-2 8H8L6 3H3"/><circle cx="9" cy="19" r="1.5"/><circle cx="18" cy="19" r="1.5"/></svg>',
  "sc-pendente-of": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l3 3v15H6z"/><path d="M14 3v4h4M9 12h6M9 16h4"/></svg>',
  "consulta-sc-of": '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m14.5 14.5 5 5"/></svg>',
  "tempo-geracao-of": '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  "revisao-min-max": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M4 17h16M14 7l2-2 2 2-2 2-2-2ZM8 17l2-2 2 2-2 2-2-2Z"/></svg>',
  instrucoes: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Z"/><path d="M8 8h7M8 12h7M8 16h4"/></svg>'
});

function loadAlmoxScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function injectNavigationIconStyles() {
  if (document.getElementById("almox-nav-icon-styles")) return;
  const style = document.createElement("style");
  style.id = "almox-nav-icon-styles";
  style.textContent = `
    .app-nav__tab{gap:10px!important}
    .app-nav__icon{width:20px;height:20px;flex:0 0 20px;display:inline-flex;align-items:center;justify-content:center}
    .app-nav__icon svg{width:20px;height:20px;display:block;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
    .app-nav__tab[data-page="dashboard"] .app-nav__icon svg{fill:currentColor;stroke:none}
    .app-nav__label{min-width:0}
    @media(max-width:900px){
      .app-nav__tab{gap:4px!important;flex-direction:column!important}
      .app-nav__icon{width:21px;height:21px;flex-basis:21px}
      .app-nav__icon svg{width:21px;height:21px}
      .app-nav__label{font-size:inherit;line-height:1.05;text-align:center}
    }
  `;
  document.head.appendChild(style);
}

function ensureMonthlyComparisonTab() {
  const nav = document.querySelector(".app-nav");
  if (!nav) return false;

  let tab = nav.querySelector('[data-page="comparativo-mensal"]');
  if (!tab) {
    tab = document.createElement("a");
    tab.className = "app-nav__tab";
    tab.href = "#comparativo-mensal";
    tab.dataset.page = "comparativo-mensal";
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", "false");
    tab.setAttribute("aria-controls", "page-comparativo-mensal");
    tab.textContent = "Comparativo mensal";
    const dashboard = nav.querySelector('[data-page="dashboard"]');
    if (dashboard) dashboard.insertAdjacentElement("afterend", tab);
    else nav.prepend(tab);
  }
  return true;
}

function decorateNavigationTabs() {
  const nav = document.querySelector(".app-nav");
  if (!nav) return false;

  nav.querySelectorAll(".app-nav__tab[data-page]").forEach((tab) => {
    const page = tab.dataset.page;
    const icon = NAV_ICONS[page];
    if (!icon || tab.dataset.iconReady === "true") return;
    const label = (tab.textContent || "").trim();
    tab.textContent = "";
    const iconWrap = document.createElement("span");
    iconWrap.className = "app-nav__icon";
    iconWrap.innerHTML = icon;
    const labelWrap = document.createElement("span");
    labelWrap.className = "app-nav__label";
    labelWrap.textContent = label;
    tab.append(iconWrap, labelWrap);
    tab.dataset.iconReady = "true";
  });
  return true;
}

function prepareNavigationShell() {
  injectNavigationIconStyles();
  if (!ensureMonthlyComparisonTab()) return false;
  decorateNavigationTabs();
  return true;
}

function retryNavigationShell() {
  if (prepareNavigationShell()) return;
  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (prepareNavigationShell() || attempts >= 20) window.clearInterval(timer);
  }, 150);
}

retryNavigationShell();

(async function bootAlmoxarifado() {
  try { await loadAlmoxScript(ALMOX_STABLE_APP); }
  catch { await loadAlmoxScript(ALMOX_STABLE_FALLBACK); }

  prepareNavigationShell();
  window.setTimeout(prepareNavigationShell, 300);
  window.setTimeout(prepareNavigationShell, 1200);

  try {
    await loadAlmoxScript(MONTHLY_COMPARISON_MODULE);
  } catch (error) {
    try { await loadAlmoxScript(MONTHLY_COMPARISON_FALLBACK); }
    catch (fallbackError) { console.error("Não foi possível carregar o comparativo mensal.", fallbackError || error); }
  }

  prepareNavigationShell();
  if (typeof forceResponsiveNavigation === "function") window.setTimeout(forceResponsiveNavigation, 50);
})();
