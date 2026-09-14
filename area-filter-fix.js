"use strict";

(() => {
  function ready() {
    return typeof state !== "undefined" && typeof ui !== "undefined" && typeof applyFilters === "function" && typeof filterValues === "function" && typeof globalPositionMatchesArea === "function";
  }

  function positionMatchesAllStructuralFilters(position) {
    const area = ui.areaFilter ? filterValues(ui.areaFilter) : [];
    const branch = ui.branchFilter ? filterValues(ui.branchFilter) : [];
    const location = ui.locationFilter ? filterValues(ui.locationFilter) : [];
    const responsible = ui.replenishmentResponsibleFilter ? filterValues(ui.replenishmentResponsibleFilter) : [];

    if (branch.length && typeof positionMatchesBranch === "function" && !positionMatchesBranch(position, branch)) return false;
    if (location.length && !location.includes(position.locationKey)) return false;
    if (responsible.length && typeof positionMatchesReplenishmentResponsible === "function" && !positionMatchesReplenishmentResponsible(position, responsible)) return false;
    if (area.length && !globalPositionMatchesArea(position, area)) return false;
    return true;
  }

  function enforceAreaIntersection() {
    const selected = ui.areaFilter ? filterValues(ui.areaFilter) : [];
    if (!selected.length) return;
    state.filteredItems = (state.filteredItems || []).filter((item) => (item.positions || []).some(positionMatchesAllStructuralFilters));
    if (ui.resultCount && typeof pluralize === "function") ui.resultCount.textContent = pluralize(state.filteredItems.length, "item", "itens");
  }

  function install() {
    if (!ready()) { setTimeout(install, 180); return; }
    if (applyFilters.__areaIntersectionPatched) return;

    const previousApplyFilters = applyFilters;
    applyFilters = function areaIntersectionApplyFilters(renderCatalog = true) {
      previousApplyFilters(false);
      enforceAreaIntersection();
      if (renderCatalog && typeof renderCatalogResults === "function") renderCatalogResults();
    };
    applyFilters.__areaPatched = true;
    applyFilters.__areaIntersectionPatched = true;

    if (typeof currentScopedPositions === "function" && !currentScopedPositions.__areaIntersectionPatched) {
      const previousScoped = currentScopedPositions;
      currentScopedPositions = function areaIntersectionScopedPositions(item, includeStatus = true) {
        return previousScoped(item, includeStatus).filter(positionMatchesAllStructuralFilters);
      };
      currentScopedPositions.__areaIntersectionPatched = true;
    }

    const button = document.getElementById("applyFiltersButton");
    button?.addEventListener("click", () => setTimeout(() => {
      enforceAreaIntersection();
      if (typeof renderCurrentPage === "function") renderCurrentPage();
    }, 0));
  }

  install();
})();
