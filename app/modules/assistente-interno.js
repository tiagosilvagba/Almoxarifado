
"use strict";

(function initInternalAnalyst(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root?.document) api.install(root);
})(typeof window !== "undefined" ? window : null, () => {
  const STOP = new Set(("a o os as um uma uns umas de da do das dos e ou em no na nos nas para por com sem que qual quais quanto quantos quantas quero me mostre mostrar liste listar busque buscar procure procurar encontre encontrar veja ver diga informe informacao informação sobre entre dentro todos todas todo toda itens item material materiais dados base projeto almoxarifado agora apenas somente desses dessas esse essa isso estes estas tambem também ai aí favor preciso gostaria tem têm tenho possui possuem possuir esta estão estao fica ficam existe existem houve ha há pra pro pelo pela pelos pelas dele dela deles delas meu minha meus minhas").split(/\s+/));

  const FIELD_DEFS = {
    code:{label:"Código",type:"text",aliases:["codigo","código","cod","item","material"]},
    name:{label:"Item",type:"text",aliases:["descricao","descrição","nome","produto","material"]},
    branchCode:{label:"Filial",type:"text",aliases:["filial","empresa","unidade"]},
    branchName:{label:"Filial",type:"text",aliases:["nome filial","filial nome"]},
    localCode:{label:"Local",type:"text",aliases:["local","local estoque","cd local"]},
    responsible:{label:"Reposição",type:"text",aliases:["responsavel","responsável","reposicao","reposição","repositor"]},
    area:{label:"Área",type:"text",aliases:["area","área"]},
    supplier:{label:"Fornecedor",type:"text",aliases:["fornecedor","fornecedores"]},
    requester:{label:"Solicitante",type:"text",aliases:["solicitante","requisitante","usuario","usuário"]},
    category:{label:"Categoria",type:"text",aliases:["categoria","grupo"]},
    unit:{label:"Unidade",type:"text",aliases:["unidade medida","um","u.m."]},
    balance:{label:"Saldo",type:"number",aliases:["saldo","estoque","quantidade estoque"]},
    minimum:{label:"Mínimo",type:"number",aliases:["minimo","mínimo","min"]},
    maximum:{label:"Máximo",type:"number",aliases:["maximo","máximo","max"]},
    stockValue:{label:"Valor estoque",type:"currency",aliases:["valor estoque","valor do estoque","capital estoque"]},
    averageConsumption:{label:"Consumo médio/mês",type:"number",aliases:["consumo","consumo medio","consumo médio","media consumo","média consumo"]},
    purchaseNeed:{label:"Necessidade líquida",type:"number",aliases:["necessidade","necessidade compra","compra liquida","compra líquida","repor","reposicao"]},
    purchaseValue:{label:"Valor reposição",type:"currency",aliases:["valor reposicao","valor reposição","valor compra","custo reposicao","custo reposição"]},
    coveredQuantity:{label:"Cobertura compra",type:"number",aliases:["cobertura","coberto","cobertura compra"]},
    openOfBalance:{label:"Saldo OF aberto",type:"number",aliases:["saldo of","of aberto","of pendente"]},
    leadTime:{label:"Lead time",type:"days",aliases:["lead time","leadtime","prazo reposicao","prazo reposição"]},
    scToOfDays:{label:"SC → OF",type:"days",aliases:["sc of","sc para of","tempo sc of"]},
    ofToReceiptDays:{label:"OF → Recebimento",type:"days",aliases:["of recebimento","of para recebimento","tempo of recebimento"]},
    pendingScDays:{label:"Dias SC sem OF",type:"days",aliases:["dias sc","tempo sc","sc sem of"]},
    scCount:{label:"SCs",type:"number",aliases:["sc","scs","solicitacao","solicitação"]},
    ofCount:{label:"OFs",type:"number",aliases:["of","ofs","ordem fornecimento"]},
    receiptCount:{label:"Recebimentos",type:"number",aliases:["recebimento","recebimentos","rec","nota","nf"]},
    scCodes:{label:"SC",type:"text",aliases:["numero sc","número sc","codigo sc","código sc"]},
    ofCodes:{label:"OF",type:"text",aliases:["numero of","número of","codigo of","código of"]},
    invoices:{label:"NF",type:"text",aliases:["numero nf","número nf","nota fiscal","nf"]}
  };

  const norm = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
    .replace(/[–—→]/g," ").replace(/[^a-z0-9.,%]+/g," ").replace(/\s+/g," ").trim();
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const num = (value) => { const n=Number(value); return Number.isFinite(n)?n:0; };
  const uniq = (values) => [...new Set(values.filter(v => v !== "" && v != null))];
  const fmt = new Intl.NumberFormat("pt-BR",{maximumFractionDigits:2});
  const money = new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL",maximumFractionDigits:2});

  function parseDate(value) {
    if (!value) return 0;
    const s=String(value).trim();
    const serial=/^\d{5}(?:\.\d+)?$/.test(s) ? Date.UTC(1899,11,30)+Number(s)*86400000 : 0;
    if (serial) return serial;
    const br=s.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
    if (br) return new Date(Number(br[3])<100?2000+Number(br[3]):Number(br[3]),Number(br[2])-1,Number(br[1])).getTime();
    const parsed=Date.parse(s);
    return Number.isFinite(parsed)?parsed:0;
  }

  const daysBetween = (a,b=Date.now()) => {
    const start=parseDate(a), end=typeof b==="number"?b:parseDate(b);
    return !start||!end||end<start?null:Math.round((end-start)/86400000);
  };
  const truthy = v => ["s","sim","1","true","yes"].includes(norm(v));
  const closedOf = of => !of ? true : truthy(of.closed) || /(fechad|encerrad|finalizad|concluid|cancelad)/.test(norm(of.status));
  const openOfQty = of => Math.max(0,num(of?.balance) || Math.max(0,num(of?.requestedQuantity ?? of?.quantity)-num(of?.deliveredQuantity)));

  function median(values){
    const a=values.filter(Number.isFinite).sort((x,y)=>x-y);
    if(!a.length)return null;
    const m=Math.floor(a.length/2);
    return a.length%2?a[m]:(a[m-1]+a[m])/2;
  }

  function buildRows(state){
    const needs=Array.isArray(state?.purchaseNeeds)?state.purchaseNeeds:[];
    const reviews=Array.isArray(state?.minMaxReviews)?state.minMaxReviews:[];
    const needMap=new Map(), reviewMap=new Map();
    for(const n of needs){
      const p=n.position||{};
      needMap.set([n.item?.code,p.branchCode,p.localCode].join("::"),n);
    }
    for(const r of reviews){
      const p=r.position||{};
      reviewMap.set([r.item?.code,p.branchCode,p.localCode].join("::"),r);
    }
    const rows=[];
    for(const item of state?.items||[]){
      const positions=item.positions?.length?item.positions:[{}];
      for(const position of positions){
        const key=[item.code,position.branchCode,position.localCode].join("::");
        const need=needMap.get(key), review=reviewMap.get(key);
        const history=(item.history||[]).filter(rec => !position.branchCode || !rec.branchCode || String(rec.branchCode)===String(position.branchCode));
        const scs=[],ofs=[],recs=[],suppliers=[],requesters=[],scToOf=[],ofToRec=[],pendingScAges=[];
        let openBalance=0,overdue=false,pendingSc=false;
        for(const rec of history){
          const sc=rec.sc||null,of=rec.of||null,rr=rec.rec||null;
          if(sc?.code){scs.push(String(sc.code));if(sc.requesterName)requesters.push(sc.requesterName);}
          if(of?.code){
            ofs.push(String(of.code));if(of.supplier)suppliers.push(of.supplier);
            if(!closedOf(of)){openBalance+=openOfQty(of);if(parseDate(of.deliveryDate)&&parseDate(of.deliveryDate)<Date.now())overdue=true;}
          }
          if(rr?.invoice)recs.push(String(rr.invoice));
          if(sc?.date&&of?.date){const d=daysBetween(sc.date,of.date);if(d!=null)scToOf.push(d);}
          if(of?.date&&rr?.entryDate){const d=daysBetween(of.date,rr.entryDate);if(d!=null)ofToRec.push(d);}
          if(sc?.code&&!of?.code&&!truthy(sc.cancelled)){pendingSc=true;const d=daysBetween(sc.date);if(d!=null)pendingScAges.push(d);}
        }
        const price=num(position.referencePrice ?? position.unitValue ?? item.referencePrice ?? item.unitValue ?? need?.referencePrice);
        const balance=num(position.quantity),minimum=num(position.minimum),maximum=num(position.maximum);
        const averageConsumption=num(need?.averageMonthlyConsumption ?? review?.averageMonthlyConsumption);
        const purchaseNeed=Math.max(0,num(need?.netSuggested));
        const row={
          code:String(item.code||""),name:item.name||item.detailedName||"",detailedName:item.detailedName||"",
          branchCode:String(position.branchCode||""),branchName:position.branchName||"",localCode:String(position.localCode||""),
          partition:position.partition||"",shelf:position.shelf||"",division:position.division||"",
          responsible:uniq([...(position.replenishmentResponsibles||[]),...(item.replenishmentResponsibles||[])]).join(", "),
          area:uniq([...(position.responsibleAreas||[]),...(item.responsibleAreas||[])]).join(", "),
          category:uniq(item.categories||[]).join(", "),unit:uniq(item.units||[]).join(", "),
          balance,minimum,maximum,unitPrice:price,stockValue:num(position.stockValue ?? (balance*price)),
          averageConsumption,purchaseNeed,purchaseValue:num(need?.estimatedValue ?? purchaseNeed*price),
          coveredQuantity:num(need?.coveredQuantity),coverageSource:need?.coverageSource||"",
          rupture:Boolean(need?.rupture),leadTime:num(review?.leadTimeDays),leadTimeSource:review?.leadTimeSource||"",
          scToOfDays:median(scToOf),ofToReceiptDays:median(ofToRec),pendingScDays:pendingScAges.length?Math.max(...pendingScAges):0,
          scCount:uniq(scs).length,ofCount:uniq(ofs).length,receiptCount:uniq(recs).length,
          scCodes:uniq([...(need?.scCodes||[]),...scs]).join(", "),ofCodes:uniq([...(need?.ofCodes||[]),...ofs]).join(", "),
          invoices:uniq(recs).join(", "),supplier:uniq([...suppliers,...(item.suppliers||[])]).join(", "),requester:uniq([...requesters,...(item.requesters||[])]).join(", "),
          openOfBalance:openBalance,pendingSc,hasOpenOf:openBalance>0,overdueOf:overdue,hasSc:uniq(scs).length>0,hasOf:uniq(ofs).length>0
        };
        row.stockStatus=[
          row.balance===0?"zerado":"",row.balance<0?"negativo":"",
          row.minimum>0&&row.balance>0&&row.balance<row.minimum?"abaixo minimo":"",
          row.maximum>0&&row.balance>row.maximum?"acima maximo":"",
          row.minimum>0&&row.maximum>0&&row.balance>=row.minimum&&row.balance<=row.maximum?"dentro faixa":"",
          row.pendingSc?"sc sem of":"",row.hasOpenOf?"of aberta":"",row.overdueOf?"of atrasada":"",
          row.purchaseNeed>0?"necessidade compra":"",row.averageConsumption<=0&&row.balance>0?"sem consumo":""
        ].filter(Boolean).join(" ");
        const rawContext = (() => { try { return JSON.stringify({item,position,history}); } catch { return ""; } })();
        row.search=norm(Object.values(row).filter(v=>typeof v!=="object").join(" ")+" "+rawContext);
        rows.push(row);
      }
    }
    return rows;
  }

  function entityIndex(rows){
    const defs={
      responsible:uniq(rows.map(r=>r.responsible).flatMap(v=>String(v).split(/[,;|]/)).map(v=>v.trim())),
      supplier:uniq(rows.map(r=>r.supplier).flatMap(v=>String(v).split(/[,;|]/)).map(v=>v.trim())),
      requester:uniq(rows.map(r=>r.requester).flatMap(v=>String(v).split(/[,;|]/)).map(v=>v.trim())),
      branchCode:uniq(rows.map(r=>r.branchCode)),branchName:uniq(rows.map(r=>r.branchName)),
      localCode:uniq(rows.map(r=>r.localCode)),
      category:uniq(rows.map(r=>r.category).flatMap(v=>String(v).split(/[,;|]/)).map(v=>v.trim())),
      area:uniq(rows.map(r=>r.area).flatMap(v=>String(v).split(/[,;|]/)).map(v=>v.trim())),
      name:uniq(rows.map(r=>r.name)),
      code:uniq(rows.map(r=>r.code))
    };
    const out=[];
    for(const [field,values] of Object.entries(defs))for(const value of values){
      const n=norm(value);if(n.length>=2)out.push({field,value,n});
    }
    return out.sort((a,b)=>b.n.length-a.n.length);
  }

  const ENTITY_FIELD_PRIORITY={responsible:90,supplier:80,requester:75,branchName:70,branchCode:68,localCode:64,area:60,category:55,name:50,code:48};
  const ENTITY_CUES={
    responsible:["responsavel","responsável","repositor","reposicao","reposição"],
    supplier:["fornecedor"],
    requester:["solicitante","requisitante","usuario","usuário"],
    branchName:["filial","empresa"],branchCode:["filial","empresa"],
    localCode:["local"],area:["area","área"],category:["categoria","grupo","subgrupo"],
    name:["item","material","produto","descricao","descrição"],code:["codigo","código","cod"]
  };
  const QUERY_NOISE=new Set(("zerado zerados zerada zeradas saldo negativo negativos negativa negativas abaixo acima minimo mínimo maximo máximo faixa sc of nf aberta aberto atrasada atrasado pendente pendentes consumo ruptura necessidade compra compras reposicao reposição valor valores total media média maior maiores menor menores top dias dia estoque quantidade").split(/\s+/).map(norm));

  function tokenList(value){
    return norm(value).split(" ").filter(t=>t.length>=2);
  }

  function hasCue(query,field){
    const n=" "+norm(query)+" ";
    return (ENTITY_CUES[field]||[]).some(c=>n.includes(" "+norm(c)+" "));
  }

  function fuzzyEntityMatches(query,index,currentFilters=[]){
    const qTokens=tokenList(query).filter(t=>!STOP.has(t)&&!QUERY_NOISE.has(t)&&!/^\d+$/.test(t));
    const qSet=new Set(qTokens);
    if(!qSet.size)return [];
    const tokenOwners=new Map();
    for(const entity of index){
      const id=entity.field+"|"+entity.n;
      for(const token of tokenList(entity.n).filter(t=>t.length>=4)){
        if(!tokenOwners.has(token))tokenOwners.set(token,new Set());
        tokenOwners.get(token).add(id);
      }
    }
    const candidates=[];
    for(const entity of index){
      if(currentFilters.some(f=>f.field===entity.field&&norm(f.value)===entity.n))continue;
      const eTokens=tokenList(entity.n).filter(t=>t.length>=3&&!STOP.has(t));
      if(!eTokens.length)continue;
      const matched=eTokens.filter(t=>qSet.has(t));
      if(!matched.length)continue;
      const uniqueSingle=matched.length===1&&matched[0].length>=4&&(tokenOwners.get(matched[0])?.size||0)===1;
      const explicit=hasCue(query,entity.field);
      if(matched.length<2&&!uniqueSingle&&!explicit)continue;
      const coverage=matched.length/eTokens.length;
      const score=matched.length*100+coverage*35+(ENTITY_FIELD_PRIORITY[entity.field]||0)+(explicit?30:0);
      candidates.push({...entity,matched,score});
    }
    candidates.sort((a,b)=>b.score-a.score||b.matched.length-a.matched.length||b.n.length-a.n.length);
    const chosen=[],usedTokens=new Set(),usedFields=new Set();
    for(const candidate of candidates){
      if(usedFields.has(candidate.field))continue;
      const fresh=candidate.matched.filter(t=>!usedTokens.has(t));
      if(!fresh.length)continue;
      if(candidate.matched.length===1&&!hasCue(query,candidate.field)&&(tokenOwners.get(candidate.matched[0])?.size||0)!==1)continue;
      chosen.push(candidate);
      candidate.matched.forEach(t=>usedTokens.add(t));
      usedFields.add(candidate.field);
    }
    return chosen;
  }

  function searchHasToken(search,term){
    const hay=" "+norm(search)+" ",needle=" "+norm(term)+" ";
    return hay.includes(needle);
  }

  function distinctMetricCount(rows,field){
    if(!field)return rows.length;
    const values=new Set();
    for(const row of rows){
      const raw=row[field];
      if(raw==null||raw==="")continue;
      if(["scCodes","ofCodes","invoices"].includes(field)){
        String(raw).split(/[,;|]/).map(v=>v.trim()).filter(Boolean).forEach(v=>values.add(v));
      }else values.add(String(raw));
    }
    return values.size;
  }
  function fieldFromText(text){
    const n=norm(text);let best=null;
    for(const [field,def] of Object.entries(FIELD_DEFS))for(const alias of def.aliases){
      const a=norm(alias);
      if(n.includes(a)&&(!best||a.length>best.alias.length))best={field,alias:a};
    }
    return best?.field||null;
  }

  function extractNumber(text){
    const m=String(text).match(/-?\d[\d.]*([,]\d+)?/);if(!m)return null;
    const raw=m[0];
    if(raw.includes(",")&&raw.includes("."))return Number(raw.replace(/\./g,"").replace(",","."));
    if(raw.includes(","))return Number(raw.replace(",","."));
    if((raw.match(/\./g)||[]).length&&/\.\d{3}(?:\.|$)/.test(raw))return Number(raw.replace(/\./g,""));
    return Number(raw);
  }

  function parseNumericFilters(query){
    const n=norm(query),out=[],aliases=[];
    for(const [field,def] of Object.entries(FIELD_DEFS))if(["number","currency","days"].includes(def.type))for(const alias of def.aliases)aliases.push([norm(alias),field]);
    aliases.sort((a,b)=>b[0].length-a[0].length);
    for(const [alias,field] of aliases){
      const escaped=alias.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
      const re=new RegExp("(?:\\b"+escaped+"\\b)\\s*(?:for|de)?\\s*(maior(?: que)?|acima(?: de)?|mais de|menor(?: que)?|abaixo(?: de)?|menos de|igual(?: a)?|=|>|<)?\\s*(?:r\\$)?\\s*(-?\\d[\\d.,]*)","i");
      const m=n.match(re);if(!m)continue;
      const value=extractNumber(m[2]);if(value==null)continue;
      const op=/menor|abaixo|menos|</.test(m[1]||"")?"<":/igual|=/.test(m[1]||"")?"=":">";
      if(!out.some(f=>f.field===field&&f.value===value&&f.op===op))out.push({field,op,value,label:`${FIELD_DEFS[field].label} ${op} ${value}`});
    }
    return out;
  }

  function parsePlan(query,rows,previous=null){
    const original=String(query||"").trim(),n=norm(original);
    const contextual=Boolean(previous&&/^(agora|so |somente|apenas|desses|dessas|destes|destas|tire|retire|exclua|quanto|e |tambem|também)/i.test(original));
    const plan=contextual?JSON.parse(JSON.stringify(previous)):{filters:[],excludes:[],textTerms:[],groupBy:null,sort:null,limit:50,intent:"list",metrics:[],columns:[]};
    plan.query=original;
    const add=(field,op,value,label,exclude=false)=>{
      const target=exclude?plan.excludes:plan.filters,sig=`${field}|${op}|${norm(value)}`;
      if(!target.some(f=>`${f.field}|${f.op}|${norm(f.value)}`===sig))target.push({field,op,value,label});
    };

    if(/zerad|saldo zero|sem saldo/.test(n))add("balance","=",0,"saldo zerado");
    if(/saldo negativ/.test(n))add("balance","<",0,"saldo negativo");
    if(/abaixo (do )?minim/.test(n))add("_status","=","below-min","abaixo do mínimo");
    if(/acima (do )?maxim/.test(n))add("_status","=","above-max","acima do máximo");
    if(/dentro (da )?faixa|entre minimo e maximo/.test(n))add("_status","=","within","dentro da faixa");
    if(/sem sc|nao (tem|possui|tenham|possuem) sc/.test(n))add("hasSc","=",false,"sem SC");
    if(/sem sc (ou|e) of|sem sc\/of/.test(n)){add("hasSc","=",false,"sem SC");add("hasOf","=",false,"sem OF");}
    if(/com sc|possui sc|tenham sc/.test(n))add("hasSc","=",true,"com SC");
    if(/sc sem of|sc pendente|aguardando of/.test(n))add("pendingSc","=",true,"SC sem OF");
    if(/sem of|nao (tem|possui|tenham|possuem) of/.test(n))add("hasOf","=",false,"sem OF");
    if(/com of|of aberta|of em aberto|of pendente/.test(n))add("hasOpenOf","=",true,"OF aberta");
    if(/of atrasad|entrega atrasad|vencid/.test(n))add("overdueOf","=",true,"OF atrasada");
    if(/sem consumo|nao (tem|teve|tiveram) consumo/.test(n))add("averageConsumption","<=",0,"sem consumo");
    if(/com consumo|teve consumo|tiveram consumo/.test(n))add("averageConsumption",">",0,"com consumo");
    if(/ruptur/.test(n))add("rupture","=",true,"ruptura");
    if(/necessidade de compra|precisam? de reposicao|repor|compra liquida/.test(n))add("purchaseNeed",">",0,"com necessidade de compra");

    for(const f of parseNumericFilters(original))add(f.field,f.op,f.value,f.label);

    const idx=entityIndex(rows);let residue=" "+n+" ";
    for(const entity of idx){
      if(entity.n.length<3)continue;
      if(residue.includes(" "+entity.n+" ")){
        add(entity.field,"contains",entity.value,`${FIELD_DEFS[entity.field]?.label||entity.field}: ${entity.value}`);
        residue=residue.replace(" "+entity.n+" "," ");
      }
    }

    for(const entity of fuzzyEntityMatches(original,idx,plan.filters||[])){
      add(entity.field,"contains",entity.value,`${FIELD_DEFS[entity.field]?.label||entity.field}: ${entity.value}`);
    }

    const codeMatch=n.match(/(?:codigo|cod|item)?\s*\b(\d{4,})\b/);
    if(codeMatch&&rows.some(r=>r.code===codeMatch[1]))add("code","=",codeMatch[1],`Código ${codeMatch[1]}`);
    const scMatch=n.match(/\bsc\s*(?:n|numero|número|codigo|código)?\s*[:#-]?\s*(\d{3,})\b/);
    const ofMatch=n.match(/\bof\s*(?:n|numero|número|codigo|código)?\s*[:#-]?\s*(\d{3,})\b/);
    const nfMatch=n.match(/\b(?:nf|nota fiscal)\s*(?:n|numero|número)?\s*[:#-]?\s*(\d{3,})\b/);
    if(scMatch)add("scCodes","contains",scMatch[1],`SC ${scMatch[1]}`);
    if(ofMatch)add("ofCodes","contains",ofMatch[1],`OF ${ofMatch[1]}`);
    if(nfMatch)add("invoices","contains",nfMatch[1],`NF ${nfMatch[1]}`);

    const groupMap=[["supplier","fornecedor"],["responsible","responsavel"],["branchCode","filial"],["localCode","local"],["category","categoria"],["requester","solicitante"],["area","area"]];
    for(const [field,word] of groupMap)if(new RegExp("(por|agrup|separ).*"+word).test(n)){plan.groupBy=field;break;}
    if(!plan.groupBy){
      for(const [field,word] of groupMap){
        if(new RegExp("(^| )qual(?: o| a)? "+word+"(?: |$)").test(n)||new RegExp("(^| )"+word+".*(maior|mais|menor|menos|total)").test(n)){
          plan.groupBy=field;break;
        }
      }
    }

    if(/quantos|quantas|contagem|numero de|número de/.test(n)){
      plan.intent="aggregate";plan.metrics=["count"];
      if(/\b(itens|item|materiais|material|codigos|codigo)\b/.test(n)){plan.countField="code";plan.countLabel="itens";}
      else if(/\b(ofs|of)\b/.test(n)){plan.countField="ofCodes";plan.countLabel="OFs";}
      else if(/\b(scs|sc)\b/.test(n)){plan.countField="scCodes";plan.countLabel="SCs";}
      else if(/\b(recebimentos|nf|nfs|notas)\b/.test(n)){plan.countField="invoices";plan.countLabel="recebimentos";}
      else {plan.countField=null;plan.countLabel="registros";}
    }
    if(/quanto (custa|vale)|valor total|some|soma|total de valor|capital/.test(n)){
      plan.intent="aggregate";
      plan.metrics=uniq([...(plan.metrics||[]),n.includes("repos")||n.includes("compr")?"sum:purchaseValue":"sum:stockValue"]);
    }
    if(/media|média/.test(n)){
      const f=fieldFromText(n)||"averageConsumption";plan.intent="aggregate";plan.metrics=uniq([...(plan.metrics||[]),`avg:${f}`]);
    }
    if(plan.groupBy){
      plan.groupMetric=/valor.*repos|repos.*valor|valor.*compra/.test(n)?"purchaseValue":
        /valor.*estoque|capital/.test(n)?"stockValue":
        /necessidade|compra liquida/.test(n)?"purchaseNeed":
        /saldo of|of aberta|of pendente/.test(n)?"openOfBalance":
        /\bsaldo\b|quantidade/.test(n)?"balance":"count";
    }
    if(/maior|maiores|mais alto|top/.test(n)){
      const f=fieldFromText(n)||(n.includes("atras")?"pendingScDays":n.includes("valor")?"stockValue":n.includes("consumo")?"averageConsumption":"purchaseValue");
      plan.sort={field:f,dir:"desc"};
    }
    if(/menor|menores|mais baixo/.test(n)){const f=fieldFromText(n)||"stockValue";plan.sort={field:f,dir:"asc"};}
    const top=n.match(/(?:top|primeir[oa]s?|maiores|menores)\s*(\d{1,4})/);if(top)plan.limit=Math.max(1,Math.min(1000,Number(top[1])));

    const excludeEntity=/\b(tire|retire|exclua|menos)\s+(.+)/i.exec(original);
    if(excludeEntity){
      const tail=norm(excludeEntity[2]),ent=idx.find(e=>tail.includes(e.n));
      if(ent)add(ent.field,"contains",ent.value,`excluir ${ent.value}`,true);
    }

    const recognized=new Set();
    for(const def of Object.values(FIELD_DEFS))for(const a of def.aliases)norm(a).split(" ").forEach(t=>recognized.add(t));
    (plan.filters||[]).forEach(f=>norm(f.value).split(" ").forEach(t=>recognized.add(t)));
    const terms=norm(original).split(" ").filter(t=>t.length>2&&!STOP.has(t)&&!recognized.has(t)&&!QUERY_NOISE.has(t)&&!/^(maior|menor|acima|abaixo|media|total|dias|reais|real|top)$/.test(t)&&(!/^\d+$/.test(t)||t.length>=4));
    const useful=terms.filter(t=>rows.some(r=>searchHasToken(r.search,t)));
    plan.textTerms=uniq(contextual?[...(plan.textTerms||[]),...useful]:useful).slice(0,8);

    const cols=["code","name","branchCode","localCode"];
    for(const field of Object.keys(FIELD_DEFS))if(FIELD_DEFS[field].aliases.some(a=>n.includes(norm(a))))cols.push(field);
    if(plan.filters.some(f=>f.field==="responsible"))cols.push("responsible");
    if(plan.filters.some(f=>["hasSc","pendingSc"].includes(f.field)))cols.push("scCodes","pendingScDays");
    if(plan.filters.some(f=>["hasOf","hasOpenOf","overdueOf"].includes(f.field)))cols.push("ofCodes","supplier","openOfBalance");
    if(plan.filters.some(f=>f.field==="purchaseNeed"))cols.push("purchaseNeed","purchaseValue");
    plan.columns=uniq([...cols,"balance","minimum","maximum"]).slice(0,12);
    return plan;
  }

  function compare(row,f){
    const value=row[f.field];
    if(f.field==="_status"){
      if(f.value==="below-min")return row.minimum>0&&row.balance>=0&&row.balance<row.minimum;
      if(f.value==="above-max")return row.maximum>0&&row.balance>row.maximum;
      if(f.value==="within")return row.minimum>0&&row.maximum>0&&row.balance>=row.minimum&&row.balance<=row.maximum;
    }
    if(f.op==="contains")return norm(value).includes(norm(f.value));
    if(f.op==="=")return typeof f.value==="boolean"?Boolean(value)===f.value:String(value)===String(f.value);
    if(f.op===">")return num(value)>num(f.value);
    if(f.op===">=")return num(value)>=num(f.value);
    if(f.op==="<")return num(value)<num(f.value);
    if(f.op==="<=")return num(value)<=num(f.value);
    return true;
  }

  function runPlan(plan,rows){
    let result=rows.filter(r=>(plan.filters||[]).every(f=>compare(r,f))&&!(plan.excludes||[]).some(f=>compare(r,f))&&(plan.textTerms||[]).every(t=>r.search.includes(norm(t))));
    const totalMatched=result.length;
    if(plan.sort)result.sort((a,b)=>(num(a[plan.sort.field])-num(b[plan.sort.field]))*(plan.sort.dir==="asc"?1:-1));
    let groups=null;
    if(plan.groupBy){
      const map=new Map();
      for(const r of result){
        const key=String(r[plan.groupBy]||"Não informado");
        const g=map.get(key)||{key,count:0,stockValue:0,purchaseValue:0,balance:0,purchaseNeed:0,openOfBalance:0};
        g.count++;g.stockValue+=num(r.stockValue);g.purchaseValue+=num(r.purchaseValue);g.balance+=num(r.balance);g.purchaseNeed+=num(r.purchaseNeed);g.openOfBalance+=num(r.openOfBalance);map.set(key,g);
      }
      groups=[...map.values()].sort((a,b)=>b.count-a.count);
    }
    return {rows:result.slice(0,plan.limit||50),allRows:result,totalMatched,groups};
  }

  function formatField(field,value){
    const type=FIELD_DEFS[field]?.type;
    if(type==="currency")return money.format(num(value));
    if(type==="days")return value==null||value===""?"—":`${fmt.format(num(value))} dias`;
    if(type==="number")return fmt.format(num(value));
    if(typeof value==="boolean")return value?"Sim":"Não";
    return value==null||value===""?"—":String(value);
  }

  function aggregateText(plan,result){
    const rows=result.allRows,parts=[];
    for(const metric of plan.metrics||[]){
      if(metric==="count")parts.push(`${rows.length.toLocaleString("pt-BR")} registros encontrados`);
      else{
        const [op,field]=metric.split(":"),vals=rows.map(r=>num(r[field]));
        const value=op==="sum"?vals.reduce((a,b)=>a+b,0):(vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:0);
        parts.push(`${op==="sum"?"Total":"Média"} de ${FIELD_DEFS[field]?.label||field}: ${formatField(field,value)}`);
      }
    }
    return parts.join(" · ");
  }

  function describe(plan,result){
    const criteria=[...(plan.filters||[]).map(f=>f.label),...(plan.excludes||[]).map(f=>f.label),...(plan.textTerms||[]).map(t=>`texto “${t}”`)];
    if(!result.totalMatched)return `Não encontrei registros com os critérios interpretados${criteria.length?": "+criteria.join(" · "):""}.`;
    if(plan.intent==="aggregate"&&plan.metrics?.length)return aggregateText(plan,result)+` · base: ${result.totalMatched.toLocaleString("pt-BR")} posições`;
    if(plan.groupBy)return `Encontrei ${result.totalMatched.toLocaleString("pt-BR")} posições e agrupei por ${FIELD_DEFS[plan.groupBy]?.label||plan.groupBy}.`;
    return `Encontrei ${result.totalMatched.toLocaleString("pt-BR")} posições${criteria.length?" com "+criteria.join(" · "):""}.`;
  }

  function install(windowObject){
    if(windowObject.__almoxInternalAnalystInstalled)return;
    windowObject.__almoxInternalAnalystInstalled=true;
    const {document}=windowObject;
    let rows=[],lastPlan=null,lastResult=null,readySig="";

    function inject(){
      const nav=document.querySelector(".app-nav"),host=document.getElementById("catalogContent");
      if(!nav||!host)return false;
      if(!nav.querySelector('[data-page="assistente-ia"]')){
        const link=document.createElement("a");
        link.className="app-nav__tab";link.href="#assistente-ia";link.dataset.page="assistente-ia";link.role="tab";
        link.innerHTML='<svg class="ai-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8v3h3v10h-3v3H8v-3H5V7h3V4Zm2 5v2m4-2v2m-4 4h4"/></svg><span>Assistente IA</span>';
        nav.insertBefore(link,nav.querySelector('[data-page="instrucoes"]'));
      }
      if(!document.getElementById("page-assistente-ia")){
        const page=document.createElement("section");
        page.id="page-assistente-ia";page.dataset.pagePanel="assistente-ia";page.className="page-panel is-hidden";
        page.innerHTML=`
          <div class="ai-head"><div><span class="eyebrow">Inteligência interna · sem API externa</span><h2>Assistente Analítico</h2><p>Faça perguntas livres. O assistente interpreta sua intenção, cruza estoque, consumo, responsáveis, SC, OF, recebimentos, necessidade de compra e lead time usando apenas os dados carregados neste navegador.</p></div><span id="aiStatus" class="context-label">Preparando índice…</span></div>
          <section class="ai-shell">
            <div id="aiConversation" class="ai-conversation" aria-live="polite">
              <article class="ai-message ai-message--assistant"><div class="ai-avatar">IA</div><div><strong>Assistente local pronto para analisar o almoxarifado.</strong><p>Você não precisa usar frases prontas. Escreva naturalmente, combine critérios e faça perguntas de continuação.</p></div></article>
            </div>
            <div class="ai-suggestions">
              <button type="button">Quais itens estão zerados e sem SC ou OF?</button>
              <button type="button">Agrupe o valor de reposição por responsável</button>
              <button type="button">Quais fornecedores têm OF aberta e atrasada?</button>
              <button type="button">Top 20 itens acima do máximo por valor de estoque</button>
            </div>
            <form id="aiForm" class="ai-composer">
              <textarea id="aiInput" rows="3" placeholder="Pergunte qualquer coisa sobre os dados do almoxarifado…" autocomplete="off"></textarea>
              <div class="ai-composer__actions"><span id="aiHint">Processamento 100% local no navegador</span><button id="aiClear" type="button" class="button button--ghost">Nova conversa</button><button type="submit" class="button button--primary">Pesquisar</button></div>
            </form>
          </section>`;
        host.appendChild(page);
      }
      return true;
    }

    function styles(){
      if(document.getElementById("aiInternalStyle"))return;
      const s=document.createElement("style");
      s.id="aiInternalStyle";
      s.textContent=`
        .ai-nav-icon{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
        .ai-head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px}.ai-head h2{margin:4px 0 7px}.ai-head p{max-width:900px;margin:0;color:var(--muted)}
        .ai-shell{display:grid;gap:14px;min-height:620px}.ai-conversation{display:flex;flex-direction:column;gap:14px;min-height:390px;max-height:65vh;overflow:auto;padding:18px;border:1px solid var(--steel-200);border-radius:20px;background:var(--surface)}
        .ai-message{display:flex;gap:11px;max-width:min(100%,1100px);padding:13px 14px;border-radius:16px}.ai-message--assistant{align-self:flex-start;background:color-mix(in srgb,var(--surface) 85%,var(--blue-100));border:1px solid var(--steel-200)}.ai-message--user{align-self:flex-end;background:var(--navy-800);color:#fff}.ai-message p{margin:6px 0 0;line-height:1.5}
        .ai-avatar{width:34px;height:34px;flex:0 0 34px;display:grid;place-items:center;border-radius:10px;background:linear-gradient(135deg,var(--blue-600),var(--violet));color:#fff;font-size:.72rem;font-weight:900}
        .ai-criteria{display:flex;flex-wrap:wrap;gap:5px;margin-top:9px}.ai-criteria span{padding:4px 7px;border-radius:999px;background:color-mix(in srgb,var(--steel-100) 82%,transparent);font-size:.68rem}
        .ai-table-wrap{max-width:100%;overflow:auto;margin-top:11px;border:1px solid var(--steel-200);border-radius:12px}.ai-table{width:100%;border-collapse:collapse;min-width:760px;font-size:.73rem}.ai-table th,.ai-table td{padding:8px 9px;border-bottom:1px solid var(--steel-100);text-align:left;white-space:nowrap}.ai-table th{position:sticky;top:0;background:var(--surface);z-index:1}
        .ai-groups{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;margin-top:11px}.ai-group{padding:10px;border:1px solid var(--steel-200);border-radius:11px;background:color-mix(in srgb,var(--surface) 90%,var(--steel-100))}.ai-group strong,.ai-group small{display:block}.ai-group b{display:block;margin-top:4px;font-size:1rem}
        .ai-suggestions{display:flex;gap:7px;overflow:auto;padding-bottom:2px}.ai-suggestions button{flex:0 0 auto;padding:7px 10px;border:1px solid var(--steel-200);border-radius:999px;background:var(--surface);color:var(--text);font-size:.72rem}
        .ai-composer{padding:12px;border:1px solid var(--steel-200);border-radius:16px;background:var(--surface)}.ai-composer textarea{width:100%;resize:vertical;min-height:74px;padding:12px;border:0;outline:0;background:transparent;color:var(--text);font:inherit}.ai-composer__actions{display:flex;align-items:center;gap:8px;border-top:1px solid var(--steel-100);padding-top:10px}.ai-composer__actions span{margin-right:auto;color:var(--muted);font-size:.72rem}
        @media(max-width:700px){.ai-head{display:grid}.ai-conversation{max-height:none}.ai-composer__actions{flex-wrap:wrap}.ai-composer__actions span{width:100%}.ai-message{max-width:100%}}
      `;
      document.head.appendChild(s);
    }

    function refreshRows(force=false){
      const st=windowObject.__almoxState||(typeof state!=="undefined"?state:null);
      const sig=`${st?.items?.length||0}|${st?.purchaseNeeds?.length||0}|${st?.minMaxReviews?.length||0}`;
      if(force||sig!==readySig){rows=buildRows(st||{});readySig=sig;}
      const status=document.getElementById("aiStatus");
      if(status)status.textContent=`${rows.length.toLocaleString("pt-BR")} posições indexadas`;
      return rows;
    }

    function rowTable(result,plan){
      const cols=uniq((plan.columns||[]).filter(c=>result.rows.some(r=>r[c]!==undefined))).slice(0,12);
      if(!cols.length||!result.rows.length)return "";
      const head=cols.map(c=>`<th>${esc(FIELD_DEFS[c]?.label||c)}</th>`).join("");
      const body=result.rows.map(r=>`<tr>${cols.map(c=>`<td>${esc(formatField(c,r[c]))}</td>`).join("")}</tr>`).join("");
      return `<div class="ai-table-wrap"><table class="ai-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
    }

    function groupCards(result,plan){
      if(!result.groups?.length)return "";
      return `<div class="ai-groups">${result.groups.slice(0,50).map(g=>`<article class="ai-group"><strong>${esc(g.key)}</strong><small>${g.count} posições</small><b>${money.format(g.purchaseValue||g.stockValue)}</b><small>${g.purchaseValue?"valor reposição":"valor estoque"}</small></article>`).join("")}</div>`;
    }

    function answer(question){
      refreshRows();
      const plan=parsePlan(question,rows,lastPlan),result=runPlan(plan,rows);
      lastPlan=plan;lastResult=result;
      const criteria=[...(plan.filters||[]).map(f=>f.label),...(plan.excludes||[]).map(f=>f.label),...(plan.textTerms||[]).map(t=>`busca: ${t}`)];
      return {plan,result,html:`<strong>${esc(describe(plan,result))}</strong>${criteria.length?`<div class="ai-criteria">${criteria.map(x=>`<span>${esc(x)}</span>`).join("")}</div>`:""}${groupCards(result,plan)}${plan.intent!=="aggregate"?rowTable(result,plan):""}`};
    }

    function append(kind,html,textOnly=false){
      const box=document.getElementById("aiConversation");if(!box)return;
      const article=document.createElement("article");article.className=`ai-message ai-message--${kind}`;
      article.innerHTML=kind==="assistant"?`<div class="ai-avatar">IA</div><div>${html}</div>`:`<div>${textOnly?esc(html):html}</div>`;
      box.appendChild(article);box.scrollTop=box.scrollHeight;
    }

    function ask(value){
      const q=String(value||"").trim();if(!q)return;
      append("user",q,true);
      try{const response=answer(q);append("assistant",response.html);}
      catch(error){console.error("Assistente interno",error);append("assistant",`<strong>Não consegui concluir esta consulta.</strong><p>${esc(error.message||"Erro inesperado")}</p>`);}
    }

    function open(){
      const page=document.getElementById("page-assistente-ia");if(!page)return;
      document.getElementById("loadingPanel")?.classList.add("is-hidden");
      document.getElementById("catalogContent")?.classList.remove("is-hidden");
      document.querySelectorAll("[data-page-panel]").forEach(p=>{const active=p===page;p.classList.toggle("is-hidden",!active);p.inert=!active;p.setAttribute("aria-hidden",String(!active));});
      document.querySelectorAll(".app-nav__tab").forEach(link=>{const active=link.dataset.page==="assistente-ia";link.classList.toggle("is-active",active);link.setAttribute("aria-selected",String(active));link.setAttribute("aria-current",active?"page":"false");link.tabIndex=active?0:-1;});
      if(windowObject.location.hash!=="#assistente-ia")windowObject.history.replaceState(null,"","#assistente-ia");
      refreshRows();windowObject.scrollTo({top:0,behavior:"auto"});
      setTimeout(()=>document.getElementById("aiInput")?.focus(),50);
    }

    function bind(){
      document.addEventListener("click",event=>{const link=event.target.closest?.('.app-nav__tab[data-page="assistente-ia"]');if(!link)return;event.preventDefault();event.stopImmediatePropagation();open();},true);
      windowObject.addEventListener("hashchange",()=>{if(windowObject.location.hash==="#assistente-ia")open();});
      windowObject.addEventListener("almox-global-filters-applied",()=>refreshRows(true));
      document.getElementById("aiForm")?.addEventListener("submit",event=>{event.preventDefault();const input=document.getElementById("aiInput");ask(input?.value);if(input)input.value="";});
      document.getElementById("aiInput")?.addEventListener("keydown",event=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();document.getElementById("aiForm")?.requestSubmit();}});
      document.querySelectorAll(".ai-suggestions button").forEach(btn=>btn.addEventListener("click",()=>ask(btn.textContent)));
      document.getElementById("aiClear")?.addEventListener("click",()=>{
        lastPlan=null;lastResult=null;
        const box=document.getElementById("aiConversation");
        if(box)box.innerHTML='<article class="ai-message ai-message--assistant"><div class="ai-avatar">IA</div><div><strong>Nova conversa iniciada.</strong><p>Faça uma pergunta livre sobre os dados carregados.</p></div></article>';
      });
    }

    function start(){
      styles();
      if(!inject()){setTimeout(start,250);return;}
      bind();refreshRows();
      if(windowObject.location.hash==="#assistente-ia")setTimeout(open,100);
    }

    if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});
    else start();

    windowObject.__almoxInternalAnalyst={
      buildRows,parsePlan,runPlan,ask,
      refresh:()=>refreshRows(true),
      get lastPlan(){return lastPlan;},
      get lastResult(){return lastResult;}
    };
  }

  return {norm,buildRows,parsePlan,runPlan,install,FIELD_DEFS};
});
