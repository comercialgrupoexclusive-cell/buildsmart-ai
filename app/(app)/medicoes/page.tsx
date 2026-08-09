'use client'

import Link from 'next/link'
import { ExternalLink, ClipboardList } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { ObraMedicoes } from '@/components/obra/ObraMedicoes'
import { useObraOrcamento } from '@/lib/obra-orcamento-context'

export default function MedicoesPage() {
  const { obraId, orcamentoId, orcamentoIds, loading } = useObraOrcamento()

  return (
    <div className="flex flex-col gap-5">
      {obraId && (
        <div className="flex justify-end">
          <Link href={`/obras/${obraId}?tab=medicoes`} className="inline-flex items-center gap-2 text-sm font-medium hover:opacity-80" style={{ color: 'var(--accent)' }}>
            Abrir na obra <ExternalLink size={14} />
          </Link>
        </div>
      )}
      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} /></div>
      ) : !obraId ? (
        <EmptyState icon={ClipboardList} title="Selecione uma obra" description="Escolha uma obra acima para acompanhar as medições." />
      ) : (
        <ObraMedicoes key={`${obraId}-${orcamentoId}`} obraId={obraId} orcamentoId={orcamentoId} orcamentoIds={orcamentoIds} />
      )}
    </div>
  )
}
