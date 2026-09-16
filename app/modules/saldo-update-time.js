"use strict";

(() => {
  if (window.__almoxSaldoUpdateTimeInstalled) return;
  window.__almoxSaldoUpdateTimeInstalled = true;

  const OWNER = "tiagosilvagba";
  const REPO = "Almoxarifado";
  const BRANCH = "main";
  const FILE = "00 - Saldo_Online.csv";
  const API = `https://api.github.com/repos/${OWNER}/${REPO}/commits?sha=${encodeURIComponent(BRANCH)}&path=${encodeURIComponent(FILE)}&per_page=1`;
  let lastValue = "";
  let loading = null;

  function formatDate(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("pt-BR", {
      day:"2-digit", month:"2-digit", year:"2-digit", hour:"2-digit", minute:"2-digit",
      hour12:false, timeZone:"America/Sao_Paulo"
    }).format(date).replace(",", " ·");
  }

  function applyBadge(value) {
    const badge = document.getElementById("baseUpdateBadge");
    if (!badge || !value) return false;
    const text = `Saldo atualizado ${value}`;
    const title = `Última atualização do arquivo ${FILE}`;
    let changed = false;
    if (badge.textContent !== text) { badge.textContent = text; changed = true; }
    if (badge.title !== title) { badge.title = title; changed = true; }
    if (badge.classList.contains("is-hidden")) { badge.classList.remove("is-hidden"); changed = true; }
    if (badge.dataset.updateSource !== FILE) { badge.dataset.updateSource = FILE; changed = true; }
    return changed;
  }

  async function fetchSaldoUpdate() {
    try {
      const response = await fetch(API, { cache:"no-store", headers:{Accept:"application/vnd.github+json"} });
      if (!response.ok) return "";
      const commits = await response.json();
      const first = Array.isArray(commits) ? commits[0] : null;
      return formatDate(first?.commit?.committer?.date || first?.commit?.author?.date || "");
    } catch { return ""; }
  }

  async function refresh() {
    if (loading) return loading;
    loading = (async () => {
      const value = await fetchSaldoUpdate();
      if (value) lastValue = value;
      if (lastValue) applyBadge(lastValue);
      return lastValue;
    })().finally(() => { loading = null; });
    return loading;
  }

  function preserve() { if (lastValue) applyBadge(lastValue); }

  refresh();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", refresh, {once:true});
  window.addEventListener("focus", refresh, {passive:true});
  window.addEventListener("almoxarifado-csv-updated", (event) => {
    const url = String(event?.detail?.url || "");
    if (url.includes("00%20-%20Saldo_Online.csv") || url.includes(FILE)) refresh();
  });

  /* Sem MutationObserver no próprio badge: evita ciclos de escrita infinita. */
  [400, 1000, 2200, 5000].forEach((delay) => setTimeout(preserve, delay));

  window.almoxSaldoUpdateTime = Object.freeze({ refresh, file:FILE });
})();
