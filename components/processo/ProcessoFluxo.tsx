'use client'

// Seção 6 canônica: FLUXO — superfície única que unifica Caixa de Entrada
// (entradas) e Tarefas (ações) em vez de mantê-las como abas isoladas.
// Filtros: Tudo | Entradas | Ações.

import { useState } from 'react'
import { CaixaEntrada } from '@/components/caixa-entrada/CaixaEntrada'
import { ContextoTarefas } from '@/components/tarefas/ContextoTarefas'

type Filtro = 'tudo' | 'entradas' | 'acoes'

const FILTROS: { id: Filtro; label: string }[] = [
  { id: 'tudo', label: 'Tudo' },
  { id: 'entradas', label: 'Entradas' },
  { id: 'acoes', label: 'Ações' },
]

export function ProcessoFluxo({ processoId, temTarefas }: { processoId: string; temTarefas: boolean }) {
  const [filtro, setFiltro] = useState<Filtro>('entradas')

  const filtrosVisiveis = temTarefas ? FILTROS : FILTROS.filter(f => f.id !== 'acoes')

  return (
    <div className="space-y-4">
      {temTarefas && (
        <div className="flex items-center gap-1 p-1 rounded-lg self-start" style={{ background: 'var(--bg-secondary)' }}>
          {filtrosVisiveis.map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltro(f.id)}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
              style={filtro === f.id ? { background: 'var(--accent)', color: 'white' } : { color: 'var(--text-secondary)' }}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {(filtro === 'tudo' || filtro === 'entradas') && (
        <CaixaEntrada processoId={processoId} />
      )}

      {temTarefas && (filtro === 'tudo' || filtro === 'acoes') && (
        <ContextoTarefas processoId={processoId} />
      )}
    </div>
  )
}
