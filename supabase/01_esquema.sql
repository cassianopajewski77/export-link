-- =====================================================================
-- EXPORT LINK – esquema do banco (Supabase / Postgres)
-- Cole TUDO no Supabase > SQL Editor > New query > Run.
-- Pode rodar de novo sem problema (cria só o que ainda não existe).
-- Acesso: só usuários logados E cadastrados na tabela "membros".
-- =====================================================================

create extension if not exists pg_trgm;   -- busca por parte do nome/descrição

-- ---------- quem pode usar o sistema ----------
create table if not exists public.membros (
  email      text primary key,
  nome       text,
  criado_em  timestamptz not null default now()
);

create or replace function public.eh_membro()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.membros m
                 where lower(m.email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

-- carimbo de data/usuário em toda alteração
create or replace function public.carimbar()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := coalesce(auth.jwt() ->> 'email', new.atualizado_por);
  return new;
end $$;

-- ---------- configurações (dados do exportador, banco, textos padrão) ----------
create table if not exists public.configuracoes (
  chave          text primary key,          -- ex.: 'exportador'
  valor          jsonb not null default '{}'::jsonb,
  atualizado_em  timestamptz not null default now(),
  atualizado_por text
);

-- ---------- clientes (importadores) ----------
create table if not exists public.clientes (
  cod            text primary key,          -- código Protheus (A1_COD) ou NV0001...
  loja           text default '01',
  nome           text not null,
  contato        text,
  endereco       text,
  numero         text,
  bairro         text,
  municipio      text,
  estado         text,
  pais           text,                      -- ISO de 2 letras (AR, PY, US...) quando confirmado
  doc            text,                      -- identificação fiscal (CUIT, RUC, NIT...)
  doc_tipo       text,
  doc_valido     boolean,
  email          text,
  ddd            text,
  telefone       text,
  vendedor       text,
  status         text,
  bloqueado      boolean not null default false,
  origem         text not null default 'base' check (origem in ('base','editado','cadastrado')),
  extra          jsonb not null default '{}'::jsonb,   -- campos futuros sem mudar o esquema
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  atualizado_por text
);
create index if not exists clientes_nome_trgm on public.clientes using gin (nome gin_trgm_ops);

-- ---------- produtos (cadastro único por código) ----------
create table if not exists public.produtos (
  cod            text primary key,
  descricao      text not null,
  descricao_es   text,                      -- tradução revisada (opcional)
  um             text,                      -- PC, M2, MT, RL, KT...
  ncm            text,
  origem         text,                      -- NACIONAL / IMPORTADO / CADASTRO MANUAL
  manual         boolean not null default false,   -- true = cadastrado no gerador (fora da tabela)
  preco_manual   numeric(14,4),             -- preço dos produtos manuais
  foto_path      text,                      -- caminho no Storage (bucket "fotos")
  foto_url_site  text,                      -- foto do site (SKUImagens.xlsx)
  extra          jsonb not null default '{}'::jsonb,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  atualizado_por text
);
create index if not exists produtos_desc_trgm on public.produtos using gin (descricao gin_trgm_ops);

-- ---------- tabela de preço (versões) ----------
create table if not exists public.tabelas_preco (
  id             bigint generated always as identity primary key,
  nome           text not null,             -- ex.: 'TABELA DE PREÇO 2026'
  vigente        boolean not null default false,
  arquivo        text,
  importado_em   timestamptz not null default now(),
  importado_por  text
);
-- só uma tabela vigente por vez
create unique index if not exists tabelas_preco_uma_vigente on public.tabelas_preco (vigente) where vigente;

-- a planilha tem códigos repetidos com preços diferentes, por isso a chave é a linha
create table if not exists public.precos (
  id             bigint generated always as identity primary key,
  tabela_id      bigint not null references public.tabelas_preco(id) on delete cascade,
  linha          int not null,              -- ordem na planilha
  cod            text not null,
  descricao      text,
  um             text,
  preco_fcl      numeric(14,4),
  ncm            text,
  origem         text,
  unique (tabela_id, linha)
);
create index if not exists precos_cod on public.precos (tabela_id, cod);

-- ---------- base de embalagens (packing list) ----------
create table if not exists public.embalagens (
  cod             text primary key,
  tipo            text,
  por_embalagem   numeric(14,4),
  peso_liq_unit   numeric(14,4),            -- kg
  peso_bruto_emb  numeric(14,4),            -- kg
  comprimento     numeric(10,2),            -- cm
  largura         numeric(10,2),
  altura          numeric(10,2),
  obs             text,
  atualizado_em   timestamptz not null default now(),
  atualizado_por  text
);

-- ---------- de-para (código do cliente -> código Kapazi) ----------
create table if not exists public.de_para (
  id               bigint generated always as identity primary key,
  cliente_cod      text references public.clientes(cod) on update cascade on delete cascade,  -- vazio = vale para todos
  codigo_cliente   text not null,
  descricao_cliente text,
  produto_cod      text not null references public.produtos(cod) on update cascade,
  fator            numeric(14,6) not null default 1,  -- qtd do cliente x fator = qtd Kapazi
  obs              text,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  atualizado_por   text
);
create unique index if not exists de_para_unico on public.de_para (coalesce(cliente_cod, ''), upper(codigo_cliente));

-- ---------- documentos (proforma, invoice, packing list, formação de preço) ----------
create table if not exists public.documentos (
  id             uuid primary key default gen_random_uuid(),
  tipo           text not null check (tipo in ('proforma','invoice','packing','formacao_preco')),
  numero         text not null,             -- ex.: KZSS-001/26 (formação de preço: nome da simulação)
  ano            int,
  seq            int,                       -- sequencial da proforma no ano
  cliente_cod    text references public.clientes(cod) on update cascade,
  proforma_id    uuid references public.documentos(id) on delete set null,  -- invoice/packing -> proforma
  status         text not null default 'rascunho' check (status in ('rascunho','emitido','cancelado')),
  data_doc       date,
  incoterm       text,
  moeda          text,
  total          numeric(14,2),
  dados          jsonb not null default '{}'::jsonb,   -- o mesmo JSON que o gerador já usa (dados_*.json)
  criado_em      timestamptz not null default now(),
  criado_por     text default (auth.jwt() ->> 'email'),
  atualizado_em  timestamptz not null default now(),
  atualizado_por text
);
create unique index if not exists documentos_numero on public.documentos (tipo, upper(numero));
create index if not exists documentos_cliente on public.documentos (cliente_cod);
create index if not exists documentos_proforma on public.documentos (proforma_id);

-- ---------- arquivos (PDF/Excel gerados, pedido do cliente, docs do cliente, fichas técnicas) ----------
create table if not exists public.arquivos (
  id             uuid primary key default gen_random_uuid(),
  categoria      text not null check (categoria in ('documento_gerado','pedido_cliente','doc_cliente','doc_produto','formacao_preco','outro')),
  documento_id   uuid references public.documentos(id) on delete cascade,
  cliente_cod    text references public.clientes(cod) on update cascade,
  produto_cod    text references public.produtos(cod) on update cascade,
  nome           text not null,             -- nome do arquivo para o usuário
  storage_path   text not null unique,      -- caminho no bucket "arquivos"
  mime           text,
  tamanho        bigint,
  criado_em      timestamptz not null default now(),
  criado_por     text default (auth.jwt() ->> 'email')
);
create index if not exists arquivos_documento on public.arquivos (documento_id);
create index if not exists arquivos_cliente on public.arquivos (cliente_cod);

-- ---------- gatilhos de carimbo ----------
do $$
declare t text;
begin
  foreach t in array array['configuracoes','clientes','produtos','embalagens','de_para','documentos'] loop
    execute format('drop trigger if exists carimbo on public.%I', t);
    execute format('create trigger carimbo before insert or update on public.%I for each row execute function public.carimbar()', t);
  end loop;
end $$;

-- ---------- próximo número da proforma (sequência única, recomeça a cada ano) ----------
create or replace function public.proximo_seq_proforma(p_ano int default extract(year from now())::int)
returns int language sql stable security invoker set search_path = public
as $$
  select coalesce(max(seq), 0) + 1 from public.documentos where tipo = 'proforma' and ano = p_ano;
$$;

-- ---------- preço vigente por código (primeira linha da tabela vigente) ----------
create or replace view public.precos_vigentes with (security_invoker = true) as
select distinct on (p.cod) p.cod, p.descricao, p.um, p.preco_fcl, p.ncm, p.origem, p.linha, t.nome as tabela
from public.precos p join public.tabelas_preco t on t.id = p.tabela_id and t.vigente
order by p.cod, p.linha;

-- ---------- segurança (RLS): só membros logados ----------
do $$
declare t text;
begin
  foreach t in array array['membros','configuracoes','clientes','produtos','tabelas_preco','precos','embalagens','de_para','documentos','arquivos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists membros_tudo on public.%I', t);
    if t = 'membros' then
      -- a lista de membros só é lida pelo app; incluir/excluir membro é feito aqui no SQL Editor
      execute 'create policy membros_tudo on public.membros for select to authenticated using (public.eh_membro())';
    else
      execute format('create policy membros_tudo on public.%I for all to authenticated using (public.eh_membro()) with check (public.eh_membro())', t);
    end if;
  end loop;
end $$;

-- quem não está logado não vê nada
revoke all on all tables in schema public from anon;
revoke execute on function public.proximo_seq_proforma(int) from anon;

-- ---------- Storage: buckets privados ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('fotos', 'fotos', false, 5242880),        -- fotos de produto (até 5 MB)
       ('arquivos', 'arquivos', false, 52428800)  -- PDFs, Excel, pedidos (até 50 MB)
on conflict (id) do nothing;

drop policy if exists "membros leem" on storage.objects;
drop policy if exists "membros gravam" on storage.objects;
drop policy if exists "membros alteram" on storage.objects;
drop policy if exists "membros apagam" on storage.objects;
create policy "membros leem"    on storage.objects for select to authenticated using (bucket_id in ('fotos','arquivos') and public.eh_membro());
create policy "membros gravam"  on storage.objects for insert to authenticated with check (bucket_id in ('fotos','arquivos') and public.eh_membro());
create policy "membros alteram" on storage.objects for update to authenticated using (bucket_id in ('fotos','arquivos') and public.eh_membro());
create policy "membros apagam"  on storage.objects for delete to authenticated using (bucket_id in ('fotos','arquivos') and public.eh_membro());

select 'Esquema criado com sucesso' as resultado;
