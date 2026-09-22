// Motor de Operação (Compatibilização Funcional 01/parte A — contratos
// seguros). Mesmo padrão de processo.test.ts: FakeDB em memória exercitando
// as Actions públicas ponta a ponta — inclusive as validações de contexto
// que a trigger do banco não pode substituir num teste sem rede.
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { FakeDB } from './fake-supabase'
import {
  atualizarEtapa,
  atualizarOperacao,
  criarEtapa,
  criarOperacao,
  excluirEtapa,
  listarEtapasDaOperacao,
  reordenarEtapas,
} from '../operacoes/actions/operacoes-actions'
import {
  criarProcesso,
  desvincularProcessoDaOperacao,
  moverProcessoParaEtapa,
  obterProcesso,
  reordenarProcessosDaEtapa,
  vincularProcessoAOperacao,
} from '../processo/actions/processo-actions'

describe('Motor de Operação — Compatibilização Funcional 01', () => {
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

  describe('criarOperacao', () => {
    it('cria a Operação vinculada à organização ativa, sem etapas por padrão', async () => {
      const { operacao, etapas } = await criarOperacao(supa(), { nome: 'Leilões' })
      expect(operacao.nome).toBe('Leilões')
      expect(operacao.organization_id).toBe('org-teste')
      expect(etapas).toEqual([])
    })

    it('semeia as etapas do template Investidor quando etapasIniciais é passado', async () => {
      const { etapas } = await criarOperacao(supa(), { nome: 'Leilões', etapasIniciais: ['Aquisição', 'Reforma', 'Vendido'] })
      expect(etapas.map(e => e.nome)).toEqual(['Aquisição', 'Reforma', 'Vendido'])
      expect(etapas.map(e => e.ordem)).toEqual([0, 1, 2])
    })

    it('rejeita nome vazio', async () => {
      await expect(criarOperacao(supa(), { nome: '   ' })).rejects.toThrow('Nome da Operação é obrigatório.')
    })
  })

  describe('atualizarOperacao (renomear)', () => {
    it('renomeia a Operação', async () => {
      const { operacao } = await criarOperacao(supa(), { nome: 'Leilões' })
      const renomeada = await atualizarOperacao(supa(), operacao.id, { nome: 'Leilões RS' })
      expect(renomeada.nome).toBe('Leilões RS')
    })

    it('rejeita nome vazio', async () => {
      const { operacao } = await criarOperacao(supa(), { nome: 'Leilões' })
      await expect(atualizarOperacao(supa(), operacao.id, { nome: '  ' })).rejects.toThrow('Nome da Operação é obrigatório.')
    })
  })

  describe('criarEtapa / atualizarEtapa', () => {
    it('cria etapa com ordem incremental e permite renomear mantendo o id', async () => {
      const { operacao } = await criarOperacao(supa(), { nome: 'Leilões' })
      const e1 = await criarEtapa(supa(), { operacao_id: operacao.id, nome: 'Aquisição' })
      const e2 = await criarEtapa(supa(), { operacao_id: operacao.id, nome: 'Reforma' })
      expect(e1.ordem).toBe(0)
      expect(e2.ordem).toBe(1)

      const renomeada = await atualizarEtapa(supa(), e1.id, { nome: 'Aquisição / Arrematação' })
      expect(renomeada.id).toBe(e1.id)
      expect(renomeada.nome).toBe('Aquisição / Arrematação')
    })

    it('rejeita nome vazio', async () => {
      const { operacao } = await criarOperacao(supa(), { nome: 'Leilões' })
      await expect(criarEtapa(supa(), { operacao_id: operacao.id, nome: '  ' })).rejects.toThrow('Nome da etapa é obrigatório.')
    })
  })

  describe('excluirEtapa — só quando seguro', () => {
    it('impede excluir etapa em uso por um Processo', async () => {
      const { operacao } = await criarOperacao(supa(), { nome: 'Leilões', etapasIniciais: ['Reforma'] })
      const [etapa] = await listarEtapasDaOperacao(supa(), operacao.id)
      const processo = await criarProcesso(supa(), { nome: 'Casa Guaíba' })
      await vincularProcessoAOperacao(supa(), processo.id, operacao.id)
      await moverProcessoParaEtapa(supa(), processo.id, etapa.id)

      await expect(excluirEtapa(supa(), etapa.id)).rejects.toThrow(/Processo/)
    })

    it('permite excluir etapa vazia', async () => {
      const { operacao } = await criarOperacao(supa(), { nome: 'Leilões', etapasIniciais: ['Reforma'] })
      const [etapa] = await listarEtapasDaOperacao(supa(), operacao.id)
      await excluirEtapa(supa(), etapa.id)
      expect(await listarEtapasDaOperacao(supa(), operacao.id)).toEqual([])
    })
  })

  describe('vincular / desvincular Processo à Operação', () => {
    it('vincula e depois desvincula, limpando etapa e ordem', async () => {
      const { operacao } = await criarOperacao(supa(), { nome: 'Leilões', etapasIniciais: ['Reforma'] })
      const [etapa] = await listarEtapasDaOperacao(supa(), operacao.id)
      const processo = await criarProcesso(supa(), { nome: 'Casa Guaíba' })

      const vinculado = await vincularProcessoAOperacao(supa(), processo.id, operacao.id)
      expect(vinculado.operacao_id).toBe(operacao.id)

      await moverProcessoParaEtapa(supa(), processo.id, etapa.id)
      const comEtapa = await obterProcesso(supa(), processo.id)
      expect(comEtapa?.etapa_operacional_id).toBe(etapa.id)

      const desvinculado = await desvincularProcessoDaOperacao(supa(), processo.id)
      expect(desvinculado.operacao_id).toBeNull()
      expect(desvinculado.etapa_operacional_id).toBeNull()
      expect(desvinculado.ordem_etapa).toBe(0)
    })

    it('Processos sem Operação continuam válidos (retrocompatibilidade)', async () => {
      // FakeDB não aplica defaults de coluna (isso é do Postgres real, já
      // coberto pela migration) — aqui o que importa é que criarProcesso
      // nunca escreve operacao_id/etapa_operacional_id por conta própria.
      const processo = await criarProcesso(supa(), { nome: 'Processo antigo' })
      expect(processo.operacao_id ?? null).toBeNull()
      expect(processo.etapa_operacional_id ?? null).toBeNull()
    })
  })

  describe('moverProcessoParaEtapa — contrato restrito', () => {
    it('move dentro da mesma Operação', async () => {
      const { operacao } = await criarOperacao(supa(), { nome: 'Leilões', etapasIniciais: ['Aquisição', 'Reforma'] })
      const etapas = await listarEtapasDaOperacao(supa(), operacao.id)
      const processo = await criarProcesso(supa(), { nome: 'Casa Guaíba' })
      await vincularProcessoAOperacao(supa(), processo.id, operacao.id)

      await moverProcessoParaEtapa(supa(), processo.id, etapas[0].id)
      await moverProcessoParaEtapa(supa(), processo.id, etapas[1].id)
      const atualizado = await obterProcesso(supa(), processo.id)
      expect(atualizado?.etapa_operacional_id).toBe(etapas[1].id)
    })

    it('rejeita etapa de outra Operação', async () => {
      const { operacao: operacaoA } = await criarOperacao(supa(), { nome: 'Leilões', etapasIniciais: ['Reforma'] })
      const { operacao: operacaoB } = await criarOperacao(supa(), { nome: 'Outra Operação', etapasIniciais: ['Venda'] })
      const etapasB = await listarEtapasDaOperacao(supa(), operacaoB.id)
      const processo = await criarProcesso(supa(), { nome: 'Casa Guaíba' })
      await vincularProcessoAOperacao(supa(), processo.id, operacaoA.id)

      await expect(moverProcessoParaEtapa(supa(), processo.id, etapasB[0].id)).rejects.toThrow(
        'Esta etapa não pertence à Operação deste Processo.',
      )
    })

    it('rejeita mover Processo sem Operação (não vincula implicitamente)', async () => {
      const { operacao } = await criarOperacao(supa(), { nome: 'Leilões', etapasIniciais: ['Reforma'] })
      const [etapa] = await listarEtapasDaOperacao(supa(), operacao.id)
      const processo = await criarProcesso(supa(), { nome: 'Casa Guaíba' })

      await expect(moverProcessoParaEtapa(supa(), processo.id, etapa.id)).rejects.toThrow(
        'Este Processo ainda não está vinculado a uma Operação',
      )
    })
  })

  describe('reordenarEtapas — contexto correto', () => {
    it('reordena as etapas de uma Operação', async () => {
      const { operacao } = await criarOperacao(supa(), { nome: 'Leilões', etapasIniciais: ['Aquisição', 'Reforma'] })
      const [e1, e2] = await listarEtapasDaOperacao(supa(), operacao.id)
      await reordenarEtapas(supa(), operacao.id, [e2.id, e1.id])
      const reordenadas = await listarEtapasDaOperacao(supa(), operacao.id)
      expect(reordenadas.map(e => e.id)).toEqual([e2.id, e1.id])
    })

    it('rejeita mistura de etapas de outra Operação', async () => {
      const { operacao: operacaoA } = await criarOperacao(supa(), { nome: 'Leilões', etapasIniciais: ['Aquisição'] })
      const { operacao: operacaoB } = await criarOperacao(supa(), { nome: 'Outra', etapasIniciais: ['Venda'] })
      const [etapaA] = await listarEtapasDaOperacao(supa(), operacaoA.id)
      const [etapaB] = await listarEtapasDaOperacao(supa(), operacaoB.id)

      await expect(reordenarEtapas(supa(), operacaoA.id, [etapaA.id, etapaB.id])).rejects.toThrow(
        'Uma ou mais etapas não pertencem a esta Operação.',
      )
    })
  })

  describe('reordenarProcessosDaEtapa — contexto correto', () => {
    it('reordena os Processos de uma etapa', async () => {
      const { operacao } = await criarOperacao(supa(), { nome: 'Leilões', etapasIniciais: ['Reforma'] })
      const [etapa] = await listarEtapasDaOperacao(supa(), operacao.id)
      const p1 = await criarProcesso(supa(), { nome: 'Casa 1' })
      const p2 = await criarProcesso(supa(), { nome: 'Casa 2' })
      await vincularProcessoAOperacao(supa(), p1.id, operacao.id)
      await vincularProcessoAOperacao(supa(), p2.id, operacao.id)
      await moverProcessoParaEtapa(supa(), p1.id, etapa.id)
      await moverProcessoParaEtapa(supa(), p2.id, etapa.id)

      await reordenarProcessosDaEtapa(supa(), operacao.id, etapa.id, [p2.id, p1.id])
      const p1Atualizado = await obterProcesso(supa(), p1.id)
      const p2Atualizado = await obterProcesso(supa(), p2.id)
      expect(p2Atualizado?.ordem_etapa).toBe(0)
      expect(p1Atualizado?.ordem_etapa).toBe(1)
    })

    it('rejeita Processo fora do contexto (outra etapa/Operação)', async () => {
      const { operacao } = await criarOperacao(supa(), { nome: 'Leilões', etapasIniciais: ['Aquisição', 'Reforma'] })
      const [aquisicao, reforma] = await listarEtapasDaOperacao(supa(), operacao.id)
      const p1 = await criarProcesso(supa(), { nome: 'Casa 1' })
      const p2 = await criarProcesso(supa(), { nome: 'Casa 2 (em outra etapa)' })
      await vincularProcessoAOperacao(supa(), p1.id, operacao.id)
      await vincularProcessoAOperacao(supa(), p2.id, operacao.id)
      await moverProcessoParaEtapa(supa(), p1.id, reforma.id)
      await moverProcessoParaEtapa(supa(), p2.id, aquisicao.id)

      await expect(reordenarProcessosDaEtapa(supa(), operacao.id, reforma.id, [p1.id, p2.id])).rejects.toThrow(
        'Um ou mais Processos não pertencem a esta etapa desta Operação.',
      )
    })
  })
})
