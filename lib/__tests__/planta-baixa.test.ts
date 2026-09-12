// Substituição canônica OpenPlan3D — CRUD de plantas do Processo +
// envelope engine/schemaVersion (wrapOpenPlan3DProject/
// unwrapOpenPlan3DProject). FakeDB em memória, mesmo padrão de
// processo.test.ts (sandbox bloqueia *.supabase.co).
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, beforeEach } from 'vitest'
import { FakeDB } from './fake-supabase'
import {
  OPENPLAN3D_ENGINE,
  OPENPLAN3D_SCHEMA_VERSION,
  criarPlanta,
  excluirPlanta,
  listarPlantas,
  obterPlanta,
  renomearPlanta,
  salvarPlanoPlanta,
  unwrapOpenPlan3DProject,
  wrapOpenPlan3DProject,
} from '../processo/planta-baixa'

describe('unwrapOpenPlan3DProject / wrapOpenPlan3DProject', () => {
  it('planta nova (plan_json vazio/null) extrai null — bridge inicia documento em branco', () => {
    expect(unwrapOpenPlan3DProject(null)).toBeNull()
    expect(unwrapOpenPlan3DProject(undefined)).toBeNull()
  })

  it('formato legado do Axonometra (sem engine) nunca é convertido — extrai null', () => {
    const legado = { version: 2, floors: [{ wallNodes: [{ id: 1, x: 0, y: 0 }], wallNodeLinks: [], furnitureArray: [], wallSegmentStatus: {} }], furnitureId: 0, wallNodeId: 0 }
    expect(unwrapOpenPlan3DProject(legado)).toBeNull()
  })

  it('envelope OpenPlan3D (engine === "openplan3d") extrai o projeto de dentro', () => {
    const projeto = { id: 'p1', name: 'Planta 1', floors: [] }
    const envelope = wrapOpenPlan3DProject(projeto)
    expect(envelope).toEqual({ engine: OPENPLAN3D_ENGINE, schemaVersion: OPENPLAN3D_SCHEMA_VERSION, project: projeto })
    expect(unwrapOpenPlan3DProject(envelope)).toEqual(projeto)
  })

  it('um objeto qualquer com "engine" de outro valor não é tratado como OpenPlan3D', () => {
    expect(unwrapOpenPlan3DProject({ engine: 'outra-coisa', project: { x: 1 } })).toBeNull()
  })
})

describe('CRUD de plantas (tabela `plantas`, RLS fora de escopo aqui)', () => {
  let db: FakeDB
  const supabase = () => db as unknown as SupabaseClient
  const processoId = 'processo-1'

  beforeEach(() => { db = new FakeDB() })

  it('criarPlanta grava plan_json vazio já no envelope OpenPlan3D', async () => {
    const planta = await criarPlanta(supabase(), processoId, 'Planta 1')
    expect(planta.processo_id).toBe(processoId)
    expect(planta.plan_schema_version).toBe(OPENPLAN3D_SCHEMA_VERSION)
    expect(unwrapOpenPlan3DProject(planta.plan_json)).toBeNull()
    expect((planta.plan_json as { engine: string }).engine).toBe(OPENPLAN3D_ENGINE)
  })

  it('salvarPlanoPlanta grava o envelope e persiste; obterPlanta lê de volta', async () => {
    const planta = await criarPlanta(supabase(), processoId, 'Planta 1')
    const projeto = { id: 'proj-x', name: 'Planta 1', floors: [{ id: 'f1', walls: [{ id: 'w1', status: 'CONSTRUIR' }] }] }
    await salvarPlanoPlanta(supabase(), planta.id, wrapOpenPlan3DProject(projeto))

    const relida = await obterPlanta(supabase(), planta.id)
    expect(relida).not.toBeNull()
    expect(unwrapOpenPlan3DProject(relida!.plan_json)).toEqual(projeto)
    expect(relida!.plan_schema_version).toBe(OPENPLAN3D_SCHEMA_VERSION)
  })

  it('duas plantas do mesmo Processo são independentes — salvar uma não afeta a outra', async () => {
    const a = await criarPlanta(supabase(), processoId, 'Planta A')
    const b = await criarPlanta(supabase(), processoId, 'Planta B')

    await salvarPlanoPlanta(supabase(), a.id, wrapOpenPlan3DProject({ id: 'a', name: 'A', floors: [] }))

    const bRelida = await obterPlanta(supabase(), b.id)
    expect(unwrapOpenPlan3DProject(bRelida!.plan_json)).toBeNull() // B nunca foi salva — continua vazia

    const aRelida = await obterPlanta(supabase(), a.id)
    expect((unwrapOpenPlan3DProject(aRelida!.plan_json) as { name: string }).name).toBe('A')

    const lista = await listarPlantas(supabase(), processoId)
    expect(lista.map(p => p.id).sort()).toEqual([a.id, b.id].sort())
  })

  it('renomearPlanta e excluirPlanta afetam só a planta-alvo', async () => {
    const a = await criarPlanta(supabase(), processoId, 'Antes')
    const b = await criarPlanta(supabase(), processoId, 'Mantida')

    await renomearPlanta(supabase(), a.id, 'Depois')
    expect((await obterPlanta(supabase(), a.id))!.nome).toBe('Depois')
    expect((await obterPlanta(supabase(), b.id))!.nome).toBe('Mantida')

    await excluirPlanta(supabase(), a.id)
    expect(await obterPlanta(supabase(), a.id)).toBeNull()
    expect(await obterPlanta(supabase(), b.id)).not.toBeNull()
  })

  it('salvarPlanoPlanta com formato legado (sem passar pelo wrap) ainda grava — schemaVersion cai no default', async () => {
    const planta = await criarPlanta(supabase(), processoId, 'Planta 1')
    const legado = { version: 2, floors: [] }
    await salvarPlanoPlanta(supabase(), planta.id, legado)
    const relida = await obterPlanta(supabase(), planta.id)
    expect(relida!.plan_schema_version).toBe(OPENPLAN3D_SCHEMA_VERSION)
    // Sem engine === 'openplan3d', o bridge trataria isso como legado na próxima leitura.
    expect(unwrapOpenPlan3DProject(relida!.plan_json)).toBeNull()
  })
})
