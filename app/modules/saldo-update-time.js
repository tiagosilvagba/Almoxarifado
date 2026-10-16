"use strict";

(() => {
  if (window.__almoxSaldoUpdateTimeInstalled) return;
  window.__almoxSaldoUpdateTimeInstalled = true;

  const META_URL = "./data/update-times.json";
  const TIMEZONE = "America/Sao_Paulo";
  const REFRESH_INTERVAL_MS = 120000;
  const SOURCES = [
    { key:"saldo", label:"Saldo on-line" },
    { key:"compras", label:"Compras" },
    { key:"consumo", label:"Consumo" }
  ];
  let lastData = null;
  let inFlight = null;
  let lastChecked = 0;
  let lastRendered = "";

  function formatDate(iso, full = false) {
    const date = new Date(iso);
    if (!iso || Number.isNaN(date.getTime())) return "Sem data";
    return new Intl.DateTimeFormat("pt-BR", {
      day:"2-digit", month:"2-digit", ...(full ? { year:"numeric" } : {}),
      hour:"2-digit", minute:"2-digit", hour12:false, timeZone:TIMEZONE
    }).format(date).replace(",", " ·");
  }

  function render() {
    const badge = document.getElementById("baseUpdateBadge");
    if (!badge || !lastData) return;
    const dataSignature = JSON.stringify(SOURCES.map(({key}) => lastData[key]));
    if (lastRendered === dataSignature && badge.childElementCount === SOURCES.length && !badge.classList.contains("is-hidden")) return;
    lastRendered = dataSignature;

    const cells = SOURCES.map(({key,label}) => {
      const source = lastData[key] || {};
      const cell = document.createElement("span");
      cell.className = "base-update-source";
      const name = document.createElement("span");
      name.className = "base-update-source__label";
      name.textContent = label;
      const date = document.createElement("time");
      date.className = "base-update-source__date";
      date.textContent = formatDate(source.updatedAt);
      if (source.updatedAt && !Number.isNaN(new Date(source.updatedAt).getTime())) {
        date.dateTime = source.updatedAt;
      }
      cell.title = `${label} | Arquivo: ${source.file || "não identificado"} | Última alteração: ${formatDate(source.updatedAt, true)} (Brasília)`;
      cell.append(name, date);
      return cell;
    });

    badge.replaceChildren(...cells);
    badge.classList.add("base-update-badge--sources");
    badge.classList.remove("is-hidden");
    badge.title = "Última alteração dos arquivos de origem, horário de Brasília";
    badge.setAttribute("aria-label", SOURCES.map(({key,label}) =>
      `${label}: ${formatDate(lastData[key]?.updatedAt, true)}`).join("; "));
  }

  async function refresh(force = false) {
    if (inFlight) return inFlight;
    if (!force && Date.now() - lastChecked < REFRESH_INTERVAL_MS) {
      render();
      return lastData;
    }
    inFlight = (async () => {
      lastChecked = Date.now();
      try {
        // Consulta apenas um JSON leve, sem chamar a API do GitHub por arquivo.
        const response = await fetch(`${META_URL}?r=${Date.now()}`, { cache:"no-store" });
        if (!response.ok) return lastData;
        const data = await response.json();
        if (data && typeof data === "object" &&
            SOURCES.every(({key}) => data[key] && typeof data[key] === "object")) {
          lastData = data;
          render();
        }
      } catch (error) {
        // Conserva os horários já obtidos em caso de falha temporária de rede.
      }
      return lastData;
    })().finally(() => { inFlight = null; });
    return inFlight;
  }

  refresh(true);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render, {once:true});
  }
  window.addEventListener("focus", () => refresh(), {passive:true});
  window.addEventListener("almoxarifado-csv-updated", () => {
    // A publicação dos metadados acompanha a consolidação das bases.
    refresh(true);
  });
  document.getElementById("refreshButton")?.addEventListener("click", () => refresh(true));
  [400, 1000, 2200, 5000].forEach(delay => setTimeout(render, delay));
  window.almoxSaldoUpdateTime = Object.freeze({
    refresh: () => refresh(true),
    file:"00 - Saldo_Online.csv"
  });
})();
