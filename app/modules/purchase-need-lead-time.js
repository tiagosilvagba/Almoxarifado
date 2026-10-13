"use strict";

(() => {
  if (window.__purchaseNeedLeadTimeInstalled) return;
  window.__purchaseNeedLeadTimeInstalled = true;

  const fmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
  const DAY_MS = 86400000;
  const MAX_LEAD_DAYS = 730;

  function getState() {
    return window.__almoxState || window.state || null;
  }

  function median(values) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function timestamp(value) {
    if (!value) return 0;
    if (typeof dateTimestamp === "function") {
      try {
        const parsed = dateTimestamp(value);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
      } catch {}
    }

    const text = String(value).trim();
    if (!text) return 0;
    if (/^\d{5}(?:\.\d+)?$/.test(text)) return Date.UTC(1899, 11, 30) + Number(text) * DAY_MS;

    const br = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (br) return Date.UTC(Number(br[3]), Number(br[2]) - 1, Number(br[1]), Number(br[4] || 0), Number(br[5] || 0));

    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function daysBetween(startValue, endValue) {
    const start = timestamp(startValue);
    const end = timestamp(endValue);
    if (!start || !end || end < start) return null;
    const days = Math.round((end - start) / DAY_MS);
    return days >= 0 && days <= MAX_LEAD_DAYS ? days : null;
  }

  function newBucket() {
    return {
      scToOf: [],
      ofToReceipt: [],
      total: [],
      seenScToOf: new Set(),
      seenOfToReceipt: new Set(),
      seenTotal: new Set(),
    };
  }

  function addRecord(bucket, record) {
    const sc = record?.sc;
    const of = record?.of;
    const rec = record?.rec;

    if (sc?.date && of?.date) {
      const key = `${sc.code || ""}::${of.code || ""}`;
      if (!bucket.seenScToOf.has(key)) {
        bucket.seenScToOf.add(key);
        const days = daysBetween(sc.date, of.date);
        if (days != null) bucket.scToOf.push(days);
      }
    }

    if (of?.date && rec?.entryDate) {
      const key = `${of.code || ""}::${rec.invoice || ""}::${rec.series || ""}`;
      if (!bucket.seenOfToReceipt.has(key)) {
        bucket.seenOfToReceipt.add(key);
        const days = daysBetween(of.date, rec.entryDate);
        if (days != null) bucket.ofToReceipt.push(days);
      }
    }

    if (sc?.date && rec?.entryDate) {
      const key = `${sc.code || ""}::${of?.code || ""}::${rec.invoice || ""}::${rec.series || ""}`;
      if (!bucket.seenTotal.has(key)) {
        bucket.seenTotal.add(key);
        const days = daysBetween(sc.date, rec.entryDate);
        if (days != null) bucket.total.push(days);
      }
    }
  }

  function summarize(values) {
    return {
      days: median(values),
      samples: values.length,
    };
  }

  function stageLead(row) {
    const item = row?.item;
    const position = row?.position;
    if (!item) {
      return {
        scToOf: summarize([]),
        ofToReceipt: summarize([]),
        total: summarize([]),
      };
    }

    const branchCode = String(position?.branchCode || "");
    const all = newBucket();
    const branch = newBucket();

    for (const record of item.history || []) {
      addRecord(all, record);
      if (branchCode && String(record?.branchCode || "") === branchCode) addRecord(branch, record);
    }

    const pick = (name) => branchCode && branch[name].length ? branch[name] : all[name];
    return {
      scToOf: summarize(pick("scToOf")),
      ofToReceipt: summarize(pick("ofToReceipt")),
      total: summarize(pick("total")),
    };
  }

  // Um único cálculo serve aos cards e ao Excel da Necessidade de Compra.
  function lead(row) {
    if (typeof purchaseNeedLeadTimeInfo === "function") {
      const info = purchaseNeedLeadTimeInfo(row, getState()?.minMaxReviews || []);
      return { days: info.days, source: info.source };
    }
    return { days: null, source: "Sem histórico" };
  }

  function formatDays(value) {
    return value == null ? "Sem histórico" : `${fmt.format(value)} dias`;
  }

  function sampleLabel(stage) {
    if (!stage.samples) return "sem vínculo completo";
    return `${fmt.format(stage.samples)} ${stage.samples === 1 ? "processo" : "processos"}`;
  }

  function stageMarkup(label, stage) {
    return `<span class="purchase-need-lead-stage"><small>${label}</small><strong>${formatDays(stage.days)}</strong><em>mediana · ${sampleLabel(stage)}</em></span>`;
  }

  function decorate(card) {
    if (!card || card.dataset.leadTimeReady === "true") return;
    const appState = getState();
    const row = appState?.purchaseNeedByKey?.get(card.dataset.purchaseNeedKey);
    if (!row) return;

    const totalLead = lead(row);
    const stages = stageLead(row);
    const tag = document.createElement("div");
    tag.className = "purchase-need-lead-time";
    tag.innerHTML = `
      <span class="purchase-need-lead-time__total">
        <small>Lead time total</small>
        <strong>${totalLead.days == null ? "Não disponível" : `${fmt.format(totalLead.days)} dias`}</strong>
        <em>${totalLead.source}</em>
      </span>
      ${stageMarkup("SC → OF", stages.scToOf)}
      ${stageMarkup("OF → Recebimento", stages.ofToReceipt)}
    `;
    const footer = card.querySelector(":scope > .report-card__footer");
    if (footer) footer.before(tag);
    else card.appendChild(tag);
    card.dataset.leadTimeReady = "true";
  }

  function decorateAll(root = document) {
    root.querySelectorAll?.(".report-card--need[data-purchase-need-key]").forEach(decorate);
  }

  function decorateModal() {
    const modal = document.getElementById("purchaseNeedModal");
    const container = document.getElementById("purchaseModalOperational");
    const row = getState()?.activePurchaseNeed;
    if (!modal || !container || !row || !modal.open) return;
    if (container.querySelector(".purchase-lead-stage-detail")) return;

    const stages = stageLead(row);
    const details = [
      ["SC → OF", stages.scToOf],
      ["OF → Recebimento", stages.ofToReceipt],
    ];

    for (const [label, stage] of details) {
      const article = document.createElement("article");
      article.className = "purchase-lead-stage-detail";
      article.innerHTML = `<span>${label}</span><strong>${formatDays(stage.days)}</strong><small>mediana · ${sampleLabel(stage)}</small>`;
      container.appendChild(article);
    }
  }

  // A exportação de Excel/PDF agora está integrada diretamente ao núcleo.
  // O interceptador antigo de downloadExcelWorkbook não é mais necessário.

  function style() {
    if (document.getElementById("purchaseNeedLeadTimeStyle")) return;
    const sheet = document.createElement("style");
    sheet.id = "purchaseNeedLeadTimeStyle";
    sheet.textContent = `
      .purchase-need-lead-time{
        display:grid;
        grid-template-columns:repeat(3,minmax(0,1fr));
        gap:8px;
        width:100%;
        margin:0;
        padding:0;
        box-sizing:border-box;
      }
      .purchase-need-lead-time__total,
      .purchase-need-lead-stage{
        display:flex;
        flex-direction:column;
        justify-content:center;
        gap:3px;
        min-width:0;
        min-height:72px;
        padding:10px 11px;
        border:1px solid var(--steel-200,#d8e0e8);
        border-radius:12px;
        background:color-mix(in srgb,var(--surface,#fff) 88%,var(--steel-100,#eef2f6));
        box-sizing:border-box;
      }
      .purchase-need-lead-time__total{
        border-color:color-mix(in srgb,var(--blue-500,#4777ff) 28%,var(--steel-200,#d8e0e8));
        background:color-mix(in srgb,var(--blue-100,#eaf3ff) 62%,var(--surface,#fff));
      }
      .purchase-need-lead-time__total small,
      .purchase-need-lead-stage small{
        display:block;
        font-size:.68rem;
        line-height:1.2;
        opacity:.76;
        white-space:normal;
        word-break:normal;
        overflow-wrap:break-word;
      }
      .purchase-need-lead-time__total strong,
      .purchase-need-lead-stage strong{
        display:block;
        margin:0;
        font-size:.92rem;
        line-height:1.18;
        white-space:normal;
        word-break:normal;
        overflow-wrap:break-word;
      }
      .purchase-need-lead-time__total em,
      .purchase-need-lead-stage em{
        display:block;
        font-size:.64rem;
        line-height:1.25;
        font-style:normal;
        opacity:.68;
        white-space:normal;
        word-break:normal;
        overflow-wrap:break-word;
      }
      .purchase-lead-stage-detail small{line-height:1.25}
      @media (max-width:720px){
        .purchase-need-lead-time{grid-template-columns:1fr}
        .purchase-need-lead-time__total,.purchase-need-lead-stage{min-height:0}
      }
    `;
    document.head.appendChild(sheet);
  }

  function init() {
    style();

    const host = document.getElementById("purchaseNeedTableWrap");
    if (host) {
      decorateAll(host);
      new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType !== 1) continue;
            decorateAll(node.matches?.(".report-card--need") ? node.parentElement : node);
          }
        }
      }).observe(host, { childList: true, subtree: true });
    }

    const modalOperational = document.getElementById("purchaseModalOperational");
    if (modalOperational) {
      new MutationObserver(() => decorateModal()).observe(modalOperational, { childList: true, subtree: true });
    }
    document.getElementById("purchaseNeedModal")?.addEventListener("transitionend", decorateModal);
    document.getElementById("purchaseNeedModal")?.addEventListener("click", () => setTimeout(decorateModal, 0));

    let tries = 0;
    const timer = setInterval(() => {
      decorateAll(host || document);
      decorateModal();
      if (++tries > 30) clearInterval(timer);
    }, 500);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
