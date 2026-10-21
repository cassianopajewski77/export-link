-- =====================================================================
-- EXPORT LINK – catálogo público para a Hoja de Pedido online (web/pedido.html).
-- Rode depois dos scripts 01 a 04. Pode rodar de novo sem problema.
--
-- O cliente não faz login: a página chama esta função com a chave pública.
-- Ela devolve SÓ código, descrição, unidade, origem e foto do site dos produtos
-- ativos (tabela de preço vigente + produtos cadastrados no gerador).
-- Preços, clientes e documentos continuam fechados pelo RLS.
-- =====================================================================

create or replace function public.catalogo_pedido()
returns table (cod text, descricao text, descricao_es text, um text, origem text, foto_url text, ordem int)
language sql stable security definer set search_path = public as $$
  select v.cod, v.descricao, pr.descricao_es, v.um, v.origem, pr.foto_url_site, v.linha
  from public.precos_vigentes v
  left join public.produtos pr on pr.cod = v.cod
  where coalesce(pr.ativo, true)
  union all
  select pr.cod, pr.descricao, pr.descricao_es, pr.um, 'CADASTRADO', pr.foto_url_site, 1000000
  from public.produtos pr
  where pr.manual and pr.ativo
    and not exists (select 1 from public.precos_vigentes v where v.cod = pr.cod)
  order by 7, 1
$$;

revoke all on function public.catalogo_pedido() from public;
grant execute on function public.catalogo_pedido() to anon, authenticated;
