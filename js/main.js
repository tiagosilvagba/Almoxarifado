import { carregarArquivosAutomaticamente } from './storage.js';
import { dispararFiltrosDebounce, dispararFiltrosSemAtraso } from './filters.js';
import { renderizarCompras, renderizarGestaoDeCompras, renderizarRevisao } from './ui.js';
import './modals.js';
import './export.js';

document.addEventListener('DOMContentLoaded', () => {
    const temaLocal = localStorage.getItem('temaAlmoxarifado') || 'light';
    document.querySelectorAll('.theme-btn').forEach(btn => {
        if(btn.getAttribute('data-theme-val') === temaLocal) btn.classList.add('active');
    });
    
    document.getElementById('busca')?.addEventListener('input', dispararFiltrosDebounce);
    document.getElementById('busca-compras')?.addEventListener('input', dispararFiltrosDebounce);
    document.getElementById('busca-ofs')?.addEventListener('input', dispararFiltrosDebounce);
    
    setTimeout(() => { 
        if (!window.isFetchingData) carregarArquivosAutomaticamente(); 
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
}

window.navegarPara = function(view) {
    window.vistaAtual = view;
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

window.toggleValoresFinanceiros = function() {
    window.ocultarValoresFinanceiros = !window.ocultarValoresFinanceiros;
    const icone = document.getElementById('icone-valores');
    if (icone) {
        icone.innerText = window.ocultarValoresFinanceiros ? '👁️ Mostrar Valores R$' : '🙈 Ocultar Valores R$';
    }
    dispararFiltrosSemAtraso(); 
}