'use client'

// Motor de Processo (P3.2 — Entrada única). Lista de Processos, entrada
// única nova ao lado de /projetos e /obras (que continuam existindo e
// funcionando — a remoção delas só acontece em P3.7, depois que os
// módulos operacionais tiverem migrado de verdade). Consome só as Actions
// públicas de lib/processo, nunca repository/service diretamente.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Boxes, Plus, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { listarProcessos, type Processo, type ProcessoStatus } from '@/lib/processo'

const STATUS_META: Record<ProcessoStatus, { label: string; color: string }> = {
  ACTIVE: { label: 'Ativo', color: 'var(--accent)' },
  ON_HOLD: { label: 'Em espera', color: '#f59e0b' },
  COMPLETED: { label: 'Concluído', color: '#10b981' },
  ARCHIVED: { label: 'Arquivado', color: '#6b7280' },
}

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Processos</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Motor de Processo (P3) — em construção. Ainda não substitui Projetos/Obras.
          </p>
        </div>
        <Link
          href="/processos/novo"
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: 'var(--accent)' }}
        >
          <Plus size={16} />
          Novo Processo
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative max-w-sm w-full">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
          <input
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm border outline-none"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            placeholder="Buscar processos..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 p-1 rounded-lg flex-shrink-0 overflow-x-auto" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          {(['ACTIVE', 'todos', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap"
              style={statusFilter === s
                ? { background: s === 'todos' ? 'var(--accent)' : STATUS_META[s as ProcessoStatus].color, color: 'white' }
                : { color: 'var(--text-secondary)' }}
            >
              {s === 'todos' ? 'Todos' : STATUS_META[s as ProcessoStatus].label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-20 space-y-3">
          <Boxes size={48} className="mx-auto opacity-20" style={{ color: 'var(--text-secondary)' }} />
          <p className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>Nenhum processo encontrado</p>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {search ? 'Tente outro termo de busca.' : 'Crie o primeiro Processo para começar.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtrados.map(p => {
            const meta = STATUS_META[p.status]
            return (
              <Link
                key={p.id}
                href={`/processos/${p.id}`}
                className="block rounded-2xl p-4 transition-transform hover:scale-[1.01]"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.15)' }}
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold text-base leading-tight" style={{ color: 'var(--text-primary)' }}>{p.nome}</h3>
                  <span
                    className="text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0"
                    style={{ background: `${meta.color}22`, color: meta.color, border: `1px solid ${meta.color}55` }}
                  >
                    {meta.label}
                  </span>
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
            )
          })}
        </div>
      )}
    </div>
  )
}
