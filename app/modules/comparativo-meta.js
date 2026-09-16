"use strict";

(() => {
  const REPO_API = "https://api.github.com/repos/tiagosilvagba/Almoxarifado/contents?ref=main";
  const AREA_FILE = "./02 - Responsaveis_Reposição.CSV?meta=20260914-1";
  const FILE_RE = /^01\s*-\s*Estoque_([A-Za-zÀ-ÿ]{3})_(\d{4})\.csv$/i;
  const MONTHS = {jan:1,fev:2,mar:3,abr:4,mai:5,jun:6,jul:7,ago:8,set:9,out:10,nov:11,dez:12};
  const MONTH_LABEL = {jan:"Janeiro",fev:"Fevereiro",mar:"Março",abr:"Abril",mai:"Maio",jun:"Junho",jul:"Julho",ago:"Agosto",set:"Setembro",out:"Outubro",nov:"Novembro",dez:"Dezembro"};
  const cache = new Map();
  const areaMap = new Map();
  let files = [];
  let snapshots = [];
  let refreshToken = 0;
  const nf = new Intl.NumberFormat("pt-BR",{maximumFractionDigits:2});

  const norm = (v) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  const keyPart = (v) => { const s=String(v??"").trim(); return /^0*\d+$/.test(s) ? String(Number(s)) : norm(s); };
  const positionKey = (b,l) => `${keyPart(b)}::${keyPart(l)}`;
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const escXml = (v) => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]));

  function parseNumber(value){
    let text=String(value??"").trim();
    if(!text||text==="-"||text==="—") return 0;
    text=text.replace(/\s/g,"").replace(/R\$/gi,"").replace(/[^0-9,.-]/g,"");
    const comma=text.lastIndexOf(","),dot=text.lastIndexOf(".");
    if(comma>dot) text=text.replace(/\./g,"").replace(",",".");
    else if(dot>comma&&comma>=0) text=text.replace(/,/g,"");
    else if(comma>=0) text=text.replace(",",".");
    const n=Number(text); return Number.isFinite(n)?n:0;
  }

  function parseCsv(text){
    text=String(text||"").replace(/^\uFEFF/,"");
    const first=text.split(/\r?\n/,1)[0]||"";
    const candidates=[";",",","\t","|"];
    const delimiter=candidates.sort((a,b)=>(first.split(b).length-first.split(a).length))[0];
    const rows=[]; let row=[],field="",quoted=false;
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(quoted){ if(c==='"'&&text[i+1]==='"'){field+='"';i++;} else if(c==='"') quoted=false; else field+=c; continue; }
      if(c==='"'){quoted=true;continue;} if(c===delimiter){row.push(field);field="";continue;}
      if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);field="";if(row.some(x=>String(x).trim()))rows.push(row);row=[];continue;} field+=c;
    }
    if(field||row.length){row.push(field);if(row.some(x=>String(x).trim()))rows.push(row);}
    if(!rows.length)return{headers:[],rows:[]};
    return{headers:rows.shift().map(x=>String(x).trim()),rows};
  }

  function col(headers,names,contains=[]){
    const h=headers.map(norm);
    for(const n of names){const i=h.indexOf(norm(n));if(i>=0)return i;}
    for(const n of contains){const i=h.findIndex(x=>x.includes(norm(n)));if(i>=0)return i;}
    return -1;
  }

  async function fetchText(url,cacheMode="default"){
    const r=await fetch(encodeURI(url),{cache:cacheMode});
    if(!r.ok)throw new Error(`Falha ao ler ${url}`);
    const b=await r.arrayBuffer(); let t=new TextDecoder("utf-8").decode(b);
    if(t.includes("�")){try{t=new TextDecoder("windows-1252").decode(b);}catch{}}
    return t;
  }

  async function loadAreas(){
    if(areaMap.size)return;
    try{
      const p=parseCsv(await fetchText(AREA_FILE,"no-store"));
      const bi=col(p.headers,["FILIAL","CD FILIAL"]),li=col(p.headers,["CD LOCAL","LOCAL"]),ai=col(p.headers,["Área","Area"]);
      if(bi<0||li<0||ai<0)return;
      p.rows.forEach(r=>{const b=String(r[bi]??"").trim(),l=String(r[li]??"").trim(),a=String(r[ai]??"").trim();if(!b||!l||!a)return;const k=positionKey(b,l);const s=areaMap.get(k)||new Set();s.add(a);areaMap.set(k,s);});
    }catch(e){console.warn("Mês meta: áreas indisponíveis",e);}
  }

  async function discover(){
    const r=await fetch(REPO_API,{cache:"no-store",headers:{Accept:"application/vnd.github+json"}}); if(!r.ok)throw new Error("Falha ao localizar bases mensais");
    const entries=await r.json();
    files=entries.map(e=>{const m=e.name?.match(FILE_RE);if(!m)return null;const mk=norm(m[1]).slice(0,3),year=Number(m[2]),month=MONTHS[mk];if(!month)return null;return{name:e.name,monthKey:mk,month,year,label:`${MONTH_LABEL[mk]||m[1]} ${year}`,sortKey:year*100+month};}).filter(Boolean).sort((a,b)=>a.sortKey-b.sortKey);
  }

  async function snapshot(file){
    if(!file)return null; if(cache.has(file.name))return cache.get(file.name);
    const promise=(async()=>{
      const p=parseCsv(await fetchText(`./${file.name}`)); const h=p.headers;
      const ci=col(h,["Item","ITEM","Código","Codigo","Código item","Codigo item","Cd Item","CD_ITEM","Material"],["codigo item","cd item"]);
      const ni=col(h,["Nome Item","NM Item","Nm Item","NM_ITEM","Nome do Item","Descrição","Descricao","Descrição Item","Descricao Item","Descrição do Item","Descricao do Item","Nome Material","Descrição Material","Descricao Material"],["nome item","nm item","descricao item","descricao material"]);
      const si=col(h,["Saldo Real"],["saldo real"]),coi=col(h,["Consumo real","Consumo Real"],["consumo real"]);
      const bi=col(h,["CD Filial","Cd Filial","Código Filial","Codigo Filial","Filial"],["cd filial","codigo filial"]);
      const li=col(h,["Local de estoque","Local Estoque","CD Local","Cd Local","Local"],["local de estoque","local estoque","cd local"]);
      const ui=col(h,["Nome utilização","Nome utilizacao","NM Utilização","NM Utilizacao","Utilização","Utilizacao"],["nome utilizacao","nm utilizacao"]);
      if(ci<0||si<0||coi<0)throw new Error(`${file.name}: colunas Item, Saldo Real ou Consumo real não encontradas`);
      const records=[];
      for(const r of p.rows){const code=String(r[ci]??"").trim();if(!code)continue;const branch=bi>=0?String(r[bi]??"").trim():"",local=li>=0?String(r[li]??"").trim():"";records.push({code,name:ni>=0?String(r[ni]??"").trim():"",balance:parseNumber(r[si]),consumption:parseNumber(r[coi]),branch,local,usage:ui>=0?String(r[ui]??"").trim():"",areas:[...(areaMap.get(positionKey(branch,local))||[])]});}
      return{file,records};
    })(); cache.set(file.name,promise); return promise;
  }

  function selected(){return{branch:document.getElementById("monthlyBranchFilter")?.value||"all",local:document.getElementById("monthlyLocalFilter")?.value||"all",usage:document.getElementById("monthlyUsageFilter")?.value||"all",area:document.getElementById("monthlyAreaFilter")?.value||"all"};}
  function match(r,f,exclude=""){if(exclude!=="branch"&&f.branch!=="all"&&r.branch!==f.branch)return false;if(exclude!=="local"&&f.local!=="all"&&r.local!==f.local)return false;if(exclude!=="usage"&&f.usage!=="all"&&r.usage!==f.usage)return false;if(exclude!=="area"&&f.area!=="all"&&!r.areas.includes(f.area))return false;return true;}
  function filteredRecords(s){const f=selected();return(s?.records||[]).filter(r=>match(r,f));}
  function aggregate(records){const m=new Map();for(const r of records){const v=m.get(r.code)||{code:r.code,name:r.name,balance:0,consumption:0};if(!v.name&&r.name)v.name=r.name;v.balance+=r.balance;v.consumption+=r.consumption;m.set(r.code,v);}return m;}

  function ensureUi(){
    const controls=document.querySelector("#page-comparativo-mensal .month-compare-controls"); if(!controls||document.getElementById("monthlyTargetSelect"))return Boolean(controls);
    const actions=controls.querySelector(".month-compare-actions"); const label=document.createElement("label"); label.className="month-target-field"; label.innerHTML='<span>Mês meta</span><select id="monthlyTargetSelect"><option value="">Sem mês meta</option></select>'; controls.insertBefore(label,actions);
    const metrics=document.getElementById("monthlyCompareMetrics"); if(metrics){const block=document.createElement("section");block.id="monthlyTargetBlock";block.className="month-target-block is-hidden";metrics.insertAdjacentElement("afterend",block);}
    const style=document.createElement("style");style.id="monthlyMetaStyles";style.textContent=`
      .month-compare-controls{grid-template-columns:repeat(3,minmax(170px,1fr)) auto!important}
      .month-target-block{margin:0 0 18px;padding:16px;border:1px solid var(--steel-200);border-radius:16px;background:var(--surface,#fff)}
      .month-target-block__head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}.month-target-block__head h3{margin:0}.month-target-block__head small{color:var(--muted)}
      .month-target-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}.month-target-metric{padding:14px;border:1px solid var(--steel-200);border-radius:12px;background:var(--steel-50,#fff);display:grid;gap:6px}.month-target-metric span{font-size:12px;font-weight:800}.month-target-metric strong{font-size:20px}.month-target-table-wrap{overflow:auto;margin-top:14px;border:1px solid var(--steel-200);border-radius:12px}.month-target-table{width:100%;border-collapse:collapse;min-width:950px}.month-target-table th,.month-target-table td{padding:10px 11px;border-bottom:1px solid var(--steel-200);text-align:right}.month-target-table th:first-child,.month-target-table td:first-child,.month-target-table th:nth-child(2),.month-target-table td:nth-child(2){text-align:left}.month-target-table th{background:var(--steel-100);position:sticky;top:0}.month-target-positive{color:#169b62!important}.month-target-negative{color:#d64545!important}
      @media(max-width:1100px){.month-compare-controls{grid-template-columns:repeat(2,minmax(0,1fr)) auto!important}.month-target-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:900px){.month-compare-controls{grid-template-columns:1fr!important}.month-target-grid{grid-template-columns:1fr}}
    `;document.head.appendChild(style);return true;
  }

  function populateTargetSelect(){const sel=document.getElementById("monthlyTargetSelect");if(!sel)return;const prev=sel.value;sel.innerHTML='<option value="">Sem mês meta</option>'+files.map(f=>`<option value="${esc(f.name)}">${esc(f.label)}</option>`).join("");if(files.some(f=>f.name===prev))sel.value=prev;}

  function collectOptions(field){const f=selected(),values=new Set();for(const s of snapshots.filter(Boolean)){for(const r of s.records){if(!match(r,f,field))continue;const v=field==="area"?r.areas:r[field];if(Array.isArray(v))v.forEach(x=>x&&values.add(x));else if(v)values.add(v);}}return[...values].sort((a,b)=>a.localeCompare(b,"pt-BR",{numeric:true,sensitivity:"base"}));}
  function refreshFilterOptions(changed=""){
    const defs=[['branch','monthlyBranchFilter'],['local','monthlyLocalFilter'],['usage','monthlyUsageFilter'],['area','monthlyAreaFilter']];
    for(const [field,id] of defs){if(field===changed)continue;const sel=document.getElementById(id);if(!sel)continue;const prev=sel.value;const values=collectOptions(field);sel.innerHTML='<option value="all">Todos</option>'+values.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join("");sel.value=values.includes(prev)?prev:'all';sel.disabled=!values.length;}
  }

  async function syncSnapshots(){
    const token=++refreshToken;const baseName=document.getElementById("monthlyBaseSelect")?.value,currentName=document.getElementById("monthlyCurrentSelect")?.value,targetName=document.getElementById("monthlyTargetSelect")?.value;
    const chosen=[baseName,currentName,targetName].filter(Boolean).map(n=>files.find(f=>f.name===n)).filter(Boolean);
    const loaded=await Promise.all(chosen.map(snapshot)); if(token!==refreshToken)return;snapshots=loaded;refreshFilterOptions();renderTarget();
  }

  function diffClass(v){return v>0?'month-target-positive':v<0?'month-target-negative':'';}
  async function renderTarget(){
    const block=document.getElementById("monthlyTargetBlock"),targetName=document.getElementById("monthlyTargetSelect")?.value;if(!block)return;if(!targetName){block.classList.add("is-hidden");block.innerHTML='';return;}
    const baseFile=files.find(f=>f.name===document.getElementById("monthlyBaseSelect")?.value),currentFile=files.find(f=>f.name===document.getElementById("monthlyCurrentSelect")?.value),targetFile=files.find(f=>f.name===targetName);if(!baseFile||!currentFile||!targetFile)return;
    try{
      const [bs,cs,ts]=await Promise.all([snapshot(baseFile),snapshot(currentFile),snapshot(targetFile)]);const bm=aggregate(filteredRecords(bs)),cm=aggregate(filteredRecords(cs)),tm=aggregate(filteredRecords(ts));
      const sum=(m,k)=>[...m.values()].reduce((a,x)=>a+(x[k]||0),0),bb=sum(bm,'balance'),cb=sum(cm,'balance'),tb=sum(tm,'balance'),tc=sum(tm,'consumption');
      const codes=new Set([...bm.keys(),...cm.keys(),...tm.keys()]);const rows=[...codes].map(code=>{const b=bm.get(code)||{code,name:'',balance:0,consumption:0},c=cm.get(code)||{code,name:b.name,balance:0,consumption:0},t=tm.get(code)||{code,name:c.name||b.name,balance:0,consumption:0};return{code,name:t.name||c.name||b.name||'Item sem nome',b:b.balance,c:c.balance,t:t.balance,bd:b.balance-t.balance,cd:c.balance-t.balance};}).sort((a,b)=>Math.abs(b.cd)-Math.abs(a.cd));
      block.innerHTML=`<div class="month-target-block__head"><div><h3>Comparação com mês meta</h3><small>${esc(baseFile.label)} e ${esc(currentFile.label)} comparados com ${esc(targetFile.label)}</small></div></div><div class="month-target-grid"><article class="month-target-metric"><span>Saldo mês meta</span><strong>${nf.format(tb)}</strong><small>${esc(targetFile.label)}</small></article><article class="month-target-metric"><span>Base x meta</span><strong class="${diffClass(bb-tb)}">${nf.format(bb-tb)}</strong><small>${esc(baseFile.label)}</small></article><article class="month-target-metric"><span>Comparado x meta</span><strong class="${diffClass(cb-tb)}">${nf.format(cb-tb)}</strong><small>${esc(currentFile.label)}</small></article><article class="month-target-metric"><span>Consumo mês meta</span><strong>${nf.format(tc)}</strong><small>${esc(targetFile.label)}</small></article><article class="month-target-metric"><span>Itens na meta</span><strong>${tm.size}</strong><small>itens consolidados</small></article></div><div class="month-target-table-wrap"><table class="month-target-table"><thead><tr><th>Item</th><th>Nome Item</th><th>Saldo base</th><th>Saldo comparado</th><th>Saldo meta</th><th>Base x meta</th><th>Comparado x meta</th></tr></thead><tbody>${rows.slice(0,1000).map(r=>`<tr><td>${esc(r.code)}</td><td>${esc(r.name)}</td><td>${nf.format(r.b)}</td><td>${nf.format(r.c)}</td><td>${nf.format(r.t)}</td><td class="${diffClass(r.bd)}">${nf.format(r.bd)}</td><td class="${diffClass(r.cd)}">${nf.format(r.cd)}</td></tr>`).join('')}</tbody></table></div>`;block.classList.remove("is-hidden");
    }catch(e){block.classList.remove("is-hidden");block.innerHTML=`<div class="month-compare-message">Não foi possível calcular o mês meta: ${esc(e.message||e)}</div>`;}
  }

  function dynamicFilterChanged(event){const map={monthlyBranchFilter:'branch',monthlyLocalFilter:'local',monthlyUsageFilter:'usage',monthlyAreaFilter:'area'};const field=map[event.target.id];if(!field)return;refreshFilterOptions(field);document.getElementById("monthlyApplyFilters")?.click();renderTarget();}

  function xmlCell(v,type='String',style=''){const attr=style?` ss:StyleID="${style}"`:'';const safe=type==='Number'?(Number.isFinite(Number(v))?Number(v):0):escXml(v);return `<Cell${attr}><Data ss:Type="${type}">${safe}</Data></Cell>`;}
  async function exportEnhanced(event){
    const targetName=document.getElementById("monthlyTargetSelect")?.value;if(!targetName)return;
    event.preventDefault();event.stopImmediatePropagation();
    const baseFile=files.find(f=>f.name===document.getElementById("monthlyBaseSelect")?.value),currentFile=files.find(f=>f.name===document.getElementById("monthlyCurrentSelect")?.value),targetFile=files.find(f=>f.name===targetName);if(!baseFile||!currentFile||!targetFile)return;
    const [bs,cs,ts]=await Promise.all([snapshot(baseFile),snapshot(currentFile),snapshot(targetFile)]),bm=aggregate(filteredRecords(bs)),cm=aggregate(filteredRecords(cs)),tm=aggregate(filteredRecords(ts));const codes=new Set([...bm.keys(),...cm.keys(),...tm.keys()]);
    const header=['Item','Nome Item','Saldo base','Saldo comparado','Saldo meta','Base x meta','Comparado x meta','Consumo base','Consumo comparado','Consumo meta'];
    const rows=[...codes].map(code=>{const b=bm.get(code)||{},c=cm.get(code)||{},t=tm.get(code)||{};return[code,t.name||c.name||b.name||'Item sem nome',b.balance||0,c.balance||0,t.balance||0,(b.balance||0)-(t.balance||0),(c.balance||0)-(t.balance||0),b.consumption||0,c.consumption||0,t.consumption||0];});
    const detail=`<Row>${header.map(x=>xmlCell(x,'String','Header')).join('')}</Row>`+rows.map(r=>`<Row>${r.map((v,i)=>xmlCell(v,i<2?'String':'Number')).join('')}</Row>`).join('');
    const f=selected();const summary=[['Mês base',baseFile.label],['Mês comparado',currentFile.label],['Mês meta',targetFile.label],['Filial',f.branch],['Local',f.local],['Nome utilização',f.usage],['Área',f.area]].map(r=>`<Row>${xmlCell(r[0],'String','Header')}${xmlCell(r[1])}</Row>`).join('');
    const book=`<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Default" ss:Name="Normal"><Font ss:FontName="Calibri" ss:Size="11"/></Style><Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#D9EAF7" ss:Pattern="Solid"/></Style></Styles><Worksheet ss:Name="Resumo"><Table>${summary}</Table></Worksheet><Worksheet ss:Name="Comparativo meta"><Table>${detail}</Table></Worksheet></Workbook>`;
    const blob=new Blob(['\uFEFF',book],{type:'application/vnd.ms-excel;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`Comparativo_Meta_${baseFile.monthKey}_${baseFile.year}_x_${currentFile.monthKey}_${currentFile.year}_meta_${targetFile.monthKey}_${targetFile.year}.xls`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  async function install(){
    if(!ensureUi()){setTimeout(install,250);return;}
    await loadAreas();await discover();populateTargetSelect();await syncSnapshots();
    ['monthlyBranchFilter','monthlyLocalFilter','monthlyUsageFilter','monthlyAreaFilter'].forEach(id=>document.getElementById(id)?.addEventListener('change',dynamicFilterChanged));
    ['monthlyBaseSelect','monthlyCurrentSelect','monthlyTargetSelect'].forEach(id=>document.getElementById(id)?.addEventListener('change',syncSnapshots));
    document.getElementById('monthlyTargetSelect')?.addEventListener('change',renderTarget);
    document.getElementById('monthlyExportExcel')?.addEventListener('click',exportEnhanced,true);
    document.getElementById('monthlyClearFilters')?.addEventListener('click',()=>setTimeout(()=>{refreshFilterOptions();renderTarget();},0));
    document.getElementById('monthlyApplyFilters')?.addEventListener('click',renderTarget);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
