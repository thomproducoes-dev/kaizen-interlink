-- PIN provisório: o PIN cadastrado ou redefinido pelo gestor vale só para o primeiro acesso.
-- Na entrada seguinte o colaborador é obrigado a criar o próprio PIN, antes de abrir a sessão.

alter table public.colaborador_credenciais
  add column if not exists pin_provisorio boolean not null default false;

-- Quem ainda não entrou nenhuma vez recebeu o PIN do gestor: passa a ser provisório.
update public.colaborador_credenciais cr
   set pin_provisorio = true
  from public.colaboradores c
 where c.id = cr.colaborador_id
   and c.auth_user_id is null
   and cr.pin_hash is not null;

-- Regra única de PIN fraco. Devolve a mensagem de recusa ou null quando o PIN serve.
create or replace function public._pin_recusado(p_pin text) returns text
language sql immutable as $$
  select case
    when p_pin is null or p_pin !~ '^\d{4}$' then 'O PIN deve ter 4 números.'
    when p_pin ~ '^(\d)\1{3}$' or p_pin in ('1234', '4321', '0123', '9876') then 'PIN fácil demais. Evite números repetidos ou em sequência.'
  end
$$;
revoke execute on function public._pin_recusado(text) from public, anon, authenticated;

-- definir_pin: igual à Entrega 1, mas marca o PIN como provisório quando quem define é o gestor
-- (ou o servidor). Quando o próprio colaborador troca, o PIN deixa de ser provisório.
create or replace function public.definir_pin(p_colaborador uuid, p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_empresa uuid;
  v_proprio boolean;
  v_recusa text := _pin_recusado(p_pin);
begin
  if v_recusa is not null then
    raise exception '%', v_recusa;
  end if;

  select empresa_id, coalesce(auth_user_id = auth.uid(), false)
    into v_empresa, v_proprio
    from colaboradores where id = p_colaborador;
  if v_empresa is null then
    raise exception 'Colaborador não encontrado.';
  end if;

  if not (auth.role() = 'service_role' or (v_empresa = minha_empresa() and sou_gestor()) or v_proprio) then
    raise exception 'Sem permissão para alterar este PIN.';
  end if;

  insert into colaborador_credenciais (colaborador_id, pin_hash, pin_provisorio)
  values (p_colaborador, crypt(p_pin, gen_salt('bf')), not v_proprio)
  on conflict (colaborador_id) do update
    set pin_hash = excluded.pin_hash, pin_provisorio = excluded.pin_provisorio,
        tentativas = 0, bloqueado_ate = null, atualizado_em = now();
end
$$;

-- verificar_acesso ganha o PIN novo opcional. Com PIN provisório correto:
--   sem p_novo_pin  -> 'trocar_pin' (a sessão não é aberta; a tela pede o PIN novo)
--   com p_novo_pin  -> grava o PIN novo e devolve 'ok', ou 'pin_fraco' / 'pin_igual'
drop function if exists public.verificar_acesso(text, text);

create function public.verificar_acesso(p_qr text, p_pin text, p_novo_pin text default null)
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

  if r.pin_provisorio then
    if p_novo_pin is null then
      return query select 'trocar_pin'::text, null::uuid;
      return;
    end if;
    if _pin_recusado(p_novo_pin) is not null then
      return query select 'pin_fraco'::text, null::uuid;
      return;
    end if;
    if p_novo_pin = p_pin then
      return query select 'pin_igual'::text, null::uuid;
      return;
    end if;
    update colaborador_credenciais
      set pin_hash = crypt(p_novo_pin, gen_salt('bf')), pin_provisorio = false, atualizado_em = now()
      where colaborador_credenciais.colaborador_id = r.colaborador_id;
  end if;

  return query select 'ok'::text, r.colaborador_id;
end
$$;

revoke execute on function public.verificar_acesso(text, text, text) from public, anon, authenticated;
grant execute on function public.verificar_acesso(text, text, text) to service_role;

-- listar_adesivos passa a informar se o PIN ainda é provisório (coluna Acesso da lista).
drop function if exists public.listar_adesivos(uuid[]);

create function public.listar_adesivos(p_ids uuid[] default null)
returns table (
  colaborador_id uuid,
  nome text,
  matricula text,
  setor text,
  ativo boolean,
  qr_token text,
  qr_gerado_em timestamptz,
  tem_pin boolean,
  pin_provisorio boolean
)
language sql stable security definer set search_path = public as $$
  select c.id, c.nome, c.matricula, s.nome, c.ativo, cr.qr_token, cr.qr_gerado_em, cr.pin_hash is not null, cr.pin_provisorio
  from colaboradores c
  join colaborador_credenciais cr on cr.colaborador_id = c.id
  left join setores s on s.id = c.setor_id
  where c.empresa_id = minha_empresa()
    and sou_gestor()
    and (p_ids is null or c.id = any (p_ids))
  order by s.nome nulls last, c.nome
$$;

revoke execute on function public.listar_adesivos(uuid[]) from public, anon;
grant execute on function public.listar_adesivos(uuid[]) to authenticated;
