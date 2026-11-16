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
   Multiempresa (script 07): cada usuário pertence a uma empresa exportadora. Os dados do
   exportador, o logo e o prefixo da numeração vêm do cadastro da empresa (tabela empresas);
   os arquivos ficam na pasta <id da empresa>/ do Storage e o banco separa as empresas (RLS).
   ===================================================================== */
(function(){
"use strict";
const CFG = window.EXPORT_LINK_CFG;
const sb = supabase.createClient(CFG.url, CFG.key);
const BUCKET = "arquivos", MARCA_PASTA = ".emptyFolderPlaceholder";
window.PONTE = {sb};
let EMP = null, EMPRESA = null, SESSAO = null, PASTA = "";   // empresa atual; PASTA = "<id>/" (ou "" nos arquivos antigos da Kapazi)

/* ---------- caminhos do Storage ----------
   O Storage só aceita alguns caracteres ASCII. Os nomes das pastas e arquivos do gerador têm
   acentos, "–" etc., então cada caractere fora da lista vira "=XXXX;" (código hexadecimal). */
const SEGURO = /[A-Za-z0-9_\/!\-.*'() &$@;:+,]/;
const codificar = rel => Array.from(String(rel || "")).map(ch => SEGURO.test(ch) ? ch : "=" + ch.codePointAt(0).toString(16) + ";").join("");
const decodificar = s => String(s || "").replace(/=([0-9a-f]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
const limparRel = rel => String(rel || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/");
const chave = rel => (PASTA + codificar(rel)).replace(/\/+$/, "");   // caminho no bucket, já na pasta da empresa
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
    const {data, error} = await sb.storage.from(BUCKET).list(chave(rel), {limit:1000, offset, sortBy:{column:"name", order:"asc"}});
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
  const {data, error} = await sb.storage.from(BUCKET).download(chave(limparRel(rel)));
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
  const {error} = await sb.storage.from(BUCKET).upload(chave(rel), corpo, {upsert:true, contentType: tipoDe(nome), cacheControl:"0"});
  if(error) throw new Error(error.message);
  esquecer(rel);
  await espelhar(rel, corpo).catch(e => erroGravacao(rel, e));
}
async function criarPasta(rel){
  rel = limparRel(rel);
  if((await info(rel)).existe) return;
  const {error} = await sb.storage.from(BUCKET).upload(chave(rel + "/" + MARCA_PASTA), new Blob([""]), {upsert:true, contentType:"text/plain"});
  if(error) throw new Error(error.message);
  esquecer(rel + "/x");
}
window.PONTE.storage = {listar, info, ler, salvar, criarPasta};

/* ---------- espelho no banco do que é gravado ---------- */
let codsBase = new Set(), codsTabela = new Set(), origemCli = new Map();
const lerArrayJs = txt => { const i = txt.indexOf("["), f = txt.lastIndexOf("]"); return i >= 0 && f > i ? JSON.parse(txt.slice(i, f + 1)) : []; };
const v = s => { s = s == null ? "" : String(s).trim(); return s === "" ? null : s; };
const linhaCliente = c => ({empresa_id:EMP, cod:c.cod, loja:v(c.loja) || "01", nome:c.nome || c.cod, contato:v(c.contato), endereco:v(c.end), numero:v(c.nr), bairro:v(c.bairro),
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
    const {error} = await sb.from("documentos").upsert({empresa_id:EMP, tipo, numero, status, data_doc: /^\d{4}-\d\d-\d\d$/.test(data || "") ? data : null, incoterm: incoterm || null, moeda: moeda || null, total, dados: d}, {onConflict:"empresa_id,tipo,numero"});
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
  const {error} = await sb.from("arquivos").upsert({empresa_id:EMP, categoria, cliente_cod, produto_cod, nome, storage_path: chave(rel), mime: tipoDe(nome), tamanho: blob.size}, {onConflict:"storage_path"});
  if(error) throw new Error(error.message);
}
async function espelharClientes(lista){
  const gravar = [], voltarBase = [], desativar = [];
  for(const c of lista){
    if(!c || !c.cod) continue;
    if(c.excluido){ (codsBase.has(c.cod) ? voltarBase : desativar).push(c.cod); continue; }
    gravar.push({...linhaCliente(c), origem: codsBase.has(c.cod) ? "editado" : "cadastrado"});
  }
  if(gravar.length){ const {error} = await sb.from("clientes").upsert(gravar, {onConflict:"empresa_id,cod"}); if(error) throw new Error(error.message); }
  if(voltarBase.length){ const {error} = await sb.from("clientes").update({origem:"base"}).in("cod", voltarBase); if(error) throw new Error(error.message); }
  if(desativar.length){ const {error} = await sb.from("clientes").update({ativo:false}).in("cod", desativar); if(error) throw new Error(error.message); }
}
async function espelharProdutos(lista){
  const gravar = lista.filter(p => p && p.cod && !codsTabela.has(p.cod)).map(p => ({empresa_id:EMP, cod:p.cod, descricao:p.desc || p.cod, um:v(p.um), ncm:v(p.ncm),
    origem:"CADASTRO MANUAL", manual:true, preco_manual: p.preco === "" || p.preco == null ? null : +p.preco, ativo: !p.excluido}));
  if(gravar.length){ const {error} = await sb.from("produtos").upsert(gravar, {onConflict:"empresa_id,cod"}); if(error) throw new Error(error.message); }
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
  const [clientes, produtos, tabelas, emb, docs] = await Promise.all([
    todas("clientes", "*", q => q.eq("ativo", true), "cod"),
    todas("produtos", "*", q => q.eq("manual", true), "cod"),
    todas("tabelas_preco", "id,nome,importado_em", q => q.eq("vigente", true)),
    todas("embalagens", "*", null, "cod"),
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
}

/* ---------- empresa (exportadora) do usuário ---------- */
const PAPEIS = {admin:"Administrador", usuario:"Usuário", consulta:"Consulta"};
const escH = t => String(t == null ? "" : t).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const vz = t => String(t == null ? "" : t).trim();

// dados do exportador no formato "Exportador" do gerador (cfg)
function enderecoDoc(e){
  if(vz(e.endereco_doc)) return vz(e.endereco_doc);
  const l1 = [[vz(e.logradouro), vz(e.numero)].filter(Boolean).join(", "), vz(e.complemento), vz(e.bairro)].filter(Boolean).join(" – ");
  const l2 = [vz(e.cidade), vz(e.uf), vz(e.cep) ? "CEP " + vz(e.cep) : "", vz(e.pais)].filter(Boolean).join(" – ");
  return [l1, l2].filter(Boolean).join("\n");
}
function textoConta(c){
  if(!c) return "";
  if(vz(c.texto)) return vz(c.texto);
  const l = [];
  if(vz(c.intermediario) || vz(c.swift_intermediario)) l.push(["Banco intermediario:", vz(c.intermediario), vz(c.swift_intermediario) ? "· SWIFT: " + vz(c.swift_intermediario) : ""].filter(Boolean).join(" "));
  if(vz(c.banco) || vz(c.swift)) l.push(["Banco beneficiario:", vz(c.banco), vz(c.swift) ? "· SWIFT: " + vz(c.swift) : ""].filter(Boolean).join(" "));
  if(vz(c.agencia) || vz(c.conta)) l.push([vz(c.agencia) ? "Agencia: " + vz(c.agencia) : "", vz(c.conta) ? "Cuenta: " + vz(c.conta) : ""].filter(Boolean).join(" · "));
  if(vz(c.iban)) l.push("IBAN: " + vz(c.iban));
  if(vz(c.beneficiario)) l.push("Beneficiario: " + vz(c.beneficiario));
  return l.join("\n");
}
function cfgDaEmpresa(e){
  const p = e.padroes || {}, contas = Array.isArray(e.contas) ? e.contas : [];
  return {nome: vz(e.nome), empresa: vz(e.razao_social) || vz(e.nome), direccion: enderecoDoc(e), cnpj: vz(e.cnpj), contacto: [vz(e.contato), vz(e.cargo)].filter(Boolean).join(" – "),
    emailtel: [vz(e.email), vz(e.telefone)].filter(Boolean).join(" · "), assinatura: vz(e.assinatura) || (vz(e.nome) + " — Departamento de Exportación"),
    banco: textoConta(contas[0]), traduzir: p.traduzir !== false};
}
const siglaEmpresa = nome => (String(nome || "").normalize("NFD").replace(/[^A-Za-z0-9]/g, "").toUpperCase() + "XX").slice(0, 2);

// cada empresa com o seu armazenamento no navegador (rascunhos, números, fotos); a Kapazi mantém os nomes antigos
function separarNavegador(ns){
  if(!ns) return;
  const LOCAIS = /^(pf_|fp_|inv_|pack_)/, g = Storage.prototype.getItem, st = Storage.prototype.setItem, rm = Storage.prototype.removeItem;
  const k2 = (o, k) => o === localStorage && LOCAIS.test(String(k)) ? ns + k : k;
  Storage.prototype.getItem = function(k){ return g.call(this, k2(this, k)); };
  Storage.prototype.setItem = function(k, v){ return st.call(this, k2(this, k), v); };
  Storage.prototype.removeItem = function(k){ return rm.call(this, k2(this, k)); };
  if(window.indexedDB){ const op = indexedDB.open.bind(indexedDB); indexedDB.open = (nome, ...r) => op(ns + nome, ...r); }
}
const carregarScript = src => new Promise(ok => { const s = document.createElement("script"); s.src = src; s.onload = s.onerror = () => ok(); document.head.appendChild(s); });

// logo do cadastro (qualquer imagem) -> PNG em dataURL para o PDF e o Excel
function imagemParaPng(blob, larguraMax = 800){
  return new Promise((ok, falha) => {
    const url = URL.createObjectURL(blob), im = new Image();
    im.onload = () => {
      const k = Math.min(1, larguraMax / (im.naturalWidth || larguraMax)), c = document.createElement("canvas");
      c.width = Math.max(1, Math.round((im.naturalWidth || 300) * k)); c.height = Math.max(1, Math.round((im.naturalHeight || 120) * k));
      c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      ok({png: c.toDataURL("image/png"), prop: c.width / c.height});
    };
    im.onerror = () => { URL.revokeObjectURL(url); falha(new Error("imagem inválida")); };
    im.src = url;
  });
}
async function carregarLogo(e){
  if(e.logo_path){
    const {data} = await sb.storage.from(BUCKET).download(e.logo_path);
    if(data){ try{ const r = await imagemParaPng(data); window.LOGO_KAPAZI = r.png; window.LOGO_PROP = r.prop; return; }catch(err){ console.warn("logo", err); } }
  }
  if(e.slug === "kapazi"){ await carregarScript("logo.js"); window.LOGO_PROP = 170 / 69; }   // logo antigo da Kapazi até subir um no cadastro
  else window.LOGO_KAPAZI = "";
}

async function carregarEmpresa(){
  const {data: ses, error} = await sb.rpc("minha_sessao");
  if(error) throw new Error(error.message + (/minha_sessao/.test(error.message) ? " (rode o script 07_multiempresa.sql no Supabase)" : ""));
  SESSAO = ses || {};
  if(!SESSAO.empresa_id) return false;
  const {data: e, error: e2} = await sb.from("empresas").select("*").eq("id", SESSAO.empresa_id).single();
  if(e2) throw new Error(e2.message);
  EMPRESA = e; EMP = e.id; PASTA = e.storage_legado ? "" : EMP + "/";
  separarNavegador(e.slug === "kapazi" ? "" : EMP + ":");
  if(e.slug === "kapazi") await Promise.all([carregarScript("fotos.js"), carregarScript("fotos_catalogo.js")]);   // fotos dos produtos Kapazi
  await carregarLogo(e);
  window.CFG_EMPRESA = cfgDaEmpresa(e);
  window.EMPRESA_PREFIXO = vz(e.prefixo) || siglaEmpresa(e.nome);
  Object.assign(window.PONTE, {sessao: SESSAO, empresa: e, imagemParaPng, cfgDaEmpresa, textoConta, enderecoDoc, BUCKET, PAPEIS, escH});
  return true;
}

/* ---------- migração dos arquivos antigos para a pasta da empresa ---------- */
async function listarTudo(prefixo, out){
  for(let offset = 0; ; offset += 1000){
    const {data, error} = await sb.storage.from(BUCKET).list(prefixo, {limit:1000, offset, sortBy:{column:"name", order:"asc"}});
    if(error) throw new Error(error.message);
    for(const o of data || []){
      const nome = (prefixo ? prefixo + "/" : "") + o.name;
      if(o.id == null){ if(!prefixo && /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(o.name)) continue; await listarTudo(nome, out); }
      else out.push(nome);
    }
    if(!data || data.length < 1000) return out;
  }
}
async function migrarArquivos(){
  if(!confirm("Mover todos os arquivos desta empresa para a pasta própria dela no sistema online?\n\nIsso é feito uma vez só. Não feche a página até terminar.")) return;
  try{
    aviso("Listando arquivos…");
    const tudo = await listarTudo("", []);
    let ok = 0; const erros = [];
    for(const nome of tudo){
      aviso(`Movendo ${ok + erros.length + 1} de ${tudo.length}…`);
      const novo = EMP + "/" + nome;
      const {error} = await sb.storage.from(BUCKET).move(nome, novo);
      if(error && !/exist/i.test(error.message)){ erros.push(nome + ": " + error.message); continue; }
      await sb.from("arquivos").update({storage_path: novo}).eq("storage_path", nome);
      ok++;
    }
    if(!erros.length){ const {error} = await sb.rpc("concluir_migracao_arquivos"); if(error) erros.push(error.message); }
    aviso("");
    alert(`${ok} arquivo(s) movidos.` + (erros.length ? `\n\n${erros.length} com erro (rode de novo):\n` + erros.slice(0, 15).join("\n") : "") + "\n\nA página vai recarregar.");
    location.reload();
  }catch(e){ aviso("Erro ao mover os arquivos: " + escH(e.message) + ". Recarregue e tente de novo.", true); }
}

/* ---------- barra do usuário no topo ---------- */
function barraUsuario(email){
  const top = document.querySelector("header.top"); if(!top) return;
  const admin = SESSAO.papel === "admin", suporte = SESSAO.plataforma && SESSAO.empresa_id !== SESSAO.empresa_propria;
  const box = document.createElement("span"); box.className = "ponte-user";
  box.innerHTML = `<span class="ponte-empresa${suporte ? " suporte" : ""}" title="${suporte ? "Você está dando suporte nesta empresa" : "Empresa exportadora"}">${escH(EMPRESA.nome)}</span>
    <button class="btn ghost" type="button" data-p="arq" title="Pastas dos clientes, PDFs, Excel e pedidos salvos no sistema online">Arquivos</button>
    <button class="btn ghost" type="button" data-p="imp" title="Envia a pasta Gerador de Proforma do PC (pastas dos clientes, base de fotos, SKUImagens, cadastros)">Importar do PC</button>
    ${admin ? `<button class="btn ghost" type="button" data-p="usu" title="Quem usa o sistema nesta empresa">Usuários</button>` : ""}
    ${SESSAO.plataforma ? `<button class="btn ghost" type="button" data-p="emp" title="Empresas exportadoras do Export Link (administração da plataforma)">Empresas</button>` : ""}
    ${admin && EMPRESA.storage_legado ? `<button class="btn ghost" type="button" data-p="mig" title="Move os arquivos antigos para a pasta desta empresa (uma vez só)">Migrar arquivos</button>` : ""}
    <span class="ponte-email" title="Usuário conectado · ${escH(PAPEIS[SESSAO.papel] || "")}">${escH(email)}</span>
    <button class="btn ghost" type="button" data-p="sair">Sair</button>`;
  top.appendChild(box);
  const b = n => box.querySelector(`[data-p="${n}"]`);
  b("arq").onclick = () => abrirArquivos("Clientes");
  b("imp").onclick = importarPasta;
  if(b("usu")) b("usu").onclick = () => window.EMPRESA_UI.usuarios();
  if(b("emp")) b("emp").onclick = () => window.EMPRESA_UI.empresas();
  if(b("mig")) b("mig").onclick = migrarArquivos;
  b("sair").onclick = async () => { await sb.auth.signOut(); location.replace("index.html"); };
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
  if(!(await carregarEmpresa())){
    aviso(`O e-mail <b>${escH(email)}</b> entrou, mas não está cadastrado em nenhuma empresa. Peça ao administrador da sua empresa para incluir este e-mail em <b>Usuários</b>. <button type="button" onclick="PONTE.sb.auth.signOut().then(()=>location.replace('index.html'))">Sair</button>`, true);
    return;
  }
  aviso("Carregando clientes, produtos e tabela de preço…");
  await carregarDados();
  ligarApi();
  aviso("");
  rodarGerador();
  window.abrirConfig = () => window.EMPRESA_UI.cadastro();   // botão "Exportador" do gerador abre o cadastro da empresa
  barraUsuario(email);
  sb.auth.onAuthStateChange((ev, s) => { if(ev === "SIGNED_OUT" || !s) location.replace("index.html"); });
}
iniciar().catch(e => { console.error(e); aviso("Não foi possível carregar o sistema: " + escH(e && e.message || e) + ". Recarregue a página (F5).", true); });
})();
