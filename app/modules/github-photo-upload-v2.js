"use strict";

(() => {
  const OWNER = "tiagosilvagba";
  const REPO = "Almoxarifado";
  const BRANCH = "main";
  const IMAGE_DIR = "imagens";
  const TOKEN_KEY = "almoxarifado-github-photo-token";
  const MAX_SIDE = 1800;
  const JPEG_QUALITY = 0.84;
  const MAX_PENDING = 6;
  const apiBase = `https://api.github.com/repos/${OWNER}/${REPO}`;

  let pendingCode = "";
  let pendingFiles = [];
  const taskQueue = [];
  let processing = false;
  let activeTask = null;

  const normalizeItemCode = (value) => String(value ?? "").trim().replace(/^0+(?=\d)/, "") || String(value ?? "").trim();
  const token = () => { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; } };
  const saveToken = (value) => { try { localStorage.setItem(TOKEN_KEY, value); } catch {} };
  const clearToken = () => { try { localStorage.removeItem(TOKEN_KEY); } catch {} };

  async function api(path, options = {}) {
    const currentToken = token();
    if (!currentToken) throw new Error("TOKEN_REQUIRED");
    const headers = new Headers(options.headers || {});
    headers.set("Accept", "application/vnd.github+json");
    headers.set("Authorization", `Bearer ${currentToken}`);
    headers.set("X-GitHub-Api-Version", "2022-11-28");
    if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const response = await fetch(`${apiBase}${path}`, { ...options, headers, cache:"no-store" });
    if (response.status === 401 || response.status === 403) {
      clearToken();
      throw new Error("TOKEN_INVALID");
    }
    return response;
  }

  function ensureTokenDialog() {
    let dialog = document.getElementById("githubPhotoTokenDialog");
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.id = "githubPhotoTokenDialog";
    dialog.className = "item-modal";
    dialog.innerHTML = `<form method="dialog" class="modal-shell" style="max-width:560px"><header class="modal-header"><div><span class="modal-code">GitHub</span><h2>Autorizar envio de fotos</h2><p>A chave ficará somente neste navegador.</p></div></header><div class="modal-content"><label class="field"><span>Fine-grained token</span><input id="githubPhotoTokenInput" type="password" autocomplete="off" placeholder="github_pat_..." style="width:100%"></label><p id="githubPhotoTokenMessage" style="min-height:1.2em;margin:.7rem 0 0"></p><div class="filter-actions" style="margin-top:1rem"><button class="button button--ghost" value="cancel" type="submit">Cancelar</button><button id="githubPhotoTokenSave" class="button button--primary" type="button">Validar e salvar neste aparelho</button></div></div></form>`;
    document.body.appendChild(dialog);
    return dialog;
  }

  function askForToken() {
    return new Promise((resolve) => {
      const dialog = ensureTokenDialog();
      const input = dialog.querySelector("#githubPhotoTokenInput");
      const message = dialog.querySelector("#githubPhotoTokenMessage");
      const save = dialog.querySelector("#githubPhotoTokenSave");
      input.value = ""; message.textContent = "";
      const onClose = () => resolve(false);
      dialog.addEventListener("close", onClose, { once:true });
      save.onclick = async () => {
        const value = input.value.trim();
        if (!/^github_pat_/i.test(value)) { message.textContent = "Informe uma chave Fine-grained válida."; return; }
        save.disabled = true; message.textContent = "Validando acesso…"; saveToken(value);
        try {
          const response = await api(`/contents/${IMAGE_DIR}?ref=${BRANCH}`);
          if (!response.ok) throw new Error(`GitHub respondeu ${response.status}.`);
          dialog.removeEventListener("close", onClose); dialog.close(); resolve(true);
        } catch (error) {
          clearToken(); message.textContent = error.message === "TOKEN_INVALID" ? "Chave inválida ou sem acesso." : `Falha: ${error.message}`;
        } finally { save.disabled = false; }
      };
      dialog.showModal(); setTimeout(() => input.focus(), 50);
    });
  }

  async function ensureToken() { return token() ? true : askForToken(); }

  async function listImageEntries() {
    const response = await api(`/contents/${IMAGE_DIR}?ref=${BRANCH}&t=${Date.now()}`);
    if (!response.ok) throw new Error(`Não foi possível consultar a pasta imagens (${response.status}).`);
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  }

  const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  function nextSequence(entries, rawCode) {
    const code = normalizeItemCode(rawCode);
    const re = new RegExp(`^0*${escapeRegex(code)}\\s*-\\s*(\\d{2})\\.(?:jpe?g|png|webp)$`, "i");
    let max = 0;
    for (const entry of entries) {
      const match = String(entry?.name || "").match(re);
      if (match) max = Math.max(max, Number(match[1]) || 0);
    }
    return max + 1;
  }

  function fileToImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file); const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Não foi possível abrir a imagem.")); };
      img.src = url;
    });
  }

  async function compressToJpeg(file) {
    const img = await fileToImage(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    const width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
    const height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha:false }); ctx.fillStyle = "#fff"; ctx.fillRect(0,0,width,height); ctx.drawImage(img,0,0,width,height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob) throw new Error("Falha ao preparar a imagem.");
    return blob;
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.onerror = () => reject(reader.error || new Error("Falha ao converter a imagem."));
      reader.readAsDataURL(blob);
    });
  }

  async function uploadOne(rawCode, sequence, file) {
    const seq = String(sequence).padStart(2,"0");
    const fileName = `${String(rawCode).trim()} - ${seq}.jpg`;
    const path = `${IMAGE_DIR}/${fileName}`;
    const jpeg = await compressToJpeg(file);
    const content = await blobToBase64(jpeg);
    const response = await api(`/contents/${path.split("/").map(encodeURIComponent).join("/")}`, { method:"PUT", body:JSON.stringify({ message:`Adiciona foto ${fileName}`, content, branch:BRANCH }) });
    if (response.status === 422) throw new Error(`A sequência ${seq} já existe para o item ${rawCode}.`);
    if (!response.ok) {
      let detail = ""; try { detail = (await response.json())?.message || ""; } catch {}
      throw new Error(`Falha ao enviar ${fileName}${detail ? `: ${detail}` : ""}`);
    }
    const body = await response.json();
    return { fileName, sequence, url:body?.content?.download_url || `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${IMAGE_DIR}/${encodeURIComponent(fileName)}` };
  }

  function addToRuntimeIndex(rawCode, uploaded) {
    try {
      const key = typeof normalizeCode === "function" ? normalizeCode(rawCode) : normalizeItemCode(rawCode);
      const list = state.imageIndex.get(key) || [];
      if (!list.some((image) => image.name === uploaded.fileName)) list.push({ order:uploaded.sequence, name:uploaded.fileName, url:uploaded.url });
      list.sort((a,b) => Number(a.order)-Number(b.order)); state.imageIndex.set(key,list);
      if (state.activeItem && normalizeItemCode(state.activeItem.code) === normalizeItemCode(rawCode) && typeof renderGallery === "function") renderGallery(state.activeItem);
    } catch {}
  }

  function currentCode() {
    try { return String(state?.activeItem?.code || "").trim(); } catch { return ""; }
  }

  function statusText(text, code = "") {
    const status = document.getElementById("photoUploadStatus");
    if (!status) return;
    if (!code || normalizeItemCode(currentCode()) === normalizeItemCode(code)) status.textContent = text;
  }

  function revoke(entries) { for (const entry of entries) if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl); }

  function clearPending() {
    revoke(pendingFiles); pendingFiles = []; pendingCode = ""; renderPending();
  }

  function ensurePendingUi() {
    const actions = document.querySelector(".photo-upload-actions"); if (!actions) return null;
    let wrap = document.getElementById("githubPhotoPendingWrap"); if (wrap) return wrap;
    wrap = document.createElement("div"); wrap.id = "githubPhotoPendingWrap"; wrap.style.cssText = "width:100%;margin-top:12px";
    wrap.innerHTML = `<div id="githubPhotoPendingGrid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(92px,1fr));gap:10px"></div><div id="githubPhotoPendingActions" style="display:none;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;flex-wrap:wrap"><small id="githubPhotoPendingCount"></small><div style="display:flex;gap:8px;flex-wrap:wrap"><button id="githubPhotoClearPending" class="button button--ghost" type="button">Limpar seleção</button><button id="githubPhotoCommitButton" class="button button--primary" type="button">Upload</button></div></div><div id="githubPhotoTaskQueue" style="margin-top:8px;font-size:12px;opacity:.82"></div>`;
    actions.appendChild(wrap);
    wrap.querySelector("#githubPhotoClearPending").addEventListener("click", clearPending);
    wrap.querySelector("#githubPhotoCommitButton").addEventListener("click", queuePendingUpload);
    wrap.querySelector("#githubPhotoPendingGrid").addEventListener("click", (event) => {
      const button = event.target.closest("[data-remove-pending]"); if (!button) return;
      const index = Number(button.dataset.removePending); const [removed] = pendingFiles.splice(index,1); if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      if (!pendingFiles.length) pendingCode = ""; renderPending();
    });
    return wrap;
  }

  function renderPending() {
    const wrap = ensurePendingUi(); if (!wrap) return;
    const grid = wrap.querySelector("#githubPhotoPendingGrid"); const actions = wrap.querySelector("#githubPhotoPendingActions"); const count = wrap.querySelector("#githubPhotoPendingCount"); const queueLabel = wrap.querySelector("#githubPhotoTaskQueue");
    grid.innerHTML = pendingFiles.map((entry,index) => `<article style="position:relative;border:1px solid var(--steel-200,rgba(148,163,184,.3));border-radius:12px;overflow:hidden;background:rgba(255,255,255,.06)"><img src="${entry.previewUrl}" alt="Foto ${index+1} aguardando upload" style="display:block;width:100%;aspect-ratio:1/1;object-fit:cover"><button type="button" data-remove-pending="${index}" aria-label="Remover foto" style="position:absolute;top:5px;right:5px;width:30px;height:30px;border:0;border-radius:50%;background:rgba(0,0,0,.72);color:#fff;font-size:18px">×</button><small style="display:block;padding:6px 7px;text-align:center">Item ${pendingCode || "—"}</small></article>`).join("");
    actions.style.display = pendingFiles.length ? "flex" : "none";
    count.textContent = `${pendingFiles.length} de ${MAX_PENDING} foto${pendingFiles.length===1?"":"s"} para o item ${pendingCode || "—"}`;
    const waiting = taskQueue.length + (activeTask ? 1 : 0);
    queueLabel.textContent = activeTask ? `Enviando item ${activeTask.code}${taskQueue.length ? ` · ${taskQueue.length} tarefa(s) aguardando` : ""}` : (waiting ? `${waiting} tarefa(s) na fila` : "");
  }

  function stageSelectedFiles(input) {
    const files = [...(input.files || [])].filter((file) => file.type.startsWith("image/")); input.value = "";
    if (!files.length) return;
    const code = currentCode(); if (!code) { alert("Abra um item antes de adicionar a foto."); return; }
    if (pendingCode && normalizeItemCode(pendingCode) !== normalizeItemCode(code)) clearPending();
    pendingCode = code;
    const available = Math.max(0, MAX_PENDING - pendingFiles.length); const accepted = files.slice(0, available);
    for (const file of accepted) pendingFiles.push({ file, previewUrl:URL.createObjectURL(file) });
    statusText(`${pendingFiles.length} foto${pendingFiles.length===1?"":"s"} aguardando envio para o item ${code}.`, code); renderPending();
  }

  async function queuePendingUpload() {
    if (!pendingFiles.length || !pendingCode) return;
    if (!(await ensureToken())) return;
    const task = { id:`${Date.now()}-${Math.random().toString(36).slice(2)}`, code:String(pendingCode), files:pendingFiles.map((entry)=>entry.file), previews:[...pendingFiles] };
    pendingFiles = []; pendingCode = ""; renderPending();
    taskQueue.push(task); renderPending();
    statusText(`Upload do item ${task.code} colocado na fila.`, task.code);
    processQueue();
  }

  async function processTask(task) {
    for (let i=0;i<task.files.length;i+=1) {
      /* Reconsulta o GitHub imediatamente antes de cada commit. Assim a sequência é sempre baseada no estado mais novo. */
      const entries = await listImageEntries();
      const sequence = nextSequence(entries, task.code);
      if (sequence > 99) throw new Error(`O item ${task.code} atingiu o limite de 99 fotos.`);
      statusText(`Item ${task.code}: enviando foto ${i+1} de ${task.files.length}…`, task.code);
      const uploaded = await uploadOne(task.code, sequence, task.files[i]);
      addToRuntimeIndex(task.code, uploaded);
    }
  }

  async function processQueue() {
    if (processing) return;
    processing = true;
    try {
      while (taskQueue.length) {
        activeTask = taskQueue.shift(); renderPending();
        try {
          await processTask(activeTask);
          statusText(`Fotos do item ${activeTask.code} enviadas com sucesso.`, activeTask.code);
        } catch (error) {
          if (error.message === "TOKEN_INVALID" || error.message === "TOKEN_REQUIRED") clearToken();
          statusText(`Erro no item ${activeTask.code}: ${error.message}`, activeTask.code);
          console.error("Falha no upload enfileirado", activeTask.code, error);
        } finally {
          revoke(activeTask.previews || []); activeTask = null; renderPending();
        }
      }
    } finally {
      processing = false; activeTask = null; renderPending();
    }
  }

  function patchImageIndexLoader() {
    if (typeof loadImageIndex !== "function" || loadImageIndex.__githubUploadExpanded) return;
    const original = loadImageIndex;
    loadImageIndex = async function expandedImageIndex() {
      const index = await original();
      try {
        const entries = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${IMAGE_DIR}?ref=${BRANCH}`, { headers:{Accept:"application/vnd.github+json"}, cache:"no-store" }).then((r)=>r.ok?r.json():[]);
        for (const entry of Array.isArray(entries)?entries:[]) {
          if (entry?.type!=="file" || !entry?.name || !entry?.download_url) continue;
          const match = entry.name.match(/^(.+?)\s*-\s*(\d{2})\.(?:jpe?g|png|webp)$/i); if (!match) continue;
          const key = typeof normalizeCode === "function" ? normalizeCode(match[1]) : normalizeItemCode(match[1]); const images = index.get(key) || [];
          if (!images.some((image)=>image.name===entry.name)) images.push({order:Number(match[2]),name:entry.name,url:entry.download_url}); images.sort((a,b)=>Number(a.order)-Number(b.order)); index.set(key,images);
        }
      } catch {}
      return index;
    };
    loadImageIndex.__githubUploadExpanded = true;
  }

  function install() {
    patchImageIndexLoader(); ensurePendingUi();
    document.addEventListener("change", (event) => {
      const input = event.target; if (!(input instanceof HTMLInputElement) || input.id !== "photoInput") return;
      event.preventDefault(); event.stopImmediatePropagation(); stageSelectedFiles(input);
    }, true);
    const modal = document.getElementById("itemModal");
    modal?.addEventListener("close", () => { clearPending(); });
    const status = document.getElementById("photoUploadStatus"); if (status) status.textContent = token() ? "Selecione as fotos e clique em Upload" : "Selecione as fotos; a chave será solicitada no Upload";
    window.almoxarifadoPhotoAuth = Object.freeze({ forget:()=>{clearToken();return true;}, configured:()=>Boolean(token()) });
    window.almoxarifadoPhotoQueue = { get active(){return activeTask ? {...activeTask,files:activeTask.files.length} : null;}, get waiting(){return taskQueue.map((task)=>({code:task.code,files:task.files.length}));}, get busy(){return processing || Boolean(activeTask) || taskQueue.length>0;} };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, {once:true}); else install();
})();
