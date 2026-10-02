import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { carregarVisaoInvestidor, extrairUfCidade } from '../investidor/carteira'

type Res = { data: unknown; error: unknown }

function builder(result: Res) {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in']) b[m] = () => b
  b.then = (resolve: (v: Res) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return b
}

function fakeSupabase(porTabela: Record<string, Res>): SupabaseClient {
  return { from: (t: string) => builder(porTabela[t] ?? { data: [], error: null }) } as unknown as SupabaseClient
}

describe('extrairUfCidade', () => {
  it('pega UF e cidade de endereços livres', () => {
    expect(extrairUfCidade('Guaíba, RS')).toEqual({ uf: 'RS', cidade: 'Guaíba' })
    expect(extrairUfCidade('Cachoeirinha, RS · Casa')).toEqual({ uf: 'RS', cidade: 'Cachoeirinha' })
    expect(extrairUfCidade('Rua X, 10 - Biguaçu / SC')).toEqual({ uf: 'SC', cidade: 'Biguaçu' })
  })
  it('sem UF retorna nulos', () => {
    expect(extrairUfCidade('Endereço sem estado')).toEqual({ uf: null, cidade: null })
    expect(extrairUfCidade(null)).toEqual({ uf: null, cidade: null })
  })
})

describe('carregarVisaoInvestidor', () => {
  it('investido = arremate + custos pagos; prospecção pública fica fora dos totais', async () => {
    const supabase = fakeSupabase({
      projetos: { data: [
        { id: 'p1', nome: 'Ap 448 - Guaíba', endereco: 'Guaíba, RS', foto_url: null, fase_investimento: 'regularizacao_posse' },
      ], error: null },
      prospeccoes: { data: [
        { id: 'pr1', nome: 'Ap 448', endereco: 'Guaíba, RS', project_id: 'p1', is_venda: false, tipo_aquisicao: 'leilao', data_leilao: null },
        { id: 'pr2', nome: 'Casa CAIXA', endereco: 'Januária, MG', project_id: null, is_venda: false, tipo_aquisicao: 'leilao', data_leilao: null },
      ], error: null },
      prospeccao_cenarios: { data: [
        { prospeccao_id: 'pr1', valor_arrematacao: 81964.82 },
        { prospeccao_id: 'pr2', valor_arrematacao: 138420.39 },
      ], error: null },
      projeto_custos_aquisicao: { data: [
        { projeto_id: 'p1', valor: 20865.13 },
      ], error: null },
    })

    const v = await carregarVisaoInvestidor(supabase)

    expect(v.kpis.nAtivos).toBe(1)
    expect(v.kpis.totalArrematado).toBeCloseTo(81964.82, 2)
    expect(v.kpis.custosPagos).toBeCloseTo(20865.13, 2)
    expect(v.kpis.investido).toBeCloseTo(102829.95, 2)

    const ativo = v.ativos[0]
    expect(ativo.investido).toBeCloseTo(102829.95, 2)
    expect(ativo.uf).toBe('RS')
    expect(ativo.faseLabel).toBe('Regularização/Posse')

    // Prospecção pública: fora da carteira, não entra nos KPIs financeiros.
    expect(v.prospeccoes).toHaveLength(1)
    expect(v.prospeccoes[0].id).toBe('pr2')

    // Por estado: RS com 1 ativo; MG aparece como prospecção.
    const rs = v.porEstado.find(e => e.uf === 'RS')
    expect(rs?.ativos).toBe(1)
    const mg = v.porEstado.find(e => e.uf === 'MG')
    expect(mg?.prospeccoes).toBe(1)
  })
})
