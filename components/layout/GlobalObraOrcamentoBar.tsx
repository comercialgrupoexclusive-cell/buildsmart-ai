'use client'

import { Building2 } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useObraOrcamento } from '@/lib/obra-orcamento-context'

const MODULE_PATHS = ['/obras/', '/cronograma', '/materiais', '/medicoes', '/relatorios']

export function GlobalObraOrcamentoBar() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { obras, obraId, loading, setObraId } = useObraOrcamento()

  if (!MODULE_PATHS.some(path => pathname.startsWith(path))) return null

  function changeObra(next: string) {
    setObraId(next)
    if (pathname.startsWith('/obras/') && next) {
      const tab = searchParams.get('tab')
      router.push(`/obras/${next}${tab ? `?tab=${encodeURIComponent(tab)}` : ''}`)
    }
  }

  return (
    <div className="mb-4 rounded-lg p-2.5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <label className="block min-w-0 max-w-xl">
        <span className="mb-1 flex items-center gap-1.5 text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
          <Building2 size={13} /> Obra
        </span>
        <select value={obraId} onChange={event => changeObra(event.target.value)} className="input-base w-full text-sm" disabled={loading || obras.length === 0}>
          {obras.length === 0 && <option value="">Nenhuma obra cadastrada</option>}
          {obras.map(obra => <option key={obra.id} value={obra.id}>{obra.nome}</option>)}
        </select>
      </label>
    </div>
  )
}
