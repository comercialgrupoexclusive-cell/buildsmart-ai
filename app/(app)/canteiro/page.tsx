'use client'

import { useEffect, useState } from 'react'
import { HardHat, MapPin, Calendar, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/profile-context'
import { Obra } from '@/lib/types'
import { EmptyState } from '@/components/ui/EmptyState'

const STATUS_OBRA: Record<string, { label: string; color: string; bg: string }> = {
  ativa:      { label: 'Em andamento', color: 'var(--success)',        bg: 'rgba(16,185,129,0.12)' },
  concluida:  { label: 'Concluída',    color: 'var(--text-secondary)', bg: 'var(--bg-secondary)' },
  paralisada: { label: 'Paralisada',   color: 'var(--danger)',         bg: 'rgba(239,68,68,0.10)' },
  orcamento:  { label: 'Orçamento',    color: 'var(--warning)',        bg: 'rgba(245,158,11,0.10)' },
}

export default function CanteiroPage() {
  const { currentProfile } = useProfile()
  const supabase = createClient()
  const [obras, setObras] = useState<Obra[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (!currentProfile) return
      setLoading(true)

      if (currentProfile.tipo === 'prestador') {
        const { data: links } = await supabase
          .from('obra_usuarios')
          .select('obra_id')
          .eq('profile_id', currentProfile.id)

        const obraIds = (links || []).map((l: { obra_id: string }) => l.obra_id)
        if (obraIds.length === 0) { setObras([]); setLoading(false); return }

        const { data } = await supabase
          .from('obras').select('*')
          .in('id', obraIds)
          .order('created_at', { ascending: false })
        setObras(data || [])
      } else {
        const { data } = await supabase
          .from('obras').select('*')
          .order('created_at', { ascending: false })
        setObras(data || [])
      }
      setLoading(false)
    }
    Promise.resolve().then(() => load())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProfile?.id])

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 max-w-lg mx-auto">
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
          {currentProfile?.tipo === 'prestador'
            ? `Olá${currentProfile.apelido ? `, ${currentProfile.apelido}` : ''}!`
            : 'Canteiro'}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          {currentProfile?.tipo === 'prestador' ? 'Suas obras vinculadas' : 'Visão de campo — todas as obras'}
        </p>
      </div>

      {obras.length === 0 ? (
        <EmptyState
          icon={HardHat}
          title="Nenhuma obra vinculada"
          description="Você ainda não está vinculado a nenhuma obra. Fale com o responsável para ser adicionado."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {obras.map(obra => {
            const st = STATUS_OBRA[obra.status] ?? STATUS_OBRA.orcamento
            return (
              <Link
                key={obra.id}
                href={`/canteiro/${obra.id}`}
                className="card p-4 flex items-center gap-3 active:scale-[0.99] transition-transform"
                style={{ border: '1px solid var(--border)' }}
              >
                <div className="min-w-0 flex-1 flex flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-base leading-tight" style={{ color: 'var(--text-primary)' }}>{obra.nome}</p>
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0"
                      style={{ background: st.bg, color: st.color }}
                    >
                      {st.label}
                    </span>
                  </div>
                  {obra.endereco && (
                    <div className="flex items-center gap-1">
                      <MapPin size={11} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                      <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{obra.endereco}</p>
                    </div>
                  )}
                  {obra.data_previsao && (
                    <div className="flex items-center gap-1">
                      <Calendar size={11} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        Prazo: {new Date(obra.data_previsao + 'T12:00').toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  )}
                </div>
                <ChevronRight size={18} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
