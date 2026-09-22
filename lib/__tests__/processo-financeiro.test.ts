// Financeiro Real do Processo (Compatibilização Funcional 01/parte B).
// Mesmo padrão de processo.test.ts: FakeDB em memória exercitando as
// Actions públicas ponta a ponta.
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { FakeDB } from './fake-supabase'
import { criarProcesso } from '../processo/actions/processo-actions'
import {
  atualizarLancamentoFinanceiro,
  criarLancamentoFinanceiro,
  excluirLancamentoFinanceiro,
  listarLancamentosFinanceiros,
  marcarLancamentoRealizado,
  obterResumoFinanceiroDoProcesso,
} from '../processo-financeiro/actions/processo-financeiro-actions'

describe('Financeiro Real do Processo — Compatibilização Funcional 01/parte B', () => {
  let db: FakeDB

  beforeEach(() => {
    db = new FakeDB()
    const originalRpc = db.rpc.bind(db)
    vi.spyOn(db, 'rpc').mockImplementation((name, params) => name === 'current_organization_id'
      ? Promise.resolve({ data: 'org-teste', error: null }) : originalRpc(name, params))
    db.seed('organization_members', [
      { id: 'org-member-1', organization_id: 'org-teste', profile_id: 'profile-teste', ativo: true, papel: 'owner' },
    ])
  })

  function supa(): SupabaseClient {
    return db as unknown as SupabaseClient
  }

  async function novoProcesso() {
    return criarProcesso(supa(), { nome: 'Casa Cond Guaíba' })
  }

  describe('criarLancamentoFinanceiro', () => {
    it('cria um lançamento de SAÍDA com status PENDENTE por padrão', async () => {
      const processo = await novoProcesso()
      const l = await criarLancamentoFinanceiro(supa(), {
        processo_id: processo.id, natureza: 'SAIDA', categoria: 'Reforma', valor: 2110.78,
      })
      expect(l.status).toBe('PENDENTE')
      expect(l.valor).toBe(2110.78)
      expect(l.categoria).toBe('Reforma')
    })

    it('rejeita processo inexistente', async () => {
      await expect(criarLancamentoFinanceiro(supa(), {
        processo_id: 'nao-existe', natureza: 'SAIDA', categoria: 'Reforma', valor: 100,
      })).rejects.toThrow('Processo não encontrado.')
    })

    it('rejeita categoria vazia', async () => {
      const processo = await novoProcesso()
      await expect(criarLancamentoFinanceiro(supa(), {
        processo_id: processo.id, natureza: 'SAIDA', categoria: '   ', valor: 100,
      })).rejects.toThrow('Categoria é obrigatória.')
    })

    it('rejeita valor zero ou negativo', async () => {
      const processo = await novoProcesso()
      await expect(criarLancamentoFinanceiro(supa(), {
        processo_id: processo.id, natureza: 'SAIDA', categoria: 'Reforma', valor: 0,
      })).rejects.toThrow('Valor precisa ser maior que zero.')
      await expect(criarLancamentoFinanceiro(supa(), {
        processo_id: processo.id, natureza: 'SAIDA', categoria: 'Reforma', valor: -10,
      })).rejects.toThrow('Valor precisa ser maior que zero.')
    })

    it('rejeita natureza inválida', async () => {
      const processo = await novoProcesso()
      const input = { processo_id: processo.id, natureza: 'NEUTRO', categoria: 'Reforma', valor: 100 } as unknown as Parameters<typeof criarLancamentoFinanceiro>[1]
      await expect(criarLancamentoFinanceiro(supa(), input)).rejects.toThrow('Natureza inválida')
    })
  })

  describe('listarLancamentosFinanceiros', () => {
    it('lista apenas os lançamentos do Processo informado', async () => {
      const p1 = await novoProcesso()
      const p2 = await criarProcesso(supa(), { nome: 'Outro Processo' })
      await criarLancamentoFinanceiro(supa(), { processo_id: p1.id, natureza: 'SAIDA', categoria: 'Reforma', valor: 100 })
      await criarLancamentoFinanceiro(supa(), { processo_id: p2.id, natureza: 'SAIDA', categoria: 'IPTU', valor: 50 })

      const lista = await listarLancamentosFinanceiros(supa(), p1.id)
      expect(lista).toHaveLength(1)
      expect(lista[0].categoria).toBe('Reforma')
    })
  })

  describe('atualizarLancamentoFinanceiro', () => {
    it('atualiza campos permitidos', async () => {
      const processo = await novoProcesso()
      const l = await criarLancamentoFinanceiro(supa(), { processo_id: processo.id, natureza: 'SAIDA', categoria: 'Reforma', valor: 100 })
      const atualizado = await atualizarLancamentoFinanceiro(supa(), l.id, { valor: 200, descricao: 'Reforma NFG julho' })
      expect(atualizado.valor).toBe(200)
      expect(atualizado.descricao).toBe('Reforma NFG julho')
    })

    it('rejeita lançamento inexistente', async () => {
      await expect(atualizarLancamentoFinanceiro(supa(), 'nao-existe', { valor: 100 })).rejects.toThrow('Lançamento não encontrado.')
    })
  })

  describe('excluirLancamentoFinanceiro', () => {
    it('remove o lançamento', async () => {
      const processo = await novoProcesso()
      const l = await criarLancamentoFinanceiro(supa(), { processo_id: processo.id, natureza: 'SAIDA', categoria: 'Reforma', valor: 100 })
      await excluirLancamentoFinanceiro(supa(), l.id)
      expect(await listarLancamentosFinanceiros(supa(), processo.id)).toEqual([])
    })
  })

  describe('marcarLancamentoRealizado', () => {
    it('marca REALIZADO e preenche data_realizacao quando ausente', async () => {
      const processo = await novoProcesso()
      const l = await criarLancamentoFinanceiro(supa(), { processo_id: processo.id, natureza: 'SAIDA', categoria: 'Reforma', valor: 100 })
      const realizado = await marcarLancamentoRealizado(supa(), l.id)
      expect(realizado.status).toBe('REALIZADO')
      expect(realizado.data_realizacao).not.toBeNull()
    })

    it('usa a data informada quando passada', async () => {
      const processo = await novoProcesso()
      const l = await criarLancamentoFinanceiro(supa(), { processo_id: processo.id, natureza: 'SAIDA', categoria: 'Reforma', valor: 100 })
      const realizado = await marcarLancamentoRealizado(supa(), l.id, '2026-07-15')
      expect(realizado.data_realizacao).toBe('2026-07-15')
    })
  })

  describe('obterResumoFinanceiroDoProcesso — derivado da fonte única', () => {
    it('soma entradas/saídas realizadas e pendentes, ignorando CANCELADO', async () => {
      const processo = await novoProcesso()
      await criarLancamentoFinanceiro(supa(), { processo_id: processo.id, natureza: 'SAIDA', categoria: 'Arrematação', valor: 101555.89, status: 'REALIZADO' })
      await criarLancamentoFinanceiro(supa(), { processo_id: processo.id, natureza: 'SAIDA', categoria: 'Leiloeiro', valor: 5077.79, status: 'REALIZADO' })
      await criarLancamentoFinanceiro(supa(), { processo_id: processo.id, natureza: 'SAIDA', categoria: 'Reforma', valor: 1000, status: 'PENDENTE' })
      await criarLancamentoFinanceiro(supa(), { processo_id: processo.id, natureza: 'ENTRADA', categoria: 'Venda', valor: 200000, status: 'PENDENTE' })
      const cancelado = await criarLancamentoFinanceiro(supa(), { processo_id: processo.id, natureza: 'SAIDA', categoria: 'Erro de digitação', valor: 999999 })
      await atualizarLancamentoFinanceiro(supa(), cancelado.id, { status: 'CANCELADO' })

      const resumo = await obterResumoFinanceiroDoProcesso(supa(), processo.id)
      expect(resumo.saidas_realizadas).toBeCloseTo(106633.68, 2)
      expect(resumo.entradas_realizadas).toBe(0)
      expect(resumo.saldo_realizado).toBeCloseTo(-106633.68, 2)
      expect(resumo.saidas_pendentes).toBe(1000)
      expect(resumo.entradas_pendentes).toBe(200000)
    })

    it('processo sem lançamentos tem resumo zerado', async () => {
      const processo = await novoProcesso()
      const resumo = await obterResumoFinanceiroDoProcesso(supa(), processo.id)
      expect(resumo).toEqual({
        entradas_realizadas: 0, saidas_realizadas: 0, saldo_realizado: 0, entradas_pendentes: 0, saidas_pendentes: 0,
      })
    })
  })
})
