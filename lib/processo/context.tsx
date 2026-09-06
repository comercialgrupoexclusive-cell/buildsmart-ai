'use client'

// ProcessContext (P3.2 — Entrada única, seção 7 do plano): contexto global
// operacional do Motor de Processo. Fornece só `processoId` — nunca
// `obraId`/`projetoId` legado no contrato público (módulos ainda não
// migrados resolvem esses ids internamente, fora deste contexto).
//
// Diferente de lib/obra-orcamento-context.tsx (que persiste a seleção
// global em localStorage porque Obra precisa de uma barra de seleção
// cross-page), aqui o `processoId` já vem da URL (`/processos/[id]`) — o
// Provider só existe para os módulos abaixo do shell lerem sem prop
// drilling, à medida que forem migrando (P3.3 em diante).
import { createContext, useContext, type ReactNode } from 'react'

type ProcessContextValue = {
  processoId: string
}

const ProcessContext = createContext<ProcessContextValue | null>(null)

export function ProcessProvider({ processoId, children }: { processoId: string; children: ReactNode }) {
  return <ProcessContext.Provider value={{ processoId }}>{children}</ProcessContext.Provider>
}

export function useProcessContext(): ProcessContextValue {
  const ctx = useContext(ProcessContext)
  if (!ctx) throw new Error('useProcessContext deve ser usado dentro de <ProcessProvider>.')
  return ctx
}
