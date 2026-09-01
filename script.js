"use strict";

const CONFIG = Object.freeze({
  saldoFile: "00 - Saldo_Online.csv",
  comprasFile: "01 - Compras_Almox.csv",
  consumoFile: "03 - Consumo.csv",
  imageApi: "https://api.github.com/repos/tiagosilvagba/Almoxarifado/contents/imagens?ref=main",
  imageFolder: "imagens",
  maxImages: 5,
  historyBatch: 20,
});

const THEME_IDS = new Set([
  "jbs", "seara", "industrial", "graphite", "operations",
  "logistics", "corporate", "ocean", "neutral", "contrast",
]);

if (typeof document !== "undefined") {
  try {
    const savedTheme = localStorage.getItem("almoxarifado-theme");
    document.documentElement.dataset.theme = THEME_IDS.has(savedTheme) ? savedTheme : "industrial";
  } catch {
    document.documentElement.dataset.theme = "industrial";
  }
}

const numberFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2,
});

const integerFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 0,
});

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2,
});

const compactCurrencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

const state = {
  worker: null,
  items: [],
  filteredItems: [],
  itemByCode: new Map(),
  imageIndex: new Map(),
  imagePromise: null,
  renderedCount: 0,
  activeItem: null,
  historyVisible: CONFIG.historyBatch,
  lastFocusedElement: null,
  purchaseNeeds: [],
  purchaseNeedByKey: new Map(),
  activePurchaseNeed: null,
  consumption: { available: false, headers: [], rows: [], rowCount: 0 },
};

const ui = {};

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", init);
}

async function init() {
  cacheUi();
  initializeTheme();
  bindEvents();
  navigateToPage(pageFromHash(), false);
  await loadCatalog();
}

function cacheUi() {
  const ids = [
    "statusLine", "refreshButton", "themeSelect", "loadingPanel", "loadingTitle", "loadingMessage",
    "retryButton", "catalogContent", "metricsContext", "metricItems", "metricQuantity", "metricZero", "metricReconciliation",
    "metricValue", "metricOutOfStock", "metricBelowMin", "metricAboveMax",
    "metricUnconfigured", "metricPendingSc", "metricNegative", "searchInput",
    "branchFilter", "locationFilter", "categoryFilter", "unitFilter", "supplierFilter",
    "stockStatusFilter", "positiveBalanceFilter", "clearFilters", "applyFiltersButton",
    "filterToggleButton", "closeFiltersButton", "globalFiltersPanel", "activeFilterCount",
    "filterSummary", "resultCount", "cardsGrid", "emptyState",
    "loadMoreButton", "visibleCount", "itemModal", "modalCode", "modalTitle",
    "modalSubtitle", "modalClose", "modalBadges", "modalGallery", "modalBalance",
    "modalStockValue", "modalPositionCount", "modalHistoryCount", "modalDetails",
    "stockTableWrap", "historySummary", "historyTableWrap", "historyLoadMore",
    "purchaseNeedItems", "purchaseNeedPositions", "purchaseNeedWithoutMax",
    "purchaseNeedResultCount", "purchaseNeedTableWrap",
    "pendingScListCount", "pendingScTableWrap", "purchaseNeedModal", "purchaseModalClose",
    "purchaseModalCode", "purchaseModalTitle", "purchaseModalSubtitle", "purchaseModalSummary",
    "purchaseModalDetails", "purchaseModalOpenItem",
    "consumptionWaiting", "consumptionAvailable", "consumptionRowCount",
    "consumptionColumnCount", "consumptionPreviewWrap",
  ];

  for (const id of ids) {
    ui[id] = document.getElementById(id);
  }

  ui.tabs = [...document.querySelectorAll(".modal-tab")];
  ui.panels = [...document.querySelectorAll(".tab-panel")];
  ui.pageTabs = [...document.querySelectorAll(".app-nav__tab")];
  ui.pagePanels = [...document.querySelectorAll("[data-page-panel]")];
}

function bindEvents() {
  ui.themeSelect.addEventListener("change", () => applyTheme(ui.themeSelect.value, true));
  for (const select of [
    ui.branchFilter,
    ui.locationFilter,
    ui.categoryFilter,
    ui.unitFilter,
    ui.supplierFilter,
    ui.stockStatusFilter,
  ]) {
    select.addEventListener("change", () => handleAutomaticFilter(select.id));
  }
  ui.positiveBalanceFilter.addEventListener("change", () => handleAutomaticFilter("positiveBalanceFilter"));
  ui.searchInput.addEventListener("input", debounce(() => handleAutomaticFilter("searchInput"), 180));
  ui.searchInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    applyAllFilters(true);
  });

  ui.clearFilters.addEventListener("click", clearFilters);
  ui.applyFiltersButton.addEventListener("click", () => applyAllFilters(true));
  ui.filterToggleButton.addEventListener("click", toggleFilters);
  ui.closeFiltersButton.addEventListener("click", closeFilters);
  ui.globalFiltersPanel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeFilters();
  });
  ui.loadMoreButton.addEventListener("click", renderNextBatch);
  ui.refreshButton.addEventListener("click", loadCatalog);
  ui.retryButton.addEventListener("click", loadCatalog);
  ui.historyLoadMore.addEventListener("click", () => {
    state.historyVisible += CONFIG.historyBatch;
    renderHistory(state.activeItem);
  });

  ui.purchaseNeedTableWrap.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-purchase-need-key]");
    if (trigger) openPurchaseNeedModal(trigger.dataset.purchaseNeedKey);
  });
  ui.pendingScTableWrap.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-item-code]");
    if (trigger) openItem(trigger.dataset.itemCode);
  });

  ui.purchaseModalClose.addEventListener("click", closePurchaseNeedModal);
  ui.purchaseNeedModal.addEventListener("click", (event) => {
    if (event.target === ui.purchaseNeedModal) closePurchaseNeedModal();
  });
  ui.purchaseNeedModal.addEventListener("close", () => {
    state.activePurchaseNeed = null;
    state.lastFocusedElement?.focus?.();
  });
  ui.purchaseModalOpenItem.addEventListener("click", () => {
    const code = state.activePurchaseNeed?.item.code;
    closePurchaseNeedModal();
    if (code) window.setTimeout(() => openItem(code), 0);
  });

  for (const pageTab of ui.pageTabs) {
    pageTab.addEventListener("click", (event) => {
      event.preventDefault();
      navigateToPage(pageTab.dataset.page, true);
    });
    pageTab.addEventListener("keydown", handlePageTabKeydown);
  }
  window.addEventListener("hashchange", () => navigateToPage(pageFromHash(), false));

  ui.cardsGrid.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-item-code]");
    if (trigger) openItem(trigger.dataset.itemCode);
  });

  ui.modalClose.addEventListener("click", closeModal);
  ui.itemModal.addEventListener("click", (event) => {
    if (event.target === ui.itemModal) closeModal();
  });
  ui.itemModal.addEventListener("close", () => {
    state.activeItem = null;
    state.lastFocusedElement?.focus?.();
  });

  for (const tab of ui.tabs) {
    tab.addEventListener("click", () => activateTab(tab.dataset.tab));
  }
}

function initializeTheme() {
  const theme = THEME_IDS.has(document.documentElement.dataset.theme)
    ? document.documentElement.dataset.theme
    : "industrial";
  ui.themeSelect.value = theme;
  applyTheme(theme, false);
}

function applyTheme(theme, persist) {
  const selectedTheme = THEME_IDS.has(theme) ? theme : "industrial";
  document.documentElement.dataset.theme = selectedTheme;
  const themeColor = getComputedStyle(document.documentElement).getPropertyValue("--navy-800").trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColor || "#123a63");
  if (!persist) return;
  try {
    localStorage.setItem("almoxarifado-theme", selectedTheme);
  } catch {
    // O tema continua ativo durante a sessão mesmo se o armazenamento estiver indisponível.
  }
}

function pageFromHash() {
  const page = window.location.hash.replace(/^#/, "");
  return ["dashboard", "catalogo", "necessidade-compra", "revisao-min-max"].includes(page)
    ? page
    : "dashboard";
}

function navigateToPage(page, updateHash) {
  const validPage = ["dashboard", "catalogo", "necessidade-compra", "revisao-min-max"].includes(page)
    ? page
    : "dashboard";

  for (const tab of ui.pageTabs) {
    const active = tab.dataset.page === validPage;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-current", active ? "page" : "false");
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  }

  for (const panel of ui.pagePanels) {
    panel.classList.toggle("is-hidden", panel.dataset.pagePanel !== validPage);
  }

  if (updateHash && window.location.hash !== `#${validPage}`) {
    history.pushState(null, "", `#${validPage}`);
  }

  document.title = `${pageTitle(validPage)} · Gestão de Almoxarifado`;
}

function handlePageTabKeydown(event) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const current = ui.pageTabs.indexOf(event.currentTarget);
  let next = current;
  if (event.key === "ArrowRight") next = (current + 1) % ui.pageTabs.length;
  if (event.key === "ArrowLeft") next = (current - 1 + ui.pageTabs.length) % ui.pageTabs.length;
  if (event.key === "Home") next = 0;
  if (event.key === "End") next = ui.pageTabs.length - 1;
  ui.pageTabs[next].focus();
  navigateToPage(ui.pageTabs[next].dataset.page, true);
}

function pageTitle(page) {
  return ({
    dashboard: "Dashboard",
    catalogo: "Catálogo",
    "necessidade-compra": "Necessidade de Compra",
    "revisao-min-max": "Revisão de Min e Máx",
  })[page];
}

function toggleFilters() {
  const willOpen = ui.globalFiltersPanel.classList.contains("is-hidden");
  ui.globalFiltersPanel.classList.toggle("is-hidden", !willOpen);
  ui.filterToggleButton.setAttribute("aria-expanded", String(willOpen));
  if (willOpen) window.requestAnimationFrame(() => ui.searchInput.focus());
}

function closeFilters() {
  ui.globalFiltersPanel.classList.add("is-hidden");
  ui.filterToggleButton.setAttribute("aria-expanded", "false");
  ui.filterToggleButton.focus();
}

function applyAllFilters(shouldClose = false) {
  applyFilters();
  updateDashboardMetrics();
  renderPendingScList();
  renderPurchaseNeeds();
  updateFilterSummary();
  if (shouldClose) closeFilters();
}

function handleAutomaticFilter(changedId) {
  refreshDependentFilters(changedId);
  applyAllFilters(false);
}

function updateFilterSummary() {
  const labels = [];
  const query = ui.searchInput.value.trim();
  if (query) labels.push(`Busca: ${query}`);
  if (ui.branchFilter.value) labels.push(ui.branchFilter.selectedOptions[0]?.textContent || `Filial ${ui.branchFilter.value}`);
  if (ui.locationFilter.value) labels.push(ui.locationFilter.selectedOptions[0]?.textContent || "Local selecionado");
  for (const select of [ui.categoryFilter, ui.unitFilter, ui.supplierFilter, ui.stockStatusFilter]) {
    if (select.value) labels.push(select.selectedOptions[0]?.textContent || select.value);
  }
  if (ui.positiveBalanceFilter.checked) labels.push("Somente saldo positivo");

  ui.activeFilterCount.textContent = String(labels.length);
  ui.activeFilterCount.classList.toggle("is-hidden", !labels.length);
  ui.filterSummary.textContent = labels.length ? labels.join(" · ") : "Todas as filiais · todos os itens";
}

async function loadCatalog() {
  if (state.worker) {
    state.worker.terminate();
    state.worker = null;
  }

  showLoading("Carregando dados do almoxarifado", "Lendo os arquivos de saldo e compras…");
  ui.refreshButton.disabled = true;
  state.imagePromise = loadImageIndex();

  try {
    const source = `(${inventoryWorker.toString()})()`;
    const objectUrl = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    const worker = new Worker(objectUrl);
    URL.revokeObjectURL(objectUrl);
    state.worker = worker;

    worker.addEventListener("message", handleWorkerMessage);
    worker.addEventListener("error", (event) => {
      showError("Não foi possível processar os dados.", event.message || "Verifique os arquivos CSV e tente novamente.");
    });

    worker.postMessage({
      saldoUrl: new URL(CONFIG.saldoFile, document.baseURI).href,
      comprasUrl: new URL(CONFIG.comprasFile, document.baseURI).href,
      consumoUrl: new URL(CONFIG.consumoFile, document.baseURI).href,
    });
  } catch (error) {
    showError("Não foi possível iniciar o catálogo.", error.message);
  }
}

async function handleWorkerMessage(event) {
  const message = event.data || {};

  if (message.type === "progress") {
    ui.loadingMessage.textContent = message.message;
    ui.statusLine.textContent = message.message;
    return;
  }

  if (message.type === "error") {
    showError("Não foi possível carregar os CSVs.", message.message);
    return;
  }

  if (message.type !== "complete") return;

  try {
    state.items = message.payload.items;
    state.consumption = message.payload.consumption;
    state.imageIndex = await state.imagePromise;
    prepareItems();
    populateFilters();
    buildPurchaseNeeds();
    renderConsumptionReview();
    applyAllFilters(false);
    navigateToPage(pageFromHash(), false);

    const time = new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date());
    ui.statusLine.textContent = `${integerFormatter.format(state.items.length)} itens · dados carregados às ${time}`;
    ui.loadingPanel.classList.add("is-hidden");
    ui.catalogContent.classList.remove("is-hidden");
    ui.refreshButton.disabled = false;
    state.worker?.terminate();
    state.worker = null;
  } catch (error) {
    showError("Os dados foram lidos, mas não puderam ser exibidos.", error.message);
  }
}

function showLoading(title, message) {
  ui.loadingPanel.classList.remove("is-hidden", "has-error");
  ui.loadingPanel.setAttribute("aria-busy", "true");
  ui.loadingTitle.textContent = title;
  ui.loadingMessage.textContent = message;
  ui.retryButton.classList.add("is-hidden");
  ui.statusLine.textContent = message;
}

function showError(title, message) {
  state.worker?.terminate();
  state.worker = null;
  ui.loadingPanel.classList.remove("is-hidden");
  ui.loadingPanel.classList.add("has-error");
  ui.loadingPanel.setAttribute("aria-busy", "false");
  ui.loadingTitle.textContent = title;
  ui.loadingMessage.textContent = `${message || "Erro desconhecido"} Abra o catálogo pelo GitHub Pages ou por um servidor web.`;
  ui.retryButton.classList.remove("is-hidden");
  ui.refreshButton.disabled = false;
  ui.statusLine.textContent = "Falha ao carregar os dados";
}

async function loadImageIndex() {
  const index = new Map();

  try {
    const response = await fetch(CONFIG.imageApi, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) throw new Error(`GitHub API: ${response.status}`);

    const entries = await response.json();
    if (!Array.isArray(entries)) return index;

    for (const entry of entries) {
      if (entry.type !== "file" || !entry.name || !entry.download_url) continue;
      const match = entry.name.match(/^(.+?)\s*-\s*(0[1-5])\.([^.]+)$/i);
      if (!match) continue;

      const code = normalizeCode(match[1]);
      const order = Number(match[2]);
      const images = index.get(code) || [];
      images.push({ order, name: entry.name, url: entry.download_url });
      index.set(code, images);
    }

    for (const images of index.values()) {
      images.sort((a, b) => a.order - b.order);
    }
  } catch (error) {
    console.warn("Índice de imagens indisponível; usando o padrão JPG local.", error);
  }

  return index;
}

function prepareItems() {
  state.itemByCode.clear();

  for (const item of state.items) {
    item.searchText = normalizeSearch([
      item.code,
      item.name,
      item.detailedName,
      ...(item.categories || []),
      ...(item.suppliers || []),
      ...(item.units || []),
    ].join(" "));
    state.itemByCode.set(item.code, item);
  }

  state.items.sort((a, b) => a.code.localeCompare(b.code, "pt-BR", {
    numeric: true,
    sensitivity: "base",
  }));
}

function populateFilters() {
  const branches = new Map();
  const locations = new Map();
  const categories = new Set();
  const units = new Set();
  const suppliers = new Set();

  for (const item of state.items) {
    for (const category of item.categories || []) if (category) categories.add(category);
    for (const unit of item.units || []) if (unit) units.add(unit);
    for (const supplier of item.suppliers || []) if (supplier) suppliers.add(supplier);

    for (const position of item.positions || []) {
      if (position.branchCode) {
        branches.set(position.branchCode, [position.branchCode, position.branchName].filter(Boolean).join(" · "));
      }
      if (position.locationKey) {
        const label = [
          position.branchCode,
          position.localCode,
          position.localName,
        ].filter(Boolean).join(" · ");
        locations.set(position.locationKey, label);
      }
    }
  }

  fillSelect(ui.branchFilter, [...branches], "Todas as filiais");
  updateLocationFilter(ui.locationFilter, ui.branchFilter.value);
  fillSelect(ui.categoryFilter, [...categories].map((value) => [value, value]), "Todas as categorias");
  fillSelect(ui.unitFilter, [...units].map((value) => [value, value]), "Todas as unidades");
  fillSelect(ui.supplierFilter, [...suppliers].map((value) => [value, value]), "Todos os fornecedores");
}

function updateLocationFilter(select, branchCode) {
  const currentValue = select.value;
  const locations = new Map();

  for (const item of state.items) {
    for (const position of item.positions || []) {
      if (branchCode && position.branchCode !== branchCode) continue;
      if (!position.locationKey) continue;
      locations.set(position.locationKey, [
        position.branchCode,
        position.localCode,
        position.localName,
      ].filter(Boolean).join(" · "));
    }
  }

  fillSelect(select, [...locations], "Todos os locais");
  if ([...locations].some(([value]) => value === currentValue)) select.value = currentValue;
}

function refreshDependentFilters(changedId) {
  if (!state.items.length) return;

  const definitions = [
    ["branchFilter", ui.branchFilter, "Todas as filiais"],
    ["locationFilter", ui.locationFilter, "Todos os locais"],
    ["categoryFilter", ui.categoryFilter, "Todas as categorias"],
    ["unitFilter", ui.unitFilter, "Todas as unidades"],
    ["supplierFilter", ui.supplierFilter, "Todos os fornecedores"],
  ];

  for (let pass = 0; pass < 2; pass += 1) {
    for (const [filterId, select, firstLabel] of definitions) {
      if (filterId === changedId) continue;
      const currentValue = select.value;
      const entries = collectDependentOptions(filterId);
      fillSelect(select, entries, firstLabel);
      if (entries.some(([value]) => value === currentValue)) select.value = currentValue;
    }
  }

  if (refreshStatusAvailability(changedId)) {
    for (const [filterId, select, firstLabel] of definitions) {
      if (filterId === changedId) continue;
      const currentValue = select.value;
      const entries = collectDependentOptions(filterId);
      fillSelect(select, entries, firstLabel);
      if (entries.some(([value]) => value === currentValue)) select.value = currentValue;
    }
  }
}

function collectDependentOptions(targetFilterId) {
  const options = new Map();
  for (const item of state.items) {
    if (!itemMatchesDraftFilters(item, targetFilterId)) continue;

    if (targetFilterId === "categoryFilter") {
      for (const value of item.categories || []) if (value) options.set(value, value);
      continue;
    }
    if (targetFilterId === "unitFilter") {
      for (const value of item.units || []) if (value) options.set(value, value);
      continue;
    }
    if (targetFilterId === "supplierFilter") {
      for (const value of item.suppliers || []) if (value) options.set(value, value);
      continue;
    }

    const status = ui.stockStatusFilter.value;
    const positions = draftPositions(item, targetFilterId)
      .filter((position) => !status || positionMatchesStatus(position, status));
    for (const position of positions) {
      if (targetFilterId === "branchFilter" && position.branchCode) {
        options.set(position.branchCode, [position.branchCode, position.branchName].filter(Boolean).join(" · "));
      }
      if (targetFilterId === "locationFilter" && position.locationKey) {
        options.set(position.locationKey, [position.branchCode, position.localCode, position.localName].filter(Boolean).join(" · "));
      }
    }
  }
  return [...options];
}

function itemMatchesDraftFilters(item, excludedFilterId, statusOverride) {
  const query = normalizeSearch(ui.searchInput.value);
  const branch = excludedFilterId === "branchFilter" ? "" : ui.branchFilter.value;
  const location = excludedFilterId === "locationFilter" ? "" : ui.locationFilter.value;
  const category = excludedFilterId === "categoryFilter" ? "" : ui.categoryFilter.value;
  const unit = excludedFilterId === "unitFilter" ? "" : ui.unitFilter.value;
  const supplier = excludedFilterId === "supplierFilter" ? "" : ui.supplierFilter.value;
  const status = statusOverride ?? (excludedFilterId === "stockStatusFilter" ? "" : ui.stockStatusFilter.value);
  const positiveOnly = ui.positiveBalanceFilter.checked;

  if (query && !item.searchText.includes(query)) return false;
  if (category && !(item.categories || []).includes(category)) return false;
  if (unit && !(item.units || []).includes(unit)) return false;
  if (supplier && !(item.suppliers || []).includes(supplier)) return false;

  const positions = (item.positions || []).filter((position) => {
    if (branch && position.branchCode !== branch) return false;
    if (location && position.locationKey !== location) return false;
    return true;
  });
  if ((branch || location || status || positiveOnly) && !positions.length) return false;
  if (status && !positions.some((position) => positionMatchesStatus(position, status))) return false;
  if (positiveOnly && positions.reduce((sum, position) => sum + position.quantity, 0) <= 0) return false;
  return true;
}

function draftPositions(item, excludedFilterId) {
  const branch = excludedFilterId === "branchFilter" ? "" : ui.branchFilter.value;
  const location = excludedFilterId === "locationFilter" ? "" : ui.locationFilter.value;
  return (item.positions || []).filter((position) => {
    if (branch && position.branchCode !== branch) return false;
    if (location && position.locationKey !== location) return false;
    return true;
  });
}

function refreshStatusAvailability(changedId) {
  if (changedId === "stockStatusFilter") return false;
  for (const option of ui.stockStatusFilter.options) {
    if (!option.value) continue;
    option.disabled = !state.items.some((item) => itemMatchesDraftFilters(item, "stockStatusFilter", option.value));
  }
  if (!ui.stockStatusFilter.selectedOptions[0]?.disabled) return false;
  ui.stockStatusFilter.value = "";
  return true;
}

function fillSelect(select, entries, firstLabel) {
  const sorted = entries
    .filter(([value]) => value)
    .sort((a, b) => a[1].localeCompare(b[1], "pt-BR", { numeric: true, sensitivity: "base" }));

  select.replaceChildren(new Option(firstLabel, ""));
  const fragment = document.createDocumentFragment();
  for (const [value, label] of sorted) fragment.append(new Option(label, value));
  select.append(fragment);
}

function clearFilters() {
  ui.searchInput.value = "";
  ui.branchFilter.value = "";
  ui.locationFilter.value = "";
  ui.categoryFilter.value = "";
  ui.unitFilter.value = "";
  ui.supplierFilter.value = "";
  ui.stockStatusFilter.value = "";
  ui.positiveBalanceFilter.checked = false;
  populateFilters();
  for (const option of ui.stockStatusFilter.options) option.disabled = false;
  applyAllFilters(true);
}

function applyFilters() {
  const query = normalizeSearch(ui.searchInput.value);
  const branch = ui.branchFilter.value;
  const location = ui.locationFilter.value;
  const category = ui.categoryFilter.value;
  const unit = ui.unitFilter.value;
  const supplier = ui.supplierFilter.value;
  const stockStatus = ui.stockStatusFilter.value;
  const positiveOnly = ui.positiveBalanceFilter.checked;

  state.filteredItems = state.items.filter((item) => {
    if (query && !item.searchText.includes(query)) return false;
    const matchingPositions = (item.positions || []).filter((position) => {
      if (branch && position.branchCode !== branch) return false;
      if (location && position.locationKey !== location) return false;
      return true;
    });
    if ((branch || location) && !matchingPositions.length) return false;
    if (stockStatus && !matchingPositions.some((position) => positionMatchesStatus(position, stockStatus))) return false;
    if (category && !(item.categories || []).includes(category)) return false;
    if (unit && !(item.units || []).includes(unit)) return false;
    if (supplier && !(item.suppliers || []).includes(supplier)) return false;
    if (positiveOnly && matchingPositions.reduce((sum, position) => sum + position.quantity, 0) <= 0) return false;
    return true;
  });

  ui.resultCount.textContent = pluralize(state.filteredItems.length, "item", "itens");

  state.renderedCount = 0;
  ui.cardsGrid.replaceChildren();
  renderNextBatch();
}

function positionMatchesStatus(position, status) {
  const minimum = position.minimum ?? 0;
  const maximum = position.maximum ?? 0;
  const quantity = position.quantity ?? 0;

  if (status === "zero") return quantity === 0 && minimum + maximum > 0;
  if (status === "below-min") return minimum > 0 && quantity > 0 && quantity < minimum;
  if (status === "above-max") return maximum > 0 && quantity > maximum;
  if (status === "within-range") return minimum > 0 && maximum > 0 && quantity >= minimum && quantity <= maximum;
  return true;
}

function updateDashboardMetrics() {
  const branch = ui.branchFilter.value;
  const location = ui.locationFilter.value;
  const stockStatus = ui.stockStatusFilter.value;
  const scopedItems = new Set();
  const codesWithStock = new Set();
  const zeroCodes = new Set();
  let value = 0;
  const outOfStockCodes = new Set();
  const belowMinCodes = new Set();
  const aboveMaxCodes = new Set();
  const unconfiguredCodes = new Set();
  const negativeCodes = new Set();
  const pendingSc = new Set();

  for (const item of state.filteredItems) {
    const positions = (item.positions || []).filter((position) => {
      if (branch && position.branchCode !== branch) return false;
      if (location && position.locationKey !== location) return false;
      if (stockStatus && !positionMatchesStatus(position, stockStatus)) return false;
      return true;
    });
    if (!positions.length && (branch || location)) continue;
    if (positions.length || (!branch && !location)) scopedItems.add(item.code);

    const itemBalance = positions.reduce((sum, position) => sum + (position.quantity || 0), 0);
    const itemLimits = positions.reduce((sum, position) => sum + (position.minimum || 0) + (position.maximum || 0), 0);
    if (itemBalance !== 0) {
      codesWithStock.add(item.code);
    } else if (itemLimits > 0) {
      zeroCodes.add(item.code);
    } else {
      outOfStockCodes.add(item.code);
    }

    for (const position of positions) {
      value += position.stockValue || 0;
      if (position.minimum > 0 && position.quantity > 0 && position.quantity < position.minimum) belowMinCodes.add(item.code);
      if (position.aboveMax) aboveMaxCodes.add(item.code);
      if (position.unconfigured) unconfiguredCodes.add(item.code);
      if (position.negative) negativeCodes.add(item.code);
    }

    for (const sc of item.pendingScCodes || []) pendingSc.add(sc);
  }

  ui.metricItems.textContent = integerFormatter.format(scopedItems.size);
  ui.metricQuantity.textContent = integerFormatter.format(codesWithStock.size);
  ui.metricQuantity.title = pluralize(codesWithStock.size, "código com saldo", "códigos com saldo");
  ui.metricZero.textContent = integerFormatter.format(zeroCodes.size);
  ui.metricValue.textContent = compactCurrencyFormatter.format(value);
  ui.metricValue.title = currencyFormatter.format(value);
  ui.metricOutOfStock.textContent = integerFormatter.format(outOfStockCodes.size);
  ui.metricBelowMin.textContent = integerFormatter.format(belowMinCodes.size);
  ui.metricAboveMax.textContent = integerFormatter.format(aboveMaxCodes.size);
  ui.metricUnconfigured.textContent = integerFormatter.format(unconfiguredCodes.size);
  ui.metricPendingSc.textContent = integerFormatter.format(pendingSc.size);
  ui.metricNegative.textContent = integerFormatter.format(negativeCodes.size);
  ui.metricReconciliation.textContent = `${integerFormatter.format(scopedItems.size)} códigos = ${integerFormatter.format(codesWithStock.size)} com saldo + ${integerFormatter.format(zeroCodes.size)} zerados + ${integerFormatter.format(outOfStockCodes.size)} fora de estoque`;
  ui.metricsContext.textContent = location
    ? ui.locationFilter.selectedOptions[0]?.textContent || "Local selecionado"
    : branch
      ? ui.branchFilter.selectedOptions[0]?.textContent || `Filial ${branch}`
      : "Todas as filiais · códigos únicos";
}

function buildPurchaseNeeds() {
  const needs = [];

  for (const item of state.items) {
    for (const position of item.positions || []) {
      if (!(position.minimum > 0 && position.quantity < position.minimum)) continue;
      const target = position.maximum > 0 ? position.maximum : position.minimum;
      needs.push({
        item,
        position,
        target,
        suggested: Math.max(target - position.quantity, 0),
      });
    }
  }

  state.purchaseNeeds = needs.sort((a, b) => {
    const codeOrder = a.item.code.localeCompare(b.item.code, "pt-BR", { numeric: true, sensitivity: "base" });
    if (codeOrder) return codeOrder;
    return a.position.locationKey.localeCompare(b.position.locationKey, "pt-BR", { numeric: true });
  });
  state.purchaseNeedByKey.clear();
  state.purchaseNeeds.forEach((need, index) => {
    need.key = `need-${index}`;
    state.purchaseNeedByKey.set(need.key, need);
  });
}

function renderPendingScList() {
  const rowsByKey = new Map();

  for (const item of state.filteredItems) {
    const pendingCodes = new Set(item.pendingScCodes || []);
    if (!pendingCodes.size) continue;
    for (const record of item.history || []) {
      const sc = record.sc;
      if (!sc?.code || !pendingCodes.has(sc.code) || record.of?.code) continue;
      const key = `${sc.code}::${item.code}`;
      if (!rowsByKey.has(key)) rowsByKey.set(key, { item, record, sc });
    }
  }

  const rows = [...rowsByKey.values()].sort((a, b) => {
    const codeOrder = a.sc.code.localeCompare(b.sc.code, "pt-BR", { numeric: true });
    return codeOrder || a.item.code.localeCompare(b.item.code, "pt-BR", { numeric: true });
  });
  const uniqueSc = new Set(rows.map(({ sc }) => sc.code));
  ui.pendingScListCount.textContent = `${pluralize(uniqueSc.size, "SC", "SCs")} · ${pluralize(rows.length, "item", "itens")}`;

  if (!rows.length) {
    ui.pendingScTableWrap.innerHTML = `<div class="table-empty">Nenhuma SC sem OF corresponde aos filtros aplicados.</div>`;
    return;
  }

  const body = rows.map(({ item, record, sc }) => `<tr>
    <td><strong>${escapeHtml(sc.code)}</strong></td>
    <td><button class="table-link" type="button" data-item-code="${escapeHtml(item.code)}">${escapeHtml(item.code)}</button></td>
    <td class="cell-wrap">${escapeHtml(item.name)}</td>
    <td class="cell-wrap">${escapeHtml(record.branch || "—")}</td>
    <td>${escapeHtml(sc.date || "—")}</td>
    <td>${escapeHtml(sc.deliveryDate || "—")}</td>
    <td class="number">${formatOptionalNumber(sc.quantity)}</td>
    <td class="number">${sc.estimatedValue == null ? "—" : currencyFormatter.format(sc.estimatedValue)}</td>
    <td class="cell-wrap">${escapeHtml(sc.category || "—")}</td>
    <td class="cell-wrap">${escapeHtml(sc.reason || "—")}</td>
    <td>${escapeHtml(sc.status || "—")}</td>
  </tr>`).join("");

  ui.pendingScTableWrap.innerHTML = `<table class="data-table">
    <thead><tr><th>SC</th><th>Código</th><th>Item</th><th>Filial</th><th>Criação</th><th>Entrega</th><th class="number">Quantidade</th><th class="number">Valor estimado</th><th>Categoria</th><th>Motivo</th><th>Situação</th></tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

function renderPurchaseNeeds() {
  const branch = ui.branchFilter.value;
  const location = ui.locationFilter.value;
  const stockStatus = ui.stockStatusFilter.value;
  const filteredCodes = new Set(state.filteredItems.map((item) => item.code));
  const visible = state.purchaseNeeds.filter(({ item, position }) => {
    if (!filteredCodes.has(item.code)) return false;
    if (branch && position.branchCode !== branch) return false;
    if (location && position.locationKey !== location) return false;
    if (stockStatus && !positionMatchesStatus(position, stockStatus)) return false;
    return true;
  });

  const itemCodes = new Set(visible.map(({ item }) => item.code));
  const withoutMaximum = visible.filter(({ position }) => !(position.maximum > 0)).length;
  ui.purchaseNeedItems.textContent = integerFormatter.format(itemCodes.size);
  ui.purchaseNeedPositions.textContent = integerFormatter.format(visible.length);
  ui.purchaseNeedWithoutMax.textContent = integerFormatter.format(withoutMaximum);
  ui.purchaseNeedResultCount.textContent = `${pluralize(visible.length, "posição", "posições")} exibida${visible.length === 1 ? "" : "s"}`;

  if (!visible.length) {
    ui.purchaseNeedTableWrap.innerHTML = `<div class="table-empty">Nenhuma necessidade de compra corresponde à busca informada.</div>`;
    return;
  }

  const rows = visible.map(({ item, position, target, suggested, key }) => `<tr data-purchase-need-key="${escapeHtml(key)}">
    <td><button class="table-link" type="button" data-purchase-need-key="${escapeHtml(key)}">${escapeHtml(item.code)}</button></td>
    <td class="cell-wrap">${escapeHtml(item.name)}</td>
    <td>${escapeHtml([position.branchCode, position.branchName].filter(Boolean).join(" · "))}</td>
    <td class="cell-wrap">${escapeHtml([position.localCode, position.localName].filter(Boolean).join(" · "))}</td>
    <td>${escapeHtml((item.units || []).join(", ") || "—")}</td>
    <td class="number">${numberFormatter.format(position.quantity)}</td>
    <td class="number">${numberFormatter.format(position.minimum)}</td>
    <td class="number">${formatOptionalNumber(position.maximum)}</td>
    <td class="number">${numberFormatter.format(target)}</td>
    <td class="number"><strong>${numberFormatter.format(suggested)}</strong></td>
  </tr>`).join("");

  ui.purchaseNeedTableWrap.innerHTML = `<table class="data-table">
    <thead><tr>
      <th>Código</th><th>Item</th><th>Filial</th><th>Local</th><th>Unidade</th>
      <th class="number">Saldo</th><th class="number">Mínimo</th><th class="number">Máximo</th>
      <th class="number">Meta</th><th class="number">Comprar</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function openPurchaseNeedModal(key) {
  const need = state.purchaseNeedByKey.get(key);
  if (!need) return;
  const { item, position, target, suggested } = need;
  state.activePurchaseNeed = need;
  state.lastFocusedElement = document.activeElement;

  ui.purchaseModalCode.textContent = `Código ${item.code}`;
  ui.purchaseModalTitle.textContent = item.name;
  ui.purchaseModalSubtitle.textContent = [
    position.branchCode,
    position.branchName,
    position.localCode,
    position.localName,
  ].filter(Boolean).join(" · ");
  ui.purchaseModalSummary.innerHTML = `
    <article><span>Saldo atual</span><strong>${numberFormatter.format(position.quantity)}</strong></article>
    <article><span>Mínimo</span><strong>${formatOptionalNumber(position.minimum)}</strong></article>
    <article><span>Máximo</span><strong>${formatOptionalNumber(position.maximum)}</strong></article>
    <article><span>Meta</span><strong>${numberFormatter.format(target)}</strong></article>
    <article><span>Comprar</span><strong>${numberFormatter.format(suggested)}</strong></article>`;
  ui.purchaseModalDetails.innerHTML = `
    <div><dt>Unidade</dt><dd>${escapeHtml((item.units || []).join(", ") || "—")}</dd></div>
    <div><dt>Filial</dt><dd>${escapeHtml([position.branchCode, position.branchName].filter(Boolean).join(" · ") || "—")}</dd></div>
    <div><dt>Local</dt><dd>${escapeHtml([position.localCode, position.localName].filter(Boolean).join(" · ") || "—")}</dd></div>
    <div><dt>Prateleira</dt><dd>${escapeHtml(position.shelf || "—")}</dd></div>
    <div><dt>Fornecedores relacionados</dt><dd>${escapeHtml((item.suppliers || []).join(", ") || "—")}</dd></div>
    <div><dt>Critério da sugestão</dt><dd>${position.maximum > 0 ? "Reposição até o máximo parametrizado" : "Máximo não informado; reposição até o mínimo"}</dd></div>`;

  if (typeof ui.purchaseNeedModal.showModal === "function") ui.purchaseNeedModal.showModal();
  else ui.purchaseNeedModal.setAttribute("open", "");
  ui.purchaseModalClose.focus();
}

function closePurchaseNeedModal() {
  if (typeof ui.purchaseNeedModal.close === "function" && ui.purchaseNeedModal.open) ui.purchaseNeedModal.close();
  else ui.purchaseNeedModal.removeAttribute("open");
}

function renderConsumptionReview() {
  const consumption = state.consumption || { available: false };
  ui.consumptionWaiting.classList.toggle("is-hidden", consumption.available);
  ui.consumptionAvailable.classList.toggle("is-hidden", !consumption.available);
  if (!consumption.available) return;

  ui.consumptionRowCount.textContent = integerFormatter.format(consumption.rowCount || 0);
  ui.consumptionColumnCount.textContent = integerFormatter.format(consumption.headers?.length || 0);

  const headers = (consumption.headers || []).slice(0, 12);
  if (!headers.length) {
    ui.consumptionPreviewWrap.innerHTML = `<div class="table-empty">O CSV foi localizado, mas não possui cabeçalhos legíveis.</div>`;
    return;
  }

  const heading = headers.map((header) => `<th>${escapeHtml(header || "Sem título")}</th>`).join("");
  const rows = (consumption.rows || []).map((row) => `<tr>${headers.map((_, index) => `<td class="cell-wrap">${escapeHtml(row[index] || "")}</td>`).join("")}</tr>`).join("");
  ui.consumptionPreviewWrap.innerHTML = `<table class="data-table"><thead><tr>${heading}</tr></thead><tbody>${rows || `<tr><td colspan="${headers.length}">CSV sem registros.</td></tr>`}</tbody></table>`;
}

function renderNextBatch() {
  const total = state.filteredItems.length;
  if (!total) {
    ui.emptyState.classList.remove("is-hidden");
    ui.loadMoreButton.classList.add("is-hidden");
    ui.visibleCount.textContent = "";
    return;
  }

  ui.emptyState.classList.add("is-hidden");
  const start = state.renderedCount;
  const end = Math.min(start + calculateBatchSize(), total);
  const fragment = document.createDocumentFragment();

  for (let index = start; index < end; index += 1) {
    fragment.append(renderCard(state.filteredItems[index]));
  }

  ui.cardsGrid.append(fragment);
  state.renderedCount = end;
  ui.visibleCount.textContent = `Exibindo ${integerFormatter.format(end)} de ${integerFormatter.format(total)} itens`;
  ui.loadMoreButton.classList.toggle("is-hidden", end >= total);
}

function calculateBatchSize() {
  const columns = getComputedStyle(ui.cardsGrid).gridTemplateColumns.split(" ").filter(Boolean).length || 1;
  const rows = columns === 1 ? 10 : 6;
  return Math.max(columns * rows, 12);
}

function renderCard(item) {
  const card = document.createElement("article");
  card.className = "item-card";
  const images = imagesForItem(item, false);
  const primaryImage = images[0];
  const badges = statusBadges(item);

  card.innerHTML = `
    <button class="item-card__open" type="button" data-item-code="${escapeHtml(item.code)}" aria-label="Abrir detalhes do item ${escapeHtml(item.code)}">
      <span class="item-card__image">
        <span class="image-placeholder${primaryImage ? " is-hidden" : ""}">
          <span>
            ${packageIcon()}
            <span>Imagem não cadastrada</span>
          </span>
        </span>
        ${primaryImage ? `<img src="${escapeHtml(primaryImage.url)}" alt="${escapeHtml(item.name)}" loading="lazy" decoding="async">` : ""}
        ${images.length > 1 ? `<span class="item-card__count">${images.length} fotos</span>` : ""}
      </span>
      <span class="item-card__body">
        <span>
          <span class="item-card__code">Código ${escapeHtml(item.code)}</span>
          <h3>${escapeHtml(item.name)}</h3>
          <p class="item-card__category">${escapeHtml(primaryCategory(item))}</p>
        </span>
        <span class="card-badges">${badges.map(badgeHtml).join("")}</span>
        <span class="item-card__numbers">
          <span><span>Saldo total</span><strong>${numberFormatter.format(item.balanceTotal)}</strong></span>
          <span><span>Posições</span><strong>${integerFormatter.format(item.positions.length)}</strong></span>
        </span>
      </span>
    </button>`;

  const image = card.querySelector("img");
  if (image) {
    image.addEventListener("error", () => {
      image.remove();
      card.querySelector(".image-placeholder")?.classList.remove("is-hidden");
      card.querySelector(".item-card__count")?.remove();
    }, { once: true });
  }

  return card;
}

function statusBadges(item) {
  const badges = [];
  if (item.flags.purchaseOnly) badges.push(["Sem posição de estoque", "neutral"]);
  if (item.flags.negative) badges.push(["Saldo negativo", "danger"]);
  if (item.flags.outOfStock) badges.push(["Fora de estoque", "neutral"]);
  if (item.flags.belowMin) badges.push(["Abaixo do mínimo", "warning"]);
  if (item.flags.aboveMax) badges.push(["Acima do máximo", "danger"]);
  if (item.flags.unconfigured) badges.push(["Com saldo sem Min&Máx", "info"]);
  if ((item.pendingScCodes || []).length) badges.push(["SC sem OF", "violet"]);
  if (!badges.length && item.balanceTotal > 0) badges.push(["Saldo disponível", "success"]);
  return badges;
}

function badgeHtml([label, type]) {
  return `<span class="badge badge--${type}">${escapeHtml(label)}</span>`;
}

function openItem(code) {
  const item = state.itemByCode.get(code);
  if (!item) return;

  state.activeItem = item;
  state.historyVisible = CONFIG.historyBatch;
  state.lastFocusedElement = document.activeElement;

  ui.modalCode.textContent = `Código ${item.code}`;
  ui.modalTitle.textContent = item.name;
  ui.modalSubtitle.textContent = [primaryCategory(item), (item.units || []).join(", ")].filter(Boolean).join(" · ");
  ui.modalBadges.innerHTML = statusBadges(item).map(badgeHtml).join("");
  ui.modalBalance.textContent = numberFormatter.format(item.balanceTotal);
  ui.modalStockValue.textContent = currencyFormatter.format(item.stockValueTotal);
  ui.modalPositionCount.textContent = integerFormatter.format(item.positions.length);
  ui.modalHistoryCount.textContent = integerFormatter.format(item.history.length);

  const details = [
    ["Descrição detalhada", item.detailedName || item.name],
    ["Categoria / grupo", (item.categories || []).join(" · ") || "Não informado"],
    ["Unidade", (item.units || []).join(", ") || "Não informada"],
    ["Filiais", unique(item.positions.map((position) => position.branchName || position.branchCode)).join(" · ") || "Sem posição"],
    ["Fornecedores", (item.suppliers || []).join(" · ") || "Sem fornecedor no histórico"],
  ];
  ui.modalDetails.innerHTML = details.map(([term, value]) => `<dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd>`).join("");

  renderGallery(item);
  renderStock(item);
  renderHistory(item);
  activateTab("summary");

  if (!ui.itemModal.open) ui.itemModal.showModal();
}

function closeModal() {
  if (ui.itemModal.open) ui.itemModal.close();
}

function activateTab(name) {
  for (const tab of ui.tabs) {
    const active = tab.dataset.tab === name;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  }
  for (const panel of ui.panels) {
    panel.classList.toggle("is-hidden", panel.id !== `panel-${name}`);
  }
}

function renderGallery(item) {
  const images = imagesForItem(item, true).slice(0, CONFIG.maxImages);
  if (!images.length) {
    ui.modalGallery.innerHTML = `<div class="gallery__main"><span class="image-placeholder"><span>${packageIcon()}<span>Imagem não cadastrada</span></span></span></div>`;
    return;
  }

  ui.modalGallery.innerHTML = `
    <div class="gallery__main">
      <span class="image-placeholder is-hidden"><span>${packageIcon()}<span>Imagem indisponível</span></span></span>
      <img src="${escapeHtml(images[0].url)}" alt="${escapeHtml(item.name)} — foto 1">
    </div>
    <div class="gallery__thumbs"></div>`;

  const mainImage = ui.modalGallery.querySelector(".gallery__main img");
  const placeholder = ui.modalGallery.querySelector(".image-placeholder");
  const thumbs = ui.modalGallery.querySelector(".gallery__thumbs");

  const showUnavailable = () => {
    mainImage.classList.add("is-hidden");
    placeholder.classList.remove("is-hidden");
  };
  mainImage.addEventListener("error", showUnavailable);

  images.forEach((image, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `gallery__thumb${index === 0 ? " is-active" : ""}`;
    button.setAttribute("aria-label", `Exibir foto ${index + 1}`);
    button.innerHTML = `<img src="${escapeHtml(image.url)}" alt="" loading="lazy">`;
    button.querySelector("img").addEventListener("error", () => button.remove(), { once: true });
    button.addEventListener("click", () => {
      for (const thumb of thumbs.children) thumb.classList.remove("is-active");
      button.classList.add("is-active");
      placeholder.classList.add("is-hidden");
      mainImage.classList.remove("is-hidden");
      mainImage.src = image.url;
      mainImage.alt = `${item.name} — foto ${index + 1}`;
    });
    thumbs.append(button);
  });
}

function renderStock(item) {
  if (!item.positions.length) {
    ui.stockTableWrap.innerHTML = `<div class="table-empty">Este item aparece no histórico de compras, mas não possui posição no arquivo de saldo.</div>`;
    return;
  }

  const rows = item.positions.map((position) => {
    const badges = [];
    if (position.negative) badges.push(["Negativo", "danger"]);
    if (position.outOfStock) badges.push(["Fora", "neutral"]);
    if (position.belowMin) badges.push(["Abaixo mín.", "warning"]);
    if (position.aboveMax) badges.push(["Acima máx.", "danger"]);
    if (position.unconfigured) badges.push(["Sem Min&Máx", "info"]);

    return `<tr>
      <td>${escapeHtml([position.branchCode, position.branchName].filter(Boolean).join(" · "))}</td>
      <td class="cell-wrap">${escapeHtml([position.localCode, position.localName].filter(Boolean).join(" · "))}</td>
      <td class="number">${numberFormatter.format(position.quantity)}</td>
      <td class="number">${formatOptionalNumber(position.minimum)}</td>
      <td class="number">${formatOptionalNumber(position.maximum)}</td>
      <td class="number">${currencyFormatter.format(position.unitCost)}</td>
      <td class="number">${currencyFormatter.format(position.stockValue)}</td>
      <td>${escapeHtml(position.shelf || "—")}</td>
      <td>${badges.length ? badges.map(badgeHtml).join(" ") : badgeHtml(["Normal", "success"])}</td>
    </tr>`;
  }).join("");

  ui.stockTableWrap.innerHTML = `<table class="data-table">
    <thead><tr>
      <th>Filial</th><th>Local</th><th class="number">Saldo</th><th class="number">Mínimo</th>
      <th class="number">Máximo</th><th class="number">Custo unit.</th><th class="number">Valor</th>
      <th>Prateleira</th><th>Situação</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderHistory(item) {
  const total = item.history.length;
  ui.historySummary.textContent = pluralize(total, "registro", "registros");

  if (!total) {
    ui.historyTableWrap.innerHTML = `<div class="table-empty">Nenhuma solicitação, ordem ou nota foi localizada para este código.</div>`;
    ui.historyLoadMore.classList.add("is-hidden");
    return;
  }

  const visible = item.history.slice(0, state.historyVisible);
  const rows = visible.map((record) => {
    const date = record.rec?.entryDate || record.rec?.issueDate || record.of?.date || record.sc?.date || "—";
    const supplier = record.rec?.supplier || record.of?.supplier || "—";
    const quantity = firstDefined(record.rec?.quantity, record.of?.deliveredQuantity, record.of?.requestedQuantity, record.sc?.quantity);
    const unitValue = firstDefined(record.rec?.unitValue, record.of?.unitValue);
    const documentValue = firstDefined(record.rec?.documentValue, record.sc?.estimatedValue);

    return `<tr>
      <td>${escapeHtml(date)}</td>
      <td>${stageCell(record.sc, "sc")}</td>
      <td>${stageCell(record.of, "of")}</td>
      <td>${stageCell(record.rec, "rec")}</td>
      <td class="cell-wrap">${escapeHtml(record.branch || "—")}</td>
      <td class="cell-wrap">${escapeHtml(supplier)}</td>
      <td class="number">${quantity == null ? "—" : numberFormatter.format(quantity)}</td>
      <td class="number">${unitValue == null ? "—" : currencyFormatter.format(unitValue)}</td>
      <td class="number">${documentValue == null ? "—" : currencyFormatter.format(documentValue)}</td>
    </tr>`;
  }).join("");

  ui.historyTableWrap.innerHTML = `<table class="data-table">
    <thead><tr>
      <th>Data</th><th>Solicitação (SC)</th><th>Ordem (OF)</th><th>Recebimento / NF</th>
      <th>Filial</th><th>Fornecedor</th><th class="number">Quantidade</th>
      <th class="number">Valor unit.</th><th class="number">Valor doc./estimado</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;

  const hasMore = visible.length < total;
  ui.historyLoadMore.classList.toggle("is-hidden", !hasMore);
  if (hasMore) {
    const remaining = Math.min(CONFIG.historyBatch, total - visible.length);
    ui.historyLoadMore.textContent = `Carregar mais ${remaining} registros`;
  }
}

function stageCell(stage, type) {
  if (!stage) return `<span class="stage-cell"><em>Não gerada</em></span>`;

  if (type === "sc") {
    return `<span class="stage-cell"><strong>${escapeHtml(stage.code || "—")}</strong><span>${escapeHtml(stage.status || "Situação não informada")}</span></span>`;
  }
  if (type === "of") {
    return `<span class="stage-cell"><strong>${escapeHtml(stage.code || "—")}</strong><span>${escapeHtml(stage.status || stage.date || "Emitida")}</span></span>`;
  }
  return `<span class="stage-cell"><strong>${escapeHtml(stage.invoice ? `NF ${stage.invoice}` : "Recebido")}</strong><span>${escapeHtml(stage.entryDate || stage.issueDate || "Data não informada")}</span></span>`;
}

function imagesForItem(item, includeFallbackSet) {
  const indexed = state.imageIndex.get(normalizeCode(item.code));
  if (indexed?.length) return indexed.slice(0, CONFIG.maxImages);

  const count = includeFallbackSet ? CONFIG.maxImages : 1;
  return Array.from({ length: count }, (_, index) => {
    const order = String(index + 1).padStart(2, "0");
    const name = `${item.code} - ${order}.jpg`;
    return { order: index + 1, name, url: localImageUrl(name) };
  });
}

function localImageUrl(name) {
  const encoded = name.split("/").map(encodeURIComponent).join("/");
  return new URL(`${CONFIG.imageFolder}/${encoded}`, document.baseURI).href;
}

function primaryCategory(item) {
  return (item.categories || []).find(Boolean) || "Sem categoria informada";
}

function packageIcon() {
  return `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="m7 15 17-9 17 9v19l-17 9-17-9V15Z"></path><path d="m7 15 17 9 17-9M24 24v19M15.5 10.5l17 9"></path></svg>`;
}

function firstDefined(...values) {
  return values.find((value) => value !== null && value !== undefined);
}

function formatOptionalNumber(value) {
  return value == null ? "—" : numberFormatter.format(value);
}

function normalizeCode(value) {
  const clean = String(value ?? "").trim();
  return /^\d+\.0$/.test(clean) ? clean.slice(0, -2) : clean;
}

function normalizeSearch(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function pluralize(count, singular, plural) {
  return `${integerFormatter.format(count)} ${count === 1 ? singular : plural}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);
}

function debounce(callback, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), delay);
  };
}

function inventoryWorker() {
  const headerIndexes = new WeakMap();
  const requestedHeaderKeys = new Map();
  const decoder = (() => {
    try {
      return new TextDecoder("windows-1252");
    } catch {
      return new TextDecoder("iso-8859-1");
    }
  })();

  self.onmessage = async (event) => {
    try {
      const { saldoUrl, comprasUrl, consumoUrl } = event.data;
      progress("Baixando os arquivos de saldo e compras…");
      const [saldoText, comprasText, consumoText] = await Promise.all([
        fetchText(saldoUrl, "Saldo_Online"),
        fetchText(comprasUrl, "Compras_Almox"),
        fetchOptionalText(consumoUrl),
      ]);

      const items = new Map();
      let saldoRows = 0;
      let comprasRows = 0;

      progress("Consolidando saldos por código, filial e local…");
      parseCsv(saldoText, (headers, row) => {
        saldoRows += 1;
        const get = rowGetter(headers, row);
        const code = normalizeItemCode(get("Cd Item"));
        if (!code || isEchoHeader(code)) return;

        const item = ensureItem(items, code);
        const shortName = clean(get("Nome do Item Resumido"));
        const detailedName = clean(get("Nome do Item Detalhado"));
        const unit = clean(get("Cd Unidade Medida"));
        const group = clean(get("Nm Grupo"));
        const subgroup = clean(get("Nm Subgrupo"));
        const className = clean(get("Nm Classe"));

        item.name = item.name || shortName || detailedName;
        item.detailedName = item.detailedName || detailedName;
        if (unit) item._units.add(unit);
        for (const category of [group, subgroup, className]) if (category) item._categories.add(category);

        const quantity = parseNumber(get("Qt Saldo Atual")) ?? 0;
        const minimumRaw = parseNumber(get("Qt Minimo"));
        const maximumRaw = parseNumber(get("Qt Maximo"));
        const minimum = minimumRaw ?? 0;
        const maximum = maximumRaw ?? 0;
        const unitCost = parseNumber(get("Vl Custo Unitario Atual")) ?? 0;
        const stockValue = parseNumber(get("Vl Saldo Atual")) ?? 0;
        const limitsSumZero = minimum + maximum === 0;

        const position = {
          branchCode: clean(get("Cd Filial")),
          branchName: clean(get("Nm Filial")),
          localType: clean(get("Tipo Local")),
          localCode: clean(get("Cd Local")),
          localName: clean(get("Ds Local Estoque")),
          quantity,
          minimum: minimumRaw,
          maximum: maximumRaw,
          unitCost,
          stockValue,
          forecast: parseNumber(get("Qt Previsao Consumo")),
          shelf: clean(get("Cd Prateleira")),
          division: clean(get("Cd Divisao")),
          belowMin: minimum > 0 && quantity < minimum,
          aboveMax: maximum > 0 && quantity > maximum,
          outOfStock: limitsSumZero && quantity === 0,
          unconfigured: limitsSumZero && quantity > 0,
          negative: quantity < 0,
        };
        position.locationKey = `${position.branchCode}::${position.localCode}`;

        item.positions.push(position);
        item.balanceTotal += quantity;
        item.stockValueTotal += stockValue;
        item.flags.belowMin ||= position.belowMin;
        item.flags.aboveMax ||= position.aboveMax;
        item.flags.outOfStock ||= position.outOfStock;
        item.flags.unconfigured ||= position.unconfigured;
        item.flags.negative ||= position.negative;

        if (saldoRows % 8000 === 0) progress(`Consolidando saldo: ${saldoRows.toLocaleString("pt-BR")} registros…`);
      });

      progress("Relacionando solicitações, ordens e recebimentos…");
      parseCsv(comprasText, (headers, row) => {
        comprasRows += 1;
        const get = rowGetter(headers, row);
        const scProduct = normalizeItemCode(get("SC - Cód. Produto"));
        const ofProduct = normalizeItemCode(get("OF - Cód. Produto"));
        const recProduct = normalizeItemCode(get("REC - Cód Produto"));
        const codes = [...new Set([scProduct, ofProduct, recProduct].filter((code) => code && !isEchoHeader(code)))];
        if (!codes.length) return;

        const scCode = clean(get("SC - Código"));
        const scStatus = clean(get("SC - Situação"));
        const scCancelled = clean(get("SC - Cancelado"));
        const ofCode = clean(get("OF - Codigo"));
        const supplier = first(clean(get("REC - Fornecedor")), clean(get("OF - Nome Fornecedor")));
        const category = clean(get("SC - Categoria"));
        const unit = first(clean(get("REC - Unid. Medida")), clean(get("OF - Unidade Medida")), clean(get("SC - Unid. Medida")));
        const name = first(clean(get("REC - Nome Produto")), clean(get("OF - Nome Produto")), clean(get("SC - Nome Produto")));
        const detailedName = clean(get("SC - Desc. Material"));

        const sc = scCode ? {
          code: scCode,
          status: scStatus,
          date: clean(get("SC - Data Criação")),
          deliveryDate: clean(get("SC - DT Entrega")),
          quantity: parseNumber(get("SC - Quantidade")),
          estimatedValue: parseNumber(get("SC - Valor Estimado")),
          category,
          reason: clean(get("SC - Motivo")),
          cancelled: scCancelled,
        } : null;

        const of = ofCode ? {
          code: ofCode,
          date: clean(get("OF - Data")),
          deliveryDate: clean(get("OF - Data Entrega")),
          supplier,
          requestedQuantity: parseNumber(get("OF - Qtd. Solicitada")),
          deliveredQuantity: parseNumber(get("OF - Qtd. Entregue")),
          unitValue: parseNumber(get("OF - Valor")),
          status: clean(get("OF - Situação OF")),
          closed: clean(get("OF - Fechado")),
          blocked: clean(get("OF - Bloqueado")),
          currency: clean(get("OF - Moeda")),
        } : null;

        const invoice = clean(get("REC - Nr NF"));
        const rec = (invoice || recProduct) ? {
          invoice,
          series: clean(get("REC - Série")),
          issueDate: clean(get("REC - DT Emissão")),
          entryDate: clean(get("REC - DT Entrada")),
          supplier,
          quantity: parseNumber(get("REC - Quantidade")),
          unitValue: parseNumber(get("REC - Valor Un. Fiscal")),
          documentValue: parseNumber(get("REC - Valor Doc.")),
          currency: clean(get("REC - Moeda")),
        } : null;

        const branch = first(
          clean(get("REC - Nome Filial")),
          clean(get("OF - Descr. Filial Entrega")),
          clean(get("SC - Descr. Filial")),
        );
        const record = {
          sc,
          of,
          rec,
          branch,
          sortKey: dateKey(first(rec?.entryDate, rec?.issueDate, of?.date, sc?.date)),
        };

        const pending = Boolean(
          scCode
          && normalizeText(scStatus) === "compra confirmada"
          && scCancelled.toUpperCase() !== "S"
          && !ofCode
        );

        for (const code of codes) {
          const item = ensureItem(items, code);
          item.name = item.name || name || detailedName;
          item.detailedName = item.detailedName || detailedName;
          if (category) item._categories.add(category);
          if (unit) item._units.add(unit);
          if (supplier) item._suppliers.add(supplier);
          if (pending && scCode) item._pendingScCodes.add(scCode);
          item.history.push(record);
        }

        if (comprasRows % 6000 === 0) progress(`Relacionando compras: ${comprasRows.toLocaleString("pt-BR")} registros…`);
      });

      progress("Preparando os cards e os indicadores…");
      const output = [];
      for (const item of items.values()) {
        item.flags.purchaseOnly = item.positions.length === 0;
        item.name ||= "Item sem descrição";
        item.detailedName ||= item.name;
        item.positions.sort((a, b) => `${a.branchCode}-${a.localCode}`.localeCompare(`${b.branchCode}-${b.localCode}`, "pt-BR", { numeric: true }));
        item.history.sort((a, b) => b.sortKey - a.sortKey);
        item.categories = [...item._categories];
        item.units = [...item._units];
        item.suppliers = [...item._suppliers].sort((a, b) => a.localeCompare(b, "pt-BR"));
        item.pendingScCodes = [...item._pendingScCodes];
        delete item._categories;
        delete item._units;
        delete item._suppliers;
        delete item._pendingScCodes;
        output.push(item);
      }

      const consumption = parseConsumptionCsv(consumoText);

      self.postMessage({
        type: "complete",
        payload: { items: output, saldoRows, comprasRows, consumption },
      });
    } catch (error) {
      self.postMessage({ type: "error", message: error?.message || String(error) });
    }
  };

  async function fetchText(url, label) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`${label}: arquivo não encontrado (${response.status}).`);
    return decoder.decode(await response.arrayBuffer());
  }

  async function fetchOptionalText(url) {
    if (!url) return null;
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) return null;
      return decoder.decode(await response.arrayBuffer());
    } catch {
      return null;
    }
  }

  function parseConsumptionCsv(text) {
    if (text === null) return { available: false, headers: [], rows: [], rowCount: 0 };

    let headers = [];
    const rows = [];
    let rowCount = 0;
    parseCsv(text, (csvHeaders, row) => {
      if (!headers.length) headers = csvHeaders.map(clean);
      rowCount += 1;
      if (rows.length < 20) rows.push(row.slice(0, 12));
    });

    return { available: true, headers, rows, rowCount };
  }

  function progress(message) {
    self.postMessage({ type: "progress", message });
  }

  function parseCsv(text, onRow) {
    let headers = null;
    let row = [];
    let field = "";
    let quoted = false;

    const emitRow = () => {
      row.push(field);
      field = "";
      if (!headers) {
        headers = row.map((value, index) => index === 0 ? value.replace(/^\uFEFF/, "") : value);
      } else if (row.some((value) => value !== "")) {
        onRow(headers, row);
      }
      row = [];
    };

    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];

      if (quoted) {
        if (character === '"') {
          if (text[index + 1] === '"') {
            field += '"';
            index += 1;
          } else {
            quoted = false;
          }
        } else {
          field += character;
        }
        continue;
      }

      if (character === '"') {
        quoted = true;
      } else if (character === ";") {
        row.push(field);
        field = "";
      } else if (character === "\n") {
        emitRow();
      } else if (character !== "\r") {
        field += character;
      }
    }

    if (field || row.length) emitRow();
  }

  function rowGetter(headers, row) {
    let indexes = headerIndexes.get(headers);
    if (!indexes) {
      indexes = new Map();
      headers.forEach((header, index) => indexes.set(canonicalHeader(header), index));
      headerIndexes.set(headers, indexes);
    }
    return (name) => {
      let key = requestedHeaderKeys.get(name);
      if (!key) {
        key = canonicalHeader(name);
        requestedHeaderKeys.set(name, key);
      }
      return row[indexes.get(key)] ?? "";
    };
  }

  function canonicalHeader(value) {
    return clean(value).replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
  }

  function clean(value) {
    return String(value ?? "").trim();
  }

  function first(...values) {
    return values.find((value) => value !== "" && value !== null && value !== undefined) ?? "";
  }

  function normalizeText(value) {
    return clean(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR")
      .replace(/\s+/g, " ");
  }

  function normalizeItemCode(value) {
    const code = clean(value);
    return /^\d+\.0$/.test(code) ? code.slice(0, -2) : code;
  }

  function isEchoHeader(code) {
    return /c[oó]d\.?\s*produto|c[oó]d\.?\s*item/i.test(code);
  }

  function parseNumber(value) {
    let text = clean(value).replace(/\s/g, "").replace(/R\$/gi, "");
    if (!text) return null;
    if (text.includes(",")) text = text.replace(/\./g, "").replace(",", ".");
    const number = Number(text);
    return Number.isFinite(number) ? number : null;
  }

  function ensureItem(items, code) {
    if (!items.has(code)) {
      items.set(code, {
        code,
        name: "",
        detailedName: "",
        balanceTotal: 0,
        stockValueTotal: 0,
        positions: [],
        history: [],
        flags: {
          belowMin: false,
          aboveMax: false,
          outOfStock: false,
          unconfigured: false,
          negative: false,
          purchaseOnly: false,
        },
        _categories: new Set(),
        _units: new Set(),
        _suppliers: new Set(),
        _pendingScCodes: new Set(),
      });
    }
    return items.get(code);
  }

  function dateKey(value) {
    const text = clean(value);
    if (!text) return 0;

    const br = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (br) return Date.UTC(Number(br[3]), Number(br[2]) - 1, Number(br[1]), Number(br[4] || 0), Number(br[5] || 0));

    const iso = Date.parse(text);
    return Number.isFinite(iso) ? iso : 0;
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { inventoryWorker };
}
