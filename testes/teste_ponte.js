// Teste da versão online com um Supabase falso (testes/fake-supabase.js), sem internet.
// Uso: SEMENTE=/caminho/semente.json LIBS=/caminho/libs node testes/teste_ponte.js
//   SEMENTE: {tabelas:{empresas:[...], membros:[...], plataforma_admins:[...], clientes:[...], produtos:[...], tabelas_preco:[...], precos:[...], documentos:[...]}}
//   (export das tabelas do banco depois do script 07; a Kapazi com storage_legado = true)
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
  await pg.fill("#email", "Cassiano.Pajewski@Kapazi.com.br"); await pg.fill("#senha", "errada"); await pg.click("#btn");
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
  confere(await pg.evaluate(() => cfg.banco && /BNY|NEW YORK MELLON/i.test(cfg.banco)), "dados bancários vêm do cadastro da empresa");
  confere(await pg.evaluate(() => cfg.cnpj === "80.051.824/0001-20" && PREFIXO === "KZ" && LOGO.startsWith("data:image/png")), "CNPJ, prefixo KZ e logo da Kapazi");
  confere(await pg.textContent(".ponte-empresa") === "Kapazi", "barra mostra a empresa");
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

  // 6) cadastro do exportador (botão Exportador) grava na tabela empresas e volta no cfg
  await pg.evaluate(() => abrirConfig());
  await pg.fill('#empCadastro [data-e="contato"]', "Teste Contato");
  await pg.fill('#empCadastro [data-e="cargo"]', "Gerente de Exportação");
  await pg.click("#empMaisConta");
  await pg.fill('#empCadastro [data-conta="1"] [data-c="moeda"]', "EUR");
  await pg.fill('#empCadastro [data-conta="1"] [data-c="banco"]', "Banco Euro");
  await pg.screenshot({path: path.join(__dirname, "saida", "cadastro-exportador.png"), fullPage: false});
  await Promise.all([pg.waitForNavigation(), pg.click("#empSalvar")]);
  await pg.waitForFunction(() => document.querySelector(".ponte-user"), null, {timeout:20000});
  confere(await pg.evaluate(() => cfg.contacto === "Teste Contato – Gerente de Exportação" && /BNY|MELLON/i.test(cfg.banco)), "cadastro salvo e usado no gerador (" + await pg.evaluate(() => cfg.contacto) + ")");
  confere(await pg.evaluate(() => FAKE_DB.tabelas.empresas[0].contas.length === 2), "segunda conta bancária gravada");

  // 7) janela Arquivos abre e lista as pastas
  await pg.click('.ponte-user [data-p="arq"]');
  await pg.waitForFunction(() => /007700 - SCA SACI/.test(document.getElementById("paLista").textContent));
  confere(true, "janela Arquivos lista as pastas dos clientes");
  await pg.screenshot({path: path.join(__dirname, "saida", "gerador-online.png")});

  await pg.evaluate(() => PONTE.abrirArquivos && document.getElementById("ponteArquivos").close());

  // 8) migrar os arquivos antigos para a pasta da empresa
  const KZ = "4b415a49-0000-4000-8000-000000000001";
  await Promise.all([pg.waitForNavigation({timeout:30000}), pg.click('.ponte-user [data-p="mig"]')]);
  await pg.waitForFunction(() => document.querySelector(".ponte-user"), null, {timeout:20000});
  const mig = await pg.evaluate(() => ({chaves: Object.keys(FAKE_DB.storage.arquivos), arqs: FAKE_DB.tabelas.arquivos, leg: FAKE_DB.tabelas.empresas[0].storage_legado}));
  confere(mig.chaves.length > 0 && mig.chaves.every(k => k.startsWith(KZ + "/")), "todos os arquivos movidos para a pasta da Kapazi");
  confere(mig.arqs.every(a => a.storage_path.startsWith(KZ + "/")), "tabela arquivos aponta para o caminho novo");
  confere(mig.leg === false && !(await pg.$('.ponte-user [data-p="mig"]')), "migração concluída (botão some)");
  const achou2 = await pg.evaluate(async () => { pastasLidas = false; await lerProformasDasPastas(await obterPasta(false)); return proformasPasta.has("KZSS-004/26"); });
  confere(achou2, "depois da migração, Abrir proforma continua achando a KZSS-004/26");

  // 9) usuários: incluir um usuário de consulta
  await pg.click('.ponte-user [data-p="usu"]');
  await pg.waitForSelector("#nuEmail");
  await pg.fill("#nuEmail", "Leitor@Kapazi.com.br"); await pg.selectOption("#nuPapel", "consulta"); await pg.click("#nuAdd");
  await pg.waitForFunction(() => /Leitor@kapazi|leitor@kapazi/.test(document.querySelector("#empUsuarios .emp-tab").textContent));
  confere(await pg.evaluate(() => FAKE_DB.tabelas.membros.some(m => m.email === "leitor@kapazi.com.br" && m.papel === "consulta")), "usuário de consulta incluído");
  await pg.screenshot({path: path.join(__dirname, "saida", "usuarios.png")});
  await pg.evaluate(() => document.getElementById("empUsuarios").close());

  // 10) plataforma: criar outra exportadora e entrar nela
  await pg.click('.ponte-user [data-p="emp"]');
  await pg.waitForSelector("#neNome");
  await pg.fill("#neNome", "Exportadora Teste"); await pg.fill("#neEmail", "admin@teste.com"); await pg.fill("#nePref", "et"); await pg.click("#neCriar");
  await pg.waitForFunction(() => /Exportadora Teste/.test(document.querySelector("#empEmpresas .emp-tab").textContent));
  await pg.screenshot({path: path.join(__dirname, "saida", "empresas.png")});
  await Promise.all([pg.waitForNavigation(), pg.click("#empEmpresas [data-entrar]")]);
  await pg.waitForFunction(() => document.querySelector(".ponte-user"), null, {timeout:20000});
  const b = await pg.evaluate(() => ({cli: CLI.length, prod: PROD.length, cnpj: cfg.cnpj, banco: cfg.banco, pref: PREFIXO, emp: document.querySelector(".ponte-empresa").textContent, sup: document.querySelector(".ponte-empresa").classList.contains("suporte"), logo: LOGO}));
  confere(b.cli === 0 && b.prod === 0, `outra empresa não vê clientes/produtos da Kapazi (${b.cli}/${b.prod})`);
  confere(!b.cnpj && !b.banco && !b.logo && b.pref === "ET", "outra empresa sem dados nem logo da Kapazi, prefixo ET");
  confere(b.emp === "Exportadora Teste" && b.sup, "barra mostra a empresa em modo suporte");

  // 11) administrador da nova empresa entra, cadastra cliente e emite proforma
  await pg.evaluate(() => PONTE.sb.auth.signOut());
  await pg.goto(base + "/index.html");
  await pg.fill("#email", "admin@teste.com"); await pg.fill("#senha", "certa"); await pg.click("#btn");
  await pg.waitForURL(/gerador\.html/);
  await pg.waitForFunction(() => document.querySelector(".ponte-user"), null, {timeout:20000});
  confere(!(await pg.$('.ponte-user [data-p="emp"]')) && !!(await pg.$('.ponte-user [data-p="usu"]')), "admin da empresa vê Usuários mas não Empresas");
  await pg.evaluate(() => abrirConfig());
  await pg.fill('#empCadastro [data-e="razao_social"]', "EXPORTADORA TESTE LTDA");
  await pg.fill('#empCadastro [data-e="cnpj"]', "11.111.111/0001-11");
  await pg.fill('#empCadastro [data-e="logradouro"]', "Rua A"); await pg.fill('#empCadastro [data-e="numero"]', "10");
  await pg.fill('#empCadastro [data-e="cidade"]', "Curitiba"); await pg.fill('#empCadastro [data-e="uf"]', "PR");
  await pg.click("#empMaisConta");
  await pg.fill('#empCadastro [data-conta="0"] [data-c="banco"]', "Banco Teste"); await pg.fill('#empCadastro [data-conta="0"] [data-c="swift"]', "TESTBRXX");
  await pg.setInputFiles("#empLogoArq", {name: "logo.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR42mP8z8DwnwEIGAEAD/wC/wq2YQAAAABJRU5ErkJggg==", "base64")});
  await pg.waitForFunction(() => document.getElementById("empLogoImg").src.startsWith("data:image/png"));
  await Promise.all([pg.waitForNavigation(), pg.click("#empSalvar")]);
  await pg.waitForFunction(() => document.querySelector(".ponte-user"), null, {timeout:20000});
  const c2 = await pg.evaluate(() => ({empresa: cfg.empresa, dir: cfg.direccion, banco: cfg.banco, logo: LOGO.slice(0, 22), prop: window.LOGO_PROP}));
  console.log("     empresa B:", JSON.stringify(c2));
  confere(c2.empresa === "EXPORTADORA TESTE LTDA" && /Rua A, 10/.test(c2.dir) && /Curitiba – PR/.test(c2.dir) && /Banco Teste · SWIFT: TESTBRXX/.test(c2.banco), "cadastro da empresa B usado no gerador");
  confere(c2.logo === "data:image/png;base64," && c2.prop === 2, "logo da empresa B carregado do Storage (proporção 2:1)");
  await pg.evaluate(async () => {
    clientesCad = [{cod:"B0001", nome:"IMPORTADOR SUL", doc:"1", end:"Av 1", pais:"PY", docTipo:"RUC", atualizado:Date.now()}];
    await obterPasta(true); await gravarJS("clientes_cadastrados.js", "CLIENTES_CADASTRADOS", clientesCad, "Clientes cadastrados no Gerador de Proforma.");
    aplicarCliente(clientesCad[0]);
    state.itens.push({cod:"X1", desc:"PRODUCTO X", um:"PIEZA", preco:5, qtd:2});
    render();
    await exportarExcel();
  });
  await pg.waitForTimeout(1500);
  const sb2 = await pg.evaluate(() => { const B = FAKE_DB.tabelas.empresas.find(e => e.nome === "Exportadora Teste").id;
    return {B, num: state.pf.numero, chaves: Object.keys(FAKE_DB.storage.arquivos).filter(k => k.startsWith(B + "/")), doc: FAKE_DB.tabelas.documentos.find(d => d.empresa_id === B), cli: FAKE_DB.tabelas.clientes.find(c => c.cod === "B0001"),
      ls: Object.keys(localStorage).filter(k => k.startsWith(B + ":pf_")).length, html: document.getElementById("print").innerHTML.length}; });
  console.log("     número B:", sb2.num, "| arquivos:", sb2.chaves.length);
  confere(sb2.num === "ETIS-001/26", "numeração da empresa B com prefixo próprio e sequência própria (ETIS-001/26)");
  confere(sb2.chaves.some(k => /\/Clientes\/B0001 - IMPORTADOR SUL\/ETIS-001-26\/dados_proforma\.json$/.test(k)), "arquivos da empresa B na pasta dela");
  confere(sb2.doc && sb2.doc.numero === "ETIS-001/26" && sb2.cli && sb2.cli.empresa_id === sb2.B, "documento e cliente gravados com a empresa B");
  confere(sb2.ls > 0, "dados do navegador separados por empresa");
  await pg.evaluate(() => imprimir());
  const pv = await pg.evaluate(() => document.getElementById("print").textContent);
  confere(/EXPORTADORA TESTE LTDA/.test(pv) && /11\.111\.111\/0001-11/.test(pv) && !/KAPAZI|80\.051\.824/i.test(pv), "proforma impressa com os dados da empresa B e nada da Kapazi");

  // 12) e a Kapazi não vê nada da empresa B
  await pg.evaluate(() => PONTE.sb.auth.signOut());
  await pg.goto(base + "/index.html");
  await pg.fill("#email", "assistente@kapazi.com.br"); await pg.fill("#senha", "certa"); await pg.click("#btn");
  await pg.waitForURL(/gerador\.html/);
  await pg.waitForFunction(() => document.querySelector(".ponte-user"), null, {timeout:20000});
  const k = await pg.evaluate(async () => ({cli: CLI.some(c => c.cod === "B0001"), pastas: (await PONTE.storage.listar("Clientes")).map(i => i.nome), cnpj: cfg.cnpj}));
  confere(!k.cli && !k.pastas.some(n => /IMPORTADOR SUL/.test(n)) && k.cnpj === "80.051.824/0001-20", "Kapazi não vê cliente nem pasta da empresa B");

  confere(!erros.length, "sem erros de JavaScript na página" + (erros.length ? ": " + erros.join(" | ") : ""));
  await nav.close(); srv.close();
  console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : "\nTudo OK");
  process.exit(falhas.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
