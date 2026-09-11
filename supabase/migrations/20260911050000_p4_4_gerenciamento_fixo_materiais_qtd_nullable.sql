-- P4.4 (Teste Operacional Real Allegra — Correções R01), P1:
--
-- gerenciamento_percentual (numeric(7,4)) não representa um valor fixo
-- contratado sem erro de centavos (ex.: R$123.100,00 sobre R$500.250,00 de
-- custo direto vira 24,6077%, que na volta produz R$623.350,02, não
-- R$623.350,00). gerenciamento_valor_fixo é aditivo, nullable: quando
-- definido, vence o percentual (ver lib/orcamento/arvore.ts
-- calcularGerenciamento); quando null, comportamento idêntico ao anterior.
alter table public.orcamentos
  add column if not exists gerenciamento_valor_fixo numeric(14,2);

-- Nota sobre o P0 "materiais.quantidade_total NOT NULL trava necessidade
-- incompleta" do mesmo relatório: NÃO alterado aqui de propósito.
-- `materiais` já é a camada confirmada/quantificada (reconciliada a partir
-- do orçamento por lib/materiais-sync.ts, sempre com número real); a
-- camada que já aceita quantidade/preço/fornecedor nulos é
-- requisicoes_compra/requisicao_itens (P4.3), e foi exatamente o caminho
-- usado com sucesso no teste real do relatório. Tornar quantidade_total
-- nullable aqui teria efeito colateral não auditado em consumidores que
-- fazem aritmética direta sem guarda de null (ex.: ObraMateriais.tsx
-- `Math.max(0, m.quantidade_total - m.quantidade_comprada)` e
-- `Math.min(m.quantidade_total, ...)`), então fica como pendência explícita
-- de decisão de produto em vez de mudança de schema não testada em todos os
-- consumidores.
