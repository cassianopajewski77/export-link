/* =====================================================================
   PONTE SUPABASE do Export Docs Pro (versão online)
   O gerador (gerador.html) é o mesmo arquivo do PC. Esta ponte:
   1. exige login (Supabase Auth) e só deixa seguir quem está na tabela "membros";
   2. lê do banco os dados que no PC vinham de dados.js, clientes_cadastrados.js,
      produtos_cadastrados.js e embalagens.js;
   3. faz o papel do ajudante local (ferramentas\servidor.ps1): as rotas /api/info, mkdir,
      listar, ler e salvar gravam no Storage (bucket "arquivos") com os mesmos caminhos
      das pastas do PC (Clientes/<cód - nome>/<nº>/...);
   4. espelha nas tabelas o que é gravado (documentos, clientes, produtos, arquivos);
   5. só então roda os scripts do gerador (marcados como type="text/x-gerador").
   ===================================================================== */
(function(){
"use strict";
const CFG = window.EXPORT_LINK_CFG;
const sb = supabase.createClient(CFG.url, CFG.key);
const BUCKET = "arquivos", MARCA_PASTA = ".emptyFolderPlaceholder";
window.PONTE = {sb};

/* ---------- caminhos do Storage ----------
   O Storage só aceita alguns caracteres ASCII. Os nomes das pastas e arquivos do gerador têm
   acentos, "–" etc., então cada caractere fora da lista vira "=XXXX;" (código hexadecimal). */
const SEGURO = /[A-Za-z0-9_\/!\-.*'() &$@;:+,]/;
const codificar = rel => Array.from(String(rel || "")).map(ch => SEGURO.test(ch) ? ch : "=" + ch.codePointAt(0).toString(16) + ";").join("");
const decodificar = s => String(s || "").replace(/=([0-9a-f]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
const limparRel = rel => String(rel || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/");
window.PONTE.codificar = codificar; window.PONTE.decodificar = decodificar;

/* ---------- utilidades ---------- */
const resp = (obj, status = 200) => new Response(JSON.stringify(obj), {status, headers:{"Content-Type":"application/json; charset=utf-8"}});
function aviso(msg, erro){
  let el = document.getElementById("ponteAviso");
  if(!el){ el = document.createElement("div"); el.id = "ponteAviso"; document.body.appendChild(el); }
  el.className = erro ? "erro" : ""; el.innerHTML = msg; el.style.display = msg ? "" : "none";
}
async function todas(tabela, colunas, filtro, ordem){
  const out = [], passo = 1000;
  for(let de = 0; ; de += passo){
    let q = sb.from(tabela).select(colunas || "*");
    if(filtro) q = filtro(q);
    if(ordem) q = q.order(ordem);
    const {data, error} = await q.range(de, de + passo - 1);
    if(error) throw new Error(`${tabela}: ${error.message}`);
    out.push(...(data || []));
    if(!data || data.length < passo) return out;
  }
}
function erroGravacao(o, e){
  console.error("Export Link – falha ao espelhar no banco:", o, e);
  if(typeof toast === "function") toast("Arquivo salvo, mas o registro no banco falhou (" + (e && e.message || e) + "). Avise o suporte.");
}

/* ---------- Storage com cache curto das listagens ---------- */
const cacheLista = new Map();   // pasta (rel) -> {t, itens}
async function listar(rel){
  rel = limparRel(rel);
  const c = cacheLista.get(rel);
  if(c && Date.now() - c.t < 4000) return c.itens;
  const itens = [];
  for(let offset = 0; ; offset += 1000){
    const {data, error} = await sb.storage.from(BUCKET).list(codificar(rel), {limit:1000, offset, sortBy:{column:"name", order:"asc"}});
    if(error) throw new Error(error.message);
    (data || []).forEach(o => { if(o.name !== MARCA_PASTA) itens.push({nome: decodificar(o.name), tipo: o.id == null ? "dir" : "arquivo", tamanho: o.metadata && o.metadata.size, data: o.updated_at || o.created_at}); });
    if(!data || data.length < 1000) break;
  }
  cacheLista.set(rel, {t: Date.now(), itens});
  return itens;
}
function esquecer(rel){
  rel = limparRel(rel);
  const partes = rel.split("/");
  for(let i = 0; i <= partes.length; i++) cacheLista.delete(partes.slice(0, i).join("/"));
}
async function info(rel){
  rel = limparRel(rel);
  if(!rel) return {existe:true, tipo:"dir"};
  const i = rel.lastIndexOf("/"), pai = i < 0 ? "" : rel.slice(0, i), nome = rel.slice(i + 1);
  const it = (await listar(pai)).find(x => x.nome === nome);
  return it ? {existe:true, tipo:it.tipo} : {existe:false, tipo:""};
}
async function ler(rel){
  const {data, error} = await sb.storage.from(BUCKET).download(codificar(limparRel(rel)));
  if(error || !data) return null;
  return data;
}
const TIPOS = {pdf:"application/pdf", json:"application/json", js:"application/javascript", xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls:"application/vnd.ms-excel", docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document", csv:"text/csv", txt:"text/plain", png:"image/png", jpg:"image/jpeg", jpeg:"image/jpeg"};
const tipoDe = nome => TIPOS[String(nome).split(".").pop().toLowerCase()] || "application/octet-stream";
async function salvar(rel, blob){
  rel = limparRel(rel);
  const nome = rel.split("/").pop();
  const corpo = blob instanceof Blob ? blob : new Blob([blob]);
  const {error} = await sb.storage.from(BUCKET).upload(codificar(rel), corpo, {upsert:true, contentType: tipoDe(nome), cacheControl:"0"});
  if(error) throw new Error(error.message);
  esquecer(rel);
  await espelhar(rel, corpo).catch(e => erroGravacao(rel, e));
}
async function criarPasta(rel){
  rel = limparRel(rel);
  if((await info(rel)).existe) return;
  const {error} = await sb.storage.from(BUCKET).upload(codificar(rel + "/" + MARCA_PASTA), new Blob([""]), {upsert:true, contentType:"text/plain"});
  if(error) throw new Error(error.message);
  esquecer(rel + "/x");
}
window.PONTE.storage = {listar, info, ler, salvar, criarPasta};

/* ---------- espelho no banco do que é gravado ---------- */
let codsBase = new Set(), codsTabela = new Set(), origemCli = new Map();
const lerArrayJs = txt => { const i = txt.indexOf("["), f = txt.lastIndexOf("]"); return i >= 0 && f > i ? JSON.parse(txt.slice(i, f + 1)) : []; };
const v = s => { s = s == null ? "" : String(s).trim(); return s === "" ? null : s; };
const linhaCliente = c => ({cod:c.cod, loja:v(c.loja) || "01", nome:c.nome || c.cod, contato:v(c.contato), endereco:v(c.end), numero:v(c.nr), bairro:v(c.bairro),
  municipio:v(c.mun), estado:v(c.est), pais:v(c.pais), doc:v(c.doc), doc_tipo:v(c.docTipo), doc_valido:c.docValido == null ? null : !!c.docValido,
  email:v(c.email), ddd:v(c.ddd), telefone:v(c.tel), vendedor:v(c.vend), bloqueado:!!c.bloq, ativo:true});

async function espelhar(rel, blob){
  const partes = rel.split("/"), nome = partes[partes.length - 1];
  if(rel === "clientes_cadastrados.js") return espelharClientes(lerArrayJs(await blob.text()));
  if(rel === "produtos_cadastrados.js") return espelharProdutos(lerArrayJs(await blob.text()));
  if(nome === MARCA_PASTA) return;
  const mDoc = /^dados_(proforma|invoice|packing)\.json$/.exec(nome);
  const ehFp = partes.includes("Formacao de Preco") && /\.json$/i.test(nome);
  if(mDoc || ehFp){
    const d = JSON.parse(await blob.text());
    let tipo, numero, data, incoterm, moeda, total = null, status = "emitido";
    if(ehFp){ tipo = "formacao_preco"; numero = (partes[0] === "Clientes" ? partes[1] + " / " : "") + nome.replace(/\.json$/i, ""); data = d.data || null; incoterm = d.incoterm || null; status = "rascunho"; }
    else if(mDoc[1] === "proforma"){ tipo = "proforma"; const pf = d.pf || {}; numero = pf.numero; data = pf.fecha; incoterm = pf.incoterm; moeda = pf.moeda; status = pf.emitido ? "emitido" : "rascunho"; }
    else { tipo = mDoc[1]; numero = d.numero || d.proforma; data = d.fecha; incoterm = d.incoterm; moeda = d.moeda;
      if(tipo === "invoice") total = Math.round(((d.itens || []).reduce((s, i) => s + (+i.qtd || 0) * (+i.preco || 0), 0) + (+d.flete || 0) + (+d.seguro || 0) + (+d.otros || 0)) * 100) / 100; }
    if(!numero) return;
    if(tipo !== "formacao_preco"){
      // outro usuário pode ter usado o mesmo número ao mesmo tempo: não sobrescreve documento de outro cliente
      const {data: ja} = await sb.from("documentos").select("dados").eq("tipo", tipo).eq("numero", String(numero).toUpperCase());
      const codDe = x => x && ((x.cliente && x.cliente.cod) || (x.imp && x.imp.cod)) || "";
      if(ja && ja[0] && codDe(ja[0].dados) && codDe(d) && codDe(ja[0].dados) !== codDe(d))
        throw new Error(`o número ${numero} já existe no banco para outro cliente (${codDe(ja[0].dados)}); mude o número e salve de novo`);
    }
    const {error} = await sb.from("documentos").upsert({tipo, numero, status, data_doc: /^\d{4}-\d\d-\d\d$/.test(data || "") ? data : null, incoterm: incoterm || null, moeda: moeda || null, total, dados: d}, {onConflict:"tipo,numero"});
    if(error) throw new Error(error.message);
    return;
  }
  // demais arquivos: só registra na tabela "arquivos"
  let categoria = "outro", cliente_cod = null, produto_cod = null;
  if(partes[0] === "Clientes" && partes.length > 2){
    cliente_cod = partes[1].split(" - ")[0] || null;
    categoria = /^Pedido do cliente - /.test(nome) ? "pedido_cliente" : partes[2] === "Documentos" ? "doc_cliente" : partes[2] === "Formacao de Preco" ? "formacao_preco" : "documento_gerado";
  } else if(partes[0] === "Produtos" && partes.length > 2){ categoria = "doc_produto"; produto_cod = partes[1]; }
  else if(partes[0] === "Formacao de Preco"){ categoria = "formacao_preco"; }
  else return;   // planilhas, cadastros etc. ficam só no Storage
  const {error} = await sb.from("arquivos").upsert({categoria, cliente_cod, produto_cod, nome, storage_path: codificar(rel), mime: tipoDe(nome), tamanho: blob.size}, {onConflict:"storage_path"});
  if(error) throw new Error(error.message);
}
async function espelharClientes(lista){
  const gravar = [], voltarBase = [], desativar = [];
  for(const c of lista){
    if(!c || !c.cod) continue;
    if(c.excluido){ (codsBase.has(c.cod) ? voltarBase : desativar).push(c.cod); continue; }
    gravar.push({...linhaCliente(c), origem: codsBase.has(c.cod) ? "editado" : "cadastrado"});
  }
  if(gravar.length){ const {error} = await sb.from("clientes").upsert(gravar, {onConflict:"cod"}); if(error) throw new Error(error.message); }
  if(voltarBase.length){ const {error} = await sb.from("clientes").update({origem:"base"}).in("cod", voltarBase); if(error) throw new Error(error.message); }
  if(desativar.length){ const {error} = await sb.from("clientes").update({ativo:false}).in("cod", desativar); if(error) throw new Error(error.message); }
}
async function espelharProdutos(lista){
  const gravar = lista.filter(p => p && p.cod && !codsTabela.has(p.cod)).map(p => ({cod:p.cod, descricao:p.desc || p.cod, um:v(p.um), ncm:v(p.ncm),
    origem:"CADASTRO MANUAL", manual:true, preco_manual: p.preco === "" || p.preco == null ? null : +p.preco, ativo: !p.excluido}));
  if(gravar.length){ const {error} = await sb.from("produtos").upsert(gravar, {onConflict:"cod"}); if(error) throw new Error(error.message); }
}

/* ---------- dados do exportador (Exportador) compartilhados pelo banco ---------- */
function ligarConfig(valor){
  try{ if(valor && Object.keys(valor).length) localStorage.setItem("pf_cfg", JSON.stringify(valor)); }catch(e){}
  const orig = Storage.prototype.setItem;
  Storage.prototype.setItem = function(k, val){
    orig.call(this, k, val);
    if(this === localStorage && k === "pf_cfg"){
      let obj; try{ obj = JSON.parse(val); }catch(e){ return; }
      sb.from("configuracoes").upsert({chave:"exportador", valor: obj}, {onConflict:"chave"}).then(({error}) => { if(error) erroGravacao("configuracoes", error); });
    }
  };
}

/* ---------- o "ajudante local" agora é esta ponte ---------- */
function ligarApi(){
  const fetchOrig = window.fetch.bind(window);
  window.fetch = async function(entrada, opts){
    const url = typeof entrada === "string" ? entrada : entrada && entrada.url;
    let u; try{ u = new URL(url, location.href); }catch(e){ return fetchOrig(entrada, opts); }
    if(u.origin !== location.origin || !u.pathname.startsWith("/api/") || u.pathname === "/api/foto") return fetchOrig(entrada, opts);
    const rota = u.pathname.slice(5), rel = limparRel(u.searchParams.get("c") || "");
    try{
      switch(rota){
        case "ping":   return resp({ok:true, versao:2, pasta:"Export Link (online)"});
        case "info":   return resp(await info(rel));
        case "mkdir":  await criarPasta(rel); return resp({ok:true});
        case "listar": return resp({itens: (await listar(rel)).map(i => ({nome:i.nome, tipo:i.tipo}))});
        case "ler":  { const b = await ler(rel); return b ? new Response(b, {status:200, headers:{"Content-Type":"application/octet-stream"}}) : resp({erro:"não encontrado"}, 404); }
        case "salvar": await salvar(rel, opts && opts.body); return resp({ok:true});
        case "abrir":  abrirArquivos(rel); return resp({ok:true});
        case "pdf":    return resp({ok:false, gerados:[], erros:["no sistema online o PDF sai pelo botão PDF / Imprimir > Salvar como PDF (o Excel ficou salvo)"]});
        default:       return resp({erro:"rota desconhecida: " + rota}, 404);
      }
    }catch(e){ return resp({erro: e && e.message || String(e)}, 500); }
  };
}

/* ---------- janela "Arquivos" (substitui abrir a pasta no Explorer) ---------- */
let dlgArq = null, arqAtual = "";
function abrirArquivos(rel){
  if(!dlgArq){
    dlgArq = document.createElement("dialog"); dlgArq.id = "ponteArquivos";
    dlgArq.innerHTML = `<div class="pa-top"><b>Arquivos</b><span id="paCaminho"></span><button type="button" id="paFechar">Fechar</button></div><div id="paLista"></div>`;
    document.body.appendChild(dlgArq);
    dlgArq.querySelector("#paFechar").onclick = () => dlgArq.close();
  }
  arqAtual = limparRel(rel); mostrarArquivos(); if(!dlgArq.open) dlgArq.showModal();
}
async function mostrarArquivos(){
  const lista = dlgArq.querySelector("#paLista"), cam = dlgArq.querySelector("#paCaminho");
  const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  cam.textContent = " / " + (arqAtual || "(início)");
  lista.innerHTML = "Carregando…";
  let itens; try{ itens = await listar(arqAtual); }catch(e){ lista.textContent = "Erro: " + e.message; return; }
  const linhas = [];
  if(arqAtual) linhas.push(`<div class="pa-it pa-dir" data-ir="${esc(arqAtual.split("/").slice(0, -1).join("/"))}">⬆ voltar</div>`);
  itens.filter(i => i.tipo === "dir").forEach(i => linhas.push(`<div class="pa-it pa-dir" data-ir="${esc((arqAtual ? arqAtual + "/" : "") + i.nome)}">📁 ${esc(i.nome)}</div>`));
  itens.filter(i => i.tipo !== "dir").forEach(i => linhas.push(`<div class="pa-it" data-baixar="${esc((arqAtual ? arqAtual + "/" : "") + i.nome)}">📄 ${esc(i.nome)}<small>${i.tamanho ? (i.tamanho / 1024).toFixed(0) + " KB" : ""}</small></div>`));
  lista.innerHTML = linhas.join("") || "<i>Pasta vazia.</i>";
  lista.querySelectorAll("[data-ir]").forEach(el => el.onclick = () => { arqAtual = el.dataset.ir; mostrarArquivos(); });
  lista.querySelectorAll("[data-baixar]").forEach(el => el.onclick = async () => {
    const b = await ler(el.dataset.baixar); if(!b) return alert("Arquivo não encontrado.");
    const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = el.dataset.baixar.split("/").pop();
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });
}
window.PONTE.abrirArquivos = abrirArquivos;

/* ---------- importar a pasta "Gerador de Proforma" do PC para o Storage ---------- */
const IMPORTAR = [/^Clientes\//, /^Produtos\//, /^Formacao de Preco\//, /^Pedidos\//, /^planilhas\/(base_fotos|SKUImagens|base_embalagens)\.xlsx$/, /^(clientes|produtos)_cadastrados\.js$/];
function importarPasta(){
  const inp = document.createElement("input"); inp.type = "file"; inp.webkitdirectory = true; inp.multiple = true;
  inp.onchange = async () => {
    const arqs = [...inp.files].map(f => ({f, rel: f.webkitRelativePath.split("/").slice(1).join("/")}))
      .filter(x => IMPORTAR.some(r => r.test(x.rel)) && !/(^|\/)~\$/.test(x.rel) && x.f.size < 45 * 1024 * 1024);
    if(!arqs.length) return alert('Nenhum arquivo do gerador encontrado. Escolha a pasta "Gerador de Proforma" da área de trabalho.');
    if(!confirm(`Enviar ${arqs.length} arquivo(s) para o sistema online?\n(pastas dos clientes, produtos, formação de preço, pedidos, base de fotos, SKUImagens e cadastros)\nArquivos com o mesmo nome no sistema online serão substituídos.`)) return;
    // os .json de documentos depois dos cadastros, para o cliente já existir no banco
    arqs.sort((a, b) => (/_cadastrados\.js$/.test(b.rel) - /_cadastrados\.js$/.test(a.rel)) || a.rel.localeCompare(b.rel));
    let ok = 0; const erros = [];
    for(const x of arqs){
      aviso(`Enviando ${ok + erros.length + 1} de ${arqs.length}: ${x.rel}`);
      try{ await salvar(x.rel, x.f); ok++; }catch(e){ erros.push(x.rel + ": " + e.message); }
    }
    aviso("");
    alert(`${ok} arquivo(s) enviados.` + (erros.length ? `\n\n${erros.length} com erro:\n` + erros.slice(0, 15).join("\n") : "") + "\n\nA página vai recarregar para usar os dados novos.");
    location.reload();
  };
  inp.click();
}
window.PONTE.importarPasta = importarPasta;

/* ---------- carga dos dados do banco no formato dos arquivos .js do PC ---------- */
async function carregarDados(){
  const [clientes, produtos, tabelas, emb, cfgs, docs] = await Promise.all([
    todas("clientes", "*", q => q.eq("ativo", true), "cod"),
    todas("produtos", "*", q => q.eq("manual", true), "cod"),
    todas("tabelas_preco", "id,nome,importado_em", q => q.eq("vigente", true)),
    todas("embalagens", "*", null, "cod"),
    todas("configuracoes", "chave,valor"),
    todas("documentos", "numero", q => q.eq("tipo", "proforma"))
  ]);
  // numeração: os números já usados por qualquer usuário entram na lista do gerador (pf_numeros)
  try{
    const usados = JSON.parse(localStorage.getItem("pf_numeros") || "[]");
    docs.forEach(d => { if(d.numero && !usados.includes(d.numero)) usados.push(d.numero); });
    localStorage.setItem("pf_numeros", JSON.stringify(usados));
  }catch(e){}
  const tab = tabelas[0];
  const precos = tab ? await todas("precos", "linha,cod,descricao,um,preco_fcl,ncm,origem", q => q.eq("tabela_id", tab.id), "linha") : [];
  const paraBase = c => ({cod:c.cod, loja:c.loja || "", nome:c.nome, contato:c.contato || "", end:c.endereco || "", nr:c.numero || "", bairro:c.bairro || "", mun:c.municipio || "",
    est:c.estado || "", email:c.email || "", ddd:c.ddd || "", tel:c.telefone || "", doc:c.doc || "", vend:c.vendedor || "", status:c.status || "", bloq:!!c.bloqueado});
  clientes.forEach(c => origemCli.set(c.cod, c.origem));
  const base = clientes.filter(c => c.origem !== "cadastrado");
  codsBase = new Set(base.map(c => c.cod));
  codsTabela = new Set(precos.map(p => p.cod));
  const dt = tab && tab.importado_em ? new Date(tab.importado_em) : null;
  window.DADOS = {
    atualizado: dt ? dt.toLocaleDateString("pt-BR") + " " + dt.toLocaleTimeString("pt-BR", {hour:"2-digit", minute:"2-digit"}) : "",
    clientes: base.map(paraBase),
    produtos: precos.map(p => ({cod:p.cod, desc:p.descricao || "", um:p.um || "", preco:p.preco_fcl == null ? null : +p.preco_fcl, ncm:p.ncm || "", origem:p.origem || ""}))
  };
  // cadastros: o arquivo gravado pelo gerador (mantém fotos e marcas de exclusão); sem ele, monta pelo banco
  const [cliJs, prodJs] = await Promise.all([ler("clientes_cadastrados.js"), ler("produtos_cadastrados.js")]);
  window.CLIENTES_CADASTRADOS = cliJs ? lerArrayJs(await cliJs.text()) :
    clientes.filter(c => c.origem !== "base").map(c => ({...paraBase(c), pais:c.pais || undefined, docTipo:c.doc_tipo || undefined, docValido:c.doc_valido == null ? undefined : c.doc_valido, atualizado: Date.parse(c.atualizado_em) || 0}));
  window.PRODUTOS_CADASTRADOS = prodJs ? lerArrayJs(await prodJs.text()) :
    produtos.map(p => ({cod:p.cod, desc:p.descricao, um:p.um || "", preco:p.preco_manual == null ? "" : +p.preco_manual, ncm:p.ncm || "", atualizado: Date.parse(p.atualizado_em) || 0}));
  window.EMBALAGENS = {};
  emb.forEach(e => { window.EMBALAGENS[String(e.cod).toUpperCase()] = {tipo:e.tipo || "", porEmb:e.por_embalagem == null ? null : +e.por_embalagem, pesoLiqUnit:e.peso_liq_unit == null ? null : +e.peso_liq_unit,
    pesoBrutoEmb:e.peso_bruto_emb == null ? null : +e.peso_bruto_emb, comp:e.comprimento == null ? null : +e.comprimento, larg:e.largura == null ? null : +e.largura, alt:e.altura == null ? null : +e.altura, obs:e.obs || ""}; });
  const exp = cfgs.find(c => c.chave === "exportador");
  return exp ? exp.valor : null;
}

/* ---------- barra do usuário no topo ---------- */
function barraUsuario(email){
  const top = document.querySelector("header.top"); if(!top) return;
  const box = document.createElement("span"); box.className = "ponte-user";
  box.innerHTML = `<button class="btn ghost" type="button" data-p="arq" title="Pastas dos clientes, PDFs, Excel e pedidos salvos no sistema online">Arquivos</button>
    <button class="btn ghost" type="button" data-p="imp" title="Envia a pasta Gerador de Proforma do PC (pastas dos clientes, base de fotos, SKUImagens, cadastros)">Importar do PC</button>
    <span class="ponte-email" title="Usuário conectado">${email.replace(/[&<>"]/g, "")}</span>
    <button class="btn ghost" type="button" data-p="sair">Sair</button>`;
  top.appendChild(box);
  box.querySelector('[data-p="arq"]').onclick = () => abrirArquivos("Clientes");
  box.querySelector('[data-p="imp"]').onclick = importarPasta;
  box.querySelector('[data-p="sair"]').onclick = async () => { await sb.auth.signOut(); location.replace("index.html"); };
}

/* ---------- roda os scripts do gerador depois que os dados chegaram ---------- */
function rodarGerador(){
  document.querySelectorAll('script[type="text/x-gerador"]').forEach(s => {
    const n = document.createElement("script"); n.textContent = s.textContent; s.replaceWith(n);
  });
}
const domPronto = () => new Promise(ok => document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", ok, {once:true}) : ok());

async function iniciar(){
  await domPronto();
  aviso("Conectando ao Export Link…");
  const {data:{session}} = await sb.auth.getSession();
  if(!session){ location.replace("index.html"); return; }
  const email = session.user && session.user.email || "";
  const {data: membros, error: eMem} = await sb.from("membros").select("email");
  if(eMem) throw new Error(eMem.message);
  if(!membros || !membros.length){
    aviso(`O e-mail <b>${email.replace(/[&<>"]/g, "")}</b> entrou, mas ainda não tem acesso aos dados. Peça para rodar o script <b>03_liberar_usuarios.sql</b> no Supabase. <button type="button" onclick="PONTE.sb.auth.signOut().then(()=>location.replace('index.html'))">Sair</button>`, true);
    return;
  }
  aviso("Carregando clientes, produtos e tabela de preço…");
  const exportador = await carregarDados();
  ligarConfig(exportador);
  ligarApi();
  aviso("");
  rodarGerador();
  barraUsuario(email);
  sb.auth.onAuthStateChange((ev, s) => { if(ev === "SIGNED_OUT" || !s) location.replace("index.html"); });
}
iniciar().catch(e => { console.error(e); aviso("Não foi possível carregar o sistema: " + (e && e.message || e) + ". Recarregue a página (F5).", true); });
})();
