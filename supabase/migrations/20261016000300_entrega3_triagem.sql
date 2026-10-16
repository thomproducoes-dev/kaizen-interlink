-- Entrega 3: triagem pelo comitê, pontuação, decisões, feedback automático, pedido de informação,
-- reenvio após reprovação, relógio de prazos (SLA) com alertas e escalonamento.
-- Fase 0: seções 2 (papéis), 3 (ciclo de vida), 4 (SLA), 5 (triagem), 6 (retaliação), 8 (feedback), 9 (pontos).

-- ---------------------------------------------------------------------------
-- Estrutura
-- ---------------------------------------------------------------------------

alter table public.ideias
  add column notas jsonb,                          -- {"impacto":1-5,"ganho":1-5,"facilidade":1-5,"abrangencia":1-5}
  add column nota numeric(2, 1),                   -- média ponderada pelos pesos da empresa
  add column custo_estimado numeric(12, 2),
  add column responsavel_implantacao text,
  add column prazo_implantacao int,
  add column revisao date,                         -- data de revisão quando em espera
  add column motivo_espera text,
  add column retorno public.status_ideia,          -- etapa para onde volta após espera / resposta do autor
  add column dias_restantes int,                   -- dias úteis que restavam quando o relógio pausou
  add column etapa_iniciada_em timestamptz not null default now();

-- Alertas para a gestão: prazo em alerta, prazo estourado (escalonamento) e avisos.
create table public.alertas_gestao (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  ideia_id uuid not null references public.ideias (id) on delete cascade,
  tipo text not null check (tipo in ('alerta', 'escalonamento', 'info')),
  status public.status_ideia not null,
  etapa_iniciada_em timestamptz not null,
  texto text not null,
  criado_em timestamptz not null default now(),
  email_enviado_em timestamptz
);
-- Um alerta e um escalonamento por etapa de cada ideia, no máximo.
create unique index alertas_gestao_unico on public.alertas_gestao (ideia_id, tipo, etapa_iniciada_em) where tipo <> 'info';
create index on public.alertas_gestao (empresa_id, criado_em desc);

-- Extrato de pontos (Fase 0, seção 9). Pontos de ideias anônimas ficam retidos até o autor reivindicar.
create table public.pontos (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  colaborador_id uuid not null references public.colaboradores (id),
  ideia_id uuid references public.ideias (id) on delete cascade,
  valor int not null,
  motivo text not null,
  retido boolean not null default false,
  criado_em timestamptz not null default now()
);
create index on public.pontos (colaborador_id);

-- ---------------------------------------------------------------------------
-- Funções de apoio
-- ---------------------------------------------------------------------------

-- Dias úteis entre duas datas (negativo quando a data final já passou).
create function public.contar_dias_uteis(p_empresa uuid, p_de date, p_ate date) returns int
language sql stable security definer set search_path = public as $$
  select case when p_ate >= p_de then 1 else -1 end * (
    select count(*)::int
    from generate_series(least(p_de, p_ate) + 1, greatest(p_de, p_ate), interval '1 day') g (d)
    where extract(isodow from g.d) < 6
      and not exists (select 1 from feriados f where f.empresa_id = p_empresa and f.data = g.d::date)
  )
$$;

-- Prazo e dia de alerta de cada etapa, lidos da configuração da empresa (Fase 0, seção 4).
create function public.sla_config(p_empresa uuid, p_status public.status_ideia, out prazo int, out alerta int)
language sql stable security definer set search_path = public as $$
  select (e.config #>> array['sla', m.k, 'prazo'])::int, (e.config #>> array['sla', m.k, 'alerta'])::int
  from empresas e
  cross join (select case p_status
      when 'em_triagem' then 'triagem'
      when 'aguardando_autor' then 'aguardando_autor'
      when 'em_viabilidade' then 'viabilidade'
      when 'aprovada' then 'inicio_implantacao'
      when 'em_implantacao' then 'implantacao'
      when 'padronizando' then 'padronizacao'
    end as k) m
  where e.id = p_empresa and m.k is not null
$$;

create function public.rotulo_status(p public.status_ideia) returns text
language sql immutable as $$
  select case p
    when 'em_triagem' then 'triagem' when 'aguardando_autor' then 'resposta do autor'
    when 'em_espera' then 'espera' when 'aprovada' then 'início da implantação'
    when 'em_viabilidade' then 'viabilidade econômica' when 'reprovada' then 'reprovada'
    when 'em_implantacao' then 'implantação' when 'padronizando' then 'padronização'
    when 'padronizada' then 'padronizada' end
$$;

create function public.meus_papeis() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(cp.papel::text order by cp.papel), '{}')
  from colaboradores c join colaborador_papeis cp on cp.colaborador_id = c.id
  where c.auth_user_id = auth.uid() and c.ativo
$$;

-- Quem trabalha na área da gestão (comitê, engenharia, encarregado, gestor, RH).
create function public.sou_gestao() returns boolean
language sql stable security definer set search_path = public as $$
  select tenho_papel('comite') or tenho_papel('engenharia') or tenho_papel('encarregado') or tenho_papel('rh') or sou_gestor()
$$;

-- Autor (inclusive o selado das anônimas) e coautores.
create function public._autores(p_ideia uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select autor_id from ideias where id = p_ideia and autor_id is not null
  union select colaborador_id from ideia_autoria_selada where ideia_id = p_ideia
  union select colaborador_id from ideia_coautores where ideia_id = p_ideia
$$;

create function public._sou_autor_principal(p_ideia uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from ideias where id = p_ideia and autor_id = meu_colaborador())
      or exists (select 1 from ideia_autoria_selada where ideia_id = p_ideia and colaborador_id = meu_colaborador())
$$;

create function public._notificar(p_ideia uuid, p_texto text) returns void
language sql security definer set search_path = public as $$
  insert into notificacoes (empresa_id, colaborador_id, ideia_id, texto)
  select i.empresa_id, a, p_ideia, p_texto from ideias i cross join _autores(p_ideia) a where i.id = p_ideia
$$;

-- Distribui pontos entre autor e coautores (divididos, com bônus de equipe). Devolve os pontos de cada um.
create function public._pontuar(p_ideia uuid, p_total int, p_motivo text) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid;
  v_modo modo_identidade;
  v_n int;
  v_bonus numeric;
  v_cada int;
begin
  select empresa_id, modo into v_emp, v_modo from ideias where id = p_ideia;
  select count(*) into v_n from _autores(p_ideia);
  select coalesce((config #>> '{pontos,bonus_equipe}')::numeric, 0.2) into v_bonus from empresas where id = v_emp;
  v_cada := case when v_n > 1 then round(p_total::numeric / v_n * (1 + v_bonus)) else p_total end;
  insert into pontos (empresa_id, colaborador_id, ideia_id, valor, motivo, retido)
  select v_emp, a, p_ideia, v_cada, p_motivo, v_modo = 'anonimo' from _autores(p_ideia) a;
  return v_cada;
end
$$;

-- Toda mudança de status passa por aqui: atualiza a etapa, o prazo e grava o histórico.
create function public._mudar_status(p_ideia uuid, p_para public.status_ideia, p_nota text, p_prazo date, p_por text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_de status_ideia;
begin
  select status into v_de from ideias where id = p_ideia for update;
  update ideias
    set status = p_para, etapa_inicio = hoje(), etapa_iniciada_em = now(), prazo_atual = p_prazo, atualizada_em = now()
    where id = p_ideia;
  insert into ideia_eventos (ideia_id, de, para, por_colaborador, por_texto, nota)
  values (p_ideia, v_de, p_para, meu_colaborador(), p_por, p_nota);
end
$$;

-- Confere anexos de resposta ou reenvio (mesmas regras do envio original).
create function public._registrar_midias(p_ideia uuid, p_versao int, p_midias jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid;
  m jsonb;
  v_audios int := 0;
begin
  select empresa_id into v_emp from ideias where id = p_ideia;
  for m in select * from jsonb_array_elements(coalesce(p_midias, '[]')) loop
    if (m->>'caminho') not like v_emp::text || '/' || p_ideia::text || '/%' then
      raise exception 'Anexo fora da pasta da ideia.';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'ideias' and o.name = m->>'caminho') then
      raise exception 'Anexo não encontrado. Tente enviar de novo.';
    end if;
    if m->>'tipo' = 'audio' then v_audios := v_audios + 1; end if;
    insert into ideia_midias (ideia_id, versao, tipo, caminho, duracao_s, tamanho_bytes)
    values (p_ideia, p_versao, (m->>'tipo')::tipo_midia, m->>'caminho', (m->>'duracao_s')::int, (m->>'tamanho')::bigint)
    on conflict (caminho) do nothing;
  end loop;
  return v_audios;
end
$$;

-- ---------------------------------------------------------------------------
-- RLS das tabelas novas
-- ---------------------------------------------------------------------------

alter table public.alertas_gestao enable row level security;
alter table public.pontos enable row level security;

create policy "gestão vê alertas da empresa" on public.alertas_gestao
  for select to authenticated
  using (
    empresa_id = public.minha_empresa()
    and (
      public.tenho_papel('comite') or public.tenho_papel('engenharia') or public.sou_gestor()
      or (public.tenho_papel('encarregado') and exists (select 1 from public.ideias i where i.id = ideia_id and i.setor_id = public.meu_setor()))
    )
  );

create policy "ver os próprios pontos ou gestor vê todos" on public.pontos
  for select to authenticated
  using (colaborador_id = public.meu_colaborador() or (empresa_id = public.minha_empresa() and public.sou_gestor()));

-- Anexos de resposta ao comitê ou de reenvio: só o autor, só nessas duas situações.
create policy "enviar anexos de resposta ou reenvio" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'ideias'
    and (storage.foldername(name))[1] = public.minha_empresa()::text
    and exists (
      select 1 from public.ideias i
      where i.id::text = (storage.foldername(name))[2]
        and i.status in ('aguardando_autor', 'reprovada')
        and (i.autor_id = public.meu_colaborador()
             or exists (select 1 from public.ideia_autoria_selada s where s.ideia_id = i.id and s.colaborador_id = public.meu_colaborador()))
    )
  );

-- ---------------------------------------------------------------------------
-- Fila de ideias da gestão (com prazo em dias úteis e autor mascarado conforme o modo)
-- ---------------------------------------------------------------------------

create function public.fila_ideias(p_id uuid default null, p_empresa uuid default null)
returns table (
  id uuid, protocolo text, status public.status_ideia, categoria public.categoria_ideia, setor text, maquina text,
  modo public.modo_identidade, autor text, texto text, tem_audio boolean, anexos int, versao int, nota numeric,
  criada_em timestamptz, prazo_atual date, dias_restantes int, situacao text, responsavel text
)
language sql stable security definer set search_path = public as $$
  with ctx as (
    select case when auth.role() = 'service_role' then p_empresa else minha_empresa() end as emp,
           auth.role() = 'service_role' or tenho_papel('comite') or tenho_papel('engenharia') or tenho_papel('rh') or sou_gestor() as amplo,
           tenho_papel('encarregado') as enc,
           meu_setor() as meu_setor
  ),
  base as (
    select i.*, s.nome as setor_nome, m.nome as maquina_nome, a.nome as autor_nome, sc.prazo as cfg_prazo, sc.alerta as cfg_alerta,
           case when sc.prazo is not null and i.prazo_atual is not null then contar_dias_uteis(i.empresa_id, hoje(), i.prazo_atual) end as rest
    from ideias i
    cross join ctx
    left join setores s on s.id = i.setor_id
    left join maquinas m on m.id = i.maquina_id
    left join colaboradores a on a.id = i.autor_id
    left join lateral sla_config(i.empresa_id, i.status) sc on true
    where i.empresa_id = ctx.emp
      and (p_id is null or i.id = p_id)
      and (ctx.amplo or (ctx.enc and i.setor_id = ctx.meu_setor))
  )
  select b.id, b.protocolo, b.status, b.categoria, b.setor_nome, b.maquina_nome, b.modo,
    case b.modo when 'identificado' then b.autor_nome when 'reservado' then 'Colaborador de ' || b.setor_nome else 'Anônimo' end,
    b.texto, b.tem_audio,
    (select count(*)::int from ideia_midias x where x.ideia_id = b.id and x.tipo <> 'audio'),
    b.versao, b.nota, b.criada_em, b.prazo_atual, b.rest,
    case
      when b.status in ('reprovada', 'padronizada') then 'encerrada'
      when b.status = 'em_espera' then 'pausada'
      when b.rest is null then 'ok'
      when b.rest < 0 then 'estourado'
      when b.rest = 0 then 'vence_hoje'
      when b.status = 'em_implantacao'
        and coalesce(b.prazo_implantacao, b.cfg_prazo) - b.rest >= coalesce(b.prazo_implantacao, b.cfg_prazo) - 5 then 'alerta'
      when b.status <> 'em_implantacao' and b.cfg_prazo - b.rest >= b.cfg_alerta then 'alerta'
      else 'ok'
    end,
    case b.status
      when 'em_triagem' then 'Comitê' when 'aguardando_autor' then 'Autor' when 'em_viabilidade' then 'Engenharia'
      when 'aprovada' then coalesce(b.responsavel_implantacao, 'Encarregado do setor')
      when 'em_implantacao' then coalesce(b.responsavel_implantacao, 'Engenharia / encarregado')
      when 'padronizando' then 'Engenharia' when 'em_espera' then 'Comitê'
    end
  from base b
  order by
    case when b.status in ('reprovada', 'padronizada') then 2 when b.status = 'em_espera' then 1 else 0 end,
    b.rest nulls last, b.criada_em
$$;

-- ---------------------------------------------------------------------------
-- Decisão de triagem (Fase 0, seções 5 e 6)
-- ---------------------------------------------------------------------------

create function public.decidir_triagem(
  p_ideia uuid,
  p_decisao text,          -- aprovar | engenharia | informacao | espera | reprovar
  p_notas jsonb,           -- {"impacto","ganho","facilidade","abrangencia"}: 1 a 5
  p_avaliadores text[],    -- "Encarregado do setor", "Gerente de produção", "Engenharia de produto"
  p_dados jsonb            -- campos de cada decisão
) returns text
language plpgsql security definer set search_path = public as $$
declare
  i ideias%rowtype;
  v_cfg jsonb;
  d jsonb := coalesce(p_dados, '{}');
  v_nota numeric;
  v_nota_txt text;
  v_prazo date;
  v_custo numeric;
  v_rev date;
  v_txt text;
  k text;
begin
  if not (tenho_papel('comite') or sou_gestor()) then
    raise exception 'Apenas o comitê decide a triagem.';
  end if;
  select * into i from ideias where id = p_ideia and empresa_id = minha_empresa() for update;
  if not found then raise exception 'Ideia não encontrada.'; end if;
  if i.status <> 'em_triagem' then raise exception 'Esta ideia não está mais em triagem.'; end if;
  if meu_colaborador() in (select _autores(p_ideia)) then
    raise exception 'Você é autor ou coautor desta ideia e não pode avaliá-la.';
  end if;
  if coalesce(array_length(p_avaliadores, 1), 0) = 0 then
    raise exception 'Marque os avaliadores presentes.';
  end if;
  select config into v_cfg from empresas where id = i.empresa_id;

  if p_decisao in ('aprovar', 'engenharia') then
    foreach k in array array['impacto', 'ganho', 'facilidade', 'abrangencia'] loop
      if coalesce((p_notas->>k)::int, 0) not between 1 and 5 then
        raise exception 'Dê nota de 1 a 5 nos quatro critérios.';
      end if;
    end loop;
    v_nota := round(
      (p_notas->>'impacto')::numeric * coalesce((v_cfg #>> '{pesos,impacto}')::numeric, 0.3)
      + (p_notas->>'ganho')::numeric * coalesce((v_cfg #>> '{pesos,ganho}')::numeric, 0.3)
      + (p_notas->>'facilidade')::numeric * coalesce((v_cfg #>> '{pesos,facilidade}')::numeric, 0.2)
      + (p_notas->>'abrangencia')::numeric * coalesce((v_cfg #>> '{pesos,abrangencia}')::numeric, 0.2), 1);
    v_nota_txt := replace(v_nota::text, '.', ',');
    update ideias set notas = p_notas, nota = v_nota where id = p_ideia;
  end if;

  if p_decisao = 'aprovar' then
    v_custo := coalesce(nullif(d->>'custo', '')::numeric, 0);
    if v_custo > coalesce((v_cfg->>'teto_implantacao_direta')::numeric, 1000)
       or coalesce((d->>'muda_layout')::boolean, false)
       or coalesce((d->>'parada_longa')::boolean, false) then
      raise exception 'Acima do teto do setor (R$ %), com mudança de layout ou parada longa: encaminhe à engenharia.',
        coalesce(v_cfg->>'teto_implantacao_direta', '1000');
    end if;
    if coalesce(d->>'responsavel', '') = '' then raise exception 'Escolha o responsável pela implantação.'; end if;
    v_prazo := somar_dias_uteis(i.empresa_id, hoje(), coalesce((v_cfg #>> '{sla,inicio_implantacao,prazo}')::int, 10));
    update ideias set custo_estimado = v_custo, responsavel_implantacao = d->>'responsavel' where id = p_ideia;
    perform _mudar_status(p_ideia, 'aprovada',
      format('Nota %s. Sem investimento (R$ %s). Avaliadores: %s.', v_nota_txt, v_custo, array_to_string(p_avaliadores, ', ')),
      v_prazo, 'Comitê');
    if not exists (select 1 from pontos where ideia_id = p_ideia and motivo = 'Ideia aceita na triagem') then
      perform _pontuar(p_ideia, coalesce((v_cfg #>> '{pontos,aceita_triagem}')::int, 10), 'Ideia aceita na triagem');
    end if;
    perform _notificar(p_ideia, format('Sua ideia %s foi aprovada! Responsável: %s. Início previsto até %s.',
      i.protocolo, lower(d->>'responsavel'), to_char(v_prazo, 'DD/MM')));
    v_txt := 'Ideia aprovada. O autor foi avisado.';

  elsif p_decisao = 'engenharia' then
    if coalesce(d->>'motivo', '') = '' then raise exception 'Diga por que a ideia vai à engenharia.'; end if;
    v_prazo := somar_dias_uteis(i.empresa_id, hoje(), coalesce((v_cfg #>> '{sla,viabilidade,prazo}')::int, 15));
    update ideias set custo_estimado = nullif(d->>'custo', '')::numeric where id = p_ideia;
    perform _mudar_status(p_ideia, 'em_viabilidade',
      format('Nota %s. %s. Avaliadores: %s.', v_nota_txt, d->>'motivo', array_to_string(p_avaliadores, ', ')),
      v_prazo, 'Comitê');
    if not exists (select 1 from pontos where ideia_id = p_ideia and motivo = 'Ideia aceita na triagem') then
      perform _pontuar(p_ideia, coalesce((v_cfg #>> '{pontos,aceita_triagem}')::int, 10), 'Ideia aceita na triagem');
    end if;
    perform _notificar(p_ideia, format('Sua ideia %s precisa de análise de custo pela engenharia. Resposta até %s.',
      i.protocolo, to_char(v_prazo, 'DD/MM')));
    v_txt := 'Ideia encaminhada à engenharia. O autor foi avisado.';

  elsif p_decisao = 'informacao' then
    if coalesce(trim(d->>'pergunta'), '') = '' then raise exception 'Escreva a pergunta para o autor.'; end if;
    update ideias
      set retorno = 'em_triagem', dias_restantes = greatest(contar_dias_uteis(i.empresa_id, hoje(), i.prazo_atual), 1)
      where id = p_ideia;
    v_prazo := somar_dias_uteis(i.empresa_id, hoje(), coalesce((v_cfg #>> '{sla,aguardando_autor,prazo}')::int, 5));
    perform _mudar_status(p_ideia, 'aguardando_autor', 'Pergunta: ' || trim(d->>'pergunta'), v_prazo, 'Comitê');
    perform _notificar(p_ideia, format('O comitê quer entender melhor sua ideia %s: "%s" Responda pelo totem até %s, por áudio ou texto.',
      i.protocolo, trim(d->>'pergunta'), to_char(v_prazo, 'DD/MM')));
    v_txt := 'Pergunta enviada. O prazo da triagem fica pausado até o autor responder.';

  elsif p_decisao = 'espera' then
    v_rev := nullif(d->>'revisao', '')::date;
    if coalesce(trim(d->>'motivo'), '') = '' or v_rev is null then raise exception 'Informe o motivo e a data de revisão.'; end if;
    if v_rev <= hoje() or v_rev > hoje() + coalesce((v_cfg #>> '{sla,espera_max_dias}')::int, 90) then
      raise exception 'A data de revisão deve ser futura e em no máximo % dias.', coalesce((v_cfg #>> '{sla,espera_max_dias}')::int, 90);
    end if;
    update ideias
      set retorno = 'em_triagem', revisao = v_rev, motivo_espera = trim(d->>'motivo'),
          dias_restantes = greatest(contar_dias_uteis(i.empresa_id, hoje(), i.prazo_atual), 1)
      where id = p_ideia;
    perform _mudar_status(p_ideia, 'em_espera', format('Até %s: %s', to_char(v_rev, 'DD/MM'), trim(d->>'motivo')), v_rev, 'Comitê');
    perform _notificar(p_ideia, format('Sua ideia %s ficou para %s porque: %s. Ela não foi descartada.',
      i.protocolo, to_char(v_rev, 'DD/MM'), lower(trim(d->>'motivo'))));
    v_txt := 'Ideia colocada em espera. O autor foi avisado.';

  elsif p_decisao = 'reprovar' then
    if coalesce(d->>'motivo', '') = '' or coalesce(trim(d->>'frase'), '') = '' or coalesce(trim(d->>'aproveita'), '') = '' then
      raise exception 'Preencha motivo, explicação e o que se aproveita. A reprovação sempre explica e sugere um próximo passo.';
    end if;
    -- Regra contra retaliação (Fase 0, seção 6).
    if not (p_avaliadores && array['Gerente de produção', 'Engenharia de produto']) then
      raise exception 'A reprovação exige um avaliador de fora da linha do autor (gerente de produção ou engenharia).';
    end if;
    perform _mudar_status(p_ideia, 'reprovada',
      format('%s. %s Avaliadores: %s.', d->>'motivo', trim(d->>'frase'), array_to_string(p_avaliadores, ', ')), null, 'Comitê');
    if not exists (select 1 from pontos where ideia_id = p_ideia and motivo = 'Participação') then
      perform _pontuar(p_ideia, coalesce((v_cfg #>> '{pontos,reprovada}')::int, 5), 'Participação');
    end if;
    perform _notificar(p_ideia, format('Obrigado pela ideia %s. Motivo: %s. %s O que aproveitamos: %s Quer ajustar e reenviar? Abra a ideia em "Minhas ideias".',
      i.protocolo, lower(d->>'motivo'), trim(d->>'frase'), trim(d->>'aproveita')));
    v_txt := 'Ideia reprovada com justificativa. O autor foi avisado e pode reenviar.';

  else
    raise exception 'Decisão inválida.';
  end if;

  return v_txt;
end
$$;

-- Retomar antes da data de revisão.
create function public.retomar_ideia(p_ideia uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  i ideias%rowtype;
begin
  if not (tenho_papel('comite') or tenho_papel('engenharia') or sou_gestor()) then
    raise exception 'Sem permissão para retomar.';
  end if;
  select * into i from ideias where id = p_ideia and empresa_id = minha_empresa() for update;
  if not found or i.status <> 'em_espera' then raise exception 'Esta ideia não está em espera.'; end if;
  perform _mudar_status(p_ideia, coalesce(i.retorno, 'em_triagem'), 'Retomada antes da data de revisão',
    somar_dias_uteis(i.empresa_id, hoje(), greatest(coalesce(i.dias_restantes, 1), 1)), 'Comitê');
  update ideias set revisao = null, motivo_espera = null, dias_restantes = null where id = p_ideia;
  perform _notificar(p_ideia, format('Sua ideia %s voltou para análise.', i.protocolo));
end
$$;

-- ---------------------------------------------------------------------------
-- Ações do autor
-- ---------------------------------------------------------------------------

-- Resposta ao pedido de informação: o relógio da triagem volta de onde parou.
create function public.responder_pedido(p_ideia uuid, p_texto text, p_midias jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  i ideias%rowtype;
  v_texto text := nullif(trim(coalesce(p_texto, '')), '');
  v_audios int;
begin
  select * into i from ideias where id = p_ideia for update;
  if not found or not _sou_autor_principal(p_ideia) then raise exception 'Só o autor pode responder.'; end if;
  if i.status <> 'aguardando_autor' then raise exception 'Esta ideia não está aguardando resposta.'; end if;
  if v_texto is not null and char_length(v_texto) > 500 then raise exception 'Resposta com no máximo 500 caracteres.'; end if;
  v_audios := _registrar_midias(p_ideia, i.versao, p_midias);
  if v_texto is null and v_audios = 0 then raise exception 'Grave um áudio ou escreva sua resposta.'; end if;

  perform _mudar_status(p_ideia, coalesce(i.retorno, 'em_triagem'),
    'Resposta do autor: ' || coalesce(v_texto, '(em áudio)') || case when v_texto is not null and v_audios > 0 then ' (+ áudio)' else '' end,
    somar_dias_uteis(i.empresa_id, hoje(), greatest(coalesce(i.dias_restantes, 1), 1)), 'Autor');
  update ideias set dias_restantes = null where id = p_ideia;
  insert into alertas_gestao (empresa_id, ideia_id, tipo, status, etapa_iniciada_em, texto)
  values (i.empresa_id, p_ideia, 'info', 'em_triagem', now(), format('%s: o autor respondeu ao pedido de informação.', i.protocolo));
end
$$;

-- Reenvio após reprovação: nova versão, mesmo protocolo, volta para a triagem.
create function public.reenviar_ideia(p_ideia uuid, p_texto text, p_midias jsonb) returns date
language plpgsql security definer set search_path = public as $$
declare
  i ideias%rowtype;
  v_texto text := nullif(trim(coalesce(p_texto, '')), '');
  v_audios int;
  v_prazo date;
begin
  select * into i from ideias where id = p_ideia for update;
  if not found or not _sou_autor_principal(p_ideia) then raise exception 'Só o autor pode reenviar.'; end if;
  if i.status <> 'reprovada' then raise exception 'Só ideias reprovadas podem ser reenviadas.'; end if;
  if v_texto is not null and char_length(v_texto) > 280 then raise exception 'O texto deve ter no máximo 280 caracteres.'; end if;
  v_audios := _registrar_midias(p_ideia, i.versao + 1, p_midias);
  if v_texto is null and v_audios = 0 then raise exception 'Grave um áudio ou escreva a nova versão da ideia.'; end if;

  update ideias set versao = versao + 1, texto = coalesce(v_texto, texto), tem_audio = tem_audio or v_audios > 0,
                    notas = null, nota = null
    where id = p_ideia;
  v_prazo := somar_dias_uteis(i.empresa_id, hoje(),
    coalesce((select (config #>> '{sla,triagem,prazo}')::int from empresas where id = i.empresa_id), 5));
  perform _mudar_status(p_ideia, 'em_triagem', format('Reenviada como versão %s.', i.versao + 1), v_prazo, 'Autor');
  perform _notificar(p_ideia, format('Recebemos a nova versão da ideia %s. O comitê responde até %s.', i.protocolo, to_char(v_prazo, 'DD/MM')));
  return v_prazo;
end
$$;

-- ---------------------------------------------------------------------------
-- Relógio de prazos: roda a cada hora (agendado no Supabase, chamado pelo servidor)
-- ---------------------------------------------------------------------------

create function public.verificar_prazos() returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_total int;
  v_alerta int;
  v_rest int;
  v_rev date;
  v_n int := 0;
  v_ins int;
begin
  -- 1. Ideias em espera cuja data de revisão chegou voltam para a etapa de origem.
  for r in select * from ideias where status = 'em_espera' and revisao <= hoje() loop
    perform _mudar_status(r.id, coalesce(r.retorno, 'em_triagem'), 'Data de revisão atingida',
      somar_dias_uteis(r.empresa_id, hoje(), greatest(coalesce(r.dias_restantes, 1), 1)), 'Sistema');
    update ideias set revisao = null, motivo_espera = null, dias_restantes = null where id = r.id;
    perform _notificar(r.id, format('Sua ideia %s voltou para análise. Avisaremos a próxima decisão.', r.protocolo));
    insert into alertas_gestao (empresa_id, ideia_id, tipo, status, etapa_iniciada_em, texto)
    values (r.empresa_id, r.id, 'info', coalesce(r.retorno, 'em_triagem'), now(),
            format('%s saiu de "Em espera" na data de revisão e voltou para %s.', r.protocolo, rotulo_status(coalesce(r.retorno, 'em_triagem'))));
    v_n := v_n + 1;
  end loop;

  -- 2. Alertas e estouros de prazo.
  for r in
    select i.*, sc.prazo as cfg_prazo, sc.alerta as cfg_alerta
    from ideias i cross join lateral sla_config(i.empresa_id, i.status) sc
    where sc.prazo is not null and i.prazo_atual is not null
  loop
    v_total := case when r.status = 'em_implantacao' then coalesce(r.prazo_implantacao, r.cfg_prazo) else r.cfg_prazo end;
    v_alerta := case when r.status = 'em_implantacao' then v_total - 5 else r.cfg_alerta end;
    v_rest := contar_dias_uteis(r.empresa_id, hoje(), r.prazo_atual);

    if v_rest < 0 then
      if r.status = 'aguardando_autor' then
        -- Autor não respondeu: vai para espera, nunca é reprovada (Fase 0, seção 4).
        v_rev := somar_dias_uteis(r.empresa_id, hoje(), 20);
        update ideias set revisao = v_rev, motivo_espera = 'Sem resposta do autor no prazo' where id = r.id;
        perform _mudar_status(r.id, 'em_espera', 'Sem resposta do autor no prazo. A ideia não foi reprovada.', v_rev, 'Sistema');
        perform _notificar(r.id, format('Sua ideia %s ficou em espera até %s porque não recebemos sua resposta. Ela não foi descartada: procure o comitê se quiser retomar antes.',
          r.protocolo, to_char(v_rev, 'DD/MM')));
        insert into alertas_gestao (empresa_id, ideia_id, tipo, status, etapa_iniciada_em, texto)
        values (r.empresa_id, r.id, 'info', 'em_espera', now(),
                format('%s: o autor não respondeu no prazo. A ideia foi para "Em espera" até %s.', r.protocolo, to_char(v_rev, 'DD/MM')));
        v_n := v_n + 1;
      else
        insert into alertas_gestao (empresa_id, ideia_id, tipo, status, etapa_iniciada_em, texto)
        values (r.empresa_id, r.id, 'escalonamento', r.status, r.etapa_iniciada_em,
                format('%s estourou o prazo de %s, que venceu em %s.', r.protocolo, rotulo_status(r.status), to_char(r.prazo_atual, 'DD/MM')))
        on conflict do nothing;
        get diagnostics v_ins = row_count;
        if v_ins > 0 then
          v_n := v_n + 1;
          if r.status = 'em_triagem' then
            perform _notificar(r.id, format('Sua ideia %s está sendo priorizada pelo comitê. Ela não foi esquecida.', r.protocolo));
          end if;
        end if;
      end if;
    elsif v_total - v_rest >= v_alerta then
      insert into alertas_gestao (empresa_id, ideia_id, tipo, status, etapa_iniciada_em, texto)
      values (r.empresa_id, r.id, 'alerta', r.status, r.etapa_iniciada_em,
              format('%s entrou em alerta na etapa de %s: %s.', r.protocolo, rotulo_status(r.status),
                     case when v_rest = 0 then 'vence hoje' else format('faltam %s dia(s) útil(eis)', v_rest) end))
      on conflict do nothing;
      get diagnostics v_ins = row_count;
      v_n := v_n + v_ins;
    end if;
  end loop;

  return v_n;
end
$$;

-- ---------------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------------

-- Funções internas: só chamadas por outras funções do sistema.
revoke execute on function public._autores(uuid) from public, anon, authenticated;
revoke execute on function public._sou_autor_principal(uuid) from public, anon, authenticated;
revoke execute on function public._notificar(uuid, text) from public, anon, authenticated;
revoke execute on function public._pontuar(uuid, int, text) from public, anon, authenticated;
revoke execute on function public._mudar_status(uuid, public.status_ideia, text, date, text) from public, anon, authenticated;
revoke execute on function public._registrar_midias(uuid, int, jsonb) from public, anon, authenticated;
revoke execute on function public.verificar_prazos() from public, anon, authenticated;
grant execute on function public.verificar_prazos() to service_role;

revoke execute on function public.contar_dias_uteis(uuid, date, date) from public, anon;
revoke execute on function public.sla_config(uuid, public.status_ideia) from public, anon;
revoke execute on function public.meus_papeis() from public, anon;
revoke execute on function public.sou_gestao() from public, anon;
revoke execute on function public.fila_ideias(uuid, uuid) from public, anon;
revoke execute on function public.decidir_triagem(uuid, text, jsonb, text[], jsonb) from public, anon;
revoke execute on function public.retomar_ideia(uuid) from public, anon;
revoke execute on function public.responder_pedido(uuid, text, jsonb) from public, anon;
revoke execute on function public.reenviar_ideia(uuid, text, jsonb) from public, anon;

grant execute on function public.contar_dias_uteis(uuid, date, date) to authenticated;
grant execute on function public.sla_config(uuid, public.status_ideia) to authenticated;
grant execute on function public.meus_papeis() to authenticated;
grant execute on function public.sou_gestao() to authenticated;
grant execute on function public.fila_ideias(uuid, uuid) to authenticated, service_role;
grant execute on function public.decidir_triagem(uuid, text, jsonb, text[], jsonb) to authenticated;
grant execute on function public.retomar_ideia(uuid) to authenticated;
grant execute on function public.responder_pedido(uuid, text, jsonb) to authenticated;
grant execute on function public.reenviar_ideia(uuid, text, jsonb) to authenticated;
