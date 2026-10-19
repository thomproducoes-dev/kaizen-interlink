-- Entrega 4: viabilidade econômica (ROI e payback), implantação, verificação do ganho, padronização (SOP),
-- pontos, ranking, mural e indicadores do programa.
-- Fase 0: seções 9 (reconhecimento), 10 (ganho e ROI), 11 (padronização), 12 (indicadores).

-- ---------------------------------------------------------------------------
-- Estrutura
-- ---------------------------------------------------------------------------

alter table public.ideias
  add column ganho_tipo text check (ganho_tipo in ('tempo', 'refugo', 'material', 'energia', 'outros')),
  add column ganho_estimado numeric(14, 2),        -- R$ por ano, na viabilidade
  add column ganho_calculo jsonb,                  -- dados usados no cálculo (minutos, ocorrências, valores unitários…)
  add column roi numeric(10, 1),                   -- %
  add column payback_meses numeric(8, 1),
  add column implantacao_inicio date,
  add column linha_base text,
  add column ganho_verificado numeric(14, 2),      -- R$ por ano, medido após a implantação
  add column ganho_qualitativo text,
  add column verificado_em timestamptz,
  add column sop_codigo text,
  add column sop_revisao text,
  add column difusao_confirmada_em timestamptz,
  add column padronizada_em timestamptz;

-- Valores unitários para o cálculo de ganho (Fase 0, seção 10). Preenchidos pelo gestor.
update public.empresas
  set config = config || jsonb_build_object('valores_unitarios',
      coalesce(config->'valores_unitarios', '{"custo_minuto": null, "hora_homem": null, "m2_chapa": null, "kwh": null}'::jsonb));

-- ---------------------------------------------------------------------------
-- Apoio
-- ---------------------------------------------------------------------------

create function public.brl(v numeric) returns text
language sql immutable as $$
  select 'R$ ' || replace(to_char(round(coalesce(v, 0)), 'FM999,999,999,990'), ',', '.')
$$;

create function public.nivel(p int) returns text
language sql immutable as $$
  select case when p >= 500 then 'Ouro' when p >= 200 then 'Prata' when p >= 50 then 'Bronze' else 'Iniciante' end
$$;

-- ---------------------------------------------------------------------------
-- Viabilidade econômica (engenharia)
-- ---------------------------------------------------------------------------

create function public.decidir_viabilidade(p_ideia uuid, p_decisao text, p_dados jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  i ideias%rowtype;
  v_cfg jsonb;
  d jsonb := coalesce(p_dados, '{}');
  v_ganho numeric;
  v_custo numeric;
  v_prazo_impl int;
  v_roi numeric;
  v_payback numeric;
  v_prazo date;
  v_rev date;
begin
  if not (tenho_papel('engenharia') or sou_gestor()) then
    raise exception 'Apenas a engenharia decide a viabilidade.';
  end if;
  select * into i from ideias where id = p_ideia and empresa_id = minha_empresa() for update;
  if not found then raise exception 'Ideia não encontrada.'; end if;
  if i.status <> 'em_viabilidade' then raise exception 'Esta ideia não está em viabilidade.'; end if;
  if meu_colaborador() in (select _autores(p_ideia)) then
    raise exception 'Você é autor ou coautor desta ideia e não pode avaliá-la.';
  end if;
  select config into v_cfg from empresas where id = i.empresa_id;

  if p_decisao = 'aprovar' then
    if coalesce(d->>'tipo', '') not in ('tempo', 'refugo', 'material', 'energia', 'outros') then
      raise exception 'Escolha o tipo de ganho.';
    end if;
    v_ganho := nullif(d->>'ganho_anual', '')::numeric;
    v_custo := nullif(d->>'custo', '')::numeric;
    if v_ganho is null or v_ganho <= 0 then raise exception 'Informe o ganho anual estimado.'; end if;
    if v_custo is null or v_custo < 0 then raise exception 'Informe o custo de implantação (pode ser 0).'; end if;
    v_prazo_impl := coalesce(nullif(d->>'prazo', '')::int, (v_cfg #>> '{sla,implantacao,prazo}')::int, 30);
    if v_prazo_impl not between 1 and 180 then raise exception 'Prazo de implantação entre 1 e 180 dias úteis.'; end if;
    if coalesce(d->>'responsavel', '') = '' then raise exception 'Escolha o responsável pela implantação.'; end if;

    -- Fase 0, seção 10: ROI = (ganho − custo) ÷ custo; payback = custo ÷ (ganho ÷ 12).
    v_roi := case when v_custo > 0 then round((v_ganho - v_custo) / v_custo * 100, 1) end;
    v_payback := case when v_custo > 0 then round(v_custo / (v_ganho / 12), 1) end;
    v_prazo := somar_dias_uteis(i.empresa_id, hoje(), v_prazo_impl);

    update ideias
      set ganho_tipo = d->>'tipo', ganho_estimado = v_ganho, ganho_calculo = d->'calculo', custo_estimado = v_custo,
          roi = v_roi, payback_meses = v_payback, prazo_implantacao = v_prazo_impl,
          responsavel_implantacao = d->>'responsavel', implantacao_inicio = hoje()
      where id = p_ideia;
    perform _mudar_status(p_ideia, 'em_implantacao',
      format('Ganho estimado %s/ano, custo %s%s. Prazo de %s dias úteis.', brl(v_ganho), brl(v_custo),
        case when v_custo > 0 then format(', ROI %s%%, payback %s meses', replace(v_roi::text, '.', ','), replace(v_payback::text, '.', ',')) else '' end,
        v_prazo_impl),
      v_prazo, 'Engenharia');
    perform _notificar(p_ideia, format('Investimento aprovado! Sua ideia %s começou a ser implantada. Previsão de conclusão: %s.',
      i.protocolo, to_char(v_prazo, 'DD/MM')));
    return 'Investimento aprovado. A implantação começou e o autor foi avisado.';

  elsif p_decisao = 'espera' then
    v_rev := nullif(d->>'revisao', '')::date;
    if coalesce(trim(d->>'motivo'), '') = '' or v_rev is null then raise exception 'Informe o motivo e a data de revisão.'; end if;
    if v_rev <= hoje() or v_rev > hoje() + coalesce((v_cfg #>> '{sla,espera_max_dias}')::int, 90) then
      raise exception 'A data de revisão deve ser futura e em no máximo % dias.', coalesce((v_cfg #>> '{sla,espera_max_dias}')::int, 90);
    end if;
    update ideias
      set retorno = 'em_viabilidade', revisao = v_rev, motivo_espera = trim(d->>'motivo'),
          dias_restantes = greatest(contar_dias_uteis(i.empresa_id, hoje(), i.prazo_atual), 1)
      where id = p_ideia;
    perform _mudar_status(p_ideia, 'em_espera', format('Até %s: %s', to_char(v_rev, 'DD/MM'), trim(d->>'motivo')), v_rev, 'Engenharia');
    perform _notificar(p_ideia, format('Sua ideia %s ficou para %s porque: %s. Ela não foi descartada.',
      i.protocolo, to_char(v_rev, 'DD/MM'), lower(trim(d->>'motivo'))));
    return 'Ideia colocada em espera. O autor foi avisado.';

  elsif p_decisao = 'reprovar' then
    if coalesce(d->>'motivo', '') = '' or coalesce(trim(d->>'frase'), '') = '' or coalesce(trim(d->>'aproveita'), '') = '' then
      raise exception 'Preencha motivo, explicação e o que se aproveita.';
    end if;
    perform _mudar_status(p_ideia, 'reprovada', format('%s. %s', d->>'motivo', trim(d->>'frase')), null, 'Engenharia');
    if not exists (select 1 from pontos where ideia_id = p_ideia and motivo = 'Participação') then
      perform _pontuar(p_ideia, coalesce((v_cfg #>> '{pontos,reprovada}')::int, 5), 'Participação');
    end if;
    perform _notificar(p_ideia, format('Obrigado pela ideia %s. Na análise de custo: %s. %s O que aproveitamos: %s Quer ajustar e reenviar? Abra a ideia em "Minhas ideias".',
      i.protocolo, lower(d->>'motivo'), trim(d->>'frase'), trim(d->>'aproveita')));
    return 'Ideia reprovada na viabilidade. O autor foi avisado e pode reenviar.';
  end if;

  raise exception 'Decisão inválida.';
end
$$;

-- ---------------------------------------------------------------------------
-- Implantação, verificação e padronização
-- ---------------------------------------------------------------------------

-- Ideia aprovada sem investimento: o responsável inicia a implantação.
create function public.iniciar_implantacao(p_ideia uuid, p_responsavel text, p_prazo int) returns void
language plpgsql security definer set search_path = public as $$
declare
  i ideias%rowtype;
  v_prazo date;
begin
  select * into i from ideias where id = p_ideia and empresa_id = minha_empresa() for update;
  if not found then raise exception 'Ideia não encontrada.'; end if;
  if not (tenho_papel('engenharia') or tenho_papel('comite') or sou_gestor()
          or (tenho_papel('encarregado') and i.setor_id = meu_setor())) then
    raise exception 'Sem permissão para iniciar a implantação.';
  end if;
  if i.status <> 'aprovada' then raise exception 'Esta ideia não está aguardando implantação.'; end if;
  if coalesce(p_responsavel, '') = '' then raise exception 'Escolha o responsável.'; end if;
  if coalesce(p_prazo, 0) not between 1 and 180 then raise exception 'Prazo entre 1 e 180 dias úteis.'; end if;

  v_prazo := somar_dias_uteis(i.empresa_id, hoje(), p_prazo);
  update ideias set responsavel_implantacao = p_responsavel, prazo_implantacao = p_prazo, implantacao_inicio = hoje() where id = p_ideia;
  perform _mudar_status(p_ideia, 'em_implantacao', format('Responsável: %s. Prazo de %s dias úteis.', p_responsavel, p_prazo), v_prazo, p_responsavel);
  perform _notificar(p_ideia, format('Sua ideia %s começou a ser implantada. Previsão de conclusão: %s.', i.protocolo, to_char(v_prazo, 'DD/MM')));
end
$$;

-- Verificação no posto (PDCA): ganho medido ou qualitativo (Fase 0, seção 10).
create function public.verificar_implantacao(p_ideia uuid, p_dados jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  i ideias%rowtype;
  d jsonb := coalesce(p_dados, '{}');
  v_ganho numeric;
  v_prazo date;
  v_nota text;
begin
  select * into i from ideias where id = p_ideia and empresa_id = minha_empresa() for update;
  if not found then raise exception 'Ideia não encontrada.'; end if;
  if not (tenho_papel('engenharia') or sou_gestor() or (tenho_papel('encarregado') and i.setor_id = meu_setor())) then
    raise exception 'Sem permissão para registrar a verificação.';
  end if;
  if i.status <> 'em_implantacao' then raise exception 'Esta ideia não está em implantação.'; end if;

  if d->>'tipo' = 'mensuravel' then
    v_ganho := nullif(d->>'ganho_anual', '')::numeric;
    if coalesce(trim(d->>'linha_base'), '') = '' or v_ganho is null or v_ganho <= 0 then
      raise exception 'Informe a linha de base (antes) e o ganho anual verificado.';
    end if;
    update ideias set linha_base = trim(d->>'linha_base'), ganho_verificado = v_ganho, ganho_qualitativo = nullif(trim(d->>'descricao'), ''),
                      verificado_em = now() where id = p_ideia;
    v_nota := format('Ganho verificado: %s por ano. Antes: %s.', brl(v_ganho), trim(d->>'linha_base'));
  elsif d->>'tipo' = 'qualitativo' then
    if coalesce(trim(d->>'descricao'), '') = '' then raise exception 'Descreva o que mudou, verificado no posto.'; end if;
    update ideias set ganho_qualitativo = trim(d->>'descricao'), verificado_em = now() where id = p_ideia;
    v_nota := 'Ganho qualitativo: ' || trim(d->>'descricao');
  else
    raise exception 'Escolha o tipo de ganho verificado.';
  end if;

  v_prazo := somar_dias_uteis(i.empresa_id, hoje(),
    coalesce((select (config #>> '{sla,padronizacao,prazo}')::int from empresas where id = i.empresa_id), 10));
  perform _mudar_status(p_ideia, 'padronizando', v_nota, v_prazo, 'Engenharia');
  perform _notificar(p_ideia, format('A implantação da ideia %s foi verificada! Falta registrar o novo padrão e orientar a equipe.', i.protocolo));
end
$$;

-- Padronização: procedimento registrado + equipe orientada. Só então a ideia fecha e pontua (Fase 0, seções 9 e 11).
create function public.padronizar_ideia(p_ideia uuid, p_dados jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  i ideias%rowtype;
  d jsonb := coalesce(p_dados, '{}');
  v_cfg jsonb;
  v_total int;
  v_cada int;
  v_sop text;
begin
  select * into i from ideias where id = p_ideia and empresa_id = minha_empresa() for update;
  if not found then raise exception 'Ideia não encontrada.'; end if;
  if not (tenho_papel('engenharia') or sou_gestor()) then raise exception 'Apenas a engenharia registra a padronização.'; end if;
  if i.status <> 'padronizando' then raise exception 'Esta ideia não está em padronização.'; end if;
  if coalesce(trim(d->>'sop'), '') = '' then raise exception 'Informe o código do procedimento.'; end if;
  if not coalesce((d->>'difusao')::boolean, false) then
    raise exception 'Confirme que a equipe do setor foi orientada. Sem isso a ideia não fecha.';
  end if;
  select config into v_cfg from empresas where id = i.empresa_id;

  v_sop := trim(d->>'sop') || case when coalesce(trim(d->>'revisao'), '') <> '' then ' rev. ' || trim(d->>'revisao') else '' end;
  update ideias set sop_codigo = trim(d->>'sop'), sop_revisao = nullif(trim(d->>'revisao'), ''),
                    difusao_confirmada_em = now(), padronizada_em = now()
    where id = p_ideia;
  perform _mudar_status(p_ideia, 'padronizada', format('Padrão %s registrado. Equipe orientada.', v_sop), null, 'Engenharia');

  -- Implantada 30 + nota × 10 + 50 se o ganho verificado passar de R$ 5.000/ano (valores configuráveis).
  v_total := coalesce((v_cfg #>> '{pontos,implantada}')::int, 30)
           + round(coalesce(i.nota, 3) * coalesce((v_cfg #>> '{pontos,bonus_por_ponto_nota}')::int, 10))::int
           + case when coalesce(i.ganho_verificado, 0) > coalesce((v_cfg #>> '{pontos,ganho_alto_limite}')::numeric, 5000)
                  then coalesce((v_cfg #>> '{pontos,ganho_alto}')::int, 50) else 0 end;
  v_cada := _pontuar(p_ideia, v_total, 'Ideia implantada e padronizada');

  perform _notificar(p_ideia, format('Sua ideia %s virou padrão (%s). %s+%s pontos. Obrigado!',
    i.protocolo, v_sop,
    case when i.ganho_verificado is not null then 'Ganho verificado: ' || brl(i.ganho_verificado) || ' por ano. ' else '' end,
    v_cada));
  insert into alertas_gestao (empresa_id, ideia_id, tipo, status, etapa_iniciada_em, texto)
  values (i.empresa_id, p_ideia, 'info', 'padronizada', now(), format('%s foi padronizada (%s).', i.protocolo, v_sop));
  return v_cada;
end
$$;

-- ---------------------------------------------------------------------------
-- Pontos, ranking e mural
-- ---------------------------------------------------------------------------

create function public.meus_pontos(p_ano int default null)
returns table (ano int, total int, nivel text, retidos int)
language sql stable security definer set search_path = public as $$
  with a as (select coalesce(p_ano, extract(year from hoje())::int) as ano)
  select a.ano,
    coalesce(sum(p.valor) filter (where not p.retido), 0)::int,
    nivel(coalesce(sum(p.valor) filter (where not p.retido), 0)::int),
    coalesce(sum(p.valor) filter (where p.retido), 0)::int
  from a
  left join pontos p on p.colaborador_id = meu_colaborador()
    and extract(year from p.criado_em at time zone 'America/Sao_Paulo') = a.ano
  group by a.ano
$$;

-- Ranking anual da empresa (pontos de ideias anônimas ficam de fora até serem reivindicados).
create function public.ranking(p_ano int default null, p_limite int default 10)
returns table (posicao int, nome text, setor text, pontos int, nivel text)
language sql stable security definer set search_path = public as $$
  with t as (
    select c.nome, s.nome as setor, sum(p.valor)::int as pontos
    from pontos p
    join colaboradores c on c.id = p.colaborador_id
    left join setores s on s.id = c.setor_id
    where p.empresa_id = minha_empresa() and not p.retido
      and extract(year from p.criado_em at time zone 'America/Sao_Paulo') = coalesce(p_ano, extract(year from hoje())::int)
    group by c.id, c.nome, s.nome
  )
  select (rank() over (order by t.pontos desc))::int, t.nome, t.setor, t.pontos, nivel(t.pontos)
  from t order by t.pontos desc, t.nome limit p_limite
$$;

-- Mural: ideias padronizadas, com o nome do autor só quando ele permitiu (Fase 0, seção 8).
create function public.mural(p_limite int default 20)
returns table (protocolo text, texto text, categoria public.categoria_ideia, setor text, maquina text, autor text,
               sop text, ganho_verificado numeric, ganho_qualitativo text, padronizada_em timestamptz)
language sql stable security definer set search_path = public as $$
  select i.protocolo, i.texto, i.categoria, s.nome, m.nome,
    case i.modo when 'identificado' then a.nome else 'Colaborador de ' || s.nome end,
    i.sop_codigo || coalesce(' rev. ' || i.sop_revisao, ''), i.ganho_verificado, i.ganho_qualitativo, i.padronizada_em
  from ideias i
  left join setores s on s.id = i.setor_id
  left join maquinas m on m.id = i.maquina_id
  left join colaboradores a on a.id = i.autor_id
  where i.empresa_id = minha_empresa() and i.status = 'padronizada'
  order by i.padronizada_em desc nulls last
  limit p_limite
$$;

-- ---------------------------------------------------------------------------
-- Indicadores do programa (Fase 0, seção 12)
-- ---------------------------------------------------------------------------

create function public.painel_indicadores(p_de date, p_ate date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_emp uuid := minha_empresa();
  r jsonb;
begin
  if not sou_gestao() then raise exception 'Sem permissão.'; end if;

  with periodo as (
    select * from ideias
    where empresa_id = v_emp and (criada_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate
  ),
  autores as (
    select distinct a.colaborador_id
    from periodo i
    cross join lateral (
      select i.autor_id as colaborador_id where i.autor_id is not null
      union select s.colaborador_id from ideia_autoria_selada s where s.ideia_id = i.id
      union select c.colaborador_id from ideia_coautores c where c.ideia_id = i.id
    ) a
  ),
  efetivo as (
    select s.id, s.nome, count(c.id) filter (where c.ativo) as pessoas
    from setores s left join colaboradores c on c.setor_id = s.id
    where s.empresa_id = v_emp and s.ativo
    group by s.id, s.nome
  ),
  saida_triagem as (
    select i.id, i.criada_em, min(e.criado_em) as saiu
    from periodo i join ideia_eventos e on e.ideia_id = i.id and e.de = 'em_triagem' and e.para not in ('aguardando_autor', 'em_espera')
    group by i.id, i.criada_em
  ),
  etapas as (
    select e.ideia_id, e.para, e.criado_em,
           lead(e.criado_em) over (partition by e.ideia_id order by e.criado_em, e.id) as fim,
           i.empresa_id, i.prazo_implantacao
    from ideia_eventos e join ideias i on i.id = e.ideia_id
    where i.empresa_id = v_emp and (e.criado_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate
  ),
  sla as (
    select count(*) as total,
           count(*) filter (where contar_dias_uteis(et.empresa_id, (et.criado_em at time zone 'America/Sao_Paulo')::date,
                                                    (et.fim at time zone 'America/Sao_Paulo')::date)
                                  <= case when et.para = 'em_implantacao' then coalesce(et.prazo_implantacao, sc.prazo) else sc.prazo end) as no_prazo
    from etapas et cross join lateral sla_config(et.empresa_id, et.para) sc
    where et.fim is not null and sc.prazo is not null
  )
  select jsonb_build_object(
    'recebidas', (select count(*) from periodo),
    'participantes', (select count(*) from autores),
    'efetivo', (select coalesce(sum(pessoas), 0) from efetivo),
    'lead_time_triagem', (select round(avg(contar_dias_uteis(v_emp, (criada_em at time zone 'America/Sao_Paulo')::date,
                                                              (saiu at time zone 'America/Sao_Paulo')::date)), 1) from saida_triagem),
    'sla_total', (select total from sla),
    'sla_no_prazo', (select no_prazo from sla),
    'decididas', (select count(*) from periodo i where exists (
        select 1 from ideia_eventos e where e.ideia_id = i.id and e.de = 'em_triagem' and e.para in ('aprovada', 'em_viabilidade', 'reprovada'))),
    'implantadas', (select count(*) from periodo where status in ('em_implantacao', 'padronizando', 'padronizada')),
    'padronizadas', (select count(*) from periodo where status = 'padronizada'),
    'ganho_verificado', (select coalesce(sum(ganho_verificado), 0) from periodo where status in ('padronizando', 'padronizada')),
    'ganho_estimado', (select coalesce(sum(ganho_estimado), 0) from periodo where status in ('em_implantacao', 'padronizando', 'padronizada')),
    'por_setor', (select coalesce(jsonb_agg(jsonb_build_object('setor', ef.nome, 'efetivo', ef.pessoas,
                    'ideias', (select count(*) from periodo p where p.setor_id = ef.id),
                    'participantes', (select count(*) from autores au join colaboradores c on c.id = au.colaborador_id where c.setor_id = ef.id))
                  order by ef.nome), '[]') from efetivo ef),
    'por_categoria', (select coalesce(jsonb_agg(jsonb_build_object('categoria', categoria, 'ideias', n) order by n desc), '[]')
                      from (select categoria, count(*) as n from periodo group by categoria) x),
    'por_maquina', (select coalesce(jsonb_agg(jsonb_build_object('maquina', m.nome, 'setor', s.nome, 'ideias', x.n) order by x.n desc), '[]')
                    from (select maquina_id, count(*) as n from periodo where maquina_id is not null group by maquina_id order by count(*) desc limit 10) x
                    join maquinas m on m.id = x.maquina_id left join setores s on s.id = m.setor_id),
    'por_status', (select coalesce(jsonb_object_agg(status, n), '{}') from (select status, count(*) as n from periodo group by status) x)
  ) into r;
  return r;
end
$$;

-- ---------------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------------

revoke execute on function public.decidir_viabilidade(uuid, text, jsonb) from public, anon;
revoke execute on function public.iniciar_implantacao(uuid, text, int) from public, anon;
revoke execute on function public.verificar_implantacao(uuid, jsonb) from public, anon;
revoke execute on function public.padronizar_ideia(uuid, jsonb) from public, anon;
revoke execute on function public.meus_pontos(int) from public, anon;
revoke execute on function public.ranking(int, int) from public, anon;
revoke execute on function public.mural(int) from public, anon;
revoke execute on function public.painel_indicadores(date, date) from public, anon;

grant execute on function public.decidir_viabilidade(uuid, text, jsonb) to authenticated;
grant execute on function public.iniciar_implantacao(uuid, text, int) to authenticated;
grant execute on function public.verificar_implantacao(uuid, jsonb) to authenticated;
grant execute on function public.padronizar_ideia(uuid, jsonb) to authenticated;
grant execute on function public.meus_pontos(int) to authenticated;
grant execute on function public.ranking(int, int) to authenticated;
grant execute on function public.mural(int) to authenticated;
grant execute on function public.painel_indicadores(date, date) to authenticated;
