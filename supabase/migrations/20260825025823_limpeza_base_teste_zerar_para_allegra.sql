-- ═══════════════════════════════════════════════════════════════════════════
-- LIMPEZA ADMINISTRATIVA DE DADOS OPERACIONAIS DE TESTE — "zerar para Allegra"
--
-- Script de execução única (não é código de aplicação, não roda automático).
-- Objetivo: remover TODAS as obras/projetos/orçamentos de teste e seus
-- registros dependentes, preservando usuários/profiles/autenticação,
-- configurações globais, SINAPI (sinapi_insumos, sinapi_composicoes,
-- sinapi_composicao_itens) e templates/catálogos globais reutilizáveis
-- (orcamento_templates, projeto_templates, etapas_padrao — confirmados sem
-- FK para obras/orcamentos/composicoes_proprias, portanto não dependem de
-- dado de teste e não são tocados por este script).
--
-- Ordem baseada no mapeamento real de FKs (information_schema + pg_constraint,
-- consultado antes deste script): a maioria das tabelas tem ON DELETE CASCADE
-- a partir de obras/orcamentos/projetos e é resolvida automaticamente pelo
-- Postgres num único DELETE. As exceções (NO ACTION) foram verificadas uma a
-- uma e resolvidas pela ORDEM das instruções abaixo, nunca alterando o schema:
--   - etapa_composicoes.composicao_id -> composicoes_proprias (NO ACTION):
--     etapa_composicoes é filha de etapas (CASCADE), e etapas são removidas
--     pelo cascade de obras/orcamentos nos passos 2-3, antes do passo 6.
--   - orcamento_itens.composicao_id -> composicoes_proprias (NO ACTION):
--     orcamento_itens é removida pelo cascade de orcamentos no passo 3,
--     antes do passo 6.
--   - medicao_itens.orcamento_item_id -> orcamento_itens (NO ACTION):
--     medicoes.obra_id é NOT NULL (confirmado) -> medicao_itens já são
--     removidos via cascade de obras no passo 2, antes do passo 3.
--   - materiais.subetapa_orcamento_item_id -> orcamento_itens (NO ACTION):
--     materiais.obra_id é NOT NULL (confirmado) -> mesma lógica acima.
--   - tarefas.projeto_id -> projetos (NO ACTION) e tarefas.obra_id nullable:
--     tarefas é apagada explicitamente no passo 1, antes de obras/projetos.
--
-- RLS: todas as tabelas envolvidas têm RLS habilitado, mas este script roda
-- com privilégio administrativo de migração (mesmo mecanismo já usado nesta
-- sessão para backfills/consolidações), portanto não é bloqueado por policy.
--
-- Contagem "antes" registrada separadamente (relatório da rodada) via
-- list_tables/information_schema logo antes deste script ser aplicado.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Tarefas — em escopo (obra_id/projeto_id) e explicitamente apagada antes
--    de obras/projetos por causa do NO ACTION em tarefas.projeto_id.
delete from public.tarefas;

-- 2) Obras — cascade cobre a esmagadora maioria dos filhos operacionais
--    (boards, compra_itens, comunicados_obra, cronograma_dependencias,
--    diario_obra, etapa_caixa, etapas, feed_items, financiamento_*,
--    fornecedores, listas_compra, materiais, medicao_progresso, medicoes,
--    obra_files, obra_fontes_recursos, obra_fornecedores, obra_previsoes,
--    obra_reembolsos, obra_usuarios, orcamento_itens_baseline,
--    planejamento_dependencias(+baseline), planejamento_itens(+baseline),
--    portal_access_links, portal_audit_log, portal_configuracoes,
--    portal_messages, portal_notifications, portal_tours, rdo,
--    requisicoes_compra, e tudo que é filho em cascade dessas).
delete from public.obras;

-- 3) Orçamentos — cascade cobre o que sobrar (orçamentos criados na fase
--    "projeto", ainda sem obra_id): etapas, orcamento_itens(+itens_insumos),
--    orcamento_verificacao_historico, planejamento_itens(+dependencias),
--    obra_fontes_recursos remanescentes.
delete from public.orcamentos;

-- 4) Projetos — cascade cobre projeto_itens(+dependencias+arquivos),
--    projeto_usuarios, board_files, boards(project_id), portal_audit_log e
--    portal_tours remanescentes.
delete from public.projetos;

-- 5) Cronogramas órfãos — cronogramas.obra_id e .projeto_id são SET NULL
--    (não cascade); depois dos passos 2-4, qualquer cronograma de teste fica
--    com as duas colunas nulas. Remove esses órfãos explicitamente (cascade
--    cronograma_dependencias e quaisquer etapas remanescentes via
--    cronograma_id).
delete from public.cronogramas where obra_id is null and projeto_id is null;

-- 6) Composições próprias — agora seguro: etapa_composicoes e orcamento_itens
--    que referenciavam composicoes_proprias já foram removidos nos passos
--    2-3. Cascade remove composicao_insumos.
delete from public.composicoes_proprias;

-- 7) Insumos próprios — agora seguro: composicao_insumos que os referenciava
--    já foi removido no passo 6 (ou já é 0).
delete from public.insumos_proprios;
