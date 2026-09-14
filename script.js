"use strict";

/* Bootstrap incremental — preserva a versão funcional anterior e carrega as novas camadas. */
const PREVIOUS_BOOTSTRAP = "https://cdn.jsdelivr.net/gh/tiagosilvagba/Almoxarifado@bb6ede30b8e351bf50734aa84a3ed28e12b5bb1c/script.js";
const PREVIOUS_BOOTSTRAP_FALLBACK = "https://raw.githubusercontent.com/tiagosilvagba/Almoxarifado/bb6ede30b8e351bf50734aa84a3ed28e12b5bb1c/script.js";
const COMPARATIVO_META_MODULE = "./comparativo-meta.js?v=20260914-1";
const LAYOUT_FIX_MODULE = "./layout-fix.js?v=20260914-2";
const COMPARATIVO_PERIODOS_MODULE = "./comparativo-periodos.js?v=20260914-1";
const COMPARATIVO_EXCEL_MODULE = "./comparativo-excel-padrao.js?v=20260914-3";
const COMPARATIVO_ITEM_SPLIT_MODULE = "./comparativo-item-split.js?v=20260914-2";
const COMPARATIVO_META_VISUAL_MODULE = "./comparativo-meta-visual.js?v=20260914-2";
const COMPARATIVO_INCLUSOES_MODULE = "./comparativo-inclusoes.js?v=20260914-2";
const COMPARATIVO_CARDS_RESUMO_MODULE = "./comparativo-cards-resumo.js?v=20260914-1";
const COMPARATIVO_MES_A_MES_MODULE = "./comparativo-mes-a-mes.js?v=20260914-4";
const COMPARATIVO_ESCALA_MIL_MODULE = "./comparativo-escala-mil.js?v=20260914-2";
const CURRENT_PUBLIC_VERSION = "Versão 3.3";

/*
 * O comparativo usava a API pública do GitHub para descobrir os CSVs mensais.
 * Em rede corporativa/rate limit essa chamada pode falhar mesmo com os CSVs acessíveis
 * pelo próprio GitHub Pages. Mantemos a descoberta online e fornecemos um manifesto
 * local somente quando a API não responder corretamente.
 */
(function installMonthlyRepositoryFallback() {
  if (window.__almoxMonthlyFetchFallbackInstalled) return;
  window.__almoxMonthlyFetchFallbackInstalled = true;
  const nativeFetch = window.fetch.bind(window);
  const apiPattern = /^https:\/\/api\.github\.com\/repos\/tiagosilvagba\/Almoxarifado\/contents(?:\?ref=main)?$/i;
  const monthlyFiles = [
    "01 - Estoque_Dez_2025.csv",
    "01 - Estoque_Abr_2026.csv",
    "01 - Estoque_Jul_2026.csv",
    "01 - Estoque_Ago_2026.csv",
    "01 - Estoque_Set_2026.csv"
  ];
  const manifest = monthlyFiles.map((name) => ({ name, path:name, type:"file", sha:"fallback" }));

  window.fetch = async function almoxFetch(input, init) {
    const url = typeof input === "string" ? input : input?.url || "";
    if (!apiPattern.test(url)) return nativeFetch(input, init);
    try {
      const response = await nativeFetch(input, init);
      if (response.ok) return response;
      console.warn(`Comparativo mensal: API GitHub respondeu ${response.status}; usando manifesto local.`);
    } catch (error) {
      console.warn("Comparativo mensal: API GitHub indisponível; usando manifesto local.", error);
    }
    return new Response(JSON.stringify(manifest), {
      status:200,
      headers:{"Content-Type":"application/json; charset=utf-8", "X-Almoxarifado-Fallback":"monthly-manifest"}
    });
  };
})();

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
  try { await loadIncrementalScript(PREVIOUS_BOOTSTRAP); }
  catch { await loadIncrementalScript(PREVIOUS_BOOTSTRAP_FALLBACK); }

  enforceCurrentPublicVersion();

  for (const [src, message] of [
    [COMPARATIVO_META_MODULE, "mês meta e filtros dinâmicos"],
    [LAYOUT_FIX_MODULE, "correção estrutural do layout"],
    [COMPARATIVO_PERIODOS_MODULE, "rótulos de período do comparativo"],
    [COMPARATIVO_EXCEL_MODULE, "exportação Excel padronizada"],
    [COMPARATIVO_ITEM_SPLIT_MODULE, "separação de código e nome do item"],
    [COMPARATIVO_META_VISUAL_MODULE, "cálculo visual comparado x mês meta"],
    [COMPARATIVO_INCLUSOES_MODULE, "inclusões e reduções de estoque zeradas"],
    [COMPARATIVO_CARDS_RESUMO_MODULE, "cards Top 10 do comparativo"],
    [COMPARATIVO_MES_A_MES_MODULE, "card Meta vs mês comparado"],
    [COMPARATIVO_ESCALA_MIL_MODULE, "escala x1000 de saldo e consumo"]
  ]) {
    try { await loadIncrementalScript(src); }
    catch (error) { console.error(`Não foi possível carregar ${message}.`, error); }
  }

  enforceCurrentPublicVersion();
  [250, 800, 1800].forEach((delay) => window.setTimeout(enforceCurrentPublicVersion, delay));
})();