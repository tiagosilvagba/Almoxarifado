"use strict";

/** Comparação histórica: só baixa snapshots escolhidos, nunca todo o catálogo de compras. */
(function stockHistoryModule(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root?.document) api.install(root);
})(typeof window !== "undefined" ? window : null, () => {
  const PAGE = "historico-estoque";
  const INDEX = "./data/historico-estoque/index.json";
  const nf = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  const num = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const idCode = (value) => String(value ?? "").trim().replace(/\./g, "");
  const normalBranch = (v) => String(v ?? "").replace(/^0+(?=\d)/, "");
  const keyOf = (row) => [idCode(row[0]), normalBranch(row[2]), normalBranch(row[3]), row[4], row[5], row[6]]
    .map((x) => String(x ?? "").trim()).join("::");
  const signed = (value, formatter = nf) => (value > 0 ? "+" : "") + formatter.format(value);
  const ts = (iso) => new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short",
  }).format(new Date(iso));

  // Apenas a última captura de cada dia (fuso de Brasília) participa da
  // comparação. As versões intermediárias continuam arquivadas no GitHub.
  function latestPerDay(records) {
    const days = new Map();
    for (const entry of records || []) {
      if (!entry || !entry.id || !entry.path || !entry.date || !Number.isFinite(Date.parse(entry.date))) continue;
      const day = /^\d{4}-\d{2}-\d{2}$/.test(entry.localDate || "")
        ? entry.localDate
        : new Intl.DateTimeFormat("sv-SE", {
          timeZone: "America/Sao_Paulo", year:"numeric", month:"2-digit", day:"2-digit",
        }).format(new Date(entry.date));
      const previous = days.get(day);
      if (!previous || entry.date > previous.date || (entry.date === previous.date && entry.id > previous.id)) {
        days.set(day, entry);
      }
    }
    return [...days.values()].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  }

  // Repetições de linhas no CSV são somadas por posição física, jamais duplicadas.
  function aggregate(snapshot) {
    const map = new Map();
    for (const row of snapshot?.rows || []) {
      if (!Array.isArray(row) || !idCode(row[0])) continue;
      const key = keyOf(row);
      let current = map.get(key);
      if (!current) {
        current = {
          key, code: idCode(row[0]), name: String(row[1] || ""), branch: normalBranch(row[2]),
          local: String(row[3] ?? ""), partition: String(row[4] ?? ""),
          division: String(row[5] ?? ""), shelf: String(row[6] ?? ""),
          qty: 0, value: 0, hasValue: false,
        };
        map.set(key, current);
      }
      const qty = num(row[7]);
      current.qty += qty;
      const val = row[9];
      if (val !== null && val !== undefined && Number.isFinite(Number(val))) {
        current.value += Number(val);
        current.hasValue = true;
      }
    }
    return map;
  }

  function compareSnapshots(earlier, later) {
    const before = aggregate(earlier), after = aggregate(later);
    const keys = new Set([...before.keys(), ...after.keys()]);
    const rows = [];
    for (const key of keys) {
      const a = before.get(key), b = after.get(key);
      const item = b || a;
      const startQty = a?.qty || 0, endQty = b?.qty || 0;
      const startValue = a?.value || 0, endValue = b?.value || 0;
      const deltaQty = endQty - startQty, deltaValue = endValue - startValue;
      const status = !a ? "Incluído" : !b ? "Retirado" :
        deltaQty !== 0 || Math.abs(deltaValue) > 0.005 ? "Alterado" : "Sem alteração";
      rows.push({
        ...item, startQty, endQty, deltaQty, startValue, endValue, deltaValue,
        hasValueA: Boolean(a?.hasValue), hasValueB: Boolean(b?.hasValue), status,
      });
    }
    rows.sort((a, b) => Math.abs(b.deltaValue) - Math.abs(a.deltaValue)
      || Math.abs(b.deltaQty) - Math.abs(a.deltaQty)
      || a.code.localeCompare(b.code, "pt-BR", { numeric: true }));
    return rows;
  }

  function summarize(rows) {
    const result = {
      startQty: 0, endQty: 0, startValue: 0, endValue: 0,
      changed: 0, added: 0, removed: 0, unpriced: 0,
      distinctCodes: new Set(),
    };
    for (const row of rows) {
      result.startQty += row.startQty;
      result.endQty += row.endQty;
      result.startValue += row.startValue;
      result.endValue += row.endValue;
      if (row.status !== "Sem alteração") result.changed++;
      if (row.status === "Incluído") result.added++;
      if (row.status === "Retirado") result.removed++;
      if (!row.hasValueA || !row.hasValueB) result.unpriced++;
      result.distinctCodes.add(row.code);
    }
    result.distinctCodes = result.distinctCodes.size;
    return result;
  }

  function install(win) {
    if (win.__almoxStockHistoryInstalled) return;
    win.__almoxStockHistoryInstalled = true;
    const doc = win.document;
    const $ = (id) => doc.getElementById(id);
    const status = (message) => { if ($("shStatus")) $("shStatus").textContent = message; };
    const current = () => doc.documentElement.dataset.activePage === PAGE
      || (!doc.documentElement.dataset.activePage && win.location.hash === "#" + PAGE);
    let entries = [], indexPromise = null, selectedRows = [], filteredRows = [], rendered = 0;
    let loaded = false, token = 0, latestInfo = "";
    const cache = new Map();

    async function getIndex() {
      const response = await win.fetch(INDEX, { cache: "no-store" });
      if (response.status === 404) return { entries: [] };
      if (!response.ok) throw new Error("Falha ao consultar o índice de históricos.");
      return response.json();
    }

    async function getSnapshot(entry) {
      if (cache.has(entry.id)) return cache.get(entry.id);
      if (!/^data\/historico-estoque\/[A-Za-z0-9T._-]+\.json\.gz$/.test(entry.path)) {
        throw new Error("Caminho histórico inválido.");
      }
      const response = await win.fetch("./" + entry.path, { cache: "force-cache" });
      if (!response.ok) throw new Error("Arquivo histórico não disponível: " + entry.id);
      if (typeof win.DecompressionStream !== "function") {
        throw new Error("Este navegador não suporta a leitura compactada do histórico. Atualize o navegador.");
      }
      const stream = response.body.pipeThrough(new win.DecompressionStream("gzip"));
      const data = JSON.parse(await new win.Response(stream).text());
      if (data.schema !== 1 || !Array.isArray(data.rows) || data.sourceDigest !== entry.sourceDigest) {
        throw new Error("Snapshot histórico incompatível ou inconsistente.");
      }
      cache.set(entry.id, data);
      while (cache.size > 2) cache.delete(cache.keys().next().value);
      return data;
    }

    function setOptions() {
      const a = $("shStart"), b = $("shEnd");
      if (!a || !b) return;
      const oldA = a.value, oldB = b.value;
      const fragmentA = doc.createDocumentFragment(), fragmentB = doc.createDocumentFragment();
      for (const entry of entries) {
        const text = ts(entry.date) + " · " + nf.format(entry.positions) + " posições";
        fragmentA.append(new Option(text, entry.id));
        fragmentB.append(new Option(text, entry.id));
      }
      a.replaceChildren(fragmentA); b.replaceChildren(fragmentB);
      if (entries.some((x) => x.id === oldA)) a.value = oldA;
      else a.value = entries[0]?.id || "";
      if (entries.some((x) => x.id === oldB)) b.value = oldB;
      else b.value = entries[entries.length - 1]?.id || "";
      a.disabled = b.disabled = entries.length < 2;
    }

    function renderKpis(rows) {
      const sums = summarize(rows);
      const cards = [
        ["Quantidade inicial", nf.format(sums.startQty)],
        ["Quantidade final", nf.format(sums.endQty)],
        ["Variação de quantidade", signed(sums.endQty - sums.startQty)],
        ["Valor inicial conhecido", money.format(sums.startValue)],
        ["Valor final conhecido", money.format(sums.endValue)],
        ["Variação de valor conhecido", signed(sums.endValue - sums.startValue, money)],
        ["Posições com mudança", nf.format(sums.changed)],
        ["Posições incluídas / retiradas", sums.added + " / " + sums.removed],
      ];
      const host = $("shKpis");
      if (host) host.innerHTML = cards.map(([label,value]) =>
        '<div class="sh-kpi"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong></div>').join("");
      if ($("shNote")) $("shNote").textContent = sums.unpriced
        ? nf.format(sums.unpriced) + " posições com valor ausente em uma das datas. Os valores monetários são parciais."
        : "Valores baseados no custo/valor cadastrado em cada captura. A variação inclui efeitos de quantidade e custo.";
    }

    function draw() {
      const visible = filteredRows.slice(0, rendered);
      const body = $("shBody");
      if (body) body.innerHTML = visible.map((r) => '<tr>'
        + '<td><strong>' + esc(r.code) + '</strong><small>' + esc(r.name) + '</small></td>'
        + '<td>' + esc(r.branch) + '</td>'
        + '<td>' + esc(r.local) + (r.partition ? " · " + esc(r.partition) : "") + '</td>'
        + '<td class="num">' + nf.format(r.startQty) + '</td>'
        + '<td class="num">' + nf.format(r.endQty) + '</td>'
        + '<td class="num">' + signed(r.deltaQty) + '</td>'
        + '<td class="num">' + esc(signed(r.deltaValue, money)) + '</td>'
        + '<td>' + esc(r.status) + '</td></tr>').join("");
      if ($("shCount")) $("shCount").textContent = nf.format(visible.length) + " de "
        + nf.format(filteredRows.length) + " posições com mudança";
      if ($("shMore")) $("shMore").hidden = rendered >= filteredRows.length;
      if ($("shExport")) $("shExport").disabled = !filteredRows.length;
    }

    function applyFilters() {
      const query = idCode($("shSearch")?.value || "").toLocaleLowerCase("pt-BR");
      const branch = $("shBranch")?.value || "";
      const local = $("shLocal")?.value || "";
      const mode = $("shMode")?.value || "changed";
      filteredRows = selectedRows.filter((r) =>
        (!branch || r.branch === branch)
        && (!local || r.local === local)
        && (mode === "all" || r.status !== "Sem alteração")
        && (!query || [r.code, r.name, r.branch, r.local].join(" ")
          .toLocaleLowerCase("pt-BR").includes(query)));
      renderKpis(selectedRows.filter((r) =>
        (!branch || r.branch === branch) && (!local || r.local === local)
        && (!query || [r.code, r.name, r.branch, r.local].join(" ")
          .toLocaleLowerCase("pt-BR").includes(query))));
      rendered = Math.min(40, filteredRows.length);
      draw();
      status(latestInfo + " · " + nf.format(filteredRows.length) + " posições exibíveis");
    }

    function fillFilter(id, values, allLabel) {
      const el = $(id);
      if (!el) return;
      const previous = el.value;
      el.replaceChildren(new Option(allLabel, ""),
        ...values.map((value) => new Option(value, value)));
      if (values.includes(previous)) el.value = previous;
    }

    async function compare() {
      const idA = $("shStart")?.value, idB = $("shEnd")?.value;
      const a = entries.find((x) => x.id === idA), b = entries.find((x) => x.id === idB);
      if (!a || !b) return;
      if (a.date >= b.date) {
        token++;
        selectedRows = [];
        filteredRows = [];
        if ($("shBody")) $("shBody").replaceChildren();
        if ($("shKpis")) $("shKpis").replaceChildren();
        if ($("shExport")) $("shExport").disabled = true;
        if ($("shCount")) $("shCount").textContent = "";
        status("Selecione primeiro a data mais antiga, depois a mais recente.");
        return;
      }
      const myToken = ++token;
      status("Carregando apenas as duas posições históricas selecionadas…");
      try {
        const [start, end] = await Promise.all([getSnapshot(a), getSnapshot(b)]);
        if (myToken !== token) return;
        selectedRows = compareSnapshots(start, end);
        latestInfo = ts(a.date) + " → " + ts(b.date);
        const branches = [...new Set(selectedRows.map((r) => r.branch))].filter(Boolean).sort();
        const locals = [...new Set(selectedRows.map((r) => r.local))].filter(Boolean)
          .sort((x, y) => x.localeCompare(y, "pt-BR", { numeric: true }));
        fillFilter("shBranch", branches, "Todas as filiais");
        fillFilter("shLocal", locals, "Todos os locais");
        applyFilters();
      } catch (error) {
        if (myToken !== token) return;
        status("Erro ao comparar: " + (error?.message || String(error)));
      }
    }

    async function loadIndex() {
      if (indexPromise) return indexPromise;
      indexPromise = (async () => {
        status("Consultando as últimas posições diárias do Saldo Online…");
        const index = await getIndex();
        entries = latestPerDay(Array.isArray(index.entries) ? index.entries : []);
        selectedRows = []; filteredRows = []; rendered = 0;
        if ($("shBody")) $("shBody").replaceChildren();
        if ($("shKpis")) $("shKpis").replaceChildren();
        if ($("shCount")) $("shCount").textContent = "";
        if ($("shExport")) $("shExport").disabled = true;
        setOptions();
        loaded = true;
        if (!entries.length) {
          status("Ainda não há posições. O histórico começa na próxima atualização do Saldo Online.");
        } else if (entries.length === 1) {
          const first = entries[0];
          status("1 dia registrado: " + ts(first.date) + ". A comparação ficará disponível após uma atualização do Saldo Online em outro dia.");
          if ($("shKpis")) $("shKpis").innerHTML = [
            ["Itens", first.items], ["Posições", first.positions],
            ["Quantidade", nf.format(first.quantity)], ["Valor conhecido", money.format(first.value)],
          ].map(([k, v]) => '<div class="sh-kpi"><span>' + esc(k)
            + '</span><strong>' + esc(v) + '</strong></div>').join("");
        } else {
          await compare();
        }
      })().catch((error) => {
        indexPromise = null;
        status("Não foi possível consultar o histórico: " + (error?.message || String(error)));
      });
      return indexPromise;
    }

    function exportCsv() {
      if (!filteredRows.length) return;
      const cells = [
        ["Data inicial", $("shStart")?.selectedOptions[0]?.textContent || ""],
        ["Data final", $("shEnd")?.selectedOptions[0]?.textContent || ""],
        [],
        ["Código","Item","Filial","Local","Repartição","Divisão","Prateleira","Saldo inicial",
          "Saldo final","Variação","Valor inicial","Valor final","Variação R$","Situação"],
        ...filteredRows.map((r) => [r.code, r.name, r.branch, r.local, r.partition, r.division, r.shelf,
          r.startQty, r.endQty, r.deltaQty, r.startValue, r.endValue, r.deltaValue, r.status]),
      ];
      const escapeCell = (value) => '"' + String(value ?? "").replace(/"/g, '""') + '"';
      const csv = "\uFEFF" + cells.map((line) => line.map(escapeCell).join(";")).join("\r\n");
      const url = win.URL.createObjectURL(new win.Blob([csv], { type: "text/csv;charset=utf-8;" }));
      const link = doc.createElement("a");
      link.href = url;
      link.download = "comparativo-historico-estoque.csv";
      link.click();
      win.setTimeout(() => win.URL.revokeObjectURL(url), 2000);
    }

    function open() {
      if (!current() || !$("page-" + PAGE)) return;
      if (!loaded) loadIndex();
    }
    function init() {
      if (!$("page-" + PAGE)) return;
      $("shStart")?.addEventListener("change", compare);
      $("shEnd")?.addEventListener("change", compare);
      ["shBranch","shLocal","shMode"].forEach((id) => $(id)?.addEventListener("change", applyFilters));
      $("shSearch")?.addEventListener("input", applyFilters);
      $("shMore")?.addEventListener("click", () => {
        rendered = Math.min(rendered + 40, filteredRows.length);
        draw();
      });
      $("shExport")?.addEventListener("click", exportCsv);
      $("shReload")?.addEventListener("click", () => {
        loaded = false; indexPromise = null; entries = []; cache.clear();
        loadIndex();
      });
      win.addEventListener("hashchange", open);
      win.addEventListener("popstate", open);
      if (typeof win.MutationObserver === "function") {
        new win.MutationObserver(open).observe(doc.documentElement, {
          attributes: true, attributeFilter: ["data-active-page"],
        });
      }
      doc.querySelector('.app-nav__tab[data-page="' + PAGE + '"]')
        ?.addEventListener("click", () => win.setTimeout(open, 50));
      open();
    }
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
  }

  return { aggregate, compareSnapshots, summarize, latestPerDay, install };
});