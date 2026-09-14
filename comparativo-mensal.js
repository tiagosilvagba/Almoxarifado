"use strict";

/* Wrapper de restauração: mantém o comparativo estável em commit imutável. */
(() => {
  const STABLE = "https://cdn.jsdelivr.net/gh/tiagosilvagba/Almoxarifado@ec57df4d00507f589d3408f9121c7e6d9ab62d37/comparativo-mensal.js";
  const FALLBACK = "https://raw.githubusercontent.com/tiagosilvagba/Almoxarifado/ec57df4d00507f589d3408f9121c7e6d9ab62d37/comparativo-mensal.js";
  function load(src){return new Promise((resolve,reject)=>{const s=document.createElement("script");s.src=src;s.async=false;s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});}
  (async()=>{try{await load(STABLE);}catch{await load(FALLBACK);}})();
})();
