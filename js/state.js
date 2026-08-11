export const bases = { baseItens: [], compras: [], consumos: [] };
export let itensProcessados = [];
export let itensFiltrados = [];
export let ordesAtivasFiltradas = [];

export let vistaAtual = 'dashboard';
export let chartABCInstance = null;
export let chartStatusInstance = null;
export let chartFiliaisInstance = null;
export let mesesAnalisados = 1; 
export let filtroGraficoABC = null; 
export let filtroGraficoStatus = null;
export let filtroGraficoFilial = null;
export let mesConsumoAtual = "MÊS";
export let isFetchingData = false; 
export let loaderProgress = 0;

export let imagensMapeadas = new Set();
export let mapeamentoDeImagemAtivo = false;
export let setLocaisUnicos = new Set(); 
export let setStatusOFUnicos = new Set();

export let ocultarValoresFinanceiros = true; 

export let currentLightboxImages = [];
export let currentLightboxIndex = 0;

if (typeof Chart !== 'undefined') Chart.defaults.font.family = "'Inter', system-ui, sans-serif";