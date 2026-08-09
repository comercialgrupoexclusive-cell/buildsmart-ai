'use client'

import dynamic from 'next/dynamic'
import { LayoutDashboard } from 'lucide-react'

const ExcalidrawBoard = dynamic(
  () => import('@/components/board/ExcalidrawBoard').then(module => module.ExcalidrawBoard),
  { ssr: false },
)

export function ObraBoard({ obraId }: { obraId: string }) {
  return (
    <section className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <LayoutDashboard size={19} style={{ color: 'var(--accent)' }} />
          <h2 className="text-xl font-semibold">Board</h2>
        </div>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Quadro visual da obra para desenhos, PDFs, anotações e não conformidades.
        </p>
      </div>

      <div className="card overflow-hidden" style={{ height: 'min(72vh, 760px)', minHeight: 560 }}>
        <ExcalidrawBoard obraId={obraId} />
      </div>
    </section>
  )
}
