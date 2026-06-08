-- ====================================================================
-- Migração: campo `grupo` (categoria fina, livre) em insumos_proprios
--
-- Contexto: a base de dados real do usuário (planilha do sistema antigo)
-- traz, além do tipo (Material/Mão de obra/Equipamento), uma "Categoria"
-- de granularidade fina por insumo — ex.: "Madeira", "Elétrico", "Aço e
-- Ferragem", "Impermeabilização" etc. — usada para organização/filtro.
--
-- A coluna `categoria` já existente fica restrita ao enum funcional do
-- sistema (MATERIAL | MAO_DE_OBRA | EQUIPAMENTO | SERVICO, sem CHECK no
-- banco). `grupo` é só um campo TEXT livre e opcional para preservar essa
-- informação adicional sem qualquer impacto no restante do sistema.
--
-- Aditivo / seguro de rodar em produção (não apaga nem altera dados).
-- ====================================================================

ALTER TABLE insumos_proprios
  ADD COLUMN IF NOT EXISTS grupo TEXT;

CREATE INDEX IF NOT EXISTS idx_insumos_proprios_grupo ON insumos_proprios (grupo);
