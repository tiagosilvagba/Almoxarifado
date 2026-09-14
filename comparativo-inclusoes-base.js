"use strict";

(() => {
  const SCALE = 1000;
  const AREA_FILE = "./02 - Responsaveis_Reposição.CSV?inclusoes-base=20260914-1";
  const cache = new Map();
  const areaMap = new Map();
  const nf = new Intl.NumberFormat("pt-BR", { minimumFractionDigits:2, maximumFractionDigits:2 });
  let scheduled = false;
  let lastHtml = "";

  const norm = (v) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const keyPart = (v) => { const s=String(v??"").trim(); return /^0*\d+$/.test(s) ? String(Number(s)) : norm(s); };
  const posKey = (b,l) => `${keyPart(b)}::${keyPart(l)}`;
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  function parseNumber(value){let t=String(value??"").trim();if(!t||t==="-"||t==="—")return 0;t=t.replace(/\s/g,"").replace(/R\$/gi,"").replace(/[^0-9,.-]/g,"");const c=t.lastIndexOf(","),d=t.lastIndexOf(".");if(c>d)t=t.replace(/\./g,"").replace(",", ".");else if(d>c&&c>=0)t=t.replace(/,/g,"");else if(c>=0)t=t.replace(",", ".");const n=Number(t);return Number.isFinite(n)?n:0;}
  function parseCsv(text){text=String(text||"").replace(/^\uFEFF/,"");const first=text.split(/\r?\n/,1)[0]||"";const delimiter=[";",",","\t","|"].reduce((a,b)=>first.split(b).length>first.split(a).length?b:a,";");const rows=[];let row=[],field="",q=false;for(let i=0;i<text.length;i++){const ch=text[i];if(q){if(ch==='"'&&text[i+1]==='"'){field+='"';i++;}else if(ch==='"')q=false;else field+=ch;continue;}if(ch==='"'){q=true;continue;}if(ch===delimiter){row.push(field);field="";continue;}if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(field);field="";if(row.some(x=>String(x).trim()))rows.push(row);row=[];continue;}field+=ch;}if(field||row.length){row.push(field);if(row.some(x=>String(x).trim()))rows.push(row);}if(!rows.length)return{headers:[],rows:[]};return{headers:rows.shift().map(x=>String(x).trim()),rows};}
  function col(headers,names,contains=[]){const h=headers.map(norm);for(const n of names){const i=h.indexOf(norm(n));if(i>=0)return i;}for(const n of contains){const i=h.findIndex(x=>x.includes(norm(n)));if(i>=0)return i;}return -1;}
  function splitItem(raw,name=""){const item=String(raw??"").trim();let code=item,nm=String(name??"").trim();const m=item.match(/^(.{1,40}?)\s+-\s+(.+)$/);if(m&&/[0-9]/.test(m[1])){code=m[1].trim();if(!nm||nm===item||nm===code)nm=m[2].trim();}return{code:keyPart(code),displayCode:code,name:nm};}
  async function text(url){const r=await fetch(encodeURI(url),{cache:"no-store"});if(!r.ok)throw new Error(`Falha ao ler ${url}`);const b=await r.arrayBuffer();let t=new TextDecoder("utf-8").decode(b);if(t.includes("�")){try{t=new TextDecoder("windows-1252").decode(b);}catch{}}return t;}
  async function loadAreas(){if(areaMap.size)return;try{const p=parseCsv(await text(AREA_FILE));const bi=col(p.headers,["FILIAL","CD FILIAL"]),li=col(p.headers,["CD LOCAL","LOCAL"]),ai=col(p.headers,["Área","Area"]);if(bi<0||li<0||ai<0)return;p.rows.forEach(r=>{const b=String(r[bi]??"").trim(),l=String(r[li]??"").trim(),a=String(r[ai]??"").trim();if(!b||!l||!a)return;const k=posKey(b,l),s=areaMap.get(k)||new Set();s.add(a);areaMap.set(k,s);});}catch{}}
  async function load(file){if(cache.has(file))return cache.get(file);const promise=(async()=>{const p=parseCsv(await text(`./${file}`)),h=p.headers;const ci=col(h,["Item","ITEM","Código","Codigo","Código item","Codigo item","Cd Item","CD_ITEM","Material"],["codigo item","cd item"]),ni=col(h,["Nome Item","NM Item","Nome do Item","Descrição","Descricao"],["nome item","nm item","descricao item"]),si=col(h,["Saldo Real"],["saldo real"]),bi=col(h,["CD Filial","Cd Filial","Filial"],["cd filial"]),li=col(h,["Local de estoque","CD Local","Cd Local","Local"],["local de estoque","cd local"]),ui=col(h,["Nome utilização","Nome utilizacao","Utilização","Utilizacao"],["nome utilizacao"]);if(ci<0||si<0)throw new Error("Colunas obrigatórias não encontradas.");const records=[];for(const r of p.rows){const item=splitItem(r[ci],ni>=0?r[ni]:"");if(!item.code)continue;const branch=bi>=0?String(r[bi]??"").trim():"",local=li>=0?String(r[li]??"").trim():"";records.push({...item,balance:parseNumber(r[si]),branch,local,usage:ui>=0?String(r[ui]??"").trim():"",areas:[...(areaMap.get(posKey(branch,local))||[])]});}return records;})();cache.set(file,promise);return promise;}
  function filters(){return{branch:document.getElementById("monthlyBranchFilter")?.value||"all",local:document.getElementById("monthlyLocalFilter")?.value||"all",usage:document.getElementById("monthlyUsageFilter")?.value||"all",area:document.getElementById("monthlyAreaFilter")?.value||"all"};}
  function matches(r,f){return !(f.branch!=="all"&&r.branch!==f.branch) && !(f.local!=="all"&&r.local!==f.local) && !(f.usage!=="all"&&r.usage!==f.usage) && !(f.area!=="all"&&!r.areas.includes(f.area));}
  function aggregate(records){const m=new Map();for(const r of records){const x=m.get(r.code)||{code:r.code,displayCode:r.displayCode,name:r.name,balance:0};x.balance+=r.balance;if(!x.name&&r.name)x.name=r.name;m.set(r.code,x);}return m;}

  async function render(){
    scheduled=false;
    const node=document.getElementById("monthlyStockInclusions");
    const baseSelect=document.getElementById("monthlyBaseSelect");
    const currentSelect=document.getElementById("monthlyCurrentSelect");
    if(!node||!baseSelect?.value||!currentSelect?.value)return;
    try{
      await loadAreas();
      const [base,current]=await Promise.all([load(baseSelect.value),load(currentSelect.value)]);
      const f=filters();
      const baseMap=aggregate(base.filter(r=>matches(r,f)));
      const currentMap=aggregate(current.filter(r=>matches(r,f)));
      const inclusions=[...currentMap.values()].filter(item=>!baseMap.has(item.code)).sort((a,b)=>b.balance-a.balance);
      const top=inclusions.slice(0,10);
      const total=inclusions.reduce((s,x)=>s+x.balance,0);
      const baseLabel=baseSelect.selectedOptions?.[0]?.textContent?.trim()||"Mês base";
      const currentLabel=currentSelect.selectedOptions?.[0]?.textContent?.trim()||"Mês comparado";
      const list=top.length?`<ol class="month-stock-inclusions__list">${top.map((item,i)=>`<li><div class="month-stock-inclusions__identity"><strong>${i+1}. ${esc(item.displayCode||item.code)}</strong><small>${esc(item.name||"Item sem nome")}</small></div><span class="month-stock-inclusions__value" data-scale-mil="1">${nf.format(item.balance*SCALE)}</span></li>`).join("")}</ol>`:'<div class="month-stock-inclusions__empty">Nenhuma inclusão identificada neste recorte.</div>';
      const html=`<div class="month-stock-inclusions__head"><div><h3>Inclusões de estoque · Top 10</h3><p>Somente itens de ${esc(currentLabel)} que não existiam em ${esc(baseLabel)} no mesmo recorte filtrado.</p></div><div class="month-stock-inclusions__total"><span>Total das inclusões</span><strong data-scale-mil="1">${nf.format(total*SCALE)}</strong></div></div>${list}`;
      lastHtml=html;
      if(node.innerHTML!==html)node.innerHTML=html;
      node.classList.remove("is-hidden");
      node.dataset.inclusionRule="base-month";
    }catch(error){console.warn("Inclusões por mês base indisponíveis",error);}
  }
  function schedule(delay=40){if(scheduled)return;scheduled=true;setTimeout(render,delay);}
  function install(){const page=document.getElementById("page-comparativo-mensal");if(!page){setTimeout(install,250);return;}["monthlyCompareButton","monthlyApplyFilters","monthlyClearFilters"].forEach(id=>document.getElementById(id)?.addEventListener("click",()=>schedule(120)));["monthlyBaseSelect","monthlyCurrentSelect","monthlyBranchFilter","monthlyLocalFilter","monthlyUsageFilter","monthlyAreaFilter"].forEach(id=>document.getElementById(id)?.addEventListener("change",()=>schedule(120)));const observer=new MutationObserver(()=>{const node=document.getElementById("monthlyStockInclusions");if(node&&lastHtml&&node.innerHTML!==lastHtml)schedule(20);});observer.observe(page,{childList:true,subtree:true});[250,700,1400].forEach(d=>setTimeout(()=>schedule(),d));}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
})();
