"use strict";

/*
 * Bootstrap de dados — 2026-09-11
 * Preserva a aplicação consolidada na versão abaixo e adiciona uma camada
 * de cache inteligente para os CSVs. O Service Worker entrega a última cópia
 * válida imediatamente e revalida em segundo plano. Quando algum CSV muda,
 * apenas o arquivo alterado é renovado no cache e o catálogo é recalculado.
 */

const ALMOX_APP_SOURCE = "https://cdn.jsdelivr.net/gh/tiagosilvagba/Almoxarifado@10730819db42aad163c4b3c335e60058b95e67ab/script.js";
const ALMOX_APP_FALLBACK = "https://raw.githubusercontent.com/tiagosilvagba/Almoxarifado/10730819db42aad163c4b3c335e60058b95e67ab/script.js";
let csvRefreshTimer = null;
let applicationInitialized = false;

function loadApplicationScript(source) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = source;
    script.async = false;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function ensureCsvCacheWorker() {
  if (!("serviceWorker" in navigator)) return;

  try {
    await navigator.serviceWorker.register("./sw-data-cache.js", { scope: "./" });
    await navigator.serviceWorker.ready;

    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => {
        const timer = window.setTimeout(resolve, 1800);
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          window.clearTimeout(timer);
          resolve();
        }, { once: true });
      });
    }
  } catch (error) {
    console.warn("Cache inteligente de CSV indisponível; usando carregamento normal.", error);
  }
}

function bindCsvUpdateListener() {
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type !== "almoxarifado-csv-updated") return;

    window.clearTimeout(csvRefreshTimer);
    csvRefreshTimer = window.setTimeout(() => {
      if (typeof window.loadCatalog === "function") {
        window.loadCatalog();
      } else {
        window.location.reload();
      }
    }, 350);
  });
}

async function initializeLoadedApplication() {
  if (applicationInitialized) return;
  applicationInitialized = true;

  /*
   * A aplicação consolidada registra init() no DOMContentLoaded. Como ela é
   * carregada dinamicamente após o Service Worker ficar pronto, esse evento
   * pode já ter ocorrido (principalmente no Safari/iPhone). Nesse caso,
   * iniciamos a aplicação explicitamente para evitar o painel preso em 0%.
   */
  if (document.readyState !== "loading" && typeof window.init === "function") {
    await window.init();
  }
}

(async function startAlmoxarifado() {
  bindCsvUpdateListener();
  await ensureCsvCacheWorker();

  try {
    await loadApplicationScript(ALMOX_APP_SOURCE);
  } catch {
    await loadApplicationScript(ALMOX_APP_FALLBACK);
  }

  await initializeLoadedApplication();
})();
