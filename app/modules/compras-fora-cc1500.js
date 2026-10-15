"use strict";

(function initializeDirectPurchaseStock(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root?.document) api.install(root);
})(typeof window !== "undefined" ? window : null, () => {
  const PAGE = "compras-fora-cc1500";
  const clean = (value) => String(value ?? "").trim();
  const normalize = (value) => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const branchCode = (value) => clean(value).replace(/^0+(?=\d)/, "");
  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const escapeHtml = (value) => clean(value).replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const isCancelled = (value) => ["s", "sim", "1", "true", "yes"].includes(normalize(value));
  const isWarehouseCcu = (value) => /^0*1500(?:[.,]0+)?$/.test(clean(value));

  // A data da OF deve conservar o dia do documento original, sem converter
  // horários/fusos. Aceita data brasileira, ISO e serial de data do Excel.
  function formatOfDateBr(value) {
    const original = clean(value);
    if (!original) return "";
    let day, month, year;
    const serialMatch = original.match(/^(\d{5})(?:[.,]\d+)?$/);
    if (serialMatch) {
      const serial = Number(serialMatch[1]);
      const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      if (!Number.isFinite(date.getTime())) return "";
      day = date.getUTCDate();
      month = date.getUTCMonth() + 1;
      year = date.getUTCFullYear();
    } else {
      const br = original.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})(?=$|\s|T)/);
      const iso = original.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?=$|\s|T)/);
      if (br) {
        day = Number(br[1]);
        month = Number(br[2]);
        year = Number(br[3].length === 2 ? "20" + br[3] : br[3]);
      } else if (iso) {
        year = Number(iso[1]);
        month = Number(iso[2]);
        day = Number(iso[3]);
      } else {
        return "";
      }
    }
    const valid = new Date(Date.UTC(year, month - 1, day));
    if (year < 1900 || year > 2100 || valid.getUTCFullYear() !== year
      || valid.getUTCMonth() + 1 !== month || valid.getUTCDate() !== day) return "";
    return [String(day).padStart(2, "0"), String(month).padStart(2, "0"), String(year)].join("/");
  }

  // Um registro sem CCU informado é indeterminado e NÃO pode ser rotulado
  // como compra fora do 1500. Exige SC válida + OF emitida.
  function isConfirmedOutsideWarehousePurchase(record) {
    const sc = record?.sc;
    return Boolean(sc?.code && record?.of?.code && clean(sc.allocationCostCenter)
      && !isWarehouseCcu(sc.allocationCostCenter) && !isCancelled(sc.cancelled)
      && !isCancelled(record?.of?.cancelled)
      && !/cancelad/.test(normalize(sc.status))
      && !/cancelad/.test(normalize(record?.of?.status)));
  }

  function formatAddress(position) {
    return [
      position.localCode ? `Local ${position.localCode}` : "",
      position.partition ? `Rep. ${position.partition}` : "",
      position.shelf ? `Prat. ${position.shelf}` : "",
      position.division ? `Div. ${position.division}` : "",
    ].filter(Boolean).join(" / ");
  }

  // Relaciona sempre o mesmo código e filial da OF; saldos dos almoxarifados
  // lógicos são separados mesmo quando ambos usam o código 704.
  function buildDirectPurchaseStockRows(items) {
    const result = new Map();
    for (const item of items || []) {
      if (item?.flags?.inactiveOnly || !item?.code) continue;
      const stock = new Map();
      for (const position of item.positions || []) {
        const branch = branchCode(position.branchCode);
        if (!branch) continue;
        const name = clean(position.branchName) || branch;
        const groupKey = `${branch}::${normalize(name)}`;
        if (!stock.has(groupKey)) stock.set(groupKey, {
          branchCode: branch, branchName: name, quantity: 0, value: 0,
          addresses: new Set(), responsibles: new Set(),
        });
        const bucket = stock.get(groupKey);
        bucket.quantity += number(position.quantity);
        bucket.value += number(position.stockValue);
        if (number(position.quantity) > 0) bucket.addresses.add(formatAddress(position));
        for (const person of position.replenishmentResponsibles || []) if (person) bucket.responsibles.add(person);
      }
      const positiveStocks = [...stock.values()].filter((bucket) => bucket.quantity > 0);
      if (!positiveStocks.length) continue;
      for (const record of item.history || []) {
        if (!isConfirmedOutsideWarehousePurchase(record)) continue;
        const sc = record.sc;
        const of = record.of;
        const branch = branchCode(of.deliveryBranchCode || sc.branchCode || record.branchCode);
        const ccu = clean(sc.allocationCostCenter);
        for (const bucket of positiveStocks) {
          if (bucket.branchCode !== branch) continue;
          const key = [
            clean(item.code).replace(/\./g, ""), branch, normalize(bucket.branchName),
            clean(sc.code), clean(sc.sequence), clean(of.code), ccu,
          ].join("::");
          if (!result.has(key)) {
            result.set(key, {
              code: clean(item.code).replace(/\./g, ""),
              item: clean(item.name || item.detailedName),
              branchCode: branch,
              branch: bucket.branchName,
              branchNames: bucket.branchName,
              stockQuantity: bucket.quantity,
              stockValue: bucket.value,
              addresses: [...bucket.addresses].filter(Boolean).join(" | "),
              responsibles: [...bucket.responsibles].join(", "),
              sc: clean(sc.code),
              of: clean(of.code),
              ccu,
              supplier: clean(of.supplier || record.rec?.supplier),
              requester: clean(sc.requesterName),
              buyer: clean(sc.buyerName || of.buyerName),
              ofDate: formatOfDateBr(of.date),
              requested: number(of.requestedQuantity),
              delivered: number(of.deliveredQuantity),
              invoice: clean(record.rec?.invoice),
            });
          } else {
            const old = result.get(key);
            old.requested = Math.max(old.requested, number(of.requestedQuantity));
            old.delivered = Math.max(old.delivered, number(of.deliveredQuantity));
            if (!old.invoice) old.invoice = clean(record.rec?.invoice);
            if (!old.supplier) old.supplier = clean(of.supplier || record.rec?.supplier);
            if (!old.buyer) old.buyer = clean(sc.buyerName || of.buyerName);
            if (!old.ofDate) old.ofDate = formatOfDateBr(of.date);
          }
        }
      }
    }
    return [...result.values()].sort((a, b) =>
      a.code.localeCompare(b.code, "pt-BR", { numeric: true })
      || a.branchCode.localeCompare(b.branchCode, "pt-BR", { numeric: true })
      || a.branch.localeCompare(b.branch, "pt-BR")
      || a.sc.localeCompare(b.sc, "pt-BR", { numeric: true }));
  }

  function summarizeDirectPurchaseStock(rows) {
    const codes = new Set();
    const stocks = new Map();
    for (const row of rows || []) {
      codes.add(row.code);
      const key = `${row.code}::${row.branchCode}::${normalize(row.branch)}`;
      if (!stocks.has(key)) stocks.set(key, { quantity: row.stockQuantity, value: row.stockValue });
    }
    return {
      codes: codes.size,
      orders: (rows || []).length,
      stockQuantity: [...stocks.values()].reduce((sum, row) => sum + row.quantity, 0),
      stockValue: [...stocks.values()].reduce((sum, row) => sum + row.value, 0),
    };
  }

  function install(win) {
    if (win.__almoxOutsideCcuInstalled) return;
    win.__almoxOutsideCcuInstalled = true;
    const { document } = win;
    const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
    const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
    const compactMoney = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
    let source = [], filtered = [], lastItems = null, dirty = true, visible = 150;
    let branchSelection = "", ccuSelection = "";

    function inject() {
      const nav = document.querySelector(".app-nav");
      const host = document.getElementById("catalogContent");
      if (!nav || !host) return false;
      if (!document.getElementById("directCcuStyle")) {
        const style = document.createElement("style");
        style.id = "directCcuStyle";
        style.textContent = `
          .dc-head{display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:14px;margin:12px 0 18px}
          .dc-head h2{font-size:clamp(23px,3vw,34px);margin:6px 0}
          .dc-note{max-width:950px;color:var(--muted,#64748b);line-height:1.6;font-size:13px;margin:4px 0 16px}
          .dc-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}
          .dc-card,.dc-panel{padding:17px;border:1px solid var(--border-color,#d8e0e8);border-radius:16px;background:var(--card-bg,var(--surface,#fff))}
          .dc-card span{display:block;color:var(--muted,#64748b);font-size:12px}.dc-card strong{display:block;margin-top:7px;font-size:clamp(18px,2vw,26px);overflow-wrap:anywhere}
          .dc-controls{display:flex;align-items:end;gap:12px;flex-wrap:wrap;margin-bottom:15px}
          .dc-controls label{display:grid;gap:5px;font-size:12px;min-width:160px;flex:1}
          .dc-controls input,.dc-controls select{width:100%;min-height:40px}
          .dc-table-wrap{max-height:670px;overflow:auto}.dc-table{min-width:1580px;width:100%;border-collapse:collapse;font-size:12px}
          .dc-table th,.dc-table td{padding:10px;border-bottom:1px solid var(--border-color,#e4e9ee);text-align:left;vertical-align:top}
          .dc-table th{position:sticky;top:0;z-index:2;background:var(--card-bg,var(--surface,#fff))}
          .dc-table td:nth-child(1),.dc-table td:nth-child(5){font-weight:750}
          .dc-footer{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:14px;flex-wrap:wrap}
          @media(max-width:900px){.dc-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
          @media(max-width:540px){.dc-grid{grid-template-columns:1fr}.dc-controls label{min-width:100%}}
        `;
        document.head.append(style);
      }
      if (!nav.querySelector(`[data-page="${PAGE}"]`)) {
        const tab = document.createElement("a");
        tab.className = "app-nav__tab";
        tab.dataset.page = PAGE;
        tab.href = `#${PAGE}`;
        tab.role = "tab";
        tab.setAttribute("aria-selected", "false");
        tab.setAttribute("aria-controls", `page-${PAGE}`);
        tab.textContent = "Compras fora CC 1500";
        nav.insertBefore(tab, nav.querySelector('[data-page="instrucoes"]'));
        if (typeof decorateNavigationTabs === "function") decorateNavigationTabs();
      }
      if (!document.getElementById(`page-${PAGE}`)) {
        const page = document.createElement("section");
        page.id = `page-${PAGE}`;
        page.dataset.pagePanel = PAGE;
        page.className = "page-panel is-hidden";
        page.innerHTML = `
          <header class="dc-head"><div><span class="eyebrow">Auditoria de compras e estoque</span>
          <h2>Saldo em estoque × compras fora do CC 1500</h2>
          <p class="dc-note">Localiza itens com saldo físico positivo e histórico de OF emitida para CCU da etiqueta diferente de 1500, na mesma filial e no mesmo código do item. O vínculo indica uma ocorrência para investigação, não comprova que o saldo atual veio daquela compra. CCU ausente e SC cancelada não entram no relatório.</p></div>
          <span id="dcStatus" class="context-label">Preparando auditoria…</span></header>
          <div id="dcKpis" class="dc-grid"></div>
          <section class="dc-panel"><div class="dc-controls">
            <label><span>Pesquisar código, descrição, SC, OF ou fornecedor</span><input id="dcSearch" type="search" placeholder="Pesquisar ocorrências" autocomplete="off"></label>
            <label><span>Filial</span><select id="dcBranch"><option value="">Todas as filiais</option></select></label>
            <label><span>CCU da compra</span><select id="dcCcu"><option value="">Todos os CCUs fora do 1500</option></select></label>
            <button type="button" id="dcClear" class="button button--secondary">Limpar</button>
            <button type="button" id="dcExport" class="button button--export">Exportar Excel</button>
          </div>
          <div class="dc-table-wrap"><table class="dc-table"><thead><tr>
            <th>Código</th><th>Descrição</th><th>Filial</th><th>CCU da etiqueta</th>
            <th>Saldo atual</th><th>Valor do saldo</th><th>SC</th><th>OF</th>
            <th>Data OF</th><th>Qtd. OF</th><th>Entregue</th><th>Fornecedor</th>
            <th>Comprador</th><th>Solicitante</th><th>Reposição</th><th>Posições</th>
          </tr></thead><tbody id="dcBody"></tbody></table></div>
          <div class="dc-footer"><span id="dcCount"></span><button id="dcMore" class="button button--secondary is-hidden" type="button">Carregar mais</button></div></section>
        `;
        host.append(page);
      }
      return true;
    }

    function setOptions(id, label, values, selected) {
      const element = document.getElementById(id);
      if (!element) return;
      element.replaceChildren(new Option(label, ""));
      for (const value of values) element.add(new Option(value, value));
      element.value = values.includes(selected) ? selected : "";
    }

    function refreshOptions() {
      setOptions("dcBranch", "Todas as filiais", [...new Set(source.map((row) => row.branchCode))].sort((a,b)=>a.localeCompare(b,"pt-BR",{numeric:true})), branchSelection);
      setOptions("dcCcu", "Todos os CCUs fora do 1500", [...new Set(source.map((row) => row.ccu))].sort((a,b)=>a.localeCompare(b,"pt-BR",{numeric:true})), ccuSelection);
      branchSelection = document.getElementById("dcBranch")?.value || "";
      ccuSelection = document.getElementById("dcCcu")?.value || "";
    }

    function currentItems() {
      const app = typeof state !== "undefined" ? state : win.__almoxState;
      return app?.items && Array.isArray(app.items) ? app : null;
    }

    function refresh() {
      const app = currentItems();
      if (!app?.items?.length) {
        const status = document.getElementById("dcStatus");
        if (status) status.textContent = "Aguardando o carregamento do estoque e compras…";
        return;
      }
      if (app.items !== lastItems) {
        source = buildDirectPurchaseStockRows(app.items);
        lastItems = app.items;
        refreshOptions();
      }
      apply(app);
    }

    function apply(app = currentItems()) {
      if (!app) return;
      const query = normalize(document.getElementById("dcSearch")?.value);
      const selectedCodes = new Set((app.filteredItems || []).map((item) => item.code));
      filtered = source.filter((row) => (
        selectedCodes.has(row.code)
        && (!win.__almoxGlobalRowFilter || win.__almoxGlobalRowFilter(row))
        && (!branchSelection || row.branchCode === branchSelection)
        && (!ccuSelection || row.ccu === ccuSelection)
        && (!query || normalize([row.code,row.item,row.sc,row.of,row.supplier,row.requester,row.buyer,row.addresses,row.responsibles,row.ccu].join(" ")).includes(query))
      ));
      visible = 150;
      dirty = false;
      render();
    }

    function render() {
      const totals = summarizeDirectPurchaseStock(filtered);
      const kpis = [
        ["Códigos com ocorrência", decimal.format(totals.codes)],
        ["SC/OF distintas", decimal.format(totals.orders)],
        ["Saldo físico (sem duplicar OFs)", decimal.format(totals.stockQuantity)],
        ["Valor atual em estoque", compactMoney.format(totals.stockValue)],
      ];
      const kpiHost = document.getElementById("dcKpis");
      if (kpiHost) kpiHost.innerHTML = kpis.map(([label,value]) => `<article class="dc-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("");
      const body = document.getElementById("dcBody");
      if (body) body.innerHTML = filtered.slice(0, visible).map((row) => `<tr>
        <td>${escapeHtml(row.code)}</td><td>${escapeHtml(row.item)}</td>
        <td>${escapeHtml(row.branchCode)} · ${escapeHtml(row.branchNames)}</td><td>${escapeHtml(row.ccu)}</td>
        <td>${decimal.format(row.stockQuantity)}</td><td>${compactMoney.format(row.stockValue)}</td>
        <td>${escapeHtml(row.sc)}</td><td>${escapeHtml(row.of)}</td><td>${escapeHtml(formatOfDateBr(row.ofDate) || "—")}</td>
        <td>${decimal.format(row.requested)}</td><td>${decimal.format(row.delivered)}</td>
        <td>${escapeHtml(row.supplier || "—")}</td><td>${escapeHtml(row.buyer || "—")}</td>
        <td>${escapeHtml(row.requester || "—")}</td><td>${escapeHtml(row.responsibles || "—")}</td>
        <td>${escapeHtml(row.addresses || "—")}</td></tr>`).join("")
        || '<tr><td colspan="16">Nenhuma ocorrência encontrada para os filtros selecionados.</td></tr>';
      const count = document.getElementById("dcCount");
      if (count) count.textContent = `${decimal.format(Math.min(visible, filtered.length))} de ${decimal.format(filtered.length)} ocorrências exibidas`;
      const more = document.getElementById("dcMore");
      if (more) more.classList.toggle("is-hidden", visible >= filtered.length);
      const status = document.getElementById("dcStatus");
      if (status) status.textContent = `${decimal.format(filtered.length)} ocorrências no recorte atual`;
    }

    function exportExcel() {
      if (!filtered.length) return;
      if (typeof exportReport !== "function") {
        win.alert("Exportação ainda indisponível. Atualize a página.");
        return;
      }
      exportReport("excel", {
        title: "Compras fora do CCU 1500 com saldo atual",
        filename: "compras-fora-cc1500-com-saldo.xls",
        headers: ["Código","Descrição","Filial","CCU da etiqueta","Saldo atual","Valor saldo","SC","OF","Data OF","Qtd. OF","Entregue","Fornecedor","Comprador","Solicitante","Responsável reposição","Posições"],
        rows: filtered.map((r) => [r.code,r.item,`${r.branchCode} · ${r.branchNames}`,r.ccu,r.stockQuantity,r.stockValue,r.sc,r.of,formatOfDateBr(r.ofDate),r.requested,r.delivered,r.supplier,r.buyer,r.requester,r.responsibles,r.addresses]),
        numericColumns: new Set([4,5,9,10]), currencyColumns: new Set([5]), dateColumns: new Set([8]), pdfIdentityColumns: [0,7],
        filterSummary: "Somente saldo positivo com OF emitida e CCU explícito diferente de 1500. Valores de estoque podem repetir em OFs do mesmo item e filial.",
      });
    }

    function open() {
      if (!document.getElementById(`page-${PAGE}`)) return;
      if (typeof navigateToPage === "function") navigateToPage(PAGE, true);
      else {
        document.querySelectorAll("[data-page-panel]").forEach((panel) => panel.classList.toggle("is-hidden", panel.dataset.pagePanel !== PAGE));
        win.history.replaceState(null, "", `#${PAGE}`);
      }
      const app = currentItems();
      if (dirty || app?.items !== lastItems) win.requestAnimationFrame(refresh);
    }

    function bind() {
      document.addEventListener("click", (event) => {
        const link = event.target.closest?.(`[data-page="${PAGE}"]`);
        if (!link) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        open();
      }, true);
      win.addEventListener("hashchange", () => {
        if (win.location.hash === `#${PAGE}`) open();
      });
      win.addEventListener("almox-global-filters-applied", () => {
        dirty = true;
        if (win.location.hash === `#${PAGE}`) refresh();
      });
      document.getElementById("dcSearch")?.addEventListener("input", () => apply());
      document.getElementById("dcBranch")?.addEventListener("change", (event) => { branchSelection = event.target.value; apply(); });
      document.getElementById("dcCcu")?.addEventListener("change", (event) => { ccuSelection = event.target.value; apply(); });
      document.getElementById("dcClear")?.addEventListener("click", () => {
        branchSelection = ""; ccuSelection = "";
        document.getElementById("dcBranch").value = "";
        document.getElementById("dcCcu").value = "";
        document.getElementById("dcSearch").value = "";
        apply();
      });
      document.getElementById("dcExport")?.addEventListener("click", exportExcel);
      document.getElementById("dcMore")?.addEventListener("click", () => { visible += 150; render(); });
    }

    function init() {
      if (!inject()) {
        win.setTimeout(init, 250);
        return;
      }
      bind();
      if (win.location.hash === `#${PAGE}`) win.setTimeout(open, 70);
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
  }

  return { isConfirmedOutsideWarehousePurchase, formatOfDateBr, buildDirectPurchaseStockRows, summarizeDirectPurchaseStock, install };
});
