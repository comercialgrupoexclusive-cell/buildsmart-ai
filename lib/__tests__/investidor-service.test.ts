import { describe, it, expect } from 'vitest'
import {
  derivarValidacaoFicha,
  normalizarChaveCampoFicha,
  planejarCampoManualFicha,
} from '@/lib/investidor/service'

describe('derivarValidacaoFicha', () => {
  it('confirma campos preenchidos e ignora os deixados em branco (pendentes)', () => {
    const r = derivarValidacaoFicha({
      dadosExtraidos: { tipo: 'Casa', area: '100' },
      confirmados: { tipo: 'Casa', area: '' },
      marcarValidada: false,
    })
    expect(r.dados_confirmados).toEqual({ tipo: 'Casa' })
    // area continua pendente → status parcial (não marcou validada)
    expect(r.status).toBe('parcial')
    expect(r.conflitos).toEqual([])
  })

  it('registra conflito quando o confirmado diverge do extraído (fonte é evidência, não verdade)', () => {
    const r = derivarValidacaoFicha({
      dadosExtraidos: { estado_conservacao: 'reformado' },
      confirmados: { estado_conservacao: 'necessita reforma' },
      marcarValidada: false,
    })
    expect(r.conflitos).toEqual([
      { campo: 'estado_conservacao', valor_extraido: 'reformado', valor_confirmado: 'necessita reforma' },
    ])
    // sem pendências (o único campo extraído foi confirmado) → validada
    expect(r.status).toBe('validada')
  })

  it('não gera conflito por diferença apenas de caixa/espaços', () => {
    const r = derivarValidacaoFicha({
      dadosExtraidos: { tipo: 'Casa' },
      confirmados: { tipo: '  casa ' },
      marcarValidada: false,
    })
    expect(r.conflitos).toEqual([])
  })

  it('marcarValidada força status validada mesmo com campos pendentes', () => {
    const r = derivarValidacaoFicha({
      dadosExtraidos: { tipo: 'Casa', area: '100' },
      confirmados: { tipo: 'Casa' },
      marcarValidada: true,
    })
    expect(r.status).toBe('validada')
  })
})

describe('normalizarChaveCampoFicha', () => {
  it('minúsculas e underscore no lugar de espaços', () => {
    expect(normalizarChaveCampoFicha('  Estado de Conservação ')).toBe('estado_de_conservação')
  })
})

describe('planejarCampoManualFicha', () => {
  it('retorna null quando chave ou valor são inválidos', () => {
    expect(planejarCampoManualFicha({ fichaExistente: null, chave: '   ', valor: 'x' })).toBeNull()
    expect(planejarCampoManualFicha({ fichaExistente: null, chave: 'tipo', valor: '  ' })).toBeNull()
  })

  it('planeja INSERT quando não existe ficha', () => {
    const p = planejarCampoManualFicha({ fichaExistente: null, chave: 'Tipo', valor: 'Casa' })
    expect(p).toEqual({ tipo: 'inserir', dados_confirmados: { tipo: 'Casa' } })
  })

  it('planeja UPDATE mesclando no confirmado e promovendo pendente→parcial', () => {
    const p = planejarCampoManualFicha({
      fichaExistente: { id: 'f1', status: 'pendente', dados_confirmados: { area: '100' } },
      chave: 'tipo',
      valor: 'Casa',
    })
    expect(p).toEqual({
      tipo: 'atualizar',
      fichaId: 'f1',
      dados_confirmados: { area: '100', tipo: 'Casa' },
      status: 'parcial',
    })
  })

  it('UPDATE preserva status validada (não rebaixa)', () => {
    const p = planejarCampoManualFicha({
      fichaExistente: { id: 'f1', status: 'validada', dados_confirmados: {} },
      chave: 'tipo',
      valor: 'Casa',
    })
    expect(p?.tipo).toBe('atualizar')
    if (p?.tipo === 'atualizar') expect(p.status).toBe('validada')
  })
})
