"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const code = fs.readFileSync(path.join(__dirname, "../app/modules/page-snapshot-pdf.js"), "utf8");

// Faz o módulo registrar as funções puras para testar os cortes sem o browser.
const context = {
  window: {},
  document: { readyState: "loading", addEventListener(){} },
  module: { exports: {} },
};
vm.runInNewContext(code, context, { filename:"page-snapshot-pdf.js" });
const { collectProtectedBands, planPageSlices } = context.module.exports;

function boundaries(slices, totalHeight) {
  assert.ok(slices.length > 0, "é necessário renderizar ao menos uma página");
  assert.equal(slices[0].start, 0, "não pode pular conteúdo no topo");
  assert.equal(slices.at(-1).end, totalHeight, "não pode cortar conteúdo ao final");
  for (let i=0; i<slices.length; i++) {
    assert.ok(slices[i].end > slices[i].start, "cada página contém pixels");
    if (i) assert.equal(slices[i].start, slices[i-1].end, "sem lacunas nem duplicações");
  }
  return slices.slice(0,-1).map((slice)=>slice.end);
}

test("desloca a divisão da página para antes do card que seria cortado", () => {
  const blocks = [{start:890,end:1180}];
  const slices = planPageSlices(2500,1000,blocks);
  const cuts = boundaries(slices,2500);
  assert.ok(cuts[0]===890, "corte fica antes do card");
  assert.ok(slices.every((slice)=>slice.end-slice.start<=1000));
  assert.ok(cuts.every(cut=>!blocks.some(b=>b.start<cut&&b.end>cut)));
});

test("aceita página mais curta para preservar um card grande que caiba por inteiro", () => {
  const blocks = [{start:260,end:1160},{start:1180,end:1500}];
  const slices = planPageSlices(1800,1000,blocks);
  const cuts = boundaries(slices,1800);
  assert.ok(cuts[0] <= 260, "o primeiro card não pode ser cortado a 1000px");
  assert.ok(cuts.every(cut=>!blocks.some(b=>b.start<cut&&b.end>cut)));
});

test("evita quebrar linha de tabela em páginas longas e mantém sequência exata", () => {
  const rows = Array.from({length:100}, (_,i)=>({start:30+i*36,end:30+i*36+32}));
  const cuts = boundaries(planPageSlices(3650,1000,rows),3650);
  assert.ok(cuts.every(cut=>!rows.some(row=>row.start<cut&&row.end>cut)));
});

test("blocos maiores que uma folha não impedem paginação de seus filhos", () => {
  const rows = [{start:980,end:1030}, {start:1875,end:1930}];
  const longPanel = {start:100,end:3300};
  const page = planPageSlices(3500,1000,[...rows,longPanel]);
  const cuts = boundaries(page,3500);
  assert.ok(cuts.length>=3);
  assert.ok(cuts.every(cut=>!rows.some(row=>row.start<cut&&row.end>cut)));
});

test("sem retângulos legíveis, reproduz os recortes convencionais sem perder informação", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(planPageSlices(2250,1000,[]))),[
    {start:0,end:1000},{start:1000,end:2000},{start:2000,end:2250},
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(planPageSlices(0,1000,[]))),[]);
});

test("captura coordenadas reais dos cards e reserva espaço após títulos", () => {
  const top = {
    tagName:"H3",
    getBoundingClientRect:()=>({top:977,bottom:996,height:19,width:240}),
    closest:()=>null,
  };
  const card = {
    tagName:"ARTICLE",
    getBoundingClientRect:()=>({top:1180,bottom:1410,height:230,width:400}),
    closest:()=>null,
  };
  const hidden = {
    tagName:"ARTICLE",
    getBoundingClientRect:()=>({top:900,bottom:1350,height:450,width:400}),
    closest:()=>true,
  };
  const target={
    scrollHeight:2500,clientHeight:2500,
    getBoundingClientRect:()=>({top:0,bottom:2500,height:2500,width:900}),
    querySelectorAll:()=>[top,card,hidden],
  };
  const bands=collectProtectedBands(target,{height:2500},1000);
  assert.equal(bands.length,2);
  assert.ok(bands.find((x)=>x.start===977&&x.end>1000),"o título deve acompanhar o próximo bloco");
  assert.ok(bands.find((x)=>x.start===1180&&x.end===1410));
  const cuts=boundaries(planPageSlices(2500,1000,bands),2500);
  assert.ok(cuts.every(cut=>!bands.some(b=>b.start<cut&&b.end>cut)));
});

test("geração PDF usa as fatias inteligentes, com a mesma qualidade JPEG e PDF A4", async () => {
  let btn, saved=false, pages=0;
  const regions=[];
  const target={
    id:"page-catalogo", dataset:{pagePanel:"catalogo"},offsetParent:{},
    scrollWidth:900,clientWidth:900,scrollHeight:2600,clientHeight:2600,
    classList:{contains:()=>false},
    getBoundingClientRect:()=>({top:0,bottom:2600,height:2600,width:900}),
    querySelectorAll:()=>[{
      tagName:"ARTICLE",closest:()=>null,
      getBoundingClientRect:()=>({top:1180,bottom:1450,height:270,width:500}),
    }],
  };
  const document={
    readyState:"complete",
    fonts:{ready:Promise.resolve()},
    documentElement:{clientWidth:900,clientHeight:850,classList:{add(){},remove(){}}},
    head:{appendChild(){}},
    querySelector:q=>q===".topbar__actions"?{querySelector:()=>({
      insertAdjacentElement(_position,node){btn=node;}
    })}:null,
    querySelectorAll:q=>q==="[data-page-panel]"?[target]:[],
    getElementById:id=>id==="pagePdfButton"?btn:null,
    createElement:tag=>{
      if(tag==="button")return {
        classList:{toggle(){}},disabled:false,
        setAttribute(){},querySelector:()=>({textContent:""}),
        addEventListener(name,callback){if(name==="click")this.click=callback;},
      };
      if(tag==="canvas")return {
        width:0,height:0,
        getContext:()=>({
          clearRect(){},
          drawImage(_canvas,sourceX,sourceY,sourceWidth,sourceHeight){
            regions.push({start:sourceY,end:sourceY+sourceHeight});
          },
        }),
        toDataURL:()=> "data:image/jpeg;base64,AA==",
      };
      return {textContent:""};
    },
  };
  const window={
    html2canvas:async(_node,opt)=>{
      opt.onclone({
        documentElement:{classList:{add(){}}},
        createElement:()=>({textContent:""}),
        head:{append(){}},
        querySelectorAll:()=>[],
      });
      return {width:900,height:2600};
    },
    __almoxPdfCanvasProLoaded:true,
    jspdf:{jsPDF:class{
      internal={pageSize:{getWidth:()=>210,getHeight:()=>297}};
      addPage(){pages++;}
      addImage(_data,type,_x,_y,width,height){
        assert.equal(type,"JPEG");
        assert.ok(width>0&&height>0);
      }
      save(name){saved=true;assert.match(name,/Catalogo/);}
    }},
    scrollX:0,scrollY:0,devicePixelRatio:1,
    matchMedia:()=>({matches:false}),scrollTo(){},
  };
  vm.runInNewContext(code,{
    window,document,module:{exports:{}},console,
    setInterval:()=>1,clearInterval(){},
    alert:message=>{throw Error(message);},
  });
  assert.ok(btn && typeof btn.click==="function");
  await btn.click();
  assert.equal(saved,true);
  assert.equal(pages,regions.length-1);
  assert.ok(regions.length>=2);
  assert.ok(regions[0].end <= 1180, "o primeiro corte deve acontecer antes do card");
  assert.equal(regions.at(-1).end,2600);
  for(let i=1;i<regions.length;i++)assert.equal(regions[i-1].end,regions[i].start);
});
