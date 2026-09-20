// Tellus R01 / Seção B — vínculo canônico Processo ↔ Oportunidade.
//
// Regra travada nesta seção: uma oportunidade de AQUISIÇÃO (is_venda=false)
// pertence a no máximo um Processo, e um Processo resolve no máximo uma
// oportunidade de aquisição. A coluna `prospeccoes.processo_id` expressa o
// primeiro lado; o índice único parcial da migration expressa o segundo.
//
// Prospecção-sombra de venda (is_venda=true) NÃO é oportunidade de aquisição
// e não entra nesse vínculo — ela pertence a um Ativo via project_id.
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, beforeEach } from 'vitest'
import { FakeDB } from './fake-supabase'
import {
  desvincularOportunidade,
  listarOportunidadesVinculaveis,
  obterOportunidadeDoProcesso,
  vincularOportunidadeAoProcesso,
} from '../investidor-oportunidade'

describe('Vínculo Processo ↔ Oportunidade — Tellus R01 Seção B', () => {
  let db: FakeDB

  beforeEach(() => {
    db = new FakeDB()
    db.seed('processos', [
      { id: 'proc-1', nome: 'Leilão Centro', status: 'ACTIVE', organization_id: 'org-teste' },
      { id: 'proc-2', nome: 'Outro', status: 'ACTIVE', organization_id: 'org-teste' },
    ])
    db.seed('prospeccoes', [
      { id: 'opp-livre', nome: 'Bella', is_venda: false, tipo_aquisicao: 'leilao', fase: 'em_analise', processo_id: null },
      { id: 'opp-outra', nome: 'São Manoel', is_venda: false, tipo_aquisicao: 'compra_direta', fase: 'em_analise', processo_id: null },
      { id: 'venda-1', nome: 'Venda — Guaíba', is_venda: true, tipo_aquisicao: 'compra_direta', fase: 'nova', processo_id: null },
    ])
  })

  function supa(): SupabaseClient {
    return db as unknown as SupabaseClient
  }

  describe('obterOportunidadeDoProcesso', () => {
    it('devolve null quando o Processo ainda não tem oportunidade vinculada', async () => {
      expect(await obterOportunidadeDoProcesso(supa(), 'proc-1')).toBeNull()
    })

    it('devolve exatamente a oportunidade daquele Processo', async () => {
      await vincularOportunidadeAoProcesso(supa(), 'opp-livre', 'proc-1')
      const achada = await obterOportunidadeDoProcesso(supa(), 'proc-1')
      expect(achada?.id).toBe('opp-livre')
    })

    it('ISOLAMENTO: não devolve a oportunidade de outro Processo', async () => {
      await vincularOportunidadeAoProcesso(supa(), 'opp-livre', 'proc-1')
      expect(await obterOportunidadeDoProcesso(supa(), 'proc-2')).toBeNull()
    })
  })

  describe('vincularOportunidadeAoProcesso', () => {
    it('grava processo_id na prospecção', async () => {
      await vincularOportunidadeAoProcesso(supa(), 'opp-livre', 'proc-1')
      const row = (db.tables['prospeccoes'] || []).find(r => r.id === 'opp-livre')
      expect(row?.processo_id).toBe('proc-1')
    })

    it('rejeita prospecção inexistente', async () => {
      await expect(vincularOportunidadeAoProcesso(supa(), 'nao-existe', 'proc-1')).rejects.toThrow(
        /[Oo]portunidade não encontrada/,
      )
    })

    it('rejeita Processo inexistente', async () => {
      await expect(vincularOportunidadeAoProcesso(supa(), 'opp-livre', 'nao-existe')).rejects.toThrow(
        /[Pp]rocesso não encontrado/,
      )
    })

    it('rejeita prospecção-sombra de venda (is_venda=true)', async () => {
      await expect(vincularOportunidadeAoProcesso(supa(), 'venda-1', 'proc-1')).rejects.toThrow(
        /aquisição/,
      )
    })

    it('CARDINALIDADE: rejeita vincular uma oportunidade já vinculada a outro Processo', async () => {
      await vincularOportunidadeAoProcesso(supa(), 'opp-livre', 'proc-1')
      await expect(vincularOportunidadeAoProcesso(supa(), 'opp-livre', 'proc-2')).rejects.toThrow(
        /já está vinculada/,
      )
    })

    it('CARDINALIDADE: rejeita um segundo vínculo no mesmo Processo', async () => {
      await vincularOportunidadeAoProcesso(supa(), 'opp-livre', 'proc-1')
      await expect(vincularOportunidadeAoProcesso(supa(), 'opp-outra', 'proc-1')).rejects.toThrow(
        /já possui uma oportunidade/,
      )
    })

    it('revincular a mesma oportunidade ao mesmo Processo é idempotente', async () => {
      await vincularOportunidadeAoProcesso(supa(), 'opp-livre', 'proc-1')
      await expect(vincularOportunidadeAoProcesso(supa(), 'opp-livre', 'proc-1')).resolves.toBeUndefined()
      expect(await obterOportunidadeDoProcesso(supa(), 'proc-1')).toMatchObject({ id: 'opp-livre' })
    })
  })

  describe('desvincularOportunidade', () => {
    it('limpa o processo_id e libera a oportunidade', async () => {
      await vincularOportunidadeAoProcesso(supa(), 'opp-livre', 'proc-1')
      await desvincularOportunidade(supa(), 'opp-livre')
      expect(await obterOportunidadeDoProcesso(supa(), 'proc-1')).toBeNull()
      await expect(vincularOportunidadeAoProcesso(supa(), 'opp-livre', 'proc-2')).resolves.toBeUndefined()
    })
  })

  describe('listarOportunidadesVinculaveis', () => {
    it('lista só aquisições ainda não vinculadas', async () => {
      const antes = await listarOportunidadesVinculaveis(supa())
      expect(antes.map(o => o.id).sort()).toEqual(['opp-livre', 'opp-outra'])

      await vincularOportunidadeAoProcesso(supa(), 'opp-livre', 'proc-1')
      const depois = await listarOportunidadesVinculaveis(supa())
      expect(depois.map(o => o.id)).toEqual(['opp-outra'])
    })

    it('nunca inclui prospecção-sombra de venda', async () => {
      const lista = await listarOportunidadesVinculaveis(supa())
      expect(lista.some(o => o.id === 'venda-1')).toBe(false)
    })
  })
})
