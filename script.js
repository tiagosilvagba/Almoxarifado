"use strict";
const PREVIOUS_BOOTSTRAP="https://cdn.jsdelivr.net/gh/tiagosilvagba/Almoxarifado@bb6ede30b8e351bf50734aa84a3ed28e12b5bb1c/script.js";
const PREVIOUS_BOOTSTRAP_FALLBACK="https://fastly.jsdelivr.net/gh/tiagosilvagba/Almoxarifado@bb6ede30b8e351bf50734aa84a3ed28e12b5bb1c/script.js";
const RESPONSIVE_LAYOUT_MODULE="./responsive-layout.js?v=20260914-2";
const GITHUB_COMMIT_QUEUE_MODULE="./github-commit-queue.js?v=20260914-1";
const PAGE_SNAPSHOT_PDF_MODULE="./page-snapshot-pdf.js?v=20260914-1";
const SALDO_UPDATE_TIME_MODULE="./saldo-update-time.js?v=20260914-2";
const COMPARATIVO_META_MODULE="./comparativo-meta.js?v=20260914-1";
const LAYOUT_FIX_MODULE="./layout-fix.js?v=20260914-3";
const COMPARATIVO_PERIODOS_MODULE="./comparativo-periodos.js?v=20260914-2";
const COMPARATIVO_EXCEL_MODULE="./comparativo-excel-padrao.js?v=20260914-3";
const COMPARATIVO_ITEM_SPLIT_MODULE="./comparativo-item-split.js?v=20260914-2";
const COMPARATIVO_META_VISUAL_MODULE="./comparativo-meta-visual.js?v=20260914-2";
const COMPARATIVO_INCLUSOES_MODULE="./comparativo-inclusoes.js?v=20260914-3";
const COMPARATIVO_CARDS_RESUMO_MODULE="./comparativo-cards-resumo.js?v=20260914-2";
const COMPARATIVO_MES_A_MES_MODULE="./comparativo-mes-a-mes.js?v=20260914-6";
const COMPARATIVO_ESCALA_MIL_MODULE="./comparativo-escala-mil.js?v=20260914-2";
const AREA_FILTER_ACTIVE_MODULE="./area-filter-active.js?v=20260914-1";
const GITHUB_PHOTO_UPLOAD_MODULE="./github-photo-upload-v2.js?v=20260914-1";
const CURRENT_PUBLIC_VERSION="Versão 5.3";

/*
 * A aplicação-base processa os CSVs em um Web Worker. O fetch sobrescrito na janela
 * não existe dentro do Worker, portanto a descoberta das partes de Compras não pode
 * depender da API do GitHub. Interceptamos somente a mensagem de inicialização do
 * worker de inventário e entregamos um manifesto com URLs do próprio GitHub Pages.
 */
(function installWorkerDataTransport(){
  if(window.__almoxWorkerDataTransportInstalled || typeof Worker!=="function")return;
  window.__almoxWorkerDataTransportInstalled=true;
  const originalPostMessage=Worker.prototype.postMessage;
  const purchaseParts=[
    "01 - Compras_Almox_Parte_01.CSV",
    "01 - Compras_Almox_Parte_02.CSV",
    "01 - Compras_Almox_Parte_03.CSV",
    "01 - Compras_Almox_Parte_04.CSV"
  ];
  Worker.prototype.postMessage=function(message,...rest){
    let next=message;
    try{
      if(message && typeof message==="object" && message.saldoUrl && message.comprasApiUrl && message.replenishmentUrl){
        const entries=purchaseParts.map((name)=>({
          name,
          type:"file",
          download_url:new URL(name,document.baseURI).href
        }));
        const manifest=`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(entries))}`;
        next={...message,comprasApiUrl:manifest,commitsApiUrl:""};
      }
    }catch(error){
      console.warn("Não foi possível preparar o manifesto local de Compras.",error);
    }
    return originalPostMessage.call(this,next,...rest);
  };
})();

/* Fallback usado pelos módulos executados na janela. Não interfere no Web Worker. */
(function installRepositoryFallback(){
  if(window.__almoxRepositoryFallbackInstalled)return;
  window.__almoxRepositoryFallbackInstalled=true;
  const nativeFetch=window.fetch.bind(window);
  const apiPattern=/^https:\/\/api\.github\.com\/repos\/tiagosilvagba\/Almoxarifado\/contents(?:\?ref=main)?$/i;
  const months=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  async function fileExists(name){
    const url=`./${encodeURIComponent(name).replace(/%2F/gi,"/")}`;
    try{const h=await nativeFetch(url,{method:"HEAD",cache:"no-store"});if(h.ok)return true;if(![405,501].includes(h.status))return false}catch{}
    try{const g=await nativeFetch(url,{method:"GET",cache:"no-store",headers:{Range:"bytes=0-0"}});return g.ok||g.status===206}catch{return false}
  }
  async function discover(){
    const c=["00 - Saldo_Online.csv","01 - Compras_Almox.csv","02 - Responsaveis_Reposição.CSV","03 - Consumo.csv"];
    for(let p=1;p<=20;p++)c.push(`01 - Compras_Almox_Parte_${String(p).padStart(2,"0")}.CSV`);
    const y=new Date().getFullYear();
    for(let yr=y-3;yr<=y+1;yr++)for(const m of months)c.push(`01 - Estoque_${m}_${yr}.csv`);
    const u=[...new Set(c)],f=[];
    for(let i=0;i<u.length;i+=8){
      const r=await Promise.all(u.slice(i,i+8).map(async name=>({name,exists:await fileExists(name)})));
      for(const x of r)if(x.exists)f.push({name:x.name,path:x.name,type:"file",sha:"same-origin-discovery",download_url:new URL(x.name,document.baseURI).href});
    }
    return f;
  }
  window.fetch=async function(input,init){
    const url=typeof input==="string"?input:input?.url||"";
    if(!apiPattern.test(url))return nativeFetch(input,init);
    try{const r=await nativeFetch(input,init);if(r.ok)return r}catch{}
    return new Response(JSON.stringify(await discover()),{status:200,headers:{"Content-Type":"application/json; charset=utf-8","X-Almoxarifado-Fallback":"same-origin-full-data-discovery"}});
  };
})();

function loadIncrementalScript(src,timeoutMs=12000){
  return new Promise((resolve,reject)=>{
    const s=document.createElement("script");
    let settled=false;
    const finish=(ok,error)=>{
      if(settled)return;
      settled=true;
      clearTimeout(timer);
      s.onload=null;s.onerror=null;
      if(!ok)s.remove();
      ok?resolve():reject(error||new Error(`Falha ao carregar ${src}`));
    };
    const timer=setTimeout(()=>finish(false,new Error(`Tempo esgotado ao carregar ${src}`)),timeoutMs);
    s.src=src;s.async=false;s.onload=()=>finish(true);s.onerror=()=>finish(false,new Error(`Falha ao carregar ${src}`));
    document.head.appendChild(s);
  });
}

function enforceCurrentPublicVersion(){
  const b=document.getElementById("versionBadge");
  if(b&&b.textContent!==CURRENT_PUBLIC_VERSION)b.textContent=CURRENT_PUBLIC_VERSION;
  const version=CURRENT_PUBLIC_VERSION.replace(/^Versão\s*/i,"");
  if(document.documentElement.dataset.appVersion!==version)document.documentElement.dataset.appVersion=version;
}

async function loadOptional(src,msg){
  try{await loadIncrementalScript(src,12000);}
  catch(e){console.error(`Não foi possível carregar ${msg}.`,e);}
}

(async function boot(){
  await loadOptional(RESPONSIVE_LAYOUT_MODULE,"camada responsiva");
  await loadOptional(GITHUB_COMMIT_QUEUE_MODULE,"fila global de commits");
  try{await loadIncrementalScript(PREVIOUS_BOOTSTRAP,12000);}
  catch(primaryError){
    console.warn("Bootstrap principal indisponível no CDN primário; usando CDN alternativo.",primaryError);
    try{await loadIncrementalScript(PREVIOUS_BOOTSTRAP_FALLBACK,12000);}
    catch(fallbackError){console.error("Falha ao carregar o bootstrap principal.",fallbackError);}
  }
  enforceCurrentPublicVersion();
  const modules=[
    [SALDO_UPDATE_TIME_MODULE,"horário oficial da atualização do Saldo Online"],
    [PAGE_SNAPSHOT_PDF_MODULE,"PDF visual da página atual"],
    [AREA_FILTER_ACTIVE_MODULE,"filtro ativo por área"],
    [GITHUB_PHOTO_UPLOAD_MODULE,"fila imutável de fotos por item"],
    [COMPARATIVO_META_MODULE,"mês meta e filtros dinâmicos"],
    [LAYOUT_FIX_MODULE,"correção estrutural do layout"],
    [COMPARATIVO_PERIODOS_MODULE,"rótulos de período do comparativo"],
    [COMPARATIVO_EXCEL_MODULE,"exportação Excel padronizada"],
    [COMPARATIVO_ITEM_SPLIT_MODULE,"separação de código e nome do item"],
    [COMPARATIVO_META_VISUAL_MODULE,"cálculo visual comparado x mês meta"],
    [COMPARATIVO_INCLUSOES_MODULE,"inclusões e reduções unificadas pelo mês base"],
    [COMPARATIVO_CARDS_RESUMO_MODULE,"cards Top 10 revisados do comparativo"],
    [COMPARATIVO_MES_A_MES_MODULE,"cards Meta e Meta linear vs mês comparado"],
    [COMPARATIVO_ESCALA_MIL_MODULE,"escala x1000 de saldo e consumo"]
  ];
  for(const [src,msg] of modules)await loadOptional(src,msg);
  enforceCurrentPublicVersion();
  [250,800,1800].forEach(d=>setTimeout(enforceCurrentPublicVersion,d));
})();
