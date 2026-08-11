// ==========================================================================
// 1. ESTADO GLOBAL DO SISTEMA E VARIÁVEIS
// ==========================================================================
const bases = { baseItens: [], compras: [], consumos: [] };
let itensProcessados = [];
let itensFiltrados = [];
let ordesAtivasFiltradas = [];

let vistaAtual = 'dashboard';
let chartABCInstance = null;
let chartStatusInstance = null;
let chartFiliaisInstance = null;
let mesesAnalisados = 1; 
let filtroGraficoABC = null; 
let filtroGraficoStatus = null;
let filtroGraficoFilial = null;
let mesConsumoAtual = "MÊS";
let isFetchingData = false; 
let loaderProgress = 0;

let imagensMapeadas = new Set();
let mapeamentoDeImagemAtivo = false;
let setLocaisUnicos = new Set(); 
let setStatusOFUnicos = new Set(); 

let ocultarValoresFinanceiros = true; 
let currentLightboxImages = [];
let currentLightboxIndex = 0;

if (typeof Chart !== 'undefined') Chart.defaults.font.family = "'Inter', system-ui, sans-serif";

// ==========================================================================
// 2. FUNÇÕES ÚTEIS E PARSER
// ==========================================================================
function normalizarString(val) { 
    return String(val || '').normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, ' ').trim(); 
}

function normalizarCod(val) { 
    return String(val || '').toLowerCase().replace(/\./g, '').replace(/[^a-z0-9-]/g, '').replace(/^0+/, ''); 
}

function converterParaNumero(val) {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return val;
    let str = String(val).trim().replace(/[R$\s]/g, '');
    if (str.includes(',')) str = str.replace(/\./g, '').replace(',', '.');
    let floatVal = parseFloat(str);
    return isNaN(floatVal) ? 0 : floatVal;
}

function encontrarChave(objRef, termosChave) {
    if (!objRef) return null;
    const chaves = Object.keys(objRef);
    for (const termo of termosChave) {
        const termoBusca = normalizarString(termo);
        for (const chave of chaves) {
            if (normalizarString(chave) === termoBusca) return chave;
        }
    }
    for (const termo of termosChave) {
        const termoBusca = normalizarString(termo);
        if (termoBusca.length <= 3) continue; 
        for (const chave of chaves) {
            if (normalizarString(chave).includes(termoBusca)) return chave;
        }
    }
    return null;
}

function formatarMoeda(valor) { 
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); 
}

function formatarMoedaMask(valor) {
    if (ocultarValoresFinanceiros) return 'R$ ***';
    return formatarMoeda(valor);
}

window.toggleValoresFinanceiros = function() {
    ocultarValoresFinanceiros = !ocultarValoresFinanceiros;
    const icone = document.getElementById('icone-valores');
    if (icone) {
        icone.innerText = ocultarValoresFinanceiros ? '👁️ Mostrar Valores R$' : '🙈 Ocultar Valores R$';
    }
    if (typeof dispararFiltrosSemAtraso === 'function') dispararFiltrosSemAtraso(); 
}

function parseCSVFast(text) {
    let lines = text.split(/\r?\n/);
    let headerIndex = 0;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].replace(/[;\s"]/g, '').length > 0) { headerIndex = i; break; }
    }
    let validText = lines.slice(headerIndex).join('\n');
    let result = Papa.parse(validText, { header: true, skipEmptyLines: true, dynamicTyping: false });
    return result.data;
}

// ==========================================================================
// 3. TELA DE CARREGAMENTO E MENSAGENS (TOASTS)
// ==========================================================================
function setProgress(percent, msg, type='info') {
    loaderProgress = percent;
    const bar = document.getElementById('loader-bar');
    const text = document.getElementById('loader-percent');
    if(bar) bar.style.width = `${percent}%`;
    if(text) text.innerText = `${Math.round(percent)}%`;
    if(msg) addLog(msg, type);
}

function addLog(msg, type='info') {
    const logs = document.getElementById('loader-logs');
    if(logs) {
        let classe = type === 'error' ? 'class="error"' : type === 'success' ? 'class="success"' : type === 'warning' ? 'class="warning"' : '';
        logs.innerHTML += `<div ${classe}>> ${msg}</div>`;
        logs.scrollTop = logs.scrollHeight;
    }
}

function mostrarErroLoaderFatal() {
    const ring = document.getElementById('loader-ring');
    const btn = document.getElementById('btn-fallback');
    if(ring) ring.classList.add('error');
    if(btn) btn.style.display = 'block';
}

function fecharLoader() {
    const loader = document.getElementById('tech-loader');
    const app = document.getElementById('app-layout');
    if(loader && app) {
        loader.style.opacity = '0';
        app.style.opacity = '1';
        setTimeout(() => loader.style.display = 'none', 600);
    }
}

function mostrarToast(mensagem, tipo = 'info') {
    const container = document.getElementById('toast-container');
    if(!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    toast.innerText = mensagem;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 5000);
}

// ==========================================================================
// 4. LIGHTBOX SEGURO E NATIVO (Zoom Imagens)
// ==========================================================================
window.abrirLightboxArray = function(imageArrayString, index, event) {
    if(event) event.stopPropagation();
    currentLightboxImages = imageArrayString.split(',');
    currentLightboxIndex = index;
    atualizarImagemLightbox();
    document.getElementById('lightbox-overlay').style.display = 'flex';
}

function atualizarImagemLightbox() {
    const img = document.getElementById('lightbox-img');
    const counter = document.getElementById('lightbox-counter');
    if(img && currentLightboxImages.length > 0) {
        img.src = currentLightboxImages[currentLightboxIndex];
        counter.innerText = `${currentLightboxIndex + 1} / ${currentLightboxImages.length}`;
    }
}

window.navegarLightbox = function(direcao, event) {
    if(event) event.stopPropagation();
    currentLightboxIndex += direcao;
    if(currentLightboxIndex < 0) currentLightboxIndex = currentLightboxImages.length - 1;
    if(currentLightboxIndex >= currentLightboxImages.length) currentLightboxIndex = 0;
    atualizarImagemLightbox();
}

window.fecharLightbox = function() {
    const overlay = document.getElementById('lightbox-overlay');
    if(overlay) overlay.style.display = 'none';
    currentLightboxImages = [];
}

document.addEventListener('keydown', function(event) {
    const overlay = document.getElementById('lightbox-overlay');
    if (overlay && overlay.style.display === 'flex') {
        if (event.key === 'ArrowRight') navegarLightbox(1);
        if (event.key === 'ArrowLeft') navegarLightbox(-1);
        if (event.key === 'Escape') fecharLightbox();
    }
});