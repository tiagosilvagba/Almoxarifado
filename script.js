"use strict";

/* Bootstrap estável 2.0 — carrega diretamente a aplicação-base funcional. */
const ALMOX_BASE = "https://cdn.jsdelivr.net/gh/tiagosilvagba/Almoxarifado@10730819db42aad163c4b3c335e60058b95e67ab/script.js";
const ALMOX_BASE_FALLBACK = "https://raw.githubusercontent.com/tiagosilvagba/Almoxarifado/10730819db42aad163c4b3c335e60058b95e67ab/script.js";
const CURRENT_VERSION_LABEL = "Versão 2.0";
const CURRENT_ASSET_VERSION = "2-0-20260914-1";
const CUSTOM_THEMES = [
  ["azul-corporativo","Azul Corporativo · Confiança"],
  ["verde-industrial-2","Verde Industrial · Resultado"],
  ["amber-tech","Amber Tech · Energia"],
  ["vermelho-impacto","Vermelho Impacto · Atenção"],
  ["ciano-clean","Ciano Clean · Leve"],
  ["rosa-premium","Rosa Premium · Elegante"],
  ["night-minimal","Night Minimal · Simples"],
  ["clean-light-2","Clean Light · Claro"],
  ["areia-industrial","Areia Industrial · Sofisticado"],
  ["galaxia","Galáxia · Futurista"],
  ["palmeiras","Palmeiras · Especial"],
];

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function loadCurrentStylesheet() {
  const id = "almox-current-style";
  let link = document.getElementById(id);
  if (!link) {
    link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }
  const href = `style.css?v=${CURRENT_ASSET_VERSION}`;
  if (!link.href.endsWith(href)) link.href = href;
}

function enforceVersion() {
  const badge = document.getElementById("versionBadge");
  if (badge) badge.textContent = CURRENT_VERSION_LABEL;
}

function isDesktopNavigationMode() {
  return window.matchMedia("(min-width: 900px)").matches || window.matchMedia("(hover:hover) and (pointer:fine)").matches;
}

function setImportantStyle(node, property, value) {
  if (node) node.style.setProperty(property, value, "important");
}

function clearForcedDesktopStyles(navWrap, nav, main) {
  const wrapProps = ["display","visibility","opacity","position","z-index","left","right","top","bottom","width","height","max-height","overflow-y","overflow-x","transform","clip","clip-path","pointer-events","background","border-right","border-top","border-bottom","box-shadow"];
  const navProps = ["display","flex-direction","align-items","gap","width","max-width","height","margin","padding","overflow","scroll-snap-type"];
  const mainProps = ["margin-left","width","max-width","padding-left","padding-right","padding-bottom"];
  wrapProps.forEach((p) => navWrap?.style.removeProperty(p));
  navProps.forEach((p) => nav?.style.removeProperty(p));
  mainProps.forEach((p) => main?.style.removeProperty(p));
  nav?.querySelectorAll(".app-nav__tab").forEach((tab) => {
    ["display","flex","align-items","justify-content","width","min-width","min-height","padding","white-space","text-align","font-size","line-height","border-radius","pointer-events"].forEach((p) => tab.style.removeProperty(p));
  });
}

function forceResponsiveNavigation() {
  const navWrap = document.querySelector(".app-nav-wrap");
  const nav = navWrap?.querySelector(".app-nav");
  const main = document.querySelector("main.main-content");
  if (!navWrap || !nav) return;

  if (navWrap.parentElement !== document.body) document.body.appendChild(navWrap);
  navWrap.dataset.detachedNavigation = "true";

  if (!isDesktopNavigationMode()) {
    document.documentElement.classList.remove("desktop-nav-forced");
    clearForcedDesktopStyles(navWrap, nav, main);
    return;
  }

  document.documentElement.classList.add("desktop-nav-forced");
  const topbar = document.querySelector(".topbar");
  const topOffset = Math.max(70, Math.round(topbar?.getBoundingClientRect().height || 86));
  const sideWidth = 250;

  setImportantStyle(navWrap,"display","block");
  setImportantStyle(navWrap,"visibility","visible");
  setImportantStyle(navWrap,"opacity","1");
  setImportantStyle(navWrap,"position","fixed");
  setImportantStyle(navWrap,"z-index","2147483000");
  setImportantStyle(navWrap,"left","0");
  setImportantStyle(navWrap,"right","auto");
  setImportantStyle(navWrap,"top",`${topOffset}px`);
  setImportantStyle(navWrap,"bottom","0");
  setImportantStyle(navWrap,"width",`${sideWidth}px`);
  setImportantStyle(navWrap,"height","auto");
  setImportantStyle(navWrap,"max-height","none");
  setImportantStyle(navWrap,"overflow-y","auto");
  setImportantStyle(navWrap,"overflow-x","hidden");
  setImportantStyle(navWrap,"transform","none");
  setImportantStyle(navWrap,"clip","auto");
  setImportantStyle(navWrap,"clip-path","none");
  setImportantStyle(navWrap,"pointer-events","auto");
  setImportantStyle(navWrap,"background","var(--navy-900, #0b1730)");
  setImportantStyle(navWrap,"border-right","1px solid var(--steel-200, rgba(148,163,184,.22))");
  setImportantStyle(navWrap,"border-top","0");
  setImportantStyle(navWrap,"border-bottom","0");
  setImportantStyle(navWrap,"box-shadow","10px 0 30px rgba(0,0,0,.16)");

  setImportantStyle(nav,"display","flex");
  setImportantStyle(nav,"flex-direction","column");
  setImportantStyle(nav,"align-items","stretch");
  setImportantStyle(nav,"gap","7px");
  setImportantStyle(nav,"width","100%");
  setImportantStyle(nav,"max-width","none");
  setImportantStyle(nav,"height","auto");
  setImportantStyle(nav,"margin","0");
  setImportantStyle(nav,"padding","18px 12px 28px");
  setImportantStyle(nav,"overflow","visible");
  setImportantStyle(nav,"scroll-snap-type","none");

  nav.querySelectorAll(".app-nav__tab").forEach((tab) => {
    setImportantStyle(tab,"display","flex");
    setImportantStyle(tab,"flex","0 0 auto");
    setImportantStyle(tab,"align-items","center");
    setImportantStyle(tab,"justify-content","flex-start");
    setImportantStyle(tab,"width","100%");
    setImportantStyle(tab,"min-width","0");
    setImportantStyle(tab,"min-height","46px");
    setImportantStyle(tab,"padding","11px 14px");
    setImportantStyle(tab,"white-space","normal");
    setImportantStyle(tab,"text-align","left");
    setImportantStyle(tab,"font-size","14px");
    setImportantStyle(tab,"line-height","1.25");
    setImportantStyle(tab,"border-radius","11px");
    setImportantStyle(tab,"pointer-events","auto");
  });

  setImportantStyle(main,"margin-left",`${sideWidth}px`);
  setImportantStyle(main,"width","auto");
  setImportantStyle(main,"max-width","none");
  setImportantStyle(main,"padding-left","clamp(18px,2.2vw,34px)");
  setImportantStyle(main,"padding-right","clamp(18px,2.2vw,34px)");
  setImportantStyle(main,"padding-bottom","24px");
}

function installNavigationRepair() {
  forceResponsiveNavigation();
  let timer = null;
  window.addEventListener("resize", () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(forceResponsiveNavigation, 80);
  });
  window.setTimeout(forceResponsiveNavigation, 250);
  window.setTimeout(forceResponsiveNavigation, 900);
  window.setTimeout(forceResponsiveNavigation, 2000);
}

function installZeroWithoutScStockFilter() {
  const select = document.getElementById("stockStatusFilter");
  if (!select || typeof positionMatchesStatus !== "function") return;

  if (!select.querySelector('option[value="zero-no-sc"]')) {
    const option = document.createElement("option");
    option.value = "zero-no-sc";
    option.textContent = "Itens zerados sem SC";
    const zeroOption = select.querySelector('option[value="zero"]');
    if (zeroOption) zeroOption.insertAdjacentElement("afterend", option);
    else select.appendChild(option);
    select.size = Math.max(Number(select.size || 0), 5);
  }

  if (positionMatchesStatus.__zeroWithoutScPatched) return;
  const originalPositionMatchesStatus = positionMatchesStatus;
  let cachedItems = null;
  const ownerByPosition = new WeakMap();

  function refreshPositionOwners() {
    if (cachedItems === state.items) return;
    cachedItems = state.items;
    for (const item of state.items || []) for (const position of item.positions || []) ownerByPosition.set(position, item);
  }

  function zeroPositionHasNoActiveSc(position) {
    refreshPositionOwners();
    const item = ownerByPosition.get(position);
    if (!item) return false;
    const branchCode = String(position.branchCode || "");
    const hasActiveSc = (item.history || []).some((record) => {
      const sc = record.sc;
      if (!sc?.code) return false;
      if (typeof isWarehouseSc === "function" && !isWarehouseSc(sc)) return false;
      if (typeof isActiveScForPurchaseCoverage === "function" && !isActiveScForPurchaseCoverage(sc)) return false;
      const recordBranch = String(record.branchCode || "");
      return !branchCode || !recordBranch || recordBranch === branchCode;
    });
    return !hasActiveSc;
  }

  positionMatchesStatus = function patchedPositionMatchesStatus(position, status) {
    if (status !== "zero-no-sc") return originalPositionMatchesStatus(position, status);
    return originalPositionMatchesStatus(position, "zero") && zeroPositionHasNoActiveSc(position);
  };
  positionMatchesStatus.__zeroWithoutScPatched = true;
}

function installCustomThemes() {
  const select = document.getElementById("themeSelect");
  if (!select) return;
  if (!select.querySelector('optgroup[data-custom-themes="true"]')) {
    const group = document.createElement("optgroup");
    group.label = "Temas especiais";
    group.dataset.customThemes = "true";
    for (const [id,label] of CUSTOM_THEMES) {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = label;
      group.appendChild(option);
    }
    select.appendChild(group);
  }
  try {
    const saved = localStorage.getItem("almoxarifado-theme");
    if (CUSTOM_THEMES.some(([id]) => id === saved)) {
      document.documentElement.dataset.theme = saved;
      select.value = saved;
    }
  } catch {}
  select.addEventListener("change", () => {
    if (!CUSTOM_THEMES.some(([id]) => id === select.value)) return;
    document.documentElement.dataset.theme = select.value;
    try { localStorage.setItem("almoxarifado-theme", select.value); } catch {}
  });
}

function repairFilters() {
  const panel = document.getElementById("globalFiltersPanel");
  const close = document.getElementById("closeFiltersButton");
  const trigger = document.getElementById("filterToggleButton");
  const hide = () => {
    document.querySelectorAll(".excel-filter").forEach((control) => {
      control.classList.remove("is-open");
      control.querySelector(".excel-filter__menu")?.classList.add("is-hidden");
      control.querySelector(".excel-filter__trigger")?.setAttribute("aria-expanded","false");
    });
    panel?.classList.add("is-hidden");
    panel?.setAttribute("hidden","");
    trigger?.setAttribute("aria-expanded","false");
  };
  close?.addEventListener("click", (e) => { e.preventDefault(); hide(); }, true);
  close?.addEventListener("pointerup", (e) => { e.preventDefault(); hide(); }, true);
  trigger?.addEventListener("click", () => panel?.removeAttribute("hidden"), true);
  document.addEventListener("input", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.classList.contains("excel-filter__search")) return;
    const q = input.value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
    input.closest(".excel-filter")?.querySelectorAll(".excel-filter__option").forEach((row) => {
      const text = (row.textContent || "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
      row.style.display = q && !text.includes(q) ? "none" : "";
    });
  }, true);
}

function installZeroWithoutScMetric() {
  if (typeof updateDashboardMetrics !== "function" || document.getElementById("metricZeroWithoutSc")) return;
  const grid = document.querySelector("#page-dashboard .metrics-grid--secondary");
  if (!grid) return;
  const card = document.createElement("button");
  card.className = "metric metric--red metric--zero-without-sc";
  card.type = "button";
  card.innerHTML = '<span class="metric__label">Itens zerados sem SC</span><strong id="metricZeroWithoutSc">—</strong><small>zerados parametrizados sem SC ativa na filial</small>';
  card.addEventListener("click", () => typeof navigateToPage === "function" && navigateToPage("necessidade-compra"));
  grid.appendChild(card);

  const original = updateDashboardMetrics;
  updateDashboardMetrics = function(...args) {
    const result = original.apply(this,args);
    try {
      const codes = new Set();
      for (const item of state.filteredItems || []) {
        const positions = (currentScopedPositions(item) || []).filter((p) => positionMatchesStatus(p,"zero-no-sc"));
        if (positions.length) codes.add(item.code);
      }
      const node = document.getElementById("metricZeroWithoutSc");
      if (node) node.textContent = new Intl.NumberFormat("pt-BR",{maximumFractionDigits:0}).format(codes.size);
    } catch {}
    return result;
  };
  updateDashboardMetrics();
}

async function registerCacheLater() {
  if (!("serviceWorker" in navigator)) return;
  try { await navigator.serviceWorker.register("./sw-data-cache.js", {scope:"./", updateViaCache:"none"}); } catch (e) { console.warn("Cache indisponível",e); }
}

(async function start() {
  loadCurrentStylesheet();
  try { await loadScript(ALMOX_BASE); }
  catch { await loadScript(ALMOX_BASE_FALLBACK); }

  installZeroWithoutScStockFilter();

  try {
    if (document.readyState !== "loading" && typeof init === "function") await init();
  } catch (e) {
    console.error("Falha ao iniciar aplicação",e);
  }

  installNavigationRepair();
  enforceVersion();
  installCustomThemes();
  repairFilters();
  installZeroWithoutScMetric();
  window.setTimeout(enforceVersion,500);
  window.setTimeout(enforceVersion,1500);
  registerCacheLater();
})();
