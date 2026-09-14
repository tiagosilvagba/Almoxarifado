"use strict";

/* Classificação responsiva por viewport + capacidade de toque.
   Não depende do user-agent e reage a rotação, resize e zoom. */
(() => {
  let raf = 0;

  function classify() {
    const root = document.documentElement;
    const vv = window.visualViewport;
    const width = Math.round(vv?.width || window.innerWidth || root.clientWidth || 0);
    const height = Math.round(vv?.height || window.innerHeight || root.clientHeight || 0);
    const touch = matchMedia("(pointer:coarse)").matches || navigator.maxTouchPoints > 0;

    let mode;
    if (width <= 600) mode = "mobile";
    else if (width <= 1099 || (touch && width < 1280)) mode = "tablet";
    else mode = "desktop";

    root.dataset.viewportMode = mode;
    root.dataset.viewportWidth = String(width);
    root.dataset.viewportOrientation = width >= height ? "landscape" : "portrait";
    root.classList.toggle("viewport-mobile", mode === "mobile");
    root.classList.toggle("viewport-tablet", mode === "tablet");
    root.classList.toggle("viewport-desktop", mode === "desktop");
    root.style.setProperty("--app-viewport-width", `${width}px`);
    root.style.setProperty("--app-viewport-height", `${height}px`);
  }

  function schedule() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(classify);
  }

  classify();
  addEventListener("resize", schedule, { passive:true });
  addEventListener("orientationchange", schedule, { passive:true });
  window.visualViewport?.addEventListener("resize", schedule, { passive:true });
  document.addEventListener("DOMContentLoaded", classify, { once:true });
})();
