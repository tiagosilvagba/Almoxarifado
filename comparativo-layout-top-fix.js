"use strict";

(() => {
  function installStyle() {
    if (document.getElementById("comparativo-top-position-fix")) return;
    const style = document.createElement("style");
    style.id = "comparativo-top-position-fix";
    style.textContent = `
      html.monthly-comparison-active main.main-content,
      body.monthly-comparison-active main.main-content,
      html.monthly-comparison-active #catalogContent,
      body.monthly-comparison-active #catalogContent,
      body:has(#page-comparativo-mensal:not(.is-hidden)) main.main-content,
      body:has(#page-comparativo-mensal:not(.is-hidden)) #catalogContent {
        min-height:auto !important;
        align-items:stretch !important;
        justify-content:flex-start !important;
      }
      html.monthly-comparison-active #page-comparativo-mensal,
      body.monthly-comparison-active #page-comparativo-mensal,
      body:has(#page-comparativo-mensal:not(.is-hidden)) #page-comparativo-mensal {
        margin-top:0 !important;
        padding-top:clamp(16px,2vw,28px) !important;
        min-height:0 !important;
        height:auto !important;
        align-self:start !important;
        justify-self:stretch !important;
        transform:none !important;
        position:relative !important;
        top:auto !important;
      }
      body:has(#page-comparativo-mensal:not(.is-hidden)) .catalog-content {
        display:block !important;
      }
    `;
    document.head.appendChild(style);
  }

  function sync() {
    const page = document.getElementById("page-comparativo-mensal");
    const active = !!page && !page.classList.contains("is-hidden");
    document.documentElement.classList.toggle("monthly-comparison-active", active);
    document.body?.classList.toggle("monthly-comparison-active", active);
    if (active) window.scrollTo({ top:0, behavior:"auto" });
  }

  function install() {
    installStyle();
    sync();
    const page = document.getElementById("page-comparativo-mensal");
    if (page) new MutationObserver(sync).observe(page, { attributes:true, attributeFilter:["class"] });
    window.addEventListener("hashchange", () => setTimeout(sync, 0));
    [100,300,700,1400].forEach((delay) => setTimeout(sync, delay));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once:true });
  else install();
})();
