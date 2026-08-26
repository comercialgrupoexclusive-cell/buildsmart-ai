import { describe, it, expect } from 'vitest'
import { calcDurationDays, dataPrazoDeDuracao, type ProjetoItemNode, type ProjetoItemDependencia } from '@/components/projeto/ProjetoCascata'
import {
  dataPrazoDeDuracao as dataPrazoDeDuracaoGantt,
  effectiveDuracao as effectiveDuracaoGantt,
} from '@/components/projeto/ProjetoCronograma'
import { scheduleFromDependencies } from '@/app/(app)/projetos/[id]/page'

// Convenção (ajuste pedido pelo usuário): duracao_dias conta o dia inicial —
// uma atividade de 1 dia começa e termina no mesmo dia. Por isso, para
// duracao_dias > 0: data_prazo = data_inicio + duracao_dias - 1 (não
// + duracao_dias). O inverso precisa ser consistente: duracao_dias
// derivado de duas datas é (fim - início) + 1.

function item(overrides: Partial<ProjetoItemNode> & { id: string }): ProjetoItemNode {
  return {
    projeto_id: 'proj-1',
    parent_id: null,
    nome: overrides.id,
    nivel: 1,
    concluido: false,
    ordem: 0,
    responsavel: null,
    data_inicio: null,
    data_prazo: null,
    is_marco: false,
    status: null,
    duracao_dias: null,
    ...overrides,
  }
}

describe('calcDurationDays (ProjetoCascata) — inclusiva, conta o dia inicial', () => {
  it('mesmo dia de início e fim = 1 dia de duração', () => {
    expect(calcDurationDays('2026-01-01', '2026-01-01')).toBe(1)
  })

  it('5 dias corridos (01 a 05) = duração 5, não 4', () => {
    expect(calcDurationDays('2026-01-01', '2026-01-05')).toBe(5)
  })

  it('fim antes do início é inválido (null)', () => {
    expect(calcDurationDays('2026-01-05', '2026-01-01')).toBeNull()
  })

  it('datas vazias retornam null', () => {
    expect(calcDurationDays('', '2026-01-01')).toBeNull()
    expect(calcDurationDays('2026-01-01', '')).toBeNull()
  })
})

describe('dataPrazoDeDuracao (ProjetoCascata) — inverso de calcDurationDays', () => {
  it('duração 1 = prazo no mesmo dia do início', () => {
    expect(dataPrazoDeDuracao('2026-01-01', 1)).toBe('2026-01-01')
  })

  it('duração 5 = início + 4 dias (não + 5)', () => {
    expect(dataPrazoDeDuracao('2026-01-01', 5)).toBe('2026-01-05')
  })

  it('duração 0 não gera prazo antes do início (trata como mesmo dia)', () => {
    expect(dataPrazoDeDuracao('2026-01-01', 0)).toBe('2026-01-01')
  })

  it('round-trip: calcDurationDays(inicio, dataPrazoDeDuracao(inicio, d)) === d para d > 0', () => {
    for (const d of [1, 2, 5, 7, 30]) {
      const prazo = dataPrazoDeDuracao('2026-03-10', d)
      expect(calcDurationDays('2026-03-10', prazo)).toBe(d)
    }
  })
})

describe('ProjetoCronograma (Gantt) — mesma convenção da Cascata', () => {
  it('dataPrazoDeDuracao bate com a implementação da Cascata', () => {
    expect(dataPrazoDeDuracaoGantt('2026-01-01', 7)).toBe(dataPrazoDeDuracao('2026-01-01', 7))
    expect(dataPrazoDeDuracaoGantt('2026-01-01', 1)).toBe('2026-01-01')
  })

  it('effectiveDuracao usa duracao_dias persistido quando existir', () => {
    expect(effectiveDuracaoGantt(item({ id: 'a', duracao_dias: 3 }))).toBe(3)
  })

  it('effectiveDuracao deriva das datas de forma inclusiva quando duracao_dias é null (compatibilidade)', () => {
    expect(effectiveDuracaoGantt(item({ id: 'a', data_inicio: '2026-01-01', data_prazo: '2026-01-01' }))).toBe(1)
    expect(effectiveDuracaoGantt(item({ id: 'a', data_inicio: '2026-01-01', data_prazo: '2026-01-05' }))).toBe(5)
  })
})

describe('scheduleFromDependencies — fluxo validado (marco externo aprovado → dependentes)', () => {
  // Reproduz o cenário real encontrado no banco: um marco "enviado" é
  // predecessor de um marco "aprovado", que por sua vez é predecessor de
  // duas tarefas com duracao_dias=7 e nenhuma data ainda.
  const marcoEnviado = item({ id: 'marco-enviado', is_marco: true, data_prazo: '2026-09-01', data_inicio: '2026-09-01' })
  const marcoAprovado = item({ id: 'marco-aprovado', is_marco: true })
  const executivoEletrico = item({ id: 'exec-eletrico', duracao_dias: 7 })
  const executivoHidro = item({ id: 'exec-hidro', duracao_dias: 7 })
  const itens: ProjetoItemNode[] = [marcoEnviado, marcoAprovado, executivoEletrico, executivoHidro]
  const deps: ProjetoItemDependencia[] = [
    { id: 'd1', projeto_id: 'proj-1', item_id: 'marco-aprovado', predecessor_id: 'marco-enviado' },
    { id: 'd2', projeto_id: 'proj-1', item_id: 'exec-eletrico', predecessor_id: 'marco-aprovado' },
    { id: 'd3', projeto_id: 'proj-1', item_id: 'exec-hidro', predecessor_id: 'marco-aprovado' },
  ]

  it('marco aprovado inicia no dia seguinte ao marco enviado, sem duração (prazo = início)', () => {
    const changes = scheduleFromDependencies(itens, deps)
    const aprovado = changes.get('marco-aprovado')
    expect(aprovado?.data_inicio).toBe('2026-09-02')
    expect(aprovado?.data_prazo).toBe('2026-09-02')
  })

  it('tarefas dependentes iniciam no dia seguinte ao marco aprovado e o prazo usa duracao_dias (início + duracao - 1)', () => {
    const changes = scheduleFromDependencies(itens, deps)
    for (const id of ['exec-eletrico', 'exec-hidro']) {
      const c = changes.get(id)
      expect(c?.data_inicio).toBe('2026-09-03')
      // duracao_dias=7 conta o dia inicial: 03 a 09 (não 03 a 10)
      expect(c?.data_prazo).toBe('2026-09-09')
    }
  })

  it('sem duracao_dias, item sem data efetiva ainda cai no prazo = início (comportamento anterior preservado)', () => {
    const predecessora = item({ id: 'pred', data_prazo: '2026-09-01' })
    const semDuracao = item({ id: 'sem-duracao' })
    const changes = scheduleFromDependencies(
      [predecessora, semDuracao],
      [{ id: 'd', projeto_id: 'proj-1', item_id: 'sem-duracao', predecessor_id: 'pred' }],
    )
    const c = changes.get('sem-duracao')
    expect(c?.data_inicio).toBe('2026-09-02')
    expect(c?.data_prazo).toBe('2026-09-02')
  })
})
