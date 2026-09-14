"use strict";

(() => {
  let scheduled = false;
  let lastSignature = "";

  const nf = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

  function parsePtNumber(value) {
    let text = String(value ?? "").trim();
    if (!text || text === "—" || text === "-") return 0;
    text = text.replace(/\s/g, "").replace(/[^0-9,.-]/g, "");
    const comma = text.lastIndexOf(",");
    const dot = text.lastIndexOf(".");
    if (comma > dot) text = text.replace(/\./g, "").replace(",", ".");
    else if (dot > comma && comma >= 0) text = text.replace(/,/g, "");
    else if (comma >= 0) text = text.replace(",", ".");
    const number = Number(text);
    return Number.isFinite(number) ? number : 0;
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
      .month-compared-meta-visual__head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}
      .month-compared-meta-visual__head h3{margin:0 0 4px}.month-compared-meta-visual__head p{margin:0;color:var(--muted)}
      .month-compared-meta-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}
      .month-compared-meta-kpi{padding:14px;border:1px solid var(--steel-200);border-radius:12px;background:var(--steel-50,#fff);display:grid;gap:6px}
      .month-compared-meta-kpi span{font-size:12px;font-weight:800;color:var(--muted)}
      .month-compared-meta-kpi strong{font-size:21px;color:var(--text)}
      .month-compared-meta-kpi small{color:var(--muted)}
      .month-compared-meta-bars{display:grid;gap:12px;margin:2px 0 16px}
      .month-compared-meta-bar{display:grid;grid-template-columns:minmax(120px,190px) minmax(0,1fr) auto;gap:10px;align-items:center}
      .month-compared-meta-bar__label{font-weight:800;overflow-wrap:anywhere}
      .month-compared-meta-bar__track{height:14px;border-radius:999px;background:var(--steel-100);overflow:hidden;border:1px solid var(--steel-200)}
      .month-compared-meta-bar__fill{display:block;height:100%;min-width:2px;border-radius:inherit;background:var(--active-accent,#4777ff)}
      .month-compared-meta-bar--meta .month-compared-meta-bar__fill{background:var(--theme-on-light,#6b7280)}
      .month-compared-meta-bar__value{font-variant-numeric:tabular-nums;font-weight:800;white-space:nowrap}
      .month-compared-meta-status{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      .month-compared-meta-status article{padding:12px;border:1px solid var(--steel-200);border-radius:12px;text-align:center;background:var(--surface,#fff)}
      .month-compared-meta-status strong{display:block;font-size:20px}.month-compared-meta-status small{color:var(--muted)}
      .month-compared-meta-up strong{color:#169b62}.month-compared-meta-down strong{color:#d64545}.month-compared-meta-equal strong{color:var(--muted)}
      @media(max-width:900px){.month-compared-meta-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.month-compared-meta-bar{grid-template-columns:1fr}.month-compared-meta-bar__value{justify-self:start}.month-compared-meta-status{grid-template-columns:1fr}}
      @media(max-width:520px){.month-compared-meta-kpis{grid-template-columns:1fr}}
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

  function collectFromTargetTable() {
    const table = document.querySelector("#monthlyTargetBlock .month-target-table");
    if (!table) return null;
    const headers = [...table.querySelectorAll("thead th")].map((th) => th.textContent.trim().toLowerCase());
    const comparedIndex = headers.findIndex((h) => h.includes("saldo comparado") || h.includes("saldo ·") && h.includes(selectedLabel("monthlyCurrentSelect", "").toLowerCase()));
    const metaIndex = headers.findIndex((h) => h.includes("saldo meta"));
    if (comparedIndex < 0 || metaIndex < 0) return null;

    let compared = 0;
    let meta = 0;
    let above = 0;
    let below = 0;
    let equal = 0;
    let rows = 0;

    table.querySelectorAll("tbody tr").forEach((tr) => {
      const cells = tr.querySelectorAll("td");
      if (cells.length <= Math.max(comparedIndex, metaIndex)) return;
      const c = parsePtNumber(cells[comparedIndex].textContent);
      const m = parsePtNumber(cells[metaIndex].textContent);
      compared += c;
      meta += m;
      rows += 1;
      const d = c - m;
      if (d > 0.000001) above += 1;
      else if (d < -0.000001) below += 1;
      else equal += 1;
    });

    return { compared, meta, above, below, equal, rows };
  }

  function render() {
    scheduled = false;
    ensureStyles();
    const node = ensureContainer();
    if (!node) return;
    const targetName = document.getElementById("monthlyTargetSelect")?.value;
    if (!targetName) {
      node.classList.add("is-hidden");
      node.innerHTML = "";
      lastSignature = "";
      return;
    }

    const data = collectFromTargetTable();
    if (!data || !data.rows) return;
    const comparedLabel = selectedLabel("monthlyCurrentSelect", "Mês comparado");
    const metaLabel = selectedLabel("monthlyTargetSelect", "Mês meta");
    const delta = data.compared - data.meta;
    const pct = percent(data.meta, data.compared);
    const signature = [comparedLabel, metaLabel, data.compared, data.meta, data.above, data.below, data.equal].join("|");
    if (signature === lastSignature) return;
    lastSignature = signature;

    const max = Math.max(Math.abs(data.compared), Math.abs(data.meta), 1);
    const comparedWidth = Math.max(0, Math.min(100, Math.abs(data.compared) / max * 100));
    const metaWidth = Math.max(0, Math.min(100, Math.abs(data.meta) / max * 100));
    const deltaClass = delta > 0 ? "month-target-positive" : delta < 0 ? "month-target-negative" : "";

    node.innerHTML = `
      <div class="month-compared-meta-visual__head">
        <div><h3>Visualização: comparado × mês meta</h3><p>${comparedLabel} comparado diretamente com ${metaLabel}.</p></div>
      </div>
      <div class="month-compared-meta-kpis">
        <article class="month-compared-meta-kpi"><span>Saldo comparado · ${comparedLabel}</span><strong>${nf.format(data.compared)}</strong><small>saldo consolidado filtrado</small></article>
        <article class="month-compared-meta-kpi"><span>Saldo meta · ${metaLabel}</span><strong>${nf.format(data.meta)}</strong><small>referência selecionada</small></article>
        <article class="month-compared-meta-kpi"><span>Diferença para a meta</span><strong class="${deltaClass}">${formatSigned(delta)}</strong><small>comparado − meta</small></article>
        <article class="month-compared-meta-kpi"><span>Variação percentual</span><strong class="${deltaClass}">${pct == null ? "—" : `${nf.format(pct)}%`}</strong><small>em relação ao mês meta</small></article>
      </div>
      <div class="month-compared-meta-bars" aria-label="Comparação visual dos saldos consolidados">
        <div class="month-compared-meta-bar"><span class="month-compared-meta-bar__label">${comparedLabel}</span><div class="month-compared-meta-bar__track"><span class="month-compared-meta-bar__fill" style="width:${comparedWidth}%"></span></div><strong class="month-compared-meta-bar__value">${nf.format(data.compared)}</strong></div>
        <div class="month-compared-meta-bar month-compared-meta-bar--meta"><span class="month-compared-meta-bar__label">${metaLabel}</span><div class="month-compared-meta-bar__track"><span class="month-compared-meta-bar__fill" style="width:${metaWidth}%"></span></div><strong class="month-compared-meta-bar__value">${nf.format(data.meta)}</strong></div>
      </div>
      <div class="month-compared-meta-status">
        <article class="month-compared-meta-up"><strong>${data.above}</strong><small>itens acima da meta</small></article>
        <article class="month-compared-meta-down"><strong>${data.below}</strong><small>itens abaixo da meta</small></article>
        <article class="month-compared-meta-equal"><strong>${data.equal}</strong><small>itens iguais à meta</small></article>
      </div>`;
    node.classList.remove("is-hidden");
  }

  function scheduleRender() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(render);
  }

  function install() {
    ensureStyles();
    ensureContainer();
    scheduleRender();

    ["monthlyBaseSelect","monthlyCurrentSelect","monthlyTargetSelect","monthlyBranchFilter","monthlyLocalFilter","monthlyUsageFilter","monthlyAreaFilter"].forEach((id) => {
      document.getElementById(id)?.addEventListener("change", () => setTimeout(scheduleRender, 80));
    });
    document.getElementById("monthlyApplyFilters")?.addEventListener("click", () => setTimeout(scheduleRender, 80));
    document.getElementById("monthlyClearFilters")?.addEventListener("click", () => setTimeout(scheduleRender, 80));
    document.getElementById("monthlyCompareButton")?.addEventListener("click", () => setTimeout(scheduleRender, 150));

    const targetBlock = document.getElementById("monthlyTargetBlock");
    if (targetBlock) {
      const observer = new MutationObserver((mutations) => {
        if (mutations.some((m) => m.type === "childList" && (m.addedNodes.length || m.removedNodes.length))) scheduleRender();
      });
      observer.observe(targetBlock, { childList:true, subtree:true });
    }

    [250,700,1400].forEach((delay) => setTimeout(scheduleRender, delay));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once:true });
  else install();
})();
