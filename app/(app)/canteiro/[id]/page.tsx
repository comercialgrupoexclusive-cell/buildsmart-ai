'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, CalendarDays, CheckSquare2, ClipboardList, Megaphone,
  ChevronDown, ChevronRight, Plus, Pin, Check, Trash2, Clock,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/profile-context'
import { Obra, Etapa, SubetapaCronograma, ServicoCronograma, ComunicadoObra } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { ObraRdo } from '@/components/obra/ObraRdo'

type Tab = 'cronograma' | 'checklist' | 'rdo' | 'comunicados'

const TABS: { id: Tab; label: string; icon: typeof CalendarDays }[] = [
  { id: 'cronograma',  label: 'Cronograma', icon: CalendarDays },
  { id: 'checklist',  label: 'Checklist',   icon: CheckSquare2 },
  { id: 'rdo',        label: 'RDO',         icon: ClipboardList },
  { id: 'comunicados',label: 'Avisos',       icon: Megaphone },
]

const STATUS_LABEL: Record<string, string> = {
  planejada: 'Planejada', em_andamento: 'Em andamento', concluida: 'Concluída', atrasada: 'Atrasada',
}
const STATUS_COLOR: Record<string, string> = {
  planejada: 'var(--text-secondary)', em_andamento: 'var(--accent)', concluida: 'var(--success)', atrasada: 'var(--danger)',
}

// ── Carrega etapas com subetapas e serviços via join ──────────────────────────
type EtapaComFilhos = Etapa & {
  subetapas_cronograma: (SubetapaCronograma & { servicos_cronograma: ServicoCronograma[] })[]
}

export default function CanteiroDetalhe() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { currentProfile } = useProfile()
  const supabase = createClient()

  const [obra, setObra] = useState<Obra | null>(null)
  const [tab, setTab] = useState<Tab>('cronograma')
  const [loading, setLoading] = useState(true)

  // Cronograma / checklist
  const [etapas, setEtapas] = useState<EtapaComFilhos[]>([])
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [collapsedSub, setCollapsedSub] = useState<Record<string, boolean>>({})
  const [savingPct, setSavingPct] = useState<string | null>(null)

  // Comunicados
  const [comunicados, setComunicados] = useState<ComunicadoObra[]>([])
  const [comModal, setComModal] = useState(false)
  const [comForm, setComForm] = useState({ titulo: '', conteudo: '', fixado: false })
  const [savingCom, setSavingCom] = useState(false)

  const isPrestador = currentProfile?.tipo === 'prestador'
  const isInterno = currentProfile?.tipo === 'admin' || currentProfile?.tipo === 'usuario'

  const loadEtapas = useCallback(async () => {
    const { data } = await supabase
      .from('etapas')
      .select('*, subetapas_cronograma(*, servicos_cronograma(*))')
      .eq('obra_id', id)
      .order('ordem')
    setEtapas((data || []) as EtapaComFilhos[])
  }, [id, supabase])

  const loadComunicados = useCallback(async () => {
    const { data } = await supabase
      .from('comunicados_obra')
      .select('*, autor:profiles(name, apelido)')
      .eq('obra_id', id)
      .order('fixado', { ascending: false })
      .order('created_at', { ascending: false })
    setComunicados((data || []) as ComunicadoObra[])
  }, [id, supabase])

  useEffect(() => {
    async function load() {
      if (!id) return
      setLoading(true)
      const [obraRes] = await Promise.all([
        supabase.from('obras').select('*').eq('id', id).maybeSingle(),
        loadEtapas(),
        loadComunicados(),
      ])
      setObra(obraRes.data as Obra | null)
      setLoading(false)
    }
    Promise.resolve().then(() => load())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // ── Atualizar % de subetapa ────────────────────────────────────────────────
  async function salvarPctSubetapa(subId: string, pct: number) {
    setSavingPct(subId)
    const status = pct >= 100 ? 'concluida' : pct > 0 ? 'em_andamento' : 'planejada'
    await supabase
      .from('subetapas_cronograma')
      .update({ percentual_executado: pct, status })
      .eq('id', subId)
    await loadEtapas()
    setSavingPct(null)
  }

  // ── Marcar subetapa como concluída (checklist) ────────────────────────────
  async function marcarConcluida(subId: string, concluida: boolean) {
    await supabase
      .from('subetapas_cronograma')
      .update({ status: concluida ? 'concluida' : 'planejada', percentual_executado: concluida ? 100 : 0 })
      .eq('id', subId)
    await loadEtapas()
  }

  // ── Comunicados ───────────────────────────────────────────────────────────
  async function salvarComunicado() {
    if (!comForm.titulo.trim() || !comForm.conteudo.trim()) return
    setSavingCom(true)
    await supabase.from('comunicados_obra').insert({
      obra_id: id,
      autor_id: currentProfile?.id || null,
      titulo: comForm.titulo.trim(),
      conteudo: comForm.conteudo.trim(),
      fixado: comForm.fixado,
    })
    await loadComunicados()
    setSavingCom(false)
    setComModal(false)
    setComForm({ titulo: '', conteudo: '', fixado: false })
  }

  async function deletarComunicado(comId: string) {
    if (!confirm('Remover este comunicado?')) return
    await supabase.from('comunicados_obra').delete().eq('id', comId)
    setComunicados(prev => prev.filter(c => c.id !== comId))
  }

  async function toggleFixado(com: ComunicadoObra) {
    await supabase.from('comunicados_obra').update({ fixado: !com.fixado }).eq('id', com.id)
    setComunicados(prev => prev.map(c => c.id === com.id ? { ...c, fixado: !c.fixado } : c))
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors">
          <ArrowLeft size={18} style={{ color: 'var(--text-secondary)' }} />
        </button>
        <div className="min-w-0">
          <h1 className="font-bold text-lg leading-tight truncate" style={{ color: 'var(--text-primary)' }}>
            {obra?.nome || '—'}
          </h1>
          {obra?.endereco && (
            <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{obra.endereco}</p>
          )}
        </div>
      </div>

      {/* Abas */}
      <div className="flex rounded-xl overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
        {TABS.map(({ id: tid, label, icon: Icon }) => (
          <button
            key={tid}
            onClick={() => setTab(tid)}
            className="flex-1 flex flex-col items-center gap-0.5 py-2 px-1 text-[11px] font-medium transition-all"
            style={tab === tid
              ? { background: 'var(--bg-card)', color: 'var(--accent)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
              : { color: 'var(--text-secondary)' }}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab: Cronograma ─────────────────────────────────────────────────── */}
      {tab === 'cronograma' && (
        <div className="flex flex-col gap-3">
          {etapas.length === 0 ? (
            <EmptyState icon={CalendarDays} title="Sem cronograma" description="Nenhuma etapa lançada nesta obra ainda." />
          ) : etapas.map(etapa => {
            const subs = etapa.subetapas_cronograma || []
            const isOpen = !collapsed[etapa.id]
            const pctEtapa = etapa.percentual_executado ?? 0
            return (
              <div key={etapa.id} className="card overflow-hidden">
                {/* Cabeçalho etapa */}
                <div
                  className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none"
                  style={{ background: 'var(--bg-secondary)' }}
                  onClick={() => setCollapsed(c => ({ ...c, [etapa.id]: !c[etapa.id] }))}
                >
                  <span style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>
                    {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{etapa.nome}</p>
                      <span className="text-xs flex-shrink-0" style={{ color: STATUS_COLOR[etapa.status] }}>
                        {STATUS_LABEL[etapa.status]}
                      </span>
                    </div>
                    {/* Barra de progresso */}
                    <div className="mt-1.5 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pctEtapa}%`, background: pctEtapa >= 100 ? 'var(--success)' : 'var(--accent)' }}
                      />
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{pctEtapa}% concluído · {subs.length} subetapa{subs.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>

                {/* Subetapas */}
                {isOpen && subs.length > 0 && (
                  <div className="flex flex-col divide-y" style={{ borderTop: '1px solid var(--border)', '--tw-divide-color': 'var(--border)' } as React.CSSProperties}>
                    {subs.map(sub => {
                      const svcs = sub.servicos_cronograma || []
                      const subOpen = !collapsedSub[sub.id]
                      const pctSub = sub.percentual_executado ?? 0
                      return (
                        <div key={sub.id}>
                          <div
                            className="flex items-start gap-2 pl-8 pr-4 py-3 cursor-pointer"
                            onClick={() => setCollapsedSub(c => ({ ...c, [sub.id]: !c[sub.id] }))}
                          >
                            <span style={{ color: 'var(--text-secondary)', flexShrink: 0, marginTop: 2 }}>
                              {svcs.length > 0 ? (subOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : <span className="w-3 inline-block" />}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{sub.nome}</p>
                                <span className="text-xs flex-shrink-0" style={{ color: STATUS_COLOR[sub.status] }}>
                                  {STATUS_LABEL[sub.status]}
                                </span>
                              </div>
                              {sub.responsavel && (
                                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>resp: {sub.responsavel}</p>
                              )}
                              {/* Slider de % */}
                              <div className="flex items-center gap-2 mt-2" onClick={e => e.stopPropagation()}>
                                <input
                                  type="range" min={0} max={100} step={5}
                                  value={pctSub}
                                  disabled={savingPct === sub.id}
                                  onChange={e => {
                                    const val = Number(e.target.value)
                                    setEtapas(prev => prev.map(et => ({
                                      ...et,
                                      subetapas_cronograma: et.subetapas_cronograma.map(s =>
                                        s.id === sub.id ? { ...s, percentual_executado: val } : s
                                      )
                                    })))
                                  }}
                                  onMouseUp={e => salvarPctSubetapa(sub.id, Number((e.target as HTMLInputElement).value))}
                                  onTouchEnd={e => salvarPctSubetapa(sub.id, Number((e.target as HTMLInputElement).value))}
                                  className="flex-1 h-1.5 accent-[var(--accent)]"
                                  style={{ cursor: 'pointer' }}
                                />
                                <span className="text-xs font-semibold w-8 text-right flex-shrink-0" style={{ color: 'var(--accent)' }}>
                                  {savingPct === sub.id ? '...' : `${pctSub}%`}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Serviços */}
                          {subOpen && svcs.length > 0 && (
                            <div className="flex flex-col" style={{ borderTop: '1px solid var(--border)' }}>
                              {svcs.map(svc => (
                                <div key={svc.id} className="flex items-center gap-2 pl-14 pr-4 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
                                  <div
                                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                    style={{ background: svc.percentual_executado >= 100 ? 'var(--success)' : 'var(--border)' }}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{svc.nome}</p>
                                    {svc.responsavel && <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{svc.responsavel}</p>}
                                  </div>
                                  <span className="text-xs flex-shrink-0" style={{ color: svc.percentual_executado >= 100 ? 'var(--success)' : 'var(--text-secondary)' }}>
                                    {svc.percentual_executado}%
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {isOpen && subs.length === 0 && (
                  <p className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)', borderTop: '1px solid var(--border)' }}>
                    Sem subetapas nesta etapa.
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Tab: Checklist ─────────────────────────────────────────────────── */}
      {tab === 'checklist' && (() => {
        const pendentes = etapas.flatMap(et =>
          (et.subetapas_cronograma || [])
            .filter(s => s.status !== 'concluida')
            .map(s => ({ ...s, etapaNome: et.nome }))
        )
        const concluidas = etapas.flatMap(et =>
          (et.subetapas_cronograma || [])
            .filter(s => s.status === 'concluida')
            .map(s => ({ ...s, etapaNome: et.nome }))
        )
        return (
          <div className="flex flex-col gap-3">
            <p className="text-xs px-1" style={{ color: 'var(--text-secondary)' }}>
              {pendentes.length} pendente{pendentes.length !== 1 ? 's' : ''} · {concluidas.length} concluída{concluidas.length !== 1 ? 's' : ''}
            </p>
            {pendentes.length === 0 && concluidas.length === 0 && (
              <EmptyState icon={CheckSquare2} title="Checklist vazio" description="Nenhuma subetapa lançada nesta obra." />
            )}

            {pendentes.length > 0 && (
              <div className="card overflow-hidden">
                <div className="px-4 py-2.5" style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                  <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>PENDENTES</p>
                </div>
                {pendentes.map(sub => (
                  <div
                    key={sub.id}
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer active:bg-[var(--bg-secondary)]"
                    style={{ borderBottom: '1px solid var(--border)' }}
                    onClick={() => marcarConcluida(sub.id, true)}
                  >
                    <div
                      className="w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all"
                      style={{ borderColor: sub.status === 'atrasada' ? 'var(--danger)' : 'var(--border)' }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{sub.nome}</p>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{sub.etapaNome}</p>
                    </div>
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                      style={{ color: STATUS_COLOR[sub.status], background: 'var(--bg-secondary)' }}
                    >
                      {STATUS_LABEL[sub.status]}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {concluidas.length > 0 && (
              <div className="card overflow-hidden" style={{ opacity: 0.7 }}>
                <div className="px-4 py-2.5" style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                  <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>CONCLUÍDAS</p>
                </div>
                {concluidas.map(sub => (
                  <div
                    key={sub.id}
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer active:bg-[var(--bg-secondary)]"
                    style={{ borderBottom: '1px solid var(--border)' }}
                    onClick={() => marcarConcluida(sub.id, false)}
                  >
                    <div
                      className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center"
                      style={{ background: 'var(--success)' }}
                    >
                      <Check size={11} color="white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate line-through" style={{ color: 'var(--text-secondary)' }}>{sub.nome}</p>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{sub.etapaNome}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Tab: RDO (componente unificado — mesmo do desktop) ──────────────── */}
      {tab === 'rdo' && <ObraRdo obraId={id} compact />}

      {/* ── Tab: Comunicados ────────────────────────────────────────────────── */}
      {tab === 'comunicados' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-xs px-1" style={{ color: 'var(--text-secondary)' }}>
              {comunicados.length} {comunicados.length === 1 ? 'aviso' : 'avisos'}
            </p>
            {isInterno && (
              <Button size="sm" icon={<Plus size={14} />} onClick={() => setComModal(true)}>
                Novo aviso
              </Button>
            )}
          </div>

          {comunicados.length === 0 ? (
            <EmptyState
              icon={Megaphone}
              title="Nenhum aviso"
              description={isInterno ? 'Publique comunicados para a equipe de campo.' : 'Nenhum aviso publicado pelo responsável ainda.'}
              action={isInterno ? <Button size="sm" icon={<Plus size={14} />} onClick={() => setComModal(true)}>Publicar aviso</Button> : undefined}
            />
          ) : (
            <div className="flex flex-col gap-2">
              {comunicados.map(com => (
                <div
                  key={com.id}
                  className="card p-4 flex flex-col gap-2"
                  style={com.fixado ? { border: '1px solid var(--accent)', background: 'rgba(59,123,248,0.04)' } : {}}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {com.fixado && <Pin size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
                      <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{com.titulo}</p>
                    </div>
                    {isInterno && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => toggleFixado(com)}
                          title={com.fixado ? 'Desafixar' : 'Fixar'}
                          className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
                        >
                          <Pin size={13} style={{ color: com.fixado ? 'var(--accent)' : 'var(--text-secondary)' }} />
                        </button>
                        <button
                          onClick={() => deletarComunicado(com.id)}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 size={13} style={{ color: 'var(--danger)' }} />
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{com.conteudo}</p>
                  <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <Clock size={11} />
                    {new Date(com.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                    {com.autor && (
                      <span>· {com.autor.apelido || com.autor.name}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Modal Comunicado ──────────────────────────────────────────────── */}
      <Modal open={comModal} onClose={() => { setComModal(false); setComForm({ titulo: '', conteudo: '', fixado: false }) }} title="Novo Aviso" size="md">
        <div className="flex flex-col gap-4">
          <Input
            label="Título *"
            value={comForm.titulo}
            onChange={e => setComForm(f => ({ ...f, titulo: e.target.value }))}
            placeholder="Ex: Reunião de obra amanhã"
            autoFocus
          />
          <div>
            <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Mensagem *</label>
            <textarea
              rows={4}
              className="input-base resize-none w-full"
              placeholder="Escreva o comunicado para a equipe..."
              value={comForm.conteudo}
              onChange={e => setComForm(f => ({ ...f, conteudo: e.target.value }))}
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={comForm.fixado}
              onChange={e => setComForm(f => ({ ...f, fixado: e.target.checked }))}
              className="w-4 h-4 rounded accent-[var(--accent)]"
            />
            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Fixar no topo dos avisos</span>
          </label>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => { setComModal(false); setComForm({ titulo: '', conteudo: '', fixado: false }) }}>
              Cancelar
            </Button>
            <Button
              className="flex-1"
              loading={savingCom}
              disabled={!comForm.titulo.trim() || !comForm.conteudo.trim()}
              onClick={salvarComunicado}
            >
              Publicar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
