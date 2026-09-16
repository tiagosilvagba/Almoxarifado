"use strict";

(() => {
  const SCALE = 1000;
  const ANNUAL_REDUCTION = 0.10;
  const MONTHS_IN_YEAR = 12;
  const MONTH_INDEX = Object.freeze({
    jan:1,janeiro:1,fev:2,fevereiro:2,mar:3,marco:3,março:3,abr:4,abril:4,
    mai:5,maio:5,jun:6,junho:6,jul:7,julho:7,ago:8,agosto:8,set:9,setembro:9,
    out:10,outubro:10,nov:11,novembro:11,dez:12,dezembro:12
  });
  const nf2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let scheduled = false;
  let lastSignature = "";

  function schedule(delay = 0) {
    window.setTimeout(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        render();
      });
    }, delay);
  }

  function selectedLabel(id, fallback) {
    const select = document.getElementById(id);
    return select?.selectedOptions?.[0]?.textContent?.trim() || fallback;
  }

  function normalize(value) {
    return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  }

  function parsePt(value) {
    let text = String(value ?? "").trim();
    if (!text || text === "—") return null;
    const negative = /^[−-]/.test(text);
    text = text.replace(/^[+−-]/, "").replace(/\s/g, "").replace(/[^0-9,.-]/g, "");
    if (!text) return null;
    const comma = text.lastIndexOf(","), dot = text.lastIndexOf(".");
    if (comma > dot) text = text.replace(/\./g, "").replace(",", ".");
    else if (dot > comma && comma >= 0) text = text.replace(/,/g, "");
    else if (comma >= 0) text = text.replace(",", ".");
    const n = Number(text);
    return Number.isFinite(n) ? (negative ? -n : n) : null;
  }

  function scaledNumber(value) {
    const n = parsePt(value);
    return n == null ? null : n * SCALE;
  }

  function formatScaled(value, signed = false) {
    if (value == null || !Number.isFinite(value)) return "—";
    const sign = signed ? (value > 0 ? "+" : value < 0 ? "−" : "") : "";
    return `${sign}${nf2.format(Math.abs(value))}`;
  }

  function monthNumberFromSelection(select, label) {
    const valueText = normalize(select?.value || "");
    const labelText = normalize(label || "");
    if (!valueText || valueText === "all" || valueText.includes("todos os meses") || labelText.includes("todos os meses")) return 12;
    const combined = `${valueText} ${labelText}`;
    for (const [name, number] of Object.entries(MONTH_INDEX)) {
      if (combined.split(" ").includes(normalize(name))) return number;
    }
    const fileMatch = String(select?.value || "").match(/Estoque_([A-Za-zÀ-ÿ]{3})_\d{4}/i);
    if (fileMatch) return MONTH_INDEX[normalize(fileMatch[1])] || 12;
    return 12;
  }

  function linearReductionForMonth(select, label) {
    const month = monthNumberFromSelection(select, label);
    return { month, rate: ANNUAL_REDUCTION * (month / MONTHS_IN_YEAR) };
  }

  function readVisualData() {
    const visual = document.getElementById("monthlyComparedMetaVisual");
    if (!visual || visual.classList.contains("is-hidden")) return null;
    const cards = [...visual.querySelectorAll(".month-compared-meta-kpi")];
    const status = [...visual.querySelectorAll(".month-compared-meta-status article")];
    if (cards.length < 4) return null;
    return {
      compared: cards[0]?.querySelector("strong")?.textContent?.trim() || "—",
      meta: cards[1]?.querySelector("strong")?.textContent?.trim() || "—",
      difference: cards[2]?.querySelector("strong")?.textContent?.trim() || "—",
      percent: cards[3]?.querySelector("strong")?.textContent?.trim() || "—",
      above: status[0]?.querySelector("strong")?.textContent?.trim() || "0",
      below: status[1]?.querySelector("strong")?.textContent?.trim() || "0",
      equal: status[2]?.querySelector("strong")?.textContent?.trim() || "0",
    };
  }

  function hideOldVisual() {
    const visual = document.getElementById("monthlyComparedMetaVisual");
    if (!visual) return;
    visual.style.setProperty("display", "none", "important");
    visual.setAttribute("aria-hidden", "true");
  }

  function ensureTenPercentBlock(block) {
    let ten = document.getElementById("monthlyTargetMinusTenBlock");
    if (!ten) {
      ten = document.createElement("section");
      ten.id = "monthlyTargetMinusTenBlock";
      ten.className = "month-target-block is-hidden";
      block.insertAdjacentElement("afterend", ten);
    }
    return ten;
  }

  function render() {
    const block = document.getElementById("monthlyTargetBlock");
    const targetSelect = document.getElementById("monthlyTargetSelect");
    const currentSelect = document.getElementById("monthlyCurrentSelect");
    if (!block || !targetSelect || !currentSelect) return;

    hideOldVisual();
    const tenBlock = ensureTenPercentBlock(block);
    const targetName = targetSelect.value;
    const currentName = currentSelect.value;
    if (!targetName || !currentName) {
      block.classList.add("is-hidden");
      tenBlock.classList.add("is-hidden");
      if (block.innerHTML) block.innerHTML = "";
      tenBlock.innerHTML = "";
      lastSignature = "";
      return;
    }

    const metaLabel = selectedLabel("monthlyTargetSelect", "Mês meta");
    const currentLabel = selectedLabel("monthlyCurrentSelect", "Mês comparado");
    const data = readVisualData();
    if (!data) {
      const loadingSignature = `loading|${targetName}|${currentName}`;
      if (loadingSignature !== lastSignature) {
        lastSignature = loadingSignature;
        block.classList.remove("is-hidden");
        block.innerHTML = `<div class="month-target-block__head"><div><h3>Meta Vs ${currentLabel}</h3><small>${metaLabel} × ${currentLabel}</small></div></div><div class="month-compare-message">Atualizando comparação entre a meta e ${currentLabel}…</div>`;
        tenBlock.classList.add("is-hidden");
        tenBlock.innerHTML = "";
      }
      schedule(150);
      return;
    }

    const metaScaled = scaledNumber(data.meta);
    const comparedScaled = scaledNumber(data.compared);
    const differenceScaled = scaledNumber(data.difference);
    const linear = linearReductionForMonth(currentSelect, currentLabel);
    const targetFactor = 1 - linear.rate;
    const metaLinear = metaScaled == null ? null : metaScaled * targetFactor;
    const deltaToLinear = (comparedScaled == null || metaLinear == null) ? null : comparedScaled - metaLinear;
    const pctToLinear = (metaLinear == null || Math.abs(metaLinear) < 0.000001 || comparedScaled == null)
      ? null
      : ((comparedScaled - metaLinear) / Math.abs(metaLinear)) * 100;

    const metaScaledText = formatScaled(metaScaled);
    const comparedScaledText = formatScaled(comparedScaled);
    const differenceScaledText = formatScaled(differenceScaled, true);
    const linearMetaText = formatScaled(metaLinear);
    const deltaLinearText = formatScaled(deltaToLinear, true);
    const pctLinearText = pctToLinear == null ? "—" : `${pctToLinear > 0 ? "+" : pctToLinear < 0 ? "−" : ""}${nf2.format(Math.abs(pctToLinear))}%`;
    const reductionText = `${nf2.format(linear.rate * 100)}%`;
    const factorText = `${nf2.format(targetFactor * 100)}%`;

    const signature = [targetName,currentName,metaLabel,currentLabel,metaScaledText,comparedScaledText,differenceScaledText,data.percent,data.above,data.below,data.equal,linearMetaText,deltaLinearText,pctLinearText,reductionText].join("|");
    if (signature === lastSignature) return;
    lastSignature = signature;

    block.innerHTML = `
      <div class="month-target-block__head"><div><h3>Meta Vs ${currentLabel}</h3><small>${metaLabel} × ${currentLabel}</small></div></div>
      <div class="month-target-grid">
        <article class="month-target-metric"><span>Saldo meta</span><strong data-scale-mil="1">${metaScaledText}</strong><small>${metaLabel}</small></article>
        <article class="month-target-metric"><span>Saldo comparado</span><strong data-scale-mil="1">${comparedScaledText}</strong><small>${currentLabel}</small></article>
        <article class="month-target-metric"><span>Diferença para a meta</span><strong data-scale-mil="1">${differenceScaledText}</strong><small>${currentLabel} − ${metaLabel}</small></article>
        <article class="month-target-metric"><span>Variação percentual</span><strong>${data.percent}</strong><small>comparado em relação à meta</small></article>
        <article class="month-target-metric"><span>Itens acima / abaixo / iguais</span><strong>${data.above} / ${data.below} / ${data.equal}</strong><small>comparação item a item</small></article>
      </div>`;
    block.classList.remove("is-hidden");
    block.dataset.comparisonMode = "meta-vs-current";

    tenBlock.innerHTML = `
      <div class="month-target-block__head">
        <div><h3>Meta -10% anual Vs ${currentLabel}</h3><small>Rampa linear Jan–Dez · redução acumulada no mês: ${reductionText}</small></div>
      </div>
      <div class="month-target-grid">
        <article class="month-target-metric"><span>Meta ajustada do mês</span><strong data-scale-mil="1">${linearMetaText}</strong><small>${metaLabel} × ${factorText}</small></article>
        <article class="month-target-metric"><span>Saldo comparado</span><strong data-scale-mil="1">${comparedScaledText}</strong><small>${currentLabel}</small></article>
        <article class="month-target-metric"><span>Diferença para meta ajustada</span><strong data-scale-mil="1">${deltaLinearText}</strong><small>${currentLabel} − meta ajustada</small></article>
        <article class="month-target-metric"><span>Variação percentual</span><strong>${pctLinearText}</strong><small>comparado em relação à meta ajustada</small></article>
        <article class="month-target-metric"><span>Redução acumulada prevista</span><strong>${reductionText}</strong><small>10% distribuídos linearmente em 12 meses</small></article>
      </div>`;
    tenBlock.classList.remove("is-hidden");
    tenBlock.dataset.comparisonMode = "meta-linear-reduction-vs-current";
    tenBlock.dataset.reductionMonth = String(linear.month);
    tenBlock.dataset.reductionRate = String(linear.rate);
  }

  function install() {
    const page = document.getElementById("page-comparativo-mensal");
    if (!page) { setTimeout(install, 250); return; }
    ["monthlyCurrentSelect","monthlyTargetSelect","monthlyBranchFilter","monthlyLocalFilter","monthlyUsageFilter","monthlyAreaFilter"].forEach((id) => {
      document.getElementById(id)?.addEventListener("change", () => schedule(120));
    });
    document.getElementById("monthlyApplyFilters")?.addEventListener("click", () => schedule(120));
    document.getElementById("monthlyClearFilters")?.addEventListener("click", () => schedule(120));
    document.getElementById("monthlyCompareButton")?.addEventListener("click", () => schedule(180));
    const visual = document.getElementById("monthlyComparedMetaVisual");
    if (visual) {
      const observer = new MutationObserver((mutations) => {
        if (mutations.some((m) => m.type === "childList" && (m.addedNodes.length || m.removedNodes.length))) schedule(80);
      });
      observer.observe(visual, { childList:true, subtree:true });
    }
    [180,450,900,1600].forEach((delay) => schedule(delay));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once:true });
  else install();
})();
