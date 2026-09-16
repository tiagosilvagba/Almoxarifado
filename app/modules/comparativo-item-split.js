"use strict";

(() => {
  let scheduled = false;

  function splitItem(value) {
    const text = String(value ?? "").trim();
    if (!text) return null;
    const match = text.match(/^(.{1,40}?)\s+-\s+(.+)$/);
    if (!match) return null;
    const code = match[1].trim();
    const name = match[2].trim();
    if (!code || !name || !/[0-9]/.test(code)) return null;
    return { code, name };
  }

  function shouldReplaceName(value, rawItem, code) {
    const current = String(value ?? "").trim();
    if (!current) return true;
    const normalized = current.toLowerCase();
    return normalized === "item sem nome"
      || normalized === "item sem descrição"
      || current === rawItem
      || current === code;
  }

  function setTextIfChanged(node, value) {
    if (!node) return false;
    const next = String(value ?? "");
    if (node.textContent === next) return false;
    node.textContent = next;
    return true;
  }

  function normalizeTable(table) {
    if (!table) return;
    const headers = table.querySelectorAll("thead th");
    setTextIfChanged(headers[0], "Código do Item");
    setTextIfChanged(headers[1], "Nome do Item");

    table.querySelectorAll("tbody tr:not([data-item-split-checked='true'])").forEach((row) => {
      row.dataset.itemSplitChecked = "true";
      const cells = row.querySelectorAll("td");
      if (cells.length < 2) return;
      const rawItem = cells[0].textContent.trim();
      const parsed = splitItem(rawItem);
      if (!parsed) return;
      setTextIfChanged(cells[0], parsed.code);
      if (shouldReplaceName(cells[1].textContent, rawItem, parsed.code)) {
        setTextIfChanged(cells[1], parsed.name);
      }
      row.dataset.itemSplit = "true";
    });
  }

  function normalizeComparison() {
    normalizeTable(document.querySelector("#page-comparativo-mensal .month-compare-table"));
    document.querySelectorAll("#page-comparativo-mensal .month-target-table").forEach(normalizeTable);
  }

  function scheduleNormalize() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      normalizeComparison();
    });
  }

  function install() {
    const page = document.getElementById("page-comparativo-mensal");
    if (!page) {
      setTimeout(install, 250);
      return;
    }

    normalizeComparison();
    const observer = new MutationObserver((mutations) => {
      if (!mutations.some((mutation) => mutation.type === "childList" && mutation.addedNodes.length)) return;
      scheduleNormalize();
    });
    observer.observe(page, { childList:true, subtree:true });
    [100,300,700,1400].forEach((delay) => setTimeout(scheduleNormalize, delay));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once:true });
  else install();
})();
