-- Ajustes pedidos após o teste da Entrega 4:
-- 1. Ajustes do gestor: corrigir dados e reabrir etapas, só pelo gestor do programa, com motivo e trilha de auditoria.
-- 2. RH: consulta de ideias anônimas, revelação de autoria auditada e liberação de pontos retidos (Fase 0, seção 6).
-- 3. Limite de 10 ideias pontuadas por pessoa por mês (Fase 0, seção 9).

-- ---------------------------------------------------------------------------
-- 1. Ajustes do gestor
-- ---------------------------------------------------------------------------

create table public.ideia_ajustes (
  id bigint generated always as identity primary key,
  ideia_id uuid not null references public.ideias (id) on delete cascade,
  campo text not null,
  antes text,
  depois text,
  motivo text not null,
  por_colaborador uuid references public.colaboradores (id),
  criado_em timestamptz not null default now()
);
create index on public.ideia_ajustes (ideia_id);
alter table public.ideia_ajustes enable row level security;
create policy "gestão vê os ajustes" on public.ideia_ajustes
  for select to authenticated using (public.sou_gestao() and public.pode_ver_ideia(ideia_id));

-- Corrige campos de uma ideia em qualquer etapa. Cada campo alterado vira uma linha de auditoria.
create function public.ajustar_ideia(p_ideia uuid, p_dados jsonb, p_motivo text, p_avisar boolean) returns int
language plpgsql security definer set search_path = public as $$
declare
  i ideias%rowtype;
  -- Campos que o gestor pode corrigir e o tipo de cada um.
  v_campos jsonb := '{
    "categoria": "categoria_ideia", "setor_id": "uuid", "maquina_id": "uuid", "texto": "text", "nota": "numeric",
    "custo_estimado": "numeric", "ganho_estimado": "numeric", "ganho_verificado": "numeric", "ganho_qualitativo": "text",
    "linha_base": "text", "sop_codigo": "text", "sop_revisao": "text", "responsavel_implantacao": "text",
    "prazo_atual": "date", "prazo_implantacao": "int"
  }';
  k text;
  v_novo text;
  v_antes text;
  v_n int := 0;
begin
  if not sou_gestor() then raise exception 'Apenas o gestor do programa faz ajustes.'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo do ajuste.'; end if;
  select * into i from ideias where id = p_ideia and empresa_id = minha_empresa() for update;
  if not found then raise exception 'Ideia não encontrada.'; end if;

  for k in select jsonb_object_keys(coalesce(p_dados, '{}')) loop
    if not v_campos ? k then raise exception 'Campo % não pode ser ajustado.', k; end if;
    v_novo := nullif(trim(p_dados->>k), '');
    execute format('select %I::text from ideias where id = $1', k) into v_antes using p_ideia;
    if v_novo is not distinct from v_antes then continue; end if;

    if k = 'setor_id' and not exists (select 1 from setores where id = v_novo::uuid and empresa_id = i.empresa_id) then
      raise exception 'Setor inválido.';
    end if;
    if k = 'maquina_id' and v_novo is not null and not exists (select 1 from maquinas where id = v_novo::uuid and empresa_id = i.empresa_id) then
      raise exception 'Máquina inválida.';
    end if;
    if k = 'nota' and v_novo is not null and v_novo::numeric not between 1 and 5 then raise exception 'A nota vai de 1 a 5.'; end if;
    if k in ('setor_id', 'categoria') and v_novo is null then raise exception 'O campo % é obrigatório.', k; end if;

    execute format('update ideias set %I = $1::%s where id = $2', k, v_campos->>k) using v_novo, p_ideia;
    insert into ideia_ajustes (ideia_id, campo, antes, depois, motivo, por_colaborador)
    values (p_ideia, k, v_antes, v_novo, trim(p_motivo), meu_colaborador());
    v_n := v_n + 1;
  end loop;

  if v_n > 0 then
    -- Máquina precisa ser do setor da ideia; ROI e payback acompanham custo e ganho estimado.
    update ideias set maquina_id = null
      where id = p_ideia and maquina_id is not null
        and not exists (select 1 from maquinas m where m.id = ideias.maquina_id and m.setor_id = ideias.setor_id);
    update ideias
      set roi = case when custo_estimado > 0 and ganho_estimado > 0 then round((ganho_estimado - custo_estimado) / custo_estimado * 100, 1) end,
          payback_meses = case when custo_estimado > 0 and ganho_estimado > 0 then round(custo_estimado / (ganho_estimado / 12), 1) end,
          atualizada_em = now()
      where id = p_ideia;
    if p_avisar then
      perform _notificar(p_ideia, format('O gestor do programa ajustou dados da sua ideia %s. Motivo: %s', i.protocolo, trim(p_motivo)));
    end if;
  end if;
  return v_n;
end
$$;

-- Reabre a ideia numa etapa escolhida. Se ela estava padronizada, os pontos da implantação são estornados.
create function public.reabrir_ideia(p_ideia uuid, p_para public.status_ideia, p_motivo text, p_avisar boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  i ideias%rowtype;
  v_total int;
  v_prazo date;
begin
  if not sou_gestor() then raise exception 'Apenas o gestor do programa reabre etapas.'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo.'; end if;
  if p_para not in ('em_triagem', 'em_viabilidade', 'aprovada', 'em_implantacao', 'padronizando') then
    raise exception 'Etapa inválida para reabrir.';
  end if;
  select * into i from ideias where id = p_ideia and empresa_id = minha_empresa() for update;
  if not found then raise exception 'Ideia não encontrada.'; end if;
  if i.status = p_para then raise exception 'A ideia já está nesta etapa.'; end if;

  if i.status = 'padronizada' then
    insert into pontos (empresa_id, colaborador_id, ideia_id, valor, motivo, retido)
    select i.empresa_id, p.colaborador_id, p_ideia, -sum(p.valor), 'Estorno: ideia reaberta pelo gestor', bool_or(p.retido)
    from pontos p
    where p.ideia_id = p_ideia and p.motivo like 'Ideia implantada e padronizada%'
    group by p.colaborador_id
    having sum(p.valor) <> 0;
    update ideias set padronizada_em = null, difusao_confirmada_em = null where id = p_ideia;
  end if;

  select case when p_para = 'em_implantacao' then coalesce(i.prazo_implantacao, sc.prazo) else sc.prazo end
    into v_total from sla_config(i.empresa_id, p_para) sc;
  v_prazo := somar_dias_uteis(i.empresa_id, hoje(), coalesce(v_total, 5));

  update ideias set retorno = null, dias_restantes = null, revisao = null, motivo_espera = null where id = p_ideia;
  perform _mudar_status(p_ideia, p_para, 'Reaberta pelo gestor: ' || trim(p_motivo), v_prazo, 'Gestor do programa');
  insert into ideia_ajustes (ideia_id, campo, antes, depois, motivo, por_colaborador)
  values (p_ideia, 'status', i.status::text, p_para::text, trim(p_motivo), meu_colaborador());

  if p_avisar then
    perform _notificar(p_ideia, format('Sua ideia %s voltou para a etapa de %s. Motivo: %s', i.protocolo, rotulo_status(p_para), trim(p_motivo)));
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. RH: autoria anônima
-- ---------------------------------------------------------------------------

-- Leitura direta da autoria selada passa a ser só do próprio autor. O RH revela pela função auditada abaixo.
drop policy "autor ou RH veem a autoria selada" on public.ideia_autoria_selada;
create policy "autor vê a própria autoria selada" on public.ideia_autoria_selada
  for select to authenticated using (colaborador_id = public.meu_colaborador());

create table public.autoria_revelacoes (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  ideia_id uuid not null references public.ideias (id) on delete cascade,
  acao text not null check (acao in ('revelar', 'liberar_pontos')),
  rh_colaborador uuid references public.colaboradores (id),
  motivo text not null,
  criado_em timestamptz not null default now()
);
alter table public.autoria_revelacoes enable row level security;
-- O registro mostra quem revelou, quando e por quê, nunca a identidade revelada.
create policy "RH e gestor veem o registro de revelações" on public.autoria_revelacoes
  for select to authenticated
  using (empresa_id = public.minha_empresa() and (public.tenho_papel('rh') or public.sou_gestor()));

create function public.ideias_anonimas()
returns table (id uuid, protocolo text, status public.status_ideia, categoria public.categoria_ideia, setor text,
               texto text, criada_em timestamptz, pontos_retidos int, revelacoes int, pontos_liberados boolean)
language sql stable security definer set search_path = public as $$
  select i.id, i.protocolo, i.status, i.categoria, s.nome, i.texto, i.criada_em,
    (select coalesce(sum(p.valor), 0)::int from pontos p where p.ideia_id = i.id and p.retido),
    (select count(*)::int from autoria_revelacoes r where r.ideia_id = i.id and r.acao = 'revelar'),
    exists (select 1 from autoria_revelacoes r where r.ideia_id = i.id and r.acao = 'liberar_pontos')
  from ideias i left join setores s on s.id = i.setor_id
  where i.empresa_id = minha_empresa() and i.modo = 'anonimo' and tenho_papel('rh')
  order by i.criada_em desc
$$;

create function public.revelar_autoria(p_ideia uuid, p_motivo text)
returns table (nome text, matricula text, setor text)
language plpgsql security definer set search_path = public as $$
begin
  if not tenho_papel('rh') then raise exception 'Apenas o RH revela autoria.'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo da revelação.'; end if;
  if not exists (select 1 from ideias where id = p_ideia and empresa_id = minha_empresa() and modo = 'anonimo') then
    raise exception 'Ideia anônima não encontrada.';
  end if;
  insert into autoria_revelacoes (empresa_id, ideia_id, acao, rh_colaborador, motivo)
  values (minha_empresa(), p_ideia, 'revelar', meu_colaborador(), trim(p_motivo));
  return query
    select c.nome, c.matricula, s.nome
    from ideia_autoria_selada a
    join colaboradores c on c.id = a.colaborador_id
    left join setores s on s.id = c.setor_id
    where a.ideia_id = p_ideia;
end
$$;

-- Quando o autor reivindica: os pontos retidos passam a contar no ranking.
create function public.liberar_pontos_anonimos(p_ideia uuid, p_motivo text) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  if not tenho_papel('rh') then raise exception 'Apenas o RH libera pontos.'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo (ex.: autor reivindicou em 20/10).'; end if;
  if not exists (select 1 from ideias where id = p_ideia and empresa_id = minha_empresa() and modo = 'anonimo') then
    raise exception 'Ideia anônima não encontrada.';
  end if;
  update pontos set retido = false where ideia_id = p_ideia and retido;
  get diagnostics v_n = row_count;
  insert into autoria_revelacoes (empresa_id, ideia_id, acao, rh_colaborador, motivo)
  values (minha_empresa(), p_ideia, 'liberar_pontos', meu_colaborador(), trim(p_motivo));
  return v_n;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Limite mensal de ideias pontuadas
-- ---------------------------------------------------------------------------

-- A ideia é sempre registrada e analisada; passado o limite do mês, ela só não soma pontos para aquela pessoa.
create or replace function public._pontuar(p_ideia uuid, p_total int, p_motivo text) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid;
  v_modo modo_identidade;
  v_criada timestamptz;
  v_mes text;
  v_lim int;
  v_n int;
  v_bonus numeric;
  v_cada int;
  v_ordem int;
  a uuid;
begin
  select empresa_id, modo, criada_em into v_emp, v_modo, v_criada from ideias where id = p_ideia;
  select count(*) into v_n from _autores(p_ideia);
  select coalesce((config #>> '{pontos,bonus_equipe}')::numeric, 0.2), coalesce((config #>> '{pontos,limite_mensal}')::int, 10)
    into v_bonus, v_lim from empresas where id = v_emp;
  v_cada := case when v_n > 1 then round(p_total::numeric / v_n * (1 + v_bonus)) else p_total end;
  v_mes := to_char(v_criada at time zone 'America/Sao_Paulo', 'YYYY-MM');

  for a in select x from _autores(p_ideia) x loop
    -- Posição desta ideia entre as ideias da pessoa no mês (como autora ou coautora).
    select count(*) into v_ordem
    from ideias i
    where i.empresa_id = v_emp
      and to_char(i.criada_em at time zone 'America/Sao_Paulo', 'YYYY-MM') = v_mes
      and i.criada_em <= v_criada
      and (i.autor_id = a
           or exists (select 1 from ideia_autoria_selada s where s.ideia_id = i.id and s.colaborador_id = a)
           or exists (select 1 from ideia_coautores c where c.ideia_id = i.id and c.colaborador_id = a));
    insert into pontos (empresa_id, colaborador_id, ideia_id, valor, motivo, retido)
    values (v_emp, a, p_ideia,
            case when v_ordem > v_lim then 0 else v_cada end,
            case when v_ordem > v_lim then p_motivo || format(' (fora do limite de %s ideias pontuadas no mês)', v_lim) else p_motivo end,
            v_modo = 'anonimo');
  end loop;
  return v_cada;
end
$$;

-- Quantas ideias o colaborador já enviou no mês (para o aviso no totem).
create function public.ideias_no_mes() returns table (enviadas int, limite int)
language sql stable security definer set search_path = public as $$
  select
    (select count(*)::int from ideias i
     where i.empresa_id = minha_empresa()
       and to_char(i.criada_em at time zone 'America/Sao_Paulo', 'YYYY-MM') = to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM')
       and (i.autor_id = meu_colaborador()
            or exists (select 1 from ideia_autoria_selada s where s.ideia_id = i.id and s.colaborador_id = meu_colaborador())
            or exists (select 1 from ideia_coautores c where c.ideia_id = i.id and c.colaborador_id = meu_colaborador()))),
    (select coalesce((config #>> '{pontos,limite_mensal}')::int, 10) from empresas where id = minha_empresa())
$$;

-- ---------------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------------

revoke execute on function public._pontuar(uuid, int, text) from public, anon, authenticated;
revoke execute on function public.ajustar_ideia(uuid, jsonb, text, boolean) from public, anon;
revoke execute on function public.reabrir_ideia(uuid, public.status_ideia, text, boolean) from public, anon;
revoke execute on function public.ideias_anonimas() from public, anon;
revoke execute on function public.revelar_autoria(uuid, text) from public, anon;
revoke execute on function public.liberar_pontos_anonimos(uuid, text) from public, anon;
revoke execute on function public.ideias_no_mes() from public, anon;

grant execute on function public.ajustar_ideia(uuid, jsonb, text, boolean) to authenticated;
grant execute on function public.reabrir_ideia(uuid, public.status_ideia, text, boolean) to authenticated;
grant execute on function public.ideias_anonimas() to authenticated;
grant execute on function public.revelar_autoria(uuid, text) to authenticated;
grant execute on function public.liberar_pontos_anonimos(uuid, text) to authenticated;
grant execute on function public.ideias_no_mes() to authenticated;
