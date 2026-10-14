"use strict";

(function initWarehouseIntelligence(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root?.document) api.install(root);
})(typeof window !== "undefined" ? window : null, () => {
  const PAGE = "inteligencia-almoxarifado";
  const clean = (x) => String(x ?? "").trim();
  const branch = (x) => clean(x).replace(/^0+(?=\d)/, "");
  const code = (x) => clean(x).replace(/\./g, "");
  const num = (x) => Number.isFinite(Number(x)) ? Number(x) : 0;
  const stockArea = (pos) => branch(pos?.branchCode) === "704"
    && /^\d+$/.test(clean(pos?.localCode)) && Number(pos.localCode) > 599
    ? "ROLANDIA - ALM. PREPARADOS" : clean(pos?.branchName);
  const escapeHtml = (s) => clean(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
  const dateBr = (value) => {
    const text = clean(value);
    const match = text.match(/^(\d{4})-(\d\d)-(\d\d)/);
    return match ? match[3] + "/" + match[2] + "/" + match[1] : text;
  };
  function monthForOrder(value) {
    const raw = clean(value);
    const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    const br = raw.match(/^(\d{1,2})[/.\\-](\d{1,2})[/.\\-](\d{4})/);
    let yyyy, mm, dd;
    if (iso) [yyyy, mm, dd] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    else if (br) [yyyy, mm, dd] = [Number(br[3]), Number(br[2]), Number(br[1])];
    else if (/^\d{5}(?:\.\d+)?$/.test(raw)) {
      const d = new Date(Date.UTC(1899, 11, 30) + Math.trunc(Number(raw)) * 86400000);
      [yyyy, mm, dd] = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
    } else return "";
    const valid = new Date(Date.UTC(yyyy, mm - 1, dd));
    if (valid.getUTCFullYear() !== yyyy || valid.getUTCMonth() + 1 !== mm || valid.getUTCDate() !== dd) return "";
    return String(yyyy).padStart(4, "0") + "-" + String(mm).padStart(2, "0");
  }

  function planForFinding(finding) {
    const where = [
      "Item " + finding.code,
      finding.branchCode ? "filial " + finding.branchCode : "",
      finding.localCode ? "local " + finding.localCode : "",
    ].filter(Boolean).join(" · ");
    const owner = finding.responsibles?.join(", ") || "Supervisor do Almoxarifado";
    const cost = Number.isFinite(finding.estimatedImpact)
      ? currency.format(finding.estimatedImpact) + " (estimativa; não representa perda contabilizada)"
      : "A apurar com o comprador; sem valor confiável na base";
    if (finding.type === "repeat") return {
      what: "Revisar " + finding.count + " OFs distintas do mesmo item e competência; propor consolidação dos próximos pedidos.",
      why: "Entender o motivo da compra fracionada e reduzir retrabalho, urgências e fretes sem necessidade.",
      where,
      when: "Priorizar na próxima revisão diária; propor conclusão em até 2 dias úteis.",
      who: owner + " e comprador responsável",
      how: "Conferir OFs " + finding.ofCodes.join(", ") + ", SCs relacionadas, consumo real, lead time e mínimo/máximo; negociar programação de entregas e registrar causa encontrada.",
      howMuch: cost,
    };
    if (finding.type === "parameter") return {
      what: "Revisar e submeter à aprovação os limites mínimo e máximo do item; não modificar automaticamente o cadastro.",
      why: finding.obsolescenceKind === "no-consumption"
        ? "Parâmetros possivelmente desatualizados: não há consumo nos meses conhecidos. Confirmar criticidade, reserva técnica e sazonalidade."
        : "Parâmetros cadastrados divergem da referência calculada sobre consumo histórico e prazo de reposição.",
      where,
      when: finding.severity === "alta" ? "Priorizar em até 2 dias úteis após conferência física."
        : "Revisar na próxima análise semanal de parâmetros.",
      who: owner + " · PCM/Manutenção e comprador local",
      how: "Conferir os meses históricos e possíveis perdas de dados; validar lead time, lote mínimo, sazonalidade e criticidade. Comparar mín. "
        + number.format(finding.currentMinimum) + " / máx. " + number.format(finding.currentMaximum)
        + " com as referências mín. " + number.format(finding.suggestedMinimum)
        + " / máx. " + number.format(finding.suggestedMaximum)
        + "; documentar decisão e solicitar alteração cadastral apenas após aprovação.",
      howMuch: cost,
    };
    if (finding.type === "excess") return {
      what: "Revisar volume emitido/em aberto e adequar a reposição ao máximo parametrizado.",
      why: "Avaliar capital imobilizado e risco de excesso, considerando compromissos já existentes.",
      where,
      when: "Avaliar antes de emitir outra SC ou confirmar alteração na OF; sugerido até 1 dia útil.",
      who: owner + " e comprador responsável",
      how: "Validar máximo, saldo, consumo, OFs/SCs do CCU 1500 e pedidos do mês; checar sazonalidade/compra estratégica antes de negociar redução, reagendamento ou cancelamento.",
      howMuch: cost,
    };
    return {
      what: finding.projected
        ? "Antecipar reposição do item que poderá zerar antes de receber nova compra."
        : "Regularizar item com saldo zerado/negativo sem reposição válida identificada.",
      why: finding.projected
        ? "Prevenir a ruptura apontada pela cobertura estimada de consumo, sujeita à confirmação operacional."
        : "Evitar parada operacional e restabelecer a disponibilidade de material essencial.",
      where,
      when: finding.projected
        ? "Revisar hoje e programar solução antes dos " + number.format(finding.coverageDays) + " dias estimados de cobertura."
        : "Verificar imediatamente na rotina de hoje; definir prazo de atendimento conforme criticidade operacional.",
      who: owner + " e comprador local / manutenção solicitante",
      how: "Conferir estoque físico e endereços, validar requisições, buscar transferência entre locais/filiais e criar ou agilizar SC/OF para CCU 1500 conforme aprovação.",
      howMuch: cost,
    };
  }

  // O PDCA é um roteiro proposto, nunca uma execução ou verificação
  // concluída. O indicador e a meta tornam a etapa Check mensurável.
  function pdcaForFinding(finding) {
    const owner = (finding.responsibles || []).filter(Boolean).join(", ") || "Supervisor do Almoxarifado";
    const base = "Item " + finding.code + (finding.branchCode ? " · filial " + finding.branchCode : "")
      + (finding.localCode ? " · local " + finding.localCode : "");
    const common = { owner, status: "Proposto — execução e resultados não registrados" };
    if (finding.type === "repeat") return {
      ...common,
      plan: "Identificar por que " + finding.count + " OFs do item foram emitidas na competência " + finding.month
        + "; conferir origem das SCs, consumo, urgências, lote mínimo e entregas programadas.",
      do: "Reunir almoxarifado e comprador, verificar OFs " + (finding.ofCodes || []).join(", ")
        + ", propor uma programação consolidada e documentar exceções justificadas.",
      check: "Na próxima competência, confrontar o número de OFs distintas, as SCs e o atendimento ao consumo; validar se houve redução sem ruptura.",
      act: "Se confirmado o ganho, incorporar calendário de compras e parâmetros de ressuprimento; caso contrário, reavaliar causas e repetir o ciclo.",
      indicator: "Quantidade de OFs distintas do mesmo item/filial por mês",
      baseline: String(finding.count) + " OFs nesta competência",
      target: "Até 1 OF/mês quando a consolidação for tecnicamente viável, sem criar rupturas",
      reviewWhen: "Fechamento do próximo mês",
      where: base,
    };
    if (finding.type === "excess") return {
      ...common,
      plan: "Validar o máximo cadastrado e o total de saldo mais SCs/OFs em aberto; identificar compra estratégica, lote mínimo ou demanda excepcional.",
      do: "Conferir saldo físico, pedidos e rateios; negociar com Compras reprogramação, redução ou cancelamento somente após aprovação formal.",
      check: "Recalcular o estoque projetado após as ações e comparar com o máximo; acompanhar recebimentos e capital potencialmente excedente.",
      act: "Padronizar a revisão de compras abertas antes de novas SCs; ajustar a política de abastecimento se o excesso se repetir.",
      indicator: "Saldo físico + reposição válida em aberto / máximo cadastrado",
      baseline: "Alerta: " + number.format(finding.quantity) + " unidades potencialmente acima do máximo",
      target: "Projeção <= máximo aprovado ou exceção estratégica documentada",
      reviewWhen: "Após a revisão dos pedidos e em cada novo recebimento",
      where: base,
    };
    if (finding.type === "parameter") return {
      ...common,
      plan: "Verificar se mínimo e máximo estão desatualizados com base nas " + finding.consideredMonthCount
        + " competências válidas, consumo ajustado e lead time " + number.format(finding.leadTimeDays)
        + " dias (" + (finding.leadTimeSource === "real" ? "real" : "estimado") + ").",
      do: "Conferir histórico, sazonalidade, sobressalentes críticos, lote mínimo e consumo previsto com PCM/Manutenção; submeter nova parametrização à aprovação.",
      check: "Comparar cobertura, rupturas e capital em estoque antes e depois da eventual mudança. Confirmar se as referências sugeridas se mostram adequadas.",
      act: "Após validação, atualizar procedimentos de revisão periódica e registrar premissas; se houver desvio, revisar margem, horizonte ou dados.",
      indicator: "Desvio dos parâmetros frente à referência validada e número de rupturas",
      baseline: "Atual: mín. " + number.format(finding.currentMinimum) + " / máx. " + number.format(finding.currentMaximum),
      target: "Referência a validar: mín. " + number.format(finding.suggestedMinimum)
        + " / máx. " + number.format(finding.suggestedMaximum) + "; sem agravar rupturas",
      reviewWhen: "30 dias após eventual alteração aprovada",
      where: base,
    };
    return {
      ...common,
      plan: finding.projected
        ? "Avaliar consumo, criticidade e prazo até a falta estimada (" + number.format(finding.coverageDays) + " dias)."
        : "Identificar causa do saldo zerado, urgência operacional e falta de SC/OF válida identificada.",
      do: "Realizar contagem física, investigar transferências e requisições; mobilizar comprador e manutenção para transferência ou compra aprovada.",
      check: "Confirmar reposição efetiva, saldo físico, atendimento às requisições e a cobertura calculada após a intervenção.",
      act: "Implantar gatilhos de antecipação, revisão do mínimo e alerta de pedidos sem cobertura; revisar o plano se a falta persistir.",
      indicator: "Saldo disponível, pedidos em aberto e dias de cobertura",
      baseline: finding.projected ? number.format(finding.coverageDays) + " dias de cobertura estimada" : "Saldo zerado/negativo",
      target: "Saldo disponível positivo e reposição programada com cobertura compatível com lead time",
      reviewWhen: finding.projected ? "Antes da data prevista de falta e após o recebimento" : "Conferência diária até normalizar",
      where: base,
    };
  }

  // Sugestão comparativa: parâmetro registrado x consumo por posição.
  // Mínimo = média diária x lead time x 1,2 (margem de segurança);
  // Máximo = mínimo sugerido + um mês de consumo.
  // Só indica obsolescência com pelo menos 3 competências válidas.
  function analyzeMinMaxObsolescence(item, pos, consumption, review, helpers = {}) {
    const analyzed = (typeof helpers.analyzeMonthlyConsumption === "function"
      ? helpers.analyzeMonthlyConsumption(consumption?.monthlyTotals || {})
      : Object.entries(consumption?.monthlyTotals || {}).map(([month, value]) => (
        { month, value: Math.max(0, num(value)), isOutlier: false })));
    const good = analyzed.filter((x) => !x.isOutlier && Number.isFinite(Number(x.value)));
    if (good.length < 3) return null;
    const avg = good.reduce((acc, x) => acc + Math.max(0, num(x.value)), 0) / good.length;
    const currentMin = num(pos.minimum), currentMax = num(pos.maximum);
    const isInconsistent = currentMax > 0 && currentMin > currentMax;
    const hasNoConsumption = avg === 0 && currentMax > 0;
    const leadReal = review?.leadTimeSource === "real" && num(review?.leadTimeDays) > 0;
    const leadDays = leadReal ? Number(review.leadTimeDays) : 30;
    const suggestedMin = Math.ceil(avg / 30 * leadDays * 1.2);
    const suggestedMax = Math.ceil(suggestedMin + avg);
    const significant = (current, target) => Math.abs(current - target) >= Math.max(2, target * .25);
    if (!isInconsistent && !hasNoConsumption
      && !significant(currentMin, suggestedMin) && !significant(currentMax, suggestedMax)) return null;
    const shortage = currentMin < suggestedMin || currentMax < suggestedMax;
    const kind = isInconsistent ? "Parâmetros inconsistentes" : hasNoConsumption
      ? "Sem consumo com máximo cadastrado" : shortage ? "Mínimo/máximo possivelmente baixos"
      : "Mínimo/máximo possivelmente elevados";
    const detail = (leadReal ? "Prazo real do histórico. " : "Prazo estimado de 30 dias; confirmar com compras. ")
      + "Somente sugestão para análise; considerar sazonalidade, estoque estratégico, lotes mínimos e criticidade."
      + (hasNoConsumption ? " Não reduzir ou zerar parâmetros sem confirmar que o histórico representa todo o período." : "");
    const delta = Math.abs(currentMax - suggestedMax);
    return {
      key: "parameter::" + code(item.code) + "::" + branch(pos.branchCode) + "::" + clean(pos.localCode)
        + "::" + clean(pos.partition || ""),
      type: "parameter", severity: isInconsistent || shortage ? "alta" : "media",
      code: code(item.code), name: item.name || item.detailedName || code(item.code),
      branchCode: branch(pos.branchCode), localCode: clean(pos.localCode), stockArea: stockArea(pos), month: "",
      title: kind, obsolescenceKind: hasNoConsumption ? "no-consumption" : "deviation",
      evidence: "Consumo médio ajustado: " + number.format(avg) + "/mês (" + good.length + " competências válidas)"
        + " · lead time " + number.format(leadDays) + " dias"
        + " · mínimo atual " + number.format(currentMin) + " / referência " + number.format(suggestedMin)
        + " · máximo atual " + number.format(currentMax) + " / referência " + number.format(suggestedMax),
      detail, ofCodes: [], count: 1, quantity: delta,
      responsibles: (pos.replenishmentResponsibles || []).filter(Boolean),
      estimatedImpact: num(pos.unitCost) > 0 ? delta * num(pos.unitCost) : null,
      currentMinimum: currentMin, currentMaximum: currentMax,
      suggestedMinimum: suggestedMin, suggestedMaximum: suggestedMax,
      averageMonthlyConsumption: avg, consideredMonthCount: good.length,
      leadTimeDays: leadDays, leadTimeSource: leadReal ? "real" : "estimated",
    };
  }

  function analyzeWarehouseIntelligence(items, helpers = {}, options = {}) {
    const findRepeated = helpers.buildRepeatedPurchasesByMonth;
    const commitmentsFor = helpers.getItemPurchaseCommitments;
    if (typeof findRepeated !== "function" || typeof commitmentsFor !== "function") {
      throw new Error("Regras centrais de compras ainda indisponíveis.");
    }
    const findings = [];
    const consumptionMap = options.consumptionMap instanceof Map
      ? options.consumptionMap : new Map((options.consumption?.records || []).map((row) => [
        code(row.code) + "::" + branch(row.branchCode) + "::" + clean(row.localCode), row,
      ]));
    const reviewMap = options.reviewMap instanceof Map ? options.reviewMap : new Map(
      (options.reviews || []).filter((r) => r.item && r.position).map((r) => [
        code(r.item.code) + "::" + branch(r.position.branchCode) + "::" + clean(r.position.localCode), r,
      ])
    );
    const horizonDays = Number.isFinite(options.horizonDays) && options.horizonDays > 0
      ? Math.min(90, options.horizonDays) : 30;
    const analyzeConsumption = typeof helpers.analyzeMonthlyConsumption === "function"
      ? helpers.analyzeMonthlyConsumption : (monthlyTotals) => Object.entries(monthlyTotals || {})
        .map(([month, value]) => ({ month, value: num(value), isOutlier: false }));
    const factor = Number.isFinite(options.excessFactor) && options.excessFactor > 1
      ? options.excessFactor : 1.2;
    const repeated = findRepeated(items);
    for (const group of repeated) {
      const count = group.orders.length;
      findings.push({
        key: "repeat::" + group.key,
        type: "repeat", severity: count >= 3 ? "alta" : "media",
        code: group.code, name: group.name, branchCode: branch(group.branchCode),
        localCode: "", month: group.month, count,
        title: count + " OFs emitidas no mesmo mês",
        evidence: group.orders.map((x) => x.code + " (" + x.date + ")").join(" · "),
        ofCodes: group.orders.map((x) => x.code),
        quantity: group.totalQuantity,
        estimatedImpact: group.knownAmountCount === count ? group.knownAmount : null,
        responsibles: [],
        detail: "OFs distintas; recebimentos repetidos não são novas compras.",
      });
    }
    for (const item of items || []) {
      if (!item?.code || item.flags?.inactiveOnly) continue;
      for (const pos of item.positions || []) {
        const rowKey = code(item.code) + "::" + branch(pos.branchCode) + "::" + clean(pos.localCode);
        const review = analyzeMinMaxObsolescence(item, pos, consumptionMap.get(rowKey), reviewMap.get(rowKey), helpers);
        if (review) findings.push(review);
      }
      const byBranch = new Map();
      const commitments = commitmentsFor(item);
      for (const pos of item.positions || []) {
        const b = branch(pos.branchCode);
        if (!b) continue;
        if (!byBranch.has(b)) byBranch.set(b, { positions: [], max: 0, stock: 0, names: new Set() });
        const group = byBranch.get(b);
        group.positions.push(pos);
        if (Number(pos.maximum) > 0) group.max += Number(pos.maximum);
        group.stock += num(pos.quantity);
        for (const person of pos.replenishmentResponsibles || []) if (person) group.names.add(person);
      }
      const ordersByBranchMonth = new Map();
      const seen = new Map();
      for (const record of item.history || []) {
        const of = record.of;
        const sc = record.sc;
        if (!of?.code || !/^0*1500(?:[.,]0+)?$/.test(clean(sc?.allocationCostCenter))
          || /cancelad|anulad/i.test(clean(of.status) + " " + clean(sc?.status))
          || /^(?:s|sim|1|true|yes)$/i.test(clean(sc?.cancelled))
          || /^(?:s|sim|1|true|yes)$/i.test(clean(of.cancelled))) continue;
        const b = branch(sc?.destinationBranch || of.deliveryBranchCode || sc?.branchCode || record.branchCode);
        const month = monthForOrder(of.date);
        if (!b || !month || !byBranch.has(b)) continue;
        const k = b + "::" + month + "::" + clean(of.code);
        // A mesma OF pode repetir-se em linhas de recebimento. Usar a maior
        // quantidade declarada, sem multiplicar o pedido por nota fiscal.
        const qty = of.requestedQuantity == null || of.requestedQuantity === "" ? null : Number(of.requestedQuantity);
        if (!(Number.isFinite(qty) && qty >= 0)) continue;
        const old = seen.get(k);
        if (old === undefined || qty > old) seen.set(k, qty);
      }
      for (const [k, qty] of seen) {
        const [b, month] = k.split("::");
        const bk = b + "::" + month;
        if (!ordersByBranchMonth.has(bk)) ordersByBranchMonth.set(bk, { branchCode: b, month, quantity: 0 });
        ordersByBranchMonth.get(bk).quantity += qty;
      }
      for (const [b, bucket] of byBranch) {
        const pool = commitments.get(b);
        const openOf = (pool?.ofs || []).reduce((sum, row) => sum + Math.max(0, num(row.remaining)), 0);
        const openSc = (pool?.scs || []).reduce((sum, row) => sum + Math.max(0, num(row.remaining)), 0);
        const incoming = openOf + openSc;
        const ownerList = [...bucket.names];
        const configured = bucket.positions.filter((p) => num(p.maximum) > 0);
        const configuredStock = configured.reduce((sum, p) => sum + num(p.quantity), 0);
        const max = bucket.max;
        const expected = configuredStock + incoming;
        const latestMonthly = [...ordersByBranchMonth.values()]
          .filter((entry) => entry.branchCode === b)
          .sort((a, c) => c.month.localeCompare(a.month))[0];
        const exceedsInbound = max > 0 && incoming > 0 && expected > max * factor;
        const exceedsIssued = max > 0 && latestMonthly && latestMonthly.quantity > max * factor;
        if (exceedsInbound || exceedsIssued) {
          const monthlyExcess = exceedsIssued ? Math.max(0, latestMonthly.quantity - max) : 0;
          const projectedExcess = exceedsInbound ? Math.max(0, expected - max) : 0;
          const overshoot = Math.max(monthlyExcess, projectedExcess);
          const referencePrice = configured.find((p) => num(p.unitCost) > 0)?.unitCost || 0;
          const reasons = [];
          if (exceedsInbound) reasons.push("Saldo " + number.format(configuredStock)
            + " + pendências OF/SC " + number.format(incoming)
            + " = " + number.format(expected) + " frente ao máximo " + number.format(max));
          if (exceedsIssued) reasons.push("OFs do mês " + latestMonthly.month
            + " somam " + number.format(latestMonthly.quantity) + " frente ao máximo " + number.format(max));
          findings.push({
            key: "excess::" + code(item.code) + "::" + b,
            type: "excess", severity: overshoot > max ? "alta" : "media",
            code: code(item.code), name: item.name || item.detailedName || code(item.code),
            branchCode: b, localCode: "", month: latestMonthly?.month || "",
            count: 1, title: "Compra potencialmente acima do máximo",
            evidence: reasons.join(" · "), ofCodes: (pool?.ofs || []).map((x) => x.code),
            quantity: overshoot, referenceMaximum: max,
            estimatedImpact: referencePrice > 0 ? overshoot * referencePrice : null,
            responsibles: ownerList,
            detail: "Limiar de alerta: acima de " + Math.round((factor - 1) * 100)
              + "% do máximo; validar compras estratégicas e o rateio entre locais antes de agir.",
          });
        }
        // Sem cobertura validada do CCU 1500, detectar estoque já zerado e
        // risco de acabar em até 30 dias calculado pela média mensal sem anomalias.
        // A projeção é estimativa, não previsão de falta garantida.
        if (incoming > 0) continue;
        for (const pos of bucket.positions) {
          if (!(num(pos.minimum) > 0 || num(pos.maximum) > 0)) continue;
          const stock = num(pos.quantity);
          const isZero = stock <= 0;
          let coverageDays = null;
          if (!isZero) {
            const row = consumptionMap.get(code(item.code) + "::" + b + "::" + clean(pos.localCode));
            const goodMonths = analyzeConsumption(row?.monthlyTotals || {})
              .filter((entry) => !entry.isOutlier && Number(entry.value) > 0);
            const average = goodMonths.length
              ? goodMonths.reduce((sum, entry) => sum + num(entry.value), 0) / goodMonths.length
              : 0;
            coverageDays = average > 0 ? stock * 30 / average : null;
          }
          const projected = !isZero && coverageDays !== null && coverageDays <= horizonDays;
          if (!isZero && !projected) continue;
          const suggested = Math.max((num(pos.maximum) || num(pos.minimum)) - stock, 0);
          const price = num(pos.unitCost);
          findings.push({
            key: "zero::" + code(item.code) + "::" + b + "::" + clean(pos.localCode)
              + "::" + clean(pos.partition),
            type: "zero", severity: isZero ? "critica" : "alta",
            projected, coverageDays,
            code: code(item.code), name: item.name || item.detailedName || code(item.code),
            branchCode: b, localCode: clean(pos.localCode), stockArea: stockArea(pos), month: "",
            count: 1, title: isZero ? "Saldo zerado sem reposição identificada"
              : "Risco de zerar em " + number.format(coverageDays) + " dias sem reposição",
            evidence: "Saldo " + number.format(stock) + " · mínimo " + number.format(pos.minimum)
              + " · máximo " + number.format(pos.maximum)
              + (projected ? " · cobertura estimada " + number.format(coverageDays) + " dias" : "")
              + " · OF/SC em aberto do CCU 1500: 0",
            ofCodes: [], quantity: suggested, estimatedImpact: price > 0 ? suggested * price : null,
            responsibles: (pos.replenishmentResponsibles || []).filter(Boolean),
            detail: (projected ? "Prazo projetado por média mensal histórica, sem previsão de entrega. " : "")
              + "Revisar pedidos sem CCU identificado e transferências: ausência de registro válido não prova ausência de ação fora do sistema.",
          });
        }
      }
    }
    const rank = { critica: 0, alta: 1, media: 2 };
    findings.sort((a, b) => rank[a.severity] - rank[b.severity]
      || b.month.localeCompare(a.month) || a.code.localeCompare(b.code, "pt-BR", { numeric: true }));
    for (const finding of findings) {
      finding.plan = planForFinding(finding);
      finding.pdca = pdcaForFinding(finding);
    }
    const summary = {
      repeated: findings.filter((row) => row.type === "repeat").length,
      excess: findings.filter((row) => row.type === "excess").length,
      zero: findings.filter((row) => row.type === "zero").length,
      parameter: findings.filter((row) => row.type === "parameter").length,
      critical: findings.filter((row) => row.severity === "critica").length,
      total: findings.length,
    };
    return { findings, summary, analyzedItems: (items || []).length };
  }

  // Processar em lotes libera o navegador entre grupos de itens e impede
  // a longa tarefa síncrona que bloqueava a navegação no celular.
  // Cada item pertence a um lote: OFs repetidas não se duplicam na junção.
  async function analyzeWarehouseIntelligenceInBatches(items, helpers = {}, options = {}, controls = {}) {
    const all = Array.isArray(items) ? items : [];
    const batchSize = Math.max(25, Math.min(400, Math.floor(Number(controls.batchSize) || 120)));
    const consumptionMap = new Map((options.consumption?.records || []).map((row) => [
      code(row.code) + "::" + branch(row.branchCode) + "::" + clean(row.localCode), row,
    ]));
    const reviewMap = new Map((options.reviews || []).filter((r) => r.item && r.position).map((r) => [
      code(r.item.code) + "::" + branch(r.position.branchCode) + "::" + clean(r.position.localCode), r,
    ]));
    const findings = [];
    for (let start = 0; start < all.length; start += batchSize) {
      if (controls.cancelled?.()) return null;
      const end = Math.min(start + batchSize, all.length);
      const result = analyzeWarehouseIntelligence(all.slice(start, end), helpers, {
        ...options, consumptionMap, reviewMap,
      });
      findings.push(...result.findings);
      controls.progress?.(end, all.length);
      if (end < all.length) {
        await (controls.yieldStep
          ? controls.yieldStep()
          : new Promise((resolve) => setTimeout(resolve, 0)));
      }
    }
    if (controls.cancelled?.()) return null;
    const rank = { critica: 0, alta: 1, media: 2 };
    findings.sort((a, b) => rank[a.severity] - rank[b.severity]
      || b.month.localeCompare(a.month)
      || a.code.localeCompare(b.code, "pt-BR", { numeric: true }));
    return {
      findings,
      summary: {
        repeated: findings.filter((row) => row.type === "repeat").length,
        excess: findings.filter((row) => row.type === "excess").length,
        zero: findings.filter((row) => row.type === "zero").length,
        parameter: findings.filter((row) => row.type === "parameter").length,
        critical: findings.filter((row) => row.severity === "critica").length,
        total: findings.length,
      },
      analyzedItems: all.length,
    };
  }

  function buildIntelligenceExport(rows) {
    const headers = [
      "Anomalia", "Prioridade", "Código", "Item", "Filial", "Local", "Mês OF",
      "Evidência", "OFs", "Quantidade envolvida", "Impacto estimado (R$)",
      "5W2H - O quê", "5W2H - Por quê", "5W2H - Onde", "5W2H - Quando",
      "5W2H - Quem", "5W2H - Como", "5W2H - Quanto", "Observações",
      "Mínimo atual", "Máximo atual", "Mínimo referência", "Máximo referência",
      "Consumo médio/mês", "Meses válidos", "Lead time (dias)", "Origem lead time", "Área de estoque",
    ];
    return {
      title: "Inteligência do Almoxarifado - Plano 5W2H",
      filename: "inteligencia-almoxarifado-5w2h.xls",
      headers,
      rows: (rows || []).map((f) => [
        f.type === "repeat" ? "OFs repetidas no mês" : f.type === "excess" ? "Compras acima do máximo"
          : f.type === "parameter" ? "Mínimo/máximo obsoletos" : "Zerado sem reposição",
        f.severity, f.code, f.name, f.branchCode, f.localCode, f.month, f.evidence,
        f.ofCodes.join(" | "), f.quantity, f.estimatedImpact,
        f.plan.what, f.plan.why, f.plan.where, f.plan.when,
        f.plan.who, f.plan.how, f.plan.howMuch, f.detail,
        f.currentMinimum ?? "", f.currentMaximum ?? "", f.suggestedMinimum ?? "", f.suggestedMaximum ?? "",
        f.averageMonthlyConsumption ?? "", f.consideredMonthCount ?? "", f.leadTimeDays ?? "",
        f.leadTimeSource === "real" ? "Histórico real" : f.leadTimeSource === "estimated" ? "Referência estimada" : "",
        f.stockArea || "",
      ]),
      numericColumns: new Set([9, 10, 19, 20, 21, 22, 23, 24, 25]), currencyColumns: new Set([10]),
      pdfIdentityColumns: [2, 3, 4],
      filterSummary: "Anomalias sugeridas: OFs distintas por competência, 20% acima do máximo, saldo sem cobertura CCU 1500, e mínimo/máximo com desvio relevante perante 3+ meses históricos. Lead time estimado: 30 dias se não houver prazo real. Plano 5W2H proposto sem alteração automática.",
    };
  }

  function install(win) {
    if (win.__almoxIntelligenceInstalled) return;
    win.__almoxIntelligenceInstalled = true;
    const { document } = win;
    let lastItems = null;
    let engineResult = null;
    let visibleRows = [];
    let batch = 45;
    let dataRevision = -1;
    let dirty = true;
    let analysisPromise = null;
    let analysisItems = null;
    let analysisVersion = 0;
    let refreshAfterRunning = false;
    const esc = escapeHtml;
    const text = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    const helpers = () => ({
      buildRepeatedPurchasesByMonth: typeof buildRepeatedPurchasesByMonth === "function" ? buildRepeatedPurchasesByMonth : null,
      getItemPurchaseCommitments: typeof getItemPurchaseCommitments === "function" ? getItemPurchaseCommitments : null,
    });
    const currentState = () => typeof state !== "undefined" ? state : win.__almoxState;
    const pane = () => document.getElementById("page-" + PAGE);
    const isCurrent = () => win.location.hash === "#" + PAGE;

    function selected(id) { return document.getElementById(id)?.value || ""; }
    function visibleFilter(f, context) {
      if (!context.itemCodes.has(f.code)) return false;
      if (typeof win.__almoxGlobalRowFilter === "function" && !win.__almoxGlobalRowFilter({
        code: f.code, branchCode: f.branchCode, localCode: f.localCode,
      })) return false;
      const { type, severity, branchChoice, month, query } = context;
      if (type && f.type !== type) return false;
      if (severity && f.severity !== severity) return false;
      if (branchChoice && f.branchCode !== branchChoice) return false;
      if (month && f.month !== month) return false;
      if (query && ![f.code, f.name, f.branchCode, f.localCode, f.evidence, f.ofCodes.join(" "), f.title]
        .join(" ").toLocaleLowerCase("pt-BR").includes(query)) return false;
      return true;
    }
    function options(id, values, all) {
      const el = document.getElementById(id);
      if (!el) return;
      const previous = el.value;
      el.replaceChildren(new Option(all, ""), ...values.map((value) =>
        new Option(value.replace(/^(\d{4})-(\d{2})$/, "$2/$1"), value)));
      if (values.includes(previous)) el.value = previous;
    }
    function cards(rows) {
      const summary = {
        repeat: rows.filter((x) => x.type === "repeat").length,
        excess: rows.filter((x) => x.type === "excess").length,
        zero: rows.filter((x) => x.type === "zero").length,
        parameter: rows.filter((x) => x.type === "parameter").length,
      };
      const el = document.getElementById("wiKpis");
      if (!el) return;
      el.innerHTML = [
        ["Compras repetidas", summary.repeat, "repeat"],
        ["Acima do máximo", summary.excess, "excess"],
        ["Zerados / risco de zerar", summary.zero, "zero"],
        ["Mín./máx. obsoletos", summary.parameter, "parameter"],
        ["Anomalias no recorte", rows.length, "all"],
      ].map(([label, value, type]) =>
        '<article class="wi-kpi"><span>' + esc(label) + '</span><strong>' + number.format(value)
        + '</strong><small>' + (type === "all" ? "Com plano 5W2H" : "Ocorrências identificadas")
        + '</small></article>').join("");
    }
    const typeTitle = (type) => type === "repeat" ? "Compra repetida no mês"
      : type === "excess" ? "Compra acima do máximo" : type === "parameter"
        ? "Revisão de mínimo/máximo" : "Zerado ou risco de zerar";
    function card(f) {
      const p = f.plan;
      const cells = [
        ["O quê?", p.what], ["Por quê?", p.why], ["Onde?", p.where],
        ["Quando?", p.when], ["Quem?", p.who], ["Como?", p.how], ["Quanto?", p.howMuch],
      ];
      return '<article class="wi-issue wi-issue--' + esc(f.severity) + '">'
        + '<div class="wi-issue__top"><span class="wi-priority">' + esc(f.severity.toUpperCase())
        + '</span><span class="wi-issue__type">' + esc(typeTitle(f.type)) + '</span></div>'
        + '<strong class="wi-issue__name">' + esc(f.name) + '</strong>'
        + '<span class="wi-issue__codes">Item ' + esc(f.code) + ' · Filial ' + esc(f.branchCode)
        + (f.localCode ? ' · Local ' + esc(f.localCode) : "")
        + (f.stockArea ? ' · ' + esc(f.stockArea) : "")
        + (f.month ? ' · Mês ' + esc(f.month.slice(5) + "/" + f.month.slice(0, 4)) : "")
        + '</span><p class="wi-issue__evidence">' + esc(f.evidence) + '</p>'
        + '<div class="wi-issue__stats"><span>Qtde. envolvida: <strong>' + number.format(f.quantity)
        + '</strong></span><span>Impacto potencial: <strong>' + (f.estimatedImpact == null ? "A apurar" : currency.format(f.estimatedImpact))
        + '</strong></span></div>'
        + '<details><summary>Ver plano de ação 5W2H</summary><dl class="wi-plan">'
        + cells.map(([label, v]) => '<div><dt>' + esc(label) + '</dt><dd>' + esc(v) + '</dd></div>').join("")
        + '</dl><p class="wi-issue__note">' + esc(f.detail) + '</p></details></article>';
    }
    function renderBatch() {
      const host = document.getElementById("wiResults");
      if (!host) return;
      const until = Math.min(batch, visibleRows.length);
      host.innerHTML = visibleRows.slice(0, until).map(card).join("")
        || '<p class="wi-empty">Nenhuma anomalia corresponde aos filtros atuais. Isso não dispensa a verificação operacional do estoque.</p>';
      const more = document.getElementById("wiMore");
      if (more) more.hidden = until >= visibleRows.length;
      text("wiCount", "Exibindo " + number.format(until) + " de " + number.format(visibleRows.length) + " ocorrências");
    }
    function applyFilters() {
      if (!engineResult) return;
      // Criar o conjunto uma única vez por aplicação de filtros — antes ele
      // era reconstruído para cada ocorrência (itens × anomalias).
      const st = currentState();
      const context = {
        itemCodes: new Set((st?.filteredItems || st?.items || []).map((item) => code(item.code))),
        type: selected("wiType"),
        severity: selected("wiSeverity"),
        branchChoice: selected("wiBranch"),
        month: selected("wiMonth"),
        query: selected("wiSearch").toLocaleLowerCase("pt-BR").trim(),
      };
      visibleRows = engineResult.findings.filter((finding) => visibleFilter(finding, context));
      cards(visibleRows);
      batch = 45;
      renderBatch();
      text("wiStatus", number.format(visibleRows.length) + " anomalias no recorte · " + number.format(engineResult.analyzedItems) + " itens analisados");
      document.getElementById("wiExport").disabled = !visibleRows.length;
      dirty = false;
    }
    function refresh(force = false) {
      const st = currentState();
      if (!st?.items?.length) {
        text("wiStatus", "Aguardando saldo, compras e consumo carregarem…");
        if (isCurrent()) win.setTimeout(() => refresh(), 800);
        return;
      }
      if (force || st.items !== lastItems || !engineResult) {
        if (analysisPromise && analysisItems === st.items && !force) {
          // Reabertura após sair da aba: a execução anterior pode ter
          // sido cancelada; retomar assim que ela encerrar.
          refreshAfterRunning = true;
          return;
        }
        const sourceItems = st.items;
        const version = ++analysisVersion;
        refreshAfterRunning = false;
        analysisItems = sourceItems;
        engineResult = null;
        const exportButton = document.getElementById("wiExport");
        if (exportButton) exportButton.disabled = true;
        const host = document.getElementById("wiResults");
        if (host) host.innerHTML = '<p class="wi-empty">Preparando a inteligência em etapas, sem bloquear o Dashboard…</p>';
        text("wiStatus", "Analisando OFs, parâmetros e cobertura de reposição…");
        // A análise leva tempo, mas os lotes permitem tocar no menu e nos filtros
        // sem congelar a interface. Abandonar a aba interrompe lotes pendentes.
        analysisPromise = analyzeWarehouseIntelligenceInBatches(sourceItems, {
          ...helpers(),
          analyzeMonthlyConsumption: typeof analyzeMonthlyConsumption === "function"
            ? analyzeMonthlyConsumption : null,
        }, { consumption: st.consumption, reviews: st.minMaxReviews || [] }, {
          // Lotes pequenos evitam longas tarefas em aparelhos móveis.
          batchSize: win.matchMedia?.("(max-width:900px), (pointer:coarse)")?.matches ? 20 : 65,
          cancelled: () => version !== analysisVersion || !isCurrent()
            || currentState()?.items !== sourceItems,
          progress: (done, total) => {
            if (version === analysisVersion && isCurrent()) {
              text("wiStatus", "Analisando dados… " + Math.round(done / total * 100) + "%");
            }
          },
          yieldStep: () => new Promise((resolve) =>
            win.setTimeout(resolve, 0)),
        }).then((result) => {
          if (!result || version !== analysisVersion || !isCurrent()) return;
          engineResult = result;
          lastItems = sourceItems;
          const findings = result.findings;
          options("wiBranch", [...new Set(findings.map((x) => x.branchCode))]
            .filter(Boolean).sort(), "Todas as filiais");
          options("wiMonth", [...new Set(findings.map((x) => x.month))]
            .filter(Boolean).sort().reverse(), "Todas as competências");
          dataRevision = currentState()?.filterRevision ?? -1;
          applyFilters();
        }).catch((error) => {
          if (version === analysisVersion && isCurrent())
            text("wiStatus", "Falha na análise: " + (error?.message || String(error)));
        }).finally(() => {
          if (version === analysisVersion) {
            analysisPromise = null;
            analysisItems = null;
            const shouldResume = refreshAfterRunning && isCurrent() && !engineResult;
            refreshAfterRunning = false;
            if (shouldResume) win.setTimeout(() => refresh(), 0);
          }
        });
        return;
      }
      dataRevision = st.filterRevision;
      applyFilters();
    }
    function open() {
      if (!pane()) return;
      // Os controles e a navegação base são responsáveis por ativar a página.
      if (isCurrent()) win.requestAnimationFrame(() => refresh());
    }
    function init() {
      if (!pane()) { win.setTimeout(init, 200); return; }
      document.querySelector('.app-nav__tab[data-page="' + PAGE + '"]')
        ?.addEventListener("click", () => win.setTimeout(open, 40));
      win.addEventListener("hashchange", open);
      win.addEventListener("almox-global-filters-applied", () => {
        if (isCurrent()) refresh();
        else dirty = true;
      });
      ["wiType", "wiSeverity", "wiBranch", "wiMonth", "wiSearch"].forEach((id) =>
        document.getElementById(id)?.addEventListener(id === "wiSearch" ? "input" : "change", applyFilters));
      document.getElementById("wiClear")?.addEventListener("click", () => {
        ["wiType", "wiSeverity", "wiBranch", "wiMonth", "wiSearch"].forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.value = "";
        });
        applyFilters();
      });
      document.getElementById("wiMore")?.addEventListener("click", () => {
        batch += 45;
        renderBatch();
      });
      document.getElementById("wiExport")?.addEventListener("click", () => {
        if (!visibleRows.length || typeof exportReport !== "function") return;
        exportReport("excel", buildIntelligenceExport(visibleRows));
      });
      if (isCurrent()) open();
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
  }
  return { monthForOrder, stockArea, analyzeMinMaxObsolescence, planForFinding, pdcaForFinding, analyzeWarehouseIntelligence, analyzeWarehouseIntelligenceInBatches, buildIntelligenceExport, install };
});
