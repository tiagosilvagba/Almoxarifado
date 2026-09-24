"use strict";

(() => {
  if (window.__almoxLocalAssistantInstalled) return;
  window.__almoxLocalAssistantInstalled = true;

  const VERSION = "10.7.6";
  const PAGE_ID = "assistente-ia";
  const ENGINE_SRC = "./app/ai/local-ai-engine.js?v=" + VERSION;
  const STYLE_SRC = "./app/styles/assistant.css?v=" + VERSION;
  const loadedDatasets = new Map();
  let manifestPromise = null;
  let engine = null;
  let busy = false;

  function normalize(value) {
    return String(value == null ? "" : value)
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();
  }

  function loadScript(src) {
    return new Promise((resolve,reject) => {
      const existing = document.querySelector('script[data-ai-engine="true"]');
      if (existing) {
        if (window.AlmoxLocalAI) return resolve();
        existing.addEventListener("load",resolve,{once:true});
        existing.addEventListener("error",reject,{once:true});
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.dataset.aiEngine = "true";
      script.onload = resolve;
      script.onerror = () => reject(new Error("Não foi possível carregar o motor local."));
      document.head.appendChild(script);
    });
  }

  function ensureStyles() {
    if (document.querySelector('link[data-ai-style="true"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = STYLE_SRC;
    link.dataset.aiStyle = "true";
    document.head.appendChild(link);
  }

  function stateNow() {
    try {
      if (window.__almoxState) return window.__almoxState;
      if (typeof state !== "undefined") return state;
    } catch {}
    return null;
  }

  async function waitForState(timeout = 30000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const current = stateNow();
      if (current && Array.isArray(current.items) && current.items.length) return current;
      await new Promise((resolve) => setTimeout(resolve,250));
    }
    throw new Error("A base principal ainda não terminou de carregar.");
  }

  function ensureTab() {
    const nav = document.querySelector(".app-nav");
    if (!nav) return null;
    let tab = nav.querySelector('[data-page="' + PAGE_ID + '"]');
    if (!tab) {
      tab = document.createElement("a");
      tab.className = "app-nav__tab";
      tab.href = "#assistente-ia";
      tab.dataset.page = PAGE_ID;
      tab.setAttribute("role","tab");
      tab.setAttribute("aria-selected","false");
      tab.setAttribute("aria-controls","page-assistente-ia");
      tab.innerHTML = '<span class="app-nav__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3Z"></path><path d="m19 14 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14ZM5 14l.9 2.1L8 17l-2.1.9L5 20l-.9-2.1L2 17l2.1-.9L5 14Z"></path></svg></span><span class="app-nav__label">Assistente IA</span>';
    }
    const instructions = nav.querySelector('[data-page="instrucoes"]');
    if (instructions && tab.nextElementSibling !== instructions) nav.insertBefore(tab,instructions);
    else if (!tab.isConnected) nav.appendChild(tab);
    return tab;
  }

  function panelMarkup() {
    return [
      '<section id="page-assistente-ia" class="page-panel ai-page is-hidden" data-page-panel="assistente-ia" aria-labelledby="aiPageTitle" aria-hidden="true">',
        '<div class="ai-hero">',
          '<div>',
            '<div class="ai-hero__title">',
              '<span class="ai-hero__mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3Z"></path><path d="m19 14 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z"></path></svg></span>',
              '<div><span class="eyebrow">Consulta inteligente local</span><h2 id="aiPageTitle">Assistente IA do Almoxarifado</h2></div>',
            '</div>',
            '<p>Escreva a pergunta do seu jeito. O assistente interpreta filtros, valores, comparações, agrupamentos e cruzamentos diretamente sobre as bases do projeto, sem enviar a pergunta para um serviço de IA externo.</p>',
          '</div>',
          '<div class="ai-hero__badges">',
            '<span id="aiLocalBadge" class="ai-status-badge">Processamento local</span>',
            '<span id="aiIndexBadge" class="ai-status-badge is-loading">Aguardando indexação</span>',
          '</div>',
        '</div>',
        '<div class="ai-shell">',
          '<section class="ai-chat" aria-label="Conversa com o assistente">',
            '<div class="ai-chat__toolbar">',
              '<strong>Consulta livre</strong>',
              '<div class="ai-chat__toolbar-actions">',
                '<label class="ai-filter-scope"><input id="aiUseCurrentFilters" type="checkbox"> Usar os filtros atuais do dashboard</label>',
                '<button id="aiClearConversation" class="ai-clear" type="button">Limpar conversa</button>',
              '</div>',
            '</div>',
            '<div id="aiMessages" class="ai-messages" aria-live="polite"></div>',
            '<form id="aiComposer" class="ai-composer">',
              '<div class="ai-composer__box">',
                '<textarea id="aiQuestion" rows="2" autocomplete="off" placeholder="Pergunte livremente sobre estoque, itens, responsáveis, SC, OF, recebimentos, fornecedores, consumo, lead time, rupturas, sem giro ou comparativos mensais..."></textarea>',
                '<button id="aiSend" class="ai-composer__send" type="submit" aria-label="Enviar pergunta"><svg viewBox="0 0 24 24"><path d="m4 4 17 8-17 8 3-8-3-8Z"></path><path d="M7 12h14"></path></svg></button>',
              '</div>',
              '<div class="ai-composer__hint"><span>Não é necessário usar uma pergunta pronta. Você pode combinar vários critérios na mesma frase e continuar a consulta usando “agora”, “desses”, “somente” ou “o restante”.</span><span><kbd>Enter</kbd> enviar · <kbd>Shift</kbd> + <kbd>Enter</kbd> nova linha</span></div>',
            '</form>',
          '</section>',
          '<aside class="ai-side">',
            '<section class="ai-side-card">',
              '<h3>Dados indexados</h3>',
              '<p>O índice é montado a partir do estado real da aplicação e enriquecido com bases auxiliares somente quando a pergunta precisar delas.</p>',
              '<div class="ai-data-stats">',
                '<article><strong id="aiStatItems">—</strong><small>itens</small></article>',
                '<article><strong id="aiStatProcesses">—</strong><small>processos</small></article>',
                '<article><strong id="aiStatPositions">—</strong><small>posições</small></article>',
                '<article><strong id="aiStatSources">—</strong><small>bases extras</small></article>',
              '</div>',
              '<div id="aiLoadedSources" class="ai-loaded-sources"></div>',
            '</section>',
            '<section class="ai-side-card ai-privacy">',
              '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 10V8a6 6 0 0 1 12 0v2"></path><rect x="4" y="10" width="16" height="11" rx="2"></rect><path d="M12 14v3"></path></svg>',
              '<div><strong>Sem API de IA externa</strong><small>A interpretação e os cálculos rodam no navegador. Arquivos auxiliares são lidos do próprio projeto publicado no GitHub Pages.</small></div>',
            '</section>',
          '</aside>',
        '</div>',
      '</section>'
    ].join("");
  }

  function ensurePanel() {
    let panel = document.getElementById("page-assistente-ia");
    if (panel) return panel;
    const host = document.getElementById("catalogContent") || document.querySelector(".catalog-content");
    if (!host) return null;
    host.insertAdjacentHTML("beforeend",panelMarkup());
    return document.getElementById("page-assistente-ia");
  }

  function activateAssistant(pushHistory = true) {
    const tab = ensureTab();
    const panel = ensurePanel();
    if (!tab || !panel) return;
    document.querySelectorAll(".app-nav__tab[data-page]").forEach((entry) => {
      const active = entry === tab;
      entry.classList.toggle("is-active",active);
      entry.setAttribute("aria-selected",String(active));
      entry.setAttribute("aria-current",active ? "page" : "false");
      entry.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll("[data-page-panel]").forEach((entry) => {
      const active = entry === panel;
      entry.classList.toggle("is-hidden",!active);
      entry.setAttribute("aria-hidden",String(!active));
      entry.inert = !active;
    });
    document.documentElement.dataset.activePage = PAGE_ID;
    document.title = "Assistente IA · Gestão de Almoxarifado";
    if (pushHistory && location.hash !== "#assistente-ia") history.pushState({page:PAGE_ID},"","#assistente-ia");
    setTimeout(() => document.getElementById("aiQuestion")?.focus(),40);
    scheduleStats();
  }

  function deactivateAssistant() {
    const panel = document.getElementById("page-assistente-ia");
    if (panel) {
      panel.classList.add("is-hidden");
      panel.setAttribute("aria-hidden","true");
      panel.inert = true;
    }
  }

  function bindNavigation() {
    document.addEventListener("click",(event) => {
      const tab = event.target.closest?.('.app-nav__tab[data-page="' + PAGE_ID + '"]');
      if (tab) {
        event.preventDefault();
        event.stopPropagation();
        activateAssistant(true);
        return;
      }
      const other = event.target.closest?.(".app-nav__tab[data-page]");
      if (other && other.dataset.page !== PAGE_ID) deactivateAssistant();
    },true);
    window.addEventListener("popstate",() => {
      if (location.hash === "#assistente-ia") activateAssistant(false);
    });
  }

  function addAssistantIntro() {
    const host = document.getElementById("aiMessages");
    if (!host || host.children.length) return;
    const message = document.createElement("div");
    message.className = "ai-message ai-message--assistant";
    const bubble = document.createElement("div");
    bubble.className = "ai-message__bubble";
    bubble.textContent = "Pode escrever a consulta em linguagem natural. Eu combino os critérios encontrados na frase, consulto os dados reais e mostro como interpretei a pergunta. Também mantenho o contexto da resposta anterior para perguntas de continuação.";
    const meta = document.createElement("div");
    meta.className = "ai-message__meta";
    meta.textContent = "Assistente local · pronto para perguntas livres";
    message.append(bubble,meta);
    host.appendChild(message);
  }

  function addUserMessage(text) {
    const host = document.getElementById("aiMessages");
    const wrap = document.createElement("div");
    wrap.className = "ai-message ai-message--user";
    const bubble = document.createElement("div");
    bubble.className = "ai-message__bubble";
    bubble.textContent = text;
    const meta = document.createElement("div");
    meta.className = "ai-message__meta";
    meta.textContent = new Intl.DateTimeFormat("pt-BR",{hour:"2-digit",minute:"2-digit"}).format(new Date());
    wrap.append(bubble,meta);
    host.appendChild(wrap);
    scrollMessages();
  }

  function addThinking() {
    const host = document.getElementById("aiMessages");
    const wrap = document.createElement("div");
    wrap.id = "aiThinking";
    wrap.className = "ai-message ai-message--assistant";
    const bubble = document.createElement("div");
    bubble.className = "ai-message__bubble";
    const thinking = document.createElement("div");
    thinking.className = "ai-thinking";
    thinking.innerHTML = '<span></span><span></span><span></span><b>Analisando a pergunta e cruzando os dados…</b>';
    bubble.appendChild(thinking);
    wrap.appendChild(bubble);
    host.appendChild(wrap);
    scrollMessages();
  }

  function removeThinking() {
    document.getElementById("aiThinking")?.remove();
  }

  function scrollMessages() {
    const host = document.getElementById("aiMessages");
    if (host) requestAnimationFrame(() => { host.scrollTop = host.scrollHeight; });
  }

  function formatCell(value,column) {
    if (value == null || value === "") return "—";
    if (column.format === "percent") return new Intl.NumberFormat("pt-BR",{maximumFractionDigits:1}).format(Number(value)||0) + "%";
    if (column.formatField && engine?.formatValue) return engine.formatValue(value,column.formatField);
    if (typeof value === "number") return new Intl.NumberFormat("pt-BR",{maximumFractionDigits:2}).format(value);
    return String(value);
  }

  function resultRows(payload) {
    if (Array.isArray(payload.rows)) return payload.rows;
    if (Array.isArray(payload.result?.rows)) return payload.result.rows;
    return [];
  }

  function renderTrend(parent,trend) {
    if (!Array.isArray(trend) || !trend.length) return;
    const grid = document.createElement("div");
    grid.className = "ai-trend";
    trend.forEach((entry) => {
      const article = document.createElement("article");
      const small = document.createElement("small");
      small.textContent = entry.period || entry.name || "Período";
      const strong = document.createElement("strong");
      strong.textContent = engine.formatValue(entry.balance,"quantity");
      const span = document.createElement("span");
      span.textContent = entry.value ? "Valor: " + engine.formatValue(entry.value,"stockValue") : entry.name || "";
      article.append(small,strong,span);
      grid.appendChild(article);
    });
    parent.appendChild(grid);
  }

  function createResultTable(payload) {
    const rows = resultRows(payload).slice(0,100);
    const columns = Array.isArray(payload.columns) ? payload.columns : [];
    if (!rows.length || !columns.length) return null;
    const wrap = document.createElement("div");
    wrap.className = "ai-table-wrap";
    const table = document.createElement("table");
    table.className = "ai-table";
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    columns.forEach((column) => {
      const th = document.createElement("th");
      th.textContent = column.label || column.key;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    const tbody = document.createElement("tbody");
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      columns.forEach((column) => {
        const td = document.createElement("td");
        const value = row[column.key];
        if (column.key === "itemCode" && value) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "ai-item-link";
          button.textContent = String(value);
          button.title = "Abrir item " + value;
          button.addEventListener("click",() => {
            try {
              if (typeof openItem === "function") openItem(String(value));
            } catch {}
          });
          td.appendChild(button);
        } else {
          td.textContent = formatCell(value,column);
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.append(thead,tbody);
    wrap.appendChild(table);
    return wrap;
  }

  function csvEscape(value) {
    const text = String(value == null ? "" : value);
    return /[;"\r\n]/.test(text) ? '"' + text.replace(/"/g,'""') + '"' : text;
  }

  function downloadResult(payload) {
    const rows = resultRows(payload);
    const columns = Array.isArray(payload.columns) ? payload.columns : [];
    if (!rows.length || !columns.length) return;
    const lines = [columns.map((column) => csvEscape(column.label || column.key)).join(";")];
    rows.forEach((row) => lines.push(columns.map((column) => csvEscape(formatCell(row[column.key],column))).join(";")));
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")],{type:"text/csv;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "consulta-assistente-ia-" + new Date().toISOString().slice(0,10) + ".csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  }

  function addAssistantResult(payload) {
    const host = document.getElementById("aiMessages");
    const wrap = document.createElement("div");
    wrap.className = "ai-message ai-message--assistant";
    const result = document.createElement("div");
    result.className = "ai-result";
    const summary = document.createElement("div");
    summary.className = "ai-result__summary";
    summary.textContent = payload.answer || "Consulta concluída.";
    result.appendChild(summary);

    const filters = payload.meta?.filters || payload.plan?.filters?.map((f) => f.label) || [];
    if (filters.length || payload.meta?.dataset) {
      const chips = document.createElement("div");
      chips.className = "ai-result__chips";
      const datasetChip = document.createElement("span");
      datasetChip.className = "ai-result__chip";
      datasetChip.textContent = "Base: " + (payload.meta?.dataset || payload.plan?.dataset || "dados");
      chips.appendChild(datasetChip);
      filters.forEach((filter) => {
        const chip = document.createElement("span");
        chip.className = "ai-result__chip";
        chip.textContent = filter;
        chips.appendChild(chip);
      });
      if (payload.meta?.usedContext) {
        const chip = document.createElement("span");
        chip.className = "ai-result__chip";
        chip.textContent = "Contexto da resposta anterior";
        chips.appendChild(chip);
      }
      result.appendChild(chips);
    }

    renderTrend(result,payload.meta?.trend || payload.result?.trend);
    const table = createResultTable(payload);
    if (table) {
      const tools = document.createElement("div");
      tools.className = "ai-result__tools";
      const small = document.createElement("small");
      const rows = resultRows(payload);
      small.textContent = rows.length > 100 ? "Tabela mostra os primeiros 100 registros." : rows.length + " registro(s) na tabela.";
      const exportButton = document.createElement("button");
      exportButton.type = "button";
      exportButton.textContent = "Exportar resultado CSV";
      exportButton.addEventListener("click",() => downloadResult(payload));
      tools.append(small,exportButton);
      result.append(tools,table);
    }

    const meta = document.createElement("div");
    meta.className = "ai-message__meta";
    const op = payload.plan?.operation?.op || "consulta";
    meta.textContent = "Interpretado localmente · " + op;
    wrap.append(result,meta);
    host.appendChild(wrap);
    scrollMessages();
    updateStatsFromPayload(payload);
  }

  function addAssistantError(error) {
    const host = document.getElementById("aiMessages");
    const wrap = document.createElement("div");
    wrap.className = "ai-message ai-message--assistant";
    const bubble = document.createElement("div");
    bubble.className = "ai-message__bubble";
    bubble.textContent = "Não consegui concluir esta consulta: " + (error?.message || String(error)) + ".";
    wrap.appendChild(bubble);
    host.appendChild(wrap);
    scrollMessages();
  }

  function parseCsv(text) {
    text = String(text || "").replace(/^\uFEFF/,"");
    if (!text) return [];
    const firstLine = text.split(/\r?\n/,1)[0] || "";
    const delimiter = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ";" : ",";
    const rows = [];
    let row = [], value = "", quoted = false;
    for (let i=0;i<text.length;i+=1) {
      const char = text[i];
      if (quoted) {
        if (char === '"' && text[i+1] === '"') { value += '"'; i += 1; }
        else if (char === '"') quoted = false;
        else value += char;
      } else if (char === '"') quoted = true;
      else if (char === delimiter) { row.push(value); value = ""; }
      else if (char === "\n") {
        row.push(value.replace(/\r$/,"")); value = "";
        if (row.some((cell) => String(cell).trim() !== "")) rows.push(row);
        row = [];
      } else value += char;
    }
    if (value || row.length) { row.push(value); if (row.some((cell) => String(cell).trim() !== "")) rows.push(row); }
    if (!rows.length) return [];
    const headers = rows.shift().map((header,index) => String(header || "Coluna " + (index+1)).trim());
    return rows.map((cells) => {
      const record = {};
      headers.forEach((header,index) => { record[header] = cells[index] == null ? "" : cells[index]; });
      return record;
    });
  }

  async function fetchText(url) {
    const response = await fetch(encodeURI(url),{cache:"no-store"});
    if (!response.ok) throw new Error("Falha ao ler " + url);
    const buffer = await response.arrayBuffer();
    let text = new TextDecoder("utf-8").decode(buffer);
    if (text.includes("�")) {
      try { text = new TextDecoder("windows-1252").decode(buffer); } catch {}
    }
    return text;
  }

  async function manifest() {
    if (!manifestPromise) {
      manifestPromise = fetch("data-manifest.json",{cache:"no-store"}).then((response) => {
        if (!response.ok) throw new Error("Não foi possível consultar o manifesto de dados.");
        return response.json();
      });
    }
    return manifestPromise;
  }

  async function loadManifestEntry(entry,name) {
    const key = name || entry.name;
    if (loadedDatasets.has(key)) return loadedDatasets.get(key);
    const promise = (async () => {
      setIndexStatus("Carregando " + entry.name + "…","loading");
      const text = await fetchText(entry.download_url || entry.path);
      const records = parseCsv(text);
      engine.registerDataset(key,records,{file:entry.name,size:entry.size || 0});
      setIndexStatus("Base auxiliar carregada","ready");
      refreshSources();
      return records.length;
    })().catch((error) => {
      loadedDatasets.delete(key);
      setIndexStatus("Falha em base auxiliar","error");
      throw error;
    });
    loadedDatasets.set(key,promise);
    return promise;
  }

  function requestedMonths(question) {
    const q = normalize(question);
    const aliases = {
      1:["janeiro","jan"],2:["fevereiro","fev"],3:["marco","mar"],4:["abril","abr"],
      5:["maio","mai"],6:["junho","jun"],7:["julho","jul"],8:["agosto","ago"],
      9:["setembro","set"],10:["outubro","out"],11:["novembro","nov"],12:["dezembro","dez"]
    };
    const months = [];
    Object.entries(aliases).forEach(([number,names]) => {
      if (names.some((name) => new RegExp("\\b" + name + "\\b").test(q))) months.push(Number(number));
    });
    return months;
  }

  function isMonthlyQuestion(question) {
    const q = normalize(question);
    return requestedMonths(question).length >= 2 || /\bcompar|evolucao|mes a mes|mensal|periodo\b/.test(q);
  }

  async function ensureAuxiliaryData(question) {
    const q = normalize(question);
    const dataManifest = await manifest();
    const tasks = [];

    if (/sem giro|tempo sem consumo|dias sem consumo|dias sem giro/.test(q)) {
      const entry = dataManifest.find((item) => normalize(item.name).includes("itens_sem_giro") || normalize(item.name).includes("itens sem giro"));
      if (entry) tasks.push(loadManifestEntry(entry,"Itens Sem Giro"));
    }

    if (/\bconsumo\b/.test(q) && !/sem consumo/.test(q)) {
      const state = stateNow();
      if (state?.consumption?.rows?.length && state?.consumption?.headers?.length && !loadedDatasets.has("Consumo")) {
        const records = state.consumption.rows.map((row) => {
          if (!Array.isArray(row)) return row;
          const object = {};
          state.consumption.headers.forEach((header,index) => { object[header] = row[index] == null ? "" : row[index]; });
          return object;
        });
        engine.registerDataset("Consumo",records,{source:"estado da aplicação"});
        loadedDatasets.set("Consumo",Promise.resolve(records.length));
      } else if (!loadedDatasets.has("Consumo")) {
        const entry = dataManifest.find((item) => normalize(item.name) === "03 - consumo.csv");
        if (entry) tasks.push(loadManifestEntry(entry,"Consumo"));
      }
    }

    if (isMonthlyQuestion(question)) {
      const entries = dataManifest.filter((item) => /estoque_/i.test(item.name));
      const months = requestedMonths(question);
      const yearMatches = Array.from(q.matchAll(/\b(20\d{2})\b/g)).map((match) => Number(match[1]));
      let selected = entries;
      if (months.length) {
        selected = entries.filter((entry) => {
          const period = window.AlmoxLocalAI.periodFromName(entry.name);
          return months.includes(period.month) && (!yearMatches.length || yearMatches.includes(period.year));
        });
      } else if (yearMatches.length) {
        selected = entries.filter((entry) => yearMatches.includes(window.AlmoxLocalAI.periodFromName(entry.name).year));
      }
      if (selected.length < 2 && entries.length >= 2) selected = entries;
      selected.forEach((entry) => tasks.push(loadManifestEntry(entry,"monthly:" + entry.name)));
    }

    if (tasks.length) await Promise.all(tasks);
  }

  function setIndexStatus(text,state) {
    const badge = document.getElementById("aiIndexBadge");
    if (!badge) return;
    badge.textContent = text;
    badge.classList.toggle("is-loading",state === "loading");
    badge.classList.toggle("is-error",state === "error");
  }

  function baseStats() {
    const state = stateNow();
    const items = state?.items || [];
    let positions = 0, processes = 0;
    for (const item of items) {
      positions += item.positions?.length || 0;
      processes += item.history?.length || 0;
    }
    return {items:items.length,positions,processes};
  }

  function formatInteger(value) {
    return new Intl.NumberFormat("pt-BR",{maximumFractionDigits:0}).format(Number(value)||0);
  }

  function refreshSources() {
    const host = document.getElementById("aiLoadedSources");
    if (!host || !engine) return;
    host.replaceChildren();
    engine.datasets().forEach((source) => {
      const span = document.createElement("span");
      span.textContent = source.name + " · " + formatInteger(source.count);
      span.title = source.name;
      host.appendChild(span);
    });
    const stat = document.getElementById("aiStatSources");
    if (stat) stat.textContent = formatInteger(engine.datasets().length);
  }

  function updateBaseStats() {
    const stats = baseStats();
    const item = document.getElementById("aiStatItems");
    const process = document.getElementById("aiStatProcesses");
    const position = document.getElementById("aiStatPositions");
    if (item) item.textContent = formatInteger(stats.items);
    if (process) process.textContent = formatInteger(stats.processes);
    if (position) position.textContent = formatInteger(stats.positions);
    refreshSources();
    setIndexStatus(stats.items ? "Pronto para consultar" : "Aguardando base","ready");
  }

  function updateStatsFromPayload(payload) {
    const indexed = payload.meta?.indexed;
    if (!indexed) { updateBaseStats(); return; }
    const item = document.getElementById("aiStatItems");
    const process = document.getElementById("aiStatProcesses");
    const position = document.getElementById("aiStatPositions");
    if (item) item.textContent = formatInteger(new Set(resultRows(payload).map((row) => row.itemCode).filter(Boolean)).size || baseStats().items);
    if (process) process.textContent = formatInteger(indexed.processes);
    if (position) position.textContent = formatInteger(indexed.facts);
    refreshSources();
    setIndexStatus("Índice atualizado","ready");
  }

  function scheduleStats() {
    const callback = () => {
      updateBaseStats();
      addAssistantIntro();
    };
    if ("requestIdleCallback" in window) requestIdleCallback(callback,{timeout:1200});
    else setTimeout(callback,120);
  }

  function setBusy(value) {
    busy = value;
    const send = document.getElementById("aiSend");
    const input = document.getElementById("aiQuestion");
    if (send) send.disabled = value;
    if (input) input.disabled = value;
    if (value) setIndexStatus("Consultando dados…","loading");
  }

  async function ask(question) {
    if (busy || !question.trim()) return;
    addUserMessage(question);
    addThinking();
    setBusy(true);
    try {
      await waitForState();
      await ensureAuxiliaryData(question);
      engine.invalidate();
      await new Promise((resolve) => setTimeout(resolve,0));
      const useFiltered = !!document.getElementById("aiUseCurrentFilters")?.checked;
      const payload = await engine.ask(question,{useFiltered});
      removeThinking();
      addAssistantResult(payload);
      setIndexStatus("Consulta concluída","ready");
    } catch (error) {
      console.error("Assistente IA local:",error);
      removeThinking();
      addAssistantError(error);
      setIndexStatus("Erro na consulta","error");
    } finally {
      setBusy(false);
      const input = document.getElementById("aiQuestion");
      if (input) { input.value = ""; resizeTextarea(input); input.focus(); }
    }
  }

  function resizeTextarea(input) {
    input.style.height = "auto";
    input.style.height = Math.min(150,Math.max(50,input.scrollHeight)) + "px";
  }

  function bindAssistantUi() {
    const form = document.getElementById("aiComposer");
    const input = document.getElementById("aiQuestion");
    form?.addEventListener("submit",(event) => {
      event.preventDefault();
      ask(input?.value || "");
    });
    input?.addEventListener("keydown",(event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        form?.requestSubmit();
      }
    });
    input?.addEventListener("input",() => resizeTextarea(input));
    document.getElementById("aiClearConversation")?.addEventListener("click",() => {
      engine?.reset();
      document.getElementById("aiMessages")?.replaceChildren();
      addAssistantIntro();
    });
  }

  async function install() {
    ensureStyles();
    ensureTab();
    ensurePanel();
    bindNavigation();
    bindAssistantUi();
    await loadScript(ENGINE_SRC);
    engine = window.AlmoxLocalAI.createAssistantEngine({stateProvider:stateNow});
    window.__almoxLocalAssistant = engine;

    window.addEventListener("almoxarifado-csv-updated",() => {
      engine?.invalidate();
      manifestPromise = null;
      setIndexStatus("Dados alterados · índice será renovado","loading");
    });

    const nav = document.querySelector(".app-nav");
    if (nav) new MutationObserver(() => setTimeout(ensureTab,0)).observe(nav,{childList:true});
    [500,1500,3500].forEach((delay) => setTimeout(ensureTab,delay));

    if (location.hash === "#assistente-ia") activateAssistant(false);
    scheduleStats();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",install,{once:true});
  else install();
})();
