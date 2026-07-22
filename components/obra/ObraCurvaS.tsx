'use client'

// ═══════════════════════════════════════════════════════════════════════════
// Curva S — avanço previsto × realizado.
//
// Previsto: distribui o valor de cada etapa linearmente entre data_inicio e
//   data_fim do cronograma, ponderado por valor → % acumulado previsto no tempo.
// Realizado: pontos dos boletins de medição fechados (avanço acumulado no fim
//   do período) + ponto "hoje" com o avanço atual do cronograma.
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from 'react'
import { LineChart } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { ObraProgresso } from '@/lib/obra-progresso'
import type { Medicao } from '@/lib/types'
import { EmptyState } from '@/components/ui/EmptyState'

const DAY = 86400000
const toTs = (d: string) => new Date(d + 'T12:00').getTime()
const fmtMes = (ts: number) => new Date(ts).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })

export function ObraCurvaS({ obraId, prog }: { obraId: string; prog: ObraProgresso | null }) {
  const supabase = createClient()
  const [boletins, setBoletins] = useState<Medicao[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.resolve().then(async () => {
      setLoading(true)
      const { data } = await supabase.from('medicoes').select('*').eq('obra_id', obraId).eq('status', 'fechada').order('periodo_fim')
      setBoletins((data || []) as Medicao[])
      setLoading(false)
    })
  }, [obraId, supabase])

  const dados = useMemo(() => {
    if (!prog) return null
    const comData = prog.etapas.filter(e => e.data_inicio && e.data_fim)
    if (comData.length === 0) return null

    const minStart = Math.min(...comData.map(e => toTs(e.data_inicio!)))
    const maxEnd = Math.max(...comData.map(e => toTs(e.data_fim!)))
    if (!(maxEnd > minStart)) return null

    const pesoTotal = prog.temValores ? prog.valorTotal : comData.length
    const pesoDe = (e: typeof comData[number]) => prog.temValores ? e.valorContratado : 1

    // Previsto acumulado (%) numa data t
    const previstoEm = (t: number) => {
      let acc = 0
      for (const e of comData) {
        const s = toTs(e.data_inicio!), f = toTs(e.data_fim!)
        const frac = f > s ? Math.min(1, Math.max(0, (t - s) / (f - s))) : (t >= f ? 1 : 0)
        acc += (pesoDe(e) / pesoTotal) * frac * 100
      }
      return acc
    }

    // Amostra mensal previsto
    const pts: { t: number; prev: number }[] = []
    const passo = 30 * DAY
    for (let t = minStart; t <= maxEnd + passo; t += passo) pts.push({ t: Math.min(t, maxEnd), prev: previstoEm(Math.min(t, maxEnd)) })
    if (pts[pts.length - 1].t < maxEnd) pts.push({ t: maxEnd, prev: 100 })

    // Realizado: boletins fechados + ponto hoje
    const real: { t: number; pct: number }[] = boletins
      .filter(b => b.avanco_acumulado != null)
      .map(b => ({ t: toTs(b.periodo_fim), pct: Number(b.avanco_acumulado) }))
    const hoje = Date.now()
    if (hoje >= minStart && hoje <= maxEnd + passo) {
      const jaTem = real.some(r => Math.abs(r.t - hoje) < DAY)
      if (!jaTem) real.push({ t: Math.min(hoje, maxEnd), pct: prog.avancoPonderado })
    }
    real.sort((a, b) => a.t - b.t)

    return { minStart, maxEnd, pts, real, previstoHoje: previstoEm(Math.min(hoje, maxEnd)) }
  }, [prog, boletins])

  if (loading || !prog) {
    return <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} /></div>
  }

  if (!dados) {
    return <EmptyState icon={LineChart} title="Curva S indisponível" description="Defina datas de início e fim nas etapas do cronograma para gerar a curva de avanço previsto." />
  }

  // ── Geometria SVG ───────────────────────────────────────────────────────────
  const W = 720, H = 320, padL = 40, padR = 16, padT = 16, padB = 40
  const x = (t: number) => padL + ((t - dados.minStart) / (dados.maxEnd - dados.minStart)) * (W - padL - padR)
  const y = (p: number) => padT + (1 - p / 100) * (H - padT - padB)

  const linhaPrev = dados.pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.t).toFixed(1)} ${y(p.prev).toFixed(1)}`).join(' ')
  const linhaReal = dados.real.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.t).toFixed(1)} ${y(p.pct).toFixed(1)}`).join(' ')

  // gridlines mensais
  const meses: number[] = []
  for (let t = dados.minStart; t <= dados.maxEnd; t += 30 * DAY) meses.push(t)

  const realHoje = dados.real.length > 0 ? dados.real[dados.real.length - 1].pct : 0
  const desvio = realHoje - dados.previstoHoje

  return (
    <div className="flex flex-col gap-4 pb-16">
      {/* Resumo */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-3">
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Previsto (hoje)</p>
          <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--accent)' }}>{dados.previstoHoje.toFixed(1)}%</p>
        </div>
        <div className="card p-3">
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Realizado</p>
          <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--success)' }}>{realHoje.toFixed(1)}%</p>
        </div>
        <div className="card p-3">
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Desvio</p>
          <p className="text-lg font-bold tabular-nums" style={{ color: desvio >= 0 ? 'var(--success)' : 'var(--danger)' }}>{desvio >= 0 ? '+' : ''}{desvio.toFixed(1)}%</p>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex items-center gap-4 mb-2">
          <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}><span className="inline-block w-4 h-0.5" style={{ background: 'var(--accent)' }} /> Previsto</span>
          <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}><span className="inline-block w-4 h-0.5" style={{ background: 'var(--success)' }} /> Realizado</span>
        </div>
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 480 }}>
            {/* grid horizontal 0/25/50/75/100 */}
            {[0, 25, 50, 75, 100].map(p => (
              <g key={p}>
                <line x1={padL} y1={y(p)} x2={W - padR} y2={y(p)} stroke="var(--border)" strokeWidth={1} />
                <text x={padL - 6} y={y(p) + 3} textAnchor="end" fontSize={10} fill="var(--text-secondary)">{p}</text>
              </g>
            ))}
            {/* meses */}
            {meses.map((t, i) => (
              <text key={i} x={x(t)} y={H - padB + 16} textAnchor="middle" fontSize={9} fill="var(--text-secondary)">{fmtMes(t)}</text>
            ))}
            {/* linha "hoje" */}
            {Date.now() >= dados.minStart && Date.now() <= dados.maxEnd && (
              <line x1={x(Date.now())} y1={padT} x2={x(Date.now())} y2={H - padB} stroke="var(--text-secondary)" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
            )}
            {/* previsto */}
            <path d={linhaPrev} fill="none" stroke="var(--accent)" strokeWidth={2} strokeDasharray="5 4" />
            {/* realizado */}
            {dados.real.length > 0 && <path d={linhaReal} fill="none" stroke="var(--success)" strokeWidth={2.5} />}
            {dados.real.map((p, i) => <circle key={i} cx={x(p.t)} cy={y(p.pct)} r={3} fill="var(--success)" />)}
          </svg>
        </div>
      </div>

      <p className="text-xs px-1" style={{ color: 'var(--text-secondary)' }}>
        Previsto {prog.temValores ? 'ponderado por valor' : '(média simples)'}, distribuído pelas datas das etapas. Realizado a partir dos boletins fechados{dados.real.length > 0 ? ' + avanço atual' : ''}.
      </p>
    </div>
  )
}
