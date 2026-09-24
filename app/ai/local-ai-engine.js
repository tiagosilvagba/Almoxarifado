(function (root, factory) {
  "use strict";
  const api = factory();
  root.AlmoxLocalAI = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  "use strict";

  const DAY_MS = 86400000;
  const STOPWORDS = new Set([
    "a","o","as","os","um","uma","uns","umas","de","do","da","dos","das","em","no","na","nos","nas",
    "para","por","com","sem","e","ou","que","qual","quais","quanto","quantos","quantas","como","onde",
    "me","mostre","mostrar","liste","listar","quero","gostaria","preciso","tem","tenho","ha","existe",
    "existem","ser","sao","esta","estao","foi","foram","mais","menos","maior","menor","melhor","pior",
    "agora","depois","desses","destes","dessas","destas","somente","apenas","so","tambem","ainda",
    "meu","minha","meus","minhas","esse","essa","esses","essas","isso","isto","aquele","aquela",
    "dados","informacao","informacoes","projeto","sistema","base","bases","resultado","resultados"
  ]);

  const FIELD_DEFS = Object.freeze([
    { key:"quantity", type:"number", label:"saldo", aliases:["saldo","saldo atual","quantidade estoque","quantidade em estoque","qt saldo"] },
    { key:"stockValue", type:"currency", label:"valor de estoque", aliases:["valor estoque","valor de estoque","valor saldo","valor do saldo","estoque em reais"] },
    { key:"minimum", type:"number", label:"mínimo", aliases:["minimo","min cadastrado","estoque minimo"] },
    { key:"maximum", type:"number", label:"máximo", aliases:["maximo","max cadastrado","estoque maximo"] },
    { key:"unitCost", type:"currency", label:"custo unitário", aliases:["custo unitario","preco unitario","valor unitario"] },
    { key:"consumptionAverage", type:"number", label:"consumo médio", aliases:["consumo medio","media de consumo","consumo mensal","consumo"] },
    { key:"needQty", type:"number", label:"necessidade de compra", aliases:["necessidade","necessidade compra","compra liquida","quantidade comprar","reposicao"] },
    { key:"needValue", type:"currency", label:"valor de reposição", aliases:["valor reposicao","valor de reposicao","valor necessidade","valor da compra","custo compra","custo reposicao"] },
    { key:"coverageQty", type:"number", label:"cobertura", aliases:["cobertura","quantidade coberta","coberto por"] },
    { key:"openOfBalance", type:"number", label:"saldo de OF", aliases:["saldo of","saldo de of","of pendente","quantidade pendente"] },
    { key:"pendingValue", type:"currency", label:"valor pendente", aliases:["valor pendente","valor em aberto","valor of","valor da of"] },
    { key:"leadTimeDays", type:"days", label:"lead time", aliases:["lead time","tempo reposicao","tempo de reposicao"] },
    { key:"scToOfDays", type:"days", label:"SC → OF", aliases:["sc para of","sc ate of","sc of","tempo sc of"] },
    { key:"ofToReceiptDays", type:"days", label:"OF → recebimento", aliases:["of para recebimento","of ate recebimento","of recebimento","tempo of recebimento"] },
    { key:"totalLeadDays", type:"days", label:"SC → recebimento", aliases:["sc para recebimento","sc ate recebimento","tempo total compra"] },
    { key:"ageScDays", type:"days", label:"idade da SC", aliases:["idade sc","dias sc","sc ha","tempo sc"] },
    { key:"delayDays", type:"days", label:"atraso", aliases:["atraso","dias atraso","atrasada ha","atrasado ha"] },
    { key:"noTurnDays", type:"days", label:"tempo sem consumo", aliases:["tempo sem consumo","dias sem consumo","tempo sem giro","dias sem giro"] },
    { key:"requestedQty", type:"number", label:"quantidade solicitada", aliases:["quantidade solicitada","qtd solicitada","pedido"] },
    { key:"deliveredQty", type:"number", label:"quantidade entregue", aliases:["quantidade entregue","qtd entregue","entregue"] },
    { key:"ofBalance", type:"number", label:"saldo da OF", aliases:["saldo da of","saldo of","saldo ordem"] },
    { key:"reviewLeadTime", type:"days", label:"lead time da revisão", aliases:["lead time revisao","lead time da revisao"] },
    { key:"suggestedMinimum", type:"number", label:"mínimo sugerido", aliases:["minimo sugerido","novo minimo"] },
    { key:"suggestedMaximum", type:"number", label:"máximo sugerido", aliases:["maximo sugerido","novo maximo"] }
  ]);

  const GROUP_FIELDS = Object.freeze([
    { key:"supplier", aliases:["fornecedor","fornecedores"] },
    { key:"responsible", aliases:["responsavel","repositor","reposicao"] },
    { key:"requester", aliases:["solicitante","usuario solicitante","requisitante"] },
    { key:"branchName", aliases:["filial","empresa"] },
    { key:"localName", aliases:["local","almoxarifado"] },
    { key:"category", aliases:["categoria","grupo","subgrupo"] },
    { key:"processStatus", aliases:["status","situacao"] },
    { key:"itemName", aliases:["item","material","produto"] },
    { key:"area", aliases:["area"] },
    { key:"ccu", aliases:["ccu","centro de custo"] }
  ]);

  const MONTHS = Object.freeze({
    janeiro:1, jan:1, fevereiro:2, fev:2, marco:3, mar:3, abril:4, abr:4,
    maio:5, mai:5, junho:6, jun:6, julho:7, jul:7, agosto:8, ago:8,
    setembro:9, set:9, outubro:10, out:10, novembro:11, nov:11, dezembro:12, dez:12
  });

  function normalizeText(value) {
    return String(value == null ? "" : value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/r\$/g, " r$ ")
      .replace(/[^\p{L}\p{N}%><=+\-.,/]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokenize(value) {
    return normalizeText(value).split(" ").filter(Boolean);
  }

  function usefulTokens(value) {
    return tokenize(value).filter(function (token) {
      return token.length >= 3 && !STOPWORDS.has(token) && !/^\d+$/.test(token);
    });
  }

  function unique(values) {
    return Array.from(new Set((values || []).filter(function (v) { return v !== "" && v != null; })));
  }

  function toNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    let text = String(value == null ? "" : value).trim();
    if (!text) return 0;
    text = text.replace(/\s/g, "").replace(/R\$/gi, "");
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(text)) text = text.replace(/\./g, "").replace(",", ".");
    else if (/^-?\d+(,\d+)$/.test(text)) text = text.replace(",", ".");
    else if ((text.match(/\./g) || []).length > 1 && !text.includes(",")) text = text.replace(/\./g, "");
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function parseHumanNumber(value) {
    const text = normalizeText(value);
    const match = text.match(/-?\d[\d.,]*/);
    if (!match) return null;
    let number = toNumber(match[0]);
    if (/\bmilhoes?\b|\bmilhao\b/.test(text)) number *= 1000000;
    else if (/\bmil\b/.test(text)) number *= 1000;
    return number;
  }

  function parseDate(value) {
    if (!value) return 0;
    if (typeof value === "number" && value > 20000 && value < 100000) return Date.UTC(1899, 11, 30) + value * DAY_MS;
    const text = String(value).trim();
    if (/^\d{5}(?:\.\d+)?$/.test(text)) return Date.UTC(1899, 11, 30) + Number(text) * DAY_MS;
    let match = text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
    if (match) {
      const year = Number(match[3].length === 2 ? "20" + match[3] : match[3]);
      return Date.UTC(year, Number(match[2]) - 1, Number(match[1]));
    }
    match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (match) return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function daysBetween(a, b) {
    const start = parseDate(a);
    const end = parseDate(b);
    if (!start || !end || end < start) return null;
    return Math.round((end - start) / DAY_MS);
  }

  function ageDays(value) {
    const ts = parseDate(value);
    return ts ? Math.max(0, Math.floor((Date.now() - ts) / DAY_MS)) : null;
  }

  function median(values) {
    const arr = (values || []).map(Number).filter(Number.isFinite).sort(function (a,b) { return a-b; });
    if (!arr.length) return null;
    const mid = Math.floor(arr.length / 2);
    return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
  }

  function mean(values) {
    const arr = (values || []).map(Number).filter(Number.isFinite);
    return arr.length ? arr.reduce(function (sum, value) { return sum + value; }, 0) / arr.length : 0;
  }

  function truthyFlag(value) {
    const text = normalizeText(value);
    return ["s","sim","yes","y","true","1","fechada","fechado","closed"].includes(text);
  }

  function firstValue(row, aliases) {
    if (!row || typeof row !== "object") return "";
    const keys = Object.keys(row);
    const normalized = new Map(keys.map(function (key) { return [normalizeText(key), key]; }));
    for (const alias of aliases) {
      const exact = normalized.get(normalizeText(alias));
      if (exact != null) return row[exact];
    }
    for (const alias of aliases) {
      const needle = normalizeText(alias);
      const found = keys.find(function (key) { return normalizeText(key).includes(needle); });
      if (found != null) return row[found];
    }
    return "";
  }

  function canonicalizeRawRecord(raw, datasetName) {
    const record = {
      _dataset: datasetName || "raw",
      _raw: raw,
      itemCode: String(firstValue(raw, ["CD Item","Código Item","Codigo Item","Item Code","Produto","CD Produto"]) || "").trim(),
      itemName: String(firstValue(raw, ["Item","NM Item","Nome Item","Produto","NM Produto","Descrição","Descricao"]) || "").trim(),
      branchCode: String(firstValue(raw, ["CD Filial","Filial","Código Filial","Codigo Filial"]) || "").trim(),
      branchName: String(firstValue(raw, ["Nome Filial","NM Filial","Nome da Filial"]) || "").trim(),
      localCode: String(firstValue(raw, ["CD Local Estoque","CD Local","Local de estoque","Local Estoque"]) || "").trim(),
      localName: String(firstValue(raw, ["DS Local Estoque","Nome Local","NM Local","Nome local de estoque"]) || "").trim(),
      responsible: String(firstValue(raw, ["NOME REPOSITOR","Nome Repositor","Responsável","Responsavel"]) || "").trim(),
      area: String(firstValue(raw, ["Área","Area"]) || "").trim(),
      supplier: String(firstValue(raw, ["Fornecedor","NM Fornecedor","Nome Fornecedor"]) || "").trim(),
      requester: String(firstValue(raw, ["Solicitante","Usuário Solicitante","Usuario Solicitante","Requisitante"]) || "").trim(),
      category: String(firstValue(raw, ["Categoria","Subgrupo Resumido","Subgrupo","Grupo"]) || "").trim(),
      status: String(firstValue(raw, ["Status","Situação","Situacao"]) || "").trim(),
      quantity: toNumber(firstValue(raw, ["QT Saldo Atual","Saldo Real","Saldo Atual","Quantidade Saldo","Saldo"])),
      balance: toNumber(firstValue(raw, ["Saldo Real","QT Saldo Atual","Saldo Atual","Saldo"])),
      stockValue: toNumber(firstValue(raw, ["Valor Saldo Atual","Valor Estoque","VL Saldo","Valor do Saldo"])),
      consumption: toNumber(firstValue(raw, ["Consumo real","Consumo Real","Consumo","QT Consumo","Quantidade Consumo"])),
      noTurnDays: toNumber(firstValue(raw, ["Tempo Sem Consumo","Dias Sem Consumo","Tempo sem giro"])),
      unitCost: toNumber(firstValue(raw, ["Valor Unitário","Valor Unitario","Custo Unitário","Custo Unitario"])),
      date: firstValue(raw, ["Data","Data Movimento","Data Referência","Data Referencia"])
    };
    record._searchText = normalizeText(Object.values(raw || {}).join(" "));
    return record;
  }

  function periodFromName(name) {
    const text = normalizeText(name);
    let month = 0;
    Object.keys(MONTHS).some(function (key) {
      if (text.includes(key)) { month = MONTHS[key]; return true; }
      return false;
    });
    const yearMatch = text.match(/\b(20\d{2})\b/);
    return { month:month, year:yearMatch ? Number(yearMatch[1]) : 0, key:(yearMatch ? yearMatch[1] : "0000") + "-" + String(month).padStart(2,"0") };
  }

  function positionKey(itemCode, branchCode, localCode) {
    return [itemCode || "", branchCode || "", localCode || ""].join("::");
  }

  function branchKey(itemCode, branchCode) {
    return [itemCode || "", branchCode || ""].join("::");
  }

  function isClosedOf(of) {
    if (!of) return false;
    if (truthyFlag(of.closed)) return true;
    return /\bfechad|\bclosed|\bcancelad/.test(normalizeText(of.status));
  }

  function processState(record) {
    const sc = record && record.sc;
    const of = record && record.of;
    const rec = record && record.rec;
    if (!sc && !of && !rec) return "";
    const requested = toNumber(of && (of.requestedQuantity != null ? of.requestedQuantity : of.quantity));
    const delivered = toNumber(of && of.deliveredQuantity);
    const balance = Math.max(0, toNumber(of && of.balance), requested > 0 ? requested - delivered : 0);
    const open = !!(of && of.code && !isClosedOf(of) && balance > 0);
    const due = parseDate(of && of.deliveryDate ? of.deliveryDate : sc && sc.deliveryDate);
    if ((open || (sc && sc.code && !(of && of.code))) && due && due < Date.now() - DAY_MS) return "atrasada";
    if (sc && sc.code && !(of && of.code)) return "aguardando OF";
    if (open && delivered > 0) return "parcial";
    if (open) return "aguardando entrega";
    if (rec && rec.invoice) return "recebida";
    if (of && of.code && isClosedOf(of)) return "fechada";
    if (of && of.code) return "OF emitida";
    return "SC aberta";
  }

  function processRow(item, record) {
    const sc = record && record.sc || {};
    const of = record && record.of || {};
    const rec = record && record.rec || {};
    const requested = toNumber(of.requestedQuantity != null ? of.requestedQuantity : of.quantity);
    const delivered = toNumber(of.deliveredQuantity);
    const balance = Math.max(0, toNumber(of.balance), requested > 0 ? requested - delivered : 0);
    const unitValue = toNumber(of.unitValue || rec.unitValue);
    const status = processState(record);
    const dueTs = parseDate(of.deliveryDate || sc.deliveryDate);
    const delay = dueTs && /atrasada/.test(normalizeText(status)) ? Math.max(0, Math.floor((Date.now() - dueTs) / DAY_MS)) : 0;
    const ccu = String(sc.allocationCostCenter || sc.costCenter || "").trim();
    const row = {
      _dataset:"processos",
      itemCode:String(item.code || ""),
      itemName:String(item.name || item.detailedName || ""),
      branchCode:String(record.branchCode || sc.branchCode || rec.branchCode || ""),
      branchName:String(record.branch || sc.branchName || rec.branchName || ""),
      scCode:String(sc.code || ""),
      scStatus:String(sc.status || ""),
      scDate:sc.date || "",
      scDeliveryDate:sc.deliveryDate || "",
      requester:String(sc.requesterName || ""),
      ccu:ccu,
      directPurchase:!!(sc.code && ccu && ccu !== "1500"),
      ofCode:String(of.code || ""),
      ofStatus:String(of.status || ""),
      ofDate:of.date || "",
      ofDeliveryDate:of.deliveryDate || "",
      supplier:String(of.supplier || rec.supplier || ""),
      supplierCode:String(of.supplierCode || rec.supplierCode || ""),
      supplierEmail:String(of.supplierEmail || ""),
      requestedQty:requested,
      deliveredQty:delivered,
      ofBalance:balance,
      openOfBalance:balance,
      unitCost:unitValue,
      pendingValue:balance * unitValue,
      recInvoice:String(rec.invoice || ""),
      recDate:rec.entryDate || rec.issueDate || "",
      processStatus:status,
      scToOfDays:daysBetween(sc.date, of.date),
      ofToReceiptDays:daysBetween(of.date, rec.entryDate || rec.issueDate),
      totalLeadDays:daysBetween(sc.date, rec.entryDate || rec.issueDate),
      ageScDays:ageDays(sc.date),
      delayDays:delay
    };
    row._searchText = normalizeText([
      row.itemCode,row.itemName,row.branchCode,row.branchName,row.scCode,row.scStatus,row.requester,row.ccu,
      row.ofCode,row.ofStatus,row.supplier,row.supplierCode,row.supplierEmail,row.recInvoice,row.processStatus
    ].join(" "));
    return row;
  }

  function makeProcessAggregate() {
    return {
      scCodes:new Set(), ofCodes:new Set(), recCodes:new Set(), suppliers:new Set(), requesters:new Set(),
      statuses:new Set(), scToOf:[], ofToReceipt:[], totals:[],
      openScCodes:new Set(), openOfCodes:new Set(), overdueCodes:new Set(), partialCodes:new Set(), directScCodes:new Set(),
      openScAges:[], openOfAmounts:new Map()
    };
  }

  function addProcessAggregate(agg, row) {
    if (row.scCode) agg.scCodes.add(row.scCode);
    if (row.ofCode) agg.ofCodes.add(row.ofCode);
    if (row.recInvoice) agg.recCodes.add(row.recInvoice);
    if (row.supplier) agg.suppliers.add(row.supplier);
    if (row.requester) agg.requesters.add(row.requester);
    if (row.processStatus) agg.statuses.add(row.processStatus);
    if (Number.isFinite(row.scToOfDays)) agg.scToOf.push(row.scToOfDays);
    if (Number.isFinite(row.ofToReceiptDays)) agg.ofToReceipt.push(row.ofToReceiptDays);
    if (Number.isFinite(row.totalLeadDays)) agg.totals.push(row.totalLeadDays);
    if (row.scCode && !row.ofCode) {
      agg.openScCodes.add(row.scCode);
      if (Number.isFinite(row.ageScDays)) agg.openScAges.push(row.ageScDays);
    }
    if (row.ofCode && row.ofBalance > 0 && row.processStatus !== "fechada") {
      agg.openOfCodes.add(row.ofCode);
      const previous = agg.openOfAmounts.get(row.ofCode) || {balance:0,value:0};
      previous.balance = Math.max(previous.balance,Number(row.openOfBalance)||0);
      previous.value = Math.max(previous.value,Number(row.pendingValue)||0);
      agg.openOfAmounts.set(row.ofCode,previous);
    }
    if (normalizeText(row.processStatus).includes("atrasada")) agg.overdueCodes.add(row.ofCode || row.scCode || row.itemCode);
    if (normalizeText(row.processStatus).includes("parcial")) agg.partialCodes.add(row.ofCode || row.scCode || row.itemCode);
    if (row.directPurchase) agg.directScCodes.add(row.scCode || row.itemCode);
  }

  function finalizeProcessAggregate(agg) {
    if (!agg) return null;
    const amounts = Array.from(agg.openOfAmounts.values());
    return {
      scCodes:Array.from(agg.scCodes), ofCodes:Array.from(agg.ofCodes), recCodes:Array.from(agg.recCodes),
      suppliers:Array.from(agg.suppliers), requesters:Array.from(agg.requesters), statuses:Array.from(agg.statuses),
      scCount:agg.scCodes.size, ofCount:agg.ofCodes.size, recCount:agg.recCodes.size,
      openScCount:agg.openScCodes.size, openOfCount:agg.openOfCodes.size, overdueCount:agg.overdueCodes.size,
      partialCount:agg.partialCodes.size, directPurchaseCount:agg.directScCodes.size,
      openOfBalance:amounts.reduce(function(sum,value){return sum+value.balance;},0),
      pendingValue:amounts.reduce(function(sum,value){return sum+value.value;},0),
      ageScDays:agg.openScAges.length ? Math.max.apply(null,agg.openScAges) : null,
      scToOfDays:median(agg.scToOf), ofToReceiptDays:median(agg.ofToReceipt), totalLeadDays:median(agg.totals)
    };
  }

  function createAssistantEngine(options) {
    options = options || {};
    let stateProvider = typeof options.stateProvider === "function" ? options.stateProvider : function () { return null; };
    const registered = new Map();
    let cacheSignature = "";
    let cache = null;
    const session = { lastItemCodes:[], lastDataset:"", lastQuestion:"", lastPlan:null, lastResult:null };

    function setStateProvider(provider) {
      if (typeof provider === "function") stateProvider = provider;
      invalidate();
    }

    function invalidate() {
      cacheSignature = "";
      cache = null;
    }

    function registerDataset(name, rows, meta) {
      const canonical = (rows || []).map(function (row) {
        return row && row._raw ? row : canonicalizeRawRecord(row, name);
      });
      registered.set(name, { name:name, rows:canonical, meta:meta || {} });
      invalidate();
      return canonical.length;
    }

    function removeDataset(name) {
      registered.delete(name);
      invalidate();
    }

    function datasets() {
      return Array.from(registered.values()).map(function (entry) {
        return { name:entry.name, count:entry.rows.length, meta:entry.meta };
      });
    }

    function signatureFor(state) {
      if (!state) return "empty";
      const items = state.items || [];
      return [items.length, state.purchaseNeeds && state.purchaseNeeds.length || 0, state.minMaxReviews && state.minMaxReviews.length || 0, registered.size].join(":");
    }

    function buildModel() {
      const state = stateProvider() || {};
      const sig = signatureFor(state);
      if (cache && cacheSignature === sig) return cache;

      const items = state.items || [];
      const needs = state.purchaseNeeds || [];
      const reviews = state.minMaxReviews || [];
      const processes = [];
      const processAgg = new Map();

      for (const item of items) {
        for (const record of item.history || []) {
          const row = processRow(item, record);
          processes.push(row);
          const key = branchKey(row.itemCode, row.branchCode);
          let agg = processAgg.get(key);
          if (!agg) { agg = makeProcessAggregate(); processAgg.set(key, agg); }
          addProcessAggregate(agg, row);
          const allKey = branchKey(row.itemCode, "");
          let all = processAgg.get(allKey);
          if (!all) { all = makeProcessAggregate(); processAgg.set(allKey, all); }
          addProcessAggregate(all, row);
        }
      }

      const needByPosition = new Map();
      const needByBranch = new Map();
      for (const need of needs) {
        const item = need.item || {};
        const position = need.position || {};
        const row = {
          _dataset:"necessidades",
          itemCode:String(item.code || ""),
          itemName:String(item.name || ""),
          branchCode:String(position.branchCode || ""),
          branchName:String(position.branchName || ""),
          localCode:String(position.localCode || ""),
          localName:String(position.localName || ""),
          responsible:(position.replenishmentResponsibles || []).join(" | "),
          area:(position.responsibleAreas || []).join(" | "),
          quantity:toNumber(position.quantity),
          minimum:toNumber(position.minimum),
          maximum:toNumber(position.maximum),
          consumptionAverage:toNumber(need.averageMonthlyConsumption),
          needQty:toNumber(need.netSuggested),
          needValue:toNumber(need.estimatedValue),
          coverageQty:toNumber(need.coveredQuantity),
          coverageSource:String(need.coverageSource || ""),
          rupture:!!need.rupture,
          cavacoAlert:!!need.cavacoAlert,
          scCodes:(need.scCodes || []).join(" | "),
          ofCodes:(need.ofCodes || []).join(" | ")
        };
        row._searchText = normalizeText(Object.values(row).join(" "));
        needByPosition.set(positionKey(row.itemCode,row.branchCode,row.localCode), row);
        const bKey = branchKey(row.itemCode,row.branchCode);
        if (!needByBranch.has(bKey) || row.needQty > (needByBranch.get(bKey).needQty || 0)) needByBranch.set(bKey,row);
      }

      const reviewByPosition = new Map();
      const reviewByBranch = new Map();
      const reviewRows = [];
      for (const review of reviews) {
        const item = review.item || {};
        const position = review.position || {};
        const row = {
          _dataset:"revisoes",
          itemCode:String(item.code || ""),
          itemName:String(item.name || ""),
          branchCode:String(position.branchCode || ""),
          branchName:String(position.branchName || ""),
          localCode:String(position.localCode || ""),
          localName:String(position.localName || ""),
          quantity:toNumber(position.quantity),
          minimum:toNumber(position.minimum),
          maximum:toNumber(position.maximum),
          suggestedMinimum:toNumber(review.suggestedMinimum != null ? review.suggestedMinimum : review.minimumSuggested),
          suggestedMaximum:toNumber(review.suggestedMaximum != null ? review.suggestedMaximum : review.maximumSuggested),
          consumptionAverage:toNumber(review.averageMonthlyConsumption != null ? review.averageMonthlyConsumption : review.consumptionAverage),
          reviewLeadTime:toNumber(review.leadTimeDays),
          leadTimeDays:toNumber(review.leadTimeDays),
          reviewStatus:String(review.status || review.validation || ""),
          leadTimeSource:String(review.leadTimeSource || "")
        };
        row._searchText = normalizeText(Object.values(row).join(" "));
        reviewRows.push(row);
        reviewByPosition.set(positionKey(row.itemCode,row.branchCode,row.localCode), row);
        const bKey = branchKey(row.itemCode,row.branchCode);
        if (!reviewByBranch.has(bKey)) reviewByBranch.set(bKey,row);
      }

      const noTurnMap = new Map();
      const consumptionMap = new Map();
      for (const entry of registered.values()) {
        const name = normalizeText(entry.name);
        if (name.includes("sem giro") || name.includes("itens sem giro")) {
          for (const row of entry.rows) {
            const key = positionKey(row.itemCode,row.branchCode,row.localCode);
            noTurnMap.set(key,row);
            if (!noTurnMap.has(branchKey(row.itemCode,row.branchCode))) noTurnMap.set(branchKey(row.itemCode,row.branchCode),row);
          }
        }
        if (name.includes("consumo") && !name.includes("sem giro")) {
          for (const row of entry.rows) {
            const key = positionKey(row.itemCode,row.branchCode,row.localCode);
            const current = consumptionMap.get(key) || { total:0, values:[] };
            const value = toNumber(row.consumption);
            current.total += value;
            current.values.push(value);
            consumptionMap.set(key,current);
            const bKey = branchKey(row.itemCode,row.branchCode);
            const branchCurrent = consumptionMap.get(bKey) || { total:0, values:[] };
            branchCurrent.total += value;
            branchCurrent.values.push(value);
            consumptionMap.set(bKey,branchCurrent);
          }
        }
      }

      const facts = [];
      for (const item of items) {
        for (const position of item.positions || []) {
          const key = positionKey(item.code,position.branchCode,position.localCode);
          const bKey = branchKey(item.code,position.branchCode);
          const need = needByPosition.get(key) || needByBranch.get(bKey) || {};
          const review = reviewByPosition.get(key) || reviewByBranch.get(bKey) || {};
          const proc = finalizeProcessAggregate(processAgg.get(bKey) || processAgg.get(branchKey(item.code,"")));
          const noTurn = noTurnMap.get(key) || noTurnMap.get(bKey);
          const consumption = consumptionMap.get(key) || consumptionMap.get(bKey);
          const minimum = toNumber(position.minimum);
          const maximum = toNumber(position.maximum);
          const quantity = toNumber(position.quantity);
          let consumptionAverage = toNumber(need.consumptionAverage || review.consumptionAverage);
          if (!consumptionAverage && consumption && consumption.values.length) consumptionAverage = mean(consumption.values);
          const row = {
            _dataset:"estoque",
            itemCode:String(item.code || ""),
            itemName:String(item.name || ""),
            detailedName:String(item.detailedName || ""),
            branchCode:String(position.branchCode || ""),
            branchName:String(position.branchName || ""),
            localCode:String(position.localCode || ""),
            localName:String(position.localName || ""),
            partition:String(position.partition || ""),
            shelf:String(position.shelf || ""),
            division:String(position.division || ""),
            quantity:quantity,
            minimum:minimum,
            maximum:maximum,
            unitCost:toNumber(position.unitCost),
            stockValue:toNumber(position.stockValue),
            zero:quantity === 0 && minimum + maximum > 0,
            negative:quantity < 0,
            belowMin:minimum > 0 && quantity > 0 && quantity < minimum,
            aboveMax:maximum > 0 && quantity > maximum,
            withinRange:minimum > 0 && maximum > 0 && quantity >= minimum && quantity <= maximum,
            unconfigured:quantity > 0 && minimum + maximum === 0,
            responsible:(position.replenishmentResponsibles || item.replenishmentResponsibles || []).join(" | "),
            area:(position.responsibleAreas || item.responsibleAreas || []).join(" | "),
            category:(item.categories || []).join(" | "),
            unit:(item.units || []).join(" | "),
            supplier:(proc && proc.suppliers || item.suppliers || []).join(" | "),
            requester:(proc && proc.requesters || item.requesters || []).join(" | "),
            scCount:proc ? proc.scCount : 0,
            ofCount:proc ? proc.ofCount : 0,
            recCount:proc ? proc.recCount : 0,
            openScCount:proc ? proc.openScCount : 0,
            openOfCount:proc ? proc.openOfCount : 0,
            overdueCount:proc ? proc.overdueCount : 0,
            partialCount:proc ? proc.partialCount : 0,
            directPurchaseCount:proc ? proc.directPurchaseCount : 0,
            ageScDays:proc ? proc.ageScDays : null,
            openOfBalance:proc ? proc.openOfBalance : 0,
            pendingValue:proc ? proc.pendingValue : 0,
            scCodes:proc ? proc.scCodes.join(" | ") : "",
            ofCodes:proc ? proc.ofCodes.join(" | ") : "",
            processStatus:proc ? proc.statuses.join(" | ") : "",
            scToOfDays:proc ? proc.scToOfDays : null,
            ofToReceiptDays:proc ? proc.ofToReceiptDays : null,
            totalLeadDays:proc ? proc.totalLeadDays : null,
            leadTimeDays:toNumber(review.leadTimeDays || review.reviewLeadTime || (proc && proc.totalLeadDays)),
            consumptionAverage:consumptionAverage,
            noTurn:!!noTurn,
            noConsumption:!!noTurn || consumptionAverage === 0,
            noTurnDays:noTurn ? toNumber(noTurn.noTurnDays) : 0,
            needQty:toNumber(need.needQty),
            needValue:toNumber(need.needValue),
            coverageQty:toNumber(need.coverageQty),
            coverageSource:String(need.coverageSource || ""),
            rupture:!!need.rupture,
            cavacoAlert:!!need.cavacoAlert,
            suggestedMinimum:toNumber(review.suggestedMinimum),
            suggestedMaximum:toNumber(review.suggestedMaximum)
          };
          row._searchText = normalizeText([
            row.itemCode,row.itemName,row.detailedName,row.branchCode,row.branchName,row.localCode,row.localName,
            row.partition,row.shelf,row.division,row.responsible,row.area,row.category,row.unit,row.supplier,row.requester,
            row.scCodes,row.ofCodes,row.processStatus,row.coverageSource
          ].join(" "));
          facts.push(row);
        }
      }

      cache = { state:state, facts:facts, processes:processes, needs:Array.from(needByPosition.values()), reviews:reviewRows };
      cacheSignature = sig;
      return cache;
    }

    function selectDataset(query) {
      const q = normalizeText(query);
      if (/\b(revisao|minimo sugerido|maximo sugerido|parametrizacao)\b/.test(q)) return "revisoes";
      if (/\b(item|itens|material|materiais|produto|produtos|estoque|saldo|zerad|consumo|giro|minimo|maximo|ruptura|reposicao|necessidade)\b/.test(q)) return "estoque";
      if (/\b(sc|of|ordem|fornecedor|recebimento|nota fiscal|nf|solicitante|atrasad|entrega|compras?)\b/.test(q)) return "processos";
      if (session.lastDataset && /^(agora|desses|destes|dessas|destas|somente|apenas|so|e |quanto custa|qual deles)/.test(q)) return session.lastDataset;
      return "estoque";
    }

    function rowsForDataset(name, model, useFiltered) {
      let rows = name === "processos" ? model.processes : name === "revisoes" ? model.reviews : name === "necessidades" ? model.needs : model.facts;
      if (useFiltered && model.state && Array.isArray(model.state.filteredItems) && model.state.filteredItems.length) {
        const allowed = new Set(model.state.filteredItems.map(function (item) { return String(item.code); }));
        rows = rows.filter(function (row) { return allowed.has(String(row.itemCode)); });
      }
      return rows;
    }

    function fieldDefinitionForQuery(q, dataset) {
      let best = null;
      for (const def of FIELD_DEFS) {
        for (const alias of def.aliases) {
          const needle = normalizeText(alias);
          const index = q.indexOf(needle);
          if (index >= 0 && (!best || needle.length > best.alias.length)) best = { def:def, alias:needle, index:index };
        }
      }
      if (best) return best.def;
      if (/quanto custa|valor.*compr|custo.*compr|investimento.*repos/.test(q)) return FIELD_DEFS.find(function (d) { return d.key === "needValue"; });
      if (/valor.*estoque|capital|imobiliz/.test(q)) return FIELD_DEFS.find(function (d) { return d.key === "stockValue"; });
      if (/saldo|quantidade/.test(q)) return FIELD_DEFS.find(function (d) { return d.key === "quantity"; });
      if (dataset === "processos" && /valor|custo/.test(q)) return FIELD_DEFS.find(function (d) { return d.key === "pendingValue"; });
      return null;
    }

    function escapeRegExp(value) {
      return String(value).replace(/[$.*+?^(){}|[\]\\]/g, "\\$&");
    }

    function parseGrouping(q) {
      for (const group of GROUP_FIELDS) {
        for (const alias of group.aliases) {
          const needle = normalizeText(alias);
          const pattern = new RegExp("(?:por|cada|separad[oa]s? por|agrupad[oa]s? por)\\s+(?:\\w+\\s+){0,2}" + escapeRegExp(needle) + "\\b");
          if (pattern.test(q)) return group.key;
        }
      }
      if (/qual fornecedor|fornecedor.*mais|fornecedor.*maior/.test(q)) return "supplier";
      if (/qual responsavel|responsavel.*mais|responsavel.*maior/.test(q)) return "responsible";
      if (/qual filial|filial.*mais|filial.*maior/.test(q)) return "branchName";
      if (/qual solicitante|solicitante.*mais|solicitante.*maior/.test(q)) return "requester";
      return "";
    }

    function addFilter(filters, field, op, value, label) {
      filters.push({ field:field, op:op, value:value, label:label || field + " " + op + " " + value });
    }

    function parseStatusFilters(q, dataset, filters) {
      const excluding = /\b(tire|remova|exclua|desconsidere|retire)\b/.test(q);
      if (/\bzerad[oa]s?\b|saldo zero|saldo zerado/.test(q)) addFilter(filters,"quantity","eq",0,"saldo zerado");
      if (/saldo positivo|com saldo|saldo maior que zero/.test(q)) addFilter(filters,"quantity","gt",0,"saldo positivo");
      if (/saldo negativo|negativ[oa]s?/.test(q)) addFilter(filters,"quantity","lt",0,"saldo negativo");
      if (/abaixo do minimo|abaixo minimo|menor que o minimo/.test(q)) addFilter(filters,"belowMin","truthy",true,"abaixo do mínimo");
      if (/acima do maximo|acima maximo|maior que o maximo/.test(q)) addFilter(filters,"aboveMax","truthy",true,"acima do máximo");
      if (/dentro do (?:range|intervalo)|entre minimo e maximo/.test(q)) addFilter(filters,"withinRange","truthy",true,"dentro do mínimo/máximo");
      if (/sem parametr|nao parametr|sem min.*max/.test(q)) addFilter(filters,"unconfigured","truthy",true,"sem mínimo/máximo");
      if (/\bruptur/.test(q)) addFilter(filters,"rupture","truthy",true,"ruptura");
      if (/sem giro|sem consumo/.test(q)) addFilter(filters,"noTurn","truthy",true,"sem giro/consumo");
      if (/com consumo|teve consumo|tiveram consumo/.test(q)) addFilter(filters,"consumptionAverage","gt",0,"com consumo");
      if (/sem sc\b/.test(q)) addFilter(filters,dataset === "processos" ? "scCode" : "scCount",dataset === "processos" ? "empty" : "eq",dataset === "processos" ? true : 0,"sem SC");
      if (/com sc\b/.test(q) && !/sem sc\b/.test(q)) addFilter(filters,dataset === "processos" ? "scCode" : "scCount",dataset === "processos" ? "notempty" : "gt",dataset === "processos" ? true : 0,"com SC");
      if (/sem of\b/.test(q) || (excluding && /com of\b/.test(q))) addFilter(filters,dataset === "processos" ? "ofCode" : "ofCount",dataset === "processos" ? "empty" : "eq",dataset === "processos" ? true : 0,"sem OF");
      if (/com of\b/.test(q) && !/sem of\b/.test(q) && !(excluding && /com of\b/.test(q))) addFilter(filters,dataset === "processos" ? "ofCode" : "ofCount",dataset === "processos" ? "notempty" : "gt",dataset === "processos" ? true : 0,"com OF");
      if (/aguardando of|sc.*sem of/.test(q)) {
        if (dataset === "processos") addFilter(filters,"processStatus","contains","aguardando of","aguardando OF");
        else addFilter(filters,"openScCount","gt",0,"SC aguardando OF");
      }
      if (/atrasad/.test(q)) {
        if (dataset === "processos") addFilter(filters,"processStatus","contains","atrasada","processo atrasado");
        else addFilter(filters,"overdueCount","gt",0,"com processo atrasado");
      }
      if (/parcial/.test(q)) {
        if (dataset === "processos") addFilter(filters,"processStatus","contains","parcial","entrega parcial");
        else addFilter(filters,"partialCount","gt",0,"com entrega parcial");
      }
      if (/compra direta|fora do ccu 1500|fora.*1500/.test(q)) addFilter(filters,dataset === "processos" ? "directPurchase" : "directPurchaseCount",dataset === "processos" ? "truthy" : "gt",dataset === "processos" ? true : 0,"compra fora do CCU 1500");
      if (/(?:ccu|centro de custo)\s*1500/.test(q) && !/fora/.test(q)) addFilter(filters,"ccu","eqtext","1500","CCU 1500");
    }

    function parseNumericFilters(q, filters) {
      for (const def of FIELD_DEFS) {
        for (const aliasRaw of def.aliases) {
          const alias = normalizeText(aliasRaw);
          const index = q.indexOf(alias);
          if (index < 0) continue;
          const tail = q.slice(index + alias.length, index + alias.length + 80);
          let match = tail.match(/(?:entre)\s+(-?\d[\d.,]*(?:\s*(?:mil|milhao|milhoes))?)\s+(?:e|a)\s+(-?\d[\d.,]*(?:\s*(?:mil|milhao|milhoes))?)/);
          if (match) {
            const min = parseHumanNumber(match[1]), max = parseHumanNumber(match[2]);
            if (min != null && max != null) {
              addFilter(filters,def.key,"gte",Math.min(min,max),def.label + " >= " + Math.min(min,max));
              addFilter(filters,def.key,"lte",Math.max(min,max),def.label + " <= " + Math.max(min,max));
            }
            break;
          }
          match = tail.match(/(?:acima de|maior que|superior a|mais de|pelo menos|minimo de|>=)\s*(-?\d[\d.,]*(?:\s*(?:mil|milhao|milhoes))?)/);
          if (match) {
            const value = parseHumanNumber(match[1]);
            if (value != null) addFilter(filters,def.key,/pelo menos|minimo de|>=/.test(match[0]) ? "gte" : "gt",value,def.label + " acima de " + value);
            break;
          }
          match = tail.match(/(?:abaixo de|menor que|inferior a|menos de|no maximo|maximo de|<=)\s*(-?\d[\d.,]*(?:\s*(?:mil|milhao|milhoes))?)/);
          if (match) {
            const value = parseHumanNumber(match[1]);
            if (value != null) addFilter(filters,def.key,/no maximo|maximo de|<=/.test(match[0]) ? "lte" : "lt",value,def.label + " abaixo de " + value);
            break;
          }
          match = tail.match(/(?:igual a|exatamente|=)\s*(-?\d[\d.,]*(?:\s*(?:mil|milhao|milhoes))?)/);
          if (match) {
            const value = parseHumanNumber(match[1]);
            if (value != null) addFilter(filters,def.key,"eq",value,def.label + " = " + value);
            break;
          }
        }
      }
      const waiting = q.match(/(?:ha|mais de)\s+(\d+)\s+dias?\s+(?:sem of|aguardando of)/);
      if (waiting) addFilter(filters,"ageScDays","gt",Number(waiting[1]),"SC há mais de " + waiting[1] + " dias");
      const waitingBefore = q.match(/(?:sc\s+)?(?:ha\s+)?mais de\s+(\d+)\s+dias?\s+sem of/);
      if (waitingBefore) addFilter(filters,"ageScDays","gt",Number(waitingBefore[1]),"SC há mais de " + waitingBefore[1] + " dias");
      const noTurnAfter = q.match(/(?:sem giro|sem consumo).*?(?:ha\s+)?mais de\s+(\d+)\s+dias?/);
      const noTurnBefore = q.match(/(?:ha\s+)?mais de\s+(\d+)\s+dias?\s+(?:sem giro|sem consumo)/);
      const noTurnMatch = noTurnAfter || noTurnBefore;
      if (noTurnMatch) addFilter(filters,"noTurnDays","gt",Number(noTurnMatch[1]),"sem consumo há mais de " + noTurnMatch[1] + " dias");
    }

    function valueCandidates(rows, field, limit) {
      const values = new Set();
      for (const row of rows) {
        const raw = row[field];
        if (raw == null || raw === "") continue;
        String(raw).split(/\s*\|\s*/).forEach(function (value) {
          value = value.trim();
          if (value) values.add(value);
        });
        if (values.size >= (limit || 5000)) break;
      }
      return Array.from(values);
    }

    function entityScore(qTokens, candidate) {
      const cTokens = usefulTokens(candidate);
      if (!cTokens.length) return 0;
      let score = 0;
      for (const token of cTokens) if (qTokens.includes(token)) score += Math.min(8, token.length);
      return score;
    }

    function cuePresent(q, aliases) {
      return aliases.some(function (alias) { return q.includes(normalizeText(alias)); });
    }

    function parseEntityFilters(q, rows, filters) {
      const dimensions = [
        { field:"responsible", cues:["responsavel","repositor","reposicao"], priority:8 },
        { field:"supplier", cues:["fornecedor"], priority:7 },
        { field:"requester", cues:["solicitante","requisitante","usuario"], priority:6 },
        { field:"branchName", cues:["filial"], priority:5 },
        { field:"branchCode", cues:["filial","codigo filial"], priority:5 },
        { field:"localName", cues:["local","almoxarifado"], priority:4 },
        { field:"localCode", cues:["local","codigo local"], priority:4 },
        { field:"category", cues:["categoria","grupo","subgrupo"], priority:3 }
      ];
      const qTokens = usefulTokens(q);
      let implicitBest = null;
      for (const dim of dimensions) {
        const candidates = valueCandidates(rows,dim.field,2500);
        let best = null;
        for (const candidate of candidates) {
          const score = entityScore(qTokens,candidate);
          if (score > 0 && (!best || score > best.score || (score === best.score && candidate.length < best.value.length))) best = { value:candidate, score:score };
        }
        if (!best) continue;
        if (cuePresent(q,dim.cues)) {
          addFilter(filters,dim.field,"contains",best.value,dim.cues[0] + ": " + best.value);
        } else if (best.score >= 5) {
          const weighted = best.score + dim.priority / 10;
          if (!implicitBest || weighted > implicitBest.weighted) implicitBest = { dim:dim, value:best.value, score:best.score, weighted:weighted };
        }
      }
      if (implicitBest && !filters.some(function (filter) { return filter.field === implicitBest.dim.field; })) {
        addFilter(filters,implicitBest.dim.field,"contains",implicitBest.value,"identificado: " + implicitBest.value);
      }

      const itemMatch = q.match(/(?:item|codigo|cod|material|produto)\s*[:#-]?\s*(\d{3,})\b/);
      if (itemMatch) addFilter(filters,"itemCode","eqtext",itemMatch[1],"item " + itemMatch[1]);
      const scMatch = q.match(/\bsc\s*[:#-]?\s*(\d{3,})\b/);
      if (scMatch) addFilter(filters,"scCode","eqtext",scMatch[1],"SC " + scMatch[1]);
      const ofMatch = q.match(/\bof\s*[:#-]?\s*(\d{3,})\b/);
      if (ofMatch) addFilter(filters,"ofCode","eqtext",ofMatch[1],"OF " + ofMatch[1]);
      const nfMatch = q.match(/\b(?:nf|nota)\s*[:#-]?\s*([a-z0-9-]{3,})\b/);
      if (nfMatch) addFilter(filters,"recInvoice","contains",nfMatch[1],"NF " + nfMatch[1]);
      const branchMatch = q.match(/\bfilial\s*[:#-]?\s*(\d{2,})\b/);
      if (branchMatch) addFilter(filters,"branchCode","eqtext",branchMatch[1],"filial " + branchMatch[1]);
      const localMatch = q.match(/\blocal\s*[:#-]?\s*(\d{1,})\b/);
      if (localMatch) addFilter(filters,"localCode","eqtext",localMatch[1],"local " + localMatch[1]);
    }

    function parseOperation(q, dataset) {
      const groupBy = parseGrouping(q);
      const fieldDef = fieldDefinitionForQuery(q,dataset);
      const topMatch = q.match(/\btop\s*(\d+)\b|\b(\d+)\s+(?:maiores|menores|principais|piores|melhores)\b/);
      const limit = topMatch ? Number(topMatch[1] || topMatch[2]) : 50;
      let op = "list";
      if (/\bquant[oa]s?\b|contagem|numero de/.test(q)) op = "count";
      if (/\bmedia\b/.test(q)) op = "avg";
      if (/\bmediana\b/.test(q)) op = "median";
      if (/\bsom[ae]\b|somar|valor total|total em reais|quanto custa|qual o valor|quanto da/.test(q)) op = "sum";
      if (groupBy && op === "list") {
        if (/\bvalor\b|\bcusto\b|\bcapital\b|\btotal\b/.test(q)) op = "sum";
        else op = "count";
      }
      let direction = "desc";
      if (/\bmenor(?:es)?\b|\bmenos\b|\breducao\b/.test(q)) direction = "asc";
      if (/\bmaior(?:es)?\b|\bmais\b|\baumento\b|\btop\b/.test(q)) direction = "desc";
      let metricField = fieldDef && fieldDef.key;
      if (!metricField && op === "sum") {
        if (/compr|repos|ruptur|necess/.test(q)) metricField = "needValue";
        else if (/saldo|quantidade|unidades?/.test(q)) metricField = "quantity";
        else metricField = dataset === "processos" ? "pendingValue" : "stockValue";
      }
      if (!metricField && (op === "avg" || op === "median")) metricField = dataset === "processos" ? "delayDays" : "quantity";
      if (!metricField && groupBy && /\bvalor\b|\bcusto\b|\bcapital\b/.test(q)) metricField = dataset === "processos" ? "pendingValue" : "stockValue";
      const distinctField = /\bof\b/.test(q) && dataset === "processos" ? "ofCode" : /\bsc\b/.test(q) && dataset === "processos" ? "scCode" : /\b(item|itens|codigo|codigos|materiais|produtos)\b/.test(q) ? "itemCode" : "";
      return { op:op, groupBy:groupBy, metricField:metricField, limit:Math.max(1,Math.min(500,limit)), direction:direction, distinctField:distinctField };
    }

    function contextScope(q, filters) {
      const follow = /^(agora|desses|destes|dessas|destas|somente|apenas|so|e |quanto custa|qual deles|qual dessas|o restante|restante|ordene|ordenar|classifique|agrupe|separe)|\b(restante|anteriores)\b/.test(q);
      if (follow && session.lastItemCodes.length) {
        filters.push({ field:"itemCode", op:"in", value:session.lastItemCodes.slice(), label:"resultado anterior" });
        return true;
      }
      return false;
    }

    function compilePlan(question, rows, dataset) {
      const q = normalizeText(question);
      const filters = [];
      const usedContext = contextScope(q,filters);
      parseStatusFilters(q,dataset,filters);
      parseNumericFilters(q,filters);
      parseEntityFilters(q,rows,filters);
      const operation = parseOperation(q,dataset);
      return {
        question:question, normalized:q, dataset:dataset, filters:dedupeFilters(filters),
        operation:operation, usedContext:usedContext, textTerms:extractResidualTerms(q)
      };
    }

    function dedupeFilters(filters) {
      const seen = new Set();
      return filters.filter(function (filter) {
        const key = [filter.field,filter.op,JSON.stringify(filter.value)].join("|");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    function extractResidualTerms(q) {
      const concept = new Set();
      FIELD_DEFS.forEach(function (def) { def.aliases.forEach(function (alias) { tokenize(alias).forEach(function (t) { concept.add(t); }); }); });
      GROUP_FIELDS.forEach(function (def) { def.aliases.forEach(function (alias) { tokenize(alias).forEach(function (t) { concept.add(t); }); }); });
      ["zerado","zerados","ruptura","atrasada","atrasado","parcial","direta","giro","consumo","filial","local","fornecedor","responsavel","solicitante","item","codigo","sc","of","nf","lead","time","minimo","maximo","estoque","saldo","valor"].forEach(function (t) { concept.add(t); });
      return tokenize(q).filter(function (token) {
        return token.length >= 3 && !STOPWORDS.has(token) && !concept.has(token) && !/^\d[\d.,]*$/.test(token);
      });
    }

    function compareFilter(row, filter) {
      const value = row[filter.field];
      switch (filter.op) {
        case "eq": return Number(value) === Number(filter.value);
        case "gt": return Number(value) > Number(filter.value);
        case "gte": return Number(value) >= Number(filter.value);
        case "lt": return Number(value) < Number(filter.value);
        case "lte": return Number(value) <= Number(filter.value);
        case "truthy": return !!value;
        case "falsey": return !value;
        case "empty": return value == null || String(value).trim() === "";
        case "notempty": return value != null && String(value).trim() !== "";
        case "eqtext": return normalizeText(value) === normalizeText(filter.value);
        case "contains": return normalizeText(value).includes(normalizeText(filter.value)) || normalizeText(filter.value).includes(normalizeText(value));
        case "in": return Array.isArray(filter.value) && filter.value.map(String).includes(String(value));
        default: return true;
      }
    }

    function filterRows(rows, plan) {
      let result = rows.filter(function (row) {
        return plan.filters.every(function (filter) { return compareFilter(row,filter); });
      });
      if (!plan.filters.length && plan.textTerms.length) {
        result = result.map(function (row) {
          let score = 0;
          for (const term of plan.textTerms) if ((row._searchText || "").includes(term)) score += term.length;
          return { row:row, score:score };
        }).filter(function (entry) { return entry.score > 0; })
          .sort(function (a,b) { return b.score - a.score; })
          .map(function (entry) { entry.row._relevance = entry.score; return entry.row; });
      }
      return result;
    }

    function distinctCount(rows, field) {
      if (!field) return rows.length;
      return new Set(rows.map(function (row) { return row[field]; }).filter(Boolean)).size;
    }

    function metricValues(rows, field) {
      return rows.map(function (row) { return Number(row[field]); }).filter(Number.isFinite);
    }

    function aggregateValue(rows, operation) {
      if (operation.op === "count") return distinctCount(rows,operation.distinctField);
      const values = metricValues(rows,operation.metricField);
      if (operation.op === "sum") return values.reduce(function (sum,value) { return sum + value; },0);
      if (operation.op === "avg") return mean(values);
      if (operation.op === "median") return median(values) || 0;
      return 0;
    }

    function groupRows(rows, operation) {
      const groups = new Map();
      for (const row of rows) {
        const raw = row[operation.groupBy];
        const values = String(raw == null || raw === "" ? "Não informado" : raw).split(/\s*\|\s*/).filter(Boolean);
        for (const value of values.length ? values : ["Não informado"]) {
          if (!groups.has(value)) groups.set(value,[]);
          groups.get(value).push(row);
        }
      }
      const output = Array.from(groups.entries()).map(function (entry) {
        const group = entry[0], groupRows = entry[1];
        return {
          group:group,
          count:distinctCount(groupRows,operation.distinctField || (operation.groupBy === "itemName" ? "itemCode" : "")),
          value:aggregateValue(groupRows,operation),
          rows:groupRows
        };
      });
      output.sort(function (a,b) {
        const av = operation.op === "count" ? a.count : a.value;
        const bv = operation.op === "count" ? b.count : b.value;
        return operation.direction === "asc" ? av - bv : bv - av;
      });
      return output.slice(0,operation.limit);
    }

    function defaultSortField(plan) {
      if (plan.operation.metricField) return plan.operation.metricField;
      if (plan.filters.some(function (f) { return f.field === "rupture"; })) return "needValue";
      if (plan.filters.some(function (f) { return f.field === "noTurn"; })) return "stockValue";
      if (plan.dataset === "processos" && plan.filters.some(function (f) { return f.field === "processStatus"; })) return "delayDays";
      return plan.dataset === "processos" ? "pendingValue" : "stockValue";
    }

    function executePlan(plan, rows) {
      const filtered = filterRows(rows,plan);
      const op = plan.operation;
      if (op.groupBy) {
        const groups = groupRows(filtered,op);
        return { type:"group", total:filtered.length, groups:groups, rows:groups.map(function (g) {
          return { group:g.group, count:g.count, value:g.value };
        }) };
      }
      if (["count","sum","avg","median"].includes(op.op)) {
        return { type:"aggregate", total:filtered.length, value:aggregateValue(filtered,op), rows:filtered };
      }
      const sortField = defaultSortField(plan);
      const sorted = filtered.slice().sort(function (a,b) {
        const av = Number(a[sortField] || 0), bv = Number(b[sortField] || 0);
        if (av !== bv) return op.direction === "asc" ? av - bv : bv - av;
        return String(a.itemCode || "").localeCompare(String(b.itemCode || ""),"pt-BR",{numeric:true});
      });
      return { type:"list", total:filtered.length, rows:sorted.slice(0,op.limit), allRows:filtered };
    }

    function formatValue(value, field) {
      const def = FIELD_DEFS.find(function (d) { return d.key === field; });
      if (def && def.type === "currency") return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL",maximumFractionDigits:2}).format(Number(value)||0);
      if (def && def.type === "days") return new Intl.NumberFormat("pt-BR",{maximumFractionDigits:1}).format(Number(value)||0) + " dias";
      return new Intl.NumberFormat("pt-BR",{maximumFractionDigits:2}).format(Number(value)||0);
    }

    function humanField(field) {
      const def = FIELD_DEFS.find(function (d) { return d.key === field; });
      if (def) return def.label;
      const group = GROUP_FIELDS.find(function (d) { return d.key === field; });
      return group ? group.aliases[0] : field || "registros";
    }

    function answerFor(plan,result) {
      const filterText = plan.filters.length ? " Critérios: " + plan.filters.map(function (f) { return f.label; }).join("; ") + "." : "";
      if (result.type === "aggregate") {
        if (plan.operation.op === "count") return "Encontrei " + formatValue(result.value,"count") + " registro(s) para a consulta." + filterText;
        return "Resultado de " + humanField(plan.operation.metricField) + ": " + formatValue(result.value,plan.operation.metricField) + " em " + result.total + " registro(s)." + filterText;
      }
      if (result.type === "group") {
        if (!result.groups.length) return "Não encontrei registros que atendam aos critérios informados." + filterText;
        const first = result.groups[0];
        const metricText = plan.operation.op === "count" ? formatValue(first.count,"count") + " registro(s)" : formatValue(first.value,plan.operation.metricField);
        return "Cruzei " + result.total + " registro(s) e agrupei por " + humanField(plan.operation.groupBy) + ". Maior resultado: " + first.group + " — " + metricText + "." + filterText;
      }
      if (!result.total) return "Não encontrei registros que atendam aos critérios informados." + filterText;
      const itemCount = distinctCount(result.allRows || result.rows,"itemCode");
      return "Encontrei " + result.total + " registro(s), envolvendo " + itemCount + " item(ns). Mostrando até " + result.rows.length + " resultado(s)." + filterText;
    }

    function columnsFor(plan) {
      if (plan.operation.groupBy) return [
        { key:"group", label:humanField(plan.operation.groupBy) },
        { key:"count", label:"Qtd." },
        { key:"value", label:plan.operation.op === "count" ? "Contagem" : humanField(plan.operation.metricField), formatField:plan.operation.op === "count" ? "" : plan.operation.metricField }
      ];
      const q = plan.normalized;
      if (plan.dataset === "processos") {
        const cols = [
          {key:"itemCode",label:"Item"},{key:"itemName",label:"Descrição"},{key:"scCode",label:"SC"},{key:"ofCode",label:"OF"},
          {key:"supplier",label:"Fornecedor"},{key:"requester",label:"Solicitante"},{key:"processStatus",label:"Situação"}
        ];
        if (/atras|dias/.test(q)) cols.push({key:"delayDays",label:"Atraso",formatField:"delayDays"});
        if (/valor|custo|pendente/.test(q)) cols.push({key:"pendingValue",label:"Valor pendente",formatField:"pendingValue"});
        if (/lead|tempo|sc.*of/.test(q)) cols.push({key:"scToOfDays",label:"SC → OF",formatField:"scToOfDays"});
        if (/receb/.test(q)) cols.push({key:"ofToReceiptDays",label:"OF → REC",formatField:"ofToReceiptDays"});
        return cols;
      }
      const cols = [
        {key:"itemCode",label:"Item"},{key:"itemName",label:"Descrição"},{key:"branchCode",label:"Filial"},{key:"localCode",label:"Local"},
        {key:"quantity",label:"Saldo",formatField:"quantity"},{key:"minimum",label:"Mín.",formatField:"minimum"},{key:"maximum",label:"Máx.",formatField:"maximum"}
      ];
      if (/responsavel|repositor|reposicao/.test(q)) cols.push({key:"responsible",label:"Responsável"});
      if (/consumo/.test(q)) cols.push({key:"consumptionAverage",label:"Consumo médio",formatField:"consumptionAverage"});
      if (/giro|sem consumo/.test(q)) cols.push({key:"noTurnDays",label:"Dias sem consumo",formatField:"noTurnDays"});
      if (/ruptur|necess|comprar|reposicao/.test(q)) {
        cols.push({key:"needQty",label:"Necessidade",formatField:"needQty"});
        cols.push({key:"needValue",label:"Valor reposição",formatField:"needValue"});
      }
      if (/valor|capital|estoque em reais/.test(q)) cols.push({key:"stockValue",label:"Valor estoque",formatField:"stockValue"});
      if (/lead|tempo/.test(q)) cols.push({key:"leadTimeDays",label:"Lead time",formatField:"leadTimeDays"});
      if (/\bof\b/.test(q)) cols.push({key:"ofCodes",label:"OFs"});
      if (/\bsc\b/.test(q)) cols.push({key:"scCodes",label:"SCs"});
      return cols;
    }

    function monthlyCandidates(q) {
      const entries = Array.from(registered.values()).filter(function (entry) {
        const n = normalizeText(entry.name);
        return n.includes("monthly:") || n.includes("estoque_") || n.includes("estoque ");
      }).sort(function (a,b) {
        return periodFromName(a.name).key.localeCompare(periodFromName(b.name).key);
      });
      const lastMatch = q.match(/ultimos?\s+(\d+)\s+meses?/);
      if (lastMatch) return entries.slice(-Math.max(2,Number(lastMatch[1])||2));
      const rangeMatch = q.match(/(?:de|entre)\s+([a-z]+).*?(?:a|ate|e)\s+([a-z]+)/);
      if (rangeMatch) {
        const start = MONTHS[rangeMatch[1]], end = MONTHS[rangeMatch[2]];
        if (start && end) {
          const low = Math.min(start,end), high = Math.max(start,end);
          const ranged = entries.filter(function(entry){
            const p=periodFromName(entry.name);
            return p.month>=low && p.month<=high && (!/\b20\d{2}\b/.test(q) || q.includes(String(p.year)));
          });
          if (ranged.length>=2) return ranged;
        }
      }
      const mentioned = entries.filter(function (entry) {
        const p = periodFromName(entry.name);
        if (!p.month) return false;
        const yearOk = !p.year || q.includes(String(p.year)) || !/\b20\d{2}\b/.test(q);
        const monthOk = Object.keys(MONTHS).some(function (key) { return MONTHS[key] === p.month && new RegExp("\\b"+escapeRegExp(key)+"\\b").test(q); });
        return monthOk && yearOk;
      });
      return mentioned.length >= 2 ? mentioned : entries;
    }

    function executeMonthly(question) {
      const q = normalizeText(question);
      const entries = monthlyCandidates(q);
      if (entries.length < 2) return null;
      const prepared = entries.map(function (entry) {
        const map = new Map();
        for (const row of entry.rows) {
          if (!row.itemCode) continue;
          const current = map.get(row.itemCode) || { itemCode:row.itemCode, itemName:row.itemName, balance:0, value:0 };
          current.balance += Number(row.balance || row.quantity || 0);
          current.value += Number(row.stockValue || 0);
          if (!current.itemName && row.itemName) current.itemName = row.itemName;
          map.set(row.itemCode,current);
        }
        const totalBalance = Array.from(map.values()).reduce(function (s,r) { return s+r.balance; },0);
        const totalValue = Array.from(map.values()).reduce(function (s,r) { return s+r.value; },0);
        return { entry:entry, period:periodFromName(entry.name), map:map, totalBalance:totalBalance, totalValue:totalValue };
      });
      const base = prepared[0], current = prepared[prepared.length - 1];
      const codes = new Set(Array.from(base.map.keys()).concat(Array.from(current.map.keys())));
      const changes = Array.from(codes).map(function (code) {
        const a = base.map.get(code) || {itemCode:code,itemName:"",balance:0,value:0};
        const b = current.map.get(code) || {itemCode:code,itemName:a.itemName,balance:0,value:0};
        const delta = b.balance-a.balance;
        const pct = a.balance ? delta/a.balance*100 : b.balance ? 100 : 0;
        return { itemCode:code, itemName:b.itemName || a.itemName, base:a.balance, current:b.balance, delta:delta, pct:pct };
      });
      changes.sort(function (a,b) {
        if (/reduc|queda|diminu/.test(q)) return a.delta-b.delta;
        if (/aument|cres|maior/.test(q)) return b.delta-a.delta;
        return Math.abs(b.delta)-Math.abs(a.delta);
      });
      const trend = prepared.map(function (p) {
        return { period:p.period.key, name:p.entry.name, balance:p.totalBalance, value:p.totalValue };
      });
      const deltaTotal = current.totalBalance-base.totalBalance;
      const answer = "Comparei " + prepared.length + " períodos. Saldo total no primeiro período: " + formatValue(base.totalBalance,"quantity") +
        "; no último: " + formatValue(current.totalBalance,"quantity") + "; variação: " + formatValue(deltaTotal,"quantity") + ".";
      return {
        answer:answer,
        plan:{dataset:"mensal",question:question,normalized:q,filters:[],operation:{op:"compare"},usedContext:false},
        result:{type:"monthly",total:changes.length,rows:changes.slice(0,50),trend:trend},
        rows:changes.slice(0,50),
        columns:[
          {key:"itemCode",label:"Item"},{key:"itemName",label:"Descrição"},{key:"base",label:"Base",formatField:"quantity"},
          {key:"current",label:"Atual",formatField:"quantity"},{key:"delta",label:"Variação",formatField:"quantity"},{key:"pct",label:"%",format:"percent"}
        ],
        meta:{trend:trend,base:base.entry.name,current:current.entry.name}
      };
    }

    function shouldUseMonthly(question) {
      const q = normalizeText(question);
      const monthCount = Object.keys(MONTHS).filter(function (key) { return q.includes(key); }).length;
      return /\bcompar|evolucao|mes a mes|mensal|periodo\b/.test(q) || monthCount >= 2;
    }

    async function ask(question, askOptions) {
      askOptions = askOptions || {};
      const clean = String(question || "").trim();
      if (!clean) return { answer:"Digite uma pergunta sobre os dados do almoxarifado.", rows:[], columns:[] };

      if (shouldUseMonthly(clean)) {
        const monthly = executeMonthly(clean);
        if (monthly) {
          session.lastItemCodes = unique(monthly.result.rows.map(function (row) { return row.itemCode; }).filter(Boolean));
          session.lastDataset = "estoque";
          session.lastQuestion = clean;
          session.lastPlan = monthly.plan;
          session.lastResult = monthly.result;
          return monthly;
        }
      }

      const model = buildModel();
      const dataset = selectDataset(clean);
      const rows = rowsForDataset(dataset,model,!!askOptions.useFiltered);
      const plan = compilePlan(clean,rows,dataset);
      const result = executePlan(plan,rows);
      const answer = answerFor(plan,result);
      const sourceRows = result.type === "list" ? (result.allRows || result.rows) : result.type === "aggregate" ? result.rows : result.type === "group" ? result.groups.flatMap(function (g) { return g.rows; }) : [];
      session.lastItemCodes = unique(sourceRows.map(function (row) { return row.itemCode; }).filter(Boolean)).slice(0,5000);
      session.lastDataset = dataset;
      session.lastQuestion = clean;
      session.lastPlan = plan;
      session.lastResult = result;

      return {
        answer:answer,
        plan:plan,
        result:result,
        rows:result.rows || [],
        columns:columnsFor(plan),
        meta:{
          dataset:dataset,
          total:result.total,
          filters:plan.filters.map(function (f) { return f.label; }),
          usedContext:plan.usedContext,
          indexed:{ facts:model.facts.length, processes:model.processes.length, reviews:model.reviews.length, registered:datasets() }
        }
      };
    }

    function reset() {
      session.lastItemCodes = [];
      session.lastDataset = "";
      session.lastQuestion = "";
      session.lastPlan = null;
      session.lastResult = null;
    }

    function capabilities() {
      const model = buildModel();
      return {
        facts:model.facts.length,
        processes:model.processes.length,
        reviews:model.reviews.length,
        registered:datasets(),
        fields:FIELD_DEFS.map(function (d) { return {key:d.key,label:d.label,type:d.type}; }),
        groups:GROUP_FIELDS.map(function (g) { return {key:g.key,label:g.aliases[0]}; })
      };
    }

    return {
      ask:ask, reset:reset, capabilities:capabilities, setStateProvider:setStateProvider,
      registerDataset:registerDataset, removeDataset:removeDataset, datasets:datasets,
      invalidate:invalidate, canonicalizeRawRecord:canonicalizeRawRecord,
      normalizeText:normalizeText, parseHumanNumber:parseHumanNumber,
      periodFromName:periodFromName, formatValue:formatValue, session:session
    };
  }

  return {
    createAssistantEngine:createAssistantEngine,
    normalizeText:normalizeText,
    canonicalizeRawRecord:canonicalizeRawRecord,
    parseHumanNumber:parseHumanNumber,
    periodFromName:periodFromName
  };
});
