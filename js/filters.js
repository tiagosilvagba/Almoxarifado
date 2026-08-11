import { itensProcessados, itensFiltrados, vistaAtual, mapeamentoDeImagemAtivo, imagensMapeadas } from './state.js';
import { normalizarString } from './utils.js';
import { renderizarPesquisa, renderizarDashboard, renderizarCompras, renderizarGestaoDeCompras, renderizarRevisao } from './ui.js';
import { mostrarToast } from './loader.js';

let timerBusca;

export function dispararFiltrosDebounce() {
    clearTimeout(timerBusca);
    timerBusca = setTimeout(dispararFiltrosSemAtraso, 300); 
}

window.atualizarFiltroLocais = function() {
    const filialEscolhida = document.getElementById('select-filial').value;
    const selectLocal = document.getElementById('select-local');
    const localAtual = selectLocal.value;

    selectLocal.innerHTML = '<option value="">Todos os Locais</option>';

    let locaisValidos = Array.from(window.setLocaisUnicos);
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

export function dispararFiltrosSemAtraso() {
    let valCatalogo = document.getElementById('busca')?.value || "";
    let valCompras = document.getElementById('busca-compras')?.value || "";
    let valGestao = document.getElementById('busca-ofs')?.value || "";
    
    let termoBruto = "";
    if (vistaAtual === 'pesquisa') termoBruto = valCatalogo;
    else if (vistaAtual === 'compras') termoBruto = valCompras;
    else if (vistaAtual === 'gestao-compras') termoBruto = valGestao;
    else termoBruto = valCatalogo; 

    const termosSplit = termoBruto ? normalizarString(termoBruto).split(',').map(t => t.trim()).filter(t => t) : [];
    
    const statusFiltro = document.getElementById('select-saldo-status').value;
    const curvaFiltro = document.getElementById('select-curva').value;
    const imagemFiltro = document.getElementById('select-imagem').value;
    const filialFiltro = document.getElementById('select-filial')?.value || window.filtroGraficoFilial || "";
    const localFiltro = document.getElementById('select-local')?.value || "";

    if (imagemFiltro !== "" && !mapeamentoDeImagemAtivo) {
        mostrarToast("Para filtrar por imagens, mapeie a pasta no menu lateral.", "warning");
        document.getElementById('select-imagem').value = "";
        return;
    }

    window.itensFiltrados = itensProcessados.filter(i => {
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
    if (tipo === 'abc') { window.filtroGraficoABC = null; document.getElementById('filtro-abc-aviso').style.display = 'none'; }
    if (tipo === 'status') { window.filtroGraficoStatus = null; document.getElementById('filtro-status-aviso').style.display = 'none'; }
    if (tipo === 'filial') { window.filtroGraficoFilial = null; document.getElementById('filtro-filial-aviso').style.display = 'none'; }
    dispararFiltrosSemAtraso();
}

window.limparFiltros = function() {
    document.getElementById('select-curva').value = "";
    document.getElementById('select-saldo-status').value = "";
    document.getElementById('select-imagem').value = "";
    if(document.getElementById('select-filial')) document.getElementById('select-filial').value = "";
    if(document.getElementById('select-local')) document.getElementById('select-local').value = "";
    if(document.getElementById('select-status-of')) document.getElementById('select-status-of').value = "";
    document.getElementById('busca').value = "";
    document.getElementById('busca-compras').value = "";
    document.getElementById('busca-ofs').value = "";
    
    window.filtroGraficoABC = null; window.filtroGraficoStatus = null; window.filtroGraficoFilial = null;
    document.getElementById('filtro-abc-aviso').style.display = 'none';
    document.getElementById('filtro-status-aviso').style.display = 'none';
    document.getElementById('filtro-filial-aviso').style.display = 'none';
    window.atualizarFiltroLocais(); 
}