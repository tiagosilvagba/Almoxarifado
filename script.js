"use strict";

/* Bootstrap incremental — preserva a versão funcional anterior e carrega as novas camadas. */
const PREVIOUS_BOOTSTRAP = "https://cdn.jsdelivr.net/gh/tiagosilvagba/Almoxarifado@bb6ede30b8e351bf50734aa84a3ed28e12b5bb1c/script.js";
const PREVIOUS_BOOTSTRAP_FALLBACK = "https://raw.githubusercontent.com/tiagosilvagba/Almoxarifado/bb6ede30b8e351bf50734aa84a3ed28e12b5bb1c/script.js";
const COMPARATIVO_META_MODULE = "./comparativo-meta.js?v=20260914-1";
const LAYOUT_FIX_MODULE = "./layout-fix.js?v=20260914-2";
const COMPARATIVO_PERIODOS_MODULE = "./comparativo-periodos.js?v=20260914-1";

function loadIncrementalScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

(async function bootIncrementalAlmoxarifado() {
  try {
    await loadIncrementalScript(PREVIOUS_BOOTSTRAP);
  } catch {
    await loadIncrementalScript(PREVIOUS_BOOTSTRAP_FALLBACK);
  }

  try {
    await loadIncrementalScript(COMPARATIVO_META_MODULE);
  } catch (error) {
    console.error("Não foi possível carregar o módulo de mês meta e filtros dinâmicos.", error);
  }

  try {
    await loadIncrementalScript(LAYOUT_FIX_MODULE);
  } catch (error) {
    console.error("Não foi possível carregar a correção estrutural do layout.", error);
  }

  try {
    await loadIncrementalScript(COMPARATIVO_PERIODOS_MODULE);
  } catch (error) {
    console.error("Não foi possível carregar os rótulos de período do comparativo.", error);
  }
})();
