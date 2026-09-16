"use strict";

(() => {
  const SCALE=1000;
  const nf=new Intl.NumberFormat("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
  let scheduled=false,observer=null;

  function parsePt(value){
    let text=String(value??"").trim();
    if(!text||text==="—")return null;
    const negative=/^[−-]/.test(text);
    text=text.replace(/^[+−-]/,"").replace(/\s/g,"").replace(/[^0-9,.-]/g,"");
    if(!text)return null;
    const comma=text.lastIndexOf(","),dot=text.lastIndexOf(".");
    if(comma>dot)text=text.replace(/\./g,"").replace(",",".");
    else if(dot>comma&&comma>=0)text=text.replace(/,/g,"");
    else if(comma>=0)text=text.replace(",",".");
    const n=Number(text);return Number.isFinite(n)?(negative?-n:n):null;
  }

  function scaleNode(node){
    if(!node||node.dataset.scaleMil==="1")return;
    const raw=node.textContent.trim(),value=parsePt(raw);if(value==null)return;
    const sign=raw.startsWith("+")?"+":raw.startsWith("−")||raw.startsWith("-")?"−":"";
    const next=`${sign}${nf.format(Math.abs(value*SCALE))}`;
    if(node.textContent!==next)node.textContent=next;
    node.dataset.scaleMil="1";
  }

  function apply(){
    scheduled=false;
    if(document.hidden)return;
    const page=document.getElementById("page-comparativo-mensal");if(!page)return;
    const metrics=page.querySelectorAll("#monthlyCompareMetrics .month-compare-metric strong");
    for(let i=0;i<Math.min(4,metrics.length);i++)scaleNode(metrics[i]);
    page.querySelectorAll(".month-consideration__total > strong,.month-consideration li > strong:last-child,.month-stock-inclusions__total strong,.month-stock-inclusions li > strong:last-child").forEach(scaleNode);
  }

  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(apply);}

  function install(){
    const page=document.getElementById("page-comparativo-mensal");if(!page){setTimeout(install,250);return;}
    observer?.disconnect();
    observer=new MutationObserver(mutations=>{
      for(const m of mutations){
        if(m.type!=="childList"||!m.addedNodes.length)continue;
        const el=m.target.nodeType===1?m.target:m.target.parentElement;
        if(el?.closest?.("#monthlyCompareMetrics,#monthlyConsiderations,.month-stock-inclusions")){schedule();break;}
      }
    });
    observer.observe(page,{childList:true,subtree:true});
    document.addEventListener("visibilitychange",()=>{if(!document.hidden)schedule();},{passive:true});
    schedule();
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
})();
