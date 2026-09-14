"use strict";

(() => {
  const AREA_FILE = "./02 - Responsaveis_Reposição.CSV?excel=20260914-2";
  const areaMap = new Map();
  const monthLabel = {jan:"Janeiro",fev:"Fevereiro",mar:"Março",abr:"Abril",mai:"Maio",jun:"Junho",jul:"Julho",ago:"Agosto",set:"Setembro",out:"Outubro",nov:"Novembro",dez:"Dezembro"};
  const norm = (v) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  const keyPart = (v) => { const s=String(v ?? "").trim(); return /^0*\d+$/.test(s) ? String(Number(s)) : norm(s); };
  const positionKey = (b,l) => `${keyPart(b)}::${keyPart(l)}`;
  const xml = (v) => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]));

  function parseNumber(value){
    let text=String(value ?? "").trim();
    if(!text || text==="-" || text==="—") return 0;
    text=text.replace(/\s/g,"").replace(/R\$/gi,"").replace(/[^0-9,.-]/g,"");
    const comma=text.lastIndexOf(","),dot=text.lastIndexOf(".");
    if(comma>dot) text=text.replace(/\./g,"").replace(",",".");
    else if(dot>comma && comma>=0) text=text.replace(/,/g,"");
    else if(comma>=0) text=text.replace(",",".");
    const n=Number(text); return Number.isFinite(n)?n:0;
  }

  function parseCsv(text){
    text=String(text||"").replace(/^\uFEFF/,"");
    const first=(text.match(/^[^\r\n]*/)?.[0]||"");
    const delimiter=[";",",","\t","|"].reduce((best,current)=>first.split(current).length>first.split(best).length?current:best,";");
    const rows=[]; let row=[],field="",quoted=false;
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(quoted){ if(c==='"'&&text[i+1]==='"'){field+='"';i++;} else if(c==='"')quoted=false; else field+=c; continue; }
      if(c==='"'){quoted=true;continue;} if(c===delimiter){row.push(field);field="";continue;}
      if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);field="";if(row.some(x=>String(x).trim()))rows.push(row);row=[];continue;} field+=c;
    }
    if(field||row.length){row.push(field);if(row.some(x=>String(x).trim()))rows.push(row);}
    return rows.length?{headers:rows.shift().map(x=>String(x).trim()),rows}:{headers:[],rows:[]};
  }

  function col(headers,names,contains=[]){
    const h=headers.map(norm);
    for(const n of names){const i=h.indexOf(norm(n));if(i>=0)return i;}
    for(const n of contains){const i=h.findIndex(x=>x.includes(norm(n)));if(i>=0)return i;}
    return -1;
  }

  function splitItem(raw, explicitName=""){
    const item=String(raw ?? "").trim();
    let code=item,name=String(explicitName ?? "").trim();
    const m=item.match(/^(.{1,40}?)\s+-\s+(.+)$/);
    if(m && /[0-9]/.test(m[1])){code=m[1].trim();if(!name||name===item||name===code)name=m[2].trim();}
    return {code,name};
  }

  async function fetchText(url,cache="default"){
    const r=await fetch(encodeURI(url),{cache}); if(!r.ok) throw new Error(`Não foi possível ler ${url}.`);
    const b=await r.arrayBuffer(); let t=new TextDecoder("utf-8").decode(b);
    if(t.includes("�")){try{t=new TextDecoder("windows-1252").decode(b);}catch{}}
    return t;
  }

  async function ensureAreas(){
    if(areaMap.size)return;
    try{
      const p=parseCsv(await fetchText(AREA_FILE,"no-store"));
      const bi=col(p.headers,["FILIAL","CD FILIAL"]),li=col(p.headers,["CD LOCAL","LOCAL"]),ai=col(p.headers,["Área","Area"]);
      if(bi<0||li<0||ai<0)return;
      for(const r of p.rows){const b=String(r[bi]??"").trim(),l=String(r[li]??"").trim(),a=String(r[ai]??"").trim();if(!b||!l||!a)continue;const k=positionKey(b,l),s=areaMap.get(k)||new Set();s.add(a);areaMap.set(k,s);}
    }catch(error){console.warn("Exportação do comparativo: áreas indisponíveis.",error);}
  }

  function fileMeta(name){
    const m=String(name||"").match(/^01\s*-\s*Estoque_([A-Za-zÀ-ÿ]{3})_(\d{4})\.csv$/i);
    if(!m)return{name,label:name||"Não informado",monthKey:"",year:""};
    const key=norm(m[1]).slice(0,3),year=Number(m[2]);return{name,monthKey:key,year,label:`${monthLabel[key]||m[1]} ${year}`};
  }

  async function loadSnapshot(fileName){
    if(!fileName)return null;
    const p=parseCsv(await fetchText(`./${fileName}`)),h=p.headers;
    const ci=col(h,["Item","ITEM","Código","Codigo","Código item","Codigo item","Cd Item","CD_ITEM","Material"],["codigo item","cd item"]);
    const ni=col(h,["Nome Item","NM Item","Nm Item","NM_ITEM","Nome do Item","Descrição","Descricao","Descrição Item","Descricao Item","Descrição do Item","Descricao do Item","Nome Material","Descrição Material","Descricao Material"],["nome item","nm item","descricao item","descricao material"]);
    const si=col(h,["Saldo Real"],["saldo real"]),coi=col(h,["Consumo real","Consumo Real"],["consumo real"]);
    const bi=col(h,["CD Filial","Cd Filial","Código Filial","Codigo Filial","Filial"],["cd filial","codigo filial"]);
    const li=col(h,["Local de estoque","Local Estoque","CD Local","Cd Local","Local"],["local de estoque","local estoque","cd local"]);
    const ui=col(h,["Nome utilização","Nome utilizacao","NM Utilização","NM Utilizacao","Utilização","Utilizacao"],["nome utilizacao","nm utilizacao"]);
    if(ci<0||si<0||coi<0)throw new Error(`${fileName}: colunas Item, Saldo Real ou Consumo real não encontradas.`);
    const records=[];
    for(const r of p.rows){
      const parsed=splitItem(r[ci],ni>=0?r[ni]:""); if(!parsed.code)continue;
      const branch=bi>=0?String(r[bi]??"").trim():"",local=li>=0?String(r[li]??"").trim():"";
      records.push({code:parsed.code,name:parsed.name,balance:parseNumber(r[si]),consumption:parseNumber(r[coi]),branch,local,usage:ui>=0?String(r[ui]??"").trim():"",areas:[...(areaMap.get(positionKey(branch,local))||[])]});
    }
    return{file:fileMeta(fileName),records};
  }

  function currentFilters(){return{branch:document.getElementById("monthlyBranchFilter")?.value||"all",local:document.getElementById("monthlyLocalFilter")?.value||"all",usage:document.getElementById("monthlyUsageFilter")?.value||"all",area:document.getElementById("monthlyAreaFilter")?.value||"all"};}
  function filtered(snapshot,f){return(snapshot?.records||[]).filter(r=>(f.branch==="all"||r.branch===f.branch)&&(f.local==="all"||r.local===f.local)&&(f.usage==="all"||r.usage===f.usage)&&(f.area==="all"||r.areas.includes(f.area)));}
  function aggregate(records){const m=new Map();for(const r of records){const x=m.get(r.code)||{code:r.code,name:r.name,balance:0,consumption:0};if(!x.name&&r.name)x.name=r.name;x.balance+=r.balance;x.consumption+=r.consumption;m.set(r.code,x);}return m;}
  function percent(oldValue,newValue){return oldValue?((newValue-oldValue)/Math.abs(oldValue))*100:(newValue?null:0);}
  function status(delta){return delta>0.000001?"Aumentou":delta<-0.000001?"Reduziu":"Estável";}
  function cell(value,type="String",style=""){const attr=style?` ss:StyleID="${style}"`:"";const content=type==="Number"?(Number.isFinite(Number(value))?Number(value):0):xml(value);return`<Cell${attr}><Data ss:Type="${type}">${content}</Data></Cell>`;}
  function textRow(label,value,columns){return`<Row>${cell(label,"String","MetaLabel")}${cell(value,"String","MetaValue")}<Cell ss:MergeAcross="${Math.max(columns-3,0)}"/></Row>`;}

  function buildWorkbook(base,current,target,filters){
    const bm=aggregate(filtered(base,filters)),cm=aggregate(filtered(current,filters)),tm=target?aggregate(filtered(target,filters)):new Map();
    const hasTarget=Boolean(target),codes=new Set([...tm.keys(),...bm.keys(),...cm.keys()]);
    const rows=[...codes].map(code=>{
      const t=tm.get(code)||{code,name:"",balance:0,consumption:0},b=bm.get(code)||{code,name:t.name,balance:0,consumption:0},c=cm.get(code)||{code,name:b.name||t.name,balance:0,consumption:0};
      const baseVsMeta=b.balance-t.balance,currentVsMeta=c.balance-t.balance,deltaBalance=c.balance-b.balance,deltaConsumption=c.consumption-b.consumption;
      return{code,name:c.name||b.name||t.name||"Item sem nome",targetBalance:t.balance,targetConsumption:t.consumption,baseBalance:b.balance,baseConsumption:b.consumption,currentBalance:c.balance,currentConsumption:c.consumption,baseVsMeta,currentVsMeta,deltaBalance,pct:percent(b.balance,c.balance),deltaConsumption,state:status(deltaBalance),inclusion:hasTarget&&!tm.has(code)&&cm.has(code)};
    }).sort((a,b)=>Math.abs(b.deltaBalance)-Math.abs(a.deltaBalance));

    const headers=["Código do Item","Nome do Item"];
    if(hasTarget)headers.push(`Saldo meta · ${target.file.label}`,`Consumo meta · ${target.file.label}`);
    headers.push(`Saldo base · ${base.file.label}`,`Consumo base · ${base.file.label}`,`Saldo comparado · ${current.file.label}`,`Consumo comparado · ${current.file.label}`);
    if(hasTarget)headers.push(`Base x meta · ${base.file.label} x ${target.file.label}`,`Comparado x meta · ${current.file.label} x ${target.file.label}`);
    headers.push(`Base x comparado · ${base.file.label} x ${current.file.label}`,"Variação % base x comparado","Variação consumo base x comparado","Situação","Classificação");
    const columns=headers.length,tableStart=8,tableEnd=tableStart+rows.length;

    const dataRows=rows.map(r=>{
      const style=r.state==="Aumentou"?"Increase":r.state==="Reduziu"?"Decrease":"Stable";
      const v=[cell(r.code),cell(r.name)];
      if(hasTarget)v.push(cell(r.targetBalance,"Number","Number"),cell(r.targetConsumption,"Number","Number"));
      v.push(cell(r.baseBalance,"Number","Number"),cell(r.baseConsumption,"Number","Number"),cell(r.currentBalance,"Number","Number"),cell(r.currentConsumption,"Number","Number"));
      if(hasTarget)v.push(cell(r.baseVsMeta,"Number",r.baseVsMeta>0?"Increase":r.baseVsMeta<0?"Decrease":"Stable"),cell(r.currentVsMeta,"Number",r.currentVsMeta>0?"Increase":r.currentVsMeta<0?"Decrease":"Stable"));
      v.push(cell(r.deltaBalance,"Number",style),r.pct==null?cell("—"):cell(r.pct/100,"Number","Percent"),cell(r.deltaConsumption,"Number","Number"),cell(r.state,"String",style),cell(r.inclusion?"Inclusão de estoque":r.state));
      return`<Row>${v.join("")}</Row>`;
    }).join("");

    const filterText=[filters.branch!=="all"?`Filial: ${filters.branch}`:"Todas as filiais",filters.local!=="all"?`Local: ${filters.local}`:"Todos os locais",filters.usage!=="all"?`Nome utilização: ${filters.usage}`:"Todas as utilizações",filters.area!=="all"?`Área: ${filters.area}`:"Todas as áreas"].join(" | ");
    const widths=headers.map((_,i)=>i===0?85:i===1?300:110),cols=widths.map(w=>`<Column ss:AutoFitWidth="0" ss:Width="${w}"/>`).join("");
    const workbook=`<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="10"/></Style><Style ss:ID="Title"><Alignment ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="16" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#17365D" ss:Pattern="Solid"/></Style><Style ss:ID="MetaLabel"><Font ss:Bold="1" ss:Color="#17365D"/><Interior ss:Color="#D9EAF7" ss:Pattern="Solid"/></Style><Style ss:ID="MetaValue"><Font ss:Color="#1F2937"/></Style><Style ss:ID="Header"><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#2F75B5" ss:Pattern="Solid"/></Style><Style ss:ID="Number"><NumberFormat ss:Format="#,##0.00"/></Style><Style ss:ID="Percent"><NumberFormat ss:Format="0.00%"/></Style><Style ss:ID="Increase"><Font ss:Color="#006100" ss:Bold="1"/><Interior ss:Color="#C6EFCE" ss:Pattern="Solid"/><NumberFormat ss:Format="#,##0.00"/></Style><Style ss:ID="Decrease"><Font ss:Color="#9C0006" ss:Bold="1"/><Interior ss:Color="#FFC7CE" ss:Pattern="Solid"/><NumberFormat ss:Format="#,##0.00"/></Style><Style ss:ID="Stable"><Font ss:Color="#595959"/><Interior ss:Color="#E7E6E6" ss:Pattern="Solid"/><NumberFormat ss:Format="#,##0.00"/></Style></Styles><Worksheet ss:Name="Comparativo mensal"><Table>${cols}<Row ss:Height="28">${cell("GESTÃO DE ALMOXARIFADO · COMPARATIVO MENSAL","String","Title")}<Cell ss:MergeAcross="${columns-2}"/></Row>${textRow("Mês meta",hasTarget?target.file.label:"Não selecionado",columns)}${textRow("Mês base",base.file.label,columns)}${textRow("Mês comparado",current.file.label,columns)}${textRow("Filtros aplicados",filterText,columns)}${textRow("Itens no relatório",String(rows.length),columns)}<Row>${headers.map(h=>cell(h,"String","Header")).join("")}</Row>${dataRows}</Table><AutoFilter x:Range="R${tableStart}C1:R${Math.max(tableEnd,tableStart)}C${columns}" xmlns="urn:schemas-microsoft-com:office:excel"/><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>7</SplitHorizontal><TopRowBottomPane>7</TopRowBottomPane><ProtectObjects>False</ProtectObjects><ProtectScenarios>False</ProtectScenarios></WorksheetOptions></Worksheet></Workbook>`;
    return{workbook,rows,hasTarget};
  }

  async function exportStandard(event){
    const button=event.target.closest?.("#monthlyExportExcel"); if(!button)return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    const baseName=document.getElementById("monthlyBaseSelect")?.value,currentName=document.getElementById("monthlyCurrentSelect")?.value,targetName=document.getElementById("monthlyTargetSelect")?.value||"";
    if(!baseName||!currentName||baseName===currentName)return;
    const original=button.textContent;button.disabled=true;button.textContent="Gerando Excel…";
    try{
      await ensureAreas();
      const [base,current,target]=await Promise.all([loadSnapshot(baseName),loadSnapshot(currentName),targetName?loadSnapshot(targetName):Promise.resolve(null)]);
      const {workbook}=buildWorkbook(base,current,target,currentFilters());
      const blob=new Blob(["\uFEFF",workbook],{type:"application/vnd.ms-excel;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");
      a.href=url;a.download=`Comparativo_Mensal_${target?`meta_${target.file.monthKey}_${target.file.year}_`:""}base_${base.file.monthKey}_${base.file.year}_comparado_${current.file.monthKey}_${current.file.year}.xls`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);
    }catch(error){console.error("Falha ao exportar comparativo mensal.",error);const m=document.getElementById("monthlyCompareMessage");if(m)m.textContent=`Não foi possível gerar o Excel: ${error?.message||error}`;}
    finally{button.disabled=false;button.textContent=original;}
  }

  function install(){document.addEventListener("click",exportStandard,true);}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
})();
