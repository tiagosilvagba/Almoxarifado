"use strict";

(() => {
  const normalize = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();

  function selectedAreas(){
    const select=document.getElementById("areaFilter");
    if(!select)return [];
    if(typeof filterValues === "function") return filterValues(select).map(normalize).filter(Boolean);
    return [...select.selectedOptions].map(o=>normalize(o.value)).filter(Boolean);
  }

  function matchesArea(position, selected=selectedAreas()){
    if(!selected.length)return true;
    const values=(position?.responsibleAreas || []).map(normalize);
    return selected.some(area=>values.includes(area));
  }

  function install(){
    if(typeof state === "undefined" || typeof ui === "undefined" || typeof applyFilters !== "function"){
      setTimeout(install,250); return;
    }
    const area=document.getElementById("areaFilter");
    if(!area){ setTimeout(install,250); return; }
    if(window.__almoxAreaActiveFilterInstalled)return;
    window.__almoxAreaActiveFilterInstalled=true;

    if(typeof globalPositionMatchesArea === "function"){
      globalPositionMatchesArea=function(position,selected){
        const list=(selected || selectedAreas()).map(normalize).filter(Boolean);
        return matchesArea(position,list);
      };
    }

    if(typeof currentScopedPositions === "function" && !currentScopedPositions.__areaStrict){
      const previous=currentScopedPositions;
      currentScopedPositions=function(item,includeStatus=true){
        return previous(item,includeStatus).filter(position=>matchesArea(position));
      };
      currentScopedPositions.__areaStrict=true;
    }

    if(typeof draftPositions === "function" && !draftPositions.__areaStrict){
      const previous=draftPositions;
      draftPositions=function(item,excludedFilterId){
        const positions=previous(item,excludedFilterId);
        if(excludedFilterId === "areaFilter") return positions;
        return positions.filter(position=>matchesArea(position));
      };
      draftPositions.__areaStrict=true;
    }

    const previousApply=applyFilters;
    applyFilters=function(renderCatalog=true){
      previousApply(false);
      const selected=selectedAreas();
      if(selected.length){
        state.filteredItems=state.filteredItems.filter(item=>{
          const positions=typeof currentScopedPositions === "function"
            ? currentScopedPositions(item,false)
            : (item.positions || []).filter(position=>matchesArea(position,selected));
          return positions.length>0;
        });
        if(ui.resultCount && typeof pluralize === "function") ui.resultCount.textContent=pluralize(state.filteredItems.length,"item","itens");
      }
      if(renderCatalog && typeof renderCatalogResults === "function") renderCatalogResults();
    };
    applyFilters.__areaPatched=true;
    applyFilters.__areaStrict=true;

    area.addEventListener("change",()=>{
      if(typeof markFilterDraftDirty === "function") markFilterDraftDirty();
    });

    [100,350,900].forEach(ms=>setTimeout(()=>{
      if(typeof annotateGlobalAreas === "function") annotateGlobalAreas();
      if(typeof populateGlobalAreaFilter === "function") populateGlobalAreaFilter();
    },ms));
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded",install,{once:true});
  else install();
})();
