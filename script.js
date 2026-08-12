// ==========================================================================
// ESTADO GLOBAL DO SISTEMA E VARIÁVEIS
// ==========================================================================
const bases = { baseItens: [], compras: [], consumos: [] };
let itensProcessados = [];
let itensFiltrados = [];

// Bases Globais puras para recalculo dinâmico
let global_mapConsolidado = new Map();
let global_mapComprasTransito = new Map();
let global_mapLeadTimeMedio = new Map();

// Novas variáveis para a Tela de Consulta de Consumo
let consumosProcessados = [];
let consumosFiltrados = [];

// Estrutura para armazenar as OFs ativas extraídas de compras.csv
let ordesAtivasFiltradas = [];

let vistaAtual = 'dashboard';
let chartABCInstance = null;
let chartStatusInstance = null;
let chartFiliaisInstance = null;
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

// Controle de visualização de valores monetários (Ocultos por Padrão)
let ocultarValoresFinanceiros = true; 

// Estado do Lightbox Nativo e Seguro
let currentLightboxImages = [];
let currentLightboxIndex = 0;

if (typeof Chart !== 'undefined') Chart.defaults.font.family = "'Inter', system-ui, sans-serif";

// ==========================================================================
// FUNÇÕES ÚTEIS E PARSER
// ==========================================================================
function normalizarString(val) { 
    return String(val || '').normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, ' ').trim(); 
}
function normalizarCod(val) { 
    if (val === null || val === undefined) return '';
    let str = String(val).trim();
    if (str.endsWith('.0')) str = str.slice(0, -2);
    return str.replace(/\./g, '').replace(/[^a-z0-9-]/g, '').replace(/^0+/, ''); 
}
function converterParaNumero(val) {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return val;
    let str = String(val).trim().replace(/[R$\s]/g, '');
    if (str.includes(',')) str = str.replace(/\./g, '').replace(',', '.');
    let floatVal = parseFloat(str);
    return isNaN(floatVal) ? 0 : floatVal;
}

// Parser avançado de datas para suportar a coluna dt movimento
function parseDataGenerica(dStr) {
    if(!dStr || typeof dStr !== 'string') return null;
    const partes = dStr.trim().split(' ')[0].split('/');
    if (partes.length >= 3) {
        let ano = partes[2];
        if (ano.length === 2) ano = '20' + ano;
        return new Date(ano, partes[1] - 1, partes[0]);
    }
    if (dStr.includes('-')) {
        let d = new Date(dStr);
        d.setMinutes(d.getMinutes() + d.getTimezoneOffset()); // Previne salto de fuso horário
        return isNaN(d) ? null : d;
    }
    return null;
}

function encontrarChave(objRef, termosChave) {
    if (!objRef) return null;
    const chaves = Object.keys(objRef);
    for (const termo of termosChave) {
        const termoBusca = normalizarString(termo);
        for (const chave of chaves) {
            if (normalizarString(chave) === termoBusca || normalizarString(chave).includes(termoBusca)) return chave;
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
    dispararFiltrosSemAtraso(); 
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
// TELA DE CARREGAMENTO E MENSAGENS
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
// LIGHTBOX SEGURO E NATIVO (Zoom Imagens)
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

// ==========================================================================
// INICIALIZAÇÃO E NAVEGAÇÃO
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
    
    const bsConsumos = document.getElementById('busca-consumo');
    if(bsConsumos) bsConsumos.addEventListener('input', dispararFiltrosDebounce);
    
    setTimeout(() => {
        if (!isFetchingData) carregarArquivosAutomaticamente();
    }, 100);
});

function alterarTema(tema) {
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

function navegarPara(view) {
    vistaAtual = view;
    // Adicionado 'consulta-consumo' à lista de views
    ['pesquisa', 'dashboard', 'compras', 'gestao-compras', 'instrucoes', 'revisao', 'consulta-consumo'].forEach(v => {
        const el = document.getElementById(`view-${v}`);
        const nav = document.getElementById(`nav-${v}`);
        if(el) el.style.display = (v === view) ? 'flex' : 'none';
        if(nav) nav.classList.toggle('active', v === view);
    });
    
    if(view === 'pesquisa' || view === 'dashboard') dispararFiltrosSemAtraso();
    if(view === 'compras') renderizarCompras();
    if(view === 'gestao-compras') renderizarGestaoDeCompras();
    if(view === 'revisao') renderizarRevisao();
    if(view === 'consulta-consumo') renderizarConsultaConsumo();
}

function toggleSegmentacao() { document.getElementById('app-layout').classList.toggle('segmentation-hidden'); }

// Chamada ativada quando o usuário muda o mês no novo filtro
window.mudarMesConsumo = function() {
    const selectPeriodo = document.getElementById('select-mes-consumo-kpi');
    if(selectPeriodo && selectPeriodo.value) {
        if(isFetchingData) return;
        isFetchingData = true;
        aplicarPeriodoConsumo(selectPeriodo.value, false);
    }
}

// ==========================================================================
// CARGA DE ARQUIVOS E IMAGENS
// ==========================================================================
async function carregarArquivosAutomaticamente() {
    if (isFetchingData) return; 
    isFetchingData = true;

    const loader = document.getElementById('tech-loader');
    if (loader) { loader.style.display = 'flex'; loader.style.opacity = '1'; }
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
            if (elStatus) { elStatus.innerText = `✅ ${arq.url}`; elStatus.className = 'status-item status-ok'; }
            carregados++;
        } catch (error) {
            let detalhe = error.message;
            if (detalhe.includes('Failed to fetch') || detalhe.includes('NetworkError')) {
                detalhe = "Falha de rede ou CORS. Você está rodando localmente sem servidor web?";
            }
            setProgress(loaderProgress, `[ERRO ${arq.url}] ${detalhe}`, 'error');
            if (elStatus) { elStatus.innerText = `❌ Falha: ${arq.url}`; elStatus.className = 'status-item status-erro'; }
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

    document.getElementById('loader-ring').classList.remove('error');
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
                
                const elStatus = document.getElementById(`status-${alvoId === 'baseItens' ? 'base' : alvoId}`);
                if (elStatus) { elStatus.innerText = `✅ ${file.name}`; elStatus.className = 'status-item status-ok'; }
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
        dispararFiltrosSemAtraso();
    }
    mostrarToast(`Sucesso: ${count} imagens mapeadas!`, "success");
}

// ==========================================================================
// EXPORTAÇÃO PARA EXCEL
// ==========================================================================
window.exportarComprasExcel = function() {
    const necessitaCompra = itensFiltrados.filter(i => (i.saldo <= 0 || i.saldo < i.minimo) && i.minimo > 0 && i.maximo > 0);
    if(necessitaCompra.length === 0) { mostrarToast("Nenhum dado crítico na tela para exportar.", "warning"); return; }
    
    let csvContent = "\uFEFF"; 
    csvContent += "Código;Descrição;Filial;Saldo Atual;Mínimo;Máximo;Sugestão Compra;Custo Unitário;Valor Estimado Compra\n";
    
    necessitaCompra.sort((a,b) => a.saldo - b.saldo).forEach(i => {
        let sug = i.maximo - i.saldo;
        let val = sug * i.custoUnitario;
        let descLimpa = i.desc.replace(/;/g, ',');
        let filialLimpa = i.filialNm.replace(/;/g, ',');
        csvContent += `${i.cod};${descLimpa};${filialLimpa};${i.saldo};${i.minimo};${i.maximo};${sug};${i.custoUnitario.toFixed(2)};${val.toFixed(2)}\n`;
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
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

    if(itensRevisao.length === 0) { mostrarToast("Nenhum dado de revisão na tela para exportar.", "warning"); return; }

    let csvContent = "\uFEFF"; 
    csvContent += "Código;Descrição;Filial;Saldo Útil;Mínimo Atual;Máximo Atual;Sugestão Novo Mín;Sugestão Novo Máx;Custo Consumo Mês;Ação Recomendada\n";

    itensRevisao.forEach(i => {
        let acao = "";
        if (i.consumoFinanceiro === 0 && (i.minimo > 0 || i.maximo > 0)) { acao = "Revisar/Zerar (Sem Consumo)"; } 
        else if (i.saldoUtil > i.maximo && i.maximo > 0) { acao = "Reduzir Máximo (Excesso)"; } 
        else if (i.saldoUtil < i.minimo && i.consumoFinanceiro > 0) { acao = "Aumentar Mínimo (Risco)"; }

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
// MOTOR DE INTELIGÊNCIA E CONSOLIDAÇÃO FINANCEIRA
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
    const colDtMovimento = ['dt movimento', 'data movimento', 'data', 'dt emissao'];
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

    const nomesMesesDisplay = ['', 'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
    const ordemMeses = { 'janeiro':1, 'jan':1, 'fevereiro':2, 'fev':2, 'março':3, 'marco':3, 'mar':3, 'abril':4, 'abr':4, 'maio':5, 'mai':5, 'junho':6, 'jun':6, 'julho':7, 'jul':7, 'agosto':8, 'ago':8, 'setembro':9, 'set':9, 'outubro':10, 'out':10, 'novembro':11, 'nov':11, 'dezembro':12, 'dez':12 };

    setProgress(92, "1. Lendo Compras (OFs em Trânsito)...");
    await new Promise(r => setTimeout(r, 50)); 

    global_mapComprasTransito.clear();
    global_mapLeadTimeMedio.clear();
    const mapLeadTimeHistorico = new Map(); 
    
    let c_cod_compra = encontrarChave(bases.compras[0], colCod);
    let c_of_qtd_pedida = encontrarChave(bases.compras[0], colOfQtdPedida);
    let c_rec_qtd = encontrarChave(bases.compras[0], colRecQtd);
    let c_of_sit = encontrarChave(bases.compras[0], colOfSit);
    let c_sc_sit = encontrarChave(bases.compras[0], colScSit);
    let c_sc_canc = encontrarChave(bases.compras[0], colScCanc);
    let c_of_col = encontrarChave(bases.compras[0], colOfCodigo);
    let c_sc_col = encontrarChave(bases.compras[0], colScCodigo);
    let c_sc_dt = encontrarChave(bases.compras[0], colScDataCriacao);
    let c_rec_dt = encontrarChave(bases.compras[0], colRecDataEntrada);

    if(bases.compras.length > 0) {
        bases.compras.forEach(item => {
            const cod = normalizarCod(item[c_cod_compra]);
            if (!cod) return;

            let qtdPedida = c_of_qtd_pedida ? converterParaNumero(item[c_of_qtd_pedida]) : 0;
            let qtdRecebida = c_rec_qtd ? converterParaNumero(item[c_rec_qtd]) : 0;
            let ofValor = c_of_col ? String(item[c_of_col]).trim() : '-';
            let scValor = c_sc_col ? String(item[c_sc_col]).trim() : '-';

            let sitOF = c_of_sit ? normalizarString(item[c_of_sit]) : '';
            let sitSC = c_sc_sit ? normalizarString(item[c_sc_sit]) : '';
            let cancSC = c_sc_canc ? normalizarString(item[c_sc_canc]) : '';

            let isFechadaOuCancelada = sitOF.includes('fechada') || sitOF.includes('cancelada') || sitSC.includes('cancelado') || cancSC === 'sim' || cancSC === 's';
            let saldoPendente = 0;

            if (isFechadaOuCancelada) { saldoPendente = 0; } 
            else if ((!ofValor || ofValor === '-' || ofValor === '') && (scValor && scValor !== '-' && scValor !== '')) { saldoPendente = 1; } 
            else if (qtdPedida > 0 && qtdRecebida >= qtdPedida) { saldoPendente = 0; } 
            else if (qtdPedida > 0 && qtdRecebida > 0 && qtdRecebida < qtdPedida) { saldoPendente = qtdPedida - qtdRecebida; } 
            else if (qtdPedida > 0 && qtdRecebida === 0) { saldoPendente = qtdPedida; } 
            else { saldoPendente = qtdPedida > 0 ? qtdPedida : 1; }

            if (saldoPendente > 0) {
                global_mapComprasTransito.set(cod, (global_mapComprasTransito.get(cod) || 0) + saldoPendente);
            }

            if (c_sc_dt && c_rec_dt && item[c_sc_dt] && item[c_rec_dt]) {
                let dtCria = parseDataGenerica(item[c_sc_dt]);
                let dtEntr = parseDataGenerica(item[c_rec_dt]);
                if (dtCria && dtEntr) {
                    let dias = Math.ceil(Math.abs(dtEntr - dtCria) / (1000 * 60 * 60 * 24));
                    if(dias > 0 && dias < 300) { 
                        if(!mapLeadTimeHistorico.has(cod)) mapLeadTimeHistorico.set(cod, []);
                        mapLeadTimeHistorico.get(cod).push(dias);
                    }
                }
            }
        });
    }
    
    for (let [k, v] of mapLeadTimeHistorico) {
        let media = Math.round(v.reduce((a,b)=>a+b,0) / v.length);
        global_mapLeadTimeMedio.set(k, media);
    }

    setProgress(93, "2. Lendo Base de Consumo Histórico...");
    await new Promise(r => setTimeout(r, 50));

    let cs_mes = encontrarChave(bases.consumos[0], colMesMovimento);
    let cs_cod = encontrarChave(bases.consumos[0], colCod);
    let cs_qtd = encontrarChave(bases.consumos[0], colQtdConsumo);
    let cs_local = encontrarChave(bases.consumos[0], colLocalId);
    let cs_dt = encontrarChave(bases.consumos[0], colDtMovimento); 

    let periodosMap = new Map();
    consumosProcessados = [];

    if(bases.consumos.length > 0) {
        bases.consumos.forEach(item => {
            const cod = normalizarCod(item[cs_cod]);
            const qtd = converterParaNumero(item[cs_qtd]);
            const localVal = cs_local ? String(item[cs_local]).trim() : '';

            let d = cs_dt ? parseDataGenerica(item[cs_dt]) : null;
            let mesItemNum = null, anoItemNum = null;

            if (d) {
                mesItemNum = d.getMonth() + 1;
                anoItemNum = d.getFullYear();
            } else if (cs_mes && item[cs_mes]) {
                mesItemNum = ordemMeses[normalizarString(item[cs_mes])];
                anoItemNum = new Date().getFullYear();
            }

            let periodoLabel = '-';
            if (mesItemNum && anoItemNum) {
                periodoLabel = `${nomesMesesDisplay[mesItemNum]}/${anoItemNum}`;
                let key = `${mesItemNum}/${anoItemNum}`;
                if (!periodosMap.has(key)) {
                    periodosMap.set(key, { mes: mesItemNum, ano: anoItemNum, label: periodoLabel });
                }
            }

            consumosProcessados.push({
                data: d ? d.toLocaleDateString('pt-BR') : (item[cs_mes] || '-'),
                codNorm: cod,
                codOriginal: item[cs_cod] || '-',
                qtd: qtd,
                local: localVal,
                mes: mesItemNum,
                ano: anoItemNum,
                periodoLabel: periodoLabel,
                searchStr: (cod + " " + localVal + " " + (item[cs_dt]||'') + " " + (item[cs_mes]||'')).toLowerCase()
            });
        });
    }

    let listaPeriodos = Array.from(periodosMap.values()).sort((a,b) => {
        if (a.ano !== b.ano) return b.ano - a.ano;
        return b.mes - a.mes;
    });

    // Povoar o combo box de período (se já existir no HTML)
    const selectPeriodo = document.getElementById('select-mes-consumo-kpi');
    if (selectPeriodo) {
        selectPeriodo.innerHTML = '';
        listaPeriodos.forEach(p => {
            selectPeriodo.innerHTML += `<option value="${p.label}">${p.label}</option>`;
        });
    }

    let periodoDefault = listaPeriodos.length > 0 ? listaPeriodos[0].label : "MÊS";
    if (selectPeriodo) selectPeriodo.value = periodoDefault;

    setProgress(95, "3. Lendo e Consolidando Base Mestre...");
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

    global_mapConsolidado.clear();
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
                filialNm = 'Rolândia - Alp. Preparados'; filialIdBase = '704_ALP';
            } else if (locNum > 0 && locNum < 599) {
                filialNm = 'Rolândia - Ab. Aves'; filialIdBase = '704_AB';
            } else {
                filialNm = 'Rolândia - Alp. Preparados'; filialIdBase = '704_ALP';
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
        if (['299', '0299', '295', '0295'].includes(localIdRaw) || localNm.includes('299') || localNm.includes('295')) isCritico = true;

        let valorTotalLinha = b_valorTotal ? converterParaNumero(item[b_valorTotal]) : 0;
        let custoUnitarioLinha = converterParaNumero(item[b_custo]);

        if (valorTotalLinha > 0 && saldoLinha > 0) custoUnitarioLinha = valorTotalLinha / saldoLinha;
        else if (custoUnitarioLinha > 0 && saldoLinha > 0) valorTotalLinha = custoUnitarioLinha * saldoLinha;

        const chave = codNorm + '|' + filialIdBase;

        if (!global_mapConsolidado.has(chave)) {
            global_mapConsolidado.set(chave, {
                cod: codBruto, codNorm: codNorm, 
                desc: item[b_desc] || "Item sem Descrição",
                um: item[b_um] || 'UN',
                filialNm: filialNm, filialIdBase: filialIdBase,
                grupo: item[b_grupo] || '', classe: item[b_classe] || '',
                saldo: 0, minimo: 0, maximo: 0, valorTotalGlobal: 0, custoUnitario: 0,
                leadTime: global_mapLeadTimeMedio.get(codNorm) || 15, locais: []
            });
        }

        const obj = global_mapConsolidado.get(chave);
        obj.saldo += saldoLinha;
        obj.valorTotalGlobal += valorTotalLinha;
        
        if (minimoLinha > obj.minimo) obj.minimo = minimoLinha;
        if (maximoLinha > obj.maximo) obj.maximo = maximoLinha;
        
        obj.locais.push({ filialNm, localId: localIdRaw, localNm, reparticao, prateleira, divisao, saldo: saldoLinha, custoUnitario: custoUnitarioLinha, isCritico });
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

    setProgress(98, "Ativando Motor de Inteligência para Mês Base...");
    await new Promise(r => setTimeout(r, 50)); 
    
    // Dispara a criação da tabela final (que agora pode ser recalculada no clique do novo select)
    aplicarPeriodoConsumo(periodoDefault, true);
}


// Nova função separada que gera a base Suja e os KPIs utilizando APENAS o mês selecionado
window.aplicarPeriodoConsumo = function(periodoLabel, isFirstLoad = false) {
    if(!isFirstLoad) {
        setProgress(50, `Recalculando inteligência para ${periodoLabel}...`);
        const loader = document.getElementById('tech-loader');
        if (loader) { loader.style.display = 'flex'; loader.style.opacity = '1'; }
    }

    mesConsumoAtual = periodoLabel;
    
    // Atualiza os Labels Visuais Dinamicamente
    const elTitleConsumo = document.getElementById('kpi-consumo-title');
    const elThConsumo = document.getElementById('th-consumo');
    const elDashKpiLabel = document.getElementById('dash-kpi-consumo-label'); 
    
    if (elTitleConsumo) elTitleConsumo.innerText = `Custo do Consumo`;
    if (elThConsumo) elThConsumo.innerText = `Custo Consumo (${mesConsumoAtual})`;
    if (elDashKpiLabel) elDashKpiLabel.innerText = `Período Base: ${mesConsumoAtual}`; // Etiqueta exigida no Dashboard

    // 1. Filtrar o Consumo para criar o Mapa desse mês
    const mapConsumosTotais = new Map();
    let encontrouConsumoNoMesAlvo = false;

    consumosProcessados.forEach(c => {
        if (c.periodoLabel === periodoLabel) {
            encontrouConsumoNoMesAlvo = true;
            let localVal = c.local;
            if (localVal === '299' || localVal === '0299' || localVal === '295' || localVal === '0295' || localVal.includes('299') || localVal.includes('295')) return;
            if (c.codNorm) mapConsumosTotais.set(c.codNorm, (mapConsumosTotais.get(c.codNorm) || 0) + c.qtd);
        }
    });

    // 2. Mesclar Consumo com a Base Mestre clonada
    let baseSujaProcessada = Array.from(global_mapConsolidado.values()).map(itemRaw => {
        let item = JSON.parse(JSON.stringify(itemRaw)); // Clone para não destruir a base pura
        const transito = global_mapComprasTransito.get(item.codNorm) || 0;

        if (item.saldo > 0 && item.valorTotalGlobal > 0) item.custoUnitario = item.valorTotalGlobal / item.saldo;
        else if (item.locais.length > 0) item.custoUnitario = item.locais[0].custoUnitario;

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
        
        item.saldoUtil = item.saldo - saldoCritico;
        let consumoFisicoDiario = consumoMesAnteriorFisico / 30;
        
        item.sugestaoMin = consumoMesAnteriorFisico === 0 ? 0 : Math.ceil(consumoFisicoDiario * item.leadTime);
        item.sugestaoMax = consumoMesAnteriorFisico === 0 ? 0 : Math.ceil(item.sugestaoMin + (consumoMesAnteriorFisico * 1)); 

        let status = 'Estoque Normal'; let statusBadge = 'badge-normal';
        if (item.saldo === 0 && item.minimo === 0 && item.maximo === 0 && transito === 0) { status = 'Inativo / Sem Parâmetros'; statusBadge = 'badge-obsoleto'; }
        else if (item.saldo <= 0 && transito <= 0) { status = 'Ruptura Crítica (Sem Pedido)'; statusBadge = 'badge-ruptura-critica'; } 
        else if (item.saldo <= 0 && transito > 0) { status = 'Ruptura (Em Trânsito)'; statusBadge = 'badge-ruptura-transito'; } 
        else if (item.saldo > 0 && consumoMesAnteriorFisico <= 0) { 
            if (isLocalCriticoMacro) { status = 'Normal/Local Crítico'; statusBadge = 'badge-normal-critico'; } 
            else { status = 'Obsoleto (Sem Consumo)'; statusBadge = 'badge-obsoleto'; }
        } 
        else if (item.saldo > 0 && item.minimo > 0 && item.saldo < item.minimo) { status = 'Abaixo Mínimo'; statusBadge = 'badge-abaixo'; }
        else if (item.maximo > 0 && item.saldo > item.maximo) { status = 'Excesso Estoque'; statusBadge = 'badge-acima'; }

        item.reparticao = item.locais[0]?.reparticao || '-';
        item.prateleira = item.locais[0]?.prateleira || '-';
        item.divisao = item.locais[0]?.divisao || '-';
        const searchString = (item.codNorm + " " + normalizarString(item.desc) + " " + normalizarString(item.grupo) + " " + normalizarString(item.classe) + " rep " + item.reparticao + " prat " + item.prateleira + " div " + item.divisao).toLowerCase();

        return {
            ...item, transito, consumo: consumoMesAnteriorFisico, consumoFinanceiro, 
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

    // 3. Gerar a lista de OFs Pendentes e Status
    ordesAtivasFiltradas = [];
    setStatusOFUnicos.clear();

    if(bases.compras.length > 0) {
        const c_cod_compra = encontrarChave(bases.compras[0], ['cd item', 'cod produto', 'codigo', 'cod', 'item', 'sc - cód. produto', 'of - cód. produto']);
        const c_of_qtd_pedida = encontrarChave(bases.compras[0], ['of - qtd. solicitada', 'quantidade pedida', 'qtd solicitada', 'of - quantidade']);
        const c_rec_qtd = encontrarChave(bases.compras[0], ['of - qtd. entregue', 'of - qtd entregue', 'qtd entregue', 'rec - quantidade', 'quantidade recebida', 'qtd recebida']);
        const c_of_sit = encontrarChave(bases.compras[0], ['of - situação of', 'situacao of', 'status of']);
        const c_sc_sit = encontrarChave(bases.compras[0], ['sc - situação', 'situacao sc']);
        const c_sc_canc = encontrarChave(bases.compras[0], ['sc - cancelado', 'sc cancelado', 'cancelado']);
        const c_of_col = encontrarChave(bases.compras[0], ['of - codigo', 'of codigo', 'ordem fornecimento']);
        const c_sc_col = encontrarChave(bases.compras[0], ['sc - código', 'sc codigo', 'sc']);
        const c_desc = encontrarChave(bases.compras[0], ['nome do item detalhado', 'nome do item resumido', 'nome produto', 'desc', 'sc - nome produto', 'of - nome produto']);
        const c_forn = encontrarChave(bases.compras[0], ['of - nome fornecedor', 'fornecedor']);
        const c_dt_ent = encontrarChave(bases.compras[0], ['of - data entrega', 'data entrega of', 'dt entrega of']);
        const c_solicitante = encontrarChave(bases.compras[0], ['sc - nome solicitante', 'sc solicitante', 'nome solicitante', 'requisitante']);
        
        const mapaItensParaFilial = new Map(itensProcessados.map(i => [i.codNorm, i]));
        
        bases.compras.forEach(linha => {
            let qtdPedida = c_of_qtd_pedida ? converterParaNumero(linha[c_of_qtd_pedida]) : 0;
            let qtdRecebida = c_rec_qtd ? converterParaNumero(linha[c_rec_qtd]) : 0;
            let ofValor = c_of_col ? String(linha[c_of_col]).trim() : '-';
            let scValor = c_sc_col ? String(linha[c_sc_col]).trim() : '-';

            let sitOF = c_of_sit ? normalizarString(linha[c_of_sit]) : '';
            let sitSC = c_sc_sit ? normalizarString(linha[c_sc_sit]) : '';
            let cancSC = c_sc_canc ? normalizarString(linha[c_sc_canc]) : '';
            
            let isFechadaOuCancelada = sitOF.includes('fechada') || sitOF.includes('cancelada') || sitSC.includes('cancelado') || cancSC === 'sim' || cancSC === 's';
            let statusCalculado = 'Em Trânsito';
            let saldoPendente = 0;

            if (isFechadaOuCancelada) return; 
            else if ((!ofValor || ofValor === '-' || ofValor === '') && (scValor && scValor !== '-' && scValor !== '')) { statusCalculado = 'Aguardando Aprovação'; saldoPendente = 1; } 
            else if (qtdPedida > 0 && qtdRecebida >= qtdPedida) { statusCalculado = 'Item Entregue'; saldoPendente = 0; } 
            else if (qtdPedida > 0 && qtdRecebida > 0 && qtdRecebida < qtdPedida) { statusCalculado = 'Entrega Parcial'; saldoPendente = qtdPedida - qtdRecebida; } 
            else if (qtdPedida > 0 && qtdRecebida === 0) { statusCalculado = 'Em Trânsito'; saldoPendente = qtdPedida; } 
            else { statusCalculado = 'Em Trânsito'; saldoPendente = qtdPedida > 0 ? qtdPedida : 1; }

            setStatusOFUnicos.add(statusCalculado);

            let cod = normalizarCod(linha[c_cod_compra]);
            let objItem = mapaItensParaFilial.get(cod);
            let filialDaOF = objItem ? objItem.filialNm : 'Geral';
            let req = c_solicitante && linha[c_solicitante] ? linha[c_solicitante].trim() : 'Não Informado';

            ordesAtivasFiltradas.push({
                sc: linha[c_sc_col] || '-', of: linha[c_of_col] || '-',
                codProd: linha[c_cod_compra] || '-', descProd: linha[c_desc] || '-',
                fornecedor: linha[c_forn] || 'Não Informado', solicitante: req,
                dataEntrega: linha[c_dt_ent] || 'Sem Data', saldoOF: saldoPendente,
                sitOFOriginal: statusCalculado, filial: filialDaOF,
                searchStr: ((linha[c_of_col]||'') + " " + (linha[c_sc_col]||'') + " " + (linha[c_cod_compra]||'') + " " + (linha[c_forn]||'') + " " + req + " " + statusCalculado).toLowerCase(),
                linhaOriginal: linha 
            });
        });
    }

    const selectStatusOf = document.getElementById('select-status-of');
    if (selectStatusOf) {
        selectStatusOf.innerHTML = '<option value="">Todos os Status</option>';
        Array.from(setStatusOFUnicos).sort().forEach(s => {
            if(s) selectStatusOf.innerHTML += `<option value="${s}">${s}</option>`;
        });
    }

    if(isFirstLoad) setProgress(100, "Renderizando Interface...", "success");
    
    // 4. Fechar ciclo
    setTimeout(() => {
        dispararFiltrosSemAtraso();
        if(!encontrouConsumoNoMesAlvo && bases.consumos.length > 0) {
            mostrarToast(`Atenção: Não detectamos saídas no período alvo selecionado (${mesConsumoAtual}).`, "warning");
        } else {
            mostrarToast(`Base atualizada! Utilizando Consumo e Mín/Máx referente à: ${mesConsumoAtual}.`, "success");
        }
        fecharLoader();
        isFetchingData = false; 
    }, 600);
}


// ==========================================================================
// BUSCA INTELIGENTE, FILTRO CASCATA E RENDERIZAÇÃO
// ==========================================================================
let timerBusca;
function dispararFiltrosDebounce() {
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

function dispararFiltrosSemAtraso() {
    let valCatalogo = document.getElementById('busca')?.value || "";
    let valCompras = document.getElementById('busca-compras')?.value || "";
    let valGestao = document.getElementById('busca-ofs')?.value || "";
    let valConsumo = document.getElementById('busca-consumo')?.value || ""; 
    
    let termoBruto = "";
    if (vistaAtual === 'pesquisa') termoBruto = valCatalogo;
    else if (vistaAtual === 'compras') termoBruto = valCompras;
    else if (vistaAtual === 'gestao-compras') termoBruto = valGestao;
    else if (vistaAtual === 'consulta-consumo') termoBruto = valConsumo;
    else termoBruto = valCatalogo; 

    const termosSplit = termoBruto ? normalizarString(termoBruto).split(',').map(t => t.trim()).filter(t => t) : [];
    
    const statusFiltro = document.getElementById('select-saldo-status').value;
    const curvaFiltro = document.getElementById('select-curva').value;
    const imagemFiltro = document.getElementById('select-imagem').value;
    const filialFiltro = document.getElementById('select-filial')?.value || filtroGraficoFilial || "";
    const localFiltro = document.getElementById('select-local')?.value || "";
    const analiseMinMaxFiltro = document.getElementById('select-analise-minmax')?.value || ""; 

    if (imagemFiltro !== "" && !mapeamentoDeImagemAtivo) {
        mostrarToast("Para filtrar por imagens, mapeie a pasta no menu lateral.", "warning");
        document.getElementById('select-imagem').value = "";
        return;
    }

    // Filtro da Matriz Principal (Base de Itens)
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

        let bateAnaliseMinMax = true;
        if (analiseMinMaxFiltro === "sem_saldo_sem_param") bateAnaliseMinMax = (i.saldo === 0 && i.minimo === 0 && i.maximo === 0);
        else if (analiseMinMaxFiltro === "com_saldo_sem_param") bateAnaliseMinMax = (i.saldo > 0 && i.minimo === 0 && i.maximo === 0);
        else if (analiseMinMaxFiltro === "abaixo_min") bateAnaliseMinMax = (i.minimo > 0 && i.saldo < i.minimo);
        else if (analiseMinMaxFiltro === "acima_max") bateAnaliseMinMax = (i.maximo > 0 && i.saldo > i.maximo);
        else if (analiseMinMaxFiltro === "dentro_range") bateAnaliseMinMax = (i.minimo > 0 && i.maximo > 0 && i.saldo >= i.minimo && i.saldo <= i.maximo);

        return bateTermo && bateCurva && bateStatus && bateImagem && bateFilial && bateLocal && bateAnaliseMinMax;
    });

    // Filtro Específico para a Tela Histórica de Consumo:
    // Retorna as linhas do consumos.csv cruzadas pelo mês ESCOLHIDO NO FILTRO DO DASHBOARD para evitar confusão de números.
    consumosFiltrados = consumosProcessados.filter(c => {
        const bateTermo = termosSplit.length === 0 || termosSplit.some(t => c.searchStr.includes(t));
        const bateMes = c.periodoLabel === mesConsumoAtual;
        return bateTermo && bateMes;
    });

    if (vistaAtual === 'pesquisa') renderizarPesquisa();
    else if (vistaAtual === 'dashboard') renderizarDashboard();
    else if (vistaAtual === 'compras') renderizarCompras();
    else if (vistaAtual === 'gestao-compras') renderizarGestaoDeCompras(termosSplit, filialFiltro);
    else if (vistaAtual === 'revisao') renderizarRevisao();
    else if (vistaAtual === 'consulta-consumo') renderizarConsultaConsumo();
}

window.limparFiltroGrafico = function(tipo) {
    if (tipo === 'abc') { filtroGraficoABC = null; document.getElementById('filtro-abc-aviso').style.display = 'none'; }
    if (tipo === 'status') { filtroGraficoStatus = null; document.getElementById('filtro-status-aviso').style.display = 'none'; }
    if (tipo === 'filial') { filtroGraficoFilial = null; document.getElementById('filtro-filial-aviso').style.display = 'none'; }
    dispararFiltrosSemAtraso();
}

window.limparFiltros = function() {
    document.getElementById('select-curva').value = "";
    document.getElementById('select-saldo-status').value = "";
    document.getElementById('select-imagem').value = "";
    if(document.getElementById('select-filial')) document.getElementById('select-filial').value = "";
    if(document.getElementById('select-local')) document.getElementById('select-local').value = "";
    if(document.getElementById('select-status-of')) document.getElementById('select-status-of').value = "";
    if(document.getElementById('select-analise-minmax')) document.getElementById('select-analise-minmax').value = "";
    
    document.getElementById('busca').value = "";
    document.getElementById('busca-compras').value = "";
    document.getElementById('busca-ofs').value = "";
    if(document.getElementById('busca-consumo')) document.getElementById('busca-consumo').value = "";
    
    filtroGraficoABC = null; filtroGraficoStatus = null; filtroGraficoFilial = null;
    document.getElementById('filtro-abc-aviso').style.display = 'none';
    document.getElementById('filtro-status-aviso').style.display = 'none';
    document.getElementById('filtro-filial-aviso').style.display = 'none';
    atualizarFiltroLocais(); 
}

// ==========================================================================
// RENDERIZAÇÃO DAS TELAS E TABELAS
// ==========================================================================

function renderizarConsultaConsumo() {
    const tbody = document.getElementById('consumos-table-body');
    if (!tbody) return; 

    let htmlLote = [];
    let contadorGeral = 0;
    let valorFinanceiroTotal = 0;
    
    const mapaItensBase = new Map(itensProcessados.map(i => [i.codNorm, i]));

    consumosFiltrados.slice(0, 150).forEach(c => {
        let itemMestre = mapaItensBase.get(c.codNorm);
        let desc = itemMestre ? itemMestre.desc : 'Não Encontrado na Base Mestre';
        let custo = itemMestre ? itemMestre.custoUnitario : 0;
        let valorTotalDaLinha = c.qtd * custo;

        contadorGeral += c.qtd;
        valorFinanceiroTotal += valorTotalDaLinha;

        htmlLote.push(`
            <tr class="fade-in">
                <td style="font-size: 13px; font-weight: 700; color: var(--text-primary);">${c.data}</td>
                <td><strong style="color:var(--primary-color);">#${c.codOriginal}</strong><br><span style="font-size:11px;color:var(--text-secondary); font-weight:500;">${desc}</span></td>
                <td style="font-size: 12px; font-weight: 600; color: var(--text-secondary);">${c.local || '-'}</td>
                <td style="font-size: 14px; font-weight: 900; color: var(--text-warning);">${c.qtd}</td>
                <td style="font-size: 12px; font-weight: 600; color: var(--text-primary);">${formatarMoedaMask(custo)}</td>
                <td style="font-size: 13px; font-weight: 800; color: var(--text-danger);">${formatarMoedaMask(valorTotalDaLinha)}</td>
            </tr>
        `);
    });

    tbody.innerHTML = htmlLote.join('') || `<tr><td colspan="6" style="text-align:center; padding: 40px; font-weight: 500; color: var(--text-secondary);">Nenhum registro de saída encontrado para os filtros atuais.</td></tr>`;
    
    const countEl = document.getElementById('consumo-kpi-qtd');
    const valorEl = document.getElementById('consumo-kpi-valor');
    if(countEl) countEl.innerText = `${contadorGeral.toLocaleString('pt-BR')} itens (Exibindo Max 150 linhas)`;
    if(valorEl) valorEl.innerText = formatarMoedaMask(valorFinanceiroTotal);
}

function renderizarPesquisa() {
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

function renderizarRevisao() {
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

function renderizarCompras() {
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
            <div class="kpi-card border-success"><span class="kpi-title">Valor Estimado de Compras</span><span class="kpi-value color-success">${formatarMoedaMask(totalValor)}</span></div>
        `;
    }

    tbody.innerHTML = htmlLote.join('') || `<tr><td colspan="6" style="text-align:center; padding: 40px; font-weight: 500; color: var(--text-secondary);">Sem necessidade de compras críticas para os filtros atuais.</td></tr>`;
}

function renderizarGestaoDeCompras(termosSplit = [], filialFiltro = "") {
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
        let itemRef = mapaItens.get(normalizarCod(of.codProd)); 
        let val = of.saldoOF * (itemRef ? itemRef.custoUnitario : 0);
        valTransitoTotal += val;
        qtdTransitoTotal += of.saldoOF;
        fornSet.add(of.fornecedor);
        ofSet.add(of.of);
    });

    ofsExibir.slice(0, 100).forEach(of => {
        let badgeStatusColor = 'var(--text-warning)';
        if (of.sitOFOriginal === 'Item Entregue') badgeStatusColor = 'var(--text-success)';
        else if (of.sitOFOriginal === 'Entrega Parcial') badgeStatusColor = 'var(--text-info)';
        else if (of.sitOFOriginal === 'Aguardando Aprovação') badgeStatusColor = 'var(--text-secondary)';

        htmlLote.push(`
            <tr class="fade-in" style="cursor:pointer;" onclick="abrirModalOF('${of.of}', '${of.codProd}')">
                <td>
                    <strong style="color:var(--text-primary);">${of.of}</strong><br>
                    <span style="font-size:10px;color:var(--text-secondary);">SC: ${of.sc}</span><br>
                    <span style="font-size:10px;color:var(--primary-color); font-weight: 600;">👤 Req: ${of.solicitante}</span>
                </td>
                <td><strong style="color:var(--primary-color);">#${of.codProd}</strong><br><span style="font-size:11px;color:var(--text-secondary); font-weight:500;">${of.descProd}</span></td>
                <td style="font-size:11px; font-weight:700; color:var(--text-secondary);">${of.fornecedor}</td>
                <td style="font-size:13px; font-weight:800; color:${badgeStatusColor};">${of.sitOFOriginal}</td>
                <td style="font-size:14px; font-weight:900; color:var(--text-warning);">${of.saldoOF} und</td>
                <td style="font-size:12px; font-weight:700; color:var(--text-primary);">${of.dataEntrega}</td>
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

function renderizarDashboard() {
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

function renderizarTabelaDashboard() {
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

window.abrirModalOF = function(ofId, codProd) {
    let codNorm = normalizarCod(codProd);
    
    let of = ordesAtivasFiltradas.find(o => String(o.of).trim() === String(ofId).trim() && normalizarCod(o.codProd) === codNorm);
    if (!of) {
        of = ordesAtivasFiltradas.find(o => String(o.of).trim() === String(ofId).trim() || normalizarCod(o.codProd) === codNorm);
    }

    const item = itensProcessados.find(i => i.codNorm === codNorm);

    if (!of) {
        mostrarToast("Erro: Detalhes da OF não encontrados na listagem.", "error");
        return;
    }

    let linha = of.linhaOriginal || {};

    const getC = (nomesArray) => {
        let ch = encontrarChave(linha, nomesArray);
        let val = ch ? linha[ch] : '';
        return val && String(val).trim() !== '' ? String(val).trim() : '-';
    };

    let descExibicao = item ? item.desc : (of.descProd || 'Descrição não informada na Base Mestre');

    let dataOF = getC(['of - data entrega', 'data entrega of', 'sc - dt entrega', 'sc - data entrega']);
    let etaTag = `<span class="badge-status badge-transito" style="font-size:13px; padding:8px 16px;">⏳ Pendente</span>`;
    
    if (of.sitOFOriginal === 'Item Entregue') {
        etaTag = `<span class="badge-status badge-normal" style="font-size:13px; padding:8px 16px; background:#10b981; color:#fff;">✅ Item Entregue</span>`;
    } else if (dataOF !== '-') {
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