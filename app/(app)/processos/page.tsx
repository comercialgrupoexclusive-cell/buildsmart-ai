'use client'

// Motor de Processo (P3.2 — Entrada única). Lista de Processos, entrada
// única nova ao lado de /projetos e /obras (que continuam existindo e
// funcionando — a remoção delas só acontece em P3.7, depois que os
// módulos operacionais tiverem migrado de verdade). Consome só as Actions
// públicas de lib/processo, nunca repository/service diretamente.
//
// UI construída só com os padrões de components/ui/ (ver
// PROCESSO_P3_PADROES_UI.md) — nenhum estilo inline reinventado aqui.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Boxes, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { listarProcessos, type Processo, type ProcessoStatus } from '@/lib/processo'
import { PageHeader } from '@/components/ui/PageHeader'
import { SearchInput } from '@/components/ui/SearchInput'
import { FilterTabs, type FilterTabOption } from '@/components/ui/FilterTabs'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'

const STATUS_LABEL: Record<ProcessoStatus, string> = {
  ACTIVE: 'Ativo',
  ON_HOLD: 'Em espera',
  COMPLETED: 'Concluído',
  ARCHIVED: 'Arquivado',
}

const STATUS_BADGE_VARIANT: Record<ProcessoStatus, 'info' | 'warning' | 'success' | 'default'> = {
  ACTIVE: 'info',
  ON_HOLD: 'warning',
  COMPLETED: 'success',
  ARCHIVED: 'default',
}

const FILTROS: FilterTabOption<'todos' | ProcessoStatus>[] = [
  { value: 'ACTIVE', label: STATUS_LABEL.ACTIVE },
  { value: 'todos', label: 'Todos' },
  { value: 'ON_HOLD', label: STATUS_LABEL.ON_HOLD, activeColor: '#f59e0b' },
  { value: 'COMPLETED', label: STATUS_LABEL.COMPLETED, activeColor: '#10b981' },
  { value: 'ARCHIVED', label: STATUS_LABEL.ARCHIVED, activeColor: '#6b7280' },
]

export default function ProcessosPage() {
  const supabase = useMemo(() => createClient(), [])
  const [processos, setProcessos] = useState<Processo[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'todos' | ProcessoStatus>('ACTIVE')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const filtros = statusFilter === 'todos' ? {} : { status: statusFilter }
        const lista = await listarProcessos(supabase, filtros)
        if (!cancelled) setProcessos(lista)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [supabase, statusFilter])

  const filtrados = processos.filter(p => p.nome.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Processos"
        subtitle="Motor de Processo (P3) — em construção. Ainda não substitui Projetos/Obras."
        actions={
          <Link href="/processos/novo">
            <Button icon={<Plus size={16} />}>Novo Processo</Button>
          </Link>
        }
      />

      <div className="flex flex-col sm:flex-row gap-3">
        <SearchInput placeholder="Buscar processos..." value={search} onChange={e => setSearch(e.target.value)} />
        <FilterTabs options={FILTROS} value={statusFilter} onChange={setStatusFilter} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : filtrados.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="Nenhum processo encontrado"
          description={search ? 'Tente outro termo de busca.' : 'Crie o primeiro Processo para começar.'}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtrados.map(p => (
            <Link key={p.id} href={`/processos/${p.id}`} className="card block p-4 transition-transform hover:scale-[1.01]">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold text-base leading-tight" style={{ color: 'var(--text-primary)' }}>{p.nome}</h3>
                <Badge variant={STATUS_BADGE_VARIANT[p.status]} className="flex-shrink-0">{STATUS_LABEL[p.status]}</Badge>
              </div>
              {p.cliente_nome && (
                <p className="text-xs mt-1.5" style={{ color: 'var(--text-secondary)' }}>{p.cliente_nome}</p>
              )}
              {p.endereco && (
                <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>{p.endereco}</p>
              )}
              {p.tipo && (
                <p className="text-xs mt-2 inline-block px-2 py-0.5 rounded" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                  {p.tipo}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
