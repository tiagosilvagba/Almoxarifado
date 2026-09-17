"use strict";

/* Visualizador em tela cheia para as fotos do modal de itens. */
(() => {
  if (window.__almoxImageViewerInstalled) return;
  window.__almoxImageViewerInstalled = true;

  let images = [];
  let activeIndex = 0;
  let previousFocus = null;
  let touchStartX = null;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[char]);
  }

  function normalizeUrl(value) {
    try { return new URL(String(value || ""), document.baseURI).href; }
    catch { return String(value || ""); }
  }

  function installStyles() {
    if (document.getElementById("almoxImageViewerStyles")) return;
    const style = document.createElement("style");
    style.id = "almoxImageViewerStyles";
    style.textContent = `
      #modalGallery .gallery__main img{cursor:zoom-in}
      #modalGallery .gallery__main{position:relative}
      #modalGallery .gallery__main::after{content:"Ampliar";position:absolute;right:10px;bottom:10px;padding:6px 9px;border-radius:999px;background:rgba(0,0,0,.66);color:#fff;font-size:11px;font-weight:800;letter-spacing:.02em;pointer-events:none;opacity:0;transform:translateY(3px);transition:opacity .16s ease,transform .16s ease}
      #modalGallery .gallery__main:has(img:hover)::after{opacity:1;transform:none}
      .almox-image-viewer{position:fixed;inset:0;z-index:2147483646;display:grid;grid-template-rows:auto minmax(0,1fr) auto;background:rgba(4,9,18,.96);backdrop-filter:blur(8px);color:#fff;opacity:0;visibility:hidden;transition:opacity .16s ease,visibility .16s ease}
      .almox-image-viewer.is-open{opacity:1;visibility:visible}
      .almox-image-viewer__top{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 16px;min-height:58px;background:linear-gradient(180deg,rgba(0,0,0,.48),rgba(0,0,0,0))}
      .almox-image-viewer__identity{min-width:0;display:grid;gap:2px}
      .almox-image-viewer__identity strong{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .almox-image-viewer__identity small{font-size:11px;opacity:.72}
      .almox-image-viewer__close,.almox-image-viewer__nav{display:grid;place-items:center;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.08);color:#fff;cursor:pointer;transition:background .15s ease,transform .15s ease}
      .almox-image-viewer__close{width:42px;height:42px;border-radius:50%;font-size:25px;line-height:1}
      .almox-image-viewer__close:hover,.almox-image-viewer__nav:hover{background:rgba(255,255,255,.17)}
      .almox-image-viewer__close:active,.almox-image-viewer__nav:active{transform:scale(.96)}
      .almox-image-viewer__stage{position:relative;min-height:0;display:grid;place-items:center;padding:8px 72px 12px;overflow:hidden;touch-action:pan-y}
      .almox-image-viewer__image{display:block;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;border-radius:4px;box-shadow:0 22px 70px rgba(0,0,0,.42);user-select:none;-webkit-user-drag:none}
      .almox-image-viewer__nav{position:absolute;top:50%;width:48px;height:58px;border-radius:14px;transform:translateY(-50%);font-size:30px;z-index:2}
      .almox-image-viewer__nav:active{transform:translateY(-50%) scale(.96)}
      .almox-image-viewer__nav--prev{left:14px}.almox-image-viewer__nav--next{right:14px}
      .almox-image-viewer__nav[hidden]{display:none}
      .almox-image-viewer__footer{display:flex;align-items:center;justify-content:center;min-height:48px;padding:8px 16px 14px;background:linear-gradient(0deg,rgba(0,0,0,.42),rgba(0,0,0,0));font-size:12px;font-weight:800;letter-spacing:.02em}
      html.almox-image-viewer-open,html.almox-image-viewer-open body{overflow:hidden!important}
      @media(max-width:700px){
        .almox-image-viewer__top{padding:8px 10px;min-height:52px}.almox-image-viewer__close{width:40px;height:40px}.almox-image-viewer__stage{padding:6px 44px 8px}.almox-image-viewer__nav{width:38px;height:52px;border-radius:11px;font-size:25px}.almox-image-viewer__nav--prev{left:5px}.almox-image-viewer__nav--next{right:5px}.almox-image-viewer__footer{min-height:42px;padding-bottom:max(10px,env(safe-area-inset-bottom))}
      }
      @media(hover:none){#modalGallery .gallery__main::after{opacity:.78;transform:none}}
    `;
    document.head.appendChild(style);
  }

  function ensureViewer() {
    let viewer = document.getElementById("almoxImageViewer");
    if (viewer) return viewer;

    viewer = document.createElement("div");
    viewer.id = "almoxImageViewer";
    viewer.className = "almox-image-viewer";
    viewer.setAttribute("role", "dialog");
    viewer.setAttribute("aria-modal", "true");
    viewer.setAttribute("aria-label", "Visualizador de fotos");
    viewer.setAttribute("aria-hidden", "true");
    viewer.innerHTML = `
      <header class="almox-image-viewer__top">
        <div class="almox-image-viewer__identity">
          <strong id="almoxImageViewerTitle">Foto do item</strong>
          <small id="almoxImageViewerSubtitle"></small>
        </div>
        <button class="almox-image-viewer__close" type="button" aria-label="Fechar visualizador">×</button>
      </header>
      <div class="almox-image-viewer__stage">
        <button class="almox-image-viewer__nav almox-image-viewer__nav--prev" type="button" aria-label="Foto anterior">‹</button>
        <img class="almox-image-viewer__image" alt="">
        <button class="almox-image-viewer__nav almox-image-viewer__nav--next" type="button" aria-label="Próxima foto">›</button>
      </div>
      <footer class="almox-image-viewer__footer"><span id="almoxImageViewerCounter"></span></footer>`;
    document.body.appendChild(viewer);

    viewer.querySelector(".almox-image-viewer__close").addEventListener("click", closeViewer);
    viewer.querySelector(".almox-image-viewer__nav--prev").addEventListener("click", () => step(-1));
    viewer.querySelector(".almox-image-viewer__nav--next").addEventListener("click", () => step(1));
    viewer.querySelector(".almox-image-viewer__stage").addEventListener("click", (event) => {
      if (event.target.classList.contains("almox-image-viewer__stage")) closeViewer();
    });
    viewer.querySelector(".almox-image-viewer__stage").addEventListener("touchstart", (event) => {
      touchStartX = event.changedTouches?.[0]?.clientX ?? null;
    }, { passive:true });
    viewer.querySelector(".almox-image-viewer__stage").addEventListener("touchend", (event) => {
      if (touchStartX == null || images.length < 2) return;
      const endX = event.changedTouches?.[0]?.clientX ?? touchStartX;
      const delta = endX - touchStartX;
      touchStartX = null;
      if (Math.abs(delta) < 45) return;
      step(delta < 0 ? 1 : -1);
    }, { passive:true });

    return viewer;
  }

  function collectGalleryImages() {
    const gallery = document.getElementById("modalGallery");
    if (!gallery) return [];
    const nodes = [
      ...gallery.querySelectorAll(".gallery__thumb img"),
      ...gallery.querySelectorAll(".gallery__main img"),
    ];
    const seen = new Set();
    const result = [];
    for (const image of nodes) {
      const src = normalizeUrl(image.currentSrc || image.src || image.getAttribute("src"));
      if (!src || seen.has(src)) continue;
      seen.add(src);
      result.push({ src, alt:image.alt || "Foto do item" });
    }
    return result;
  }

  function currentItemLabel() {
    const code = document.getElementById("modalCode")?.textContent?.trim() || "";
    const title = document.getElementById("modalTitle")?.textContent?.trim() || "Foto do item";
    return { code, title };
  }

  function render() {
    const viewer = ensureViewer();
    if (!images.length) return;
    activeIndex = ((activeIndex % images.length) + images.length) % images.length;
    const current = images[activeIndex];
    const image = viewer.querySelector(".almox-image-viewer__image");
    const prev = viewer.querySelector(".almox-image-viewer__nav--prev");
    const next = viewer.querySelector(".almox-image-viewer__nav--next");
    const { code, title } = currentItemLabel();

    image.src = current.src;
    image.alt = current.alt || `${title} — foto ${activeIndex + 1}`;
    viewer.querySelector("#almoxImageViewerTitle").textContent = title;
    viewer.querySelector("#almoxImageViewerSubtitle").textContent = code;
    viewer.querySelector("#almoxImageViewerCounter").textContent = `${activeIndex + 1} de ${images.length}`;
    prev.hidden = images.length < 2;
    next.hidden = images.length < 2;
  }

  function openViewer(clickedImage) {
    images = collectGalleryImages();
    if (!images.length) return;
    const clickedSrc = normalizeUrl(clickedImage?.currentSrc || clickedImage?.src || clickedImage?.getAttribute("src"));
    const found = images.findIndex((entry) => entry.src === clickedSrc);
    activeIndex = found >= 0 ? found : 0;
    previousFocus = document.activeElement;
    render();

    const viewer = ensureViewer();
    viewer.setAttribute("aria-hidden", "false");
    document.documentElement.classList.add("almox-image-viewer-open");
    requestAnimationFrame(() => viewer.classList.add("is-open"));
    viewer.querySelector(".almox-image-viewer__close")?.focus({ preventScroll:true });
  }

  function closeViewer() {
    const viewer = document.getElementById("almoxImageViewer");
    if (!viewer || !viewer.classList.contains("is-open")) return;
    viewer.classList.remove("is-open");
    viewer.setAttribute("aria-hidden", "true");
    document.documentElement.classList.remove("almox-image-viewer-open");
    window.setTimeout(() => {
      if (!viewer.classList.contains("is-open")) viewer.querySelector(".almox-image-viewer__image")?.removeAttribute("src");
    }, 180);
    previousFocus?.focus?.({ preventScroll:true });
    previousFocus = null;
  }

  function step(direction) {
    if (images.length < 2) return;
    activeIndex = (activeIndex + direction + images.length) % images.length;
    render();
  }

  function onDocumentClick(event) {
    const image = event.target.closest?.("#modalGallery .gallery__main img");
    if (!image) return;
    event.preventDefault();
    event.stopPropagation();
    openViewer(image);
  }

  function onKeydown(event) {
    const viewer = document.getElementById("almoxImageViewer");
    if (!viewer?.classList.contains("is-open")) return;
    if (event.key === "Escape") { event.preventDefault(); closeViewer(); }
    else if (event.key === "ArrowLeft") { event.preventDefault(); step(-1); }
    else if (event.key === "ArrowRight") { event.preventDefault(); step(1); }
  }

  function install() {
    installStyles();
    ensureViewer();
    document.addEventListener("click", onDocumentClick, true);
    document.addEventListener("keydown", onKeydown, true);
    document.getElementById("itemModal")?.addEventListener("close", closeViewer);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once:true });
  else install();
})();
