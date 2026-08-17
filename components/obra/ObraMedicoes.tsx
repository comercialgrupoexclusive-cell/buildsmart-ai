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
  BriefcaseBusiness, History, SlidersHorizontal, WalletCards,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  loadPlanejamentoProgresso, setItemProgresso, setItemProximaMedicao, clampPct,
  type PlanejamentoProgresso, type PlanEtapaNode, type PlanSubetapaNode, type PlanItemNode,
} from '@/lib/planejamento-progresso'
import { EmptyState } from '@/components/ui/EmptyState'
import { ObraRdo } from '@/components/obra/ObraRdo'
import { ObraBoletins } from '@/components/obra/ObraBoletins'
import { ObraMedicaoMaoObra } from '@/components/obra/ObraMedicaoMaoObra'
import { ProgressControl } from '@/components/obra/ProgressControl'
import { Modal } from '@/components/ui/Modal'

type SubTab = 'fisico' | 'mao-obra' | 'gerenciamento' | 'boletins' | 'diario'

const TABS: { id: SubTab; label: string; icon: typeof ClipboardList }[] = [
  { id: 'fisico', label: 'Avanço físico', icon: ClipboardList },
  { id: 'mao-obra', label: 'Mão de obra', icon: BriefcaseBusiness },
  { id: 'gerenciamento', label: 'Gerenciamento', icon: WalletCards },
  { id: 'boletins', label: 'Boletins', icon: FileBarChart },
  { id: 'diario', label: 'Diário (RDO)', icon: NotebookPen },
]

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const BARRAS_STORAGE_KEY = 'buildsmart-medicoes-mostrar-barras'

type HistoricoMedicaoItem = {
  medicaoId: string
  nome: string
  data: string
  percentual: number
}

export function ObraMedicoes({ obraId, orcamentoId, orcamentoIds }: { obraId: string; orcamentoId: string; orcamentoIds: string[] }) {
  const supabase = useMemo(() => createClient(), [])
  const [subTab, setSubTab] = useState<SubTab>('fisico')
  const [prog, setProg] = useState<PlanejamentoProgresso | null>(null)
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [mostrarBarras, setMostrarBarras] = useState(false)
  const [historicoItem, setHistoricoItem] = useState<PlanItemNode | null>(null)
  const [historico, setHistorico] = useState<HistoricoMedicaoItem[]>([])
  const [historicoLoading, setHistoricoLoading] = useState(false)
  const primeiraAbaRef = useRef(true)
  // Filtros da aba Avanço
  const [filtroEtapa, setFiltroEtapa] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<'todas' | 'pendente' | 'andamento' | 'concluido'>('todas')
  const idsOrcamentos = orcamentoIds.length ? orcamentoIds : [orcamentoId]

  const carregar = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    const p = await loadPlanejamentoProgresso(supabase, idsOrcamentos)
    setProg(p)
    if (!silent) setLoading(false)
  }, [supabase, idsOrcamentos.join(',')])

  useEffect(() => { Promise.resolve().then(() => carregar()) }, [carregar])

  useEffect(() => {
    if (typeof window === 'undefined') return
    setMostrarBarras(localStorage.getItem(BARRAS_STORAGE_KEY) === '1')
  }, [])

  function alternarBarras() {
    setMostrarBarras(atual => {
      const proximo = !atual
      localStorage.setItem(BARRAS_STORAGE_KEY, proximo ? '1' : '0')
      return proximo
    })
  }

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

  // ── Edição de % que escreve DIRETO no item do orçamento (fonte única) ───────
  // Subetapa e etapa não têm percentual próprio (regra 8): editar nesses
  // níveis só espalha o valor para os itens filhos; o pai é sempre recalculado.
  async function setItemPct(item: PlanItemNode, pct: number) {
    setSaving(true)
    await setItemProgresso(supabase, {
      orcamentoId: item.orcamentoId, obraId,
      orcamentoItemId: item.id, etapaId: item.etapaId, subetapaKey: item.subetapaKey,
      percentual: pct,
    })
    await carregar(true); setSaving(false)
  }

  async function setItemProximaPct(item: PlanItemNode, pct: number) {
    setSaving(true)
    await setItemProximaMedicao(supabase, {
      orcamentoId: item.orcamentoId, obraId,
      orcamentoItemId: item.id, etapaId: item.etapaId, subetapaKey: item.subetapaKey,
      percentual: pct,
    })
    await carregar(true); setSaving(false)
  }

  async function abrirHistorico(item: PlanItemNode) {
    setHistoricoItem(item)
    setHistorico([])
    setHistoricoLoading(true)
    const { data, error } = await supabase
      .from('medicao_itens')
      .select('medicao_id, pct_atual, medicoes!inner(nome, periodo_fim, status, eixo, obra_id)')
      .eq('orcamento_item_id', item.id)
      .eq('medicoes.obra_id', obraId)
      .eq('medicoes.eixo', 'fisico')
      .eq('medicoes.status', 'fechada')

    if (!error) {
      type Row = {
        medicao_id: string
        pct_atual: number
        medicoes: { nome: string | null; periodo_fim: string } | { nome: string | null; periodo_fim: string }[]
      }
      const rows = ((data || []) as unknown as Row[]).map(row => {
        const medicao = Array.isArray(row.medicoes) ? row.medicoes[0] : row.medicoes
        return {
          medicaoId: row.medicao_id,
          nome: medicao?.nome || 'Medição',
          data: medicao?.periodo_fim || '',
          percentual: Number(row.pct_atual || 0),
        }
      }).filter(row => row.data).sort((a, b) => b.data.localeCompare(a.data))
      setHistorico(rows)
    }
    setHistoricoLoading(false)
  }

  async function setSubetapaPct(sub: PlanSubetapaNode, pct: number) {
    setSaving(true)
    const v = clampPct(pct)
    await Promise.all(sub.itens.map(item => setItemProgresso(supabase, {
      orcamentoId: item.orcamentoId, obraId,
      orcamentoItemId: item.id, etapaId: item.etapaId, subetapaKey: item.subetapaKey,
      percentual: v,
    })))
    await carregar(true); setSaving(false)
  }

  async function setEtapaPct(etapa: PlanEtapaNode, pct: number) {
    setSaving(true)
    const v = clampPct(pct)
    const itens = [...etapa.subetapas.flatMap(s => s.itens), ...etapa.itensSoltos]
    await Promise.all(itens.map(item => setItemProgresso(supabase, {
      orcamentoId: item.orcamentoId, obraId,
      orcamentoItemId: item.id, etapaId: item.etapaId, subetapaKey: item.subetapaKey,
      percentual: v,
    })))
    await carregar(true); setSaving(false)
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
              if (filtroStatus === 'pendente' && e.progressoExecutado > 0) return false
              if (filtroStatus === 'andamento' && !(e.progressoExecutado > 0 && e.progressoExecutado < 100)) return false
              if (filtroStatus === 'concluido' && e.progressoExecutado < 100) return false
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
                  <button type="button" onClick={alternarBarras} aria-pressed={mostrarBarras}
                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-medium sm:ml-auto"
                    style={mostrarBarras
                      ? { background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)', border: '1px solid color-mix(in srgb, var(--accent) 36%, var(--border))' }
                      : { background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                    <SlidersHorizontal size={13} /> {mostrarBarras ? 'Ocultar barras' : 'Mostrar barras'}
                  </button>
                </div>
                <p className="text-xs px-1" style={{ color: 'var(--text-secondary)' }}>
                  Digite o percentual executado ou use as barras quando preferir. Etapas e subetapas são recalculadas pelos itens do orçamento. {saving && <span style={{ color: 'var(--accent)' }}>salvando…</span>}
                </p>
                <div className="hidden grid-cols-[minmax(0,1fr)_minmax(90px,220px)_110px_38px] items-center gap-3 px-3 text-[10px] font-semibold uppercase sm:grid" style={{ color: 'var(--text-secondary)' }}>
                  <span>Item</span><span>Executado</span><span>Próx. medição</span><span className="sr-only">Histórico</span>
                </div>
                {etapasFiltradas.length === 0 ? (
                  <div className="card p-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhuma etapa neste filtro.</div>
                ) : etapasFiltradas.map(etapa => (
                  <EtapaAvanco
                    key={etapa.id} etapa={etapa} valorTotal={prog.valorTotal} temValores={prog.temValores}
                    collapsed={collapsed[etapa.id]} onToggle={() => setCollapsed(c => ({ ...c, [etapa.id]: !c[etapa.id] }))}
                    onSetEtapa={v => setEtapaPct(etapa, v)}
                    onSetSub={(sub, v) => setSubetapaPct(sub, v)}
                    onSetItem={(item, v) => setItemPct(item, v)}
                    onSetProxima={(item, v) => setItemProximaPct(item, v)}
                    onHistorico={abrirHistorico}
                    mostrarBarras={mostrarBarras}
                  />
                ))}
              </div>
            )
          })()}
        </>
      )}

      <Modal open={historicoItem != null} onClose={() => setHistoricoItem(null)} title={historicoItem ? `Histórico — ${historicoItem.descricao}` : 'Histórico'} size="md">
        {historicoLoading ? (
          <div className="flex justify-center py-8"><div className="h-5 w-5 animate-spin rounded-full border-2" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} /></div>
        ) : historico.length === 0 ? (
          <p className="py-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>Este item ainda não aparece em nenhum boletim fechado.</p>
        ) : (
          <div className="flex flex-col">
            {historico.map(registro => (
              <div key={registro.medicaoId} className="flex items-center justify-between gap-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                <div>
                  <p className="text-sm font-medium">{new Date(`${registro.data}T12:00:00`).toLocaleDateString('pt-BR')}</p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{registro.nome}</p>
                </div>
                <strong className="tabular-nums" style={{ color: 'var(--accent)' }}>{registro.percentual.toFixed(1)}%</strong>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}

// ─── Etapa com cascata editável (Etapa → Subetapa → Item do orçamento) ───────
function EtapaAvanco({ etapa, valorTotal, temValores, collapsed, onToggle, onSetEtapa, onSetSub, onSetItem, onSetProxima, onHistorico, mostrarBarras }: {
  etapa: PlanEtapaNode
  valorTotal: number
  temValores: boolean
  collapsed?: boolean
  onToggle: () => void
  onSetEtapa: (v: number) => void
  onSetSub: (sub: PlanSubetapaNode, v: number) => void
  onSetItem: (item: PlanItemNode, v: number) => void
  onSetProxima: (item: PlanItemNode, v: number) => void
  onHistorico: (item: PlanItemNode) => void
  mostrarBarras: boolean
}) {
  const temFilhos = etapa.subetapas.length > 0 || etapa.itensSoltos.length > 0
  const peso = temValores && valorTotal > 0 ? (etapa.valorContratado / valorTotal) * 100 : 0

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-3 px-3 py-2.5 select-none sm:flex-row sm:items-center"
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
        <CampoPct valor={etapa.progressoExecutado} onChange={onSetEtapa} mostrarBarra={mostrarBarras} />
      </div>

      {!collapsed && temFilhos && (
        <div className="flex flex-col">
          {etapa.subetapas.map(sub => (
            <div key={sub.id ?? sub.nome}>
              <div className="flex flex-col gap-2 pl-9 pr-3 py-2 sm:flex-row sm:items-center" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{sub.nome}</p>
                    {temValores && etapa.valorContratado > 0 && sub.valorContratado > 0 && <span className="text-[11px] whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>peso {(sub.valorContratado / etapa.valorContratado * 100).toFixed(1)}%</span>}
                  </div>
                  <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    {sub.itens.length > 0 ? `${sub.itens.length} item(ns)` : 'sem itens'}
                    {temValores && sub.valorContratado > 0 ? ` · ${brl(sub.valorContratado)}` : ''}
                  </p>
                </div>
                <CampoPct valor={sub.progressoExecutado} onChange={v => onSetSub(sub, v)} tamanho="sm" mostrarBarra={mostrarBarras} />
              </div>
              {sub.itens.map(item => (
                <ItemAvanco key={item.id} item={item} mostrarBarras={mostrarBarras} onSetItem={onSetItem} onSetProxima={onSetProxima} onHistorico={onHistorico} indentado />
              ))}
            </div>
          ))}
          {etapa.itensSoltos.map(item => (
            <ItemAvanco key={item.id} item={item} mostrarBarras={mostrarBarras} onSetItem={onSetItem} onSetProxima={onSetProxima} onHistorico={onHistorico} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Campo de % com presets + input ──────────────────────────────────────────
function CampoPct({ valor, onChange, tamanho = 'md', mostrarBarra = false, minimo = 0, label = 'Executado' }: {
  valor: number
  onChange: (v: number) => void
  tamanho?: 'md' | 'sm'
  mostrarBarra?: boolean
  minimo?: number
  label?: string
}) {
  return <ProgressControl valor={valor} onChange={onChange} compact={tamanho === 'sm'} minimo={minimo} showSlider={mostrarBarra} showPresets={false} label={label} />
}

function ItemAvanco({ item, mostrarBarras, onSetItem, onSetProxima, onHistorico, indentado = false }: {
  item: PlanItemNode
  mostrarBarras: boolean
  onSetItem: (item: PlanItemNode, v: number) => void
  onSetProxima: (item: PlanItemNode, v: number) => void
  onHistorico: (item: PlanItemNode) => void
  indentado?: boolean
}) {
  const proxima = Math.max(item.progressoExecutado, item.proximaMedicaoPercentual ?? item.progressoExecutado)
  return (
    <div className={`grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_36px] gap-2 py-2 pr-3 sm:grid-cols-[minmax(0,1fr)_minmax(90px,220px)_110px_38px] sm:items-center sm:gap-3 ${indentado ? 'pl-10 sm:pl-14' : 'pl-7 sm:pl-9'}`}
      style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
      <div className="col-span-3 min-w-0 sm:col-span-1">
        <p className="text-xs font-medium sm:truncate" style={{ color: 'var(--text-primary)' }}>{item.descricao}</p>
        {item.codigo !== '—' && <p className="mt-0.5 text-[10px]" style={{ color: 'var(--text-secondary)' }}>{item.codigo}</p>}
      </div>
      <div className="min-w-0">
        <span className="mb-1 block text-[10px] uppercase sm:hidden" style={{ color: 'var(--text-secondary)' }}>Executado</span>
        <CampoPct valor={item.progressoExecutado} onChange={v => onSetItem(item, v)} tamanho="sm" mostrarBarra={mostrarBarras} label={`Executado — ${item.descricao}`} />
      </div>
      <div className="min-w-0">
        <span className="mb-1 block text-[10px] uppercase sm:hidden" style={{ color: 'var(--text-secondary)' }}>Próx. medição</span>
        <CampoPct valor={proxima} onChange={v => onSetProxima(item, v)} tamanho="sm" minimo={item.progressoExecutado} label={`Próxima medição — ${item.descricao}`} />
      </div>
      <button type="button" onClick={() => onHistorico(item)} title="Histórico de medições" aria-label={`Histórico de medições — ${item.descricao}`}
        className="mt-4 flex h-8 w-8 items-center justify-center rounded-md sm:mt-0"
        style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
        <History size={14} />
      </button>
    </div>
  )
}
