"use strict";

const CONFIG = Object.freeze({
  saldoFile: "00 - Saldo_Online.csv",
  comprasFile: "01 - Compras_Almox.csv.gz",
  consumoFile: "03 - Consumo.csv",
  imageApi: "https://api.github.com/repos/tiagosilvagba/Almoxarifado/contents/imagens?ref=main",
  imageFolder: "imagens",
  maxImages: 6,
  historyBatch: 20,
  procurementBatch: 60,
});

const THEME_IDS = new Set([
  "polar", "rubi", "industrial", "graphite", "operations",
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
  pendingScRows: [],
  pendingScByKey: new Map(),
  activePendingSc: null,
  procurementRows: [],
  procurementByKey: new Map(),
  procurementVisible: 0,
  activeProcurement: null,
  localPhotos: new Map(),
  consumption: { available: false, headers: [], rows: [], rowCount: 0 },
};

const ui = {};

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", init);
}

async function init() {
  cacheUi();
  initializeTheme();
  initializeDensity();
  bindEvents();
  navigateToPage(pageFromHash(), false);
  await loadLocalPhotoCache();
  await loadCatalog();
}

function cacheUi() {
  const ids = [
    "statusLine", "refreshButton", "themeSelect", "densityToggle", "loadingPanel", "loadingTitle", "loadingMessage",
    "retryButton", "catalogContent", "metricsContext", "metricItems", "metricQuantity", "metricZero", "metricReconciliation",
    "metricValue", "metricPurchaseValue", "metricExcessValue", "metricActionProcesses", "metricBelowMin", "metricAboveMax",
    "metricUnconfigured", "metricPendingSc", "metricNegative", "metricOpenOf", "branchChart", "stockChart", "valueChart",
    "dashboardPriorityList", "dashboardExcessList", "procurementFunnel", "searchInput",
    "branchFilter", "locationFilter", "categoryFilter", "unitFilter", "supplierFilter",
    "stockStatusFilter", "positiveBalanceFilter", "clearFilters", "applyFiltersButton",
    "filterToggleButton", "closeFiltersButton", "globalFiltersPanel", "activeFilterCount",
    "filterSummary", "catalogSort", "catalogView", "resultCount", "cardsGrid", "emptyState",
    "loadMoreButton", "visibleCount", "itemModal", "modalCode", "modalTitle",
    "modalSubtitle", "modalClose", "modalPrevious", "modalNext", "modalBadges", "modalGallery", "modalBalance",
    "modalStockValue", "modalPositionCount", "modalHistoryCount", "modalDetails",
    "stockTableWrap", "historySummary", "historyTableWrap", "historyLoadMore",
    "purchaseNeedItems", "purchaseNeedPositions", "purchaseNeedRuptures", "purchaseNeedEstimated", "purchaseNeedWithoutMax",
    "purchaseNeedResultCount", "purchaseNeedTableWrap",
    "pendingScListCount", "pendingScTableWrap", "exportPurchaseNeedButton", "exportPendingScButton", "exportProcurementButton",
    "purchaseNeedModal", "purchaseModalClose",
    "purchaseModalCode", "purchaseModalTitle", "purchaseModalSubtitle", "purchaseModalSummary",
    "purchaseModalDetails", "purchaseModalOpenItem", "pendingScModal", "pendingScModalClose",
    "pendingScModalCode", "pendingScModalTitle", "pendingScModalSubtitle", "pendingScModalSummary",
    "pendingScModalDetails", "pendingScModalOpenItem", "procurementCount", "procurementGrid",
    "procurementAwaiting", "procurementOpen", "procurementPartial", "procurementReceived",
    "procurementLoadMore", "procurementVisibleCount", "procurementModal", "procurementModalClose",
    "procurementModalCode", "procurementModalTitle", "procurementModalSubtitle", "procurementModalStages",
    "procurementModalDetails", "procurementModalOpenItem", "photoInput", "photoUploadButton", "photoUploadStatus",
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
  ui.densityToggle.addEventListener("click", toggleDensity);
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
  ui.catalogSort.addEventListener("change", applyFilters);
  ui.catalogView.addEventListener("change", () => ui.cardsGrid.classList.toggle("is-list-view", ui.catalogView.value === "list"));

  ui.clearFilters.addEventListener("click", clearFilters);
  ui.applyFiltersButton.addEventListener("click", () => applyAllFilters(true));
  ui.filterToggleButton.addEventListener("click", toggleFilters);
  ui.filterSummary.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-clear-filter]");
    if (!trigger) return;
    const id = trigger.dataset.clearFilter;
    if (id === "positiveBalanceFilter") ui.positiveBalanceFilter.checked = false;
    else if (ui[id]) ui[id].value = "";
    handleAutomaticFilter(id);
  });
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
    const trigger = event.target.closest("[data-pending-sc-key]");
    if (trigger) openPendingScModal(trigger.dataset.pendingScKey);
  });
  ui.exportPurchaseNeedButton.addEventListener("click", exportPurchaseNeeds);
  ui.exportPendingScButton.addEventListener("click", exportPendingSc);
  ui.exportProcurementButton.addEventListener("click", exportProcurement);

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
  ui.pendingScModalClose.addEventListener("click", closePendingScModal);
  ui.pendingScModal.addEventListener("click", (event) => {
    if (event.target === ui.pendingScModal) closePendingScModal();
  });
  ui.pendingScModal.addEventListener("close", () => {
    state.activePendingSc = null;
    state.lastFocusedElement?.focus?.();
  });
  ui.pendingScModalOpenItem.addEventListener("click", () => {
    const code = state.activePendingSc?.item.code;
    closePendingScModal();
    if (code) window.setTimeout(() => openItem(code), 0);
  });
  ui.procurementLoadMore.addEventListener("click", renderNextProcurementBatch);
  ui.procurementGrid.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-procurement-key]");
    if (trigger) openProcurementModal(trigger.dataset.procurementKey);
  });
  ui.procurementModalClose.addEventListener("click", closeProcurementModal);
  ui.procurementModal.addEventListener("click", (event) => {
    if (event.target === ui.procurementModal) closeProcurementModal();
  });
  ui.procurementModal.addEventListener("close", () => { state.activeProcurement = null; state.lastFocusedElement?.focus?.(); });
  ui.procurementModalOpenItem.addEventListener("click", () => {
    const code = state.activeProcurement?.item.code;
    closeProcurementModal();
    if (code) window.setTimeout(() => openItem(code), 0);
  });
  ui.photoUploadButton.addEventListener("click", () => ui.photoInput.click());
  ui.photoInput.addEventListener("change", handlePhotoUpload);
  ui.modalGallery.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-local-photo-id]");
    if (remove) removeLocalPhoto(remove.dataset.localPhotoId);
  });
  for (const chart of [ui.branchChart, ui.stockChart]) chart.addEventListener("click", handleChartFilter);
  ui.dashboardPriorityList.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-purchase-need-key]");
    if (trigger) openPurchaseNeedModal(trigger.dataset.purchaseNeedKey);
  });
  ui.dashboardExcessList.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-item-code]");
    if (trigger) openItem(trigger.dataset.itemCode);
  });
  document.addEventListener("click", (event) => {
    const pageLink = event.target.closest("[data-page-link]");
    if (pageLink) navigateToPage(pageLink.dataset.pageLink, true);
    const filterLink = event.target.closest("[data-filter-link]");
    if (filterLink) {
      ui.stockStatusFilter.value = filterLink.dataset.filterLink;
      handleAutomaticFilter("stockStatusFilter");
      navigateToPage("catalogo", true);
    }
    const sortLink = event.target.closest("[data-sort-link]");
    if (sortLink) { ui.catalogSort.value = sortLink.dataset.sortLink; applyFilters(); navigateToPage("catalogo", true); }
    if (event.target.closest("[data-positive-link]")) { ui.positiveBalanceFilter.checked = true; handleAutomaticFilter("positiveBalanceFilter"); navigateToPage("catalogo", true); }
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
  ui.modalPrevious.addEventListener("click", () => navigateItemModal(-1));
  ui.modalNext.addEventListener("click", () => navigateItemModal(1));
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

function initializeDensity() {
  let compact = false;
  try { compact = localStorage.getItem("almoxarifado-density") === "compact"; } catch { compact = false; }
  document.documentElement.dataset.density = compact ? "compact" : "comfortable";
  ui.densityToggle.setAttribute("aria-pressed", String(compact));
  ui.densityToggle.textContent = compact ? "Modo confortável" : "Modo compacto";
}

function toggleDensity() {
  const compact = document.documentElement.dataset.density !== "compact";
  document.documentElement.dataset.density = compact ? "compact" : "comfortable";
  ui.densityToggle.setAttribute("aria-pressed", String(compact));
  ui.densityToggle.textContent = compact ? "Modo confortável" : "Modo compacto";
  try { localStorage.setItem("almoxarifado-density", compact ? "compact" : "comfortable"); } catch { /* preferência válida apenas nesta sessão */ }
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
  return ["dashboard", "catalogo", "necessidade-compra", "sc-pendente-of", "consulta-sc-of", "revisao-min-max"].includes(page)
    ? page
    : "dashboard";
}

function navigateToPage(page, updateHash) {
  const validPage = ["dashboard", "catalogo", "necessidade-compra", "sc-pendente-of", "consulta-sc-of", "revisao-min-max"].includes(page)
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
    "sc-pendente-of": "SC Pendente de OF",
    "consulta-sc-of": "Consulta SC e OF",
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
  renderPendingScList();
  renderPurchaseNeeds();
  buildProcurementRows();
  updateDashboardMetrics();
  renderDashboardCharts();
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
  if (query) labels.push(["searchInput", `Busca: ${query}`]);
  if (ui.branchFilter.value) labels.push(["branchFilter", ui.branchFilter.selectedOptions[0]?.textContent || `Filial ${ui.branchFilter.value}`]);
  if (ui.locationFilter.value) labels.push(["locationFilter", ui.locationFilter.selectedOptions[0]?.textContent || "Local selecionado"]);
  for (const select of [ui.categoryFilter, ui.unitFilter, ui.supplierFilter, ui.stockStatusFilter]) {
    if (select.value) labels.push([select.id, select.selectedOptions[0]?.textContent || select.value]);
  }
  if (ui.positiveBalanceFilter.checked) labels.push(["positiveBalanceFilter", "Somente saldo positivo"]);

  ui.activeFilterCount.textContent = String(labels.length);
  ui.activeFilterCount.classList.toggle("is-hidden", !labels.length);
  ui.filterSummary.innerHTML = labels.length
    ? labels.map(([id, label]) => `<button type="button" data-clear-filter="${escapeHtml(id)}" title="Remover filtro ${escapeHtml(label)}"><span>${escapeHtml(label)}</span><b aria-hidden="true">×</b></button>`).join("")
    : "Todas as filiais · todos os itens";
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
    const activeStockItems = state.items.filter((item) => !item.flags.inactiveOnly && item.positions.length).length;
    const purchaseOnlyItems = state.items.filter((item) => item.flags.purchaseOnly).length;
    ui.statusLine.textContent = `${integerFormatter.format(activeStockItems)} no estoque ativo · ${integerFormatter.format(purchaseOnlyItems)} somente em compras · ${time}`;
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
    item.flags.locationAdjustment = itemNeedsLocationAdjustment(item);
    item.searchText = normalizeSearch([
      item.code,
      item.name,
      item.detailedName,
      ...(item.categories || []),
      ...(item.suppliers || []),
      ...(item.units || []),
      ...(item.history || []).flatMap((record) => [
        record.sc?.code, record.sc?.status,
        record.of?.code, record.of?.status, record.of?.supplier,
        record.rec?.invoice, record.rec?.series, record.rec?.supplier,
      ]),
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
    if (item.flags.inactiveOnly) continue;
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
    if (item.flags.inactiveOnly) continue;
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

  if (item.flags.inactiveOnly) return false;

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
  if (status === "adjust-location" && !itemNeedsLocationAdjustment(item, branch, location)) return false;
  if (status && status !== "adjust-location" && !positions.some((position) => positionMatchesStatus(position, status))) return false;
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
    if (item.flags.inactiveOnly) return false;
    if (query && !item.searchText.includes(query)) return false;
    const matchingPositions = (item.positions || []).filter((position) => {
      if (branch && position.branchCode !== branch) return false;
      if (location && position.locationKey !== location) return false;
      return true;
    });
    if ((branch || location) && !matchingPositions.length) return false;
    if (stockStatus === "adjust-location" && !itemNeedsLocationAdjustment(item, branch, location)) return false;
    if (stockStatus && stockStatus !== "adjust-location" && !matchingPositions.some((position) => positionMatchesStatus(position, stockStatus))) return false;
    if (category && !(item.categories || []).includes(category)) return false;
    if (unit && !(item.units || []).includes(unit)) return false;
    if (supplier && !(item.suppliers || []).includes(supplier)) return false;
    if (positiveOnly && matchingPositions.reduce((sum, position) => sum + position.quantity, 0) <= 0) return false;
    return true;
  });

  const sort = ui.catalogSort.value;
  state.filteredItems.sort((a, b) => {
    if (sort === "description") return a.name.localeCompare(b.name, "pt-BR", { numeric: true, sensitivity: "base" });
    if (sort === "balance") return b.balanceTotal - a.balanceTotal || a.code.localeCompare(b.code, "pt-BR", { numeric: true });
    if (sort === "value") return b.stockValueTotal - a.stockValueTotal || a.code.localeCompare(b.code, "pt-BR", { numeric: true });
    if (sort === "critical") return itemCriticality(b) - itemCriticality(a) || a.code.localeCompare(b.code, "pt-BR", { numeric: true });
    return a.code.localeCompare(b.code, "pt-BR", { numeric: true, sensitivity: "base" });
  });

  ui.resultCount.textContent = pluralize(state.filteredItems.length, "item", "itens");

  state.renderedCount = 0;
  ui.cardsGrid.replaceChildren();
  renderNextBatch();
}

function itemCriticality(item) {
  const positions = currentScopedPositions(item, false);
  if (positions.some((position) => position.quantity < 0)) return 7;
  if (positions.some((position) => position.quantity === 0 && position.minimum + position.maximum > 0)) return 6;
  if (positions.some((position) => position.minimum > 0 && position.quantity > 0 && position.quantity < position.minimum)) return 5;
  if (item.flags.locationAdjustment) return 4;
  if (positions.some((position) => position.maximum > 0 && position.quantity > position.maximum)) return 3;
  if (positions.some((position) => position.quantity > 0 && position.minimum + position.maximum === 0)) return 2;
  if (item.flags.purchaseOnly) return 1;
  return 0;
}

function positionMatchesStatus(position, status) {
  const minimum = position.minimum ?? 0;
  const maximum = position.maximum ?? 0;
  const quantity = position.quantity ?? 0;

  if (status === "zero") return quantity === 0 && minimum + maximum > 0;
  if (status === "below-min") return minimum > 0 && quantity > 0 && quantity < minimum;
  if (status === "above-max") return maximum > 0 && quantity > maximum;
  if (status === "within-range") return minimum > 0 && maximum > 0 && quantity >= minimum && quantity <= maximum;
  if (status === "unconfigured") return quantity > 0 && minimum + maximum === 0;
  if (status === "negative") return quantity < 0;
  return true;
}

function itemNeedsLocationAdjustment(item, branch = "", location = "") {
  const positions = (item.positions || []).filter((position) => !branch || position.branchCode === branch);
  for (const balancePosition of positions) {
    if (!(balancePosition.quantity > 0)) continue;
    for (const limitsPosition of positions) {
      if (limitsPosition.locationKey === balancePosition.locationKey) continue;
      if (!((limitsPosition.minimum || 0) + (limitsPosition.maximum || 0) > 0)) continue;
      if (location && balancePosition.locationKey !== location && limitsPosition.locationKey !== location) continue;
      return true;
    }
  }
  return false;
}

function currentScopedPositions(item, includeStatus = true) {
  const branch = ui.branchFilter.value;
  const location = ui.locationFilter.value;
  const status = includeStatus ? ui.stockStatusFilter.value : "";
  return (item.positions || []).filter((position) => {
    if (branch && position.branchCode !== branch) return false;
    if (location && position.locationKey !== location) return false;
    if (status && status !== "adjust-location" && !positionMatchesStatus(position, status)) return false;
    return true;
  });
}

function strictOpenOfRecords() {
  const branch = effectiveBranchFilter();
  const supplier = ui.supplierFilter.value;
  const query = normalizeSearch(ui.searchInput.value);
  const rows = new Map();
  for (const item of state.filteredItems) {
    for (const record of item.history || []) {
      const of = record.of;
      if (!of?.code || !(of.balance > 0)) continue;
      if (branch && record.branchCode !== branch) continue;
      if (supplier && normalizeSearch(of.supplier) !== normalizeSearch(supplier)) continue;
      if (query && !recordMatchesQuery(item, record, query)) continue;
      if (!rows.has(of.code)) rows.set(of.code, { item, record, of });
    }
  }
  return [...rows.values()];
}

function updateDashboardMetrics() {
  const scopedItems = new Set();
  const codesWithStock = new Set();
  const zeroCodes = new Set();
  let value = 0;
  const belowMinCodes = new Set();
  const aboveMaxCodes = new Set();
  const unconfiguredCodes = new Set();
  const negativeCodes = new Set();
  const pendingSc = new Set(collectPendingScRows().map(({ sc }) => sc.code));
  const openOf = strictOpenOfRecords();
  let excessValue = 0;

  for (const item of state.filteredItems) {
    if (!(item.positions || []).length) continue;
    const positions = currentScopedPositions(item);
    if (!positions.length) continue;
    scopedItems.add(item.code);

    const itemBalance = positions.reduce((sum, position) => sum + (position.quantity || 0), 0);
    const itemLimits = positions.reduce((sum, position) => sum + (position.minimum || 0) + (position.maximum || 0), 0);
    if (itemBalance !== 0) {
      codesWithStock.add(item.code);
    } else if (itemLimits > 0) {
      zeroCodes.add(item.code);
    }

    for (const position of positions) {
      value += position.stockValue || 0;
      if (position.minimum > 0 && position.quantity > 0 && position.quantity < position.minimum) belowMinCodes.add(item.code);
      if (position.aboveMax) aboveMaxCodes.add(item.code);
      if (position.unconfigured) unconfiguredCodes.add(item.code);
      if (position.negative) negativeCodes.add(item.code);
      if (position.maximum > 0 && position.quantity > position.maximum) {
        excessValue += (position.quantity - position.maximum) * (position.unitCost || 0);
      }
    }
  }

  const purchaseValue = getVisiblePurchaseNeeds().reduce((sum, need) => sum + (need.estimatedValue || 0), 0);

  ui.metricItems.textContent = integerFormatter.format(scopedItems.size);
  ui.metricQuantity.textContent = integerFormatter.format(codesWithStock.size);
  ui.metricQuantity.title = pluralize(codesWithStock.size, "código com saldo", "códigos com saldo");
  ui.metricZero.textContent = integerFormatter.format(zeroCodes.size);
  ui.metricValue.textContent = compactCurrencyFormatter.format(value);
  ui.metricValue.title = currencyFormatter.format(value);
  ui.metricPurchaseValue.textContent = compactCurrencyFormatter.format(purchaseValue);
  ui.metricPurchaseValue.title = currencyFormatter.format(purchaseValue);
  ui.metricExcessValue.textContent = compactCurrencyFormatter.format(excessValue);
  ui.metricExcessValue.title = currencyFormatter.format(excessValue);
  ui.metricBelowMin.textContent = integerFormatter.format(belowMinCodes.size);
  ui.metricAboveMax.textContent = integerFormatter.format(aboveMaxCodes.size);
  ui.metricUnconfigured.textContent = integerFormatter.format(unconfiguredCodes.size);
  ui.metricPendingSc.textContent = integerFormatter.format(pendingSc.size);
  ui.metricNegative.textContent = integerFormatter.format(negativeCodes.size);
  ui.metricOpenOf.textContent = integerFormatter.format(openOf.length);
  ui.metricActionProcesses.textContent = integerFormatter.format(pendingSc.size + openOf.length);
  const dateAnomalies = countFutureDateAnomalies();
  ui.metricReconciliation.textContent = `${integerFormatter.format(scopedItems.size)} códigos ativos = ${integerFormatter.format(codesWithStock.size)} com saldo + ${integerFormatter.format(zeroCodes.size)} zerados parametrizados${dateAnomalies ? ` · Atenção: ${pluralize(dateAnomalies, "data futura atípica", "datas futuras atípicas")}` : ""}`;
  ui.metricsContext.textContent = ui.locationFilter.value
    ? ui.locationFilter.selectedOptions[0]?.textContent || "Local selecionado"
    : ui.branchFilter.value
      ? ui.branchFilter.selectedOptions[0]?.textContent || `Filial ${ui.branchFilter.value}`
      : "Todas as filiais · códigos únicos";
}

function countFutureDateAnomalies() {
  const limit = Date.now() + 366 * 86400000;
  const records = new Set();
  for (const item of state.filteredItems) for (const record of item.history || []) {
    for (const [key, value] of [[`SC:${record.sc?.code}:entrega`, record.sc?.deliveryDate], [`OF:${record.of?.code}:entrega`, record.of?.deliveryDate], [`REC:${record.rec?.invoice}:entrada`, record.rec?.entryDate]]) {
      const timestamp = dateTimestamp(value);
      if (timestamp > limit) records.add(key);
    }
  }
  return records.size;
}

function renderDashboardCharts() {
  const branchData = new Map();
  for (const item of state.filteredItems) {
    for (const position of currentScopedPositions(item)) {
      if (!branchData.has(position.branchCode)) branchData.set(position.branchCode, { label: [position.branchCode, position.branchName].filter(Boolean).join(" · "), codes: new Set(), value: 0 });
      const entry = branchData.get(position.branchCode);
      entry.codes.add(item.code);
      entry.value += position.stockValue || 0;
    }
  }
  const branches = [...branchData.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR", { numeric: true }));
  const maxCodes = Math.max(1, ...branches.map(([, value]) => value.codes.size));
  ui.branchChart.innerHTML = branches.map(([code, value]) => `<button class="chart-bar" type="button" data-chart-branch="${escapeHtml(code)}" aria-label="Filtrar filial ${escapeHtml(value.label)}">
    <span class="chart-bar__label">${escapeHtml(value.label)}</span><span class="chart-bar__track"><i style="width:${(value.codes.size / maxCodes) * 100}%"></i></span><strong>${integerFormatter.format(value.codes.size)}</strong>
  </button>`).join("") || `<div class="chart-empty">Sem dados para os filtros atuais.</div>`;

  const statusDefinitions = [
    ["zero", "Zerados parametrizados", "var(--cyan)"],
    ["below-min", "Abaixo do mínimo", "var(--amber)"],
    ["above-max", "Acima do máximo", "var(--red)"],
    ["within-range", "Dentro do range", "var(--green)"],
  ];
  const statuses = statusDefinitions.map(([key, label, color]) => [key, label, state.filteredItems.filter((item) => currentScopedPositions(item, false).some((position) => positionMatchesStatus(position, key))).length, color]);
  const maxStatus = Math.max(1, ...statuses.map((status) => status[2]));
  ui.stockChart.innerHTML = statuses.map(([key, label, count, color]) => `<button class="status-bar" type="button" data-chart-status="${key}"><span><i style="background:${color}"></i>${escapeHtml(label)}</span><span class="status-bar__track"><i style="width:${(count / maxStatus) * 100}%;background:${color}"></i></span><strong>${integerFormatter.format(count)}</strong></button>`).join("");

  const maxValue = Math.max(1, ...branches.map(([, value]) => value.value));
  ui.valueChart.innerHTML = branches.map(([, value]) => `<div class="chart-bar chart-bar--static"><span class="chart-bar__label">${escapeHtml(value.label)}</span><span class="chart-bar__track"><i style="width:${(value.value / maxValue) * 100}%"></i></span><strong>${compactCurrencyFormatter.format(value.value)}</strong></div>`).join("") || `<div class="chart-empty">Sem valores para os filtros atuais.</div>`;
  renderProcurementFunnel();
  renderDecisionLists();
}

function renderProcurementFunnel() {
  const sc = new Set();
  const of = new Set();
  const rec = new Set();
  for (const { record } of state.procurementRows) {
    if (record.sc?.code) sc.add(record.sc.code);
    if (record.of?.code) of.add(record.of.code);
    if (record.rec?.invoice) rec.add(`${record.rec.invoice}::${record.rec.series || ""}`);
  }
  const max = Math.max(1, sc.size, of.size, rec.size);
  ui.procurementFunnel.innerHTML = [
    ["SC", "Solicitações", sc.size, "var(--violet)"],
    ["OF", "Ordens de fornecimento", of.size, "var(--blue-600)"],
    ["REC", "Recebimentos", rec.size, "var(--green)"],
  ].map(([prefix, label, count, color]) => `<button type="button" data-page-link="consulta-sc-of" style="--funnel-color:${color};--funnel-width:${Math.max(18, count / max * 100)}%"><span>${prefix}</span><strong>${integerFormatter.format(count)}</strong><small>${label}</small><i></i></button>`).join("");
}

function renderDecisionLists() {
  const needs = getVisiblePurchaseNeeds().filter((need) => need.netSuggested > 0).sort((a, b) => b.estimatedValue - a.estimatedValue).slice(0, 5);
  ui.dashboardPriorityList.innerHTML = needs.map((need) => `<button type="button" data-purchase-need-key="${escapeHtml(need.key)}"><span><strong>${escapeHtml(need.item.code)} · ${escapeHtml(need.item.name)}</strong><small>${escapeHtml([need.position.branchCode, need.position.localCode].filter(Boolean).join(" · "))}</small></span><b>${currencyFormatter.format(need.estimatedValue)}</b></button>`).join("") || `<p class="chart-empty">Sem necessidade para o recorte atual.</p>`;

  const excess = [];
  for (const item of state.filteredItems) for (const position of currentScopedPositions(item)) {
    if (!(position.maximum > 0 && position.quantity > position.maximum)) continue;
    excess.push({ item, position, value: (position.quantity - position.maximum) * (position.unitCost || 0) });
  }
  excess.sort((a, b) => b.value - a.value);
  ui.dashboardExcessList.innerHTML = excess.slice(0, 5).map(({ item, position, value }) => `<button type="button" data-item-code="${escapeHtml(item.code)}"><span><strong>${escapeHtml(item.code)} · ${escapeHtml(item.name)}</strong><small>${escapeHtml([position.branchCode, position.localCode].filter(Boolean).join(" · "))} · excesso ${numberFormatter.format(position.quantity - position.maximum)}</small></span><b>${currencyFormatter.format(value)}</b></button>`).join("") || `<p class="chart-empty">Sem excesso para o recorte atual.</p>`;
}

function handleChartFilter(event) {
  const branch = event.target.closest("[data-chart-branch]")?.dataset.chartBranch;
  const status = event.target.closest("[data-chart-status]")?.dataset.chartStatus;
  if (branch) ui.branchFilter.value = ui.branchFilter.value === branch ? "" : branch;
  if (status) ui.stockStatusFilter.value = ui.stockStatusFilter.value === status ? "" : status;
  handleAutomaticFilter(branch ? "branchFilter" : "stockStatusFilter");
}

function buildPurchaseNeeds() {
  const needs = [];

  for (const item of state.items) {
    const availableOfByBranch = new Map();
    for (const position of item.positions || []) {
      if (!(position.minimum > 0 && position.quantity < position.minimum)) continue;
      const target = position.maximum > 0 ? position.maximum : position.minimum;
      const grossSuggested = Math.max(target - position.quantity, 0);
      if (!availableOfByBranch.has(position.branchCode)) availableOfByBranch.set(position.branchCode, getItemOpenOfBalance(item, position.branchCode));
      const openOfBalance = Math.min(availableOfByBranch.get(position.branchCode) || 0, grossSuggested);
      availableOfByBranch.set(position.branchCode, Math.max((availableOfByBranch.get(position.branchCode) || 0) - openOfBalance, 0));
      const netSuggested = Math.max(grossSuggested - openOfBalance, 0);
      const referencePrice = position.unitCost || latestPurchasePrice(item) || 0;
      needs.push({
        item,
        position,
        target,
        suggested: grossSuggested,
        openOfBalance,
        netSuggested,
        referencePrice,
        estimatedValue: netSuggested * referencePrice,
        rupture: position.quantity <= 0,
      });
    }
  }

  state.purchaseNeeds = needs.sort((a, b) => {
    if (a.rupture !== b.rupture) return a.rupture ? -1 : 1;
    if (a.estimatedValue !== b.estimatedValue) return b.estimatedValue - a.estimatedValue;
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

function latestPurchasePrice(item) {
  for (const record of item.history || []) {
    const value = firstDefined(record.rec?.unitValue, record.of?.unitValue);
    if (value > 0) return value;
  }
  return 0;
}

function getItemOpenOfBalance(item, branchCode = "") {
  const orders = new Map();
  for (const record of item.history || []) {
    if (!record.of?.code || !(record.of.balance > 0)) continue;
    if (branchCode && record.branchCode !== branchCode) continue;
    if (!orders.has(record.of.code)) orders.set(record.of.code, record.of.balance);
  }
  return [...orders.values()].reduce((sum, value) => sum + value, 0);
}

function renderPendingScList() {
  const rows = collectPendingScRows().sort((a, b) => {
    const dateOrder = dateTimestamp(a.sc.date) - dateTimestamp(b.sc.date);
    return dateOrder || a.sc.code.localeCompare(b.sc.code, "pt-BR", { numeric: true });
  });
  const uniqueSc = new Set(rows.map(({ sc }) => sc.code));
  state.pendingScRows = rows;
  state.pendingScByKey.clear();
  rows.forEach((row, index) => {
    row.key = `pending-sc-${index}`;
    state.pendingScByKey.set(row.key, row);
  });
  ui.pendingScListCount.textContent = `${pluralize(uniqueSc.size, "SC", "SCs")} · ${pluralize(rows.length, "item", "itens")}`;

  if (!rows.length) {
    ui.pendingScTableWrap.innerHTML = `<div class="table-empty">Nenhuma SC sem OF corresponde aos filtros aplicados.</div>`;
    return;
  }

  ui.pendingScTableWrap.innerHTML = rows.map(({ item, record, sc, key }) => `<button class="report-card report-card--sc" type="button" data-pending-sc-key="${escapeHtml(key)}">
    <span class="report-card__top"><span class="status-pill ${isOverdue(sc.deliveryDate) ? "status-pill--critical" : "status-pill--pending"}">SC ${escapeHtml(sc.code)}</span><span>${escapeHtml(ageLabel(sc.date))}</span></span>
    <strong class="report-card__title">${escapeHtml(item.name)}</strong>
    <span class="report-card__code">Código ${escapeHtml(item.code)}</span>
    <span class="report-card__meta"><span><small>Filial</small><strong>${escapeHtml(record.branch || "—")}</strong></span><span><small>Quantidade</small><strong>${formatOptionalNumber(sc.quantity)}</strong></span></span>
    <span class="report-card__footer"><span>${escapeHtml(formatDate(sc.deliveryDate, "Entrega não informada"))}${isOverdue(sc.deliveryDate) ? " · atrasada" : ""}</span><strong>${sc.estimatedValue == null ? "—" : currencyFormatter.format(sc.estimatedValue)}</strong></span>
  </button>`).join("");
}

function collectPendingScRows() {
  const rowsByKey = new Map();
  const branch = effectiveBranchFilter();
  const query = normalizeSearch(ui.searchInput.value);
  const category = ui.categoryFilter.value;
  const unit = ui.unitFilter.value;
  const supplier = ui.supplierFilter.value;
  const stockStatus = ui.stockStatusFilter.value;
  const positiveOnly = ui.positiveBalanceFilter.checked;
  for (const item of state.items) {
    if (query && !item.searchText.includes(query)) continue;
    if (category && !(item.categories || []).includes(category)) continue;
    if (unit && !(item.units || []).includes(unit)) continue;
    if (supplier && !(item.suppliers || []).includes(supplier)) continue;
    if (stockStatus || positiveOnly || ui.locationFilter.value) {
      const positions = (item.positions || []).filter((position) => {
        if (branch && position.branchCode !== branch) return false;
        if (ui.locationFilter.value && position.locationKey !== ui.locationFilter.value) return false;
        return true;
      });
      if (!positions.length) continue;
      if (stockStatus === "adjust-location" && !itemNeedsLocationAdjustment(item, branch, ui.locationFilter.value)) continue;
      if (stockStatus && stockStatus !== "adjust-location" && !positions.some((position) => positionMatchesStatus(position, stockStatus))) continue;
      if (positiveOnly && positions.reduce((sum, position) => sum + position.quantity, 0) <= 0) continue;
    }
    const pendingCodes = new Set(item.pendingScCodes || []);
    for (const record of item.history || []) {
      const sc = record.sc;
      if (!sc?.code || !pendingCodes.has(sc.code) || record.of?.code) continue;
      if (branch && record.branchCode !== branch) continue;
      if (query && !recordMatchesQuery(item, record, query)) continue;
      const key = `${sc.code}::${item.code}`;
      if (!rowsByKey.has(key)) rowsByKey.set(key, { item, record, sc });
    }
  }
  return [...rowsByKey.values()];
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
    if (stockStatus && stockStatus !== "adjust-location" && !positionMatchesStatus(position, stockStatus)) return false;
    return true;
  });

  const itemCodes = new Set(visible.map(({ item }) => item.code));
  const withoutMaximum = visible.filter(({ position }) => !(position.maximum > 0)).length;
  const ruptures = visible.filter(({ rupture }) => rupture).length;
  const estimatedValue = visible.reduce((sum, need) => sum + need.estimatedValue, 0);
  ui.purchaseNeedItems.textContent = integerFormatter.format(itemCodes.size);
  ui.purchaseNeedPositions.textContent = integerFormatter.format(visible.length);
  ui.purchaseNeedRuptures.textContent = integerFormatter.format(ruptures);
  ui.purchaseNeedEstimated.textContent = compactCurrencyFormatter.format(estimatedValue);
  ui.purchaseNeedEstimated.title = currencyFormatter.format(estimatedValue);
  ui.purchaseNeedWithoutMax.textContent = integerFormatter.format(withoutMaximum);
  ui.purchaseNeedResultCount.textContent = `${pluralize(visible.length, "posição", "posições")} exibida${visible.length === 1 ? "" : "s"}`;

  if (!visible.length) {
    ui.purchaseNeedTableWrap.innerHTML = `<div class="table-empty">Nenhuma necessidade de compra corresponde à busca informada.</div>`;
    return;
  }

  ui.purchaseNeedTableWrap.innerHTML = visible.map(({ item, position, netSuggested, openOfBalance, estimatedValue, rupture, key }) => `<button class="report-card report-card--need${rupture ? " is-critical" : ""}" type="button" data-purchase-need-key="${escapeHtml(key)}">
    <span class="report-card__top"><span class="status-pill ${rupture ? "status-pill--critical" : "status-pill--need"}">${rupture ? "Ruptura" : `Comprar ${numberFormatter.format(netSuggested)}`}</span><span>${escapeHtml((item.units || []).join(", ") || "—")}</span></span>
    <strong class="report-card__title">${escapeHtml(item.name)}</strong>
    <span class="report-card__code">Código ${escapeHtml(item.code)}</span>
    <span class="report-card__meta"><span><small>Saldo</small><strong>${numberFormatter.format(position.quantity)}</strong></span><span><small>OF aberta</small><strong>${numberFormatter.format(openOfBalance)}</strong></span><span><small>Compra líquida</small><strong>${numberFormatter.format(netSuggested)}</strong></span></span>
    <span class="report-card__footer"><span>${escapeHtml([position.branchCode, position.localCode].filter(Boolean).join(" · ") || "—")}</span><strong>${currencyFormatter.format(estimatedValue)}</strong></span>
  </button>`).join("");
}

function openPurchaseNeedModal(key) {
  const need = state.purchaseNeedByKey.get(key);
  if (!need) return;
  const { item, position, target, suggested, openOfBalance, netSuggested, referencePrice, estimatedValue, rupture } = need;
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
    <article><span>Necessidade bruta</span><strong>${numberFormatter.format(suggested)}</strong></article>
    <article><span>Saldo em OF aberta</span><strong>${numberFormatter.format(openOfBalance)}</strong></article>
    <article><span>Comprar líquido</span><strong>${numberFormatter.format(netSuggested)}</strong></article>
    <article><span>Valor estimado</span><strong>${currencyFormatter.format(estimatedValue)}</strong></article>`;
  ui.purchaseModalDetails.innerHTML = `
    <div><dt>Unidade</dt><dd>${escapeHtml((item.units || []).join(", ") || "—")}</dd></div>
    <div><dt>Filial</dt><dd>${escapeHtml([position.branchCode, position.branchName].filter(Boolean).join(" · ") || "—")}</dd></div>
    <div><dt>Local</dt><dd>${escapeHtml([position.localCode, position.localName].filter(Boolean).join(" · ") || "—")}</dd></div>
    <div><dt>Prateleira</dt><dd>${escapeHtml(position.shelf || "—")}</dd></div>
    <div><dt>Fornecedores relacionados</dt><dd>${escapeHtml((item.suppliers || []).join(", ") || "—")}</dd></div>
    <div><dt>Prioridade</dt><dd>${rupture ? "Crítica — posição em ruptura" : "Atenção — saldo positivo abaixo do mínimo"}</dd></div>
    <div><dt>Preço de referência</dt><dd>${currencyFormatter.format(referencePrice)}</dd></div>
    <div><dt>Critério da sugestão</dt><dd>${position.maximum > 0 ? "Reposição até o máximo parametrizado" : "Máximo não informado; reposição até o mínimo"}</dd></div>`;

  if (typeof ui.purchaseNeedModal.showModal === "function") ui.purchaseNeedModal.showModal();
  else ui.purchaseNeedModal.setAttribute("open", "");
  ui.purchaseModalClose.focus();
}

function closePurchaseNeedModal() {
  if (typeof ui.purchaseNeedModal.close === "function" && ui.purchaseNeedModal.open) ui.purchaseNeedModal.close();
  else ui.purchaseNeedModal.removeAttribute("open");
}

function openPendingScModal(key) {
  const row = state.pendingScByKey.get(key);
  if (!row) return;
  const { item, record, sc } = row;
  state.activePendingSc = row;
  state.lastFocusedElement = document.activeElement;
  ui.pendingScModalCode.textContent = `SC ${sc.code}`;
  ui.pendingScModalTitle.textContent = item.name;
  ui.pendingScModalSubtitle.textContent = `Item ${item.code} · ${record.branch || "Filial não informada"}`;
  ui.pendingScModalSummary.innerHTML = `
    <article><span>Quantidade</span><strong>${formatOptionalNumber(sc.quantity)}</strong></article>
    <article><span>Valor estimado</span><strong>${sc.estimatedValue == null ? "—" : currencyFormatter.format(sc.estimatedValue)}</strong></article>
    <article><span>Criação</span><strong>${escapeHtml(formatDate(sc.date))}</strong></article>
    <article><span>Entrega</span><strong>${escapeHtml(formatDate(sc.deliveryDate))}</strong></article>
    <article><span>Tempo aguardando</span><strong>${escapeHtml(ageLabel(sc.date))}</strong></article>`;
  ui.pendingScModalDetails.innerHTML = `
    <div><dt>Situação</dt><dd>${escapeHtml(sc.status || "—")}</dd></div>
    <div><dt>Cancelada</dt><dd>${escapeHtml(sc.cancelled || "Não")}</dd></div>
    <div><dt>Categoria</dt><dd>${escapeHtml(sc.category || "—")}</dd></div>
    <div><dt>Motivo</dt><dd>${escapeHtml(sc.reason || "—")}</dd></div>
    <div><dt>Filial</dt><dd>${escapeHtml(record.branch || "—")}</dd></div>
    <div><dt>Empresa</dt><dd>${escapeHtml(sc.company || "—")}</dd></div>
    <div><dt>Centro de custo aprovador</dt><dd>${escapeHtml(sc.costCenter || "—")}</dd></div>
    <div><dt>Local de estoque</dt><dd>${escapeHtml(sc.stockLocation || "—")}</dd></div>
    <div><dt>Unidade</dt><dd>${escapeHtml((item.units || []).join(", ") || "—")}</dd></div>
    <div><dt>Descrição detalhada</dt><dd>${escapeHtml(item.detailedName || item.name)}</dd></div>
    <div><dt>Observação</dt><dd>${escapeHtml(sc.observation || "—")}</dd></div>
    <div><dt>Fornecedores relacionados</dt><dd>${escapeHtml((item.suppliers || []).join(", ") || "—")}</dd></div>
    <div><dt>OF</dt><dd>Não gerada</dd></div>`;
  if (typeof ui.pendingScModal.showModal === "function") ui.pendingScModal.showModal();
  else ui.pendingScModal.setAttribute("open", "");
  ui.pendingScModalClose.focus();
}

function closePendingScModal() {
  if (typeof ui.pendingScModal.close === "function" && ui.pendingScModal.open) ui.pendingScModal.close();
  else ui.pendingScModal.removeAttribute("open");
}

function getVisiblePurchaseNeeds() {
  const branch = ui.branchFilter.value;
  const location = ui.locationFilter.value;
  const stockStatus = ui.stockStatusFilter.value;
  const filteredCodes = new Set(state.filteredItems.map((item) => item.code));
  return state.purchaseNeeds.filter(({ item, position }) => {
    if (!filteredCodes.has(item.code)) return false;
    if (branch && position.branchCode !== branch) return false;
    if (location && position.locationKey !== location) return false;
    if (stockStatus && stockStatus !== "adjust-location" && !positionMatchesStatus(position, stockStatus)) return false;
    return true;
  });
}

function exportPurchaseNeeds() {
  const rows = getVisiblePurchaseNeeds().map(({ item, position, target, suggested, openOfBalance, netSuggested, referencePrice, estimatedValue, rupture }) => [
    item.code, item.name, item.detailedName, (item.categories || []).join(" | "), (item.units || []).join(" | "),
    position.branchCode, position.branchName, position.localType, position.localCode, position.localName,
    position.shelf, position.division, position.quantity, position.minimum, position.maximum, target, suggested, openOfBalance, netSuggested,
    referencePrice, estimatedValue, rupture ? "Ruptura" : "Abaixo do mínimo com saldo",
    position.forecast, position.unitCost, position.stockValue, (item.suppliers || []).join(" | "),
    position.maximum > 0 ? "Reposição até o máximo" : "Reposição até o mínimo",
  ]);
  exportExcelReport({
    title: "Necessidade de Compra",
    filename: "necessidade-de-compra.xls",
    headers: ["Código", "Descrição", "Descrição detalhada", "Categorias", "Unidades", "Código filial", "Filial", "Tipo local", "Código local", "Local de estoque", "Prateleira", "Divisão", "Saldo atual", "Mínimo", "Máximo", "Meta", "Necessidade bruta", "Saldo coberto por OF aberta", "Compra líquida", "Preço de referência", "Valor estimado da compra", "Prioridade", "Previsão de consumo", "Custo unitário", "Valor em estoque", "Fornecedores", "Critério"],
    rows,
    numericColumns: new Set([12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24]),
    currencyColumns: new Set([19, 20, 23, 24]),
  });
}

function exportPendingSc() {
  const rows = state.pendingScRows.map(({ item, record, sc }) => [
    sc.code, sc.status, sc.cancelled, sc.date, sc.deliveryDate, ageDays(sc.date), isOverdue(sc.deliveryDate) ? "Sim" : "Não", sc.quantity, sc.estimatedValue,
    sc.category, sc.reason, item.code, item.name, item.detailedName, (item.categories || []).join(" | "),
    (item.units || []).join(" | "), record.branch, (item.suppliers || []).join(" | "), "", "Não gerada",
  ]);
  exportExcelReport({
    title: "SC Pendente de OF",
    filename: "sc-pendente-de-of.xls",
    headers: ["SC", "Situação SC", "Cancelada", "Data de criação", "Data de entrega", "Dias aguardando", "Entrega vencida", "Quantidade", "Valor estimado", "Categoria SC", "Motivo", "Código do item", "Descrição", "Descrição detalhada", "Categorias do item", "Unidades", "Filial", "Fornecedores relacionados", "Código OF", "Situação OF"],
    rows,
    numericColumns: new Set([5, 7, 8]),
    currencyColumns: new Set([8]),
    dateColumns: new Set([3, 4]),
  });
}

function exportProcurement() {
  const rows = state.procurementRows.map(({ item, record }) => {
    const { sc, of, rec } = record;
    return [
      item.code, item.name, item.detailedName, record.branchCode, record.branch,
      sc?.code, sc?.status, sc?.date, sc?.deliveryDate, sc?.quantity, sc?.estimatedValue, sc?.category, sc?.reason, sc?.cancelled, sc?.company, sc?.costCenter, sc?.stockLocation,
      of?.code, of?.status, of?.date, of?.deliveryDate, of?.supplierCode, of?.supplier, of?.requestedQuantity, of?.deliveredQuantity, of?.balance, of?.unitValue, of?.currency, of?.paymentTerms, of?.paymentMethod, of?.freight, of?.icms, of?.ipi, of?.closed, of?.blocked, of?.type, of?.carrier,
      rec?.invoice, rec?.series, rec?.issueDate, rec?.entryDate, rec?.supplierCode, rec?.supplier, rec?.quantity, rec?.unitValue, rec?.documentValue, rec?.currency, rec?.paymentTerms, rec?.paymentMethod, rec?.freight, rec?.icms, rec?.ipi,
    ];
  });
  exportExcelReport({
    title: "Consulta SC OF e Recebimentos",
    filename: "consulta-sc-of-recebimentos.xls",
    headers: [
      "Código do item", "Descrição", "Descrição detalhada", "Código filial", "Filial",
      "SC - Código", "SC - Situação", "SC - Data de criação", "SC - Data de entrega", "SC - Quantidade", "SC - Valor estimado", "SC - Categoria", "SC - Motivo", "SC - Cancelada", "SC - Empresa", "SC - Centro de custo", "SC - Local de estoque",
      "OF - Código", "OF - Situação", "OF - Data", "OF - Data de entrega", "OF - Código fornecedor", "OF - Fornecedor", "OF - Quantidade solicitada", "OF - Quantidade entregue", "OF - Saldo", "OF - Valor unitário", "OF - Moeda", "OF - Condição de pagamento", "OF - Forma de pagamento", "OF - Frete", "OF - ICMS", "OF - IPI", "OF - Fechada", "OF - Bloqueada", "OF - Tipo", "OF - Transportador",
      "REC - Nota fiscal", "REC - Série", "REC - Data de emissão", "REC - Data de entrada", "REC - Código fornecedor", "REC - Fornecedor", "REC - Quantidade", "REC - Valor unitário", "REC - Valor do documento", "REC - Moeda", "REC - Condição de pagamento", "REC - Forma de pagamento", "REC - Frete", "REC - ICMS", "REC - IPI",
    ],
    rows,
    numericColumns: new Set([9, 10, 23, 24, 25, 26, 30, 31, 32, 43, 44, 45, 49, 50, 51]),
    currencyColumns: new Set([10, 26, 44, 45]),
    dateColumns: new Set([7, 8, 19, 20, 39, 40]),
  });
}

function exportExcelReport({ title, filename, headers, rows, numericColumns = new Set(), currencyColumns = new Set(), dateColumns = new Set() }) {
  const styles = getComputedStyle(document.documentElement);
  const headerColor = cssColorToHex(styles.getPropertyValue("--navy-800"), "123A63");
  const accentColor = cssColorToHex(styles.getPropertyValue("--blue-500"), "2086D2");
  const filterText = ui.filterSummary.textContent || "Todos os registros";
  const cell = (value, index, header = false) => {
    if (header) return `<Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
    const date = dateColumns.has(index) ? excelDateValue(value) : "";
    if (date) return `<Cell ss:StyleID="Date"><Data ss:Type="DateTime">${date}</Data></Cell>`;
    const numeric = numericColumns.has(index) && value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
    const style = currencyColumns.has(index) ? "Currency" : numeric ? "Number" : "Text";
    return `<Cell ss:StyleID="${style}"><Data ss:Type="${numeric ? "Number" : "String"}">${escapeXml(numeric ? Number(value) : value ?? "")}</Data></Cell>`;
  };
  const columns = headers.map((header) => `<Column ss:AutoFitWidth="0" ss:Width="${/descri|fornecedor|motivo|local/i.test(header) ? 190 : /data|situação|categoria|filial|critério/i.test(header) ? 120 : 88}"/>`).join("");
  const dataRows = rows.map((row) => `<Row>${headers.map((_, index) => cell(row[index], index)).join("")}</Row>`).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>
  <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
    <Styles>
      <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="Aptos" ss:Size="10"/></Style>
      <Style ss:ID="Title"><Alignment ss:Vertical="Center"/><Font ss:FontName="Aptos Display" ss:Size="18" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#${headerColor}" ss:Pattern="Solid"/></Style>
      <Style ss:ID="Subtitle"><Font ss:FontName="Aptos" ss:Size="10" ss:Color="#445566"/><Interior ss:Color="#EAF1F6" ss:Pattern="Solid"/></Style>
      <Style ss:ID="Header"><Alignment ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Aptos" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#${accentColor}" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FFFFFF"/></Borders></Style>
      <Style ss:ID="Text"><Alignment ss:Vertical="Top" ss:WrapText="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D5E0E8"/></Borders></Style>
      <Style ss:ID="Number"><Alignment ss:Horizontal="Right" ss:Vertical="Top"/><NumberFormat ss:Format="#,##0.00"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D5E0E8"/></Borders></Style>
      <Style ss:ID="Currency"><Alignment ss:Horizontal="Right" ss:Vertical="Top"/><NumberFormat ss:Format="&quot;R$&quot; #,##0.00"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D5E0E8"/></Borders></Style>
      <Style ss:ID="Date"><Alignment ss:Horizontal="Center" ss:Vertical="Top"/><NumberFormat ss:Format="dd/mm/yyyy"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D5E0E8"/></Borders></Style>
    </Styles>
    <Worksheet ss:Name="${escapeXml(title.slice(0, 31))}"><Table>${columns}
      <Row ss:Height="34"><Cell ss:StyleID="Title" ss:MergeAcross="${headers.length - 1}"><Data ss:Type="String">${escapeXml(title)} · Gestão de Almoxarifado</Data></Cell></Row>
      <Row ss:Height="24"><Cell ss:StyleID="Subtitle" ss:MergeAcross="${headers.length - 1}"><Data ss:Type="String">${escapeXml(filterText)} · ${rows.length} registros · Exportado em ${escapeXml(new Date().toLocaleString("pt-BR"))}</Data></Cell></Row>
      <Row ss:Height="8"></Row><Row ss:Height="30">${headers.map((header, index) => cell(header, index, true)).join("")}</Row>${dataRows}
    </Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>4</SplitHorizontal><TopRowBottomPane>4</TopRowBottomPane><ProtectObjects>False</ProtectObjects><ProtectScenarios>False</ProtectScenarios></WorksheetOptions></Worksheet>
  </Workbook>`;
  const blob = new Blob(["\ufeff", xml], { type: "application/vnd.ms-excel;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function cssColorToHex(color, fallback) {
  const match = String(color).match(/\d+/g);
  if (!match || match.length < 3) return fallback;
  return match.slice(0, 3).map((value) => Number(value).toString(16).padStart(2, "0")).join("").toUpperCase();
}

function escapeXml(value) {
  return String(value ?? "").replace(/[<>&"']/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[character]);
}

function buildProcurementRows() {
  const branch = effectiveBranchFilter();
  const supplier = ui.supplierFilter.value;
  const query = normalizeSearch(ui.searchInput.value);
  const rows = [];
  for (const item of state.items.filter(itemMatchesTransactionFilters)) {
    for (const record of item.history || []) {
      if (!record.sc?.code && !record.of?.code) continue;
      if (branch && record.branchCode !== branch) continue;
      if (supplier && ![record.of?.supplier, record.rec?.supplier].some((value) => normalizeSearch(value) === normalizeSearch(supplier))) continue;
      if (query && !recordMatchesQuery(item, record, query)) continue;
      rows.push({ item, record });
    }
  }
  rows.sort((a, b) => (b.record.sortKey || 0) - (a.record.sortKey || 0));
  state.procurementRows = rows;
  state.procurementByKey.clear();
  rows.forEach((row, index) => { row.key = `process-${index}`; state.procurementByKey.set(row.key, row); });
  state.procurementVisible = 0;
  ui.procurementGrid.replaceChildren();
  ui.procurementCount.textContent = pluralize(rows.length, "processo", "processos");
  const awaiting = new Set();
  const open = new Set();
  const partial = new Set();
  const received = new Set();
  for (const { record } of rows) {
    if (record.sc?.code && !record.of?.code) awaiting.add(record.sc.code);
    if (record.of?.code && record.of.balance > 0) open.add(record.of.code);
    if (record.of?.code && record.of.requestedQuantity > 0 && record.of.deliveredQuantity > 0 && record.of.deliveredQuantity < record.of.requestedQuantity) partial.add(record.of.code);
    if (record.rec?.invoice) received.add(`${record.rec.invoice}::${record.rec.series || ""}`);
  }
  ui.procurementAwaiting.textContent = integerFormatter.format(awaiting.size);
  ui.procurementOpen.textContent = integerFormatter.format(open.size);
  ui.procurementPartial.textContent = integerFormatter.format(partial.size);
  ui.procurementReceived.textContent = integerFormatter.format(received.size);
  renderNextProcurementBatch();
}

function recordMatchesQuery(item, record, query) {
  return normalizeSearch([
    item.code, item.name, item.detailedName,
    record.sc?.code, record.sc?.status,
    record.of?.code, record.of?.status, record.of?.supplier, record.of?.supplierCode,
    record.rec?.invoice, record.rec?.series, record.rec?.supplier, record.rec?.supplierCode,
  ].join(" ")).includes(query);
}

function effectiveBranchFilter() {
  return ui.branchFilter.value || String(ui.locationFilter.value || "").split("::")[0] || "";
}

function itemMatchesTransactionFilters(item) {
  const query = normalizeSearch(ui.searchInput.value);
  if (query && !item.searchText.includes(query)) return false;
  if (ui.categoryFilter.value && !(item.categories || []).includes(ui.categoryFilter.value)) return false;
  if (ui.unitFilter.value && !(item.units || []).includes(ui.unitFilter.value)) return false;
  if (ui.supplierFilter.value && !(item.suppliers || []).includes(ui.supplierFilter.value)) return false;
  const status = ui.stockStatusFilter.value;
  const positiveOnly = ui.positiveBalanceFilter.checked;
  const location = ui.locationFilter.value;
  if (status || positiveOnly || location) {
    const positions = (item.positions || []).filter((position) => {
      if (ui.branchFilter.value && position.branchCode !== ui.branchFilter.value) return false;
      if (location && position.locationKey !== location) return false;
      return true;
    });
    if (!positions.length) return false;
    if (status === "adjust-location" && !itemNeedsLocationAdjustment(item, ui.branchFilter.value, location)) return false;
    if (status && status !== "adjust-location" && !positions.some((position) => positionMatchesStatus(position, status))) return false;
    if (positiveOnly && positions.reduce((sum, position) => sum + position.quantity, 0) <= 0) return false;
  }
  return true;
}

function renderNextProcurementBatch() {
  const start = state.procurementVisible;
  const end = Math.min(start + CONFIG.procurementBatch, state.procurementRows.length);
  if (start >= end) return;
  const fragment = document.createDocumentFragment();
  for (const { item, record, key } of state.procurementRows.slice(start, end)) {
    const sc = record.sc;
    const of = record.of;
    const rec = record.rec;
    const card = document.createElement("button");
    card.type = "button";
    card.className = "report-card report-card--process";
    card.dataset.procurementKey = key;
    const process = processStatus(record);
    card.innerHTML = `<span class="report-card__top"><span class="status-pill ${process.type}">${escapeHtml(process.label)}</span><span>${escapeHtml(record.branch || "—")}</span></span>
      <strong class="report-card__title">${escapeHtml(item.name)}</strong><span class="report-card__code">Código ${escapeHtml(item.code)}</span>
      <span class="process-mini"><span class="${sc ? "is-complete" : ""}">SC<strong>${escapeHtml(sc?.code || "—")}</strong></span><i></i><span class="${of ? "is-complete" : ""}">OF<strong>${escapeHtml(of?.code || "—")}</strong></span><i></i><span class="${rec ? "is-complete" : ""}">REC<strong>${escapeHtml(rec?.invoice || "—")}</strong></span></span>
      <span class="report-card__footer"><span>${escapeHtml((of?.supplier || rec?.supplier) || "Fornecedor não informado")}</span><strong>${escapeHtml(process.detail)}</strong></span>`;
    fragment.append(card);
  }
  ui.procurementGrid.append(fragment);
  state.procurementVisible = end;
  ui.procurementVisibleCount.textContent = `${integerFormatter.format(end)} de ${integerFormatter.format(state.procurementRows.length)} processos`;
  ui.procurementLoadMore.classList.toggle("is-hidden", end >= state.procurementRows.length);
}

function processStatus(record) {
  const { sc, of, rec } = record;
  if (!of?.code) return { label: `SC ${sc?.code || "—"} · aguardando OF`, detail: ageLabel(sc?.date), type: isOverdue(sc?.deliveryDate) ? "status-pill--critical" : "status-pill--pending" };
  if (of.balance > 0) return { label: `OF ${of.code} · saldo pendente`, detail: `${numberFormatter.format(of.balance)} pendente`, type: isOverdue(of.deliveryDate) ? "status-pill--critical" : "status-pill--need" };
  if (rec?.invoice) return { label: `OF ${of.code} · recebida`, detail: formatDate(rec.entryDate || rec.issueDate), type: "status-pill--success" };
  return { label: `OF ${of.code}`, detail: formatDate(of.date), type: "status-pill--process" };
}

function openProcurementModal(key) {
  const row = state.procurementByKey.get(key);
  if (!row) return;
  const { item, record } = row;
  const { sc, of, rec } = record;
  state.activeProcurement = row;
  state.lastFocusedElement = document.activeElement;
  ui.procurementModalCode.textContent = `Item ${item.code}`;
  ui.procurementModalTitle.textContent = item.name;
  ui.procurementModalSubtitle.textContent = record.branch || "Filial não informada";
  ui.procurementModalStages.innerHTML = `
    <article class="${sc ? "is-complete" : ""}"><span><b>SC</b> · Solicitação de Compra</span><strong>${escapeHtml(sc?.code || "Não gerada")}</strong><small>${escapeHtml(sc?.status || "Situação não informada")} · ${escapeHtml(formatDate(sc?.date))}</small></article>
    <article class="${of ? "is-complete" : ""}"><span><b>OF</b> · Ordem de Fornecimento</span><strong>${escapeHtml(of?.code || "Não gerada")}</strong><small>${escapeHtml(of?.status || "Situação não informada")} · ${escapeHtml(formatDate(of?.date))}</small></article>
    <article class="${rec ? "is-complete" : ""}"><span><b>REC</b> · Recebimento</span><strong>${escapeHtml(rec?.invoice ? `NF ${rec.invoice}` : "Não recebido")}</strong><small>${escapeHtml(formatDate(rec?.entryDate || rec?.issueDate))}</small></article>`;
  ui.procurementModalDetails.innerHTML = [
    renderProcessGroup("SC", "Solicitação de Compra", sc, [
      ["Código", sc?.code], ["Situação", sc?.status], ["Data de criação", formatDate(sc?.date)], ["Data de entrega", formatDate(sc?.deliveryDate)],
      ["Tempo desde a criação", sc ? ageLabel(sc.date) : "Não informado"], ["Entrega vencida", sc ? (isOverdue(sc.deliveryDate) ? "Sim" : "Não") : "Não informado"],
      ["Empresa", sc?.company], ["Filial", [sc?.branchCode, sc?.branchName].filter(Boolean).join(" · ")], ["Centro de custo aprovador", sc?.costCenter], ["Sequência", sc?.sequence],
      ["Código do produto", sc?.productCode], ["Produto", sc?.productName], ["Descrição do material", sc?.materialDescription], ["Unidade", sc?.unit],
      ["Quantidade", formatProcessNumber(sc?.quantity)], ["Valor estimado", formatProcessCurrency(sc?.estimatedValue)], ["Categoria", sc?.category], ["Motivo", sc?.reason],
      ["Regularização", sc?.regularization], ["Observação", sc?.observation], ["Empresa destino", sc?.destinationCompany], ["Filial destino", sc?.destinationBranch],
      ["PI", sc?.investmentPlan], ["Cancelada", formatFlag(sc?.cancelled)], ["Local de estoque", sc?.stockLocation], ["CCU da etiqueta", sc?.allocationCostCenter],
      ["Conta", sc?.account], ["Percentual de rateio", sc?.allocationPercent], ["Imobilizado", formatFlag(sc?.asset)],
    ]),
    renderProcessGroup("OF", "Ordem de Fornecimento", of, [
      ["Código", of?.code], ["Situação", of?.status], ["Data de emissão", formatDate(of?.date)], ["Data de entrega", formatDate(of?.deliveryDate)],
      ["Tempo entre SC e OF", durationLabel(sc?.date, of?.date)], ["Entrega vencida", of ? (isOverdue(of.deliveryDate) && of.balance > 0 ? "Sim" : "Não") : "Não informado"],
      ["Empresa de entrega", of?.deliveryCompany], ["Filial de entrega", [of?.deliveryBranchCode, of?.deliveryBranchName].filter(Boolean).join(" · ")], ["UF", of?.state],
      ["Empresa de pagamento", of?.paymentCompany], ["Filial de pagamento", [of?.paymentBranchCode, of?.paymentBranchName].filter(Boolean).join(" · ")],
      ["Código do fornecedor", of?.supplierCode], ["Fornecedor", of?.supplier], ["Código do produto", of?.productCode], ["Produto", of?.productName], ["Unidade", of?.unit],
      ["Quantidade solicitada", formatProcessNumber(of?.requestedQuantity)], ["Saldo", formatProcessNumber(of?.balance)], ["Quantidade entregue", formatProcessNumber(of?.deliveredQuantity)],
      ["Valor unitário", formatProcessCurrency(of?.unitValue)], ["Fechada", formatFlag(of?.closed)], ["Bloqueada", formatFlag(of?.blocked)], ["Alíquota ICMS", of?.icms], ["Alíquota IPI", of?.ipi],
      ["Frete", of?.freight], ["Moeda", of?.currency], ["Condição de pagamento", of?.paymentTerms], ["Forma de pagamento", of?.paymentMethod], ["Tipo", of?.type],
      ["Observação", of?.observation], ["Motivo do fechamento", of?.closingReason], ["Transportador", of?.carrier],
    ]),
    renderProcessGroup("REC", "Recebimento", rec, [
      ["Número da nota fiscal", rec?.invoice], ["Série", rec?.series], ["Data de emissão", formatDate(rec?.issueDate)], ["Data de entrada", formatDate(rec?.entryDate)],
      ["Tempo entre OF e recebimento", durationLabel(of?.date, rec?.entryDate)],
      ["Empresa", rec?.company], ["Filial", [rec?.branchCode, rec?.branchName].filter(Boolean).join(" · ")], ["UF", rec?.state],
      ["Empresa de pagamento", rec?.paymentCompany], ["Filial de pagamento", [rec?.paymentBranchCode, rec?.paymentBranchName].filter(Boolean).join(" · ")],
      ["Código do fornecedor", rec?.supplierCode], ["Fornecedor", rec?.supplier], ["Código do produto", rec?.productCode], ["Produto", rec?.productName], ["Unidade", rec?.unit],
      ["Quantidade", formatProcessNumber(rec?.quantity)], ["Valor unitário fiscal", formatProcessCurrency(rec?.unitValue)], ["Valor do documento", formatProcessCurrency(rec?.documentValue)],
      ["Alíquota ICMS", rec?.icms], ["Alíquota IPI", rec?.ipi], ["Frete", rec?.freight], ["Moeda", rec?.currency], ["Condição de pagamento", rec?.paymentTerms], ["Forma de pagamento", rec?.paymentMethod],
    ]),
  ].join("");
  if (typeof ui.procurementModal.showModal === "function") ui.procurementModal.showModal(); else ui.procurementModal.setAttribute("open", "");
  ui.procurementModalClose.focus();
}

function closeProcurementModal() {
  if (typeof ui.procurementModal.close === "function" && ui.procurementModal.open) ui.procurementModal.close();
  else ui.procurementModal.removeAttribute("open");
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
  const rows = (consumption.rows || []).map((row) => `<tr>${headers.map((header, index) => `<td class="cell-wrap">${escapeHtml(isDateColumn(header) ? formatDate(row[index], "") : row[index] || "")}</td>`).join("")}</tr>`).join("");
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
  if (item.flags.locationAdjustment) badges.push(["Ajustar local de estoque", "warning"]);
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
  if (!ui.itemModal.open) state.lastFocusedElement = document.activeElement;
  const currentIndex = state.filteredItems.findIndex((entry) => entry.code === item.code);
  ui.modalPrevious.disabled = currentIndex <= 0;
  ui.modalNext.disabled = currentIndex < 0 || currentIndex >= state.filteredItems.length - 1;

  ui.modalCode.textContent = `Código ${item.code}`;
  ui.modalTitle.textContent = item.name;
  ui.modalSubtitle.textContent = [primaryCategory(item), (item.units || []).join(", ")].filter(Boolean).join(" · ");
  ui.modalBadges.innerHTML = statusBadges(item).map(badgeHtml).join("");
  ui.modalBalance.textContent = numberFormatter.format(item.balanceTotal);
  ui.modalStockValue.textContent = currencyFormatter.format(item.stockValueTotal);
  ui.modalPositionCount.textContent = integerFormatter.format(item.positions.length);
  ui.modalHistoryCount.textContent = integerFormatter.format(item.history.length);

  const lastPurchase = item.history.find((record) => record.rec?.entryDate || record.of?.date || record.sc?.date);
  const details = [
    ["Descrição detalhada", item.detailedName || item.name],
    ["Categoria / grupo", (item.categories || []).join(" · ") || "Não informado"],
    ["Unidade", (item.units || []).join(", ") || "Não informada"],
    ["Filiais", unique(item.positions.map((position) => position.branchName || position.branchCode)).join(" · ") || "Sem posição"],
    ["Fornecedores", (item.suppliers || []).join(" · ") || "Sem fornecedor no histórico"],
    ["Última movimentação de compra", formatDate(lastPurchase?.rec?.entryDate || lastPurchase?.of?.date || lastPurchase?.sc?.date)],
    ["Último preço conhecido", latestPurchasePrice(item) > 0 ? currencyFormatter.format(latestPurchasePrice(item)) : "Não informado"],
  ];
  ui.modalDetails.innerHTML = details.map(([term, value]) => `<dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd>`).join("");

  renderGallery(item);
  renderStock(item);
  renderHistory(item);
  activateTab("summary");

  if (!ui.itemModal.open) ui.itemModal.showModal();
}

function navigateItemModal(direction) {
  if (!state.activeItem) return;
  const index = state.filteredItems.findIndex((item) => item.code === state.activeItem.code);
  const next = state.filteredItems[index + direction];
  if (next) openItem(next.code);
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
  const savedCount = (state.localPhotos.get(normalizeCode(item.code)) || []).length;
  ui.photoUploadStatus.textContent = savedCount
    ? `${pluralize(savedCount, "foto salva", "fotos salvas")} neste aparelho · máximo 6`
    : "Até 6 fotos salvas neste aparelho";
  ui.photoUploadButton.disabled = images.filter((image) => !image.fallback).length >= CONFIG.maxImages;
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
    const wrap = document.createElement("span");
    wrap.className = "gallery__thumb-wrap";
    const button = document.createElement("button");
    button.type = "button";
    button.className = `gallery__thumb${index === 0 ? " is-active" : ""}`;
    button.setAttribute("aria-label", `Exibir foto ${index + 1}`);
    button.innerHTML = `<img src="${escapeHtml(image.url)}" alt="" loading="lazy">`;
    button.querySelector("img").addEventListener("error", () => button.remove(), { once: true });
    button.addEventListener("click", () => {
      for (const thumb of thumbs.querySelectorAll(".gallery__thumb")) thumb.classList.remove("is-active");
      button.classList.add("is-active");
      placeholder.classList.add("is-hidden");
      mainImage.classList.remove("is-hidden");
      mainImage.src = image.url;
      mainImage.alt = `${item.name} — foto ${index + 1}`;
    });
    wrap.append(button);
    if (image.localId) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "gallery__remove";
      remove.dataset.localPhotoId = image.localId;
      remove.setAttribute("aria-label", `Excluir ${image.name}`);
      remove.textContent = "×";
      wrap.append(remove);
    }
    thumbs.append(wrap);
  });
}

async function handlePhotoUpload() {
  const item = state.activeItem;
  const files = [...(ui.photoInput.files || [])].filter((file) => file.type.startsWith("image/"));
  ui.photoInput.value = "";
  if (!item || !files.length) return;
  const code = normalizeCode(item.code);
  const remoteCount = (state.imageIndex.get(code) || []).length;
  const local = state.localPhotos.get(code) || [];
  const available = Math.max(0, CONFIG.maxImages - remoteCount - local.length);
  if (!available) { ui.photoUploadStatus.textContent = "Limite de 6 fotos atingido"; return; }
  const selected = files.slice(0, available);
  const usedSequences = new Set([
    ...(state.imageIndex.get(code) || []).map((image) => Number(image.order)),
    ...local.map((photo) => Number(String(photo.id).split("::").pop())),
  ]);
  const freeSequences = Array.from({ length: CONFIG.maxImages }, (_, index) => index + 1).filter((sequence) => !usedSequences.has(sequence));
  try {
    for (let index = 0; index < selected.length; index += 1) {
      const file = selected[index];
      const sequence = freeSequences[index];
      const extension = ({ "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif" })[file.type] || "jpg";
      const name = `${item.code} - ${String(sequence).padStart(2, "0")}.${extension}`;
      await saveLocalPhoto({ id: `${code}::${String(sequence).padStart(2, "0")}`, itemCode: code, name, blob: file, createdAt: Date.now() + index });
    }
    await loadLocalPhotoCache();
    renderGallery(item);
    refreshRenderedCard(item.code);
  } catch (error) {
    ui.photoUploadStatus.textContent = `Não foi possível salvar: ${error.message}`;
  }
}

async function removeLocalPhoto(id) {
  if (!id || !state.activeItem) return;
  if (!window.confirm("Excluir esta foto salva neste aparelho?")) return;
  const db = await openPhotoDatabase();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction("photos", "readwrite");
    transaction.objectStore("photos").delete(id);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  await loadLocalPhotoCache();
  renderGallery(state.activeItem);
  refreshRenderedCard(state.activeItem.code);
}

function refreshRenderedCard(code) {
  const button = ui.cardsGrid.querySelector(`[data-item-code="${CSS.escape(String(code))}"]`);
  const oldCard = button?.closest(".item-card");
  const item = state.itemByCode.get(code);
  if (oldCard && item) oldCard.replaceWith(renderCard(item));
}

function openPhotoDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("gestao-almoxarifado-fotos", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("photos", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveLocalPhoto(photo) {
  const db = await openPhotoDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("photos", "readwrite");
    transaction.objectStore("photos").put(photo);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

async function loadLocalPhotoCache() {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openPhotoDatabase();
    const photos = await new Promise((resolve, reject) => {
      const request = db.transaction("photos", "readonly").objectStore("photos").getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    for (const entries of state.localPhotos.values()) for (const photo of entries) URL.revokeObjectURL(photo.url);
    state.localPhotos.clear();
    for (const photo of photos) {
      if (!state.localPhotos.has(photo.itemCode)) state.localPhotos.set(photo.itemCode, []);
      state.localPhotos.get(photo.itemCode).push({ ...photo, localId: photo.id, url: URL.createObjectURL(photo.blob) });
    }
    for (const entries of state.localPhotos.values()) entries.sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    // O catálogo continua funcional se o navegador bloquear o armazenamento local.
  }
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
      <td>${escapeHtml(formatDate(date))}</td>
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
    return `<span class="stage-cell"><strong>${escapeHtml(stage.code || "—")}</strong><span>${escapeHtml(stage.status || (stage.date ? formatDate(stage.date) : "Emitida"))}</span></span>`;
  }
  return `<span class="stage-cell"><strong>${escapeHtml(stage.invoice ? `NF ${stage.invoice}` : "Recebido")}</strong><span>${escapeHtml(formatDate(stage.entryDate || stage.issueDate, "Data não informada"))}</span></span>`;
}

function imagesForItem(item, includeFallbackSet) {
  const local = state.localPhotos.get(normalizeCode(item.code)) || [];
  const indexed = state.imageIndex.get(normalizeCode(item.code));
  const available = [...(indexed || []), ...local].slice(0, CONFIG.maxImages);
  if (available.length) return available;

  const count = includeFallbackSet ? CONFIG.maxImages : 1;
  return Array.from({ length: count }, (_, index) => {
    const order = String(index + 1).padStart(2, "0");
    const name = `${item.code} - ${order}.jpg`;
    return { order: index + 1, name, url: localImageUrl(name), fallback: true };
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

function formatDate(value, fallback = "—") {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  if (/^\d{5}(?:\.\d+)?$/.test(text)) {
    const serial = Number(text);
    const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
    if (Number.isFinite(date.getTime())) return `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;
  }
  let match = text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${match[1].padStart(2, "0")}/${match[2].padStart(2, "0")}/${year}`;
  }
  match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) return `${match[3].padStart(2, "0")}/${match[2].padStart(2, "0")}/${match[1]}`;
  return text;
}

function dateTimestamp(value) {
  const formatted = formatDate(value, "");
  const match = formatted.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])) : 0;
}

function ageLabel(value) {
  const days = ageDays(value);
  if (days === null) return "Data não informada";
  return `${integerFormatter.format(days)} ${days === 1 ? "dia" : "dias"}`;
}

function ageDays(value) {
  const timestamp = dateTimestamp(value);
  return timestamp ? Math.max(0, Math.floor((Date.now() - timestamp) / 86400000)) : null;
}

function isOverdue(value) {
  const timestamp = dateTimestamp(value);
  return Boolean(timestamp && timestamp < Date.now() - 86400000);
}

function durationLabel(start, end) {
  const startTime = dateTimestamp(start);
  const endTime = dateTimestamp(end);
  if (!startTime || !endTime || endTime < startTime) return "Não informado";
  const days = Math.round((endTime - startTime) / 86400000);
  return `${integerFormatter.format(days)} ${days === 1 ? "dia" : "dias"}`;
}

function excelDateValue(value) {
  const formatted = formatDate(value, "");
  const match = formatted.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}T00:00:00.000` : "";
}

function isDateColumn(header) {
  return /(^|\b)(data|dt)(\b|\.)|emiss[aã]o|entrada|entrega/i.test(String(header || ""));
}

function formatProcessNumber(value) {
  return value == null ? "Não informado" : numberFormatter.format(value);
}

function formatProcessCurrency(value) {
  return value == null ? "Não informado" : currencyFormatter.format(value);
}

function formatFlag(value) {
  const normalized = normalizeSearch(value);
  if (!normalized) return "Não informado";
  if (["s", "sim", "1", "true"].includes(normalized)) return "Sim";
  if (["n", "nao", "0", "false"].includes(normalized)) return "Não";
  return value;
}

function renderProcessGroup(prefix, title, stage, fields) {
  const rows = fields.map(([term, value]) => `<div><dt>${escapeHtml(prefix)} · ${escapeHtml(term)}</dt><dd>${escapeHtml(value === null || value === undefined || value === "" ? "Não informado" : value)}</dd></div>`).join("");
  return `<section class="process-detail-group ${stage ? "is-available" : "is-missing"}"><header><span>${escapeHtml(prefix)}</span><div><strong>${escapeHtml(title)}</strong><small>${stage ? "Dados disponíveis no processo" : "Etapa ainda não gerada"}</small></div></header><dl>${rows}</dl></section>`;
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
        item._hasStockSource = true;
        if (quantity === 0 && limitsSumZero) {
          item._inactivePositionCount += 1;
          return;
        }
        item._hasActivePosition = true;

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
          costCenter: clean(get("SC - Centro Custo Aprovador")),
          company: clean(get("SC - Empresa")),
          branchCode: clean(get("SC - Filial")),
          branchName: clean(get("SC - Descr. Filial")),
          sequence: clean(get("SC - Seq.")),
          productCode: scProduct,
          productName: clean(get("SC - Nome Produto")),
          materialDescription: detailedName,
          unit: clean(get("SC - Unid. Medida")),
          regularization: clean(get("SC - Regularização")),
          observation: clean(get("SC - OBS")),
          destinationCompany: clean(get("SC - Empresa Destino")),
          destinationBranch: clean(get("SC - Filial Destino")),
          investmentPlan: clean(get("SC - PI")),
          stockLocation: clean(get("SC - Local Estoque")),
          allocationCostCenter: clean(get("SC - CCU Etq")),
          account: clean(get("SC - Conta")),
          allocationPercent: clean(get("SC - % Rateio")),
          asset: clean(get("SC - Imobilizado")),
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
          deliveryCompany: clean(get("OF - Empresa Entrega")),
          deliveryBranchCode: clean(get("OF - Filial Entrega")),
          deliveryBranchName: clean(get("OF - Descr. Filial Entrega")),
          state: clean(get("OF - UF")),
          paymentCompany: clean(get("OF - Empresa Pagto")),
          paymentBranchCode: clean(get("OF - Filial Pagto")),
          paymentBranchName: clean(get("OF - Nome Filial Pagto")),
          supplierCode: [clean(get("OF - Cód. Base")), clean(get("OF - Dígito Base"))].filter(Boolean).join("-"),
          productCode: ofProduct,
          productName: clean(get("OF - Nome Produto")),
          unit: clean(get("OF - Unidade Medida")),
          balance: parseNumber(get("OF - Saldo")),
          icms: clean(get("OF - Alíquota ICMS")),
          ipi: clean(get("OF - Alíquota IPI")),
          freight: clean(get("OF - Frete")),
          paymentTerms: clean(get("OF - Condição Pagto")),
          paymentMethod: clean(get("OF - Forma Pagto")),
          type: clean(get("OF - Tipo")),
          observation: clean(get("OF - OBS")),
          closingReason: clean(get("OF - Motivo Fechamento")),
          carrier: clean(get("OF - Transportador")),
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
          company: clean(get("REC - Empresa")),
          branchCode: clean(get("REC - Filial")),
          branchName: clean(get("REC - Nome Filial")),
          state: clean(get("REC - UF Filial")),
          paymentCompany: clean(get("REC - Empresa Pagto")),
          paymentBranchCode: clean(get("REC - Filial Pagto")),
          paymentBranchName: clean(get("REC - Nome Filial Pagto")),
          supplierCode: [clean(get("REC - Cód. Base")), clean(get("REC - Dígito"))].filter(Boolean).join("-"),
          productCode: recProduct,
          productName: clean(get("REC - Nome Produto")),
          unit: clean(get("REC - Unid. Medida")),
          icms: clean(get("REC - Alíquota ICMS")),
          ipi: clean(get("REC - Alíquota IPI")),
          freight: clean(get("REC - Frete")),
          paymentTerms: clean(get("REC - Condição Pagto")),
          paymentMethod: clean(get("REC - Forma Pagto")),
        } : null;

        const branch = first(
          clean(get("REC - Nome Filial")),
          clean(get("OF - Descr. Filial Entrega")),
          clean(get("SC - Descr. Filial")),
        );
        const branchCode = first(
          clean(get("REC - Filial")),
          clean(get("OF - Filial Entrega")),
          clean(get("SC - Filial")),
        );
        const record = {
          sc,
          of,
          rec,
          branch,
          branchCode,
          sortKey: dateKey(first(rec?.entryDate, rec?.issueDate, of?.date, sc?.date)),
        };

        const pending = Boolean(
          scCode
          && ["compra confirmada", "comprador negociando"].includes(normalizeText(scStatus))
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
        item.flags.inactiveOnly = item._hasStockSource && !item._hasActivePosition;
        item.hiddenInactivePositionCount = item._inactivePositionCount;
        item.flags.purchaseOnly = item.positions.length === 0 && !item._hasStockSource;
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
        delete item._hasStockSource;
        delete item._hasActivePosition;
        delete item._inactivePositionCount;
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
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      if (typeof DecompressionStream === "undefined") throw new Error(`${label}: este navegador não oferece suporte à leitura segura do arquivo compactado.`);
      const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"));
      return decoder.decode(await new Response(stream).arrayBuffer());
    }
    return decoder.decode(buffer);
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
        _hasStockSource: false,
        _hasActivePosition: false,
        _inactivePositionCount: 0,
      });
    }
    return items.get(code);
  }

  function dateKey(value) {
    const text = clean(value);
    if (!text) return 0;

    if (/^\d{5}(?:\.\d+)?$/.test(text)) return Date.UTC(1899, 11, 30) + Number(text) * 86400000;

    const br = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (br) return Date.UTC(Number(br[3]), Number(br[2]) - 1, Number(br[1]), Number(br[4] || 0), Number(br[5] || 0));

    const iso = Date.parse(text);
    return Number.isFinite(iso) ? iso : 0;
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { inventoryWorker, formatDate };
}
