import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { listarWorkItems } from '../work-items'

// WorkItem é visão unificada (Caixa + Tarefas) por referência, não cópia. O que
// este teste trava: uma entrada que já virou tarefa não aparece duplicada —
// some como "entrada" e passa a ser a tarefa, seja pela referência direta
// (tarefas.origem_entrada_id) ou pelo vínculo de triagem (dados antigos).

type Res = { data: unknown; error: unknown }

// Builder thenable que ignora os filtros (eq/not/in/order) e resolve sempre o
// mesmo resultado da tabela — suficiente para o contrato de unificação/dedup.
function builder(result: Res) {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'not', 'in', 'order']) b[m] = () => b
  b.then = (resolve: (v: Res) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return b
}

function fakeSupabase(porTabela: Record<string, Res>): SupabaseClient {
  return {
    from: (tabela: string) => builder(porTabela[tabela] ?? { data: [], error: null }),
  } as unknown as SupabaseClient
}

describe('listarWorkItems', () => {
  it('não duplica: entrada que virou tarefa some como entrada e vira a tarefa', async () => {
    const supabase = fakeSupabase({
      tarefas: { data: [
        { id: 't1', titulo: 'Ligar pro engenheiro', descricao: null, processo_id: 'p1', created_at: '2026-10-02T10:00:00Z', origem_entrada_id: 'e1' },
      ], error: null },
      processo_caixa_entrada: { data: [
        { id: 'e1', processo_id: 'p1', tipo: 'texto', conteudo_texto: 'ligar pro engenheiro amanhã', created_at: '2026-10-02T09:00:00Z' },
        { id: 'e2', processo_id: 'p1', tipo: 'texto', conteudo_texto: 'ideia: trocar o piso um dia', created_at: '2026-10-02T08:00:00Z' },
      ], error: null },
      caixa_entrada_triagem: { data: [
        { entrada_id: 'e1', status: 'tarefa', tarefa_id: 't1' },
        { entrada_id: 'e2', status: 'um_dia_talvez', tarefa_id: null },
      ], error: null },
    })

    const itens = await listarWorkItems(supabase, 'p1')

    // e1 não aparece como entrada; t1 (a tarefa) a representa. e2 (crua) aparece.
    expect(itens.map(i => `${i.kind}:${i.id}`)).toEqual(['tarefa:t1', 'entrada:e2'])
    expect(itens.find(i => i.id === 'e2')?.entradaTriagem).toBe('um_dia_talvez')
    expect(itens.some(i => i.kind === 'entrada' && i.id === 'e1')).toBe(false)
  })

  it('dedup por vínculo de triagem mesmo sem origem_entrada_id na tarefa (legado)', async () => {
    const supabase = fakeSupabase({
      tarefas: { data: [
        { id: 't9', titulo: 'Tarefa antiga', descricao: null, processo_id: 'p1', created_at: '2026-10-01T10:00:00Z', origem_entrada_id: null },
      ], error: null },
      processo_caixa_entrada: { data: [
        { id: 'e9', processo_id: 'p1', tipo: 'texto', conteudo_texto: 'origem da tarefa antiga', created_at: '2026-10-01T09:00:00Z' },
      ], error: null },
      caixa_entrada_triagem: { data: [
        { entrada_id: 'e9', status: 'tarefa', tarefa_id: 't9' },
      ], error: null },
    })

    const itens = await listarWorkItems(supabase, 'p1')
    expect(itens.map(i => i.kind)).toEqual(['tarefa'])
    expect(itens.some(i => i.kind === 'entrada')).toBe(false)
  })
})
