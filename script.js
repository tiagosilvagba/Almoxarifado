"use strict";

/** Bootstrap 8.5: desacelera a rotação dos modais e separa quantidades solicitada e entregue. */
const BOOTSTRAP_VERSION = "8.5";
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

const MODULES = Object.freeze({
  base: "./app/layers/features.js?v=8.5",
  responsive: "./app/modules/responsive-layout.js?v=8.0",
  commitQueue: "./app/modules/github-commit-queue.js?v=7.0",
  balanceTime: "./app/modules/saldo-update-time.js?v=7.0",
  area: "./app/modules/area-filter-active.js?v=7.9",
  noTurn: "./app/modules/itens-sem-giro.js?v=7.0",
  noTurnCross: "./app/modules/itens-sem-giro-cruzamento.js?v=7.0",
  followUp: "./app/modules/follow-up.js?v=7.3",
  purchaseLeadTime: "./app/modules/purchase-need-lead-time.js?v=7.0",
  imageViewer: "./app/modules/image-viewer.js?v=8.5",
  pdf: "./app/modules/page-snapshot-pdf.js?v=7.0",
  photos: "./app/modules/github-photo-upload-v2.js?v=7.0",
  comparison: [
    ["./app/modules/comparativo-meta.js?v=7.0", "metas"],
    ["./app/modules/layout-fix.js?v=7.0", "layout"],
    ["./app/modules/comparativo-periodos.js?v=7.0", "períodos"],
    ["./app/modules/comparativo-excel-padrao.js?v=7.0", "Excel"],
    ["./app/modules/comparativo-item-split.js?v=7.0", "itens"],
    ["./app/modules/comparativo-meta-visual.js?v=7.0", "meta visual"],
    ["./app/modules/comparativo-inclusoes.js?v=7.8", "inclusões"],
    ["./app/modules/comparativo-cards-resumo.js?v=7.0", "resumos"],
    ["./app/modules/comparativo-mes-a-mes.js?v=7.0", "mês a mês"],
    ["./app/modules/comparativo-escala-mil.js?v=7.8", "escala"],
  ],
});

function loadScript(src, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timer = setTimeout(() => {
      script.remove();
      reject(new Error(`Tempo esgotado ao carregar ${src}`));
    }, timeout);
    script.src = src;
    script.async = false;
    script.onload = () => { clearTimeout(timer); resolve(); };
    script.onerror = () => { clearTimeout(timer); reject(new Error(`Falha ao carregar ${src}`)); };
    document.head.appendChild(script);
  });
}

async function optional(src, name) {
  try {
    await loadScript(src);
    return true;
  } catch (error) {
    console.error(`Módulo indisponível: ${name}`, error);
    return false;
  }
}

function setVersion() {
  const badge = document.getElementById("versionBadge");
  if (badge) badge.textContent = `Versão ${BOOTSTRAP_VERSION}`;
  document.documentElement.dataset.appVersion = BOOTSTRAP_VERSION;
}

function yieldToBrowser() {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

function whenIdle(callback, timeout = 4000) {
  if ("requestIdleCallback" in window) requestIdleCallback(callback, { timeout });
  else setTimeout(callback, IS_IOS ? 1800 : 600);
}

function exposeAppState(attempt = 0) {
  try {
    if (typeof state !== "undefined") {
      window.__almoxState = state;
      return;
    }
  } catch (error) {
    console.warn("Estado global ainda indisponível", error);
  }
  if (attempt < 120) setTimeout(() => exposeAppState(attempt + 1), 250);
}

(async () => {
  setVersion();
  optional(MODULES.responsive, "responsividade");
  optional(MODULES.commitQueue, "fila de atualizações");
  await loadScript(MODULES.base, 45000);
  setVersion();
  await yieldToBrowser();

  exposeAppState();

  for (const [src, name] of [
    [MODULES.balanceTime, "horário do saldo"],
    [MODULES.area, "filtro de área"],
    [MODULES.noTurn, "itens sem giro"],
    [MODULES.followUp, "follow up"],
    [MODULES.purchaseLeadTime, "lead time de reposição"],
    [MODULES.imageViewer, "visualizador de fotos"],
  ]) {
    await optional(src, name);
    await yieldToBrowser();
  }

  whenIdle(async () => {
    await optional(MODULES.pdf, "exportação PDF");
    await yieldToBrowser();
    await optional(MODULES.photos, "fotos");
  }, IS_IOS ? 9000 : 4500);

  if (!IS_IOS) {
    setTimeout(() => whenIdle(() => optional(MODULES.noTurnCross, "cruzamento sem giro"), 6000), 3500);
  }

  whenIdle(async () => {
    for (const [src, name] of MODULES.comparison) {
      await optional(src, name);
      await yieldToBrowser();
    }
  }, IS_IOS ? 12000 : 5000);

  [250, 1000, 2500].forEach((delay) => setTimeout(setVersion, delay));
})().catch((error) => {
  console.error("Falha ao iniciar a aplicação", error);
  const status = document.getElementById("statusLine");
  if (status) status.textContent = "Não foi possível iniciar a aplicação.";
});
