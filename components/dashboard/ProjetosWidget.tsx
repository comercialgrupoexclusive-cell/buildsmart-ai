'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { FolderKanban, ArrowRight, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Projeto = {
  id: string
  nome: string
  status: 'em_andamento' | 'concluido' | 'suspenso'
  data_previsao: string | null
  obra_id: string | null
}

const STATUS_META: Record<Projeto['status'], { label: string; color: string }> = {
  em_andamento: { label: 'Em andamento', color: 'var(--accent)' },
  concluido: { label: 'Concluídos', color: 'var(--success)' },
  suspenso: { label: 'Suspensos', color: 'var(--warning)' },
}

export function ProjetosWidget() {
  const supabase = createClient()
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [pctPorProjeto, setPctPorProjeto] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      supabase.from('projetos').select('id, nome, status, data_previsao, obra_id').order('created_at', { ascending: false }),
      supabase.from('projeto_itens').select('projeto_id, concluido'),
    ]).then(([projRes, itensRes]) => {
      const projs = (projRes.data || []) as Projeto[]
      setProjetos(projs)

      const contagem = new Map<string, { total: number; feitos: number }>()
      ;((itensRes.data || []) as { projeto_id: string; concluido: boolean }[]).forEach(i => {
        const acc = contagem.get(i.projeto_id) || { total: 0, feitos: 0 }
        acc.total += 1
        if (i.concluido) acc.feitos += 1
        contagem.set(i.projeto_id, acc)
      })
      const pct: Record<string, number> = {}
      contagem.forEach((v, k) => { pct[k] = v.total > 0 ? (v.feitos / v.total) * 100 : 0 })
      setPctPorProjeto(pct)
      setLoading(false)
    })
  }, [])

  const contadores = useMemo(() => ({
    em_andamento: projetos.filter(p => p.status === 'em_andamento').length,
    concluido: projetos.filter(p => p.status === 'concluido').length,
    suspenso: projetos.filter(p => p.status === 'suspenso').length,
  }), [projetos])

  const emAndamento = useMemo(() => projetos.filter(p => p.status === 'em_andamento').slice(0, 5), [projetos])
  const hoje = new Date().toISOString().slice(0, 10)

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FolderKanban size={18} style={{ color: 'var(--accent)' }} />
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Projetos</h2>
        </div>
        <Link href="/projetos" className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--accent)' }}>
          Ver todos <ArrowRight size={12} />
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : projetos.length === 0 ? (
        <p className="text-sm py-6 text-center" style={{ color: 'var(--text-secondary)' }}>Nenhum projeto cadastrado.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-2">
            {(['em_andamento', 'concluido', 'suspenso'] as const).map(s => (
              <div key={s} className="rounded-xl p-3" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                <p className="text-2xl font-bold" style={{ color: STATUS_META[s].color }}>{contadores[s]}</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{STATUS_META[s].label}</p>
              </div>
            ))}
          </div>

          {emAndamento.length > 0 && (
            <div className="flex flex-col gap-1">
              {emAndamento.map(p => {
                const pct = pctPorProjeto[p.id] ?? 0
                const atrasado = !!p.data_previsao && p.data_previsao < hoje
                return (
                  <Link key={p.id} href={`/projetos/${p.id}`} className="block p-2 -mx-2 rounded-lg transition-colors hover:bg-[var(--bg-secondary)]">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{p.nome}</span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {atrasado && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--danger)' }}>
                            <AlertTriangle size={11} /> Atrasado
                          </span>
                        )}
                        <span className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>{pct.toFixed(0)}%</span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, pct)}%`, background: 'var(--accent)' }} />
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
