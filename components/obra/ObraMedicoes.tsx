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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  TrendingUp, ChevronDown, ChevronRight, ListChecks, ClipboardList,
  NotebookPen, FileBarChart,
  BriefcaseBusiness, WalletCards,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  loadObraProgresso, propagarAvancoServicos, clampPct,
  type ObraProgresso, type EtapaProg,
} from '@/lib/obra-progresso'
import { EmptyState } from '@/components/ui/EmptyState'
import { ObraRdo } from '@/components/obra/ObraRdo'
import { ObraBoletins } from '@/components/obra/ObraBoletins'
import { ObraMedicaoMaoObra } from '@/components/obra/ObraMedicaoMaoObra'
import { ProgressControl } from '@/components/obra/ProgressControl'

type SubTab = 'fisico' | 'mao-obra' | 'gerenciamento' | 'boletins' | 'diario'

const TABS: { id: SubTab; label: string; icon: typeof ClipboardList }[] = [
  { id: 'fisico', label: 'Avanço físico', icon: ClipboardList },
  { id: 'mao-obra', label: 'Mão de obra', icon: BriefcaseBusiness },
  { id: 'gerenciamento', label: 'Gerenciamento', icon: WalletCards },
  { id: 'boletins', label: 'Boletins', icon: FileBarChart },
  { id: 'diario', label: 'Diário (RDO)', icon: NotebookPen },
]

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

export function ObraMedicoes({ obraId, orcamentoId, orcamentoIds }: { obraId: string; orcamentoId: string; orcamentoIds: string[] }) {
  const supabase = useMemo(() => createClient(), [])
  const [subTab, setSubTab] = useState<SubTab>('fisico')
  const [prog, setProg] = useState<ObraProgresso | null>(null)
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const primeiraAbaRef = useRef(true)
  // Filtros da aba Avanço
  const [filtroEtapa, setFiltroEtapa] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<'todas' | 'pendente' | 'andamento' | 'concluido'>('todas')
  const eixo = 'fisico' as const
  const campoPct = 'percentual_executado'

  const carregar = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    const p = await loadObraProgresso(supabase, obraId, eixo, orcamentoIds.length ? orcamentoIds : undefined)
    setProg(p)
    if (!silent) setLoading(false)
  }, [obraId, supabase, eixo, orcamentoIds])

  useEffect(() => { Promise.resolve().then(() => carregar()) }, [carregar])

  // Recarrega o avanço (fonte única) ao voltar para abas que dependem dele —
  // ex.: um RDO lançado no Diário pode ter mexido no % do cronograma.
  useEffect(() => {
    if (primeiraAbaRef.current) {
      primeiraAbaRef.current = false
      return
    }
    if (subTab === 'fisico' || subTab === 'boletins') {
      Promise.resolve().then(() => carregar(true))
    }
  }, [subTab, carregar])

  // ── Edição de % que escreve DIRETO no cronograma ────────────────────────────
  async function setServicoPct(servicoId: string, pct: number) {
    setSaving(true)
    await propagarAvancoServicos(supabase, obraId, [{ servicoId, percentual: clampPct(pct) }], eixo)
    await carregar(true); setSaving(false)
  }

  async function setSubetapaPct(sub: EtapaProg['subetapas'][number], pct: number) {
    setSaving(true)
    const v = clampPct(pct)
    if (sub.servicos.length > 0) {
      // Espalha para os serviços e deixa a propagação recalcular subetapa/etapa
      await propagarAvancoServicos(supabase, obraId, sub.servicos.map(s => ({ servicoId: s.id, percentual: v })), eixo)
    } else {
      const status = v >= 100 ? 'concluida' : v > 0 ? 'em_andamento' : 'planejada'
      await supabase.from('subetapas_cronograma').update(eixo === 'fisico' ? { [campoPct]: v, status } : { [campoPct]: v }).eq('id', sub.id)
      await recalcEtapaDeSubetapa(sub.id, v)
    }
    await carregar(true); setSaving(false)
  }

  async function setEtapaPct(etapa: EtapaProg, pct: number) {
    setSaving(true)
    const v = clampPct(pct)
    const status = v >= 100 ? 'concluida' : v > 0 ? 'em_andamento' : 'planejada'
    const svcIds = etapa.subetapas.flatMap(s => s.servicos.map(x => x.id))
    await Promise.all([
      supabase.from('etapas').update(eixo === 'fisico' ? { [campoPct]: v, status } : { [campoPct]: v }).eq('id', etapa.id),
      ...etapa.subetapas.map(s => supabase.from('subetapas_cronograma').update(eixo === 'fisico' ? { [campoPct]: v, status } : { [campoPct]: v }).eq('id', s.id)),
      ...svcIds.map(id => supabase.from('servicos_cronograma').update({ [campoPct]: v }).eq('id', id)),
    ])
    await carregar(true); setSaving(false)
  }

  async function recalcEtapaDeSubetapa(subId: string, novoPercentual: number) {
    const etapa = prog?.etapas.find(item => item.subetapas.some(sub => sub.id === subId))
    if (!etapa) return
    const subs = etapa.subetapas.map(sub => sub.id === subId ? { ...sub, percentual: novoPercentual } : sub)
    const valorSubs = subs.reduce((total, sub) => total + sub.valorContratado, 0)
    const valorResidual = Math.max(0, etapa.valorContratado - valorSubs)
    const media = etapa.valorContratado > 0 && valorSubs > 0
      ? (subs.reduce((total, sub) => total + sub.percentual * sub.valorContratado, 0) + etapa.percentual * valorResidual) / etapa.valorContratado
      : subs.reduce((total, sub) => total + sub.percentual, 0) / Math.max(1, subs.length)
    const status = media >= 100 ? 'concluida' : media > 0 ? 'em_andamento' : 'planejada'
    await supabase.from('etapas').update(eixo === 'fisico' ? { [campoPct]: media, status } : { [campoPct]: media }).eq('id', etapa.id)
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
      {subTab === 'boletins' && <ObraBoletins obraId={obraId} prog={prog} onMedicaoFechada={carregar} orcamentoId={orcamentoId} orcamentoIds={orcamentoIds} />}
      {subTab === 'mao-obra' && <ObraMedicaoMaoObra obraId={obraId} orcamentoId={orcamentoId} />}
      {subTab === 'gerenciamento' && <ObraMedicaoMaoObra obraId={obraId} orcamentoId={orcamentoId} eixo="gerenciamento" />}

      {subTab === 'fisico' && prog && (
        <>
          {/* Avanço global ponderado por valor */}
          <div className="card p-4 flex flex-col gap-3">
            <div className="flex items-center gap-4">
              <TrendingUp size={20} style={{ color: 'var(--accent)' }} />
              <div className="flex-1">
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Avanço físico global {prog.temValores ? '(ponderado pelo orçamento)' : '(média simples)'}
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
                <span>Orçamento base: <strong style={{ color: 'var(--text-primary)' }}>{brl(prog.valorTotal)}</strong></span>
                <span>Equivalente executado: <strong style={{ color: 'var(--success)' }}>{brl(prog.valorTotal * prog.avancoPonderado / 100)}</strong></span>
                <span className="hidden sm:inline">Média simples: {prog.avancoSimples.toFixed(1)}%</span>
              </div>
            )}
          </div>

          {prog.etapas.length === 0 ? (
            <EmptyState icon={ListChecks} title="Nenhuma etapa cadastrada" description="Cadastre etapas no cronograma para acompanhar e medir a execução aqui." />
          ) : (() => {
            const STATUS_FILTROS = [
              { id: 'todas', label: 'Todas' },
              { id: 'pendente', label: 'Pendentes' },
              { id: 'andamento', label: 'Em andamento' },
              { id: 'concluido', label: 'Concluídas' },
            ] as const
            const etapasFiltradas = prog.etapas.filter(e => {
              if (filtroEtapa && e.id !== filtroEtapa) return false
              if (filtroStatus === 'pendente' && e.percentual > 0) return false
              if (filtroStatus === 'andamento' && !(e.percentual > 0 && e.percentual < 100)) return false
              if (filtroStatus === 'concluido' && e.percentual < 100) return false
              return true
            })
            return (
              <div className="flex flex-col gap-3 pb-16">
                {/* Filtros de etapas */}
                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                  <select value={filtroEtapa} onChange={e => setFiltroEtapa(e.target.value)} className="input-base text-sm" style={{ maxWidth: 320 }}>
                    <option value="">Todas as etapas</option>
                    {prog.etapas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                  </select>
                  <div className="flex items-center gap-1 flex-wrap">
                    {STATUS_FILTROS.map(f => (
                      <button key={f.id} onClick={() => setFiltroStatus(f.id)}
                        className="px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors"
                        style={filtroStatus === f.id ? { background: 'var(--accent)', color: '#fff' } : { background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-xs px-1" style={{ color: 'var(--text-secondary)' }}>
                  Ajuste o avanço físico em qualquer nível. O valor é salvo ao soltar a barra ou sair do campo; definir a etapa espalha para baixo e ajustar serviços recalcula os pais. {saving && <span style={{ color: 'var(--accent)' }}>salvando…</span>}
                </p>
                {etapasFiltradas.length === 0 ? (
                  <div className="card p-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhuma etapa neste filtro.</div>
                ) : etapasFiltradas.map(etapa => (
                  <EtapaAvanco
                    key={etapa.id} etapa={etapa} valorTotal={prog.valorTotal} temValores={prog.temValores}
                    collapsed={collapsed[etapa.id]} onToggle={() => setCollapsed(c => ({ ...c, [etapa.id]: !c[etapa.id] }))}
                    onSetEtapa={v => setEtapaPct(etapa, v)}
                    onSetSub={(sub, v) => setSubetapaPct(sub, v)}
                    onSetServico={(id, v) => setServicoPct(id, v)}
                  />
                ))}
              </div>
            )
          })()}
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
            <div className="flex items-center gap-2 min-w-0">
              <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{etapa.nome}</p>
              {temValores && etapa.valorContratado > 0 && <span className="text-[11px] whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>peso {peso.toFixed(1)}%</span>}
            </div>
            <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
              {temFilhos ? `${etapa.subetapas.length} subetapa(s)` : 'sem subetapas'}
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
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{sub.nome}</p>
                    {temValores && etapa.valorContratado > 0 && sub.valorContratado > 0 && <span className="text-[11px] whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>peso {(sub.valorContratado / etapa.valorContratado * 100).toFixed(1)}%</span>}
                  </div>
                  <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    {sub.servicos.length > 0 ? `${sub.servicos.length} serviço(s)` : 'sem serviços'}
                    {temValores && sub.valorContratado > 0 ? ` · ${brl(sub.valorContratado)}` : ''}
                  </p>
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
  return <ProgressControl valor={valor} onChange={onChange} compact={tamanho === 'sm'} />
}
