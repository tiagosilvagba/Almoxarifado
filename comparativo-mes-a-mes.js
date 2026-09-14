"use strict";

(() => {
  let scheduled = false;

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      render();
    });
  }

  function selectedLabel(id, fallback) {
    const select = document.getElementById(id);
    return select?.selectedOptions?.[0]?.textContent?.trim() || fallback;
  }

  function readMetric(index) {
    const cards = document.querySelectorAll("#monthlyCompareMetrics .month-compare-metric");
    const card = cards[index];
    if (!card) return { value:"—", detail:"" };
    return {
      value: card.querySelector("strong")?.textContent?.trim() || "—",
      detail: card.querySelector("small")?.textContent?.trim() || "",
    };
  }

  function render() {
    const block = document.getElementById("monthlyTargetBlock");
    const metrics = document.getElementById("monthlyCompareMetrics");
    if (!block || !metrics) return;

    const baseLabel = selectedLabel("monthlyBaseSelect", "Mês base");
    const currentLabel = selectedLabel("monthlyCurrentSelect", "Mês comparado");
    if (!baseLabel || !currentLabel) return;

    const base = readMetric(0);
    const current = readMetric(1);
    const variation = readMetric(2);
    const consumption = readMetric(3);
    const changed = readMetric(4);

    block.innerHTML = `
      <div class="month-target-block__head">
        <div>
          <h3>Comparação mês a mês</h3>
          <small>${baseLabel} × ${currentLabel}</small>
        </div>
      </div>
      <div class="month-target-grid">
        <article class="month-target-metric"><span>Saldo mês base</span><strong>${base.value}</strong><small>${baseLabel}</small></article>
        <article class="month-target-metric"><span>Saldo mês comparado</span><strong>${current.value}</strong><small>${currentLabel}</small></article>
        <article class="month-target-metric"><span>Variação mês a mês</span><strong>${variation.value}</strong><small>${baseLabel} → ${currentLabel}</small></article>
        <article class="month-target-metric"><span>Consumo mês comparado</span><strong>${consumption.value}</strong><small>${consumption.detail || currentLabel}</small></article>
        <article class="month-target-metric"><span>Itens alterados</span><strong>${changed.value}</strong><small>${changed.detail || `${baseLabel} × ${currentLabel}`}</small></article>
      </div>`;
    block.classList.remove("is-hidden");
    block.dataset.comparisonMode = "month-to-month";
  }

  function install() {
    const page = document.getElementById("page-comparativo-mensal");
    if (!page) {
      setTimeout(install, 250);
      return;
    }

    ["monthlyBaseSelect","monthlyCurrentSelect","monthlyBranchFilter","monthlyLocalFilter","monthlyUsageFilter","monthlyAreaFilter"].forEach((id) => {
      document.getElementById(id)?.addEventListener("change", () => setTimeout(schedule, 80));
    });
    document.getElementById("monthlyApplyFilters")?.addEventListener("click", () => setTimeout(schedule, 80));
    document.getElementById("monthlyClearFilters")?.addEventListener("click", () => setTimeout(schedule, 80));
    document.getElementById("monthlyCompareButton")?.addEventListener("click", () => setTimeout(schedule, 120));

    const metrics = document.getElementById("monthlyCompareMetrics");
    if (metrics) {
      const observer = new MutationObserver((mutations) => {
        if (mutations.some((m) => m.type === "childList" && (m.addedNodes.length || m.removedNodes.length))) schedule();
      });
      observer.observe(metrics, { childList:true, subtree:true });
    }

    [120,350,800,1500].forEach((delay) => setTimeout(schedule, delay));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once:true });
  else install();
})();
