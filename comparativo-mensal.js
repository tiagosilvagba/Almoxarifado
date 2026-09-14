"use strict";

(() => {
  const REPO_CONTENTS_API = "https://api.github.com/repos/tiagosilvagba/Almoxarifado/contents?ref=main";
  const FILE_RE = /^01\s*-\s*Estoque_([A-Za-zÀ-ÿ]{3})_(\d{4})\.csv$/i;
  const MONTH_ORDER = { jan:1, fev:2, mar:3, abr:4, mai:5, jun:6, jul:7, ago:8, set:9, out:10, nov:11, dez:12 };
  const MONTH_LABEL = { jan:"Janeiro", fev:"Fevereiro", mar:"Março", abr:"Abril", mai:"Maio", jun:"Junho", jul:"Julho", ago:"Agosto", set:"Setembro", out:"Outubro", nov:"Novembro", dez:"Dezembro" };
  const snapshotCache = new Map();
  let availableFiles = [];
  let currentRows = [];
  let lastBaseSnapshot = null;
  let lastCurrentSnapshot = null;

  const nf0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits:0 });
  const nf2 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits:2 });

  function normalize(value) {
    return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  }

  function parseNumber(value) {
    let text = String(value ?? "").trim();
    if (!text || text === "-" || text === "—") return 0;
    text = text.replace(/\s/g, "").replace(/R\$/gi, "").replace(/[^0-9,.-]/g, "");
    const comma = text.lastIndexOf(",");
    const dot = text.lastIndexOf(".");
    if (comma > dot) text = text.replace(/\./g, "").replace(",", ".");
    else if (dot > comma && comma >= 0) text = text.replace(/,/g, "");
    else if (comma >= 0) text = text.replace(",", ".");
    const number = Number(text);
    return Number.isFinite(number) ? number : 0;
  }

  function detectDelimiter(line) {
    const candidates = [";", ",", "\t", "|"];
    let best = ";";
    let bestCount = -1;
    for (const delimiter of candidates) {
      const count = line.split(delimiter).length - 1;
      if (count > bestCount) { best = delimiter; bestCount = count; }
    }
    return best;
  }

  function parseCsv(text) {
    text = String(text || "").replace(/^\uFEFF/, "");
    const firstBreak = text.search(/\r?\n/);
    const delimiter = detectDelimiter(firstBreak >= 0 ? text.slice(0, firstBreak) : text);
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (quoted) {
        if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
        else if (char === '"') quoted = false;
        else field += char;
        continue;
      }
      if (char === '"') { quoted = true; continue; }
      if (char === delimiter) { row.push(field); field = ""; continue; }
      if (char === "\n" || char === "\r") {
        if (char === "\r" && text[i + 1] === "\n") i += 1;
        row.push(field); field = "";
        if (row.some((entry) => String(entry).trim() !== "")) rows.push(row);
        row = [];
        continue;
      }
      field += char;
    }
    if (field || row.length) { row.push(field); if (row.some((entry) => String(entry).trim() !== "")) rows.push(row); }
    if (!rows.length) return { headers:[], rows:[] };
    return { headers:rows.shift().map((header) => String(header).trim()), rows };
  }

  function findColumn(headers, exactCandidates, containsCandidates = []) {
    const normalized = headers.map(normalize);
    for (const candidate of exactCandidates.map(normalize)) {
      const index = normalized.indexOf(candidate);
      if (index >= 0) return index;
    }
    for (const candidate of containsCandidates.map(normalize)) {
      const index = normalized.findIndex((header) => header.includes(candidate));
      if (index >= 0) return index;
    }
    return -1;
  }

  function aggregateRecords(file, headers, records) {
    const byCode = new Map();
    for (const record of records) {
      const current = byCode.get(record.code) || { code:record.code, name:record.name, balance:0, consumption:0, rows:0 };
      if (!current.name && record.name) current.name = record.name;
      current.balance += record.balance;
      current.consumption += record.consumption;
      current.rows += 1;
      byCode.set(record.code, current);
    }
    const items = [...byCode.values()];
    return {
      file, headers, records, items, byCode,
      totalBalance:items.reduce((sum,item) => sum + item.balance, 0),
      totalConsumption:items.reduce((sum,item) => sum + item.consumption, 0),
      itemCount:items.length,
    };
  }

  function buildSnapshot(file, parsed) {
    const { headers, rows } = parsed;
    const codeIndex = findColumn(headers,["Código","Codigo","Código item","Codigo item","Cd Item","CD_ITEM","Material"],["codigo item","cd item"]);
    const nameIndex = findColumn(headers,["Nome Item","NM Item","Nm Item","NM_ITEM","Nome do Item","Nome do item"],["nome item","nm item"]);
    const balanceIndex = findColumn(headers,["Saldo Real"],["saldo real"]);
    const consumptionIndex = findColumn(headers,["Consumo real","Consumo Real"],["consumo real"]);
    const branchIndex = findColumn(headers,["CD Filial","Cd Filial","Código Filial","Codigo Filial","Filial"],["cd filial","codigo filial"]);
    const localIndex = findColumn(headers,["Local de estoque","Local Estoque","CD Local","Cd Local","Local"],["local de estoque","local estoque","cd local"]);
    const usageIndex = findColumn(headers,["Nome utilização","Nome utilizacao","NM Utilização","NM Utilizacao","Utilização","Utilizacao"],["nome utilizacao","nm utilizacao"]);

    if (balanceIndex < 0 || consumptionIndex < 0) throw new Error(`O arquivo ${file.name} precisa conter as colunas “Saldo Real” e “Consumo real”.`);

    const records = [];
    rows.forEach((row,rowIndex) => {
      const code = String(codeIndex >= 0 ? row[codeIndex] : rowIndex + 1).trim();
      if (!code) return;
      records.push({
        code,
        name:nameIndex >= 0 ? String(row[nameIndex] ?? "").trim() : "",
        balance:parseNumber(row[balanceIndex]),
        consumption:parseNumber(row[consumptionIndex]),
        branch:branchIndex >= 0 ? String(row[branchIndex] ?? "").trim() : "",
        local:localIndex >= 0 ? String(row[localIndex] ?? "").trim() : "",
        usage:usageIndex >= 0 ? String(row[usageIndex] ?? "").trim() : "",
      });
    });
    const snapshot = aggregateRecords(file, headers, records);
    snapshot.filterColumns = { branch:branchIndex >= 0, local:localIndex >= 0, usage:usageIndex >= 0 };
    return snapshot;
  }

  function selectedFilters() {
    return {
      branch:document.getElementById("monthlyBranchFilter")?.value || "all",
      local:document.getElementById("monthlyLocalFilter")?.value || "all",
      usage:document.getElementById("monthlyUsageFilter")?.value || "all",
    };
  }

  function applySnapshotFilters(snapshot) {
    if (!snapshot) return snapshot;
    const filters = selectedFilters();
    const filteredRecords = snapshot.records.filter((record) => {
      if (filters.branch !== "all" && record.branch !== filters.branch) return false;
      if (filters.local !== "all" && record.local !== filters.local) return false;
      if (filters.usage !== "all" && record.usage !== filters.usage) return false;
      return true;
    });
    const filtered = aggregateRecords(snapshot.file, snapshot.headers, filteredRecords);
    filtered.filterColumns = snapshot.filterColumns;
    return filtered;
  }

  async function fetchSnapshot(file) {
    if (snapshotCache.has(file.name)) return snapshotCache.get(file.name);
    const promise = (async () => {
      const response = await fetch(encodeURI(`./${file.name}`), { cache:"default" });
      if (!response.ok) throw new Error(`Não foi possível ler ${file.name}.`);
      const buffer = await response.arrayBuffer();
      let text = new TextDecoder("utf-8").decode(buffer);
      if (text.includes("�")) { try { text = new TextDecoder("windows-1252").decode(buffer); } catch {} }
      return buildSnapshot(file, parseCsv(text));
    })();
    snapshotCache.set(file.name, promise);
    try { return await promise; } catch (error) { snapshotCache.delete(file.name); throw error; }
  }

  function parseFileMeta(entry) {
    const match = entry.name.match(FILE_RE);
    if (!match) return null;
    const monthKey = normalize(match[1]).slice(0,3);
    const year = Number(match[2]);
    const month = MONTH_ORDER[monthKey];
    if (!month || !year) return null;
    return { name:entry.name, path:entry.path, sha:entry.sha, monthKey, month, year, label:`${MONTH_LABEL[monthKey] || match[1]} ${year}`, sortKey:year * 100 + month };
  }

  async function discoverFiles() {
    const response = await fetch(REPO_CONTENTS_API, { cache:"no-store", headers:{Accept:"application/vnd.github+json"} });
    if (!response.ok) throw new Error("Não foi possível consultar os arquivos mensais do repositório.");
    const entries = await response.json();
    availableFiles = entries.map(parseFileMeta).filter(Boolean).sort((a,b) => a.sortKey - b.sortKey);
    return availableFiles;
  }

  function formatSigned(value) {
    if (Math.abs(value) < 0.000001) return "0";
    return `${value > 0 ? "+" : "−"}${nf2.format(Math.abs(value))}`;
  }

  function pctChange(oldValue,newValue) {
    if (!oldValue) return newValue ? null : 0;
    return ((newValue - oldValue) / Math.abs(oldValue)) * 100;
  }

  function compareSnapshots(base,current) {
    const codes = new Set([...base.byCode.keys(),...current.byCode.keys()]);
    const rows = [];
    for (const code of codes) {
      const a = base.byCode.get(code) || {code,name:"",balance:0,consumption:0};
      const b = current.byCode.get(code) || {code,name:a.name,balance:0,consumption:0};
      const deltaBalance = b.balance - a.balance;
      const deltaConsumption = b.consumption - a.consumption;
      rows.push({
        code,
        name:b.name || a.name || "Item sem nome",
        baseBalance:a.balance,
        currentBalance:b.balance,
        deltaBalance,
        pctBalance:pctChange(a.balance,b.balance),
        baseConsumption:a.consumption,
        currentConsumption:b.consumption,
        deltaConsumption,
        status:deltaBalance > 0.000001 ? "increase" : deltaBalance < -0.000001 ? "decrease" : "stable",
      });
    }
    return rows.sort((a,b) => Math.abs(b.deltaBalance) - Math.abs(a.deltaBalance));
  }

  function uniqueValues(snapshots,key) {
    const values = new Set();
    snapshots.filter(Boolean).forEach((snapshot) => snapshot.records.forEach((record) => { if (record[key]) values.add(record[key]); }));
    return [...values].sort((a,b) => a.localeCompare(b,"pt-BR",{numeric:true,sensitivity:"base"}));
  }

  function fillFilterSelect(id,values,label) {
    const select = document.getElementById(id);
    if (!select) return;
    const previous = select.value;
    select.innerHTML = `<option value="all">Todos</option>${values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
    if ([...select.options].some((option) => option.value === previous)) select.value = previous;
    select.disabled = values.length === 0;
    select.title = values.length ? label : `${label} não encontrado na base`;
  }

  function populatePageFilters(...snapshots) {
    fillFilterSelect("monthlyBranchFilter",uniqueValues(snapshots,"branch"),"CD Filial");
    fillFilterSelect("monthlyLocalFilter",uniqueValues(snapshots,"local"),"Local de estoque");
    fillFilterSelect("monthlyUsageFilter",uniqueValues(snapshots,"usage"),"Nome utilização");
  }

  function setGlobalFilterVisibility(isMonthlyPage) {
    document.documentElement.classList.toggle("monthly-comparison-active",isMonthlyPage);
    const panel = document.getElementById("globalFiltersPanel");
    const trigger = document.getElementById("filterToggleButton");
    if (isMonthlyPage) {
      panel?.classList.add("is-hidden");
      panel?.setAttribute("hidden","");
      trigger?.setAttribute("aria-expanded","false");
    }
  }

  function injectStyles() {
    if (document.getElementById("monthlyComparisonStyles")) return;
    const style = document.createElement("style");
    style.id = "monthlyComparisonStyles";
    style.textContent = `
      #page-comparativo-mensal{display:block}.is-hidden#page-comparativo-mensal{display:none!important}
      html.monthly-comparison-active #globalFiltersPanel,html.monthly-comparison-active #filterToggleButton,html.monthly-comparison-active .global-filter-bar{display:none!important}
      .month-compare-controls{display:grid;grid-template-columns:minmax(180px,1fr) minmax(180px,1fr) auto;gap:12px;align-items:end;margin:18px 0;padding:16px;border:1px solid var(--steel-200);border-radius:16px;background:var(--surface,#fff)}
      .month-page-filters{margin:0 0 18px;padding:16px;border:1px solid var(--steel-200);border-radius:16px;background:var(--surface,#fff)}
      .month-page-filters__head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.month-page-filters__head strong{font-size:14px}.month-page-filters__head small{color:var(--muted)}
      .month-page-filters__grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) auto;gap:12px;align-items:end}.month-page-filters label,.month-compare-controls label{display:grid;gap:7px;font-weight:700}
      .month-page-filters select,.month-compare-controls select,.month-compare-controls input{min-height:44px;width:100%;border:1px solid var(--steel-300);border-radius:10px;padding:0 12px;background:var(--steel-50,#fff);color:var(--text)}
      .month-page-filters__actions{display:flex;gap:8px}.month-page-filters__actions .button{min-height:44px}
      .month-filter-summary{margin-top:10px;color:var(--muted);font-size:12px}
      .month-compare-message{margin:14px 0;padding:14px 16px;border-radius:12px;background:var(--steel-50);color:var(--muted);border:1px solid var(--steel-200)}
      .month-compare-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin:16px 0}.month-compare-metric{padding:16px;border-radius:14px;border:1px solid var(--steel-200);background:var(--surface,#fff);display:grid;gap:7px}.month-compare-metric span{font-size:12px;color:var(--muted);font-weight:800}.month-compare-metric strong{font-size:24px;color:var(--text)}.month-compare-metric small{color:var(--muted)}
      .month-considerations{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:18px 0}.month-consideration{border:1px solid var(--steel-200);border-radius:16px;padding:16px;background:var(--surface,#fff)}.month-consideration h3{margin:0 0 4px}.month-consideration__total{display:flex;justify-content:space-between;gap:12px;margin:10px 0 14px;padding:10px 12px;border-radius:10px;background:var(--steel-50)}.month-consideration ul{list-style:none;margin:0;padding:0;display:grid;gap:8px}.month-consideration li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:8px 0;border-bottom:1px solid var(--steel-200)}.month-consideration li:last-child{border-bottom:0}.month-consideration li span{min-width:0}.month-consideration li strong{white-space:nowrap}.month-consideration--up h3,.month-delta--up{color:#169b62}.month-consideration--down h3,.month-delta--down{color:#d64545}
      .month-compare-toolbar{display:flex;gap:10px;align-items:center;justify-content:space-between;margin:18px 0 10px}.month-compare-toolbar input{max-width:420px;min-height:42px;border:1px solid var(--steel-300);border-radius:10px;padding:0 12px;background:var(--surface,#fff);color:var(--text)}.month-compare-toolbar select{min-height:42px;border:1px solid var(--steel-300);border-radius:10px;padding:0 12px;background:var(--surface,#fff);color:var(--text)}
      .month-compare-table-wrap{overflow:auto;border:1px solid var(--steel-200);border-radius:16px;background:var(--surface,#fff)}.month-compare-table{width:100%;border-collapse:collapse;min-width:980px}.month-compare-table th,.month-compare-table td{padding:11px 12px;border-bottom:1px solid var(--steel-200);text-align:right}.month-compare-table th:first-child,.month-compare-table td:first-child,.month-compare-table th:nth-child(2),.month-compare-table td:nth-child(2){text-align:left}.month-compare-table th{position:sticky;top:0;z-index:1;background:var(--steel-100);color:var(--text)}.month-status{display:inline-flex;padding:5px 9px;border-radius:999px;font-size:11px;font-weight:800}.month-status--increase{background:rgba(22,155,98,.14);color:#169b62}.month-status--decrease{background:rgba(214,69,69,.14);color:#d64545}.month-status--stable{background:var(--steel-100);color:var(--muted)}
      html[data-theme="palmeiras"] .month-compare-metric,html[data-theme="palmeiras"] .month-consideration,html[data-theme="palmeiras"] .month-compare-controls,html[data-theme="palmeiras"] .month-compare-table-wrap,html[data-theme="palmeiras"] .month-page-filters{box-shadow:0 0 18px rgba(0,255,128,.08)}
      @media(max-width:900px){.month-compare-controls{grid-template-columns:1fr}.month-page-filters__grid{grid-template-columns:1fr}.month-page-filters__actions{width:100%}.month-page-filters__actions .button{flex:1}.month-compare-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.month-considerations{grid-template-columns:1fr}.month-compare-toolbar{align-items:stretch;flex-direction:column}.month-compare-toolbar input{max-width:none}.month-compare-metric strong{font-size:20px}}
    `;
    document.head.appendChild(style);
  }

  function pageTemplate() {
    return `
      <section id="page-comparativo-mensal" class="page-panel is-hidden" data-page-panel="comparativo-mensal" aria-labelledby="monthlyCompareTitle">
        <div class="section-heading"><div><span class="eyebrow">Evolução mensal</span><h2 id="monthlyCompareTitle">Comparativo mensal de estoque</h2><p class="section-description">Compare Saldo Real e Consumo real entre os arquivos mensais do repositório.</p></div><span id="monthlyFileCount" class="context-label">Procurando bases…</span></div>
        <div class="month-compare-controls">
          <label>Mês base<select id="monthlyBaseSelect"></select></label>
          <label>Mês comparado<select id="monthlyCurrentSelect"></select></label>
          <button id="monthlyCompareButton" class="button button--primary" type="button">Comparar meses</button>
        </div>
        <section class="month-page-filters" aria-label="Filtros exclusivos do comparativo mensal">
          <div class="month-page-filters__head"><div><strong>Filtros do comparativo mensal</strong><br><small>Aplicados somente nesta página</small></div></div>
          <div class="month-page-filters__grid">
            <label>CD Filial<select id="monthlyBranchFilter"><option value="all">Todos</option></select></label>
            <label>Local de estoque<select id="monthlyLocalFilter"><option value="all">Todos</option></select></label>
            <label>Nome utilização<select id="monthlyUsageFilter"><option value="all">Todos</option></select></label>
            <div class="month-page-filters__actions"><button id="monthlyApplyFilters" class="button button--primary" type="button">Aplicar</button><button id="monthlyClearFilters" class="button" type="button">Limpar</button></div>
          </div>
          <div id="monthlyFilterSummary" class="month-filter-summary">Todos os registros selecionados.</div>
        </section>
        <div id="monthlyCompareMessage" class="month-compare-message">Carregando bases mensais disponíveis…</div>
        <div id="monthlyCompareMetrics" class="month-compare-metrics"></div>
        <div id="monthlyConsiderations" class="month-considerations"></div>
        <div id="monthlyCompareDetails" class="is-hidden">
          <div class="month-compare-toolbar"><input id="monthlySearch" type="search" placeholder="Buscar código ou nome do item"><select id="monthlyStatusFilter"><option value="all">Todas as alterações</option><option value="increase">Somente aumentos</option><option value="decrease">Somente reduções</option><option value="stable">Sem alteração</option></select></div>
          <div class="month-compare-table-wrap"><table class="month-compare-table"><thead><tr><th>Código</th><th>Nome Item</th><th>Saldo base</th><th>Saldo comparado</th><th>Variação saldo</th><th>Consumo base</th><th>Consumo comparado</th><th>Variação consumo</th><th>Situação</th></tr></thead><tbody id="monthlyCompareTbody"></tbody></table></div>
        </div>
      </section>`;
  }

  function ensureUi() {
    injectStyles();
    const nav = document.querySelector(".app-nav");
    const main = document.querySelector("main.main-content");
    if (!nav || !main) return false;
    if (!document.querySelector('[data-page="comparativo-mensal"]')) {
      const tab = document.createElement("a");
      tab.className = "app-nav__tab"; tab.href = "#comparativo-mensal"; tab.dataset.page = "comparativo-mensal";
      tab.setAttribute("role","tab"); tab.setAttribute("aria-selected","false"); tab.setAttribute("aria-controls","page-comparativo-mensal"); tab.textContent = "Comparativo mensal";
      const dashboardTab = nav.querySelector('[data-page="dashboard"]');
      if (dashboardTab) dashboardTab.insertAdjacentElement("afterend",tab); else nav.appendChild(tab);
    }
    if (!document.getElementById("page-comparativo-mensal")) main.insertAdjacentHTML("beforeend",pageTemplate());
    return true;
  }

  function openPage() {
    setGlobalFilterVisibility(true);
    document.querySelectorAll("[data-page-panel]").forEach((panel) => panel.classList.toggle("is-hidden",panel.id !== "page-comparativo-mensal"));
    document.querySelectorAll(".app-nav__tab").forEach((tab) => {
      const active = tab.dataset.page === "comparativo-mensal";
      tab.classList.toggle("is-active",active);
      tab.setAttribute("aria-selected",active ? "true" : "false");
    });
    history.replaceState(null,"","#comparativo-mensal");
    if (!availableFiles.length) refreshFiles();
  }

  function installNavigation() {
    document.addEventListener("click",(event) => {
      const tab = event.target.closest?.('.app-nav__tab[data-page="comparativo-mensal"]');
      if (tab) { event.preventDefault(); event.stopPropagation(); openPage(); return; }
      const other = event.target.closest?.(".app-nav__tab[data-page]");
      if (other && other.dataset.page !== "comparativo-mensal") {
        setGlobalFilterVisibility(false);
        document.getElementById("page-comparativo-mensal")?.classList.add("is-hidden");
      }
    },true);
  }

  function setMessage(text,kind="") {
    const node = document.getElementById("monthlyCompareMessage");
    if (!node) return;
    node.textContent = text;
    node.dataset.kind = kind;
  }

  function updateFilterSummary() {
    const filters = selectedFilters();
    const parts = [];
    if (filters.branch !== "all") parts.push(`Filial ${filters.branch}`);
    if (filters.local !== "all") parts.push(`Local ${filters.local}`);
    if (filters.usage !== "all") parts.push(filters.usage);
    const node = document.getElementById("monthlyFilterSummary");
    if (node) node.textContent = parts.length ? `Filtro aplicado: ${parts.join(" · ")}` : "Todos os registros selecionados.";
  }

  function fillSelectors() {
    const base = document.getElementById("monthlyBaseSelect");
    const current = document.getElementById("monthlyCurrentSelect");
    const count = document.getElementById("monthlyFileCount");
    if (!base || !current) return;
    const options = availableFiles.map((file) => `<option value="${escapeHtml(file.name)}">${escapeHtml(file.label)}</option>`).join("");
    base.innerHTML = options || '<option value="">Nenhuma base encontrada</option>';
    current.innerHTML = options || '<option value="">Nenhuma base encontrada</option>';
    if (availableFiles.length >= 2) {
      base.value = availableFiles[availableFiles.length - 2].name;
      current.value = availableFiles[availableFiles.length - 1].name;
      current.disabled = false;
      document.getElementById("monthlyCompareButton").disabled = false;
    } else if (availableFiles.length === 1) {
      base.value = current.value = availableFiles[0].name;
      current.disabled = true;
      document.getElementById("monthlyCompareButton").disabled = true;
    }
    if (count) count.textContent = `${availableFiles.length} ${availableFiles.length === 1 ? "base encontrada" : "bases encontradas"}`;
  }

  function renderMetrics(base,current,rows) {
    const node = document.getElementById("monthlyCompareMetrics");
    if (!node) return;
    if (!current) {
      node.innerHTML = `<article class="month-compare-metric"><span>Saldo Real total</span><strong>${nf2.format(base.totalBalance)}</strong><small>${escapeHtml(base.file.label)}</small></article><article class="month-compare-metric"><span>Consumo real total</span><strong>${nf2.format(base.totalConsumption)}</strong><small>${escapeHtml(base.file.label)}</small></article><article class="month-compare-metric"><span>Itens na base</span><strong>${nf0.format(base.itemCount)}</strong><small>códigos consolidados</small></article>`;
      return;
    }
    const delta = current.totalBalance - base.totalBalance;
    const deltaConsumption = current.totalConsumption - base.totalConsumption;
    const increased = rows.filter((row) => row.status === "increase").length;
    const decreased = rows.filter((row) => row.status === "decrease").length;
    node.innerHTML = `<article class="month-compare-metric"><span>Saldo base</span><strong>${nf2.format(base.totalBalance)}</strong><small>${escapeHtml(base.file.label)}</small></article><article class="month-compare-metric"><span>Saldo comparado</span><strong>${nf2.format(current.totalBalance)}</strong><small>${escapeHtml(current.file.label)}</small></article><article class="month-compare-metric"><span>Variação líquida</span><strong class="${delta >= 0 ? "month-delta--up" : "month-delta--down"}">${formatSigned(delta)}</strong><small>Saldo Real</small></article><article class="month-compare-metric"><span>Consumo comparado</span><strong>${nf2.format(current.totalConsumption)}</strong><small>${formatSigned(deltaConsumption)} vs. base</small></article><article class="month-compare-metric"><span>Itens alterados</span><strong>${nf0.format(increased + decreased)}</strong><small>${nf0.format(increased)} aumentaram · ${nf0.format(decreased)} reduziram</small></article>`;
  }

  function renderConsiderations(rows) {
    const node = document.getElementById("monthlyConsiderations");
    if (!node) return;
    const up = rows.filter((row) => row.status === "increase").sort((a,b) => b.deltaBalance - a.deltaBalance);
    const down = rows.filter((row) => row.status === "decrease").sort((a,b) => a.deltaBalance - b.deltaBalance);
    const upTotal = up.reduce((sum,row) => sum + row.deltaBalance,0);
    const downTotal = down.reduce((sum,row) => sum + Math.abs(row.deltaBalance),0);
    const list = (items,sign) => items.slice(0,8).map((row) => `<li><span><strong>${escapeHtml(row.code)}</strong> · ${escapeHtml(row.name)}</span><strong class="${sign === "+" ? "month-delta--up" : "month-delta--down"}">${formatSigned(row.deltaBalance)}</strong></li>`).join("") || "<li><span>Nenhum item nesta condição.</span></li>";
    node.innerHTML = `<article class="month-consideration month-consideration--up"><h3>Itens que aumentaram</h3><p>${nf0.format(up.length)} códigos tiveram aumento no Saldo Real.</p><div class="month-consideration__total"><span>Aumento acumulado</span><strong>+${nf2.format(upTotal)}</strong></div><ul>${list(up,"+")}</ul></article><article class="month-consideration month-consideration--down"><h3>Itens que reduziram</h3><p>${nf0.format(down.length)} códigos tiveram redução no Saldo Real.</p><div class="month-consideration__total"><span>Redução acumulada</span><strong>−${nf2.format(downTotal)}</strong></div><ul>${list(down,"-")}</ul></article>`;
  }

  function renderTable() {
    const tbody = document.getElementById("monthlyCompareTbody");
    if (!tbody) return;
    const query = normalize(document.getElementById("monthlySearch")?.value || "");
    const status = document.getElementById("monthlyStatusFilter")?.value || "all";
    const visible = currentRows.filter((row) => (status === "all" || row.status === status) && (!query || normalize(`${row.code} ${row.name}`).includes(query)));
    tbody.innerHTML = visible.slice(0,1000).map((row) => `<tr><td>${escapeHtml(row.code)}</td><td>${escapeHtml(row.name)}</td><td>${nf2.format(row.baseBalance)}</td><td>${nf2.format(row.currentBalance)}</td><td class="${row.deltaBalance > 0 ? "month-delta--up" : row.deltaBalance < 0 ? "month-delta--down" : ""}">${formatSigned(row.deltaBalance)}${row.pctBalance == null ? "" : ` (${nf2.format(row.pctBalance)}%)`}</td><td>${nf2.format(row.baseConsumption)}</td><td>${nf2.format(row.currentConsumption)}</td><td>${formatSigned(row.deltaConsumption)}</td><td><span class="month-status month-status--${row.status}">${row.status === "increase" ? "Aumentou" : row.status === "decrease" ? "Reduziu" : "Estável"}</span></td></tr>`).join("");
  }

  async function showSingleSnapshot(file) {
    setMessage(`Lendo ${file.label}…`);
    const snapshot = await fetchSnapshot(file);
    lastBaseSnapshot = snapshot;
    lastCurrentSnapshot = null;
    populatePageFilters(snapshot);
    const filtered = applySnapshotFilters(snapshot);
    renderMetrics(filtered,null,[]);
    document.getElementById("monthlyConsiderations").innerHTML = "";
    document.getElementById("monthlyCompareDetails")?.classList.add("is-hidden");
    updateFilterSummary();
    setMessage(`A base de ${file.label} já está pronta. Adicione outro arquivo mensal no padrão “01 - Estoque_<Mês>_<Ano>.csv” para habilitar a comparação.`);
  }

  async function runComparison() {
    const baseName = document.getElementById("monthlyBaseSelect")?.value;
    const currentName = document.getElementById("monthlyCurrentSelect")?.value;
    const baseFile = availableFiles.find((file) => file.name === baseName);
    const currentFile = availableFiles.find((file) => file.name === currentName);
    if (!baseFile || !currentFile) return;
    if (baseFile.name === currentFile.name) { setMessage("Selecione dois meses diferentes para comparar.","warning"); return; }
    setMessage(`Comparando ${baseFile.label} com ${currentFile.label}…`);
    try {
      const [baseRaw,currentRaw] = await Promise.all([fetchSnapshot(baseFile),fetchSnapshot(currentFile)]);
      lastBaseSnapshot = baseRaw;
      lastCurrentSnapshot = currentRaw;
      populatePageFilters(baseRaw,currentRaw);
      const base = applySnapshotFilters(baseRaw);
      const current = applySnapshotFilters(currentRaw);
      currentRows = compareSnapshots(base,current);
      renderMetrics(base,current,currentRows);
      renderConsiderations(currentRows);
      document.getElementById("monthlyCompareDetails")?.classList.remove("is-hidden");
      renderTable();
      updateFilterSummary();
      setMessage(`Comparação concluída: ${baseFile.label} → ${currentFile.label}. Filtros aplicados antes da consolidação por código.`);
    } catch (error) { setMessage(error?.message || "Falha ao comparar os meses.","error"); }
  }

  function reapplyCurrentView() {
    if (lastCurrentSnapshot) {
      const base = applySnapshotFilters(lastBaseSnapshot);
      const current = applySnapshotFilters(lastCurrentSnapshot);
      currentRows = compareSnapshots(base,current);
      renderMetrics(base,current,currentRows);
      renderConsiderations(currentRows);
      document.getElementById("monthlyCompareDetails")?.classList.remove("is-hidden");
      renderTable();
    } else if (lastBaseSnapshot) {
      renderMetrics(applySnapshotFilters(lastBaseSnapshot),null,[]);
    }
    updateFilterSummary();
  }

  async function refreshFiles() {
    try {
      setMessage("Consultando os arquivos mensais do repositório…");
      await discoverFiles();
      fillSelectors();
      if (!availableFiles.length) { setMessage("Nenhum arquivo mensal encontrado. Use o padrão “01 - Estoque_Set_2026.csv”."); return; }
      if (availableFiles.length === 1) await showSingleSnapshot(availableFiles[0]);
      else await runComparison();
    } catch (error) { setMessage(error?.message || "Falha ao carregar as bases mensais.","error"); }
  }

  function clearPageFilters() {
    ["monthlyBranchFilter","monthlyLocalFilter","monthlyUsageFilter"].forEach((id) => { const select = document.getElementById(id); if (select) select.value = "all"; });
    reapplyCurrentView();
  }

  function bindUi() {
    document.getElementById("monthlyCompareButton")?.addEventListener("click",runComparison);
    document.getElementById("monthlyApplyFilters")?.addEventListener("click",reapplyCurrentView);
    document.getElementById("monthlyClearFilters")?.addEventListener("click",clearPageFilters);
    document.getElementById("monthlySearch")?.addEventListener("input",renderTable);
    document.getElementById("monthlyStatusFilter")?.addEventListener("change",renderTable);
  }

  function install() {
    if (!ensureUi()) { setTimeout(install,300); return; }
    installNavigation();
    bindUi();
    refreshFiles();
    if (location.hash === "#comparativo-mensal") openPage();
    if (typeof forceResponsiveNavigation === "function") setTimeout(forceResponsiveNavigation,50);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",install,{once:true}); else install();
})();
