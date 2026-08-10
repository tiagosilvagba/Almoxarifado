export const state = {
    bases: { baseItens: [], compras: [], consumos: [] },
    itensProcessados: [],
    itensFiltrados: [],
    ordesAtivasFiltradas: [],
    vistaAtual: 'dashboard',
    
    chartABCInstance: null,
    chartStatusInstance: null,
    chartFiliaisInstance: null,

    filtroGraficoABC: null,
    filtroGraficoStatus: null,
    filtroGraficoFilial: null,

    mesConsumoAtual: "MÊS",
    isFetchingData: false,
    loaderProgress: 0,

    imagensMapeadas: new Set(),
    mapeamentoDeImagemAtivo: false,
    setLocaisUnicos: new Set(),
    setStatusOFUnicos: new Set(),

    ocultarValoresFinanceiros: true,

    currentLightboxImages: [],
    currentLightboxIndex: 0
};