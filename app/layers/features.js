"use strict";

/* Bootstrap 2.0 — preserva a aplicação estável e adiciona melhorias incrementais. */
const ALMOX_STABLE_APP = "./app/layers/compat-v2.js?v=10.6";
const ALMOX_STABLE_FALLBACK = ALMOX_STABLE_APP;
const MONTHLY_COMPARISON_MODULE = "./app/modules/comparativo-mensal-core.js?v=7.0";
const MONTHLY_COMPARISON_FALLBACK = MONTHLY_COMPARISON_MODULE;
const AREA_MASTER_FILE = "./02 - Responsaveis_Reposição.CSV?area=20260917-1";

const NAV_ICONS = Object.freeze({
  dashboard: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13h6V4H4v9Zm10 7h6V11h-6v9ZM4 20h6v-3H4v3Zm10-13h6V4h-6v3Z"/></svg>',
  "comparativo-mensal": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V9m6 10V5m6 14v-7m4 7H2"/><path d="m3 7 5-3 5 4 7-5"/></svg>',
  catalogo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4z"/><path d="M8 5v14M4 10h16"/></svg>',
  "necessidade-compra": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h15l-2 8H8L6 3H3"/><circle cx="9" cy="19" r="1.5"/><circle cx="18" cy="19" r="1.5"/></svg>',
  "sc-pendente-of": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l3 3v15H6z"/><path d="M14 3v4h4M9 12h6M9 16h4"/></svg>',
  "consulta-sc-of": '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m14.5 14.5 5 5"/></svg>',
  "tempo-geracao-of": '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  consumo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V9m5 10V5m5 14v-7m5 7V3"/><path d="M2 19h20"/></svg>',
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
    const instructions = nav.querySelector('[data-page="instrucoes"]');
    if (instructions) nav.insertBefore(tab, instructions);
    else nav.append(tab);
  }
  const instructions = nav.querySelector('[data-page="instrucoes"]');
  if (instructions && tab.nextElementSibling !== instructions) nav.insertBefore(tab, instructions);
  return true;
}

function decorateNavigationTabs() {
  const nav = document.querySelector(".app-nav");
  if (!nav) return false;
  nav.querySelectorAll(".app-nav__tab[data-page]").forEach((tab) => {
    const icon = NAV_ICONS[tab.dataset.page];
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

function synchronizeThemeChrome() {
  const navWrap = document.querySelector(".app-nav-wrap");
  const topbar = document.querySelector(".topbar");
  [navWrap, topbar].forEach((node) => {
    if (!node) return;
    node.style.setProperty("background", "var(--app-chrome-background)", "important");
    node.style.setProperty("border-color", "var(--app-chrome-border)", "important");
    node.style.setProperty("color", "var(--app-chrome-text)", "important");
  });
  if (navWrap) {
    if (window.matchMedia("(min-width:901px), (hover:hover) and (pointer:fine)").matches) {
      navWrap.style.setProperty("border-right-color", "var(--app-chrome-border)", "important");
      navWrap.style.setProperty("border-top-color", "transparent", "important");
    } else {
      navWrap.style.setProperty("border-top-color", "var(--app-chrome-border)", "important");
    }
  }
}

function patchResponsiveNavigationThemeSync() {
  if (typeof forceResponsiveNavigation !== "function" || forceResponsiveNavigation.__themeChromeSynced) return;
  const original = forceResponsiveNavigation;
  forceResponsiveNavigation = function synchronizedResponsiveNavigation(...args) {
    const result = original.apply(this, args);
    synchronizeThemeChrome();
    return result;
  };
  forceResponsiveNavigation.__themeChromeSynced = true;
}

function installThemeSynchronization() {
  patchResponsiveNavigationThemeSync();
  synchronizeThemeChrome();
  document.getElementById("themeSelect")?.addEventListener("change", () => {
    requestAnimationFrame(() => {
      synchronizeThemeChrome();
      if (typeof forceResponsiveNavigation === "function") forceResponsiveNavigation();
    });
  }, true);
  const observer = new MutationObserver((mutations) => {
    if (!mutations.some((mutation) => mutation.type === "attributes" && mutation.attributeName === "data-theme")) return;
    requestAnimationFrame(() => {
      synchronizeThemeChrome();
      if (typeof forceResponsiveNavigation === "function") forceResponsiveNavigation();
    });
  });
  observer.observe(document.documentElement, { attributes:true, attributeFilter:["data-theme"] });
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(synchronizeThemeChrome, 90);
  }, { passive:true });
  [100,350,750,1100,2200].forEach((delay) => window.setTimeout(() => {
    patchResponsiveNavigationThemeSync();
    synchronizeThemeChrome();
  }, delay));
}

const globalAreaMap = new Map();
let globalAreaMasterPromise = null;

function areaNormalize(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}

function areaKeyPart(value) {
  const text = String(value ?? "").trim();
  return /^0*\d+$/.test(text) ? String(Number(text)) : areaNormalize(text);
}

function areaPositionKey(branch, local) {
  return `${areaKeyPart(branch)}::${areaKeyPart(local)}`;
}

function parseAreaCsv(text) {
  text = String(text || "").replace(/^\uFEFF/,"");
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return {headers:[],rows:[]};
  const delimiter = lines[0].includes(";") ? ";" : ",";
  const parseLine = (line) => {
    const out = []; let value = ""; let quoted = false;
    for (let i=0;i<line.length;i+=1) {
      const char=line[i];
      if (quoted) {
        if (char === '"' && line[i+1] === '"') { value += '"'; i += 1; }
        else if (char === '"') quoted=false;
        else value += char;
      } else if (char === '"') quoted=true;
      else if (char === delimiter) { out.push(value); value=""; }
      else value += char;
    }
    out.push(value);
    return out;
  };
  return {headers:parseLine(lines[0]).map((v)=>v.trim()), rows:lines.slice(1).map(parseLine)};
}

function areaColumn(headers, names) {
  const normalized = headers.map(areaNormalize);
  for (const name of names) {
    const index = normalized.indexOf(areaNormalize(name));
    if (index >= 0) return index;
  }
  return -1;
}

async function loadGlobalAreaMaster() {
  if (globalAreaMasterPromise) return globalAreaMasterPromise;
  globalAreaMasterPromise = (async () => {
    const response = await fetch(encodeURI(AREA_MASTER_FILE), {cache:"no-store"});
    if (!response.ok) throw new Error("Não foi possível ler a área dos responsáveis.");
    const buffer = await response.arrayBuffer();
    let text = new TextDecoder("utf-8").decode(buffer);
    if (text.includes("�")) {
      try { text = new TextDecoder("windows-1252").decode(buffer); } catch {}
    }
    const parsed = parseAreaCsv(text);
    const branchIndex = areaColumn(parsed.headers,["FILIAL","CD FILIAL"]);
    const localIndex = areaColumn(parsed.headers,["CD LOCAL","LOCAL"]);
    const areaIndex = areaColumn(parsed.headers,["Área","Area"]);
    if (branchIndex < 0 || localIndex < 0 || areaIndex < 0) return;
    globalAreaMap.clear();
    for (const row of parsed.rows) {
      const branch=String(row[branchIndex] ?? "").trim();
      const local=String(row[localIndex] ?? "").trim();
      const area=String(row[areaIndex] ?? "").trim();
      if (!branch || !local || !area) continue;
      const key=areaPositionKey(branch,local);
      const values=globalAreaMap.get(key) || new Set();
      values.add(area);
      globalAreaMap.set(key,values);
    }
  })();
  return globalAreaMasterPromise;
}

function ensureGlobalAreaFilterUi() {
  const existing = document.getElementById("areaFilter");
  if (existing) {
    if (typeof ui !== "undefined") ui.areaFilter = existing;
    return existing;
  }
  const responsible = document.getElementById("replenishmentResponsibleFilter");
  const parent = responsible?.closest(".field");
  if (!parent) return null;
  const label = document.createElement("label");
  label.className = "field";
  label.dataset.areaFilterField = "true";
  label.innerHTML = '<span>Área responsável pelo local</span><select id="areaFilter" multiple size="3"><option value="">Todas as áreas</option></select>';
  parent.insertAdjacentElement("afterend",label);
  if (typeof ui !== "undefined") ui.areaFilter = label.querySelector("select");
  return ui.areaFilter;
}

function areasForGlobalPosition(position) {
  const direct = position?.responsibleAreas || [];
  if (direct.length) return direct;
  return [...(globalAreaMap.get(areaPositionKey(position?.branchCode,position?.localCode)) || [])];
}

function globalAreaValues() {
  if (typeof ui === "undefined" || !ui.areaFilter || typeof filterValues !== "function") return [];
  return filterValues(ui.areaFilter);
}

function globalPositionMatchesArea(position, selected = globalAreaValues()) {
  if (!selected.length) return true;
  const areas = areasForGlobalPosition(position);
  return selected.some((value) => areas.includes(value));
}

function annotateGlobalAreas() {
  if (typeof state === "undefined" || !state.items?.length) return false;
  for (const item of state.items) {
    const itemAreas = new Set();
    for (const position of item.positions || []) {
      position.responsibleAreas = areasForGlobalPosition(position);
      position.responsibleAreas.forEach((area) => itemAreas.add(area));
    }
    item.responsibleAreas = [...itemAreas];
    if (item.searchText && itemAreas.size) item.searchText = `${item.searchText} ${areaNormalize([...itemAreas].join(" "))}`;
  }
  return true;
}

function populateGlobalAreaFilter() {
  if (typeof ui === "undefined" || !ui.areaFilter) return;
  const current = typeof filterValues === "function" ? filterValues(ui.areaFilter) : [];
  const values = new Set();
  if (typeof state !== "undefined") {
    for (const item of state.items || []) for (const position of item.positions || []) {
      for (const area of areasForGlobalPosition(position)) if (area) values.add(area);
    }
  }
  const entries = [...values].sort((a,b)=>a.localeCompare(b,"pt-BR",{sensitivity:"base"}));
  ui.areaFilter.replaceChildren(new Option("Todas as áreas",""));
  entries.forEach((value)=>ui.areaFilter.append(new Option(value,value)));
  if (typeof setFilterValues === "function") setFilterValues(ui.areaFilter,current.filter((value)=>values.has(value)));
}

function bindGlobalAreaSelect() {
  const select = ui.areaFilter;
  if (!select || select.dataset.areaBound === "true") return;
  select.dataset.areaBound = "true";
  select.addEventListener("mousedown",(event)=>{
    const option=event.target.closest?.("option");
    if (!option || event.button !== 0) return;
    event.preventDefault();
    if (!option.value) setFilterValues(select,[]);
    else {
      option.selected=!option.selected;
      normalizeMultiSelection(select);
    }
    select.dispatchEvent(new Event("change",{bubbles:true}));
  });
  select.addEventListener("change",()=>{
    normalizeMultiSelection(select);
    syncExcelFilterControl(select);
    markFilterDraftDirty();
  });
}

function patchGlobalAreaFiltering() {
  if (typeof applyFilters !== "function" || applyFilters.__areaPatched) return false;
  const areaSelect=ensureGlobalAreaFilterUi();
  if (!areaSelect) return false;
  if (!MULTI_FILTER_IDS.includes("areaFilter")) MULTI_FILTER_IDS.splice(3,0,"areaFilter");
  ui.areaFilter=areaSelect;
  initializeExcelFilterControls();
  bindGlobalAreaSelect();

  const originalPopulateFilters=populateFilters;
  populateFilters=function(...args){
    const result=originalPopulateFilters.apply(this,args);
    populateGlobalAreaFilter();
    return result;
  };

  const originalCurrentScopedPositions=currentScopedPositions;
  currentScopedPositions=function(item,includeStatus=true){
    return originalCurrentScopedPositions(item,includeStatus).filter((position)=>globalPositionMatchesArea(position));
  };

  const originalDraftPositions=draftPositions;
  draftPositions=function(item,excludedFilterId){
    const positions=originalDraftPositions(item,excludedFilterId);
    if (excludedFilterId === "areaFilter") return positions;
    return positions.filter((position)=>globalPositionMatchesArea(position));
  };

  const originalItemMatchesDraftFilters=itemMatchesDraftFilters;
  itemMatchesDraftFilters=function(item,excludedFilterId,statusOverride){
    if (!originalItemMatchesDraftFilters(item,excludedFilterId,statusOverride)) return false;
    const selected=excludedFilterId === "areaFilter" ? [] : globalAreaValues();
    if (!selected.length) return true;
    return (item.positions || []).some((position)=>globalPositionMatchesArea(position,selected));
  };

  const originalApplyFilters=applyFilters;
  applyFilters=function(renderCatalog=true){
    originalApplyFilters(false);
    const selected=globalAreaValues();
    if (selected.length) {
      state.filteredItems=state.filteredItems.filter((item)=>(item.positions || []).some((position)=>globalPositionMatchesArea(position,selected)));
      if (ui.resultCount) ui.resultCount.textContent=pluralize(state.filteredItems.length,"item","itens");
    }
    if (renderCatalog) renderCatalogResults();
  };
  applyFilters.__areaPatched=true;

  const originalCapture=captureFilterValues;
  captureFilterValues=function(){
    const values=originalCapture();
    values.areaFilter=filterValues(ui.areaFilter);
    return values;
  };

  const originalClear=clearFilters;
  clearFilters=function(...args){
    const result=originalClear.apply(this,args);
    setFilterValues(ui.areaFilter,[]);
    populateGlobalAreaFilter();
    return result;
  };

  const originalSummary=updateFilterSummary;
  updateFilterSummary=function(...args){
    originalSummary.apply(this,args);
    const selected=[...ui.areaFilter.selectedOptions].filter((option)=>option.value);
    if (!selected.length) return;
    if (!ui.filterSummary.querySelector("button")) ui.filterSummary.replaceChildren();
    for (const option of selected) {
      const button=document.createElement("button");
      button.type="button";
      button.dataset.clearFilter="areaFilter";
      button.dataset.clearFilterValue=option.value;
      button.title=`Remover filtro Área: ${option.textContent || option.value}`;
      const span=document.createElement("span");
      span.textContent=`Área: ${option.textContent || option.value}`;
      const close=document.createElement("b");
      close.setAttribute("aria-hidden","true");
      close.textContent="×";
      button.append(span,close);
      ui.filterSummary.append(button);
    }
    const baseCount=Number(ui.activeFilterCount.textContent || 0);
    ui.activeFilterCount.textContent=String(baseCount + selected.length);
    ui.activeFilterCount.classList.remove("is-hidden");
  };

  return true;
}

async function installGlobalAreaFeature() {
  try { await loadGlobalAreaMaster(); } catch (error) { console.warn("Área responsável indisponível.",error); }
  let attempts=0;
  const timer=setInterval(()=>{
    attempts+=1;
    const baseReady=typeof ui !== "undefined" && typeof state !== "undefined" && typeof applyFilters === "function";
    if (!baseReady) {
      if (attempts > 80) clearInterval(timer);
      return;
    }
    patchGlobalAreaFiltering();
    if (!state.items?.length) return;
    annotateGlobalAreas();
    populateGlobalAreaFilter();
    clearInterval(timer);
  },150);
}

function prepareNavigationShell() {
  injectNavigationIconStyles();
  if (!ensureMonthlyComparisonTab()) return false;
  decorateNavigationTabs();
  synchronizeThemeChrome();
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
  installThemeSynchronization();
  installGlobalAreaFeature();
  window.setTimeout(prepareNavigationShell, 300);
  window.setTimeout(prepareNavigationShell, 1200);

  try {
    await loadAlmoxScript(MONTHLY_COMPARISON_MODULE);
  } catch (error) {
    try { await loadAlmoxScript(MONTHLY_COMPARISON_FALLBACK); }
    catch (fallbackError) { console.error("Não foi possível carregar o comparativo mensal.", fallbackError || error); }
  }

  prepareNavigationShell();
  patchResponsiveNavigationThemeSync();
  synchronizeThemeChrome();
  if (typeof forceResponsiveNavigation === "function") window.setTimeout(forceResponsiveNavigation, 50);
})();
