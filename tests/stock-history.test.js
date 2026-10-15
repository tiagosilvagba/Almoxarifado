"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const zlib = require("node:zlib");
const { compareSnapshots, summarize, latestPerDay, formatCompactMoney, compactSigned, buildHistoryExcelReport } = require("../app/modules/historico-estoque.js");

test("compara posições por código sem pontos, filial e endereço; identifica inclusões e saídas", () => {
  const old = { rows: [
    ["243.370", "Peça", "0704", "299", "", "", "", 20, 5, 100, 10, 30],
    ["555", "Outro", "704", "301", "", "", "", 3, 4, 12, 0, 20],
  ] };
  const newer = { rows: [
    ["243370", "Peça", "704", "299", "", "", "", 8, 5, 40, 10, 30],
    ["999", "Nova peça", "704", "301", "", "", "", 4, 2, 8, 0, 10],
  ] };
  const rows = compareSnapshots(old, newer);
  assert.equal(rows.length, 3);
  assert.equal(rows.find((r) => r.code === "243370").deltaQty, -12);
  assert.equal(rows.find((r) => r.code === "243370").deltaValue, -60);
  assert.equal(rows.find((r) => r.code === "555").status, "Retirado");
  assert.equal(rows.find((r) => r.code === "999").status, "Incluído");
  const s = summarize(rows);
  assert.equal(s.changed, 3);
  assert.equal(s.startQty, 23);
  assert.equal(s.endQty, 12);
  assert.equal(s.startValue, 112);
  assert.equal(s.endValue, 48);
});

test("soma lançamentos repetidos na mesma posição sem misturar repartições", () => {
  const old = { rows: [
    ["42", "Parafuso", "704", "299", "A", "", "", 5, 1, 5],
    ["42", "Parafuso", "704", "299", "A", "", "", 7, 1, 7],
    ["42", "Parafuso", "704", "299", "B", "", "", 10, 1, 10],
  ] };
  const newVersion = { rows: [
    ["42", "Parafuso", "704", "299", "A", "", "", 11, 1, 11],
    ["42", "Parafuso", "704", "299", "B", "", "", 10, 1, 10],
  ] };
  const rows = compareSnapshots(old, newVersion);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((r) => r.partition === "A").deltaQty, -1);
  assert.equal(rows.find((r) => r.partition === "B").status, "Sem alteração");
});

test("gerador persiste versões separadas e não cria duplicatas sem mudança de CSV", async () => {
  const { buildStockHistory } = await import("../tools/build_stock_history.mjs");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "almox-stock-history-"));
  try {
    await fs.mkdir(path.join(root, "data"), { recursive: true });
    await fs.mkdir(path.join(root, "consumo-mensal"), { recursive: true });
    const writeCatalog = (qty) => fs.writeFile(path.join(root, "data", "catalog.json.gz"), zlib.gzipSync(
      JSON.stringify({ items: [{ code: "243.370", name: "Peça X", flags: {},
        positions: [{ branchCode: "0704", localCode: "299", partition: "A",
          quantity: qty, unitCost: 5, stockValue: qty * 5 }] }] })));
    const manifest = (digest) => fs.writeFile(path.join(root, "data-manifest.json"),
      JSON.stringify([{ path: "00 - Saldo_Online.csv", sha: digest, size: 100 }]));
    await writeCatalog(10);
    await manifest("hash1");
    const first = await buildStockHistory({ root, at: "2026-10-14T16:00:00.000Z", sourceCommit: "abc" });
    assert.equal(first.created, true);
    assert.equal(first.entry.positions, 1);
    assert.equal(first.entry.quantity, 10);
    assert.equal(first.entry.value, 50);
    const repeat = await buildStockHistory({ root, at: "2026-10-14T17:00:00.000Z" });
    assert.equal(repeat.created, false);
    await writeCatalog(18);
    await manifest("hash2");
    const second = await buildStockHistory({ root, at: "2026-12-03T16:00:00.000Z" });
    assert.equal(second.created, true);
    const index = JSON.parse(await fs.readFile(path.join(root, "data", "historico-estoque", "index.json")));
    assert.equal(index.entries.length, 2);
    const earlier = JSON.parse(zlib.gunzipSync(await fs.readFile(path.join(root, first.entry.path))).toString());
    const later = JSON.parse(zlib.gunzipSync(await fs.readFile(path.join(root, second.entry.path))).toString());
    assert.equal(earlier.rows[0][0], "243370");
    assert.equal(compareSnapshots(earlier, later)[0].deltaQty, 8);
    // Reverter a uma assinatura já vista NÃO apaga a nova data da captura.
    await writeCatalog(10);
    await manifest("hash1");
    const restored = await buildStockHistory({ root, at: "2026-12-04T16:00:00.000Z" });
    assert.equal(restored.created, true);
    const restoredIndex = JSON.parse(await fs.readFile(path.join(root, "data", "historico-estoque", "index.json")));
    assert.equal(restoredIndex.entries.length, 3);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});


test("considera só a última atualização do Saldo Online de cada dia, no fuso de São Paulo", () => {
  const snapshots = [
    { id:"dia14-cedo",date:"2026-10-14T12:00:00.000Z",localDate:"2026-10-14",path:"data/historico-estoque/1.json.gz" },
    { id:"dia15-cedo",date:"2026-10-15T11:00:00.000Z",localDate:"2026-10-15",path:"data/historico-estoque/2.json.gz" },
    { id:"dia15-final",date:"2026-10-15T19:00:00.000Z",localDate:"2026-10-15",path:"data/historico-estoque/3.json.gz" },
    { id:"dia14-mais-tarde",date:"2026-10-15T01:00:00.000Z",path:"data/historico-estoque/4.json.gz" },
  ];
  const picked = latestPerDay([snapshots[2],snapshots[1],snapshots[0],snapshots[3]]);
  assert.deepEqual(picked.map((x) => x.id),["dia14-mais-tarde","dia15-final"]);
  assert.equal(latestPerDay([snapshots[1],snapshots[2]]).length,1);
  assert.deepEqual(latestPerDay([]),[]);
});

test("alterar outro CSV não cria histórico; duas atualizações de saldo no dia usam a última", async () => {
  const { buildStockHistory } = await import("../tools/build_stock_history.mjs");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "almox-stock-saldo-only-"));
  const writeCatalog = (qty) => fs.writeFile(path.join(root,"data","catalog.json.gz"), zlib.gzipSync(JSON.stringify({
    items: [{code:"407919",name:"Item",flags:{},positions:[
      {branchCode:"704",localCode:"299",partition:"A",quantity:qty,unitCost:2,stockValue:qty*2}
    ]}]
  })));
  const manifest = (saldo,compra) => fs.writeFile(path.join(root,"data-manifest.json"),JSON.stringify([
    {path:"00 - Saldo_Online.csv",sha:saldo,size:120},
    {path:"01 - Compras_Almox_Parte_01.CSV",sha:compra,size:200}
  ]));
  try {
    await fs.mkdir(path.join(root,"data"),{recursive:true});
    await fs.mkdir(path.join(root,"consumo-mensal"),{recursive:true});
    await writeCatalog(10);await manifest("saldo-a","compra-a");
    const a=await buildStockHistory({root,at:"2026-10-15T10:00:00.000Z"});
    assert.equal(a.created,true);
    assert.equal(a.entry.sourceCount,1);
    assert.equal(a.entry.sourceFile,"00 - Saldo_Online.csv");
    await writeCatalog(99);await manifest("saldo-a","compra-b");
    const purchasesOnly=await buildStockHistory({root,at:"2026-10-15T11:00:00.000Z"});
    assert.equal(purchasesOnly.created,false,"somente compras não devem gerar posição histórica");
    await writeCatalog(14);await manifest("saldo-b","compra-b");
    const b=await buildStockHistory({root,at:"2026-10-15T12:00:00.000Z"});
    assert.equal(b.created,true);
    await writeCatalog(16);await manifest("saldo-c","compra-b");
    const c=await buildStockHistory({root,at:"2026-10-15T15:00:00.000Z"});
    assert.equal(c.created,true);
    const idx=JSON.parse(await fs.readFile(path.join(root,"data","historico-estoque","index.json"),"utf8"));
    assert.equal(idx.entries.length,3,"todas as versões permanecem arquivadas");
    assert.deepEqual(latestPerDay(idx.entries).map((x)=>x.id),[c.entry.id],
      "somente a última posição do dia aparece para comparação");
    const previous=JSON.parse(zlib.gunzipSync(await fs.readFile(path.join(root,b.entry.path))).toString());
    const latest=JSON.parse(zlib.gunzipSync(await fs.readFile(path.join(root,c.entry.path))).toString());
    assert.equal(compareSnapshots(previous,latest)[0].deltaQty,2);
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
});

test("migra registros antigos sem inventar captura por alteração de outros CSVs",async()=>{
  const { buildStockHistory }=await import("../tools/build_stock_history.mjs");
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"almox-stock-migrate-"));
  try {
    await fs.mkdir(path.join(root,"data"),{recursive:true});
    await fs.mkdir(path.join(root,"consumo-mensal"),{recursive:true});
    const writeManifest=(saldo,other)=>fs.writeFile(path.join(root,"data-manifest.json"),JSON.stringify([
      {path:"00 - Saldo_Online.csv",sha:saldo,size:30},
      {path:"03 - Consumo.csv",sha:other,size:60}
    ]));
    await fs.writeFile(path.join(root,"data","catalog.json.gz"),zlib.gzipSync(JSON.stringify({
      items:[{code:"777",name:"Estoque",positions:[{branchCode:"704",localCode:"299",quantity:10,unitCost:2,stockValue:20}]}]
    })));
    await writeManifest("saldo-antigo","consumo-1");
    const initial=await buildStockHistory({root,at:"2026-10-14T16:00:00.000Z"});
    const indexPath=path.join(root,"data","historico-estoque","index.json");
    const index=JSON.parse(await fs.readFile(indexPath,"utf8"));
    delete index.entries[0].balanceSha;
    index.entries[0].sourceDigest="assinatura-antiga-todos-csvs";
    await fs.writeFile(indexPath,JSON.stringify(index));
    await writeManifest("saldo-antigo","consumo-2");
    const migrated=await buildStockHistory({root,at:"2026-10-15T16:00:00.000Z"});
    assert.equal(migrated.created,false);
    const saved=JSON.parse(await fs.readFile(indexPath,"utf8"));
    assert.equal(saved.entries.length,1);
    assert.equal(saved.entries[0].balanceSha,"saldo-antigo");
    assert.equal(saved.entries[0].id,initial.entry.id);
  } finally {await fs.rm(root,{recursive:true,force:true});}
});

test("aba, versão e workflow estão ligados ao histórico em arquivos separados", async () => {
  const root = path.join(__dirname, "..");
  const html = await fs.readFile(path.join(root, "index.html"), "utf8");
  const script = await fs.readFile(path.join(root, "script.js"), "utf8");
  const core = await fs.readFile(path.join(root, "app/core/catalog-app.js"), "utf8");
  const workflow = await fs.readFile(path.join(root, ".github/workflows/update-data-manifest.yml"), "utf8");
  assert.match(html, /id="page-historico-estoque"/);
  assert.match(script, /MODULES\.stockHistory/);
  assert.match(core, /"historico-estoque"/);
  assert.match(workflow, /node tools\/build_stock_history\.mjs/);
  assert.match(workflow, /data\/historico-estoque/);
});
test("Histórico abrevia moedas na tela e mantém valores numéricos completos no Excel", () => {
  const compact = (v) => formatCompactMoney(v).replace(/\s/g, " ");
  assert.ok(compact(66207903.01).includes("66,2 mi"));
  assert.ok(compact(1450000).includes("1,5 mi"));
  assert.ok(compact(85250.5).includes("85,3 mil"));
  assert.ok(compact(-1450000).includes("-1,5 mi"));
  assert.ok(compactSigned(1450000).replace(/\s/g, " ").startsWith("+R$"));
  const rows = compareSnapshots(
    { rows: [["243370", "Peça", "704", "299", "", "", "", 20, 5, 100]] },
    { rows: [["243370", "Peça", "704", "299", "", "", "", 15, 5, 75]] }
  );
  const report = buildHistoryExcelReport(rows, "14/10/2026", "03/12/2026");
  assert.equal(report.filename, "comparativo-historico-estoque.xls");
  assert.deepEqual([...report.currencyColumns], [10, 11, 12]);
  assert.deepEqual([...report.numericColumns], [7, 8, 9]);
  assert.deepEqual(report.rows[0].slice(10, 13), [100, 75, -25]);
  assert.equal(report.rows[0][0], "243370");
  assert.ok(report.filterSummary.includes("14/10/2026"));
  const html = require("node:fs").readFileSync(path.join(__dirname, "../index.html"), "utf8");
  const js = require("node:fs").readFileSync(path.join(__dirname, "../app/modules/historico-estoque.js"), "utf8");
  const core = require("node:fs").readFileSync(path.join(__dirname, "../app/core/catalog-app.js"), "utf8");
  assert.ok(html.includes("Exportar comparativo Excel"));
  assert.ok(js.includes('exportReport("excel", report)'));
  assert.ok(core.includes('NumberFormat ss:Format="&quot;R$&quot; #,##0.00"'));
});
