'use client'

// Seção 12 canônica: FEED DA ORGANIZAÇÃO — não é um Feed novo. É o feed interno
// que já existe por obra (ObraFeedManager: publicar, stories, curtidas,
// comentários, álbuns, arquivar) promovido para o nível da organização, com um
// seletor de obra no topo. O Portal do Cliente deixa de ser dono da
// funcionalidade; nada é redesenhado.

import { useEffect, useMemo, useState } from 'react'
import { Newspaper } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { EmptyState } from '@/components/ui/EmptyState'
import { Select } from '@/components/ui/Input'
import { ObraFeedManager } from '@/components/obra/ObraFeedManager'

type ObraOpcao = { id: string; nome: string }

export default function FeedPage() {
  const supabase = useMemo(() => createClient(), [])
  const [obras, setObras] = useState<ObraOpcao[]>([])
  const [obraId, setObraId] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelado = false
    void (async () => {
      const { data } = await supabase
        .from('obras')
        .select('id,nome')
        .order('created_at', { ascending: false })
      if (cancelado) return
      const lista = (data ?? []) as ObraOpcao[]
      setObras(lista)
      setObraId(atual => atual || lista[0]?.id || '')
      setLoading(false)
    })()
    return () => { cancelado = true }
  }, [supabase])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Feed</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Publicações, stories, curtidas e comentários das obras da organização.
          </p>
        </div>
        {obras.length > 0 && (
          <Select
            className="sm:w-64"
            value={obraId}
            onChange={e => setObraId(e.target.value)}
            aria-label="Selecionar obra"
          >
            {obras.map(o => (
              <option key={o.id} value={o.id}>{o.nome}</option>
            ))}
          </Select>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : !obraId ? (
        <EmptyState icon={Newspaper} title="Nenhuma obra ainda" description="Crie uma obra para começar a publicar no Feed." />
      ) : (
        <ObraFeedManager key={obraId} obraId={obraId} />
      )}
    </div>
  )
}
