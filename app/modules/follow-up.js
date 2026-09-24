"use strict";

(function initializeFollowUpModule(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root?.document) api.install(root);
})(typeof window !== "undefined" ? window : null, () => {
  const DELIVERY_TOTAL = "Entrega total pendente";
  const DELIVERY_PARTIAL = "Entrega parcial";

  const normalize = (value) => String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);

  function toNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function isTruthyFlag(value) {
    return ["s", "sim", "1", "true", "yes"].includes(normalize(value));
  }

  function isPurchaseConfirmed(sc) {
    return Boolean(sc?.code)
      && !isTruthyFlag(sc.cancelled)
      && normalize(sc.status).includes("compra confirmada");
  }

  function isClosedPurchaseOrder(of) {
    if (!of) return false;
    return isTruthyFlag(of.closed)
      || /(fechad|encerrad|finalizad|concluid|cancelad|closed)/.test(normalize(of.status));
  }

  function pendingQuantity(of) {
    const balance = Math.max(0, toNumber(of?.balance));
    const requested = Math.max(0, toNumber(of?.requestedQuantity ?? of?.quantity));
    const delivered = Math.max(0, toNumber(of?.deliveredQuantity));
    return balance > 0 ? balance : Math.max(0, requested - delivered);
  }

  function followUpDeliveryState(of) {
    if (!(pendingQuantity(of) > 0)) return "";
    return toNumber(of?.deliveredQuantity) > 0 ? DELIVERY_PARTIAL : DELIVERY_TOTAL;
  }

  function isFollowUpRecord(record) {
    const sc = record?.sc;
    const of = record?.of;
    return isPurchaseConfirmed(sc)
      && Boolean(of?.code)
      && !isClosedPurchaseOrder(of)
      && pendingQuantity(of) > 0;
  }

  function recordKey(item, record) {
    const sc = record?.sc || {};
    const of = record?.of || {};
    return [item?.code, sc.code, sc.sequence || "sem-seq", of.code].map(normalize).join("::");
  }

  function daysSince(value, now = Date.now()) {
    if (!value) return 0;
    const match = String(value).match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
    const parsed = match
      ? new Date(Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]), Number(match[2]) - 1, Number(match[1]))
      : new Date(value);
    return Number.isNaN(parsed.getTime()) ? 0 : Math.max(0, Math.floor((now - parsed.getTime()) / 86400000));
  }

  function ageBucket(days) {
    if (days > 30) return ">30 dias";
    if (days > 20) return "21–30 dias";
    if (days > 15) return "16–20 dias";
    if (days > 7) return "8–15 dias";
    return "0–7 dias";
  }

  function buildFollowUpRows(items, now = Date.now()) {
    const consolidated = new Map();
    for (const item of items || []) {
      for (const record of item.history || []) {
        if (!isFollowUpRecord(record)) continue;
        const sc = record.sc || {};
        const of = record.of || {};
        const key = recordKey(item, record);
        const requested = Math.max(0, toNumber(of.requestedQuantity ?? of.quantity));
        const delivered = Math.max(0, toNumber(of.deliveredQuantity));
        const quantity = pendingQuantity(of);
        const candidate = {
          key,
          branch: record.branch || record.branchName || record.branchCode || "—",
          item: `${item.code || ""} · ${item.name || item.detailedName || ""}`,
          sc: sc.code || "",
          of: of.code || "",
          scStatus: sc.status || "—",
          ofStatus: of.status || "—",
          deliveryStatus: followUpDeliveryState(of),
          supplier: of.supplier || "—",
          requester: sc.requesterName || "—",
          delivery: of.deliveryDate || sc.deliveryDate || "",
          requested,
          delivered,
          quantity,
          unitValue: Math.max(0, toNumber(of.unitValue)),
          value: quantity * Math.max(0, toNumber(of.unitValue)),
          days: daysSince(of.date || sc.date, now),
        };
        const current = consolidated.get(key);
        if (!current) {
          consolidated.set(key, candidate);
          continue;
        }
        // Um recebimento pode repetir a mesma linha da SC/OF no CSV. Mantemos os
        // totais cumulativos mais completos sem contar a pendência duas vezes.
        current.requested = Math.max(current.requested, candidate.requested);
        current.delivered = Math.max(current.delivered, candidate.delivered);
        current.quantity = Math.max(current.quantity, candidate.quantity);
        current.unitValue = candidate.unitValue || current.unitValue;
        current.value = current.quantity * current.unitValue;
        current.deliveryStatus = current.delivered > 0 ? DELIVERY_PARTIAL : DELIVERY_TOTAL;
        current.days = Math.max(current.days, candidate.days);
      }
    }
    return [...consolidated.values()];
  }

  function install(windowObject) {
    if (windowObject.__almoxFollowUpInstalled) return;
    windowObject.__almoxFollowUpInstalled = true;
    const { document } = windowObject;
    let rows = [];
    let filtered = [];
    let installed = false;
    const selected = { delivery: new Set(), branch: new Set(), supplier: new Set(), requester: new Set(), age: new Set() };
    const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
    const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

    function styles() {
      if (document.getElementById("fuStyle")) return;
      const style = document.createElement("style");
      style.id = "fuStyle";
      style.textContent = ".fu-icon{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8}.fu-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:14px 0}.fu-card,.fu-panel{border:1px solid var(--border-color,#d8e0e8);background:var(--card-bg,#fff);border-radius:15px;padding:14px}.fu-card strong{display:block;font-size:1.3rem;margin-top:5px}.fu-table-wrap{overflow:auto;max-height:650px}.fu-table{width:100%;border-collapse:collapse;font-size:.75rem;min-width:1250px}.fu-table th,.fu-table td{padding:8px;border-bottom:1px solid var(--border-color,#e4e9ee);text-align:left}.fu-table th{position:sticky;top:0;background:var(--card-bg,#fff);z-index:2}.fu-risk{font-weight:800}@media(max-width:900px){.fu-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:600px){.fu-grid{grid-template-columns:1fr}}";
      document.head.appendChild(style);
    }

    function inject() {
      styles();
      const nav = document.querySelector(".app-nav");
      const host = document.getElementById("catalogContent");
      if (!nav || !host) return false;
      if (!nav.querySelector('[data-page="follow-up"]')) {
        const link = document.createElement("a");
        link.className = "app-nav__tab";
        link.href = "#follow-up";
        link.dataset.page = "follow-up";
        link.role = "tab";
        link.innerHTML = '<svg class="fu-icon" viewBox="0 0 24 24"><path d="M4 5h16v14H4zM8 9h8M8 13h5M16 16l2 2 3-4"></path></svg><span>Follow up</span>';
        nav.insertBefore(link, nav.querySelector('[data-page="instrucoes"]'));
      }
      if (!document.getElementById("page-follow-up")) {
        const page = document.createElement("section");
        page.id = "page-follow-up";
        page.dataset.pagePanel = "follow-up";
        page.className = "page-panel is-hidden";
        page.innerHTML = '<div class="nt-head"><div><span class="eyebrow">Gestão de fornecimento</span><h2>Follow up</h2><p class="nt-muted">SCs com compra confirmada, OF não fechada e entrega total ou parcialmente pendente.</p></div><span id="fuStatus" class="context-label">Aguardando dados…</span></div><div id="fuKpis" class="fu-grid"></div><section class="embedded-filter-panel fu-filter-panel" aria-label="Filtros de follow up"><header class="embedded-filter-panel__header"><div><span class="eyebrow">Filtros da análise</span><h3>Refinar follow up</h3></div><button id="fuClear" class="button button--ghost" type="button">Limpar filtros</button></header><div class="embedded-filter-grid embedded-filter-grid--five"><label class="field"><span>Situação da entrega</span><select id="fuDeliverySelect" multiple hidden data-filter-source="true" aria-hidden="true" tabindex="-1"><option value="">Todas as situações</option></select></label><label class="field"><span>Filial</span><select id="fuBranchSelect" multiple hidden data-filter-source="true" aria-hidden="true" tabindex="-1"><option value="">Todas as filiais</option></select></label><label class="field"><span>Fornecedor</span><select id="fuSupplierSelect" multiple hidden data-filter-source="true" aria-hidden="true" tabindex="-1"><option value="">Todos os fornecedores</option></select></label><label class="field"><span>Solicitante da SC</span><select id="fuRequesterSelect" multiple hidden data-filter-source="true" aria-hidden="true" tabindex="-1"><option value="">Todos os solicitantes</option></select></label><label class="field"><span>Tempo pendente</span><select id="fuAgeSelect" multiple hidden data-filter-source="true" aria-hidden="true" tabindex="-1"><option value="">Todos os períodos</option></select></label></div><label class="embedded-filter-search"><span>Pesquisar no follow up</span><input id="fuSearch" type="search" placeholder="Item, SC, OF, fornecedor ou solicitante"></label></section><div class="fu-panel"><div id="fuSummary" class="nt-muted"></div><div class="fu-table-wrap"><table class="fu-table"><thead><tr><th>Dias</th><th>Situação</th><th>Filial</th><th>Item</th><th>SC</th><th>OF</th><th>Status SC</th><th>Fornecedor</th><th>Entrega prevista</th><th>Solicitante</th><th>Qtd. OF</th><th>Entregue</th><th>Pendente</th><th>Valor pendente</th></tr></thead><tbody id="fuBody"></tbody></table></div></div>';
        host.appendChild(page);
      }
      return true;
    }

    function filterSelect(id, key, values, allLabel) {
      const element = document.getElementById(id);
      if (!element) return;
      const available = new Set(values.filter(Boolean));
      for (const value of [...selected[key]]) if (!available.has(value)) selected[key].delete(value);
      element.innerHTML = `<option value="">${escapeHtml(allLabel)}</option>${[...available].map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
      for (const option of element.options) option.selected = option.value ? selected[key].has(option.value) : !selected[key].size;
      if (!element.dataset.followUpBound) {
        element.dataset.followUpBound = "true";
        element.addEventListener("change", () => {
          selected[key].clear();
          for (const option of element.selectedOptions) if (option.value) selected[key].add(option.value);
          apply();
        });
        windowObject.__almoxCreateMultiFilter?.(element);
      }
      windowObject.__almoxSyncMultiFilter?.(element);
    }

    function refresh() {
      const status = document.getElementById("fuStatus");
      const fallbackState = typeof state !== "undefined" ? state : null;
      const items = windowObject.__almoxState?.items || fallbackState?.items;
      if (!Array.isArray(items)) {
        if (status) status.textContent = "Dashboard ainda processando dados…";
        windowObject.setTimeout(() => { if (windowObject.location.hash === "#follow-up") refresh(); }, 800);
        return;
      }
      rows = buildFollowUpRows(items);
      filterSelect("fuDeliverySelect", "delivery", [DELIVERY_TOTAL, DELIVERY_PARTIAL], "Todas as situações");
      filterSelect("fuBranchSelect", "branch", [...new Set(rows.map((row) => row.branch))].sort(), "Todas as filiais");
      filterSelect("fuSupplierSelect", "supplier", [...new Set(rows.map((row) => row.supplier))].sort(), "Todos os fornecedores");
      filterSelect("fuRequesterSelect", "requester", [...new Set(rows.map((row) => row.requester))].sort(), "Todos os solicitantes");
      filterSelect("fuAgeSelect", "age", ["0–7 dias", "8–15 dias", "16–20 dias", "21–30 dias", ">30 dias"], "Todos os períodos");
      apply();
      const uniqueSc = new Set(rows.map((row) => row.sc)).size;
      const uniqueOf = new Set(rows.map((row) => row.of)).size;
      if (status) status.textContent = `${uniqueSc.toLocaleString("pt-BR")} SCs · ${uniqueOf.toLocaleString("pt-BR")} OFs em aberto`;
    }

    function apply() {
      const query = normalize(document.getElementById("fuSearch")?.value);
      filtered = rows.filter((row) => (
        (!selected.delivery.size || selected.delivery.has(row.deliveryStatus))
        && (!selected.branch.size || selected.branch.has(row.branch))
        && (!selected.supplier.size || selected.supplier.has(row.supplier))
        && (!selected.requester.size || selected.requester.has(row.requester))
        && (!selected.age.size || selected.age.has(ageBucket(row.days)))
        && (!query || normalize(`${row.item} ${row.sc} ${row.of} ${row.supplier} ${row.requester} ${row.scStatus} ${row.ofStatus}`).includes(query))
      ));
      render();
    }

    function render() {
      const partial = filtered.filter((row) => row.deliveryStatus === DELIVERY_PARTIAL).length;
      const total = filtered.length - partial;
      const uniqueSc = new Set(filtered.map((row) => row.sc)).size;
      const uniqueOf = new Set(filtered.map((row) => row.of)).size;
      document.getElementById("fuKpis").innerHTML = `<article class="fu-card"><span>SCs confirmadas</span><strong>${uniqueSc}</strong></article><article class="fu-card"><span>OFs não fechadas</span><strong>${uniqueOf}</strong></article><article class="fu-card"><span>Entrega total pendente</span><strong>${total}</strong></article><article class="fu-card"><span>Entrega parcial</span><strong>${partial}</strong></article><article class="fu-card"><span>Qtd. pendente</span><strong>${number.format(filtered.reduce((sum, row) => sum + row.quantity, 0))}</strong></article>`;
      document.getElementById("fuSummary").textContent = `${filtered.length.toLocaleString("pt-BR")} itens de SC com compra confirmada e entrega pendente · ordenados do mais antigo para o mais recente`;
      document.getElementById("fuBody").innerHTML = [...filtered]
        .sort((left, right) => right.days - left.days)
        .slice(0, 2000)
        .map((row) => `<tr><td class="fu-risk">${row.days}</td><td><strong>${escapeHtml(row.deliveryStatus)}</strong></td><td>${escapeHtml(row.branch)}</td><td>${escapeHtml(row.item)}</td><td>${escapeHtml(row.sc || "—")}</td><td>${escapeHtml(row.of)}</td><td>${escapeHtml(row.scStatus)}</td><td>${escapeHtml(row.supplier)}</td><td>${escapeHtml(row.delivery || "—")}</td><td>${escapeHtml(row.requester)}</td><td>${number.format(row.requested)}</td><td>${number.format(row.delivered)}</td><td>${number.format(row.quantity)}</td><td>${row.value ? money.format(row.value) : "—"}</td></tr>`)
        .join("") || '<tr><td colspan="14">Nenhuma SC com compra confirmada e entrega pendente.</td></tr>';
    }

    function open() {
      const page = document.getElementById("page-follow-up");
      if (!page) return;
      document.getElementById("loadingPanel")?.classList.add("is-hidden");
      document.getElementById("catalogContent")?.classList.remove("is-hidden");
      document.querySelectorAll("[data-page-panel]").forEach((panel) => panel.classList.toggle("is-hidden", panel !== page));
      document.querySelectorAll(".app-nav__tab").forEach((link) => {
        const active = link.dataset.page === "follow-up";
        link.classList.toggle("is-active", active);
        link.setAttribute("aria-selected", String(active));
      });
      if (windowObject.location.hash !== "#follow-up") windowObject.history.replaceState(null, "", "#follow-up");
      refresh();
      windowObject.scrollTo({ top: 0, behavior: "auto" });
    }

    function bind() {
      document.addEventListener("click", (event) => {
        const link = event.target.closest?.('.app-nav__tab[data-page="follow-up"]');
        if (!link) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        open();
      }, true);
      windowObject.addEventListener("hashchange", () => { if (windowObject.location.hash === "#follow-up") open(); });
      document.getElementById("fuSearch")?.addEventListener("input", apply);
      document.getElementById("fuClear")?.addEventListener("click", () => {
        Object.values(selected).forEach((values) => values.clear());
        const query = document.getElementById("fuSearch");
        if (query) query.value = "";
        refresh();
      });
    }

    function init() {
      if (installed) return;
      if (!inject()) {
        windowObject.setTimeout(init, 250);
        return;
      }
      installed = true;
      bind();
      if (windowObject.location.hash === "#follow-up") windowObject.setTimeout(open, 100);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
  }

  return {
    DELIVERY_TOTAL,
    DELIVERY_PARTIAL,
    normalize,
    isPurchaseConfirmed,
    isClosedPurchaseOrder,
    pendingQuantity,
    followUpDeliveryState,
    isFollowUpRecord,
    buildFollowUpRows,
    install,
  };
});
