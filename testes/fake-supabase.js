// Supabase falso (só no teste): imita o pedaço do supabase-js que a ponte usa.
// Tabelas e Storage ficam em memória; o estado é exposto em window.FAKE_DB para o teste conferir.
(function(){
  const sess = () => { try{ return JSON.parse(localStorage.getItem("fake_sess")); }catch(e){ return null; } };
  const DB = window.FAKE_DB = window.FAKE_DB || {tabelas:{}, storage:{}, chamadas:[]};
  const chaves = {clientes:["cod"], produtos:["cod"], configuracoes:["chave"], documentos:["tipo","numero"], arquivos:["storage_path"], embalagens:["cod"]};
  const ok = data => Promise.resolve({data, error:null});
  function tabela(nome){ return DB.tabelas[nome] = DB.tabelas[nome] || []; }
  function consulta(nome){
    const f = [], st = {op:"select", ordem:null, de:0, ate:1e9};
    const q = {
      select(){ return q; },
      eq(c, v){ f.push(r => r[c] === v); return q; },
      in(c, vs){ f.push(r => vs.includes(r[c])); return q; },
      order(c){ st.ordem = c; return q; },
      range(a, b){ st.de = a; st.ate = b; return q; },
      upsert(rows, o){ st.op = "upsert"; st.rows = [].concat(rows); st.on = (o && o.onConflict || "").split(","); return q; },
      update(val){ st.op = "update"; st.val = val; return q; },
      then(res, rej){ return executar().then(res, rej); }
    };
    function executar(){
      DB.chamadas.push({tabela:nome, op:st.op});
      const t = tabela(nome);
      if(st.op === "upsert"){
        const on = st.on[0] ? st.on : chaves[nome];
        st.rows.forEach(r => { const i = t.findIndex(x => on.every(k => x[k] === r[k])); if(i >= 0) t[i] = {...t[i], ...r}; else t.push({...r}); });
        return ok(null);
      }
      if(st.op === "update"){ t.filter(r => f.every(g => g(r))).forEach(r => Object.assign(r, st.val)); return ok(null); }
      let rs = t.filter(r => f.every(g => g(r)));
      if(st.ordem) rs = rs.slice().sort((a, b) => a[st.ordem] < b[st.ordem] ? -1 : a[st.ordem] > b[st.ordem] ? 1 : 0);
      return ok(rs.slice(st.de, st.ate + 1));
    }
    return q;
  }
  function bucket(b){
    const S = DB.storage[b] = DB.storage[b] || {};
    return {
      list(prefix, o){
        const p = prefix ? prefix + "/" : "", vistos = new Map();
        Object.keys(S).filter(k => k.startsWith(p)).forEach(k => {
          const resto = k.slice(p.length), i = resto.indexOf("/");
          if(i < 0) vistos.set(resto, {name:resto, id:"x", metadata:{size:S[k].size}});
          else if(!vistos.has(resto.slice(0, i))) vistos.set(resto.slice(0, i), {name:resto.slice(0, i), id:null});
        });
        const arr = [...vistos.values()].sort((a, b) => a.name.localeCompare(b.name));
        return ok(arr.slice(o.offset || 0, (o.offset || 0) + (o.limit || 100)));
      },
      download(k){ return S[k] ? ok(S[k]) : Promise.resolve({data:null, error:{message:"Object not found"}}); },
      upload(k, blob){
        if(!/^(\w|\/|!|-|\.|\*|'|\(|\)| |&|\$|@|=|;|:|\+|,|\?)*$/.test(k)) return Promise.resolve({data:null, error:{message:"Invalid key: " + k}});
        S[k] = blob; return ok({path:k});
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
        signOut(){ localStorage.removeItem("fake_sess"); return ok(null); },
        onAuthStateChange(){ return {data:{subscription:{unsubscribe(){}}}}; }
      },
      from: consulta,
      storage:{from: bucket}
    };
  }};
})();
