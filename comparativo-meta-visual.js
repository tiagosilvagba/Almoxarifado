"use strict";

(() => {
  const AREA_FILE = "./02 - Responsaveis_Reposição.CSV?metavisual=20260914-2";
  const cache = new Map();
  const areaMap = new Map();
  let scheduled = false;
  let rendering = false;
  let lastSignature = "";
  const nf = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

  const norm = (v) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const keyPart = (v) => { const s = String(v ?? "").trim(); return /^0*\d+$/.test(s) ? String(Number(s)) : norm(s); };
  const positionKey = (branch, local) => `${keyPart(branch)}::${keyPart(local)}`;

  function parseNumber(value) {
    let text = String(value ?? "").trim();
    if (!text || text === "—" || text === "-") return 0;
    text = text.replace(/\s/g, "").replace(/R\$/gi, "").replace(/[^0-9,.-]/g, "");
    const comma = text.lastIndexOf(","), dot = text.lastIndexOf(".");
    if (comma > dot) text = text.replace(/\./g, "").replace(",", ".");
    else if (dot > comma && comma >= 0) text = text.replace(/,/g, "");
    else if (comma >= 0) text = text.replace(",", ".");
    const number = Number(text);
    return Number.isFinite(number) ? number : 0;
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
    const normalized = headers.map(norm);
    for (const name of names) { const index = normalized.indexOf(norm(name)); if (index >= 0) return index; }
    for (const name of contains) { const index = normalized.findIndex((header) => header.includes(norm(name))); if (index >= 0) return index; }
    return -1;
  }

  async function fetchText(url, cacheMode = "default") {
    const response = await fetch(encodeURI(url), { cache: cacheMode });
    if (!response.ok) throw new Error(`Não foi possível ler ${url}.`);
    const buffer = await response.arrayBuffer();
    let text = new TextDecoder("utf-8").decode(buffer);
    if (text.includes("�")) { try { text = new TextDecoder("windows-1252").decode(buffer); } catch {} }
    return text;
  }

  async function loadAreas() {
    if (areaMap.size) return;
    try {
      const parsed = parseCsv(await fetchText(AREA_FILE, "no-store"));
      const bi = col(parsed.headers, ["FILIAL", "CD FILIAL"]), li = col(parsed.headers, ["CD LOCAL", "LOCAL"]), ai = col(parsed.headers, ["Área", "Area"]);
      if (bi < 0 || li < 0 || ai < 0) return;
      parsed.rows.forEach((r) => {
        const branch = String(r[bi] ?? "").trim(), local = String(r[li] ?? "").trim(), area = String(r[ai] ?? "").trim();
        if (!branch || !local || !area) return;
        const key = positionKey(branch, local), set = areaMap.get(key) || new Set();
        set.add(area); areaMap.set(key, set);
      });
    } catch (error) {
      console.warn("Comparativo meta visual: áreas indisponíveis.", error);
    }
  }

  async function loadSnapshot(fileName) {
    if (!fileName) return null;
    if (cache.has(fileName)) return cache.get(fileName);
    const promise = (async () => {
      const parsed = parseCsv(await fetchText(`./${fileName}`));
      const h = parsed.headers;
      const ci = col(h, ["Item", "ITEM", "Código", "Codigo", "Código item", "Codigo item", "Cd Item", "CD_ITEM", "Material"], ["codigo item", "cd item"]);
      const si = col(h, ["Saldo Real"], ["saldo real"]);
      const bi = col(h, ["CD Filial", "Cd Filial", "Código Filial", "Codigo Filial", "Filial"], ["cd filial", "codigo filial"]);
      const li = col(h, ["Local de estoque", "Local Estoque", "CD Local", "Cd Local", "Local"], ["local de estoque", "local estoque", "cd local"]);
      const ui = col(h, ["Nome utilização", "Nome utilizacao", "NM Utilização", "NM Utilizacao", "Utilização", "Utilizacao"], ["nome utilizacao", "nm utilizacao"]);
      if (ci < 0 || si < 0) throw new Error(`${fileName}: colunas Item ou Saldo Real não encontradas.`);
      return parsed.rows.map((r) => {
        const branch = bi >= 0 ? String(r[bi] ?? "").trim() : "";
        const local = li >= 0 ? String(r[li] ?? "").trim() : "";
        return {
          code: String(r[ci] ?? "").trim(),
          balance: parseNumber(r[si]),
          branch,
          local,
          usage: ui >= 0 ? String(r[ui] ?? "").trim() : "",
          areas: [...(areaMap.get(positionKey(branch, local)) || [])]
        };
      }).filter((r) => r.code);
    })();
    cache.set(fileName, promise);
    return promise;
  }

  function filters() {
    return {
      branch: document.getElementById("monthlyBranchFilter")?.value || "all",
      local: document.getElementById("monthlyLocalFilter")?.value || "all",
      usage: document.getElementById("monthlyUsageFilter")?.value || "all",
      area: document.getElementById("monthlyAreaFilter")?.value || "all"
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
    records.forEach((record) => {
      const current = map.get(record.code) || 0;
      map.set(record.code, current + record.balance);
    });
    return map;
  }

  function percent(meta, compared) {
    if (!meta) return compared ? null : 0;
    return ((compared - meta) / Math.abs(meta)) * 100;
  }

  function formatSigned(value) {
    if (Math.abs(value) < 0.000001) return "0";
    return `${value > 0 ? "+" : "−"}${nf.format(Math.abs(value))}`;
  }

  function selectedLabel(id, fallback) {
    const select = document.getElementById(id);
    return select?.selectedOptions?.[0]?.textContent?.trim() || fallback;
  }

  function ensureStyles() {
    if (document.getElementById("monthlyComparedMetaVisualStyles")) return;
    const style = document.createElement("style");
    style.id = "monthlyComparedMetaVisualStyles";
    style.textContent = `
      .month-compared-meta-visual{margin:0 0 18px;padding:16px;border:1px solid var(--steel-200);border-radius:16px;background:var(--surface,#fff)}
      .month-compared-meta-visual__head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}.month-compared-meta-visual__head h3{margin:0 0 4px}.month-compared-meta-visual__head p{margin:0;color:var(--muted)}
      .month-compared-meta-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}.month-compared-meta-kpi{padding:14px;border:1px solid var(--steel-200);border-radius:12px;background:var(--steel-50,#fff);display:grid;gap:6px}.month-compared-meta-kpi span{font-size:12px;font-weight:800;color:var(--muted)}.month-compared-meta-kpi strong{font-size:21px;color:var(--text)}.month-compared-meta-kpi small{color:var(--muted)}
      .month-compared-meta-bars{display:grid;gap:12px;margin:2px 0 16px}.month-compared-meta-bar{display:grid;grid-template-columns:minmax(120px,190px) minmax(0,1fr) auto;gap:10px;align-items:center}.month-compared-meta-bar__label{font-weight:800;overflow-wrap:anywhere}.month-compared-meta-bar__track{height:14px;border-radius:999px;background:var(--steel-100);overflow:hidden;border:1px solid var(--steel-200)}.month-compared-meta-bar__fill{display:block;height:100%;min-width:2px;border-radius:inherit;background:var(--active-accent,#4777ff)}.month-compared-meta-bar--meta .month-compared-meta-bar__fill{background:var(--theme-on-light,#6b7280)}.month-compared-meta-bar__value{font-variant-numeric:tabular-nums;font-weight:800;white-space:nowrap}
      .month-compared-meta-status{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.month-compared-meta-status article{padding:12px;border:1px solid var(--steel-200);border-radius:12px;text-align:center;background:var(--surface,#fff)}.month-compared-meta-status strong{display:block;font-size:20px}.month-compared-meta-status small{color:var(--muted)}.month-compared-meta-up strong{color:#169b62}.month-compared-meta-down strong{color:#d64545}.month-compared-meta-equal strong{color:var(--muted)}
      @media(max-width:900px){.month-compared-meta-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.month-compared-meta-bar{grid-template-columns:1fr}.month-compared-meta-bar__value{justify-self:start}.month-compared-meta-status{grid-template-columns:1fr}}@media(max-width:520px){.month-compared-meta-kpis{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function ensureContainer() {
    const targetBlock = document.getElementById("monthlyTargetBlock");
    if (!targetBlock) return null;
    let node = document.getElementById("monthlyComparedMetaVisual");
    if (!node) {
      node = document.createElement("section");
      node.id = "monthlyComparedMetaVisual";
      node.className = "month-compared-meta-visual is-hidden";
      targetBlock.insertAdjacentElement("afterend", node);
    }
    return node;
  }

  async function calculateData(currentName, targetName) {
    await loadAreas();
    const [currentRecords, targetRecords] = await Promise.all([loadSnapshot(currentName), loadSnapshot(targetName)]);
    const f = filters();
    const current = aggregate(currentRecords.filter((r) => matches(r, f)));
    const target = aggregate(targetRecords.filter((r) => matches(r, f)));
    const codes = new Set([...current.keys(), ...target.keys()]);
    let compared = 0, meta = 0, above = 0, below = 0, equal = 0;
    current.forEach((value) => { compared += value; });
    target.forEach((value) => { meta += value; });
    codes.forEach((code) => {
      const c = current.get(code) || 0;
      const m = target.get(code) || 0;
      const d = c - m;
      if (d > 0.000001) above += 1;
      else if (d < -0.000001) below += 1;
      else equal += 1;
    });
    return { compared, meta, above, below, equal, rows: codes.size };
  }

  async function render() {
    scheduled = false;
    if (rendering) return;
    rendering = true;
    try {
      ensureStyles();
      const node = ensureContainer();
      if (!node) return;
      const currentName = document.getElementById("monthlyCurrentSelect")?.value;
      const targetName = document.getElementById("monthlyTargetSelect")?.value;
      if (!currentName || !targetName) {
        node.classList.add("is-hidden"); node.innerHTML = ""; lastSignature = ""; return;
      }
      const data = await calculateData(currentName, targetName);
      const comparedLabel = selectedLabel("monthlyCurrentSelect", "Mês comparado");
      const metaLabel = selectedLabel("monthlyTargetSelect", "Mês meta");
      const f = filters();
      const signature = [currentName,targetName,f.branch,f.local,f.usage,f.area,data.compared,data.meta,data.above,data.below,data.equal].join("|");
      if (signature === lastSignature) return;
      lastSignature = signature;
      const delta = data.compared - data.meta;
      const pct = percent(data.meta, data.compared);
      const max = Math.max(Math.abs(data.compared), Math.abs(data.meta), 1);
      const comparedWidth = Math.max(0, Math.min(100, Math.abs(data.compared) / max * 100));
      const metaWidth = Math.max(0, Math.min(100, Math.abs(data.meta) / max * 100));
      const deltaClass = delta > 0 ? "month-target-positive" : delta < 0 ? "month-target-negative" : "";
      node.innerHTML = `
        <div class="month-compared-meta-visual__head"><div><h3>Visualização: comparado × mês meta</h3><p>${comparedLabel} comparado diretamente com ${metaLabel}. Totais calculados sobre 100% dos itens da base selecionada.</p></div></div>
        <div class="month-compared-meta-kpis">
          <article class="month-compared-meta-kpi"><span>Saldo comparado · ${comparedLabel}</span><strong>${nf.format(data.compared)}</strong><small>total da base após filtros</small></article>
          <article class="month-compared-meta-kpi"><span>Saldo meta · ${metaLabel}</span><strong>${nf.format(data.meta)}</strong><small>total da base após filtros</small></article>
          <article class="month-compared-meta-kpi"><span>Diferença para a meta</span><strong class="${deltaClass}">${formatSigned(delta)}</strong><small>comparado − meta</small></article>
          <article class="month-compared-meta-kpi"><span>Variação percentual</span><strong class="${deltaClass}">${pct == null ? "—" : `${nf.format(pct)}%`}</strong><small>em relação ao mês meta</small></article>
        </div>
        <div class="month-compared-meta-bars" aria-label="Comparação visual dos saldos consolidados">
          <div class="month-compared-meta-bar"><span class="month-compared-meta-bar__label">${comparedLabel}</span><div class="month-compared-meta-bar__track"><span class="month-compared-meta-bar__fill" style="width:${comparedWidth}%"></span></div><strong class="month-compared-meta-bar__value">${nf.format(data.compared)}</strong></div>
          <div class="month-compared-meta-bar month-compared-meta-bar--meta"><span class="month-compared-meta-bar__label">${metaLabel}</span><div class="month-compared-meta-bar__track"><span class="month-compared-meta-bar__fill" style="width:${metaWidth}%"></span></div><strong class="month-compared-meta-bar__value">${nf.format(data.meta)}</strong></div>
        </div>
        <div class="month-compared-meta-status"><article class="month-compared-meta-up"><strong>${data.above}</strong><small>itens acima da meta</small></article><article class="month-compared-meta-down"><strong>${data.below}</strong><small>itens abaixo da meta</small></article><article class="month-compared-meta-equal"><strong>${data.equal}</strong><small>itens iguais à meta</small></article></div>`;
      node.classList.remove("is-hidden");
    } catch (error) {
      console.error("Falha ao calcular visualização comparado x meta.", error);
    } finally {
      rendering = false;
    }
  }

  function scheduleRender(delay = 0) {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => requestAnimationFrame(render), delay);
  }

  function install() {
    ensureStyles(); ensureContainer(); scheduleRender(120);
    ["monthlyCurrentSelect","monthlyTargetSelect","monthlyBranchFilter","monthlyLocalFilter","monthlyUsageFilter","monthlyAreaFilter"].forEach((id) => document.getElementById(id)?.addEventListener("change", () => scheduleRender(80)));
    document.getElementById("monthlyApplyFilters")?.addEventListener("click", () => scheduleRender(80));
    document.getElementById("monthlyClearFilters")?.addEventListener("click", () => scheduleRender(80));
    document.getElementById("monthlyCompareButton")?.addEventListener("click", () => scheduleRender(150));
    [350,900,1700].forEach((delay) => scheduleRender(delay));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once:true });
  else install();
})();
