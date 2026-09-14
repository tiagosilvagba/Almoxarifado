"use strict";

/*
 * Classificação responsiva global.
 * Usa viewport real + toque + orientação e identifica o SO apenas para refinamentos.
 * Não depende do user-agent para decidir mobile/tablet/desktop.
 */
(() => {
  let raf = 0;

  function ensureResponsiveStyles() {
    if (document.getElementById("responsiveProjectStyles")) return;
    const link = document.createElement("link");
    link.id = "responsiveProjectStyles";
    link.rel = "stylesheet";
    link.href = "./responsive-project.css?v=20260914-1";
    document.head.appendChild(link);
  }

  function detectOS() {
    const ua = navigator.userAgent || "";
    const platform = navigator.userAgentData?.platform || navigator.platform || "";
    const touchPoints = navigator.maxTouchPoints || 0;
    if (/iPad|iPhone|iPod/i.test(ua) || (/Mac/i.test(platform) && touchPoints > 1)) return "ios";
    if (/Android/i.test(ua)) return "android";
    if (/Windows/i.test(platform) || /Windows/i.test(ua)) return "windows";
    if (/Mac/i.test(platform) || /Macintosh|Mac OS X/i.test(ua)) return "macos";
    if (/Linux/i.test(platform) || /Linux/i.test(ua)) return "linux";
    return "other";
  }

  function classify() {
    ensureResponsiveStyles();
    const root = document.documentElement;
    const vv = window.visualViewport;
    const width = Math.round(vv?.width || window.innerWidth || root.clientWidth || 0);
    const height = Math.round(vv?.height || window.innerHeight || root.clientHeight || 0);
    const coarse = matchMedia("(pointer:coarse)").matches;
    const fine = matchMedia("(pointer:fine)").matches;
    const touch = coarse || navigator.maxTouchPoints > 0;
    const os = detectOS();

    let mode;
    if (width <= 600) mode = "mobile";
    else if (width <= 1099 || (touch && width < 1280)) mode = "tablet";
    else mode = "desktop";

    const orientation = width >= height ? "landscape" : "portrait";
    const navMode = mode === "desktop" ? "side" : "bottom";

    root.dataset.viewportMode = mode;
    root.dataset.viewportWidth = String(width);
    root.dataset.viewportHeight = String(height);
    root.dataset.viewportOrientation = orientation;
    root.dataset.os = os;
    root.dataset.inputMode = touch ? (fine ? "hybrid" : "touch") : "pointer";
    root.dataset.navMode = navMode;

    root.classList.toggle("viewport-mobile", mode === "mobile");
    root.classList.toggle("viewport-tablet", mode === "tablet");
    root.classList.toggle("viewport-desktop", mode === "desktop");
    root.classList.toggle("viewport-touch", touch);
    root.classList.toggle("viewport-pointer", !touch || fine);
    root.classList.toggle("viewport-landscape", orientation === "landscape");
    root.classList.toggle("viewport-portrait", orientation === "portrait");
    ["ios","android","windows","macos","linux","other"].forEach((name) => root.classList.toggle(`os-${name}`, os === name));

    root.style.setProperty("--app-viewport-width", `${width}px`);
    root.style.setProperty("--app-viewport-height", `${height}px`);
    root.style.setProperty("--app-safe-bottom", os === "ios" ? "env(safe-area-inset-bottom)" : "0px");

    document.body?.classList.toggle("uses-bottom-navigation", navMode === "bottom");
  }

  function schedule() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(classify);
  }

  ensureResponsiveStyles();
  classify();
  addEventListener("resize", schedule, { passive:true });
  addEventListener("orientationchange", schedule, { passive:true });
  window.visualViewport?.addEventListener("resize", schedule, { passive:true });
  window.visualViewport?.addEventListener("scroll", schedule, { passive:true });
  document.addEventListener("DOMContentLoaded", classify, { once:true });
})();
