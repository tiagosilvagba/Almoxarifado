import { bases } from './state.js';
import { setProgress, fecharLoader, mostrarErroLoaderFatal, mostrarToast } from './loader.js';
import { encontrarChave, normalizarString, normalizarCod, converterParaNumero } from './utils.js';
import { dispararFiltrosSemAtraso } from './filters.js';

export async function processarInteligencia() {
    if (bases.baseItens.length === 0) { 
        mostrarToast("Erro: Arquivo Mestre não localizado.", "error"); 
        setProgress(window.loaderProgress, "Erro Crítico: Base Mestre ausente.", 'error');
        mostrarErroLoaderFatal();
        window.isFetchingData = false; return; 
    }

    const colCod = ['cd item', 'cod produto', 'codigo', 'cod', 'item', 'sc - cód. produto', 'of - cód. produto'];
    const colDesc = ['nome do item detalhado', 'nome do item resumido', 'nome produto', 'desc', 'sc - nome produto', 'of - nome produto'];
    const colQtdSaldo = ['qt saldo atual', 'saldo livre', 'saldo']; 
    const colQtdConsumo = ['qt movimento', 'quantidade consumida', 'quantidade'];
    const colQtdCompraFallback = ['of - saldo', 'saldo aberto', 'quantidade', 'qtde', 'sc - quantidade'];
    const colCusto = ['vl custo unitario atual', 'custo unitario', 'custo'];
    const colMin = ['qt minimo', 'minimo', 'min'];
    const colMax = ['qt maximo', 'maximo', 'max'];
    const colFilialId = ['cd filial']; 
    const colFilialNm = ['nm filial', 'filial', 'of - filial entrega', 'sc - filial'];
    const colGrupo = ['nm grupo', 'grupo', 'categoria'];
    const colClasse = ['nm classe', 'classe'];
    const colReparticao = ['cd reparticao', 'reparticao'];
    const colPrateleira = ['cd prateleira', 'prateleira'];
    const colDivisao = ['cd divisao', 'divisao'];
    const colMesMovimento = ['mês movimento', 'mes movimento', 'mes', 'mês', 'periodo'];
    const colUM = ['cd unidade medida', 'un', 'um'];
    const colLocalId = ['cd local', 'cod local', 'local'];
    const colLocalNm = ['nm local', 'nome local', 'estoque', 'desc local', 'desc. local'];
    const colValorTotal = ['vl total', 'valor total', 'custo total', 'saldo financeiro', 'vl saldo', 'valor do saldo'];
    
    const colScDataCriacao = ['sc - data criação', 'data criacao sc', 'data criacao'];
    const colRecDataEntrada = ['rec - dt entrada', 'dt entrada', 'data entrada'];
    const colOfDataEntrega = ['of - data entrega', 'data entrega of', 'dt entrega of'];
    const colScCodigo = ['sc - código', 'sc codigo', 'sc'];
    const colOfCodigo = ['of - codigo', 'of codigo', 'ordem fornecimento'];
    const colOfNomeFornecedor = ['of - nome fornecedor', 'fornecedor'];
    const colOfQtdPedida = ['of - qtd. solicitada', 'quantidade pedida', 'qtd solicitada', 'of - quantidade'];
    const colRecQtd = ['of - qtd. entregue', 'of - qtd entregue', 'qtd entregue', 'rec - quantidade', 'quantidade recebida', 'qtd recebida'];
    const colOfSit = ['of - situação of', 'situacao of', 'status of'];
    const colScSit = ['sc - situação', 'situacao sc'];
    const colScCanc = ['sc - cancelado', 'sc cancelado', 'cancelado'];

    const dataAtual = new Date();
    let mesAnteriorNum = dataAtual.getMonth(); 
    if (mesAnteriorNum === 0) mesAnteriorNum = 12; 

    const nomesMesesDisplay = ['', 'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
    window.mesConsumoAtual = nomesMesesDisplay[mesAnteriorNum]; 
    const ordemMeses = { 'janeiro':1, 'jan':1, 'fevereiro':2, 'fev':2, 'março':3, 'marco':3, 'mar':3, 'abril':4, 'abr':4, 'maio':5, 'mai':5, 'junho':6, 'jun':6, 'julho':7, 'jul':7, 'agosto':8, 'ago':8, 'setembro':9, 'set':9, 'outubro':10, 'out':10, 'novembro':11, 'nov':11, 'dezembro':12, 'dez':12 };

    setProgress(92, "Processando Compras (OFs em Trânsito) e Lead Time...");
    await new Promise(r => setTimeout(r, 50)); 

    const mapComprasTransito = new Map(); 
    const mapLeadTimeHistorico = new Map(); 
    
    let c_cod_compra = null, c_of_qtd_pedida = null, c_rec_qtd = null, c_of_sit = null, c_sc_sit = null, c_sc_canc = null, c_qtd_compra_fallback = null, c_sc_dt = null, c_rec_dt = null;

    if(bases.compras.length > 0) {
        c_cod_compra = encontrarChave(bases.compras[0], colCod);
        c_of_qtd_pedida = encontrarChave(bases.compras[0], colOfQtdPedida);
        c_rec_qtd = encontrarChave(bases.compras[0], colRecQtd);
        c_of_sit = encontrarChave(bases.compras[0], colOfSit);
        c_sc_sit = encontrarChave(bases.compras[0], colScSit);
        c_sc_canc = encontrarChave(bases.compras[0], colScCanc);
        c_qtd_compra_fallback = encontrarChave(bases.compras[0], colQtdCompraFallback);
        c_sc_dt = encontrarChave(bases.compras[0], colScDataCriacao);
        c_rec_dt = encontrarChave(bases.compras[0], colRecDataEntrada);
        
        bases.compras.forEach(item => {
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
                    if(dias > 0 && dias < 300) { 
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

    let cs_mes = encontrarChave(bases.consumos[0], colMesMovimento);
    let cs_cod = encontrarChave(bases.consumos[0], colCod);
    let cs_qtd = encontrarChave(bases.consumos[0], colQtdConsumo);
    let cs_local = encontrarChave(bases.consumos[0], ['cd local', 'cod local', 'local', 'nm local', 'nome local']);

    const mapConsumosTotais = new Map();
    let encontrouConsumoNoMesAlvo = false;

    if(bases.consumos.length > 0 && cs_mes) {
        bases.consumos.forEach(item => {
            const mesStr = normalizarString(item[cs_mes]);
            const mesItemNum = ordemMeses[mesStr];
            if (mesItemNum === mesAnteriorNum) {
                encontrouConsumoNoMesAlvo = true;
                const cod = normalizarCod(item[cs_cod]);

                if (cs_local) {
                    let localVal = String(item[cs_local]).trim();
                    if (localVal === '299' || localVal === '0299' || localVal === '295' || localVal === '0295' || localVal.includes('299') || localVal.includes('295')) {
                        return; 
                    }
                }

                const qtd = converterParaNumero(item[cs_qtd]);
                if (cod) {
                    const chave = cod; 
                    mapConsumosTotais.set(chave, (mapConsumosTotais.get(chave) || 0) + qtd);
                }
            }
        });
    }

    setProgress(95, "Consolidando Base Mestre e Locais de Estoque...");
    await new Promise(r => setTimeout(r, 50)); 

    const b_cod = encontrarChave(bases.baseItens[0], colCod);
    const b_desc = encontrarChave(bases.baseItens[0], colDesc);
    const b_saldo = encontrarChave(bases.baseItens[0], colQtdSaldo);
    const b_min = encontrarChave(bases.baseItens[0], colMin);
    const b_max = encontrarChave(bases.baseItens[0], colMax);
    const b_custo = encontrarChave(bases.baseItens[0], colCusto);
    const b_um = encontrarChave(bases.baseItens[0], colUM);
    const b_filialNm = encontrarChave(bases.baseItens[0], colFilialNm);
    const b_filialId = encontrarChave(bases.baseItens[0], colFilialId);
    const b_grupo = encontrarChave(bases.baseItens[0], colGrupo);
    const b_classe = encontrarChave(bases.baseItens[0], colClasse);
    const b_rep = encontrarChave(bases.baseItens[0], colReparticao);
    const b_prat = encontrarChave(bases.baseItens[0], colPrateleira);
    const b_div = encontrarChave(bases.baseItens[0], colDivisao);
    const b_localId = encontrarChave(bases.baseItens[0], colLocalId);
    const b_localNm = encontrarChave(bases.baseItens[0], colLocalNm);
    const b_valorTotal = encontrarChave(bases.baseItens[0], colValorTotal);

    const mapConsolidado = new Map();
    window.setLocaisUnicos.clear();
    const setFiliaisUnicas = new Set(); 

    bases.baseItens.forEach(item => {
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
            if (localIdRaw === '101' || localIdRaw === '0101' || localIdRaw === '299' || localIdRaw === '0299' || localIdRaw === '295' || localIdRaw === '0295' || locNum >= 599) {
                filialNm = 'Rolândia - Alp. Preparados';
                filialIdBase = '704_ALP';
            } else if (locNum > 0 && locNum < 599) {
                filialNm = 'Rolândia - Ab. Aves';
                filialIdBase = '704_AB';
            } else {
                filialNm = 'Rolândia - Alp. Preparados'; 
                filialIdBase = '704_ALP';
            }
        }
        
        if (filialNm && filialNm !== '-') setFiliaisUnicas.add(filialNm);
        
        let localNameCompleto = localIdRaw ? `${localIdRaw} - ${localNm}` : localNm;
        if (localNameCompleto && localNameCompleto !== '-' && localNameCompleto !== '') {
            window.setLocaisUnicos.add(`${filialNm} | ${localNameCompleto}`);
        }

        const saldoLinha = converterParaNumero(item[b_saldo]);
        const minimoLinha = converterParaNumero(item[b_min]);
        const maximoLinha = converterParaNumero(item[b_max]);
        
        let isCritico = false;
        if (['299', '0299', '295', '0295'].includes(localIdRaw) || localNm.includes('299') || localNm.includes('295')) {
            isCritico = true;
        }

        let valorTotalLinha = b_valorTotal ? converterParaNumero(item[b_valorTotal]) : 0;
        let custoUnitarioLinha = converterParaNumero(item[b_custo]);

        if (valorTotalLinha > 0 && saldoLinha > 0) {
            custoUnitarioLinha = valorTotalLinha / saldoLinha;
        } else if (custoUnitarioLinha > 0 && saldoLinha > 0) {
            valorTotalLinha = custoUnitarioLinha * saldoLinha;
        }

        const chave = codNorm + '|' + filialIdBase;

        if (!mapConsolidado.has(chave)) {
            mapConsolidado.set(chave, {
                cod: codBruto, codNorm: codNorm, 
                desc: item[b_desc] || "Item sem Descrição",
                um: item[b_um] || 'UN',
                filialNm: filialNm, filialIdBase: filialIdBase,
                grupo: item[b_grupo] || '',
                classe: item[b_classe] || '',
                saldo: 0, minimo: 0, maximo: 0, 
                valorTotalGlobal: 0,
                custoUnitario: 0,
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
            filialNm: filialNm,
            localId: localIdRaw,
            localNm: localNm,
            reparticao: reparticao, 
            prateleira: prateleira, 
            divisao: divisao, 
            saldo: saldoLinha,
            custoUnitario: custoUnitarioLinha,
            isCritico: isCritico
        });
    });

    const selectFilial = document.getElementById('select-filial');
    if (selectFilial) {
        selectFilial.innerHTML = '<option value="">Todas as Filiais</option>';
        Array.from(setFiliaisUnicas).sort().forEach(f => { selectFilial.innerHTML += `<option value="${f}">${f}</option>`; });
    }
    const selectLocal = document.getElementById('select-local');
    if (selectLocal) {
        selectLocal.innerHTML = '<option value="">Todos os Locais</option>';
        Array.from(window.setLocaisUnicos).sort().forEach(l => { selectLocal.innerHTML += `<option value="${l}">${l}</option>`; });
    }

    setProgress(98, "Calculando KPIs e Recomendações...");
    await new Promise(r => setTimeout(r, 50)); 

    let baseSujaProcessada = Array.from(mapConsolidado.values()).map(item => {
        const transito = mapComprasTransito.get(item.codNorm) || 0;

        if (item.saldo === 0 && item.minimo === 0 && item.maximo === 0 && transito === 0) return null; 

        if (item.saldo > 0 && item.valorTotalGlobal > 0) {
            item.custoUnitario = item.valorTotalGlobal / item.saldo;
        } else if (item.locais.length > 0) {
            item.custoUnitario = item.locais[0].custoUnitario;
        }

        const consumoMesAnteriorFisico = Math.abs(mapConsumosTotais.get(item.codNorm)) || 0;
        const valorImobilizado = item.valorTotalGlobal > 0 ? item.valorTotalGlobal : (item.saldo * item.custoUnitario);
        const consumoFinanceiro = consumoMesAnteriorFisico * item.custoUnitario;

        let diasGiroMensal = Infinity;
        if (consumoFinanceiro > 0) diasGiroMensal = Math.round((valorImobilizado / consumoFinanceiro) * 30);
        
        let consumoAnualFinanceiro = consumoFinanceiro * 12;
        let diasGiroAnual = Infinity;
        if (consumoAnualFinanceiro > 0) diasGiroAnual = Math.round((valorImobilizado / consumoAnualFinanceiro) * 365);

        let isLocalCriticoMacro = item.locais.some(l => l.isCritico && l.saldo > 0);

        let saldoCritico = item.locais.filter(l => l.isCritico).reduce((sum, l) => sum + l.saldo, 0);
        let saldoUtil = item.saldo - saldoCritico;
        item.saldoUtil = saldoUtil;

        let consumoFisicoDiario = consumoMesAnteriorFisico / 30;
        let minSugerido = Math.ceil(consumoFisicoDiario * item.leadTime);
        let maxSugerido = Math.ceil(minSugerido + (consumoMesAnteriorFisico * 1)); 
        if (consumoMesAnteriorFisico === 0) { minSugerido = 0; maxSugerido = 0; }
        
        item.sugestaoMin = minSugerido;
        item.sugestaoMax = maxSugerido;

        let status = 'Estoque Normal'; let statusBadge = 'badge-normal';
        if (item.saldo <= 0 && transito <= 0) { status = 'Ruptura Crítica (Sem Pedido)'; statusBadge = 'badge-ruptura-critica'; } 
        else if (item.saldo <= 0 && transito > 0) { status = 'Ruptura (Em Trânsito)'; statusBadge = 'badge-ruptura-transito'; } 
        else if (item.saldo > 0 && consumoMesAnteriorFisico <= 0) { 
            if (isLocalCriticoMacro) {
                status = 'Normal/Local Crítico'; statusBadge = 'badge-normal-critico';
            } else {
                status = 'Obsoleto (Sem Consumo)'; statusBadge = 'badge-obsoleto'; 
            }
        } 
        else if (item.saldo > 0 && item.minimo > 0 && item.saldo < item.minimo) { status = 'Abaixo Mínimo'; statusBadge = 'badge-abaixo'; }
        else if (item.maximo > 0 && item.saldo > item.maximo) { status = 'Excesso Estoque'; statusBadge = 'badge-acima'; }

        item.reparticao = item.locais[0]?.reparticao || '-';
        item.prateleira = item.locais[0]?.prateleira || '-';
        item.divisao = item.locais[0]?.divisao || '-';

        const searchString = (item.codNorm + " " + normalizarString(item.desc) + " " + normalizarString(item.grupo) + " " + normalizarString(item.classe) + " rep " + item.reparticao + " prat " + item.prateleira + " div " + item.divisao).toLowerCase();

        return {
            ...item,
            transito, consumo: consumoMesAnteriorFisico, consumoFinanceiro, 
            diasGiroMensal, diasGiroAnual, valorImobilizado,
            status, statusBadge, curva: 'C', searchString,
            temImagem: window.mapeamentoDeImagemAtivo ? window.imagensMapeadas.has(item.codNorm) : null
        };
    }).filter(i => i !== null);

    if(baseSujaProcessada.length === 0) { fecharLoader(); window.isFetchingData = false; return; }

    baseSujaProcessada.sort((a, b) => parseFloat(a.codNorm) - parseFloat(b.codNorm));

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

    window.itensProcessados = baseSujaProcessada;
    
    window.ordesAtivasFiltradas = [];
    window.setStatusOFUnicos.clear();

    if(bases.compras.length > 0) {
        const c_sc = encontrarChave(bases.compras[0], ['sc - código', 'sc codigo', 'sc']);
        const c_of = encontrarChave(bases.compras[0], ['of - codigo', 'of codigo', 'ordem fornecimento']);
        const c_desc = encontrarChave(bases.compras[0], colDesc);
        const c_forn = encontrarChave(bases.compras[0], colOfNomeFornecedor);
        const c_dt_ent = encontrarChave(bases.compras[0], colOfDataEntrega);
        const c_solicitante = encontrarChave(bases.compras[0], ['sc - nome solicitante', 'sc solicitante', 'nome solicitante', 'requisitante']);
        
        const mapaItensParaFilial = new Map(window.itensProcessados.map(i => [i.codNorm, i]));
        
        bases.compras.forEach(linha => {
            let qtdPedida = colOfQtdPedida ? converterParaNumero(linha[encontrarChave(linha, colOfQtdPedida)]) : 0;
            let qtdRecebida = colRecQtd ? converterParaNumero(linha[encontrarChave(linha, colRecQtd)]) : 0;
            let sitOFOriginal = colOfSit ? linha[encontrarChave(linha, colOfSit)] : 'Pendente';
            let sitOF = colOfSit ? normalizarString(linha[encontrarChave(linha, colOfSit)]) : '';
            let sitSC = colScSit ? normalizarString(linha[encontrarChave(linha, colScSit)]) : '';
            let cancSC = colScCanc ? normalizarString(linha[encontrarChave(linha, colScCanc)]) : '';
            
            let isFechadaOuCancelada = sitOF.includes('fechada') || sitOF.includes('cancelada') || sitSC.includes('cancelado') || cancSC === 'sim' || cancSC === 's';
            let saldoPendente = 0;

            if (isFechadaOuCancelada) {
                saldoPendente = 0; 
            } else if (colOfQtdPedida) {
                saldoPendente = qtdPedida - qtdRecebida;
                if(saldoPendente < 0) saldoPendente = 0;
            } else {
                saldoPendente = colQtdCompraFallback ? converterParaNumero(linha[encontrarChave(linha, colQtdCompraFallback)]) : 0;
                qtdPedida = saldoPendente; 
            }

            if(saldoPendente > 0) {
                let cod = normalizarCod(linha[encontrarChave(linha, colCod)]);
                let objItem = mapaItensParaFilial.get(cod);
                let filialDaOF = objItem ? objItem.filialNm : 'Geral';
                let req = c_solicitante && linha[c_solicitante] ? linha[c_solicitante].trim() : 'Não Informado';

                if (sitOFOriginal) window.setStatusOFUnicos.add(sitOFOriginal);

                window.ordesAtivasFiltradas.push({
                    sc: c_sc && linha[c_sc] ? linha[c_sc] : '-',
                    of: c_of && linha[c_of] ? linha[c_of] : '-',
                    codProd: linha[encontrarChave(linha, colCod)] || '-',
                    descProd: c_desc && linha[c_desc] ? linha[c_desc] : '-',
                    fornecedor: c_forn && linha[c_forn] ? linha[c_forn] : 'Não Informado',
                    solicitante: req,
                    dataEntrega: c_dt_ent && linha[c_dt_ent] ? linha[c_dt_ent] : 'Sem Data',
                    qtdPedidaOriginal: qtdPedida,
                    saldoOF: saldoPendente,
                    sitOFOriginal: sitOFOriginal,
                    filial: filialDaOF,
                    searchStr: ((c_of && linha[c_of] ? linha[c_of] : '') + " " + (c_sc && linha[c_sc] ? linha[c_sc] : '') + " " + (linha[encontrarChave(linha, colCod)] || '') + " " + (c_forn && linha[c_forn] ? linha[c_forn] : '') + " " + req).toLowerCase(),
                    linhaOriginal: linha 
                });
            }
        });
    }

    const selectStatusOf = document.getElementById('select-status-of');
    if (selectStatusOf) {
        selectStatusOf.innerHTML = '<option value="">Todos os Status</option>';
        Array.from(window.setStatusOFUnicos).sort().forEach(s => {
            if(s) selectStatusOf.innerHTML += `<option value="${s}">${s}</option>`;
        });
    }

    setProgress(100, "Renderizando Interface...", "success");
    
    const elTitleConsumo = document.getElementById('kpi-consumo-title');
    const elThConsumo = document.getElementById('th-consumo');
    if (elTitleConsumo) elTitleConsumo.innerText = `Custo do Consumo (${window.mesConsumoAtual})`;
    if (elThConsumo) elThConsumo.innerText = `Custo Consumo (${window.mesConsumoAtual})`; 

    setTimeout(() => {
        dispararFiltrosSemAtraso();
        if(!encontrouConsumoNoMesAlvo && bases.consumos.length > 0) {
            mostrarToast(`Atenção: Não detectamos saídas de ${window.mesConsumoAtual} no arquivo de consumos.`, "warning");
        } else {
            mostrarToast(`Inteligência Ativada. Consumo travado em ${window.mesConsumoAtual}.`, "success");
        }
        fecharLoader();
        window.isFetchingData = false; 
    }, 600);
}