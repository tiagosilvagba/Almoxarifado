// ==========================================================================
// ESTADO GLOBAL DO SISTEMA E VARIÁVEIS
// ==========================================================================
const bases = { baseItens: [], compras: [], consumos: [] };
let itensProcessados = [], itensFiltrados = [], ordesAtivasFiltradas = [];
let vistaAtual = 'dashboard', mesConsumoAtual = "MÊS";
let chartABC, chartStatus, chartFiliais;
let filtroABC = null, filtroStatus = null, filtroFilial = null;
let isFetchingData = false, loaderProgress = 0, ocultarValoresFinanceiros = true, mapeamentoAtivo = false;
const imagensMapeadas = new Set(), setLocaisUnicos = new Set(), setStatusOFUnicos = new Set();
let lbImages = [], lbIndex = 0, timerBusca;

Chart.defaults.font.family = "'Inter', system-ui, sans-serif";

// ==========================================================================
// HELPERS E UTILITÁRIOS
// ==========================================================================
const $ = id => document.getElementById(id);
const setTxt = (id, txt) => { if($(id)) $(id).innerText = txt; };
const normStr = v => String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const normCod = v => String(v||'').toLowerCase().replace(/\./g, '').replace(/[^a-z0-9-]/g, '').replace(/^0+/, '');
const convNum = v => {
    if(!v) return 0;
    if(typeof v === 'number') return v;
    let f = parseFloat(String(v).trim().replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.'));
    return isNaN(f) ? 0 : f;
};
const findKey = (obj, keys) => {
    if(!obj) return null;
    const objKeys = Object.keys(obj);
    for (let k of keys) {
        let term = normStr(k), found = objKeys.find(ok => normStr(ok) === term || normStr(ok).includes(term));
        if (found) return found;
    }
    return null;
};
const fmtMoeda = v => ocultarValoresFinanceiros ? 'R$ ***' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const parseCSV = txt => Papa.parse(txt.slice(txt.search(/[^\r\n]/)), { header: true, skipEmptyLines: true }).data;

// ==========================================================================
// INTERFACE E COMPORTAMENTOS GERAIS
// ==========================================================================
window.toggleValoresFinanceiros = () => {
    ocultarValoresFinanceiros = !ocultarValoresFinanceiros;
    setTxt('icone-valores', ocultarValoresFinanceiros ? '👁️ Mostrar Valores R$' : '🙈 Ocultar Valores R$');
    window.dispararFiltros();
};

const setProgress = (pct, msg, type = 'info') => {
    loaderProgress = pct;
    if($('loader-bar')) $('loader-bar').style.width = `${pct}%`;
    setTxt('loader-percent', `${Math.round(pct)}%`);
    if(msg && $('loader-logs')) {
        let cls = type === 'error' ? 'error' : type === 'success' ? 'success' : type === 'warning' ? 'warning' : '';
        $('loader-logs').innerHTML += `<div class="${cls}">> ${msg}</div>`;
        $('loader-logs').scrollTop = $('loader-logs').scrollHeight;
    }
};

const fecharLoader = () => {
    if($('tech-loader') && $('app-layout')) {
        $('tech-loader').style.opacity = '0';
        $('app-layout').style.opacity = '1';
        setTimeout(() => $('tech-loader').style.display = 'none', 600);
    }
};

const mostrarToast = (msg, tipo = 'info') => {
    if(!$('toast-container')) return;
    const t = document.createElement('div');
    t.className = `toast toast-${tipo}`;
    t.innerText = msg;
    $('toast-container').appendChild(t);
    setTimeout(() => t.remove(), 5000);
};

window.alterarTema = tema => {
    if (!tema) return;
    tema === 'light' ? document.documentElement.removeAttribute('data-theme') : document.documentElement.setAttribute('data-theme', tema);
    localStorage.setItem('temaAlmoxarifado', tema);
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-theme-val') === tema));
    if (itensProcessados.length > 0) atualizarGraficos();
};

window.navegarPara = view => {
    vistaAtual = view;
    ['pesquisa', 'dashboard', 'compras', 'gestao-compras', 'instrucoes', 'revisao'].forEach(v => {
        if($(`view-${v}`)) $(`view-${v}`).style.display = (v === view) ? 'flex' : 'none';
        if($(`nav-${v}`)) $(`nav-${v}`).classList.toggle('active', v === view);
    });
    window.dispararFiltros();
};

window.toggleSegmentacao = () => $('app-layout')?.classList.toggle('segmentation-hidden');

// ==========================================================================
// LIGHTBOX E MODAIS
// ==========================================================================
const atualizarLightbox = () => {
    if($('lightbox-img') && lbImages.length > 0) {
        $('lightbox-img').src = lbImages[lbIndex];
        setTxt('lightbox-counter', `${lbIndex + 1} / ${lbImages.length}`);
    }
};
window.abrirLightboxArray = (imgs, idx, e) => { e?.stopPropagation(); lbImages = imgs.split(','); lbIndex = idx; atualizarLightbox(); $('lightbox-overlay').style.display = 'flex'; };
window.navegarLightbox = (dir, e) => { e?.stopPropagation(); lbIndex = (lbIndex + dir + lbImages.length) % lbImages.length; atualizarLightbox(); };
window.fecharLightbox = () => { if($('lightbox-overlay')) $('lightbox-overlay').style.display = 'none'; lbImages = []; };
document.addEventListener('keydown', e => {
    if ($('lightbox-overlay')?.style.display === 'flex') {
        if (e.key === 'ArrowRight') window.navegarLightbox(1);
        if (e.key === 'ArrowLeft') window.navegarLightbox(-1);
        if (e.key === 'Escape') window.fecharLightbox();
    }
});

window.fecharModal = () => { $('modal-item').style.display = 'none'; $('modal-body-content').innerHTML = ''; };
$('modal-item')?.addEventListener('click', function(e) { if (e.target === this) window.fecharModal(); });

// ==========================================================================
// INICIALIZAÇÃO E EVENTOS
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    window.alterarTema(localStorage.getItem('temaAlmoxarifado') || 'light');
    ['busca', 'busca-compras', 'busca-ofs'].forEach(id => $(id)?.addEventListener('input', () => { clearTimeout(timerBusca); timerBusca = setTimeout(window.dispararFiltros, 300); }));
    setTimeout(() => { if (!isFetchingData) window.carregarArquivosAutomaticamente(); }, 100);
});

window.mapearImagensPasta = e => {
    const files = e.target.files;
    if (!files.length) return;
    imagensMapeadas.clear();
    let count = 0;
    Array.from(files).forEach(f => {
        let fn = f.name.toLowerCase();
        if (/( - 0[1-6]\.)/.test(fn)) { imagensMapeadas.add(normCod(fn.split(' - ')[0])); count++; }
    });
    mapeamentoAtivo = true;
    if (itensProcessados.length > 0) {
        itensProcessados.forEach(i => i.temImagem = imagensMapeadas.has(i.codNorm));
        window.dispararFiltros();
    }
    mostrarToast(`Sucesso: ${count} imagens mapeadas!`, "success");
};

// ==========================================================================
// CARGA DE DADOS (FETCH & UPLOAD MANUAL)
// ==========================================================================
window.carregarArquivosAutomaticamente = async () => {
    if (isFetchingData) return;
    isFetchingData = true;
    
    $('tech-loader').style.display = 'flex'; $('tech-loader').style.opacity = '1';
    $('loader-ring')?.classList.remove('error'); $('btn-fallback').style.display = 'none';
    if($('loader-logs')) $('loader-logs').innerHTML = '';
    
    setProgress(5, "Iniciando sincronização via Fetch API...");
    const files = [{ id: 'baseItens', url: '03 - Base_Itens.csv' }, { id: 'compras', url: '01 - Compras.csv' }, { id: 'consumos', url: '02 - Consumos.csv' }];
    let loaded = 0, error = false, decoder = new TextDecoder('windows-1252');

    for (let i = 0; i < files.length; i++) {
        let { id, url } = files[i];
        setProgress(10 + (i * 20), `Buscando arquivo: ${url}...`);
        try {
            let res = await fetch(url, { cache: "no-store" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setProgress(15 + (i * 20), `Extraindo dados de ${url}...`);
            bases[id] = parseCSV(decoder.decode(await res.arrayBuffer()));
            setProgress(30 + (i * 20), `✓ ${url} (Lido com Sucesso)`, 'success');
            if($(`status-${id === 'baseItens'?'base':id}`)) { $(`status-${id === 'baseItens'?'base':id}`).innerText = `✅ ${url}`; $(`status-${id === 'baseItens'?'base':id}`).className = 'status-item status-ok'; }
            loaded++;
        } catch (err) {
            setProgress(loaderProgress, `[ERRO ${url}] ${err.message.includes('fetch') ? 'Falha de rede/CORS' : err.message}`, 'error');
            if($(`status-${id === 'baseItens'?'base':id}`)) { $(`status-${id === 'baseItens'?'base':id}`).innerText = `❌ Falha: ${url}`; $(`status-${id === 'baseItens'?'base':id}`).className = 'status-item status-erro'; }
            error = true;
        }
    }
    loaded === 3 ? setTimeout(processarInteligencia, 500) : error && (setProgress(loaderProgress, "Erro. Use o Upload Manual.", 'warning'), $('loader-ring')?.classList.add('error'), $('btn-fallback').style.display = 'block', isFetchingData = false);
};

window.uploadManualMultiplo = e => {
    if (isFetchingData) return;
    isFetchingData = true;
    $('tech-loader').style.display = 'flex'; $('tech-loader').style.opacity = '1'; $('btn-fallback').style.display = 'none';
    if($('loader-logs')) $('loader-logs').innerHTML = '';
    
    let files = Array.from(e.target.files), loaded = 0, decoder = new TextDecoder('windows-1252');
    files.forEach((f, i) => {
        let reader = new FileReader();
        reader.onload = e => {
            let n = f.name.toLowerCase(), id = n.includes('base') ? 'baseItens' : n.includes('compras') ? 'compras' : n.includes('consumos') ? 'consumos' : null;
            if (id) {
                bases[id] = parseCSV(decoder.decode(e.target.result));
                setProgress(20 + (i * 20), `✓ ${f.name} Importado.`, 'success');
                if($(`status-${id === 'baseItens'?'base':id}`)) { $(`status-${id === 'baseItens'?'base':id}`).innerText = `✅ ${f.name}`; $(`status-${id === 'baseItens'?'base':id}`).className = 'status-item status-ok'; }
                if (++loaded === files.length) setTimeout(processarInteligencia, 500);
            }
        };
        reader.readAsArrayBuffer(f);
    });
    if (!files.length) { isFetchingData = false; fecharLoader(); }
};

// ==========================================================================
// EXPORTAÇÕES EXCEL
// ==========================================================================
const baixarExcel = (csv, nome) => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' }));
    link.download = `${nome}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    mostrarToast("Arquivo Excel baixado com sucesso!", "success");
};

window.exportarComprasExcel = () => {
    const list = itensFiltrados.filter(i => (i.saldo <= 0 || i.saldo < i.minimo) && i.minimo > 0 && i.maximo > 0).sort((a,b) => a.saldo - b.saldo);
    if (!list.length) return mostrarToast("Nenhum dado crítico para exportar.", "warning");
    
    let csv = "Código;Descrição;Filial;Saldo Atual;Mínimo;Máximo;Sugestão Compra;Custo Unitário;Valor Estimado Compra\n" + 
        list.map(i => `${i.cod};${i.desc.replace(/;/g, ',')};${i.filialNm.replace(/;/g, ',')};${i.saldo};${i.minimo};${i.maximo};${i.maximo - i.saldo};${i.custoUnitario.toFixed(2)};${((i.maximo - i.saldo) * i.custoUnitario).toFixed(2)}`).join('\n');
    baixarExcel(csv, "Necessidade_Compra");
};

window.exportarRevisaoExcel = () => {
    const list = itensFiltrados.filter(i => (i.consumoFinanceiro === 0 && (i.minimo > 0 || i.maximo > 0)) || (i.saldoUtil < i.minimo && i.consumoFinanceiro > 0) || (i.saldoUtil > i.maximo && i.maximo > 0));
    if (!list.length) return mostrarToast("Nenhum dado de revisão para exportar.", "warning");

    let csv = "Código;Descrição;Filial;Saldo Útil;Mínimo Atual;Máximo Atual;Sugestão Novo Mín;Sugestão Novo Máx;Custo Consumo Mês;Ação Recomendada\n" + 
        list.map(i => {
            let acao = (i.consumoFinanceiro === 0) ? "Revisar/Zerar (Sem Consumo)" : (i.saldoUtil > i.maximo) ? "Reduzir Máximo (Excesso)" : "Aumentar Mínimo (Risco)";
            return `${i.cod};${i.desc.replace(/;/g, ',')};${i.filialNm.replace(/;/g, ',')};${i.saldoUtil};${i.minimo};${i.maximo};${i.sugestaoMin};${i.sugestaoMax};${i.consumoFinanceiro.toFixed(2)};${acao}`;
        }).join('\n');
    baixarExcel(csv, "Revisao_MinMax");
};

// ==========================================================================
// INTELIGÊNCIA E CONSOLIDAÇÃO DE DADOS
// ==========================================================================
async function processarInteligencia() {
    if (!bases.baseItens.length) return (mostrarToast("Base Mestre ausente.", "error"), setProgress(loaderProgress, "Erro Crítico", 'error'), $('loader-ring')?.classList.add('error'), $('btn-fallback').style.display = 'block', isFetchingData = false);

    const keys = {
        cod: ['cd item', 'cod produto', 'codigo', 'cod', 'item', 'sc - cód. produto', 'of - cód. produto'],
        desc: ['nome do item detalhado', 'nome do item resumido', 'nome produto', 'desc', 'sc - nome produto', 'of - nome produto'],
        saldo: ['qt saldo atual', 'saldo livre', 'saldo'], cons: ['qt movimento', 'quantidade consumida', 'quantidade'],
        compFb: ['quantidade', 'qtde', 'saldo aberto', 'of - saldo', 'sc - quantidade'],
        custo: ['vl custo unitario atual', 'custo unitario', 'custo'], min: ['qt minimo', 'minimo', 'min'], max: ['qt maximo', 'maximo', 'max'],
        filId: ['cd filial'], filNm: ['nm filial', 'filial', 'of - filial entrega', 'sc - filial'],
        grp: ['nm grupo', 'grupo', 'categoria'], cls: ['nm classe', 'classe'], rep: ['cd reparticao', 'reparticao'], prat: ['cd prateleira', 'prateleira'], div: ['cd divisao', 'divisao'],
        mesMov: ['mês movimento', 'mes movimento', 'mes', 'mês', 'periodo'], um: ['cd unidade medida', 'un', 'um'],
        locId: ['cd local', 'cod local', 'local'], locNm: ['nm local', 'nome local', 'estoque', 'desc local'], vTot: ['vl total', 'valor total', 'custo total', 'saldo financeiro', 'vl saldo'],
        scDt: ['sc - data criação', 'data criacao sc', 'data criacao'], recDt: ['rec - dt entrada', 'dt entrada', 'data entrada'], ofDt: ['of - data entrega', 'data entrega of', 'dt entrega of'],
        scCod: ['sc - código', 'sc codigo', 'sc'], ofCod: ['of - codigo', 'of codigo', 'ordem fornecimento'], ofForn: ['of - nome fornecedor', 'fornecedor'],
        ofQtd: ['of - qtd. solicitada', 'quantidade pedida', 'qtd solicitada', 'of - quantidade'], recQtd: ['rec - quantidade', 'quantidade recebida', 'qtd recebida', 'quantidade rec'],
        ofSit: ['of - situação of', 'situacao of', 'status of'], scSit: ['sc - situação', 'situacao sc'], scCanc: ['sc - cancelado', 'sc cancelado', 'cancelado']
    };

    let curMonth = new Date().getMonth() || 12;
    mesConsumoAtual = ['', 'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'][curMonth];
    const orderMeses = { 'janeiro':1, 'jan':1, 'fevereiro':2, 'fev':2, 'março':3, 'marco':3, 'mar':3, 'abril':4, 'abr':4, 'maio':5, 'mai':5, 'junho':6, 'jun':6, 'julho':7, 'jul':7, 'agosto':8, 'ago':8, 'setembro':9, 'set':9, 'outubro':10, 'out':10, 'novembro':11, 'nov':11, 'dezembro':12, 'dez':12 };

    setProgress(92, "Processando Compras e Lead Time..."); await new Promise(r => setTimeout(r, 50));
    
    let mapCompras = new Map(), mapLead = new Map(), ordesAtivas = []; setStatusOFUnicos.clear();
    
    if (bases.compras.length) {
        let b = bases.compras[0], c = { cod: findKey(b, keys.cod), ofQtd: findKey(b, keys.ofQtd), recQtd: findKey(b, keys.recQtd), ofSit: findKey(b, keys.ofSit), scSit: findKey(b, keys.scSit), scCanc: findKey(b, keys.scCanc), compFb: findKey(b, keys.compFb), scDt: findKey(b, keys.scDt), recDt: findKey(b, keys.recDt), scCod: findKey(b, keys.scCod), ofCod: findKey(b, keys.ofCod), desc: findKey(b, keys.desc), forn: findKey(b, keys.ofForn), dtEnt: findKey(b, keys.ofDt) };
        bases.compras.forEach(i => {
            let cod = normCod(i[c.cod]); if(!cod) return;
            let sitOF = normStr(i[c.ofSit]), sitSC = normStr(i[c.scSit]), cSC = normStr(i[c.scCanc]);
            let fechada = sitOF.includes('fechada') || sitOF.includes('cancelada') || sitSC.includes('cancelado') || cSC === 'sim' || cSC === 's';
            let pendente = fechada ? 0 : c.ofQtd ? Math.max(0, convNum(i[c.ofQtd]) - convNum(i[c.recQtd])) : convNum(i[c.compFb]);
            
            if(pendente > 0) {
                mapCompras.set(cod, (mapCompras.get(cod) || 0) + pendente);
                let sit = i[c.ofSit] || 'Pendente'; setStatusOFUnicos.add(sit);
                ordesAtivas.push({ sc: i[c.scCod]||'-', of: i[c.ofCod]||'-', codProd: i[c.cod]||'-', descProd: i[c.desc]||'-', fornecedor: i[c.forn]||'ND', dataEntrega: i[c.dtEnt]||'-', qtdPedidaOriginal: c.ofQtd ? convNum(i[c.ofQtd]) : pendente, saldoOF: pendente, sitOFOriginal: sit, searchStr: `${i[c.ofCod]} ${i[c.scCod]} ${i[c.cod]} ${i[c.forn]}`.toLowerCase() });
            }
            if(c.scDt && c.recDt && i[c.scDt] && i[c.recDt]) {
                let pD = s => { let p = String(s).trim().split('/'); return p.length===3 ? new Date(p[2].split(' ')[0], p[1]-1, p[0]) : new Date(s); };
                let dtC = pD(i[c.scDt]), dtE = pD(i[c.recDt]);
                if(!isNaN(dtC) && !isNaN(dtE)) {
                    let d = Math.ceil(Math.abs(dtE - dtC) / 86400000);
                    if(d > 0 && d < 300) { if(!mapLead.has(cod)) mapLead.set(cod, []); mapLead.get(cod).push(d); }
                }
            }
        });
    }
    let mapLeadMedio = new Map(); mapLead.forEach((v, k) => mapLeadMedio.set(k, Math.round(v.reduce((a,b)=>a+b,0)/v.length)));

    setProgress(93, "Apurando Consumo..."); await new Promise(r => setTimeout(r, 50));
    let mapConsumo = new Map(), hasConsumo = false;
    if (bases.consumos.length) {
        let b = bases.consumos[0], cm = findKey(b, keys.mesMov), cc = findKey(b, keys.cod), cq = findKey(b, keys.cons);
        if(cm) bases.consumos.forEach(i => { if (orderMeses[normStr(i[cm])] === curMonth) { hasConsumo = true; let cod = normCod(i[cc]); cod && mapConsumo.set(cod, (mapConsumo.get(cod) || 0) + convNum(i[cq])); } });
    }

    setProgress(95, "Consolidando Base..."); await new Promise(r => setTimeout(r, 50));
    let mapCon = new Map(); setLocaisUnicos.clear(); let setFil = new Set();
    let b0 = bases.baseItens[0], b = { cod: findKey(b0, keys.cod), desc: findKey(b0, keys.desc), saldo: findKey(b0, keys.saldo), min: findKey(b0, keys.min), max: findKey(b0, keys.max), custo: findKey(b0, keys.custo), um: findKey(b0, keys.um), fNm: findKey(b0, keys.filNm), fId: findKey(b0, keys.filId), grp: findKey(b0, keys.grp), cls: findKey(b0, keys.cls), rep: findKey(b0, keys.rep), prat: findKey(b0, keys.prat), div: findKey(b0, keys.div), lId: findKey(b0, keys.locId), lNm: findKey(b0, keys.locNm), vTot: findKey(b0, keys.vTot) };

    bases.baseItens.forEach(i => {
        let cB = String(i[b.cod]||'').replace(/\./g, ''), cN = normCod(cB); if(!cN) return;
        let fId = normCod(i[b.fId]), fNm = i[b.fNm]||'', lId = String(i[b.lId]||'').trim(), lNm = String(i[b.lNm]||'').trim(), rep = String(i[b.rep]||'-').trim(), prat = i[b.prat]||'-', div = i[b.div]||'-';
        
        if (fId === '704') {
            let locNum = parseInt(lId, 10);
            if (['101','0101','299','0299','295','0295'].includes(lId) || locNum >= 599 || rep.toUpperCase() === 'AP' || rep.length === 1) { fNm = 'Rolândia - Alp. Preparados'; fId = '704_ALP'; } 
            else { fNm = 'Rolândia - Ab. Aves'; fId = '704_AB'; }
        }
        if(fNm && fNm !== '-') setFil.add(fNm);
        let locFmt = lId ? `${lId} - ${lNm}` : lNm; if (locFmt && locFmt !== '-' && locFmt !== '') setLocaisUnicos.add(`${fNm} | ${locFmt}`);

        let sld = convNum(i[b.saldo]), vTot = b.vTot ? convNum(i[b.vTot]) : 0, cst = convNum(i[b.custo]), min = convNum(i[b.min]), max = convNum(i[b.max]);
        let crit = ['299','0299','295','0295'].includes(lId) || lNm.includes('299') || lNm.includes('295');
        (vTot > 0 && sld > 0) ? cst = vTot / sld : vTot = cst * sld;

        let key = `${cN}|${fId}`;
        if (!mapCon.has(key)) mapCon.set(key, { cod: cB, codNorm: cN, desc: i[b.desc]||"Sem Desc", um: i[b.um]||'UN', filialNm: fNm, filialIdBase: fId, grupo: i[b.grp]||'', classe: i[b.cls]||'', saldo: 0, minimo: 0, maximo: 0, valorTotalGlobal: 0, custoUnitario: 0, leadTime: mapLeadMedio.get(cN) || 15, locais: [] });
        
        let o = mapCon.get(key);
        o.saldo += sld; o.valorTotalGlobal += vTot; o.minimo = Math.max(o.minimo, min); o.maximo = Math.max(o.maximo, max);
        o.locais.push({ filialNm: fNm, localId: lId, localNm: lNm, reparticao: rep, prateleira: prat, divisao: div, saldo: sld, custoUnitario: cst, isCritico: crit });
    });

    if($('select-filial')) $('select-filial').innerHTML = '<option value="">Todas as Filiais</option>' + Array.from(setFil).sort().map(f => `<option value="${f}">${f}</option>`).join('');
    if($('select-local')) $('select-local').innerHTML = '<option value="">Todos os Locais</option>' + Array.from(setLocaisUnicos).sort().map(l => `<option value="${l}">${l}</option>`).join('');

    setProgress(98, "Calculando KPIs..."); await new Promise(r => setTimeout(r, 50)); 
    
    let baseProc = Array.from(mapCon.values()).map(i => {
        // Correção Passo 1: Trazemos o cálculo de trânsito e consumo para ANTES da verificação
        let trans = mapCompras.get(i.codNorm) || 0, consF = Math.abs(mapConsumo.get(i.codNorm)) || 0;
        
        // Agora, se o item possuir trânsito (SC aberta), ele NÃO será descartado
        if (!i.saldo && !i.minimo && !i.maximo && !trans && !consF) return null;
        
        i.custoUnitario = (i.saldo > 0 && i.valorTotalGlobal > 0) ? i.valorTotalGlobal / i.saldo : i.locais[0]?.custoUnitario || 0;
        
        let vImob = i.valorTotalGlobal > 0 ? i.valorTotalGlobal : (i.saldo * i.custoUnitario), cFin = consF * i.custoUnitario;
        let gMes = cFin > 0 ? Math.round((vImob / cFin) * 30) : Infinity, gAno = (cFin * 12) > 0 ? Math.round((vImob / (cFin * 12)) * 365) : Infinity;
        
        i.saldoUtil = i.saldo - i.locais.filter(l => l.isCritico).reduce((s, l) => s + l.saldo, 0);
        i.sugestaoMin = consF === 0 ? 0 : Math.ceil((consF / 30) * i.leadTime);
        i.sugestaoMax = consF === 0 ? 0 : Math.ceil(i.sugestaoMin + consF);

        let st = 'Estoque Normal', bd = 'badge-normal';
        if (i.saldo <= 0 && trans <= 0) { st = 'Ruptura Crítica (Sem Pedido)'; bd = 'badge-ruptura-critica'; }
        else if (i.saldo <= 0 && trans > 0) { st = 'Ruptura (Em Trânsito)'; bd = 'badge-ruptura-transito'; }
        else if (i.saldo > 0 && consF <= 0) { st = i.locais.some(l => l.isCritico && l.saldo > 0) ? 'Normal/Local Crítico' : 'Obsoleto (Sem Consumo)'; bd = st.includes('Local') ? 'badge-normal-critico' : 'badge-obsoleto'; }
        else if (i.saldo > 0 && i.minimo > 0 && i.saldo < i.minimo) { st = 'Abaixo Mínimo'; bd = 'badge-abaixo'; }
        else if (i.maximo > 0 && i.saldo > i.maximo) { st = 'Excesso Estoque'; bd = 'badge-acima'; }

        i.reparticao = i.locais[0]?.reparticao || '-'; i.prateleira = i.locais[0]?.prateleira || '-'; i.divisao = i.locais[0]?.divisao || '-';
        return { ...i, transito: trans, consumo: consF, consumoFinanceiro: cFin, diasGiroMensal: gMes, diasGiroAnual: gAno, valorImobilizado: vImob, status: st, statusBadge: bd, curva: 'C', temImagem: mapeamentoAtivo ? imagensMapeadas.has(i.codNorm) : null, searchString: `${i.codNorm} ${normStr(i.desc)} ${normStr(i.grupo)} ${normStr(i.classe)} rep ${i.reparticao} prat ${i.prateleira} div ${i.divisao}`.toLowerCase() };
    }).filter(Boolean).sort((a, b) => parseFloat(a.codNorm) - parseFloat(b.codNorm));

    if (!baseProc.length) return (fecharLoader(), isFetchingData = false);

    let itemsABC = [...baseProc].sort((a, b) => b.consumoFinanceiro - a.consumoFinanceiro), tFin = itemsABC.reduce((s, c) => s + c.consumoFinanceiro, 0), cAcum = 0;
    itemsABC.forEach(i => { if (tFin > 0 && i.consumoFinanceiro > 0) { cAcum += i.consumoFinanceiro; let p = cAcum / tFin; i.curva = p <= 0.8 ? 'A' : p <= 0.95 ? 'B' : 'C'; } });

    itensProcessados = baseProc;
    ordesAtivasFiltradas = ordesAtivas.map(o => ({ ...o, filial: mapCon.get(`${normCod(o.codProd)}|${Array.from(mapCon.values()).find(x=>x.codNorm===normCod(o.codProd))?.filialIdBase}`)?.filialNm || 'Geral' }));
    
    if($('select-status-of')) $('select-status-of').innerHTML = '<option value="">Todos os Status</option>' + Array.from(setStatusOFUnicos).sort().map(s => `<option value="${s}">${s}</option>`).join('');

    setProgress(100, "Renderizando Interface...", "success");
    setTxt('kpi-consumo-title', `Custo do Consumo (${mesConsumoAtual})`);
    setTxt('th-consumo', `Custo Consumo (${mesConsumoAtual})`);

    setTimeout(() => {
        window.dispararFiltros();
        mostrarToast(hasConsumo ? `Inteligência Ativada. Consumo travado em ${mesConsumoAtual}.` : `Atenção: Sem saídas em ${mesConsumoAtual}.`, hasConsumo ? "success" : "warning");
        fecharLoader(); isFetchingData = false;
    }, 600);
}

// ==========================================================================
// FILTROS, BUSCA E RENDERIZAÇÃO 
// ==========================================================================
window.atualizarFiltroLocais = () => {
    let fVal = $('select-filial')?.value, lEl = $('select-local'), lAtual = lEl?.value;
    if(!lEl) return;
    lEl.innerHTML = '<option value="">Todos os Locais</option>' + Array.from(setLocaisUnicos).filter(l => !fVal || l.startsWith(fVal + ' |')).sort().map(l => `<option value="${l}">${l}</option>`).join('');
    lEl.value = Array.from(lEl.options).some(o => o.value === lAtual) ? lAtual : "";
    window.dispararFiltros();
};

window.dispararFiltros = () => {
    let tRaw = vistaAtual === 'pesquisa' ? $('busca')?.value : vistaAtual === 'compras' ? $('busca-compras')?.value : vistaAtual === 'gestao-compras' ? $('busca-ofs')?.value : $('busca')?.value;
    let tSplit = (tRaw||'').split(',').map(t => normStr(t)).filter(Boolean);
    let sFil = $('select-saldo-status')?.value, cFil = $('select-curva')?.value, imgFil = $('select-imagem')?.value, fFil = $('select-filial')?.value || filtroFilial || "", lFil = $('select-local')?.value || "";

    if (imgFil && !mapeamentoAtivo) { mostrarToast("Mapeie a pasta de imagens primeiro.", "warning"); $('select-imagem').value = ""; return; }

    itensFiltrados = itensProcessados.filter(i => 
        (!tSplit.length || tSplit.some(t => i.searchString.includes(t))) && 
        (!cFil || i.curva === cFil) && (!sFil || i.status === sFil) && (!fFil || i.filialNm === fFil) &&
        (!lFil || i.locais.some(l => `${l.filialNm} | ${l.localId ? l.localId+' - '+l.localNm : l.localNm}` === lFil)) &&
        (!imgFil || (imgFil === 'com_imagem' ? i.temImagem : !i.temImagem))
    );

    if (vistaAtual === 'pesquisa') renderPesquisa();
    else if (vistaAtual === 'dashboard') renderDashboard();
    else if (vistaAtual === 'compras') renderCompras();
    else if (vistaAtual === 'gestao-compras') renderGestaoCompras(tSplit, fFil);
    else if (vistaAtual === 'revisao') renderRevisao();
};

window.limparFiltroGrafico = tipo => {
    if(tipo === 'abc') { filtroABC = null; $('filtro-abc-aviso').style.display = 'none'; }
    if(tipo === 'status') { filtroStatus = null; $('filtro-status-aviso').style.display = 'none'; }
    if(tipo === 'filial') { filtroFilial = null; $('filtro-filial-aviso').style.display = 'none'; }
    window.dispararFiltros();
};

window.limparFiltros = () => {
    ['select-curva', 'select-saldo-status', 'select-imagem', 'select-filial', 'select-local', 'select-status-of', 'busca', 'busca-compras', 'busca-ofs'].forEach(id => { if($(id)) $(id).value = ""; });
    filtroABC = filtroStatus = filtroFilial = null;
    ['filtro-abc-aviso', 'filtro-status-aviso', 'filtro-filial-aviso'].forEach(id => { if($(id)) $(id).style.display = 'none'; });
    window.atualizarFiltroLocais();
};

// ================= RENDERIZADORES =================
const renderPesquisa = () => {
    setTxt('contador-itens', `${itensFiltrados.length} itens encontrados.`);
    $('resultados').innerHTML = itensFiltrados.slice(0, 100).map(i => `
        <div class="item-card fade-in" onclick="window.abrirModalDetalhes('${i.codNorm}', '${i.filialIdBase}')">
            <div class="item-media"><div class="abc-badge curva-${i.curva}">${i.curva}</div><div class="item-image-container">${mapeamentoAtivo ? (i.temImagem ? `<img src="imagens/${i.cod} - 01.jpg">` : `<div class="img-placeholder">🚫<br>SEM FOTO</div>`) : `<img src="imagens/${i.cod} - 01.jpg" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"><div class="img-placeholder" style="display:none;">🚫<br>SEM FOTO</div>`}</div></div>
            <div class="item-info">
                <div class="item-header"><div class="item-title"><span class="item-title-cod">#${i.cod}</span> ${i.desc}</div><span class="badge-status ${i.statusBadge}">${i.status}</span></div>
                <div class="item-category"><span class="chip-category">${i.grupo||'Geral'}</span><span class="chip-category">${i.classe||'N/A'}</span><span class="chip-category">UN: ${i.um||'UN'}</span></div>
                <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;background:var(--bg-subcard);padding:8px;border-radius:8px;"><div>🏢 <strong>Filiais:</strong> ${itensProcessados.filter(x=>x.codNorm===i.codNorm&&x.saldo>0).map(x=>x.filialNm).filter((v,i,a)=>a.indexOf(v)===i).join(', ') || 'Nenhuma'}</div><div>📍 <strong>Local:</strong> ${i.locais.length>1 ? 'Múltiplos (Ver detalhes)' : `Rep: ${i.reparticao} • Prat: ${i.prateleira} • Div: ${i.divisao}`}</div></div>
                <div class="item-metrics-grid">
                    <div class="metric-box metric-saldo"><span class="metric-label">Saldo</span><span class="metric-value">${i.saldo}</span></div>
                    <div class="metric-box metric-default"><span class="metric-label" style="color:var(--primary-color);">Giro Mês</span><span class="metric-value">${i.diasGiroMensal===Infinity?'Obsoleto':i.diasGiroMensal+'d'}</span></div>
                    <div class="metric-box metric-default"><span class="metric-label">Giro Ano</span><span class="metric-value">${i.diasGiroAnual===Infinity?'Obsoleto':i.diasGiroAnual+'d'}</span></div>
                    <div class="metric-box metric-default"><span class="metric-label">Custo Consumo</span><span class="metric-value">${fmtMoeda(i.consumoFinanceiro)}</span></div>
                </div>
            </div>
        </div>`).join('');
};

const renderRevisao = () => {
    let rev = itensFiltrados.filter(i => (i.consumoFinanceiro === 0 && (i.minimo > 0 || i.maximo > 0)) || (i.saldoUtil < i.minimo && i.consumoFinanceiro > 0) || (i.saldoUtil > i.maximo && i.maximo > 0));
    $('revisao-table-body').innerHTML = rev.slice(0, 100).map(i => {
        let acao = (i.consumoFinanceiro === 0) ? "Revisar/Zerar" : (i.saldoUtil > i.maximo) ? "Reduzir Máximo" : "Aumentar Mínimo";
        let cor = (i.consumoFinanceiro === 0) ? "var(--text-warning)" : (i.saldoUtil > i.maximo) ? "var(--primary-color)" : "var(--text-danger)";
        return `<tr class="fade-in" onclick="window.abrirModalDetalhes('${i.codNorm}', '${i.filialIdBase}')"><td><strong style="color:var(--primary-color);">#${i.cod}</strong><br><span style="font-size:11px;">${i.desc}</span></td><td>${i.filialNm}</td><td style="font-weight:900;color:var(--primary-color);">${i.saldoUtil}</td><td>${i.minimo} / ${i.maximo}</td><td style="font-weight:900;color:var(--text-info);">${i.sugestaoMin}</td><td style="font-weight:900;color:var(--text-info);">${i.sugestaoMax}</td><td>${fmtMoeda(i.consumoFinanceiro)}</td><td style="font-weight:800;color:${cor};">${acao}</td></tr>`;
    }).join('') || `<tr><td colspan="8" style="text-align:center;padding:40px;">Nenhum item exige revisão.</td></tr>`;
};

const renderCompras = () => {
    let list = itensFiltrados.filter(i => (i.saldo <= 0 || i.saldo < i.minimo) && i.minimo > 0 && i.maximo > 0).sort((a,b) => a.saldo - b.saldo);
    let tQtd = 0, tVal = 0;
    $('compras-table-body').innerHTML = list.map(i => {
        let sug = i.maximo - i.saldo; tQtd += sug; tVal += (sug * i.custoUnitario);
        return `<tr class="fade-in" onclick="window.abrirModalDetalhes('${i.codNorm}', '${i.filialIdBase}')"><td><strong style="color:var(--primary-color);">#${i.cod}</strong><br><span style="font-size:11px;">${i.desc}</span></td><td>${i.filialNm}</td><td style="font-weight:900;color:var(--text-critical);">${i.saldo}</td><td style="font-weight:700;color:var(--text-warning);">${i.minimo}</td><td style="font-weight:700;color:var(--primary-color);">${i.maximo}</td><td style="font-weight:900;color:var(--text-success);">COMPRAR +${sug}</td></tr>`;
    }).join('') || `<tr><td colspan="6" style="text-align:center;padding:40px;">Sem necessidade de compras críticas.</td></tr>`;
    if($('resumo-necessidade')) $('resumo-necessidade').innerHTML = `<div class="kpi-card border-warning"><span class="kpi-title">Reposição (Qtd)</span><span class="kpi-value color-warning">${tQtd}</span></div><div class="kpi-card border-success"><span class="kpi-title">Valor Estimado</span><span class="kpi-value color-success">${fmtMoeda(tVal)}</span></div>`;
};

const renderGestaoCompras = (tSplit, fFil) => {
    let sOF = $('select-status-of')?.value;
    let list = ordesAtivasFiltradas.filter(o => (!tSplit.length || tSplit.some(t => o.searchStr.includes(t))) && (!fFil || o.filial === fFil || o.filial === 'Geral') && (!sOF || o.sitOFOriginal === sOF));
    let vT = 0, qT = 0, fSet = new Set(), oSet = new Set();
    
    $('ofs-table-body').innerHTML = list.slice(0, 100).map(o => {
        let cst = itensProcessados.find(i => i.codNorm === normCod(o.codProd))?.custoUnitario || 0;
        vT += o.saldoOF * cst; qT += o.saldoOF; fSet.add(o.fornecedor); oSet.add(o.of);
        
        // Correção Passo 2: Adicionado '${o.sc}' no evento onclick
        return `<tr class="fade-in" onclick="window.abrirModalOF('${o.of}', '${o.codProd}', '${o.sc}')"><td><strong>${o.of}</strong><br><span style="font-size:10px;">SC: ${o.sc}</span></td><td><strong style="color:var(--primary-color);">#${o.codProd}</strong><br><span style="font-size:11px;">${o.descProd}</span></td><td>${o.fornecedor}</td><td>${o.qtdPedidaOriginal > 0 ? o.qtdPedidaOriginal : o.saldoOF}</td><td style="font-weight:900;color:var(--text-warning);">${o.saldoOF}</td><td>${o.dataEntrega}</td></tr>`;
    }).join('') || `<tr><td colspan="6" style="text-align:center;padding:40px;">Sem OFs pendentes.</td></tr>`;
    
    if($('resumo-ofs')) $('resumo-ofs').innerHTML = `<div class="kpi-card border-info"><span class="kpi-title">Valor Pendente</span><span class="kpi-value color-info">${fmtMoeda(vT)}</span></div><div class="kpi-card"><span class="kpi-title">Qtd Físico</span><span class="kpi-value">${qT}</span></div><div class="kpi-card"><span class="kpi-title">OFs Abertas</span><span class="kpi-value">${oSet.size}</span></div><div class="kpi-card"><span class="kpi-title">Fornecedores</span><span class="kpi-value">${fSet.size}</span></div>`;
};

const renderDashboard = () => {
    let vT=0, vO=0, qO=0, qRC=0, qRT=0, qRM=0, qE=0, sF=0, cMF=0, sA=0;
    itensFiltrados.forEach(i => {
        vT+=i.valorImobilizado; sF+=i.valorImobilizado; cMF+=i.consumoFinanceiro;
        if(i.saldo>0) sA++;
        if(i.status==='Ruptura Crítica (Sem Pedido)') qRC++;
        if(i.status==='Ruptura (Em Trânsito)') qRT++;
        if(i.status==='Abaixo Mínimo') qRM++;
        if(i.status==='Excesso Estoque') qE++;
        if(i.status.includes('Obsoleto')) { vO+=i.valorImobilizado; qO++; }
    });

    setTxt('dash-kpi-valor-total', fmtMoeda(vT)); setTxt('dash-kpi-total-itens', `Em ${itensFiltrados.length} SKUs`);
    setTxt('dash-kpi-giro-anual', cMF>0 ? Math.round((sF/(cMF*12))*365)+'d' : 'Sem Consumo');
    setTxt('dash-kpi-giro-medio', cMF>0 ? Math.round((sF/cMF)*30)+'d' : 'Sem Consumo');
    setTxt('dash-kpi-ruptura-critica', qRC); setTxt('dash-kpi-risco-minimo', qRM); setTxt('dash-kpi-excesso', qE); setTxt('dash-kpi-ruptura-transito', qRT);
    setTxt('dash-kpi-valor-obsoleto', fmtMoeda(vO)); setTxt('dash-kpi-obsoleto-qtd', `${qO} itens`); setTxt('dash-kpi-skus-ativos', sA);
    setTxt('dash-kpi-volume-fisico', fmtMoeda(sF)); setTxt('dash-kpi-consumo-financeiro', fmtMoeda(cMF)); setTxt('dash-kpi-total-itens-proc', itensProcessados.length);

    atualizarGraficos();
    
    let tb = itensFiltrados;
    if(filtroABC) { tb = tb.filter(i=>i.curva===filtroABC); $('filtro-abc-aviso').style.display='inline-block'; setTxt('filtro-abc-aviso', `✖ ABC: ${filtroABC}`); } else if($('filtro-abc-aviso')) $('filtro-abc-aviso').style.display='none';
    if(filtroStatus) { tb = tb.filter(i=> filtroStatus==='Ruptura' ? i.status.includes('Ruptura') : filtroStatus==='Obsoleto' ? i.status.includes('Obsoleto') : i.status===filtroStatus); $('filtro-status-aviso').style.display='inline-block'; setTxt('filtro-status-aviso', `✖ Status: ${filtroStatus}`); } else if($('filtro-status-aviso')) $('filtro-status-aviso').style.display='none';
    if(filtroFilial) { tb = tb.filter(i=>i.filialNm===filtroFilial); $('filtro-filial-aviso').style.display='inline-block'; setTxt('filtro-filial-aviso', `✖ Filial: ${filtroFilial}`); } else if($('filtro-filial-aviso')) $('filtro-filial-aviso').style.display='none';

    if($('dash-table-body')) $('dash-table-body').innerHTML = tb.slice(0, 50).map(i => `<tr class="fade-in" onclick="window.abrirModalDetalhes('${i.codNorm}', '${i.filialIdBase}')"><td><div class="abc-badge curva-${i.curva}" style="width:28px;height:28px;font-size:13px;position:static;">${i.curva}</div></td><td><strong style="color:var(--primary-color);">#${i.cod}</strong><br><span style="font-size:11px;">${i.desc}</span></td><td style="font-size:11px;">${i.locais.length>1 ? i.locais.length+' Locais' : `Rep ${i.reparticao} | Prat ${i.prateleira}`}</td><td style="font-weight:800;">${i.saldo}</td><td style="font-weight:600;">${fmtMoeda(i.consumoFinanceiro)}</td><td style="font-weight:700;">${i.diasGiroMensal===Infinity?'Obsoleto':i.diasGiroMensal+'d'}</td><td><span class="badge-status ${i.statusBadge}">${i.status}</span></td></tr>`).join('') || `<tr><td colspan="7" style="text-align:center;padding:40px;">Nenhum dado encontrado.</td></tr>`;
};

const atualizarGraficos = () => {
    [chartABC, chartStatus, chartFiliais].forEach(c => c?.destroy());
    let cA = $('chartABC')?.getContext('2d'), cS = $('chartStatus')?.getContext('2d'), cF = $('chartFiliais')?.getContext('2d');
    if(!cA || !cS) return;

    let vABC={A:0,B:0,C:0}, cSt={N:0,R:0,E:0,RC:0,O:0,LC:0}, vF={}, isDark = ['dark','ocean','dracula','hacker'].includes(document.documentElement.getAttribute('data-theme'));
    
    itensFiltrados.forEach(i => {
        vABC[i.curva] += i.consumoFinanceiro; vF[i.filialNm] = (vF[i.filialNm]||0) + i.valorImobilizado;
        i.status==='Estoque Normal' ? cSt.N++ : i.status==='Abaixo Mínimo' ? cSt.R++ : i.status==='Excesso Estoque' ? cSt.E++ : i.status==='Normal/Local Crítico' ? cSt.LC++ : i.status.includes('Ruptura') ? cSt.RC++ : cSt.O++;
    });

    Chart.defaults.color = getComputedStyle(document.body).getPropertyValue('--text-primary').trim();
    const gOpts = (t, legend = false) => ({ responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: t, font:{size:14, weight:'800'} }, legend: { display: legend, position: 'bottom' } } });

    chartABC = new Chart(cA, { type: 'doughnut', data: { labels: ['Curva A', 'Curva B', 'Curva C'], datasets: [{ data: [vABC.A, vABC.B, vABC.C], backgroundColor: ['#10b981', '#0ea5e9', '#64748b'], borderWidth: isDark?0:2, borderColor: isDark?'transparent':'#fff' }] }, options: { ...gOpts(`Custo Consumo (${mesConsumoAtual})`, true), cutout: '75%', onClick: (e, el) => { if(el.length) { let c = ['A','B','C'][el[0].index]; filtroABC = filtroABC === c ? null : c; renderDashboard(); } } } });
    
    chartStatus = new Chart(cS, { type: 'bar', data: { labels: ['Normal', 'Risco (Min)', 'Excesso', 'Rupturas', 'Obsoletos', 'Local 299/295'], datasets: [{ data: [cSt.N, cSt.R, cSt.E, cSt.RC, cSt.O, cSt.LC], backgroundColor: ['#10b981', '#f59e0b', '#0ea5e9', '#ef4444', '#64748b', '#8b5cf6'], borderRadius: 6 }] }, options: { ...gOpts('Distribuição Logística'), scales: { y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, border:{display:false} }, x: { grid: {display:false}, border:{display:false} } }, onClick: (e, el) => { if(el.length) { let s = ['Estoque Normal', 'Abaixo Mínimo', 'Excesso Estoque', 'Ruptura', 'Obsoleto', 'Normal/Local Crítico'][el[0].index]; filtroStatus = filtroStatus === s ? null : s; renderDashboard(); } } } });
    
    if(cF) chartFiliais = new Chart(cF, { type: 'doughnut', data: { labels: Object.keys(vF), datasets: [{ data: Object.values(vF), backgroundColor: ['#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#64748b'], borderWidth: isDark?0:2, borderColor: isDark?'transparent':'#fff' }] }, options: { ...gOpts('Distribuição (R$)'), cutout: '75%', onClick: (e, el) => { if(el.length) { let f = Object.keys(vF)[el[0].index]; filtroFilial = filtroFilial === f ? null : f; renderDashboard(); } } } });
};

// ==========================================================================
// MODAIS DE DETALHE
// ==========================================================================
window.abrirModalDetalhes = (codNorm, fId) => {
    let item = itensProcessados.find(i => i.codNorm === codNorm && i.filialIdBase === fId);
    if (!item) return mostrarToast("Erro ao abrir.", "error");

    let imgsHTML = '', lbArr = [];
    if (mapeamentoAtivo && item.temImagem) {
        for(let k = 1; k <= 6; k++) { let p = `imagens/${item.cod} - 0${k}.jpg`; lbArr.push(p); imgsHTML += `<img src="${p}" style="height:150px;min-width:150px;border-radius:12px;object-fit:cover;" onclick="window.abrirLightboxArray('${lbArr.join(',')}', ${k-1}, event)" onerror="this.style.display='none'">`; }
    } else { imgsHTML = `<img src="imagens/${item.cod} - 01.jpg" style="height:150px;border-radius:12px;object-fit:cover;" onclick="window.abrirLightboxArray('imagens/${item.cod} - 01.jpg', 0, event)" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"><div class="img-placeholder" style="display:none;width:150px;height:150px;">🚫<br>SEM FOTO</div>`; }

    let locs = item.locais.map(l => `<tr><td>${l.filialNm}</td><td><strong style="color:var(--primary-color);">${l.localId||'-'}</strong> - ${l.localNm}</td><td>${l.reparticao}</td><td>${l.prateleira}</td><td>${l.divisao}</td><td style="font-weight:800;">${l.saldo}</td></tr>`).join('');

    $('modal-body-content').innerHTML = `
        <div class="modal-header-section"><div style="flex-grow:1;"><h2 style="font-size:24px;font-weight:800;margin-bottom:8px;"><span style="color:var(--primary-color);">#${item.cod}</span> - ${item.desc}</h2><div class="item-category" style="margin-bottom:20px;"><span class="chip-category">${item.grupo||'Geral'}</span><span class="chip-category">${item.classe||'N/A'}</span><span class="chip-category">Medida: <strong>${item.um}</strong></span><span class="badge-status ${item.statusBadge}">${item.status}</span></div>
        <div class="item-metrics-grid"><div class="metric-box metric-saldo"><span class="metric-label">Saldo</span><span class="metric-value">${item.saldo}</span></div><div class="metric-box metric-default"><span class="metric-label">Custo Un.</span><span class="metric-value">${fmtMoeda(item.custoUnitario)}</span></div><div class="metric-box metric-default"><span class="metric-label">Valor Imob.</span><span class="metric-value">${fmtMoeda(item.valorImobilizado)}</span></div><div class="metric-box metric-default"><span class="metric-label">Min/Max</span><span class="metric-value">${item.sugestaoMin} / ${item.sugestaoMax}</span></div><div class="metric-box metric-default"><span class="metric-label" style="color:var(--primary-color);">Giro Mês</span><span class="metric-value">${item.diasGiroMensal===Infinity?'Obsoleto':item.diasGiroMensal+'d'}</span></div><div class="metric-box metric-transito"><span class="metric-label">Em OF</span><span class="metric-value">${item.transito}</span></div></div></div></div>
        <h3 style="font-size:13px;font-weight:800;color:var(--text-secondary);margin-bottom:12px;">Galeria</h3><div class="modal-gallery-container" style="margin-bottom:24px;">${imgsHTML}</div>
        <h3 style="font-size:13px;font-weight:800;color:var(--text-secondary);margin-bottom:12px;">Detalhamento de Locais</h3><div style="overflow-x:auto;border-radius:12px;border:1px solid var(--border-color);"><table class="modal-locais-table"><thead><tr><th>Filial</th><th>Local</th><th>Rep.</th><th>Prat.</th><th>Div.</th><th>Saldo</th></tr></thead><tbody>${locs}</tbody></table></div>`;
    $('modal-item').style.display = 'flex';
};

// Correção Passo 3: Adicionado o parâmetro scId e gerado fallback para evitar quebra.
window.abrirModalOF = (ofId, codProd, scId) => {
    let c = normCod(codProd), 
        // Agora a busca valida Produto + OF + SC
        o = ordesAtivasFiltradas.find(x => x.of === ofId && x.sc === scId && normCod(x.codProd) === c), 
        i = itensProcessados.find(x => x.codNorm === c);

    if (!o) return mostrarToast("Erro ao carregar OF.", "error");

    // Fallback de segurança: Se o item estiver em Compras mas não existir na Base Mestre de Itens
    if (!i) {
        i = { saldo: 0, minimo: 0, maximo: 0, codNorm: c, filialIdBase: 'N/A' };
    }

    // Só permite ver o contexto se o item realmente existir na inteligência do painel
    let btnContexto = itensProcessados.some(x => x.codNorm === c) 
        ? `<button class="theme-btn active" onclick="window.abrirModalDetalhes('${i.codNorm}', '${i.filialIdBase}')" style="padding:12px 24px;border-radius:8px;">Ver Contexto Completo do Item</button>`
        : `<button class="theme-btn" style="padding:12px 24px;border-radius:8px; opacity:0.5; cursor:not-allowed;" title="Sem cadastro na Base">Contexto Indisponível (Sem Base)</button>`;

    $('modal-body-content').innerHTML = `
        <div class="modal-header-section"><div style="flex-grow:1;"><h2 style="font-size:20px;font-weight:800;margin-bottom:8px;">Gestão de OF: <span style="color:var(--primary-color);">${o.of}</span></h2><h3 style="font-size:14px;color:var(--text-secondary);margin-bottom:20px;">#${o.codProd} - ${o.descProd}</h3>
        <div class="item-category" style="margin-bottom:20px;"><span class="chip-category">SC: <strong>${o.sc}</strong></span><span class="chip-category">Forn.: <strong>${o.fornecedor}</strong></span><span class="chip-category">Entrega: <strong>${o.dataEntrega}</strong></span><span class="badge-status badge-transito">${o.sitOFOriginal||'Pendente'}</span></div>
        <div class="item-metrics-grid"><div class="metric-box metric-saldo"><span class="metric-label">Saldo Físico</span><span class="metric-value">${i.saldo}</span></div><div class="metric-box metric-default"><span class="metric-label">Min/Max</span><span class="metric-value">${i.minimo} / ${i.maximo}</span></div><div class="metric-box metric-transito"><span class="metric-label">Qtd Solicitada</span><span class="metric-value">${o.qtdPedidaOriginal}</span></div><div class="metric-box metric-default" style="border-color:var(--text-warning);"><span class="metric-label" style="color:var(--text-warning);">Saldo Pendente</span><span class="metric-value" style="color:var(--text-warning);">${o.saldoOF}</span></div></div></div></div>
        <div style="text-align:center;padding:10px;"><p style="font-size:13px;color:var(--text-secondary);margin-bottom:15px;">Aprofundar a análise de consumo?</p>${btnContexto}</div>`;
    $('modal-item').style.display = 'flex';
};