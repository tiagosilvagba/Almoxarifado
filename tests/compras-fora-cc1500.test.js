"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildItemGlobalSearchIndex, itemMatchesGlobalSearch, pageForHash } = require("../app/core/catalog-app.js");
const { isConfirmedOutsideWarehousePurchase, buildDirectPurchaseStockRows, summarizeDirectPurchaseStock } = require("../app/modules/compras-fora-cc1500.js");

test("pesquisa global encontra descrição, item pontuado, SC, OF, comprador e reposição", () => {
  const item = {
    code: "243370", name: "Rolamento de esferas", detailedName: "Rolamento axial industrial",
    suppliers: ["Fornecedora Épsilon"], requesters: ["João Silva"],
    replenishmentResponsibles: ["Cristiane Dionísio"],
    positions: [{
      branchCode: "704", branchName: "ROLANDIA - ALM. PREPARADOS", localCode: "299",
      partition: "AP", shelf: "A0", division: "01",
      replenishmentResponsibles: ["Geovani Ribeiro"],
      responsibleAreas: ["Manutenção"],
    }],
    history: [{
      sc: { code: "319900", requesterName: "João Silva", buyerName: "Carlos Comprador" },
      of: { code: "480021", supplier: "Fornecedora Épsilon" },
      rec: { invoice: "819977" },
    }],
  };
  buildItemGlobalSearchIndex(item);
  for (const query of [
    "243370", "243.370", "ROLAMENTO", "esferas", "axial industrial", "SC 319900",
    "480021", "Carlos", "Cristiane", "Geovani", "epsilon", "819977",
    "(A0)", "(AP A0 01)", "rolamento (AP A0)", "299 (AP)", "joao",
  ]) {
    assert.equal(itemMatchesGlobalSearch(item, query), true, query);
  }
  for (const query of ["não existe", "999999", "(B1)", "rolamento (B1)", "rolamento 888"]) {
    assert.equal(itemMatchesGlobalSearch(item, query), false, query);
  }
});

test("auditoria exige compra com OF e CCU explícito diferente de 1500", () => {
  const row = (ccu, opts = {}) => ({
    branchCode: opts.branch || "704",
    sc: { code: "101", allocationCostCenter: ccu, cancelled: opts.cancelled || "N" },
    of: opts.hasOf === false ? null : { code: "202", deliveryBranchCode: opts.branch || "704" },
  });
  assert.equal(isConfirmedOutsideWarehousePurchase(row("2000")), true);
  assert.equal(isConfirmedOutsideWarehousePurchase(row("1500")), false);
  assert.equal(isConfirmedOutsideWarehousePurchase(row("01500")), false);
  assert.equal(isConfirmedOutsideWarehousePurchase(row("1500.0")), false);
  assert.equal(isConfirmedOutsideWarehousePurchase(row("")), false);
  assert.equal(isConfirmedOutsideWarehousePurchase(row("2000", { cancelled: "S" })), false);
  assert.equal(isConfirmedOutsideWarehousePurchase(row("2000", { hasOf: false })), false);
});

test("auditoria cruza código e filial, não duplica recebimentos e não mistura CCU ou saldo", () => {
  const purchase = (sc, of, ccu, branch, extra = {}) => ({
    branchCode: branch,
    sc: { code: sc, sequence: "1", allocationCostCenter: ccu, cancelled: "N" },
    of: { code: of, deliveryBranchCode: branch, requestedQuantity: 40, deliveredQuantity: extra.delivered || 4, supplier: "Fornecedor X" },
    rec: { invoice: extra.invoice || "" },
  });
  const items = [{
    code: "243370", name: "Rolamento",
    positions: [
      { branchCode: "704", branchName: "Almoxarifado", quantity: 10, stockValue: 500, localCode: "299", partition: "AP", shelf: "A0", division: "1" },
      { branchCode: "704", branchName: "Almoxarifado", quantity: -2, stockValue: -100, localCode: "299" },
      { branchCode: "705", branchName: "Outro", quantity: 3, stockValue: 90 },
    ],
    history: [
      purchase("101", "201", "2000", "704", { invoice: "NF1", delivered: 4 }),
      purchase("101", "201", "2000", "704", { invoice: "NF2", delivered: 9 }),
      purchase("102", "202", "1500", "704"),
      purchase("103", "203", "", "704"),
      purchase("104", "204", "2000", "705"),
      purchase("105", "205", "2000", "706"),
      purchase("106", "206", "2000", "704", { delivered: 2 }),
    ],
  }, {
    code: "777777", name: "Item zerado",
    positions: [{ branchCode: "704", quantity: 0, stockValue: 0 }],
    history: [purchase("107", "207", "3000", "704")],
  }];
  const rows = buildDirectPurchaseStockRows(items);
  assert.equal(rows.length, 3);
  const first = rows.find((r) => r.of === "201");
  assert.equal(first.stockQuantity, 8);
  assert.equal(first.stockValue, 400);
  assert.equal(first.delivered, 9);
  assert.equal(first.invoice, "NF1");
  assert.equal(first.ccu, "2000");
  const other = rows.find((r) => r.of === "204");
  assert.equal(other.branchCode, "705");
  assert.equal(other.stockQuantity, 3);
  const metrics = summarizeDirectPurchaseStock(rows);
  assert.deepEqual(metrics, { codes: 1, orders: 3, stockQuantity: 11, stockValue: 490 });
  assert.equal(pageForHash("#compras-fora-cc1500"), "compras-fora-cc1500");
});

test("auditoria distingue Alm. Preparados e Abate Aves mesmo na filial 704", () => {
  const item = {
    code: "407919", name: "Engrenagem",
    positions: [
      { branchCode: "704", branchName: "ROLANDIA - ALM. PREPARADOS", quantity: 20, stockValue: 600, localCode: "299", partition: "JF" },
      { branchCode: "704", branchName: "ROLANDIA - AB. AVES", quantity: 5, stockValue: 200, localCode: "300" },
    ],
    history: [{
      sc: { code: "SC-8", allocationCostCenter: "2000", cancelled: "N" },
      of: { code: "OF-9", deliveryBranchCode: "704", requestedQuantity: 10 },
    }],
  };
  const rows = buildDirectPurchaseStockRows([item]);
  assert.equal(rows.length, 2);
  const prep = rows.find((row) => row.branch.includes("PREPARADOS"));
  const aves = rows.find((row) => row.branch.includes("AB. AVES"));
  assert.equal(prep.stockQuantity, 20);
  assert.equal(aves.stockQuantity, 5);
  assert.match(prep.addresses, /Rep\. JF/);
  assert.deepEqual(summarizeDirectPurchaseStock(rows), {
    codes: 1, orders: 2, stockQuantity: 25, stockValue: 800,
  });
});
