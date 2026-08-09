'use client'

import { Building2, WalletCards } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { TODOS_ORCAMENTOS, useObraOrcamento } from '@/lib/obra-orcamento-context'

const MODULE_PATHS = ['/obras/', '/cronograma', '/materiais', '/medicoes', '/relatorios']

export function GlobalObraOrcamentoBar() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { obras, orcamentos, obraId, orcamentoId, loading, setObraId, setOrcamentoId } = useObraOrcamento()

  if (!MODULE_PATHS.some(path => pathname.startsWith(path))) return null

  function changeObra(next: string) {
    setObraId(next)
    if (pathname.startsWith('/obras/') && next) {
      const tab = searchParams.get('tab')
      router.push(`/obras/${next}${tab ? `?tab=${encodeURIComponent(tab)}` : ''}`)
    }
  }

  return (
    <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5 rounded-lg p-2.5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <label className="min-w-0">
        <span className="flex items-center gap-1.5 text-[11px] font-medium mb-1" style={{ color: 'var(--text-secondary)' }}><Building2 size={13} /> Obra</span>
        <select value={obraId} onChange={e => changeObra(e.target.value)} className="input-base w-full text-sm" disabled={loading || obras.length === 0}>
          {obras.length === 0 && <option value="">Nenhuma obra cadastrada</option>}
          {obras.map(obra => <option key={obra.id} value={obra.id}>{obra.nome}</option>)}
        </select>
      </label>
      <label className="min-w-0">
        <span className="flex items-center gap-1.5 text-[11px] font-medium mb-1" style={{ color: 'var(--text-secondary)' }}><WalletCards size={13} /> Orçamento</span>
        <select value={orcamentoId} onChange={e => setOrcamentoId(e.target.value)} className="input-base w-full text-sm" disabled={loading || orcamentos.length === 0}>
          {orcamentos.length === 0 && <option value="">Nenhum orçamento vinculado</option>}
          {orcamentos.length > 1 && <option value={TODOS_ORCAMENTOS}>Todos os orçamentos</option>}
          {orcamentos.map(orc => <option key={orc.id} value={orc.id}>{orc.nome || `Orçamento v${orc.versao}`}</option>)}
        </select>
      </label>
    </div>
  )
}
