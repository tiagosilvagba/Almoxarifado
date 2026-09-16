"use strict";

/* Exporta a página ativa como captura visual em PDF. */
(() => {
  if (window.__almoxPageSnapshotPdfInstalled) return;
  window.__almoxPageSnapshotPdfInstalled = true;

  const HTML2CANVAS_URL = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
  const JSPDF_URL = "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js";
  let loadingLibraries = null;
  let exporting = false;

  function loadScript(src, test) {
    if (test()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-pdf-lib="${src}"]`);
      if (existing) {
        existing.addEventListener("load", resolve, { once:true });
        existing.addEventListener("error", reject, { once:true });
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.dataset.pdfLib = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Não foi possível carregar a biblioteca necessária para o PDF."));
      document.head.appendChild(script);
    });
  }

  function ensureLibraries() {
    if (loadingLibraries) return loadingLibraries;
    loadingLibraries = (async () => {
      await loadScript(HTML2CANVAS_URL, () => typeof window.html2canvas === "function");
      await loadScript(JSPDF_URL, () => Boolean(window.jspdf?.jsPDF));
    })().catch((error) => { loadingLibraries = null; throw error; });
    return loadingLibraries;
  }

  function activePage() {
    const visible = [...document.querySelectorAll("[data-page-panel]")].find((node) => !node.classList.contains("is-hidden") && node.offsetParent !== null);
    if (visible) return visible;
    return document.querySelector("#catalogContent") || document.querySelector("main.main-content");
  }

  function pageName(node) {
    const page = node?.dataset?.pagePanel || document.querySelector(".app-nav__tab.is-active")?.dataset?.page || "pagina";
    const labels = {
      dashboard:"Dashboard",
      "comparativo-mensal":"Comparativo-Mensal",
      catalogo:"Catalogo",
      "necessidade-compra":"Necessidade-de-Compra",
      "sc-pendente-of":"SC-Pendente-de-OF",
      "consulta-sc-of":"Consulta-SC-OF",
      "tempo-geracao-of":"Tempo-Geracao-OF",
      "revisao-min-max":"Revisao-Min-Max",
      instrucoes:"Instrucoes"
    };
    return labels[page] || String(page).replace(/[^a-z0-9-]+/gi,"-");
  }

  function filename(node) {
    const date = new Date();
    const stamp = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
    return `Almoxarifado-${pageName(node)}-${stamp}.pdf`;
  }

  function setButtonState(button, busy, text = "") {
    button.disabled = busy;
    button.classList.toggle("is-exporting", busy);
    button.setAttribute("aria-busy", busy ? "true" : "false");
    const label = button.querySelector(".page-pdf-button__label");
    if (label) label.textContent = text || "PDF";
  }

  function injectStyles() {
    if (document.getElementById("pageSnapshotPdfStyles")) return;
    const style = document.createElement("style");
    style.id = "pageSnapshotPdfStyles";
    style.textContent = `
      .page-pdf-button{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-width:42px;height:42px;padding:0 10px;border:1px solid rgba(255,255,255,.22);border-radius:11px;background:rgba(255,255,255,.06);color:#fff;opacity:.76;cursor:pointer;transition:opacity .16s ease,background .16s ease,border-color .16s ease;box-shadow:none}
      .page-pdf-button:hover,.page-pdf-button:focus-visible{opacity:1;background:rgba(255,255,255,.11);border-color:rgba(255,255,255,.34)}
      .page-pdf-button:disabled{cursor:wait;opacity:.55}
      .page-pdf-button svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
      .page-pdf-button__label{font-size:10px;font-weight:800;letter-spacing:.04em}
      @media(max-width:600px){.page-pdf-button{width:42px;min-width:42px;padding:0}.page-pdf-button__label{display:none}}
      @media(min-width:601px) and (max-width:1099px){.page-pdf-button{min-width:44px;padding:0 8px}.page-pdf-button__label{font-size:9px}}
      html.pdf-capture-active .app-nav-wrap,html.pdf-capture-active .topbar{pointer-events:none}
    `;
    document.head.appendChild(style);
  }

  function installButton() {
    if (document.getElementById("pagePdfButton")) return;
    const actions = document.querySelector(".topbar__actions");
    const theme = actions?.querySelector(".theme-picker");
    if (!actions || !theme) return;
    const button = document.createElement("button");
    button.id = "pagePdfButton";
    button.className = "page-pdf-button";
    button.type = "button";
    button.title = "Gerar PDF visual da página atual";
    button.setAttribute("aria-label", "Gerar PDF visual da página atual");
    button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h8l4 4v16H6z"></path><path d="M14 2v5h5"></path><path d="M8.5 16h7M8.5 12h7"></path></svg><span class="page-pdf-button__label">PDF</span>`;
    theme.insertAdjacentElement("afterend", button);
    button.addEventListener("click", exportActivePage);
  }

  async function exportActivePage() {
    if (exporting) return;
    const button = document.getElementById("pagePdfButton");
    const target = activePage();
    if (!button || !target) return;

    exporting = true;
    setButtonState(button, true, "...");
    document.documentElement.classList.add("pdf-capture-active");

    const previousScroll = { x:window.scrollX, y:window.scrollY };
    try {
      await ensureLibraries();
      await document.fonts?.ready;
      const background = getComputedStyle(document.body).backgroundColor || "#ffffff";
      const scale = Math.min(2, Math.max(1.15, window.devicePixelRatio || 1));
      const canvas = await window.html2canvas(target, {
        scale,
        useCORS:true,
        allowTaint:false,
        backgroundColor: background === "rgba(0, 0, 0, 0)" ? null : background,
        logging:false,
        scrollX:0,
        scrollY:-window.scrollY,
        windowWidth:Math.max(document.documentElement.clientWidth, target.scrollWidth),
        windowHeight:Math.max(document.documentElement.clientHeight, target.scrollHeight),
        onclone:(doc) => {
          doc.documentElement.classList.add("pdf-export-clone");
          doc.querySelectorAll(".is-hidden,[hidden]").forEach((el) => { if (el.id !== target.id) el.style.display = "none"; });
        }
      });

      const { jsPDF } = window.jspdf;
      const orientation = canvas.width >= canvas.height ? "landscape" : "portrait";
      const pdf = new jsPDF({ orientation, unit:"mm", format:"a4", compress:true });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 6;
      const usableWidth = pageWidth - margin * 2;
      const usableHeight = pageHeight - margin * 2;
      const pxPerMm = canvas.width / usableWidth;
      const sliceHeightPx = Math.max(1, Math.floor(usableHeight * pxPerMm));
      const slice = document.createElement("canvas");
      const ctx = slice.getContext("2d");
      let y = 0;
      let page = 0;

      while (y < canvas.height) {
        const currentHeight = Math.min(sliceHeightPx, canvas.height - y);
        slice.width = canvas.width;
        slice.height = currentHeight;
        ctx.clearRect(0,0,slice.width,slice.height);
        ctx.drawImage(canvas,0,y,canvas.width,currentHeight,0,0,canvas.width,currentHeight);
        const image = slice.toDataURL("image/jpeg",0.92);
        const renderedHeight = currentHeight / pxPerMm;
        if (page > 0) pdf.addPage("a4", orientation);
        pdf.addImage(image,"JPEG",margin,margin,usableWidth,renderedHeight,undefined,"FAST");
        y += currentHeight;
        page += 1;
      }

      pdf.save(filename(target));
      setButtonState(button, false, "PDF");
    } catch (error) {
      console.error("Falha ao gerar PDF visual.", error);
      alert(`Não foi possível gerar o PDF visual. ${error?.message || "Tente novamente."}`);
      setButtonState(button, false, "PDF");
    } finally {
      exporting = false;
      document.documentElement.classList.remove("pdf-capture-active");
      window.scrollTo(previousScroll.x, previousScroll.y);
    }
  }

  function install() {
    injectStyles();
    installButton();
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      installButton();
      if (document.getElementById("pagePdfButton") || tries > 40) clearInterval(timer);
    },150);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once:true });
  else install();
})();
