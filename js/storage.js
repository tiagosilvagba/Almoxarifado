import { bases, isFetchingData, imagensMapeadas, mapeamentoDeImagemAtivo, itensProcessados } from './state.js';
import { setProgress, fecharLoader, mostrarErroLoaderFatal, mostrarToast } from './loader.js';
import { parseCSVFast, normalizarCod } from './utils.js';
import { processarInteligencia } from './engine.js';
import { dispararFiltrosSemAtraso } from './filters.js';

export async function carregarArquivosAutomaticamente() {
    if (window.isFetchingData) return; 
    window.isFetchingData = true;

    const loader = document.getElementById('tech-loader');
    if (loader) { loader.style.display = 'flex'; loader.style.opacity = '1'; }
    
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
        
        try {
            const response = await fetch(arq.url, { cache: "no-store" });
            if (!response.ok) throw new Error(`Arquivo não encontrado (Erro HTTP ${response.status}).`);
            
            const arrayBuffer = await response.arrayBuffer();
            const text = decoder.decode(arrayBuffer);
            
            setProgress(15 + (i*20), `Extraindo dados de ${arq.url}...`);
            bases[arq.id] = parseCSVFast(text);
            
            setProgress(30 + (i*20), `✓ ${arq.url} (Lido com Sucesso)`, 'success');
            carregados++;
        } catch (error) {
            setProgress(window.loaderProgress, `[ERRO ${arq.url}] ${error.message}`, 'error');
            errosCriticos = true;
        }
    }

    if (carregados === 3) {
        setProgress(90, "Modelos carregados. Iniciando consolidação...", 'success');
        setTimeout(processarInteligencia, 500);
    } else if (errosCriticos) {
        setProgress(window.loaderProgress, "Leitura automática interrompida. Faça o Upload Manual.", 'warning');
        mostrarErroLoaderFatal();
        window.isFetchingData = false;
    }
}

window.uploadManualMultiplo = function(event) {
    if (window.isFetchingData) return;
    window.isFetchingData = true;

    document.getElementById('btn-fallback').style.display = 'none';
    document.getElementById('tech-loader').style.display = 'flex';
    document.getElementById('tech-loader').style.opacity = '1';
    document.getElementById('loader-logs').innerHTML = '';
    setProgress(10, "Processando arquivos manuais...");

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
                setProgress(20 + (idx*20), `✓ ${file.name} Importado.`, 'success');
                carregados++;
                if(carregados === files.length) {
                    setProgress(90, "Iniciando Inteligência...", 'success');
                    setTimeout(processarInteligencia, 500);
                }
            }
        };
        reader.readAsArrayBuffer(file);
    });
    if (files.length === 0) { window.isFetchingData = false; fecharLoader(); }
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
            imagensMapeadas.add(normalizarCod(codBruto));
            count++;
        }
    }
    window.mapeamentoDeImagemAtivo = true;

    if (itensProcessados.length > 0) {
        itensProcessados.forEach(item => { item.temImagem = imagensMapeadas.has(item.codNorm); });
        dispararFiltrosSemAtraso();
    }
    mostrarToast(`Sucesso: ${count} imagens mapeadas!`, "success");
}

window.carregarArquivosAutomaticamente = carregarArquivosAutomaticamente;