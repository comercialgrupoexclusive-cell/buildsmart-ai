-- Núcleo N06.3 (Investidor: Motor de Cálculo, Fase do Ativo e Cards Mobile).
--
-- Fase operacional do ciclo de investimento — hoje só existe
-- `projetos.fase_ciclo` genérico (projeto | em_obra | entregue), insuficiente
-- para o funil real de um Imóvel de investimento (Aquisição → Regularização
-- → Reforma → Pronto para venda → À venda → Negociação → Vendido →
-- Encerrado, spec V0 do Laboratório Investidor). Nullable e aditiva: só
-- relevante quando `contexto = 'investimento'`, não interfere em nada do
-- ciclo genérico usado por Projects comuns.
alter table public.projetos add column fase_investimento text
  check (fase_investimento in (
    'aquisicao_concluida', 'regularizacao_posse', 'reforma', 'pronto_para_venda',
    'a_venda', 'negociacao', 'vendido', 'encerrado'
  ));

comment on column public.projetos.fase_investimento is
  'Fase operacional do ciclo de investimento (Laboratório Investidor) — só usada quando contexto = ''investimento''. Nullable: um Ativo pode ainda não ter fase definida. Mudança de fase é auditada em portal_audit_log via mudar_fase_investimento().';

-- RPC única de mudança de fase — mesmo padrão de portal_tour_admin_manage:
-- SECURITY DEFINER, atômica, grava Audit (from/to/actor/timestamp) em
-- portal_audit_log (tabela existente, já suporta projeto_id sem obra_id
-- desde a migração 20260816175353) em vez de criar uma tabela de auditoria
-- nova só para este campo.
create or replace function public.mudar_fase_investimento(
  p_projeto_id uuid,
  p_fase_investimento text,
  p_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_projeto public.projetos%rowtype;
  v_fase_anterior text;
begin
  select * into v_projeto from public.projetos where id = p_projeto_id for update;
  if not found then
    raise exception 'Projeto não encontrado.';
  end if;
  if v_projeto.contexto <> 'investimento' then
    raise exception 'Fase de investimento só se aplica a Ativos (contexto=investimento).';
  end if;
  if p_fase_investimento not in (
    'aquisicao_concluida', 'regularizacao_posse', 'reforma', 'pronto_para_venda',
    'a_venda', 'negociacao', 'vendido', 'encerrado'
  ) then
    raise exception 'Fase de investimento inválida: %', p_fase_investimento;
  end if;

  v_fase_anterior := v_projeto.fase_investimento;

  update public.projetos
  set fase_investimento = p_fase_investimento, updated_at = now()
  where id = p_projeto_id;

  insert into public.portal_audit_log (
    user_id, projeto_id, origem, ferramenta, entidade, entidade_id, acao, valor_anterior, valor_novo
  ) values (
    p_profile_id, p_projeto_id, 'buildsmart', 'investidor_fase',
    'projeto_fase_investimento', p_projeto_id::text, 'mudar_fase',
    jsonb_build_object('fase_investimento', v_fase_anterior),
    jsonb_build_object('fase_investimento', p_fase_investimento)
  );

  return jsonb_build_object('projeto_id', p_projeto_id, 'fase_investimento', p_fase_investimento);
end;
$$;

revoke all on function public.mudar_fase_investimento(uuid, text, uuid) from public;
grant execute on function public.mudar_fase_investimento(uuid, text, uuid) to anon, authenticated, service_role;
