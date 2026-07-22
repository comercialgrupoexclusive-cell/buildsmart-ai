'use client'

// ═══════════════════════════════════════════════════════════════════════════
// RDO unificado (Relatório Diário de Obra) — usado no desktop (aba Diário) e
// no campo (canteiro). Fonte única: tabela `rdo`. Substitui os dois diários
// paralelos que existiam (diario_obra + rdo).
//
// Padrão de mercado (Sienge/Procore/Mobuss): nº sequencial, clima por turno,
// efetivo (mão de obra), equipamentos, atividades ligadas ao cronograma (que
// atualizam o avanço físico), materiais recebidos, ocorrências e fotos.
// ═══════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from 'react'
import {
  Plus, Trash2, Pencil, Camera, X, Sun, Cloud, CloudRain, CloudOff,
  Users, Wrench, ClipboardList, AlertCircle, PackageCheck, ChevronDown, ChevronRight,
  NotebookPen, CalendarDays,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/profile-context'
import type { Rdo, Clima, RdoEfetivo, RdoEquipamento, RdoAtividade } from '@/lib/types'
import { propagarAvancoServicos } from '@/lib/obra-progresso'
import { EmptyState } from '@/components/ui/EmptyState'

const CLIMA: Record<Clima, { label: string; icon: typeof Sun }> = {
  sol: { label: 'Sol', icon: Sun },
  nublado: { label: 'Nublado', icon: Cloud },
  chuva: { label: 'Chuva', icon: CloudRain },
  impraticavel: { label: 'Impraticável', icon: CloudOff },
}
const TURNOS: { key: 'clima_manha' | 'clima_tarde' | 'clima_noite'; label: string }[] = [
  { key: 'clima_manha', label: 'Manhã' },
  { key: 'clima_tarde', label: 'Tarde' },
  { key: 'clima_noite', label: 'Noite' },
]

type SvcFlat = { id: string; nome: string; caminho: string; percentual: number }

const hoje = () => new Date().toISOString().slice(0, 10)

const EMPTY = {
  data: hoje(),
  clima_manha: 'sol' as Clima,
  clima_tarde: 'sol' as Clima,
  clima_noite: 'sol' as Clima,
  condicao_trabalho: 'praticavel' as 'praticavel' | 'parcial' | 'impraticavel',
  efetivo: [] as RdoEfetivo[],
  equipamentos: [] as RdoEquipamento[],
  atividades: [] as RdoAtividade[],
  servicos_executados: '',
  materiais_recebidos: '',
  ocorrencias: '',
  observacoes: '',
}

export function ObraRdo({ obraId, compact = false }: { obraId: string; compact?: boolean }) {
  const supabase = createClient()
  const { currentProfile } = useProfile()
  const [rdos, setRdos] = useState<Rdo[]>([])
  const [servicos, setServicos] = useState<SvcFlat[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [fotos, setFotos] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [expandido, setExpandido] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    const [{ data: rdoData }, { data: etapasData }] = await Promise.all([
      supabase.from('rdo').select('*').eq('obra_id', obraId).order('data', { ascending: false }).order('numero', { ascending: false }),
      supabase.from('etapas').select('nome, ordem, subetapas_cronograma(nome, ordem, servicos_cronograma(id, nome, percentual_executado, ordem))').eq('obra_id', obraId).order('ordem'),
    ])
    setRdos((rdoData || []) as Rdo[])

    const flat: SvcFlat[] = []
    type Raw = { nome: string; subetapas_cronograma: { nome: string; servicos_cronograma: { id: string; nome: string; percentual_executado: number }[] }[] }
    ;((etapasData || []) as Raw[]).forEach(e => {
      (e.subetapas_cronograma || []).forEach(s => {
        (s.servicos_cronograma || []).forEach(v => {
          flat.push({ id: v.id, nome: v.nome, caminho: `${e.nome} › ${s.nome}`, percentual: Number(v.percentual_executado) || 0 })
        })
      })
    })
    setServicos(flat)
    setLoading(false)
  }, [obraId, supabase])

  useEffect(() => { Promise.resolve().then(carregar) }, [carregar])

  function abrirNovo() {
    setEditId(null); setForm({ ...EMPTY, data: hoje() }); setFotos([]); setShowForm(true)
  }
  function abrirEdicao(r: Rdo) {
    setEditId(r.id)
    setForm({
      data: r.data,
      clima_manha: r.clima_manha || 'sol',
      clima_tarde: r.clima_tarde || 'sol',
      clima_noite: r.clima_noite || 'sol',
      condicao_trabalho: r.condicao_trabalho || 'praticavel',
      efetivo: r.efetivo || [],
      equipamentos: r.equipamentos || [],
      atividades: r.atividades || [],
      servicos_executados: r.servicos_executados || '',
      materiais_recebidos: r.materiais_recebidos || '',
      ocorrencias: r.ocorrencias || '',
      observacoes: r.observacoes || '',
    })
    setFotos(r.fotos || [])
    setShowForm(true)
  }
  function cancelar() { setShowForm(false); setEditId(null); setForm(EMPTY); setFotos([]) }

  function anexarFotos(files: FileList | null) {
    if (!files) return
    Array.from(files).forEach(file => {
      const reader = new FileReader()
      reader.onload = () => { if (typeof reader.result === 'string') setFotos(prev => [...prev, reader.result as string]) }
      reader.readAsDataURL(file)
    })
  }

  async function salvar() {
    setSaving(true)
    // Número sequencial por obra (só ao criar)
    let numero = editId ? undefined : 1
    if (!editId) {
      const { data: max } = await supabase.from('rdo').select('numero').eq('obra_id', obraId).order('numero', { ascending: false }).limit(1)
      numero = ((max?.[0]?.numero as number) || 0) + 1
    }
    const totalEfetivo = form.efetivo.reduce((a, e) => a + (Number(e.quantidade) || 0), 0)
    const payload = {
      obra_id: obraId,
      data: form.data,
      autor_id: currentProfile?.id || null,
      clima_manha: form.clima_manha,
      clima_tarde: form.clima_tarde,
      clima_noite: form.clima_noite,
      condicao_trabalho: form.condicao_trabalho,
      efetivo: form.efetivo,
      equipamentos: form.equipamentos,
      atividades: form.atividades,
      servicos_executados: form.servicos_executados.trim() || null,
      equipe_presente: totalEfetivo > 0 ? `${totalEfetivo} no efetivo` : null,
      materiais_recebidos: form.materiais_recebidos.trim() || null,
      ocorrencias: form.ocorrencias.trim() || null,
      observacoes: form.observacoes.trim() || null,
      fotos,
      updated_at: new Date().toISOString(),
      ...(numero !== undefined ? { numero } : {}),
    }

    const { error } = editId
      ? await supabase.from('rdo').update(payload).eq('id', editId)
      : await supabase.from('rdo').insert(payload)

    if (error) { setSaving(false); alert(`Não foi possível salvar o RDO.\n\n${error.message}`); return }

    // Elo com o cronograma: atividades com % informado atualizam o avanço físico
    const avancos = form.atividades
      .filter(a => a.item_tipo === 'servico' && typeof a.percentual === 'number')
      .map(a => ({ servicoId: a.item_id, percentual: a.percentual as number }))
    if (avancos.length > 0) await propagarAvancoServicos(supabase, obraId, avancos)

    setSaving(false)
    cancelar()
    carregar()
  }

  async function remover(id: string) {
    if (!confirm('Remover este RDO?')) return
    await supabase.from('rdo').delete().eq('id', id)
    setRdos(prev => prev.filter(r => r.id !== id))
  }

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} /></div>
  }

  return (
    <div className="flex flex-col gap-4 pb-16">
      {!showForm && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {rdos.length} {rdos.length === 1 ? 'relatório' : 'relatórios'} · fonte única desktop + campo
          </p>
          <button onClick={abrirNovo} className="btn-primary flex items-center gap-2 text-sm px-4 py-2 flex-shrink-0">
            <Plus size={15} /> Novo RDO
          </button>
        </div>
      )}

      {showForm && (
        <RdoForm
          form={form} setForm={setForm}
          fotos={fotos} setFotos={setFotos} anexarFotos={anexarFotos}
          servicos={servicos} editId={editId}
          saving={saving} onSalvar={salvar} onCancelar={cancelar}
          compact={compact}
        />
      )}

      {rdos.length === 0 && !showForm ? (
        <EmptyState icon={ClipboardList} title="Nenhum RDO registrado" description="Registre o dia: clima, efetivo, atividades e ocorrências. As atividades ligadas ao cronograma atualizam o avanço da obra." />
      ) : (
        <div className="flex flex-col gap-2">
          {rdos.map(r => (
            <RdoCard key={r.id} rdo={r} aberto={expandido === r.id}
              onToggle={() => setExpandido(expandido === r.id ? null : r.id)}
              onEditar={() => abrirEdicao(r)} onRemover={() => remover(r.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Formulário de RDO ──────────────────────────────────────────────────────
function RdoForm({
  form, setForm, fotos, setFotos, anexarFotos, servicos, editId, saving, onSalvar, onCancelar, compact,
}: {
  form: typeof EMPTY
  setForm: React.Dispatch<React.SetStateAction<typeof EMPTY>>
  fotos: string[]
  setFotos: React.Dispatch<React.SetStateAction<string[]>>
  anexarFotos: (f: FileList | null) => void
  servicos: SvcFlat[]
  editId: string | null
  saving: boolean
  onSalvar: () => void
  onCancelar: () => void
  compact: boolean
}) {
  const [svcSel, setSvcSel] = useState('')
  const [svcPct, setSvcPct] = useState('')

  function addEfetivo() { setForm(f => ({ ...f, efetivo: [...f.efetivo, { funcao: '', empresa: '', quantidade: 1 }] })) }
  function addEquip() { setForm(f => ({ ...f, equipamentos: [...f.equipamentos, { nome: '', quantidade: 1 }] })) }
  function addAtividade() {
    const svc = servicos.find(s => s.id === svcSel)
    if (!svc) return
    const pct = svcPct === '' ? undefined : Math.min(100, Math.max(0, Number(svcPct)))
    setForm(f => ({ ...f, atividades: [...f.atividades, { item_tipo: 'servico', item_id: svc.id, nome: `${svc.caminho} › ${svc.nome}`, percentual: pct }] }))
    setSvcSel(''); setSvcPct('')
  }

  const label = 'text-xs font-medium mb-1.5 block'
  const secTitle = 'flex items-center gap-2 text-sm font-semibold'

  return (
    <div className="card p-4 flex flex-col gap-4">
      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
        {editId ? 'Editar RDO' : 'Novo Relatório Diário de Obra'}
      </p>

      {/* Data + condição */}
      <div className={`grid grid-cols-1 ${compact ? '' : 'sm:grid-cols-2'} gap-3`}>
        <div>
          <label className={label} style={{ color: 'var(--text-secondary)' }}>Data</label>
          <input type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} className="input-base w-full" />
        </div>
        <div>
          <label className={label} style={{ color: 'var(--text-secondary)' }}>Condição de trabalho</label>
          <div className="flex gap-1.5">
            {([['praticavel', 'Praticável'], ['parcial', 'Parcial'], ['impraticavel', 'Impraticável']] as const).map(([v, l]) => (
              <button key={v} type="button" onClick={() => setForm(f => ({ ...f, condicao_trabalho: v }))}
                className="flex-1 px-2 py-2 rounded-md text-xs font-medium transition-colors"
                style={form.condicao_trabalho === v ? { background: 'var(--accent)', color: '#fff' } : { background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Clima por turno */}
      <div>
        <label className={label} style={{ color: 'var(--text-secondary)' }}>Clima por turno</label>
        <div className="grid grid-cols-3 gap-2">
          {TURNOS.map(t => (
            <div key={t.key} className="rounded-lg p-2" style={{ background: 'var(--bg-secondary)' }}>
              <p className="text-[11px] font-medium mb-1.5 text-center" style={{ color: 'var(--text-secondary)' }}>{t.label}</p>
              <div className="flex justify-center gap-1">
                {(Object.keys(CLIMA) as Clima[]).map(c => {
                  const Ic = CLIMA[c].icon
                  const active = form[t.key] === c
                  return (
                    <button key={c} type="button" title={CLIMA[c].label} onClick={() => setForm(f => ({ ...f, [t.key]: c }))}
                      className="p-1.5 rounded-md transition-colors"
                      style={active ? { background: 'var(--accent)', color: '#fff' } : { color: 'var(--text-secondary)' }}>
                      <Ic size={16} />
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Efetivo */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className={secTitle} style={{ color: 'var(--text-primary)' }}><Users size={15} style={{ color: 'var(--accent)' }} /> Efetivo (mão de obra)</span>
          <button type="button" onClick={addEfetivo} className="text-xs flex items-center gap-1 font-medium" style={{ color: 'var(--accent)' }}><Plus size={13} /> Adicionar</button>
        </div>
        {form.efetivo.map((ef, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input placeholder="Função (ex.: pedreiro)" value={ef.funcao} onChange={e => setForm(f => ({ ...f, efetivo: f.efetivo.map((x, j) => j === i ? { ...x, funcao: e.target.value } : x) }))} className="input-base flex-1 text-sm" />
            {!compact && <input placeholder="Empresa" value={ef.empresa || ''} onChange={e => setForm(f => ({ ...f, efetivo: f.efetivo.map((x, j) => j === i ? { ...x, empresa: e.target.value } : x) }))} className="input-base flex-1 text-sm" />}
            <input type="number" min={0} value={ef.quantidade} onChange={e => setForm(f => ({ ...f, efetivo: f.efetivo.map((x, j) => j === i ? { ...x, quantidade: Number(e.target.value) } : x) }))} className="input-base w-16 text-sm text-center" />
            <button type="button" onClick={() => setForm(f => ({ ...f, efetivo: f.efetivo.filter((_, j) => j !== i) }))} className="p-1.5 rounded-md" style={{ color: 'var(--danger)' }}><X size={14} /></button>
          </div>
        ))}
        {form.efetivo.length === 0 && <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Nenhum registro de efetivo.</p>}
      </div>

      {/* Equipamentos */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className={secTitle} style={{ color: 'var(--text-primary)' }}><Wrench size={15} style={{ color: 'var(--accent)' }} /> Equipamentos</span>
          <button type="button" onClick={addEquip} className="text-xs flex items-center gap-1 font-medium" style={{ color: 'var(--accent)' }}><Plus size={13} /> Adicionar</button>
        </div>
        {form.equipamentos.map((eq, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input placeholder="Equipamento (ex.: betoneira)" value={eq.nome} onChange={e => setForm(f => ({ ...f, equipamentos: f.equipamentos.map((x, j) => j === i ? { ...x, nome: e.target.value } : x) }))} className="input-base flex-1 text-sm" />
            <input type="number" min={0} value={eq.quantidade} onChange={e => setForm(f => ({ ...f, equipamentos: f.equipamentos.map((x, j) => j === i ? { ...x, quantidade: Number(e.target.value) } : x) }))} className="input-base w-16 text-sm text-center" />
            <button type="button" onClick={() => setForm(f => ({ ...f, equipamentos: f.equipamentos.filter((_, j) => j !== i) }))} className="p-1.5 rounded-md" style={{ color: 'var(--danger)' }}><X size={14} /></button>
          </div>
        ))}
        {form.equipamentos.length === 0 && <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Nenhum equipamento.</p>}
      </div>

      {/* Atividades ligadas ao cronograma */}
      <div className="flex flex-col gap-2">
        <span className={secTitle} style={{ color: 'var(--text-primary)' }}><ClipboardList size={15} style={{ color: 'var(--accent)' }} /> Atividades executadas (cronograma)</span>
        {servicos.length > 0 ? (
          <div className={`flex ${compact ? 'flex-col' : ''} gap-2 items-stretch`}>
            <select value={svcSel} onChange={e => setSvcSel(e.target.value)} className="input-base flex-1 text-sm">
              <option value="">Selecione um serviço do cronograma…</option>
              {servicos.map(s => <option key={s.id} value={s.id}>{s.caminho} › {s.nome} ({s.percentual}%)</option>)}
            </select>
            <div className="flex gap-2">
              <div className="relative flex items-center">
                <input type="number" min={0} max={100} placeholder="novo %" value={svcPct} onChange={e => setSvcPct(e.target.value)} className="input-base w-24 text-sm text-right" style={{ paddingRight: 22 }} />
                <span className="absolute right-2 text-sm pointer-events-none" style={{ color: 'var(--text-secondary)' }}>%</span>
              </div>
              <button type="button" onClick={addAtividade} disabled={!svcSel} className="btn-primary px-3 text-sm disabled:opacity-50">Add</button>
            </div>
          </div>
        ) : (
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Sem serviços no cronograma para vincular.</p>
        )}
        {form.atividades.map((a, i) => (
          <div key={i} className="flex items-center gap-2 rounded-md px-2.5 py-1.5" style={{ background: 'var(--bg-secondary)' }}>
            <span className="text-xs flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{a.nome}</span>
            {typeof a.percentual === 'number' && <span className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>→ {a.percentual}%</span>}
            <button type="button" onClick={() => setForm(f => ({ ...f, atividades: f.atividades.filter((_, j) => j !== i) }))} className="p-1 rounded" style={{ color: 'var(--danger)' }}><X size={13} /></button>
          </div>
        ))}
        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Ao informar um novo %, o avanço do serviço é atualizado no cronograma automaticamente.</p>
      </div>

      {/* Textos livres */}
      <div>
        <label className={label} style={{ color: 'var(--text-secondary)' }}>Serviços executados (descrição livre)</label>
        <textarea rows={2} value={form.servicos_executados} onChange={e => setForm(f => ({ ...f, servicos_executados: e.target.value }))} placeholder="Resumo do que foi feito no dia…" className="input-base w-full resize-none" />
      </div>
      <div className={`grid grid-cols-1 ${compact ? '' : 'sm:grid-cols-2'} gap-3`}>
        <div>
          <label className={label} style={{ color: 'var(--text-secondary)' }}>Materiais recebidos</label>
          <textarea rows={2} value={form.materiais_recebidos} onChange={e => setForm(f => ({ ...f, materiais_recebidos: e.target.value }))} placeholder="Materiais que chegaram no canteiro…" className="input-base w-full resize-none" />
        </div>
        <div>
          <label className={label} style={{ color: 'var(--text-secondary)' }}>Ocorrências</label>
          <textarea rows={2} value={form.ocorrencias} onChange={e => setForm(f => ({ ...f, ocorrencias: e.target.value }))} placeholder="Atrasos, acidentes, fiscalização, paralisação…" className="input-base w-full resize-none" />
        </div>
      </div>

      {/* Fotos */}
      <div>
        <label className={label} style={{ color: 'var(--text-secondary)' }}>Fotos</label>
        <div className="flex flex-wrap items-center gap-2">
          {fotos.map((foto, i) => (
            <div key={i} className="relative w-16 h-16 rounded-md overflow-hidden flex-shrink-0" style={{ border: '1px solid var(--border)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={foto} alt={`Anexo ${i + 1}`} className="w-full h-full object-cover" />
              <button type="button" onClick={() => setFotos(prev => prev.filter((_, idx) => idx !== i))} className="absolute top-0.5 right-0.5 rounded-full p-0.5" style={{ background: 'rgba(0,0,0,0.55)', color: '#fff' }}><X size={11} /></button>
            </div>
          ))}
          <label className="flex flex-col items-center justify-center gap-1 w-16 h-16 rounded-md cursor-pointer text-xs flex-shrink-0" style={{ border: '1px dashed var(--border)', color: 'var(--text-secondary)' }}>
            <Camera size={16} /> Anexar
            <input type="file" accept="image/*" multiple className="hidden" onChange={e => anexarFotos(e.target.files)} />
          </label>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={onCancelar} className="text-sm px-4 py-2 rounded-lg font-medium" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>Cancelar</button>
        <button onClick={onSalvar} disabled={saving} className="btn-primary flex items-center gap-2 text-sm px-4 py-2 disabled:opacity-60">
          <Plus size={15} /> {saving ? 'Salvando…' : editId ? 'Salvar alterações' : 'Registrar RDO'}
        </button>
      </div>
    </div>
  )
}

// ─── Card de RDO ─────────────────────────────────────────────────────────────
function RdoCard({ rdo, aberto, onToggle, onEditar, onRemover }: {
  rdo: Rdo; aberto: boolean; onToggle: () => void; onEditar: () => void; onRemover: () => void
}) {
  const totalEfetivo = (rdo.efetivo || []).reduce((a, e) => a + (Number(e.quantidade) || 0), 0)
  const climas = [rdo.clima_manha, rdo.clima_tarde, rdo.clima_noite].filter(Boolean) as Clima[]
  const dataFmt = new Date(rdo.data + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none" onClick={onToggle}>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--bg-secondary)' }}>
          <ClipboardList size={16} style={{ color: 'var(--accent)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {rdo.numero != null && <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--accent)', color: '#fff' }}>RDO {rdo.numero}</span>}
            <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{dataFmt}</p>
            {rdo.condicao_trabalho === 'impraticavel' && <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }}>Impraticável</span>}
          </div>
          <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {totalEfetivo > 0 ? `${totalEfetivo} no efetivo · ` : ''}
            {(rdo.atividades || []).length > 0 ? `${rdo.atividades.length} atividade(s)` : (rdo.servicos_executados || 'Sem atividades registradas')}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
          {climas.slice(0, 3).map((c, i) => { const Ic = CLIMA[c].icon; return <Ic key={i} size={13} /> })}
          {aberto ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </div>
      </div>

      {aberto && (
        <div className="flex flex-col gap-3 px-4 py-3" style={{ borderTop: '1px solid var(--border)' }}>
          {(rdo.efetivo || []).length > 0 && (
            <Bloco icon={Users} cor="var(--accent)" titulo="Efetivo">
              <div className="flex flex-wrap gap-1.5">
                {rdo.efetivo.map((e, i) => <span key={i} className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>{e.quantidade}× {e.funcao}{e.empresa ? ` (${e.empresa})` : ''}</span>)}
              </div>
            </Bloco>
          )}
          {(rdo.equipamentos || []).length > 0 && (
            <Bloco icon={Wrench} cor="var(--accent)" titulo="Equipamentos">
              <div className="flex flex-wrap gap-1.5">
                {rdo.equipamentos.map((e, i) => <span key={i} className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>{e.quantidade}× {e.nome}</span>)}
              </div>
            </Bloco>
          )}
          {(rdo.atividades || []).length > 0 && (
            <Bloco icon={CalendarDays} cor="var(--success)" titulo="Atividades (cronograma)">
              <div className="flex flex-col gap-1">
                {rdo.atividades.map((a, i) => <p key={i} className="text-sm" style={{ color: 'var(--text-primary)' }}>• {a.nome}{typeof a.percentual === 'number' ? ` — ${a.percentual}%` : ''}</p>)}
              </div>
            </Bloco>
          )}
          {rdo.servicos_executados && <Bloco icon={ClipboardList} cor="var(--success)" titulo="Serviços executados"><p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{rdo.servicos_executados}</p></Bloco>}
          {rdo.materiais_recebidos && <Bloco icon={PackageCheck} cor="var(--accent)" titulo="Materiais recebidos"><p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{rdo.materiais_recebidos}</p></Bloco>}
          {rdo.ocorrencias && <Bloco icon={AlertCircle} cor="var(--warning)" titulo="Ocorrências"><p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{rdo.ocorrencias}</p></Bloco>}
          {rdo.observacoes && <Bloco icon={NotebookPen} cor="var(--text-secondary)" titulo="Observações"><p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{rdo.observacoes}</p></Bloco>}

          {rdo.fotos && rdo.fotos.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {rdo.fotos.map((foto, i) => (
                <div key={i} className="w-20 h-20 rounded-md overflow-hidden flex-shrink-0" style={{ border: '1px solid var(--border)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={foto} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={onEditar} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[var(--bg-secondary)]" style={{ color: 'var(--text-secondary)' }}><Pencil size={12} /> Editar</button>
            <button onClick={onRemover} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-500/10" style={{ color: 'var(--danger)' }}><Trash2 size={12} /> Remover</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Bloco({ icon: Icon, cor, titulo, children }: { icon: typeof Users; cor: string; titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={12} style={{ color: cor }} />
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>{titulo}</p>
      </div>
      {children}
    </div>
  )
}
