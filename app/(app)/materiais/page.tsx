'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, ShoppingCart } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Obra } from '@/lib/types'
import { EmptyState } from '@/components/ui/EmptyState'
import { ObraMateriais } from '@/components/obra/ObraMateriais'
import Link from 'next/link'

export default function MateriaisPage() {
  const supabase = createClient()
  const [obras, setObras] = useState<Obra[]>([])
  const [obraId, setObraId] = useState('')
  const [loadingObras, setLoadingObras] = useState(true)

  async function loadObras() {
    setLoadingObras(true)
    const { data } = await supabase.from('obras').select('id, nome, created_at').order('created_at', { ascending: false })
    const list = (data || []) as Obra[]
    setObras(list)
    if (list.length > 0) setObraId(list[0].id)
    setLoadingObras(false)
  }

  useEffect(() => {
    void loadObras()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const obraAtual = obras.find(o => o.id === obraId)

  return (
    <div className="flex flex-col gap-5">
      {/* Seletor de obra — esta página espelha a aba "Materiais" da obra, permitindo trocar de obra aqui */}
      <div className="flex flex-col lg:flex-row gap-3 lg:items-end justify-between">
        <div>
          <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Obra</label>
          <select value={obraId} onChange={e => setObraId(e.target.value)} className="input-base min-w-72">
            {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        </div>
        {obraAtual && (
          <Link href={`/obras/${obraAtual.id}?tab=materiais`} className="inline-flex items-center gap-2 text-sm font-medium hover:opacity-80" style={{ color: 'var(--accent)' }}>
            Abrir na obra <ExternalLink size={14} />
          </Link>
        )}
      </div>

      {loadingObras ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : !obraId ? (
        <EmptyState icon={ShoppingCart} title="Selecione uma obra" description="Escolha uma obra acima para ver os materiais, requisições e listas de compras." />
      ) : (
        <ObraMateriais key={obraId} obraId={obraId} />
      )}
    </div>
  )
}
