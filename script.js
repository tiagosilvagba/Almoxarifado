"use strict";

/*
 * Bootstrap de dados — 2026-09-11
 * Preserva a aplicação consolidada e adiciona cache inteligente dos CSVs,
 * correções dos filtros e sincronização da camada visual com os dados.
 */

const ALMOX_APP_SOURCE = "https://cdn.jsdelivr.net/gh/tiagosilvagba/Almoxarifado@10730819db42aad163c4b3c335e60058b95e67ab/script.js";
const ALMOX_APP_FALLBACK = "https://raw.githubusercontent.com/tiagosilvagba/Almoxarifado/10730819db42aad163c4b3c335e60058b95e67ab/script.js";
const FILTER_IDS = [
  "branchFilter", "locationFilter", "replenishmentResponsibleFilter", "categoryFilter",
  "unitFilter", "supplierFilter", "requesterFilter", "ccuClassificationFilter",
  "itemCodeFilter", "stockStatusFilter", "scStatusFilter",
];
let csvRefreshTimer = null;
let applicationInitialized = false;
let filterRepairInitialized = false;
let filterMutationObserver = null;

function loadApplicationScript(source) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = source;
    script.async = false;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function ensureCsvCacheWorker() {
  if (!("serviceWorker" in navigator)) return;

  try {
    await navigator.serviceWorker.register("./sw-data-cache.js", { scope: "./" });
    await navigator.serviceWorker.ready;

    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => {
        const timer = window.setTimeout(resolve, 1800);
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          window.clearTimeout(timer);
          resolve();
        }, { once: true });
      });
    }
  } catch (error) {
    console.warn("Cache inteligente de CSV indisponível; usando carregamento normal.", error);
  }
}

function normalizeFilterText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

function filterVisibleExcelOptions(searchInput) {
  const control = searchInput.closest(".excel-filter");
  if (!control) return;
  const query = normalizeFilterText(searchInput.value);
  for (const row of control.querySelectorAll(".excel-filter__option")) {
    row.hidden = Boolean(query) && !normalizeFilterText(row.textContent).includes(query);
  }
}

function syncAllExcelFilters() {
  if (typeof window.syncExcelFilterControl !== "function") return;
  for (const id of FILTER_IDS) {
    const select = document.getElementById(id);
    if (select) window.syncExcelFilterControl(select);
  }
}

function closeFilterMenus() {
  for (const control of document.querySelectorAll(".excel-filter")) {
    control.classList.remove("is-open");
    control.querySelector(".excel-filter__menu")?.classList.add("is-hidden");
    control.querySelector(".excel-filter__trigger")?.setAttribute("aria-expanded", "false");
  }
}

function forceHideGlobalFilters() {
  const panel = document.getElementById("globalFiltersPanel");
  const trigger = document.getElementById("filterToggleButton");
  if (!panel) return;
  closeFilterMenus();
  panel.classList.add("is-hidden");
  panel.removeAttribute("aria-busy");
  trigger?.setAttribute("aria-expanded", "false");
}

function refreshFilterOptionsAfterApply() {
  const selectedById = new Map();
  for (const id of FILTER_IDS) {
    const select = document.getElementById(id);
    if (!select) continue;
    selectedById.set(id, [...select.selectedOptions].map((option) => option.value).filter(Boolean));
  }

  if (typeof window.populateFilters === "function") {
    try { window.populateFilters(); } catch (error) { console.warn("Não foi possível atualizar as opções dos filtros.", error); }
  }

  for (const [id, values] of selectedById) {
    const select = document.getElementById(id);
    if (!select) continue;
    const selected = new Set(values);
    for (const option of select.options) {
      option.selected = option.value ? selected.has(option.value) : selected.size === 0;
    }
  }

  syncAllExcelFilters();
}

function initializeFilterRepairs() {
  if (filterRepairInitialized) return;
  filterRepairInitialized = true;

  const closeButton = document.getElementById("closeFiltersButton");
  const applyButton = document.getElementById("applyFiltersButton");
  const panel = document.getElementById("globalFiltersPanel");

  /* Garante que o X sempre feche o painel, mesmo se a rotina original falhar. */
  closeButton?.addEventListener("click", () => {
    window.requestAnimationFrame(forceHideGlobalFilters);
  }, true);

  /* Pesquisa delegada: funciona mesmo quando a lista visual é reconstruída. */
  document.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.classList.contains("excel-filter__search")) return;
    filterVisibleExcelOptions(target);
  }, true);

  /* Depois de Concluir e fechar, atualiza as listas e só então fecha. */
  applyButton?.addEventListener("click", () => {
    window.setTimeout(() => {
      refreshFilterOptionsAfterApply();
      forceHideGlobalFilters();
    }, 0);
  });

  /* Se as opções mudarem por atualização dos CSVs, a camada visual acompanha. */
  filterMutationObserver = new MutationObserver((mutations) => {
    const changedSelects = new Set();
    for (const mutation of mutations) {
      const target = mutation.target instanceof HTMLOptionElement ? mutation.target.parentElement : mutation.target;
      const select = target instanceof HTMLSelectElement ? target : target?.closest?.("select");
      if (select && FILTER_IDS.includes(select.id)) changedSelects.add(select);
    }
    if (!changedSelects.size || typeof window.syncExcelFilterControl !== "function") return;
    window.requestAnimationFrame(() => {
      for (const select of changedSelects) window.syncExcelFilterControl(select);
    });
  });

  for (const id of FILTER_IDS) {
    const select = document.getElementById(id);
    if (select) filterMutationObserver.observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ["selected", "disabled"] });
  }

  panel?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") window.requestAnimationFrame(forceHideGlobalFilters);
  }, true);

  syncAllExcelFilters();
}

function bindCsvUpdateListener() {
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type !== "almoxarifado-csv-updated") return;

    window.clearTimeout(csvRefreshTimer);
    csvRefreshTimer = window.setTimeout(async () => {
      if (typeof window.loadCatalog === "function") {
        try {
          await window.loadCatalog();
          window.setTimeout(refreshFilterOptionsAfterApply, 0);
        } catch (error) {
          console.warn("Falha ao atualizar catálogo após alteração dos CSVs.", error);
        }
      } else {
        window.location.reload();
      }
    }, 350);
  });
}

async function initializeLoadedApplication() {
  if (applicationInitialized) return;
  applicationInitialized = true;

  if (document.readyState !== "loading" && typeof window.init === "function") {
    await window.init();
  }

  initializeFilterRepairs();
}

(async function startAlmoxarifado() {
  bindCsvUpdateListener();
  await ensureCsvCacheWorker();

  try {
    await loadApplicationScript(ALMOX_APP_SOURCE);
  } catch {
    await loadApplicationScript(ALMOX_APP_FALLBACK);
  }

  await initializeLoadedApplication();
})();
