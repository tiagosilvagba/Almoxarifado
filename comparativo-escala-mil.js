"use strict";

(() => {
  const SCALE = 1000;
  const nf = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
  let scheduled = false;

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

  function scaleNode(node) {
    if (!node || node.dataset.scaleMil === "1") return;
    const raw = node.textContent.trim();
    const value = parsePt(raw);
    if (value == null) return;
    const sign = raw.startsWith("+") ? "+" : raw.startsWith("−") || raw.startsWith("-") ? "−" : "";
    node.textContent = `${sign}${nf.format(Math.abs(value * SCALE))}`;
    node.dataset.scaleMil = "1";
  }

  function apply() {
    scheduled = false;
    const page = document.getElementById("page-comparativo-mensal");
    if (!page) return;

    const metrics = [...page.querySelectorAll("#monthlyCompareMetrics .month-compare-metric")];
    [0,1,2,3].forEach(i => scaleNode(metrics[i]?.querySelector("strong")));

    const metaCards = [...page.querySelectorAll("#monthlyTargetBlock .month-target-metric")];
    [0,1,2].forEach(i => scaleNode(metaCards[i]?.querySelector("strong")));

    page.querySelectorAll(".month-consideration__total > strong").forEach(scaleNode);
    page.querySelectorAll(".month-consideration li > strong:last-child").forEach(scaleNode);
    page.querySelectorAll(".month-stock-inclusions__total strong, .month-stock-inclusions li > strong:last-child").forEach(scaleNode);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(apply);
  }

  function install() {
    const page = document.getElementById("page-comparativo-mensal");
    if (!page) { setTimeout(install, 250); return; }
    const observer = new MutationObserver((mutations) => {
      if (mutations.some(m => m.type === "childList" && (m.addedNodes.length || m.removedNodes.length))) schedule();
    });
    observer.observe(page, { childList:true, subtree:true });
    [100,300,700,1400].forEach(delay => setTimeout(schedule, delay));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once:true });
  else install();
})();
