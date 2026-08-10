import { state } from './state.js';

export function normalizarString(val) { 
    return String(val || '').normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); 
}

export function normalizarCod(val) { 
    return String(val || '').toLowerCase().replace(/\./g, '').replace(/[^a-z0-9-]/g, '').replace(/^0+/, ''); 
}

export function converterParaNumero(val) {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return val;
    let str = String(val).trim().replace(/[R$\s]/g, '');
    if (str.includes(',')) str = str.replace(/\./g, '').replace(',', '.');
    let floatVal = parseFloat(str);
    return isNaN(floatVal) ? 0 : floatVal;
}

export function encontrarChave(objRef, termosChave) {
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

export function formatarMoeda(valor) { 
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); 
}

export function formatarMoedaMask(valor) {
    if (state.ocultarValoresFinanceiros) return 'R$ ***';
    return formatarMoeda(valor);
}

export function mostrarToast(mensagem, tipo = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    toast.innerText = mensagem;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 5000);
}

export function parseCSVFast(text) {
    let lines = text.split(/\r?\n/);
    let headerIndex = 0;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].replace(/[;\s"]/g, '').length > 0) { headerIndex = i; break; }
    }
    let validText = lines.slice(headerIndex).join('\n');
    let result = Papa.parse(validText, { header: true, skipEmptyLines: true, dynamicTyping: false });
    return result.data;
}