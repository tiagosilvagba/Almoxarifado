"use strict";

/* Bootstrap 2.0 — preserva a aplicação estável e adiciona o comparativo mensal. */
const ALMOX_STABLE_APP = "https://cdn.jsdelivr.net/gh/tiagosilvagba/Almoxarifado@0eacb92e7f010bd56a1324d8730a407759925eff/script.js";
const ALMOX_STABLE_FALLBACK = "https://raw.githubusercontent.com/tiagosilvagba/Almoxarifado/0eacb92e7f010bd56a1324d8730a407759925eff/script.js";
const MONTHLY_COMPARISON_MODULE = "./comparativo-mensal.js?v=20260914-1";

function loadAlmoxScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

(async function bootAlmoxarifado() {
  try {
    await loadAlmoxScript(ALMOX_STABLE_APP);
  } catch {
    await loadAlmoxScript(ALMOX_STABLE_FALLBACK);
  }

  try {
    await loadAlmoxScript(MONTHLY_COMPARISON_MODULE);
  } catch (error) {
    console.error("Não foi possível carregar o comparativo mensal.", error);
  }
})();
