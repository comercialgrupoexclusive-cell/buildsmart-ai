-- Composicoes de teste para validar:
-- quantidade da composicao x coeficiente do insumo = quantidade sugerida

INSERT INTO composicoes_proprias (codigo, descricao, unidade, grupo, ativo)
VALUES
  ('BS-COMP-001', 'Concreto simples dosado em obra FCK 20 MPa', 'M3', 'ESTRUTURA', true),
  ('BS-COMP-002', 'Alvenaria de bloco ceramico 9x19x19 cm', 'M2', 'ALVENARIA', true),
  ('BS-COMP-003', 'Pintura latex PVA duas demaos em parede', 'M2', 'ACABAMENTO', true)
ON CONFLICT (codigo) DO UPDATE SET
  descricao = EXCLUDED.descricao,
  unidade = EXCLUDED.unidade,
  grupo = EXCLUDED.grupo,
  ativo = EXCLUDED.ativo;

DELETE FROM composicao_insumos
WHERE composicao_id IN (
  SELECT id FROM composicoes_proprias
  WHERE codigo IN ('BS-COMP-001', 'BS-COMP-002', 'BS-COMP-003')
);

-- BS-COMP-001: Concreto simples por M3
INSERT INTO composicao_insumos (composicao_id, insumo_id, coeficiente)
SELECT c.id, i.id, v.coeficiente
FROM composicoes_proprias c
JOIN (
  VALUES
    ('00000364', 320.0000), -- cimento, kg
    ('00001521',   0.5500), -- areia, m3
    ('00000376',   0.7500), -- brita, m3
    ('00006163',   2.2000)  -- servente, h
) AS v(codigo_insumo, coeficiente) ON true
JOIN sinapi_insumos i ON i.codigo = v.codigo_insumo
WHERE c.codigo = 'BS-COMP-001';

-- BS-COMP-002: Alvenaria por M2
INSERT INTO composicao_insumos (composicao_id, insumo_id, coeficiente)
SELECT c.id, i.id, v.coeficiente
FROM composicoes_proprias c
JOIN (
  VALUES
    ('00007019', 0.0280), -- bloco ceramico, milheiro
    ('00000364', 5.0000), -- cimento, kg
    ('00001521', 0.0200), -- areia, m3
    ('00006117', 3.0000), -- cal, kg
    ('00010642', 0.7000), -- pedreiro, h
    ('00006163', 0.8000)  -- servente, h
) AS v(codigo_insumo, coeficiente) ON true
JOIN sinapi_insumos i ON i.codigo = v.codigo_insumo
WHERE c.codigo = 'BS-COMP-002';

-- BS-COMP-003: Pintura por M2
INSERT INTO composicao_insumos (composicao_id, insumo_id, coeficiente)
SELECT c.id, i.id, v.coeficiente
FROM composicoes_proprias c
JOIN (
  VALUES
    ('00000974', 0.1800), -- tinta, litro
    ('00006163', 0.0800)  -- servente, h
) AS v(codigo_insumo, coeficiente) ON true
JOIN sinapi_insumos i ON i.codigo = v.codigo_insumo
WHERE c.codigo = 'BS-COMP-003';
