-- Entrega 1 (parte 2): o gestor lê o conteúdo dos adesivos QR da própria empresa para imprimir.
-- A tabela de credenciais continua sem acesso direto; esta função expõe só o necessário e só ao gestor.

create function public.listar_adesivos(p_ids uuid[] default null)
returns table (
  colaborador_id uuid,
  nome text,
  matricula text,
  setor text,
  ativo boolean,
  qr_token text,
  qr_gerado_em timestamptz,
  tem_pin boolean
)
language sql stable security definer set search_path = public as $$
  select c.id, c.nome, c.matricula, s.nome, c.ativo, cr.qr_token, cr.qr_gerado_em, cr.pin_hash is not null
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
