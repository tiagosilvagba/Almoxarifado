import { state } from './state.js';
import { formatarMoedaMask, mostrarToast, normalizarCod } from './utils.js';

// --- FUNÇÕES DE LOADER E NOTIFICAÇÕES TELA ---
export function setProgress(percent, msg, type='info') {
    state.loaderProgress = percent;
    const bar = document.getElementById('loader-bar');
    const text = document.getElementById('loader-percent');
    if(bar) bar.style.width = `${percent}%`;
    if(text) text.innerText = `${Math.round(percent)}%`;
    if(msg) addLog(msg, type);
}

export function addLog(msg, type='info') {
    const logs = document.getElementById('loader-logs');
    if(logs) {
        let classe = type === 'error' ? 'class="error"' : type === 'success' ? 'class="success"' : type === 'warning' ? 'class="warning"' : '';
        logs.innerHTML += `<div ${classe}>> ${msg}</div>`;
        logs.scrollTop = logs.scrollHeight;
    }
}

export function mostrarErroLoaderFatal() {
    const btn = document.getElementById('btn-fallback');
    if(btn) btn.style.display = 'block';
}

export function fecharLoader() {
    const loader = document.getElementById('tech-loader');
    const app = document.getElementById('app-layout');
    if(loader && app) {
        loader.style.opacity = '0';
        app.style.opacity = '1';
        setTimeout(() => loader.style.display = 'none', 600);
    }
}

// --- RENDERIZAÇÃO DE TELAS ---
export function renderizarPesquisa() {
    const container = document.getElementById('resultados');
    document.getElementById('contador-itens').innerText = `${state.itensFiltrados.length} itens encontrados.`;
    
    let htmlLote = [];
    state.itensFiltrados.slice(0, 100).forEach(i => { 
        let giroMensalDias = i.diasGiroMensal === Infinity ? 'Sem Consumo' : `${i.diasGiroMensal}d`;
        let giroAnualDias = i.diasGiroAnual === Infinity ? 'Sem Consumo' : `${i.diasGiroAnual}d`;

        let imagemHTML = state.mapeamentoDeImagemAtivo 
            ? (i.temImagem ? `<img src="imagens/${i.cod} - 01.jpg" alt="Foto ${i.cod}">` : `<div class="img-placeholder">🚫 FOTO NÃO ENCONTRADA</div>`)
            : `<img src="imagens/${i.cod} - 01.jpg" alt="Foto ${i.cod}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"><div class="img-placeholder" style="display:none;">🚫 FOTO NÃO ENCONTRADA</div>`;

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
                        <div class="item-metrics-grid" style="margin-top:10px;">
                            <div class="metric-box metric-saldo"><span class="metric-label">Saldo Atual</span><span class="metric-value">${i.saldo}</span></div>
                            <div class="metric-box metric-default"><span class="metric-label">Giro Mensal</span><span class="metric-value">${giroMensalDias}</span></div>
                            <div class="metric-box metric-default"><span class="metric-label">Consumo</span><span class="metric-value">${formatarMoedaMask(i.consumoFinanceiro)}</span></div>
                        </div>
                    </div>
                </div>
            </div>
        `);
    });
    container.innerHTML = htmlLote.join('');
}

export function renderizarDashboard() {
    let valorTotal = 0, valorObsoleto = 0, qtdObsoleto = 0;
    let qtdRupturaCritica = 0, qtdRupturaTransito = 0, qtdRiscoMinimo = 0, qtdExcesso = 0;
    let totalConsumoMensalFinanceiro = 0, skusAtivos = 0;

    state.itensFiltrados.forEach(i => {
        valorTotal += i.valorImobilizado;
        totalConsumoMensalFinanceiro += i.consumoFinanceiro;
        if (i.saldo > 0) skusAtivos++;
        if (i.status === 'Ruptura Crítica (Sem Pedido)') qtdRupturaCritica++;
        if (i.status === 'Ruptura (Em Trânsito)') qtdRupturaTransito++;
        if (i.status === 'Obsoleto (Sem Consumo)') { valorObsoleto += i.valorImobilizado; qtdObsoleto++; }
        if (i.status === 'Abaixo Mínimo') qtdRiscoMinimo++;
        if (i.status === 'Excesso Estoque') qtdExcesso++;
    });

    const safeSetText = (id, text) => { const el = document.getElementById(id); if (el) el.innerText = text; };

    safeSetText('dash-kpi-valor-total', formatarMoedaMask(valorTotal));
    safeSetText('dash-kpi-total-itens', `Em ${state.itensFiltrados.length} SKUs`);
    safeSetText('dash-kpi-ruptura-critica', qtdRupturaCritica);
    safeSetText('dash-kpi-risco-minimo', qtdRiscoMinimo);
    safeSetText('dash-kpi-excesso', qtdExcesso);
    safeSetText('dash-kpi-ruptura-transito', qtdRupturaTransito);
    safeSetText('dash-kpi-valor-obsoleto', formatarMoedaMask(valorObsoleto));
    safeSetText('dash-kpi-obsoleto-qtd', `${qtdObsoleto} itens`);
    safeSetText('dash-kpi-skus-ativos', skusAtivos);
    safeSetText('dash-kpi-volume-fisico', formatarMoedaMask(valorTotal));
    safeSetText('dash-kpi-consumo-financeiro', formatarMoedaMask(totalConsumoMensalFinanceiro));

    atualizarGraficos(); 
    renderizarTabelaDashboard(); 
}

export function renderizarTabelaDashboard() {
    const tbody = document.getElementById('dash-table-body');
    if (!tbody) return;

    let htmlLote = [];
    let itensTabela = state.itensFiltrados;

    if (state.filtroGraficoABC) itensTabela = itensTabela.filter(i => i.curva === state.filtroGraficoABC);
    if (state.filtroGraficoStatus) itensTabela = itensTabela.filter(i => i.status.includes(state.filtroGraficoStatus));

    itensTabela.slice(0, 50).forEach(i => { 
        htmlLote.push(`
            <tr onclick="abrirModalDetalhes('${i.codNorm}', '${i.filialIdBase}')">
                <td><div class="abc-badge curva-${i.curva}" style="position:static; width:28px; height:28px; font-size:12px;">${i.curva}</div></td>
                <td><strong>#${i.cod}</strong><br><small>${i.desc}</small></td>
                <td>Rep ${i.reparticao} | Prat ${i.prateleira}</td>
                <td>${i.saldo}</td>
                <td>${formatarMoedaMask(i.consumoFinanceiro)}</td>
                <td>${i.diasGiroMensal === Infinity ? 'Obsoleto' : i.diasGiroMensal + 'd'}</td>
                <td><span class="badge-status ${i.statusBadge}">${i.status}</span></td>
            </tr>
        `);
    });
    tbody.innerHTML = htmlLote.join('') || `<tr><td colspan="7">Nenhum dado encontrado.</td></tr>`;
}

export function atualizarGraficos() {
    if (state.chartABCInstance) state.chartABCInstance.destroy();
    if (state.chartStatusInstance) state.chartStatusInstance.destroy();

    const ctxABC = document.getElementById('chartABC')?.getContext('2d');
    const ctxStatus = document.getElementById('chartStatus')?.getContext('2d');
    if (!ctxABC || !ctxStatus) return;

    const volumeABC = { A: 0, B: 0, C: 0 };
    state.itensFiltrados.forEach(i => { volumeABC[i.curva] += i.consumoFinanceiro; });

    state.chartABCInstance = new Chart(ctxABC, {
        type: 'doughnut',
        data: {
            labels: ['Curva A', 'Curva B', 'Curva C'],
            datasets: [{ data: [volumeABC.A, volumeABC.B, volumeABC.C], backgroundColor: ['#10b981', '#0ea5e9', '#64748b'] }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

// --- MODAIS E LIGHTBOX ---
export function abrirModalDetalhes(codNorm, filialIdBase) {
    const item = state.itensProcessados.find(i => i.codNorm === codNorm && i.filialIdBase === filialIdBase);
    if (!item) return;

    const content = `
        <h2>#${item.cod} - ${item.desc}</h2>
        <p><strong>Saldo Atual:</strong> ${item.saldo}</p>
        <p><strong>Valor Imobilizado:</strong> ${formatarMoedaMask(item.valorImobilizado)}</p>
    `;

    document.getElementById('modal-body-content').innerHTML = content;
    document.getElementById('modal-item').style.display = 'flex';
}

export function abrirModalOF(ofId, codProd) {
    let codNorm = normalizarCod(codProd);
    const of = state.ordesAtivasFiltradas.find(o => o.of === ofId && normalizarCod(o.codProd) === codNorm);
    const item = state.itensProcessados.find(i => i.codNorm === codNorm);

    if (!of || !item) {
        mostrarToast("Erro: Detalhes da OF ou do Item não encontrados.", "error");
        return;
    }

    const content = `
        <h2>Gestão de OF: <span style="color: var(--primary-color);">${of.of}</span></h2>
        <p>Item: #${of.codProd} - ${of.descProd}</p>
        <p>Fornecedor: <strong>${of.fornecedor}</strong></p>
        <p>Saldo Pendente: <strong style="color:var(--text-warning);">${of.saldoOF}</strong></p>
    `;

    document.getElementById('modal-body-content').innerHTML = content;
    document.getElementById('modal-item').style.display = 'flex';
}

export function fecharModal() {
    document.getElementById('modal-item').style.display = 'none';
}

export function abrirLightboxArray(imgs, idx) {
    state.currentLightboxImages = imgs.split(',');
    state.currentLightboxIndex = idx;
    const img = document.getElementById('lightbox-img');
    if (img) img.src = state.currentLightboxImages[idx];
    document.getElementById('lightbox-overlay').style.display = 'flex';
}

export function fecharLightbox() {
    document.getElementById('lightbox-overlay').style.display = 'none';
}