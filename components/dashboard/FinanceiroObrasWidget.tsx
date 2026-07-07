'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Wallet, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Obra } from '@/lib/types'
import { formatCurrency, formatPercent } from '@/lib/utils'

type LinhaFin = { id: string; nome: string; valor: number; custo: number; temValor: boolean }

export function FinanceiroObrasWidget({ obras }: { obras: Obra[] }) {
  const supabase = createClient()
  const [linhas, setLinhas] = useState<LinhaFin[]>([])
  const [loading, setLoading] = useState(true)

  const ativas = useMemo(() => obras.filter(o => o.status === 'ativa'), [obras])
  const idsKey = useMemo(() => ativas.map(o => o.id).sort().join(','), [ativas])

  useEffect(() => {
    const ids = ativas.map(o => o.id)
    if (ids.length === 0) { setLinhas([]); setLoading(false); return }
    setLoading(true)
    Promise.all([
      supabase.from('compra_itens').select('obra_id, valor_total').in('obra_id', ids),
      supabase.from('orcamentos').select('obra_id, versao, bdi_percentual, orcamento_itens(quantidade, preco_unitario_snapshot)').in('obra_id', ids),
    ]).then(([comprasRes, orcRes]) => {
      const custoPorObra = new Map<string, number>()
      ;((comprasRes.data || []) as { obra_id: string; valor_total: number }[]).forEach(c => {
        custoPorObra.set(c.obra_id, (custoPorObra.get(c.obra_id) || 0) + (c.valor_total || 0))
      })

      // Orçamento de maior versão por obra → fallback do valor da obra.
      const orcPorObra = new Map<string, { versao: number; total: number }>()
      ;((orcRes.data || []) as any[]).forEach(o => {
        const bdi = o.bdi_percentual ?? 25
        const subtotal = (o.orcamento_itens || []).reduce((a: number, i: any) => a + i.quantidade * i.preco_unitario_snapshot, 0)
        const total = subtotal * (1 + bdi / 100)
        const atual = orcPorObra.get(o.obra_id)
        if (!atual || (o.versao ?? 0) > atual.versao) orcPorObra.set(o.obra_id, { versao: o.versao ?? 0, total })
      })

      setLinhas(ativas.map(o => {
        const valorContrato = o.valor_contrato ?? 0
        const valor = valorContrato > 0 ? valorContrato : (orcPorObra.get(o.id)?.total ?? 0)
        return { id: o.id, nome: o.nome, valor, custo: custoPorObra.get(o.id) || 0, temValor: valor > 0 }
      }))
      setLoading(false)
    })
  }, [idsKey])

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Wallet size={18} style={{ color: 'var(--accent)' }} />
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Financeiro das obras</h2>
        </div>
        <Link href="/relatorios?tab=financeiro" className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--accent)' }}>
          Ver controle financeiro <ArrowRight size={12} />
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : linhas.length === 0 ? (
        <p className="text-sm py-6 text-center" style={{ color: 'var(--text-secondary)' }}>Nenhuma obra ativa.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {linhas.map(l => {
            const pct = l.temValor ? (l.custo / l.valor) * 100 : 0
            const cor = pct > 100 ? 'var(--danger)' : pct >= 80 ? 'var(--warning)' : 'var(--success)'
            return (
              <Link key={l.id} href={`/obras/${l.id}`} className="block p-2 -mx-2 rounded-lg transition-colors hover:bg-[var(--bg-secondary)]">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{l.nome}</span>
                  {l.temValor ? (
                    <span className="text-xs font-semibold flex-shrink-0" style={{ color: cor }}>{formatPercent(pct)}</span>
                  ) : (
                    <span className="text-xs flex-shrink-0" style={{ color: 'var(--accent)' }}>Defina o valor da obra</span>
                  )}
                </div>
                {l.temValor && (
                  <>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, pct)}%`, background: cor }} />
                    </div>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                      {formatCurrency(l.custo)} de {formatCurrency(l.valor)}
                    </p>
                  </>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
