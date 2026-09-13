'use client'

import dynamic from 'next/dynamic'
import { LayoutDashboard } from 'lucide-react'

// Motor de Processo (rodada "núcleo operacional") — mesmo Board Excalidraw
// já usado por Obra/Projeto/Prospecção/Portal (components/board/
// ExcalidrawBoard.tsx: desenho, PDF, arquivos, realtime, presence, NC),
// agora vinculado por processo_id (mesmo padrão de components/obra/
// ObraBoard.tsx) em vez de criar um Board paralelo.
const ExcalidrawBoard = dynamic(
  () => import('@/components/board/ExcalidrawBoard').then(module => module.ExcalidrawBoard),
  { ssr: false },
)

export function ProcessoBoard({ processoId }: { processoId: string }) {
  return (
    <section className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <LayoutDashboard size={19} style={{ color: 'var(--accent)' }} />
          <h2 className="text-xl font-semibold">Board</h2>
        </div>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Quadro visual do Processo para desenhos, PDFs, anotações e não conformidades.
        </p>
      </div>

      <div className="card overflow-hidden" style={{ height: 'min(72vh, 760px)', minHeight: 560 }}>
        <ExcalidrawBoard processoId={processoId} />
      </div>
    </section>
  )
}
