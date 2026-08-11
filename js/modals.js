import { itensProcessados, ordesAtivasFiltradas, mapeamentoDeImagemAtivo, imagensMapeadas } from './state.js';
import { normalizarCod, encontrarChave, converterParaNumero, formatarMoedaMask } from './utils.js';
import { mostrarToast } from './loader.js';

let currentLightboxImages = [];
let currentLightboxIndex = 0;

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
        if (event.key === 'ArrowRight') window.navegarLightbox(1);
        if (event.key === 'ArrowLeft') window.navegarLightbox(-1);
        if (event.key === 'Escape') window.fecharLightbox();
    }
});

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
                    <div class="metric-box metric-default"><span class="metric-label">Custo Unitário</span><span class="metric-value">${formatarMoedaMask(item.custoUnitario, window.ocultarValoresFinanceiros)}</span></div>
                    <div class="metric-box metric-default"><span class="metric-label">Valor Imobilizado</span><span class="metric-value">${formatarMoedaMask(item.valorImobilizado, window.ocultarValoresFinanceiros)}</span></div>
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
    const of = ordesAtivasFiltradas.find(o => o.of === ofId && normalizarCod(o.codProd) === codNorm);
    const item = itensProcessados.find(i => i.codNorm === codNorm);

    if (!of || !item) {
        mostrarToast("Erro: Detalhes da OF ou do Item não encontrados.", "error");
        return;
    }

    let linha = of.linhaOriginal || {};

    const getC = (nomesArray) => {
        let ch = encontrarChave(linha, nomesArray);
        let val = ch ? linha[ch] : '';
        return val && String(val).trim() !== '' ? String(val).trim() : '-';
    };

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

    const content = `
        <div class="modal-header-section" style="border-bottom:none; padding-bottom:0;">
            <div style="flex-grow: 1;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div>
                        <h2 style="font-size: 20px; font-weight: 800; color: var(--text-primary); margin-bottom: 8px;">
                            Raio-X da Ordem: <span style="color: var(--primary-color);">${of.of !== '-' ? of.of : of.sc}</span>
                        </h2>
                        <h3 style="font-size: 14px; font-weight: 600; color: var(--text-secondary); margin-bottom: 20px;">
                            Item: #${of.codProd} - ${of.descProd}
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
        
        <div style="text-align: center; padding: 20px 10px 10px; margin-top: 15px; border-top: 1px solid var(--border-color);">
            <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 15px;">Deseja aprofundar a análise de consumo, curva financeira e locais físicos deste item?</p>
            <button class="theme-btn active" onclick="abrirModalDetalhes('${item.codNorm}', '${item.filialIdBase}')" style="padding: 12px 24px; font-size: 14px; margin: 0 auto; border-radius: 8px;">
                Abrir Contexto Analítico do Item
            </button>
        </div>
    `;

    document.getElementById('modal-body-content').innerHTML = content;
    document.getElementById('modal-item').style.display = 'flex';
};

window.fecharModal = function() {
    document.getElementById('modal-item').style.display = 'none';
    document.getElementById('modal-body-content').innerHTML = ''; 
};

document.getElementById('modal-item').addEventListener('click', function(e) {
    if (e.target === this) window.fecharModal();
});