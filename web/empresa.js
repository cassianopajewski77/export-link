/* =====================================================================
   Export Link – telas da empresa (multiempresa)
   - Cadastro do exportador (botão "Exportador" do gerador): dados, endereço, logo, contas bancárias, padrões
   - Usuários (administrador da empresa): incluir por e-mail, papel, ativar/desativar, remover
   - Empresas (administrador da plataforma Export Link): criar exportadora, entrar para suporte
   Usa window.PONTE (ponte.js), preenchido depois do login.
   ===================================================================== */
(function(){
"use strict";
const P = () => window.PONTE;
const esc = t => String(t == null ? "" : t).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const vz = t => String(t == null ? "" : t).trim();

function dialogo(id, titulo, largura){
  let d = document.getElementById(id);
  if(!d){
    d = document.createElement("dialog"); d.id = id; d.className = "emp-dlg";
    if(largura) d.style.width = `min(${largura}px, calc(100vw - 32px))`;
    d.innerHTML = `<div class="emp-top"><b>${esc(titulo)}</b><button type="button" class="emp-x" title="Fechar">✕</button></div><div class="emp-corpo"></div><div class="emp-rodape"></div>`;
    document.body.appendChild(d);
    d.querySelector(".emp-x").onclick = () => d.close();
  }
  return d;
}
const aviso = (d, msg, erro) => { const r = d.querySelector(".emp-msg"); if(r){ r.textContent = msg || ""; r.className = "emp-msg" + (erro ? " erro" : ""); } };

/* ---------------- cadastro do exportador ---------------- */
const CAMPOS = [
  ["Identificação", [
    ["nome", "Nome no sistema *", "Ex.: Kapazi"], ["razao_social", "Razão social (sai nos documentos)"], ["nome_fantasia", "Nome fantasia"],
    ["cnpj", "CNPJ"], ["ie", "Inscrição estadual"], ["radar", "Habilitação RADAR", "Ex.: Ilimitada"]]],
  ["Endereço", [
    ["logradouro", "Logradouro", "Rua, avenida…", "wide"], ["numero", "Número"], ["complemento", "Complemento"], ["bairro", "Bairro"],
    ["cidade", "Cidade"], ["uf", "UF"], ["cep", "CEP"], ["pais", "País"],
    ["endereco_doc", "Endereço como sai no documento (opcional: se vazio, é montado dos campos acima)", "", "wide", "textarea"]]],
  ["Contato", [
    ["contato", "Responsável"], ["cargo", "Cargo"], ["email", "E-mail"], ["telefone", "Telefone"], ["site", "Site"],
    ["assinatura", "Texto da assinatura", "Ex.: EMPRESA — Departamento de Exportación", "wide"]]]
];
const CAMPOS_CONTA = [["moeda", "Moeda", "USD"], ["beneficiario", "Beneficiário"], ["banco", "Banco"], ["swift", "SWIFT do banco"], ["agencia", "Agência"], ["conta", "Conta"],
  ["iban", "IBAN"], ["intermediario", "Banco intermediário"], ["swift_intermediario", "SWIFT do intermediário"]];

function htmlCampo([k, rot, ph, cls, tipo], v, ro){
  const at = `data-e="${k}" ${ro ? "disabled" : ""} placeholder="${esc(ph || "")}"`;
  return `<div class="${cls || ""}"><label>${esc(rot)}</label>${tipo === "textarea" ? `<textarea ${at} rows="2">${esc(v)}</textarea>` : `<input ${at} value="${esc(v)}">`}</div>`;
}
function htmlConta(c, i, ro){
  return `<fieldset class="emp-conta" data-conta="${i}"><legend>Conta ${i + 1}${i === 0 ? " (padrão, sai na proforma e na invoice)" : ""}</legend>
    <div class="emp-grid">${CAMPOS_CONTA.map(([k, rot, ph]) => `<div><label>${esc(rot)}</label><input data-c="${k}" value="${esc(c[k])}" placeholder="${esc(ph || "")}" ${ro ? "disabled" : ""}></div>`).join("")}
    <div class="wide"><label>Texto livre (se preenchido, sai exatamente assim no documento, uma informação por linha)</label><textarea data-c="texto" rows="4" ${ro ? "disabled" : ""}>${esc(c.texto)}</textarea></div></div>
    ${ro ? "" : `<div class="emp-acoes">${i > 0 ? `<button type="button" class="btn sm" data-acao="subir">Tornar padrão</button>` : ""}<button type="button" class="btn sm" data-acao="tirar">Remover conta</button></div>`}
  </fieldset>`;
}

let contas = [], logoNovo = null;
function cadastro(){
  const e = P().empresa, ro = P().sessao.papel !== "admin";
  const d = dialogo("empCadastro", "Cadastro do exportador", 860);
  contas = (Array.isArray(e.contas) ? e.contas : []).map(c => ({...c}));
  logoNovo = null;
  const pad = e.padroes || {};
  const corpo = d.querySelector(".emp-corpo");
  corpo.innerHTML = `${ro ? `<p class="emp-hint">Só o administrador da empresa altera estes dados.</p>` : ""}
    ${CAMPOS.map(([t, cs]) => `<h3>${esc(t)}</h3><div class="emp-grid">${cs.map(c => htmlCampo(c, e[c[0]], ro)).join("")}</div>`).join("")}
    <h3>Logo</h3>
    <div class="emp-logo"><div class="emp-logo-box"><img id="empLogoImg" alt="" src="${esc(window.LOGO_KAPAZI || "")}"></div>
      ${ro ? "" : `<div><button type="button" class="btn sm" id="empLogoBtn">Escolher imagem…</button><input type="file" id="empLogoArq" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden>
      <p class="emp-hint">PNG, JPG ou SVG. O logo sai na faixa azul-escura do topo da proforma, invoice e packing list: prefira a versão clara/branca.</p></div>`}</div>
    <h3>Dados bancários</h3><div id="empContas"></div>
    ${ro ? "" : `<button type="button" class="btn sm" id="empMaisConta">+ Adicionar conta</button>`}
    <h3>Padrões dos documentos</h3>
    <div class="emp-grid">
      <div><label>Prefixo da numeração da proforma</label><input data-e="prefixo" value="${esc(e.prefixo)}" maxlength="6" placeholder="Ex.: KZ" ${ro ? "disabled" : ""}></div>
      <div class="wide"><label class="emp-check"><input type="checkbox" id="empTraduzir" ${pad.traduzir !== false ? "checked" : ""} ${ro ? "disabled" : ""}> Traduzir automaticamente as descrições para espanhol ao adicionar itens</label></div>
    </div>
    <p class="emp-hint">Número da proforma: prefixo + iniciais do importador + sequencial/ano (ex.: ${esc((vz(e.prefixo) || "XX").toUpperCase())}TM-001/26).</p>`;
  const desenharContas = () => {
    const box = corpo.querySelector("#empContas");
    box.innerHTML = contas.length ? contas.map((c, i) => htmlConta(c, i, ro)).join("") : `<p class="emp-hint">Nenhuma conta cadastrada.</p>`;
    box.querySelectorAll("[data-conta]").forEach(fs => {
      const i = +fs.dataset.conta;
      fs.querySelectorAll("[data-c]").forEach(inp => inp.oninput = () => { contas[i][inp.dataset.c] = inp.value; });
      const sub = fs.querySelector('[data-acao="subir"]'), tir = fs.querySelector('[data-acao="tirar"]');
      if(sub) sub.onclick = () => { contas.unshift(contas.splice(i, 1)[0]); desenharContas(); };
      if(tir) tir.onclick = () => { if(confirm("Remover esta conta?")){ contas.splice(i, 1); desenharContas(); } };
    });
  };
  desenharContas();
  if(!ro){
    corpo.querySelector("#empMaisConta").onclick = () => { contas.push({moeda: "USD"}); desenharContas(); };
    const arq = corpo.querySelector("#empLogoArq");
    corpo.querySelector("#empLogoBtn").onclick = () => arq.click();
    arq.onchange = async () => {
      const f = arq.files[0]; if(!f) return;
      if(f.size > 3 * 1024 * 1024) return alert("Imagem muito grande (máx. 3 MB).");
      try{ logoNovo = await P().imagemParaPng(f); corpo.querySelector("#empLogoImg").src = logoNovo.png; }catch(err){ alert("Não foi possível ler a imagem."); }
    };
  }
  d.querySelector(".emp-rodape").innerHTML = ro ? `<button type="button" class="btn" data-f>Fechar</button>` :
    `<span class="emp-msg"></span><button type="button" class="btn" data-f>Cancelar</button><button type="button" class="btn pri" id="empSalvar">Salvar</button>`;
  d.querySelector("[data-f]").onclick = () => d.close();
  if(!ro) d.querySelector("#empSalvar").onclick = () => salvarCadastro(d);
  d.showModal();
}

async function salvarCadastro(d){
  const e = P().empresa, sb = P().sb, mud = {};
  d.querySelectorAll("[data-e]").forEach(inp => { mud[inp.dataset.e] = vz(inp.value) || null; });
  if(!mud.nome) return aviso(d, "Informe o nome da empresa.", true);
  if(mud.prefixo) mud.prefixo = mud.prefixo.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if(!mud.pais) mud.pais = "Brasil";
  mud.contas = contas.map(c => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, vz(v)]).filter(([, v]) => v))).filter(c => Object.keys(c).some(k => k !== "moeda"));
  mud.padroes = {...(e.padroes || {}), traduzir: d.querySelector("#empTraduzir").checked};
  const btn = d.querySelector("#empSalvar"); btn.disabled = true; aviso(d, "Salvando…");
  try{
    if(logoNovo){
      const caminho = e.id + "/_empresa/logo.png", blob = await (await fetch(logoNovo.png)).blob();
      const {error} = await sb.storage.from(P().BUCKET).upload(caminho, blob, {upsert: true, contentType: "image/png", cacheControl: "0"});
      if(error) throw new Error("logo: " + error.message);
      mud.logo_path = caminho;
    }
    const {error} = await sb.from("empresas").update(mud).eq("id", e.id);
    if(error) throw new Error(error.message);
    aviso(d, "Salvo. Recarregando…");
    setTimeout(() => location.reload(), 400);
  }catch(err){ aviso(d, "Não foi possível salvar: " + err.message, true); btn.disabled = false; }
}

/* ---------------- usuários da empresa ---------------- */
async function usuarios(){
  const d = dialogo("empUsuarios", "Usuários da empresa", 760), sb = P().sb, eu = P().sessao.email;
  const corpo = d.querySelector(".emp-corpo");
  d.querySelector(".emp-rodape").innerHTML = `<span class="emp-msg"></span><button type="button" class="btn" data-f>Fechar</button>`;
  d.querySelector("[data-f]").onclick = () => d.close();
  const desenhar = async () => {
    corpo.innerHTML = "Carregando…";
    const {data, error} = await sb.from("membros").select("email,nome,papel,ativo,criado_em").eq("empresa_id", P().empresa.id).order("email");
    if(error){ corpo.textContent = "Erro: " + error.message; return; }
    const opc = sel => Object.entries(P().PAPEIS).map(([k, r]) => `<option value="${k}" ${k === sel ? "selected" : ""}>${r}</option>`).join("");
    corpo.innerHTML = `<p class="emp-hint"><b>Administrador</b>: tudo, cadastro do exportador e usuários. <b>Usuário</b>: emite documentos e cadastra clientes e produtos. <b>Consulta</b>: só vê e baixa.</p>
      <table class="emp-tab"><thead><tr><th>E-mail</th><th>Nome</th><th>Papel</th><th>Ativo</th><th></th></tr></thead><tbody>
      ${data.map(m => { const proprio = m.email === eu; return `<tr data-email="${esc(m.email)}"><td>${esc(m.email)}${proprio ? " <small>(você)</small>" : ""}</td>
        <td><input data-u="nome" value="${esc(m.nome)}" ${proprio ? "disabled" : ""}></td>
        <td><select data-u="papel" ${proprio ? "disabled" : ""}>${opc(m.papel)}</select></td>
        <td style="text-align:center"><input type="checkbox" data-u="ativo" ${m.ativo ? "checked" : ""} ${proprio ? "disabled" : ""}></td>
        <td>${proprio ? "" : `<button type="button" class="btn sm" data-tirar>Remover</button>`}</td></tr>`; }).join("")}
      </tbody></table>
      <h3>Incluir usuário</h3>
      <div class="emp-grid"><div><label>E-mail *</label><input id="nuEmail" type="email"></div><div><label>Nome</label><input id="nuNome"></div>
        <div><label>Papel</label><select id="nuPapel">${opc("usuario")}</select></div><div style="align-self:end"><button type="button" class="btn pri" id="nuAdd">Incluir</button></div></div>
      <p class="emp-hint">Depois de incluir, avise a pessoa: ela abre o sistema, clica em <b>Primeiro acesso</b> com este e-mail e cria a senha. Cada e-mail pertence a uma empresa só.</p>`;
    corpo.querySelectorAll("tr[data-email]").forEach(tr => {
      const email = tr.dataset.email;
      const gravar = async mud => { const {error} = await sb.from("membros").update(mud).eq("email", email); aviso(d, error ? "Erro: " + error.message : "Alteração salva.", !!error); };
      tr.querySelectorAll("[data-u]").forEach(inp => inp.onchange = () => gravar({[inp.dataset.u]: inp.type === "checkbox" ? inp.checked : (vz(inp.value) || null)}));
      const t = tr.querySelector("[data-tirar]");
      if(t) t.onclick = async () => {
        if(!confirm(`Remover o acesso de ${email}?`)) return;
        const {error} = await sb.from("membros").delete().eq("email", email);
        if(error) return aviso(d, "Erro: " + error.message, true);
        desenhar();
      };
    });
    corpo.querySelector("#nuAdd").onclick = async () => {
      const email = vz(corpo.querySelector("#nuEmail").value).toLowerCase();
      if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return aviso(d, "E-mail inválido.", true);
      const {error} = await sb.from("membros").insert({email, nome: vz(corpo.querySelector("#nuNome").value) || null, papel: corpo.querySelector("#nuPapel").value, empresa_id: P().empresa.id});
      if(error) return aviso(d, /duplicate|unique|membros_pkey/i.test(error.message) ? "Este e-mail já é usuário (desta ou de outra empresa)." : "Erro: " + error.message, true);
      await desenhar(); aviso(d, `${email} incluído. Avise a pessoa para fazer o Primeiro acesso.`);
    };
  };
  d.showModal();
  await desenhar();
}

/* ---------------- empresas (administrador da plataforma) ---------------- */
async function empresas(){
  const d = dialogo("empEmpresas", "Empresas exportadoras – Export Link", 820), sb = P().sb, ses = P().sessao;
  const corpo = d.querySelector(".emp-corpo");
  d.querySelector(".emp-rodape").innerHTML = `<span class="emp-msg"></span>${ses.empresa_id !== ses.empresa_propria ? `<button type="button" class="btn" id="empVoltar">Voltar para a minha empresa</button>` : ""}<button type="button" class="btn" data-f>Fechar</button>`;
  d.querySelector("[data-f]").onclick = () => d.close();
  const entrar = async id => { const {error} = await sb.rpc("entrar_empresa", {p_empresa: id}); if(error) return aviso(d, "Erro: " + error.message, true); location.reload(); };
  const v = d.querySelector("#empVoltar"); if(v) v.onclick = () => entrar(null);
  const desenhar = async () => {
    corpo.innerHTML = "Carregando…";
    const {data, error} = await sb.rpc("listar_empresas");
    if(error){ corpo.textContent = "Erro: " + error.message; return; }
    corpo.innerHTML = `<table class="emp-tab"><thead><tr><th>Empresa</th><th>CNPJ</th><th>Usuários</th><th>Documentos</th><th></th></tr></thead><tbody>
      ${data.map(e => `<tr><td>${esc(e.nome)}${e.id === ses.empresa_id ? " <small>(aberta agora)</small>" : ""}</td><td>${esc(e.cnpj)}</td><td>${e.usuarios}</td><td>${e.documentos}</td>
        <td>${e.id === ses.empresa_id ? "" : `<button type="button" class="btn sm" data-entrar="${e.id}">Entrar</button>`}</td></tr>`).join("")}</tbody></table>
      <h3>Nova empresa exportadora</h3>
      <div class="emp-grid"><div><label>Nome *</label><input id="neNome"></div><div><label>E-mail do administrador *</label><input id="neEmail" type="email"></div>
        <div><label>Prefixo da numeração</label><input id="nePref" maxlength="6" placeholder="Ex.: KZ"></div><div style="align-self:end"><button type="button" class="btn pri" id="neCriar">Criar empresa</button></div></div>
      <p class="emp-hint">O administrador faz o Primeiro acesso com este e-mail e completa o cadastro do exportador (CNPJ, endereço, logo, banco). Use "Entrar" para dar suporte numa empresa; o que você fizer lá fica nela.</p>`;
    corpo.querySelectorAll("[data-entrar]").forEach(b => b.onclick = () => entrar(b.dataset.entrar));
    corpo.querySelector("#neCriar").onclick = async () => {
      const nome = vz(corpo.querySelector("#neNome").value), email = vz(corpo.querySelector("#neEmail").value);
      if(!nome || !email) return aviso(d, "Informe o nome e o e-mail do administrador.", true);
      const {error} = await sb.rpc("criar_empresa", {p_nome: nome, p_admin_email: email, p_prefixo: vz(corpo.querySelector("#nePref").value) || null});
      if(error) return aviso(d, "Erro: " + error.message, true);
      await desenhar(); aviso(d, `Empresa ${nome} criada. Avise ${email} para fazer o Primeiro acesso.`);
    };
  };
  d.showModal();
  await desenhar();
}

window.EMPRESA_UI = {cadastro, usuarios, empresas};
})();
