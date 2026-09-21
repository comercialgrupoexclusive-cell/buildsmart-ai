import { describe, it, expect } from 'vitest'
import { calcularPrecoM2 } from '@/lib/investidor/service'
import { montarRelatorioPesquisa } from '@/lib/investidor/relatorio-pesquisa'
import type { ProspeccaoComparavel } from '@/lib/types'

function comp(over: Partial<ProspeccaoComparavel>): ProspeccaoComparavel {
  return {
    id: over.id ?? 'c1', prospeccao_id: 'p1', titulo: null, preco: null, area: null, preco_m2: null,
    dormitorios: null, banheiros: null, vagas: null, caracteristicas: [], estado_conservacao: null,
    fonte: null, url: null, url_confirmada: false, identificador_anuncio: null, data_evidencia: null,
    diferencas: null, tipo: null, andar: null, tipo_area: null, disponibilidade: null,
    possivel_duplicado: false, similaridade: null, latitude: null, longitude: null,
    salvo: true, favorito: false, created_at: '2026-09-21T00:00:00Z', ...over,
  }
}

describe('calcularPrecoM2', () => {
  it('divide preço por área quando ambos conhecidos', () => {
    expect(calcularPrecoM2(500000, 100)).toBe(5000)
  })
  it('é null quando preço ou área são desconhecidos', () => {
    expect(calcularPrecoM2(null, 100)).toBeNull()
    expect(calcularPrecoM2(500000, null)).toBeNull()
  })
  it('é null quando preço ou área não são positivos (nunca inferir)', () => {
    expect(calcularPrecoM2(0, 100)).toBeNull()
    expect(calcularPrecoM2(500000, 0)).toBeNull()
    expect(calcularPrecoM2(-1, 100)).toBeNull()
  })
})

describe('montarRelatorioPesquisa', () => {
  it('ficha ausente vira "não informado" — desconhecido permanece desconhecido', () => {
    const rel = montarRelatorioPesquisa({ imovelNome: 'Imóvel X', comparaveis: [] })
    expect(rel.fichaImovel.every(l => l.valor === 'não informado' && l.informado === false)).toBe(true)
    expect(rel.imovelPreco).toBeNull()
    expect(rel.imovelPrecoM2).toBeNull()
  })

  it('R$/m² do comparável só entra no gráfico quando preço e área existem', () => {
    const rel = montarRelatorioPesquisa({
      imovelNome: 'Imóvel X',
      comparaveis: [
        comp({ id: 'a', titulo: 'Com preço e área', preco: 300000, area: 75 }),
        comp({ id: 'b', titulo: 'Sem área', preco: 300000, area: null }),
      ],
    })
    expect(rel.comparaveis[0].precoM2).toBe(4000)
    expect(rel.comparaveis[1].precoM2).toBeNull()
    // gráfico de R$/m² só tem o primeiro (o segundo é desconhecido)
    expect(rel.graficoM2.map(p => p.value)).toEqual([4000])
    // gráfico de preços tem os dois (ambos têm preço)
    expect(rel.graficoPreco).toHaveLength(2)
  })

  it('marca alerta para possível duplicado e anúncio indisponível', () => {
    const rel = montarRelatorioPesquisa({
      imovelNome: 'Imóvel X',
      comparaveis: [
        comp({ id: 'a', titulo: 'Dup', possivel_duplicado: true }),
        comp({ id: 'b', titulo: 'Fora do ar', disponibilidade: 'indisponivel' }),
      ],
    })
    expect(rel.alertas.some(a => /duplicado/i.test(a))).toBe(true)
    expect(rel.alertas.some(a => /indispon/i.test(a))).toBe(true)
  })

  it('inclui a ressalva de que preço anunciado não é preço de venda', () => {
    const rel = montarRelatorioPesquisa({ imovelNome: 'Imóvel X', comparaveis: [] })
    expect(rel.observacoes.some(o => /não representam.*preço efetivo|preços anunciados/i.test(o))).toBe(true)
  })

  it('usa preço/área da ficha do imóvel analisado para o R$/m² do alvo', () => {
    const rel = montarRelatorioPesquisa({
      imovelNome: 'Imóvel X',
      fichaConfirmados: { preco_anunciado: 240000, area: 120, tipo: 'Casa' },
      comparaveis: [],
    })
    expect(rel.imovelPreco).toBe(240000)
    expect(rel.imovelArea).toBe(120)
    expect(rel.imovelPrecoM2).toBe(2000)
    expect(rel.fichaImovel.find(l => l.label === 'Tipo')?.valor).toBe('Casa')
  })
})
