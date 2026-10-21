-- =====================================================================
-- EXPORT LINK – ajustes para o app online. Rode depois dos scripts 01 a 03.
-- Pode rodar de novo sem problema.
-- =====================================================================

-- número do documento como chave simples (o app grava com upsert por tipo + número)
drop index if exists public.documentos_numero;
update public.documentos set numero = upper(numero) where tipo <> 'formacao_preco' and numero <> upper(numero);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'documentos_tipo_numero_key') then
    alter table public.documentos add constraint documentos_tipo_numero_key unique (tipo, numero);
  end if;
end $$;

-- preenche ano/seq, cliente e proforma a partir do JSON do documento
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
  if v_cod is not null and exists (select 1 from public.clientes c where c.cod = v_cod) then new.cliente_cod := v_cod;
  else new.cliente_cod := null; end if;
  v_pf := new.dados ->> 'proforma';
  if new.tipo in ('invoice','packing') and v_pf is not null then
    select id into new.proforma_id from public.documentos where tipo = 'proforma' and numero = upper(v_pf);
  end if;
  return new;
end $$;
drop trigger if exists preencher on public.documentos;
create trigger preencher before insert or update on public.documentos for each row execute function public.documento_preencher();

-- arquivos: cliente/produto só quando existem no cadastro
create or replace function public.arquivo_preencher()
returns trigger language plpgsql as $$
begin
  if new.cliente_cod is not null and not exists (select 1 from public.clientes where cod = new.cliente_cod) then new.cliente_cod := null; end if;
  if new.produto_cod is not null and not exists (select 1 from public.produtos where cod = new.produto_cod) then new.produto_cod := null; end if;
  return new;
end $$;
drop trigger if exists preencher on public.arquivos;
create trigger preencher before insert or update on public.arquivos for each row execute function public.arquivo_preencher();

select 'Ajustes aplicados' as resultado;
