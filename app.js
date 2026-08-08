// ==========================================================================
// CONFIGURAÇÕES E ESTADO GLOBAL
// ==========================================================================
const bases = { baseItens: [], compras: [], consumos: [] };
let itensProcessados = [];
let itensFiltrados = [];

let vistaAtual = 'dashboard';
let chartABCInstance = null;
let chartStatusInstance = null;

let mesesAnalisados = 1; 
let filtroGraficoABC = null; 
let filtroGraficoStatus = null;
let mesConsumoAtual = "MÊS";

// Força o Chart.js a usar a nova fonte 'Inter'
Chart.defaults.font.family = "'Inter', system-ui, sans-serif";

// ==========================================================================
// 1. INICIALIZAÇÃO E UI (TEMAS / NAVEGAÇÃO)
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    const temaLocal = localStorage.getItem('temaAlmoxarifado') || 'light';
    document.querySelectorAll('.theme-btn').forEach(btn => {
        if(btn.getAttribute('data-theme-val') === temaLocal) btn.classList.add('active');
    });

    const campoBusca = document.getElementById('busca');
    if (campoBusca) {
        campoBusca.addEventListener('input', dispararFiltrosDebounce);
    }

    carregarArquivosAutomaticamente();
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

function mostrarToast(mensagem, tipo = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    toast.innerText = mensagem;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 5000);
}

function navegarPara(view) {
    vistaAtual = view;
    document.getElementById('view-pesquisa').style.display = view === 'pesquisa' ? 'flex' : 'none';
    document.getElementById('view-dashboard').style.display = view === 'dashboard' ? 'flex' : 'none';
    document.getElementById('nav-pesquisa').classList.toggle('active', view === 'pesquisa');
    document.getElementById('nav-dashboard').classList.toggle('active', view === 'dashboard');
    dispararFiltrosSemAtraso();
}

function toggleSegmentacao() { 
    document.getElementById('app-layout').classList.toggle('segmentation-hidden'); 
}

// ==========================================================================
// 2. FUNÇÕES ÚTEIS E OTIMIZADAS
// ==========================================================================
function normalizarString(val) { return String(val || '').normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); }
function normalizarCod(val) { return String(val || '').toLowerCase().replace(/\./g, '').replace(/[^a-z0-9-]/g, '').replace(/^0+/, ''); }
function converterParaNumero(val) {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return val;
    let str = String(val).trim().replace(/[R$\s]/g, '');
    if (str.includes(',')) str = str.replace(/\./g, '').replace(',', '.');
    let floatVal = parseFloat(str);
    return isNaN(floatVal) ? 0 : floatVal;
}
function formatarMoeda(valor) { return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

function encontrarChave(objRef, termosChave) {
    if (!objRef) return null;
    const chaves = Object.keys(objRef);
    for (const termo of termosChave) {
        const termoBusca = normalizarString(termo);
        for (const chave of chaves) {
            if (normalizarString(chave) === termoBusca || normalizarString(chave).includes(termoBusca)) {
                return chave;
            }
        }
    }
    return null;
}

// ==========================================================================
// 3. PARSER CSV
// ==========================================================================
function parseCSV(text) {
    let lines = text.split(/\r?\n/);
    let headerIndex = 0;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].replace(/[;\s"]/g, '').length > 0) { headerIndex = i; break; }
    }
    if (headerIndex >= lines.length) return [];

    function splitCSVLine(line) {
        let result = []; let curVal = ''; let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            let char = line[i];
            if (char === '"') inQuotes = !inQuotes;
            else if (char === ';' && !inQuotes) { result.push(curVal); curVal = ''; } 
            else { curVal += char; }
        }
        result.push(curVal);
        return result.map(v => v.trim());
    }

    let headers = splitCSVLine(lines[headerIndex]);
    let result = [];
    for (let i = headerIndex + 1; i < lines.length; i++) {
        if (lines[i].replace(/[;\s"]/g, '').length === 0) continue; 
        let values = splitCSVLine(lines[i]);
        let obj = {};
        for (let j = 0; j < headers.length; j++) { obj[headers[j]] = values[j] !== undefined ? values[j] : ''; }
        result.push(obj);
    }
    return result;
}

// ==========================================================================
// 4. CARGA DE ARQUIVOS
// ==========================================================================
async function carregarArquivosAutomaticamente() {
    const arquivos = [
        { id: 'baseItens', url: '03 - Base_Itens.csv', statusId: 'status-base' },
        { id: 'compras', url: '01 - Compras.csv', statusId: 'status-compras' },
        { id: 'consumos', url: '02 - Consumos.csv', statusId: 'status-consumos' }
    ];

    let carregados = 0;
    const decoder = new TextDecoder('windows-1252'); 

    for (const arq of arquivos) {
        const elStatus = document.getElementById(arq.statusId);
        elStatus.innerText = `⏳ Buscando ${arq.url}...`;
        elStatus.className = 'status-item';

        try {
            const response = await fetch(arq.url, { cache: "no-store" });
            if (!response.ok) throw new Error(`Status ${response.status}`);
            
            const arrayBuffer = await response.arrayBuffer();
            const text = decoder.decode(arrayBuffer);
            bases[arq.id] = parseCSV(text);
            
            elStatus.innerText = `✅ ${arq.url} lido!`;
            elStatus.classList.add('status-ok');
            carregados++;
        } catch (error) {
            elStatus.innerText = `❌ Falha: ${arq.url}`;
            elStatus.classList.add('status-erro');
        }
    }

    if (carregados === 3) {
        mostrarToast("Data Lake conectado! Processando cruzamentos...", "success");
        setTimeout(processarInteligencia, 200);
    }
}

window.uploadManualMultiplo = function(event) {
    const files = event.target.files;
    let carregados = 0;
    const decoder = new TextDecoder('windows-1252');

    Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const text = decoder.decode(e.target.result);
            const nomeLower = file.name.toLowerCase();
            
            let alvoId = null;
            if (nomeLower.includes('base')) alvoId = 'baseItens';
            else if (nomeLower.includes('compras')) alvoId = 'compras';
            else if (nomeLower.includes('consumos')) alvoId = 'consumos';

            if (alvoId) {
                bases[alvoId] = parseCSV(text);
                document.getElementById(`status-${alvoId === 'baseItens' ? 'base' : alvoId}`).innerText = `✅ ${file.name}`;
                document.getElementById(`status-${alvoId === 'baseItens' ? 'base' : alvoId}`).classList.add('status-ok');
                carregados++;
                if(carregados === files.length) {
                    mostrarToast("Upload concluído. Cruzando dados...", "success");
                    processarInteligencia();
                }
            }
        };
        reader.readAsArrayBuffer(file);
    });
}

// ==========================================================================
// 5. MOTOR DE INTELIGÊNCIA
// ==========================================================================
function processarInteligencia() {
    if (bases.baseItens.length === 0) { mostrarToast("Erro: Arquivo Mestre não localizado.", "error"); return; }

    const colCod = ['cd item', 'cod produto', 'codigo', 'cod', 'item'];
    const colDesc = ['nome do item detalhado', 'nome do item resumido', 'nome produto', 'desc'];
    const colQtdSaldo = ['qt saldo atual', 'saldo livre', 'saldo']; 
    const colQtdConsumo = ['qt movimento', 'quantidade consumida', 'quantidade'];
    const colQtdCompra = ['quantidade', 'qtde', 'saldo aberto'];
    const colCusto = ['vl custo unitario atual', 'valor estimado', 'custo'];
    const colMin = ['qt minimo', 'minimo', 'min'];
    const colMax = ['qt maximo', 'maximo', 'max'];
    const colFilialId = ['cd filial']; 
    const colMesMovimento = ['mês movimento', 'mes movimento', 'mes', 'mês', 'periodo'];
    const colUM = ['cd unidade medida', 'un', 'um'];
    const colFilialNm = ['nm filial', 'filial'];
    const colGrupo = ['nm grupo', 'grupo', 'categoria'];
    const colClasse = ['nm classe', 'classe'];
    const colReparticao = ['cd reparticao', 'reparticao'];
    const colPrateleira = ['cd prateleira', 'prateleira'];
    const colDivisao = ['cd divisao', 'divisao'];

    const mapCompras = new Map();
    if(bases.compras.length > 0) {
        const c_cod = encontrarChave(bases.compras[0], colCod);
        const c_qtd = encontrarChave(bases.compras[0], colQtdCompra);
        bases.compras.forEach(item => {
            const cod = normalizarCod(item[c_cod]);
            const qtd = converterParaNumero(item[c_qtd]);
            if (cod) mapCompras.set(cod, (mapCompras.get(cod) || 0) + qtd);
        });
    }

    const ordemMeses = { 'janeiro':1, 'jan':1, 'fevereiro':2, 'fev':2, 'março':3, 'marco':3, 'mar':3, 'abril':4, 'abr':4, 'maio':5, 'mai':5, 'junho':6, 'jun':6, 'julho':7, 'jul':7, 'agosto':8, 'ago':8, 'setembro':9, 'set':9, 'outubro':10, 'out':10, 'novembro':11, 'nov':11, 'dezembro':12, 'dez':12 };
    let maxMesIdx = -1; let mesAlvo = null; let setMeses = new Set();
    
    let cs_mes = encontrarChave(bases.consumos[0], colMesMovimento);
    let cs_cod = encontrarChave(bases.consumos[0], colCod);
    let cs_filialId = encontrarChave(bases.consumos[0], colFilialId);
    let cs_qtd = encontrarChave(bases.consumos[0], colQtdConsumo);

    if(bases.consumos.length > 0 && cs_mes) {
        bases.consumos.forEach(item => {
            const mesStr = normalizarString(item[cs_mes]);
            if(mesStr) setMeses.add(mesStr);
            if (mesStr && ordemMeses[mesStr] !== undefined && ordemMeses[mesStr] > maxMesIdx) {
                maxMesIdx = ordemMeses[mesStr]; mesAlvo = mesStr;
            }
        });
    }

    mesesAnalisados = setMeses.size > 0 ? setMeses.size : 1; 
    mesConsumoAtual = mesAlvo ? mesAlvo.toUpperCase() : "MÊS";

    const mapConsumosTotais = new Map();
    if(bases.consumos.length > 0) {
        bases.consumos.forEach(item => {
            const mesStr = normalizarString(item[cs_mes]);
            if (mesAlvo && mesStr !== mesAlvo && ordemMeses[mesStr] !== undefined) return;

            const cod = normalizarCod(item[cs_cod]);
            const filialId = normalizarCod(item[cs_filialId]);
            const qtd = converterParaNumero(item[cs_qtd]);
            
            if (cod) {
                const chave = cod + '|' + filialId;
                mapConsumosTotais.set(chave, (mapConsumosTotais.get(chave) || 0) + qtd);
            }
        });
    }

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

    let baseSujaProcessada = bases.baseItens.map(item => {
        let codBruto = String(item[b_cod] || '').replace(/\./g, '');
        const codNorm = normalizarCod(codBruto);
        if(!codNorm) return null; 

        const saldo = converterParaNumero(item[b_saldo]);
        const minimo = converterParaNumero(item[b_min]);
        const maximo = converterParaNumero(item[b_max]);

        if (saldo === 0 && minimo === 0 && maximo === 0) return null;

        const desc = item[b_desc] || "Item sem Descrição";
        const custoUnitario = converterParaNumero(item[b_custo]);
        const filialIdBase = normalizarCod(item[b_filialId]);
        const grupo = item[b_grupo] || '';
        const classe = item[b_classe] || '';
        const reparticao = item[b_rep] || '-';
        const prateleira = item[b_prat] || '-';
        const divisao = item[b_div] || '-';
        const filialNm = item[b_filialNm] || '';
        const um = item[b_um] || 'UN';
        
        const transito = mapCompras.get(codNorm) || 0;
        const chaveAmarracao = codNorm + '|' + filialIdBase;
        const consumoTotalAbsoluto = Math.abs(mapConsumosTotais.get(chaveAmarracao)) || 0;
        const consumoMedioMensal = Math.round(consumoTotalAbsoluto / mesesAnalisados);

        const valorImobilizado = saldo * custoUnitario;

        let diasGiro = 0;
        if (consumoMedioMensal > 0) diasGiro = Math.round((saldo / consumoMedioMensal) * 30);
        else if (saldo > 0) diasGiro = Infinity;

        let status = 'Estoque Normal'; let statusBadge = 'badge-normal';
        if (saldo <= 0 && transito <= 0) { status = 'Ruptura Crítica (Sem Pedido)'; statusBadge = 'badge-ruptura-critica'; } 
        else if (saldo <= 0 && transito > 0) { status = 'Ruptura (Em Trânsito)'; statusBadge = 'badge-ruptura-transito'; } 
        else if (saldo > 0 && consumoMedioMensal <= 0) { status = 'Obsoleto (Sem Consumo)'; statusBadge = 'badge-obsoleto'; }
        else if (saldo > 0 && minimo > 0 && saldo < minimo) { status = 'Abaixo Mínimo'; statusBadge = 'badge-abaixo'; }
        else if (saldo > maximo && maximo > 0) { status = 'Excesso Estoque'; statusBadge = 'badge-acima'; }

        const searchString = (codNorm + " " + normalizarString(desc) + " " + normalizarString(grupo) + " " + normalizarString(classe) + " rep " + reparticao + " prat " + prateleira + " div " + divisao).toLowerCase();

        return {
            cod: codBruto, codNorm: codNorm, desc: desc,
            saldo: saldo, minimo: minimo, maximo: maximo,
            custo: custoUnitario, transito: transito, consumo: consumoMedioMensal,
            diasGiro: diasGiro,
            um: um, filial: filialNm, grupo: grupo, classe: classe, 
            reparticao: reparticao, prateleira: prateleira, divisao: divisao,
            valorImobilizado: valorImobilizado,
            status: status, statusBadge: statusBadge, curva: 'C',
            searchString: searchString
        };
    }).filter(i => i !== null);

    if(baseSujaProcessada.length === 0) return;

    baseSujaProcessada.sort((a, b) => b.consumo - a.consumo);
    const consumoTotalGlobal = baseSujaProcessada.reduce((acc, curr) => acc + curr.consumo, 0);
    let consumoAcumulado = 0;

    baseSujaProcessada.forEach(item => {
        if (consumoTotalGlobal > 0 && item.consumo > 0) {
            consumoAcumulado += item.consumo;
            const perc = consumoAcumulado / consumoTotalGlobal;
            if (perc <= 0.80) item.curva = 'A';
            else if (perc <= 0.95) item.curva = 'B';
            else item.curva = 'C';
        } else { item.curva = 'C'; }
    });

    itensProcessados = baseSujaProcessada;
    dispararFiltrosSemAtraso();
}

// ==========================================================================
// 6. FILTROS E DEBOUNCE OTIMIZADOS
// ==========================================================================
let timerBusca;
function dispararFiltrosDebounce() {
    clearTimeout(timerBusca);
    timerBusca = setTimeout(dispararFiltrosSemAtraso, 300); 
}

window.dispararFiltros = function() { dispararFiltrosSemAtraso(); } 

function dispararFiltrosSemAtraso() {
    const termo = normalizarString(document.getElementById('busca')?.value);
    const statusFiltro = document.getElementById('select-saldo-status').value;
    const curvaFiltro = document.getElementById('select-curva').value;

    itensFiltrados = itensProcessados.filter(i => {
        const bateTermo = !termo || i.searchString.includes(termo);
        const bateCurva = !curvaFiltro || i.curva === curvaFiltro;
        const bateStatus = !statusFiltro || i.status === statusFiltro;
        return bateTermo && bateCurva && bateStatus;
    });

    if (vistaAtual === 'pesquisa') renderizarPesquisa();
    else renderizarDashboard();
}

window.limparFiltroGrafico = function(tipo) {
    if (tipo === 'abc') { filtroGraficoABC = null; document.getElementById('filtro-abc-aviso').style.display = 'none'; }
    if (tipo === 'status') { filtroGraficoStatus = null; document.getElementById('filtro-status-aviso').style.display = 'none'; }
    renderizarTabelaDashboard(); 
}

window.limparFiltros = function() {
    document.getElementById('select-curva').value = "";
    document.getElementById('select-saldo-status').value = "";
    document.getElementById('busca').value = "";
    filtroGraficoABC = null; filtroGraficoStatus = null;
    document.getElementById('filtro-abc-aviso').style.display = 'none';
    document.getElementById('filtro-status-aviso').style.display = 'none';
    dispararFiltrosSemAtraso();
}

// ==========================================================================
// 7. RENDERIZAÇÃO DOM
// ==========================================================================
function renderizarPesquisa() {
    const container = document.getElementById('resultados');
    document.getElementById('contador-itens').innerText = `${itensFiltrados.length} itens encontrados.`;
    
    let htmlLote = [];
    
    itensFiltrados.slice(0, 100).forEach(i => { 
        let giroText = i.diasGiro === Infinity ? 'Sem Giro' : `${i.diasGiro} dias`;
        let giroClass = i.diasGiro === Infinity ? 'metric-giro' : 'metric-default';

        htmlLote.push(`
            <div class="item-card fade-in">
                <div class="item-media">
                    <div class="abc-badge curva-${i.curva}">${i.curva}</div>
                    <div class="item-image-container">
                        <img src="imagens/${i.cod} - 01.jpg" alt="Foto ${i.cod}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                        <div class="img-placeholder" style="display:none;">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:5px;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                            SEM<br>FOTO
                        </div>
                    </div>
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
                            ${i.minimo > 0 || i.maximo > 0 ? `<span class="chip-category" style="color:var(--text-info); border-color:var(--border-color);">Min: ${i.minimo} / Max: ${i.maximo}</span>` : ''}
                        </div>
                        <div class="item-metrics-grid">
                            <div class="metric-box metric-saldo"><span class="metric-label">Saldo Atual</span><span class="metric-value">${i.saldo}</span></div>
                            <div class="metric-box ${i.transito > 0 ? 'metric-transito' : 'metric-default'}"><span class="metric-label">Em Trânsito</span><span class="metric-value">${i.transito}</span></div>
                            <div class="metric-box metric-default"><span class="metric-label" style="color: var(--primary-color);">Consumo (${mesConsumoAtual})</span><span class="metric-value">${i.consumo}</span></div>
                            <div class="metric-box ${giroClass}"><span class="metric-label">Dias de Cobertura</span><span class="metric-value">${giroText}</span></div>
                            <div class="metric-box metric-default"><span class="metric-label">Capital Travado</span><span class="metric-value">${i.valorImobilizado > 0 ? formatarMoeda(i.valorImobilizado) : 'R$ 0,00'}</span></div>
                        </div>
                    </div>
                    <div class="item-footer">
                        <div class="item-address"><span class="item-address-icon">📍</span><span>Repartição <strong>${i.reparticao}</strong> &nbsp;•&nbsp; Prateleira <strong>${i.prateleira}</strong> &nbsp;•&nbsp; Divisão <strong>${i.divisao}</strong></span></div>
                        ${i.filial ? `<div class="item-filial">🏢 ${i.filial}</div>` : ''}
                    </div>
                </div>
            </div>
        `);
    });
    
    container.innerHTML = htmlLote.join('');
}

function renderizarDashboard() {
    let valorTotal = 0, valorObsoleto = 0, qtdObsoleto = 0;
    let qtdRupturaCritica = 0, qtdRupturaTransito = 0;
    let qtdRiscoMinimo = 0, qtdExcesso = 0;
    let totalSaldoFinanceiro = 0, totalConsumoMensalFinanceiro = 0;
    let totalSaldoFisico = 0, totalConsumoFisico = 0;
    let skusAtivos = 0; 

    itensFiltrados.forEach(i => {
        valorTotal += i.valorImobilizado;
        totalSaldoFinanceiro += i.valorImobilizado;
        totalConsumoMensalFinanceiro += (i.consumo * i.custo);
        totalSaldoFisico += i.saldo;
        totalConsumoFisico += i.consumo;
        if (i.saldo > 0) skusAtivos++;

        if (i.status === 'Ruptura Crítica (Sem Pedido)') qtdRupturaCritica++;
        if (i.status === 'Ruptura (Em Trânsito)') qtdRupturaTransito++;
        if (i.status === 'Obsoleto (Sem Consumo)') { valorObsoleto += i.valorImobilizado; qtdObsoleto++; }
        if (i.status === 'Abaixo Mínimo') qtdRiscoMinimo++;
        if (i.status === 'Excesso Estoque') qtdExcesso++;
    });

    let giroAnual = 0;
    if (totalSaldoFinanceiro > 0) giroAnual = ((totalConsumoMensalFinanceiro * 12) / totalSaldoFinanceiro).toFixed(1);
    let coberturaMediaFisica = 0;
    if (totalConsumoFisico > 0) coberturaMediaFisica = Math.round((totalSaldoFisico / totalConsumoFisico) * 30);

    document.getElementById('dash-kpi-valor-total').innerText = formatarMoeda(valorTotal);
    document.getElementById('dash-kpi-total-itens').innerText = `Em ${itensFiltrados.length} itens`;
    document.getElementById('dash-kpi-giro-anual').innerText = `${giroAnual}x`;
    document.getElementById('dash-kpi-giro-medio').innerText = totalConsumoFisico > 0 ? `${coberturaMediaFisica} dias` : 'Sem Giro';
    document.getElementById('dash-kpi-ruptura-critica').innerText = qtdRupturaCritica;
    document.getElementById('dash-kpi-risco-minimo').innerText = qtdRiscoMinimo;
    document.getElementById('dash-kpi-excesso').innerText = qtdExcesso;
    document.getElementById('dash-kpi-ruptura-transito').innerText = qtdRupturaTransito;
    document.getElementById('dash-kpi-valor-obsoleto').innerText = formatarMoeda(valorObsoleto);
    document.getElementById('dash-kpi-obsoleto-qtd').innerText = `${qtdObsoleto} itens`;
    document.getElementById('dash-kpi-skus-ativos').innerText = skusAtivos;
    document.getElementById('dash-kpi-volume-fisico').innerText = totalSaldoFisico.toLocaleString('pt-BR');
    document.getElementById('dash-kpi-consumo-fisico').innerText = totalConsumoFisico.toLocaleString('pt-BR');
    document.getElementById('dash-kpi-total-itens-proc').innerText = itensProcessados.length;

    atualizarGraficos(); 
    renderizarTabelaDashboard(); 
}

function renderizarTabelaDashboard() {
    const tbody = document.getElementById('dash-table-body');
    let htmlLote = [];
    
    let itensTabela = itensFiltrados;

    if (filtroGraficoABC) {
        itensTabela = itensTabela.filter(i => i.curva === filtroGraficoABC);
        document.getElementById('filtro-abc-aviso').style.display = 'inline-block';
        document.getElementById('filtro-abc-aviso').innerText = `✖ Filtro ABC: Curva ${filtroGraficoABC}`;
    } else { document.getElementById('filtro-abc-aviso').style.display = 'none'; }

    if (filtroGraficoStatus) {
        if (filtroGraficoStatus === 'Ruptura') itensTabela = itensTabela.filter(i => i.status.includes('Ruptura')); 
        else if (filtroGraficoStatus === 'Obsoleto') itensTabela = itensTabela.filter(i => i.status.includes('Obsoleto'));
        else itensTabela = itensTabela.filter(i => i.status === filtroGraficoStatus);
        
        document.getElementById('filtro-status-aviso').style.display = 'inline-block';
        document.getElementById('filtro-status-aviso').innerText = `✖ Filtro Status: ${filtroGraficoStatus}`;
    } else { document.getElementById('filtro-status-aviso').style.display = 'none'; }

    itensTabela.slice(0, 50).forEach(i => { 
        let giroText = i.diasGiro === Infinity ? 'Obsoleto' : `${i.diasGiro}d`;
        htmlLote.push(`
            <tr class="fade-in">
                <td><div class="abc-badge curva-${i.curva}" style="width:28px; height:28px; font-size:13px; position:static; box-shadow:none;">${i.curva}</div></td>
                <td><strong style="color:var(--primary-color);">#${i.cod}</strong><br><span style="font-size:11px;color:var(--text-secondary); font-weight:500;">${i.desc}</span></td>
                <td style="font-size:11px; font-weight:600; color:var(--text-info);">Rep ${i.reparticao} | Prat ${i.prateleira} | Div ${i.divisao}</td>
                <td style="font-size:14px; font-weight:800; color:var(--text-primary);">${i.saldo}</td>
                <td style="color:var(--text-primary); font-weight:600;">${i.consumo}</td>
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

    const ctxABC = document.getElementById('chartABC').getContext('2d');
    const ctxStatus = document.getElementById('chartStatus').getContext('2d');
    
    const styles = getComputedStyle(document.body);
    const fontColor = styles.getPropertyValue('--text-primary').trim();
    const gridColor = styles.getPropertyValue('--border-color').trim();
    
    const corA = '#10b981'; // Success Green 
    const corB = '#0ea5e9'; // Info Blue
    const corC = '#64748b'; // Secondary Slate

    const contagemStatus = { Normal: 0, Risco: 0, Excesso: 0, RupturaCritica: 0, Obsoleto: 0 };
    const volumeABC = { A: 0, B: 0, C: 0 };

    itensFiltrados.forEach(i => {
        if(volumeABC[i.curva] !== undefined) volumeABC[i.curva] += i.consumo; 
        if(i.status === 'Estoque Normal') contagemStatus.Normal++;
        else if(i.status === 'Abaixo Mínimo') contagemStatus.Risco++;
        else if(i.status === 'Excesso Estoque') contagemStatus.Excesso++;
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
                borderWidth: 0, hoverOffset: 6
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
            plugins: { title: { display: true, text: `Volume Físico Consumo (${mesConsumoAtual})`, font: { size: 14, weight: '800' } }, legend: { position: 'bottom', labels: { boxWidth: 12, usePointStyle: true } } },
            cutout: '75%'
        }
    });

    const rotulosGraficoBarra = ['Estoque Normal', 'Abaixo Mínimo', 'Excesso Estoque', 'Ruptura', 'Obsoleto'];

    chartStatusInstance = new Chart(ctxStatus, {
        type: 'bar',
        data: {
            labels: ['Normal', 'Risco (Min)', 'Excesso', 'Rupturas', 'Obsoletos'],
            datasets: [{ 
                label: 'Itens', 
                data: [contagemStatus.Normal, contagemStatus.Risco, contagemStatus.Excesso, contagemStatus.RupturaCritica, contagemStatus.Obsoleto], 
                backgroundColor: [corA, '#f59e0b', '#0284c7', '#ef4444', corC], borderRadius: 6, borderSkipped: false
            }]
        },
        options: { 
            responsive: true, maintainAspectRatio: false, 
            onClick: (event, activeElements) => {
                if(activeElements.length > 0) {
                    const statusEscolhido = rotulosGraficoBarra[activeElements[0].index];
                    filtroGraficoStatus = (filtroGraficoStatus === statusEscolhido) ? null : statusEscolhido;
                    renderizarTabelaDashboard(); 
                }
            },
            onHover: (event, chartElement) => { event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default'; },
            plugins: { legend: { display: false }, title: { display: true, text: 'Distribuição de Status (Quantidade de Itens)', font: { size: 14, weight: '800' } } },
            scales: { y: { beginAtZero: true, grid: { color: gridColor }, border: { display: false } }, x: { grid: { display: false }, border: { display: false } } }
        }
    });
}