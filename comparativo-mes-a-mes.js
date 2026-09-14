"use strict";

(() => {
  let scheduled = false;

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

  function render() {
    const block = document.getElementById("monthlyTargetBlock");
    const targetSelect = document.getElementById("monthlyTargetSelect");
    const currentSelect = document.getElementById("monthlyCurrentSelect");
    if (!block || !targetSelect || !currentSelect) return;

    hideOldVisual();

    const targetName = targetSelect.value;
    const currentName = currentSelect.value;
    if (!targetName || !currentName) {
      block.classList.add("is-hidden");
      block.innerHTML = "";
      return;
    }

    const metaLabel = selectedLabel("monthlyTargetSelect", "Mês meta");
    const currentLabel = selectedLabel("monthlyCurrentSelect", "Mês comparado");
    const data = readVisualData();

    if (!data) {
      block.classList.remove("is-hidden");
      block.innerHTML = `
        <div class="month-target-block__head">
          <div>
            <h3>Meta Vs ${currentLabel}</h3>
            <small>${metaLabel} × ${currentLabel}</small>
          </div>
        </div>
        <div class="month-compare-message">Atualizando comparação entre a meta e ${currentLabel}…</div>`;
      schedule(120);
      return;
    }

    block.innerHTML = `
      <div class="month-target-block__head">
        <div>
          <h3>Meta Vs ${currentLabel}</h3>
          <small>${metaLabel} × ${currentLabel}</small>
        </div>
      </div>
      <div class="month-target-grid">
        <article class="month-target-metric"><span>Saldo meta</span><strong>${data.meta}</strong><small>${metaLabel}</small></article>
        <article class="month-target-metric"><span>Saldo comparado</span><strong>${data.compared}</strong><small>${currentLabel}</small></article>
        <article class="month-target-metric"><span>Diferença para a meta</span><strong>${data.difference}</strong><small>${currentLabel} − ${metaLabel}</small></article>
        <article class="month-target-metric"><span>Variação percentual</span><strong>${data.percent}</strong><small>comparado em relação à meta</small></article>
        <article class="month-target-metric"><span>Itens acima / abaixo / iguais</span><strong>${data.above} / ${data.below} / ${data.equal}</strong><small>comparação item a item</small></article>
      </div>`;
    block.classList.remove("is-hidden");
    block.dataset.comparisonMode = "meta-vs-current";
  }

  function install() {
    const page = document.getElementById("page-comparativo-mensal");
    if (!page) {
      setTimeout(install, 250);
      return;
    }

    ["monthlyCurrentSelect","monthlyTargetSelect","monthlyBranchFilter","monthlyLocalFilter","monthlyUsageFilter","monthlyAreaFilter"].forEach((id) => {
      document.getElementById(id)?.addEventListener("change", () => schedule(120));
    });
    document.getElementById("monthlyApplyFilters")?.addEventListener("click", () => schedule(120));
    document.getElementById("monthlyClearFilters")?.addEventListener("click", () => schedule(120));
    document.getElementById("monthlyCompareButton")?.addEventListener("click", () => schedule(180));

    const pageObserver = new MutationObserver((mutations) => {
      if (mutations.some((m) => m.type === "childList" && (m.addedNodes.length || m.removedNodes.length))) schedule(80);
    });
    pageObserver.observe(page, { childList:true, subtree:true });

    [180,450,900,1600].forEach((delay) => schedule(delay));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once:true });
  else install();
})();
