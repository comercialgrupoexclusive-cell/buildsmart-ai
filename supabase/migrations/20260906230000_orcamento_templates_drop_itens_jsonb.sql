-- Fase 2a do rebuild de Orçamento: a coluna orcamento_templates.itens (JSONB
-- solto, causa raiz do bug de template) não é mais escrita nem lida por
-- nenhum código depois da reescrita de TemplateOrcamentoModal.tsx para usar
-- orcamento_template_itens (FK real). Continuar NOT NULL nela quebraria todo
-- "Salvar como template" novo — não é mais uma coluna "deprecada mas
-- inofensiva", é ativamente incompatível com o novo fluxo.
alter table public.orcamento_templates drop column if exists itens;
