"use strict";

/*
 * Fila global de gravações no GitHub.
 * - Serializa PUT/DELETE/PATCH/POST no Contents API do repositório.
 * - Usa Web Locks quando disponível: a fila funciona inclusive entre abas do mesmo site.
 * - Fallback para fila Promise dentro da aba.
 * - Em conflito 409, espera e tenta novamente antes de liberar o próximo commit.
 */
(() => {
  if (window.__almoxGithubCommitQueueInstalled) return;
  window.__almoxGithubCommitQueueInstalled = true;

  const OWNER = "tiagosilvagba";
  const REPO = "Almoxarifado";
  const LOCK_NAME = "almoxarifado-github-commit-queue";
  const CONTENTS_PREFIX = `https://api.github.com/repos/${OWNER}/${REPO}/contents/`;
  const METHODS = new Set(["PUT", "DELETE", "PATCH", "POST"]);
  const RETRIES = 4;
  const BASE_DELAY = 700;
  const nativeFetch = window.fetch.bind(window);
  let localChain = Promise.resolve();
  let pending = 0;
  let active = false;

  function isQueuedMutation(input, init) {
    const url = typeof input === "string" ? input : input?.url || "";
    const method = String(init?.method || input?.method || "GET").toUpperCase();
    return url.startsWith(CONTENTS_PREFIX) && METHODS.has(method);
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function updateStatus() {
    const root = document.documentElement;
    root.dataset.githubQueuePending = String(pending);
    root.dataset.githubQueueActive = active ? "true" : "false";

    const status = document.getElementById("photoUploadStatus");
    if (!status) return;
    if (active && pending > 1) status.textContent = `Commit em andamento · ${pending - 1} aguardando na fila`;
    else if (active) status.textContent = "Commit em andamento…";
  }

  async function performWithRetry(input, init) {
    let lastResponse = null;
    for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
      const response = await nativeFetch(input, init);
      lastResponse = response;
      if (response.status !== 409) return response;
      if (attempt >= RETRIES) return response;
      await wait(BASE_DELAY * (attempt + 1));
    }
    return lastResponse;
  }

  async function runJob(input, init) {
    active = true;
    updateStatus();
    try {
      return await performWithRetry(input, init);
    } finally {
      pending = Math.max(0, pending - 1);
      active = false;
      updateStatus();
      window.dispatchEvent(new CustomEvent("almoxarifado:github-queue-change", {
        detail: { pending, active }
      }));
    }
  }

  function runWithLocalQueue(input, init) {
    const job = localChain.then(() => runJob(input, init), () => runJob(input, init));
    localChain = job.then(() => undefined, () => undefined);
    return job;
  }

  function runWithGlobalLock(input, init) {
    return navigator.locks.request(LOCK_NAME, { mode:"exclusive" }, () => runJob(input, init));
  }

  window.fetch = function queuedGithubFetch(input, init) {
    if (!isQueuedMutation(input, init)) return nativeFetch(input, init);

    pending += 1;
    updateStatus();
    window.dispatchEvent(new CustomEvent("almoxarifado:github-queue-change", {
      detail: { pending, active }
    }));

    if (navigator.locks?.request) return runWithGlobalLock(input, init);
    return runWithLocalQueue(input, init);
  };

  window.almoxGithubCommitQueue = {
    get pending() { return pending; },
    get active() { return active; },
    get busy() { return active || pending > 0; }
  };
})();
