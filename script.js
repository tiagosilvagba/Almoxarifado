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
const COMPARATIVO_MES_A_MES_MODULE = "./comparativo-mes-a-mes.js?v=20260914-5";
const COMPARATIVO_ESCALA_MIL_MODULE = "./comparativo-escala-mil.js?v=20260914-2";
const CURRENT_PUBLIC_VERSION = "Versão 3.6";

/*
 * Fallback global seguro para a listagem do repositório.
 * Importante: esta camada NÃO pode devolver apenas os arquivos mensais, porque a mesma
 * consulta é usada pelo carregador principal para localizar Saldo, Compras, Consumo e
 * Responsáveis. Quando a API responde normalmente, a resposta original é preservada.
 * O fallback só entra em ação quando a consulta realmente falha.
 */
(function installRepositoryFallback() {
  if (window.__almoxRepositoryFallbackInstalled) return;
  window.__almoxRepositoryFallbackInstalled = true;

  const nativeFetch = window.fetch.bind(window);
  const apiPattern = /^https:\/\/api\.github\.com\/repos\/tiagosilvagba\/Almoxarifado\/contents(?:\?ref=main)?$/i;
  const months = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

  async function fileExists(name) {
    const url = `./${encodeURIComponent(name).replace(/%2F/gi, "/")}`;
    try {
      const head = await nativeFetch(url, { method:"HEAD", cache:"no-store" });
      if (head.ok) return true;
      if (![405,501].includes(head.status)) return false;
    } catch {}
    try {
      const get = await nativeFetch(url, { method:"GET", cache:"no-store", headers:{ Range:"bytes=0-0" } });
      return get.ok || get.status === 206;
    } catch {
      return false;
    }
  }

  async function discoverKnownRepositoryFilesLocally() {
    const candidates = [
      "00 - Saldo_Online.csv",
      "01 - Compras_Almox.csv",
      "02 - Responsaveis_Reposição.CSV",
      "03 - Consumo.csv"
    ];

    for (let part = 1; part <= 20; part += 1) {
      candidates.push(`01 - Compras_Almox_Parte_${String(part).padStart(2,"0")}.CSV`);
    }

    const currentYear = new Date().getFullYear();
    for (let year = currentYear - 3; year <= currentYear + 1; year += 1) {
      for (const month of months) candidates.push(`01 - Estoque_${month}_${year}.csv`);
    }

    const unique = [...new Set(candidates)];
    const found = [];
    const batchSize = 8;
    for (let i = 0; i < unique.length; i += batchSize) {
      const batch = unique.slice(i, i + batchSize);
      const results = await Promise.all(batch.map(async (name) => ({ name, exists: await fileExists(name) })));
      for (const { name, exists } of results) {
        if (exists) found.push({ name, path:name, type:"file", sha:"same-origin-discovery" });
      }
    }
    return found;
  }

  window.fetch = async function almoxFetch(input, init) {
    const url = typeof input === "string" ? input : input?.url || "";
    if (!apiPattern.test(url)) return nativeFetch(input, init);

    try {
      const response = await nativeFetch(input, init);
      if (response.ok) return response;
      console.warn(`Listagem do repositório respondeu ${response.status}; usando descoberta local de contingência.`);
    } catch (error) {
      console.warn("Listagem do repositório indisponível; usando descoberta local de contingência.", error);
    }

    const manifest = await discoverKnownRepositoryFilesLocally();
    console.info(`Contingência: ${manifest.length} arquivo(s) de dados localizado(s) no GitHub Pages.`);
    return new Response(JSON.stringify(manifest), {
      status:200,
      headers:{
        "Content-Type":"application/json; charset=utf-8",
        "X-Almoxarifado-Fallback":"same-origin-full-data-discovery"
      }
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
    [COMPARATIVO_MES_A_MES_MODULE, "cards Meta e Meta -10% vs mês comparado"],
    [COMPARATIVO_ESCALA_MIL_MODULE, "escala x1000 de saldo e consumo"]
  ]) {
    try { await loadIncrementalScript(src); }
    catch (error) { console.error(`Não foi possível carregar ${message}.`, error); }
  }
  enforceCurrentPublicVersion();
  [250, 800, 1800].forEach((delay) => window.setTimeout(enforceCurrentPublicVersion, delay));
})();
