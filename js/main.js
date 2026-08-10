import { state } from './state.js';
import { carregarArquivosAutomaticamente, uploadManualMultiplo, mapearImagensPasta } from './loader.js';
import { processarInteligencia, exportarComprasExcel, exportarRevisaoExcel } from './estoque.js';
import { renderizarPesquisa, renderizarDashboard, renderizarTabelaDashboard, abrirModalDetalhes, fecharModal, abrirLightboxArray, fecharLightbox } from './ui.js';
import { formatarMoedaMask } from './utils.js';

// Exposição para eventos inline do HTML
window.navegarPara = navegarPara;
window.alterarTema = alterarTema;
window.toggleValoresFinanceiros = toggleValoresFinanceiros;
window.toggleSegmentacao = toggleSegmentacao;
window.carregarArquivosAutomaticamente = carregarArquivosAutomaticamente;
window.uploadManualMultiplo = uploadManualMultiplo;
window.mapearImagensPasta = mapearImagensPasta;
window.dispararFiltrosDebounce = dispararFiltrosDebounce;
window.dispararFiltros = dispararFiltros;
window.atualizarFiltroLocais = atualizarFiltroLocais;
window.limparFiltros = limparFiltros;
window.exportarComprasExcel = exportarComprasExcel;
window.exportarRevisaoExcel = exportarRevisaoExcel;
window.abrirModalDetalhes = abrirModalDetalhes;
window.fecharModal = fecharModal;
window.abrirLightboxArray = abrirLightboxArray;
window.fecharLightbox = fecharLightbox;

document.addEventListener('DOMContentLoaded', () => {
    const temaLocal = localStorage.getItem('temaAlmoxarifado') || 'light';
    alterarTema(temaLocal);
    
    setTimeout(() => {
        if (!state.isFetchingData) carregarArquivosAutomaticamente();
    }, 100);
});

export function navegarPara(view) {
    state.vistaAtual = view;
    ['pesquisa', 'dashboard', 'compras', 'gestao-compras', 'instrucoes', 'revisao'].forEach(v => {
        const el = document.getElementById(`view-${v}`);
        const nav = document.getElementById(`nav-${v}`);
        if (el) el.style.display = (v === view) ? 'flex' : 'none';
        if (nav) nav.classList.toggle('active', v === view);
    });
    if (view === 'pesquisa') renderizarPesquisa();
    if (view === 'dashboard') renderizarDashboard();
}

export function alterarTema(tema) {
    if (tema === 'light') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', tema);
    localStorage.setItem('temaAlmoxarifado', tema); 
}

export function toggleValoresFinanceiros() {
    state.ocultarValoresFinanceiros = !state.ocultarValoresFinanceiros;
    const icone = document.getElementById('icone-valores');
    if (icone) icone.innerText = state.ocultarValoresFinanceiros ? '👁️ Mostrar Valores R$' : '🙈 Ocultar Valores R$';
    dispararFiltros();
}

export function toggleSegmentacao() {
    document.getElementById('app-layout').classList.toggle('segmentation-hidden');
}

let timerBusca;
export function dispararFiltrosDebounce() {
    clearTimeout(timerBusca);
    timerBusca = setTimeout(dispararFiltros, 300);
}

export function dispararFiltros() {
    state.itensFiltrados = state.itensProcessados;
    if (state.vistaAtual === 'pesquisa') renderizarPesquisa();
    if (state.vistaAtual === 'dashboard') renderizarDashboard();
}

export function atualizarFiltroLocais() { dispararFiltros(); }
export function limparFiltros() { dispararFiltros(); }

window.dispararFiltrosSemAtraso = dispararFiltros;