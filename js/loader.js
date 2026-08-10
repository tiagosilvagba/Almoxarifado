import { state } from './state.js';
import { parseCSVFast, normalizarCod, mostrarToast } from './utils.js';
import { processarInteligencia } from './estoque.js';

export function setProgress(percent, msg, type='info') {
    state.loaderProgress = percent;
    const bar = document.getElementById('loader-bar');
    const text = document.getElementById('loader-percent');
    if(bar) bar.style.width = `${percent}%`;
    if(text) text.innerText = `${Math.round(percent)}%`;
    if(msg) addLog(msg, type);
}

export function addLog(msg, type='info') {
    const logs = document.getElementById('loader-logs');
    if(logs) {
        let classe = type === 'error' ? 'class="error"' : type === 'success' ? 'class="success"' : type === 'warning' ? 'class="warning"' : '';
        logs.innerHTML += `<div ${classe}>> ${msg}</div>`;
        logs.scrollTop = logs.scrollHeight;
    }
}

export function mostrarErroLoaderFatal() {
    const btn = document.getElementById('btn-fallback');
    if(btn) btn.style.display = 'block';
}

export function fecharLoader() {
    const loader = document.getElementById('tech-loader');
    const app = document.getElementById('app-layout');
    if(loader && app) {
        loader.style.opacity = '0';
        app.style.opacity = '1';
        setTimeout(() => loader.style.display = 'none', 600);
    }
}

export async function carregarArquivosAutomaticamente() {
    if (state.isFetchingData) return; 
    state.isFetchingData = true;

    const loader = document.getElementById('tech-loader');
    if (loader) { loader.style.display = 'flex'; loader.style.opacity = '1'; }
    
    const btnFallback = document.getElementById('btn-fallback');
    if (btnFallback) btnFallback.style.display = 'none';
    
    const logs = document.getElementById('loader-logs');
    if (logs) logs.innerHTML = '';
    
    setProgress(5, "Iniciando sincronização via Fetch API...");

    const arquivos = [
        { id: 'baseItens', url: '03 - Base_Itens.csv' },
        { id: 'compras', url: '01 - Compras.csv' },
        { id: 'consumos', url: '02 - Consumos.csv' }
    ];

    let carregados = 0;
    let errosCriticos = false;
    const decoder = new TextDecoder('windows-1252'); 

    for (let i = 0; i < arquivos.length; i++) {
        const arq = arquivos[i];
        setProgress(10 + (i*20), `Buscando arquivo: ${arq.url}...`);
        await new Promise(r => setTimeout(r, 100)); 
        
        try {
            if (typeof Papa === 'undefined') throw new Error("Biblioteca PapaParse offline.");
            
            const response = await fetch(arq.url, { cache: "no-store" });
            if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
            
            const arrayBuffer = await response.arrayBuffer();
            const text = decoder.decode(arrayBuffer);
            
            setProgress(15 + (i*20), `Extraindo dados de ${arq.url}...`);
            await new Promise(r => setTimeout(r, 50)); 
            
            state.bases[arq.id] = parseCSVFast(text);
            
            setProgress(30 + (i*20), `✓ ${arq.url} (Lido com Sucesso)`, 'success');
            carregados++;
        } catch (error) {
            setProgress(state.loaderProgress, `[ERRO ${arq.url}] ${error.message}`, 'error');
            errosCriticos = true;
        }
    }

    if (carregados === 3) {
        setProgress(90, "Modelos carregados. Iniciando consolidação...", 'success');
        setTimeout(processarInteligencia, 500);
    } else if (errosCriticos) {
        setProgress(state.loaderProgress, "Erro de sincronização. Utilize o botão de Upload Manual.", 'warning');
        mostrarErroLoaderFatal();
        state.isFetchingData = false;
    }
}

export function uploadManualMultiplo(event) {
    if (state.isFetchingData) return;
    state.isFetchingData = true;

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
                state.bases[alvoId] = parseCSVFast(text);
                setProgress(20 + (idx*20), `✓ ${file.name} Importado.`, 'success');
                carregados++;
                if (carregados === files.length) {
                    setProgress(90, "Todos os arquivos manuais carregados. Processando...", 'success');
                    setTimeout(processarInteligencia, 500);
                }
            }
        };
        reader.readAsArrayBuffer(file);
    });
    
    if (files.length === 0) { state.isFetchingData = false; fecharLoader(); }
}

export function mapearImagensPasta(event) {
    const files = event.target.files;
    if (files.length === 0) return;
    let count = 0;
    state.imagensMapeadas.clear();

    for (let i = 0; i < files.length; i++) {
        let fileName = files[i].name.toLowerCase();
        if (fileName.includes(' - 01.') || fileName.includes(' - 02.') || fileName.includes(' - 03.') || fileName.includes(' - 04.') || fileName.includes(' - 05.') || fileName.includes(' - 06.')) {
            let codBruto = fileName.split(' - ')[0];
            let codNorm = normalizarCod(codBruto);
            state.imagensMapeadas.add(codNorm);
            count++;
        }
    }
    state.mapeamentoDeImagemAtivo = true;

    if (state.itensProcessados.length > 0) {
        state.itensProcessados.forEach(item => { item.temImagem = state.imagensMapeadas.has(item.codNorm); });
        window.dispararFiltrosSemAtraso();
    }
    mostrarToast(`Sucesso: ${count} imagens mapeadas!`, "success");
}