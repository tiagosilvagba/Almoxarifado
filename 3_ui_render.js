// ==========================================================================
// 1. EVENT LISTENERS E NAVEGAÇÃO
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    const temaLocal = localStorage.getItem('temaAlmoxarifado') || 'light';
    document.querySelectorAll('.theme-btn').forEach(btn => {
        if(btn.getAttribute('data-theme-val') === temaLocal) btn.classList.add('active');
    });
    
    const bsCatalog = document.getElementById('busca');
    if(bsCatalog) bsCatalog.addEventListener('input', dispararFiltrosDebounce);
    
    const bsCompras = document.getElementById('busca-compras');
    if(bsCompras) bsCompras.addEventListener('input', dispararFiltrosDebounce);

    const bsOFs = document.getElementById('busca-ofs');
    if(bsOFs) bsOFs.addEventListener('input', dispararFiltrosDebounce);
    
    setTimeout(() => {
        if (!isFetchingData && typeof carregarArquivosAutomaticamente === 'function') {
            carregarArquivosAutomaticamente();
        }
    }, 100);
});

window.alterarTema = function(tema) {
    if (!tema) return;
    if (tema === 'light') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', tema);
    
    localStorage.setItem('temaAlmoxarifado', tema); 
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.remove('active');
        if(btn.getAttribute('data-theme-val') === tema) btn.classList.add('active');
    });
    if (itensProcessados.length > 0) atualizarGraficos();
}

window.navegarPara = function(view) {
    vistaAtual = view;
    ['pesquisa', 'dashboard', 'compras', 'gestao-compras', 'instrucoes', 'revisao'].forEach(v => {
        const el = document.getElementById(`view-${v}`);
        const nav = document.getElementById(`nav-${v}`);
        if(el) el.style.display = (v === view) ? 'flex' : 'none';
        if(nav) nav.classList.toggle('active', v === view);
    });
    if(view === 'pesquisa' || view === 'dashboard') dispararFiltrosSemAtraso();
    if(view === 'compras') renderizarCompras();
    if(view === 'gestao-compras') renderizarGestaoDeCompras();
    if(view === 'revisao') renderizarRevisao();
}

window.toggleSegmentacao = function() { 
    document.getElementById('app-layout').classList.toggle('segmentation-hidden'); 
}

// ==========================================================================
// 2. BUSCA INTELIGENTE E FILTRO CASCATA
// ==========================================================================
let timerBusca;
window.dispararFiltrosDebounce = function() {
    clearTimeout(timerBusca);
    timerBusca = setTimeout(dispararFiltrosSemAtraso, 300); 
}

window.atualizarFiltroLocais = function() {
    const filialEscolhida = document.getElementById('select-filial').value;
    const selectLocal = document.getElementById('select-local');
    const localAtual = selectLocal.value;

    selectLocal.innerHTML = '<option value="">Todos os Locais</option>';

    let locaisValidos = Array.from(setLocaisUnicos);
    if (filialEscolhida) {
        locaisValidos = locaisValidos.filter(l => l.startsWith(filialEscolhida + ' |'));
    }

    locaisValidos.sort().forEach(l => {
        selectLocal.innerHTML += `<option value="${l}">${l}</option>`;
    });

    if (locaisValidos.includes(localAtual)) selectLocal.value = localAtual;
    else selectLocal.value = "";
    
    dispararFiltrosSemAtraso();
}

window.dispararFiltros = function() { dispararFiltrosSemAtraso(); } 

window.dispararFiltrosSemAtraso = function() {
    let valCatalogo = document.getElementById('busca')?.value || "";
    let valCompras = document.getElementById('busca-compras')?.value || "";
    let valGestao = document.getElementById('busca-ofs')?.value || "";
    
    let termoBruto = "";
    if (vistaAtual === 'pesquisa') termoBruto = valCatalogo;
    else if (vistaAtual === 'compras') termoBruto = valCompras;
    else if (vistaAtual === 'gestao-compras') termoBruto = valGestao;
    else termoBruto = valCatalogo; 

    const termosSplit = termoBruto ? normalizarString(termoBruto).split(',').map(t => t.trim()).filter(t => t) : [];
    
    const statusFiltro = document.getElementById('select-saldo-status')?.value || "";
    const curvaFiltro = document.getElementById('select-curva')?.value || "";
    const imagemFiltro = document.getElementById('select-imagem')?.value || "";
    const filialFiltro = document.getElementById('select-filial')?.value || filtroGraficoFilial || "";
    const localFiltro = document.getElementById('select-local')?.value || "";

    if (imagemFiltro !== "" && !mapeamentoDeImagemAtivo) {
        mostrarToast("Para filtrar por imagens, mapeie a pasta no menu lateral.", "warning");
        document.getElementById('select-imagem').value = "";
        return;
    }

    itensFiltrados = itensProcessados.filter(i => {
        const bateTermo = termosSplit.length === 0 || termosSplit.some(t => i.searchString.includes(t));
        const bateCurva = !curvaFiltro || i.curva === curvaFiltro;
        const bateStatus = !statusFiltro || i.status === statusFiltro;
        const bateFilial = !filialFiltro || i.filialNm === filialFiltro;
        
        const bateLocal = !localFiltro || i.locais.some(loc => {
            let ln = loc.localId ? `${loc.localId} - ${loc.localNm}` : loc.localNm;
            return `${loc.filialNm} | ${ln}` === localFiltro;
        });
        
        let bateImagem = true;
        if (mapeamentoDeImagemAtivo) {
            if (imagemFiltro === 'com_imagem') bateImagem = i.temImagem === true;
            if (imagemFiltro === 'sem_imagem') bateImagem = i.temImagem === false;
        }
        return bateTermo && bateCurva && bateStatus && bateImagem && bateFilial && bateLocal;
    });

    if (vistaAtual === 'pesquisa') renderizarPesquisa();
    else if (vistaAtual === 'dashboard') renderizarDashboard();
    else if (vistaAtual === 'compras') renderizarCompras();
    else if (vistaAtual === 'gestao-compras') renderizarGestaoDeCompras(termosSplit, filialFiltro);
    else if (vistaAtual === 'revisao') renderizarRevisao();
}

window.limparFiltroGrafico = function(tipo) {
    if (tipo === 'abc') { filtroGraficoABC = null; document.getElementById('filtro-abc-aviso').style.display = 'none'; }
    if (tipo === 'status') { filtroGraficoStatus = null; document.getElementById('filtro-status-aviso').style.display = 'none'; }
    if (tipo === 'filial') { filtroGraficoFilial = null; document.getElementById('filtro-filial-aviso').style.display = 'none'; }
    dispararFiltrosSemAtraso();
}

window.limparFiltros = function() {
    if(document.getElementById('select-curva')) document.getElementById('select-curva').value = "";
    if(document.getElementById('select-saldo-status')) document.getElementById('select-saldo-status').value = "";
    if(document.getElementById('select-imagem')) document.getElementById('select-imagem').value = "";
    if(document.getElementById('select-filial')) document.getElementById('select-filial').value = "";
    if(document.getElementById('select-local')) document.getElementById('select-local').value = "";
    if(document.getElementById('select-status-of')) document.getElementById('select-status-of').value = "";
    if(document.getElementById('busca')) document.getElementById('busca').value = "";
    if(document.getElementById('busca-compras')) document.getElementById('busca-compras').value = "";
    if(document.getElementById('busca-ofs')) document.getElementById('busca-ofs').value = "";
    
    filtroGraficoABC = null; filtroGraficoStatus = null; filtroGraficoFilial = null;
    document.getElementById('filtro-abc-aviso').style.display = 'none';
    document.getElementById('filtro-status-aviso').style.display = 'none';
    document.getElementById('filtro-filial-aviso').style.display = 'none';
    atualizarFiltroLocais(); 
}

// ==========================================================================
// 3. RENDERIZAÇÃO DAS TELAS E TABELAS
// ==========================================================================
window.renderizarPesquisa = function() {
    const container = document.getElementById('resultados');
    document.getElementById('contador-itens').innerText = `${itensFiltrados.length} itens encontrados.`;
    
    let htmlLote = [];
    
    itensFiltrados.slice(0, 100).forEach(i => { 
        let giroMensalDias = i.diasGiroMensal === Infinity ? 'Sem Consumo' : `${i.diasGiroMensal}d`;
        let giroAnualDias = i.diasGiroAnual === Infinity ? 'Sem Consumo' : `${i.diasGiroAnual}d`;

        let imagemHTML = '';
        if (mapeamentoDeImagemAtivo) {
            imagemHTML = i.temImagem 
                ? `<img src="imagens/${i.cod} - 01.jpg" alt="Foto ${i.cod}">` 
                : `<div class="img-placeholder"><span style="font-size:20px; margin-bottom:5px;">🚫</span>FOTO NÃO<br>ENCONTRADA</div>`;
        } else {
            imagemHTML = `<img src="imagens/${i.cod} - 01.jpg" alt="Foto ${i.cod}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                          <div class="img-placeholder" style="display:none;"><span style="font-size:20px; margin-bottom:5px;">🚫</span>FOTO NÃO<br>ENCONTRADA</div>`;
        }
        
        let filiaisComSaldo = itensProcessados
            .filter(x => x.codNorm === i.codNorm && x.saldo > 0)
            .map(x => x.filialNm)
            .filter((v, idx, a) => a.indexOf(v) === idx)
            .join(', ');
        if (!filiaisComSaldo) filiaisComSaldo = "Nenhuma filial com saldo físico";

        let enderecoFormatado = i.locais.length > 1 
            ? `<span style="color:var(--primary-color);">Múltiplos Locais Detectados (Clique para ver)</span>` 
            : `Rep: <strong>${i.reparticao}</strong> &nbsp;•&nbsp; Prat: <strong>${i.prateleira}</strong> &nbsp;•&nbsp; Div: <strong>${i.divisao}</strong>`;

        htmlLote.push(`
            <div class="item-card fade-in" onclick="abrirModalDetalhes('${i.codNorm}', '${i.filialIdBase}')">
                <div class="item-media">
                    <div class="abc-badge curva-${i.curva}">${i.curva}</div>
                    <div class="item-image-container">${imagemHTML}</div>
                </div>
                <div class="item-info">
                    <div>
                        <div class="item-header">
                            <div class="item-title"><span class="item-title-cod">#${i.cod}</span> ${i.desc}</div>
                            <span class="badge-status ${i.statusBadge}">${i.status}</span>
                        </div>
                        <div class="item-category">
                            <span class="chip-category">${i.grupo || 'Geral'}</span>
                            <span class="chip-category">${i.classe || 'N/A'}</span>
                            <span class="chip-category">UN: ${i.um || 'UN'}</span>
                        </div>
                        
                        <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 12px; line-height: 1.6; background: var(--bg-subcard); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color);">
                            <div>🏢 <strong>Filiais c/ Saldo:</strong> <span style="color: var(--text-primary); font-weight: 600;">${filiaisComSaldo}</span></div>
                            <div>📍 <strong>Local de Estoque:</strong> <span style="color: var(--text-primary); font-weight: 600;">${enderecoFormatado}</span></div>
                        </div>

                        <div class="item-metrics-grid">
                            <div class="metric-box metric-saldo"><span class="metric-label">Saldo Atual (Qtd)</span><span class="metric-value">${i.saldo} <span style="font-size:11px;">und</span></span></div>
                            <div class="metric-box metric-default"><span class="metric-label" style="color: var(--primary-color);">Giro Mensal</span><span class="metric-value">${giroMensalDias}</span></div>
                            <div class="metric-box metric-default"><span class="metric-label">Giro Anual</span><span class="metric-value">${giroAnualDias}</span></div>
                            <div class="metric-box metric-default"><span class="metric-label">Custo Consumo</span><span class="metric-value">${formatarMoedaMask(i.consumoFinanceiro)}</span></div>
                        </div>
                    </div>
                </div>
            </div>
        `);
    });
    
    container.innerHTML = htmlLote.join('');
}

window.renderizarRevisao = function() {
    const tbody = document.getElementById('revisao-table-body');
    let htmlLote = [];
    
    let itensRevisao = itensFiltrados.filter(i => {
        if (i.consumoFinanceiro === 0 && (i.minimo > 0 || i.maximo > 0)) return true;
        if (i.saldoUtil < i.minimo && i.consumoFinanceiro > 0) return true;
        if (i.saldoUtil > i.maximo && i.maximo > 0) return true;
        return false;
    });

    itensRevisao.slice(0, 100).forEach(i => {
        let acao = "";
        let colorAcao = "";
        if (i.consumoFinanceiro === 0 && (i.minimo > 0 || i.maximo > 0)) {
            acao = "Revisar/Zerar (Sem Consumo)"; colorAcao = "var(--text-warning)";
        } else if (i.saldoUtil > i.maximo && i.maximo > 0) {
            acao = "Reduzir Máximo (Excesso)"; colorAcao = "var(--primary-color)";
        } else if (i.saldoUtil < i.minimo && i.consumoFinanceiro > 0) {
            acao = "Aumentar Mínimo (Risco)"; colorAcao = "var(--text-danger)";
        }

        htmlLote.push(`
            <tr class="fade-in" style="cursor:pointer;" onclick="abrirModalDetalhes('${i.codNorm}', '${i.filialIdBase}')">
                <td><strong style="color:var(--primary-color);">#${i.cod}</strong><br><span style="font-size:11px;color:var(--text-secondary); font-weight:500;">${i.desc}</span></td>
                <td style="font-size:11px; font-weight:700; color:var(--text-secondary);">${i.filialNm}</td>
                <td style="font-size:14px; font-weight:900; color:var(--primary-color);">${i.saldoUtil}</td>
                <td style="font-size:12px; font-weight:600; color:var(--text-secondary);">${i.minimo} / ${i.maximo}</td>
                <td style="font-size:14px; font-weight:900; color:var(--text-info);">${i.sugestaoMin}</td>
                <td style="font-size:14px; font-weight:900; color:var(--text-info);">${i.sugestaoMax}</td>
                <td style="font-size:12px; font-weight:600; color:var(--text-primary);">${formatarMoedaMask(i.consumoFinanceiro)}</td>
                <td style="font-size:13px; font-weight:800; color:${colorAcao};">${acao}</td>
            </tr>
        `);
    });
    
    tbody.innerHTML = htmlLote.join('') || `<tr><td colspan="8" style="text-align:center; padding: 40px; font-weight: 500; color: var(--text-secondary);">Nenhum item exige revisão de parâmetros nos filtros atuais.</td></tr>`;
}

window.renderizarCompras = function() {
    const tbody = document.getElementById('compras-table-body');
    const divResumo = document.getElementById('resumo-necessidade');
    let htmlLote = [];
    let totalQtd = 0;
    let totalValor = 0;
    
    if (tbody && tbody.previousElementSibling) {
        tbody.previousElementSibling.innerHTML = `
            <tr>
                <th>Código / Descrição</th>
                <th>Filial</th>
                <th>Estoque (Físico + Trânsito)</th>
                <th>Giro Atual</th>
                <th>Máximo Global</th>
                <th style="color: var(--text-success);">Comprar +Qtd</th>
                <th style="color: var(--text-info);">Giro Pós-Compra</th>
            </tr>
        `;
    }

    // GATILHO CORRIGIDO: Só sugere compra se o Estoque Virtual furar o MÍNIMO
    const necessitaCompra = itensFiltrados.filter(i => {
        let estoqueVirtual = i.saldo + i.transito;
        return (estoqueVirtual < i.minimo) && i.minimo > 0 && i.maximo > 0;
    });
    
    necessitaCompra.sort((a,b) => (a.saldo + a.transito) - (b.saldo + b.transito)).forEach(i => {
        let estoqueVirtual = i.saldo + i.transito;
        let sug = i.maximo - estoqueVirtual; 
        
        if(sug > 0) {
            totalQtd += sug;
            totalValor += (sug * i.custoUnitario);

            let transitoHtml = i.transito > 0 ? `<br><span style="font-size:10px; color:var(--text-warning);">+${i.transito} em trânsito</span>` : '';
            
            // CÁLCULO DOS GIROS (Dias de Cobertura)
            let giroAtualText = i.consumo > 0 ? Math.round((i.saldo / i.consumo) * 30) + 'd' : 'Sem Consumo';
            let giroPosText = i.consumo > 0 ? Math.round((i.maximo / i.consumo) * 30) + 'd' : 'Sem Consumo';

            htmlLote.push(`
                <tr class="fade-in" style="cursor:pointer;" onclick="abrirModalDetalhes('${i.codNorm}', '${i.filialIdBase}')">
                    <td><strong style="color:var(--primary-color);">#${i.cod}</strong><br><span style="font-size:11px;color:var(--text-secondary); font-weight:500;">${i.desc}</span></td>
                    <td style="font-size:11px; font-weight:700; color:var(--text-secondary);">${i.filialNm}</td>
                    <td style="font-size:14px; font-weight:900; color:var(--text-critical);">${i.saldo} ${transitoHtml}</td>
                    <td style="font-size:12px; font-weight:700; color:var(--text-secondary);">${giroAtualText}</td>
                    <td style="font-size:12px; font-weight:700; color:var(--primary-color);">${i.maximo}</td>
                    <td style="font-size:14px; font-weight:900; color:var(--text-success);">+${sug}</td>
                    <td style="font-size:12px; font-weight:700; color:var(--text-info);">${giroPosText}</td>
                </tr>
            `);
        }
    });
    
    if (divResumo) {
        divResumo.innerHTML = `
            <div class="kpi-card border-warning"><span class="kpi-title">Total de Itens (Qtd Reposição)</span><span class="kpi-value color-warning">${totalQtd.toLocaleString('pt-BR')}</span></div>
            <div class="kpi-card border-success"><span class="kpi-title">Valor Estimado de Compras</span><span class="kpi-value color-success">${formatarMoedaMask(totalValor)}</span></div>
        `;
    }

    if (tbody) {
        tbody.innerHTML = htmlLote.join('') || `<tr><td colspan="7" style="text-align:center; padding: 40px; font-weight: 500; color: var(--text-secondary);">Sem necessidade de compras para os filtros (Estoque Virtual >= Mínimo).</td></tr>`;
    }
}

window.renderizarGestaoDeCompras = function(termosSplit = [], filialFiltro = "") {
    const tbody = document.getElementById('ofs-table-body');
    const divResumo = document.getElementById('resumo-ofs');
    let htmlLote = [];
    
    const statusOfFiltro = document.getElementById('select-status-of')?.value || "";

    let ofsExibir = ordesAtivasFiltradas.filter(of => {
        let bateTermo = termosSplit.length === 0 || termosSplit.some(t => of.searchStr.includes(t));
        let bateFilial = !filialFiltro || of.filial === filialFiltro || of.filial === 'Geral';
        let bateStatus = !statusOfFiltro || of.sitOFOriginal === statusOfFiltro;
        return bateTermo && bateFilial && bateStatus;
    });

    let valTransitoTotal = 0;
    let qtdTransitoTotal = 0;
    let fornSet = new Set();
    let ofSet = new Set();

    const mapaItens = new Map(itensProcessados.map(i => [i.codNorm, i]));

    ofsExibir.forEach(of => {
        let itemRef = mapaItens.get(normalizarCod(of.codProd)); 
        let val = of.saldoOF * (itemRef ? itemRef.custoUnitario : 0);
        valTransitoTotal += val;
        qtdTransitoTotal += of.saldoOF;
        fornSet.add(of.fornecedor);
        ofSet.add(of.of);
    });

    ofsExibir.slice(0, 100).forEach(of => {
        let descOriginal = of.qtdPedidaOriginal > 0 ? of.qtdPedidaOriginal : of.saldoOF;
        
        htmlLote.push(`
            <tr class="fade-in" style="cursor:pointer;" onclick="abrirModalOF('${of.sc}', '${of.of}', '${of.codProd}')">
                <td>
                    <strong style="color:var(--text-primary);">${of.of}</strong><br>
                    <span style="font-size:10px;color:var(--text-secondary);">SC: ${of.sc}</span><br>
                    <span style="font-size:10px;color:var(--primary-color); font-weight: 600;">👤 Req: ${of.solicitante}</span>
                </td>
                <td><strong style="color:var(--primary-color);">#${of.codProd}</strong><br><span style="font-size:11px;color:var(--text-secondary); font-weight:500;">${of.descProd}</span></td>
                <td style="font-size:11px; font-weight:700; color:var(--text-secondary);">${of.fornecedor}</td>
                <td style="font-size:13px; font-weight:600; color:var(--text-primary);">${descOriginal}</td>
                <td style="font-size:14px; font-weight:900; color:var(--text-warning);">${of.saldoOF} und</td>
                <td style="font-size:12px; font-weight:700; color:var(--text-primary);">${window.formatarDataBR(of.dataEntrega)}</td>
            </tr>
        `);
    });
    
    if (divResumo) {
        divResumo.innerHTML = `
            <div class="kpi-card border-info"><span class="kpi-title">Valor Pendente em OF</span><span class="kpi-value color-info">${formatarMoedaMask(valTransitoTotal)}</span></div>
            <div class="kpi-card"><span class="kpi-title">Saldo Físico a Receber</span><span class="kpi-value">${qtdTransitoTotal}</span></div>
            <div class="kpi-card"><span class="kpi-title">OFs em Aberto</span><span class="kpi-value">${ofSet.size}</span></div>
            <div class="kpi-card"><span class="kpi-title">Fornecedores Diferentes</span><span class="kpi-value">${fornSet.size}</span></div>
        `;
    }

    tbody.innerHTML = htmlLote.join('') || `<tr><td colspan="6" style="text-align:center; padding: 40px; font-weight: 500; color: var(--text-secondary);">Sem OFs pendentes ou ativas para os filtros.</td></tr>`;
}

window.renderizarDashboard = function() {
    let valorTotal = 0, valorObsoleto = 0, qtdObsoleto = 0;
    let qtdRupturaCritica = 0, qtdRupturaTransito = 0;
    let qtdRiscoMinimo = 0, qtdExcesso = 0;
    let totalSaldoFinanceiro = 0, totalConsumoMensalFinanceiro = 0;
    let skusAtivos = 0; 

    itensFiltrados.forEach(i => {
        valorTotal += i.valorImobilizado;
        totalSaldoFinanceiro += i.valorImobilizado;
        totalConsumoMensalFinanceiro += i.consumoFinanceiro;
        
        if (i.saldo > 0) skusAtivos++;

        if (i.status === 'Ruptura Crítica (Sem Pedido)') qtdRupturaCritica++;
        if (i.status === 'Ruptura (Em Trânsito)') qtdRupturaTransito++;
        if (i.status === 'Obsoleto (Sem Consumo)') { valorObsoleto += i.valorImobilizado; qtdObsoleto++; }
        if (i.status === 'Abaixo Mínimo') qtdRiscoMinimo++;
        if (i.status === 'Excesso Estoque') qtdExcesso++;
    });

    let giroMensalDias = 0;
    let giroAnualDias = 0;

    if (totalConsumoMensalFinanceiro > 0) {
        giroMensalDias = Math.round((totalSaldoFinanceiro / totalConsumoMensalFinanceiro) * 30);
        giroAnualDias = Math.round((totalSaldoFinanceiro / (totalConsumoMensalFinanceiro * 12)) * 365);
    }

    const safeSetText = (id, text) => { const el = document.getElementById(id); if (el) el.innerText = text; };

    safeSetText('dash-kpi-valor-total', formatarMoedaMask(valorTotal));
    safeSetText('dash-kpi-total-itens', `Em ${itensFiltrados.length} SKUs`);
    
    safeSetText('dash-kpi-giro-anual', totalConsumoMensalFinanceiro > 0 ? `${giroAnualDias} dias` : 'Sem Consumo');
    safeSetText('dash-kpi-giro-medio', totalConsumoMensalFinanceiro > 0 ? `${giroMensalDias} dias` : 'Sem Consumo');
    
    safeSetText('dash-kpi-ruptura-critica', qtdRupturaCritica);
    safeSetText('dash-kpi-risco-minimo', qtdRiscoMinimo);
    safeSetText('dash-kpi-excesso', qtdExcesso);
    safeSetText('dash-kpi-ruptura-transito', qtdRupturaTransito);
    safeSetText('dash-kpi-valor-obsoleto', formatarMoedaMask(valorObsoleto));
    safeSetText('dash-kpi-obsoleto-qtd', `${qtdObsoleto} itens`);
    safeSetText('dash-kpi-skus-ativos', skusAtivos);
    
    safeSetText('dash-kpi-volume-fisico', formatarMoedaMask(totalSaldoFinanceiro));
    safeSetText('dash-kpi-consumo-financeiro', formatarMoedaMask(totalConsumoMensalFinanceiro));
    safeSetText('dash-kpi-total-itens-proc', itensProcessados.length);

    atualizarGraficos(); 
    renderizarTabelaDashboard(); 
}

window.renderizarTabelaDashboard = function() {
    const tbody = document.getElementById('dash-table-body');
    if (!tbody) return;

    let htmlLote = [];
    let itensTabela = itensFiltrados;

    if (filtroGraficoABC) {
        itensTabela = itensTabela.filter(i => i.curva === filtroGraficoABC);
        document.getElementById('filtro-abc-aviso').style.display = 'inline-block';
        document.getElementById('filtro-abc-aviso').innerText = `✖ Filtro ABC: Curva ${filtroGraficoABC}`;
    } else { 
        const fAbc = document.getElementById('filtro-abc-aviso');
        if(fAbc) fAbc.style.display = 'none'; 
    }

    if (filtroGraficoStatus) {
        if (filtroGraficoStatus === 'Ruptura') itensTabela = itensTabela.filter(i => i.status.includes('Ruptura')); 
        else if (filtroGraficoStatus === 'Obsoleto') itensTabela = itensTabela.filter(i => i.status.includes('Obsoleto'));
        else itensTabela = itensTabela.filter(i => i.status === filtroGraficoStatus);
        
        document.getElementById('filtro-status-aviso').style.display = 'inline-block';
        document.getElementById('filtro-status-aviso').innerText = `✖ Filtro Status: ${filtroGraficoStatus}`;
    } else { 
        const fStatus = document.getElementById('filtro-status-aviso');
        if(fStatus) fStatus.style.display = 'none'; 
    }
    
    if (filtroGraficoFilial) {
        itensTabela = itensTabela.filter(i => i.filialNm === filtroGraficoFilial);
        document.getElementById('filtro-filial-aviso').style.display = 'inline-block';
        document.getElementById('filtro-filial-aviso').innerText = `✖ Filtro Filial: ${filtroGraficoFilial}`;
    } else { 
        const fFilial = document.getElementById('filtro-filial-aviso');
        if(fFilial) fFilial.style.display = 'none'; 
    }

    itensTabela.slice(0, 50).forEach(i => { 
        let giroText = i.diasGiroMensal === Infinity ? 'Obsoleto' : `${i.diasGiroMensal}d`;
        let locAbrev = i.locais.length > 1 ? `${i.locais.length} Locais` : `Rep ${i.reparticao} | Prat ${i.prateleira}`;
        htmlLote.push(`
            <tr class="fade-in" style="cursor:pointer;" onclick="abrirModalDetalhes('${i.codNorm}', '${i.filialIdBase}')">
                <td><div class="abc-badge curva-${i.curva}" style="width:28px; height:28px; font-size:13px; position:static; box-shadow:none;">${i.curva}</div></td>
                <td><strong style="color:var(--primary-color);">#${i.cod}</strong><br><span style="font-size:11px;color:var(--text-secondary); font-weight:500;">${i.desc}</span></td>
                <td style="font-size:11px; font-weight:600; color:var(--text-info);">${locAbrev}</td>
                <td style="font-size:14px; font-weight:800; color:var(--text-primary);">${i.saldo}</td>
                <td style="color:var(--text-primary); font-weight:600;">${formatarMoedaMask(i.consumoFinanceiro)}</td>
                <td style="font-weight:700; color:var(--text-primary);">${giroText}</td>
                <td><span class="badge-status ${i.statusBadge}">${i.status}</span></td>
            </tr>
        `);
    });
    tbody.innerHTML = htmlLote.join('') || `<tr><td colspan="7" style="text-align:center; padding: 40px; font-weight: 500; color: var(--text-secondary);">Nenhum dado encontrado para os filtros ativos.</td></tr>`;
}

window.atualizarGraficos = function() {
    if(chartABCInstance) chartABCInstance.destroy();
    if(chartStatusInstance) chartStatusInstance.destroy();
    if(chartFiliaisInstance) chartFiliaisInstance.destroy();

    const ctxABC = document.getElementById('chartABC')?.getContext('2d');
    const ctxStatus = document.getElementById('chartStatus')?.getContext('2d');
    const ctxFiliais = document.getElementById('chartFiliais')?.getContext('2d');
    
    if(!ctxABC || !ctxStatus) return;

    const styles = getComputedStyle(document.body);
    const fontColor = styles.getPropertyValue('--text-primary').trim();
    const gridColor = styles.getPropertyValue('--border-color').trim();
    const isDark = ['dark', 'ocean', 'dracula', 'hacker'].includes(document.documentElement.getAttribute('data-theme'));
    
    const corA = '#10b981'; const corB = '#0ea5e9'; const corC = '#64748b'; 

    const contagemStatus = { Normal: 0, Risco: 0, Excesso: 0, RupturaCritica: 0, Obsoleto: 0, LocalCritico: 0 };
    const volumeABC = { A: 0, B: 0, C: 0 };
    const valorPorFilial = {};

    itensFiltrados.forEach(i => {
        if(volumeABC[i.curva] !== undefined) volumeABC[i.curva] += i.consumoFinanceiro; 
        
        if(!valorPorFilial[i.filialNm]) valorPorFilial[i.filialNm] = 0;
        valorPorFilial[i.filialNm] += i.valorImobilizado;
        
        if(i.status === 'Estoque Normal') contagemStatus.Normal++;
        else if(i.status === 'Abaixo Mínimo') contagemStatus.Risco++;
        else if(i.status === 'Excesso Estoque') contagemStatus.Excesso++;
        else if(i.status === 'Normal/Local Crítico') contagemStatus.LocalCritico++;
        else if(i.status.includes('Ruptura')) contagemStatus.RupturaCritica++;
        else if(i.status.includes('Obsoleto')) contagemStatus.Obsoleto++;
    });

    Chart.defaults.color = fontColor;
    Chart.defaults.font.family = "'Inter', system-ui, sans-serif";

    chartABCInstance = new Chart(ctxABC, {
        type: 'doughnut',
        data: {
            labels: ['Curva A', 'Curva B', 'Curva C'],
            datasets: [{ 
                data: [volumeABC.A, volumeABC.B, volumeABC.C], 
                backgroundColor: [corA, corB, corC],
                borderWidth: isDark ? 0 : 2, borderColor: isDark ? 'transparent' : '#ffffff', hoverOffset: 6
            }]
        },
        options: { 
            responsive: true, maintainAspectRatio: false, 
            onClick: (event, activeElements) => {
                if(activeElements.length > 0) {
                    const curvaEscolhida = ['A', 'B', 'C'][activeElements[0].index];
                    filtroGraficoABC = (filtroGraficoABC === curvaEscolhida) ? null : curvaEscolhida;
                    renderizarTabelaDashboard(); 
                }
            },
            onHover: (event, chartElement) => { event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default'; },
            plugins: { title: { display: true, text: `Custo Consumo Financeiro (${mesConsumoAtual})`, font: { size: 14, weight: '800' } }, legend: { position: 'bottom', labels: { boxWidth: 12, usePointStyle: true } } },
            cutout: '75%'
        }
    });

    const rotulosGraficoBarra = ['Estoque Normal', 'Abaixo Mínimo', 'Excesso Estoque', 'Ruptura', 'Obsoleto', 'Local Crítico'];

    chartStatusInstance = new Chart(ctxStatus, {
        type: 'bar',
        data: {
            labels: ['Normal', 'Risco (Min)', 'Excesso', 'Rupturas', 'Obsoletos', 'Local 299/295'],
            datasets: [{ 
                label: 'Itens', 
                data: [contagemStatus.Normal, contagemStatus.Risco, contagemStatus.Excesso, contagemStatus.RupturaCritica, contagemStatus.Obsoleto, contagemStatus.LocalCritico], 
                backgroundColor: [corA, '#f59e0b', '#0ea5e9', '#ef4444', corC, '#8b5cf6'], borderRadius: 6, borderSkipped: false
            }]
        },
        options: { 
            responsive: true, maintainAspectRatio: false, 
            onClick: (event, activeElements) => {
                if(activeElements.length > 0) {
                    let statusEscolhido = rotulosGraficoBarra[activeElements[0].index];
                    if (statusEscolhido === 'Local Crítico') statusEscolhido = 'Normal/Local Crítico';
                    filtroGraficoStatus = (filtroGraficoStatus === statusEscolhido) ? null : statusEscolhido;
                    renderizarTabelaDashboard(); 
                }
            },
            onHover: (event, chartElement) => { event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default'; },
            plugins: { legend: { display: false }, title: { display: true, text: 'Distribuição de Status Logístico (Itens)', font: { size: 14, weight: '800' } } },
            scales: { y: { beginAtZero: true, grid: { color: gridColor }, border: { display: false } }, x: { grid: { display: false }, border: { display: false } } }
        }
    });
    
    if (ctxFiliais) {
        const keysFiliais = Object.keys(valorPorFilial);
        const coresFiliais = ['#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#64748b', '#3b82f6', '#14b8a6'];
        chartFiliaisInstance = new Chart(ctxFiliais, {
            type: 'doughnut',
            data: {
                labels: keysFiliais,
                datasets: [{ 
                    data: Object.values(valorPorFilial), 
                    backgroundColor: coresFiliais.slice(0, keysFiliais.length),
                    borderWidth: isDark ? 0 : 2, borderColor: isDark ? 'transparent' : '#ffffff', hoverOffset: 6
                }]
            },
            options: { 
                responsive: true, maintainAspectRatio: false, 
                onClick: (event, activeElements) => {
                    if(activeElements.length > 0) {
                        const filialEscolhida = keysFiliais[activeElements[0].index];
                        filtroGraficoFilial = (filtroGraficoFilial === filialEscolhida) ? null : filialEscolhida;
                        renderizarTabelaDashboard(); 
                    }
                },
                onHover: (event, chartElement) => { event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default'; },
                plugins: { title: { display: true, text: `Distribuição de Estoque (R$)`, font: { size: 14, weight: '800' } }, legend: { display: false } },
                cutout: '75%'
            }
        });
    }
}

// ==========================================================================
// 4. FUNÇÕES DOS MODAIS
// ==========================================================================
window.abrirModalDetalhes = function(codNorm, filialIdBase) {
    const item = itensProcessados.find(i => i.codNorm === codNorm && i.filialIdBase === filialIdBase);
    if (!item) {
        mostrarToast("Erro: Detalhes do item não encontrados.", "error");
        return;
    }

    let imagensHTML = '';
    let lightboxArray = [];
    
    if (mapeamentoDeImagemAtivo && item.temImagem) {
        for(let k = 1; k <= 6; k++) {
            let imgPath = `imagens/${item.cod} - 0${k}.jpg`;
            lightboxArray.push(imgPath);
            imagensHTML += `<img src="${imgPath}" alt="Foto ${k}" style="height: 150px; min-width: 150px; border-radius: 12px; object-fit: cover; border: 1px solid var(--border-color);" onclick="abrirLightboxArray('${lightboxArray.join(',')}', ${k-1}, event)" onerror="this.style.display='none'">`;
        }
    } else {
        let imgPath = `imagens/${item.cod} - 01.jpg`;
        lightboxArray.push(imgPath);
        imagensHTML = `
            <img src="${imgPath}" alt="Foto Principal" style="height: 150px; border-radius: 12px; object-fit: cover; border: 1px solid var(--border-color);" onclick="abrirLightboxArray('${lightboxArray.join(',')}', 0, event)" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
            <div class="img-placeholder" style="display:none; width: 150px; height: 150px; border-radius: 12px;"><span style="font-size:24px; margin-bottom: 5px;">🚫</span>SEM FOTO</div>
        `;
    }

    let linhasLocais = item.locais.map(loc => `
        <tr>
            <td>${loc.filialNm}</td>
            <td><strong style="color: var(--primary-color);">${loc.localId || '-'}</strong> - ${loc.localNm}</td>
            <td>${loc.reparticao}</td>
            <td>${loc.prateleira}</td>
            <td>${loc.divisao}</td>
            <td style="font-weight: 800; color: var(--text-primary); font-size: 14px;">${loc.saldo}</td>
        </tr>
    `).join('');

    let giroMensalTexto = item.diasGiroMensal === Infinity ? 'Sem Consumo/Obsoleto' : `${item.diasGiroMensal} Dias`;
    let giroAnualTexto = item.diasGiroAnual === Infinity ? 'Sem Consumo/Obsoleto' : `${item.diasGiroAnual} Dias`;

    const content = `
        <div class="modal-header-section">
            <div style="flex-grow: 1;">
                <h2 style="font-size: 24px; font-weight: 800; color: var(--text-primary); margin-bottom: 8px; line-height: 1.2;">
                    <span style="color: var(--primary-color);">#${item.cod}</span> - ${item.desc}
                </h2>
                <div class="item-category" style="margin-bottom: 20px;">
                    <span class="chip-category">${item.grupo || 'Geral'}</span>
                    <span class="chip-category">${item.classe || 'N/A'}</span>
                    <span class="chip-category">Medida: <strong>${item.um}</strong></span>
                    <span class="badge-status ${item.statusBadge}">${item.status}</span>
                </div>
                <div class="item-metrics-grid">
                    <div class="metric-box metric-saldo"><span class="metric-label">Saldo Atual</span><span class="metric-value">${item.saldo}</span></div>
                    <div class="metric-box metric-default"><span class="metric-label">Custo Unitário</span><span class="metric-value">${formatarMoedaMask(item.custoUnitario)}</span></div>
                    <div class="metric-box metric-default"><span class="metric-label">Valor Imobilizado</span><span class="metric-value">${formatarMoedaMask(item.valorImobilizado)}</span></div>
                    <div class="metric-box metric-default"><span class="metric-label">Sugestão Mín / Máx</span><span class="metric-value">${item.sugestaoMin} / ${item.sugestaoMax}</span></div>
                    
                    <div class="metric-box metric-default"><span class="metric-label" style="color: var(--primary-color);">Giro Mensal</span><span class="metric-value" style="font-size: 15px;">${giroMensalTexto}</span></div>
                    <div class="metric-box metric-default"><span class="metric-label">Giro Anual</span><span class="metric-value" style="font-size: 15px;">${giroAnualTexto}</span></div>
                    <div class="metric-box metric-transito"><span class="metric-label">Em Trânsito (OF)</span><span class="metric-value">${item.transito}</span></div>
                    <div class="metric-box metric-default"><span class="metric-label">Lead Time Medido</span><span class="metric-value">${item.leadTime} Dias</span></div>
                </div>
            </div>
        </div>

        <h3 style="font-size: 13px; font-weight: 800; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 12px; letter-spacing: 0.5px;">Galeria de Imagens</h3>
        <div class="modal-gallery-container" style="margin-bottom: 24px;">
            ${imagensHTML}
        </div>

        <h3 style="font-size: 13px; font-weight: 800; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 12px; letter-spacing: 0.5px;">Detalhamento de Locais (Físico vs Sistema)</h3>
        <div style="overflow-x: auto; background: var(--bg-card); border-radius: 12px; border: 1px solid var(--border-color);">
            <table class="modal-locais-table">
                <thead>
                    <tr>
                        <th>Filial Operacional</th>
                        <th>Local de Estoque</th>
                        <th>Repartição</th>
                        <th>Prateleira</th>
                        <th>Divisão</th>
                        <th>Qtd. Saldo</th>
                    </tr>
                </thead>
                <tbody>
                    ${linhasLocais}
                </tbody>
            </table>
        </div>
    `;

    document.getElementById('modal-body-content').innerHTML = content;
    document.getElementById('modal-item').style.display = 'flex';
};

window.abrirModalOF = function(scId, ofId, codProd) {
    let codNorm = normalizarCod(codProd);
    
    const of = ordesAtivasFiltradas.find(o => o.sc === scId && o.of === ofId && normalizarCod(o.codProd) === codNorm);

    if (!of) {
        mostrarToast("Erro: Detalhes da Ordem não encontrados no sistema.", "error");
        return;
    }

    const item = itensProcessados.find(i => i.codNorm === codNorm);

    let linha = of.linhaOriginal || {};

    const getC = (nomesArray) => {
        let ch = encontrarChave(linha, nomesArray);
        let val = ch ? linha[ch] : '';
        return val && String(val).trim() !== '' ? String(val).trim() : '-';
    };

    let qtdPedida = converterParaNumero(getC(['of - qtd. solicitada', 'of - qtd solicitada', 'qtd solicitada']));
    let qtdEntregue = converterParaNumero(getC(['of - qtd. entregue', 'of - qtd entregue', 'qtd entregue']));
    let ofFechado = getC(['of - fechado', 'fechado of']).toLowerCase();
    let sitOF = getC(['of - situação of', 'of - situacao of', 'situacao of']).toLowerCase();
    
    let isFechada = ofFechado === 'sim' || ofFechado === 's' || sitOF.includes('fechada') || sitOF.includes('cancelada');

    let statusCalculado = of.sitOFOriginal || 'Pendente';
    let badgeClass = 'badge-transito';

    if (qtdPedida > 0 && qtdEntregue === qtdPedida) {
        statusCalculado = 'Entregue';
        badgeClass = 'badge-normal';
    } else if (qtdEntregue > 0 && qtdEntregue < qtdPedida && !isFechada) {
        statusCalculado = 'Entrega Parcial';
        badgeClass = 'badge-abaixo'; 
    } else if (qtdPedida > 0 && qtdEntregue === 0 && !isFechada) {
        statusCalculado = 'Em Trânsito';
        badgeClass = 'badge-transito'; 
    } else if (isFechada) {
        statusCalculado = 'Fechada / Cancelada';
        badgeClass = 'badge-obsoleto'; 
    }

    let dataOF = window.formatarDataBR(getC(['of - data entrega', 'data entrega of', 'sc - dt entrega', 'sc - data entrega']));
    let etaTag = `<span class="badge-status badge-transito" style="font-size:13px; padding:8px 16px;">⏳ Pendente</span>`;
    
    if (dataOF !== '-') {
        let partes = dataOF.split('/');
        if(partes.length >= 3) {
            let dtPrevista = new Date(`${partes[2].split(' ')[0]}-${partes[1]}-${partes[0]}T00:00:00`);
            let hoje = new Date();
            hoje.setHours(0,0,0,0);
            let diffDays = Math.ceil((dtPrevista - hoje) / (1000 * 60 * 60 * 24));
            
            if (diffDays < 0) etaTag = `<span class="badge-status badge-ruptura-critica" style="font-size:13px; padding:8px 16px;">🔴 Atrasado (${Math.abs(diffDays)}d)</span>`;
            else if (diffDays === 0) etaTag = `<span class="badge-status" style="background:var(--text-warning); color:#fff; font-size:13px; padding:8px 16px;">🟡 Entrega Hoje</span>`;
            else etaTag = `<span class="badge-status badge-normal" style="font-size:13px; padding:8px 16px;">🟢 No Prazo (${diffDays}d)</span>`;
        }
    }

    let pStyle = "margin-bottom: 6px; font-size: 12px; color: var(--text-primary); border-bottom: 1px dashed var(--border-color); padding-bottom: 4px; display: flex; justify-content: space-between;";
    let sTitle = "font-size: 14px; font-weight: 800; margin-bottom: 15px; text-transform: uppercase;";
    let strong = "font-weight: 700; color: var(--text-secondary); margin-right: 10px;";
    
    const makeRow = (label, names) => `<div style="${pStyle}"><span style="${strong}">${label}:</span> <span style="text-align: right; word-break: break-word; font-weight:600;">${getC(names)}</span></div>`;
    const makeDateRow = (label, names) => `<div style="${pStyle}"><span style="${strong}">${label}:</span> <span style="text-align: right; word-break: break-word; font-weight:600;">${window.formatarDataBR(getC(names))}</span></div>`;

    let col1 = `
        <div style="background: var(--bg-subcard); padding: 16px; border-radius: 12px; border: 1px solid var(--border-color);">
            <h3 style="${sTitle} color: var(--primary-color);">📝 1. Solicitação (SC)</h3>
            ${makeRow('Código SC', ['sc - codigo', 'sc codigo', 'sc'])}
            ${makeRow('Situação', ['sc - situacao', 'situacao sc'])}
            ${makeRow('Centro Custo Aprov.', ['sc - centro custo aprovador', 'centro custo aprovador'])}
            ${makeDateRow('Data Criação', ['sc - data criacao', 'data criacao sc', 'data criacao'])}
            ${makeRow('Solicitante', ['sc - nome solicitante', 'sc solicitante', 'nome solicitante'])}
            ${makeRow('Empresa', ['sc - empresa', 'empresa sc', 'empresa'])}
            ${makeRow('Filial', ['sc - filial', 'filial sc'])}
            ${makeRow('Descr. Filial', ['sc - descr. filial', 'sc - descr filial', 'desc filial', 'descr filial'])}
            ${makeRow('Cód. Produto', ['sc - cod. produto', 'sc - cod produto', 'cod produto'])}
            ${makeRow('Nome Produto', ['sc - nome produto', 'nome produto sc', 'nome produto'])}
            ${makeRow('Unid. Medida', ['sc - unid. medida', 'sc - unid medida'])}
            ${makeRow('Quantidade', ['sc - quantidade', 'quantidade sc'])}
            ${makeRow('Categoria', ['sc - categoria', 'categoria sc', 'categoria'])}
            ${makeDateRow('DT Entrega', ['sc - dt entrega', 'sc - data entrega', 'dt entrega sc'])}
            ${makeRow('Regularização', ['sc - regularizacao', 'regularizacao sc'])}
            ${makeRow('OBS', ['sc - obs', 'observacao sc', 'obs sc'])}
            ${makeRow('Local Estoque', ['sc - local estoque', 'local estoque sc', 'local estoque'])}
            ${makeRow('CCU Etq', ['sc - ccu etq', 'ccu etq'])}
            ${makeRow('Aprovador', ['sc - aprovador', 'aprovador sc', 'aprovador'])}
        </div>
    `;

    let col2 = `
        <div style="background: var(--bg-subcard); padding: 16px; border-radius: 12px; border: 1px solid var(--border-color);">
            <h3 style="${sTitle} color: var(--text-warning);">🛒 2. Fornecimento (OF)</h3>
            ${makeRow('Codigo OF', ['of - codigo', 'of codigo', 'ordem fornecimento', 'of'])}
            ${makeDateRow('Data OF', ['of - data', 'data of'])}
            ${makeRow('Fornecedor', ['of - nome fornecedor', 'nome fornecedor of', 'fornecedor'])}
            ${makeRow('Qtd. Solicitada', ['of - qtd. solicitada', 'of - qtd solicitada', 'qtd solicitada'])}
            ${makeRow('Saldo Pendente', ['of - saldo', 'saldo of', 'saldo'])}
            ${makeRow('Qtd. Entregue', ['of - qtd. entregue', 'of - qtd entregue', 'qtd entregue'])}
            ${makeRow('Fechado', ['of - fechado', 'fechado of'])}
            ${makeRow('Bloqueado', ['of - bloqueado', 'bloqueado of'])}
            ${makeDateRow('Data Entrega', ['of - data entrega', 'data entrega of'])}
            ${makeRow('Frete', ['of - frete', 'frete of'])}
            ${makeRow('Moeda', ['of - moeda', 'moeda of'])}
            ${makeRow('Situação OF', ['of - situacao of', 'situacao of'])}
            ${makeRow('Tipo', ['of - tipo', 'tipo of'])}
            ${makeRow('Email Fornecedor', ['of - email fornecedor', 'email fornecedor of', 'email fornecedor'])}
            ${makeRow('OBS', ['of - obs', 'obs of'])}
        </div>
    `;

    let col3 = `
        <div style="background: var(--bg-subcard); padding: 16px; border-radius: 12px; border: 1px solid var(--border-color);">
            <h3 style="${sTitle} color: var(--text-success);">📦 3. Recebimento (REC)</h3>
            ${makeRow('Nr NF', ['rec - nr nf', 'rec - nr. nf', 'nr nf', 'nota fiscal'])}
            ${makeRow('Série NF', ['rec - serie', 'serie nf', 'serie'])}
            ${makeDateRow('DT Emissão', ['rec - dt emissao', 'dt emissao nf', 'data emissao'])}
            ${makeDateRow('DT Entrada', ['rec - dt entrada', 'dt entrada nf', 'data entrada'])}
            ${makeRow('Unid. Medida', ['rec - unid. medida', 'rec - unid medida'])}
            ${makeRow('Quantidade Rec.', ['rec - quantidade', 'quantidade rec'])}
            ${makeRow('Valor Un. Fiscal', ['rec - valor un. fiscal', 'rec - valor un fiscal', 'valor un fiscal'])}
        </div>
    `;

    let rodapeContextoHTML = "";
    if (item) {
        rodapeContextoHTML = `
            <div style="text-align: center; padding: 20px 10px 10px; margin-top: 15px; border-top: 1px solid var(--border-color);">
                <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 15px;">Deseja aprofundar a análise de consumo, curva financeira e locais físicos deste item?</p>
                <button class="theme-btn active" onclick="abrirModalDetalhes('${item.codNorm}', '${item.filialIdBase}')" style="padding: 12px 24px; font-size: 14px; margin: 0 auto; border-radius: 8px;">
                    Abrir Contexto Analítico do Item
                </button>
            </div>
        `;
    } else {
        rodapeContextoHTML = `
            <div style="text-align: center; padding: 20px 10px 10px; margin-top: 15px; border-top: 1px dashed var(--border-color); background: rgba(245, 158, 11, 0.05); border-radius: 12px;">
                <p style="font-size: 14px; color: var(--text-warning); margin-bottom: 5px; font-weight:800;">⚠️ Item ausente no Ficheiro de Saldos</p>
                <p style="font-size: 12px; color: var(--text-secondary);">O código <strong>${of.codProd}</strong> tem pedidos em trânsito, mas não foi encontrado no arquivo mestre ("03 - Base_Itens.csv"). Por isso, o contexto analítico avançado não está disponível para ele.</p>
            </div>
        `;
    }

    const content = `
        <div class="modal-header-section" style="border-bottom:none; padding-bottom:0;">
            <div style="flex-grow: 1;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div>
                        <h2 style="font-size: 20px; font-weight: 800; color: var(--text-primary); margin-bottom: 8px;">
                            Raio-X da Ordem: <span style="color: var(--primary-color);">${of.of !== '-' ? of.of : of.sc}</span>
                        </h2>
                        <h3 style="font-size: 14px; font-weight: 600; color: var(--text-secondary); margin-bottom: 10px;">
                            Item: #${of.codProd} - ${of.descProd}
                        </h3>
                        <span class="badge-status ${badgeClass}">Status da Entrega: ${statusCalculado}</span>
                    </div>
                    ${etaTag}
                </div>
            </div>
        </div>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-top: 10px;">
            ${col1}
            ${col2}
            ${col3}
        </div>
        
        ${rodapeContextoHTML}
    `;

    document.getElementById('modal-body-content').innerHTML = content;
    document.getElementById('modal-item').style.display = 'flex';
};

window.fecharModal = function() {
    document.getElementById('modal-item').style.display = 'none';
    document.getElementById('modal-body-content').innerHTML = ''; 
};

document.getElementById('modal-item').addEventListener('click', function(e) {
    if (e.target === this) fecharModal();
});