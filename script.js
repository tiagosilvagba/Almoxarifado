"use strict";

/* Bootstrap incremental — preserva a versão funcional anterior e carrega as novas camadas. */
const PREVIOUS_BOOTSTRAP = "https://cdn.jsdelivr.net/gh/tiagosilvagba/Almoxarifado@bb6ede30b8e351bf50734aa84a3ed28e12b5bb1c/script.js";
const PREVIOUS_BOOTSTRAP_FALLBACK = "https://raw.githubusercontent.com/tiagosilvagba/Almoxarifado/bb6ede30b8e351bf50734aa84a3ed28e12b5bb1c/script.js";
const COMPARATIVO_META_MODULE = "./comparativo-meta.js?v=20260914-1";
const LAYOUT_FIX_MODULE = "./layout-fix.js?v=20260914-2";
const COMPARATIVO_PERIODOS_MODULE = "./comparativo-periodos.js?v=20260914-1";
const COMPARATIVO_EXCEL_MODULE = "./comparativo-excel-padrao.js?v=20260914-1";
const COMPARATIVO_ITEM_SPLIT_MODULE = "./comparativo-item-split.js?v=20260914-2";
const COMPARATIVO_META_VISUAL_MODULE = "./comparativo-meta-visual.js?v=20260914-1";
const COMPARATIVO_INCLUSOES_MODULE = "./comparativo-inclusoes.js?v=20260914-1";
const CURRENT_PUBLIC_VERSION = "Versão 2.3";

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

function enforceCurrentPublicVersion() {
  const badge = document.getElementById("versionBadge");
  if (badge) badge.textContent = CURRENT_PUBLIC_VERSION;
  document.documentElement.dataset.appVersion = CURRENT_PUBLIC_VERSION.replace(/^Versão\s*/i, "");
}

(async function bootIncrementalAlmoxarifado() {
  try {
    await loadIncrementalScript(PREVIOUS_BOOTSTRAP);
  } catch {
    await loadIncrementalScript(PREVIOUS_BOOTSTRAP_FALLBACK);
  }

  enforceCurrentPublicVersion();

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

  try {
    await loadIncrementalScript(COMPARATIVO_EXCEL_MODULE);
  } catch (error) {
    console.error("Não foi possível carregar a exportação Excel padronizada do comparativo.", error);
  }

  try {
    await loadIncrementalScript(COMPARATIVO_ITEM_SPLIT_MODULE);
  } catch (error) {
    console.error("Não foi possível separar código e nome do item no comparativo.", error);
  }

  try {
    await loadIncrementalScript(COMPARATIVO_META_VISUAL_MODULE);
  } catch (error) {
    console.error("Não foi possível carregar a visualização comparado x mês meta.", error);
  }

  try {
    await loadIncrementalScript(COMPARATIVO_INCLUSOES_MODULE);
  } catch (error) {
    console.error("Não foi possível carregar as inclusões de estoque do comparativo.", error);
  }

  enforceCurrentPublicVersion();
  [250, 800, 1800].forEach((delay) => window.setTimeout(enforceCurrentPublicVersion, delay));
})();
