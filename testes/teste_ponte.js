// Teste da versão online com um Supabase falso (testes/fake-supabase.js), sem internet.
// Uso: SEMENTE=/caminho/semente.json LIBS=/caminho/libs node testes/teste_ponte.js
//   SEMENTE: {tabelas:{clientes:[...], produtos:[...], tabelas_preco:[...], precos:[...], configuracoes:[...], membros:[...]}}
//   LIBS: pasta com exceljs/dist/exceljs.min.js
const {chromium} = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const WEB = path.join(__dirname, "..", "web");
const semente = JSON.parse(fs.readFileSync(process.env.SEMENTE, "utf8"));
const falhas = []; const confere = (cond, msg) => { console.log((cond ? "OK   " : "FALHA") + " " + msg); if(!cond) falhas.push(msg); };

const srv = http.createServer((req, res) => {
  const p = path.join(WEB, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if(!p.startsWith(WEB) || !fs.existsSync(p) || fs.statSync(p).isDirectory()){ res.writeHead(404); return res.end("404"); }
  res.writeHead(200, {"Content-Type": p.endsWith(".html") ? "text/html; charset=utf-8" : p.endsWith(".js") ? "application/javascript" : p.endsWith(".css") ? "text/css" : "application/octet-stream"});
  fs.createReadStream(p).pipe(res);
}).listen(0);

(async () => {
  const base = `http://localhost:${srv.address().port}`;
  const nav = await chromium.launch();
  const ctx = await nav.newContext({acceptDownloads:true});
  // a última rota registrada é a primeira testada: o bloqueio geral vem antes
  await ctx.route(/^https?:\/\/(?!localhost)/, r => r.abort());
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r => r.fulfill({contentType:"application/javascript", body: fs.readFileSync(path.join(__dirname, "fake-supabase.js"))}));
  await ctx.route(/cdnjs\.cloudflare\.com\/.*exceljs/, r => r.fulfill({contentType:"application/javascript", body: fs.readFileSync(path.join(process.env.LIBS, "exceljs/dist/exceljs.min.js"))}));
  await ctx.addInitScript(s => { window.FAKE_DB = {tabelas: s.tabelas, storage:{}, chamadas:[]}; }, semente);
  const pg = await ctx.newPage();
  const erros = []; pg.on("pageerror", e => erros.push(e.message)); pg.on("console", m => { if(process.env.DEBUG) console.log("  [console]", m.text()); });
  pg.on("dialog", d => d.accept());

  // 1) sem login vai para a tela de entrar; senha errada avisa; certa entra
  await pg.goto(base + "/gerador.html"); await pg.waitForURL(/index\.html/);
  confere(true, "sem sessão o gerador manda para index.html");
  await pg.fill("#email", "Cassiano@Kapazi.com.br"); await pg.fill("#senha", "errada"); await pg.click("#btn");
  await pg.waitForFunction(() => document.getElementById("msg").textContent);
  confere(/incorretos/.test(await pg.textContent("#msg")), "senha errada mostra aviso");
  await pg.fill("#senha", "certa"); await pg.click("#btn");
  await pg.waitForURL(/gerador\.html/);
  await pg.waitForFunction(() => document.querySelector(".ponte-user"), null, {timeout:20000});
  const upd = await pg.textContent("#upd");
  console.log("     topo:", upd);
  confere(/226 clientes · 973 produtos/.test(upd), "dados do banco carregados (226 clientes da base, 973 linhas de preço)");
  confere(await pg.evaluate(() => CLI.some(c => c.cod === "NV0001") && CLI.some(c => c.cod === "007700")), "clientes cadastrados/editados aparecem na busca");
  confere(await pg.evaluate(() => PROD.some(p => p.cod === "KAMQ1300X2" && p._cad)), "produto manual aparece na busca");
  confere(await pg.evaluate(() => cfg.banco && /BNY|NEW YORK MELLON/i.test(cfg.banco)), "dados bancários vêm do banco (configuracoes)");
  confere(await pg.evaluate(() => ajudanteOk()), "gerador reconhece a ponte como ajudante");

  // 2) proforma nova -> Gerar PDF + Excel grava no Storage e registra no banco
  await pg.evaluate(async () => {
    aplicarCliente(CLI.find(c => c.cod === "007700"));
    adicionarProduto(PROD.find(p => p.cod === "160301"), 10);
    render();
    await exportarExcel();
  });
  await pg.waitForTimeout(1500);
  const st = await pg.evaluate(() => ({chaves: Object.keys(FAKE_DB.storage.arquivos || {}), docs: FAKE_DB.tabelas.documentos || [], arqs: FAKE_DB.tabelas.arquivos || [], num: state.pf.numero}));
  console.log("     número:", st.num, "| storage:", st.chaves.join(" ; "));
  confere(/^KZSS-004\/26$/.test(st.num), "número seguiu a sequência das pastas/banco (KZSS-004/26)");
  confere(st.chaves.some(k => /^Clientes\/007700 - SCA SACI\/KZSS-004-26\/dados_proforma\.json$/.test(k)), "dados_proforma.json gravado na pasta do cliente no Storage");
  confere(st.chaves.some(k => /Documentos KZSS-004-26\.xlsx$/.test(k)), "Excel gravado no Storage");
  confere(st.docs.some(d => d.tipo === "proforma" && d.numero === "KZSS-004/26" && d.dados && d.dados.itens.length === 1), "proforma registrada na tabela documentos");
  confere(st.arqs.some(a => a.categoria === "documento_gerado" && a.cliente_cod === "007700"), "Excel registrado na tabela arquivos");

  // 3) a lista "Abrir" enxerga a proforma gravada
  const achou = await pg.evaluate(async () => { pastasLidas = false; await lerProformasDasPastas(await obterPasta(false)); return proformasPasta.has("KZSS-004/26"); });
  confere(achou, "Abrir proforma lê de volta do Storage");

  // 4) nomes com acento e travessão viram chaves válidas e voltam iguais
  const ida = await pg.evaluate(async () => { await PONTE.storage.salvar("Clientes/Teste – Ação/Pedido do cliente - Catálogo nº1.pdf", new Blob(["x"])); return (await PONTE.storage.listar("Clientes/Teste – Ação")).map(i => i.nome); });
  confere(ida.includes("Pedido do cliente - Catálogo nº1.pdf"), "nome com acento grava e lista igual (" + ida.join(",") + ")");

  // 5) cadastrar/editar cliente atualiza a tabela clientes
  await pg.evaluate(async () => {
    clientesCad = clientesCad.filter(c => c.cod !== "NV0002").concat([{cod:"NV0002", nome:"CLIENTE TESTE", doc:"1", end:"Rua 1", pais:"PY", docTipo:"RUC", atualizado:Date.now()}]);
    await obterPasta(true); await gravarJS("clientes_cadastrados.js", "CLIENTES_CADASTRADOS", clientesCad, "Clientes cadastrados no Gerador de Proforma.");
  });
  await pg.waitForTimeout(500);
  const cli = await pg.evaluate(() => FAKE_DB.tabelas.clientes.find(c => c.cod === "NV0002"));
  confere(cli && cli.origem === "cadastrado" && cli.pais === "PY", "cliente novo gravado na tabela clientes");

  // 6) Exportador salvo vai para configuracoes
  await pg.evaluate(() => { cfg.contacto = "Teste Contato"; localStorage.setItem("pf_cfg", JSON.stringify(cfg)); });
  await pg.waitForTimeout(300);
  confere(await pg.evaluate(() => FAKE_DB.tabelas.configuracoes.find(c => c.chave === "exportador").valor.contacto === "Teste Contato"), "Exportador gravado em configuracoes");

  // 7) janela Arquivos abre e lista as pastas
  await pg.click('.ponte-user [data-p="arq"]');
  await pg.waitForFunction(() => /007700 - SCA SACI/.test(document.getElementById("paLista").textContent));
  confere(true, "janela Arquivos lista as pastas dos clientes");
  await pg.screenshot({path: path.join(__dirname, "saida", "gerador-online.png")});

  confere(!erros.length, "sem erros de JavaScript na página" + (erros.length ? ": " + erros.join(" | ") : ""));
  await nav.close(); srv.close();
  console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : "\nTudo OK");
  process.exit(falhas.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
