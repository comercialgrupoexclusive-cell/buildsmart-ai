-- Fase 0 do rebuild de Orçamento: remove tabela morta.
-- Confirmado ao vivo: 0 linhas, sem referência em nenhum arquivo do repo
-- (grep completo em app/, components/, lib/ não encontrou uso). Resquício
-- de um design de composição-por-etapa abandonado antes desta tabela ser
-- populada.
drop table if exists public.etapa_composicoes;
