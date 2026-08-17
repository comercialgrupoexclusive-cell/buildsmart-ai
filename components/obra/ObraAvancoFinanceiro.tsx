'use client'

import { useEffect, useMemo, useState } from 'react'
import { Banknote, HandCoins, Landmark, LineChart, Wallet, Wallet2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatPercent, TIPO_CUSTO_LABEL } from '@/lib/utils'
import { loadFinanceiroResumo, type FinanceiroResumo } from '@/lib/financeiro'

type Visao = 'etapa' | 'tipo_custo'

export function ObraAvancoFinanceiro({ obraId, orcamentoId, orcamentoIds }: { obraId: string; orcamentoId: string; orcamentoIds: string[] }) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [resumo, setResumo] = useState<FinanceiroResumo | null>(null)
  const [visao, setVisao] = useState<Visao>('etapa')

  useEffect(() => {
    let cancelado = false
    setLoading(true)
    loadFinanceiroResumo(supabase, { obraId, orcamentoId, orcamentoIds }).then(r => {
      if (cancelado) return
      setResumo(r)
      setLoading(false)
    })
    return () => { cancelado = true }
  }, [obraId, orcamentoId, orcamentoIds, supabase])

  if (loading || !resumo) {
    return <div className="flex justify-center py-12"><div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} /></div>
  }

  const { planejadoOriginal, planejadoAtual, comprometido, pago, aPagar, saldoOrcamentoAtual, avancoFisico, porEtapa, porTipoCusto } = resumo

  const linhas = visao === 'etapa'
    ? porEtapa.map(e => ({ chave: e.etapaId || 'sem_etapa', nome: e.etapaNome, comprometido: e.comprometido, pago: e.pago }))
    : porTipoCusto.map(t => ({ chave: t.tipo, nome: t.tipo === 'nao_classificado' ? 'Não classificado' : (TIPO_CUSTO_LABEL[t.tipo] || t.tipo), comprometido: t.comprometido, pago: t.pago }))

  return (
    <div className="flex flex-col gap-4 pb-16">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Kpi icon={Wallet} label="Planejado original" value={planejadoOriginal == null ? '—' : formatCurrency(planejadoOriginal)}
          sub={planejadoOriginal == null ? 'baseline não capturada' : 'baseline do orçamento'} />
        <Kpi icon={Wallet2} label="Planejado atual" value={formatCurrency(planejadoAtual)} sub="orçamento atual" color="var(--accent)" />
        <Kpi icon={LineChart} label="Avanço físico" value={formatPercent(avancoFisico)} sub="planejamento/medições" color="#8B5CF6" />
        <Kpi icon={Landmark} label="Comprometido/Contratado" value={formatCurrency(comprometido)} sub="lançamentos confirmados" color="var(--warning)" />
        <Kpi icon={Banknote} label="Pago" value={formatCurrency(pago)} sub="já quitado" color="var(--success)" />
        <Kpi icon={HandCoins} label="A pagar" value={formatCurrency(aPagar)} sub="comprometido - pago" color="var(--danger)" />
      </div>

      <div className="card p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Saldo do orçamento atual</p>
          <span className="text-lg font-bold" style={{ color: saldoOrcamentoAtual >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {formatCurrency(saldoOrcamentoAtual)}
          </span>
        </div>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Planejado atual − Comprometido/Contratado. {saldoOrcamentoAtual >= 0 ? 'Ainda há margem dentro do orçamento atual.' : 'O comprometido já ultrapassa o orçamento atual.'}
        </p>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Avanço físico é medido separadamente pelo Planejamento/Medições e nunca é misturado com este percentual financeiro.
        </p>
      </div>

      <div className="card p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Detalhamento</p>
          <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
            <button onClick={() => setVisao('etapa')}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
              style={visao === 'etapa' ? { background: 'var(--accent)', color: 'white' } : { color: 'var(--text-secondary)' }}>
              Por etapa
            </button>
            <button onClick={() => setVisao('tipo_custo')}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
              style={visao === 'tipo_custo' ? { background: 'var(--accent)', color: 'white' } : { color: 'var(--text-secondary)' }}>
              Por tipo de custo
            </button>
          </div>
        </div>

        {linhas.length === 0 ? (
          <p className="text-sm py-6 text-center" style={{ color: 'var(--text-secondary)' }}>Nenhum lançamento de compra para detalhar.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: 420 }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)' }}>
                  <th className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>{visao === 'etapa' ? 'Etapa' : 'Tipo de custo'}</th>
                  <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>Comprometido</th>
                  <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>Pago</th>
                  <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>A pagar</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(l => (
                  <tr key={l.chave} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="px-3 py-2 font-medium" style={{ color: 'var(--text-primary)' }}>{l.nome}</td>
                    <td className="text-right px-3 py-2" style={{ color: 'var(--warning)' }}>{formatCurrency(l.comprometido)}</td>
                    <td className="text-right px-3 py-2" style={{ color: 'var(--success)' }}>{formatCurrency(l.pago)}</td>
                    <td className="text-right px-3 py-2" style={{ color: 'var(--danger)' }}>{formatCurrency(Math.max(0, l.comprometido - l.pago))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function Kpi({ icon: Icon, label, value, sub, color = 'var(--text-primary)' }: { icon: typeof Wallet; label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="card p-4 min-w-0">
      <div className="flex items-center gap-2"><Icon size={15} style={{ color }} /><span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{label}</span></div>
      <p className="text-lg font-bold mt-2 truncate" style={{ color }}>{value}</p>
      {sub && <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{sub}</p>}
    </div>
  )
}
