-- =====================================================================
-- EXPORT LINK – sistema multiempresa (várias exportadoras no mesmo sistema).
-- Rode depois dos scripts 01 a 06. Pode rodar de novo sem problema.
--
-- O que este script faz:
--   1. guarda uma cópia das tabelas atuais no esquema "backup_07";
--   2. cria o cadastro de EMPRESAS (exportadoras) e a lista de administradores da plataforma (Export Link);
--   3. cada usuário (e-mail) pertence a UMA empresa, com um papel: admin, usuario ou consulta;
--   4. todas as tabelas ganham a coluna empresa_id, e a segurança (RLS) passa a separar as empresas:
--      uma empresa nunca vê clientes, produtos, preços, documentos ou arquivos de outra;
--   5. cria a KAPAZI como primeira empresa, com os dados do exportador que já estavam salvos,
--      e coloca nela tudo o que já existe e todos os usuários atuais (como admin);
--   6. o site de pedidos dos clientes (kapazi-pedidos) continua lendo só o catálogo da Kapazi.
--
-- IMPORTANTE: rode este script e logo em seguida publique a versão nova do site (o PR do multiempresa).
-- Entre os dois passos o site antigo abre e mostra os dados, mas não consegue gravar.
-- =====================================================================

-- ---------- 1. cópia de segurança (só na primeira vez) ----------
create schema if not exists backup_07;
revoke all on schema backup_07 from public, anon, authenticated;
do $$
declare t text;
begin
  foreach t in array array['membros','configuracoes','clientes','produtos','tabelas_preco','precos','embalagens','de_para','documentos','arquivos','fotos_pedido'] loop
    if to_regclass('public.' || t) is not null and to_regclass('backup_07.' || t) is null then
      execute format('create table backup_07.%I as table public.%I', t, t);
    end if;
  end loop;
end $$;

-- ---------- 2. empresas (exportadoras) ----------
create table if not exists public.empresas (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique,                 -- apelido curto, ex.: 'kapazi'
  nome            text not null,               -- nome que aparece no sistema
  razao_social    text,
  nome_fantasia   text,
  cnpj            text,
  ie              text,                        -- inscrição estadual
  radar           text,                        -- habilitação RADAR (modalidade)
  logradouro      text,
  numero          text,
  complemento     text,
  bairro          text,
  cidade          text,
  uf              text,
  cep             text,
  pais            text not null default 'Brasil',
  endereco_doc    text,                        -- endereço como sai no documento (linhas); vazio = montado dos campos
  contato         text,
  cargo           text,
  email           text,
  telefone        text,
  site            text,
  assinatura      text,
  logo_path       text,                        -- caminho no bucket "arquivos" (<empresa>/_empresa/logo.png)
  contas          jsonb not null default '[]'::jsonb,  -- contas bancárias: [{moeda, beneficiario, banco, agencia, conta, swift, iban, intermediario, swift_intermediario, texto}]
  prefixo         text,                        -- prefixo do número da proforma (Kapazi: KZ)
  padroes         jsonb not null default '{}'::jsonb,  -- incoterm, pagamento, porto, observações, traduzir...
  storage_legado  boolean not null default false,      -- arquivos antigos ainda fora da pasta da empresa
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  atualizado_por  text
);

-- administradores da plataforma (Export Link): criam empresas e entram em qualquer uma para suporte
create table if not exists public.plataforma_admins (
  email            text primary key,
  empresa_suporte  uuid references public.empresas(id) on delete set null,   -- empresa em que está entrando agora
  criado_em        timestamptz not null default now()
);

-- ---------- 3. membros: cada e-mail em UMA empresa, com papel ----------
alter table public.membros add column if not exists empresa_id uuid references public.empresas(id) on delete cascade;
alter table public.membros add column if not exists papel text not null default 'usuario';
alter table public.membros add column if not exists ativo boolean not null default true;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'membros_papel_check') then
    alter table public.membros add constraint membros_papel_check check (papel in ('admin','usuario','consulta'));
  end if;
end $$;
update public.membros set email = lower(email) where email <> lower(email);

-- ---------- funções de acesso ----------
create or replace function public.meu_email()
returns text language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function public.eh_plataforma()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.plataforma_admins where email = public.meu_email());
$$;

-- empresa em que o usuário está trabalhando agora
create or replace function public.empresa_atual()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select p.empresa_suporte from public.plataforma_admins p where p.email = public.meu_email()),
    (select m.empresa_id from public.membros m where m.email = public.meu_email() and m.ativo));
$$;

-- papel do usuário na empresa atual (administrador da plataforma = admin)
create or replace function public.meu_papel()
returns text language sql stable security definer set search_path = public as $$
  select case when public.eh_plataforma() then 'admin'
              else (select m.papel from public.membros m where m.email = public.meu_email() and m.ativo) end;
$$;

create or replace function public.pode_ver(e uuid)
returns boolean language sql stable as $$ select e is not null and e = public.empresa_atual() $$;
create or replace function public.pode_gravar(e uuid)
returns boolean language sql stable as $$ select public.pode_ver(e) and public.meu_papel() in ('admin','usuario') $$;
create or replace function public.eh_admin(e uuid)
returns boolean language sql stable as $$ select public.pode_ver(e) and public.meu_papel() = 'admin' $$;

-- usada pelos scripts antigos (05/06) e pelo site de pedidos: "é usuário ativo de alguma empresa"
create or replace function public.eh_membro()
returns boolean language sql stable security definer set search_path = public as $$
  select public.empresa_atual() is not null;
$$;

create or replace function public.empresa_por_slug(p text)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.empresas where slug = p;
$$;

-- ---------- 5a. Kapazi: primeira empresa, com os dados que estavam em configuracoes.exportador ----------
insert into public.empresas (id, slug, nome, prefixo, storage_legado)
values ('4b415a49-0000-4000-8000-000000000001', 'kapazi', 'Kapazi', 'KZ', true)
on conflict (id) do nothing;

do $$
declare c jsonb; e text[];
begin
  if to_regclass('public.configuracoes') is null then return; end if;
  -- só na primeira vez (antes da coluna empresa_id existir em configuracoes)
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'configuracoes' and column_name = 'empresa_id') then return; end if;
  select valor into c from public.configuracoes where chave = 'exportador';
  if c is null then return; end if;
  e := string_to_array(nullif(c ->> 'emailtel', ''), ' ');
  update public.empresas set
    razao_social  = nullif(c ->> 'empresa', ''),
    cnpj          = nullif(c ->> 'cnpj', ''),
    endereco_doc  = nullif(c ->> 'direccion', ''),
    contato       = nullif(c ->> 'contacto', ''),
    email         = nullif(c ->> 'emailtel', ''),
    assinatura    = nullif(c ->> 'assinatura', ''),
    contas        = case when coalesce(c ->> 'banco', '') <> '' then jsonb_build_array(jsonb_build_object('moeda', 'USD', 'texto', c ->> 'banco')) else '[]'::jsonb end,
    padroes       = jsonb_build_object('traduzir', coalesce((c ->> 'traduzir')::boolean, true))
  where id = '4b415a49-0000-4000-8000-000000000001';
end $$;

-- usuários atuais: todos entram na Kapazi como admin (depois dá para mudar na tela Usuários)
update public.membros set empresa_id = '4b415a49-0000-4000-8000-000000000001', papel = 'admin' where empresa_id is null;
alter table public.membros alter column empresa_id set not null;
create index if not exists membros_empresa on public.membros (empresa_id);

-- administrador da plataforma: o e-mail do Cassiano que já está em membros
insert into public.plataforma_admins (email)
select email from public.membros where email like 'cassiano%'
on conflict (email) do nothing;

-- ---------- 4. empresa_id em todas as tabelas ----------
do $$
declare t text;
begin
  foreach t in array array['configuracoes','clientes','produtos','tabelas_preco','precos','embalagens','de_para','documentos','arquivos','fotos_pedido'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('alter table public.%I add column if not exists empresa_id uuid references public.empresas(id) on delete cascade', t);
    execute format('update public.%I set empresa_id = %L where empresa_id is null', t, '4b415a49-0000-4000-8000-000000000001');
    execute format('alter table public.%I alter column empresa_id set default public.empresa_atual()', t);
    execute format('alter table public.%I alter column empresa_id set not null', t);
    execute format('create index if not exists %I on public.%I (empresa_id)', t || '_empresa', t);
  end loop;
end $$;

-- chaves: códigos passam a ser únicos POR EMPRESA (duas empresas podem ter o cliente 000123)
alter table public.de_para   drop constraint if exists de_para_cliente_cod_fkey;
alter table public.de_para   drop constraint if exists de_para_produto_cod_fkey;
alter table public.documentos drop constraint if exists documentos_cliente_cod_fkey;
alter table public.arquivos  drop constraint if exists arquivos_cliente_cod_fkey;
alter table public.arquivos  drop constraint if exists arquivos_produto_cod_fkey;

do $$
declare r record;
begin
  for r in select * from (values ('clientes','cod'), ('produtos','cod'), ('embalagens','cod'), ('configuracoes','chave')) v(t, c) loop
    if not exists (select 1 from pg_constraint where conname = r.t || '_pkey' and pg_get_constraintdef(oid) like '%empresa_id%') then
      execute format('alter table public.%I drop constraint if exists %I', r.t, r.t || '_pkey');
      execute format('alter table public.%I add constraint %I primary key (empresa_id, %I)', r.t, r.t || '_pkey', r.c);
    end if;
  end loop;
end $$;

alter table public.de_para   add constraint de_para_cliente_cod_fkey foreign key (empresa_id, cliente_cod) references public.clientes (empresa_id, cod) on update cascade on delete cascade;
alter table public.de_para   add constraint de_para_produto_cod_fkey foreign key (empresa_id, produto_cod) references public.produtos (empresa_id, cod) on update cascade;
alter table public.documentos add constraint documentos_cliente_cod_fkey foreign key (empresa_id, cliente_cod) references public.clientes (empresa_id, cod) on update cascade;
alter table public.arquivos  add constraint arquivos_cliente_cod_fkey foreign key (empresa_id, cliente_cod) references public.clientes (empresa_id, cod) on update cascade;
alter table public.arquivos  add constraint arquivos_produto_cod_fkey foreign key (empresa_id, produto_cod) references public.produtos (empresa_id, cod) on update cascade;

alter table public.documentos drop constraint if exists documentos_tipo_numero_key;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'documentos_empresa_tipo_numero_key') then
    alter table public.documentos add constraint documentos_empresa_tipo_numero_key unique (empresa_id, tipo, numero);
  end if;
end $$;

drop index if exists public.tabelas_preco_uma_vigente;
create unique index tabelas_preco_uma_vigente on public.tabelas_preco (empresa_id) where vigente;
drop index if exists public.de_para_unico;
create unique index de_para_unico on public.de_para (empresa_id, coalesce(cliente_cod, ''), upper(codigo_cliente));
drop index if exists public.precos_cod;
create index precos_cod on public.precos (empresa_id, tabela_id, cod);

-- preço da linha sempre na mesma empresa da tabela de preço
create or replace function public.preco_empresa()
returns trigger language plpgsql as $$
begin
  select empresa_id into new.empresa_id from public.tabelas_preco where id = new.tabela_id;
  return new;
end $$;
drop trigger if exists empresa on public.precos;
create trigger empresa before insert or update on public.precos for each row execute function public.preco_empresa();

-- ---------- gatilhos e funções que procuram por código: agora dentro da empresa ----------
create or replace function public.documento_preencher()
returns trigger language plpgsql as $$
declare m text[]; v_cod text; v_pf text;
begin
  if new.tipo <> 'formacao_preco' then new.numero := upper(new.numero); end if;
  m := regexp_match(new.numero, '-(\d+)/(\d{2,4})$');
  if m is not null then
    new.ano := case when length(m[2]) = 2 then 2000 + m[2]::int else m[2]::int end;
    if new.tipo = 'proforma' then new.seq := m[1]::int; end if;
  end if;
  v_cod := coalesce(nullif(new.dados #>> '{cliente,cod}', ''), nullif(new.dados #>> '{imp,cod}', ''), new.cliente_cod);
  if v_cod is not null and exists (select 1 from public.clientes c where c.empresa_id = new.empresa_id and c.cod = v_cod) then new.cliente_cod := v_cod;
  else new.cliente_cod := null; end if;
  v_pf := new.dados ->> 'proforma';
  if new.tipo in ('invoice','packing') and v_pf is not null then
    select id into new.proforma_id from public.documentos where empresa_id = new.empresa_id and tipo = 'proforma' and numero = upper(v_pf);
  end if;
  return new;
end $$;

create or replace function public.arquivo_preencher()
returns trigger language plpgsql as $$
begin
  if new.cliente_cod is not null and not exists (select 1 from public.clientes where empresa_id = new.empresa_id and cod = new.cliente_cod) then new.cliente_cod := null; end if;
  if new.produto_cod is not null and not exists (select 1 from public.produtos where empresa_id = new.empresa_id and cod = new.produto_cod) then new.produto_cod := null; end if;
  return new;
end $$;

create or replace function public.proximo_seq_proforma(p_ano int default extract(year from now())::int)
returns int language sql stable security invoker set search_path = public as $$
  select coalesce(max(seq), 0) + 1 from public.documentos where empresa_id = public.empresa_atual() and tipo = 'proforma' and ano = p_ano;
$$;

create or replace view public.precos_vigentes with (security_invoker = true) as
select distinct on (p.empresa_id, p.cod) p.cod, p.descricao, p.um, p.preco_fcl, p.ncm, p.origem, p.linha, t.nome as tabela, p.empresa_id
from public.precos p join public.tabelas_preco t on t.id = p.tabela_id and t.vigente and t.empresa_id = p.empresa_id
order by p.empresa_id, p.cod, p.linha;

-- carimbo também no cadastro da empresa
drop trigger if exists carimbo on public.empresas;
create trigger carimbo before insert or update on public.empresas for each row execute function public.carimbar();

-- ---------- 6. site de pedidos: só o catálogo da Kapazi ----------
create or replace function public.catalogo_pedido()
returns table (cod text, descricao text, descricao_es text, um text, origem text, foto_url text, ordem int)
language sql stable security definer set search_path = public as $$
  with k as (select public.empresa_por_slug('kapazi') as id)
  select v.cod, v.descricao, pr.descricao_es, v.um, v.origem, pr.foto_url_site, v.linha
  from public.precos_vigentes v
  join k on v.empresa_id = k.id
  left join public.produtos pr on pr.empresa_id = v.empresa_id and pr.cod = v.cod
  where coalesce(pr.ativo, true)
  union all
  select pr.cod, pr.descricao, pr.descricao_es, pr.um, 'CADASTRADO', pr.foto_url_site, 1000000
  from public.produtos pr join k on pr.empresa_id = k.id
  where pr.manual and pr.ativo
    and not exists (select 1 from public.precos_vigentes v where v.empresa_id = pr.empresa_id and v.cod = pr.cod)
  order by 7, 1
$$;
revoke all on function public.catalogo_pedido() from public;
grant execute on function public.catalogo_pedido() to anon, authenticated;

-- fotos do site de pedidos: só usuários da Kapazi gravam (a tabela fotos_pedido já ganhou empresa_id acima)
do $$
begin
  if to_regclass('public.fotos_pedido') is null then return; end if;
  drop policy if exists "membros gravam" on public.fotos_pedido;
  drop policy if exists "membros apagam" on public.fotos_pedido;
  create policy "membros gravam" on public.fotos_pedido for insert to authenticated with check (public.pode_gravar(empresa_id) and empresa_id = public.empresa_por_slug('kapazi'));
  create policy "membros apagam" on public.fotos_pedido for delete to authenticated using (public.pode_gravar(empresa_id) and empresa_id = public.empresa_por_slug('kapazi'));
end $$;
drop policy if exists "fotos-pedido membros gravam"  on storage.objects;
drop policy if exists "fotos-pedido membros alteram" on storage.objects;
drop policy if exists "fotos-pedido membros apagam"  on storage.objects;
create policy "fotos-pedido membros gravam"  on storage.objects for insert to authenticated with check (bucket_id = 'fotos-pedido' and public.pode_gravar(public.empresa_por_slug('kapazi')));
create policy "fotos-pedido membros alteram" on storage.objects for update to authenticated using (bucket_id = 'fotos-pedido' and public.pode_gravar(public.empresa_por_slug('kapazi')));
create policy "fotos-pedido membros apagam"  on storage.objects for delete to authenticated using (bucket_id = 'fotos-pedido' and public.pode_gravar(public.empresa_por_slug('kapazi')));

-- ---------- segurança (RLS) por empresa ----------
do $$
declare t text;
begin
  foreach t in array array['configuracoes','clientes','produtos','tabelas_preco','precos','embalagens','de_para','documentos','arquivos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists membros_tudo on public.%I', t);
    execute format('drop policy if exists empresa_ve on public.%I', t);
    execute format('drop policy if exists empresa_inclui on public.%I', t);
    execute format('drop policy if exists empresa_altera on public.%I', t);
    execute format('drop policy if exists empresa_apaga on public.%I', t);
    execute format('create policy empresa_ve     on public.%I for select to authenticated using (public.pode_ver(empresa_id))', t);
    execute format('create policy empresa_inclui on public.%I for insert to authenticated with check (public.pode_gravar(empresa_id))', t);
    execute format('create policy empresa_altera on public.%I for update to authenticated using (public.pode_gravar(empresa_id)) with check (public.pode_gravar(empresa_id))', t);
    execute format('create policy empresa_apaga  on public.%I for delete to authenticated using (public.pode_gravar(empresa_id))', t);
  end loop;
end $$;

-- empresas: cada um vê a sua; o admin da empresa altera o cadastro; só a plataforma cria/apaga
alter table public.empresas enable row level security;
drop policy if exists empresa_ve on public.empresas;
drop policy if exists empresa_altera on public.empresas;
drop policy if exists plataforma_inclui on public.empresas;
drop policy if exists plataforma_apaga on public.empresas;
create policy empresa_ve        on public.empresas for select to authenticated using (id = public.empresa_atual() or public.eh_plataforma());
create policy empresa_altera    on public.empresas for update to authenticated using (public.eh_admin(id)) with check (public.eh_admin(id));
create policy plataforma_inclui on public.empresas for insert to authenticated with check (public.eh_plataforma());
create policy plataforma_apaga  on public.empresas for delete to authenticated using (public.eh_plataforma());
grant select, insert, update, delete on public.empresas to authenticated;

-- membros: todos da empresa veem a lista; só o admin inclui, muda papel ou tira acesso
alter table public.membros enable row level security;
drop policy if exists membros_tudo on public.membros;
drop policy if exists membros_ve on public.membros;
drop policy if exists membros_inclui on public.membros;
drop policy if exists membros_altera on public.membros;
drop policy if exists membros_apaga on public.membros;
create policy membros_ve     on public.membros for select to authenticated using (email = public.meu_email() or public.pode_ver(empresa_id));
create policy membros_inclui on public.membros for insert to authenticated with check (public.eh_admin(empresa_id));
create policy membros_altera on public.membros for update to authenticated using (public.eh_admin(empresa_id) and email <> public.meu_email()) with check (public.eh_admin(empresa_id));
create policy membros_apaga  on public.membros for delete to authenticated using (public.eh_admin(empresa_id) and email <> public.meu_email());
grant select, insert, update, delete on public.membros to authenticated;

-- e-mail sempre em minúsculas e empresa da sessão quando não informada
create or replace function public.membro_normalizar()
returns trigger language plpgsql as $$
begin
  new.email := lower(trim(new.email));
  if new.empresa_id is null then new.empresa_id := public.empresa_atual(); end if;
  return new;
end $$;
drop trigger if exists normalizar on public.membros;
create trigger normalizar before insert or update on public.membros for each row execute function public.membro_normalizar();

-- plataforma: cada admin vê só a própria linha; troca de empresa só pela função abaixo
alter table public.plataforma_admins enable row level security;
drop policy if exists plataforma_ve on public.plataforma_admins;
create policy plataforma_ve on public.plataforma_admins for select to authenticated using (email = public.meu_email());
grant select on public.plataforma_admins to authenticated;

-- ---------- funções chamadas pelo app ----------
-- quem sou eu: empresa atual, papel e se sou da plataforma
create or replace function public.minha_sessao()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'email', public.meu_email(),
    'empresa_id', public.empresa_atual(),
    'empresa', (select e.nome from public.empresas e where e.id = public.empresa_atual()),
    'papel', public.meu_papel(),
    'plataforma', public.eh_plataforma(),
    'empresa_propria', (select m.empresa_id from public.membros m where m.email = public.meu_email() and m.ativo));
$$;

-- administrador da plataforma: entrar numa empresa para suporte (null = voltar para a própria)
create or replace function public.entrar_empresa(p_empresa uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_plataforma() then raise exception 'só o administrador da plataforma pode trocar de empresa'; end if;
  if p_empresa is not null and not exists (select 1 from public.empresas where id = p_empresa) then raise exception 'empresa não encontrada'; end if;
  update public.plataforma_admins set empresa_suporte = p_empresa where email = public.meu_email();
  return public.minha_sessao();
end $$;

-- administrador da plataforma: criar uma empresa nova já com o administrador dela
create or replace function public.criar_empresa(p_nome text, p_admin_email text, p_prefixo text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_email text := lower(trim(p_admin_email)); v_slug text;
begin
  if not public.eh_plataforma() then raise exception 'só o administrador da plataforma cria empresas'; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'informe o nome da empresa'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'e-mail do administrador inválido'; end if;
  if exists (select 1 from public.membros where email = v_email) then raise exception 'o e-mail % já é usuário de outra empresa', v_email; end if;
  v_slug := trim(both '-' from regexp_replace(lower(p_nome), '[^a-z0-9]+', '-', 'g'));
  if v_slug = '' or exists (select 1 from public.empresas where slug = v_slug) then v_slug := v_slug || '-' || substr(md5(random()::text), 1, 4); end if;
  insert into public.empresas (nome, razao_social, slug, prefixo) values (trim(p_nome), trim(p_nome), v_slug, nullif(upper(trim(p_prefixo)), ''))
  returning id into v_id;
  insert into public.membros (email, empresa_id, papel) values (v_email, v_id, 'admin');
  return v_id;
end $$;

-- lista de empresas para o administrador da plataforma
create or replace function public.listar_empresas()
returns table (id uuid, nome text, cnpj text, ativo boolean, usuarios bigint, documentos bigint)
language sql stable security definer set search_path = public as $$
  select e.id, e.nome, e.cnpj, e.ativo,
         (select count(*) from public.membros m where m.empresa_id = e.id),
         (select count(*) from public.documentos d where d.empresa_id = e.id)
  from public.empresas e
  where public.eh_plataforma()
  order by e.nome;
$$;

-- fim da migração dos arquivos antigos (o app chama depois de mover tudo para a pasta da empresa)
create or replace function public.concluir_migracao_arquivos()
returns void language sql security definer set search_path = public as $$
  update public.empresas set storage_legado = false where id = public.empresa_atual() and public.eh_admin(id);
$$;

revoke all on function public.minha_sessao(), public.entrar_empresa(uuid), public.criar_empresa(text, text, text),
  public.listar_empresas(), public.concluir_migracao_arquivos() from public, anon;
grant execute on function public.minha_sessao(), public.entrar_empresa(uuid), public.criar_empresa(text, text, text),
  public.listar_empresas(), public.concluir_migracao_arquivos() to authenticated;

-- ---------- Storage: cada empresa na sua pasta (<id da empresa>/...) ----------
-- arquivos antigos (sem a pasta da empresa) continuam valendo para a empresa marcada com storage_legado
-- até o botão "Migrar arquivos" mover tudo.
create or replace function public.pasta_empresa(p_nome text)
returns uuid language sql stable security definer set search_path = public as $$
  select case
    when split_part(p_nome, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then split_part(p_nome, '/', 1)::uuid
    else (select e.id from public.empresas e where e.id = public.empresa_atual() and e.storage_legado)
  end;
$$;

drop policy if exists "membros leem"    on storage.objects;
drop policy if exists "membros gravam"  on storage.objects;
drop policy if exists "membros alteram" on storage.objects;
drop policy if exists "membros apagam"  on storage.objects;
create policy "membros leem"    on storage.objects for select to authenticated using (bucket_id in ('fotos','arquivos') and public.pode_ver(public.pasta_empresa(name)));
create policy "membros gravam"  on storage.objects for insert to authenticated with check (bucket_id in ('fotos','arquivos') and public.pode_gravar(public.pasta_empresa(name)));
create policy "membros alteram" on storage.objects for update to authenticated using (bucket_id in ('fotos','arquivos') and public.pode_gravar(public.pasta_empresa(name))) with check (bucket_id in ('fotos','arquivos') and public.pode_gravar(public.pasta_empresa(name)));
create policy "membros apagam"  on storage.objects for delete to authenticated using (bucket_id in ('fotos','arquivos') and public.pode_gravar(public.pasta_empresa(name)));

-- ---------- resultado ----------
select 'Multiempresa aplicado' as resultado,
       (select string_agg(nome, ', ') from public.empresas) as empresas,
       (select string_agg(email || ' (' || papel || ')', ', ') from public.membros) as usuarios,
       (select coalesce(string_agg(email, ', '), 'NENHUM: rode  insert into public.plataforma_admins(email) values (''seu@email'');') from public.plataforma_admins) as administrador_plataforma;
