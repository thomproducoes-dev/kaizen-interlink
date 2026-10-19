-- Ideia reprovada como duplicada não recebe os 5 pontos de participação (Fase 0, seção 9).
-- Recria decidir_triagem igual à da Entrega 3, mudando só essa condição.

create or replace function public.decidir_triagem(
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
    -- Duplicada não pontua (Fase 0, seção 9): a participação já foi reconhecida na ideia original.
    if d->>'motivo' not like 'Já implantada ou em andamento%'
       and not exists (select 1 from pontos where ideia_id = p_ideia and motivo = 'Participação') then
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
