import { state } from './state.js';
import { normalizarString, normalizarCod, converterParaNumero, encontrarChave, mostrarToast } from './utils.js';
import { setProgress, fecharLoader, mostrarErroLoaderFatal } from './ui.js'; // <- Puxando do UI, resolvendo dependência

export async function processarInteligencia() {
    if (state.bases.baseItens.length === 0) { 
        mostrarToast("Erro: Arquivo Mestre não localizado.", "error"); 
        setProgress(state.loaderProgress, "Erro Crítico: Base Mestre ausente.", 'error');
        mostrarErroLoaderFatal();
        state.isFetchingData = false; return; 
    }

    const colCod = ['cd item', 'cod produto', 'codigo', 'cod', 'item'];
    const colDesc = ['nome do item detalhado', 'nome do item resumido', 'desc'];
    const colQtdSaldo = ['qt saldo atual', 'saldo livre', 'saldo']; 
    const colQtdConsumo = ['qt movimento', 'quantidade consumida'];
    const colQtdCompraFallback = ['quantidade', 'qtde', 'saldo aberto'];
    const colCusto = ['vl custo unitario atual', 'custo unitario', 'custo'];
    const colMin = ['qt minimo', 'minimo'];
    const colMax = ['qt maximo', 'maximo'];
    const colFilialId = ['cd filial']; 
    const colFilialNm = ['nm filial', 'filial'];
    const colGrupo = ['nm grupo', 'grupo'];
    const colClasse = ['nm classe', 'classe'];
    const colReparticao = ['cd reparticao', 'reparticao'];
    const colPrateleira = ['cd prateleira', 'prateleira'];
    const colDivisao = ['cd divisao', 'divisao'];
    const colMesMovimento = ['mês movimento', 'mes movimento', 'mes'];
    const colUM = ['cd unidade medida', 'un', 'um'];
    const colLocalId = ['cd local', 'cod local', 'local'];
    const colLocalNm = ['nm local', 'nome local'];
    const colValorTotal = ['vl total', 'valor total', 'custo total'];
    
    const colScDataCriacao = ['sc - data criação', 'data criacao'];
    const colRecDataEntrada = ['rec - dt entrada', 'data entrada'];
    const colOfDataEntrega = ['of - data entrega', 'data entrega of'];
    const colScCodigo = ['sc - código', 'sc codigo'];
    const colOfCodigo = ['of - codigo', 'of codigo'];
    const colOfNomeFornecedor = ['of - nome fornecedor', 'fornecedor'];
    
    const colOfQtdPedida = ['of - qtd. solicitada', 'quantidade pedida'];
    const colRecQtd = ['rec - quantidade', 'quantidade recebida'];
    const colOfSit = ['of - situação of', 'situacao of'];
    const colScSit = ['sc - situação'];
    const colScCanc = ['sc - cancelado'];

    const dataAtual = new Date();
    let mesAnteriorNum = dataAtual.getMonth(); 
    if (mesAnteriorNum === 0) mesAnteriorNum = 12; 

    const nomesMesesDisplay = ['', 'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
    state.mesConsumoAtual = nomesMesesDisplay[mesAnteriorNum]; 
    const ordemMeses = { 'janeiro':1, 'jan':1, 'fevereiro':2, 'fev':2, 'março':3, 'marco':3, 'mar':3, 'abril':4, 'abr':4, 'maio':5, 'mai':5, 'junho':6, 'jun':6, 'julho':7, 'jul':7, 'agosto':8, 'ago':8, 'setembro':9, 'set':9, 'outubro':10, 'out':10, 'novembro':11, 'nov':11, 'dezembro':12, 'dez':12 };

    setProgress(92, "Processando Compras e Lead Time...");
    await new Promise(r => setTimeout(r, 50)); 

    const mapComprasTransito = new Map(); 
    const mapLeadTimeHistorico = new Map(); 
    
    let c_cod_compra = null, c_of_qtd_pedida = null, c_rec_qtd = null, c_of_sit = null, c_sc_sit = null, c_sc_canc = null, c_qtd_compra_fallback = null, c_sc_dt = null, c_rec_dt = null;

    if (state.bases.compras.length > 0) {
        c_cod_compra = encontrarChave(state.bases.compras[0], colCod);
        c_of_qtd_pedida = encontrarChave(state.bases.compras[0], colOfQtdPedida);
        c_rec_qtd = encontrarChave(state.bases.compras[0], colRecQtd);
        c_of_sit = encontrarChave(state.bases.compras[0], colOfSit);
        c_sc_sit = encontrarChave(state.bases.compras[0], colScSit);
        c_sc_canc = encontrarChave(state.bases.compras[0], colScCanc);
        c_qtd_compra_fallback = encontrarChave(state.bases.compras[0], colQtdCompraFallback);
        c_sc_dt = encontrarChave(state.bases.compras[0], colScDataCriacao);
        c_rec_dt = encontrarChave(state.bases.compras[0], colRecDataEntrada);
        
        state.bases.compras.forEach(item => {
            const cod = normalizarCod(item[c_cod_compra]);
            if (!cod) return;

            let qtdPedida = c_of_qtd_pedida ? converterParaNumero(item[c_of_qtd_pedida]) : 0;
            let qtdRecebida = c_rec_qtd ? converterParaNumero(item[c_rec_qtd]) : 0;
            let sitOF = c_of_sit ? normalizarString(item[c_of_sit]) : '';
            let sitSC = c_sc_sit ? normalizarString(item[c_sc_sit]) : '';
            let cancSC = c_sc_canc ? normalizarString(item[c_sc_canc]) : '';

            let isFechadaOuCancelada = sitOF.includes('fechada') || sitOF.includes('cancelada') || sitSC.includes('cancelado') || cancSC === 'sim' || cancSC === 's';
            let saldoPendente = 0;

            if (isFechadaOuCancelada) {
                saldoPendente = 0;
            } else if (c_of_qtd_pedida) {
                saldoPendente = qtdPedida - qtdRecebida;
                if (saldoPendente < 0) saldoPendente = 0; 
            } else {
                saldoPendente = c_qtd_compra_fallback ? converterParaNumero(item[c_qtd_compra_fallback]) : 0;
            }

            if (saldoPendente > 0) {
                mapComprasTransito.set(cod, (mapComprasTransito.get(cod) || 0) + saldoPendente);
            }

            if (c_sc_dt && c_rec_dt && item[c_sc_dt] && item[c_rec_dt]) {
                const parseData = (dStr) => {
                    const partes = String(dStr).trim().split('/');
                    if (partes.length === 3) return new Date(partes[2].split(' ')[0], partes[1] - 1, partes[0]);
                    return new Date(dStr);
                };
                let dtCria = parseData(item[c_sc_dt]);
                let dtEntr = parseData(item[c_rec_dt]);
                if (!isNaN(dtCria) && !isNaN(dtEntr)) {
                    let dias = Math.ceil(Math.abs(dtEntr - dtCria) / (1000 * 60 * 60 * 24));
                    if (dias > 0 && dias < 300) { 
                        if(!mapLeadTimeHistorico.has(cod)) mapLeadTimeHistorico.set(cod, []);
                        mapLeadTimeHistorico.get(cod).push(dias);
                    }
                }
            }
        });
    }

    const mapLeadTimeMedio = new Map();
    for (let [k, v] of mapLeadTimeHistorico) {
        let media = Math.round(v.reduce((a,b)=>a+b,0) / v.length);
        mapLeadTimeMedio.set(k, media);
    }

    setProgress(93, "Apurando Consumo Real do Mês...");
    await new Promise(r => setTimeout(r, 50));

    let cs_mes = encontrarChave(state.bases.consumos[0], colMesMovimento);
    let cs_cod = encontrarChave(state.bases.consumos[0], colCod);
    let cs_qtd = encontrarChave(state.bases.consumos[0], colQtdConsumo);

    const mapConsumosTotais = new Map();
    let encontrouConsumoNoMesAlvo = false;

    if (state.bases.consumos.length > 0 && cs_mes) {
        state.bases.consumos.forEach(item => {
            const mesStr = normalizarString(item[cs_mes]);
            const mesItemNum = ordemMeses[mesStr];
            if (mesItemNum === mesAnteriorNum) {
                encontrouConsumoNoMesAlvo = true;
                const cod = normalizarCod(item[cs_cod]);
                const qtd = converterParaNumero(item[cs_qtd]);
                if (cod) mapConsumosTotais.set(cod, (mapConsumosTotais.get(cod) || 0) + qtd);
            }
        });
    }

    setProgress(95, "Consolidando Base Mestre e Locais...");
    await new Promise(r => setTimeout(r, 50)); 

    const b_cod = encontrarChave(state.bases.baseItens[0], colCod);
    const b_desc = encontrarChave(state.bases.baseItens[0], colDesc);
    const b_saldo = encontrarChave(state.bases.baseItens[0], colQtdSaldo);
    const b_min = encontrarChave(state.bases.baseItens[0], colMin);
    const b_max = encontrarChave(state.bases.baseItens[0], colMax);
    const b_custo = encontrarChave(state.bases.baseItens[0], colCusto);
    const b_um = encontrarChave(state.bases.baseItens[0], colUM);
    const b_filialNm = encontrarChave(state.bases.baseItens[0], colFilialNm);
    const b_filialId = encontrarChave(state.bases.baseItens[0], colFilialId);
    const b_grupo = encontrarChave(state.bases.baseItens[0], colGrupo);
    const b_classe = encontrarChave(state.bases.baseItens[0], colClasse);
    const b_rep = encontrarChave(state.bases.baseItens[0], colReparticao);
    const b_prat = encontrarChave(state.bases.baseItens[0], colPrateleira);
    const b_div = encontrarChave(state.bases.baseItens[0], colDivisao);
    const b_localId = encontrarChave(state.bases.baseItens[0], colLocalId);
    const b_localNm = encontrarChave(state.bases.baseItens[0], colLocalNm);
    const b_valorTotal = encontrarChave(state.bases.baseItens[0], colValorTotal);

    const mapConsolidado = new Map();
    state.setLocaisUnicos.clear();
    const setFiliaisUnicas = new Set(); 

    state.bases.baseItens.forEach(item => {
        let codBruto = String(item[b_cod] || '').replace(/\./g, '');
        const codNorm = normalizarCod(codBruto);
        if(!codNorm) return; 

        let filialIdBase = normalizarCod(item[b_filialId]);
        let filialNm = item[b_filialNm] || '';
        let localIdRaw = String(item[b_localId] || '').trim();
        let localNm = (item[b_localNm] || '').toString().trim();
        let reparticao = (item[b_rep] || '-').toString().trim();
        const prateleira = item[b_prat] || '-';
        const divisao = item[b_div] || '-';

        if (filialIdBase === '704') {
            let locNum = parseInt(localIdRaw, 10);
            if (['101', '0101', '299', '0299', '295', '0295'].includes(localIdRaw) || locNum >= 599) {
                filialNm = 'Rolândia - Alp. Preparados'; filialIdBase = '704_ALP';
            } else if (locNum > 0 && locNum < 599) {
                filialNm = 'Rolândia - Ab. Aves'; filialIdBase = '704_AB';
            } else {
                filialNm = 'Rolândia - Alp. Preparados'; filialIdBase = '704_ALP';
            }
        }
        
        if (filialNm && filialNm !== '-') setFiliaisUnicas.add(filialNm);
        
        let localNameCompleto = localIdRaw ? `${localIdRaw} - ${localNm}` : localNm;
        if (localNameCompleto && localNameCompleto !== '-' && localNameCompleto !== '') {
            state.setLocaisUnicos.add(`${filialNm} | ${localNameCompleto}`);
        }

        const saldoLinha = converterParaNumero(item[b_saldo]);
        const minimoLinha = converterParaNumero(item[b_min]);
        const maximoLinha = converterParaNumero(item[b_max]);
        
        let isCritico = ['299', '0299', '295', '0295'].includes(localIdRaw) || localNm.includes('299') || localNm.includes('295');

        let valorTotalLinha = b_valorTotal ? converterParaNumero(item[b_valorTotal]) : 0;
        let custoUnitarioLinha = converterParaNumero(item[b_custo]);

        if (valorTotalLinha > 0 && saldoLinha > 0) custoUnitarioLinha = valorTotalLinha / saldoLinha;
        else if (custoUnitarioLinha > 0 && saldoLinha > 0) valorTotalLinha = custoUnitarioLinha * saldoLinha;

        const chave = codNorm + '|' + filialIdBase;

        if (!mapConsolidado.has(chave)) {
            mapConsolidado.set(chave, {
                cod: codBruto, codNorm: codNorm, 
                desc: item[b_desc] || "Item sem Descrição",
                um: item[b_um] || 'UN',
                filialNm: filialNm, filialIdBase: filialIdBase,
                grupo: item[b_grupo] || '', classe: item[b_classe] || '',
                saldo: 0, minimo: 0, maximo: 0, valorTotalGlobal: 0, custoUnitario: 0,
                leadTime: mapLeadTimeMedio.get(codNorm) || 15,
                locais: []
            });
        }

        const obj = mapConsolidado.get(chave);
        obj.saldo += saldoLinha;
        obj.valorTotalGlobal += valorTotalLinha;
        
        if (minimoLinha > obj.minimo) obj.minimo = minimoLinha;
        if (maximoLinha > obj.maximo) obj.maximo = maximoLinha;
        
        obj.locais.push({ 
            filialNm, localId: localIdRaw, localNm, reparticao, prateleira, divisao, 
            saldo: saldoLinha, custoUnitario: custoUnitarioLinha, isCritico
        });
    });

    const selectFilial = document.getElementById('select-filial');
    if (selectFilial) {
        selectFilial.innerHTML = '<option value="">Todas as Filiais</option>';
        Array.from(setFiliaisUnicas).sort().forEach(f => { selectFilial.innerHTML += `<option value="${f}">${f}</option>`; });
    }

    let baseSujaProcessada = Array.from(mapConsolidado.values()).map(item => {
        if (item.saldo === 0 && item.minimo === 0 && item.maximo === 0) return null; 

        if (item.saldo > 0 && item.valorTotalGlobal > 0) item.custoUnitario = item.valorTotalGlobal / item.saldo;
        else if (item.locais.length > 0) item.custoUnitario = item.locais[0].custoUnitario;

        const transito = mapComprasTransito.get(item.codNorm) || 0;
        const consumoMesAnteriorFisico = Math.abs(mapConsumosTotais.get(item.codNorm)) || 0;
        const valorImobilizado = item.valorTotalGlobal > 0 ? item.valorTotalGlobal : (item.saldo * item.custoUnitario);
        const consumoFinanceiro = consumoMesAnteriorFisico * item.custoUnitario;

        let diasGiroMensal = Infinity;
        if (consumoFinanceiro > 0) diasGiroMensal = Math.round((valorImobilizado / consumoFinanceiro) * 30);
        
        let diasGiroAnual = Infinity;
        if ((consumoFinanceiro * 12) > 0) diasGiroAnual = Math.round((valorImobilizado / (consumoFinanceiro * 12)) * 365);

        let isLocalCriticoMacro = item.locais.some(l => l.isCritico && l.saldo > 0);
        let saldoCritico = item.locais.filter(l => l.isCritico).reduce((sum, l) => sum + l.saldo, 0);
        item.saldoUtil = item.saldo - saldoCritico;

        let consumoFisicoDiario = consumoMesAnteriorFisico / 30;
        let minSugerido = Math.ceil(consumoFisicoDiario * item.leadTime);
        let maxSugerido = Math.ceil(minSugerido + (consumoMesAnteriorFisico * 1));
        if (consumoMesAnteriorFisico === 0) { minSugerido = 0; maxSugerido = 0; }
        
        item.sugestaoMin = minSugerido; item.sugestaoMax = maxSugerido;

        let status = 'Estoque Normal'; let statusBadge = 'badge-normal';
        if (item.saldo <= 0 && transito <= 0) { status = 'Ruptura Crítica (Sem Pedido)'; statusBadge = 'badge-ruptura-critica'; } 
        else if (item.saldo <= 0 && transito > 0) { status = 'Ruptura (Em Trânsito)'; statusBadge = 'badge-ruptura-transito'; } 
        else if (item.saldo > 0 && consumoMesAnteriorFisico <= 0) { 
            status = isLocalCriticoMacro ? 'Normal/Local Crítico' : 'Obsoleto (Sem Consumo)';
            statusBadge = isLocalCriticoMacro ? 'badge-normal-critico' : 'badge-obsoleto';
        } 
        else if (item.saldo > 0 && item.minimo > 0 && item.saldo < item.minimo) { status = 'Abaixo Mínimo'; statusBadge = 'badge-abaixo'; }
        else if (item.maximo > 0 && item.saldo > item.maximo) { status = 'Excesso Estoque'; statusBadge = 'badge-acima'; }

        item.reparticao = item.locais[0]?.reparticao || '-';
        item.prateleira = item.locais[0]?.prateleira || '-';
        item.divisao = item.locais[0]?.divisao || '-';

        const searchString = (item.codNorm + " " + normalizarString(item.desc) + " " + normalizarString(item.grupo) + " " + normalizarString(item.classe) + " rep " + item.reparticao + " prat " + item.prateleira + " div " + item.divisao).toLowerCase();

        return {
            ...item, transito, consumo: consumoMesAnteriorFisico, consumoFinanceiro, 
            diasGiroMensal, diasGiroAnual, valorImobilizado, status, statusBadge, curva: 'C', searchString,
            temImagem: state.mapeamentoDeImagemAtivo ? state.imagensMapeadas.has(item.codNorm) : null
        };
    }).filter(i => i !== null);

    const itemsParaABC = [...baseSujaProcessada].sort((a, b) => b.consumoFinanceiro - a.consumoFinanceiro);
    const consumoTotalFinanceiroGlobal = itemsParaABC.reduce((acc, curr) => acc + curr.consumoFinanceiro, 0);
    let consumoAcumulado = 0;

    itemsParaABC.forEach(item => {
        if (consumoTotalFinanceiroGlobal > 0 && item.consumoFinanceiro > 0) {
            consumoAcumulado += item.consumoFinanceiro;
            const perc = consumoAcumulado / consumoTotalFinanceiroGlobal;
            if (perc <= 0.80) item.curva = 'A';
            else if (perc <= 0.95) item.curva = 'B';
            else item.curva = 'C';
        } else { item.curva = 'C'; }
    });

    state.itensProcessados = baseSujaProcessada;
    
    // OFs Ativas
    state.ordesAtivasFiltradas = [];
    state.setStatusOFUnicos.clear();

    if (state.bases.compras.length > 0) {
        const c_sc = encontrarChave(state.bases.compras[0], colScCodigo);
        const c_of = encontrarChave(state.bases.compras[0], colOfCodigo);
        const c_desc = encontrarChave(state.bases.compras[0], colDesc);
        const c_forn = encontrarChave(state.bases.compras[0], colOfNomeFornecedor);
        const c_dt_ent = encontrarChave(state.bases.compras[0], colOfDataEntrega);
        
        const mapaItensParaFilial = new Map(state.itensProcessados.map(i => [i.codNorm, i]));
        
        state.bases.compras.forEach(linha => {
            let qtdPedida = c_of_qtd_pedida ? converterParaNumero(linha[c_of_qtd_pedida]) : 0;
            let qtdRecebida = c_rec_qtd ? converterParaNumero(linha[c_rec_qtd]) : 0;
            let sitOFOriginal = c_of_sit ? linha[c_of_sit] : 'Pendente';
            let sitOF = c_of_sit ? normalizarString(linha[c_of_sit]) : '';
            let sitSC = c_sc_sit ? normalizarString(linha[c_sc_sit]) : '';
            let cancSC = c_sc_canc ? normalizarString(linha[c_sc_canc]) : '';
            
            let isFechadaOuCancelada = sitOF.includes('fechada') || sitOF.includes('cancelada') || sitSC.includes('cancelado') || cancSC === 'sim' || cancSC === 's';
            let saldoPendente = 0;

            if (isFechadaOuCancelada) {
                saldoPendente = 0; 
            } else if (c_of_qtd_pedida) {
                saldoPendente = qtdPedida - qtdRecebida;
                if(saldoPendente < 0) saldoPendente = 0;
            } else {
                saldoPendente = c_qtd_compra_fallback ? converterParaNumero(linha[c_qtd_compra_fallback]) : 0;
                qtdPedida = saldoPendente;
            }

            if(saldoPendente > 0) {
                let cod = normalizarCod(linha[c_cod_compra]);
                let objItem = mapaItensParaFilial.get(cod);
                let filialDaOF = objItem ? objItem.filialNm : 'Geral';

                if (sitOFOriginal) state.setStatusOFUnicos.add(sitOFOriginal);

                state.ordesAtivasFiltradas.push({
                    sc: linha[c_sc] || '-', of: linha[c_of] || '-',
                    codProd: linha[c_cod_compra] || '-', descProd: linha[c_desc] || '-',
                    fornecedor: linha[c_forn] || 'Não Informado', dataEntrega: linha[c_dt_ent] || 'Sem Data',
                    qtdPedidaOriginal: qtdPedida, saldoOF: saldoPendente, sitOFOriginal: sitOFOriginal,
                    filial: filialDaOF, searchStr: (linha[c_of] + " " + linha[c_sc] + " " + linha[c_cod_compra] + " " + linha[c_forn]).toLowerCase()
                });
            }
        });
    }

    const selectStatusOf = document.getElementById('select-status-of');
    if (selectStatusOf) {
        selectStatusOf.innerHTML = '<option value="">Todos os Status</option>';
        Array.from(state.setStatusOFUnicos).sort().forEach(s => {
            if(s) selectStatusOf.innerHTML += `<option value="${s}">${s}</option>`;
        });
    }

    setProgress(100, "Renderizando Interface...", "success");

    setTimeout(() => {
        window.dispararFiltrosSemAtraso(); // Chama do window que faremos no main.js
        fecharLoader();
        state.isFetchingData = false; 
    }, 600);
}

export function exportarComprasExcel() {
    const necessitaCompra = state.itensFiltrados.filter(i => (i.saldo <= 0 || i.saldo < i.minimo) && i.minimo > 0 && i.maximo > 0);
    if(necessitaCompra.length === 0) { mostrarToast("Nenhum dado crítico na tela.", "warning"); return; }
    
    let csvContent = "\uFEFFCódigo;Descrição;Filial;Saldo Atual;Mínimo;Máximo;Sugestão Compra;Custo Unitário;Valor Estimado Compra\n";
    necessitaCompra.sort((a,b) => a.saldo - b.saldo).forEach(i => {
        let sug = i.maximo - i.saldo;
        let val = sug * i.custoUnitario;
        csvContent += `${i.cod};${i.desc.replace(/;/g, ',')};${i.filialNm.replace(/;/g, ',')};${i.saldo};${i.minimo};${i.maximo};${sug};${i.custoUnitario.toFixed(2)};${val.toFixed(2)}\n`;
    });
    
    downloadCSV(csvContent, `Necessidade_Compra_${new Date().toISOString().slice(0,10)}.csv`);
}

export function exportarRevisaoExcel() {
    const itensRevisao = state.itensFiltrados.filter(i => (i.consumoFinanceiro === 0 && (i.minimo > 0 || i.maximo > 0)) || (i.saldoUtil < i.minimo && i.consumoFinanceiro > 0) || (i.saldoUtil > i.maximo && i.maximo > 0));
    if(itensRevisao.length === 0) { mostrarToast("Nenhum dado de revisão na tela.", "warning"); return; }

    let csvContent = "\uFEFFCódigo;Descrição;Filial;Saldo Útil;Mínimo Atual;Máximo Atual;Sugestão Novo Mín;Sugestão Novo Máx;Custo Consumo Mês;Ação Recomendada\n";
    itensRevisao.forEach(i => {
        let acao = i.consumoFinanceiro === 0 ? "Revisar/Zerar" : i.saldoUtil > i.maximo ? "Reduzir Máximo" : "Aumentar Mínimo";
        csvContent += `${i.cod};${i.desc.replace(/;/g, ',')};${i.filialNm.replace(/;/g, ',')};${i.saldoUtil};${i.minimo};${i.maximo};${i.sugestaoMin};${i.sugestaoMax};${i.consumoFinanceiro.toFixed(2)};${acao}\n`;
    });

    downloadCSV(csvContent, `Revisao_MinMax_${new Date().toISOString().slice(0,10)}.csv`);
}

function downloadCSV(content, fileName) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    mostrarToast("Planilha baixada com sucesso!", "success");
}