import { describe, it, expect } from 'vitest'
import { mesclarOrcamentosPorProjetoEObra, escolherOrcamentoPadrao } from '@/components/projeto/ProjetoOrcamentosPanel'

// Regressão real: Resid. Jardim Allegra (projeto '5f267bb8...', obra
// '5d4f844a...'). Confirmado ao vivo via Supabase MCP em 2026-08-27:
//   - orçamento '92b55988...' ("2025_02 - Residência D&R"): projeto_id
//     preenchido, obra_id nulo, 0 itens, 0 etapas — o rascunho vazio criado
//     junto com o projeto.
//   - orçamento '3a426d94...' ("Orçamento Executivo Allegra - V1"): obra_id
//     preenchido, projeto_id nulo, 68 itens, 17 etapas — o orçamento real
//     que a Obra usa (vinculado por fora do fluxo "Iniciar Obra";
//     iniciar_obra_por_orcamento nunca rodou para este par, confirmado pela
//     ausência de linhas em orcamento_itens_baseline/planejamento_itens_baseline).
// Antes da correção, ProjetoOrcamentosPanel buscava orçamentos só por
// projeto_id — o painel do Project mostrava e selecionava por padrão o
// rascunho vazio, escondendo o orçamento real (e, por consequência, também
// a aba Planejamento, que é populada a partir do mesmo orçamento).
function rascunhoVazio() {
  return {
    id: '92b55988-56aa-4eea-ab78-a637c1ddd7f2',
    nome: '2025_02 - Residência D&R',
    versao: 1,
    status: 'em_projeto',
    is_principal: true,
    bdi_percentual: 25,
    created_at: '2026-01-01T00:00:00Z',
    obra_id: null,
  }
}

function orcamentoRealDaObra() {
  return {
    id: '3a426d94-45b5-4b42-835e-3ff7189b652f',
    nome: 'Orçamento Executivo Allegra - V1',
    versao: 1,
    status: 'em_projeto',
    is_principal: false,
    bdi_percentual: 25,
    created_at: '2026-02-01T00:00:00Z',
    obra_id: '5d4f844a-a433-4912-8b2d-45352f2569a0',
  }
}

describe('mesclarOrcamentosPorProjetoEObra', () => {
  it('inclui o orçamento vinculado só por obra_id (projeto_id nulo) — não fica órfão/invisível', () => {
    const porProjeto = [rascunhoVazio()]
    const porObra = [orcamentoRealDaObra()]
    const lista = mesclarOrcamentosPorProjetoEObra(porProjeto, porObra)
    expect(lista.map(o => o.id).sort()).toEqual([orcamentoRealDaObra().id, rascunhoVazio().id].sort())
  })

  it('deduplica quando o mesmo orçamento aparece nas duas buscas (fluxo normal pós "Iniciar Obra")', () => {
    const mesmoOrcamento = { ...orcamentoRealDaObra(), id: 'orc-1' }
    const lista = mesclarOrcamentosPorProjetoEObra([mesmoOrcamento], [mesmoOrcamento])
    expect(lista).toHaveLength(1)
  })

  it('sem obraId (projeto ainda não virou obra), lista só o que veio por projeto_id', () => {
    const lista = mesclarOrcamentosPorProjetoEObra([rascunhoVazio()], null)
    expect(lista).toHaveLength(1)
    expect(lista[0].id).toBe(rascunhoVazio().id)
  })
})

describe('escolherOrcamentoPadrao', () => {
  it('Allegra: prioriza o orçamento operacional (obra_id) mesmo quando o rascunho é is_principal', () => {
    const lista = [rascunhoVazio(), orcamentoRealDaObra()]
    expect(escolherOrcamentoPadrao(lista)).toBe(orcamentoRealDaObra().id)
  })

  it('sem nenhum obra_id, cai para is_principal', () => {
    const outro = { ...rascunhoVazio(), id: 'outro', is_principal: false }
    const principal = { ...rascunhoVazio(), id: 'principal', is_principal: true }
    expect(escolherOrcamentoPadrao([outro, principal])).toBe('principal')
  })

  it('sem obra_id nem is_principal, cai para o primeiro da lista', () => {
    const a = { ...rascunhoVazio(), id: 'a', is_principal: false }
    const b = { ...rascunhoVazio(), id: 'b', is_principal: false }
    expect(escolherOrcamentoPadrao([a, b])).toBe('a')
  })

  it('lista vazia retorna null', () => {
    expect(escolherOrcamentoPadrao([])).toBeNull()
  })
})
