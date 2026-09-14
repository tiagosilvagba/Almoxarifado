"use strict";

(() => {
  let lastSignature = "";
  const nf = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

  const parseNumber = (value) => {
    let text = String(value ?? "").trim().replace(/\s/g, "").replace(/[^0-9,.-]/g, "");
    if (!text) return 0;
    const comma = text.lastIndexOf(","), dot = text.lastIndexOf(".");
    if (comma > dot) text = text.replace(/\./g, "").replace(",", ".");
    else if (dot > comma && comma >= 0) text = text.replace(/,/g, "");
    else if (comma >= 0) text = text.replace(",", ".");
    const n = Number(text); return Number.isFinite(n) ? n : 0;
  };
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const signed = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${nf.format(Math.abs(v))}`;

  function ensureStyles() {
    if (document.getElementById("monthlySummaryCardsOnlyStyles")) return;
    const style = document.createElement("style");
    style.id = "monthlySummaryCardsOnlyStyles";
    style.textContent = `
      #page-comparativo-mensal #monthlyCompareDetails{display:none!important}
      #page-comparativo-mensal .month-target-table-wrap{display:none!important}
      #page-comparativo-mensal .month-considerations{grid-template-columns:repeat(2,minmax(0,1fr))!important;align-items:stretch}
      #page-comparativo-mensal .month-consideration ul{max-height:none!important}
      #page-comparativo-mensal .month-consideration li{min-height:46px}
      #page-comparativo-mensal .month-stock-inclusions{margin-top:16px}
      #page-comparativo-mensal .month-stock-inclusions__list{grid-template-columns:repeat(2,minmax(0,1fr))}
      @media(max-width:900px){#page-comparativo-mensal .month-considerations,#page-comparativo-mensal .month-stock-inclusions__list{grid-template-columns:1fr!important}}
    `;
    document.head.appendChild(style);
  }

  function rowsFromDetailedTable() {
    return [...document.querySelectorAll("#monthlyCompareTbody tr")].map((tr) => {
      const td = tr.querySelectorAll("td");
      if (td.length < 9) return null;
      const deltaText = td[4].textContent.trim();
      const delta = parseNumber(deltaText) * (/^[−-]/.test(deltaText) ? -1 : 1);
      const statusText = td[8].textContent.toLowerCase();
      return {
        code: td[0].textContent.trim(),
        name: td[1].textContent.trim(),
        delta,
        status: statusText.includes("aument") ? "increase" : statusText.includes("redu") ? "decrease" : "stable"
      };
    }).filter(Boolean);
  }

  function card(kind, title, items) {
    const isUp = kind === "up";
    const total = items.reduce((sum, item) => sum + Math.abs(item.delta), 0);
    const list = items.length ? items.slice(0, 10).map((item, index) => `
      <li><span><strong>${index + 1}. ${esc(item.code)}</strong> · ${esc(item.name || "Item sem nome")}</span><strong class="${isUp ? "month-delta--up" : "month-delta--down"}">${signed(item.delta)}</strong></li>`).join("") : "<li><span>Nenhum item nesta condição.</span></li>";
    return `<article class="month-consideration month-consideration--${isUp ? "up" : "down"}"><h3>${title}</h3><p>Top 10 por variação de Saldo Real.</p><div class="month-consideration__total"><span>${isUp ? "Aumento" : "Redução"} acumulado do Top 10</span><strong>${isUp ? "+" : "−"}${nf.format(total)}</strong></div><ul>${list}</ul></article>`;
  }

  function render() {
    ensureStyles();
    const container = document.getElementById("monthlyConsiderations");
    if (!container) return;
    const rows = rowsFromDetailedTable();
    if (!rows.length) return;
    const up = rows.filter(r => r.status === "increase").sort((a,b) => b.delta - a.delta).slice(0,10);
    const down = rows.filter(r => r.status === "decrease").sort((a,b) => a.delta - b.delta).slice(0,10);
    const signature = JSON.stringify([up.map(x=>[x.code,x.delta]),down.map(x=>[x.code,x.delta])]);
    if (signature === lastSignature) return;
    lastSignature = signature;
    container.innerHTML = card("up", "10 maiores aumentos", up) + card("down", "10 maiores reduções", down);
  }

  function schedule(delay = 80) { window.setTimeout(render, delay); }

  function install() {
    ensureStyles();
    schedule(200);
    ["monthlyCompareButton","monthlyApplyFilters","monthlyClearFilters"].forEach(id => document.getElementById(id)?.addEventListener("click", () => schedule(180)));
    ["monthlyBaseSelect","monthlyCurrentSelect","monthlyTargetSelect","monthlyBranchFilter","monthlyLocalFilter","monthlyUsageFilter","monthlyAreaFilter"].forEach(id => document.getElementById(id)?.addEventListener("change", () => schedule(180)));
    [500,1000,1800].forEach(schedule);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, {once:true}); else install();
})();
