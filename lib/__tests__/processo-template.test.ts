// Tellus R01 / Seção A — Template como contrato técnico do Motor de Processo.
//
// Template NÃO é tela, dashboard, portal, motor novo nem workflow engine. É
// uma receita/configuração explícita do MESMO Motor: declara, no código, quais
// módulos um Processo daquele tipo de trabalho começa habilitando.
//
// Regra de precedência travada nesta seção (ver processo-service.criarProcesso):
//   1. `modulos` explícito do chamador vence (contrato que já existia);
//   2. senão, módulos do template quando houver template;
//   3. senão, módulos `enabledByDefault` do module-registry (comportamento antigo).
// A ordem 1 > 2 > 3 preserva o contrato anterior: quem já passava `modulos`
// continua recebendo exatamente o que pediu.
//
// `processos.tipo` continua sendo rótulo descritivo livre e NÃO é template —
// conceitos deliberadamente separados (valores reais em produção de teste hoje:
// "Execução de obra - TESTE", "OBRA_CAIXA").
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { FakeDB } from './fake-supabase'
import { criarProcesso, listarModulosDoProcesso, obterProcesso } from '../processo/actions/processo-actions'
import { modulosHabilitadosPorPadrao } from '../processo/domain/module-registry'
import {
  PROCESSO_TEMPLATES,
  getProcessoTemplate,
  isValidProcessoTemplateKey,
  modulosDoTemplate,
} from '../processo/domain/template-registry'

const TEMPLATE_INVESTIDOR = 'investimento_imobiliario_investidor'

describe('Template do Motor de Processo — Tellus R01 Seção A', () => {
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

  describe('registry de templates', () => {
    it('resolve investimento_imobiliario_investidor v1 pelo registry', () => {
      const def = getProcessoTemplate(TEMPLATE_INVESTIDOR)
      expect(def).toBeDefined()
      expect(def?.key).toBe(TEMPLATE_INVESTIDOR)
      expect(def?.version).toBe(1)
      expect(def?.label).toBe('Investimento Imobiliário — Investidor')
      expect(def?.modules.length).toBeGreaterThan(0)
    })

    it('resolve a mesma definição quando a versão é informada explicitamente', () => {
      expect(getProcessoTemplate(TEMPLATE_INVESTIDOR, 1)?.key).toBe(TEMPLATE_INVESTIDOR)
    })

    it('não resolve versão inexistente', () => {
      expect(getProcessoTemplate(TEMPLATE_INVESTIDOR, 99)).toBeUndefined()
    })

    it('não resolve key inexistente', () => {
      expect(getProcessoTemplate('template_que_nao_existe')).toBeUndefined()
      expect(isValidProcessoTemplateKey('template_que_nao_existe')).toBe(false)
      expect(isValidProcessoTemplateKey(TEMPLATE_INVESTIDOR)).toBe(true)
    })

    it('todo módulo declarado pelo template existe no module-registry', () => {
      const validas = new Set(
        // importa via módulo público para não duplicar a lista aqui
        [...modulosHabilitadosPorPadrao(), 'execucao', 'medicoes', 'compras', 'financeiro',
          'financiamento', 'rdo', 'relatorios', 'planta_baixa', 'board'],
      )
      for (const t of PROCESSO_TEMPLATES) {
        for (const m of t.modules) expect(validas.has(m)).toBe(true)
      }
    })

    it('o template investidor configura módulos diferentes do padrão do registry', () => {
      // Se fosse igual ao padrão, o template não estaria determinando nada.
      const doTemplate = [...modulosDoTemplate(TEMPLATE_INVESTIDOR)].sort()
      const padrao = [...modulosHabilitadosPorPadrao()].sort()
      expect(doTemplate).not.toEqual(padrao)
    })
  })

  describe('criarProcesso — compatibilidade sem template', () => {
    it('cria normalmente sem template e persiste template_key/version nulos', async () => {
      const processo = await criarProcesso(supa(), { nome: 'Sem template' })
      expect(processo.nome).toBe('Sem template')
      expect(processo.status).toBe('ACTIVE')
      expect(processo.template_key).toBeNull()
      expect(processo.template_version).toBeNull()

      const modulos = await listarModulosDoProcesso(supa(), processo.id)
      expect(modulos.map(m => m.module_key).sort()).toEqual([...modulosHabilitadosPorPadrao()].sort())
    })

    it('processo sem template continua legível por obterProcesso', async () => {
      const criado = await criarProcesso(supa(), { nome: 'Legado' })
      const lido = await obterProcesso(supa(), criado.id)
      expect(lido?.id).toBe(criado.id)
      expect(lido?.template_key).toBeNull()
    })

    it('mantém a lista explícita de módulos quando não há template', async () => {
      const processo = await criarProcesso(supa(), { nome: 'Explicito', modulos: ['orcamento'] })
      const modulos = await listarModulosDoProcesso(supa(), processo.id)
      expect(modulos.map(m => m.module_key)).toEqual(['orcamento'])
    })
  })

  describe('criarProcesso — com template', () => {
    it('persiste template_key e template_version', async () => {
      const processo = await criarProcesso(supa(), {
        nome: 'Leilão Centro',
        template_key: TEMPLATE_INVESTIDOR,
        template_version: 1,
      })
      expect(processo.template_key).toBe(TEMPLATE_INVESTIDOR)
      expect(processo.template_version).toBe(1)
    })

    it('resolve a versão corrente do registry quando a versão é omitida', async () => {
      const processo = await criarProcesso(supa(), { nome: 'Sem versao', template_key: TEMPLATE_INVESTIDOR })
      expect(processo.template_key).toBe(TEMPLATE_INVESTIDOR)
      expect(processo.template_version).toBe(1)
    })

    it('resolve os módulos iniciais pelo template quando modulos não é informado', async () => {
      const processo = await criarProcesso(supa(), { nome: 'Do template', template_key: TEMPLATE_INVESTIDOR })
      const modulos = await listarModulosDoProcesso(supa(), processo.id)
      expect(modulos.map(m => m.module_key).sort()).toEqual([...modulosDoTemplate(TEMPLATE_INVESTIDOR)].sort())
      expect(modulos.every(m => m.enabled)).toBe(true)
    })

    it('PRECEDÊNCIA: modulos explícito do chamador vence o template', async () => {
      const processo = await criarProcesso(supa(), {
        nome: 'Explicito vence',
        template_key: TEMPLATE_INVESTIDOR,
        modulos: ['orcamento'],
      })
      const modulos = await listarModulosDoProcesso(supa(), processo.id)
      expect(modulos.map(m => m.module_key)).toEqual(['orcamento'])
      // o template continua registrado mesmo quando não determinou os módulos
      expect(processo.template_key).toBe(TEMPLATE_INVESTIDOR)
    })

    it('não usa IDs fixos: a configuração vem do registry, não de um id hardcoded', async () => {
      const a = await criarProcesso(supa(), { nome: 'A', template_key: TEMPLATE_INVESTIDOR })
      const b = await criarProcesso(supa(), { nome: 'B', template_key: TEMPLATE_INVESTIDOR })
      const ma = (await listarModulosDoProcesso(supa(), a.id)).map(m => m.module_key).sort()
      const mb = (await listarModulosDoProcesso(supa(), b.id)).map(m => m.module_key).sort()
      expect(ma).toEqual(mb)
      expect(a.id).not.toBe(b.id)
    })
  })

  describe('criarProcesso — rejeição determinística de template inválido', () => {
    it('rejeita template_key desconhecido', async () => {
      await expect(
        criarProcesso(supa(), { nome: 'X', template_key: 'template_que_nao_existe' as never }),
      ).rejects.toThrow(/[Tt]emplate desconhecido/)
    })

    it('rejeita versão inexistente para um template válido', async () => {
      await expect(
        criarProcesso(supa(), { nome: 'X', template_key: TEMPLATE_INVESTIDOR, template_version: 99 }),
      ).rejects.toThrow(/[Vv]ersão .*template|[Tt]emplate desconhecido/)
    })

    it('não grava o processo quando o template é inválido', async () => {
      await expect(
        criarProcesso(supa(), { nome: 'Nao deve existir', template_key: 'invalido' as never }),
      ).rejects.toThrow()
      const todos = await criarProcesso(supa(), { nome: 'Controle' })
      const lista = db.tables['processos'] || []
      expect(lista.map(r => r.nome)).toEqual(['Controle'])
      expect(todos.nome).toBe('Controle')
    })
  })
})
