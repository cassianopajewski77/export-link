// Teste da Hoja de Pedido online (web/pedido.html), sem internet: o catálogo vem de um JSON
// (o que a função catalogo_pedido() devolve) e o PDF baixado é lido pelo MESMO código de importação
// do gerador (lerPdf + processarPedido de web/gerador.html).
// Uso: CATALOGO=/caminho/catalogo.json LIBS=/caminho/libs node testes/teste_pedido.js
//   CATALOGO: [{cod, descricao, descricao_es, um, origem, foto_url, ordem}, ...]
//   LIBS: pasta com jspdf/dist/jspdf.umd.min.js, jspdf-autotable/dist/jspdf.plugin.autotable.min.js
//         e pdfjs-dist/legacy/build/pdf.js (versões do pedido.html e do gerador)
const {chromium} = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const WEB = path.join(__dirname, "..", "web"), LIBS = process.env.LIBS;
const catalogo = JSON.parse(fs.readFileSync(process.env.CATALOGO, "utf8"));
const falhas = []; const confere = (cond, msg) => { console.log((cond ? "OK   " : "FALHA") + " " + msg); if(!cond) falhas.push(msg); };

const srv = http.createServer((req, res) => {
  const p = path.join(WEB, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if(!p.startsWith(WEB) || !fs.existsSync(p) || fs.statSync(p).isDirectory()){ res.writeHead(404); return res.end("404"); }
  res.writeHead(200, {"Content-Type": p.endsWith(".html") ? "text/html; charset=utf-8" : p.endsWith(".js") ? "application/javascript" : "application/octet-stream"});
  fs.createReadStream(p).pipe(res);
}).listen(0);

// importação do gerador, rodando no node com o código copiado do próprio gerador.html
function importadorDoGerador(){
  const html = fs.readFileSync(path.join(WEB, "gerador.html"), "utf8");
  const trecho = (de, ate) => { const i = html.indexOf(de), f = html.indexOf(ate, i); if(i < 0 || f < 0) throw new Error("não achei " + de); return html.slice(i, f); };
  const cod = trecho("const chaveCod = ", "function desenharImport(");
  const pdf = trecho("async function lerPdf(file){", "/* ---------- cadastro de clientes: documentos PDF");
  const norm = html.match(/^const norm = .*$/m)[0];
  const ctx = {resultado: null};
  const fn = new Function("PROD", "pdfjsLib", "ctx", `
    const carregarScript = async () => {}, URL_PDFJS = "", URL_PDFJS_WORKER = "";
    const document = {getElementById: () => ({style: {}})};
    let impLinhas = [], impOrigem = "teste";
    const desenharImport = info => { ctx.resultado = {info, linhas: impLinhas}; };
    ${norm}\n${cod}\n${pdf}
    return {lerPdf, processarPedido};`);
  return {ctx, fn};
}

(async () => {
  const base = `http://localhost:${srv.address().port}`;
  const nav = await chromium.launch();
  const ctx = await nav.newContext({acceptDownloads: true});
  await ctx.route(/^https?:\/\/(?!localhost)/, r => r.abort());
  let chamadasRpc = 0;
  await ctx.route(/supabase\.co\/rest\/v1\/rpc\/catalogo_pedido/, r => { chamadasRpc++; r.fulfill({contentType: "application/json", body: JSON.stringify(catalogo)}); });
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/jspdf@/, r => r.fulfill({contentType: "application/javascript", body: fs.readFileSync(path.join(LIBS, "jspdf/dist/jspdf.umd.min.js"))}));
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/jspdf-autotable@/, r => r.fulfill({contentType: "application/javascript", body: fs.readFileSync(path.join(LIBS, "jspdf-autotable/dist/jspdf.plugin.autotable.min.js"))}));
  const pg = await ctx.newPage();
  const erros = []; pg.on("pageerror", e => erros.push(e.message));
  pg.on("dialog", d => { erros.push("diálogo: " + d.message()); d.accept(); });

  await pg.goto(base + "/pedido.html?cliente=007700");
  await pg.waitForSelector(".prod");
  confere(chamadasRpc === 1, "catálogo lido pela função pública catalogo_pedido()");
  confere(await pg.$$eval(".prod", l => l.length) === 40, "lista mostra os primeiros 40 produtos");
  confere(await pg.inputValue("#d_codCliente") === "007700", "?cliente= preenche o código de cliente");

  // busca por código e por descrição em espanhol
  const c1 = catalogo.find(p => p.um === "PC").cod, c2 = catalogo.find(p => p.um === "M2" && /\d+(,\d+)?\s*M?\s*X\s*\d+(,\d+)?\s*M\b/i.test(p.descricao) && !/CM/i.test(p.descricao))?.cod || catalogo.find(p => p.um === "M2").cod;
  await pg.fill("#q", c1); await pg.waitForTimeout(300);
  confere(await pg.$eval(".prod .cod", e => e.textContent) === c1, `buscar o código ${c1} traz o produto primeiro`);
  await pg.fill(`.prod[data-cod="${c1}"] input`, "12");
  await pg.fill("#q", "cesped"); await pg.waitForTimeout(300);
  const ces = await pg.$$eval(".prod", l => l.map(e => e.dataset.cod + " " + e.querySelector(".desc").textContent));
  confere(ces.length > 0 && ces.every(t => /CÉSPED/i.test(t)), `busca "cesped" (sem acento) acha ${ces.length} produto(s) de césped`);
  const c3 = ces[0].split(" ")[0];
  for(let i = 0; i < 3; i++) await pg.click(`.prod[data-cod="${c3}"] button[data-d="1"]`);
  await pg.fill("#q", c2); await pg.waitForTimeout(300);
  await pg.fill(`.prod[data-cod="${c2}"] input`, "2,5");
  confere(/3 producto/.test(await pg.textContent("#resumen")), "barra mostra 3 produtos selecionados");

  // sem os dados obrigatórios não baixa: marca os campos
  await pg.click("#revisar"); await pg.click("#pdf");
  confere(await pg.$$eval(".falta", l => l.length) === 4, "sem dados obrigatórios marca 4 campos e não gera PDF");
  await pg.fill("#d_empresa", "Alfombras del Sur S.A."); await pg.fill("#d_pais", "Chile"); await pg.fill("#d_contacto", "María Núñez");
  await pg.fill("#d_email", "compras@alfombrasdelsur.cl"); await pg.fill("#d_oc", "OC-2026/118"); await pg.selectOption("#d_incoterm", "CIF");
  // recarregar mantém o rascunho
  await pg.reload(); await pg.waitForSelector(".prod");
  confere(/3 producto/.test(await pg.textContent("#resumen")) && await pg.inputValue("#d_empresa") === "Alfombras del Sur S.A.", "rascunho (dados + itens) volta depois de recarregar");

  await pg.click("#revisar");
  await pg.fill(`#revTb tr[data-cod="${c3}"] input[data-f="obs"]`, "verde oscuro");
  await pg.fill("#obsGeneral", "Embarque deseado: enero 2027.\nEtiquetas en español.");
  const [dl] = await Promise.all([pg.waitForEvent("download"), pg.click("#pdf")]);
  const arq = path.join(require("os").tmpdir(), "pedido_teste.pdf"); await dl.saveAs(arq);
  console.log("     PDF:", dl.suggestedFilename(), fs.statSync(arq).size, "bytes");
  confere(/^Pedido Kapazi - Alfombras del Sur S\.A\. - \d{4}-\d\d-\d\d\.pdf$/.test(dl.suggestedFilename()), "nome do PDF tem empresa e data");
  await pg.screenshot({path: path.join(require("os").tmpdir(), "pedido_tela.png"), fullPage: false});

  // o importador do gerador lê o PDF
  const pdfjsLib = require(path.join(LIBS, "pdfjs-dist/legacy/build/pdf.js"));
  const PROD = catalogo.map((p, i) => ({cod: p.cod, desc: p.descricao, um: p.um, preco: 1, _i: i}));
  const {ctx: res, fn} = importadorDoGerador(), imp = fn(PROD, pdfjsLib, res);
  const buf = fs.readFileSync(arq);
  const {linhas} = await imp.lerPdf({arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length)});
  if(process.env.DEBUG) linhas.forEach(l => console.log("   ", l.origem, JSON.stringify(l.celulas)));
  imp.processarPedido(linhas);
  const r = res.resultado, got = r.linhas.map(l => [l.opcoes[0] && l.opcoes[0].cod, l.qtd, l.qtdLida]);
  console.log("     importador:", r.info, JSON.stringify(got));
  confere(/^Hoja de pedido Kapazi: 3 produto/.test(r.info), "gerador reconhece a Hoja de pedido (marca KZ-PED + cabeçalho)");
  confere(JSON.stringify(got) === JSON.stringify([[c1, 12, true], [c3, 3, true], [c2, 2.5, true]]), "códigos e quantidades exatos (12, 3 e 2,5)");
  confere(r.linhas.every(l => l.usar), "todos os itens marcados para entrar na proforma");

  // catálogo inteiro: várias páginas, cabeçalho repetido não vira item
  await pg.evaluate(() => { dlgRev.close(); CAT.forEach((p, i) => { itens[p.cod] = {qtd: i + 1, obs: ""}; }); });
  await pg.click("#revisar");
  const [dl2] = await Promise.all([pg.waitForEvent("download"), pg.click("#pdf")]);
  const arq2 = path.join(require("os").tmpdir(), "pedido_teste2.pdf"); await dl2.saveAs(arq2);
  const b2 = fs.readFileSync(arq2), l2 = await imp.lerPdf({arrayBuffer: async () => b2.buffer.slice(b2.byteOffset, b2.byteOffset + b2.length)});
  imp.processarPedido(l2.linhas);
  const r2 = res.resultado, esperado = await pg.evaluate(() => CAT.filter(p => itens[p.cod]).map(p => [p.cod, itens[p.cod].qtd]));
  const lidos = r2.linhas.map(l => [l.opcoes[0] && l.opcoes[0].cod, l.qtd]);
  console.log("     pedido grande:", r2.info, "|", lidos.length, "itens");
  confere(JSON.stringify(lidos) === JSON.stringify(esperado), `catálogo inteiro (${esperado.length} itens, várias páginas) importa igual`);

  confere(!erros.length, "sem erros na página" + (erros.length ? ": " + erros.join(" | ") : ""));
  await nav.close(); srv.close();
  console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : "\nTudo certo.");
  process.exit(falhas.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
