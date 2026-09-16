"use strict";

(() => {
  const AREA_FILE = "./02 - Responsaveis_Reposição.CSV?inclusoes=20260914-3";
  const VALUE_MULTIPLIER = 1000;
  const areaMap = new Map();
  const cache = new Map();
  let renderToken = 0;
  let renderTimer = 0;
  const nf = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const norm = (v) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const keyPart = (v) => { const s = String(v ?? "").trim(); return /^0*\d+$/.test(s) ? String(Number(s)) : norm(s); };
  const positionKey = (branch, local) => `${keyPart(branch)}::${keyPart(local)}`;
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  function parseNumber(value) {
    let text = String(value ?? "").trim();
    if (!text || text === "-" || text === "—") return 0;
    text = text.replace(/\s/g, "").replace(/R\$/gi, "").replace(/[^0-9,.-]/g, "");
    const comma = text.lastIndexOf(","), dot = text.lastIndexOf(".");
    if (comma > dot) text = text.replace(/\./g, "").replace(",", ".");
    else if (dot > comma && comma >= 0) text = text.replace(/,/g, "");
    else if (comma >= 0) text = text.replace(",", ".");
    const n = Number(text);
    return Number.isFinite(n) ? n : 0;
  }

  function parseCsv(text) {
    text = String(text || "").replace(/^\uFEFF/, "");
    const first = text.split(/\r?\n/, 1)[0] || "";
    const delimiter = [";", ",", "\t", "|"].reduce((best, current) => first.split(current).length > first.split(best).length ? current : best, ";");
    const rows = []; let row = [], field = "", quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
        else if (c === '"') quoted = false;
        else field += c;
        continue;
      }
      if (c === '"') { quoted = true; continue; }
      if (c === delimiter) { row.push(field); field = ""; continue; }
      if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i += 1;
        row.push(field); field = "";
        if (row.some((x) => String(x).trim())) rows.push(row);
        row = [];
        continue;
      }
      field += c;
    }
    if (field || row.length) { row.push(field); if (row.some((x) => String(x).trim())) rows.push(row); }
    if (!rows.length) return { headers: [], rows: [] };
    return { headers: rows.shift().map((x) => String(x).trim()), rows };
  }

  function col(headers, names, contains = []) {
    const h = headers.map(norm);
    for (const n of names) { const i = h.indexOf(norm(n)); if (i >= 0) return i; }
    for (const n of contains) { const i = h.findIndex((x) => x.includes(norm(n))); if (i >= 0) return i; }
    return -1;
  }

  function splitItem(raw, explicitName = "") {
    const item = String(raw ?? "").trim();
    let displayCode = item, name = String(explicitName ?? "").trim();
    const match = item.match(/^(.{1,40}?)\s+-\s+(.+)$/);
    if (match && /[0-9]/.test(match[1])) {
      displayCode = match[1].trim();
      if (!name || name === item || name === displayCode) name = match[2].trim();
    }
    return { code:keyPart(displayCode), displayCode, name };
  }

  async function fetchText(url, cacheMode = "default") {
    const response = await fetch(encodeURI(url), { cache: cacheMode });
    if (!response.ok) throw new Error(`Falha ao ler ${url}`);
    const buffer = await response.arrayBuffer();
    let text = new TextDecoder("utf-8").decode(buffer);
    if (text.includes("�")) { try { text = new TextDecoder("windows-1252").decode(buffer); } catch {} }
    return text;
  }

  async function loadAreas() {
    if (areaMap.size) return;
    try {
      const p = parseCsv(await fetchText(AREA_FILE, "no-store"));
      const bi = col(p.headers, ["FILIAL", "CD FILIAL"]), li = col(p.headers, ["CD LOCAL", "LOCAL"]), ai = col(p.headers, ["Área", "Area"]);
      if (bi < 0 || li < 0 || ai < 0) return;
      p.rows.forEach((r) => {
        const b = String(r[bi] ?? "").trim(), l = String(r[li] ?? "").trim(), a = String(r[ai] ?? "").trim();
        if (!b || !l || !a) return;
        const key = positionKey(b, l), set = areaMap.get(key) || new Set();
        set.add(a); areaMap.set(key, set);
      });
    } catch (error) { console.warn("Comparativo: áreas indisponíveis", error); }
  }

  async function loadSnapshot(fileName) {
    if (!fileName) return null;
    if (cache.has(fileName)) return cache.get(fileName);
    const promise = (async () => {
      const p = parseCsv(await fetchText(`./${fileName}`));
      const h = p.headers;
      const ci = col(h, ["Item", "ITEM", "Código", "Codigo", "Código item", "Codigo item", "Cd Item", "CD_ITEM", "Material"], ["codigo item", "cd item"]);
      const ni = col(h, ["Nome Item", "NM Item", "Nm Item", "NM_ITEM", "Nome do Item", "Descrição", "Descricao", "Descrição Item", "Descricao Item", "Descrição do Item", "Descricao do Item"], ["nome item", "nm item", "descricao item"]);
      const si = col(h, ["Saldo Real"], ["saldo real"]);
      const bi = col(h, ["CD Filial", "Cd Filial", "Código Filial", "Codigo Filial", "Filial"], ["cd filial", "codigo filial"]);
      const li = col(h, ["Local de estoque", "Local Estoque", "CD Local", "Cd Local", "Local"], ["local de estoque", "local estoque", "cd local"]);
      const ui = col(h, ["Nome utilização", "Nome utilizacao", "NM Utilização", "NM Utilizacao", "Utilização", "Utilizacao"], ["nome utilizacao", "nm utilizacao"]);
      if (ci < 0 || si < 0) throw new Error(`${fileName}: colunas Item ou Saldo Real não encontradas`);
      const records = [];
      for (const r of p.rows) {
        const parsed = splitItem(r[ci], ni >= 0 ? r[ni] : "");
        if (!parsed.code) continue;
        const branch = bi >= 0 ? String(r[bi] ?? "").trim() : "";
        const local = li >= 0 ? String(r[li] ?? "").trim() : "";
        records.push({ ...parsed, balance:parseNumber(r[si]), branch, local, usage:ui >= 0 ? String(r[ui] ?? "").trim() : "", areas:[...(areaMap.get(positionKey(branch, local)) || [])] });
      }
      return { fileName, records };
    })();
    cache.set(fileName, promise);
    try { return await promise; } catch (error) { cache.delete(fileName); throw error; }
  }

  function filters() {
    return {
      branch:document.getElementById("monthlyBranchFilter")?.value || "all",
      local:document.getElementById("monthlyLocalFilter")?.value || "all",
      usage:document.getElementById("monthlyUsageFilter")?.value || "all",
      area:document.getElementById("monthlyAreaFilter")?.value || "all",
    };
  }
  function matches(record, f) {
    if (f.branch !== "all" && record.branch !== f.branch) return false;
    if (f.local !== "all" && record.local !== f.local) return false;
    if (f.usage !== "all" && record.usage !== f.usage) return false;
    if (f.area !== "all" && !record.areas.includes(f.area)) return false;
    return true;
  }
  function aggregate(records) {
    const map = new Map();
    for (const r of records) {
      const item = map.get(r.code) || { code:r.code, displayCode:r.displayCode, name:r.name, balance:0 };
      if (!item.name && r.name) item.name = r.name;
      item.balance += r.balance;
      map.set(r.code, item);
    }
    return map;
  }

  function ensureStyles() {
    if (document.getElementById("monthlyStockInclusionStyles")) return;
    const style = document.createElement("style");
    style.id = "monthlyStockInclusionStyles";
    style.textContent = `.month-stock-inclusions,.month-stock-zero-reductions{margin:0 0 18px;padding:16px;border:1px solid var(--steel-200);border-radius:16px;background:var(--surface,#fff)}.month-stock-inclusions__head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}.month-stock-inclusions__head h3{margin:0 0 4px}.month-stock-inclusions__head p{margin:0;color:var(--muted)}.month-stock-inclusions__total{min-width:150px;padding:10px 12px;border:1px solid var(--steel-200);border-radius:12px;text-align:right}.month-stock-inclusions__total span{display:block;font-size:12px;color:var(--muted);font-weight:800}.month-stock-inclusions__total strong{font-size:21px}.month-stock-inclusions__list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:0;padding:0;list-style:none}.month-stock-inclusions__list li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:12px;border:1px solid var(--steel-200);border-radius:12px;background:var(--steel-50,#fff)}.month-stock-inclusions__identity{min-width:0}.month-stock-inclusions__identity strong{display:block}.month-stock-inclusions__identity small{display:block;color:var(--muted);overflow-wrap:anywhere;margin-top:2px}.month-stock-inclusions__value{font-variant-numeric:tabular-nums;font-weight:900;color:#169b62;white-space:nowrap}.month-stock-zero-reductions .month-stock-inclusions__value{color:#d64545}.month-stock-inclusions__empty{padding:14px;border:1px dashed var(--steel-200);border-radius:12px;color:var(--muted)}@media(max-width:900px){.month-stock-inclusions__head{display:grid}.month-stock-inclusions__total{text-align:left}.month-stock-inclusions__list{grid-template-columns:1fr}}`;
    document.head.appendChild(style);
  }

  function ensureContainers() {
    const anchor = document.getElementById("monthlyComparedMetaVisual") || document.getElementById("monthlyTargetBlock");
    if (!anchor) return {};
    let inclusionsNode = document.getElementById("monthlyStockInclusions");
    if (!inclusionsNode) { inclusionsNode = document.createElement("section"); inclusionsNode.id = "monthlyStockInclusions"; inclusionsNode.className = "month-stock-inclusions is-hidden"; anchor.insertAdjacentElement("afterend", inclusionsNode); }
    let reductionsNode = document.getElementById("monthlyStockZeroReductions");
    if (!reductionsNode) { reductionsNode = document.createElement("section"); reductionsNode.id = "monthlyStockZeroReductions"; reductionsNode.className = "month-stock-zero-reductions is-hidden"; inclusionsNode.insertAdjacentElement("afterend", reductionsNode); }
    return { inclusionsNode, reductionsNode };
  }

  function renderRankList(items, valueSelector, negative = false) {
    if (!items.length) return '<div class="month-stock-inclusions__empty">Nenhum item identificado neste recorte.</div>';
    return `<ol class="month-stock-inclusions__list">${items.map((item, index) => `<li><div class="month-stock-inclusions__identity"><strong>${index + 1}. ${esc(item.displayCode || item.code)}</strong><small>${esc(item.name || "Item sem nome")}</small></div><span class="month-stock-inclusions__value" data-scale-mil="1">${negative ? "−" : ""}${nf.format(Math.abs(valueSelector(item) * VALUE_MULTIPLIER))}</span></li>`).join("")}</ol>`;
  }

  async function render() {
    const token = ++renderToken;
    ensureStyles();
    const { inclusionsNode, reductionsNode } = ensureContainers();
    if (!inclusionsNode || !reductionsNode) return;
    const baseSelect = document.getElementById("monthlyBaseSelect");
    const currentSelect = document.getElementById("monthlyCurrentSelect");
    const baseName = baseSelect?.value, currentName = currentSelect?.value;
    if (!baseName || !currentName) return;
    try {
      await loadAreas();
      const [base, current] = await Promise.all([loadSnapshot(baseName), loadSnapshot(currentName)]);
      if (token !== renderToken) return;
      const f = filters();
      const baseMap = aggregate(base.records.filter((r) => matches(r, f)));
      const currentMap = aggregate(current.records.filter((r) => matches(r, f)));
      const inclusions = [...currentMap.values()].filter((item) => !baseMap.has(item.code)).sort((a,b) => b.balance - a.balance);
      const zeroReductions = [...baseMap.values()].filter((item) => item.balance > 0 && currentMap.has(item.code) && Math.abs(currentMap.get(item.code).balance) < 0.000001).sort((a,b) => b.balance - a.balance);
      const baseLabel = baseSelect.selectedOptions?.[0]?.textContent?.trim() || "Mês base";
      const currentLabel = currentSelect.selectedOptions?.[0]?.textContent?.trim() || "Mês comparado";
      const totalInclusions = inclusions.reduce((s,x) => s + x.balance, 0);
      const totalReductions = zeroReductions.reduce((s,x) => s + x.balance, 0);

      inclusionsNode.innerHTML = `<div class="month-stock-inclusions__head"><div><h3>Inclusões de estoque · Top 10</h3><p>Itens de ${esc(currentLabel)} que não existiam em ${esc(baseLabel)} no mesmo recorte filtrado.</p></div><div class="month-stock-inclusions__total"><span>Total de inclusões</span><strong>${inclusions.length}</strong><small>${nf.format(totalInclusions * VALUE_MULTIPLIER)} de saldo incluído</small></div></div>${renderRankList(inclusions.slice(0,10), x => x.balance)}`;
      reductionsNode.innerHTML = `<div class="month-stock-inclusions__head"><div><h3>Reduções de estoque · Top 10 zerados</h3><p>Itens que tinham saldo em ${esc(baseLabel)} e estão zerados em ${esc(currentLabel)}.</p></div><div class="month-stock-inclusions__total"><span>Total de itens zerados</span><strong>${zeroReductions.length}</strong><small>−${nf.format(totalReductions * VALUE_MULTIPLIER)} de saldo reduzido</small></div></div>${renderRankList(zeroReductions.slice(0,10), x => x.balance, true)}`;
      inclusionsNode.classList.remove("is-hidden");
      reductionsNode.classList.remove("is-hidden");
    } catch (error) {
      console.warn("Comparativo inclusões/reduções indisponível", error);
    }
  }

  function schedule(delay = 100) {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, delay);
  }

  function install() {
    ensureStyles();
    const waitForPage = () => {
      if (!document.getElementById("page-comparativo-mensal")) { setTimeout(waitForPage, 300); return; }
      ensureContainers();
      ["monthlyBaseSelect","monthlyCurrentSelect","monthlyBranchFilter","monthlyLocalFilter","monthlyUsageFilter","monthlyAreaFilter"].forEach((id) => document.getElementById(id)?.addEventListener("change", () => schedule(140)));
      ["monthlyApplyFilters","monthlyClearFilters","monthlyCompareButton"].forEach((id) => document.getElementById(id)?.addEventListener("click", () => schedule(180)));
      schedule(350);
      setTimeout(() => schedule(0), 1000);
    };
    waitForPage();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once:true }); else install();
})();
