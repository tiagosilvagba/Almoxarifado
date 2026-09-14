"use strict";

/* Bootstrap estável 2.0 — carrega diretamente a aplicação-base funcional. */
const ALMOX_BASE = "https://cdn.jsdelivr.net/gh/tiagosilvagba/Almoxarifado@10730819db42aad163c4b3c335e60058b95e67ab/script.js";
const ALMOX_BASE_FALLBACK = "https://raw.githubusercontent.com/tiagosilvagba/Almoxarifado/10730819db42aad163c4b3c335e60058b95e67ab/script.js";
const CURRENT_VERSION_LABEL = "Versão 2.0";
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

function enforceVersion() {
  const badge = document.getElementById("versionBadge");
  if (badge) badge.textContent = CURRENT_VERSION_LABEL;
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
        const positions = (currentScopedPositions(item) || []).filter((p) => positionMatchesStatus(p,"zero"));
        if (!positions.length) continue;
        const uncovered = positions.some((position) => !(item.history || []).some((record) => {
          const sc = record.sc;
          if (!sc?.code || !isWarehouseSc(sc) || !isActiveScForPurchaseCoverage(sc)) return false;
          const a = String(position.branchCode || "");
          const b = String(record.branchCode || "");
          return !a || !b || a === b;
        }));
        if (uncovered) codes.add(item.code);
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
  try { await loadScript(ALMOX_BASE); }
  catch { await loadScript(ALMOX_BASE_FALLBACK); }

  try {
    if (document.readyState !== "loading" && typeof init === "function") await init();
  } catch (e) {
    console.error("Falha ao iniciar aplicação",e);
  }

  enforceVersion();
  installCustomThemes();
  repairFilters();
  installZeroWithoutScMetric();
  window.setTimeout(enforceVersion,500);
  window.setTimeout(enforceVersion,1500);
  registerCacheLater();
})();
