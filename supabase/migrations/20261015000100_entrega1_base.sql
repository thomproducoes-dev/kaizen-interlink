-- Entrega 1: base multiempresa, setores, máquinas, colaboradores, papéis e acesso por adesivo QR + PIN.
-- Regra central (Fase 0, seção 14): todo registro pertence a uma empresa e nenhuma consulta cruza empresas.
-- O isolamento é feito por Row Level Security no próprio banco, não só no código da aplicação.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------

create type public.papel as enum (
  'colaborador',  -- envia e acompanha ideias
  'encarregado',  -- líder de setor
  'comite',       -- triagem
  'engenharia',   -- viabilidade, implantação, padronização
  'gestor',       -- gestor do programa: configura SLAs, pesos, pontos, cadastros
  'rh',           -- guardião da identidade de autores anônimos
  'admin'         -- suporte da plataforma dentro da empresa
);

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  prefixo_protocolo text not null unique check (prefixo_protocolo ~ '^[A-Z]{2,5}$'),
  cnpj text,
  -- Parâmetros do programa (Fase 0, seções 4, 5, 7 e 9). Editáveis pelo gestor.
  config jsonb not null default '{
    "teto_implantacao_direta": 1000,
    "max_anexos": 6,
    "video_max_segundos": 30,
    "audio_max_segundos": 120,
    "totem_logout_segundos": 60,
    "sla": {
      "triagem":            {"prazo": 5,  "alerta": 3},
      "aguardando_autor":   {"prazo": 5,  "alerta": 3},
      "viabilidade":        {"prazo": 15, "alerta": 10},
      "inicio_implantacao": {"prazo": 10, "alerta": 7},
      "implantacao":        {"prazo": 30, "alerta": 25},
      "padronizacao":       {"prazo": 10, "alerta": 7},
      "espera_max_dias":    90
    },
    "pesos": {"impacto": 0.3, "ganho": 0.3, "facilidade": 0.2, "abrangencia": 0.2},
    "pontos": {
      "aceita_triagem": 10, "reprovada": 5, "implantada": 30, "bonus_por_ponto_nota": 10,
      "ganho_alto": 50, "ganho_alto_limite": 5000, "replicacao": 20,
      "bonus_equipe": 0.2, "limite_mensal": 10
    }
  }'::jsonb,
  criado_em timestamptz not null default now()
);

create table public.setores (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (empresa_id, nome),
  unique (id, empresa_id)
);

create table public.maquinas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  setor_id uuid not null,
  nome text not null,
  -- Conteúdo da etiqueta QR colada na máquina: abre o registro com setor e máquina preenchidos.
  codigo_qr text not null unique default encode(extensions.gen_random_bytes(12), 'hex'),
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  foreign key (setor_id, empresa_id) references public.setores (id, empresa_id) on delete cascade
);

create table public.colaboradores (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  setor_id uuid,
  auth_user_id uuid unique references auth.users (id) on delete set null,
  nome text not null,
  matricula text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (empresa_id, matricula),
  unique (id, empresa_id),
  foreign key (setor_id, empresa_id) references public.setores (id, empresa_id) on delete set null (setor_id)
);

create table public.colaborador_papeis (
  colaborador_id uuid not null references public.colaboradores (id) on delete cascade,
  papel public.papel not null,
  primary key (colaborador_id, papel)
);

-- Credenciais do totem. Tabela sem políticas de leitura: só as funções abaixo (security definer)
-- e o servidor (chave secreta) acessam. O PIN é guardado como hash bcrypt, nunca em texto.
create table public.colaborador_credenciais (
  colaborador_id uuid primary key references public.colaboradores (id) on delete cascade,
  -- Conteúdo do adesivo QR entregue ao colaborador. Trocar o token invalida o adesivo antigo.
  qr_token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  pin_hash text,
  tentativas int not null default 0,
  bloqueado_ate timestamptz,
  qr_gerado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Calendário de dias úteis para o relógio de SLA (feriados e férias coletivas).
create table public.feriados (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  data date not null,
  descricao text not null,
  primary key (empresa_id, data)
);

create index on public.colaboradores (empresa_id, setor_id);
create index on public.maquinas (empresa_id, setor_id);

-- ---------------------------------------------------------------------------
-- Funções de contexto usadas pelas políticas
-- ---------------------------------------------------------------------------

create function public.minha_empresa() returns uuid
language sql stable security definer set search_path = public as $$
  select empresa_id from colaboradores where auth_user_id = auth.uid() and ativo
$$;

create function public.tenho_papel(p public.papel) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from colaboradores c
    join colaborador_papeis cp on cp.colaborador_id = c.id
    where c.auth_user_id = auth.uid() and c.ativo and cp.papel = p
  )
$$;

create function public.sou_gestor() returns boolean
language sql stable security definer set search_path = public as $$
  select public.tenho_papel('gestor') or public.tenho_papel('admin')
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.empresas enable row level security;
alter table public.setores enable row level security;
alter table public.maquinas enable row level security;
alter table public.colaboradores enable row level security;
alter table public.colaborador_papeis enable row level security;
alter table public.colaborador_credenciais enable row level security;
alter table public.feriados enable row level security;

create policy "ver a própria empresa" on public.empresas
  for select to authenticated using (id = public.minha_empresa());
create policy "gestor edita a própria empresa" on public.empresas
  for update to authenticated
  using (id = public.minha_empresa() and public.sou_gestor())
  with check (id = public.minha_empresa() and public.sou_gestor());

create policy "ver setores da empresa" on public.setores
  for select to authenticated using (empresa_id = public.minha_empresa());
create policy "gestor gerencia setores" on public.setores
  for all to authenticated
  using (empresa_id = public.minha_empresa() and public.sou_gestor())
  with check (empresa_id = public.minha_empresa() and public.sou_gestor());

create policy "ver máquinas da empresa" on public.maquinas
  for select to authenticated using (empresa_id = public.minha_empresa());
create policy "gestor gerencia máquinas" on public.maquinas
  for all to authenticated
  using (empresa_id = public.minha_empresa() and public.sou_gestor())
  with check (empresa_id = public.minha_empresa() and public.sou_gestor());

create policy "ver feriados da empresa" on public.feriados
  for select to authenticated using (empresa_id = public.minha_empresa());
create policy "gestor gerencia feriados" on public.feriados
  for all to authenticated
  using (empresa_id = public.minha_empresa() and public.sou_gestor())
  with check (empresa_id = public.minha_empresa() and public.sou_gestor());

create policy "ver colaboradores da empresa" on public.colaboradores
  for select to authenticated using (empresa_id = public.minha_empresa());
create policy "gestor cadastra colaboradores" on public.colaboradores
  for insert to authenticated
  with check (empresa_id = public.minha_empresa() and public.sou_gestor());
-- Sem exclusão: colaborador que sai é desativado, para preservar autoria e histórico.
create policy "gestor edita colaboradores" on public.colaboradores
  for update to authenticated
  using (empresa_id = public.minha_empresa() and public.sou_gestor())
  with check (empresa_id = public.minha_empresa() and public.sou_gestor());

create policy "ver papéis da empresa" on public.colaborador_papeis
  for select to authenticated
  using (exists (select 1 from public.colaboradores c where c.id = colaborador_id and c.empresa_id = public.minha_empresa()));
-- O gestor atribui papéis, exceto 'admin', que é concedido só pelo suporte da plataforma.
create policy "gestor atribui papéis" on public.colaborador_papeis
  for insert to authenticated
  with check (
    papel <> 'admin' and public.sou_gestor()
    and exists (select 1 from public.colaboradores c where c.id = colaborador_id and c.empresa_id = public.minha_empresa())
  );
create policy "gestor remove papéis" on public.colaborador_papeis
  for delete to authenticated
  using (
    papel <> 'admin' and public.sou_gestor()
    and exists (select 1 from public.colaboradores c where c.id = colaborador_id and c.empresa_id = public.minha_empresa())
  );

-- colaborador_credenciais: RLS ligado e nenhuma política = nenhum acesso direto pelo app.
revoke all on public.colaborador_credenciais from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Funções de credenciais (adesivo QR + PIN)
-- ---------------------------------------------------------------------------

-- Define ou troca o PIN. Pode ser chamada pelo gestor da empresa, pelo próprio colaborador
-- ou pelo servidor (chave secreta), por exemplo no cadastro inicial.
create function public.definir_pin(p_colaborador uuid, p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_empresa uuid;
begin
  if p_pin !~ '^\d{4}$' then
    raise exception 'O PIN deve ter 4 números.';
  end if;
  if p_pin ~ '^(\d)\1{3}$' or p_pin in ('1234', '4321', '0123', '9876') then
    raise exception 'PIN fácil demais. Evite números repetidos ou em sequência.';
  end if;

  select empresa_id into v_empresa from colaboradores where id = p_colaborador;
  if v_empresa is null then
    raise exception 'Colaborador não encontrado.';
  end if;

  if not (
    auth.role() = 'service_role'
    or (v_empresa = minha_empresa() and sou_gestor())
    or exists (select 1 from colaboradores where id = p_colaborador and auth_user_id = auth.uid())
  ) then
    raise exception 'Sem permissão para alterar este PIN.';
  end if;

  insert into colaborador_credenciais (colaborador_id, pin_hash)
  values (p_colaborador, crypt(p_pin, gen_salt('bf')))
  on conflict (colaborador_id) do update
    set pin_hash = excluded.pin_hash, tentativas = 0, bloqueado_ate = null, atualizado_em = now();
end
$$;

-- Gera um novo conteúdo para o adesivo QR (ex.: adesivo perdido). O adesivo antigo deixa de funcionar.
create function public.gerar_qr(p_colaborador uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_empresa uuid;
  v_token text := encode(gen_random_bytes(16), 'hex');
begin
  select empresa_id into v_empresa from colaboradores where id = p_colaborador;
  if v_empresa is null then
    raise exception 'Colaborador não encontrado.';
  end if;
  if not (auth.role() = 'service_role' or (v_empresa = minha_empresa() and sou_gestor())) then
    raise exception 'Sem permissão para gerar adesivo.';
  end if;

  insert into colaborador_credenciais (colaborador_id, qr_token)
  values (p_colaborador, v_token)
  on conflict (colaborador_id) do update
    set qr_token = excluded.qr_token, qr_gerado_em = now(), atualizado_em = now();
  return v_token;
end
$$;

-- Verifica adesivo + PIN no totem. Chamada só pelo servidor (chave secreta).
-- 5 PINs errados seguidos bloqueiam o adesivo por 15 minutos.
create function public.verificar_acesso(p_qr text, p_pin text)
returns table (status text, colaborador_id uuid)
language plpgsql security definer set search_path = public, extensions as $$
declare
  r colaborador_credenciais%rowtype;
  v_ativo boolean;
begin
  select * into r from colaborador_credenciais where qr_token = p_qr for update;
  if not found then
    return query select 'invalido'::text, null::uuid;
    return;
  end if;

  select ativo into v_ativo from colaboradores where id = r.colaborador_id;
  if not coalesce(v_ativo, false) then
    return query select 'invalido'::text, null::uuid;
    return;
  end if;

  if r.bloqueado_ate is not null and r.bloqueado_ate > now() then
    return query select 'bloqueado'::text, null::uuid;
    return;
  end if;

  if r.pin_hash is null or crypt(p_pin, r.pin_hash) <> r.pin_hash then
    update colaborador_credenciais
      set tentativas = r.tentativas + 1,
          bloqueado_ate = case when r.tentativas + 1 >= 5 then now() + interval '15 minutes' end,
          atualizado_em = now()
      where colaborador_credenciais.colaborador_id = r.colaborador_id;
    return query select (case when r.tentativas + 1 >= 5 then 'bloqueado' else 'invalido' end)::text, null::uuid;
    return;
  end if;

  update colaborador_credenciais
    set tentativas = 0, bloqueado_ate = null, atualizado_em = now()
    where colaborador_credenciais.colaborador_id = r.colaborador_id;
  return query select 'ok'::text, r.colaborador_id;
end
$$;

-- Permissões de execução (funções nascem executáveis por PUBLIC no Postgres).
revoke execute on function public.minha_empresa() from public, anon;
revoke execute on function public.tenho_papel(public.papel) from public, anon;
revoke execute on function public.sou_gestor() from public, anon;
revoke execute on function public.definir_pin(uuid, text) from public, anon;
revoke execute on function public.gerar_qr(uuid) from public, anon;
revoke execute on function public.verificar_acesso(text, text) from public, anon, authenticated;

grant execute on function public.minha_empresa() to authenticated;
grant execute on function public.tenho_papel(public.papel) to authenticated;
grant execute on function public.sou_gestor() to authenticated;
grant execute on function public.definir_pin(uuid, text) to authenticated, service_role;
grant execute on function public.gerar_qr(uuid) to authenticated, service_role;
grant execute on function public.verificar_acesso(text, text) to service_role;
