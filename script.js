"use strict";

const CONFIG = Object.freeze({
  saldoFile: "00 - Saldo_Online.csv",
  comprasFile: "01 - Compras_Almox.csv",
  imageApi: "https://api.github.com/repos/tiagosilvagba/Almoxarifado/contents/imagens?ref=main",
  imageFolder: "imagens",
  maxImages: 5,
  historyBatch: 20,
});

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
};

const ui = {};

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", init);
}

async function init() {
  cacheUi();
  bindEvents();
  await loadCatalog();
}

function cacheUi() {
  const ids = [
    "statusLine", "refreshButton", "loadingPanel", "loadingTitle", "loadingMessage",
    "retryButton", "catalogContent", "metricsContext", "metricItems", "metricQuantity",
    "metricValue", "metricOutOfStock", "metricBelowMin", "metricAboveMax",
    "metricUnconfigured", "metricPendingSc", "metricNegative", "searchInput",
    "branchFilter", "locationFilter", "categoryFilter", "unitFilter", "supplierFilter",
    "positiveBalanceFilter", "clearFilters", "resultCount", "cardsGrid", "emptyState",
    "loadMoreButton", "visibleCount", "itemModal", "modalCode", "modalTitle",
    "modalSubtitle", "modalClose", "modalBadges", "modalGallery", "modalBalance",
    "modalStockValue", "modalPositionCount", "modalHistoryCount", "modalDetails",
    "stockTableWrap", "historySummary", "historyTableWrap", "historyLoadMore",
  ];

  for (const id of ids) {
    ui[id] = document.getElementById(id);
  }

  ui.tabs = [...document.querySelectorAll(".modal-tab")];
  ui.panels = [...document.querySelectorAll(".tab-panel")];
}

function bindEvents() {
  const debouncedSearch = debounce(applyFilters, 180);
  ui.searchInput.addEventListener("input", debouncedSearch);

  for (const element of [
    ui.branchFilter,
    ui.locationFilter,
    ui.categoryFilter,
    ui.unitFilter,
    ui.supplierFilter,
    ui.positiveBalanceFilter,
  ]) {
    element.addEventListener("change", applyFilters);
  }

  ui.clearFilters.addEventListener("click", clearFilters);
  ui.loadMoreButton.addEventListener("click", renderNextBatch);
  ui.refreshButton.addEventListener("click", loadCatalog);
  ui.retryButton.addEventListener("click", loadCatalog);
  ui.historyLoadMore.addEventListener("click", () => {
    state.historyVisible += CONFIG.historyBatch;
    renderHistory(state.activeItem);
  });

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
    state.imageIndex = await state.imagePromise;
    prepareItems();
    populateFilters();
    applyFilters();

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
  ui.catalogContent.classList.add("is-hidden");
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
  fillSelect(ui.locationFilter, [...locations], "Todos os locais");
  fillSelect(ui.categoryFilter, [...categories].map((value) => [value, value]), "Todas as categorias");
  fillSelect(ui.unitFilter, [...units].map((value) => [value, value]), "Todas as unidades");
  fillSelect(ui.supplierFilter, [...suppliers].map((value) => [value, value]), "Todos os fornecedores");
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
  ui.positiveBalanceFilter.checked = false;
  applyFilters();
  ui.searchInput.focus();
}

function applyFilters() {
  const query = normalizeSearch(ui.searchInput.value);
  const branch = ui.branchFilter.value;
  const location = ui.locationFilter.value;
  const category = ui.categoryFilter.value;
  const unit = ui.unitFilter.value;
  const supplier = ui.supplierFilter.value;
  const positiveOnly = ui.positiveBalanceFilter.checked;

  state.filteredItems = state.items.filter((item) => {
    if (query && !item.searchText.includes(query)) return false;
    if (branch && !(item.positions || []).some((position) => position.branchCode === branch)) return false;
    if (location && !(item.positions || []).some((position) => position.locationKey === location)) return false;
    if (category && !(item.categories || []).includes(category)) return false;
    if (unit && !(item.units || []).includes(unit)) return false;
    if (supplier && !(item.suppliers || []).includes(supplier)) return false;
    if (positiveOnly && item.balanceTotal <= 0) return false;
    return true;
  });

  const filtersActive = Boolean(query || branch || location || category || unit || supplier || positiveOnly);
  ui.metricsContext.textContent = filtersActive ? "Base filtrada" : "Base completa";
  ui.resultCount.textContent = pluralize(state.filteredItems.length, "item", "itens");

  updateMetrics(state.filteredItems);
  state.renderedCount = 0;
  ui.cardsGrid.replaceChildren();
  renderNextBatch();
}

function updateMetrics(items) {
  let codesWithStock = 0;
  let value = 0;
  let outOfStock = 0;
  let belowMin = 0;
  let aboveMax = 0;
  let unconfigured = 0;
  let negative = 0;
  const pendingSc = new Set();

  for (const item of items) {
    if (item.balanceTotal > 0) codesWithStock += 1;
    value += item.stockValueTotal || 0;
    if (item.flags.outOfStock) outOfStock += 1;
    if (item.flags.belowMin) belowMin += 1;
    if (item.flags.aboveMax) aboveMax += 1;
    if (item.flags.unconfigured) unconfigured += 1;
    if (item.flags.negative) negative += 1;
    for (const sc of item.pendingScCodes || []) pendingSc.add(sc);
  }

  ui.metricItems.textContent = integerFormatter.format(items.length);
  ui.metricQuantity.textContent = integerFormatter.format(codesWithStock);
  ui.metricQuantity.title = pluralize(codesWithStock, "código com saldo", "códigos com saldo");
  ui.metricValue.textContent = compactCurrencyFormatter.format(value);
  ui.metricValue.title = currencyFormatter.format(value);
  ui.metricOutOfStock.textContent = integerFormatter.format(outOfStock);
  ui.metricBelowMin.textContent = integerFormatter.format(belowMin);
  ui.metricAboveMax.textContent = integerFormatter.format(aboveMax);
  ui.metricUnconfigured.textContent = integerFormatter.format(unconfigured);
  ui.metricPendingSc.textContent = integerFormatter.format(pendingSc.size);
  ui.metricNegative.textContent = integerFormatter.format(negative);
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
      const { saldoUrl, comprasUrl } = event.data;
      progress("Baixando os dois arquivos CSV…");
      const [saldoText, comprasText] = await Promise.all([
        fetchText(saldoUrl, "Saldo_Online"),
        fetchText(comprasUrl, "Compras_Almox"),
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

      self.postMessage({
        type: "complete",
        payload: { items: output, saldoRows, comprasRows },
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
