"use strict";

(() => {
  let lastSignature = "";
  const nf = new Intl.NumberFormat("pt-BR", { minimumFractionDigits:2, maximumFractionDigits:2 });
  const EPS = 0.000001;

  function parseNumber(value) {
    let text = String(value ?? "").trim();
    if (!text || text === "—") return 0;
    const negative = /^[−-]/.test(text);
    text = text.replace(/^[+−-]/, "").replace(/\s/g, "").replace(/[^0-9,.]/g, "");
    if (!text) return 0;
    const comma = text.lastIndexOf(",");
    const dot = text.lastIndexOf(".");
    if (comma > dot) text = text.replace(/\./g, "").replace(",", ".");
    else if (dot > comma && comma >= 0) text = text.replace(/,/g, "");
    else if (comma >= 0) text = text.replace(",", ".");
    const number = Number(text);
    return Number.isFinite(number) ? (negative ? -number : number) : 0;
  }

  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const signed = (v) => `${v > EPS ? "+" : v < -EPS ? "−" : ""}${nf.format(Math.abs(v))}`;
  const normalizeHeader = (v) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();

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

  function findColumn(headers, candidates, fallback) {
    const normalized = headers.map(normalizeHeader);
    for (const candidate of candidates.map(normalizeHeader)) {
      const exact = normalized.indexOf(candidate);
      if (exact >= 0) return exact;
      const contains = normalized.findIndex(h => h.includes(candidate));
      if (contains >= 0) return contains;
    }
    return fallback;
  }

  function rowsFromDetailedTable() {
    const table = document.querySelector("#page-comparativo-mensal .month-compare-table");
    const tbody = document.getElementById("monthlyCompareTbody");
    if (!table || !tbody) return [];

    const headers = [...table.querySelectorAll("thead th")].map(th => th.textContent.trim());
    const codeIndex = findColumn(headers, ["Código do Item","Código","Item"], 0);
    const nameIndex = findColumn(headers, ["Nome do Item","Nome Item","Descrição"], 1);
    const baseIndex = findColumn(headers, ["Saldo base","Saldo mês base","Saldo anterior"], 2);
    const currentIndex = findColumn(headers, ["Saldo comparado","Saldo mês comparado","Saldo atual"], 3);

    const byCode = new Map();
    for (const tr of tbody.querySelectorAll("tr")) {
      const td = [...tr.querySelectorAll("td")];
      if (td.length <= Math.max(codeIndex,nameIndex,baseIndex,currentIndex)) continue;
      const code = td[codeIndex]?.textContent.trim() || "";
      if (!code) continue;
      const name = td[nameIndex]?.textContent.trim() || "Item sem nome";
      const base = parseNumber(td[baseIndex]?.textContent);
      const current = parseNumber(td[currentIndex]?.textContent);
      const existing = byCode.get(code) || { code, name, base:0, current:0 };
      existing.base += base;
      existing.current += current;
      if ((!existing.name || /sem nome/i.test(existing.name)) && name) existing.name = name;
      byCode.set(code, existing);
    }

    return [...byCode.values()].map(item => {
      const delta = item.current - item.base;
      return {
        code:item.code,
        name:item.name,
        base:item.base,
        current:item.current,
        delta,
        status:delta > EPS ? "increase" : delta < -EPS ? "decrease" : "stable"
      };
    });
  }

  function card(kind, title, items) {
    const isUp = kind === "up";
    const total = items.reduce((sum,item) => sum + Math.abs(item.delta),0);
    const list = items.length ? items.map((item,index) => `
      <li title="Base: ${nf.format(item.base)} · Comparado: ${nf.format(item.current)}">
        <span><strong>${index + 1}. ${esc(item.code)}</strong> · ${esc(item.name || "Item sem nome")}</span>
        <strong class="${isUp ? "month-delta--up" : "month-delta--down"}">${signed(item.delta)}</strong>
      </li>`).join("") : "<li><span>Nenhum item nesta condição.</span></li>";
    return `<article class="month-consideration month-consideration--${isUp ? "up" : "down"}"><h3>${title}</h3><p>Top 10 calculado por Saldo comparado − Saldo base.</p><div class="month-consideration__total"><span>${isUp ? "Aumento" : "Redução"} acumulado do Top 10</span><strong>${isUp ? "+" : "−"}${nf.format(total)}</strong></div><ul>${list}</ul></article>`;
  }

  function render() {
    ensureStyles();
    const container = document.getElementById("monthlyConsiderations");
    if (!container) return;
    const rows = rowsFromDetailedTable();
    if (!rows.length) return;

    const up = rows.filter(r => r.delta > EPS).sort((a,b) => b.delta - a.delta).slice(0,10);
    const down = rows.filter(r => r.delta < -EPS).sort((a,b) => a.delta - b.delta).slice(0,10);
    const signature = JSON.stringify([
      up.map(x=>[x.code,x.base,x.current,x.delta]),
      down.map(x=>[x.code,x.base,x.current,x.delta])
    ]);
    if (signature === lastSignature) return;
    lastSignature = signature;
    container.innerHTML = card("up","10 maiores aumentos",up) + card("down","10 maiores reduções",down);
  }

  function schedule(delay=80) { window.setTimeout(render,delay); }

  function install() {
    ensureStyles();
    schedule(250);
    ["monthlyCompareButton","monthlyApplyFilters","monthlyClearFilters"].forEach(id => document.getElementById(id)?.addEventListener("click",()=>schedule(220)));
    ["monthlyBaseSelect","monthlyCurrentSelect","monthlyTargetSelect","monthlyBranchFilter","monthlyLocalFilter","monthlyUsageFilter","monthlyAreaFilter"].forEach(id => document.getElementById(id)?.addEventListener("change",()=>schedule(220)));
    const tbody = document.getElementById("monthlyCompareTbody");
    if (tbody) new MutationObserver(()=>schedule(40)).observe(tbody,{childList:true,subtree:true});
    [500,1000,1800].forEach(schedule);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",install,{once:true});
  else install();
})();
