"use strict";

(() => {
  const DESKTOP_MIN = 901;
  const SIDE_WIDTH = 250;
  let resizeTimer = null;
  let topbarObserver = null;
  let structureObserver = null;

  function isDesktop(){ return window.innerWidth >= DESKTOP_MIN; }
  function setImportant(node,prop,value){ if(node) node.style.setProperty(prop,value,"important"); }
  function clear(node,props){ if(!node)return; props.forEach(p=>node.style.removeProperty(p)); }

  /*
   * O comparativo mensal era criado no final do <main>, fora de #catalogContent.
   * Como #catalogContent ocupa no mínimo uma viewport, isso reservava uma tela vazia
   * antes do comparativo. Todas as páginas da aplicação devem ser filhas do mesmo
   * container de conteúdo. Esta rotina garante essa estrutura mesmo se o módulo do
   * comparativo for carregado depois deste arquivo.
   */
  function normalizeMonthlyPagePlacement(){
    const catalog=document.getElementById('catalogContent');
    const page=document.getElementById('page-comparativo-mensal');
    if(!catalog||!page)return false;

    if(page.parentElement!==catalog){
      catalog.appendChild(page);
    }

    page.style.removeProperty('margin-top');
    page.style.removeProperty('top');
    page.style.removeProperty('transform');
    page.style.removeProperty('position');
    return true;
  }

  function alignDesktopChrome(){
    normalizeMonthlyPagePlacement();
    const topbar=document.querySelector('.topbar');
    const topbarContent=document.querySelector('.topbar__content');
    const navWrap=document.querySelector('.app-nav-wrap');
    const nav=navWrap?.querySelector('.app-nav');
    const main=document.querySelector('main.main-content');
    if(!topbar||!navWrap||!nav||!main)return false;

    if(!isDesktop()){
      document.documentElement.classList.remove('desktop-layout-synced');
      clear(topbarContent,['margin-left','width','max-width','padding-left','padding-right']);
      clear(navWrap,['top','left','right','bottom','width','height','max-height']);
      clear(main,['margin-left','width','max-width']);
      return true;
    }

    document.documentElement.classList.add('desktop-layout-synced');
    const rect=topbar.getBoundingClientRect();
    const top=Math.max(0,Math.round(rect.bottom));
    const side=`${SIDE_WIDTH}px`;
    const contentPad='clamp(18px,2.2vw,34px)';

    setImportant(navWrap,'position','fixed');
    setImportant(navWrap,'left','0');
    setImportant(navWrap,'right','auto');
    setImportant(navWrap,'top',`${top}px`);
    setImportant(navWrap,'bottom','0');
    setImportant(navWrap,'width',side);
    setImportant(navWrap,'height','auto');
    setImportant(navWrap,'max-height',`calc(100vh - ${top}px)`);
    setImportant(navWrap,'overflow-y','auto');
    setImportant(navWrap,'overflow-x','hidden');
    setImportant(navWrap,'z-index','2147483000');

    setImportant(nav,'width','100%');
    setImportant(nav,'max-width','none');
    setImportant(nav,'margin','0');

    setImportant(main,'margin-left',side);
    setImportant(main,'width',`calc(100% - ${SIDE_WIDTH}px)`);
    setImportant(main,'max-width','none');

    setImportant(topbarContent,'margin-left',side);
    setImportant(topbarContent,'width',`calc(100% - ${SIDE_WIDTH}px)`);
    setImportant(topbarContent,'max-width','none');
    setImportant(topbarContent,'padding-left',contentPad);
    setImportant(topbarContent,'padding-right',contentPad);

    document.documentElement.style.setProperty('--desktop-nav-width',side);
    document.documentElement.style.setProperty('--desktop-topbar-height',`${top}px`);
    return true;
  }

  function wrapLegacyNavigation(){
    if(typeof forceResponsiveNavigation!=="function"||forceResponsiveNavigation.__layoutGeometrySynced)return false;
    const original=forceResponsiveNavigation;
    forceResponsiveNavigation=function(...args){
      const result=original.apply(this,args);
      requestAnimationFrame(()=>{
        normalizeMonthlyPagePlacement();
        alignDesktopChrome();
      });
      return result;
    };
    forceResponsiveNavigation.__layoutGeometrySynced=true;
    return true;
  }

  function installStyles(){
    if(document.getElementById('desktop-layout-sync-style'))return;
    const style=document.createElement('style');
    style.id='desktop-layout-sync-style';
    style.textContent=`
      /* Estrutura única para todas as páginas do catálogo. */
      #catalogContent>#page-comparativo-mensal{
        position:static!important;
        inset:auto!important;
        transform:none!important;
        margin-top:0!important;
        top:auto!important;
        align-self:stretch!important;
      }
      html.monthly-comparison-active #catalogContent{
        align-content:start!important;
        justify-content:start!important;
      }
      html.monthly-comparison-active #page-comparativo-mensal:not(.is-hidden){
        display:block!important;
      }

      @media(min-width:901px){
        html.desktop-layout-synced .topbar{width:100%!important;max-width:none!important}
        html.desktop-layout-synced .topbar__content{box-sizing:border-box!important}
        html.desktop-layout-synced .app-nav-wrap{box-sizing:border-box!important}
        html.desktop-layout-synced main.main-content{box-sizing:border-box!important}
        html.desktop-layout-synced .app-nav{box-sizing:border-box!important}
        html.desktop-layout-synced .app-nav__tab{box-sizing:border-box!important}
      }
      @media(max-width:900px){
        html.desktop-layout-synced .topbar__content{margin-left:0!important;width:auto!important}
        #catalogContent>#page-comparativo-mensal{margin-top:0!important;padding-top:0!important}
      }
    `;
    document.head.appendChild(style);
  }

  function observeStructure(){
    if(structureObserver)return;
    const main=document.querySelector('main.main-content');
    if(!main)return;
    structureObserver=new MutationObserver((mutations)=>{
      if(!mutations.some((mutation)=>mutation.type==='childList'))return;
      requestAnimationFrame(()=>{
        normalizeMonthlyPagePlacement();
        alignDesktopChrome();
      });
    });
    structureObserver.observe(main,{childList:true,subtree:true});
  }

  function install(){
    installStyles();
    normalizeMonthlyPagePlacement();
    observeStructure();
    wrapLegacyNavigation();
    alignDesktopChrome();

    let attempts=0;
    const readinessTimer=setInterval(()=>{
      attempts+=1;
      normalizeMonthlyPagePlacement();
      const wrapped=wrapLegacyNavigation();
      const aligned=alignDesktopChrome();
      const monthlyReady=!!document.getElementById('page-comparativo-mensal');
      if((wrapped||typeof forceResponsiveNavigation==='function')&&aligned&&monthlyReady) clearInterval(readinessTimer);
      else if(attempts>=80) clearInterval(readinessTimer);
    },150);

    [80,250,600,1200,2200,4000].forEach(ms=>setTimeout(()=>{
      normalizeMonthlyPagePlacement();
      wrapLegacyNavigation();
      alignDesktopChrome();
    },ms));

    window.addEventListener('resize',()=>{
      clearTimeout(resizeTimer);
      resizeTimer=setTimeout(()=>{
        normalizeMonthlyPagePlacement();
        wrapLegacyNavigation();
        alignDesktopChrome();
      },80);
    },{passive:true});

    window.addEventListener('scroll',()=>{if(isDesktop())alignDesktopChrome();},{passive:true});

    const waitTopbar=setInterval(()=>{
      const topbar=document.querySelector('.topbar');
      if(!topbar)return;
      clearInterval(waitTopbar);
      if(typeof ResizeObserver==='function'){
        topbarObserver=new ResizeObserver(()=>alignDesktopChrome());
        topbarObserver.observe(topbar);
      }
    },150);

    const themeObserver=new MutationObserver(()=>requestAnimationFrame(()=>{
      normalizeMonthlyPagePlacement();
      alignDesktopChrome();
    }));
    themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','class']});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
