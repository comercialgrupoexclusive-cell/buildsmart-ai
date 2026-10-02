'use client'

// Seção 6 canônica: FLUXO — superfície única que unifica Caixa de Entrada
// (entradas brutas), Informações (o que foi triado como conhecimento do
// Processo) e Tarefas (ações), em vez de abas isoladas.
// Filtros: Tudo | Entradas | Informações | Ações.

import { useState } from 'react'
import { CaixaEntrada } from '@/components/caixa-entrada/CaixaEntrada'
import { ContextoTarefas } from '@/components/tarefas/ContextoTarefas'
import { WorkItemsStream } from '@/components/work-items/WorkItemsStream'
import type { TriagemStatus } from '@/lib/caixa-entrada/triagem'

type Filtro = 'tudo' | 'entradas' | 'informacoes' | 'acoes'

// "Informação" = entrada triada como conhecimento do Processo (virou processo
// ou ficou como "um dia talvez"), não a tralha bruta nem uma ação.
const STATUS_INFORMACAO: TriagemStatus[] = ['processo', 'um_dia_talvez']

export function ProcessoFluxo({ processoId, temTarefas }: { processoId: string; temTarefas: boolean }) {
  // "Tudo" é a lista única (Caixa + Tarefas, deduplicada): a visão padrão.
  const [filtro, setFiltro] = useState<Filtro>('tudo')

  const filtros: { id: Filtro; label: string }[] = [
    { id: 'tudo', label: 'Tudo' },
    { id: 'entradas', label: 'Entradas' },
    { id: 'informacoes', label: 'Informações' },
    ...(temTarefas ? [{ id: 'acoes' as const, label: 'Ações' }] : []),
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 p-1 rounded-lg self-start overflow-x-auto" style={{ background: 'var(--bg-secondary)' }}>
        {filtros.map(f => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFiltro(f.id)}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap"
            style={filtro === f.id ? { background: 'var(--accent)', color: 'white' } : { color: 'var(--text-secondary)' }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Tudo = lista única (Caixa + Tarefas por referência, sem duplicar). */}
      {filtro === 'tudo' && <WorkItemsStream processoId={processoId} />}

      {filtro === 'entradas' && <CaixaEntrada processoId={processoId} />}

      {filtro === 'informacoes' && (
        <CaixaEntrada processoId={processoId} filtroStatus={STATUS_INFORMACAO} ocultarComposer />
      )}

      {temTarefas && filtro === 'acoes' && <ContextoTarefas processoId={processoId} />}
    </div>
  )
}
