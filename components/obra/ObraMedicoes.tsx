'use client'

// ═══════════════════════════════════════════════════════════════════════════
// Medição & Diário — orquestrador das abas.
//
// Fonte ÚNICA de avanço físico: o cronograma (etapas/subetapas/serviços).
// - Avanço:   cascata editável que escreve direto no cronograma, com % global
//             PONDERADO POR VALOR (do orçamento).
// - Boletins: boletim de medição por período (snapshot do que avançou).
// - Diário:   RDO unificado (mesmo do campo).
// - Curva S:  previsto × realizado.
// ═══════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from 'react'
import {
  TrendingUp, ChevronDown, ChevronRight, ListChecks, ClipboardList,
  NotebookPen, FileBarChart, LineChart, Square, CheckSquare,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  loadObraProgresso, propagarAvancoServicos, corPorPercentual, clampPct,
  type ObraProgresso, type EtapaProg,
} from '@/lib/obra-progresso'
import { EmptyState } from '@/components/ui/EmptyState'
import { ObraRdo } from '@/components/obra/ObraRdo'
import { ObraBoletins } from '@/components/obra/ObraBoletins'
import { ObraCurvaS } from '@/components/obra/ObraCurvaS'

type SubTab = 'avanco' | 'boletins' | 'diario' | 'curva'

const TABS: { id: SubTab; label: string; icon: typeof ClipboardList }[] = [
  { id: 'avanco', label: 'Avanço', icon: ClipboardList },
  { id: 'boletins', label: 'Boletins', icon: FileBarChart },
  { id: 'diario', label: 'Diário (RDO)', icon: NotebookPen },
  { id: 'curva', label: 'Curva S', icon: LineChart },
]

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

export function ObraMedicoes({ obraId }: { obraId: string }) {
  const supabase = createClient()
  const [subTab, setSubTab] = useState<SubTab>('avanco')
  const [prog, setProg] = useState<ObraProgresso | null>(null)
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)

  const carregar = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    const p = await loadObraProgresso(supabase, obraId)
    setProg(p)
    if (!silent) setLoading(false)
  }, [obraId, supabase])

  useEffect(() => { Promise.resolve().then(() => carregar()) }, [carregar])

  // Recarrega o avanço (fonte única) ao voltar para abas que dependem dele —
  // ex.: um RDO lançado no Diário pode ter mexido no % do cronograma.
  useEffect(() => {
    if (subTab === 'avanco' || subTab === 'boletins' || subTab === 'curva') {
      Promise.resolve().then(() => carregar(true))
    }
  }, [subTab, carregar])

  // ── Edição de % que escreve DIRETO no cronograma ────────────────────────────
  async function setServicoPct(servicoId: string, pct: number) {
    setSaving(true)
    await propagarAvancoServicos(supabase, obraId, [{ servicoId, percentual: clampPct(pct) }])
    await carregar(); setSaving(false)
  }

  async function setSubetapaPct(sub: EtapaProg['subetapas'][number], pct: number) {
    setSaving(true)
    const v = clampPct(pct)
    if (sub.servicos.length > 0) {
      // Espalha para os serviços e deixa a propagação recalcular subetapa/etapa
      await propagarAvancoServicos(supabase, obraId, sub.servicos.map(s => ({ servicoId: s.id, percentual: v })))
    } else {
      const status = v >= 100 ? 'concluida' : v > 0 ? 'em_andamento' : 'planejada'
      await supabase.from('subetapas_cronograma').update({ percentual_executado: v, status }).eq('id', sub.id)
      await recalcEtapaDeSubetapa(sub.id)
    }
    await carregar(); setSaving(false)
  }

  async function setEtapaPct(etapa: EtapaProg, pct: number) {
    setSaving(true)
    const v = clampPct(pct)
    const status = v >= 100 ? 'concluida' : v > 0 ? 'em_andamento' : 'planejada'
    const svcIds = etapa.subetapas.flatMap(s => s.servicos.map(x => x.id))
    await Promise.all([
      supabase.from('etapas').update({ percentual_executado: v, status }).eq('id', etapa.id),
      ...etapa.subetapas.map(s => supabase.from('subetapas_cronograma').update({ percentual_executado: v, status }).eq('id', s.id)),
      ...svcIds.map(id => supabase.from('servicos_cronograma').update({ percentual_executado: v }).eq('id', id)),
    ])
    await carregar(); setSaving(false)
  }

  async function recalcEtapaDeSubetapa(subId: string) {
    const { data } = await supabase.from('subetapas_cronograma').select('etapa_id').eq('id', subId).maybeSingle()
    const etapaId = (data as { etapa_id: string } | null)?.etapa_id
    if (!etapaId) return
    const { data: subs } = await supabase.from('subetapas_cronograma').select('percentual_executado').eq('etapa_id', etapaId)
    const arr = (subs || []) as { percentual_executado: number }[]
    if (arr.length === 0) return
    const media = arr.reduce((a, b) => a + Number(b.percentual_executado), 0) / arr.length
    const status = media >= 100 ? 'concluida' : media > 0 ? 'em_andamento' : 'planejada'
    await supabase.from('etapas').update({ percentual_executado: media, status }).eq('id', etapaId)
  }

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} /></div>
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Sub-abas */}
      <div className="flex items-center gap-1.5 p-1 rounded-lg w-fit overflow-x-auto max-w-full" style={{ background: 'var(--bg-secondary)' }}>
        {TABS.map(t => {
          const Ic = t.icon
          return (
            <button key={t.id} onClick={() => setSubTab(t.id)}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap"
              style={subTab === t.id ? { background: 'var(--accent)', color: 'white' } : { color: 'var(--text-secondary)' }}>
              <Ic size={15} /> {t.label}
            </button>
          )
        })}
      </div>

      {subTab === 'diario' && <ObraRdo obraId={obraId} />}
      {subTab === 'boletins' && <ObraBoletins obraId={obraId} prog={prog} onMedicaoFechada={carregar} />}
      {subTab === 'curva' && <ObraCurvaS obraId={obraId} prog={prog} />}

      {subTab === 'avanco' && prog && (
        <>
          {/* Avanço global ponderado por valor */}
          <div className="card p-4 flex flex-col gap-3">
            <div className="flex items-center gap-4">
              <TrendingUp size={20} style={{ color: 'var(--accent)' }} />
              <div className="flex-1">
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Avanço físico global {prog.temValores ? '(ponderado por valor)' : '(média simples)'}
                </p>
                <div className="flex items-center gap-3 mt-1">
                  <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, prog.avancoPonderado)}%`, background: prog.avancoPonderado >= 100 ? 'var(--success)' : 'var(--accent)' }} />
                  </div>
                  <span className="text-lg font-bold tabular-nums" style={{ color: 'var(--accent)' }}>{prog.avancoPonderado.toFixed(1)}%</span>
                </div>
              </div>
            </div>
            {prog.temValores && (
              <div className="flex items-center gap-4 text-xs pt-1" style={{ color: 'var(--text-secondary)', borderTop: '1px solid var(--border)' }}>
                <span>Contratado: <strong style={{ color: 'var(--text-primary)' }}>{brl(prog.valorTotal)}</strong></span>
                <span>Executado: <strong style={{ color: 'var(--success)' }}>{brl(prog.valorTotal * prog.avancoPonderado / 100)}</strong></span>
                <span className="hidden sm:inline">Média simples: {prog.avancoSimples.toFixed(1)}%</span>
              </div>
            )}
          </div>

          {prog.etapas.length === 0 ? (
            <EmptyState icon={ListChecks} title="Nenhuma etapa cadastrada" description="Cadastre etapas no cronograma para acompanhar e medir a execução aqui." />
          ) : (
            <div className="flex flex-col gap-3 pb-16">
              <p className="text-xs px-1" style={{ color: 'var(--text-secondary)' }}>
                Ajuste o % de execução em qualquer nível — o valor é gravado direto no cronograma (fonte única). Definir a etapa espalha para baixo; ajustar serviços recalcula a subetapa e a etapa por cima. {saving && <span style={{ color: 'var(--accent)' }}>salvando…</span>}
              </p>
              {prog.etapas.map(etapa => (
                <EtapaAvanco
                  key={etapa.id} etapa={etapa} valorTotal={prog.valorTotal} temValores={prog.temValores}
                  collapsed={collapsed[etapa.id]} onToggle={() => setCollapsed(c => ({ ...c, [etapa.id]: !c[etapa.id] }))}
                  onSetEtapa={v => setEtapaPct(etapa, v)}
                  onSetSub={(sub, v) => setSubetapaPct(sub, v)}
                  onSetServico={(id, v) => setServicoPct(id, v)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Etapa com cascata editável ──────────────────────────────────────────────
function EtapaAvanco({ etapa, valorTotal, temValores, collapsed, onToggle, onSetEtapa, onSetSub, onSetServico }: {
  etapa: EtapaProg
  valorTotal: number
  temValores: boolean
  collapsed?: boolean
  onToggle: () => void
  onSetEtapa: (v: number) => void
  onSetSub: (sub: EtapaProg['subetapas'][number], v: number) => void
  onSetServico: (id: string, v: number) => void
}) {
  const temFilhos = etapa.subetapas.length > 0
  const peso = temValores && valorTotal > 0 ? (etapa.valorContratado / valorTotal) * 100 : 0

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-3 px-4 py-3 select-none sm:flex-row sm:items-center"
        style={{ background: 'var(--bg-secondary)', borderBottom: collapsed || !temFilhos ? 'none' : '1px solid var(--border)', cursor: temFilhos ? 'pointer' : 'default' }}
        onClick={() => temFilhos && onToggle()}>
        <div className="flex items-center gap-3 min-w-0 w-full sm:flex-1">
          <span className="flex-shrink-0" style={{ color: 'var(--text-secondary)', visibility: temFilhos ? 'visible' : 'hidden' }}>
            {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{etapa.nome}</p>
            <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
              {temFilhos ? `${etapa.subetapas.length} subetapa(s)` : 'sem subetapas'}
              {temValores && etapa.valorContratado > 0 ? ` · peso ${peso.toFixed(0)}%` : ''}
            </p>
          </div>
        </div>
        <CampoPct valor={etapa.percentual} onChange={onSetEtapa} />
      </div>

      {!collapsed && temFilhos && (
        <div className="flex flex-col">
          {etapa.subetapas.map(sub => (
            <div key={sub.id}>
              <div className="flex flex-col gap-2 pl-9 pr-4 py-3 sm:flex-row sm:items-center" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{sub.nome}</p>
                  {sub.servicos.length > 0 && <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{sub.servicos.length} serviço(s)</p>}
                </div>
                <CampoPct valor={sub.percentual} onChange={v => onSetSub(sub, v)} tamanho="sm" />
              </div>
              {sub.servicos.map(svc => (
                <div key={svc.id} className="flex flex-col gap-2 pl-14 pr-4 py-2.5 sm:flex-row sm:items-center" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                  <div className="flex-1 min-w-0"><p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{svc.nome}</p></div>
                  <CampoPct valor={svc.percentual} onChange={v => onSetServico(svc.id, v)} tamanho="sm" />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Campo de % com presets + input ──────────────────────────────────────────
function CampoPct({ valor, onChange, tamanho = 'md' }: { valor: number; onChange: (v: number) => void; tamanho?: 'md' | 'sm' }) {
  const presets = [
    { label: 'Pendente', value: 0, active: valor <= 0 },
    { label: 'Andamento', value: 50, active: valor > 0 && valor < 100 },
    { label: 'Concluído', value: 100, active: valor >= 100 },
  ]
  return (
    <div className="flex flex-col gap-2 flex-shrink-0 w-full sm:w-auto" onClick={e => e.stopPropagation()}>
      <div className="grid grid-cols-3 gap-1.5">
        {presets.map(p => (
          <button key={p.label} type="button" onClick={() => onChange(p.value)}
            className="min-h-9 inline-flex items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-all"
            style={p.active ? { background: 'var(--accent)', color: 'white', border: '1px solid var(--accent)' } : { background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
            {p.active ? <CheckSquare size={14} /> : <Square size={14} />}
            <span className={tamanho === 'sm' ? 'hidden min-[420px]:inline' : ''}>{p.label}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-16" style={{ height: tamanho === 'md' ? 6 : 5 }}>
          <div className="h-full rounded-full overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
            <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.min(100, valor)}%`, background: corPorPercentual(valor) }} />
          </div>
        </div>
        <div className="relative flex items-center">
          <input type="number" min={0} max={100} step={0.5} value={Number(valor.toFixed(1)) || 0}
            onChange={e => onChange(parseFloat(e.target.value))}
            className="input-base py-1 text-sm text-right tabular-nums"
            style={{ width: tamanho === 'md' ? 84 : 72, color: corPorPercentual(valor), fontWeight: 600, paddingRight: 24 }} />
          <span className="absolute right-2 text-sm pointer-events-none" style={{ color: 'var(--text-secondary)' }}>%</span>
        </div>
      </div>
    </div>
  )
}
