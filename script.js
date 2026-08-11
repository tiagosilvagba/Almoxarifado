// ==========================================================================
// ESTADO GLOBAL DO SISTEMA E VARIÁVEIS
// ==========================================================================
const bases = { baseItens: [], compras: [], consumos: [] };
let itensProcessados = [];
let itensFiltrados = [];

// Estrutura para armazenar as OFs ativas extraídas de compras.csv
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
let setStatusOFUnicos = new Set(); // Filtro avançado de status OF

// Controle de visualização de valores monetários (Ocultos por Padrão)
let ocultarValoresFinanceiros = true; 

// Estado do Lightbox Nativo e Seguro
let currentLightboxImages = [];
let currentLightboxIndex = 0;

if (typeof Chart !== 'undefined') Chart.defaults.font.family = "'Inter', system-ui, sans-serif";

// ==========================================================================
// FUNÇÕES DE UTILIDADE E NORMALIZAÇÃO
// ==========================================================================
function normalizarCod(codigo) {
    if (codigo === null || codigo === undefined) return '';
    let str = String(codigo).trim();
    if (str.endsWith('.0')) str = str.slice(0, -2);
    return str.replace(/^0+/, '');
}

function normalizarString(str) {
    if (!str) return '';
    return String(str)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

function converterParaNumero(val) {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    let s = String(val).trim();
    if (s === '-' || s === '') return 0;
    
    // Formato brasileiro (ex: 1.234,56) vs formato americano (ex: 1,234.56)
    if (s.includes(',') && s.includes('.')) {
        if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
            s = s.replace(/\./g, '').replace(',', '.');
        } else {
            s = s.replace(/,/g, '');
        }
    } else if (s.includes(',')) {
        s = s.replace(',', '.');
    }
    let num = parseFloat(s);
    return isNaN(num) ? 0 : num;
}

function formatarMoeda(val) {
    if (ocultarValoresFinanceiros) return 'R$ ••••••';
    let num = converterParaNumero(val);
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarNumero(val, casas = 0) {
    let num = converterParaNumero(val);
    return num.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function encontrarChave(obj, candidatos) {
    if (!obj) return null;
    const chavesObj = Object.keys(obj);
    for (let cand of candidatos) {
        let normCand = normalizarString(cand);
        for (let ch of chavesObj) {
            if (normalizarString(ch) === normCand) return ch;
        }
    }
    // Busca parcial por inclusão
    for (let cand of candidatos) {
        let normCand = normalizarString(cand);
        for (let ch of chavesObj) {
            let normCh = normalizarString(ch);
            if (normCh.includes(normCand) || normCand.includes(normCh)) return ch;
        }
    }
    return null;
}

// ==========================================================================
// TOASTS E NOTIFICAÇÕES
// ==========================================================================
function mostrarToast(mensagem, tipo = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    toast.innerText = mensagem;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.4s ease-in forwards';
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}

// ==========================================================================
// MODAL EXCLUSIVO PARA ANÁLISE DE GESTÃO DE OF (RAIO-X 3 COLUNAS) - BLINDADO
// ==========================================================================
window.abrirModalOF = function(ofId, codProd) {
    let codNorm = normalizarCod(codProd);
    
    // Busca flexível: ignora espaços extras e diferenças de formatação
    let of = ordesAtivasFiltradas.find(o => String(o.of).trim() === String(ofId).trim() && normalizarCod(o.codProd) === codNorm);
    if (!of) {
        of = ordesAtivasFiltradas.find(o => String(o.of).trim() === String(ofId).trim() || normalizarCod(o.codProd) === codNorm);
    }

    const item = itensProcessados.find(i => i.codNorm === codNorm);

    // Valida apenas se a OF foi localizada na lista ativa
    if (!of) {
        mostrarToast("Erro: Detalhes da OF não encontrados na listagem.", "error");
        return;
    }

    // Recupera a linha inteira do CSV guardada em cache
    let linha = of.linhaOriginal || {};

    // Função local para buscar campos ignorando acentos e espaços
    const getC = (nomesArray) => {
        let ch = encontrarChave(linha, nomesArray);
        let val = ch ? linha[ch] : '';
        return val && String(val).trim() !== '' ? String(val).trim() : '-';
    };

    let descExibicao = item ? item.desc : (of.descProd || 'Descrição não informada na Base Mestre');

    // Calcula a Tag Visual de Prazo (ETA)
    let dataOF = getC(['of - data entrega', 'data entrega of', 'sc - dt entrega', 'sc - data entrega']);
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

    let col1 = `
        <div style="background: var(--bg-subcard); padding: 16px; border-radius: 12px; border: 1px solid var(--border-color);">
            <h3 style="${sTitle} color: var(--primary-color);">📝 1. Solicitação (SC)</h3>
            ${makeRow('Código SC', ['sc - codigo', 'sc codigo', 'sc'])}
            ${makeRow('Situação', ['sc - situacao', 'situacao sc'])}
            ${makeRow('Centro Custo Aprov.', ['sc - centro custo aprovador', 'centro custo aprovador'])}
            ${makeRow('Data Criação', ['sc - data criacao', 'data criacao sc', 'data criacao'])}
            ${makeRow('Solicitante', ['sc - nome solicitante', 'sc solicitante', 'nome solicitante'])}
            ${makeRow('Empresa', ['sc - empresa', 'empresa sc', 'empresa'])}
            ${makeRow('Filial', ['sc - filial', 'filial sc'])}
            ${makeRow('Descr. Filial', ['sc - descr. filial', 'sc - descr filial', 'desc filial', 'descr filial'])}
            ${makeRow('Cód. Produto', ['sc - cod. produto', 'sc - cod produto', 'cod produto'])}
            ${makeRow('Nome Produto', ['sc - nome produto', 'nome produto sc', 'nome produto'])}
            ${makeRow('Unid. Medida', ['sc - unid. medida', 'sc - unid medida'])}
            ${makeRow('Quantidade', ['sc - quantidade', 'quantidade sc'])}
            ${makeRow('Categoria', ['sc - categoria', 'categoria sc', 'categoria'])}
            ${makeRow('DT Entrega', ['sc - dt entrega', 'sc - data entrega', 'dt entrega sc'])}
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
            ${makeRow('Data OF', ['of - data', 'data of'])}
            ${makeRow('Fornecedor', ['of - nome fornecedor', 'nome fornecedor of', 'fornecedor'])}
            ${makeRow('Qtd. Solicitada', ['of - qtd. solicitada', 'of - qtd solicitada', 'qtd solicitada'])}
            ${makeRow('Saldo Pendente', ['of - saldo', 'saldo of', 'saldo'])}
            ${makeRow('Qtd. Entregue', ['of - qtd. entregue', 'of - qtd entregue', 'qtd entregue'])}
            ${makeRow('Fechado', ['of - fechado', 'fechado of'])}
            ${makeRow('Bloqueado', ['of - bloqueado', 'bloqueado of'])}
            ${makeRow('Data Entrega', ['of - data entrega', 'data entrega of'])}
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
            ${makeRow('DT Emissão', ['rec - dt emissao', 'dt emissao nf', 'data emissao'])}
            ${makeRow('DT Entrada', ['rec - dt entrada', 'dt entrada nf', 'data entrada'])}
            ${makeRow('Unid. Medida', ['rec - unid. medida', 'rec - unid medida'])}
            ${makeRow('Quantidade Rec.', ['rec - quantidade', 'quantidade rec'])}
            ${makeRow('Valor Un. Fiscal', ['rec - valor un. fiscal', 'rec - valor un fiscal', 'valor un fiscal'])}
        </div>
    `;

    let rodapeContextoHTML = item ? `
        <div style="text-align: center; padding: 20px 10px 10px; margin-top: 15px; border-top: 1px solid var(--border-color);">
            <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 15px;">Deseja aprofundar a análise de consumo, curva financeira e locais físicos deste item?</p>
            <button class="theme-btn active" onclick="abrirModalDetalhes('${item.codNorm}', '${item.filialIdBase}')" style="padding: 12px 24px; font-size: 14px; margin: 0 auto; border-radius: 8px;">
                Abrir Contexto Analítico do Item
            </button>
        </div>
    ` : `
        <div style="text-align: center; padding: 15px; margin-top: 15px; border-top: 1px solid var(--border-color);">
            <p style="font-size: 12px; color: var(--text-warning);">⚠️ <i>Nota: Este item possui Ordem de Fornecimento ativa, mas o código <strong>#${codProd}</strong> não foi encontrado na Base Mestre (03 - Base_Itens.csv). O contexto analítico avançado de estoque está indisponível para ele.</i></p>
        </div>
    `;

    const content = `
        <div class="modal-header-section" style="border-bottom:none; padding-bottom:0;">
            <div style="flex-grow: 1;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div>
                        <h2 style="font-size: 20px; font-weight: 800; color: var(--text-primary); margin-bottom: 8px;">
                            Raio-X da Ordem: <span style="color: var(--primary-color);">${of.of !== '-' ? of.of : of.sc}</span>
                        </h2>
                        <h3 style="font-size: 14px; font-weight: 600; color: var(--text-secondary); margin-bottom: 20px;">
                            Item: #${codProd} - ${descExibicao}
                        </h3>
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