import { itensFiltrados, itensProcessados, ordesAtivasFiltradas, mapeamentoDeImagemAtivo, imagensMapeadas } from './state.js';
import { formatarMoedaMask } from './utils.js';

let chartABCInstance = null;
let chartStatusInstance = null;
let chartFiliaisInstance = null;

export function renderizarPesquisa() {
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
                            <div class="metric-box metric-default"><span class="metric-label">Custo Consumo</span><span class="metric-value">${formatarMoedaMask(i.consumoFinanceiro, window.ocultarValoresFinanceiros)}</span></div>
                        </div>
                    </div>
                </div>
            </div>
        `);
    });
    
    container.innerHTML = htmlLote.join('');
}

export function renderizarRevisao() {
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
                <td style="font-size:12px; font-weight:600; color:var(--text-primary);">${formatarMoedaMask(i.consumoFinanceiro, window.ocultarValoresFinanceiros)}</td>
                <td style="font-size:13px; font-weight:800; color:${colorAcao};">${acao}</td>
            </tr>
        `);
    });
    
    tbody.innerHTML = htmlLote.join('') || `<tr><td colspan="8" style="text-align:center; padding: 40px; font-weight: 500; color: var(--text-secondary);">Nenhum item exige revisão de parâmetros nos filtros atuais.</td></tr>`;
}

export function renderizarCompras() {
    const tbody = document.getElementById('compras-table-body');
    const divResumo = document.getElementById('resumo-necessidade');
    let htmlLote = [];
    let totalQtd = 0;
    let totalValor = 0;
    
    const necessitaCompra = itensFiltrados.filter(i => (i.saldo <= 0 || i.saldo < i.minimo) && i.minimo > 0 && i.maximo > 0);
    
    necessitaCompra.sort((a,b) => a.saldo - b.saldo).forEach(i => {
        let sug = i.maximo - i.saldo;
        totalQtd += sug;
        totalValor += (sug * i.custoUnitario);

        htmlLote.push(`
            <tr class="fade-in" style="cursor:pointer;" onclick="abrirModalDetalhes('${i.codNorm}', '${i.filialIdBase}')">
                <td><strong style="color:var(--primary-color);">#${i.cod}</strong><br><span style="font-size:11px;color:var(--text-secondary); font-weight:500;">${i.desc}</span></td>
                <td style="font-size:11px; font-weight:700; color:var(--text-secondary);">${i.filialNm}</td>
                <td style="font-size:14px; font-weight:900; color:var(--text-critical);">${i.saldo}</td>
                <td style="font-size:12px; font-weight:700; color:var(--text-warning);">${i.minimo}</td>
                <td style="font-size:12px; font-weight:700; color:var(--primary-color);">${i.maximo}</td>
                <td style="font-size:14px; font-weight:900; color:var(--text-success);">COMPRAR +${sug}</td>
            </tr>
        `);
    });
    
    if (divResumo) {
        divResumo.innerHTML = `
            <div class="kpi-card border-warning"><span class="kpi-title">Total de Itens (Qtd Reposição)</span><span class="kpi-value color-warning">${totalQtd.toLocaleString('pt-BR')}</span></div>
            <div class="kpi-card border-success"><span class="kpi-title">Valor Estimado de Compras</span><span class="kpi-value color-success">${formatarMoedaMask(totalValor, window.ocultarValoresFinanceiros)}</span></div>
        `;
    }

    tbody.innerHTML = htmlLote.join('') || `<tr><td colspan="6" style="text-align:center; padding: 40px; font-weight: 500; color: var(--text-secondary);">Sem necessidade de compras críticas para os filtros atuais.</td></tr>`;
}

export function renderizarGestaoDeCompras(termosSplit = [], filialFiltro = "") {
    const tbody = document.getElementById('ofs-table-body');
    const divResumo = document.getElementById('resumo-ofs');
    let htmlLote = [];
    
    const statusOfFiltro = document.getElementById('select-status-of').value;

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
        let itemRef = mapaItens.get(i => i.codNorm === of.codProd); 
        let val = of.saldoOF * (itemRef ? itemRef.custoUnitario : 0);
        valTransitoTotal += val;
        qtdTransitoTotal += of.saldoOF;
        fornSet.add(of.fornecedor);
        ofSet.add(of.of);
    });

    ofsExibir.slice(0, 100).forEach(of => {
        let descOriginal = of.qtdPedidaOriginal > 0 ? of.qtdPedidaOriginal : of.saldoOF;
        
        htmlLote.push(`
            <tr class="fade-in" style="cursor:pointer;" onclick="abrirModalOF('${of.of}', '${of.codProd}')">
                <td>
                    <strong style="color:var(--text-primary);">${of.of}</strong><br>
                    <span style="font-size:10px;color:var(--text-secondary);">SC: ${of.sc}</span><br>
                    <span style="font-size:10px;color:var(--primary-color); font-weight: 600;">👤 Req: ${of.solicitante}</span>
                </td>
                <td><strong style="color:var(--primary-color);">#${of.codProd}</strong><br><span style="font-size:11px;color:var(--text-secondary); font-weight:500;">${of.descProd}</span></td>
                <td style="font-size:11px; font-weight:700; color:var(--text-secondary);">${of.fornecedor}</td>
                <td style="font-size:13px; font-weight:600; color:var(--text-primary);">${descOriginal}</td>
                <td style="font-size:14px; font-weight:900; color:var(--text-warning);">${of.saldoOF} und</td>
                <td style="font-size:12px; font-weight:700; color:var(--text-primary);">${of.dataEntrega}</td>
            </tr>
        `);
    });
    
    if (divResumo) {
        divResumo.innerHTML = `
            <div class="kpi-card border-info"><span class="kpi-title">Valor Pendente em OF</span><span class="kpi-value color-info">${formatarMoedaMask(valTransitoTotal, window.ocultarValoresFinanceiros)}</span></div>
            <div class="kpi-card"><span class="kpi-title">Saldo Físico a Receber</span><span class="kpi-value">${qtdTransitoTotal}</span></div>
            <div class="kpi-card"><span class="kpi-title">OFs em Aberto</span><span class="kpi-value">${ofSet.size}</span></div>
            <div class="kpi-card"><span class="kpi-title">Fornecedores Diferentes</span><span class="kpi-value">${fornSet.size}</span></div>
        `;
    }

    tbody.innerHTML = htmlLote.join('') || `<tr><td colspan="6" style="text-align:center; padding: 40px; font-weight: 500; color: var(--text-secondary);">Sem OFs pendentes ou ativas para os filtros.</td></tr>`;
}

export function renderizarDashboard() {
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

    safeSetText('dash-kpi-valor-total', formatarMoedaMask(valorTotal, window.ocultarValoresFinanceiros));
    safeSetText('dash-kpi-total-itens', `Em ${itensFiltrados.length} SKUs`);
    
    safeSetText('dash-kpi-giro-anual', totalConsumoMensalFinanceiro > 0 ? `${giroAnualDias} dias` : 'Sem Consumo');
    safeSetText('dash-kpi-giro-medio', totalConsumoMensalFinanceiro > 0 ? `${giroMensalDias} dias` : 'Sem Consumo');
    
    safeSetText('dash-kpi-ruptura-critica', qtdRupturaCritica);
    safeSetText('dash-kpi-risco-minimo', qtdRiscoMinimo);
    safeSetText('dash-kpi-excesso', qtdExcesso);
    safeSetText('dash-kpi-ruptura-transito', qtdRupturaTransito);
    safeSetText('dash-kpi-valor-obsoleto', formatarMoedaMask(valorObsoleto, window.ocultarValoresFinanceiros));
    safeSetText('dash-kpi-obsoleto-qtd', `${qtdObsoleto} itens`);
    safeSetText('dash-kpi-skus-ativos', skusAtivos);
    
    safeSetText('dash-kpi-volume-fisico', formatarMoedaMask(totalSaldoFinanceiro, window.ocultarValoresFinanceiros));
    safeSetText('dash-kpi-consumo-financeiro', formatarMoedaMask(totalConsumoMensalFinanceiro, window.ocultarValoresFinanceiros));
    safeSetText('dash-kpi-total-itens-proc', itensProcessados.length);

    atualizarGraficos(); 
    renderizarTabelaDashboard(); 
}

function renderizarTabelaDashboard() {
    const tbody = document.getElementById('dash-table-body');
    if (!tbody) return;

    let htmlLote = [];
    let itensTabela = itensFiltrados;

    if (window.filtroGraficoABC) {
        itensTabela = itensTabela.filter(i => i.curva === window.filtroGraficoABC);
        document.getElementById('filtro-abc-aviso').style.display = 'inline-block';
        document.getElementById('filtro-abc-aviso').innerText = `✖ Filtro ABC: Curva ${window.filtroGraficoABC}`;
    } else { 
        const fAbc = document.getElementById('filtro-abc-aviso');
        if(fAbc) fAbc.style.display = 'none'; 
    }

    if (window.filtroGraficoStatus) {
        if (window.filtroGraficoStatus === 'Ruptura') itensTabela = itensTabela.filter(i => i.status.includes('Ruptura')); 
        else if (window.filtroGraficoStatus === 'Obsoleto') itensTabela = itensTabela.filter(i => i.status.includes('Obsoleto'));
        else itensTabela = itensTabela.filter(i => i.status === window.filtroGraficoStatus);
        
        document.getElementById('filtro-status-aviso').style.display = 'inline-block';
        document.getElementById('filtro-status-aviso').innerText = `✖ Filtro Status: ${window.filtroGraficoStatus}`;
    } else { 
        const fStatus = document.getElementById('filtro-status-aviso');
        if(fStatus) fStatus.style.display = 'none'; 
    }
    
    if (window.filtroGraficoFilial) {
        itensTabela = itensTabela.filter(i => i.filialNm === window.filtroGraficoFilial);
        document.getElementById('filtro-filial-aviso').style.display = 'inline-block';
        document.getElementById('filtro-filial-aviso').innerText = `✖ Filtro Filial: ${window.filtroGraficoFilial}`;
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
                <td style="color:var(--text-primary); font-weight:600;">${formatarMoedaMask(i.consumoFinanceiro, window.ocultarValoresFinanceiros)}</td>
                <td style="font-weight:700; color:var(--text-primary);">${giroText}</td>
                <td><span class="badge-status ${i.statusBadge}">${i.status}</span></td>
            </tr>
        `);
    });
    tbody.innerHTML = htmlLote.join('') || `<tr><td colspan="7" style="text-align:center; padding: 40px; font-weight: 500; color: var(--text-secondary);">Nenhum dado encontrado para os filtros ativos.</td></tr>`;
}

function atualizarGraficos() {
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
                    window.filtroGraficoABC = (window.filtroGraficoABC === curvaEscolhida) ? null : curvaEscolhida;
                    renderizarTabelaDashboard(); 
                }
            },
            onHover: (event, chartElement) => { event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default'; },
            plugins: { title: { display: true, text: `Custo Consumo Financeiro (${window.mesConsumoAtual})`, font: { size: 14, weight: '800' } }, legend: { position: 'bottom', labels: { boxWidth: 12, usePointStyle: true } } },
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
                    window.filtroGraficoStatus = (window.filtroGraficoStatus === statusEscolhido) ? null : statusEscolhido;
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
                        window.filtroGraficoFilial = (window.filtroGraficoFilial === filialEscolhida) ? null : filialEscolhida;
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