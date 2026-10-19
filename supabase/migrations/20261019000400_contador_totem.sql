-- Contador da tela inicial do totem (engajamento): números do mês, nunca nomes.
-- Pode ser lido sem login, porque o totem mostra antes de alguém entrar.

create function public.estatisticas_totem(p_slug text)
returns table (ideias_mes int, participantes_mes int, padronizadas int)
language sql stable security definer set search_path = public as $$
  with emp as (select id from empresas where slug = p_slug),
  mes as (
    select i.* from ideias i, emp
    where i.empresa_id = emp.id
      and to_char(i.criada_em at time zone 'America/Sao_Paulo', 'YYYY-MM') = to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM')
  )
  select
    (select count(*)::int from mes),
    (select count(distinct a)::int from mes m cross join lateral (
        select m.autor_id as a where m.autor_id is not null
        union select s.colaborador_id from ideia_autoria_selada s where s.ideia_id = m.id
        union select c.colaborador_id from ideia_coautores c where c.ideia_id = m.id) x),
    (select count(*)::int from ideias i, emp where i.empresa_id = emp.id and i.status = 'padronizada')
$$;

revoke execute on function public.estatisticas_totem(text) from public;
grant execute on function public.estatisticas_totem(text) to anon, authenticated;
