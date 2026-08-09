'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Banknote, CheckCircle2, Clock3, Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'

type CompraResumo = { valor_total: number; status_valor: string; status_pagamento: string; tipo_custo: string | null }

export function ObraAvancoFinanceiro({ obraId }: { obraId: string }) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [base, setBase] = useState(0)
  const [compras, setCompras] = useState<CompraResumo[]>([])

  useEffect(() => {
    Promise.resolve().then(async () => {
      setLoading(true)
      const [obraRes, orcRes, comprasRes] = await Promise.all([
        supabase.from('obras').select('valor_contrato').eq('id', obraId).single(),
        supabase.from('orcamentos').select('bdi_percentual, orcamento_itens(quantidade, preco_unitario_snapshot)').eq('obra_id', obraId).order('versao', { ascending: false }).limit(1),
        supabase.from('compra_itens').select('valor_total,status_valor,status_pagamento,tipo_custo').eq('obra_id', obraId),
      ])
      const contrato = Number(obraRes.data?.valor_contrato || 0)
      const orc = orcRes.data?.[0] as { bdi_percentual: number; orcamento_itens: { quantidade: number; preco_unitario_snapshot: number }[] } | undefined
      const subtotal = (orc?.orcamento_itens || []).reduce((sum, i) => sum + Number(i.quantidade || 0) * Number(i.preco_unitario_snapshot || 0), 0)
      setBase(contrato > 0 ? contrato : subtotal * (1 + Number(orc?.bdi_percentual || 0) / 100))
      setCompras((comprasRes.data || []) as CompraResumo[])
      setLoading(false)
    })
  }, [obraId, supabase])

  const dados = useMemo(() => {
    const confirmado = compras.filter(c => c.status_valor === 'confirmado').reduce((s, c) => s + Number(c.valor_total || 0), 0)
    const estimado = compras.filter(c => c.status_valor !== 'confirmado').reduce((s, c) => s + Number(c.valor_total || 0), 0)
    const pago = compras.filter(c => c.status_pagamento === 'pago').reduce((s, c) => s + Number(c.valor_total || 0), 0)
    const maoObra = compras.filter(c => c.tipo_custo === 'mao_de_obra').reduce((s, c) => s + Number(c.valor_total || 0), 0)
    return { confirmado, estimado, pago, maoObra }
  }, [compras])

  if (loading) return <div className="flex justify-center py-12"><div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} /></div>

  const pct = (valor: number) => base > 0 ? Math.min(100, valor / base * 100) : 0

  return (
    <div className="flex flex-col gap-4 pb-16">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={Wallet} label="Orçamento / contrato" value={formatCurrency(base)} />
        <Kpi icon={Banknote} label="Financeiro realizado" value={`${pct(dados.confirmado).toFixed(1)}%`} sub={formatCurrency(dados.confirmado)} color="var(--accent)" />
        <Kpi icon={CheckCircle2} label="Pago" value={`${pct(dados.pago).toFixed(1)}%`} sub={formatCurrency(dados.pago)} color="var(--success)" />
        <Kpi icon={Clock3} label="Estimado" value={formatCurrency(dados.estimado)} sub="a confirmar" color="var(--warning)" />
      </div>

      <div className="card p-4 flex flex-col gap-4">
        <Barra label="Custo realizado" valor={dados.confirmado} percentual={pct(dados.confirmado)} color="var(--accent)" />
        <Barra label="Pagamentos efetuados" valor={dados.pago} percentual={pct(dados.pago)} color="var(--success)" />
        <Barra label="Lançamentos de mão de obra" valor={dados.maoObra} percentual={pct(dados.maoObra)} color="#8B5CF6" />
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Este percentual é financeiro e não altera o avanço físico nem a evolução da mão de obra. Ele é calculado pelos lançamentos confirmados e pagamentos.
        </p>
        <Link href={`/obras/${obraId}?tab=materiais`} className="text-sm font-medium w-fit" style={{ color: 'var(--accent)' }}>Abrir lançamentos em Materiais</Link>
      </div>
    </div>
  )
}

function Kpi({ icon: Icon, label, value, sub, color = 'var(--text-primary)' }: { icon: typeof Wallet; label: string; value: string; sub?: string; color?: string }) {
  return <div className="card p-4 min-w-0"><div className="flex items-center gap-2"><Icon size={15} style={{ color }} /><span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{label}</span></div><p className="text-lg font-bold mt-2 truncate" style={{ color }}>{value}</p>{sub && <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{sub}</p>}</div>
}

function Barra({ label, valor, percentual, color }: { label: string; valor: number; percentual: number; color: string }) {
  return <div><div className="flex justify-between gap-3 text-xs mb-1"><span style={{ color: 'var(--text-secondary)' }}>{label}</span><strong style={{ color }}>{percentual.toFixed(1)}% · {formatCurrency(valor)}</strong></div><div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-secondary)' }}><div className="h-full rounded-full" style={{ width: `${percentual}%`, background: color }} /></div></div>
}
