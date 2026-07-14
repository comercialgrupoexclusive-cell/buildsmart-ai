'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, Plus, HardHat, FolderOpen } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { NovoCadastroModal } from '@/components/cadastro/NovoCadastroModal'

type CronogramaComEntidade = {
  id: string
  nome: string
  obra_id: string | null
  projeto_id: string | null
  status: string
  created_at: string
  obra: { id: string; nome: string } | null
  projeto: { id: string; nome: string } | null
  total_etapas: number
}

export default function CronogramaPage() {
  const supabase = createClient()
  const router = useRouter()
  const [cronogramas, setCronogramas] = useState<CronogramaComEntidade[]>([])
  const [obras, setObras] = useState<{ id: string; nome: string }[]>([])
  const [projetos, setProjetos] = useState<{ id: string; nome: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [showNovoModal, setShowNovoModal] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: cronos } = await supabase
      .from('cronogramas')
      .select('id, nome, obra_id, projeto_id, status, created_at, obra:obras(id, nome), projeto:projetos(id, nome)')
      .order('created_at', { ascending: false })

    const list = (cronos || []) as any[]
    const withCounts = await Promise.all(list.map(async (c) => {
      const { count } = await supabase.from('etapas').select('id', { count: 'exact', head: true }).eq('cronograma_id', c.id)
      return { ...c, obra: c.obra || null, projeto: c.projeto || null, total_etapas: count || 0 }
    }))
    setCronogramas(withCounts)

    const [{ data: obrasData }, { data: projData }] = await Promise.all([
      supabase.from('obras').select('id, nome').order('nome'),
      supabase.from('projetos').select('id, nome').order('nome'),
    ])
    setObras((obrasData || []) as { id: string; nome: string }[])
    setProjetos((projData || []) as { id: string; nome: string }[])
    setLoading(false)
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div />
        <Button onClick={() => setShowNovoModal(true)} icon={<Plus size={16} />}>
          Novo Cronograma
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : cronogramas.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Nenhum cronograma"
          description="Crie um novo cronograma para começar."
          action={
            <Button onClick={() => setShowNovoModal(true)} icon={<Plus size={16} />}>
              Novo Cronograma
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {cronogramas.map((crono, i) => (
            <Link
              key={crono.id}
              href={`/cronogramas/${crono.id}`}
              className="card p-5 flex flex-col sm:flex-row gap-4 items-start sm:items-center hover:scale-[1.005] transition-transform animate-enter"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--bg-secondary)' }}>
                <CalendarDays size={22} style={{ color: 'var(--text-secondary)' }} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{crono.nome}</span>
                </div>
                <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span>{crono.total_etapas} etapa{crono.total_etapas !== 1 ? 's' : ''}</span>
                  <span>·</span>
                  <span>Criado em {formatDate(crono.created_at)}</span>
                  {crono.obra && (
                    <>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1">
                        <HardHat size={12} /> {crono.obra.nome}
                      </span>
                    </>
                  )}
                  {crono.projeto && (
                    <>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1">
                        <FolderOpen size={12} /> {crono.projeto.nome}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showNovoModal && (
        <NovoCadastroModal
          onClose={() => setShowNovoModal(false)}
          tipo="cronograma"
          obras={obras}
          projetos={projetos}
          onCreated={() => { setShowNovoModal(false); load() }}
        />
      )}
    </div>
  )
}
