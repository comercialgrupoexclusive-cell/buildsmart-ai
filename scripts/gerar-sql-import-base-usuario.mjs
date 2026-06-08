// Lê a planilha modelo_para_buildsmartR01.xlsx (base real do usuário, vinda do
// sistema antigo) e gera um arquivo SQL pronto para rodar no SQL Editor do
// Supabase, inserindo:
//   - insumos_proprios   (241 insumos — Tipo → categoria, Categoria → grupo)
//   - composicoes_proprias (94 composições — grupo inferido pela faixa do código)
//   - composicao_insumos (431 itens — vínculo composição × insumo próprio)
//
// As colunas "ID"/"ID Composição"/"ID Insumo" da planilha são do sistema
// antigo e servem só para correlacionar as abas aqui no script — não são
// gravadas no banco. A correlação final em produção usa o `codigo`, que é
// UNIQUE em ambas as tabelas.
//
// Uso: node scripts/gerar-sql-import-base-usuario.mjs

import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')
const __dirname = dirname(fileURLToPath(import.meta.url))
const ORIGEM = 'C:\\Users\\PC\\Downloads\\modelos\\modelo_para_buildsmartR01.xlsx'
const DESTINO = join(__dirname, '..', 'supabase', 'import_base_usuario.sql')

const TIPO_PARA_CATEGORIA = { E: 'EQUIPAMENTO', M: 'MATERIAL', MO: 'MAO_DE_OBRA' }

// Faixas de código observadas nas 94 composições → grupo (sem campo de
// categoria próprio na planilha de composições, só nos insumos)
const FAIXAS_GRUPO = [
  [1000, 1099, 'SERVICOS_GERAIS'],
  [1100, 1199, 'SERVICOS_GERAIS'],
  [1200, 1299, 'ACABAMENTO'],
  [1300, 1499, 'REVESTIMENTO'],
  [1500, 1799, 'INSTALACOES'],
  [1800, 1899, 'ACABAMENTO'],
  [1900, 1999, 'SERVICOS_GERAIS'],
  [2000, 2999, 'FUNDACAO'],
  [3000, 3999, 'ESTRUTURA'],
  [4000, 4999, 'ALVENARIA'],
  [5000, 6999, 'ACABAMENTO'],
  [7000, 7999, 'COBERTURA'],
  [8000, 9999, 'REVESTIMENTO'],
]

function inferirGrupo(codigo) {
  const n = parseInt(String(codigo).replace(/\D/g, ''), 10)
  if (Number.isFinite(n)) {
    for (const [ini, fim, grupo] of FAIXAS_GRUPO) {
      if (n >= ini && n <= fim) return grupo
    }
  }
  return 'GERAL'
}

function escapeSql(v) {
  if (v == null) return 'NULL'
  return `'${String(v).replace(/'/g, "''")}'`
}

const wb = XLSX.readFile(ORIGEM)
const insumos = XLSX.utils.sheet_to_json(wb.Sheets['Insumos'], { defval: '' })
const composicoes = XLSX.utils.sheet_to_json(wb.Sheets['Composições'], { defval: '' })
const itens = XLSX.utils.sheet_to_json(wb.Sheets['Itens_Composição'], { defval: '' })

console.log(`Lidos: ${insumos.length} insumos, ${composicoes.length} composições, ${itens.length} itens`)

// ─── Verificação de integridade (órfãos) ────────────────────────────────────
const idsInsumo = new Set(insumos.map(i => i.ID))
const idsComposicao = new Set(composicoes.map(c => c.ID))
const orfaos = itens.filter(it => !idsComposicao.has(it['ID Composição']) || !idsInsumo.has(it['ID Insumo']))
if (orfaos.length) {
  console.warn(`AVISO: ${orfaos.length} itens com referência órfã — serão ignorados na geração.`)
}

// mapas auxiliares ID(antigo) → registro, para resolver os vínculos por código
const insumoPorId = new Map(insumos.map(i => [i.ID, i]))
const composicaoPorId = new Map(composicoes.map(c => [c.ID, c]))

let sql = `-- ====================================================================
-- Importação da base de dados do usuário (sistema antigo → BuildSmart AI)
-- Gerado automaticamente por scripts/gerar-sql-import-base-usuario.mjs
-- a partir de modelo_para_buildsmartR01.xlsx
--
-- Conteúdo: ${insumos.length} insumos próprios, ${composicoes.length} composições
-- próprias e ${itens.length - orfaos.length} vínculos composição↔insumo.
--
-- IMPORTANTE: rode antes a migração supabase/migration_grupo_insumos_proprios.sql
-- (adiciona a coluna \`grupo\` em insumos_proprios usada abaixo).
--
-- Os "ID"/"ID Composição"/"ID Insumo" da planilha do sistema antigo NÃO são
-- gravados — a correlação aqui usa o \`codigo\`, que é UNIQUE em ambas as
-- tabelas (insumos_proprios.codigo e composicoes_proprias.codigo).
--
-- Idempotente: pode rodar mais de uma vez (ON CONFLICT (codigo) DO UPDATE).
-- ====================================================================

-- ─── 1) Insumos próprios ────────────────────────────────────────────────────
INSERT INTO insumos_proprios (codigo, descricao, unidade, categoria, grupo, preco_unitario, ativo) VALUES
`

const linhasInsumos = insumos.map(i => {
  const categoria = TIPO_PARA_CATEGORIA[String(i.Tipo).trim().toUpperCase()] || 'MATERIAL'
  const ativo = String(i.Status).trim().toLowerCase() === 'ativo'
  return `  (${escapeSql(i['Código'])}, ${escapeSql(i['Descrição'])}, ${escapeSql(i['Unidade'])}, ${escapeSql(categoria)}, ${escapeSql(i['Categoria'])}, ${Number(i['Preço (R$)']) || 0}, ${ativo})`
})
sql += linhasInsumos.join(',\n') + '\n'
sql += `ON CONFLICT (codigo) DO UPDATE SET
  descricao = EXCLUDED.descricao,
  unidade = EXCLUDED.unidade,
  categoria = EXCLUDED.categoria,
  grupo = EXCLUDED.grupo,
  preco_unitario = EXCLUDED.preco_unitario,
  ativo = EXCLUDED.ativo;

`

sql += `-- ─── 2) Composições próprias ─────────────────────────────────────────────────
-- grupo inferido pela faixa do código (a planilha de origem não tem esse campo
-- para composições — só para insumos). Pode ser ajustado depois pela tela.
INSERT INTO composicoes_proprias (codigo, descricao, unidade, grupo, ativo) VALUES
`

const linhasComposicoes = composicoes.map(c => {
  const ativo = String(c.Status).trim().toLowerCase() === 'ativo'
  const grupo = inferirGrupo(c['Código'])
  return `  (${escapeSql(c['Código'])}, ${escapeSql(c['Descrição'])}, ${escapeSql(c['Unidade Produção'])}, ${escapeSql(grupo)}, ${ativo})`
})
sql += linhasComposicoes.join(',\n') + '\n'
sql += `ON CONFLICT (codigo) DO UPDATE SET
  descricao = EXCLUDED.descricao,
  unidade = EXCLUDED.unidade,
  grupo = EXCLUDED.grupo,
  ativo = EXCLUDED.ativo;

`

sql += `-- ─── 3) Vínculos composição × insumo (composicao_insumos) ───────────────────
-- Resolve pelo \`codigo\` (UNIQUE) de cada lado — não depende dos IDs do
-- sistema antigo. Remove vínculos anteriores destas composições antes de
-- reinserir, para a importação ser idempotente.
DELETE FROM composicao_insumos
WHERE composicao_id IN (
  SELECT id FROM composicoes_proprias WHERE codigo IN (
${composicoes.map(c => `    ${escapeSql(c['Código'])}`).join(',\n')}
  )
);

INSERT INTO composicao_insumos (composicao_id, insumo_proprio_id, coeficiente)
SELECT cp.id, ip.id, v.coeficiente
FROM (VALUES
`

const linhasItens = itens
  .filter(it => idsComposicao.has(it['ID Composição']) && idsInsumo.has(it['ID Insumo']))
  .map(it => {
    const comp = composicaoPorId.get(it['ID Composição'])
    const ins = insumoPorId.get(it['ID Insumo'])
    return `  (${escapeSql(comp['Código'])}, ${escapeSql(ins['Código'])}, ${Number(it['Coeficiente']) || 0})`
  })
sql += linhasItens.join(',\n') + '\n'
sql += `) AS v(codigo_composicao, codigo_insumo, coeficiente)
JOIN composicoes_proprias cp ON cp.codigo = v.codigo_composicao
JOIN insumos_proprios ip ON ip.codigo = v.codigo_insumo;

-- ─── Validação ───────────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM insumos_proprios)   AS total_insumos_proprios,
  (SELECT COUNT(*) FROM composicoes_proprias) AS total_composicoes_proprias,
  (SELECT COUNT(*) FROM composicao_insumos) AS total_vinculos;
`

writeFileSync(DESTINO, sql, 'utf-8')
console.log(`SQL gerado em: ${DESTINO}`)
console.log(`  ${linhasInsumos.length} insumos | ${linhasComposicoes.length} composições | ${linhasItens.length} vínculos (${orfaos.length} órfãos ignorados)`)
