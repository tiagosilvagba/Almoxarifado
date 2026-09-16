"use strict";

(() => {
  if (window.__almoxComparativoPeriodosInstalled) return;
  window.__almoxComparativoPeriodosInstalled = true;
  let scheduled = false;

  function selectedLabel(id) {
    const select = document.getElementById(id);
    if (!select) return "";
    return String(select.selectedOptions?.[0]?.textContent || "").trim();
  }

  function labelWithPeriod(prefix, period) {
    return period ? `${prefix} · ${period}` : prefix;
  }

  function setTextIfChanged(node, value) {
    if (!node) return false;
    const next = String(value ?? "");
    if (node.textContent === next) return false;
    node.textContent = next;
    return true;
  }

  function updateMetricLabels(baseLabel, currentLabel) {
    const metrics = document.getElementById("monthlyCompareMetrics");
    if (!metrics) return;
    metrics.querySelectorAll(".month-compare-metric > span:first-child").forEach((span) => {
      const text = String(span.textContent || "").trim();
      if (/^Saldo base(?:\s*·.*)?$/i.test(text)) setTextIfChanged(span, labelWithPeriod("Saldo base", baseLabel));
      else if (/^Saldo comparado(?:\s*·.*)?$/i.test(text)) setTextIfChanged(span, labelWithPeriod("Saldo comparado", currentLabel));
    });
  }

  function updateMainTableHeaders(baseLabel, currentLabel) {
    const headers = document.querySelectorAll("#page-comparativo-mensal .month-compare-table thead th");
    if (headers.length < 4) return;
    setTextIfChanged(headers[2], labelWithPeriod("Saldo base", baseLabel));
    setTextIfChanged(headers[3], labelWithPeriod("Saldo comparado", currentLabel));
  }

  function updateTargetLabels(baseLabel, currentLabel, targetLabel) {
    const tableHeaders = document.querySelectorAll("#monthlyTargetBlock .month-target-table thead th");
    if (tableHeaders.length >= 5) {
      setTextIfChanged(tableHeaders[2], labelWithPeriod("Saldo base", baseLabel));
      setTextIfChanged(tableHeaders[3], labelWithPeriod("Saldo comparado", currentLabel));
      setTextIfChanged(tableHeaders[4], labelWithPeriod("Saldo meta", targetLabel));
    }

    document.querySelectorAll("#monthlyTargetBlock .month-target-metric > span:first-child").forEach((span) => {
      const text = String(span.textContent || "").trim();
      if (/^Saldo mês meta(?:\s*·.*)?$/i.test(text)) setTextIfChanged(span, labelWithPeriod("Saldo mês meta", targetLabel));
      else if (/^Base x meta(?:\s*·.*)?$/i.test(text)) setTextIfChanged(span, labelWithPeriod("Base x meta", baseLabel));
      else if (/^Comparado x meta(?:\s*·.*)?$/i.test(text)) setTextIfChanged(span, labelWithPeriod("Comparado x meta", currentLabel));
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
    requestAnimationFrame(applyPeriodLabels);
  }

  function install() {
    const page = document.getElementById("page-comparativo-mensal");
    if (!page) { setTimeout(install, 250); return; }

    ["monthlyBaseSelect","monthlyCurrentSelect","monthlyTargetSelect","monthlyApplyFilters","monthlyCompareButton"].forEach((id) => {
      const node = document.getElementById(id);
      if (!node || node.dataset.periodLabelBound === "true") return;
      node.dataset.periodLabelBound = "true";
      node.addEventListener(id.includes("Select") ? "change" : "click", scheduleUpdate);
    });

    const observer = new MutationObserver((mutations) => {
      if (!mutations.some((m) => m.type === "childList" && m.addedNodes.length)) return;
      scheduleUpdate();
    });
    observer.observe(page, { childList:true, subtree:true });
    applyPeriodLabels();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, {once:true});
  else install();
})();
