"use strict";

(() => {
  let scheduled = false;

  function selectedLabel(id) {
    const select = document.getElementById(id);
    if (!select) return "";
    const option = select.selectedOptions?.[0];
    return String(option?.textContent || "").trim();
  }

  function labelWithPeriod(prefix, period) {
    return period ? `${prefix} · ${period}` : prefix;
  }

  function updateMetricLabels(baseLabel, currentLabel) {
    const metrics = document.getElementById("monthlyCompareMetrics");
    if (!metrics) return;
    metrics.querySelectorAll(".month-compare-metric > span:first-child").forEach((span) => {
      const text = String(span.textContent || "").trim();
      if (/^Saldo base(?:\s*·.*)?$/i.test(text)) span.textContent = labelWithPeriod("Saldo base", baseLabel);
      if (/^Saldo comparado(?:\s*·.*)?$/i.test(text)) span.textContent = labelWithPeriod("Saldo comparado", currentLabel);
    });
  }

  function updateMainTableHeaders(baseLabel, currentLabel) {
    const headers = document.querySelectorAll("#page-comparativo-mensal .month-compare-table thead th");
    if (headers.length < 4) return;
    headers[2].textContent = labelWithPeriod("Saldo base", baseLabel);
    headers[3].textContent = labelWithPeriod("Saldo comparado", currentLabel);
  }

  function updateTargetLabels(baseLabel, currentLabel, targetLabel) {
    const tableHeaders = document.querySelectorAll("#monthlyTargetBlock .month-target-table thead th");
    if (tableHeaders.length >= 5) {
      tableHeaders[2].textContent = labelWithPeriod("Saldo base", baseLabel);
      tableHeaders[3].textContent = labelWithPeriod("Saldo comparado", currentLabel);
      tableHeaders[4].textContent = labelWithPeriod("Saldo meta", targetLabel);
    }

    document.querySelectorAll("#monthlyTargetBlock .month-target-metric > span:first-child").forEach((span) => {
      const text = String(span.textContent || "").trim();
      if (/^Saldo mês meta(?:\s*·.*)?$/i.test(text)) span.textContent = labelWithPeriod("Saldo mês meta", targetLabel);
      if (/^Base x meta(?:\s*·.*)?$/i.test(text)) span.textContent = labelWithPeriod("Base x meta", baseLabel);
      if (/^Comparado x meta(?:\s*·.*)?$/i.test(text)) span.textContent = labelWithPeriod("Comparado x meta", currentLabel);
    });
  }

  function applyPeriodLabels() {
    scheduled = false;
    const baseLabel = selectedLabel("monthlyBaseSelect");
    const currentLabel = selectedLabel("monthlyCurrentSelect");
    const targetLabel = selectedLabel("monthlyTargetSelect");
    updateMetricLabels(baseLabel, currentLabel);
    updateMainTableHeaders(baseLabel, currentLabel);
    updateTargetLabels(baseLabel, currentLabel, targetLabel && targetLabel !== "Sem mês meta" ? targetLabel : "");
  }

  function scheduleUpdate() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => requestAnimationFrame(applyPeriodLabels));
  }

  function install() {
    const page = document.getElementById("page-comparativo-mensal");
    if (!page) {
      setTimeout(install, 250);
      return;
    }

    ["monthlyBaseSelect", "monthlyCurrentSelect", "monthlyTargetSelect", "monthlyApplyFilters", "monthlyCompareButton"].forEach((id) => {
      const node = document.getElementById(id);
      if (!node || node.dataset.periodLabelBound === "true") return;
      node.dataset.periodLabelBound = "true";
      node.addEventListener(id.includes("Select") ? "change" : "click", scheduleUpdate);
    });

    const observer = new MutationObserver(scheduleUpdate);
    observer.observe(page, { childList:true, subtree:true, characterData:true });
    applyPeriodLabels();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once:true });
  else install();
})();
