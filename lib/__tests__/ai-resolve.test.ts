import { describe, it, expect } from 'vitest'
import { resolverComSeguranca, normalizarNome, formatarAmbiguidade } from '../ai-resolve'

type Obra = { id: string; nome: string }

describe('resolverComSeguranca', () => {
  it('#1 — nenhuma candidata => nao_encontrada', () => {
    const r = resolverComSeguranca<Obra>('Allegra', [], o => o.nome)
    expect(r.tipo).toBe('nao_encontrada')
  })

  it('#2 — uma única candidata (fuzzy) => unica', () => {
    const candidatos: Obra[] = [{ id: '1', nome: 'Resid. Jardim Allegra' }]
    const r = resolverComSeguranca('Allegra', candidatos, o => o.nome)
    expect(r.tipo).toBe('unica')
    if (r.tipo === 'unica') expect(r.item.id).toBe('1')
  })

  it('#3 — duas candidatas fuzzy, nenhuma exata => ambigua (nunca escolhe sozinha)', () => {
    const candidatos: Obra[] = [
      { id: '1', nome: 'Resid. Jardim Allegra - Revisão Orçamentária' },
      { id: '2', nome: 'Allegra Fase 2' },
    ]
    const r = resolverComSeguranca('Allegra', candidatos, o => o.nome)
    expect(r.tipo).toBe('ambigua')
    if (r.tipo === 'ambigua') expect(r.candidatos).toHaveLength(2)
  })

  it('correspondência exata entre várias fuzzy => resolve para a exata, não fica ambígua', () => {
    const candidatos: Obra[] = [
      { id: '1', nome: 'Allegra' },
      { id: '2', nome: 'Allegra Fase 2' },
      { id: '3', nome: 'Resid. Jardim Allegra' },
    ]
    const r = resolverComSeguranca('Allegra', candidatos, o => o.nome)
    expect(r.tipo).toBe('unica')
    if (r.tipo === 'unica') expect(r.item.id).toBe('1')
  })

  it('exata ignora acento/maiúsculas', () => {
    const candidatos: Obra[] = [
      { id: '1', nome: 'Revisão Orçamentária' },
      { id: '2', nome: 'Revisão Orçamentária 2' },
    ]
    const r = resolverComSeguranca('revisao orcamentaria', candidatos, o => o.nome)
    expect(r.tipo).toBe('unica')
    if (r.tipo === 'unica') expect(r.item.id).toBe('1')
  })

  it('#4 — nome não encontrado entre candidatas vazias permanece nao_encontrada mesmo com nome vazio', () => {
    const r = resolverComSeguranca('', [], (o: Obra) => o.nome)
    expect(r.tipo).toBe('nao_encontrada')
  })
})

describe('normalizarNome', () => {
  it('remove acentos e normaliza caixa', () => {
    expect(normalizarNome('Resid. Jardim Allegra - Revisão Orçamentária')).toBe('resid. jardim allegra - revisao orcamentaria')
  })
  it('trata string vazia/undefined sem lançar', () => {
    expect(normalizarNome('')).toBe('')
    expect(normalizarNome(undefined as unknown as string)).toBe('')
  })
})

describe('formatarAmbiguidade', () => {
  it('lista os nomes e pergunta qual', () => {
    const msg = formatarAmbiguidade('obras', 'Allegra', ['Allegra Fase 1', 'Allegra Fase 2'])
    expect(msg).toContain('2 obras')
    expect(msg).toContain('Allegra Fase 1')
    expect(msg).toContain('Allegra Fase 2')
    expect(msg).toMatch(/qual del/i)
  })
})
