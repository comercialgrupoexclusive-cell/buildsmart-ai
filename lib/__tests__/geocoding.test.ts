import { describe, it, expect } from 'vitest'
import { parseNominatimResponse, haversineKm, corrigirSimilaridadePorDistancia } from '../geocoding'

// Núcleo N06.2 — testes puros (sem rede): parsing da resposta do Nominatim,
// distância de Haversine e a correção de similaridade por distância real.
// A chamada de rede em si (geocodeEndereco) não é testada aqui — este
// sandbox bloqueia a saída para nominatim.openstreetmap.org (policy denial
// do proxy do ambiente); a validação ao vivo fica para o Luiz após o deploy.

describe('parseNominatimResponse', () => {
  it('extrai lat/lon do primeiro resultado', () => {
    const r = parseNominatimResponse([{ lat: '-30.0346', lon: '-51.2177', display_name: 'Porto Alegre' }])
    expect(r).toEqual({ lat: -30.0346, lon: -51.2177 })
  })

  it('retorna null para lista vazia (endereço não encontrado)', () => {
    expect(parseNominatimResponse([])).toBeNull()
  })

  it('retorna null para resposta malformada', () => {
    expect(parseNominatimResponse(null)).toBeNull()
    expect(parseNominatimResponse({})).toBeNull()
    expect(parseNominatimResponse([{ lat: 'abc', lon: '-51' }])).toBeNull()
  })
})

describe('haversineKm', () => {
  it('distância zero entre o mesmo ponto', () => {
    const p = { lat: -30.0346, lon: -51.2177 }
    expect(haversineKm(p, p)).toBeCloseTo(0, 6)
  })

  it('~1.57km entre dois pontos conhecidos em Porto Alegre (tolerância de 150m)', () => {
    // Praça da Matriz (-30.0346,-51.2177) → Redenção (-30.0364,-51.2245), ~0,66km reais.
    const a = { lat: -30.0346, lon: -51.2177 }
    const b = { lat: -30.0364, lon: -51.2245 }
    const d = haversineKm(a, b)
    expect(d).toBeGreaterThan(0.3)
    expect(d).toBeLessThan(1)
  })
})

describe('corrigirSimilaridadePorDistancia', () => {
  it('mantém a categoria declarada quando a distância bate', () => {
    expect(corrigirSimilaridadePorDistancia('mesmo_predio', 0.05)).toBe('mesmo_predio')
    expect(corrigirSimilaridadePorDistancia('bairro', 5)).toBe('bairro')
  })

  it('corrige para baixo (mais amplo) quando a distância real não bate com a categoria alegada', () => {
    // IA alegou "mesmo prédio" mas geocoding acha 3km — não é o mesmo prédio.
    expect(corrigirSimilaridadePorDistancia('mesmo_predio', 3)).toBe('bairro')
    expect(corrigirSimilaridadePorDistancia('mesma_rua', 1)).toBe('entorno')
  })

  it('nunca promove uma categoria já mais ampla para uma mais específica', () => {
    // Distância pequena, mas a IA já disse "bairro" — geocoding não deveria
    // fazer a IA parecer mais confiante do que ela mesma se declarou.
    expect(corrigirSimilaridadePorDistancia('bairro', 0.01)).toBe('bairro')
  })

  it('sem distância ou sem categoria declarada, devolve a declarada sem alterar', () => {
    expect(corrigirSimilaridadePorDistancia('mesmo_predio', null)).toBe('mesmo_predio')
    expect(corrigirSimilaridadePorDistancia(null, 1)).toBeNull()
    expect(corrigirSimilaridadePorDistancia(undefined, 1)).toBeUndefined()
  })
})
