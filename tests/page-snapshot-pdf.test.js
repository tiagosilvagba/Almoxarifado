"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(ROOT, "app/modules/page-snapshot-pdf.js"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "app/styles/grouped-sidebar.css"), "utf8");

test("PDF visual utiliza renderizador que reconhece as funções modernas de cor", () => {
  assert.match(source, /html2canvas-pro@2\.5\.2\/dist\/html2canvas-pro\.min\.js/);
  assert.match(source, /HTML2CANVAS_MIRROR/);
  assert.doesNotMatch(source, /html2canvas@1\.4\.1/);
  assert.match(source, /Math\.sqrt\(maxPixels \/ \(width \* height\)\)/);
  assert.match(source, /pdf\.save\(filename\(target\)\)/);
});

test("a marca e as atualizações compartilham o topo inteiro, sem herdar a largura do menu", () => {
  const desktop = css.match(/\/\* Cabeçalho livre da largura da navegação[\s\S]*?@media \(min-width:901px\) \{([\s\S]*)$/);
  assert.ok(desktop,"o layout horizontal deve ser aplicado apenas no desktop");
  assert.match(desktop[1], /\.topbar \.topbar__content > \.brand \{/);
  assert.match(desktop[1], /width:auto !important/);
  assert.match(desktop[1], /max-width:none !important/);
  assert.match(desktop[1], /position:static !important/);
  assert.match(desktop[1], /\.brand__copy \{/);
  assert.match(desktop[1], /flex-flow:row wrap !important/);
  assert.match(desktop[1], /\.brand \.brand__meta \{/);
  assert.match(desktop[1], /\.topbar__actions \{/);
  const html = fs.readFileSync(path.join(ROOT,"index.html"),"utf8");
  assert.match(html, /<h1>Gestão de Almoxarifado<\/h1>\s*<p class="brand__meta"/);
  assert.match(html, /id="statusLine".*id="baseUpdateBadge".*id="versionBadge"/);
  const sync = fs.readFileSync(path.join(ROOT,"app/modules/layout-fix.js"),"utf8");
  assert.match(sync, /setImportant\(topbarContent,'margin-left','0'\)/);
  assert.match(sync, /setImportant\(topbarContent,'width','100%'\)/);
  assert.match(css, /html #almoxGroupedMenu,/,"o celular continua com a navegação original");
});

test("botão de PDF exporta o painel visível em páginas A4 sem depender da tela", async () => {
  let installedButton, saveName, imageCount = 0, addedPages = 0, optionsUsed;
  const ids = new Map();
  const page = {
    id:"page-dashboard", dataset:{pagePanel:"dashboard"}, offsetParent:{},
    scrollWidth:900, clientWidth:900, scrollHeight:2800, clientHeight:2800,
    classList:{contains:()=>false},
  };
  const btn = {
    classList:{toggle(){}}, disabled:false, attributes:{},
    setAttribute(k,v){this.attributes[k]=v;},
    querySelector(){return {textContent:"PDF"};},
    addEventListener(k,cb){if(k==="click")this.click=cb;},
  };
  const theme = {insertAdjacentElement(where,node){
    assert.equal(where,"afterend");
    installedButton=node;
    ids.set(node.id,node);
  }};
  const actions = {querySelector:(selector)=>selector===".theme-picker"?theme:null};
  const html = {classList:{add(){},remove(){}}};
  const makeCanvas = () => ({
    width:0,height:0,
    getContext:()=>({clearRect(){},drawImage(){}}),
    toDataURL:()=> "data:image/jpeg;base64,AA==",
  });
  const document = {
    readyState:"complete", documentElement:{clientWidth:1000,clientHeight:720,classList:html.classList},
    head:{appendChild(node){if(node.id)ids.set(node.id,node);}},
    fonts:{ready:Promise.resolve()},
    getElementById:id=>ids.get(id),
    querySelector:selector=>selector===".topbar__actions"?actions:null,
    querySelectorAll:selector=>selector==="[data-page-panel]"?[page]:[],
    createElement:tag=>tag==="canvas"?makeCanvas():tag==="button"?btn:{id:"",textContent:""},
  };
  const window = {
    __almoxPdfCanvasProLoaded:true,
    html2canvas:async(target,options)=>{
      assert.equal(target,page);
      optionsUsed=options;
      const docClone = {
        documentElement:{classList:{add(){}}},
        createElement:()=>({textContent:""}),
        head:{append(){}},
        querySelectorAll:()=>[],
      };
      options.onclone(docClone);
      return {width:900,height:2800};
    },
    jspdf:{jsPDF:class {
      internal={pageSize:{getWidth:()=>210,getHeight:()=>297}};
      addPage(){addedPages++;}
      addImage(){imageCount++;}
      save(name){saveName=name;}
    }},
    scrollX:0,scrollY:0,devicePixelRatio:1,
    matchMedia:()=>({matches:false}),
    scrollTo(){},
    setTimeout(){},
  };
  const sandbox = {window,document,console,setInterval:()=>1,clearInterval(){},alert(message){throw Error(message)}};
  vm.runInNewContext(source,sandbox,{filename:"page-snapshot-pdf.js"});
  assert.equal(installedButton.id,"pagePdfButton");
  await installedButton.click();
  assert.match(saveName,/Almoxarifado-Dashboard-\d{4}-\d{2}-\d{2}\.pdf/);
  assert.ok(imageCount>=2,"deve gerar páginas adicionais quando a captura é longa");
  assert.equal(addedPages,imageCount-1);
  assert.equal(optionsUsed.backgroundColor,"#ffffff");
  assert.ok(optionsUsed.scale<=2 && optionsUsed.scale>0);
  assert.equal(installedButton.disabled,false);
});
