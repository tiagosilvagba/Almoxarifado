"use strict";

(() => {
  const AREA_FILE = "./02 - Responsaveis_Reposição.CSV?excel=20260914-1";
  const areaMap = new Map();
  const monthLabel = {jan:"Janeiro",fev:"Fevereiro",mar:"Março",abr:"Abril",mai:"Maio",jun:"Junho",jul:"Julho",ago:"Agosto",set:"Setembro",out:"Outubro",nov:"Novembro",dez:"Dezembro"};

  const norm = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  const keyPart = (value) => { const s=String(value ?? "").trim(); return /^0*\d+$/.test(s) ? String(Number(s)) : norm(s); };
  const positionKey = (branch,local) => `${keyPart(branch)}::${keyPart(local)}`;
  const xml = (value) => String(value ?? "").replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]));

  function parseNumber(value){
    let text=String(value ?? "").trim();
    if(!text || text==="-" || text==="—") return 0;
    text=text.replace(/\s/g,"").replace(/R\$/gi,"").replace(/[^0-9,.-]/g,"");
    const comma=text.lastIndexOf(","), dot=text.lastIndexOf(".");
    if(comma>dot) text=text.replace(/\./g,"").replace(",",".");
    else if(dot>comma && comma>=0) text=text.replace(/,/g,"");
    else if(comma>=0) text=text.replace(",",".");
    const number=Number(text);
    return Number.isFinite(number)?number:0;
  }

  function parseCsv(text){
    text=String(text||"").replace(/^\uFEFF/,"");
    const first=(text.match(/^[^\r\n]*/)?.[0] || "");
    const delimiters=[";",",","\t","|"];
    const delimiter=delimiters.reduce((best,current)=>(first.split(current).length>first.split(best).length?current:best),";");
    const rows=[]; let row=[],field="",quoted=false;
    for(let i=0;i<text.length;i+=1){
      const char=text[i];
      if(quoted){
        if(char==='"' && text[i+1]==='"'){ field+='"'; i+=1; }
        else if(char==='"') quoted=false;
        else field+=char;
        continue;
      }
      if(char==='"'){ quoted=true; continue; }
      if(char===delimiter){ row.push(field); field=""; continue; }
      if(char==='\n' || char==='\r'){
        if(char==='\r' && text[i+1]==='\n') i+=1;
        row.push(field); field="";
        if(row.some((entry)=>String(entry).trim())) rows.push(row);
        row=[]; continue;
      }
      field+=char;
    }
    if(field || row.length){ row.push(field); if(row.some((entry)=>String(entry).trim())) rows.push(row); }
    if(!rows.length) return {headers:[],rows:[]};
    return {headers:rows.shift().map((entry)=>String(entry).trim()),rows};
  }

  function col(headers,names,contains=[]){
    const normalized=headers.map(norm);
    for(const name of names){ const index=normalized.indexOf(norm(name)); if(index>=0) return index; }
    for(const name of contains){ const index=normalized.findIndex((header)=>header.includes(norm(name))); if(index>=0) return index; }
    return -1;
  }

  async function fetchText(url,cache="default"){
    const response=await fetch(encodeURI(url),{cache});
    if(!response.ok) throw new Error(`Não foi possível ler ${url}.`);
    const buffer=await response.arrayBuffer();
    let text=new TextDecoder("utf-8").decode(buffer);
    if(text.includes("�")){ try{text=new TextDecoder("windows-1252").decode(buffer);}catch{} }
    return text;
  }

  async function ensureAreas(){
    if(areaMap.size) return;
    try{
      const parsed=parseCsv(await fetchText(AREA_FILE,"no-store"));
      const bi=col(parsed.headers,["FILIAL","CD FILIAL"]), li=col(parsed.headers,["CD LOCAL","LOCAL"]), ai=col(parsed.headers,["Área","Area"]);
      if(bi<0 || li<0 || ai<0) return;
      for(const row of parsed.rows){
        const branch=String(row[bi]??"").trim(), local=String(row[li]??"").trim(), area=String(row[ai]??"").trim();
        if(!branch || !local || !area) continue;
        const key=positionKey(branch,local), values=areaMap.get(key)||new Set();
        values.add(area); areaMap.set(key,values);
      }
    }catch(error){ console.warn("Exportação do comparativo: áreas indisponíveis.",error); }
  }

  function fileMeta(name){
    const match=String(name||"").match(/^01\s*-\s*Estoque_([A-Za-zÀ-ÿ]{3})_(\d{4})\.csv$/i);
    if(!match) return {name,label:name||"Não informado",monthKey:"",year:""};
    const key=norm(match[1]).slice(0,3), year=Number(match[2]);
    return {name,monthKey:key,year,label:`${monthLabel[key]||match[1]} ${year}`};
  }

  async function loadSnapshot(fileName){
    if(!fileName) return null;
    const parsed=parseCsv(await fetchText(`./${fileName}`));
    const h=parsed.headers;
    const ci=col(h,["Item","ITEM","Código","Codigo","Código item","Codigo item","Cd Item","CD_ITEM","Material"],["codigo item","cd item"]);
    const ni=col(h,["Nome Item","NM Item","Nm Item","NM_ITEM","Nome do Item","Descrição","Descricao","Descrição Item","Descricao Item","Descrição do Item","Descricao do Item","Nome Material","Descrição Material","Descricao Material"],["nome item","nm item","descricao item","descricao material"]);
    const si=col(h,["Saldo Real"],["saldo real"]), coi=col(h,["Consumo real","Consumo Real"],["consumo real"]);
    const bi=col(h,["CD Filial","Cd Filial","Código Filial","Codigo Filial","Filial"],["cd filial","codigo filial"]);
    const li=col(h,["Local de estoque","Local Estoque","CD Local","Cd Local","Local"],["local de estoque","local estoque","cd local"]);
    const ui=col(h,["Nome utilização","Nome utilizacao","NM Utilização","NM Utilizacao","Utilização","Utilizacao"],["nome utilizacao","nm utilizacao"]);
    if(ci<0 || si<0 || coi<0) throw new Error(`${fileName}: colunas Item, Saldo Real ou Consumo real não encontradas.`);
    const records=[];
    for(const row of parsed.rows){
      const code=String(row[ci]??"").trim(); if(!code) continue;
      const branch=bi>=0?String(row[bi]??"").trim():"", local=li>=0?String(row[li]??"").trim():"";
      records.push({code,name:ni>=0?String(row[ni]??"").trim():"",balance:parseNumber(row[si]),consumption:parseNumber(row[coi]),branch,local,usage:ui>=0?String(row[ui]??"").trim():"",areas:[...(areaMap.get(positionKey(branch,local))||[])]});
    }
    return {file:fileMeta(fileName),records};
  }

  function currentFilters(){
    return {
      branch:document.getElementById("monthlyBranchFilter")?.value||"all",
      local:document.getElementById("monthlyLocalFilter")?.value||"all",
      usage:document.getElementById("monthlyUsageFilter")?.value||"all",
      area:document.getElementById("monthlyAreaFilter")?.value||"all",
    };
  }

  function filtered(snapshot,filters){
    return (snapshot?.records||[]).filter((record)=>{
      if(filters.branch!=="all" && record.branch!==filters.branch) return false;
      if(filters.local!=="all" && record.local!==filters.local) return false;
      if(filters.usage!=="all" && record.usage!==filters.usage) return false;
      if(filters.area!=="all" && !record.areas.includes(filters.area)) return false;
      return true;
    });
  }

  function aggregate(records){
    const map=new Map();
    for(const record of records){
      const item=map.get(record.code)||{code:record.code,name:record.name,balance:0,consumption:0};
      if(!item.name && record.name) item.name=record.name;
      item.balance+=record.balance; item.consumption+=record.consumption;
      map.set(record.code,item);
    }
    return map;
  }

  function percent(oldValue,newValue){ return oldValue ? ((newValue-oldValue)/Math.abs(oldValue))*100 : (newValue?null:0); }
  function status(delta){ return delta>0.000001?"Aumentou":delta<-0.000001?"Reduziu":"Estável"; }

  function cell(value,type="String",style=""){
    const attr=style?` ss:StyleID="${style}"`:"";
    const content=type==="Number"?(Number.isFinite(Number(value))?Number(value):0):xml(value);
    return `<Cell${attr}><Data ss:Type="${type}">${content}</Data></Cell>`;
  }

  function textRow(label,value,columns){
    return `<Row>${cell(label,"String","MetaLabel")}${cell(value,"String","MetaValue")}<Cell ss:MergeAcross="${Math.max(columns-3,0)}"/></Row>`;
  }

  function buildWorkbook(base,current,target,filters){
    const bm=aggregate(filtered(base,filters)), cm=aggregate(filtered(current,filters)), tm=target?aggregate(filtered(target,filters)):new Map();
    const codes=new Set([...bm.keys(),...cm.keys(),...tm.keys()]);
    const hasTarget=Boolean(target);
    const rows=[...codes].map((code)=>{
      const b=bm.get(code)||{code,name:"",balance:0,consumption:0};
      const c=cm.get(code)||{code,name:b.name,balance:0,consumption:0};
      const t=tm.get(code)||{code,name:c.name||b.name,balance:0,consumption:0};
      const deltaBalance=c.balance-b.balance, deltaConsumption=c.consumption-b.consumption;
      return {code,name:c.name||b.name||t.name||"Item sem nome",baseBalance:b.balance,currentBalance:c.balance,deltaBalance,pct:percent(b.balance,c.balance),baseConsumption:b.consumption,currentConsumption:c.consumption,deltaConsumption,state:status(deltaBalance),targetBalance:t.balance,targetConsumption:t.consumption,baseVsTarget:b.balance-t.balance,currentVsTarget:c.balance-t.balance};
    }).sort((a,b)=>Math.abs(b.deltaBalance)-Math.abs(a.deltaBalance));

    const headers=["Item","Nome Item",`Saldo · ${base.file.label}`,`Consumo · ${base.file.label}`,`Saldo · ${current.file.label}`,`Consumo · ${current.file.label}`,"Variação saldo","Variação %","Variação consumo","Situação"];
    if(hasTarget) headers.push(`Saldo meta · ${target.file.label}`,`Consumo meta · ${target.file.label}`,`${base.file.label} x meta`,`${current.file.label} x meta`);
    const columns=headers.length;
    const tableStart=8;
    const tableEnd=tableStart+rows.length;

    const dataRows=rows.map((row)=>{
      const style=row.state==="Aumentou"?"Increase":row.state==="Reduziu"?"Decrease":"Stable";
      const values=[cell(row.code),cell(row.name),cell(row.baseBalance,"Number","Number"),cell(row.baseConsumption,"Number","Number"),cell(row.currentBalance,"Number","Number"),cell(row.currentConsumption,"Number","Number"),cell(row.deltaBalance,"Number",style),row.pct==null?cell("—"):cell(row.pct/100,"Number","Percent"),cell(row.deltaConsumption,"Number","Number"),cell(row.state,"String",style)];
      if(hasTarget) values.push(cell(row.targetBalance,"Number","Number"),cell(row.targetConsumption,"Number","Number"),cell(row.baseVsTarget,"Number",row.baseVsTarget>0?"Increase":row.baseVsTarget<0?"Decrease":"Stable"),cell(row.currentVsTarget,"Number",row.currentVsTarget>0?"Increase":row.currentVsTarget<0?"Decrease":"Stable"));
      return `<Row>${values.join("")}</Row>`;
    }).join("");

    const filterText=[filters.branch!=="all"?`Filial: ${filters.branch}`:"Todas as filiais",filters.local!=="all"?`Local: ${filters.local}`:"Todos os locais",filters.usage!=="all"?`Nome utilização: ${filters.usage}`:"Todas as utilizações",filters.area!=="all"?`Área: ${filters.area}`:"Todas as áreas"].join(" | ");
    const widths=[78,300,95,95,95,95,100,90,110,90]; if(hasTarget) widths.push(95,95,115,125);
    const cols=widths.map((width)=>`<Column ss:AutoFitWidth="0" ss:Width="${width}"/>`).join("");

    const workbook=`<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles>
<Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="10"/></Style>
<Style ss:ID="Title"><Alignment ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="16" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#17365D" ss:Pattern="Solid"/></Style>
<Style ss:ID="MetaLabel"><Font ss:Bold="1" ss:Color="#17365D"/><Interior ss:Color="#D9EAF7" ss:Pattern="Solid"/></Style>
<Style ss:ID="MetaValue"><Font ss:Color="#1F2937"/></Style>
<Style ss:ID="Header"><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#2F75B5" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9E2F3"/></Borders></Style>
<Style ss:ID="Number"><NumberFormat ss:Format="#,##0.00"/></Style>
<Style ss:ID="Percent"><NumberFormat ss:Format="0.00%"/></Style>
<Style ss:ID="Increase"><Font ss:Color="#006100" ss:Bold="1"/><Interior ss:Color="#C6EFCE" ss:Pattern="Solid"/><NumberFormat ss:Format="#,##0.00"/></Style>
<Style ss:ID="Decrease"><Font ss:Color="#9C0006" ss:Bold="1"/><Interior ss:Color="#FFC7CE" ss:Pattern="Solid"/><NumberFormat ss:Format="#,##0.00"/></Style>
<Style ss:ID="Stable"><Font ss:Color="#595959"/><Interior ss:Color="#E7E6E6" ss:Pattern="Solid"/><NumberFormat ss:Format="#,##0.00"/></Style>
</Styles>
<Worksheet ss:Name="Comparativo mensal"><Table>${cols}
<Row ss:Height="28">${cell("GESTÃO DE ALMOXARIFADO · COMPARATIVO MENSAL","String","Title")}<Cell ss:MergeAcross="${columns-2}"/></Row>
${textRow("Mês base",base.file.label,columns)}
${textRow("Mês comparado",current.file.label,columns)}
${textRow("Mês meta",hasTarget?target.file.label:"Não selecionado",columns)}
${textRow("Filtros aplicados",filterText,columns)}
${textRow("Itens no relatório",String(rows.length),columns)}
<Row>${headers.map((header)=>cell(header,"String","Header")).join("")}</Row>
${dataRows}</Table>
<AutoFilter x:Range="R${tableStart}C1:R${Math.max(tableEnd,tableStart)}C${columns}" xmlns="urn:schemas-microsoft-com:office:excel"/>
<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>7</SplitHorizontal><TopRowBottomPane>7</TopRowBottomPane><ProtectObjects>False</ProtectObjects><ProtectScenarios>False</ProtectScenarios></WorksheetOptions>
</Worksheet></Workbook>`;
    return {workbook,rows,hasTarget};
  }

  async function exportStandard(event){
    const button=event.target.closest?.("#monthlyExportExcel");
    if(!button) return;
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    const baseName=document.getElementById("monthlyBaseSelect")?.value;
    const currentName=document.getElementById("monthlyCurrentSelect")?.value;
    const targetName=document.getElementById("monthlyTargetSelect")?.value || "";
    if(!baseName || !currentName || baseName===currentName) return;
    const original=button.textContent; button.disabled=true; button.textContent="Gerando Excel…";
    try{
      await ensureAreas();
      const [base,current,target]=await Promise.all([loadSnapshot(baseName),loadSnapshot(currentName),targetName?loadSnapshot(targetName):Promise.resolve(null)]);
      const {workbook}=buildWorkbook(base,current,target,currentFilters());
      const blob=new Blob(["\uFEFF",workbook],{type:"application/vnd.ms-excel;charset=utf-8"});
      const url=URL.createObjectURL(blob), anchor=document.createElement("a");
      anchor.href=url;
      anchor.download=`Comparativo_Mensal_${base.file.monthKey}_${base.file.year}_x_${current.file.monthKey}_${current.file.year}${target?`_meta_${target.file.monthKey}_${target.file.year}`:""}.xls`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(()=>URL.revokeObjectURL(url),1200);
    }catch(error){
      console.error("Falha ao exportar comparativo mensal.",error);
      const message=document.getElementById("monthlyCompareMessage"); if(message) message.textContent=`Não foi possível gerar o Excel: ${error?.message||error}`;
    }finally{ button.disabled=false; button.textContent=original; }
  }

  function install(){ document.addEventListener("click",exportStandard,true); }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",install,{once:true}); else install();
})();
