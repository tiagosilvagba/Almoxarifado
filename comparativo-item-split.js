"use strict";

(() => {
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

  function normalizeTable(table) {
    if (!table) return;
    const headers = table.querySelectorAll("thead th");
    if (headers[0]) headers[0].textContent = "Código do Item";
    if (headers[1]) headers[1].textContent = "Nome do Item";

    table.querySelectorAll("tbody tr").forEach((row) => {
      const cells = row.querySelectorAll("td");
      if (cells.length < 2) return;
      const rawItem = cells[0].textContent.trim();
      const parsed = splitItem(rawItem);
      if (!parsed) return;
      cells[0].textContent = parsed.code;
      if (shouldReplaceName(cells[1].textContent, rawItem, parsed.code)) {
        cells[1].textContent = parsed.name;
      }
      row.dataset.itemSplit = "true";
    });
  }

  function normalizeComparison() {
    normalizeTable(document.querySelector("#page-comparativo-mensal .month-compare-table"));
    document.querySelectorAll("#page-comparativo-mensal .month-target-table").forEach(normalizeTable);
  }

  function install() {
    normalizeComparison();
    const page = document.getElementById("page-comparativo-mensal");
    if (!page) {
      setTimeout(install, 250);
      return;
    }
    const observer = new MutationObserver(() => normalizeComparison());
    observer.observe(page, { childList:true, subtree:true, characterData:true });
    [100,300,700,1400].forEach((delay) => setTimeout(normalizeComparison, delay));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once:true });
  else install();
})();
