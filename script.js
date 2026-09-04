"use strict";

const CONFIG = Object.freeze({
  saldoFile: "00 - Saldo_Online.csv",
  comprasFallbackFile: "01 - Compras_Almox.csv",
  comprasApi: "https://api.github.com/repos/tiagosilvagba/Almoxarifado/contents?ref=main",
  commitsApi: "https://api.github.com/repos/tiagosilvagba/Almoxarifado/commits?per_page=20",
  replenishmentFile: "02 - Responsaveis_Reposição.CSV",
  consumoFile: "03 - Consumo.csv",
  imageApi: "https://api.github.com/repos/tiagosilvagba/Almoxarifado/contents/imagens?ref=main",
  imageFolder: "imagens",
  maxImages: 6,
  historyBatch: 20,
  procurementBatch: 60,
  reportBatch: 60,
});

const APP_VERSION = "Mark XXIX";
const CAVACO_OF_THRESHOLD = 200;
const MINIMUM_SAFETY_FACTOR = 1.2;
const OF_GENERATION_BUCKETS = Object.freeze([
  { id: "up-to-7", label: "Até 7 dias", min: 0, max: 7 },
  { id: "8-to-15", label: "De 8 a 15 dias", min: 8, max: 15 },
  { id: "16-to-20", label: "De 16 a 20 dias", min: 16, max: 20 },
  { id: "21-to-25", label: "De 21 a 25 dias", min: 21, max: 25 },
  { id: "26-to-30", label: "De 26 a 30 dias", min: 26, max: 30 },
  { id: "above-30", label: "Superior a 30 dias", min: 31, max: Infinity },
]);

const THEME_IDS = new Set([
  "theme-t", "aurora", "polar", "rubi", "industrial", "graphite", "operations",
  "logistics", "corporate", "ocean", "neutral", "contrast",
]);

const LANGUAGE_IDS = new Set(["pt-BR", "en"]);
let activeLanguage = "pt-BR";
let languageObserver = null;

if (typeof document !== "undefined") {
  try {
    const savedTheme = localStorage.getItem("almoxarifado-theme");
    document.documentElement.dataset.theme = THEME_IDS.has(savedTheme) ? savedTheme : "neutral";
  } catch {
    document.documentElement.dataset.theme = "neutral";
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
  visiblePurchaseNeeds: [],
  purchaseNeedVisible: 0,
  purchaseNeedByKey: new Map(),
  activePurchaseNeed: null,
  pendingScRows: [],
  pendingScVisible: 0,
  pendingScByKey: new Map(),
  activePendingSc: null,
  procurementRows: [],
  procurementByKey: new Map(),
  procurementVisible: 0,
  activeProcurement: null,
  ofGenerationRows: [],
  visibleOfGenerationRows: [],
  ofGenerationVisible: 0,
  ofGenerationByKey: new Map(),
  activeOfGeneration: null,
  ofGenerationBucket: "all",
  ofGenerationChartBucket: "all",
  ofGenerationChartGranularity: "month",
  ofGenerationPeriod: { year: "", month: "", week: "", date: "" },
  localPhotos: new Map(),
  consumption: { available: false, headers: [], rows: [], rowCount: 0 },
  minMaxReviews: [],
  visibleMinMaxReviews: [],
  minMaxReviewVisible: 0,
  minMaxReviewByKey: new Map(),
  activeMinMaxReview: null,
  filterRevision: 0,
  pageRenderRevision: new Map(),
  pageRenderToken: 0,
  filterDraftSnapshot: null,
  draftFilterRefreshTimer: null,
  filterOptionSignatures: new WeakMap(),
  loadingProgressValue: 0,
  loadingProgressCeiling: 0,
  loadingProgressTimer: null,
};

const ui = {};

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", init);
}

async function init() {
  cacheUi();
  initializeLanguage();
  initializeTheme();
  initializeDensity();
  bindEvents();
  navigateToPage(pageFromHash(), false);
  await loadLocalPhotoCache();
  await loadCatalog();
}

function cacheUi() {
  const ids = [
    "statusLine", "baseUpdateBadge", "versionBadge", "refreshButton", "themeSelect", "languageToggle", "densityToggle", "loadingPanel", "loadingTitle", "loadingMessage", "loadingProgress", "loadingProgressText",
    "retryButton", "catalogContent", "metricsContext", "metricItems", "metricQuantity", "metricZero", "metricReconciliation",
    "metricValue", "metricPurchaseValue", "metricExcessValue", "metricActionProcesses", "metricBelowMin", "metricAboveMax",
    "metricUnconfigured", "metricPendingSc", "metricNegative", "metricOpenOf", "branchChart", "stockChart", "valueChart",
    "dashboardPriorityList", "dashboardExcessList", "procurementFunnel", "searchInput",
    "branchFilter", "locationFilter", "replenishmentResponsibleFilter", "categoryFilter", "unitFilter", "supplierFilter", "requesterFilter", "ccuClassificationFilter", "itemCodeFilter", "scStatusFilter",
    "stockStatusFilter", "positiveBalanceFilter", "clearFilters", "applyFiltersButton",
    "filterToggleButton", "closeFiltersButton", "globalFiltersPanel", "activeFilterCount",
    "filterSummary", "catalogSort", "catalogView", "resultCount", "cardsGrid", "emptyState",
    "loadMoreButton", "visibleCount", "itemModal", "modalCode", "modalTitle",
    "modalSubtitle", "modalClose", "modalPrevious", "modalNext", "modalBadges", "modalGallery", "modalBranchBalances",
    "modalStockValue", "modalPositionCount", "modalHistoryCount", "modalDetails", "modalAddressBlock",
    "stockTableWrap", "historySummary", "historyTableWrap", "historyLoadMore",
    "purchaseNeedItems", "purchaseNeedPositions", "purchaseNeedRuptures", "purchaseNeedEstimated", "purchaseNeedWithoutMax",
    "purchaseNeedResultCount", "purchaseNeedTableWrap", "purchaseNeedLoadMore", "purchaseNeedVisibleCount",
    "pendingScListCount", "pendingScTableWrap", "pendingScLoadMore", "pendingScVisibleCount", "exportPurchaseNeedButton", "purchaseNeedExportFormat", "exportPendingScButton", "pendingScExportFormat", "exportProcurementButton", "procurementExportFormat",
    "purchaseNeedModal", "purchaseModalClose",
    "purchaseModalCode", "purchaseModalTitle", "purchaseModalSubtitle", "purchaseModalSummary",
    "purchaseModalDetails", "purchaseModalOpenItem", "purchaseModalOperational", "pendingScModal", "pendingScModalClose",
    "pendingScModalCode", "pendingScModalTitle", "pendingScModalSubtitle", "pendingScModalSummary",
    "pendingScModalDetails", "pendingScModalOpenItem", "pendingScSubject", "pendingScModalOperational", "procurementCount", "procurementGrid",
    "procurementAwaiting", "procurementOpen", "procurementPartial", "procurementReceived",
    "procurementLoadMore", "procurementVisibleCount", "procurementModal", "procurementModalClose",
    "procurementModalCode", "procurementModalTitle", "procurementModalSubtitle", "procurementModalStages",
    "procurementModalDetails", "procurementModalOpenItem", "procurementModalOperational", "photoInput", "photoUploadButton", "photoUploadStatus",
    "ofGenerationCount", "ofGenerationSummary", "ofGenerationGrid", "ofGenerationLoadMore", "ofGenerationVisibleCount", "clearOfGenerationRange", "exportOfGenerationButton", "ofGenerationExportFormat",
    "ofGenerationYearFilter", "ofGenerationMonthFilter", "ofGenerationWeekFilter", "ofGenerationDateFilter", "clearOfGenerationPeriod", "ofGenerationChartGranularity", "ofGenerationChartBuckets", "ofGenerationTrendChart", "ofGenerationTrendSubtitle",
    "ofGenerationModal", "ofGenerationModalClose", "ofGenerationModalCode", "ofGenerationModalTitle", "ofGenerationModalSubtitle", "ofGenerationModalTimeline", "ofGenerationModalSummary", "ofGenerationModalDetails", "ofGenerationModalOpenItem",
    "consumptionWaiting", "consumptionAvailable", "reviewItemCount", "reviewIdealCount",
    "reviewAdjustCount", "reviewInsufficientCount", "reviewAverageLeadTime", "reviewIncreaseValue", "reviewReductionValue", "reviewNetImpactValue", "reviewNetImpactCard", "reviewResultCount", "reviewCardsGrid", "reviewLoadMore", "reviewVisibleCount", "exportMinMaxReviewButton", "minMaxExportFormat",
    "reviewModal", "reviewModalClose", "reviewModalCode", "reviewModalTitle", "reviewModalSubtitle",
    "reviewModalSummary", "reviewModalRecommendation", "reviewModalDetails", "reviewModalOpenItem", "modalOperationalInsights",
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
  ui.languageToggle.addEventListener("click", () => applyLanguage(activeLanguage === "pt-BR" ? "en" : "pt-BR", true));
  ui.densityToggle.addEventListener("click", toggleDensity);
  for (const select of [
    ui.branchFilter,
    ui.locationFilter,
    ui.replenishmentResponsibleFilter,
    ui.categoryFilter,
    ui.unitFilter,
    ui.supplierFilter,
    ui.requesterFilter,
    ui.ccuClassificationFilter,
    ui.itemCodeFilter,
    ui.stockStatusFilter,
    ui.scStatusFilter,
  ]) {
    select.addEventListener("change", () => scheduleDraftFilterRefresh(select.id));
  }
  ui.positiveBalanceFilter.addEventListener("change", () => scheduleDraftFilterRefresh("positiveBalanceFilter"));
  ui.searchInput.addEventListener("input", debounce(() => scheduleDraftFilterRefresh("searchInput"), 180));
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
    renderHistory(state.activeItem, modalScopedHistory(state.activeItem));
  });

  ui.purchaseNeedTableWrap.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-purchase-need-key]");
    if (trigger) openPurchaseNeedModal(trigger.dataset.purchaseNeedKey);
  });
  ui.pendingScTableWrap.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-pending-sc-key]");
    if (trigger) openPendingScModal(trigger.dataset.pendingScKey);
  });
  ui.purchaseNeedLoadMore.addEventListener("click", renderNextPurchaseNeedBatch);
  ui.pendingScLoadMore.addEventListener("click", renderNextPendingScBatch);
  ui.exportPurchaseNeedButton.addEventListener("click", () => exportPurchaseNeeds(ui.purchaseNeedExportFormat.value));
  ui.exportPendingScButton.addEventListener("click", () => exportPendingSc(ui.pendingScExportFormat.value));
  ui.exportProcurementButton.addEventListener("click", () => exportProcurement(ui.procurementExportFormat.value));
  ui.exportOfGenerationButton.addEventListener("click", () => exportOfGeneration(ui.ofGenerationExportFormat.value));
  ui.exportMinMaxReviewButton.addEventListener("click", () => exportMinMaxReviews(ui.minMaxExportFormat.value));

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
  ui.ofGenerationSummary.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-of-generation-bucket]");
    if (!trigger) return;
    const bucket = trigger.dataset.ofGenerationBucket;
    state.ofGenerationBucket = state.ofGenerationBucket === bucket ? "all" : bucket;
    renderOfGenerationAnalysis();
  });
  ui.clearOfGenerationRange.addEventListener("click", () => {
    state.ofGenerationBucket = "all";
    renderOfGenerationAnalysis();
  });
  ["year", "month", "week", "date"].forEach((periodPart, index, parts) => {
    const control = ui[`ofGeneration${periodPart[0].toUpperCase()}${periodPart.slice(1)}Filter`];
    control.addEventListener("change", () => {
      state.ofGenerationPeriod[periodPart] = control.value;
      parts.slice(index + 1).forEach((dependentPart) => { state.ofGenerationPeriod[dependentPart] = ""; });
      renderOfGenerationAnalysis();
    });
  });
  ui.clearOfGenerationPeriod.addEventListener("click", () => {
    state.ofGenerationPeriod = { year: "", month: "", week: "", date: "" };
    renderOfGenerationAnalysis();
  });
  ui.ofGenerationChartBuckets.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-of-chart-bucket]");
    if (!trigger) return;
    state.ofGenerationChartBucket = trigger.dataset.ofChartBucket;
    renderOfGenerationAnalysis();
  });
  ui.ofGenerationChartGranularity.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-of-chart-granularity]");
    if (!trigger) return;
    state.ofGenerationChartGranularity = trigger.dataset.ofChartGranularity;
    renderOfGenerationAnalysis();
  });
  ui.ofGenerationLoadMore.addEventListener("click", renderNextOfGenerationBatch);
  ui.ofGenerationGrid.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-of-generation-key]");
    if (trigger) openOfGenerationModal(trigger.dataset.ofGenerationKey);
  });
  ui.ofGenerationModalClose.addEventListener("click", closeOfGenerationModal);
  ui.ofGenerationModal.addEventListener("click", (event) => {
    if (event.target === ui.ofGenerationModal) closeOfGenerationModal();
  });
  ui.ofGenerationModal.addEventListener("close", () => {
    state.activeOfGeneration = null;
    state.lastFocusedElement?.focus?.();
  });
  ui.ofGenerationModalOpenItem.addEventListener("click", () => {
    const code = state.activeOfGeneration?.item.code;
    closeOfGenerationModal();
    if (code) window.setTimeout(() => openItem(code), 0);
  });
  ui.reviewCardsGrid.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-review-key]");
    if (trigger) openMinMaxReviewModal(trigger.dataset.reviewKey);
  });
  ui.reviewLoadMore.addEventListener("click", renderNextMinMaxReviewBatch);
  ui.reviewModalClose.addEventListener("click", closeMinMaxReviewModal);
  ui.reviewModal.addEventListener("click", (event) => {
    if (event.target === ui.reviewModal) closeMinMaxReviewModal();
  });
  ui.reviewModal.addEventListener("close", () => {
    state.activeMinMaxReview = null;
    state.lastFocusedElement?.focus?.();
  });
  ui.reviewModalOpenItem.addEventListener("click", () => {
    const code = state.activeMinMaxReview?.item.code;
    closeMinMaxReviewModal();
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

const PT_EN = Object.freeze({
  "Gestão de Almoxarifado": "Warehouse Management",
  "Preparando catálogo…": "Preparing catalog…",
  "Tema": "Theme",
  "Idioma": "Language",
  "Modo compacto": "Compact mode",
  "Modo confortável": "Comfortable mode",
  "Dashboard": "Dashboard",
  "Catálogo": "Catalog",
  "Necessidade de Compra": "Purchase requirements",
  "Necessidade de compra": "Purchase requirements",
  "SC Pendente de OF": "PR awaiting PO",
  "SC pendente de OF": "PR awaiting PO",
  "Consulta SC e OF": "PR and PO tracking",
  "Consulta de SC e OF": "PR and PO tracking",
  "Tempo de geração de OF": "PO generation time",
  "Tempo de geração da OF": "PO generation time",
  "Eficiência de compras": "Purchasing efficiency",
  "Intervalo entre a data de criação da SC e a data de emissão da OF, considerando cada processo uma única vez.": "Interval between PR creation and PO issuance, counting each process once.",
  "Distribuição do tempo de geração de OF": "PO generation time distribution",
  "Média geral": "Overall average",
  "Processos medidos": "Measured processes",
  "SC criada → OF emitida": "PR created → PO issued",
  "SC + OF únicas": "Unique PR + PO pairs",
  "Período de análise": "Analysis period",
  "Data de criação da SC": "PR creation date",
  "Limpar período": "Clear period",
  "Ano": "Year",
  "Mês": "Month",
  "Semana": "Week",
  "Data": "Date",
  "Todos os anos": "All years",
  "Todos os meses": "All months",
  "Todas as semanas": "All weeks",
  "Todas as datas": "All dates",
  "Evolução": "Trend",
  "Tempo médio para gerar a OF": "Average PO generation time",
  "Evolução conforme a data de criação da SC.": "Trend based on PR creation date.",
  "Todas as faixas": "All ranges",
  "Visualizar por": "View by",
  "Faixa de dias": "Day range",
  "Anual": "Yearly",
  "Mensal": "Monthly",
  "Semanal": "Weekly",
  "Diário": "Daily",
  "Tempo médio em dias": "Average time in days",
  "Nenhum processo encontrado para esta faixa e período.": "No process found for this range and period.",
  "Até 7 dias": "Up to 7 days",
  "De 8 a 15 dias": "From 8 to 15 days",
  "De 16 a 20 dias": "From 16 to 20 days",
  "De 21 a 25 dias": "From 21 to 25 days",
  "De 26 a 30 dias": "From 26 to 30 days",
  "Superior a 30 dias": "Over 30 days",
  "Selecione uma faixa acima para detalhar somente os processos daquele intervalo.": "Select a range above to show only processes in that interval.",
  "Exibir todas as faixas": "Show all ranges",
  "Carregar mais processos": "Load more processes",
  "Revisão de Min e Máx": "Min. and max. review",
  "Revisão de mín. e máx.": "Min. and max. review",
  "Carregando dados do almoxarifado": "Loading warehouse data",
  "Lendo os arquivos de saldo e compras…": "Reading inventory and purchasing files…",
  "Baixando os arquivos de saldo, compras e responsáveis…": "Downloading inventory, purchasing and replenishment owner files…",
  "Tentar novamente": "Try again",
  "Filtros": "Filters",
  "Todas as filiais · todos os itens": "All branches · all items",
  "Consulta global": "Global search",
  "Filtrar itens": "Filter items",
  "Código, descrição, SC, OF ou NF": "Code, description, PR, PO or invoice",
  "Busque item, SC, OF, NF ou fornecedor": "Search item, PR, PO, invoice or supplier",
  "Filial": "Branch",
  "Todas as filiais": "All branches",
  "Local de estoque": "Stock location",
  "Todos os locais": "All locations",
  "Responsável pela reposição": "Replenishment owner",
  "Responsáveis pela reposição": "Replenishment owners",
  "Todos os responsáveis": "All replenishment owners",
  "Categoria ou grupo": "Category or group",
  "Todas as categorias": "All categories",
  "Unidade": "Unit",
  "Todas as unidades": "All units",
  "Fornecedor": "Supplier",
  "Todos os fornecedores": "All suppliers",
  "Solicitante da SC": "PR requester",
  "Todos os solicitantes": "All requesters",
  "Classificação da compra": "Purchase classification",
  "Todas as classificações": "All classifications",
  "Entrada no almoxarifado · CCU 1500": "Warehouse receipt · CCU 1500",
  "Direto para a área · CCU diferente de 1500": "Direct to department · CCU other than 1500",
  "Compra direta de item de estoque do almoxarifado": "Direct purchase of a warehouse stock item",
  "Código do item em compra direta": "Item code in direct purchase",
  "Todos os códigos": "All item codes",
  "Saldo em OF aberta · CCU 1500": "Open PO balance · CCU 1500",
  "SC sem OF · CCU 1500": "PR without PO · CCU 1500",
  "Situação do estoque": "Inventory status",
  "Todas as situações": "All statuses",
  "Itens zerados (Min + Máx > 0)": "Out-of-stock items (Min. + Max. > 0)",
  "Itens zerados (mín. + máx. > 0)": "Out-of-stock items (Min. + Max. > 0)",
  "Itens abaixo do mínimo": "Items below minimum",
  "Itens acima do máximo": "Items above maximum",
  "Itens dentro do range": "Items within range",
  "Itens dentro da faixa": "Items within range",
  "Com saldo sem Min&Máx": "Positive stock without min./max.",
  "Com saldo sem mín. e máx.": "Positive stock without min./max.",
  "Saldo negativo": "Negative stock",
  "Ajustar local de estoque": "Adjust stock location",
  "Situação da SC e entrega": "PR and delivery status",
  "Aguardando OF": "Awaiting PO",
  "Entrega parcial": "Partial delivery",
  "Aguardando entrega": "Awaiting delivery",
  "Atrasada": "Overdue",
  "Somente itens com saldo positivo": "Only items with positive stock",
  "Limpar filtros": "Clear filters",
  "Concluir e fechar": "Apply and close",
  "Visão geral": "Overview",
  "Indicadores do estoque": "Inventory indicators",
  "Base completa": "Full dataset",
  "Códigos ativos de estoque": "Active inventory codes",
  "com saldo ou limites parametrizados": "with stock or configured limits",
  "Valor do estoque": "Inventory value",
  "valor atual consolidado": "current consolidated value",
  "Valor estimado para reposição": "Estimated replenishment value",
  "necessidade líquida após OFs abertas": "net requirement after open POs",
  "Valor acima do máximo": "Value above maximum",
  "capital estimado em excesso": "estimated excess capital",
  "Pendências documentais": "Document pending items",
  "SC sem OF ou OF com saldo pendente": "PR without PO or PO with open balance",
  "Itens com saldo": "Items with stock",
  "saldo consolidado diferente de zero": "non-zero consolidated stock",
  "Zerados parametrizados": "Configured out-of-stock items",
  "saldo zero com Min + Máx positivo": "zero stock with positive min. + max.",
  "saldo zero com mín. + máx. positivos": "zero stock with positive min. + max.",
  "Abaixo do mínimo": "Below minimum",
  "saldo positivo abaixo do mínimo": "positive stock below minimum",
  "Acima do máximo": "Above maximum",
  "com máximo parametrizado": "with configured maximum",
  "Saldo sem Min&Máx": "Stock without min./max.",
  "Saldo sem mín. e máx.": "Stock without min./max.",
  "Sem mín. e máx.": "Without min./max.",
  "saldo positivo sem limites": "positive stock without limits",
  "SC sem OF": "PR without PO",
  "confirmadas ou em negociação": "confirmed or under negotiation",
  "em ao menos uma posição": "in at least one position",
  "OF com saldo pendente": "PO with open balance",
  "ordens ainda não totalmente atendidas": "orders not yet fully fulfilled",
  "Distribuição": "Distribution",
  "Códigos por filial": "Codes by branch",
  "Clique para filtrar": "Click to filter",
  "Alertas independentes": "Independent alerts",
  "Códigos por situação": "Codes by status",
  "Um código pode ter posições distintas": "One code may have different positions",
  "Financeiro": "Financial",
  "Valor do estoque por filial": "Inventory value by branch",
  "Valores consolidados": "Consolidated values",
  "Fluxo de compras": "Purchasing flow",
  "SC → OF → Recebimento": "PR → PO → Receipt",
  "Abrir processos": "Open processes",
  "Reposição": "Replenishment",
  "Maiores necessidades estimadas": "Largest estimated requirements",
  "Ver todas": "View all",
  "Capital imobilizado": "Tied-up capital",
  "Maiores excessos estimados": "Largest estimated excesses",
  "Ver todos": "View all",
  "Itens encontrados": "Items found",
  "Visual": "View",
  "Cards": "Cards",
  "Lista compacta": "Compact list",
  "Ordenar": "Sort",
  "Código": "Code",
  "Descrição": "Description",
  "Maior saldo": "Highest stock",
  "Maior valor": "Highest value",
  "Maior criticidade": "Highest criticality",
  "Nenhum item encontrado": "No items found",
  "Altere os filtros ou limpe a busca para consultar outros itens.": "Change the filters or clear the search to view other items.",
  "Carregar mais": "Load more",
  "Baseado no Saldo_Online": "Based on Saldo_Online",
  "Posições com saldo abaixo do mínimo. A sugestão repõe até o máximo; quando não há máximo positivo, repõe até o mínimo.": "Positions below minimum stock. The recommendation replenishes up to the maximum or, when unavailable, up to the minimum.",
  "Itens para comprar": "Items to purchase",
  "Posições abaixo do mínimo": "Positions below minimum",
  "Pendências de reposição": "Replenishment alerts",
  "Itens e OFs que precisam de reposição": "Items and POs requiring replenishment",
  "Posições com saldo abaixo do mínimo e alertas especiais de OF de Cavaco abaixo de 200.": "Positions below minimum and special wood-chip PO alerts below 200.",
  "Cavaco · OF abaixo de 200": "Wood chips · PO below 200",
  "Saldo da OF": "PO balance",
  "Saldo atual da OF": "Current PO balance",
  "Limite do alerta": "Alert threshold",
  "Déficit até 200": "Gap to 200",
  "Rupturas": "Stockouts",
  "Valor líquido estimado": "Estimated net value",
  "Sem máximo informado": "Without maximum",
  "Posições que precisam de reposição": "Positions requiring replenishment",
  "Formato": "Format",
  "Exportar": "Export",
  "Exportar Excel": "Export to Excel",
  "Carregar mais necessidades": "Load more requirements",
  "Compras pendentes": "Pending purchases",
  "Solicitações com compra confirmada ou comprador negociando, não canceladas e sem código de OF gerado.": "Confirmed or under-negotiation requests that are not cancelled and do not yet have a PO.",
  "Solicitações encontradas": "Requests found",
  "Selecione um cartão para consultar todos os detalhes da solicitação.": "Select a card to view all request details.",
  "Carregar mais solicitações": "Load more requests",
  "Processos de compra": "Purchasing processes",
  "Consulte solicitações, ordens de fornecimento e recebimentos vinculados aos itens filtrados.": "View purchase requests, purchase orders and receipts linked to the filtered items.",
  "SC aguardando OF": "PR awaiting PO",
  "OF com entrega parcial": "PO with partial delivery",
  "Recebimentos localizados": "Receipts found",
  "Carregar mais processos": "Load more processes",
  "Parametrização": "Parameter settings",
  "Área preparada para analisar consumo e apoiar a revisão dos limites de estoque.": "Workspace for consumption analysis and inventory limit review.",
  "Em construção — aguardando CSV": "Under construction — awaiting CSV",
  "Itens analisados": "Items analyzed",
  "Parâmetros ideais": "Ideal parameters",
  "Recomendação de ajuste": "Adjustment recommended",
  "Sem histórico suficiente": "Insufficient history",
  "Lead time médio": "Average lead time",
  "Análise por item e posição": "Analysis by item and position",
  "Consumo mensal, lead time real, parâmetros atuais e sugestão calculada para reposição.": "Monthly consumption, actual lead time, current parameters and calculated replenishment recommendation.",
  "Carregar mais análises": "Load more analyses",
  "Detalhes do item": "Item details",
  "Resumo e fotos": "Summary and photos",
  "Posições de estoque": "Stock positions",
  "SC, OF e REC": "PR, PO and REC",
  "Saldo total": "Total stock",
  "Saldo por filial": "Stock by branch",
  "Valores individuais conforme os filtros ativos": "Individual values based on active filters",
  "Valor filtrado": "Filtered inventory value",
  "Posições exibidas": "Displayed positions",
  "Registros exibidos": "Displayed records",
  "Saldo na filial": "Branch stock",
  "Nenhuma posição corresponde aos filtros ativos.": "No position matches the active filters.",
  "Nenhum registro de compra corresponde aos filtros ativos.": "No purchasing record matches the active filters.",
  "Ver saldos acima": "See balances above",
  "filiais exibidas": "branches displayed",
  "Selecione uma filial": "Select a branch",
  "A projeção é calculada individualmente por filial": "The projection is calculated individually by branch",
  "Valor em estoque": "Inventory value",
  "Posições": "Positions",
  "Registros de compras": "Purchasing records",
  "Adicionar foto": "Add photo",
  "Até 6 fotos salvas neste aparelho": "Up to 6 photos saved on this device",
  "Distribuição por filial e local": "Distribution by branch and location",
  "Limites e saldos são avaliados individualmente em cada posição.": "Limits and balances are evaluated individually for each position.",
  "Processo completo de compras": "Complete purchasing process",
  "Solicitação de compra, ordem de fornecimento e recebimento/nota fiscal.": "Purchase request, purchase order and receipt/invoice.",
  "Saldo atual": "Current stock",
  "Mínimo": "Minimum",
  "Máximo": "Maximum",
  "Consumo médio mensal": "Average monthly consumption",
  "Próxima compra": "Next purchase",
  "Solicitante": "Requester",
  "Quantidade": "Quantity",
  "E-mail": "Email",
  "Não informado": "Not provided",
  "Não informada": "Not provided",
  "Filial não informada": "Branch not provided",
  "Entrega não informada": "Delivery date not provided",
  "Situação não informada": "Status not provided",
  "Não gerada": "Not created",
  "Não recebido": "Not received",
  "Sim": "Yes",
  "Não": "No",
  "Ruptura": "Stockout",
  "Compra já coberta": "Purchase already covered",
  "Processo pendente": "Pending process",
  "Entrega prevista vencida": "Expected delivery overdue",
  "Situação": "Status",
  "Data de criação": "Creation date",
  "Data de entrega": "Delivery date",
  "Observação": "Notes",
  "Endereço de armazenagem": "Storage address",
  "Repartição": "Section",
  "Prateleira": "Shelf",
  "Divisão": "Division",
  "Fechar detalhes": "Close details",
  "Item anterior": "Previous item",
  "Próximo item": "Next item",
  "Alterar idioma para inglês": "Switch language to English",
  "Alterar idioma para português": "Switch language to Portuguese"
  ,"Adicione o arquivo": "Add the file"
  ,"na raiz do repositório.": "to the repository root."
  ,"Estrutura recomendada: código do item, filial, local, data ou competência, quantidade consumida e tipo de movimento. Com esses campos, o sistema poderá calcular cobertura, giro, estoque de segurança e sugestões de mín. e máx.": "Recommended structure: item code, branch, location, date or period, consumed quantity and movement type. With these fields, the system can calculate coverage, turnover, safety stock and min./max. recommendations."
  ,"Abrir cadastro completo do item": "Open full item record"
  ,"Detalhes da solicitação": "Request details"
  ,"Processo de compra": "Purchasing process"
  ,"Carregar mais 20 registros": "Load 20 more records"
  ,"Ative o JavaScript para consultar o catálogo do almoxarifado.": "Enable JavaScript to view the warehouse catalog."
  ,"Aurora UI · Mais moderno": "Aurora UI · Most modern"
  ,"Azul Polar · Fluido": "Polar Blue · Fluid"
  ,"Rubi Dourado · Executivo": "Golden Ruby · Executive"
  ,"Industrial Azul · Técnico": "Industrial Blue · Technical"
  ,"Grafite · Minimalista": "Graphite · Minimalist"
  ,"Verde Operação · Comando": "Operations Green · Command"
  ,"Âmbar Logística · Dinâmico": "Logistics Amber · Dynamic"
  ,"Roxo Corporativo · Premium": "Corporate Purple · Premium"
  ,"Oceano · Glass": "Ocean · Glass"
  ,"Claro Neutro · Clean": "Neutral Light · Clean"
  ,"Alto Contraste · Acessível": "High Contrast · Accessible"
  ,"Aguardando geração de OF": "Awaiting PO creation"
  ,"Alteração proposta": "Proposed change"
  ,"Abaixo do mínimo com saldo": "Below minimum with stock"
  ,"Atenção — saldo positivo abaixo do mínimo": "Attention — positive stock below minimum"
  ,"Crítica — posição em ruptura": "Critical — stockout position"
  ,"Fora de estoque": "Out of stock"
  ,"Histórico insuficiente": "Insufficient history"
  ,"Histórico real": "Actual history"
  ,"Padrão estimado de 30 dias": "Estimated 30-day standard"
  ,"Referência estimada": "Estimated reference"
  ,"Não disponível": "Unavailable"
  ,"Não foi possível projetar uma data": "Unable to project a date"
  ,"Data não informada": "Date not provided"
  ,"Endereço não informado": "Address not provided"
  ,"Posição não identificada": "Position not identified"
  ,"Sem categoria informada": "Category not provided"
  ,"Sem fornecedor no histórico": "No supplier in history"
  ,"Sem histórico": "No history"
  ,"Sem posição": "No position"
  ,"Sem posição de estoque": "No stock position"
  ,"Última movimentação de compra": "Latest purchasing transaction"
  ,"Último preço conhecido": "Latest known price"
  ,"Preço de referência": "Reference price"
  ,"Compra líquida": "Net purchase"
  ,"Saldo disponível": "Available stock"
  ,"Saldo no ponto de reposição": "Stock at reorder point"
  ,"Custo unitário": "Unit cost"
  ,"Valor estimado": "Estimated value"
  ,"Valor estimado da compra": "Estimated purchase value"
  ,"Valor unitário": "Unit value"
  ,"Valor unitário fiscal": "Invoice unit value"
  ,"Valor do documento": "Document value"
  ,"Quantidade solicitada": "Requested quantity"
  ,"Quantidade entregue": "Delivered quantity"
  ,"Quantidade coberta por SC sem OF": "Quantity covered by PR without PO"
  ,"Saldo coberto por OF aberta": "Stock covered by open PO"
  ,"Origem da cobertura": "Coverage source"
  ,"Números das OFs": "PO numbers"
  ,"Números das SCs sem OF": "PR numbers without PO"
  ,"Critério": "Criterion"
  ,"Critério de cálculo": "Calculation criterion"
  ,"Reposição até o máximo": "Replenish to maximum"
  ,"Reposição até o máximo parametrizado": "Replenish to configured maximum"
  ,"Reposição até o mínimo": "Replenish to minimum"
  ,"Máximo não informado; reposição até o mínimo": "Maximum not provided; replenish to minimum"
  ,"Mínimo atual": "Current minimum"
  ,"Máximo atual": "Current maximum"
  ,"Mín. cadastrado": "Configured min."
  ,"Máx. cadastrado": "Configured max."
  ,"Mínimo sugerido": "Recommended minimum"
  ,"Mín. atual · margem +20%": "Current min. · +20% margin"
  ,"inclui margem preventiva de 20%": "includes a 20% preventive margin"
  ,"Consumo sem anomalias, lead time real e margem preventiva de 20% no mínimo sugerido.": "Anomaly-adjusted consumption, actual lead time and a 20% preventive margin in the recommended minimum."
  ,"Mínimo = (consumo diário sem anomalias × lead time) + margem preventiva de 20%. Máximo = mínimo sugerido + 30 dias de consumo. Validação com tolerância de ±20%. Meses muito fora do padrão são excluídos por análise robusta da mediana.": "Minimum = (anomaly-adjusted daily consumption × lead time) plus a 20% preventive margin. Maximum = recommended minimum plus 30 days of consumption. Validation uses a ±20% tolerance. Months far outside the pattern are excluded using robust median analysis."
  ,"Máximo sugerido": "Recommended maximum"
  ,"Meses analisados": "Months analyzed"
  ,"Meses considerados": "Months included"
  ,"Meses anômalos excluídos": "Outlier months excluded"
  ,"Anomalia excluída": "Outlier excluded"
  ,"Considerado na média": "Included in average"
  ,"média dos meses considerados": "average of included months"
  ,"Anomalias excluídas": "Excluded outliers"
  ,"Impacto estimado no máximo": "Estimated maximum impact"
  ,"Impacto no estoque máximo": "Maximum stock impact"
  ,"Impacto financeiro estimado": "Estimated financial impact"
  ,"Impacto no mínimo": "Minimum impact"
  ,"Impacto no máximo": "Maximum impact"
  ,"Origem do preço": "Price source"
  ,"Último preço de compra": "Latest purchase price"
  ,"Sem preço disponível": "No price available"
  ,"Preço indisponível": "Price unavailable"
  ,"Sem impacto financeiro": "No financial impact"
  ,"Valor do mínimo atual": "Current minimum value"
  ,"Valor do mínimo sugerido": "Recommended minimum value"
  ,"Impacto do ajuste do mínimo": "Minimum adjustment impact"
  ,"Valor do máximo atual": "Current maximum value"
  ,"Valor do máximo sugerido": "Recommended maximum value"
  ,"Impacto do ajuste do máximo": "Maximum adjustment impact"
  ,"Aumento total": "Total increase"
  ,"Redução total": "Total reduction"
  ,"Impacto líquido": "Net impact"
  ,"Capital adicional recomendado": "Recommended additional capital"
  ,"Capital potencialmente liberado": "Potentially released capital"
  ,"Aumentos menos reduções": "Increases minus reductions"
  ,"Consumo médio/mês": "Average monthly consumption"
  ,"Custo unitário atual": "Current unit cost"
  ,"Mínimo = consumo diário sem anomalias × lead time. Máximo = mínimo + 30 dias de consumo. Validação com tolerância de ±20%. Meses muito fora do padrão são excluídos por análise robusta da mediana.": "Minimum = anomaly-adjusted daily consumption × lead time. Maximum = minimum + 30 days of consumption. Validation uses a ±20% tolerance. Months far outside the pattern are excluded using robust median analysis."
  ,"Lead time em dias": "Lead time in days"
  ,"Origem do lead time": "Lead time source"
  ,"Amostras de lead time": "Lead time samples"
  ,"Tempos encontrados": "Lead times found"
  ,"Validação": "Validation"
  ,"Consumo por mês": "Monthly consumption"
  ,"Categoria / grupo": "Category / group"
  ,"Categorias do item": "Item categories"
  ,"Descrição detalhada": "Detailed description"
  ,"Descrição do material": "Material description"
  ,"Código do item": "Item code"
  ,"Código do produto": "Product code"
  ,"Código do fornecedor": "Supplier code"
  ,"Código filial": "Branch code"
  ,"Código local": "Location code"
  ,"Data de emissão": "Issue date"
  ,"Data de entrada": "Entry date"
  ,"Dias aguardando": "Days waiting"
  ,"Dias aguardando OF": "Days awaiting PO"
  ,"SC pendente de OF há mais de 7 dias": "PR awaiting PO for more than 7 days"
  ,"Entrega vencida": "Overdue delivery"
  ,"Tempo desde a criação": "Time since creation"
  ,"Tempo entre SC e OF": "Time from PR to PO"
  ,"Tempo entre OF e recebimento": "Time from PO to receipt"
  ,"Empresa": "Company"
  ,"Empresa de entrega": "Delivery company"
  ,"Empresa de pagamento": "Payment company"
  ,"Empresa destino": "Destination company"
  ,"Filial de entrega": "Delivery branch"
  ,"Filial de pagamento": "Payment branch"
  ,"Filial destino": "Destination branch"
  ,"Usuário solicitante": "Requesting user"
  ,"Centro de custo aprovador": "Approver cost center"
  ,"Sequência": "Sequence"
  ,"Regularização": "Regularization"
  ,"Percentual de rateio": "Allocation percentage"
  ,"Conta": "Account"
  ,"Alíquota ICMS": "ICMS tax rate"
  ,"Alíquota IPI": "IPI tax rate"
  ,"Condição de pagamento": "Payment terms"
  ,"Forma de pagamento": "Payment method"
  ,"Motivo": "Reason"
  ,"Motivo do fechamento": "Closing reason"
  ,"Número da nota fiscal": "Invoice number"
  ,"Série": "Series"
  ,"Solicitação de Compra": "Purchase Request"
  ,"Ordem de Fornecimento": "Purchase Order"
  ,"Recebimento": "Receipt"
  ,"SC": "PR"
  ,"OF": "PO"
  ,"Solicitação (SC)": "Request (PR)"
  ,"Ordem (OF)": "Order (PO)"
  ,"Recebimento / NF": "Receipt / Invoice"
  ,"Valor unit.": "Unit value"
  ,"Valor doc./estimado": "Document/estimated value"
  ,"Compra confirmada": "Purchase confirmed"
  ,"Comprador negociando": "Buyer negotiating"
  ,"Aberta": "Open"
  ,"Fechada": "Closed"
  ,"Parcial": "Partial"
  ,"Emitida": "Issued"
  ,"Recebido": "Received"
  ,"Solicitações": "Requests"
  ,"Falha ao carregar os dados": "Failed to load data"
  ,"Baixando os arquivos de saldo e compras…": "Downloading inventory and purchasing files…"
  ,"Consolidando saldos por código, filial e local…": "Consolidating balances by code, branch and location…"
  ,"Relacionando solicitações, ordens e recebimentos…": "Linking requests, orders and receipts…"
  ,"Não foi possível carregar os CSVs.": "Unable to load the CSV files."
  ,"Não foi possível iniciar o catálogo.": "Unable to start the catalog."
  ,"Não foi possível processar os dados.": "Unable to process the data."
  ,"Os dados foram lidos, mas não puderam ser exibidos.": "The data was read but could not be displayed."
});

const EN_PT = Object.freeze(Object.fromEntries(Object.entries(PT_EN).map(([pt, en]) => [en, pt])));

function initializeLanguage() {
  let language = "pt-BR";
  try { language = localStorage.getItem("almoxarifado-language") || language; } catch { /* usa português */ }
  languageObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) for (const node of mutation.addedNodes) translateSubtree(node, activeLanguage);
  });
  applyLanguage(LANGUAGE_IDS.has(language) ? language : "pt-BR", false);
}

function applyLanguage(language, persist) {
  languageObserver?.disconnect();
  activeLanguage = LANGUAGE_IDS.has(language) ? language : "pt-BR";
  document.documentElement.lang = activeLanguage;
  document.documentElement.dataset.language = activeLanguage;
  ui.languageToggle.innerHTML = activeLanguage === "pt-BR" ? "<small>Idioma</small><strong>EN</strong>" : "<small>Language</small><strong>PT</strong>";
  const nextLanguage = activeLanguage === "pt-BR" ? "inglês" : "português";
  ui.languageToggle.title = `Alterar idioma para ${nextLanguage}`;
  ui.languageToggle.setAttribute("aria-label", ui.languageToggle.title);
  translateSubtree(document.body, activeLanguage);
  document.title = `${translateUiText(pageTitle(pageFromHash()), activeLanguage)} · ${translateUiText("Gestão de Almoxarifado", activeLanguage)}`;
  if (activeLanguage === "en") languageObserver?.observe(document.body, { childList: true, subtree: true });
  if (persist) try { localStorage.setItem("almoxarifado-language", activeLanguage); } catch { /* preferência válida apenas nesta sessão */ }
}

function translateSubtree(root, language) {
  if (!root) return;
  if (root.nodeType === Node.TEXT_NODE) translateTextNode(root, language);
  const element = root.nodeType === Node.ELEMENT_NODE ? root : null;
  if (element?.matches("script, style")) return;
  if (element) translateElementAttributes(element, language);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeType === Node.TEXT_NODE) translateTextNode(node, language);
    else if (!node.matches("script, style")) translateElementAttributes(node, language);
  }
}

function translateTextNode(node, language) {
  if (node.parentElement?.closest("script, style")) return;
  const translated = translateUiText(node.nodeValue, language);
  if (translated !== node.nodeValue) node.nodeValue = translated;
}

function translateElementAttributes(element, language) {
  for (const attribute of ["title", "aria-label", "placeholder"]) {
    if (!element.hasAttribute(attribute)) continue;
    const value = element.getAttribute(attribute);
    const translated = translateUiText(value, language);
    if (translated !== value) element.setAttribute(attribute, translated);
  }
}

function translateUiText(value, language = activeLanguage) {
  const source = String(value ?? "");
  const trimmed = source.trim();
  if (!trimmed) return source;
  const dictionary = language === "en" ? PT_EN : EN_PT;
  let translated = dictionary[trimmed];
  if (!translated) translated = translateUiPattern(trimmed, language);
  if (!translated || translated === trimmed) return source;
  return source.replace(trimmed, translated);
}

function translateUiPattern(text, language) {
  const rules = language === "en" ? [
    [/^Busca: (.+)$/i, "Search: $1"], [/^Código (.+)$/i, "Code $1"], [/^Filial (.+)$/i, "Branch $1"],
    [/^Comprar (.+)$/i, "Purchase $1"], [/^(\d[\d.,]*) dias?$/i, "$1 days"],
    [/^Exibindo (.+) de (.+) necessidades$/i, "Showing $1 of $2 requirements"],
    [/^Exibindo (.+) de (.+) solicitações$/i, "Showing $1 of $2 requests"],
    [/^(\d[\d.,]*) de (\d[\d.,]*) processos$/i, "$1 of $2 processes"],
    [/^(\d[\d.,]*) itens?$/i, "$1 items"], [/^(\d[\d.,]*) posições?$/i, "$1 positions"],
    [/^(\d[\d.,]*) registros?$/i, "$1 records"], [/^(\d[\d.,]*) processos?$/i, "$1 processes"],
    [/^(\d[\d.,]*) filiais exibidas$/i, "$1 branches displayed"], [/^Saldo na filial · (.+)$/i, "Branch stock · $1"],
    [/^(\d[\d.,]*) meses?$/i, "$1 months"], [/^(\d+)\/(\d+) meses considerados$/i, "$1/$2 months included"],
    [/^(\d+) de (\d+) meses considerados$/i, "$1 of $2 months included"], [/^(\d+) anomalias? excluídas?$/i, "$1 outliers excluded"],
    [/^Aumento de (.+)$/i, "Increase of $1"], [/^Redução de (.+)$/i, "Reduction of $1"],
    [/^(.+) pendente$/i, "$1 outstanding"], [/^SC (.+) sem Ordem de Fornecimento$/i, "PR $1 without Purchase Order"],
    [/^SC (.+) · aguardando OF$/i, "PR $1 · awaiting PO"], [/^OF (.+) · entrega parcial$/i, "PO $1 · partial delivery"],
    [/^OF (.+) · aguardando entrega$/i, "PO $1 · awaiting delivery"], [/^SC (.+) · atrasada$/i, "PR $1 · overdue"],
    [/^OF (.+) · atrasada$/i, "PO $1 · overdue"], [/^OF (.+) · recebida$/i, "PO $1 · received"],
    [/^Repartição (.+) · Prateleira (.+) · Divisão (.+)$/i, "Section $1 · Shelf $2 · Division $3"],
    [/^Solicitada por (.+) em (.+)$/i, "Requested by $1 on $2"],
    [/^Em aproximadamente (.+)$/i, "In approximately $1"]
  ] : [
    [/^Search: (.+)$/i, "Busca: $1"], [/^Code (.+)$/i, "Código $1"], [/^Branch (.+)$/i, "Filial $1"],
    [/^Purchase (.+)$/i, "Comprar $1"], [/^(\d[\d.,]*) days?$/i, "$1 dias"],
    [/^Showing (.+) of (.+) requirements$/i, "Exibindo $1 de $2 necessidades"],
    [/^Showing (.+) of (.+) requests$/i, "Exibindo $1 de $2 solicitações"],
    [/^(\d[\d.,]*) of (\d[\d.,]*) processes$/i, "$1 de $2 processos"],
    [/^(\d[\d.,]*) items?$/i, "$1 itens"], [/^(\d[\d.,]*) positions?$/i, "$1 posições"],
    [/^(\d[\d.,]*) records?$/i, "$1 registros"], [/^(\d[\d.,]*) processes?$/i, "$1 processos"],
    [/^(\d[\d.,]*) branches displayed$/i, "$1 filiais exibidas"], [/^Branch stock · (.+)$/i, "Saldo na filial · $1"],
    [/^(\d[\d.,]*) months?$/i, "$1 meses"], [/^(\d+)\/(\d+) months included$/i, "$1/$2 meses considerados"],
    [/^(\d+) of (\d+) months included$/i, "$1 de $2 meses considerados"], [/^(\d+) outliers excluded$/i, "$1 anomalias excluídas"],
    [/^Increase of (.+)$/i, "Aumento de $1"], [/^Reduction of (.+)$/i, "Redução de $1"],
    [/^(.+) outstanding$/i, "$1 pendente"], [/^PR (.+) without Purchase Order$/i, "SC $1 sem Ordem de Fornecimento"],
    [/^PR (.+) · awaiting PO$/i, "SC $1 · aguardando OF"], [/^PO (.+) · partial delivery$/i, "OF $1 · entrega parcial"],
    [/^PO (.+) · awaiting delivery$/i, "OF $1 · aguardando entrega"], [/^PR (.+) · overdue$/i, "SC $1 · atrasada"],
    [/^PO (.+) · overdue$/i, "OF $1 · atrasada"], [/^PO (.+) · received$/i, "OF $1 · recebida"],
    [/^Section (.+) · Shelf (.+) · Division (.+)$/i, "Repartição $1 · Prateleira $2 · Divisão $3"],
    [/^Requested by (.+) on (.+)$/i, "Solicitada por $1 em $2"],
    [/^In approximately (.+)$/i, "Em aproximadamente $1"]
  ];
  for (const [pattern, replacement] of rules) if (pattern.test(text)) return text.replace(pattern, replacement);
  return text;
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
    : "neutral";
  ui.themeSelect.value = theme;
  applyTheme(theme, false);
}

function applyTheme(theme, persist) {
  const selectedTheme = THEME_IDS.has(theme) ? theme : "neutral";
  document.documentElement.classList.add("is-switching-theme");
  document.documentElement.dataset.theme = selectedTheme;
  const themeColor = getComputedStyle(document.documentElement).getPropertyValue("--navy-800").trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColor || "#123a63");
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => document.documentElement.classList.remove("is-switching-theme")));
  if (!persist) return;
  try {
    localStorage.setItem("almoxarifado-theme", selectedTheme);
  } catch {
    // O tema continua ativo durante a sessão mesmo se o armazenamento estiver indisponível.
  }
}

function pageFromHash() {
  const page = window.location.hash.replace(/^#/, "");
  return ["dashboard", "catalogo", "necessidade-compra", "sc-pendente-of", "consulta-sc-of", "tempo-geracao-of", "revisao-min-max"].includes(page)
    ? page
    : "dashboard";
}

function navigateToPage(page, updateHash) {
  const validPage = ["dashboard", "catalogo", "necessidade-compra", "sc-pendente-of", "consulta-sc-of", "tempo-geracao-of", "revisao-min-max"].includes(page)
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

  document.title = `${translateUiText(pageTitle(validPage))} · ${translateUiText("Gestão de Almoxarifado")}`;
  if (state.items.length && !ui.catalogContent.classList.contains("is-hidden")) scheduleFilteredPage(validPage);
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
    "necessidade-compra": "Necessidade de compra",
    "sc-pendente-of": "SC pendente de OF",
    "consulta-sc-of": "Consulta SC e OF",
    "tempo-geracao-of": "Tempo de geração de OF",
    "revisao-min-max": "Revisão de mín. e máx.",
  })[page];
}

function toggleFilters() {
  const willOpen = ui.globalFiltersPanel.classList.contains("is-hidden");
  if (!willOpen) {
    closeFilters(true);
    return;
  }
  state.filterDraftSnapshot = captureFilterValues();
  ui.globalFiltersPanel.classList.remove("is-hidden");
  ui.filterToggleButton.setAttribute("aria-expanded", "true");
  window.requestAnimationFrame(() => ui.searchInput.focus());
}

function closeFilters(restoreDraft = true) {
  cancelDraftFilterRefresh();
  if (restoreDraft && state.filterDraftSnapshot) {
    ui.branchFilter.value = state.filterDraftSnapshot.branchFilter;
    populateFilters();
    restoreFilterValues(state.filterDraftSnapshot);
    for (const option of ui.stockStatusFilter.options) option.disabled = false;
  }
  state.filterDraftSnapshot = null;
  ui.globalFiltersPanel.classList.add("is-hidden");
  ui.filterToggleButton.setAttribute("aria-expanded", "false");
  ui.filterToggleButton.focus();
}

function captureFilterValues() {
  return {
    searchInput: ui.searchInput.value,
    branchFilter: ui.branchFilter.value,
    locationFilter: ui.locationFilter.value,
    replenishmentResponsibleFilter: ui.replenishmentResponsibleFilter.value,
    categoryFilter: ui.categoryFilter.value,
    unitFilter: ui.unitFilter.value,
    supplierFilter: ui.supplierFilter.value,
    requesterFilter: ui.requesterFilter.value,
    ccuClassificationFilter: ui.ccuClassificationFilter.value,
    itemCodeFilter: ui.itemCodeFilter.value,
    stockStatusFilter: ui.stockStatusFilter.value,
    scStatusFilter: ui.scStatusFilter.value,
    positiveBalanceFilter: ui.positiveBalanceFilter.checked,
  };
}

function restoreFilterValues(values) {
  for (const [id, value] of Object.entries(values)) {
    if (!ui[id]) continue;
    if (id === "positiveBalanceFilter") ui[id].checked = Boolean(value);
    else ui[id].value = value;
  }
}

function scheduleDraftFilterRefresh(changedId) {
  if (!state.items.length) return;
  window.clearTimeout(state.draftFilterRefreshTimer);
  ui.globalFiltersPanel.setAttribute("aria-busy", "true");
  state.draftFilterRefreshTimer = window.setTimeout(() => {
    state.draftFilterRefreshTimer = null;
    refreshDependentFilters(changedId);
    ui.globalFiltersPanel.removeAttribute("aria-busy");
  }, 32);
}

function cancelDraftFilterRefresh() {
  window.clearTimeout(state.draftFilterRefreshTimer);
  state.draftFilterRefreshTimer = null;
  ui.globalFiltersPanel.removeAttribute("aria-busy");
}

function applyAllFilters(shouldClose = false) {
  applyFilters(false);
  state.filterRevision += 1;
  scheduleFilteredPage(pageFromHash(), true);
  updateFilterSummary();
  if (shouldClose) closeFilters(false);
}

function renderFilteredPage(page, force = false) {
  if (!state.items.length) return;
  if (!force && state.pageRenderRevision.get(page) === state.filterRevision) return;
  if (page === "dashboard") {
    updateDashboardMetrics();
    renderDashboardCharts();
  } else if (page === "catalogo") {
    renderCatalogResults();
  } else if (page === "necessidade-compra") {
    renderPurchaseNeeds();
  } else if (page === "sc-pendente-of") {
    renderPendingScList();
  } else if (page === "consulta-sc-of") {
    buildProcurementRows();
  } else if (page === "tempo-geracao-of") {
    renderOfGenerationAnalysis();
  } else if (page === "revisao-min-max") {
    renderConsumptionReview();
  }
  state.pageRenderRevision.set(page, state.filterRevision);
}

function scheduleFilteredPage(page, force = false) {
  if (!state.items.length) return;
  if (!force && state.pageRenderRevision.get(page) === state.filterRevision) return;
  const token = ++state.pageRenderToken;
  const panel = ui.pagePanels.find((entry) => entry.dataset.pagePanel === page);
  panel?.setAttribute("aria-busy", "true");
  window.requestAnimationFrame(() => {
    if (token !== state.pageRenderToken || pageFromHash() !== page) {
      panel?.removeAttribute("aria-busy");
      return;
    }
    renderFilteredPage(page, force);
    panel?.removeAttribute("aria-busy");
  });
}

function handleAutomaticFilter(changedId) {
  applyAllFilters(false);
}

function updateFilterSummary() {
  const labels = [];
  const query = ui.searchInput.value.trim();
  if (query) labels.push(["searchInput", `Busca: ${query}`]);
  if (ui.branchFilter.value) labels.push(["branchFilter", ui.branchFilter.selectedOptions[0]?.textContent || `Filial ${ui.branchFilter.value}`]);
  if (ui.locationFilter.value) labels.push(["locationFilter", ui.locationFilter.selectedOptions[0]?.textContent || "Local selecionado"]);
  for (const select of [ui.replenishmentResponsibleFilter, ui.categoryFilter, ui.unitFilter, ui.supplierFilter, ui.requesterFilter, ui.ccuClassificationFilter, ui.itemCodeFilter, ui.stockStatusFilter, ui.scStatusFilter]) {
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
      comprasApiUrl: CONFIG.comprasApi,
      commitsApiUrl: CONFIG.commitsApi,
      comprasFallbackUrl: new URL(CONFIG.comprasFallbackFile, document.baseURI).href,
      replenishmentUrl: new URL(CONFIG.replenishmentFile, document.baseURI).href,
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
    if (Number.isFinite(Number(message.percent))) updateLoadingProgress(message.percent);
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
    buildMinMaxReviews();
    applyAllFilters(false);
    navigateToPage(pageFromHash(), false);

    const time = new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date());
    const activeStockItems = state.items.filter((item) => !item.flags.inactiveOnly && item.positions.length).length;
    const purchaseOnlyItems = state.items.filter((item) => item.flags.purchaseOnly).length;
    ui.statusLine.textContent = `${integerFormatter.format(activeStockItems)} no estoque ativo · ${integerFormatter.format(purchaseOnlyItems)} somente em compras · ${time}`;
    updateBaseTimestamp(message.payload.baseUpdatedAt);
    updateLoadingProgress(100);
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
  ui.baseUpdateBadge.classList.add("is-hidden");
  stopLoadingProgressPulse();
  state.loadingProgressValue = 0;
  state.loadingProgressCeiling = loadingProgressCeilingFor(0);
  updateLoadingProgress(0);
}

function updateLoadingProgress(percent = 0) {
  const checkpoint = Math.max(0, Math.min(100, Number(percent) || 0));

  if (checkpoint >= 100) {
    stopLoadingProgressPulse();
    state.loadingProgressValue = 100;
    state.loadingProgressCeiling = 100;
    renderLoadingProgress(true);
    return;
  }

  state.loadingProgressValue = Math.max(state.loadingProgressValue, checkpoint);
  state.loadingProgressCeiling = Math.max(state.loadingProgressCeiling, loadingProgressCeilingFor(checkpoint));
  renderLoadingProgress();
  startLoadingProgressPulse();
}

function loadingProgressCeilingFor(checkpoint = 0) {
  const value = Math.max(0, Math.min(100, Number(checkpoint) || 0));
  if (value >= 100) return 100;
  if (value >= 90) return 97;
  if (value >= 85) return 89;
  if (value >= 55) return Math.min(89, value + 8);
  if (value >= 36) return 53;
  if (value >= 28) return 34;
  if (value >= 8) return 26;
  return 7;
}

function startLoadingProgressPulse() {
  if (state.loadingProgressTimer || state.loadingProgressValue >= 100) return;
  state.loadingProgressTimer = setInterval(() => {
    const remaining = state.loadingProgressCeiling - state.loadingProgressValue;
    if (remaining <= 0.08) return;
    const increment = Math.max(0.12, Math.min(0.72, remaining * 0.045));
    state.loadingProgressValue = Math.min(state.loadingProgressCeiling, state.loadingProgressValue + increment);
    renderLoadingProgress();
  }, 420);
}

function stopLoadingProgressPulse() {
  if (!state.loadingProgressTimer) return;
  clearInterval(state.loadingProgressTimer);
  state.loadingProgressTimer = null;
}

function renderLoadingProgress(complete = false) {
  const value = Math.max(0, Math.min(100, state.loadingProgressValue));
  const displayed = complete ? 100 : Math.floor(value);
  ui.loadingProgress.style.width = `${value.toFixed(2)}%`;
  ui.loadingProgressText.textContent = complete ? "100% · concluído" : `${displayed}% · processando…`;
  ui.loadingProgress.parentElement?.setAttribute("aria-valuenow", String(displayed));
}

function updateBaseTimestamp(value) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) {
    ui.baseUpdateBadge.classList.add("is-hidden");
    return;
  }
  const formatted = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(timestamp));
  ui.baseUpdateBadge.textContent = `Base atualizada em ${formatted}`;
  ui.baseUpdateBadge.classList.remove("is-hidden");
}

function showError(title, message) {
  stopLoadingProgressPulse();
  state.worker?.terminate();
  state.worker = null;
  ui.loadingPanel.classList.remove("is-hidden");
  ui.loadingPanel.classList.add("has-error");
  ui.loadingPanel.setAttribute("aria-busy", "false");
  ui.loadingTitle.textContent = title;
  ui.loadingMessage.textContent = `${message || "Erro desconhecido"} Abra o catálogo pelo GitHub Pages ou por um servidor web.`;
  ui.loadingProgressText.textContent = `${Math.floor(state.loadingProgressValue)}% · carregamento interrompido`;
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
    item.requesters = [...new Set((item.history || [])
      .map((record) => String(record.sc?.requesterName || "").trim())
      .filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
    item.searchText = normalizeSearch([
      item.code,
      item.name,
      item.detailedName,
      ...(item.categories || []),
      ...(item.suppliers || []),
      ...(item.replenishmentResponsibles || []),
      ...(item.units || []),
      ...(item.history || []).flatMap((record) => [
        record.sc?.code, record.sc?.status, record.sc?.requesterName,
        record.of?.code, record.of?.status, record.of?.supplier, record.of?.supplierEmail,
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
  const requesters = new Set();
  const replenishmentResponsibles = new Set();
  const directPurchaseItems = new Map();

  for (const item of state.items) {
    if (item.flags.inactiveOnly) continue;
    for (const category of item.categories || []) if (category) categories.add(category);
    for (const unit of item.units || []) if (unit) units.add(unit);
    for (const supplier of item.suppliers || []) if (supplier) suppliers.add(supplier);
    for (const requester of item.requesters || []) if (requester) requesters.add(requester);
    for (const responsible of item.replenishmentResponsibles || []) if (responsible) replenishmentResponsibles.add(responsible);
    if (itemIsWarehouseStockItem(item) && (item.history || []).some((record) => record.sc?.code && !isWarehouseSc(record.sc))) {
      directPurchaseItems.set(item.code, [item.code, item.name].filter(Boolean).join(" · "));
    }

    for (const position of item.positions || []) {
      if (position.branchCode) {
        branches.set(position.branchKey, [position.branchCode, position.branchName].filter(Boolean).join(" · "));
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
  fillSelect(ui.replenishmentResponsibleFilter, [...replenishmentResponsibles].map((value) => [value, value]), "Todos os responsáveis");
  fillSelect(ui.categoryFilter, [...categories].map((value) => [value, value]), "Todas as categorias");
  fillSelect(ui.unitFilter, [...units].map((value) => [value, value]), "Todas as unidades");
  fillSelect(ui.supplierFilter, [...suppliers].map((value) => [value, value]), "Todos os fornecedores");
  fillSelect(ui.requesterFilter, [...requesters].map((value) => [value, value]), "Todos os solicitantes");
  fillSelect(ui.itemCodeFilter, [...directPurchaseItems], "Todos os códigos");
}

function updateLocationFilter(select, branchKey) {
  const currentValue = select.value;
  const locations = new Map();

  for (const item of state.items) {
    for (const position of item.positions || []) {
      if (!positionMatchesBranch(position, branchKey)) continue;
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
    ["replenishmentResponsibleFilter", ui.replenishmentResponsibleFilter, "Todos os responsáveis"],
    ["categoryFilter", ui.categoryFilter, "Todas as categorias"],
    ["unitFilter", ui.unitFilter, "Todas as unidades"],
    ["supplierFilter", ui.supplierFilter, "Todos os fornecedores"],
    ["requesterFilter", ui.requesterFilter, "Todos os solicitantes"],
    ["itemCodeFilter", ui.itemCodeFilter, "Todos os códigos"],
  ];

  for (let pass = 0; pass < 2; pass += 1) {
    let invalidatedSelection = false;
    for (const [filterId, select, firstLabel] of definitions) {
      if (filterId === changedId) continue;
      const currentValue = select.value;
      const entries = collectDependentOptions(filterId);
      invalidatedSelection = updateDependentSelect(select, entries, firstLabel, currentValue) || invalidatedSelection;
    }
    const statusInvalidated = refreshStatusAvailability(changedId);
    if (!invalidatedSelection && !statusInvalidated) break;
  }
}

function updateDependentSelect(select, entries, firstLabel, currentValue) {
  const sorted = entries
    .filter(([value]) => value)
    .sort((a, b) => a[1].localeCompare(b[1], "pt-BR", { numeric: true, sensitivity: "base" }));
  const signature = JSON.stringify(sorted);
  const remainsValid = !currentValue || sorted.some(([value]) => value === currentValue);

  if (state.filterOptionSignatures.get(select) !== signature) {
    select.replaceChildren(new Option(firstLabel, ""));
    const fragment = document.createDocumentFragment();
    for (const [value, label] of sorted) fragment.append(new Option(label, value));
    select.append(fragment);
    state.filterOptionSignatures.set(select, signature);
  }

  select.value = remainsValid ? currentValue : "";
  return Boolean(currentValue) && !remainsValid;
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
    if (targetFilterId === "requesterFilter") {
      for (const value of item.requesters || []) if (value) options.set(value, value);
      continue;
    }
    if (targetFilterId === "itemCodeFilter") {
      if (itemIsWarehouseStockItem(item) && (item.history || []).some((record) => record.sc?.code && !isWarehouseSc(record.sc))) {
        options.set(item.code, [item.code, item.name].filter(Boolean).join(" · "));
      }
      continue;
    }

    if (targetFilterId === "replenishmentResponsibleFilter") {
      const status = ui.stockStatusFilter.value;
      const positions = draftPositions(item, targetFilterId)
        .filter((position) => !status || status === "adjust-location" || positionMatchesStatus(position, status));
      for (const position of positions) {
        for (const value of position.replenishmentResponsibles || []) if (value) options.set(value, value);
      }
      continue;
    }

    const status = ui.stockStatusFilter.value;
    const positions = draftPositions(item, targetFilterId)
      .filter((position) => !status || positionMatchesStatus(position, status));
    for (const position of positions) {
      if (targetFilterId === "branchFilter" && position.branchCode) {
        options.set(position.branchKey, [position.branchCode, position.branchName].filter(Boolean).join(" · "));
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
  const replenishmentResponsible = excludedFilterId === "replenishmentResponsibleFilter" ? "" : ui.replenishmentResponsibleFilter.value;
  const category = excludedFilterId === "categoryFilter" ? "" : ui.categoryFilter.value;
  const unit = excludedFilterId === "unitFilter" ? "" : ui.unitFilter.value;
  const supplier = excludedFilterId === "supplierFilter" ? "" : ui.supplierFilter.value;
  const requester = excludedFilterId === "requesterFilter" ? "" : ui.requesterFilter.value;
  const ccuClassification = excludedFilterId === "ccuClassificationFilter" ? "" : ui.ccuClassificationFilter.value;
  const itemCode = excludedFilterId === "itemCodeFilter" ? "" : ui.itemCodeFilter.value;
  const status = statusOverride ?? (excludedFilterId === "stockStatusFilter" ? "" : ui.stockStatusFilter.value);
  const scStatus = excludedFilterId === "scStatusFilter" ? "" : ui.scStatusFilter.value;
  const positiveOnly = ui.positiveBalanceFilter.checked;

  if (item.flags.inactiveOnly) return false;

  if (query && !item.searchText.includes(query)) return false;
  if (itemCode && item.code !== itemCode) return false;
  if (ccuClassification && !itemMatchesCcuClassification(item, ccuClassification)) return false;
  if (category && !(item.categories || []).includes(category)) return false;
  if (unit && !(item.units || []).includes(unit)) return false;
  if (supplier && !(item.suppliers || []).includes(supplier)) return false;
  if (requester && !itemMatchesRequester(item, requester)) return false;
  if (scStatus && !itemMatchesProcurementStatus(item, scStatus, branchCodeFromFilter(branch), requester)) return false;

  const positions = (item.positions || []).filter((position) => {
    if (!positionMatchesBranch(position, branch)) return false;
    if (location && position.locationKey !== location) return false;
    if (!positionMatchesReplenishmentResponsible(position, replenishmentResponsible)) return false;
    return true;
  });
  if ((branch || location || replenishmentResponsible || status || positiveOnly) && !positions.length) return false;
  if (status === "adjust-location" && !itemNeedsLocationAdjustment(item, branch, location)) return false;
  if (status && status !== "adjust-location" && !positions.some((position) => positionMatchesStatus(position, status))) return false;
  if (positiveOnly && positions.reduce((sum, position) => sum + position.quantity, 0) <= 0) return false;
  return true;
}

function draftPositions(item, excludedFilterId) {
  const branch = excludedFilterId === "branchFilter" ? "" : ui.branchFilter.value;
  const location = excludedFilterId === "locationFilter" ? "" : ui.locationFilter.value;
  const replenishmentResponsible = excludedFilterId === "replenishmentResponsibleFilter" ? "" : ui.replenishmentResponsibleFilter.value;
  return (item.positions || []).filter((position) => {
    if (!positionMatchesBranch(position, branch)) return false;
    if (location && position.locationKey !== location) return false;
    if (!positionMatchesReplenishmentResponsible(position, replenishmentResponsible)) return false;
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
  state.filterOptionSignatures.delete(select);
}

function clearFilters() {
  ui.searchInput.value = "";
  ui.branchFilter.value = "";
  ui.locationFilter.value = "";
  ui.replenishmentResponsibleFilter.value = "";
  ui.categoryFilter.value = "";
  ui.unitFilter.value = "";
  ui.supplierFilter.value = "";
  ui.requesterFilter.value = "";
  ui.ccuClassificationFilter.value = "";
  ui.itemCodeFilter.value = "";
  ui.stockStatusFilter.value = "";
  ui.scStatusFilter.value = "";
  ui.positiveBalanceFilter.checked = false;
  populateFilters();
  for (const option of ui.stockStatusFilter.options) option.disabled = false;
}

function applyFilters(renderCatalog = true) {
  const query = normalizeSearch(ui.searchInput.value);
  const branch = ui.branchFilter.value;
  const location = ui.locationFilter.value;
  const replenishmentResponsible = ui.replenishmentResponsibleFilter.value;
  const category = ui.categoryFilter.value;
  const unit = ui.unitFilter.value;
  const supplier = ui.supplierFilter.value;
  const requester = ui.requesterFilter.value;
  const ccuClassification = ui.ccuClassificationFilter.value;
  const itemCode = ui.itemCodeFilter.value;
  const stockStatus = ui.stockStatusFilter.value;
  const scStatus = ui.scStatusFilter.value;
  const positiveOnly = ui.positiveBalanceFilter.checked;

  state.filteredItems = state.items.filter((item) => {
    if (item.flags.inactiveOnly) return false;
    if (query && !item.searchText.includes(query)) return false;
    if (itemCode && item.code !== itemCode) return false;
    if (ccuClassification && !itemMatchesCcuClassification(item, ccuClassification)) return false;
    const matchingPositions = (item.positions || []).filter((position) => {
      if (!positionMatchesBranch(position, branch)) return false;
      if (location && position.locationKey !== location) return false;
      if (!positionMatchesReplenishmentResponsible(position, replenishmentResponsible)) return false;
      return true;
    });
    if ((branch || location || replenishmentResponsible) && !matchingPositions.length) return false;
    if (stockStatus === "adjust-location" && !itemNeedsLocationAdjustment(item, branch, location)) return false;
    if (stockStatus && stockStatus !== "adjust-location" && !matchingPositions.some((position) => positionMatchesStatus(position, stockStatus))) return false;
    if (category && !(item.categories || []).includes(category)) return false;
    if (unit && !(item.units || []).includes(unit)) return false;
    if (supplier && !(item.suppliers || []).includes(supplier)) return false;
    if (requester && !itemMatchesRequester(item, requester)) return false;
    if (scStatus && !itemMatchesProcurementStatus(item, scStatus, branchCodeFromFilter(branch), requester)) return false;
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
  if (!renderCatalog) return;
  renderCatalogResults();
}

function renderCatalogResults() {
  state.renderedCount = 0;
  ui.cardsGrid.replaceChildren();
  renderNextBatch();
  state.pageRenderRevision.set("catalogo", state.filterRevision);
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

function procurementRecordStatus(record) {
  const sc = record?.sc;
  const of = record?.of;
  if (!sc?.code || !isActiveScForPurchaseCoverage(sc)) return "";
  if (of?.code && isClosedOf(of)) return "";
  const outstanding = Boolean(of?.code && (of.balance > 0 || (of.requestedQuantity > 0 && of.deliveredQuantity < of.requestedQuantity)));
  const dueDate = of?.code ? of.deliveryDate : sc.deliveryDate;
  if ((!of?.code || outstanding) && isOverdue(dueDate)) return "overdue";
  if (!of?.code) return "awaiting-of";
  if (!outstanding) return "";
  if (of.deliveredQuantity > 0) return "partial";
  return "awaiting-delivery";
}

function itemMatchesProcurementStatus(item, status, branch = "", requester = "") {
  if (!status) return true;
  return (item.history || []).some((record) => {
    if (branch && record.branchCode !== branch) return false;
    if (!recordMatchesRequester(record, requester)) return false;
    return procurementRecordStatus(record) === status;
  });
}

function itemNeedsLocationAdjustment(item, branch = "", location = "") {
  const positions = (item.positions || []).filter((position) => positionMatchesBranch(position, branch));
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
  const replenishmentResponsible = ui.replenishmentResponsibleFilter.value;
  const status = includeStatus ? ui.stockStatusFilter.value : "";
  return (item.positions || []).filter((position) => {
    if (!positionMatchesBranch(position, branch)) return false;
    if (location && position.locationKey !== location) return false;
    if (!positionMatchesReplenishmentResponsible(position, replenishmentResponsible)) return false;
    if (status && status !== "adjust-location" && !positionMatchesStatus(position, status)) return false;
    return true;
  });
}

function strictOpenOfRecords() {
  const branch = effectiveBranchFilter();
  const supplier = ui.supplierFilter.value;
  const requester = ui.requesterFilter.value;
  const query = normalizeSearch(ui.searchInput.value);
  const scStatus = ui.scStatusFilter.value;
  const rows = new Map();
  for (const item of state.filteredItems) {
    for (const record of item.history || []) {
      const of = record.of;
      if (!isOpenOfForPurchase(of)) continue;
      if (!recordMatchesCcuClassification(record, item, ui.ccuClassificationFilter.value)) continue;
      if (!recordMatchesRequester(record, requester)) continue;
      if (branch && record.branchCode !== branch) continue;
      if (scStatus && procurementRecordStatus(record) !== scStatus) continue;
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
    if (itemBalance !== 0) {
      codesWithStock.add(item.code);
    }
    if (positions.some((position) => positionMatchesStatus(position, "zero"))) {
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
  ui.metricReconciliation.textContent = `${integerFormatter.format(scopedItems.size)} códigos ativos · ${integerFormatter.format(codesWithStock.size)} com saldo consolidado diferente de zero · ${integerFormatter.format(zeroCodes.size)} com posição zerada parametrizada${dateAnomalies ? ` · Atenção: ${pluralize(dateAnomalies, "data futura atípica", "datas futuras atípicas")}` : ""}`;
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
      if (!branchData.has(position.branchKey)) branchData.set(position.branchKey, { label: [position.branchCode, position.branchName].filter(Boolean).join(" · "), codes: new Set(), value: 0 });
      const entry = branchData.get(position.branchKey);
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
  const counts = procurementFunnelCounts(collectProcurementRows(false));
  const max = Math.max(1, counts.sc, counts.of, counts.rec);
  ui.procurementFunnel.innerHTML = [
    ["SC", "Solicitações", counts.sc, "var(--violet)"],
    ["OF", "Ordens de fornecimento", counts.of, "var(--blue-600)"],
    ["REC", "Recebimentos", counts.rec, "var(--green)"],
  ].map(([prefix, label, count, color]) => `<button type="button" data-page-link="consulta-sc-of" style="--funnel-color:${color};--funnel-width:${Math.max(18, count / max * 100)}%"><span>${prefix}</span><strong>${integerFormatter.format(count)}</strong><small>${label}</small><i></i></button>`).join("");
}

function procurementFunnelCounts(rows) {
  const sc = new Set();
  const of = new Set();
  const rec = new Set();
  for (const { record } of rows) {
    if (record.sc?.code) sc.add(record.sc.code);
    if (record.of?.code) of.add(record.of.code);
    if (record.rec?.invoice) rec.add(`${record.rec.invoice}::${record.rec.series || ""}`);
  }
  return { sc: sc.size, of: of.size, rec: rec.size };
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
    const commitmentsByBranch = getItemPurchaseCommitments(item);
    for (const position of item.positions || []) {
      if (!(position.minimum > 0 && position.quantity < position.minimum)) continue;
      const target = position.maximum > 0 ? position.maximum : position.minimum;
      const grossSuggested = Math.max(target - position.quantity, 0);
      const coverage = allocatePurchaseCoverage(commitmentsByBranch.get(position.branchCode), grossSuggested);
      const netSuggested = Math.max(grossSuggested - coverage.total, 0);
      if (netSuggested <= 0) continue;
      const referencePrice = position.unitCost || latestPurchasePrice(item) || 0;
      needs.push({
        item,
        position,
        target,
        suggested: grossSuggested,
        openOfBalance: coverage.ofQuantity,
        pendingScQuantity: coverage.scQuantity,
        coveredQuantity: coverage.total,
        ofCodes: coverage.ofCodes,
        scCodes: coverage.scCodes,
        coverageSource: coverage.ofQuantity > 0 && coverage.scQuantity > 0 ? "OF + SC"
          : coverage.ofQuantity > 0 ? "OF"
            : coverage.scQuantity > 0 ? "SC" : "Sem cobertura",
        netSuggested,
        referencePrice,
        estimatedValue: netSuggested * referencePrice,
        rupture: position.quantity <= 0,
      });
    }

    const cavacoOrders = new Map();
    if (isCavacoItem(item)) {
      for (const record of item.history || []) {
        const of = record.of;
        if (!isCavacoOfAlert(item, of)) continue;
        const key = `${item.code}::${of.code}`;
        const previous = cavacoOrders.get(key);
        if (!previous || (record.sortKey || 0) > (previous.sortKey || 0)) cavacoOrders.set(key, record);
      }
    }

    for (const record of cavacoOrders.values()) {
      const of = record.of;
      const position = (item.positions || []).find((entry) => entry.branchCode === record.branchCode)
        || createCavacoAlertPosition(record);
      const netSuggested = Math.max(CAVACO_OF_THRESHOLD - of.balance, 0);
      const referencePrice = [of.unitValue, latestPurchasePrice(item), position.unitCost].find((value) => value > 0) || 0;
      needs.push({
        item,
        position,
        target: CAVACO_OF_THRESHOLD,
        suggested: netSuggested,
        openOfBalance: of.balance,
        pendingScQuantity: 0,
        coveredQuantity: 0,
        ofCodes: [of.code],
        scCodes: record.sc?.code ? [record.sc.code] : [],
        coverageSource: "Alerta especial de Cavaco",
        netSuggested,
        referencePrice,
        estimatedValue: netSuggested * referencePrice,
        rupture: false,
        cavacoAlert: true,
        cavacoThreshold: CAVACO_OF_THRESHOLD,
        cavacoOfBalance: of.balance,
        cavacoSupplier: of.supplier || "Não informado",
        record,
      });
    }
  }

  state.purchaseNeeds = needs.sort((a, b) => {
    if (a.cavacoAlert !== b.cavacoAlert) return a.cavacoAlert ? -1 : 1;
    if (a.cavacoAlert && b.cavacoAlert && a.cavacoOfBalance !== b.cavacoOfBalance) return a.cavacoOfBalance - b.cavacoOfBalance;
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

function isCavacoItem(item) {
  return normalizeSearch([item?.name, item?.detailedName].join(" ")).includes("cavaco");
}

function isCavacoOfAlert(item, of) {
  return isCavacoItem(item)
    && Boolean(of?.code)
    && isOpenOfForPurchase(of)
    && Number.isFinite(of.balance)
    && of.balance < CAVACO_OF_THRESHOLD;
}

function createCavacoAlertPosition(record) {
  const branchCode = record.branchCode || "";
  const branchName = record.branch || "Filial não informada";
  return {
    branchCode,
    branchName,
    branchKey: `${branchCode}::branch::${branchName}`,
    localCode: "",
    localName: "",
    locationKey: "",
    localType: "",
    quantity: 0,
    minimum: null,
    maximum: null,
    unitCost: 0,
    stockValue: 0,
    forecast: null,
    shelf: "",
    partition: "",
    division: "",
  };
}

function latestPurchasePrice(item) {
  return latestPurchasePriceFromRecords(item.history || []);
}

function latestPurchasePriceFromRecords(records) {
  for (const record of records || []) {
    const value = firstDefined(record.rec?.unitValue, record.of?.unitValue);
    if (value > 0) return value;
  }
  return 0;
}

function getItemPurchaseCommitments(item) {
  const orders = new Map();
  const requests = new Map();
  for (const record of item.history || []) {
    if (!isWarehouseSc(record.sc)) continue;
    const branchCode = record.branchCode || "";
    if (isOpenOfForPurchase(record.of)) {
      const orderKey = `${record.of.code}::${branchCode}`;
      const existing = orders.get(orderKey) || {
        code: record.of.code,
        branchCode,
        lineBalances: new Map(),
      };
      const lineKey = purchaseCommitmentLineKey(record);
      const previousBalance = existing.lineBalances.get(lineKey) || 0;
      existing.lineBalances.set(lineKey, Math.max(previousBalance, record.of.balance));
      orders.set(orderKey, existing);
    }
    if (record.sc?.code) {
      const requestKey = `${record.sc.code}::${branchCode}`;
      const existing = requests.get(requestKey) || {
        code: record.sc.code,
        branchCode,
        status: record.sc.status,
        cancelled: record.sc.cancelled,
        lines: new Map(),
      };
      const lineKey = purchaseCommitmentLineKey(record);
      const line = existing.lines.get(lineKey) || { quantity: 0, hasOf: false };
      line.quantity = Math.max(line.quantity, record.sc.quantity || 0);
      line.hasOf ||= Boolean(record.of?.code);
      existing.lines.set(lineKey, line);
      existing.branchCode ||= branchCode;
      existing.status ||= record.sc.status;
      existing.cancelled ||= record.sc.cancelled;
      requests.set(requestKey, existing);
    }
  }
  const byBranch = new Map();
  const ensureBranch = (branchCode) => {
    if (!byBranch.has(branchCode)) byBranch.set(branchCode, { ofs: [], scs: [] });
    return byBranch.get(branchCode);
  };
  for (const order of orders.values()) {
    const quantity = [...order.lineBalances.values()].reduce((sum, balance) => sum + balance, 0);
    ensureBranch(order.branchCode).ofs.push({
      code: order.code,
      branchCode: order.branchCode,
      quantity,
      remaining: quantity,
    });
  }
  for (const request of requests.values()) {
    if (!isActiveScForPurchaseCoverage(request)) continue;
    const quantity = [...request.lines.values()]
      .filter((line) => !line.hasOf)
      .reduce((sum, line) => sum + line.quantity, 0);
    if (!(quantity > 0)) continue;
    ensureBranch(request.branchCode).scs.push({
      code: request.code,
      branchCode: request.branchCode,
      quantity,
      remaining: quantity,
    });
  }
  return byBranch;
}

function purchaseCommitmentLineKey(record) {
  const scCode = normalizeSearch(record.sc?.code) || "sem-sc";
  const sequence = normalizeSearch(record.sc?.sequence);
  if (sequence) return `${scCode}::seq:${sequence}`;
  const deliveryDate = normalizeSearch(record.of?.deliveryDate || record.sc?.deliveryDate);
  return `${scCode}::data:${deliveryDate || "sem-data"}`;
}

function isActiveScForPurchaseCoverage(sc) {
  if (["s", "sim", "1", "true"].includes(normalizeSearch(sc.cancelled))) return false;
  const status = normalizeSearch(sc.status);
  return !/(cancelad|reprovad|exclu[ií]d|encerrad)/.test(status);
}

function isWarehouseSc(sc) {
  return /^0*1500(?:[.,]0+)?$/.test(String(sc?.allocationCostCenter || "").trim());
}

function itemIsWarehouseStockItem(item) {
  return (item.positions || []).some((position) => (
    position.quantity > 0
    || (position.minimum ?? 0) > 0
    || (position.maximum ?? 0) > 0
  ));
}

function itemHasWarehouseStock(item) {
  return itemIsWarehouseStockItem(item);
}

function recordMatchesCcuClassification(record, item, classification) {
  if (!classification) return true;
  if (!record?.sc?.code) return false;
  if (classification === "warehouse") return isWarehouseSc(record.sc);
  const direct = !isWarehouseSc(record.sc);
  if (classification === "direct") return direct;
  if (classification === "direct-with-stock") return direct && itemIsWarehouseStockItem(item);
  return true;
}

function itemMatchesCcuClassification(item, classification) {
  return (item.history || []).some((record) => recordMatchesCcuClassification(record, item, classification));
}

function purchaseClassificationLabel(sc) {
  return isWarehouseSc(sc) ? "Entrada no almoxarifado · CCU 1500" : "Direto para a área · CCU diferente de 1500";
}

function isClosedOf(of) {
  if (!of) return false;
  const status = normalizeSearch(of.status);
  const closedFlag = normalizeSearch(of.closed);
  return /(fechad|encerrad|closed)/.test(status) || ["s", "sim", "1", "true"].includes(closedFlag);
}

function isOpenOfForPurchase(of) {
  return Boolean(of?.code && of.balance > 0 && !isClosedOf(of));
}

function branchCodeFromFilter(value) {
  return String(value || "").split("::branch::")[0];
}

function positionMatchesBranch(position, selectedBranch) {
  if (!selectedBranch) return true;
  if (String(selectedBranch).includes("::branch::")) return position.branchKey === selectedBranch;
  return position.branchCode === selectedBranch;
}

function positionMatchesReplenishmentResponsible(position, selectedResponsible) {
  if (!selectedResponsible) return true;
  const normalized = normalizeSearch(selectedResponsible);
  return (position.replenishmentResponsibles || []).some((value) => normalizeSearch(value) === normalized);
}

function replenishmentResponsiblesForPositions(positions) {
  return unique((positions || []).flatMap((position) => position.replenishmentResponsibles || []));
}

function scopedReplenishmentResponsibles(item) {
  return replenishmentResponsiblesForPositions(currentScopedPositions(item, false));
}

function replenishmentResponsiblesForItemCodes(itemCodes) {
  return unique((itemCodes || []).flatMap((code) => {
    const item = state.itemByCode.get(code);
    return item ? scopedReplenishmentResponsibles(item) : [];
  }));
}

function allocatePurchaseCoverage(pool, grossSuggested) {
  let remainingNeed = grossSuggested;
  const result = { ofQuantity: 0, scQuantity: 0, total: 0, ofCodes: [], scCodes: [] };
  if (!pool || !(remainingNeed > 0)) return result;
  const allocate = (records, type) => {
    for (const record of records) {
      if (!(remainingNeed > 0)) break;
      const used = Math.min(record.remaining || 0, remainingNeed);
      if (!(used > 0)) continue;
      record.remaining -= used;
      remainingNeed -= used;
      result.total += used;
      if (type === "of") {
        result.ofQuantity += used;
        result.ofCodes.push(record.code);
      } else {
        result.scQuantity += used;
        result.scCodes.push(record.code);
      }
    }
  };
  allocate(pool.ofs, "of");
  allocate(pool.scs, "sc");
  result.ofCodes = unique(result.ofCodes);
  result.scCodes = unique(result.scCodes);
  return result;
}

function renderPendingScList() {
  const rows = collectPendingScRows().sort((a, b) => {
    const dateOrder = dateTimestamp(a.sc.date) - dateTimestamp(b.sc.date);
    return dateOrder || a.sc.code.localeCompare(b.sc.code, "pt-BR", { numeric: true });
  });
  const uniqueSc = new Set(rows.map(({ sc }) => sc.code));
  state.pendingScRows = rows;
  state.pendingScVisible = 0;
  state.pendingScByKey.clear();
  rows.forEach((row, index) => {
    row.key = `pending-sc-${index}`;
    state.pendingScByKey.set(row.key, row);
  });
  ui.pendingScListCount.textContent = `${pluralize(uniqueSc.size, "SC", "SCs")} · ${pluralize(rows.length, "item", "itens")}`;

  if (!rows.length) {
    ui.pendingScTableWrap.innerHTML = `<div class="table-empty">Nenhuma SC sem OF corresponde aos filtros aplicados.</div>`;
    ui.pendingScLoadMore.classList.add("is-hidden");
    ui.pendingScVisibleCount.textContent = "";
    return;
  }
  ui.pendingScTableWrap.replaceChildren();
  renderNextPendingScBatch();
}

function renderNextPendingScBatch() {
  const start = state.pendingScVisible;
  const end = Math.min(start + CONFIG.reportBatch, state.pendingScRows.length);
  if (start >= end) return;
  ui.pendingScTableWrap.insertAdjacentHTML("beforeend", state.pendingScRows.slice(start, end).map(({ item, record, sc, key }) => `<button class="report-card report-card--sc" type="button" data-pending-sc-key="${escapeHtml(key)}">
    <span class="report-card__top"><span class="status-pill ${isOverdue(sc.deliveryDate) ? "status-pill--critical" : "status-pill--pending"}">SC ${escapeHtml(sc.code)}</span><span>${escapeHtml(ageLabel(sc.date))}</span></span>
    <strong class="report-card__title">${escapeHtml(item.name)}</strong>
    <span class="report-card__code">Código ${escapeHtml(item.code)}</span>
    <span class="item-card__address">${escapeHtml(formatItemAddress(item, record.branchCode))}</span>
    <span class="item-card__address">Reposição: ${escapeHtml(scopedReplenishmentResponsibles(item).join(", ") || "Não informada")}</span>
    <span class="report-card__meta"><span><small>Solicitante</small><strong>${escapeHtml(sc.requesterName || "—")}</strong></span><span><small>Quantidade</small><strong>${formatOptionalNumber(sc.quantity)}</strong></span></span>
    <span class="report-card__footer"><span>${escapeHtml(formatDate(sc.deliveryDate, "Entrega não informada"))}${isOverdue(sc.deliveryDate) ? " · atrasada" : ""}</span><strong>${sc.estimatedValue == null ? "—" : currencyFormatter.format(sc.estimatedValue)}</strong></span>
  </button>`).join(""));
  state.pendingScVisible = end;
  ui.pendingScVisibleCount.textContent = `Exibindo ${integerFormatter.format(end)} de ${integerFormatter.format(state.pendingScRows.length)} solicitações`;
  ui.pendingScLoadMore.classList.toggle("is-hidden", end >= state.pendingScRows.length);
}

function collectPendingScRows() {
  const rowsByKey = new Map();
  const branch = effectiveBranchFilter();
  const query = normalizeSearch(ui.searchInput.value);
  const category = ui.categoryFilter.value;
  const unit = ui.unitFilter.value;
  const supplier = ui.supplierFilter.value;
  const requester = ui.requesterFilter.value;
  const stockStatus = ui.stockStatusFilter.value;
  const scStatus = ui.scStatusFilter.value;
  const ccuClassification = ui.ccuClassificationFilter.value;
  const itemCode = ui.itemCodeFilter.value;
  const positiveOnly = ui.positiveBalanceFilter.checked;
  const replenishmentResponsible = ui.replenishmentResponsibleFilter.value;
  for (const item of state.items) {
    if (itemCode && item.code !== itemCode) continue;
    if (ccuClassification && !itemMatchesCcuClassification(item, ccuClassification)) continue;
    if (query && !item.searchText.includes(query)) continue;
    if (category && !(item.categories || []).includes(category)) continue;
    if (unit && !(item.units || []).includes(unit)) continue;
    if (supplier && !(item.suppliers || []).includes(supplier)) continue;
    if (requester && !itemMatchesRequester(item, requester)) continue;
    if (stockStatus || positiveOnly || ui.locationFilter.value || replenishmentResponsible) {
      const positions = (item.positions || []).filter((position) => {
        if (!positionMatchesBranch(position, ui.branchFilter.value || branch)) return false;
        if (ui.locationFilter.value && position.locationKey !== ui.locationFilter.value) return false;
        if (!positionMatchesReplenishmentResponsible(position, replenishmentResponsible)) return false;
        return true;
      });
      if (!positions.length) continue;
      if (stockStatus === "adjust-location" && !itemNeedsLocationAdjustment(item, ui.branchFilter.value || branch, ui.locationFilter.value)) continue;
      if (stockStatus && stockStatus !== "adjust-location" && !positions.some((position) => positionMatchesStatus(position, stockStatus))) continue;
      if (positiveOnly && positions.reduce((sum, position) => sum + position.quantity, 0) <= 0) continue;
    }
    const pendingCodes = new Set(item.pendingScCodes || []);
    for (const record of item.history || []) {
      const sc = record.sc;
      if (!sc?.code || !pendingCodes.has(sc.code) || record.of?.code) continue;
      if (!recordMatchesCcuClassification(record, item, ccuClassification)) continue;
      if (!recordMatchesRequester(record, requester)) continue;
      if (branch && record.branchCode !== branch) continue;
      if (scStatus && procurementRecordStatus(record) !== scStatus) continue;
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
  const replenishmentResponsible = ui.replenishmentResponsibleFilter.value;
  const stockStatus = ui.stockStatusFilter.value;
  const filteredCodes = new Set(state.filteredItems.map((item) => item.code));
  const visible = state.purchaseNeeds.filter((need) => {
    const { item, position } = need;
    if (!filteredCodes.has(item.code)) return false;
    if (!cavacoNeedMatchesProcessFilters(need)) return false;
    if (!positionMatchesBranch(position, branch)) return false;
    if (location && position.locationKey !== location) return false;
    if (!positionMatchesReplenishmentResponsible(position, replenishmentResponsible)) return false;
    if (stockStatus && stockStatus !== "adjust-location" && !positionMatchesStatus(position, stockStatus)) return false;
    return true;
  });

  const itemCodes = new Set(visible.map(({ item }) => item.code));
  const withoutMaximum = visible.filter(({ position, cavacoAlert }) => !cavacoAlert && !(position.maximum > 0)).length;
  const ruptures = visible.filter(({ rupture }) => rupture).length;
  const estimatedValue = visible.reduce((sum, need) => sum + need.estimatedValue, 0);
  ui.purchaseNeedItems.textContent = integerFormatter.format(itemCodes.size);
  ui.purchaseNeedPositions.textContent = integerFormatter.format(visible.length);
  ui.purchaseNeedRuptures.textContent = integerFormatter.format(ruptures);
  ui.purchaseNeedEstimated.textContent = compactCurrencyFormatter.format(estimatedValue);
  ui.purchaseNeedEstimated.title = currencyFormatter.format(estimatedValue);
  ui.purchaseNeedWithoutMax.textContent = integerFormatter.format(withoutMaximum);
  ui.purchaseNeedResultCount.textContent = `${pluralize(visible.length, "pendência", "pendências")} exibida${visible.length === 1 ? "" : "s"}`;
  state.visiblePurchaseNeeds = visible;
  state.purchaseNeedVisible = 0;

  if (!visible.length) {
    ui.purchaseNeedTableWrap.innerHTML = `<div class="table-empty">Nenhuma necessidade de compra corresponde à busca informada.</div>`;
    ui.purchaseNeedLoadMore.classList.add("is-hidden");
    ui.purchaseNeedVisibleCount.textContent = "";
    return;
  }
  ui.purchaseNeedTableWrap.replaceChildren();
  renderNextPurchaseNeedBatch();
}

function renderNextPurchaseNeedBatch() {
  const start = state.purchaseNeedVisible;
  const end = Math.min(start + CONFIG.reportBatch, state.visiblePurchaseNeeds.length);
  if (start >= end) return;
  ui.purchaseNeedTableWrap.insertAdjacentHTML("beforeend", state.visiblePurchaseNeeds.slice(start, end).map(({ item, position, netSuggested, coveredQuantity, coverageSource, ofCodes, scCodes, estimatedValue, rupture, key, cavacoAlert, cavacoThreshold, cavacoOfBalance, cavacoSupplier }) => `<button class="report-card report-card--need${rupture && netSuggested > 0 ? " is-critical" : ""}${cavacoAlert ? " is-cavaco-alert" : ""}" type="button" data-purchase-need-key="${escapeHtml(key)}">
    <span class="report-card__top"><span class="status-pill ${cavacoAlert ? "status-pill--cavaco" : netSuggested <= 0 ? "status-pill--success" : rupture ? "status-pill--critical" : "status-pill--need"}">${cavacoAlert ? "Cavaco · OF abaixo de 200" : netSuggested <= 0 ? "Compra já coberta" : rupture ? "Ruptura" : `Comprar ${numberFormatter.format(netSuggested)}`}</span><span>${escapeHtml((item.units || []).join(", ") || "—")}</span></span>
    <strong class="report-card__title">${escapeHtml(item.name)}</strong>
    <span class="report-card__code">Código ${escapeHtml(item.code)}</span>
    <span class="item-card__address">${escapeHtml(`Repartição ${position.partition || "—"} · Prateleira ${position.shelf || "—"} · Divisão ${position.division || "—"}`)}</span>
    <span class="item-card__address">Reposição: ${escapeHtml((position.replenishmentResponsibles || []).join(", ") || "Não informada")}</span>
    <span class="purchase-min-max"><span>Mín. cadastrado <strong>${formatOptionalNumber(position.minimum)}</strong></span><span>Máx. cadastrado <strong>${formatOptionalNumber(position.maximum)}</strong></span></span>
    ${cavacoAlert
      ? `<span class="report-card__meta"><span><small>OF</small><strong>${escapeHtml(ofCodes[0] || "—")}</strong></span><span><small>Saldo da OF</small><strong>${numberFormatter.format(cavacoOfBalance)}</strong></span><span><small>Déficit até ${numberFormatter.format(cavacoThreshold)}</small><strong>${numberFormatter.format(netSuggested)}</strong></span></span><span class="purchase-coverage-note cavaco-supplier-note"><strong>Fornecedor:</strong> ${escapeHtml(cavacoSupplier || "Não informado")}</span><span class="purchase-coverage-note cavaco-alert-note">Gatilho especial: iniciar reposição quando o saldo da OF de Cavaco ficar abaixo de ${numberFormatter.format(cavacoThreshold)}.</span>`
      : `<span class="report-card__meta"><span><small>Saldo</small><strong>${numberFormatter.format(position.quantity)}</strong></span><span><small>Coberto por ${escapeHtml(coverageSource)}</small><strong>${numberFormatter.format(coveredQuantity)}</strong></span><span><small>Compra líquida</small><strong>${numberFormatter.format(netSuggested)}</strong></span></span>${(ofCodes.length || scCodes.length) ? `<span class="purchase-coverage-note">${ofCodes.length ? `OF: ${escapeHtml(ofCodes.join(", "))}` : ""}${ofCodes.length && scCodes.length ? " · " : ""}${scCodes.length ? `SC: ${escapeHtml(scCodes.join(", "))}` : ""}</span>` : ""}`}
    <span class="report-card__footer"><span>${escapeHtml([position.branchCode, position.localCode].filter(Boolean).join(" · ") || "—")}</span><strong>${currencyFormatter.format(estimatedValue)}</strong></span>
  </button>`).join(""));
  state.purchaseNeedVisible = end;
  ui.purchaseNeedVisibleCount.textContent = `Exibindo ${integerFormatter.format(end)} de ${integerFormatter.format(state.visiblePurchaseNeeds.length)} necessidades`;
  ui.purchaseNeedLoadMore.classList.toggle("is-hidden", end >= state.visiblePurchaseNeeds.length);
}

function openPurchaseNeedModal(key) {
  const need = state.purchaseNeedByKey.get(key);
  if (!need) return;
  const { item, position, target, suggested, openOfBalance, pendingScQuantity, coveredQuantity, coverageSource, ofCodes, scCodes, netSuggested, referencePrice, estimatedValue, rupture, cavacoAlert, cavacoThreshold, cavacoOfBalance } = need;
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
    <article><span>${cavacoAlert ? "Saldo atual da OF" : "Saldo atual"}</span><strong>${numberFormatter.format(cavacoAlert ? cavacoOfBalance : position.quantity)}</strong></article>
    <article><span>Mínimo</span><strong>${formatOptionalNumber(position.minimum)}</strong></article>
    <article><span>Máximo</span><strong>${formatOptionalNumber(position.maximum)}</strong></article>
    <article><span>${cavacoAlert ? "Limite do alerta" : "Meta"}</span><strong>${numberFormatter.format(target)}</strong></article>
    <article><span>${cavacoAlert ? "Déficit até 200" : "Necessidade bruta"}</span><strong>${numberFormatter.format(suggested)}</strong></article>
    <article><span>Saldo em OF aberta · CCU 1500</span><strong>${numberFormatter.format(openOfBalance)}</strong></article>
    <article><span>SC sem OF · CCU 1500</span><strong>${numberFormatter.format(pendingScQuantity)}</strong></article>
    <article><span>Cobertura total</span><strong>${numberFormatter.format(coveredQuantity)}</strong></article>
    <article><span>Comprar líquido</span><strong>${numberFormatter.format(netSuggested)}</strong></article>
    <article><span>Valor estimado</span><strong>${currencyFormatter.format(estimatedValue)}</strong></article>`;
  renderOperationalInsights(ui.purchaseModalOperational, getOperationalInsight(item, position.branchCode, position));
  ui.purchaseModalDetails.innerHTML = `
    <div><dt>Unidade</dt><dd>${escapeHtml((item.units || []).join(", ") || "—")}</dd></div>
    <div><dt>Filial</dt><dd>${escapeHtml([position.branchCode, position.branchName].filter(Boolean).join(" · ") || "—")}</dd></div>
    <div><dt>Local</dt><dd>${escapeHtml([position.localCode, position.localName].filter(Boolean).join(" · ") || "—")}</dd></div>
    <div><dt>Repartição</dt><dd>${escapeHtml(position.partition || "—")}</dd></div>
    <div><dt>Prateleira</dt><dd>${escapeHtml(position.shelf || "—")}</dd></div>
    <div><dt>Divisão</dt><dd>${escapeHtml(position.division || "—")}</dd></div>
    <div><dt>Responsável pela reposição</dt><dd>${escapeHtml((position.replenishmentResponsibles || []).join(", ") || "Não informado")}</dd></div>
    <div><dt>Fornecedores relacionados</dt><dd>${escapeHtml((item.suppliers || []).join(", ") || "—")}</dd></div>
    <div><dt>Prioridade</dt><dd>${cavacoAlert ? "Especial — saldo da OF de Cavaco abaixo de 200" : rupture ? "Crítica — posição em ruptura" : "Atenção — saldo positivo abaixo do mínimo"}</dd></div>
    <div><dt>Preço de referência</dt><dd>${currencyFormatter.format(referencePrice)}</dd></div>
    <div><dt>Origem da cobertura</dt><dd>${escapeHtml(coverageSource)}</dd></div>
    <div><dt>OFs consideradas</dt><dd>${escapeHtml(ofCodes.length ? ofCodes.join(", ") : "Nenhuma")}</dd></div>
    <div><dt>SCs sem OF consideradas</dt><dd>${escapeHtml(scCodes.length ? scCodes.join(", ") : "Nenhuma")}</dd></div>
    <div><dt>Observação</dt><dd>${cavacoAlert ? `A OF ${escapeHtml(ofCodes[0] || "—")} possui saldo de ${numberFormatter.format(cavacoOfBalance)}, abaixo do gatilho operacional de ${numberFormatter.format(cavacoThreshold)}.` : coveredQuantity > 0 ? `A compra líquida já desconta ${numberFormatter.format(coveredQuantity)} unidade(s) coberta(s) por ${escapeHtml(coverageSource)} com CCU Etq 1500. SCs que já possuem OF não são contadas novamente.` : "Não existe OF aberta nem SC ativa sem OF com CCU Etq 1500 para descontar desta necessidade. Compras diretas para outros centros de custo não são consideradas."}</dd></div>
    <div><dt>Critério da sugestão</dt><dd>${cavacoAlert ? "Reposição especial pela diferença entre 200 e o saldo atual da OF" : position.maximum > 0 ? "Reposição até o máximo parametrizado" : "Máximo não informado; reposição até o mínimo"}</dd></div>`;

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
  ui.pendingScModalCode.textContent = `Solicitação de Compra · SC ${sc.code}`;
  ui.pendingScModalTitle.textContent = "Aguardando geração de OF";
  ui.pendingScModalSubtitle.textContent = `${item.name} · Item ${item.code} · ${record.branch || "Filial não informada"}`;
  ui.pendingScSubject.innerHTML = `<span class="status-pill ${isOverdue(sc.deliveryDate) ? "status-pill--critical" : "status-pill--pending"}">${isOverdue(sc.deliveryDate) ? "Entrega prevista vencida" : "Processo pendente"}</span><div><strong>SC ${escapeHtml(sc.code)} sem Ordem de Fornecimento</strong><small>Solicitada por ${escapeHtml(sc.requesterName || "usuário não informado")} em ${escapeHtml(formatDate(sc.date))}</small></div>`;
  ui.pendingScModalSummary.innerHTML = `
    <article><span>Quantidade</span><strong>${formatOptionalNumber(sc.quantity)}</strong></article>
    <article><span>Valor estimado</span><strong>${sc.estimatedValue == null ? "—" : currencyFormatter.format(sc.estimatedValue)}</strong></article>
    <article><span>Criação</span><strong>${escapeHtml(formatDate(sc.date))}</strong></article>
    <article><span>Entrega</span><strong>${escapeHtml(formatDate(sc.deliveryDate))}</strong></article>
    <article><span>Tempo aguardando</span><strong>${escapeHtml(ageLabel(sc.date))}</strong></article>`;
  renderOperationalInsights(ui.pendingScModalOperational, getOperationalInsight(item, record.branchCode));
  ui.pendingScModalDetails.innerHTML = `
    <div><dt>Situação</dt><dd>${escapeHtml(sc.status || "—")}</dd></div>
    <div><dt>Cancelada</dt><dd>${escapeHtml(sc.cancelled || "Não")}</dd></div>
    <div><dt>Categoria</dt><dd>${escapeHtml(sc.category || "—")}</dd></div>
    <div><dt>Motivo</dt><dd>${escapeHtml(sc.reason || "—")}</dd></div>
    <div><dt>Filial</dt><dd>${escapeHtml(record.branch || "—")}</dd></div>
    <div><dt>Empresa</dt><dd>${escapeHtml(sc.company || "—")}</dd></div>
    <div><dt>Usuário solicitante</dt><dd>${escapeHtml(sc.requesterName || "—")}</dd></div>
    <div><dt>Centro de custo aprovador</dt><dd>${escapeHtml(sc.costCenter || "—")}</dd></div>
    <div><dt>CCU da etiqueta</dt><dd>${escapeHtml(sc.allocationCostCenter || "—")}</dd></div>
    <div><dt>Classificação da compra</dt><dd>${escapeHtml(purchaseClassificationLabel(sc))}</dd></div>
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
  const replenishmentResponsible = ui.replenishmentResponsibleFilter.value;
  const stockStatus = ui.stockStatusFilter.value;
  const filteredCodes = new Set(state.filteredItems.map((item) => item.code));
  return state.purchaseNeeds.filter((need) => {
    const { item, position } = need;
    if (!filteredCodes.has(item.code)) return false;
    if (!cavacoNeedMatchesProcessFilters(need)) return false;
    if (!positionMatchesBranch(position, branch)) return false;
    if (location && position.locationKey !== location) return false;
    if (!positionMatchesReplenishmentResponsible(position, replenishmentResponsible)) return false;
    if (stockStatus && stockStatus !== "adjust-location" && !positionMatchesStatus(position, stockStatus)) return false;
    return true;
  });
}

function cavacoNeedMatchesProcessFilters(need) {
  if (!need.cavacoAlert) return true;
  const record = need.record;
  if (!recordMatchesRequester(record, ui.requesterFilter.value)) return false;
  if (ui.supplierFilter.value && normalizeSearch(record.of?.supplier) !== normalizeSearch(ui.supplierFilter.value)) return false;
  if (ui.scStatusFilter.value && procurementRecordStatus(record) !== ui.scStatusFilter.value) return false;
  if (ui.ccuClassificationFilter.value && !recordMatchesCcuClassification(record, need.item, ui.ccuClassificationFilter.value)) return false;
  const query = normalizeSearch(ui.searchInput.value);
  return !query || recordMatchesQuery(need.item, record, query);
}

function exportPurchaseNeeds(format = "excel") {
  const rows = getVisiblePurchaseNeeds().map(({ item, position, target, suggested, openOfBalance, pendingScQuantity, coveredQuantity, coverageSource, ofCodes, scCodes, netSuggested, referencePrice, estimatedValue, rupture, cavacoAlert, cavacoThreshold, cavacoOfBalance }) => [
    item.code, item.name, item.detailedName, (item.categories || []).join(" | "), (item.units || []).join(" | "),
    position.branchCode, position.branchName, position.localType, position.localCode, position.localName,
    position.shelf, position.division, position.quantity, position.minimum, position.maximum, target, suggested, openOfBalance,
    pendingScQuantity, coveredQuantity, coverageSource, ofCodes.join(" | "), scCodes.join(" | "), netSuggested,
    referencePrice, estimatedValue, cavacoAlert ? "Especial — saldo da OF de Cavaco abaixo de 200" : rupture && netSuggested > 0 ? "Ruptura" : netSuggested <= 0 ? "Compra já coberta" : "Abaixo do mínimo com saldo",
    position.forecast, position.unitCost, position.stockValue, (item.suppliers || []).join(" | "),
    cavacoAlert ? "Reposição especial por saldo de OF de Cavaco abaixo de 200" : position.maximum > 0 ? "Reposição até o máximo" : "Reposição até o mínimo",
    cavacoAlert ? "Alerta Cavaco" : "Estoque abaixo do mínimo", cavacoAlert ? ofCodes[0] : "", cavacoAlert ? cavacoThreshold : "", cavacoAlert ? cavacoOfBalance : "",
    (position.replenishmentResponsibles || []).join(" | "),
  ]);
  exportReport(format, {
    title: "Necessidade de Compra",
    filename: "necessidade-de-compra.xls",
    headers: ["Código", "Descrição", "Descrição detalhada", "Categorias", "Unidades", "Código filial", "Filial", "Tipo local", "Código local", "Local de estoque", "Prateleira", "Divisão", "Saldo atual", "Mínimo", "Máximo", "Meta", "Necessidade bruta", "Saldo coberto por OF aberta · CCU 1500", "Quantidade coberta por SC sem OF · CCU 1500", "Cobertura total", "Origem da cobertura", "Números das OFs", "Números das SCs sem OF", "Compra líquida", "Preço de referência", "Valor estimado da compra", "Prioridade", "Previsão de consumo", "Custo unitário", "Valor em estoque", "Fornecedores", "Critério", "Tipo de pendência", "OF Cavaco", "Limite Cavaco", "Saldo OF Cavaco", "Responsáveis pela reposição"],
    rows,
    numericColumns: new Set([12, 13, 14, 15, 16, 17, 18, 19, 23, 24, 25, 27, 28, 29, 34, 35]),
    currencyColumns: new Set([24, 25, 28, 29]),
  });
}

function exportPendingSc(format = "excel") {
  const sourceRows = pendingScRowsForExport(state.pendingScRows, format);
  const rows = sourceRows.map(({ item, record, sc }) => [
    sc.code, item.code, ageDays(sc.date), sc.status, sc.requesterName, sc.cancelled, sc.date, sc.deliveryDate, isOverdue(sc.deliveryDate) ? "Sim" : "Não", sc.quantity, sc.estimatedValue,
    sc.category, sc.reason, item.name, item.detailedName, (item.categories || []).join(" | "),
    (item.units || []).join(" | "), record.branch, sc.allocationCostCenter, purchaseClassificationLabel(sc), (item.suppliers || []).join(" | "), "", "Não gerada", scopedReplenishmentResponsibles(item).join(" | "),
  ]);
  exportReport(format, {
    title: format === "pdf" ? "SC pendente de OF há mais de 7 dias" : "SC pendente de OF",
    filename: format === "pdf" ? "sc-pendente-of-superior-7-dias.xls" : "sc-pendente-de-of.xls",
    headers: ["SC", "Código do item", "Dias aguardando OF", "Situação SC", "Usuário solicitante", "Cancelada", "Data de criação", "Data de entrega", "Entrega vencida", "Quantidade", "Valor estimado", "Categoria SC", "Motivo", "Descrição", "Descrição detalhada", "Categorias do item", "Unidades", "Filial", "SC - CCU Etq", "Classificação da compra", "Fornecedores relacionados", "Código OF", "Situação OF", "Responsáveis pela reposição"],
    rows,
    numericColumns: new Set([2, 9, 10]),
    currencyColumns: new Set([10]),
    dateColumns: new Set([6, 7]),
    pdfIdentityColumns: [0, 1, 2],
  });
}

function pendingScRowsForExport(rows, format) {
  if (format !== "pdf") return [...rows];
  return rows.filter(({ sc }) => {
    const pendingDays = ageDays(sc?.date);
    return pendingDays !== null && pendingDays > 7;
  });
}

function exportProcurement(format = "excel") {
  const rows = state.procurementRows.map(({ item, record }) => {
    const { sc, of, rec } = record;
    return [
      item.code, item.name, item.detailedName, record.branchCode, record.branch,
      sc?.code, sc?.status, sc?.date, sc?.deliveryDate, sc?.quantity, sc?.estimatedValue, sc?.category, sc?.reason, sc?.cancelled, sc?.company, sc?.requesterName, sc?.costCenter, sc?.stockLocation, sc?.allocationCostCenter, sc?.code ? purchaseClassificationLabel(sc) : "",
      of?.code, of?.status, of?.date, of?.deliveryDate, of?.supplierCode, of?.supplier, of?.supplierEmail, of?.requestedQuantity, of?.deliveredQuantity, of?.balance, of?.unitValue, of?.currency, of?.paymentTerms, of?.paymentMethod, of?.freight, of?.icms, of?.ipi, of?.closed, of?.blocked, of?.type, of?.carrier,
      rec?.invoice, rec?.series, rec?.issueDate, rec?.entryDate, rec?.supplierCode, rec?.supplier, rec?.quantity, rec?.unitValue, rec?.documentValue, rec?.currency, rec?.paymentTerms, rec?.paymentMethod, rec?.freight, rec?.icms, rec?.ipi,
      scopedReplenishmentResponsibles(item).join(" | "),
    ];
  });
  exportReport(format, {
    title: "Consulta SC OF e Recebimentos",
    filename: "consulta-sc-of-recebimentos.xls",
    headers: [
      "Código do item", "Descrição", "Descrição detalhada", "Código filial", "Filial",
      "SC - Código", "SC - Situação", "SC - Data de criação", "SC - Data de entrega", "SC - Quantidade", "SC - Valor estimado", "SC - Categoria", "SC - Motivo", "SC - Cancelada", "SC - Empresa", "SC - Usuário solicitante", "SC - Centro de custo", "SC - Local de estoque", "SC - CCU Etq", "Classificação da compra",
      "OF - Código", "OF - Situação", "OF - Data", "OF - Data de entrega", "OF - Código fornecedor", "OF - Fornecedor", "OF - E-mail do fornecedor", "OF - Quantidade solicitada", "OF - Quantidade entregue", "OF - Saldo", "OF - Valor unitário", "OF - Moeda", "OF - Condição de pagamento", "OF - Forma de pagamento", "OF - Frete", "OF - ICMS", "OF - IPI", "OF - Fechada", "OF - Bloqueada", "OF - Tipo", "OF - Transportador",
      "REC - Nota fiscal", "REC - Série", "REC - Data de emissão", "REC - Data de entrada", "REC - Código fornecedor", "REC - Fornecedor", "REC - Quantidade", "REC - Valor unitário", "REC - Valor do documento", "REC - Moeda", "REC - Condição de pagamento", "REC - Forma de pagamento", "REC - Frete", "REC - ICMS", "REC - IPI",
      "Responsáveis pela reposição",
    ],
    rows,
    numericColumns: new Set([9, 10, 27, 28, 29, 30, 34, 35, 36, 47, 48, 49, 53, 54, 55]),
    currencyColumns: new Set([10, 30, 48, 49]),
    dateColumns: new Set([7, 8, 22, 23, 43, 44]),
  });
}

function exportMinMaxReviews(format = "excel") {
  const rows = state.visibleMinMaxReviews.map((review) => {
    const { item, position } = review;
    const status = review.status === "ideal" ? "Parâmetros ideais"
      : review.status === "adjust" ? "Ajuste recomendado" : "Histórico insuficiente";
    const monthlyHistory = review.monthlyAnalysis
      .map(({ month, value, isOutlier }) => `${month}: ${numberFormatter.format(value)}${isOutlier ? " (anomalia excluída)" : " (considerado)"}`)
      .join(" | ");
    const excludedMonths = review.monthlyAnalysis
      .filter(({ isOutlier }) => isOutlier)
      .map(({ month, value }) => `${month}: ${numberFormatter.format(value)}`)
      .join(" | ");
    return [
      item.code, item.name, item.detailedName, (item.categories || []).join(" | "), (item.units || []).join(" | "),
      position.branchCode, position.branchName, position.localCode, position.localName,
      position.partition, position.shelf, position.division, position.quantity,
      review.currentMinimum, review.currentMaximum, review.averageMonthlyConsumption, review.monthCount, review.consideredMonthCount, review.outlierMonthCount,
      review.leadTimeDays, review.leadTimeSource === "real" ? "Histórico real" : "Referência estimada",
      review.leadSamples.length, review.leadSamples.join(" | "), review.recommendedMinimum, review.recommendedMaximum,
      status, review.direction === "increase" ? "Elevar parâmetros" : "Reduzir parâmetros", review.referencePrice,
      review.referencePriceSource === "stock" ? "Custo unitário atual" : review.referencePriceSource === "purchase" ? "Último preço de compra" : "Sem preço disponível",
      review.currentMinimumValue, review.recommendedMinimumValue, review.minimumValueImpact,
      review.currentMaximumValue, review.recommendedMaximumValue, review.maximumValueImpact,
      monthlyHistory, excludedMonths,
      "Mínimo = (consumo diário sem anomalias × lead time) + margem preventiva de 20%; Máximo = mínimo sugerido + 30 dias de consumo; tolerância de validação de ±20%. Anomalias identificadas pelo desvio absoluto mediano (MAD).",
      (position.replenishmentResponsibles || []).join(" | "),
    ];
  });
  exportReport(format, {
    title: "Revisão de mín. e máx.",
    filename: "revisao-minimo-maximo.xls",
    headers: [
      "Código", "Descrição", "Descrição detalhada", "Categorias", "Unidades", "Código filial", "Filial", "Código local", "Local de estoque",
      "Repartição", "Prateleira", "Divisão", "Saldo atual", "Mínimo atual", "Máximo atual", "Consumo médio mensal", "Meses analisados",
      "Meses considerados", "Meses anômalos excluídos", "Lead time em dias", "Origem do lead time", "Amostras de lead time", "Tempos encontrados", "Mínimo sugerido", "Máximo sugerido",
      "Validação", "Alteração proposta", "Preço de referência", "Origem do preço", "Valor do mínimo atual", "Valor do mínimo sugerido", "Impacto do ajuste do mínimo",
      "Valor do máximo atual", "Valor do máximo sugerido", "Impacto do ajuste do máximo", "Consumo por mês", "Anomalias excluídas", "Critério de cálculo", "Responsáveis pela reposição",
    ],
    rows,
    numericColumns: new Set([12, 13, 14, 15, 16, 17, 18, 19, 21, 23, 24, 27, 29, 30, 31, 32, 33, 34]),
    currencyColumns: new Set([27, 29, 30, 31, 32, 33, 34]),
  });
}

function exportReport(format, config) {
  if (format === "pdf") {
    exportPdfReport({ ...config, filename: config.filename.replace(/\.xls$/i, ".pdf") });
    return;
  }
  exportExcelReport(config);
}

function localizeReport({ title, headers, rows }) {
  return {
    title: translateUiText(title),
    headers: headers.map((header) => translateUiText(header)),
    rows: rows.map((row) => row.map((value) => typeof value === "string" ? translateUiText(value) : value)),
  };
}

function exportExcelReport({ title, filename, headers, rows, numericColumns = new Set(), currencyColumns = new Set(), dateColumns = new Set() }) {
  ({ title, headers, rows } = localizeReport({ title, headers, rows }));
  const styles = getComputedStyle(document.documentElement);
  const headerColor = cssColorToHex(styles.getPropertyValue("--navy-800"), "123A63");
  const accentColor = cssColorToHex(styles.getPropertyValue("--blue-500"), "2086D2");
  const filterText = ui.filterSummary.textContent || "Todos os registros";
  const cell = (value, index, header = false, alternate = false) => {
    if (header) return `<Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
    const date = dateColumns.has(index) ? excelDateValue(value) : "";
    if (date) return `<Cell ss:StyleID="Date${alternate ? "Even" : "Odd"}"><Data ss:Type="DateTime">${date}</Data></Cell>`;
    const numeric = (numericColumns.has(index) || currencyColumns.has(index)) && value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
    const style = `${currencyColumns.has(index) ? "Currency" : numeric ? "Number" : "Text"}${alternate ? "Even" : "Odd"}`;
    return `<Cell ss:StyleID="${style}"><Data ss:Type="${numeric ? "Number" : "String"}">${escapeXml(numeric ? Number(value) : value ?? "")}</Data></Cell>`;
  };
  const columns = headers.map((header) => `<Column ss:AutoFitWidth="0" ss:Width="${/descri|fornecedor|motivo|local/i.test(header) ? 190 : /data|situação|categoria|filial|critério/i.test(header) ? 120 : 88}"/>`).join("");
  const dataRows = rows.map((row, rowIndex) => `<Row ss:AutoFitHeight="1" ss:Height="20">${headers.map((_, index) => cell(row[index], index, false, rowIndex % 2 === 1)).join("")}</Row>`).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>
  <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
    <Styles>
      <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="Aptos" ss:Size="10"/></Style>
      <Style ss:ID="Title"><Alignment ss:Vertical="Center"/><Font ss:FontName="Aptos Display" ss:Size="18" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#${headerColor}" ss:Pattern="Solid"/></Style>
      <Style ss:ID="Subtitle"><Font ss:FontName="Aptos" ss:Size="10" ss:Color="#445566"/><Interior ss:Color="#EAF1F6" ss:Pattern="Solid"/></Style>
      <Style ss:ID="Header"><Alignment ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Aptos" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#${accentColor}" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FFFFFF"/></Borders></Style>
      <Style ss:ID="RowOdd"><Alignment ss:Vertical="Center" ss:WrapText="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D5E0E8"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EDF2F6"/></Borders><Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/></Style>
      <Style ss:ID="RowEven" ss:Parent="RowOdd"><Interior ss:Color="#F3F7FA" ss:Pattern="Solid"/></Style>
      <Style ss:ID="TextOdd" ss:Parent="RowOdd"/><Style ss:ID="TextEven" ss:Parent="RowEven"/>
      <Style ss:ID="NumberOdd" ss:Parent="RowOdd"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><NumberFormat ss:Format="#,##0.00"/></Style>
      <Style ss:ID="NumberEven" ss:Parent="RowEven"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><NumberFormat ss:Format="#,##0.00"/></Style>
      <Style ss:ID="CurrencyOdd" ss:Parent="RowOdd"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><NumberFormat ss:Format="&quot;R$&quot; #,##0.00"/></Style>
      <Style ss:ID="CurrencyEven" ss:Parent="RowEven"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><NumberFormat ss:Format="&quot;R$&quot; #,##0.00"/></Style>
      <Style ss:ID="DateOdd" ss:Parent="RowOdd"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><NumberFormat ss:Format="dd/mm/yyyy"/></Style>
      <Style ss:ID="DateEven" ss:Parent="RowEven"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><NumberFormat ss:Format="dd/mm/yyyy"/></Style>
    </Styles>
    <Worksheet ss:Name="${escapeXml(title.slice(0, 31))}"><Table>${columns}
      <Row ss:Height="34"><Cell ss:StyleID="Title" ss:MergeAcross="${headers.length - 1}"><Data ss:Type="String">${escapeXml(title)} · ${escapeXml(translateUiText("Gestão de Almoxarifado"))} · ${APP_VERSION}</Data></Cell></Row>
      <Row ss:Height="24"><Cell ss:StyleID="Subtitle" ss:MergeAcross="${headers.length - 1}"><Data ss:Type="String">${escapeXml(filterText)} · ${rows.length} ${activeLanguage === "en" ? "records" : "registros"} · ${activeLanguage === "en" ? "Exported on" : "Exportado em"} ${escapeXml(new Date().toLocaleString(activeLanguage === "en" ? "en-US" : "pt-BR"))}</Data></Cell></Row>
      <Row ss:Height="8"></Row><Row ss:Height="30">${headers.map((header, index) => cell(header, index, true)).join("")}</Row>${dataRows}
    </Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><ProtectObjects>False</ProtectObjects><ProtectScenarios>False</ProtectScenarios></WorksheetOptions></Worksheet>
  </Workbook>`;
  const blob = new Blob(["\ufeff", xml], { type: "application/vnd.ms-excel;charset=utf-8" });
  downloadBlob(blob, filename);
}

function exportPdfReport({ title, filename, headers, rows, numericColumns = new Set(), currencyColumns = new Set(), dateColumns = new Set(), pdfIdentityColumns = [0, 1] }) {
  ({ title, headers, rows } = localizeReport({ title, headers, rows }));
  const filterText = ui.filterSummary.textContent || (activeLanguage === "en" ? "All records" : "Todos os registros");
  const blob = createPdfBlob({ title, headers, rows, filterText, numericColumns, currencyColumns, dateColumns, pdfIdentityColumns });
  downloadBlob(blob, filename);
}

function downloadBlob(blob, filename) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function createPdfBlob({ title, headers, rows, filterText = "", numericColumns = new Set(), currencyColumns = new Set(), dateColumns = new Set(), pdfIdentityColumns = [0, 1] }) {
  const PAGE_WIDTH = 842;
  const PAGE_HEIGHT = 595;
  const MARGIN = 28;
  const TABLE_WIDTH = PAGE_WIDTH - (MARGIN * 2);
  const LINE_HEIGHT = 8;
  const FOOTER_TOP = 25;
  const pages = [];
  const groups = buildPdfColumnGroups(headers, pdfIdentityColumns);
  const locale = activeLanguage === "en" ? "en-US" : "pt-BR";
  const recordsLabel = activeLanguage === "en" ? "records" : "registros";
  const exportedLabel = activeLanguage === "en" ? "Exported on" : "Exportado em";
  const blockLabel = activeLanguage === "en" ? "Column block" : "Bloco de colunas";
  const pageLabel = activeLanguage === "en" ? "Page" : "Página";
  const exportedAt = new Date().toLocaleString(locale);

  const numberValue = (value, index) => {
    if (dateColumns.has(index)) return formatDate(value) || String(value ?? "");
    const numeric = (numericColumns.has(index) || currencyColumns.has(index)) && value !== "" && value !== null && value !== undefined && Number.isFinite(Number(value));
    if (!numeric) return String(value ?? "");
    return currencyColumns.has(index)
      ? Number(value).toLocaleString(locale, { style: "currency", currency: "BRL", maximumFractionDigits: 2 })
      : Number(value).toLocaleString(locale, { maximumFractionDigits: 2 });
  };

  const addText = (commands, text, x, y, size = 7, bold = false, color = "0.08 0.14 0.22") => {
    commands.push(`BT /${bold ? "F2" : "F1"} ${pdfNumber(size)} Tf ${color} rg 1 0 0 1 ${pdfNumber(x)} ${pdfNumber(y)} Tm (${pdfEscapeText(text)}) Tj ET`);
  };
  const fillRect = (commands, x, y, width, height, color) => commands.push(`q ${color} rg ${pdfNumber(x)} ${pdfNumber(y)} ${pdfNumber(width)} ${pdfNumber(height)} re f Q`);
  const strokeRect = (commands, x, y, width, height, color = "0.82 0.87 0.91") => commands.push(`q ${color} RG 0.45 w ${pdfNumber(x)} ${pdfNumber(y)} ${pdfNumber(width)} ${pdfNumber(height)} re S Q`);

  const startPage = (groupIndex, indices, widths) => {
    const commands = [];
    fillRect(commands, 0, PAGE_HEIGHT - 58, PAGE_WIDTH, 58, "0.015 0.035 0.065");
    fillRect(commands, 0, PAGE_HEIGHT - 58, 8, 58, "0.05 0.75 0.95");
    addText(commands, `${title} · ${APP_VERSION}`, MARGIN, PAGE_HEIGHT - 28, 15, true, "0.88 0.97 1");
    const meta = `${filterText} · ${rows.length} ${recordsLabel} · ${exportedLabel} ${exportedAt}`;
    addText(commands, clipPdfText(meta, 142), MARGIN, PAGE_HEIGHT - 44, 6.5, false, "0.62 0.78 0.88");
    addText(commands, `${blockLabel} ${groupIndex + 1}/${groups.length}`, MARGIN, PAGE_HEIGHT - 76, 8.5, true, "0.04 0.32 0.5");
    let x = MARGIN;
    const headerTop = PAGE_HEIGHT - 84;
    const headerHeight = 28;
    indices.forEach((index, columnIndex) => {
      const width = widths[columnIndex];
      fillRect(commands, x, headerTop - headerHeight, width, headerHeight, columnIndex < 2 ? "0.035 0.16 0.27" : "0.02 0.38 0.58");
      strokeRect(commands, x, headerTop - headerHeight, width, headerHeight, "0.25 0.63 0.76");
      const headerLines = wrapPdfText(headers[index], width - 8, 6.4).slice(0, 3);
      headerLines.forEach((line, lineIndex) => addText(commands, line, x + 4, headerTop - 10 - (lineIndex * 7), 6.4, true, "1 1 1"));
      x += width;
    });
    const page = { commands, groupIndex };
    pages.push(page);
    return { page, y: headerTop - headerHeight, indices, widths };
  };

  groups.forEach((indices, groupIndex) => {
    const widths = pdfColumnWidths(headers, rows, indices, TABLE_WIDTH);
    let context = startPage(groupIndex, indices, widths);
    rows.forEach((row, rowIndex) => {
      const cellLines = indices.map((index, columnIndex) => wrapPdfText(numberValue(row[index], index), widths[columnIndex] - 8, 6.2));
      const totalLines = Math.max(1, ...cellLines.map((lines) => lines.length));
      let lineOffset = 0;
      while (lineOffset < totalLines) {
        let lineCapacity = Math.floor((context.y - FOOTER_TOP - 7) / LINE_HEIGHT);
        if (lineCapacity < 1) {
          context = startPage(groupIndex, indices, widths);
          lineCapacity = Math.floor((context.y - FOOTER_TOP - 7) / LINE_HEIGHT);
        }
        const drawnLines = Math.min(totalLines - lineOffset, lineCapacity);
        const rowHeight = Math.max(20, (drawnLines * LINE_HEIGHT) + 7);
        const rowBottom = context.y - rowHeight;
        const rowColor = rowIndex % 2 ? "0.94 0.965 0.98" : "1 1 1";
        fillRect(context.page.commands, MARGIN, rowBottom, TABLE_WIDTH, rowHeight, rowColor);
        let x = MARGIN;
        indices.forEach((index, columnIndex) => {
          const width = widths[columnIndex];
          strokeRect(context.page.commands, x, rowBottom, width, rowHeight);
          cellLines[columnIndex].slice(lineOffset, lineOffset + drawnLines).forEach((line, localLineIndex) => {
            addText(context.page.commands, line, x + 4, context.y - 10 - (localLineIndex * LINE_HEIGHT), 6.2, false);
          });
          x += width;
        });
        context.y = rowBottom;
        lineOffset += drawnLines;
      }
    });
  });

  pages.forEach((page, index) => {
    fillRect(page.commands, 0, 0, PAGE_WIDTH, 20, "0.015 0.035 0.065");
    addText(page.commands, `${APP_VERSION} · ${pageLabel} ${index + 1}/${pages.length}`, MARGIN, 7, 6.4, true, "0.62 0.88 0.96");
    addText(page.commands, "Gestão de Almoxarifado", PAGE_WIDTH - 142, 7, 6.4, false, "0.62 0.78 0.88");
  });

  return assemblePdf(pages.map((page) => page.commands.join("\n")), PAGE_WIDTH, PAGE_HEIGHT);
}

function buildPdfColumnGroups(headers, identityColumns = [0, 1]) {
  if (headers.length <= 7) return [headers.map((_, index) => index)];
  const identity = [...new Set(identityColumns)].filter((index) => Number.isInteger(index) && index >= 0 && index < headers.length);
  const remaining = headers.map((_, index) => index).filter((index) => !identity.includes(index));
  const groups = [];
  for (let index = 0; index < remaining.length; index += 4) groups.push([...identity, ...remaining.slice(index, index + 4)]);
  return groups;
}

function pdfColumnWidths(headers, rows, indices, totalWidth) {
  const weights = indices.map((index, columnIndex) => {
    const sampleLength = rows.slice(0, 80).reduce((maximum, row) => Math.max(maximum, String(row[index] ?? "").length), headers[index].length);
    if (columnIndex === 0) return 1.05;
    if (columnIndex === 1) return 2.25;
    if (/descri|fornecedor|motivo|critério|observ|consumo/i.test(headers[index])) return 1.8;
    return Math.min(1.55, Math.max(0.8, sampleLength / 18));
  });
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map((weight) => (weight / weightTotal) * totalWidth);
}

function wrapPdfText(value, width, fontSize) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return [""];
  const maxCharacters = Math.max(4, Math.floor(width / (fontSize * 0.51)));
  const words = text.split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    const parts = word.length > maxCharacters ? word.match(new RegExp(`.{1,${maxCharacters}}`, "g")) : [word];
    parts.forEach((part) => {
      if (!current) current = part;
      else if (`${current} ${part}`.length <= maxCharacters) current += ` ${part}`;
      else { lines.push(current); current = part; }
    });
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function clipPdfText(value, maxCharacters) {
  const text = String(value ?? "");
  return text.length > maxCharacters ? `${text.slice(0, maxCharacters - 3)}...` : text;
}

function pdfNumber(value) {
  return Number(value).toFixed(2).replace(/\.00$/, "");
}

function pdfEscapeText(value) {
  return toWinAnsi(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[\r\n]/g, " ");
}

function toWinAnsi(value) {
  const replacements = new Map([[0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97]]);
  let result = "";
  for (const character of String(value ?? "")) {
    const code = character.codePointAt(0);
    if (code <= 0xff) result += String.fromCharCode(code);
    else if (replacements.has(code)) result += String.fromCharCode(replacements.get(code));
    else if (code === 0x2192) result += "->";
    else result += "?";
  }
  return result;
}

function assemblePdf(streams, width, height) {
  const objects = [];
  const pageIds = streams.map((_, index) => 5 + (index * 2));
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Count ${streams.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  streams.forEach((stream, index) => {
    const pageId = pageIds[index];
    const streamId = pageId + 1;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamId} 0 R >>`;
    objects[streamId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  let binary = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = binary.length;
    binary += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = binary.length;
  binary += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) binary += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  binary += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0) & 0xff);
  return new Blob([bytes], { type: "application/pdf" });
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
  const rows = collectProcurementRows(true);
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
    if (isOpenOfForPurchase(record.of)) open.add(record.of.code);
    if (isOpenOfForPurchase(record.of) && record.of.requestedQuantity > 0 && record.of.deliveredQuantity > 0 && record.of.deliveredQuantity < record.of.requestedQuantity) partial.add(record.of.code);
    if (record.rec?.invoice) received.add(`${record.rec.invoice}::${record.rec.series || ""}`);
  }
  ui.procurementAwaiting.textContent = integerFormatter.format(awaiting.size);
  ui.procurementOpen.textContent = integerFormatter.format(open.size);
  ui.procurementPartial.textContent = integerFormatter.format(partial.size);
  ui.procurementReceived.textContent = integerFormatter.format(received.size);
  renderNextProcurementBatch();
}

function collectProcurementRows(shouldSort = true) {
  const branch = effectiveBranchFilter();
  const supplier = ui.supplierFilter.value;
  const requester = ui.requesterFilter.value;
  const query = normalizeSearch(ui.searchInput.value);
  const scStatus = ui.scStatusFilter.value;
  const ccuClassification = ui.ccuClassificationFilter.value;
  const rows = [];
  for (const item of state.items.filter(itemMatchesTransactionFilters)) {
    for (const record of item.history || []) {
      if (!record.sc?.code && !record.of?.code) continue;
      if (!recordMatchesCcuClassification(record, item, ccuClassification)) continue;
      if (!recordMatchesRequester(record, requester)) continue;
      if (branch && record.branchCode !== branch) continue;
      if (scStatus && procurementRecordStatus(record) !== scStatus) continue;
      if (supplier && ![record.of?.supplier, record.rec?.supplier].some((value) => normalizeSearch(value) === normalizeSearch(supplier))) continue;
      if (query && !recordMatchesQuery(item, record, query)) continue;
      rows.push({ item, record });
    }
  }
  if (shouldSort) rows.sort((a, b) => (b.record.sortKey || 0) - (a.record.sortKey || 0));
  return rows;
}

function recordMatchesQuery(item, record, query) {
  return normalizeSearch([
    item.code, item.name, item.detailedName,
    record.sc?.code, record.sc?.status, record.sc?.requesterName, record.sc?.allocationCostCenter,
    record.of?.code, record.of?.status, record.of?.supplier, record.of?.supplierCode, record.of?.supplierEmail,
    record.rec?.invoice, record.rec?.series, record.rec?.supplier, record.rec?.supplierCode,
  ].join(" ")).includes(query);
}

function recordMatchesRequester(record, requester) {
  if (!requester) return true;
  return normalizeSearch(record.sc?.requesterName) === normalizeSearch(requester);
}

function itemMatchesRequester(item, requester) {
  if (!requester) return true;
  const normalizedRequester = normalizeSearch(requester);
  return (item.requesters || []).some((value) => normalizeSearch(value) === normalizedRequester);
}

function effectiveBranchFilter() {
  return branchCodeFromFilter(ui.branchFilter.value) || String(ui.locationFilter.value || "").split("::")[0] || "";
}

function itemMatchesTransactionFilters(item) {
  const query = normalizeSearch(ui.searchInput.value);
  if (query && !item.searchText.includes(query)) return false;
  if (ui.itemCodeFilter.value && item.code !== ui.itemCodeFilter.value) return false;
  if (ui.ccuClassificationFilter.value && !itemMatchesCcuClassification(item, ui.ccuClassificationFilter.value)) return false;
  if (ui.categoryFilter.value && !(item.categories || []).includes(ui.categoryFilter.value)) return false;
  if (ui.unitFilter.value && !(item.units || []).includes(ui.unitFilter.value)) return false;
  if (ui.supplierFilter.value && !(item.suppliers || []).includes(ui.supplierFilter.value)) return false;
  if (ui.requesterFilter.value && !itemMatchesRequester(item, ui.requesterFilter.value)) return false;
  if (ui.scStatusFilter.value && !itemMatchesProcurementStatus(item, ui.scStatusFilter.value, effectiveBranchFilter(), ui.requesterFilter.value)) return false;
  const status = ui.stockStatusFilter.value;
  const positiveOnly = ui.positiveBalanceFilter.checked;
  const location = ui.locationFilter.value;
  const replenishmentResponsible = ui.replenishmentResponsibleFilter.value;
  if (status || positiveOnly || location || replenishmentResponsible) {
    const positions = (item.positions || []).filter((position) => {
      if (!positionMatchesBranch(position, ui.branchFilter.value)) return false;
      if (location && position.locationKey !== location) return false;
      if (!positionMatchesReplenishmentResponsible(position, replenishmentResponsible)) return false;
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
      <span class="report-card__code">${escapeHtml(sc?.code ? purchaseClassificationLabel(sc) : "Classificação não informada")}</span>
      <span class="process-mini"><span class="${sc ? "is-complete" : ""}">SC<strong>${escapeHtml(sc?.code || "—")}</strong></span><i></i><span class="${of ? "is-complete" : ""}">OF<strong>${escapeHtml(of?.code || "—")}</strong></span><i></i><span class="${rec ? "is-complete" : ""}">REC<strong>${escapeHtml(rec?.invoice || "—")}</strong></span></span>
      <span class="procurement-people"><span><small>Solicitante</small><strong>${escapeHtml(sc?.requesterName || "Não informado")}</strong></span><span><small>Fornecedor</small><strong>${escapeHtml((of?.supplier || rec?.supplier) || "Não informado")}</strong></span><span><small>E-mail</small><strong>${escapeHtml(of?.supplierEmail || "Não informado")}</strong></span></span>
      <span class="report-card__footer"><span>${escapeHtml(record.branch || "Filial não informada")}</span><strong>${escapeHtml(process.detail)}</strong></span>`;
    fragment.append(card);
  }
  ui.procurementGrid.append(fragment);
  state.procurementVisible = end;
  ui.procurementVisibleCount.textContent = `${integerFormatter.format(end)} de ${integerFormatter.format(state.procurementRows.length)} processos`;
  ui.procurementLoadMore.classList.toggle("is-hidden", end >= state.procurementRows.length);
}

function processStatus(record) {
  const { sc, of, rec } = record;
  const status = procurementRecordStatus(record);
  if (status === "overdue") return { label: `${of?.code ? `OF ${of.code}` : `SC ${sc?.code || "—"}`} · atrasada`, detail: formatDate(of?.deliveryDate || sc?.deliveryDate), type: "status-pill--critical" };
  if (status === "awaiting-of") return { label: `SC ${sc?.code || "—"} · aguardando OF`, detail: ageLabel(sc?.date), type: "status-pill--pending" };
  if (status === "partial") return { label: `OF ${of.code} · entrega parcial`, detail: `${numberFormatter.format(of.balance)} pendente`, type: "status-pill--need" };
  if (status === "awaiting-delivery") return { label: `OF ${of.code} · aguardando entrega`, detail: `${numberFormatter.format(of.balance)} pendente`, type: "status-pill--process" };
  if (rec?.invoice) return {
    label: of?.code ? `OF ${of.code} · recebida` : `NF ${rec.invoice} · recebida`,
    detail: formatDate(rec.entryDate || rec.issueDate),
    type: "status-pill--success",
  };
  if (of?.code) return { label: `OF ${of.code}`, detail: formatDate(of.date), type: "status-pill--process" };
  if (sc?.code) return {
    label: `SC ${sc.code} · ${sc.status || "sem OF"}`,
    detail: formatDate(sc.date),
    type: "status-pill--pending",
  };
  return { label: "Processo incompleto", detail: "Sem SC ou OF vinculada", type: "status-pill--pending" };
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
  renderOperationalInsights(ui.procurementModalOperational, getOperationalInsight(item, record.branchCode));
  ui.procurementModalDetails.innerHTML = [
    renderProcessGroup("SC", "Solicitação de Compra", sc, [
      ["Código", sc?.code], ["Situação", sc?.status], ["Data de criação", formatDate(sc?.date)], ["Data de entrega", formatDate(sc?.deliveryDate)],
      ["Tempo desde a criação", sc ? ageLabel(sc.date) : "Não informado"], ["Entrega vencida", sc ? (isOverdue(sc.deliveryDate) ? "Sim" : "Não") : "Não informado"],
      ["Empresa", sc?.company], ["Filial", [sc?.branchCode, sc?.branchName].filter(Boolean).join(" · ")], ["Usuário solicitante", sc?.requesterName], ["Centro de custo aprovador", sc?.costCenter], ["Sequência", sc?.sequence],
      ["Código do produto", sc?.productCode], ["Produto", sc?.productName], ["Descrição do material", sc?.materialDescription], ["Unidade", sc?.unit],
      ["Quantidade", formatProcessNumber(sc?.quantity)], ["Valor estimado", formatProcessCurrency(sc?.estimatedValue)], ["Categoria", sc?.category], ["Motivo", sc?.reason],
      ["Regularização", sc?.regularization], ["Observação", sc?.observation], ["Empresa destino", sc?.destinationCompany], ["Filial destino", sc?.destinationBranch],
      ["PI", sc?.investmentPlan], ["Cancelada", formatFlag(sc?.cancelled)], ["Local de estoque", sc?.stockLocation], ["CCU da etiqueta", sc?.allocationCostCenter], ["Classificação da compra", sc?.code ? purchaseClassificationLabel(sc) : "Não informado"],
      ["Conta", sc?.account], ["Percentual de rateio", sc?.allocationPercent], ["Imobilizado", formatFlag(sc?.asset)],
    ]),
    renderProcessGroup("OF", "Ordem de Fornecimento", of, [
      ["Código", of?.code], ["Situação", of?.status], ["Data de emissão", formatDate(of?.date)], ["Data de entrega", formatDate(of?.deliveryDate)],
      ["Tempo entre SC e OF", durationLabel(sc?.date, of?.date)], ["Entrega vencida", of ? (isOverdue(of.deliveryDate) && isOpenOfForPurchase(of) ? "Sim" : "Não") : "Não informado"],
      ["Empresa de entrega", of?.deliveryCompany], ["Filial de entrega", [of?.deliveryBranchCode, of?.deliveryBranchName].filter(Boolean).join(" · ")], ["UF", of?.state],
      ["Empresa de pagamento", of?.paymentCompany], ["Filial de pagamento", [of?.paymentBranchCode, of?.paymentBranchName].filter(Boolean).join(" · ")],
      ["Código do fornecedor", of?.supplierCode], ["Fornecedor", of?.supplier], ["E-mail do fornecedor", of?.supplierEmail], ["Código do produto", of?.productCode], ["Produto", of?.productName], ["Unidade", of?.unit],
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

function generationDaysBetween(scDate, ofDate) {
  const start = dateTimestamp(scDate);
  const end = dateTimestamp(ofDate);
  if (!start || !end || end < start) return null;
  return Math.round((end - start) / 86400000);
}

function ofGenerationBucketFor(days) {
  if (!Number.isFinite(days) || days < 0) return null;
  return OF_GENERATION_BUCKETS.find(({ min, max }) => days >= min && days <= max) || null;
}

function calculateOfGenerationMetrics(rows = []) {
  const validRows = rows.filter(({ days }) => Number.isFinite(days) && days >= 0);
  const counts = Object.fromEntries(OF_GENERATION_BUCKETS.map(({ id }) => [id, 0]));
  let totalDays = 0;
  for (const row of validRows) {
    totalDays += row.days;
    const bucket = ofGenerationBucketFor(row.days);
    if (bucket) counts[bucket.id] += 1;
  }
  return {
    total: validRows.length,
    average: validRows.length ? totalDays / validRows.length : 0,
    counts,
  };
}

function collectOfGenerationRows() {
  const processes = new Map();
  for (const { item, record } of collectProcurementRows(false)) {
    const sc = record.sc;
    const of = record.of;
    if (!sc?.code || !of?.code) continue;
    const days = generationDaysBetween(sc.date, of.date);
    if (days == null) continue;
    const processKey = `${sc.code}::${of.code}`;
    let process = processes.get(processKey);
    if (!process) {
      process = {
        item,
        record,
        sc,
        of,
        days,
        bucket: ofGenerationBucketFor(days),
        scPeriod: ofGenerationDateParts(sc.date),
        itemCodes: new Set(),
        itemNames: new Set(),
      };
      processes.set(processKey, process);
    }
    process.itemCodes.add(item.code);
    process.itemNames.add(item.name);
  }
  return [...processes.values()]
    .sort((a, b) => b.days - a.days || (b.record.sortKey || 0) - (a.record.sortKey || 0))
    .map((row, index) => ({
      ...row,
      key: `of-generation-${index}`,
      itemCodes: [...row.itemCodes],
      itemNames: [...row.itemNames],
    }));
}

function ofGenerationTone(bucketId) {
  if (bucketId === "up-to-7") return "success";
  if (["8-to-15", "16-to-20"].includes(bucketId)) return "process";
  if (["21-to-25", "26-to-30"].includes(bucketId)) return "need";
  return "critical";
}

function ofGenerationDateParts(value) {
  const timestamp = dateTimestamp(value);
  if (!timestamp) return null;
  const date = new Date(timestamp);
  const year = String(date.getUTCFullYear());
  const monthNumber = date.getUTCMonth() + 1;
  const month = `${year}-${String(monthNumber).padStart(2, "0")}`;
  const day = String(date.getUTCDate()).padStart(2, "0");
  const isoDate = `${month}-${day}`;
  const weekDate = new Date(timestamp);
  weekDate.setUTCDate(weekDate.getUTCDate() + 4 - (weekDate.getUTCDay() || 7));
  const weekYear = weekDate.getUTCFullYear();
  const yearStart = Date.UTC(weekYear, 0, 1);
  const weekNumber = Math.ceil((((weekDate.getTime() - yearStart) / 86400000) + 1) / 7);
  return {
    timestamp,
    year,
    month,
    week: `${weekYear}-W${String(weekNumber).padStart(2, "0")}`,
    date: isoDate,
  };
}

function ofGenerationMonthLabel(value) {
  const match = String(value).match(/^(\d{4})-(\d{2})$/);
  if (!match) return value;
  const label = new Intl.DateTimeFormat(activeLanguage === "en" ? "en-US" : "pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
  return label[0].toUpperCase() + label.slice(1);
}

function ofGenerationWeekLabel(value) {
  const match = String(value).match(/^(\d{4})-W(\d{2})$/);
  return match ? `${translateUiText("Semana")} ${Number(match[2])} · ${match[1]}` : value;
}

function setOfGenerationPeriodOptions(control, values, allLabel, labelForValue = (value) => value, selected = "") {
  control.innerHTML = `<option value="">${escapeHtml(translateUiText(allLabel))}</option>${values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(labelForValue(value))}</option>`).join("")}`;
  control.value = values.includes(selected) ? selected : "";
}

function rowMatchesOfGenerationPeriod(row, period = state.ofGenerationPeriod) {
  const parts = row.scPeriod;
  if (!parts) return false;
  return (!period.year || parts.year === period.year)
    && (!period.month || parts.month === period.month)
    && (!period.week || parts.week === period.week)
    && (!period.date || parts.date === period.date);
}

function populateOfGenerationPeriodFilters(rows) {
  const period = state.ofGenerationPeriod;
  const unique = (values) => [...new Set(values.filter(Boolean))].sort();
  const years = unique(rows.map((row) => row.scPeriod?.year));
  if (period.year && !years.includes(period.year)) Object.assign(period, { year: "", month: "", week: "", date: "" });
  setOfGenerationPeriodOptions(ui.ofGenerationYearFilter, years, "Todos os anos", (value) => value, period.year);
  period.year = ui.ofGenerationYearFilter.value;

  const yearRows = rows.filter((row) => !period.year || row.scPeriod?.year === period.year);
  const months = unique(yearRows.map((row) => row.scPeriod?.month));
  if (period.month && !months.includes(period.month)) { period.month = ""; period.week = ""; period.date = ""; }
  setOfGenerationPeriodOptions(ui.ofGenerationMonthFilter, months, "Todos os meses", ofGenerationMonthLabel, period.month);
  ui.ofGenerationMonthFilter.value = period.month;

  const monthRows = yearRows.filter((row) => !period.month || row.scPeriod?.month === period.month);
  const weeks = unique(monthRows.map((row) => row.scPeriod?.week));
  if (period.week && !weeks.includes(period.week)) { period.week = ""; period.date = ""; }
  setOfGenerationPeriodOptions(ui.ofGenerationWeekFilter, weeks, "Todas as semanas", ofGenerationWeekLabel, period.week);
  ui.ofGenerationWeekFilter.value = period.week;

  const weekRows = monthRows.filter((row) => !period.week || row.scPeriod?.week === period.week);
  const dates = unique(weekRows.map((row) => row.scPeriod?.date));
  if (period.date && !dates.includes(period.date)) period.date = "";
  setOfGenerationPeriodOptions(ui.ofGenerationDateFilter, dates, "Todas as datas", (value) => formatDate(value), period.date);
  ui.ofGenerationDateFilter.value = period.date;
  ui.clearOfGenerationPeriod.classList.toggle("is-hidden", !Object.values(period).some(Boolean));
}

function ofGenerationTrendGranularity(rows) {
  return ["year", "month", "week", "date"].includes(state.ofGenerationChartGranularity)
    ? state.ofGenerationChartGranularity
    : "month";
}

function ofGenerationTrendPoint(row, granularity) {
  const parts = row.scPeriod;
  if (granularity === "year") return { key: parts.year, label: parts.year };
  if (granularity === "month") return { key: parts.month, label: ofGenerationMonthLabel(parts.month).replace(/ de /gi, " ") };
  if (granularity === "week") return { key: parts.week, label: `S${Number(parts.week.slice(-2))}` };
  return { key: parts.date, label: formatDate(parts.date).slice(0, 5) };
}

function buildOfGenerationTrend(rows) {
  const granularity = ofGenerationTrendGranularity(rows);
  const groups = new Map();
  for (const row of rows) {
    const point = ofGenerationTrendPoint(row, granularity);
    const group = groups.get(point.key) || { ...point, totalDays: 0, count: 0 };
    group.totalDays += row.days;
    group.count += 1;
    groups.set(point.key, group);
  }
  return {
    granularity,
    points: [...groups.values()].sort((a, b) => a.key.localeCompare(b.key)).map((point) => ({ ...point, average: point.totalDays / point.count })),
  };
}

function renderOfGenerationTrend(rows) {
  const selectedBucket = state.ofGenerationChartBucket;
  const chartRows = selectedBucket === "all" ? rows : rows.filter((row) => row.bucket?.id === selectedBucket);
  const choices = [{ id: "all", label: "Todas as faixas" }, ...OF_GENERATION_BUCKETS];
  const granularities = [
    { id: "year", label: "Anual" },
    { id: "month", label: "Mensal" },
    { id: "week", label: "Semanal" },
    { id: "date", label: "Diário" },
  ];
  ui.ofGenerationChartGranularity.innerHTML = granularities.map(({ id, label }) => `<button type="button" data-of-chart-granularity="${id}" class="${state.ofGenerationChartGranularity === id ? "is-active" : ""}" aria-pressed="${String(state.ofGenerationChartGranularity === id)}">${escapeHtml(label)}</button>`).join("");
  ui.ofGenerationChartBuckets.innerHTML = choices.map(({ id, label }) => `<button type="button" data-of-chart-bucket="${id}" class="${selectedBucket === id ? "is-active" : ""}" aria-pressed="${String(selectedBucket === id)}">${escapeHtml(label)}</button>`).join("");
  const trend = buildOfGenerationTrend(chartRows);
  const granularityLabels = { year: "ano", month: "mês", week: "semana", date: "data" };
  const selectedLabel = choices.find(({ id }) => id === selectedBucket)?.label || "Todas as faixas";
  ui.ofGenerationTrendSubtitle.textContent = `${selectedLabel} · evolução por ${granularityLabels[trend.granularity]}. Período baseado na criação da SC.`;
  if (!trend.points.length) {
    ui.ofGenerationTrendChart.innerHTML = `<div class="table-empty">Nenhum processo encontrado para esta faixa e período.</div>`;
    return;
  }

  const width = 960;
  const height = 300;
  const pad = { top: 28, right: 24, bottom: 56, left: 52 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const maxAverage = Math.max(...trend.points.map(({ average }) => average), 1);
  const maxY = Math.max(5, Math.ceil(maxAverage / 5) * 5);
  const xAt = (index) => trend.points.length === 1 ? pad.left + innerWidth / 2 : pad.left + index * innerWidth / (trend.points.length - 1);
  const yAt = (value) => pad.top + innerHeight - (value / maxY * innerHeight);
  const grid = Array.from({ length: 5 }, (_, index) => {
    const value = maxY * index / 4;
    const y = yAt(value);
    return `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}"/><text x="${pad.left - 10}" y="${y + 4}" text-anchor="end">${numberFormatter.format(value)}</text>`;
  }).join("");
  const path = trend.points.map((point, index) => `${index ? "L" : "M"}${xAt(index).toFixed(1)},${yAt(point.average).toFixed(1)}`).join(" ");
  const labelStep = Math.max(1, Math.ceil(trend.points.length / 10));
  const points = trend.points.map((point, index) => {
    const x = xAt(index);
    const y = yAt(point.average);
    const label = index % labelStep === 0 || index === trend.points.length - 1 ? `<text class="of-trend-chart__x-label" x="${x}" y="${height - 22}" text-anchor="middle">${escapeHtml(point.label)}</text>` : "";
    return `<g><circle cx="${x}" cy="${y}" r="5"><title>${escapeHtml(point.label)}: ${numberFormatter.format(point.average)} dias · ${integerFormatter.format(point.count)} processos</title></circle><text class="of-trend-chart__value" x="${x}" y="${Math.max(14, y - 11)}" text-anchor="middle">${numberFormatter.format(point.average)}</text>${label}</g>`;
  }).join("");
  ui.ofGenerationTrendChart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true"><g class="of-trend-chart__grid">${grid}</g><path class="of-trend-chart__line" d="${path}"/>${points}</svg><div class="of-trend-chart__caption"><span>Tempo médio em dias</span><strong>${integerFormatter.format(chartRows.length)} ${chartRows.length === 1 ? "processo" : "processos"}</strong></div>`;
}

function renderOfGenerationAnalysis() {
  const allRows = collectOfGenerationRows();
  populateOfGenerationPeriodFilters(allRows);
  const rows = allRows.filter((row) => rowMatchesOfGenerationPeriod(row));
  const metrics = calculateOfGenerationMetrics(rows);
  state.ofGenerationRows = rows;
  const selectedBucket = state.ofGenerationBucket;
  const visible = selectedBucket === "all" ? rows : rows.filter((row) => row.bucket?.id === selectedBucket);
  state.visibleOfGenerationRows = visible;
  state.ofGenerationVisible = 0;
  state.ofGenerationByKey.clear();
  rows.forEach((row) => state.ofGenerationByKey.set(row.key, row));
  renderOfGenerationTrend(rows);

  ui.ofGenerationSummary.innerHTML = `
    <article class="of-generation-summary__headline"><span>Média geral</span><strong>${numberFormatter.format(metrics.average)} dias</strong><small>SC criada → OF emitida</small></article>
    <article><span>Processos medidos</span><strong>${integerFormatter.format(metrics.total)}</strong><small>SC + OF únicas</small></article>
    ${OF_GENERATION_BUCKETS.map((bucket) => {
      const count = metrics.counts[bucket.id] || 0;
      const percentage = metrics.total ? count / metrics.total * 100 : 0;
      const active = selectedBucket === bucket.id;
      return `<button type="button" class="of-generation-summary__bucket of-generation-summary__bucket--${ofGenerationTone(bucket.id)}${active ? " is-active" : ""}" data-of-generation-bucket="${bucket.id}" aria-pressed="${String(active)}"><span>${escapeHtml(bucket.label)}</span><strong>${integerFormatter.format(count)}</strong><small>${numberFormatter.format(percentage)}% dos processos</small></button>`;
    }).join("")}`;

  ui.ofGenerationCount.textContent = selectedBucket === "all"
    ? pluralize(metrics.total, "processo", "processos")
    : `${integerFormatter.format(visible.length)} de ${integerFormatter.format(metrics.total)} processos`;
  ui.clearOfGenerationRange.classList.toggle("is-hidden", selectedBucket === "all");
  ui.ofGenerationGrid.replaceChildren();

  if (!visible.length) {
    ui.ofGenerationGrid.innerHTML = `<div class="table-empty">Nenhum processo com datas válidas de SC e OF corresponde aos filtros aplicados.</div>`;
    ui.ofGenerationLoadMore.classList.add("is-hidden");
    ui.ofGenerationVisibleCount.textContent = "";
    return;
  }
  renderNextOfGenerationBatch();
}

function renderNextOfGenerationBatch() {
  const start = state.ofGenerationVisible;
  const end = Math.min(start + CONFIG.reportBatch, state.visibleOfGenerationRows.length);
  if (start >= end) return;
  const html = state.visibleOfGenerationRows.slice(start, end).map((row) => {
    const { sc, of, record, bucket, days } = row;
    return `<button class="report-card report-card--of-generation of-generation-card--${ofGenerationTone(bucket?.id)}" type="button" data-of-generation-key="${escapeHtml(row.key)}">
      <span class="report-card__top"><span class="status-pill status-pill--${ofGenerationTone(bucket?.id)}">${escapeHtml(bucket?.label || "Faixa não informada")}</span><strong class="of-generation-days">${integerFormatter.format(days)} ${days === 1 ? "dia" : "dias"}</strong></span>
      <strong class="report-card__title">SC ${escapeHtml(sc.code)} → OF ${escapeHtml(of.code)}</strong>
      <span class="report-card__code">${escapeHtml(row.itemCodes.join(", "))} · ${escapeHtml(row.itemNames[0] || "Item não informado")}${row.itemNames.length > 1 ? ` +${integerFormatter.format(row.itemNames.length - 1)} item(ns)` : ""}</span>
      <span class="of-generation-path"><span><small>Criação da SC</small><strong>${escapeHtml(formatDate(sc.date))}</strong></span><i aria-hidden="true">→</i><span><small>Emissão da OF</small><strong>${escapeHtml(formatDate(of.date))}</strong></span></span>
      <span class="report-card__meta"><span><small>Solicitante</small><strong>${escapeHtml(sc.requesterName || "Não informado")}</strong></span><span><small>Fornecedor</small><strong>${escapeHtml(of.supplier || "Não informado")}</strong></span></span>
      <span class="report-card__footer"><span>${escapeHtml([record.branchCode, record.branch].filter(Boolean).join(" · ") || "Filial não informada")}</span><strong>Ver indicador</strong></span>
    </button>`;
  }).join("");
  ui.ofGenerationGrid.insertAdjacentHTML("beforeend", html);
  state.ofGenerationVisible = end;
  ui.ofGenerationVisibleCount.textContent = `Exibindo ${integerFormatter.format(end)} de ${integerFormatter.format(state.visibleOfGenerationRows.length)} processos`;
  ui.ofGenerationLoadMore.classList.toggle("is-hidden", end >= state.visibleOfGenerationRows.length);
}

function openOfGenerationModal(key) {
  const row = state.ofGenerationByKey.get(key);
  if (!row) return;
  const { item, record, sc, of, days, bucket, itemCodes, itemNames } = row;
  state.activeOfGeneration = row;
  state.lastFocusedElement = document.activeElement;
  ui.ofGenerationModalCode.textContent = `SC ${sc.code} · OF ${of.code}`;
  ui.ofGenerationModalTitle.textContent = "Tempo de geração da OF";
  ui.ofGenerationModalSubtitle.textContent = [record.branchCode, record.branch].filter(Boolean).join(" · ") || "Filial não informada";
  ui.ofGenerationModalTimeline.innerHTML = `<article><span>SC</span><strong>${escapeHtml(sc.code)}</strong><small>${escapeHtml(formatDate(sc.date))}</small></article><i><strong>${integerFormatter.format(days)} ${days === 1 ? "dia" : "dias"}</strong><small>${escapeHtml(bucket?.label || "Faixa não informada")}</small></i><article><span>OF</span><strong>${escapeHtml(of.code)}</strong><small>${escapeHtml(formatDate(of.date))}</small></article>`;
  ui.ofGenerationModalSummary.innerHTML = `
    <article><span>Tempo de geração</span><strong>${integerFormatter.format(days)} ${days === 1 ? "dia" : "dias"}</strong></article>
    <article><span>Faixa do indicador</span><strong>${escapeHtml(bucket?.label || "—")}</strong></article>
    <article><span>Data da SC</span><strong>${escapeHtml(formatDate(sc.date))}</strong></article>
    <article><span>Data da OF</span><strong>${escapeHtml(formatDate(of.date))}</strong></article>
    <article><span>Quantidade da SC</span><strong>${formatProcessNumber(sc.quantity)}</strong></article>
    <article><span>Quantidade da OF</span><strong>${formatProcessNumber(of.requestedQuantity)}</strong></article>`;
  ui.ofGenerationModalDetails.innerHTML = `
    <div><dt>Solicitante</dt><dd>${escapeHtml(sc.requesterName || "Não informado")}</dd></div>
    <div><dt>Fornecedor</dt><dd>${escapeHtml(of.supplier || "Não informado")}</dd></div>
    <div><dt>E-mail do fornecedor</dt><dd>${escapeHtml(of.supplierEmail || "Não informado")}</dd></div>
    <div><dt>Situação da SC</dt><dd>${escapeHtml(sc.status || "Não informada")}</dd></div>
    <div><dt>Situação da OF</dt><dd>${escapeHtml(of.status || "Não informada")}</dd></div>
    <div><dt>Classificação da compra</dt><dd>${escapeHtml(purchaseClassificationLabel(sc))}</dd></div>
    <div><dt>CCU da etiqueta</dt><dd>${escapeHtml(sc.allocationCostCenter || "Não informado")}</dd></div>
    <div><dt>Filial</dt><dd>${escapeHtml([record.branchCode, record.branch].filter(Boolean).join(" · ") || "Não informada")}</dd></div>
    <div><dt>Códigos dos itens</dt><dd>${escapeHtml(itemCodes.join(", ") || "Não informados")}</dd></div>
    <div><dt>Itens do processo</dt><dd>${escapeHtml(itemNames.join(" · ") || "Não informados")}</dd></div>
    <div><dt>Data de entrega da OF</dt><dd>${escapeHtml(formatDate(of.deliveryDate))}</dd></div>
    <div><dt>Valor estimado da SC</dt><dd>${formatProcessCurrency(sc.estimatedValue)}</dd></div>`;
  if (typeof ui.ofGenerationModal.showModal === "function") ui.ofGenerationModal.showModal();
  else ui.ofGenerationModal.setAttribute("open", "");
  ui.ofGenerationModalClose.focus();
}

function closeOfGenerationModal() {
  if (typeof ui.ofGenerationModal.close === "function" && ui.ofGenerationModal.open) ui.ofGenerationModal.close();
  else ui.ofGenerationModal.removeAttribute("open");
}

function exportOfGeneration(format = "excel") {
  const rows = state.visibleOfGenerationRows.map(({ sc, of, record, days, bucket, itemCodes, itemNames }) => [
    sc.code, of.code, days, bucket?.label || "", sc.date, of.date,
    sc.requesterName, record.branchCode, record.branch, sc.allocationCostCenter, purchaseClassificationLabel(sc),
    of.supplierCode, of.supplier, of.supplierEmail, sc.status, of.status,
    sc.quantity, sc.estimatedValue, of.requestedQuantity, of.deliveredQuantity, of.balance, of.unitValue,
    of.deliveryDate, itemCodes.join(" | "), itemNames.join(" | "), replenishmentResponsiblesForItemCodes(itemCodes).join(" | "),
  ]);
  exportReport(format, {
    title: "Tempo de Geração de OF",
    filename: "tempo-geracao-of.xls",
    headers: ["SC", "OF", "Tempo de geração em dias", "Faixa", "Data de criação da SC", "Data de emissão da OF", "Solicitante", "Código filial", "Filial", "SC - CCU Etq", "Classificação da compra", "Código do fornecedor", "Fornecedor", "E-mail do fornecedor", "Situação da SC", "Situação da OF", "Quantidade da SC", "Valor estimado da SC", "Quantidade solicitada na OF", "Quantidade entregue", "Saldo da OF", "Valor unitário da OF", "Data de entrega da OF", "Códigos dos itens", "Itens do processo", "Responsáveis pela reposição"],
    rows,
    numericColumns: new Set([2, 16, 17, 18, 19, 20, 21]),
    currencyColumns: new Set([17, 21]),
    dateColumns: new Set([4, 5, 22]),
    pdfIdentityColumns: [0, 1, 2],
  });
}

function renderConsumptionReview() {
  const consumption = state.consumption || { available: false };
  ui.consumptionWaiting.classList.toggle("is-hidden", consumption.available);
  ui.consumptionAvailable.classList.toggle("is-hidden", !consumption.available);
  if (!consumption.available) return;

  const visibleCodes = new Set(state.filteredItems.map((item) => item.code));
  const branch = ui.branchFilter.value;
  const location = ui.locationFilter.value;
  const replenishmentResponsible = ui.replenishmentResponsibleFilter.value;
  const visible = state.minMaxReviews.filter((review) => {
    if (!visibleCodes.has(review.item.code)) return false;
    if (!positionMatchesBranch(review.position, branch)) return false;
    if (location && review.position.locationKey !== location) return false;
    if (!positionMatchesReplenishmentResponsible(review.position, replenishmentResponsible)) return false;
    return true;
  });
  const ideal = visible.filter((review) => review.status === "ideal").length;
  const insufficient = visible.filter((review) => review.status === "insufficient").length;
  const leadTimes = visible.filter((review) => review.leadTimeSource === "real").map((review) => review.leadTimeDays);
  const averageLeadTime = leadTimes.length ? leadTimes.reduce((sum, value) => sum + value, 0) / leadTimes.length : 0;
  const financialImpact = summarizeMinMaxFinancialImpact(visible);
  ui.reviewItemCount.textContent = integerFormatter.format(new Set(visible.map((review) => review.item.code)).size);
  ui.reviewIdealCount.textContent = integerFormatter.format(ideal);
  ui.reviewAdjustCount.textContent = integerFormatter.format(visible.length - ideal - insufficient);
  ui.reviewInsufficientCount.textContent = integerFormatter.format(insufficient);
  ui.reviewAverageLeadTime.textContent = leadTimes.length ? `${numberFormatter.format(averageLeadTime)} dias` : "Sem histórico";
  ui.reviewIncreaseValue.textContent = currencyFormatter.format(financialImpact.increase);
  ui.reviewReductionValue.textContent = currencyFormatter.format(financialImpact.reduction);
  ui.reviewNetImpactValue.textContent = currencyFormatter.format(financialImpact.net);
  ui.reviewNetImpactCard.classList.toggle("is-increase", financialImpact.net > 0);
  ui.reviewNetImpactCard.classList.toggle("is-reduction", financialImpact.net < 0);
  ui.reviewResultCount.textContent = pluralize(visible.length, "posição", "posições");
  state.visibleMinMaxReviews = visible;
  state.minMaxReviewVisible = 0;

  if (!visible.length) {
    ui.reviewCardsGrid.innerHTML = `<div class="table-empty">Nenhuma posição corresponde aos filtros ou aos dados de consumo disponíveis.</div>`;
    ui.reviewLoadMore.classList.add("is-hidden");
    ui.reviewVisibleCount.textContent = "";
    return;
  }
  ui.reviewCardsGrid.replaceChildren();
  renderNextMinMaxReviewBatch();
}

function summarizeMinMaxFinancialImpact(reviews) {
  let increase = 0;
  let reduction = 0;
  for (const review of reviews || []) {
    if (review?.status !== "adjust" || !Number.isFinite(review.maximumValueImpact)) continue;
    if (review.maximumValueImpact > 0) increase += review.maximumValueImpact;
    else if (review.maximumValueImpact < 0) reduction += Math.abs(review.maximumValueImpact);
  }
  return { increase, reduction, net: increase - reduction };
}

function renderNextMinMaxReviewBatch() {
  const start = state.minMaxReviewVisible;
  const end = Math.min(start + CONFIG.reportBatch, state.visibleMinMaxReviews.length);
  if (start >= end) return;
  const html = state.visibleMinMaxReviews.slice(start, end).map((review) => {
    const status = review.status === "ideal" ? ["Parâmetros ideais", "success"]
      : review.status === "insufficient" ? ["Histórico insuficiente", "neutral"]
        : ["Ajuste recomendado", review.direction === "increase" ? "warning" : "info"];
    return `<button class="report-card review-card review-card--${review.status}" type="button" data-review-key="${escapeHtml(review.key)}">
      <span class="report-card__top"><span class="status-pill status-pill--${status[1]}">${status[0]}</span><span>${escapeHtml(review.monthCount ? `${review.consideredMonthCount}/${review.monthCount} meses considerados` : "Sem consumo")}</span></span>
      <strong class="report-card__title">${escapeHtml(review.item.name)}</strong>
      <span class="report-card__code">Código ${escapeHtml(review.item.code)}</span>
      <span class="item-card__address">${escapeHtml(`Repartição ${review.position.partition || "—"} · Prateleira ${review.position.shelf || "—"} · Divisão ${review.position.division || "—"}`)}</span>
      <span class="item-card__address">Reposição: ${escapeHtml((review.position.replenishmentResponsibles || []).join(", ") || "Não informada")}</span>
      <span class="review-card__comparison">
        <span><small>Mín. atual · margem +20%</small><strong>${formatOptionalNumber(review.currentMinimum)}</strong><i>→ ${formatOptionalNumber(review.recommendedMinimum)}</i></span>
        <span><small>Máx. atual</small><strong>${formatOptionalNumber(review.currentMaximum)}</strong><i>→ ${formatOptionalNumber(review.recommendedMaximum)}</i></span>
      </span>
      <span class="report-card__meta"><span><small>Consumo médio/mês</small><strong>${numberFormatter.format(review.averageMonthlyConsumption)}</strong></span><span><small>Lead time</small><strong>${integerFormatter.format(review.leadTimeDays)} dias</strong></span></span>
      <span class="review-card__impact review-card__impact--${review.maximumValueImpact > 0 ? "increase" : review.maximumValueImpact < 0 ? "reduce" : "neutral"}"><small>Impacto estimado no máximo</small><strong>${escapeHtml(formatValueImpact(review.maximumValueImpact, review.referencePrice))}</strong>${review.outlierMonthCount ? `<i>${pluralize(review.outlierMonthCount, "anomalia excluída", "anomalias excluídas")}</i>` : ""}</span>
      <span class="report-card__footer"><span>${escapeHtml([review.position.branchCode, review.position.localCode].filter(Boolean).join(" · ") || "—")}</span><strong>Ver análise</strong></span>
    </button>`;
  }).join("");
  ui.reviewCardsGrid.insertAdjacentHTML("beforeend", html);
  state.minMaxReviewVisible = end;
  ui.reviewVisibleCount.textContent = `Exibindo ${integerFormatter.format(end)} de ${integerFormatter.format(state.visibleMinMaxReviews.length)} análises`;
  ui.reviewLoadMore.classList.toggle("is-hidden", end >= state.visibleMinMaxReviews.length);
}

function buildMinMaxReviews() {
  const consumptionByPosition = new Map((state.consumption.records || []).map((record) => [
    `${normalizeCode(record.code)}::${record.branchCode}::${record.localCode}`,
    record,
  ]));
  const reviews = [];
  for (const item of state.items) {
    if (item.flags.inactiveOnly || !item.positions.length) continue;
    const leadByBranch = calculateItemLeadTimes(item);
    const purchasePrice = latestPurchasePrice(item);
    for (const position of item.positions) {
      const consumption = consumptionByPosition.get(`${item.code}::${position.branchCode}::${position.localCode}`);
      if (!consumption) continue;
      const leadSamples = leadByBranch.get(position.branchCode) || leadByBranch.get("") || [];
      const leadTimeDays = leadSamples.length ? median(leadSamples) : 30;
      const currentMinimum = position.minimum ?? 0;
      const currentMaximum = position.maximum ?? 0;
      const stockPrice = Number(position.unitCost) || 0;
      const referencePrice = stockPrice > 0 ? stockPrice : purchasePrice;
      const referencePriceSource = stockPrice > 0 ? "stock" : purchasePrice > 0 ? "purchase" : "unavailable";
      const metrics = calculateMinMaxMetrics({
        monthlyTotals: consumption.monthlyTotals,
        leadTimeDays,
        currentMinimum,
        currentMaximum,
        referencePrice,
      });
      const {
        monthlyAnalysis, monthCount, consideredMonthCount, outlierMonthCount, averageMonthlyConsumption,
        minimumWithoutSafetyMargin, minimumSafetyPercent,
        recommendedMinimum, recommendedMaximum, currentMinimumValue, recommendedMinimumValue,
        minimumValueImpact, currentMaximumValue, recommendedMaximumValue, maximumValueImpact,
      } = metrics;
      const enoughHistory = consideredMonthCount >= 2 && leadSamples.length > 0 && averageMonthlyConsumption > 0;
      const minIdeal = withinRecommendationRange(currentMinimum, recommendedMinimum);
      const maxIdeal = withinRecommendationRange(currentMaximum, recommendedMaximum);
      const status = !enoughHistory ? "insufficient" : minIdeal && maxIdeal ? "ideal" : "adjust";
      const currentTotal = currentMinimum + currentMaximum;
      const recommendedTotal = recommendedMinimum + recommendedMaximum;
      reviews.push({
        item, position, consumption, monthlyAnalysis, monthCount, consideredMonthCount, outlierMonthCount,
        averageMonthlyConsumption, leadTimeDays, minimumWithoutSafetyMargin, minimumSafetyPercent,
        leadTimeSource: leadSamples.length ? "real" : "estimated", leadSamples,
        currentMinimum, currentMaximum, recommendedMinimum, recommendedMaximum, status,
        referencePrice, referencePriceSource, currentMinimumValue, recommendedMinimumValue,
        minimumValueImpact, currentMaximumValue, recommendedMaximumValue, maximumValueImpact,
        direction: recommendedTotal >= currentTotal ? "increase" : "reduce",
      });
    }
  }
  reviews.sort((a, b) => {
    const statusOrder = { adjust: 0, insufficient: 1, ideal: 2 };
    return statusOrder[a.status] - statusOrder[b.status]
      || Math.abs((b.recommendedMaximum || 0) - (b.currentMaximum || 0)) - Math.abs((a.recommendedMaximum || 0) - (a.currentMaximum || 0))
      || a.item.code.localeCompare(b.item.code, "pt-BR", { numeric: true });
  });
  state.minMaxReviews = reviews;
  state.minMaxReviewByKey.clear();
  reviews.forEach((review, index) => {
    review.key = `review-${index}`;
    state.minMaxReviewByKey.set(review.key, review);
  });
}

function calculateMinMaxMetrics({ monthlyTotals = {}, leadTimeDays = 30, currentMinimum = 0, currentMaximum = 0, referencePrice = 0 } = {}) {
  const monthlyAnalysis = analyzeMonthlyConsumption(monthlyTotals);
  const consideredValues = monthlyAnalysis.filter(({ isOutlier }) => !isOutlier).map(({ value }) => value);
  const monthCount = monthlyAnalysis.length;
  const consideredMonthCount = consideredValues.length;
  const outlierMonthCount = monthCount - consideredMonthCount;
  const averageMonthlyConsumption = consideredMonthCount
    ? consideredValues.reduce((sum, value) => sum + value, 0) / consideredMonthCount
    : 0;
  const dailyConsumption = averageMonthlyConsumption / 30;
  const minimumWithoutSafetyMargin = dailyConsumption * leadTimeDays;
  const recommendedMinimum = Math.ceil(minimumWithoutSafetyMargin * MINIMUM_SAFETY_FACTOR);
  const recommendedMaximum = Math.ceil(recommendedMinimum + averageMonthlyConsumption);
  const hasReferencePrice = Number(referencePrice) > 0;
  const currentMinimumValue = hasReferencePrice ? currentMinimum * referencePrice : null;
  const recommendedMinimumValue = hasReferencePrice ? recommendedMinimum * referencePrice : null;
  const currentMaximumValue = hasReferencePrice ? currentMaximum * referencePrice : null;
  const recommendedMaximumValue = hasReferencePrice ? recommendedMaximum * referencePrice : null;
  return {
    monthlyAnalysis, monthCount, consideredMonthCount, outlierMonthCount, averageMonthlyConsumption,
    minimumWithoutSafetyMargin, minimumSafetyPercent: 20,
    recommendedMinimum, recommendedMaximum, currentMinimumValue, recommendedMinimumValue,
    minimumValueImpact: hasReferencePrice ? recommendedMinimumValue - currentMinimumValue : null,
    currentMaximumValue, recommendedMaximumValue,
    maximumValueImpact: hasReferencePrice ? recommendedMaximumValue - currentMaximumValue : null,
  };
}

function analyzeMonthlyConsumption(monthlyTotals = {}) {
  const months = Object.entries(monthlyTotals || {}).map(([month, rawValue]) => ({
    month,
    value: Math.max(Number(rawValue) || 0, 0),
    isOutlier: false,
  }));
  if (months.length < 3) return months;

  const values = months.map(({ value }) => value);
  const center = numericMedian(values);
  const deviations = values.map((value) => Math.abs(value - center));
  const mad = numericMedian(deviations);

  for (const entry of months) {
    if (mad > 0) {
      const robustScore = Math.abs(entry.value - center) / (1.4826 * mad);
      entry.isOutlier = robustScore > 3.5;
    } else if (center > 0) {
      entry.isOutlier = entry.value > center * 3 || entry.value < center / 3;
    } else {
      entry.isOutlier = entry.value > 0;
    }
  }

  if (months.filter(({ isOutlier }) => !isOutlier).length < 2) {
    months.forEach((entry) => { entry.isOutlier = false; });
  }
  return months;
}

function numericMedian(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function calculateItemLeadTimes(item) {
  const samples = new Map([["", []]]);
  const seen = new Set();
  for (const record of item.history || []) {
    if (!record.sc?.date || !record.rec?.entryDate) continue;
    const key = `${record.sc.code || ""}::${record.of?.code || ""}::${record.rec.invoice || ""}::${record.rec.series || ""}`;
    if (seen.has(key)) continue;
    const start = dateTimestamp(record.sc.date);
    const end = dateTimestamp(record.rec.entryDate);
    const days = start && end ? Math.round((end - start) / 86400000) : 0;
    if (days < 0 || days > 730) continue;
    seen.add(key);
    if (!samples.has(record.branchCode)) samples.set(record.branchCode, []);
    samples.get(record.branchCode).push(days);
    samples.get("").push(days);
  }
  return samples;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function withinRecommendationRange(current, recommended) {
  if (recommended === 0) return current === 0;
  return Math.abs(current - recommended) <= Math.max(1, recommended * 0.2);
}

function getOperationalInsight(item, branchCode = "", positionHint = null, positionsOverride = null) {
  let reviews = state.minMaxReviews.filter((review) => review.item.code === item.code);
  if (branchCode) reviews = reviews.filter((review) => review.position.branchCode === branchCode);
  if (positionsOverride) {
    const locationKeys = new Set(positionsOverride.map((position) => position.locationKey));
    reviews = reviews.filter((review) => locationKeys.has(review.position.locationKey));
  }
  if (positionHint) {
    const exact = reviews.find((review) => review.position.locationKey === positionHint.locationKey);
    if (exact) reviews = [exact];
  }
  let positions = positionsOverride || (positionHint ? [positionHint] : (item.positions || []).filter((position) => !branchCode || position.branchCode === branchCode));
  if (reviews.length) positions = reviews.map((review) => review.position);
  const averageMonthlyConsumption = reviews.reduce((sum, review) => sum + review.averageMonthlyConsumption, 0);
  const balance = positions.reduce((sum, position) => sum + (position.quantity || 0), 0);
  const branchCount = new Set(positions.map((position) => position.branchCode || position.branchName).filter(Boolean)).size;
  const requiresBranchSelection = Boolean(positionsOverride && !branchCode && branchCount > 1);
  const recommendedMinimum = reviews.length
    ? reviews.reduce((sum, review) => sum + (review.recommendedMinimum || 0), 0)
    : positions.reduce((sum, position) => sum + (position.minimum || 0), 0);
  const realLeadTimes = reviews.filter((review) => review.leadTimeSource === "real").map((review) => review.leadTimeDays);
  const fallbackLeadTimes = reviews.map((review) => review.leadTimeDays).filter((value) => value >= 0);
  const leadTimes = realLeadTimes.length ? realLeadTimes : fallbackLeadTimes;
  const leadTimeDays = leadTimes.length ? median(leadTimes) : null;
  let nextPurchase = "Sem consumo suficiente";
  let nextPurchaseDetail = "Não foi possível projetar uma data";
  if (averageMonthlyConsumption > 0) {
    const dailyConsumption = averageMonthlyConsumption / 30;
    const daysUntilReorder = Math.max(0, Math.floor((balance - recommendedMinimum) / dailyConsumption));
    if (daysUntilReorder === 0) {
      nextPurchase = "Comprar agora";
      nextPurchaseDetail = balance <= recommendedMinimum ? "Saldo no ponto de reposição" : "Reposição prevista em até 1 dia";
    } else {
      const date = new Date(Date.now() + daysUntilReorder * 86400000);
      nextPurchase = new Intl.DateTimeFormat("pt-BR").format(date);
      nextPurchaseDetail = `Em aproximadamente ${pluralize(daysUntilReorder, "dia", "dias")}`;
    }
  }
  if (requiresBranchSelection) {
    nextPurchase = "Selecione uma filial";
    nextPurchaseDetail = "A projeção é calculada individualmente por filial";
  }
  return {
    leadTimeDays,
    leadTimeSource: realLeadTimes.length ? "histórico real" : leadTimes.length ? "referência estimada" : "sem histórico",
    averageMonthlyConsumption,
    balance,
    branchCount,
    requiresBranchSelection,
    nextPurchase,
    nextPurchaseDetail,
  };
}

function renderOperationalInsights(container, insight) {
  container.innerHTML = `
    <article><span>Lead time</span><strong>${insight.leadTimeDays == null ? "Não disponível" : `${integerFormatter.format(insight.leadTimeDays)} dias`}</strong><small>${escapeHtml(insight.leadTimeSource)}</small></article>
    <article><span>Consumo médio mensal</span><strong>${numberFormatter.format(insight.averageMonthlyConsumption)}</strong><small>média dos meses considerados</small></article>
    <article><span>Saldo atual</span><strong>${insight.requiresBranchSelection ? "Ver saldos acima" : numberFormatter.format(insight.balance)}</strong><small>${insight.requiresBranchSelection ? `${integerFormatter.format(insight.branchCount)} filiais exibidas` : "posição considerada"}</small></article>
    <article class="operational-insights__projection"><span>Próxima compra</span><strong>${escapeHtml(insight.nextPurchase)}</strong><small>${escapeHtml(insight.nextPurchaseDetail)}</small></article>`;
}

function openMinMaxReviewModal(key) {
  const review = state.minMaxReviewByKey.get(key);
  if (!review) return;
  state.activeMinMaxReview = review;
  state.lastFocusedElement = document.activeElement;
  const { item, position } = review;
  ui.reviewModalCode.textContent = `Item ${item.code}`;
  ui.reviewModalTitle.textContent = item.name;
  ui.reviewModalSubtitle.textContent = [position.branchCode, position.branchName, position.localCode, position.localName].filter(Boolean).join(" · ");
  ui.reviewModalSummary.innerHTML = `
    <article><span>Consumo médio/mês</span><strong>${numberFormatter.format(review.averageMonthlyConsumption)}</strong><small>${review.consideredMonthCount} de ${review.monthCount} meses considerados</small></article>
    <article><span>Lead time utilizado</span><strong>${integerFormatter.format(review.leadTimeDays)} dias</strong></article>
    <article><span>Saldo atual</span><strong>${numberFormatter.format(position.quantity)}</strong></article>
    <article><span>Mínimo atual</span><strong>${formatOptionalNumber(review.currentMinimum)}</strong></article>
    <article><span>Máximo atual</span><strong>${formatOptionalNumber(review.currentMaximum)}</strong></article>
    <article><span>Mínimo sugerido</span><strong>${formatOptionalNumber(review.recommendedMinimum)}</strong><small>inclui margem preventiva de 20%</small></article>
    <article><span>Máximo sugerido</span><strong>${formatOptionalNumber(review.recommendedMaximum)}</strong></article>
    <article><span>Próxima compra</span><strong>${escapeHtml(getOperationalInsight(item, position.branchCode, position).nextPurchase)}</strong></article>
    <article><span>Preço de referência</span><strong>${review.referencePrice > 0 ? currencyFormatter.format(review.referencePrice) : "Não disponível"}</strong><small>${review.referencePriceSource === "stock" ? "Custo unitário atual" : review.referencePriceSource === "purchase" ? "Último preço de compra" : "Sem preço disponível"}</small></article>
    <article class="review-impact-summary review-impact-summary--${review.maximumValueImpact > 0 ? "increase" : review.maximumValueImpact < 0 ? "reduce" : "neutral"}"><span>Impacto no estoque máximo</span><strong>${escapeHtml(formatValueImpact(review.maximumValueImpact, review.referencePrice))}</strong><small>${formatReferenceValue(review.currentMaximumValue, review.referencePrice)} → ${formatReferenceValue(review.recommendedMaximumValue, review.referencePrice)}</small></article>`;
  const message = review.status === "ideal"
    ? "Os parâmetros atuais estão dentro da faixa aceitável de ±20% da recomendação calculada."
    : review.status === "insufficient"
      ? "Não há histórico suficiente para uma validação conclusiva. A sugestão é indicativa e usa 30 dias quando não existe lead time real."
      : `${review.direction === "increase" ? "Elevar" : "Reduzir"} os parâmetros para aproximar a cobertura do consumo e do prazo real de reposição.`;
  ui.reviewModalRecommendation.className = `review-recommendation review-recommendation--${review.status}`;
  ui.reviewModalRecommendation.innerHTML = `<span>${review.status === "ideal" ? "Parâmetro validado" : review.status === "adjust" ? "Alteração proposta" : "Análise indicativa"}</span><strong>${escapeHtml(message)}</strong><small>Mínimo = (consumo diário sem anomalias × lead time) + margem preventiva de 20%. Máximo = mínimo sugerido + 30 dias de consumo. Validação com tolerância de ±20%. Meses muito fora do padrão são excluídos por análise robusta da mediana.</small>`;
  const months = review.monthlyAnalysis;
  ui.reviewModalDetails.innerHTML = `
    <section><h3>Consumo mensal</h3><div class="monthly-consumption-list">${months.map(({ month, value, isOutlier }) => `<span class="${isOutlier ? "is-outlier" : "is-considered"}"><small>${escapeHtml(month)}</small><strong>${numberFormatter.format(value)}</strong><i>${isOutlier ? "Anomalia excluída" : "Considerado na média"}</i></span>`).join("")}</div></section>
    <section><h3>Base do lead time</h3><dl><div><dt>Origem</dt><dd>${review.leadTimeSource === "real" ? "Mediana entre criação da SC e entrada do recebimento" : "Padrão estimado de 30 dias"}</dd></div><div><dt>Amostras válidas</dt><dd>${integerFormatter.format(review.leadSamples.length)}</dd></div><div><dt>Tempos encontrados</dt><dd>${review.leadSamples.length ? review.leadSamples.map((value) => `${value} dias`).join(", ") : "Nenhum recebimento relacionado"}</dd></div></dl></section>
    <section><h3>Posição atual</h3><dl><div><dt>Saldo</dt><dd>${numberFormatter.format(position.quantity)}</dd></div><div><dt>Responsável pela reposição</dt><dd>${escapeHtml((position.replenishmentResponsibles || []).join(", ") || "Não informado")}</dd></div><div><dt>Repartição</dt><dd>${escapeHtml(position.partition || "Não informada")}</dd></div><div><dt>Prateleira</dt><dd>${escapeHtml(position.shelf || "Não informada")}</dd></div><div><dt>Divisão</dt><dd>${escapeHtml(position.division || "Não informada")}</dd></div><div><dt>Custo unitário</dt><dd>${currencyFormatter.format(position.unitCost || 0)}</dd></div></dl></section>
    <section class="review-financial-impact"><h3>Impacto financeiro estimado</h3><dl><div><dt>Mínimo atual</dt><dd>${formatReferenceValue(review.currentMinimumValue, review.referencePrice)}</dd></div><div><dt>Mínimo sugerido</dt><dd>${formatReferenceValue(review.recommendedMinimumValue, review.referencePrice)}</dd></div><div><dt>Impacto no mínimo</dt><dd class="impact-value impact-value--${review.minimumValueImpact > 0 ? "increase" : review.minimumValueImpact < 0 ? "reduce" : "neutral"}">${escapeHtml(formatValueImpact(review.minimumValueImpact, review.referencePrice))}</dd></div><div><dt>Máximo atual</dt><dd>${formatReferenceValue(review.currentMaximumValue, review.referencePrice)}</dd></div><div><dt>Máximo sugerido</dt><dd>${formatReferenceValue(review.recommendedMaximumValue, review.referencePrice)}</dd></div><div><dt>Impacto no máximo</dt><dd class="impact-value impact-value--${review.maximumValueImpact > 0 ? "increase" : review.maximumValueImpact < 0 ? "reduce" : "neutral"}">${escapeHtml(formatValueImpact(review.maximumValueImpact, review.referencePrice))}</dd></div></dl></section>`;
  if (typeof ui.reviewModal.showModal === "function") ui.reviewModal.showModal(); else ui.reviewModal.setAttribute("open", "");
  ui.reviewModalClose.focus();
}

function closeMinMaxReviewModal() {
  if (typeof ui.reviewModal.close === "function" && ui.reviewModal.open) ui.reviewModal.close();
  else ui.reviewModal.removeAttribute("open");
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
  const cardPositions = currentScopedPositions(item, false);
  const addressPosition = cardPositions.find((position) => position.quantity > 0) || cardPositions[0] || item.positions[0];
  const address = addressPosition ? [
    `Repartição ${addressPosition.partition || "—"}`,
    `Prateleira ${addressPosition.shelf || "—"}`,
    `Divisão ${addressPosition.division || "—"}`,
  ].join(" · ") : "Endereço não informado";
  const replenishmentResponsibles = scopedReplenishmentResponsibles(item);

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
          <span class="item-card__address">${escapeHtml(address)}</span>
          <span class="item-card__address">Reposição: ${escapeHtml(replenishmentResponsibles.join(", ") || "Não informada")}</span>
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

function statusBadges(item, scopedPositions = null, scopedHistory = null) {
  const badges = [];
  const positions = scopedPositions || item.positions || [];
  const scoped = Array.isArray(scopedPositions);
  const hasPosition = positions.length > 0;
  if (!hasPosition && item.flags.purchaseOnly) badges.push(["Sem posição de estoque", "neutral"]);
  if (positions.some((position) => position.quantity < 0)) badges.push(["Saldo negativo", "danger"]);
  if (positions.some((position) => position.quantity === 0 && position.minimum + position.maximum > 0)) badges.push(["Fora de estoque", "neutral"]);
  if (positions.some((position) => position.minimum > 0 && position.quantity > 0 && position.quantity < position.minimum)) badges.push(["Abaixo do mínimo", "warning"]);
  if (positions.some((position) => position.maximum > 0 && position.quantity > position.maximum)) badges.push(["Acima do máximo", "danger"]);
  if (positions.some((position) => position.quantity > 0 && position.minimum + position.maximum === 0)) badges.push(["Com saldo sem mín. e máx.", "info"]);
  if ((!scoped && item.flags.locationAdjustment) || (scoped && itemNeedsLocationAdjustment(item, ui.branchFilter.value, ui.locationFilter.value))) badges.push(["Ajustar local de estoque", "warning"]);
  const history = scopedHistory || item.history || [];
  if (history.some((record) => record.sc?.code && !record.of?.code && isActiveScForPurchaseCoverage(record.sc))) badges.push(["SC sem OF", "violet"]);
  if (!badges.length && positions.reduce((sum, position) => sum + (position.quantity || 0), 0) > 0) badges.push(["Saldo disponível", "success"]);
  return badges;
}

function badgeHtml([label, type]) {
  return `<span class="badge badge--${type}">${escapeHtml(label)}</span>`;
}

function modalScopedPositions(item) {
  let positions = currentScopedPositions(item);
  if (ui.positiveBalanceFilter.checked) positions = positions.filter((position) => position.quantity > 0);
  return positions;
}

function modalScopedHistory(item) {
  const branch = effectiveBranchFilter();
  const supplier = normalizeSearch(ui.supplierFilter.value);
  const requester = ui.requesterFilter.value;
  const scStatus = ui.scStatusFilter.value;
  const query = normalizeSearch(ui.searchInput.value);
  return (item.history || []).filter((record) => {
    if (!recordMatchesCcuClassification(record, item, ui.ccuClassificationFilter.value)) return false;
    if (branch && record.branchCode !== branch) return false;
    if (supplier && ![record.of?.supplier, record.rec?.supplier].some((value) => normalizeSearch(value) === supplier)) return false;
    if (!recordMatchesRequester(record, requester)) return false;
    if (scStatus && procurementRecordStatus(record) !== scStatus) return false;
    if (query && !recordMatchesQuery(item, record, query)) return false;
    return true;
  });
}

function renderBranchBalances(positions) {
  const branches = new Map();
  for (const position of positions) {
    const key = position.branchCode || position.branchName || "Sem filial";
    const branch = branches.get(key) || {
      label: [position.branchCode, position.branchName].filter(Boolean).join(" · ") || "Filial não informada",
      quantity: 0,
      positions: 0,
    };
    branch.quantity += position.quantity || 0;
    branch.positions += 1;
    branches.set(key, branch);
  }
  if (!branches.size) {
    ui.modalBranchBalances.innerHTML = `<p class="branch-balance-empty">Nenhuma posição corresponde aos filtros ativos.</p>`;
    return;
  }
  ui.modalBranchBalances.innerHTML = [...branches.values()].map((branch) => `<article>
    <span>${escapeHtml(branch.label)}</span>
    <strong>${numberFormatter.format(branch.quantity)}</strong>
    <small>Saldo na filial · ${pluralize(branch.positions, "posição", "posições")}</small>
  </article>`).join("");
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
  const positions = modalScopedPositions(item);
  const history = modalScopedHistory(item);
  ui.modalBadges.innerHTML = statusBadges(item, positions, history).map(badgeHtml).join("");
  renderBranchBalances(positions);
  ui.modalStockValue.textContent = currencyFormatter.format(positions.reduce((sum, position) => sum + (position.stockValue || 0), 0));
  ui.modalPositionCount.textContent = integerFormatter.format(positions.length);
  ui.modalHistoryCount.textContent = integerFormatter.format(history.length);
  renderOperationalInsights(ui.modalOperationalInsights, getOperationalInsight(item, "", null, positions));

  const lastPurchase = history.find((record) => record.rec?.entryDate || record.of?.date || record.sc?.date);
  const scopedSuppliers = unique(history.flatMap((record) => [record.rec?.supplier, record.of?.supplier]).filter(Boolean));
  const scopedPrice = latestPurchasePriceFromRecords(history);
  const details = [
    ["Descrição detalhada", item.detailedName || item.name],
    ["Categoria / grupo", (item.categories || []).join(" · ") || "Não informado"],
    ["Unidade", (item.units || []).join(", ") || "Não informada"],
    ["Filiais", unique(positions.map((position) => position.branchName || position.branchCode)).join(" · ") || "Sem posição nos filtros"],
    ["Fornecedores", scopedSuppliers.join(" · ") || "Sem fornecedor nos filtros"],
    ["Última movimentação de compra", formatDate(lastPurchase?.rec?.entryDate || lastPurchase?.of?.date || lastPurchase?.sc?.date)],
    ["Último preço conhecido", scopedPrice > 0 ? currencyFormatter.format(scopedPrice) : "Não informado"],
  ];
  ui.modalDetails.innerHTML = details.map(([term, value]) => `<dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd>`).join("");
  renderStorageAddresses(item, positions);

  renderGallery(item);
  renderStock(item, positions);
  renderHistory(item, history);
  activateTab("summary");

  if (!ui.itemModal.open) ui.itemModal.showModal();
}

function renderStorageAddresses(item, scopedPositions = null) {
  const positions = scopedPositions || item.positions || [];
  const heading = `<header><span class="storage-address-block__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 5h16v14H4zM4 10h16M9 5v14M15 5v14"></path></svg></span><div><strong>Endereço de armazenagem</strong><small>Localização física do item</small></div></header>`;
  if (!positions.length) {
    ui.modalAddressBlock.innerHTML = `${heading}<p class="storage-address-empty">${scopedPositions ? "Nenhuma posição corresponde aos filtros ativos." : "Este item não possui posição de estoque cadastrada."}</p>`;
    return;
  }
  ui.modalAddressBlock.innerHTML = `${heading}<div class="storage-address-list">${positions.map((position) => `
    <article>
      <span class="storage-address-context">${escapeHtml([position.branchCode, position.localCode, position.localName].filter(Boolean).join(" · ") || "Posição não identificada")}</span>
      <div class="storage-address-fields">
        <span><small>Repartição</small><strong>${escapeHtml(position.partition || "Não informada")}</strong></span>
        <span><small>Prateleira</small><strong>${escapeHtml(position.shelf || "Não informada")}</strong></span>
        <span><small>Divisão</small><strong>${escapeHtml(position.division || "Não informada")}</strong></span>
        <span><small>Responsável pela reposição</small><strong>${escapeHtml((position.replenishmentResponsibles || []).join(", ") || "Não informado")}</strong></span>
      </div>
    </article>`).join("")}</div>`;
}

function formatItemAddress(item, branchCode = "") {
  const responsible = ui.replenishmentResponsibleFilter.value;
  const scoped = (item.positions || []).filter((position) => {
    if (branchCode && position.branchCode !== branchCode) return false;
    return positionMatchesReplenishmentResponsible(position, responsible);
  });
  const position = scoped.find((entry) => entry.quantity > 0) || scoped[0];
  if (!position) return "Endereço não informado";
  return `Repartição ${position.partition || "—"} · Prateleira ${position.shelf || "—"} · Divisão ${position.division || "—"}`;
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

function renderStock(item, scopedPositions = null) {
  const positions = scopedPositions || item.positions || [];
  if (!positions.length) {
    ui.stockTableWrap.innerHTML = `<div class="table-empty">${scopedPositions ? "Nenhuma posição corresponde aos filtros ativos." : "Este item aparece no histórico de compras, mas não possui posição no arquivo de saldo."}</div>`;
    return;
  }

  const rows = positions.map((position) => {
    const badges = [];
    if (position.negative) badges.push(["Negativo", "danger"]);
    if (position.outOfStock) badges.push(["Fora", "neutral"]);
    if (position.belowMin) badges.push(["Abaixo mín.", "warning"]);
    if (position.aboveMax) badges.push(["Acima máx.", "danger"]);
    if (position.unconfigured) badges.push(["Sem mín. e máx.", "info"]);

    return `<tr>
      <td>${escapeHtml([position.branchCode, position.branchName].filter(Boolean).join(" · "))}</td>
      <td class="cell-wrap">${escapeHtml([position.localCode, position.localName].filter(Boolean).join(" · "))}</td>
      <td class="number">${numberFormatter.format(position.quantity)}</td>
      <td class="number">${formatOptionalNumber(position.minimum)}</td>
      <td class="number">${formatOptionalNumber(position.maximum)}</td>
      <td class="number">${currencyFormatter.format(position.unitCost)}</td>
      <td class="number">${currencyFormatter.format(position.stockValue)}</td>
      <td>${escapeHtml(position.shelf || "—")}</td>
      <td class="cell-wrap">${escapeHtml((position.replenishmentResponsibles || []).join(", ") || "—")}</td>
      <td>${badges.length ? badges.map(badgeHtml).join(" ") : badgeHtml(["Normal", "success"])}</td>
    </tr>`;
  }).join("");

  ui.stockTableWrap.innerHTML = `<table class="data-table">
    <thead><tr>
      <th>Filial</th><th>Local</th><th class="number">Saldo</th><th class="number">Mínimo</th>
      <th class="number">Máximo</th><th class="number">Custo unit.</th><th class="number">Valor</th>
      <th>Prateleira</th><th>Responsável pela reposição</th><th>Situação</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderHistory(item, scopedHistory = null) {
  const history = scopedHistory || item.history || [];
  const total = history.length;
  ui.historySummary.textContent = pluralize(total, "registro", "registros");

  if (!total) {
    ui.historyTableWrap.innerHTML = `<div class="table-empty">${scopedHistory ? "Nenhum registro de compra corresponde aos filtros ativos." : "Nenhuma solicitação, ordem ou nota foi localizada para este código."}</div>`;
    ui.historyLoadMore.classList.add("is-hidden");
    return;
  }

  const visible = history.slice(0, state.historyVisible);
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

function formatValueImpact(value, referencePrice) {
  if (!(Number(referencePrice) > 0)) return "Preço indisponível";
  const impact = Number(value) || 0;
  if (Math.abs(impact) < 0.005) return "Sem impacto financeiro";
  return `${impact > 0 ? "Aumento" : "Redução"} de ${currencyFormatter.format(Math.abs(impact))}`;
}

function formatReferenceValue(value, referencePrice) {
  return Number(referencePrice) > 0 ? currencyFormatter.format(Number(value) || 0) : "Não disponível";
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
      const { saldoUrl, comprasApiUrl, commitsApiUrl, comprasFallbackUrl, replenishmentUrl, consumoUrl } = event.data;
      progress("Baixando os arquivos de saldo, compras e responsáveis…", 8);
      const [saldoText, comprasSources, replenishmentText, consumoText, baseUpdatedAt] = await Promise.all([
        fetchText(saldoUrl, "Saldo_Online"),
        fetchPurchaseParts(comprasApiUrl, comprasFallbackUrl),
        fetchOptionalText(replenishmentUrl),
        fetchOptionalText(consumoUrl),
        fetchLatestCsvUpdate(commitsApiUrl),
      ]);
      progress("Arquivos baixados. Iniciando a consolidação…", 28);

      const items = new Map();
      const replenishmentByLocation = parseReplenishmentCsv(replenishmentText);
      let saldoRows = 0;
      let comprasRows = 0;

      progress("Consolidando saldos por código, filial e local…", 36);
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

        const branchCode = clean(get("Cd Filial"));
        const localCode = clean(get("Cd Local"));
        const partition = clean(get("Cd Reparticao"));
        const position = {
          branchCode,
          branchName: resolveStockBranchName(branchCode, localCode, partition, clean(get("Nm Filial"))),
          localType: clean(get("Tipo Local")),
          localCode,
          localName: clean(get("Ds Local Estoque")),
          quantity,
          minimum: minimumRaw,
          maximum: maximumRaw,
          unitCost,
          stockValue,
          forecast: parseNumber(get("Qt Previsao Consumo")),
          shelf: clean(get("Cd Prateleira")),
          partition,
          division: clean(get("Cd Divisao")),
          replenishmentResponsibles: replenishmentByLocation.get(responsibleLocationKey(branchCode, localCode)) || [],
          belowMin: minimum > 0 && quantity < minimum,
          aboveMax: maximum > 0 && quantity > maximum,
          outOfStock: limitsSumZero && quantity === 0,
          unconfigured: limitsSumZero && quantity > 0,
          negative: quantity < 0,
        };
        position.branchKey = `${position.branchCode}::branch::${position.branchName}`;
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

      progress(`Relacionando solicitações, ordens e recebimentos de ${comprasSources.length.toLocaleString("pt-BR")} arquivo(s)…`, 55);
      for (let sourceIndex = 0; sourceIndex < comprasSources.length; sourceIndex += 1) {
        const comprasSource = comprasSources[sourceIndex];
        parseCsv(comprasSource.text, (headers, row) => {
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
          requesterName: clean(get("SC - Nome Solicitante")),
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
          supplierEmail: clean(get("OF - Email Fornecedor")),
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
        progress(`Parte ${sourceIndex + 1} de ${comprasSources.length} consolidada…`, 55 + ((sourceIndex + 1) / Math.max(1, comprasSources.length)) * 30);
      }

      progress("Preparando os cards e os indicadores…", 90);
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
        item.replenishmentResponsibles = [...new Set(item.positions.flatMap((position) => position.replenishmentResponsibles || []))]
          .sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
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
        payload: { items: output, saldoRows, comprasRows, comprasFiles: comprasSources.map((source) => source.name), baseUpdatedAt, consumption },
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

  async function fetchPurchaseParts(apiUrl, fallbackUrl) {
    let partFiles = [];
    if (apiUrl) {
      try {
        const response = await fetch(apiUrl, { cache: "no-store", headers: { Accept: "application/vnd.github+json" } });
        if (response.ok) {
          const entries = await response.json();
          partFiles = (Array.isArray(entries) ? entries : [])
            .filter((entry) => entry?.type === "file" && /^01 - Compras_Almox_Parte_\d+\.csv$/i.test(entry.name || "") && entry.download_url)
            .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { numeric: true, sensitivity: "base" }));
        }
      } catch {
        partFiles = [];
      }
    }

    if (partFiles.length) {
      const loaded = await Promise.allSettled(partFiles.map(async (file) => ({
        name: file.name,
        text: await fetchText(file.download_url, file.name),
      })));
      return loaded.filter((result) => result.status === "fulfilled").map((result) => result.value);
    }

    const fallbackText = await fetchOptionalText(fallbackUrl);
    return fallbackText === null ? [] : [{ name: "01 - Compras_Almox.csv", text: fallbackText }];
  }

  async function fetchLatestCsvUpdate(apiUrl) {
    if (!apiUrl) return "";
    try {
      const response = await fetch(apiUrl, { cache: "no-store", headers: { Accept: "application/vnd.github+json" } });
      if (!response.ok) return "";
      const commits = await response.json();
      const candidates = (Array.isArray(commits) ? commits : [])
        .filter((entry) => /add files via upload|csv|saldo|compras|consumo|base/i.test(entry?.commit?.message || ""))
        .slice(0, 6);
      for (const entry of candidates) {
        if (!entry?.url) continue;
        const detailResponse = await fetch(entry.url, { cache: "no-store", headers: { Accept: "application/vnd.github+json" } });
        if (!detailResponse.ok) continue;
        const detail = await detailResponse.json();
        if (!(detail.files || []).some((file) => /\.csv$/i.test(file.filename || ""))) continue;
        return entry.commit?.author?.date || entry.commit?.committer?.date || "";
      }
    } catch {
      return "";
    }
    return "";
  }

  function parseConsumptionCsv(text) {
    if (text === null) return { available: false, headers: [], records: [], rowCount: 0 };
    let headers = [];
    const records = new Map();
    let rowCount = 0;
    parseCsv(text, (csvHeaders, row) => {
      if (!headers.length) headers = csvHeaders.map(clean);
      rowCount += 1;
      const get = rowGetter(csvHeaders, row);
      const code = normalizeItemCode(get("Cod_Item"));
      const branchCode = clean(get("Cd Filial"));
      const localCode = clean(get("Local"));
      const month = clean(get("mÊs"));
      const quantity = parseNumber(get("Qt Movimento")) ?? 0;
      if (!code || !branchCode || !localCode || !month || isEchoHeader(code)) return;
      const key = `${code}::${branchCode}::${localCode}`;
      if (!records.has(key)) records.set(key, {
        code,
        branchCode,
        branchName: clean(get("Nm Filial")),
        localCode,
        localName: clean(get("Ds Local Estoque")),
        monthlyTotals: {},
      });
      const record = records.get(key);
      record.monthlyTotals[month] = (record.monthlyTotals[month] || 0) + quantity;
    });
    return { available: true, headers, records: [...records.values()], rowCount };
  }

  function parseReplenishmentCsv(text) {
    const assignments = new Map();
    if (text === null) return assignments;
    const meaningfulText = text.split(/\r?\n/)
      .filter((line) => /[^;\s]/.test(line))
      .join("\n");
    parseCsv(meaningfulText, (headers, row) => {
      const get = rowGetter(headers, row);
      const branchCode = clean(get("FILIAL"));
      const localCode = clean(get("CD LOCAL"));
      const responsible = clean(get("NOME REPOSITOR"));
      if (!branchCode || !localCode || !responsible) return;
      const key = responsibleLocationKey(branchCode, localCode);
      const values = assignments.get(key) || [];
      if (!values.some((value) => normalizeText(value) === normalizeText(responsible))) values.push(responsible);
      assignments.set(key, values);
    });
    return assignments;
  }

  function responsibleLocationKey(branchCode, localCode) {
    const normalizeCodePart = (value) => {
      const part = clean(value);
      return /^\d+$/.test(part) ? String(Number(part)) : part.toUpperCase();
    };
    return `${normalizeCodePart(branchCode)}::${normalizeCodePart(localCode)}`;
  }

  function progress(message, percent) {
    self.postMessage({ type: "progress", message, percent });
  }

  function resolveStockBranchName(branchCode, localCode, partition, originalName) {
    const normalizedBranch = clean(branchCode);
    const normalizedLocal = clean(localCode);
    const normalizedPartition = clean(partition).toUpperCase();
    const preparedPartitions = new Set(["AP", "99", "SS"]);
    const isSingleLetter = /^[A-Z]$/.test(normalizedPartition);
    const isPreparedLocal = normalizedLocal === "101" || (/^\d+$/.test(normalizedLocal) && Number(normalizedLocal) > 599);
    const isPreparedPartition = normalizedLocal === "299" && (preparedPartitions.has(normalizedPartition) || isSingleLetter);
    if (normalizedBranch === "704" && (isPreparedLocal || isPreparedPartition)) {
      return "ROLANDIA - ALM. PREPARADOS";
    }
    return originalName;
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
  module.exports = { inventoryWorker, formatDate, createPdfBlob, buildPdfColumnGroups, isClosedOf, isOpenOfForPurchase, getItemPurchaseCommitments, isWarehouseSc, itemHasWarehouseStock, itemIsWarehouseStockItem, recordMatchesCcuClassification, positionMatchesReplenishmentResponsible, loadingProgressCeilingFor, analyzeMonthlyConsumption, numericMedian, calculateMinMaxMetrics, pendingScRowsForExport, procurementFunnelCounts, summarizeMinMaxFinancialImpact, isCavacoItem, isCavacoOfAlert, generationDaysBetween, ofGenerationBucketFor, calculateOfGenerationMetrics, ofGenerationDateParts, buildOfGenerationTrend };
}
