-- =====================================================================
-- EXPORT LINK – libera o acesso dos usuários criados em Authentication > Users.
-- Rode DEPOIS de criar os 2 usuários (você e a assistente).
-- Quem não estiver na tabela "membros" consegue logar, mas não vê nenhum dado.
-- =====================================================================
insert into public.membros (email)
select lower(email) from auth.users where email is not null
on conflict (email) do nothing;

select email from public.membros order by email;

-- Para tirar o acesso de alguém:
-- delete from public.membros where email = 'email@exemplo.com';
