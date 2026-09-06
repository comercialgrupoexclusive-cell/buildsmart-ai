// Motor de Processo (P3.1 — Fundação). Mesmo padrão de
// investidor-ai-tools.test.ts: FakeDB em memória (sem rede, sandbox bloqueia
// *.supabase.co) exercitando as Actions públicas ponta a ponta.
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, beforeEach } from 'vitest'
import { FakeDB } from './fake-supabase'
import {
  alterarStatusProcesso,
  atualizarDadosProcesso,
  criarProcesso,
  desabilitarModulo,
  habilitarModulo,
  listarModulosDisponiveis,
  listarModulosDoProcesso,
  listarProcessos,
  obterProcesso,
} from '../processo/actions/processo-actions'
import { modulosHabilitadosPorPadrao } from '../processo/domain/module-registry'

describe('Motor de Processo — P3.1', () => {
  let db: FakeDB

  beforeEach(() => {
    db = new FakeDB()
  })

  function supa(): SupabaseClient {
    return db as unknown as SupabaseClient
  }

  describe('criarProcesso', () => {
    it('cria com status ACTIVE e os módulos habilitados por padrão do registry', async () => {
      const processo = await criarProcesso(supa(), { nome: 'Allegra' })
      expect(processo.nome).toBe('Allegra')
      expect(processo.status).toBe('ACTIVE')
      expect(processo.archived_at).toBeNull()

      const modulos = await listarModulosDoProcesso(supa(), processo.id)
      const chaves = modulos.map(m => m.module_key).sort()
      expect(chaves).toEqual([...modulosHabilitadosPorPadrao()].sort())
      expect(modulos.every(m => m.enabled)).toBe(true)
    })

    it('aceita lista explícita de módulos em vez do padrão', async () => {
      const processo = await criarProcesso(supa(), { nome: 'Allegra', modulos: ['orcamento'] })
      const modulos = await listarModulosDoProcesso(supa(), processo.id)
      expect(modulos.map(m => m.module_key)).toEqual(['orcamento'])
    })

    it('rejeita nome vazio', async () => {
      await expect(criarProcesso(supa(), { nome: '   ' })).rejects.toThrow('Nome do processo é obrigatório.')
    })

    it('rejeita módulo desconhecido', async () => {
      await expect(criarProcesso(supa(), { nome: 'Allegra', modulos: ['modulo_inexistente'] })).rejects.toThrow(
        /Módulo\(s\) desconhecido\(s\)/,
      )
    })

    it('normaliza campos de texto em branco para null', async () => {
      const processo = await criarProcesso(supa(), { nome: 'Allegra', endereco: '   ', cliente_nome: '' })
      expect(processo.endereco).toBeNull()
      expect(processo.cliente_nome).toBeNull()
    })
  })

  describe('obterProcesso / listarProcessos', () => {
    it('retorna null para id inexistente', async () => {
      expect(await obterProcesso(supa(), 'nao-existe')).toBeNull()
    })

    it('lista filtrando por status e por nome (q)', async () => {
      const a = await criarProcesso(supa(), { nome: 'Jardim Allegra' })
      const b = await criarProcesso(supa(), { nome: 'Alpes do Vale' })
      await alterarStatusProcesso(supa(), b.id, 'ON_HOLD')

      const ativos = await listarProcessos(supa(), { status: 'ACTIVE' })
      expect(ativos.map(p => p.id)).toEqual([a.id])

      const porNome = await listarProcessos(supa(), { q: 'allegra' })
      expect(porNome.map(p => p.id)).toEqual([a.id])
    })
  })

  describe('atualizarDadosProcesso', () => {
    it('atualiza campos permitidos e mantém os demais', async () => {
      const processo = await criarProcesso(supa(), { nome: 'Allegra', endereco: 'Rua A' })
      await atualizarDadosProcesso(supa(), processo.id, { endereco: 'Rua B' })
      const atualizado = await obterProcesso(supa(), processo.id)
      expect(atualizado?.endereco).toBe('Rua B')
      expect(atualizado?.nome).toBe('Allegra')
    })

    it('rejeita nome vazio no patch', async () => {
      const processo = await criarProcesso(supa(), { nome: 'Allegra' })
      await expect(atualizarDadosProcesso(supa(), processo.id, { nome: '  ' })).rejects.toThrow(
        'Nome do processo é obrigatório.',
      )
    })

    it('rejeita processo inexistente', async () => {
      await expect(atualizarDadosProcesso(supa(), 'nao-existe', { nome: 'X' })).rejects.toThrow(
        'Processo não encontrado.',
      )
    })
  })

  describe('alterarStatusProcesso', () => {
    it('arquiva preenchendo archived_at e restaura limpando', async () => {
      const processo = await criarProcesso(supa(), { nome: 'Allegra' })
      const arquivado = await alterarStatusProcesso(supa(), processo.id, 'ARCHIVED')
      expect(arquivado.status).toBe('ARCHIVED')
      expect(arquivado.archived_at).not.toBeNull()

      const restaurado = await alterarStatusProcesso(supa(), processo.id, 'ACTIVE')
      expect(restaurado.status).toBe('ACTIVE')
      expect(restaurado.archived_at).toBeNull()
    })

    it('rejeita status fora do vocabulário canônico', async () => {
      const processo = await criarProcesso(supa(), { nome: 'Allegra' })
      // @ts-expect-error status inválido de propósito
      await expect(alterarStatusProcesso(supa(), processo.id, 'FINALIZADO')).rejects.toThrow('Status inválido')
    })
  })

  describe('habilitarModulo / desabilitarModulo', () => {
    it('desabilita um módulo habilitado por padrão e reabilita depois', async () => {
      const processo = await criarProcesso(supa(), { nome: 'Allegra' })
      await desabilitarModulo(supa(), processo.id, 'tarefas')
      let modulos = await listarModulosDoProcesso(supa(), processo.id)
      expect(modulos.find(m => m.module_key === 'tarefas')?.enabled).toBe(false)

      await habilitarModulo(supa(), processo.id, 'tarefas')
      modulos = await listarModulosDoProcesso(supa(), processo.id)
      expect(modulos.find(m => m.module_key === 'tarefas')?.enabled).toBe(true)
    })

    it('habilita um módulo que não fazia parte da lista inicial', async () => {
      const processo = await criarProcesso(supa(), { nome: 'Allegra', modulos: ['orcamento'] })
      await habilitarModulo(supa(), processo.id, 'financeiro')
      const modulos = await listarModulosDoProcesso(supa(), processo.id)
      expect(modulos.map(m => m.module_key).sort()).toEqual(['financeiro', 'orcamento'])
    })

    it('rejeita módulo desconhecido', async () => {
      const processo = await criarProcesso(supa(), { nome: 'Allegra' })
      await expect(habilitarModulo(supa(), processo.id, 'modulo_inexistente')).rejects.toThrow('Módulo desconhecido')
    })

    it('rejeita processo inexistente', async () => {
      await expect(habilitarModulo(supa(), 'nao-existe', 'orcamento')).rejects.toThrow('Processo não encontrado.')
    })
  })

  it('listarModulosDisponiveis expõe o registry completo', () => {
    const modulos = listarModulosDisponiveis()
    expect(modulos.map(m => m.key)).toContain('orcamento')
    expect(modulos.length).toBeGreaterThanOrEqual(12)
  })
})
