const fs=require("fs"),path=require("path");
// Uso: node ferramentas/gerar_carga.js <pasta "Gerador de Proforma"> <SKUImagens.json> [--semente saida.json]
//   gera supabase/02_carga_base.sql (ou, com --semente, o JSON usado por testes/teste_ponte.js)
const SRC=process.argv[2], SKU_JSON=process.argv[3], SEMENTE=process.argv.indexOf("--semente")>0?process.argv[process.argv.indexOf("--semente")+1]:null;
global.window={};
require(SRC+"/dados.js");require(SRC+"/clientes_cadastrados.js");require(SRC+"/produtos_cadastrados.js");
const D=window.DADOS,CC=window.CLIENTES_CADASTRADOS,PC=window.PRODUTOS_CADASTRADOS;
const v=s=>{s=s==null?"":String(s).trim();return s===""?null:s};
// clientes
const cli=new Map();
D.clientes.forEach(c=>cli.set(c.cod,{cod:c.cod,loja:v(c.loja)||"01",nome:c.nome,contato:v(c.contato),endereco:v(c.end),numero:v(c.nr),bairro:v(c.bairro),municipio:v(c.mun),estado:v(c.est),pais:null,doc:v(c.doc),doc_tipo:null,doc_valido:null,email:v(c.email),ddd:v(c.ddd),telefone:v(c.tel),vendedor:v(c.vend),status:v(c.status),bloqueado:!!c.bloq,origem:"base"}));
CC.filter(c=>c.cod&&!c.excluido).forEach(c=>{const b=cli.get(c.cod);cli.set(c.cod,{...(b||{}),cod:c.cod,loja:v(c.loja)||"01",nome:c.nome,contato:v(c.contato),endereco:v(c.end),numero:v(c.nr),bairro:v(c.bairro),municipio:v(c.mun),estado:v(c.est),pais:v(c.pais),doc:v(c.doc),doc_tipo:v(c.docTipo),doc_valido:c.docValido==null?null:!!c.docValido,email:v(c.email),ddd:v(c.ddd),telefone:v(c.tel),vendedor:v(c.vend)||(b&&b.vendedor)||null,status:(b&&b.status)||null,bloqueado:!!c.bloq,origem:b?"editado":"cadastrado"})});
// fotos do site
const chave=s=>String(s||"").toUpperCase().replace(/[\s.\-\/_]/g,"");
const SKU={};JSON.parse(fs.readFileSync(SKU_JSON)).forEach(([a,b,c,u])=>[a,b,c].forEach(k=>{k=chave(k);if(k&&!SKU[k])SKU[k]=u}));
const sku=cod=>{const k=chave(cod);return SKU[k]||SKU[k.replace(/^0+/,"")]||null};
// produtos
const prod=new Map();
D.produtos.forEach(p=>{if(!prod.has(p.cod))prod.set(p.cod,{cod:p.cod,descricao:p.desc||p.cod,um:v(p.um),ncm:v(p.ncm),origem:v(p.origem),manual:false,preco_manual:null,foto_url_site:sku(p.cod)})});
PC.filter(p=>p.cod&&!p.excluido).forEach(p=>{if(!prod.has(p.cod))prod.set(p.cod,{cod:p.cod,descricao:p.desc||p.cod,um:v(p.um),ncm:v(p.ncm),origem:"CADASTRO MANUAL",manual:true,preco_manual:p.preco??null,foto_url_site:sku(p.cod)})});
const precos=D.produtos.map((p,i)=>({linha:i+1,cod:p.cod,descricao:p.desc,um:v(p.um),preco_fcl:p.preco??null,ncm:v(p.ncm),origem:v(p.origem)}));
// documentos
const docs=[];const pastas=fs.readdirSync(SRC+"/Clientes");
for(const pc of pastas)for(const sub of fs.readdirSync(path.join(SRC,"Clientes",pc))){
  for(const t of ["proforma","invoice"]){const f=path.join(SRC,"Clientes",pc,sub,`dados_${t}.json`);if(!fs.existsSync(f))continue;
    const d=JSON.parse(fs.readFileSync(f,"utf8"));const numero=t==="proforma"?d.pf.numero:d.numero;
    const m=/-(\d+)\/(\d+)$/.exec(numero);const cod=t==="proforma"?d.cliente.cod:d.imp.cod;
    const itens=d.itens||[];
    const total=t==="invoice"?itens.reduce((s,i)=>s+(+i.qtd||0)*(+i.preco||0),0)+(+d.flete||0)+(+d.seguro||0)+(+d.otros||0):null;
    docs.push({tipo:t,numero,ano:m?2000+ +m[2]:null,seq:t==="proforma"&&m?+m[1]:null,cliente_cod:cod,proforma_numero:t==="invoice"?d.proforma:null,
      status:(t==="proforma"?d.pf.emitido:true)?"emitido":"rascunho",data_doc:(t==="proforma"?d.pf.fecha:d.fecha)||null,
      incoterm:(t==="proforma"?d.pf.incoterm:d.incoterm)||null,moeda:(t==="proforma"?d.pf.moeda:d.moeda)||null,total:total==null?null:Math.round(total*100)/100,dados:d});
  }}
// exportador (CFG_PADRAO do HTML)
const html=fs.readFileSync(SRC+"/Gerador de Proforma.html","utf8");
const m=/const CFG_PADRAO = (\{[\s\S]*?\.join\("\\n"\)\});/.exec(html);const cfg=eval("("+m[1]+")");
if(SEMENTE){
  const tabelas={clientes:[...cli.values()].map(c=>({...c,ativo:true,atualizado_em:new Date().toISOString()})),produtos:[...prod.values()].map(p=>({...p,ativo:true})),
    tabelas_preco:[{id:1,nome:"TEBELA DE PRECO 2026",vigente:true,importado_em:new Date().toISOString()}],precos:precos.map(p=>({...p,tabela_id:1})),
    embalagens:[],configuracoes:[{chave:"exportador",valor:cfg}],membros:[{email:"cassiano@kapazi.com.br"}],
    documentos:docs.map(d=>({...d,numero:d.numero.toUpperCase()}))};
  fs.writeFileSync(SEMENTE,JSON.stringify({tabelas}));console.log("semente:",SEMENTE);process.exit(0);
}
const J=o=>"$J$"+JSON.stringify(o)+"$J$::jsonb";
let sql=`-- =====================================================================
-- EXPORT LINK – carga da base atual (gerado de dados.js de ${D.atualizado},
-- clientes_cadastrados.js, produtos_cadastrados.js, SKUImagens.xlsx e
-- dados_*.json das pastas dos clientes). Rode DEPOIS do 01_esquema.sql.
-- Pode rodar de novo: atualiza o que já existe.
-- ${cli.size} clientes · ${prod.size} produtos · ${precos.length} linhas de preço · ${docs.length} documentos
-- =====================================================================
begin;

insert into public.configuracoes (chave, valor) values ('exportador', ${J(cfg)})
on conflict (chave) do update set valor = excluded.valor;

insert into public.clientes (cod,loja,nome,contato,endereco,numero,bairro,municipio,estado,pais,doc,doc_tipo,doc_valido,email,ddd,telefone,vendedor,status,bloqueado,origem)
select cod,loja,nome,contato,endereco,numero,bairro,municipio,estado,pais,doc,doc_tipo,doc_valido,email,ddd,telefone,vendedor,status,bloqueado,origem
from jsonb_to_recordset(${J([...cli.values()])}) as x(cod text,loja text,nome text,contato text,endereco text,numero text,bairro text,municipio text,estado text,pais text,doc text,doc_tipo text,doc_valido boolean,email text,ddd text,telefone text,vendedor text,status text,bloqueado boolean,origem text)
on conflict (cod) do update set loja=excluded.loja,nome=excluded.nome,contato=excluded.contato,endereco=excluded.endereco,numero=excluded.numero,bairro=excluded.bairro,municipio=excluded.municipio,estado=excluded.estado,pais=excluded.pais,doc=excluded.doc,doc_tipo=excluded.doc_tipo,doc_valido=excluded.doc_valido,email=excluded.email,ddd=excluded.ddd,telefone=excluded.telefone,vendedor=excluded.vendedor,status=excluded.status,bloqueado=excluded.bloqueado,origem=excluded.origem;

insert into public.produtos (cod,descricao,um,ncm,origem,manual,preco_manual,foto_url_site)
select cod,descricao,um,ncm,origem,manual,preco_manual,foto_url_site
from jsonb_to_recordset(${J([...prod.values()])}) as x(cod text,descricao text,um text,ncm text,origem text,manual boolean,preco_manual numeric,foto_url_site text)
on conflict (cod) do update set descricao=excluded.descricao,um=excluded.um,ncm=excluded.ncm,origem=excluded.origem,manual=excluded.manual,preco_manual=excluded.preco_manual,foto_url_site=coalesce(excluded.foto_url_site,produtos.foto_url_site);

-- tabela de preço: substitui a vigente pela desta carga
delete from public.tabelas_preco where nome = 'TEBELA DE PRECO 2026';
update public.tabelas_preco set vigente = false where vigente;
with t as (insert into public.tabelas_preco (nome, vigente, arquivo) values ('TEBELA DE PRECO 2026', true, 'planilhas/TEBELA DE PRECO 2026.xlsx') returning id)
insert into public.precos (tabela_id,linha,cod,descricao,um,preco_fcl,ncm,origem)
select t.id,x.linha,x.cod,x.descricao,x.um,x.preco_fcl,x.ncm,x.origem
from t, jsonb_to_recordset(${J(precos)}) as x(linha int,cod text,descricao text,um text,preco_fcl numeric,ncm text,origem text);

-- documentos já emitidos (proformas e invoice)
insert into public.documentos (tipo,numero,ano,seq,cliente_cod,status,data_doc,incoterm,moeda,total,dados,criado_por)
select tipo,numero,ano,seq,cliente_cod,status,data_doc,incoterm,moeda,total,dados,'carga inicial'
from jsonb_to_recordset(${J(docs)}) as x(tipo text,numero text,ano int,seq int,cliente_cod text,status text,data_doc date,incoterm text,moeda text,total numeric,dados jsonb)
on conflict (tipo, upper(numero)) do update set dados=excluded.dados,status=excluded.status,data_doc=excluded.data_doc,incoterm=excluded.incoterm,moeda=excluded.moeda,total=excluded.total,cliente_cod=excluded.cliente_cod;

-- liga invoice/packing à proforma
update public.documentos d set proforma_id = p.id
from public.documentos p
where d.tipo in ('invoice','packing') and p.tipo = 'proforma' and upper(p.numero) = upper(d.dados->>'proforma');

commit;

select (select count(*) from public.clientes) as clientes,
       (select count(*) from public.produtos) as produtos,
       (select count(*) from public.precos) as linhas_preco,
       (select count(*) from public.produtos where foto_url_site is not null) as produtos_com_foto_site,
       (select count(*) from public.documentos) as documentos;
`;
fs.writeFileSync(require("path").join(__dirname,"..","supabase","02_carga_base.sql"),sql);
console.log(cli.size,prod.size,precos.length,docs.length,[...prod.values()].filter(p=>p.foto_url_site).length, (sql.length/1024|0)+"KB");
