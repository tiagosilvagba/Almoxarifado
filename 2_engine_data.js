// ==========================================================================
// 1. CARGA DE ARQUIVOS E IMAGENS
// ==========================================================================
async function carregarArquivosAutomaticamente() {
    if (isFetchingData) return; 
    isFetchingData = true;

    const loader = document.getElementById('tech-loader');
    if (loader) {
        loader.style.display = 'flex';
        loader.style.opacity = '1';
    }
    
    const ring = document.getElementById('loader-ring');
    if (ring) ring.classList.remove('error');
    
    const btnFallback = document.getElementById('btn-fallback');
    if (btnFallback) btnFallback.style.display = 'none';
    
    const logs = document.getElementById('loader-logs');
    if (logs) logs.innerHTML = '';
    
    setProgress(5, "Iniciando sincronização via Fetch API...");

    const arquivos = [
        { id: 'baseItens', url: '03 - Base_Itens.csv', statusId: 'status-base' },
        { id: 'compras', url: '01 - Compras.csv', statusId: 'status-compras' },
        { id: 'consumos', url: '02 - Consumos.csv', statusId: 'status-consumos' }
    ];

    let carregados = 0;
    let errosCriticos = false;
    const decoder = new TextDecoder('windows-1252'); 

    for (let i=0; i<arquivos.length; i++) {
        const arq = arquivos[i];
        setProgress(10 + (i*20), `Buscando arquivo: ${arq.url}...`);
        await new Promise(r => setTimeout(r, 100)); 
        
        const elStatus = document.getElementById(arq.statusId);
        try {
            if (typeof Papa === 'undefined') throw new Error("Biblioteca PapaParse offline ou não carregou.");
            
            const response = await fetch(arq.url, { cache: "no-store" });
            if (!response.ok) throw new Error(`Arquivo não encontrado (Erro HTTP ${response.status}). Atenção à exatidão do nome.`);
            
            const arrayBuffer = await response.arrayBuffer();
            const text = decoder.decode(arrayBuffer);
            
            setProgress(15 + (i*20), `Extraindo dados de ${arq.url}...`);
            await new Promise(r => setTimeout(r, 50)); 
            
            bases[arq.id] = parseCSVFast(text);
            
            setProgress(30 + (i*20), `✓ ${arq.url} (Lido e Extraído com Sucesso)`, 'success');
            if (elStatus) {
                elStatus.innerText = `✅ ${arq.url}`;
                elStatus.className = 'status-item status-ok';
            }
            carregados++;
        } catch (error) {
            let detalhe = error.message;
            if (detalhe.includes('Failed to fetch') || detalhe.includes('NetworkError')) {
                detalhe = "Falha de rede ou CORS. Você está rodando localmente sem servidor web?";
            }
            setProgress(loaderProgress, `[ERRO ${arq.url}] ${detalhe}`, 'error');
            if (elStatus) {
                elStatus.innerText = `❌ Falha: ${arq.url}`;
                elStatus.className = 'status-item status-erro';
            }
            errosCriticos = true;
        }
    }

    if (carregados === 3) {
        setProgress(90, "Modelos carregados. Iniciando consolidação...", 'success');
        setTimeout(processarInteligencia, 500);
    } else if (errosCriticos) {
        setProgress(loaderProgress, "Leitura automática interrompida por erro. Clique no botão de Upload Manual abaixo.", 'warning');
        mostrarErroLoaderFatal();
        isFetchingData = false;
    }
}

window.uploadManualMultiplo = function(event) {
    if (isFetchingData) return;
    isFetchingData = true;

    document.getElementById('loader-ring')?.classList.remove('error');
    document.getElementById('btn-fallback').style.display = 'none';
    document.getElementById('tech-loader').style.display = 'flex';
    document.getElementById('tech-loader').style.opacity = '1';
    document.getElementById('loader-logs').innerHTML = '';
    setProgress(10, "Iniciando processamento manual FileReader...");

    const files = event.target.files;
    let carregados = 0;
    const decoder = new TextDecoder('windows-1252');

    Array.from(files).forEach((file, idx) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const text = decoder.decode(e.target.result);
            const nomeLower = file.name.toLowerCase();
            
            let alvoId = null;
            if (nomeLower.includes('base')) alvoId = 'baseItens';
            else if (nomeLower.includes('compras')) alvoId = 'compras';
            else if (nomeLower.includes('consumos')) alvoId = 'consumos';

            if (alvoId) {
                bases[alvoId] = parseCSVFast(text);
                setProgress(20 + (idx*20), `✓ ${file.name} Importado com Sucesso.`, 'success');
                carregados++;
                if(carregados === files.length) {
                    setProgress(90, "Todos os arquivos manuais carregados. Iniciando Inteligência...", 'success');
                    setTimeout(processarInteligencia, 500);
                }
            }
        };
        reader.readAsArrayBuffer(file);
    });
    
    if (files.length === 0) { isFetchingData = false; fecharLoader(); }
}

window.mapearImagensPasta = function(event) {
    const files = event.target.files;
    if(files.length === 0) return;
    let count = 0;
    imagensMapeadas.clear();

    for(let i = 0; i < files.length; i++) {
        let fileName = files[i].name.toLowerCase();
        if(fileName.includes(' - 01.') || fileName.includes(' - 02.') || fileName.includes(' - 03.') || fileName.includes(' - 04.') || fileName.includes(' - 05.') || fileName.includes(' - 06.')) {
            let codBruto = fileName.split(' - ')[0];
            let codNorm = normalizarCod(codBruto);
            imagensMapeadas.add(codNorm);
            count++;
        }
    }
    mapeamentoDeImagemAtivo = true;

    if (itensProcessados.length > 0) {
        itensProcessados.forEach(item => { item.temImagem = imagensMapeadas.has(item.codNorm); });
        if (typeof dispararFiltrosSemAtraso === 'function') dispararFiltrosSemAtraso();
    }
    mostrarToast(`Sucesso: ${count} imagens mapeadas!`, "success");
}

// ==========================================================================
// 2. EXPORTAÇÃO PARA EXCEL
// ==========================================================================
window.exportarComprasExcel = function() {
    const necessitaCompra = itensFiltrados.filter(i => {
        let estoqueVirtual = i.saldo + i.transito;
        return (estoqueVirtual < i.minimo) && i.minimo > 0 && i.maximo > 0;
    });

    if(necessitaCompra.length === 0) {
        mostrarToast("Nenhum dado crítico na tela para exportar.", "warning");
        return;
    }
    
    let csvContent = "\uFEFF"; 
    csvContent += "Código;Descrição;Filial;Saldo Físico;Em Trânsito;Estoque Virtual;Giro Atual (Dias);Mínimo;Máximo;Sugestão Compra;Giro Pós-Compra (Dias);Custo Unitário;Valor Estimado Compra\n";
    
    necessitaCompra.sort((a,b) => (a.saldo + a.transito) - (b.saldo + b.transito)).forEach(i => {
        let estoqueVirtual = i.saldo + i.transito;
        let sug = i.maximo - estoqueVirtual;
        
        if(sug > 0) {
            let val = sug * i.custoUnitario;
            let descLimpa = i.desc.replace(/;/g, ',');
            let filialLimpa = i.filialNm.replace(/;/g, ',');
            
            let giroAtual = i.consumo > 0 ? Math.round((i.saldo / i.consumo) * 30) : 'Sem Consumo';
            let giroPos = i.consumo > 0 ? Math.round((i.maximo / i.consumo) * 30) : 'Sem Consumo';

            csvContent += `${i.cod};${descLimpa};${filialLimpa};${i.saldo};${i.transito};${estoqueVirtual};${giroAtual};${i.minimo};${i.maximo};${sug};${giroPos};${i.custoUnitario.toFixed(2)};${val.toFixed(2)}\n`;
        }
    });
    
    const blob = new Blob([csvContent.replace(/\./g, ',')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Necessidade_Compra_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    mostrarToast("Arquivo Excel baixado com sucesso!", "success");
}

window.exportarRevisaoExcel = function() {
    const itensRevisao = itensFiltrados.filter(i => {
        if (i.consumoFinanceiro === 0 && (i.minimo > 0 || i.maximo > 0)) return true;
        if (i.saldoUtil < i.minimo && i.consumoFinanceiro > 0) return true;
        if (i.saldoUtil > i.maximo && i.maximo > 0) return true;
        return false;
    });

    if(itensRevisao.length === 0) {
        mostrarToast("Nenhum dado de revisão na tela para exportar.", "warning");
        return;
    }

    let csvContent = "\uFEFF"; 
    csvContent += "Código;Descrição;Filial;Saldo Útil;Mínimo Atual;Máximo Atual;Sugestão Novo Mín;Sugestão Novo Máx;Custo Consumo Mês;Ação Recomendada\n";

    itensRevisao.forEach(i => {
        let acao = "";
        if (i.consumoFinanceiro === 0 && (i.minimo > 0 || i.maximo > 0)) {
            acao = "Revisar/Zerar (Sem Consumo)";
        } else if (i.saldoUtil > i.maximo && i.maximo > 0) {
            acao = "Reduzir Máximo (Excesso)";
        } else if (i.saldoUtil < i.minimo && i.consumoFinanceiro > 0) {
            acao = "Aumentar Mínimo (Risco)";
        }

        let descLimpa = i.desc.replace(/;/g, ',');
        let filialLimpa = i.filialNm.replace(/;/g, ',');
        csvContent += `${i.cod};${descLimpa};${filialLimpa};${i.saldoUtil};${i.minimo};${i.maximo};${i.sugestaoMin};${i.sugestaoMax};${i.consumoFinanceiro.toFixed(2)};${acao}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Revisao_MinMax_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    mostrarToast("Planilha de Revisão baixada com sucesso!", "success");
}

// ==========================================================================
// 3. MOTOR DE INTELIGÊNCIA E CONSOLIDAÇÃO FINANCEIRA
// ==========================================================================
async function processarInteligencia() {
    if (bases.baseItens.length === 0) { 
        mostrarToast("Erro: Arquivo Mestre não localizado.", "error"); 
        setProgress(loaderProgress, "Erro Crítico: Base Mestre ausente.", 'error');
        mostrarErroLoaderFatal();
        isFetchingData = false; return; 
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

    // TABELA DE COTAÇÃO ATUAL PARA CONVERSÃO DE MOEDAS (Base Comercial)
    const cotacoesMoeda = {
        'usd': 5.17, // Dólar Americano
        'eur': 5.97, // Euro
        'brl': 1.00, // Real Brasileiro (Base)
        'r$': 1.00
    };

    const dataAtual = new Date();
    let mesAnteriorNum = dataAtual.getMonth(); 
    if (mesAnteriorNum === 0) mesAnteriorNum = 12; 

    const nomesMesesDisplay = ['', 'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
    mesConsumoAtual = nomesMesesDisplay[mesAnteriorNum]; 
    const ordemMeses = { 'janeiro':1, 'jan':1, 'fevereiro':2, 'fev':2, 'março':3, 'marco':3, 'mar':3, 'abril':4, 'abr':4, 'maio':5, 'mai':5, 'junho':6, 'jun':6, 'julho':7, 'jul':7, 'agosto':8, 'ago':8, 'setembro':9, 'set':9, 'outubro':10, 'out':10, 'novembro':11, 'nov':11, 'dezembro':12, 'dez':12 };

    setProgress(92, "Processando Compras (com Conversão Cambial) e Lead Time...");
    await new Promise(r => setTimeout(r, 50)); 

    const mapComprasTransito = new Map(); 
    const mapLeadTimeHistorico = new Map(); 
    
    let c_cod_compra = null, c_of_qtd_pedida = null, c_rec_qtd = null, c_of_sit = null, c_sc_sit = null, c_sc_canc = null, c_qtd_compra_fallback = null, c_sc_dt = null, c_rec_dt = null, c_of_moeda = null;

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
        c_of_moeda = encontrarChave(bases.compras[0], ['of - moeda', 'moeda of', 'moeda']);
        
        bases.compras.forEach(item => {
            const cod = normalizarCod(item[c_cod_compra]);
            if (!cod) return;

            let qtdPedida = c_of_qtd_pedida ? converterParaNumero(item[c_of_qtd_pedida]) : 0;
            let qtdRecebida = c_rec_qtd ? converterParaNumero(item[c_rec_qtd]) : 0;
            let sitOF = c_of_sit ? normalizarString(item[c_of_sit]) : '';
            let sitSC = c_sc_sit ? normalizarString(item[c_sc_sit]) : '';
            let cancSC = c_sc_canc ? normalizarString(item[c_sc_canc]) : '';

            // Conversão de moeda aplicada caso exista fator cambial na linha
            let moedaStr = c_of_moeda && item[c_of_moeda] ? normalizarString(item[c_of_moeda]) : 'brl';
            let taxaConversao = cotacoesMoeda[moedaStr] || 1.00;

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
    setLocaisUnicos.clear();
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
                if (reparticao.toUpperCase() === 'AP' || reparticao.length === 1) {
                    filialNm = 'Rolândia - Alp. Preparados';
                    filialIdBase = '704_ALP';
                } else {
                    filialNm = 'Rolândia - Alp. Preparados'; 
                    filialIdBase = '704_ALP';
                }
            }
        }
        
        if (filialNm && filialNm !== '-') setFiliaisUnicas.add(filialNm);
        
        let localNameCompleto = localIdRaw ? `${localIdRaw} - ${localNm}` : localNm;
        if (localNameCompleto && localNameCompleto !== '-' && localNameCompleto !== '') {
            setLocaisUnicos.add(`${filialNm} | ${localNameCompleto}`);
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
        Array.from(setLocaisUnicos).sort().forEach(l => { selectLocal.innerHTML += `<option value="${l}">${l}</option>`; });
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
            temImagem: mapeamentoDeImagemAtivo ? imagensMapeadas.has(item.codNorm) : null
        };
    }).filter(i => i !== null);

    if(baseSujaProcessada.length === 0) { fecharLoader(); isFetchingData = false; return; }

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

    itensProcessados = baseSujaProcessada;
    
    // ==========================================================================
    // PROCESSA A NOVA ABA: GESTÃO DE COMPRAS (OFs) E CONVERSÃO CAMBIAL
    // ==========================================================================
    ordesAtivasFiltradas = [];
    setStatusOFUnicos.clear();

    if(bases.compras.length > 0) {
        const c_sc = encontrarChave(bases.compras[0], colScCodigo);
        const c_of = encontrarChave(bases.compras[0], colOfCodigo);
        const c_desc = encontrarChave(bases.compras[0], colDesc);
        const c_forn = encontrarChave(bases.compras[0], colOfNomeFornecedor);
        const c_dt_ent = encontrarChave(bases.compras[0], colOfDataEntrega);
        const c_solicitante = encontrarChave(bases.compras[0], ['sc - nome solicitante', 'sc solicitante', 'nome solicitante', 'requisitante']);
        const c_of_fechado = encontrarChave(bases.compras[0], ['of - fechado', 'fechado of']);
        
        const mapaItensParaFilial = new Map(itensProcessados.map(i => [i.codNorm, i]));
        
        bases.compras.forEach(linha => {
            let qtdPedida = c_of_qtd_pedida ? converterParaNumero(linha[c_of_qtd_pedida]) : 0;
            let qtdRecebida = c_rec_qtd ? converterParaNumero(linha[c_rec_qtd]) : 0;
            let sitOFOriginal = c_of_sit ? linha[c_of_sit] : 'Pendente';
            let sitOF = c_of_sit ? normalizarString(linha[c_of_sit]) : '';
            let sitSC = c_sc_sit ? normalizarString(item[c_sc_sit]) : '';
            let cancSC = c_sc_canc ? normalizarString(linha[c_sc_canc]) : '';
            
            // Fator de conversão da moeda da linha para Real (BRL)
            let moedaStr = c_of_moeda && linha[c_of_moeda] ? normalizarString(linha[c_of_moeda]) : 'brl';
            let taxaCambio = cotacoesMoeda[moedaStr] || 1.00;

            let isFechadaOuCancelada = sitOF.includes('fechada') || sitOF.includes('cancelada') || sitSC.includes('cancelado') || cancSC === 'sim' || cancSC === 's';
            let ofFechadoStr = c_of_fechado && linha[c_of_fechado] ? String(linha[c_of_fechado]).toLowerCase() : '';
            let isFechada = isFechadaOuCancelada || ofFechadoStr === 'sim' || ofFechadoStr === 's';

            let saldoPendente = 0;
            if (isFechada) {
                saldoPendente = 0; 
            } else if (c_of_qtd_pedida) {
                saldoPendente = qtdPedida - qtdRecebida;
                if(saldoPendente < 0) saldoPendente = 0;
            } else {
                saldoPendente = c_qtd_compra_fallback ? converterParaNumero(linha[c_qtd_compra_fallback]) : 0;
                qtdPedida = saldoPendente; 
            }

            let statusCalculado = sitOFOriginal || 'Pendente';
            if (qtdPedida > 0 && qtdRecebida >= qtdPedida) {
                statusCalculado = 'Entregue';
            } else if (qtdRecebida > 0 && qtdRecebida < qtdPedida && !isFechada) {
                statusCalculado = 'Entrega Parcial';
            } else if (qtdPedida > 0 && qtdRecebida === 0 && !isFechada) {
                statusCalculado = 'Em Trânsito';
            } else if (isFechada) {
                statusCalculado = 'Fechada / Cancelada';
            }

            let cod = normalizarCod(linha[c_cod_compra]);
            if (cod) {
                let objItem = mapaItensParaFilial.get(cod);
                let filialDaOF = objItem ? objItem.filialNm : 'Geral';
                let req = c_solicitante && linha[c_solicitante] ? linha[c_solicitante].trim() : 'Não Informado';

                if (statusCalculado) setStatusOFUnicos.add(statusCalculado);

                // Aplica a conversão cambial no objeto guardado para os cálculos financeiros se necessário
                ordesAtivasFiltradas.push({
                    sc: linha[c_sc] || '-',
                    of: linha[c_of] || '-',
                    codProd: linha[c_cod_compra] || '-',
                    descProd: linha[c_desc] || '-',
                    fornecedor: linha[c_forn] || 'Não Informado',
                    solicitante: req,
                    dataEntrega: linha[c_dt_ent] || 'Sem Data',
                    qtdPedidaOriginal: qtdPedida,
                    saldoOF: saldoPendente,
                    sitOFOriginal: sitOFOriginal,
                    statusCalculado: statusCalculado,
                    taxaCambio: taxaCambio,
                    filial: filialDaOF,
                    searchStr: (linha[c_of] + " " + linha[c_sc] + " " + linha[c_cod_compra] + " " + linha[c_forn] + " " + req).toLowerCase(),
                    linhaOriginal: linha 
                });
            }
        });
    }

    const selectStatusOf = document.getElementById('select-status-of');
    if (selectStatusOf) {
        selectStatusOf.innerHTML = '<option value="">Todos os Status (Pesquisa Livre)</option>';
        selectStatusOf.innerHTML += '<option value="Pendentes" selected>⏳ Apenas Pendentes (Trânsito / Parcial)</option>';
        Array.from(setStatusOFUnicos).sort().forEach(s => {
            if(s) selectStatusOf.innerHTML += `<option value="${s}">${s}</option>`;
        });
    }

    setProgress(100, "Renderizando Interface...", "success");
    
    const elTitleConsumo = document.getElementById('kpi-consumo-title');
    const elThConsumo = document.getElementById('th-consumo');
    if (elTitleConsumo) elTitleConsumo.innerText = `Custo do Consumo (${mesConsumoAtual})`;
    if (elThConsumo) elThConsumo.innerText = `Custo Consumo (${mesConsumoAtual})`; 

    setTimeout(() => {
        if (typeof dispararFiltrosSemAtraso === 'function') dispararFiltrosSemAtraso();
        if(!encontrouConsumoNoMesAlvo && bases.consumos.length > 0) {
            mostrarToast(`Atenção: Não detectamos saídas de ${mesConsumoAtual} no arquivo de consumos.`, "warning");
        } else {
            mostrarToast(`Inteligência Ativada. Consumo travado em ${mesConsumoAtual}.`, "success");
        }
        fecharLoader();
        isFetchingData = false; 
    }, 600);
}