-- Revisão de segurança antes dos testes com usuários reais.
-- 1. Anonimato: o histórico da ideia não registra quem agiu quando é o autor anônimo/reservado.
-- 2. Anonimato: o gestor só vê pontos de ideias identificadas (pontos de anônimas ficam com o RH).
-- 3. Ideia reservada: a coluna autor_id deixa de ser legível direto; o nome só aparece pelas telas.
-- 4. Cadastro: o gestor edita só nome, matrícula, setor e ativo (nunca o vínculo com a conta de login).
-- 5. Trilha de auditoria do cadastro: papéis, PINs, adesivos, bloqueios e edições ficam registrados.

-- ---------------------------------------------------------------------------
-- 1. Histórico sem identificar o autor de ideia anônima ou reservada
-- ---------------------------------------------------------------------------
create or replace function public._mudar_status(p_ideia uuid, p_para public.status_ideia, p_nota text, p_prazo date, p_por text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_de status_ideia;
  v_modo modo_identidade;
  v_eu uuid := meu_colaborador();
begin
  select status, modo into v_de, v_modo from ideias where id = p_ideia for update;
  update ideias
    set status = p_para, etapa_inicio = hoje(), etapa_iniciada_em = now(), prazo_atual = p_prazo, atualizada_em = now()
    where id = p_ideia;
  -- Quando quem age é autor/coautor de ideia anônima ou reservada, o evento não guarda a pessoa.
  if v_modo <> 'identificado' and v_eu in (select _autores(p_ideia)) then
    v_eu := null;
  end if;
  insert into ideia_eventos (ideia_id, de, para, por_colaborador, por_texto, nota)
  values (p_ideia, v_de, p_para, v_eu, p_por, p_nota);
end
$$;
revoke execute on function public._mudar_status(uuid, public.status_ideia, text, date, text) from public, anon, authenticated;

-- Limpa o que já foi gravado antes desta correção.
update public.ideia_eventos e
   set por_colaborador = null
  from public.ideias i
 where i.id = e.ideia_id
   and i.modo <> 'identificado'
   and e.por_colaborador in (select public._autores(i.id));

-- ---------------------------------------------------------------------------
-- 2. Pontos: o gestor vê só os de ideias identificadas e os sem ideia
-- ---------------------------------------------------------------------------
drop policy "ver os próprios pontos ou gestor vê todos" on public.pontos;
create policy "ver os próprios pontos ou gestor vê os de ideias identificadas" on public.pontos
  for select to authenticated
  using (
    colaborador_id = public.meu_colaborador()
    or (
      empresa_id = public.minha_empresa() and public.sou_gestor()
      and (ideia_id is null or exists (select 1 from public.ideias i where i.id = ideia_id and i.modo = 'identificado'))
    )
  );

-- ---------------------------------------------------------------------------
-- 3. autor_id fora da leitura direta (as telas usam fila_ideias, minhas_ideias e mural)
-- ---------------------------------------------------------------------------
revoke select on public.ideias from authenticated;
grant select (
  id, empresa_id, protocolo, modo, setor_id, maquina_id, categoria, texto, tem_audio, status, versao, canal,
  etapa_inicio, prazo_atual, criada_em, atualizada_em, notas, nota, custo_estimado, responsavel_implantacao,
  prazo_implantacao, revisao, motivo_espera, retorno, dias_restantes, etapa_iniciada_em, ganho_tipo,
  ganho_estimado, ganho_calculo, roi, payback_meses, implantacao_inicio, linha_base, ganho_verificado,
  ganho_qualitativo, verificado_em, sop_codigo, sop_revisao, difusao_confirmada_em, padronizada_em
) on public.ideias to authenticated;

-- "Sou autor desta ideia?" para a tela Minhas ideias, sem expor o autor de ninguém.
create or replace function public.sou_autor(p_ideia uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from ideias i
    where i.id = p_ideia
      and (i.autor_id = meu_colaborador()
           or exists (select 1 from ideia_autoria_selada s where s.ideia_id = i.id and s.colaborador_id = meu_colaborador()))
  )
$$;
revoke execute on function public.sou_autor(uuid) from public, anon;
grant execute on function public.sou_autor(uuid) to authenticated;

-- A regra de anexos de resposta/reenvio lia autor_id direto; passa a usar sou_autor().
drop policy "enviar anexos de resposta ou reenvio" on storage.objects;
create policy "enviar anexos de resposta ou reenvio" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'ideias'
    and (storage.foldername(name))[1] = public.minha_empresa()::text
    and exists (
      select 1 from public.ideias i
      where i.id::text = (storage.foldername(name))[2]
        and i.status in ('aguardando_autor', 'reprovada')
        and public.sou_autor(i.id)
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Cadastro: colunas que o gestor pode gravar
-- ---------------------------------------------------------------------------
revoke insert, update on public.colaboradores from authenticated;
grant insert (empresa_id, nome, matricula, setor_id) on public.colaboradores to authenticated;
grant update (nome, matricula, setor_id, ativo) on public.colaboradores to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Trilha de auditoria do cadastro (ninguém edita nem apaga pelo app)
-- ---------------------------------------------------------------------------
create table public.auditoria_cadastro (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  colaborador_id uuid not null references public.colaboradores (id) on delete cascade,
  acao text not null,
  por_colaborador uuid references public.colaboradores (id),
  criado_em timestamptz not null default now()
);
create index on public.auditoria_cadastro (empresa_id, criado_em desc);
alter table public.auditoria_cadastro enable row level security;
create policy "gestor e RH veem a auditoria do cadastro" on public.auditoria_cadastro
  for select to authenticated
  using (empresa_id = public.minha_empresa() and (public.sou_gestor() or public.tenho_papel('rh')));

create or replace function public._auditar(p_colaborador uuid, p_acao text) returns void
language sql security definer set search_path = public as $$
  insert into auditoria_cadastro (empresa_id, colaborador_id, acao, por_colaborador)
  select c.empresa_id, c.id, p_acao, meu_colaborador() from colaboradores c where c.id = p_colaborador
$$;
revoke execute on function public._auditar(uuid, text) from public, anon, authenticated;

create or replace function public._auditar_colaborador() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform _auditar(new.id, format('Cadastrado: %s (mat. %s)', new.nome, new.matricula));
    return new;
  end if;
  if new.nome is distinct from old.nome then
    perform _auditar(new.id, format('Nome: %s → %s', old.nome, new.nome));
  end if;
  if new.matricula is distinct from old.matricula then
    perform _auditar(new.id, format('Matrícula: %s → %s', old.matricula, new.matricula));
  end if;
  if new.setor_id is distinct from old.setor_id then
    perform _auditar(new.id, format('Setor: %s → %s',
      coalesce((select nome from setores where id = old.setor_id), 'sem setor'),
      coalesce((select nome from setores where id = new.setor_id), 'sem setor')));
  end if;
  if new.ativo is distinct from old.ativo then
    perform _auditar(new.id, case when new.ativo then 'Reativado' else 'Desativado' end);
  end if;
  return new;
end
$$;
create trigger auditar_colaborador after insert or update on public.colaboradores
  for each row execute function public._auditar_colaborador();

create or replace function public._auditar_papel() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.papel <> 'colaborador' then perform _auditar(new.colaborador_id, format('Papel incluído: %s', new.papel)); end if;
    return new;
  end if;
  if old.papel <> 'colaborador' then perform _auditar(old.colaborador_id, format('Papel removido: %s', old.papel)); end if;
  return old;
end
$$;
create trigger auditar_papel after insert or delete on public.colaborador_papeis
  for each row execute function public._auditar_papel();

create or replace function public._auditar_credencial() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.pin_hash is distinct from (case when tg_op = 'UPDATE' then old.pin_hash end) and new.pin_hash is not null then
    perform _auditar(new.colaborador_id,
      case when new.pin_provisorio then 'PIN provisório definido' else 'PIN trocado pelo próprio colaborador' end);
  end if;
  if tg_op = 'UPDATE' and new.qr_token is distinct from old.qr_token then
    perform _auditar(new.colaborador_id, 'Novo adesivo gerado (o anterior deixou de funcionar)');
  end if;
  if tg_op = 'UPDATE' and new.bloqueado_ate is not null and old.bloqueado_ate is distinct from new.bloqueado_ate then
    perform _auditar(new.colaborador_id, 'Adesivo bloqueado por 15 min após 5 PINs errados');
  end if;
  return new;
end
$$;
create trigger auditar_credencial after insert or update on public.colaborador_credenciais
  for each row execute function public._auditar_credencial();

revoke execute on function public._auditar_colaborador() from public, anon, authenticated;
revoke execute on function public._auditar_papel() from public, anon, authenticated;
revoke execute on function public._auditar_credencial() from public, anon, authenticated;
