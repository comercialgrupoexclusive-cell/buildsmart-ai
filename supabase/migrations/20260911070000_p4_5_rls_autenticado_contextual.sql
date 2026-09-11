-- P4.5 FOCO 1, passo 2 de 2 — substitui as policies permissivas
-- (qual=true para public/anon/authenticated, achado P0 do teste real
-- Allegra) por acesso autenticado + contextual por organização, usando os
-- helpers criados em p4_5_fundacao_auth_organizacao.sql
-- (current_profile_id/is_org_member/processo_is_accessible).
--
-- Regra por tabela: sempre exige sessão real (current_profile_id() não
-- nulo); quando a linha pertence a um Processo (direto ou via
-- orcamento/compra/requisição/medição), exige também ser membro da
-- organização daquele Processo. Linhas só ligadas a Obra/Projeto legado
-- (processo_id nulo na cadeia) ficam liberadas para qualquer autenticado —
-- é o mesmo universo de usuários da única organização real hoje, e a
-- ontologia Organização→Processo do Plano Canônico é sobre o caminho novo.
--
-- Só chega a este ponto depois que app/api/auth/claim + app/page.tsx +
-- middleware.ts já dão a todo profile existente um caminho real para obter
-- sessão — nunca aplicar isto sem isso já no ar, senão ninguém entra mais.

-- processos (o próprio id é o "processo_id" para o helper)
drop policy if exists processos_all on public.processos;
create policy processos_all on public.processos
  for all to authenticated
  using (public.processo_is_accessible(id))
  with check (public.processo_is_accessible(id));

-- processo_modulos
drop policy if exists processo_modulos_all on public.processo_modulos;
create policy processo_modulos_all on public.processo_modulos
  for all to authenticated
  using (public.processo_is_accessible(processo_id))
  with check (public.processo_is_accessible(processo_id));

-- etapas
drop policy if exists bs_mvp_select_all on public.etapas;
drop policy if exists bs_mvp_insert_all on public.etapas;
drop policy if exists bs_mvp_update_all on public.etapas;
drop policy if exists bs_mvp_delete_all on public.etapas;
create policy etapas_all on public.etapas
  for all to authenticated
  using (public.processo_is_accessible(processo_id))
  with check (public.processo_is_accessible(processo_id));

-- orcamentos
drop policy if exists bs_mvp_select_all on public.orcamentos;
drop policy if exists bs_mvp_insert_all on public.orcamentos;
drop policy if exists bs_mvp_update_all on public.orcamentos;
drop policy if exists bs_mvp_delete_all on public.orcamentos;
create policy orcamentos_all on public.orcamentos
  for all to authenticated
  using (public.processo_is_accessible(processo_id))
  with check (public.processo_is_accessible(processo_id));

-- orcamento_itens (só tem orcamento_id — resolve processo_id via orcamentos)
drop policy if exists bs_mvp_select_all on public.orcamento_itens;
drop policy if exists bs_mvp_insert_all on public.orcamento_itens;
drop policy if exists bs_mvp_update_all on public.orcamento_itens;
drop policy if exists bs_mvp_delete_all on public.orcamento_itens;
create policy orcamento_itens_all on public.orcamento_itens
  for all to authenticated
  using (public.processo_is_accessible((select o.processo_id from public.orcamentos o where o.id = orcamento_id)))
  with check (public.processo_is_accessible((select o.processo_id from public.orcamentos o where o.id = orcamento_id)));

-- orcamento_item_insumos (só tem orcamento_item_id — resolve encadeando
-- até orcamentos; mesma classe de risco de orcamento_itens, ficou de fora
-- da lista original do relatório mas guarda o mesmo tipo de dado —
-- corrigida junto por estar diretamente adjacente).
drop policy if exists bs_mvp_select_all on public.orcamento_item_insumos;
drop policy if exists bs_mvp_insert_all on public.orcamento_item_insumos;
drop policy if exists bs_mvp_update_all on public.orcamento_item_insumos;
drop policy if exists bs_mvp_delete_all on public.orcamento_item_insumos;
create policy orcamento_item_insumos_all on public.orcamento_item_insumos
  for all to authenticated
  using (public.processo_is_accessible((
    select o.processo_id from public.orcamentos o
    join public.orcamento_itens oi on oi.orcamento_id = o.id
    where oi.id = orcamento_item_id
  )))
  with check (public.processo_is_accessible((
    select o.processo_id from public.orcamentos o
    join public.orcamento_itens oi on oi.orcamento_id = o.id
    where oi.id = orcamento_item_id
  )));

-- planejamento_itens
drop policy if exists planejamento_itens_all on public.planejamento_itens;
create policy planejamento_itens_all on public.planejamento_itens
  for all to authenticated
  using (public.processo_is_accessible(processo_id))
  with check (public.processo_is_accessible(processo_id));

-- medicoes
drop policy if exists bs_mvp_select_all on public.medicoes;
drop policy if exists bs_mvp_insert_all on public.medicoes;
drop policy if exists bs_mvp_update_all on public.medicoes;
drop policy if exists bs_mvp_delete_all on public.medicoes;
create policy medicoes_all on public.medicoes
  for all to authenticated
  using (public.processo_is_accessible(processo_id))
  with check (public.processo_is_accessible(processo_id));

-- medicao_itens (só tem medicao_id → medicoes.processo_id)
drop policy if exists medicao_itens_all on public.medicao_itens;
create policy medicao_itens_all on public.medicao_itens
  for all to authenticated
  using (public.processo_is_accessible((select m.processo_id from public.medicoes m where m.id = medicao_id)))
  with check (public.processo_is_accessible((select m.processo_id from public.medicoes m where m.id = medicao_id)));

-- compra_itens
drop policy if exists allow_all on public.compra_itens;
drop policy if exists compra_itens_all on public.compra_itens;
create policy compra_itens_all on public.compra_itens
  for all to authenticated
  using (public.processo_is_accessible(processo_id))
  with check (public.processo_is_accessible(processo_id));

-- compra_pagamentos (só tem compra_item_id → compra_itens.processo_id)
drop policy if exists compra_pagamentos_all on public.compra_pagamentos;
create policy compra_pagamentos_all on public.compra_pagamentos
  for all to authenticated
  using (public.processo_is_accessible((select c.processo_id from public.compra_itens c where c.id = compra_item_id)))
  with check (public.processo_is_accessible((select c.processo_id from public.compra_itens c where c.id = compra_item_id)));

-- requisicoes_compra
drop policy if exists req_compra_all on public.requisicoes_compra;
create policy requisicoes_compra_all on public.requisicoes_compra
  for all to authenticated
  using (public.processo_is_accessible(processo_id))
  with check (public.processo_is_accessible(processo_id));

-- requisicao_itens (só tem requisicao_id → requisicoes_compra.processo_id)
drop policy if exists req_itens_all on public.requisicao_itens;
create policy requisicao_itens_all on public.requisicao_itens
  for all to authenticated
  using (public.processo_is_accessible((select r.processo_id from public.requisicoes_compra r where r.id = requisicao_id)))
  with check (public.processo_is_accessible((select r.processo_id from public.requisicoes_compra r where r.id = requisicao_id)));

-- listas_compra (mesma classe de risco de requisicoes_compra, tinha
-- policy aberta própria fora da lista original do relatório)
drop policy if exists listas_compra_all on public.listas_compra;
create policy listas_compra_all on public.listas_compra
  for all to authenticated
  using (public.processo_is_accessible(processo_id))
  with check (public.processo_is_accessible(processo_id));

-- rdo
drop policy if exists rdo_all on public.rdo;
create policy rdo_all on public.rdo
  for all to authenticated
  using (public.processo_is_accessible(processo_id))
  with check (public.processo_is_accessible(processo_id));

-- tarefas
drop policy if exists allow_all on public.tarefas;
create policy tarefas_all on public.tarefas
  for all to authenticated
  using (public.processo_is_accessible(processo_id))
  with check (public.processo_is_accessible(processo_id));

-- financiamento_itens
drop policy if exists financiamento_itens_all on public.financiamento_itens;
create policy financiamento_itens_all on public.financiamento_itens
  for all to authenticated
  using (public.processo_is_accessible(processo_id))
  with check (public.processo_is_accessible(processo_id));

-- financiamento_medicoes
drop policy if exists financiamento_medicoes_all on public.financiamento_medicoes;
create policy financiamento_medicoes_all on public.financiamento_medicoes
  for all to authenticated
  using (public.processo_is_accessible(processo_id))
  with check (public.processo_is_accessible(processo_id));

-- financiamento_medicao_itens (só tem medicao_id → financiamento_medicoes.processo_id)
drop policy if exists financiamento_medicao_itens_all on public.financiamento_medicao_itens;
create policy financiamento_medicao_itens_all on public.financiamento_medicao_itens
  for all to authenticated
  using (public.processo_is_accessible((select fm.processo_id from public.financiamento_medicoes fm where fm.id = medicao_id)))
  with check (public.processo_is_accessible((select fm.processo_id from public.financiamento_medicoes fm where fm.id = medicao_id)));

-- obra_fontes_recursos
drop policy if exists obra_fontes_recursos_all on public.obra_fontes_recursos;
create policy obra_fontes_recursos_all on public.obra_fontes_recursos
  for all to authenticated
  using (public.processo_is_accessible(processo_id))
  with check (public.processo_is_accessible(processo_id));

-- obra_reembolsos
drop policy if exists obra_reembolsos_all on public.obra_reembolsos;
create policy obra_reembolsos_all on public.obra_reembolsos
  for all to authenticated
  using (public.processo_is_accessible(processo_id))
  with check (public.processo_is_accessible(processo_id));

-- materiais
drop policy if exists bs_mvp_select_all on public.materiais;
drop policy if exists bs_mvp_insert_all on public.materiais;
drop policy if exists bs_mvp_update_all on public.materiais;
drop policy if exists bs_mvp_delete_all on public.materiais;
create policy materiais_all on public.materiais
  for all to authenticated
  using (public.processo_is_accessible(processo_id))
  with check (public.processo_is_accessible(processo_id));
