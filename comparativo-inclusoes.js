"use strict";

(() => {
  const AREA_FILE = "./02 - Responsaveis_Reposição.CSV?inclusoes=20260914-1";
  const areaMap = new Map();
  const cache = new Map();
  let renderToken = 0;
  const nf = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

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
    let code = item, name = String(explicitName ?? "").trim();
    const match = item.match(/^(.{1,40}?)\s+-\s+(.+)$/);
    if (match && /[0-9]/.test(match[1])) {
      code = match[1].trim();
      if (!name || name === item || name === code) name = match[2].trim();
    }
    return { code, name };
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
    } catch (error) {
      console.warn("Comparativo inclusões: áreas indisponíveis", error);
    }
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
        records.push({
          code: parsed.code,
          name: parsed.name,
          balance: parseNumber(r[si]),
          branch,
          local,
          usage: ui >= 0 ? String(r[ui] ?? "").trim() : "",
          areas: [...(areaMap.get(positionKey(branch, local)) || [])],
        });
      }
      return { fileName, records };
    })();
    cache.set(fileName, promise);
    return promise;
  }

  function filters() {
    return {
      branch: document.getElementById("monthlyBranchFilter")?.value || "all",
      local: document.getElementById("monthlyLocalFilter")?.value || "all",
      usage: document.getElementById("monthlyUsageFilter")?.value || "all",
      area: document.getElementById("monthlyAreaFilter")?.value || "all",
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
      const item = map.get(r.code) || { code: r.code, name: r.name, balance: 0 };
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
    style.textContent = `
      .month-stock-inclusions{margin:0 0 18px;padding:16px;border:1px solid var(--steel-200);border-radius:16px;background:var(--surface,#fff)}
      .month-stock-inclusions__head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}.month-stock-inclusions__head h3{margin:0 0 4px}.month-stock-inclusions__head p{margin:0;color:var(--muted)}
      .month-stock-inclusions__total{min-width:150px;padding:10px 12px;border:1px solid var(--steel-200);border-radius:12px;text-align:right}.month-stock-inclusions__total span{display:block;font-size:12px;color:var(--muted);font-weight:800}.month-stock-inclusions__total strong{font-size:21px}
      .month-stock-inclusions__list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:0;padding:0;list-style:none}
      .month-stock-inclusions__list li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:12px;border:1px solid var(--steel-200);border-radius:12px;background:var(--steel-50,#fff)}
      .month-stock-inclusions__identity{min-width:0}.month-stock-inclusions__identity strong{display:block}.month-stock-inclusions__identity small{display:block;color:var(--muted);overflow-wrap:anywhere;margin-top:2px}.month-stock-inclusions__value{font-variant-numeric:tabular-nums;font-weight:900;color:#169b62;white-space:nowrap}
      .month-stock-inclusions__empty{padding:14px;border:1px dashed var(--steel-200);border-radius:12px;color:var(--muted)}
      @media(max-width:900px){.month-stock-inclusions__head{display:grid}.month-stock-inclusions__total{text-align:left}.month-stock-inclusions__list{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function ensureContainer() {
    const anchor = document.getElementById("monthlyComparedMetaVisual") || document.getElementById("monthlyTargetBlock");
    if (!anchor) return null;
    let node = document.getElementById("monthlyStockInclusions");
    if (!node) {
      node = document.createElement("section");
      node.id = "monthlyStockInclusions";
      node.className = "month-stock-inclusions is-hidden";
      anchor.insertAdjacentElement("afterend", node);
    }
    return node;
  }

  async function render() {
    const token = ++renderToken;
    ensureStyles();
    const node = ensureContainer();
    if (!node) return;
    const currentSelect = document.getElementById("monthlyCurrentSelect");
    const targetSelect = document.getElementById("monthlyTargetSelect");
    const currentName = currentSelect?.value;
    const targetName = targetSelect?.value;
    if (!currentName || !targetName) {
      node.classList.add("is-hidden");
      node.innerHTML = "";
      return;
    }

    try {
      await loadAreas();
      const [current, target] = await Promise.all([loadSnapshot(currentName), loadSnapshot(targetName)]);
      if (token !== renderToken) return;
      const f = filters();
      const currentMap = aggregate(current.records.filter((r) => matches(r, f)));
      const targetMap = aggregate(target.records.filter((r) => matches(r, f)));
      const inclusions = [...currentMap.values()]
        .filter((item) => !targetMap.has(item.code))
        .sort((a, b) => b.balance - a.balance);
      const top = inclusions.slice(0, 10);
      const totalBalance = inclusions.reduce((sum, item) => sum + item.balance, 0);
      const currentLabel = currentSelect.selectedOptions?.[0]?.textContent?.trim() || "Mês comparado";
      const targetLabel = targetSelect.selectedOptions?.[0]?.textContent?.trim() || "Mês meta";

      const list = top.length
        ? `<ol class="month-stock-inclusions__list">${top.map((item, index) => `<li><div class="month-stock-inclusions__identity"><strong>${index + 1}. ${esc(item.code)}</strong><small>${esc(item.name || "Item sem nome")}</small></div><span class="month-stock-inclusions__value">${nf.format(item.balance)}</span></li>`).join("")}</ol>`
        : '<div class="month-stock-inclusions__empty">Nenhuma inclusão de estoque identificada neste recorte.</div>';

      node.innerHTML = `
        <div class="month-stock-inclusions__head">
          <div><h3>Inclusões de estoque · Top 10</h3><p>Itens existentes em ${esc(currentLabel)} que não existiam em ${esc(targetLabel)} no mesmo recorte filtrado.</p></div>
          <div class="month-stock-inclusions__total"><span>Total de inclusões</span><strong>${inclusions.length}</strong><small>${nf.format(totalBalance)} de saldo incluído</small></div>
        </div>
        ${list}`;
      node.classList.remove("is-hidden");
    } catch (error) {
      if (token !== renderToken) return;
      node.classList.remove("is-hidden");
      node.innerHTML = `<div class="month-stock-inclusions__empty">Não foi possível calcular as inclusões de estoque: ${esc(error?.message || error)}</div>`;
    }
  }

  function schedule(delay = 60) { setTimeout(render, delay); }

  function install() {
    ensureStyles();
    ensureContainer();
    schedule(150);
    ["monthlyCurrentSelect", "monthlyTargetSelect", "monthlyBranchFilter", "monthlyLocalFilter", "monthlyUsageFilter", "monthlyAreaFilter"].forEach((id) => {
      document.getElementById(id)?.addEventListener("change", () => schedule());
    });
    document.getElementById("monthlyApplyFilters")?.addEventListener("click", () => schedule());
    document.getElementById("monthlyClearFilters")?.addEventListener("click", () => schedule());
    document.getElementById("monthlyCompareButton")?.addEventListener("click", () => schedule(150));
    [350, 900, 1700].forEach((delay) => schedule(delay));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
