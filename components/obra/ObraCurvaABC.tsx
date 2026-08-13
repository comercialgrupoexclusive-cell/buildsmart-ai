'use client'

import { useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Cell } from 'recharts'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'

type ItemRaw = {
  id: string
  etapa_id: string | null
  tipo_linha: string | null
  descricao_snapshot: string | null
  quantidade: number
  preco_unitario_snapshot: number
  valor_total_informado_snapshot: number | null
  valor_total_manual_ativo: boolean | null
  subetapa_valor_manual: number | null
  subetapa_valor_manual_ativo: boolean | null
  etapa?: { nome: string } | null
}

type ItemABC = {
  nome: string
  etapa: string
  valor: number
  percentual: number
  acumulado: number
  classe: 'A' | 'B' | 'C'
}

const CORES = { A: 'var(--danger)', B: 'var(--accent)', C: 'var(--success)' }
const LABELS = { A: 'Classe A (0–80%)', B: 'Classe B (80–95%)', C: 'Classe C (95–100%)' }

export function ObraCurvaABC({ orcamentoId }: { orcamentoId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [itens, setItens] = useState<ItemABC[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('orcamento_itens')
        .select('id, etapa_id, tipo_linha, descricao_snapshot, quantidade, preco_unitario_snapshot, valor_total_informado_snapshot, valor_total_manual_ativo, subetapa_valor_manual, subetapa_valor_manual_ativo, etapa:etapas(nome)')
        .eq('orcamento_id', orcamentoId)

      const raw = (data || []) as ItemRaw[]
      const itensValidos = raw
        .filter(i => i.tipo_linha !== 'subetapa')
        .map(i => {
          const valor = (i.valor_total_manual_ativo && i.valor_total_informado_snapshot != null)
            ? Number(i.valor_total_informado_snapshot)
            : i.preco_unitario_snapshot * i.quantidade
          return {
            nome: (i.descricao_snapshot || '(sem descrição)').slice(0, 50),
            etapa: (i.etapa as { nome: string } | null)?.nome || 'Sem etapa',
            valor,
          }
        })
        .filter(i => i.valor > 0)
        .sort((a, b) => b.valor - a.valor)

      const total = itensValidos.reduce((s, i) => s + i.valor, 0)
      let acum = 0
      const resultado: ItemABC[] = itensValidos.map(i => {
        acum += i.valor
        const pctItem = total > 0 ? (i.valor / total) * 100 : 0
        const pctAcum = total > 0 ? (acum / total) * 100 : 0
        return {
          ...i,
          percentual: pctItem,
          acumulado: pctAcum,
          classe: pctAcum <= 80 ? 'A' : pctAcum <= 95 ? 'B' : 'C',
        }
      })

      setItens(resultado)
      setLoading(false)
    }
    load()
  }, [orcamentoId, supabase])

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} /></div>
  }

  if (itens.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Adicione itens ao orçamento para visualizar a Curva ABC.</p>
      </div>
    )
  }

  const totalGeral = itens.reduce((s, i) => s + i.valor, 0)
  const stats = {
    A: { qtd: itens.filter(i => i.classe === 'A').length, valor: itens.filter(i => i.classe === 'A').reduce((s, i) => s + i.valor, 0) },
    B: { qtd: itens.filter(i => i.classe === 'B').length, valor: itens.filter(i => i.classe === 'B').reduce((s, i) => s + i.valor, 0) },
    C: { qtd: itens.filter(i => i.classe === 'C').length, valor: itens.filter(i => i.classe === 'C').reduce((s, i) => s + i.valor, 0) },
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        {(['A', 'B', 'C'] as const).map(cls => (
          <div key={cls} className="card p-4" style={{ borderLeft: `3px solid ${CORES[cls]}` }}>
            <p className="text-xs font-medium mb-1" style={{ color: CORES[cls] }}>{LABELS[cls]}</p>
            <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{stats[cls].qtd} itens</p>
            <p className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
              {formatCurrency(stats[cls].valor)} ({totalGeral > 0 ? ((stats[cls].valor / totalGeral) * 100).toFixed(1) : 0}%)
            </p>
          </div>
        ))}
      </div>

      <div className="card p-4">
        <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Curva ABC — Pareto</p>
        <div style={{ width: '100%', height: 320 }}>
          <ResponsiveContainer>
            <ComposedChart data={itens.slice(0, 40)} margin={{ top: 5, right: 20, bottom: 60, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="nome"
                tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
                angle={-45}
                textAnchor="end"
                height={80}
                interval={0}
                tickFormatter={(v: string) => v.length > 20 ? v.slice(0, 18) + '…' : v}
              />
              <YAxis
                yAxisId="valor"
                tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
                tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
              />
              <YAxis
                yAxisId="pct"
                orientation="right"
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 4 }}
                formatter={(value, name) => {
                  const v = Number(value)
                  if (name === 'acumulado') return [`${v.toFixed(1)}%`, 'Acumulado']
                  return [formatCurrency(v), 'Valor']
                }}
              />
              <Bar yAxisId="valor" dataKey="valor" radius={[3, 3, 0, 0]} maxBarSize={28}>
                {itens.slice(0, 40).map((item, i) => (
                  <Cell key={i} fill={CORES[item.classe]} opacity={0.75} />
                ))}
              </Bar>
              <Line yAxisId="pct" dataKey="acumulado" type="monotone" stroke="var(--text-primary)" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {itens.length > 40 && (
          <p className="text-xs text-center mt-2" style={{ color: 'var(--text-secondary)' }}>
            Mostrando os 40 itens de maior valor ({itens.length} no total)
          </p>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--text-secondary)' }}>#</th>
                <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--text-secondary)' }}>Item</th>
                <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--text-secondary)' }}>Etapa</th>
                <th className="text-right px-4 py-2.5 font-medium" style={{ color: 'var(--text-secondary)' }}>Valor</th>
                <th className="text-right px-4 py-2.5 font-medium" style={{ color: 'var(--text-secondary)' }}>%</th>
                <th className="text-right px-4 py-2.5 font-medium" style={{ color: 'var(--text-secondary)' }}>Acum.</th>
                <th className="text-center px-4 py-2.5 font-medium" style={{ color: 'var(--text-secondary)' }}>Classe</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="px-4 py-2 tabular-nums" style={{ color: 'var(--text-secondary)' }}>{i + 1}</td>
                  <td className="px-4 py-2 max-w-[200px] truncate" style={{ color: 'var(--text-primary)' }}>{item.nome}</td>
                  <td className="px-4 py-2 max-w-[120px] truncate" style={{ color: 'var(--text-secondary)' }}>{item.etapa}</td>
                  <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>{formatCurrency(item.valor)}</td>
                  <td className="px-4 py-2 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>{item.percentual.toFixed(1)}%</td>
                  <td className="px-4 py-2 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>{item.acumulado.toFixed(1)}%</td>
                  <td className="px-4 py-2 text-center">
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold text-white" style={{ background: CORES[item.classe] }}>
                      {item.classe}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
