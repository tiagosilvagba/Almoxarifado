"use strict";

/* Visualizador leve em tela cheia para as fotos do modal de itens. */
(() => {
  if (window.__almoxImageViewerInstalled) return;
  window.__almoxImageViewerInstalled = true;

  let images = [];
  let activeIndex = 0;
  let touchStartX = null;
  let galleryRevision = 0;

  function imageSource(image) {
    return String(image?.currentSrc || image?.src || image?.getAttribute?.("src") || "");
  }

  function installStyles() {
    if (document.getElementById("almoxImageViewerStyles")) return;
    const style = document.createElement("style");
    style.id = "almoxImageViewerStyles";
    style.textContent = `
      #modalGallery .gallery__main img{cursor:zoom-in}
      #modalGallery .gallery__main{position:relative}
      #modalGallery .gallery__main::after{content:"Ampliar";position:absolute;right:9px;bottom:9px;padding:5px 8px;border-radius:999px;background:rgba(0,0,0,.68);color:#fff;font-size:11px;font-weight:800;pointer-events:none}
      dialog.almox-image-viewer{position:fixed;inset:0;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:#050912;color:#fff;overflow:hidden;contain:layout paint style;box-sizing:border-box}
      dialog.almox-image-viewer::backdrop{background:transparent}
      dialog.almox-image-viewer[open]{display:grid;grid-template-rows:52px minmax(0,1fr) 42px}
      .almox-image-viewer__top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 12px;background:#050912}
      .almox-image-viewer__identity{min-width:0;display:grid;gap:1px}
      .almox-image-viewer__identity strong{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .almox-image-viewer__identity small{font-size:11px;opacity:.68}
      .almox-image-viewer__close,.almox-image-viewer__nav{display:grid;place-items:center;border:1px solid rgba(255,255,255,.18);background:#171c25;color:#fff;cursor:pointer}
      .almox-image-viewer__close{width:38px;height:38px;border-radius:50%;font-size:23px;line-height:1}
      .almox-image-viewer__stage{position:relative;min-width:0;min-height:0;width:100%;height:100%;display:grid;place-items:center;padding:6px 62px;overflow:hidden;touch-action:pan-y;background:#050912;box-sizing:border-box}
      .almox-image-viewer__image{display:block;width:100%;height:100%;min-width:0;min-height:0;max-width:100%;max-height:100%;object-fit:contain;object-position:center;user-select:none;-webkit-user-drag:none}
      .almox-image-viewer__nav{position:absolute;top:50%;width:42px;height:52px;border-radius:10px;transform:translateY(-50%);font-size:28px;z-index:2}
      .almox-image-viewer__nav--prev{left:9px}.almox-image-viewer__nav--next{right:9px}
      .almox-image-viewer__nav[hidden]{display:none}
      .almox-image-viewer__footer{display:flex;align-items:center;justify-content:center;padding:4px 12px 8px;background:#050912;font-size:12px;font-weight:800}
      @media(max-width:700px){
        dialog.almox-image-viewer[open]{grid-template-rows:48px minmax(0,1fr) 38px}
        .almox-image-viewer__top{padding:5px 8px}.almox-image-viewer__stage{padding:4px 42px}.almox-image-viewer__nav{width:34px;height:48px;font-size:24px}.almox-image-viewer__nav--prev{left:4px}.almox-image-viewer__nav--next{right:4px}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureViewer() {
    let viewer = document.getElementById("almoxImageViewer");
    if (viewer) return viewer;

    viewer = document.createElement("dialog");
    viewer.id = "almoxImageViewer";
    viewer.className = "almox-image-viewer";
    viewer.setAttribute("aria-label", "Visualizador de fotos");
    viewer.innerHTML = `
      <header class="almox-image-viewer__top">
        <div class="almox-image-viewer__identity">
          <strong id="almoxImageViewerTitle">Foto do item</strong>
          <small id="almoxImageViewerSubtitle"></small>
        </div>
        <button class="almox-image-viewer__close" type="button" aria-label="Fechar visualizador">×</button>
      </header>
      <div class="almox-image-viewer__stage">
        <button class="almox-image-viewer__nav almox-image-viewer__nav--prev" type="button" aria-label="Foto anterior" hidden>‹</button>
        <img class="almox-image-viewer__image" alt="" decoding="async">
        <button class="almox-image-viewer__nav almox-image-viewer__nav--next" type="button" aria-label="Próxima foto" hidden>›</button>
      </div>
      <footer class="almox-image-viewer__footer"><span id="almoxImageViewerCounter">1 de 1</span></footer>`;
    document.body.appendChild(viewer);

    viewer.querySelector(".almox-image-viewer__close").addEventListener("click", closeViewer);
    viewer.querySelector(".almox-image-viewer__nav--prev").addEventListener("click", () => step(-1));
    viewer.querySelector(".almox-image-viewer__nav--next").addEventListener("click", () => step(1));
    viewer.querySelector(".almox-image-viewer__stage").addEventListener("click", (event) => {
      if (event.target.classList.contains("almox-image-viewer__stage")) closeViewer();
    });
    viewer.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeViewer();
    });
    viewer.querySelector(".almox-image-viewer__stage").addEventListener("touchstart", (event) => {
      touchStartX = event.changedTouches?.[0]?.clientX ?? null;
    }, { passive:true });
    viewer.querySelector(".almox-image-viewer__stage").addEventListener("touchend", (event) => {
      if (touchStartX == null || images.length < 2) return;
      const endX = event.changedTouches?.[0]?.clientX ?? touchStartX;
      const delta = endX - touchStartX;
      touchStartX = null;
      if (Math.abs(delta) >= 45) step(delta < 0 ? 1 : -1);
    }, { passive:true });

    return viewer;
  }

  function currentItemLabel() {
    return {
      code: document.getElementById("modalCode")?.textContent?.trim() || "",
      title: document.getElementById("modalTitle")?.textContent?.trim() || "Foto do item",
    };
  }

  function updateHeader() {
    const viewer = ensureViewer();
    const { code, title } = currentItemLabel();
    viewer.querySelector("#almoxImageViewerTitle").textContent = title;
    viewer.querySelector("#almoxImageViewerSubtitle").textContent = code;
  }

  function updateControls() {
    const viewer = ensureViewer();
    viewer.querySelector("#almoxImageViewerCounter").textContent = `${activeIndex + 1} de ${Math.max(images.length, 1)}`;
    const hidden = images.length < 2;
    viewer.querySelector(".almox-image-viewer__nav--prev").hidden = hidden;
    viewer.querySelector(".almox-image-viewer__nav--next").hidden = hidden;
  }

  function showSource(src, alt = "Foto do item") {
    if (!src) return;
    const viewer = ensureViewer();
    const target = viewer.querySelector(".almox-image-viewer__image");
    if (target.src !== src) target.src = src;
    target.alt = alt;
  }

  function collectGalleryImages(clickedSrc, revision) {
    const gallery = document.getElementById("modalGallery");
    const viewer = document.getElementById("almoxImageViewer");
    if (!gallery || revision !== galleryRevision || !viewer?.open) return;

    const result = [];
    const seen = new Set();
    const push = (node) => {
      const src = imageSource(node);
      if (!src || seen.has(src)) return;
      seen.add(src);
      result.push({ src, alt: node?.alt || "Foto do item" });
    };

    for (const thumb of gallery.querySelectorAll(".gallery__thumb img")) push(thumb);
    push(gallery.querySelector(".gallery__main img"));

    if (!result.length) return;
    images = result;
    const found = images.findIndex((entry) => entry.src === clickedSrc);
    activeIndex = found >= 0 ? found : 0;
    updateControls();
  }

  function openViewer(clickedImage) {
    const src = imageSource(clickedImage);
    if (!src) return;

    galleryRevision += 1;
    const revision = galleryRevision;
    images = [{ src, alt: clickedImage.alt || "Foto do item" }];
    activeIndex = 0;

    const viewer = ensureViewer();
    updateHeader();
    showSource(src, clickedImage.alt || "Foto do item");
    updateControls();

    if (!viewer.open) viewer.showModal();

    requestAnimationFrame(() => {
      window.setTimeout(() => collectGalleryImages(src, revision), 0);
    });
  }

  function closeViewer() {
    const viewer = document.getElementById("almoxImageViewer");
    if (!viewer?.open) return;
    galleryRevision += 1;
    viewer.close();
  }

  function step(direction) {
    if (images.length < 2) return;
    activeIndex = (activeIndex + direction + images.length) % images.length;
    const current = images[activeIndex];
    showSource(current.src, current.alt);
    updateControls();
  }

  function onDocumentClick(event) {
    const image = event.target.closest?.("#modalGallery .gallery__main img");
    if (!image || image.classList.contains("is-hidden")) return;
    event.preventDefault();
    openViewer(image);
  }

  function onKeydown(event) {
    const viewer = document.getElementById("almoxImageViewer");
    if (!viewer?.open) return;
    if (event.key === "ArrowLeft") { event.preventDefault(); step(-1); }
    else if (event.key === "ArrowRight") { event.preventDefault(); step(1); }
  }

  function install() {
    installStyles();
    ensureViewer();
    document.addEventListener("click", onDocumentClick);
    document.addEventListener("keydown", onKeydown);
    document.getElementById("itemModal")?.addEventListener("close", closeViewer);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once:true });
  else install();
})();
