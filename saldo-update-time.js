"use strict";

(() => {
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
      day:"2-digit",
      month:"2-digit",
      year:"2-digit",
      hour:"2-digit",
      minute:"2-digit",
      hour12:false,
      timeZone:"America/Sao_Paulo"
    }).format(date).replace(",", " ·");
  }

  function applyBadge(value) {
    const badge = document.getElementById("baseUpdateBadge");
    if (!badge || !value) return;
    badge.textContent = `Saldo atualizado ${value}`;
    badge.title = `Última atualização do arquivo ${FILE}`;
    badge.classList.remove("is-hidden");
    badge.dataset.updateSource = FILE;
  }

  async function fetchSaldoUpdate() {
    try {
      const response = await fetch(API, {
        cache:"no-store",
        headers:{ Accept:"application/vnd.github+json" }
      });
      if (!response.ok) return "";
      const commits = await response.json();
      const first = Array.isArray(commits) ? commits[0] : null;
      const iso = first?.commit?.committer?.date || first?.commit?.author?.date || "";
      return formatDate(iso);
    } catch {
      return "";
    }
  }

  async function refresh() {
    if (loading) return loading;
    loading = (async () => {
      const value = await fetchSaldoUpdate();
      if (value) lastValue = value;
      applyBadge(lastValue);
      return lastValue;
    })().finally(() => { loading = null; });
    return loading;
  }

  function preserveOfficialBadge() {
    if (lastValue) applyBadge(lastValue);
  }

  refresh();
  document.addEventListener("DOMContentLoaded", refresh, { once:true });
  window.addEventListener("focus", refresh, { passive:true });
  window.addEventListener("almoxarifado-csv-updated", (event) => {
    const url = String(event?.detail?.url || "");
    if (url.includes("00%20-%20Saldo_Online.csv") || url.includes(FILE)) refresh();
  });

  /* A aplicação antiga também escreve nesse badge. Reaplica sempre a fonte oficial. */
  const observer = new MutationObserver(preserveOfficialBadge);
  const startObserver = () => {
    const badge = document.getElementById("baseUpdateBadge");
    if (badge) observer.observe(badge, { childList:true, characterData:true, subtree:true, attributes:true, attributeFilter:["class"] });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startObserver, { once:true });
  else startObserver();

  window.almoxSaldoUpdateTime = Object.freeze({ refresh, file:FILE });
})();
