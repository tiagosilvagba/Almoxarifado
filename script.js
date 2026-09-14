"use strict";

/*
 * Bootstrap 2.0
 * Mantém integralmente a versão funcional anterior e aplica a identificação
 * visual da versão atual sem depender da constante APP_VERSION da base antiga.
 */

const PREVIOUS_APP_SOURCE = "https://cdn.jsdelivr.net/gh/tiagosilvagba/Almoxarifado@1f609d34b8a6a2cfcaf2d2ce1699dcb000b5ed6b/script.js";
const PREVIOUS_APP_FALLBACK = "https://raw.githubusercontent.com/tiagosilvagba/Almoxarifado/1f609d34b8a6a2cfcaf2d2ce1699dcb000b5ed6b/script.js";
const CURRENT_VERSION_LABEL = "Versão 2.0";

function loadPreviousApplication(source) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = source;
    script.async = false;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function enforceCurrentVersion() {
  const badge = document.getElementById("versionBadge");
  if (badge) badge.textContent = CURRENT_VERSION_LABEL;
}

function keepVersionSynchronized() {
  enforceCurrentVersion();

  let attempts = 0;
  const timer = window.setInterval(() => {
    enforceCurrentVersion();
    attempts += 1;
    if (attempts >= 24) window.clearInterval(timer);
  }, 250);

  const observer = new MutationObserver(() => enforceCurrentVersion());
  const startObserver = () => {
    const badge = document.getElementById("versionBadge");
    if (!badge) return;
    observer.observe(badge, { childList:true, characterData:true, subtree:true });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startObserver, { once:true });
  } else {
    startObserver();
  }
}

(async function startVersion2() {
  keepVersionSynchronized();

  try {
    await loadPreviousApplication(PREVIOUS_APP_SOURCE);
  } catch {
    await loadPreviousApplication(PREVIOUS_APP_FALLBACK);
  }

  enforceCurrentVersion();
  window.setTimeout(enforceCurrentVersion, 500);
  window.setTimeout(enforceCurrentVersion, 1500);
})();
