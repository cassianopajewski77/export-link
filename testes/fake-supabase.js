// Supabase falso (só no teste): imita o pedaço do supabase-js que a ponte usa.
// Tabelas e Storage ficam em memória; o estado é exposto em window.FAKE_DB para o teste conferir.
// Multiempresa: imita o RLS do script 07 (cada usuário só vê e grava na empresa atual)
// e as funções minha_sessao, entrar_empresa, criar_empresa, listar_empresas, concluir_migracao_arquivos.
(function(){
  const sess = () => { try{ return JSON.parse(localStorage.getItem("fake_sess")); }catch(e){ return null; } };
  // o estado sobrevive ao recarregar a página (sessionStorage); arquivos guardados em base64
  let salvo = null; try{ salvo = JSON.parse(sessionStorage.getItem("fake_db")); }catch(e){}
  const DB = window.FAKE_DB = salvo || window.FAKE_DB || {tabelas:{}, storage:{}, chamadas:[]};
  const persistir = () => { try{ sessionStorage.setItem("fake_db", JSON.stringify({...DB, chamadas:[]})); }catch(e){ console.error("fake_db cheio", e); } };
  const paraB64 = blob => new Promise(ok => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1] || ""); r.readAsDataURL(blob); });
  const deB64 = o => { const bin = atob(o.b64), u = new Uint8Array(bin.length); for(let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], {type: o.type || ""}); };
  const chaves = {clientes:["empresa_id","cod"], produtos:["empresa_id","cod"], configuracoes:["empresa_id","chave"], documentos:["empresa_id","tipo","numero"], arquivos:["storage_path"], embalagens:["empresa_id","cod"]};
  const ok = data => Promise.resolve({data, error:null});
  const erro = message => Promise.resolve({data:null, error:{message}});
  function tabela(nome){ return DB.tabelas[nome] = DB.tabelas[nome] || []; }
  // ----- "RLS" -----
  const email = () => { const s = sess(); return s ? String(s.user.email).toLowerCase() : ""; };
  const membro = () => tabela("membros").find(m => m.email === email() && m.ativo !== false);
  const plat = () => tabela("plataforma_admins").find(p => p.email === email());
  const empAtual = () => (plat() && plat().empresa_suporte) || (membro() && membro().empresa_id) || null;
  const papel = () => plat() ? "admin" : membro() ? membro().papel : null;
  const COM_EMPRESA = new Set(["configuracoes","clientes","produtos","tabelas_preco","precos","embalagens","de_para","documentos","arquivos"]);
  const visivel = (nome, r) => nome === "empresas" ? (r.id === empAtual() || !!plat()) : nome === "membros" ? (r.email === email() || r.empresa_id === empAtual()) : !COM_EMPRESA.has(nome) || r.empresa_id === empAtual();
  const podeGravar = (nome, r) => nome === "empresas" ? (r.id === empAtual() && papel() === "admin") : nome === "membros" ? (r.empresa_id === empAtual() && papel() === "admin" && r.email !== email()) : r.empresa_id === empAtual() && ["admin","usuario"].includes(papel());
  const pastaEmpresa = k => { const p = k.split("/")[0]; if(/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(p)) return p; const e = tabela("empresas").find(x => x.id === empAtual()); return e && e.storage_legado ? e.id : null; };

  function consulta(nome){
    const f = [], st = {op:"select", ordem:null, de:0, ate:1e9, single:false};
    const q = {
      select(){ return q; },
      eq(c, v){ f.push(r => r[c] === v); return q; },
      in(c, vs){ f.push(r => vs.includes(r[c])); return q; },
      order(c){ st.ordem = c; return q; },
      range(a, b){ st.de = a; st.ate = b; return q; },
      limit(n){ st.ate = n - 1; return q; },
      single(){ st.single = true; return q; },
      upsert(rows, o){ st.op = "upsert"; st.rows = [].concat(rows); st.on = (o && o.onConflict || "").split(","); return q; },
      insert(rows){ st.op = "insert"; st.rows = [].concat(rows); return q; },
      update(val){ st.op = "update"; st.val = val; return q; },
      delete(){ st.op = "delete"; return q; },
      then(res, rej){ return executar().then(res, rej); }
    };
    function executar(){
      DB.chamadas.push({tabela:nome, op:st.op});
      const t = tabela(nome);
      const comEmp = r => COM_EMPRESA.has(nome) && r.empresa_id == null ? {...r, empresa_id: empAtual()} : r;
      if(st.op === "upsert" || st.op === "insert"){
        const on = st.op === "insert" ? ["email"] : st.on[0] ? st.on : chaves[nome];
        for(const r0 of st.rows){
          const r = comEmp(r0);
          if(!podeGravar(nome, r)) return erro(`new row violates row-level security policy for table "${nome}"`);
          const i = t.findIndex(x => on.every(k => x[k] === r[k]));
          if(i >= 0 && st.op === "insert") return erro(`duplicate key value violates unique constraint "${nome}_pkey"`);
          if(i >= 0) t[i] = {...t[i], ...r}; else t.push({ativo:true, ...r});
        }
        persistir(); return ok(null);
      }
      const alvo = t.filter(r => visivel(nome, r) && f.every(g => g(r)));
      if(st.op === "update"){ alvo.filter(r => podeGravar(nome, r)).forEach(r => Object.assign(r, st.val)); persistir(); return ok(null); }
      if(st.op === "delete"){ const tirar = new Set(alvo.filter(r => podeGravar(nome, r))); DB.tabelas[nome] = t.filter(r => !tirar.has(r)); persistir(); return ok(null); }
      let rs = alvo;
      if(st.ordem) rs = rs.slice().sort((a, b) => a[st.ordem] < b[st.ordem] ? -1 : a[st.ordem] > b[st.ordem] ? 1 : 0);
      rs = rs.slice(st.de, st.ate + 1);
      if(st.single) return rs.length === 1 ? ok({...rs[0]}) : erro("JSON object requested, multiple (or no) rows returned");
      return ok(rs.map(r => ({...r})));
    }
    return q;
  }
  function rpc(nome, a){
    a = a || {};
    const sessao = () => { const e = tabela("empresas").find(x => x.id === empAtual());
      return {email: email(), empresa_id: empAtual(), empresa: e ? e.nome : null, papel: papel(), plataforma: !!plat(), empresa_propria: membro() ? membro().empresa_id : null}; };
    if(nome === "minha_sessao") return ok(sessao());
    if(nome === "entrar_empresa"){ if(!plat()) return erro("só o administrador da plataforma pode trocar de empresa"); plat().empresa_suporte = a.p_empresa || null; persistir(); return ok(sessao()); }
    if(nome === "listar_empresas") return ok(plat() ? tabela("empresas").map(e => ({id:e.id, nome:e.nome, cnpj:e.cnpj || null, ativo:true,
      usuarios: tabela("membros").filter(m => m.empresa_id === e.id).length, documentos: tabela("documentos").filter(d => d.empresa_id === e.id).length})) : []);
    if(nome === "criar_empresa"){
      if(!plat()) return erro("só o administrador da plataforma cria empresas");
      const em = String(a.p_admin_email).toLowerCase();
      if(tabela("membros").some(m => m.email === em)) return erro(`o e-mail ${em} já é usuário de outra empresa`);
      const id = "e" + Math.random().toString(16).slice(2, 9) + "-0000-4000-8000-" + Date.now().toString(16).padStart(12, "0").slice(-12);
      tabela("empresas").push({id, nome:a.p_nome, razao_social:a.p_nome, slug:a.p_nome.toLowerCase(), prefixo:a.p_prefixo ? a.p_prefixo.toUpperCase() : null, contas:[], padroes:{}, storage_legado:false, pais:"Brasil"});
      tabela("membros").push({email:em, empresa_id:id, papel:"admin", ativo:true});
      persistir(); return ok(id);
    }
    if(nome === "concluir_migracao_arquivos"){ const e = tabela("empresas").find(x => x.id === empAtual()); if(e && papel() === "admin") e.storage_legado = false; persistir(); return ok(null); }
    return erro("função desconhecida " + nome);
  }
  function bucket(b){
    const S = DB.storage[b] = DB.storage[b] || {};
    const vePasta = k => b !== "arquivos" || pastaEmpresa(k) === empAtual();
    const gravaPasta = k => vePasta(k) && ["admin","usuario"].includes(papel());
    return {
      list(prefix, o){
        const p = prefix ? prefix + "/" : "", vistos = new Map();
        Object.keys(S).filter(k => k.startsWith(p) && vePasta(k)).forEach(k => {
          const resto = k.slice(p.length), i = resto.indexOf("/");
          if(i < 0) vistos.set(resto, {name:resto, id:"x", metadata:{size:S[k].size}});
          else if(!vistos.has(resto.slice(0, i))) vistos.set(resto.slice(0, i), {name:resto.slice(0, i), id:null});
        });
        const arr = [...vistos.values()].sort((a, b) => a.name.localeCompare(b.name));
        return ok(arr.slice(o.offset || 0, (o.offset || 0) + (o.limit || 100)));
      },
      download(k){ return S[k] && vePasta(k) ? ok(deB64(S[k])) : Promise.resolve({data:null, error:{message:"Object not found"}}); },
      async upload(k, blob){
        if(!/^(\w|\/|!|-|\.|\*|'|\(|\)| |&|\$|@|=|;|:|\+|,|\?)*$/.test(k)) return erro("Invalid key: " + k);
        if(!gravaPasta(k)) return erro("new row violates row-level security policy");
        S[k] = {b64: await paraB64(blob), type: blob.type, size: blob.size}; persistir(); return ok({path:k});
      },
      move(de, para){
        if(!S[de] || !vePasta(de)) return erro("Object not found");
        if(S[para]) return erro("The resource already exists");
        if(!gravaPasta(para)) return erro("new row violates row-level security policy");
        S[para] = S[de]; delete S[de]; persistir(); return ok({message:"Successfully moved"});
      }
    };
  }
  window.supabase = {createClient(){
    return {
      auth:{
        getSession(){ return ok({session: sess()}); },
        signInWithPassword({email, password}){
          if(password !== "certa") return Promise.resolve({data:null, error:{message:"Invalid login credentials"}});
          const s = {user:{email}}; localStorage.setItem("fake_sess", JSON.stringify(s)); return ok({session:s});
        },
        signUp({email}){ return ok({user:{email}, session:null}); },
        resetPasswordForEmail(){ return ok({}); },
        updateUser(){ return ok({}); },
        signOut(){ localStorage.removeItem("fake_sess"); return ok(null); },
        onAuthStateChange(){ return {data:{subscription:{unsubscribe(){}}}}; }
      },
      from: consulta,
      rpc,
      storage:{from: bucket}
    };
  }};
})();
