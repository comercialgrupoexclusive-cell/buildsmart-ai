import { describe, expect, it } from 'vitest'
import { colunaDoItem, moverItemEntreColunas, reordenarNaColuna } from '../kanban-utils'

describe('kanban-utils — lógica pura do Kanban de Processos', () => {
  describe('moverItemEntreColunas', () => {
    it('move o item da coluna de origem para a posição informada na coluna de destino', () => {
      const colunas = { aquisicao: ['p1', 'p2'], reforma: ['p3'] }
      const resultado = moverItemEntreColunas(colunas, 'aquisicao', 'reforma', 'p1', 0)
      expect(resultado).toEqual({ aquisicao: ['p2'], reforma: ['p1', 'p3'] })
    })

    it('não altera as colunas originais (imutável)', () => {
      const colunas = { aquisicao: ['p1', 'p2'], reforma: ['p3'] }
      moverItemEntreColunas(colunas, 'aquisicao', 'reforma', 'p1', 0)
      expect(colunas).toEqual({ aquisicao: ['p1', 'p2'], reforma: ['p3'] })
    })

    it('insere no fim quando o índice de destino é maior que o tamanho da coluna', () => {
      const colunas = { a: ['p1'], b: ['p2'] }
      const resultado = moverItemEntreColunas(colunas, 'a', 'b', 'p1', 999)
      expect(resultado.b).toEqual(['p2', 'p1'])
    })

    it('trata índice de destino negativo como 0', () => {
      const colunas = { a: ['p1'], b: ['p2'] }
      const resultado = moverItemEntreColunas(colunas, 'a', 'b', 'p1', -5)
      expect(resultado.b).toEqual(['p1', 'p2'])
    })

    it('retorna as colunas inalteradas quando a coluna de origem não existe', () => {
      const colunas = { a: ['p1'] }
      const resultado = moverItemEntreColunas(colunas, 'inexistente', 'a', 'p1', 0)
      expect(resultado).toBe(colunas)
    })

    it('retorna as colunas inalteradas quando a coluna de destino não existe', () => {
      const colunas = { a: ['p1'] }
      const resultado = moverItemEntreColunas(colunas, 'a', 'inexistente', 'p1', 0)
      expect(resultado).toBe(colunas)
    })

    it('retorna as colunas inalteradas quando o item não está na coluna de origem', () => {
      const colunas = { a: ['p1'], b: ['p2'] }
      const resultado = moverItemEntreColunas(colunas, 'a', 'b', 'p-fantasma', 0)
      expect(resultado).toBe(colunas)
    })
  })

  describe('reordenarNaColuna', () => {
    it('reordena os itens dentro da mesma coluna', () => {
      const colunas = { a: ['p1', 'p2', 'p3'] }
      const resultado = reordenarNaColuna(colunas, 'a', 0, 2)
      expect(resultado.a).toEqual(['p2', 'p3', 'p1'])
    })

    it('sujeita o índice de destino aos limites da coluna', () => {
      const colunas = { a: ['p1', 'p2', 'p3'] }
      const resultado = reordenarNaColuna(colunas, 'a', 0, 999)
      expect(resultado.a).toEqual(['p2', 'p3', 'p1'])
    })

    it('retorna as colunas inalteradas quando a coluna não existe', () => {
      const colunas = { a: ['p1'] }
      const resultado = reordenarNaColuna(colunas, 'inexistente', 0, 0)
      expect(resultado).toBe(colunas)
    })

    it('retorna as colunas inalteradas quando o índice de origem é inválido', () => {
      const colunas = { a: ['p1'] }
      const resultado = reordenarNaColuna(colunas, 'a', 5, 0)
      expect(resultado).toBe(colunas)
    })
  })

  describe('colunaDoItem', () => {
    it('encontra a coluna que contém o item', () => {
      const colunas = { a: ['p1'], b: ['p2', 'p3'] }
      expect(colunaDoItem(colunas, 'p3')).toBe('b')
    })

    it('retorna null quando o item não está em nenhuma coluna', () => {
      const colunas = { a: ['p1'], b: ['p2'] }
      expect(colunaDoItem(colunas, 'p-fantasma')).toBeNull()
    })
  })
})
