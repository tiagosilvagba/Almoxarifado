"use strict";

/**
 * Menu agrupado Apple Glass.
 * Os links originais permanecem na .app-nav para preservar os listeners e
 * as abas injetadas por outros módulos. Esta camada só cria atalhos visuais.
 */
(() => {
  const KEY = "almox.sidebar.mode.v1";
  const GROUPS = [
    { id:"painel", name:"Painel", icon:"dashboard", pages:["dashboard"] },
    { id:"estoque", name:"Estoque", icon:"stock", pages:["catalogo","consumo","revisao-min-max","itens-sem-giro"] },
    { id:"compras", name:"Compras", icon:"cart", pages:["necessidade-compra","sc-pendente-of","consulta-sc-of","tempo-geracao-of","compras-fora-cc1500","follow-up"] },
    { id:"inteligencia", name:"Inteligência", icon:"brain", pages:["inteligencia-almoxarifado"] },
    { id:"historico", name:"Histórico", icon:"history", pages:["historico-estoque","comparativo-mensal"] },
    { id:"apoio", name:"Apoio", icon:"help", pages:["instrucoes"] }
  ];
  const ICONS = {
    logo:'<path d="M3 9.5 12 4l9 5.5V20H3V9.5Z"/><path d="M8 20v-8h8v8M3 13h18"/>',
    dashboard:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    stock:'<path d="m3 7 9-4 9 4v11l-9 4-9-4V7Z"/><path d="m3 7 9 4 9-4M12 11v11"/>',
    cart:'<circle cx="9" cy="20" r="1"/><circle cx="19" cy="20" r="1"/><path d="M2 3h3l3 13h12l2-9H6"/>',
    brain:'<path d="M12 6a4 4 0 0 0-7 2 4 4 0 0 0-1 7 4 4 0 0 0 8 3V6Zm0 0a4 4 0 0 1 7 2 4 4 0 0 1 1 7 4 4 0 0 1-8 3V6Z"/><path d="M8 10c2 0 3 1 4 2m4-2c-2 0-3 1-4 2"/>',
    history:'<path d="M3 12a9 9 0 1 0 3-6.7M3 3v5h5"/><path d="M12 7v5l4 2"/>',
    help:'<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Z"/><path d="M9 9h6m-6 4h6m-6 4h4"/>',
    other:'<circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>',
    collapse:'<path d="M15 3h5v18h-5M4 12h8m-4-4-4 4 4 4"/>',
    expand:'<path d="M9 3H4v18h5m11-9h-8m4-4 4 4-4 4"/>',
    chevron:'<path d="m9 6 6 6-6 6"/>',
    menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
    close:'<path d="M5 5l14 14M19 5 5 19"/>'
  };
  const svg = (name) => {
    const node = document.createElementNS("http://www.w3.org/2000/svg","svg");
    node.setAttribute("viewBox","0 0 24 24");
    node.setAttribute("aria-hidden","true");
    node.innerHTML = ICONS[name] || ICONS.other;
    return node;
  };
  const mobile = () => window.matchMedia("(max-width:900px)").matches;

  // Em telas pequenas a navegação nativa volta a ser exibida, exatamente
  // como antes do menu agrupado (barra inferior horizontal com todas as abas).
  // A classe almox-nav-ready só deve existir no desktop.
  function synchronizeResponsiveMode() {
    const root = document.documentElement;
    const groupedDesktop = !mobile();
    const wasGrouped = root.classList.contains("almox-nav-ready");
    root.classList.toggle("almox-nav-ready", groupedDesktop);
    if (!groupedDesktop) {
      root.classList.remove("almox-mobile-menu-open");
      if (backdrop) backdrop.hidden = true;
      if (mobileButton) mobileButton.setAttribute("aria-expanded","false");
      closePopup();
    }
    if (wasGrouped !== groupedDesktop && typeof forceResponsiveNavigation === "function") {
      forceResponsiveNavigation();
    }
  }
  let nav, navWrap, shell, groupsHost, popup, toggle, mobileButton, backdrop;
  let sections = [];
  let activeGroup = null;
  let closeTimer = 0;
  let renderTimer = 0;
  let signature = "";
  let compact = false;

  function safeRead() {
    try { return localStorage.getItem(KEY); }
    catch { return null; }
  }
  function safeWrite(value) {
    try { localStorage.setItem(KEY,value); }
    catch { /* O menu continua funcionando sem armazenamento. */ }
  }
  function setMode(isCompact, persist) {
    compact = !!isCompact;
    document.documentElement.classList.toggle("almox-nav-compact",compact);
    document.documentElement.classList.toggle("almox-nav-expanded",!compact);
    if (toggle) {
      toggle.replaceChildren(svg(compact ? "expand" : "collapse"));
      toggle.title = compact ? "Expandir menu lateral" : "Recolher menu lateral";
      toggle.setAttribute("aria-label",toggle.title);
      toggle.setAttribute("aria-pressed",String(compact));
    }
    if (persist) safeWrite(compact ? "compact" : "expanded");
    closePopup();
    // A navegação existente calcula o afastamento da área de trabalho.
    if (typeof forceResponsiveNavigation === "function") forceResponsiveNavigation();
    window.dispatchEvent(new Event("almox:sidebar-mode"));
  }

  function pageName(tab) {
    return (tab.querySelector(".app-nav__label")?.textContent || tab.textContent || tab.dataset.page || "").trim();
  }
  function groupData() {
    const tabs = [...nav.querySelectorAll(".app-nav__tab[data-page]")];
    const byPage = new Map(tabs.map(tab => [tab.dataset.page,tab]));
    const assigned = new Set();
    const known = GROUPS.map(group => ({
      ...group,
      tabs: group.pages.map(page => {
        const tab = byPage.get(page);
        if (tab) assigned.add(page);
        return tab;
      }).filter(Boolean)
    })).filter(group => group.tabs.length);
    const unmatched = tabs.filter(tab => !assigned.has(tab.dataset.page));
    if (unmatched.length) known.push({ id:"outras",name:"Outras abas",icon:"other",tabs:unmatched });
    return known;
  }
  function activePage() {
    return nav.querySelector(".app-nav__tab.is-active")?.dataset.page
      || document.documentElement.dataset.activePage
      || window.location.hash.replace("#","");
  }
  function syncActive() {
    const page = activePage();
    for (const group of sections) {
      const active = group.tabs.some(tab => tab.dataset.page === page);
      const button = groupsHost.querySelector('[data-nav-group="' + group.id + '"]');
      button?.classList.toggle("is-active",active);
    }
    for (const link of document.querySelectorAll(".almox-menu__link[data-page]")) {
      const active = link.dataset.page === page;
      link.classList.toggle("is-active",active);
      if (active) link.setAttribute("aria-current","page");
      else link.removeAttribute("aria-current");
    }
  }
  function linkFor(tab) {
    const link = document.createElement("a");
    link.className = "almox-menu__link";
    link.href = tab.getAttribute("href") || ("#" + tab.dataset.page);
    link.dataset.page = tab.dataset.page;
    link.setAttribute("role","menuitem");
    const label = document.createElement("span");
    label.textContent = pageName(tab);
    link.append(svg("chevron"),label);
    link.addEventListener("click",event => {
      event.preventDefault();
      // Usa o elemento original para manter handlers legados, inclusive
      // os módulos que interceptam o clique na fase de captura.
      tab.click();
      if (window.location.hash !== link.getAttribute("href") && !document.documentElement.dataset.activePage) {
        window.location.hash = link.getAttribute("href");
      }
      closePopup();
      if (mobile()) setDrawer(false);
      window.requestAnimationFrame(syncActive);
    });
    return link;
  }
  function renderLinks(host,group) {
    host.replaceChildren(...group.tabs.map(linkFor));
    syncActive();
  }
  function clearCloseTimer() {
    if (closeTimer) window.clearTimeout(closeTimer);
    closeTimer = 0;
  }
  function scheduleClose() {
    clearCloseTimer();
    closeTimer = window.setTimeout(closePopup,160);
  }
  function closePopup() {
    clearCloseTimer();
    activeGroup = null;
    if (popup) {
      popup.hidden = true;
      popup.replaceChildren();
    }
    if (groupsHost) {
      groupsHost.querySelectorAll(".almox-menu__group").forEach(row => row.classList.remove("is-open"));
      groupsHost.querySelectorAll("[data-nav-group]").forEach(button => button.setAttribute("aria-expanded","false"));
    }
  }
  function placePopup(button) {
    if (!popup || popup.hidden) return;
    const rect = button.getBoundingClientRect();
    const width = popup.offsetWidth || 264;
    const height = popup.offsetHeight || 240;
    const left = rect.right + width + 12 <= window.innerWidth
      ? rect.right + 10
      : Math.max(8,rect.left - width - 10);
    const top = Math.min(
      Math.max(rect.top,8),
      Math.max(8,window.innerHeight - height - 10)
    );
    popup.style.left = Math.round(left) + "px";
    popup.style.top = Math.round(top) + "px";
  }
  function openPopup(group,button) {
    clearCloseTimer();
    activeGroup = group.id;
    groupsHost.querySelectorAll(".almox-menu__group").forEach(row => row.classList.toggle("is-open",row.dataset.groupRow === group.id));
    groupsHost.querySelectorAll("[data-nav-group]").forEach(btn => btn.setAttribute("aria-expanded",String(btn === button)));
    if (mobile()) {
      groupsHost.querySelectorAll(".almox-menu__inline").forEach(panel => {
        const visible = panel.dataset.groupPanel === group.id;
        panel.hidden = !visible;
        if (visible && !panel.childElementCount) renderLinks(panel,group);
      });
      syncActive();
      return;
    }
    popup.setAttribute("aria-label","Abas de " + group.name);
    const heading = document.createElement("strong");
    heading.className = "almox-menu__popup-title";
    heading.append(svg(group.icon),document.createTextNode(group.name));
    const links = document.createElement("div");
    links.className = "almox-menu__popup-links";
    links.setAttribute("role","menu");
    popup.replaceChildren(heading,links);
    popup.hidden = false;
    renderLinks(links,group);
    placePopup(button);
  }
  function activate(group,button) {
    const currentlyOpen = activeGroup === group.id;
    if (currentlyOpen) closePopup();
    else openPopup(group,button);
  }
  function makeGroup(group) {
    const row = document.createElement("div");
    row.className = "almox-menu__group";
    row.dataset.groupRow = group.id;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "almox-menu__group-button";
    button.dataset.navGroup = group.id;
    button.setAttribute("aria-label",group.name);
    button.setAttribute("aria-haspopup","menu");
    button.setAttribute("aria-expanded","false");
    button.title = group.name;
    const title = document.createElement("span");
    title.className = "almox-menu__group-label";
    title.textContent = group.name;
    const arrow = document.createElement("span");
    arrow.className = "almox-menu__group-arrow";
    arrow.append(svg("chevron"));
    button.append(svg(group.icon),title,arrow);
    button.addEventListener("pointerenter",event => {
      if (!mobile() && event.pointerType !== "touch") openPopup(group,button);
    });
    button.addEventListener("click",() => {
      if (mobile()) activate(group,button);
      else openPopup(group,button);
    });
    button.addEventListener("keydown",event => {
      if (event.key === "Escape") { closePopup();button.focus(); }
      if (event.key === "ArrowRight" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openPopup(group,button);
        if (!mobile()) popup.querySelector(".almox-menu__link")?.focus();
      }
    });
    row.append(button);
    const inline = document.createElement("div");
    inline.className = "almox-menu__inline";
    inline.dataset.groupPanel = group.id;
    inline.hidden = true;
    row.append(inline);
    return row;
  }
  function renderGroups() {
    const next = groupData();
    const nextSignature = next.map(group => group.id + ":" + group.tabs.map(tab => tab.dataset.page + "=" + pageName(tab)).join("|")).join(";");
    if (signature === nextSignature) { syncActive();return; }
    signature = nextSignature;
    sections = next;
    closePopup();
    groupsHost.replaceChildren(...next.map(makeGroup));
    syncActive();
  }
  function scheduleRender() {
    if (renderTimer) return;
    renderTimer = window.requestAnimationFrame(() => { renderTimer = 0;renderGroups(); });
  }
  function setDrawer(open) {
    document.documentElement.classList.toggle("almox-mobile-menu-open",!!open);
    if (mobileButton) mobileButton.setAttribute("aria-expanded",String(!!open));
    if (backdrop) backdrop.hidden = !open;
    if (!open) closePopup();
    else shell.querySelector(".almox-menu__group-button")?.focus();
  }
  function install() {
    navWrap = document.querySelector(".app-nav-wrap");
    nav = navWrap?.querySelector(".app-nav");
    if (!navWrap || !nav || document.getElementById("almoxGroupedMenu")) return;
    document.documentElement.classList.toggle("almox-nav-ready", !mobile());
    nav.classList.add("almox-navigation-source");

    shell = document.createElement("div");
    shell.id = "almoxGroupedMenu";
    shell.className = "almox-menu";
    shell.setAttribute("aria-label","Menu lateral agrupado");
    const header = document.createElement("div");
    header.className = "almox-menu__header";
    const mark = document.createElement("div");
    mark.className = "almox-menu__mark";
    mark.append(svg("logo"));
    const brand = document.createElement("span");
    brand.className = "almox-menu__brand";
    brand.textContent = "ALMOX";
    toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "almox-menu__toggle";
    toggle.addEventListener("click",() => setMode(!compact,true));
    header.append(mark,brand,toggle);
    groupsHost = document.createElement("div");
    groupsHost.className = "almox-menu__groups";
    groupsHost.setAttribute("role","navigation");
    groupsHost.setAttribute("aria-label","Grupos do almoxarifado");
    shell.append(header,groupsHost);
    navWrap.append(shell);

    popup = document.createElement("div");
    popup.id = "almoxSidebarPopup";
    popup.className = "almox-menu__popup";
    popup.hidden = true;
    popup.addEventListener("pointerenter",clearCloseTimer);
    popup.addEventListener("pointerleave",scheduleClose);
    popup.addEventListener("keydown",event => {
      if (event.key === "Escape") {
        const trigger = groupsHost.querySelector('[data-nav-group="' + activeGroup + '"]');
        closePopup();
        trigger?.focus();
      }
    });
    document.body.append(popup);

    mobileButton = document.createElement("button");
    mobileButton.id = "almoxMobileMenuButton";
    mobileButton.className = "almox-menu__mobile-open";
    mobileButton.type = "button";
    mobileButton.setAttribute("aria-controls","almoxGroupedMenu");
    mobileButton.setAttribute("aria-label","Abrir menu");
    mobileButton.setAttribute("aria-expanded","false");
    mobileButton.append(svg("menu"),document.createTextNode("Menu"));
    mobileButton.addEventListener("click",() => setDrawer(!document.documentElement.classList.contains("almox-mobile-menu-open")));
    document.body.append(mobileButton);
    backdrop = document.createElement("button");
    backdrop.type = "button";
    backdrop.className = "almox-menu__backdrop";
    backdrop.setAttribute("aria-label","Fechar menu");
    backdrop.hidden = true;
    backdrop.addEventListener("click",() => setDrawer(false));
    document.body.append(backdrop);

    groupsHost.addEventListener("pointerleave",event => {
      if (!mobile() && event.pointerType !== "touch") scheduleClose();
    });
    navWrap.addEventListener("scroll",() => {
      if (!mobile()) closePopup();
    },{passive:true});
    document.addEventListener("pointerdown",event => {
      if (!shell.contains(event.target) && !popup.contains(event.target) && !mobileButton.contains(event.target)) {
        if (mobile()) setDrawer(false);
        else closePopup();
      }
    });
    document.addEventListener("keydown",event => {
      if (event.key === "Escape") {
        if (mobile() && document.documentElement.classList.contains("almox-mobile-menu-open")) {
          setDrawer(false);
          mobileButton.focus();
        } else closePopup();
      }
    });
    window.addEventListener("resize",() => {
      synchronizeResponsiveMode();
      if (mobile()) closePopup();
      else {
        setDrawer(false);
        if (activeGroup) {
          const btn = groupsHost.querySelector('[data-nav-group="' + activeGroup + '"]');
          if (btn) placePopup(btn);
        }
      }
    },{passive:true});
    window.addEventListener("hashchange",() => { syncActive();if (mobile()) setDrawer(false); });
    new MutationObserver(scheduleRender).observe(nav,{childList:true,subtree:true,characterData:true});
    new MutationObserver(syncActive).observe(nav,{attributes:true,subtree:true,attributeFilter:["class"]});
    new MutationObserver(syncActive).observe(document.documentElement,{attributes:true,attributeFilter:["data-active-page"]});
    setMode(safeRead() === "compact",false);
    renderGroups();
    synchronizeResponsiveMode();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",install,{once:true});
  else install();
})();
