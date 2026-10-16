-- Entrega 2: envio de ideias (anexos, áudio, protocolo), "Minhas ideias", anonimato selado,
-- notificações e o armazenamento privado dos arquivos.
-- Fase 0: seções 3 (ciclo de vida), 4 (SLA), 6 (identidade), 7 (captura), 8 (feedback), 13 (trilha de auditoria).

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------

create type public.status_ideia as enum (
  'em_triagem', 'aguardando_autor', 'em_espera', 'aprovada', 'em_viabilidade',
  'reprovada', 'em_implantacao', 'padronizando', 'padronizada'
);

create type public.modo_identidade as enum ('identificado', 'reservado', 'anonimo');

create type public.categoria_ideia as enum (
  'seguranca', 'qualidade', 'produtividade', 'material', 'organizacao', 'ergonomia', 'ambiente', 'outros'
);

create type public.tipo_midia as enum ('foto', 'video', 'audio');

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table public.protocolo_sequencias (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  ano int not null,
  ultimo int not null default 0,
  primary key (empresa_id, ano)
);

create table public.ideias (
  id uuid primary key,  -- gerado no aparelho: permite reenviar sem duplicar quando a rede cai
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  protocolo text not null unique,
  -- Vazio quando a ideia é anônima: o vínculo fica em ideia_autoria_selada.
  autor_id uuid references public.colaboradores (id),
  modo public.modo_identidade not null,
  setor_id uuid not null,
  maquina_id uuid references public.maquinas (id),
  categoria public.categoria_ideia not null,
  texto text check (texto is null or char_length(texto) <= 280),
  tem_audio boolean not null default false,
  status public.status_ideia not null default 'em_triagem',
  versao int not null default 1,
  canal text not null check (canal in ('totem', 'celular')),
  etapa_inicio date not null,
  prazo_atual date,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),
  foreign key (setor_id, empresa_id) references public.setores (id, empresa_id)
);

-- Autoria de ideias anônimas. Só o próprio autor e o RH leem esta tabela (Fase 0, seção 6).
create table public.ideia_autoria_selada (
  ideia_id uuid primary key references public.ideias (id) on delete cascade,
  colaborador_id uuid not null references public.colaboradores (id)
);

create table public.ideia_coautores (
  ideia_id uuid not null references public.ideias (id) on delete cascade,
  colaborador_id uuid not null references public.colaboradores (id),
  primary key (ideia_id, colaborador_id)
);

create table public.ideia_midias (
  id uuid primary key default gen_random_uuid(),
  ideia_id uuid not null references public.ideias (id) on delete cascade,
  versao int not null default 1,
  tipo public.tipo_midia not null,
  caminho text not null unique,  -- caminho no bucket "ideias": <empresa>/<ideia>/<arquivo>
  duracao_s int,
  tamanho_bytes bigint,
  criado_em timestamptz not null default now()
);

-- Trilha de auditoria: toda mudança de status fica registrada e não é apagada.
create table public.ideia_eventos (
  id bigint generated always as identity primary key,
  ideia_id uuid not null references public.ideias (id) on delete cascade,
  de public.status_ideia,
  para public.status_ideia not null,
  por_colaborador uuid references public.colaboradores (id),
  por_texto text not null,
  nota text,
  criado_em timestamptz not null default now()
);

create table public.notificacoes (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  colaborador_id uuid not null references public.colaboradores (id) on delete cascade,
  ideia_id uuid references public.ideias (id) on delete cascade,
  texto text not null,
  lida_em timestamptz,
  criada_em timestamptz not null default now()
);

create index on public.ideias (empresa_id, status);
create index on public.ideias (autor_id);
create index on public.ideia_coautores (colaborador_id);
create index on public.ideia_eventos (ideia_id);
create index on public.ideia_midias (ideia_id);
create index on public.notificacoes (colaborador_id, lida_em);

-- ---------------------------------------------------------------------------
-- Funções de apoio
-- ---------------------------------------------------------------------------

create function public.meu_colaborador() returns uuid
language sql stable security definer set search_path = public as $$
  select id from colaboradores where auth_user_id = auth.uid() and ativo
$$;

create function public.meu_setor() returns uuid
language sql stable security definer set search_path = public as $$
  select setor_id from colaboradores where auth_user_id = auth.uid() and ativo
$$;

-- Data de hoje no fuso da fábrica.
create function public.hoje() returns date
language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

-- Soma dias úteis: pula sábados, domingos e os feriados cadastrados da empresa (Fase 0, seção 4).
create function public.somar_dias_uteis(p_empresa uuid, p_inicio date, p_dias int) returns date
language plpgsql stable security definer set search_path = public as $$
declare
  d date := p_inicio;
  c int := 0;
begin
  while c < p_dias loop
    d := d + 1;
    if extract(isodow from d) < 6
       and not exists (select 1 from feriados f where f.empresa_id = p_empresa and f.data = d) then
      c := c + 1;
    end if;
  end loop;
  return d;
end
$$;

-- Quem pode ver uma ideia: autor (inclusive anônimo), coautores, comitê, engenharia, gestor
-- e o encarregado do setor da ideia.
create function public.pode_ver_ideia(p_ideia uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from ideias i
    where i.id = p_ideia
      and i.empresa_id = minha_empresa()
      and (
        i.autor_id = meu_colaborador()
        or exists (select 1 from ideia_autoria_selada s where s.ideia_id = i.id and s.colaborador_id = meu_colaborador())
        or exists (select 1 from ideia_coautores c where c.ideia_id = i.id and c.colaborador_id = meu_colaborador())
        or tenho_papel('comite') or tenho_papel('engenharia') or sou_gestor()
        or (tenho_papel('encarregado') and i.setor_id = meu_setor())
      )
  )
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.protocolo_sequencias enable row level security;
alter table public.ideias enable row level security;
alter table public.ideia_autoria_selada enable row level security;
alter table public.ideia_coautores enable row level security;
alter table public.ideia_midias enable row level security;
alter table public.ideia_eventos enable row level security;
alter table public.notificacoes enable row level security;

-- Escrita nessas tabelas só pelas funções do sistema (enviar_ideia e, na Entrega 3, as decisões do comitê).
create policy "ver ideias permitidas" on public.ideias
  for select to authenticated using (public.pode_ver_ideia(id));
create policy "ver coautores" on public.ideia_coautores
  for select to authenticated using (public.pode_ver_ideia(ideia_id));
create policy "ver anexos" on public.ideia_midias
  for select to authenticated using (public.pode_ver_ideia(ideia_id));
create policy "ver histórico" on public.ideia_eventos
  for select to authenticated using (public.pode_ver_ideia(ideia_id));
create policy "autor ou RH veem a autoria selada" on public.ideia_autoria_selada
  for select to authenticated
  using (
    colaborador_id = public.meu_colaborador()
    or (public.tenho_papel('rh') and exists (select 1 from public.ideias i where i.id = ideia_id and i.empresa_id = public.minha_empresa()))
  );
create policy "ver as próprias notificações" on public.notificacoes
  for select to authenticated using (colaborador_id = public.meu_colaborador());
create policy "marcar as próprias notificações como lidas" on public.notificacoes
  for update to authenticated
  using (colaborador_id = public.meu_colaborador())
  with check (colaborador_id = public.meu_colaborador());

revoke all on public.protocolo_sequencias from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Armazenamento privado dos anexos
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ideias', 'ideias', false, 20971520,  -- 20 MB por arquivo (plano gratuito)
  array['image/jpeg', 'image/png', 'image/webp',
        'video/mp4', 'video/webm', 'video/quicktime',
        'audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/aac']
)
on conflict (id) do nothing;

-- Envio: só na pasta da própria empresa e só para uma ideia que ainda não foi registrada.
create policy "enviar anexos de ideia nova" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'ideias'
    and (storage.foldername(name))[1] = public.minha_empresa()::text
    and not exists (select 1 from public.ideias i where i.id::text = (storage.foldername(name))[2])
  );

-- Leitura: quem pode ver a ideia pode ver os anexos dela.
create policy "ver anexos de ideias permitidas" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'ideias'
    and exists (select 1 from public.ideia_midias m where m.caminho = name and public.pode_ver_ideia(m.ideia_id))
  );

-- ---------------------------------------------------------------------------
-- Envio da ideia
-- ---------------------------------------------------------------------------

create function public.enviar_ideia(
  p_id uuid,
  p_modo public.modo_identidade,
  p_setor uuid,
  p_maquina uuid,
  p_categoria public.categoria_ideia,
  p_texto text,
  p_coautores uuid[],
  p_midias jsonb,
  p_canal text
)
returns table (protocolo text, prazo date)
language plpgsql security definer set search_path = public as $$
declare
  v_eu uuid := meu_colaborador();
  v_empresa uuid := minha_empresa();
  v_config jsonb;
  v_prefixo text;
  v_ano int := extract(year from hoje());
  v_seq int;
  v_protocolo text;
  v_prazo date;
  v_texto text := nullif(trim(coalesce(p_texto, '')), '');
  v_anexos int;
  v_audios int;
  v_coautores uuid[];
  m jsonb;
begin
  if v_eu is null then
    raise exception 'Sessão inválida. Entre de novo.';
  end if;

  -- Reenvio da mesma ideia (rede caiu depois do registro): devolve o protocolo já gerado.
  if exists (select 1 from ideias where id = p_id) then
    if not pode_ver_ideia(p_id) then
      raise exception 'Ideia já registrada por outra pessoa.';
    end if;
    return query select i.protocolo, i.prazo_atual from ideias i where i.id = p_id;
    return;
  end if;

  select config, prefixo_protocolo into v_config, v_prefixo from empresas where id = v_empresa;

  if not exists (select 1 from setores where id = p_setor and empresa_id = v_empresa) then
    raise exception 'Setor inválido.';
  end if;
  if p_maquina is not null and not exists (
    select 1 from maquinas where id = p_maquina and empresa_id = v_empresa and setor_id = p_setor
  ) then
    raise exception 'Máquina inválida para este setor.';
  end if;
  if p_canal not in ('totem', 'celular') then
    raise exception 'Canal inválido.';
  end if;
  if v_texto is not null and char_length(v_texto) > 280 then
    raise exception 'O texto deve ter no máximo 280 caracteres.';
  end if;

  p_midias := coalesce(p_midias, '[]'::jsonb);
  select count(*) filter (where e->>'tipo' in ('foto', 'video')), count(*) filter (where e->>'tipo' = 'audio')
    into v_anexos, v_audios
    from jsonb_array_elements(p_midias) e;

  if v_anexos > coalesce((v_config->>'max_anexos')::int, 6) then
    raise exception 'Máximo de % anexos por ideia.', coalesce((v_config->>'max_anexos')::int, 6);
  end if;
  if v_audios > 1 then
    raise exception 'Envie apenas um áudio por ideia.';
  end if;
  if v_texto is null and v_audios = 0 then
    raise exception 'Grave um áudio ou escreva sua ideia.';
  end if;

  for m in select * from jsonb_array_elements(p_midias) loop
    if (m->>'caminho') not like v_empresa::text || '/' || p_id::text || '/%' then
      raise exception 'Anexo fora da pasta da ideia.';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'ideias' and o.name = m->>'caminho') then
      raise exception 'Anexo não encontrado. Tente enviar de novo.';
    end if;
    if m->>'tipo' = 'video' and coalesce((m->>'duracao_s')::int, 0) > coalesce((v_config->>'video_max_segundos')::int, 30) + 1 then
      raise exception 'Vídeos devem ter até % segundos.', coalesce((v_config->>'video_max_segundos')::int, 30);
    end if;
  end loop;

  select coalesce(array_agg(distinct c.id), '{}') into v_coautores
    from colaboradores c
    where c.id = any (coalesce(p_coautores, '{}')) and c.empresa_id = v_empresa and c.ativo and c.id <> v_eu;

  -- Protocolo EMPRESA-ANO-SEQUÊNCIA (Fase 0, seção 6).
  insert into protocolo_sequencias as ps (empresa_id, ano, ultimo) values (v_empresa, v_ano, 1)
    on conflict (empresa_id, ano) do update set ultimo = ps.ultimo + 1
    returning ultimo into v_seq;
  v_protocolo := v_prefixo || '-' || v_ano || '-' || lpad(v_seq::text, 4, '0');
  v_prazo := somar_dias_uteis(v_empresa, hoje(), coalesce((v_config #>> '{sla,triagem,prazo}')::int, 5));

  insert into ideias (id, empresa_id, protocolo, autor_id, modo, setor_id, maquina_id, categoria, texto,
                      tem_audio, canal, etapa_inicio, prazo_atual)
  values (p_id, v_empresa, v_protocolo, case when p_modo = 'anonimo' then null else v_eu end, p_modo,
          p_setor, p_maquina, p_categoria, v_texto, v_audios > 0, p_canal, hoje(), v_prazo);

  if p_modo = 'anonimo' then
    insert into ideia_autoria_selada (ideia_id, colaborador_id) values (p_id, v_eu);
  end if;

  insert into ideia_coautores (ideia_id, colaborador_id) select p_id, unnest(v_coautores);

  insert into ideia_midias (ideia_id, tipo, caminho, duracao_s, tamanho_bytes)
  select p_id, (e->>'tipo')::tipo_midia, e->>'caminho', (e->>'duracao_s')::int, (e->>'tamanho')::bigint
  from jsonb_array_elements(p_midias) e;

  insert into ideia_eventos (ideia_id, de, para, por_texto, nota)
  values (p_id, null, 'em_triagem', 'Sistema',
          'Ideia recebida pelo ' || p_canal || case when v_audios > 0 then ' (com áudio)' else '' end);

  -- O autor vê o protocolo na tela: a mensagem dele já nasce lida. Coautores recebem aviso.
  insert into notificacoes (empresa_id, colaborador_id, ideia_id, texto, lida_em)
  values (v_empresa, v_eu, p_id,
          'Recebemos sua ideia ' || v_protocolo || '. O comitê responde até ' || to_char(v_prazo, 'DD/MM') || '.', now());
  insert into notificacoes (empresa_id, colaborador_id, ideia_id, texto)
  select v_empresa, unnest(v_coautores), p_id,
         'Você foi incluído como coautor da ideia ' || v_protocolo || '. O comitê responde até ' || to_char(v_prazo, 'DD/MM') || '.';

  return query select v_protocolo, v_prazo;
end
$$;

-- Ideias em que sou autor (inclusive anônimo) ou coautor, com a contagem de novidades.
create function public.minhas_ideias()
returns table (
  id uuid, protocolo text, status public.status_ideia, categoria public.categoria_ideia, texto text,
  tem_audio boolean, setor text, modo public.modo_identidade, criada_em timestamptz,
  atualizada_em timestamptz, prazo_atual date, sou_coautor boolean, novidades int
)
language sql stable security definer set search_path = public as $$
  with eu as (select meu_colaborador() as id)
  select i.id, i.protocolo, i.status, i.categoria, i.texto, i.tem_audio, s.nome, i.modo, i.criada_em,
         i.atualizada_em, i.prazo_atual,
         i.autor_id is distinct from eu.id
           and not exists (select 1 from ideia_autoria_selada a where a.ideia_id = i.id and a.colaborador_id = eu.id),
         (select count(*)::int from notificacoes n where n.ideia_id = i.id and n.colaborador_id = eu.id and n.lida_em is null)
  from ideias i
  cross join eu
  left join setores s on s.id = i.setor_id
  where i.autor_id = eu.id
     or exists (select 1 from ideia_autoria_selada a where a.ideia_id = i.id and a.colaborador_id = eu.id)
     or exists (select 1 from ideia_coautores c where c.ideia_id = i.id and c.colaborador_id = eu.id)
  order by i.criada_em desc
$$;

-- Permissões de execução.
revoke execute on function public.meu_colaborador() from public, anon;
revoke execute on function public.meu_setor() from public, anon;
revoke execute on function public.somar_dias_uteis(uuid, date, int) from public, anon;
revoke execute on function public.pode_ver_ideia(uuid) from public, anon;
revoke execute on function public.enviar_ideia(uuid, public.modo_identidade, uuid, uuid, public.categoria_ideia, text, uuid[], jsonb, text) from public, anon;
revoke execute on function public.minhas_ideias() from public, anon;

grant execute on function public.meu_colaborador() to authenticated;
grant execute on function public.meu_setor() to authenticated;
grant execute on function public.somar_dias_uteis(uuid, date, int) to authenticated;
grant execute on function public.pode_ver_ideia(uuid) to authenticated;
grant execute on function public.enviar_ideia(uuid, public.modo_identidade, uuid, uuid, public.categoria_ideia, text, uuid[], jsonb, text) to authenticated;
grant execute on function public.minhas_ideias() to authenticated;
