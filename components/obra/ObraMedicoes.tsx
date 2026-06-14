'use client'

import { useEffect, useMemo, useState } from 'react'
import { TrendingUp, ChevronDown, ChevronRight, ListChecks, ClipboardList, NotebookPen, Sun, Cloud, CloudRain, Camera, X, Plus, Trash2, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Etapa, Medicao } from '@/lib/types'
import { EmptyState } from '@/components/ui/EmptyState'

function corPorPercentual(p: number) {
  if (p >= 100) return 'var(--success)'
  if (p >= 50) return 'var(--accent)'
  if (p > 0) return 'var(--warning)'
  return 'var(--text-secondary)'
}

function clamp(v: number) {
  if (isNaN(v)) return 0
  return Math.min(100, Math.max(0, v))
}

export function ObraMedicoes({ obraId }: { obraId: string }) {
  const supabase = createClient()
  const [etapas, setEtapas] = useState<Etapa[]>([])
  // Subetapas derivadas dos itens do orçamento — mesma lógica do Cronograma
  const [subetapasPorEtapa, setSubetapasPorEtapa] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  // Progresso ao vivo, editável diretamente — persistido em localStorage (mesmo padrão de insumoOverrides)
  const [progresso, setProgresso] = useState<Record<string, number>>({})
  const [progressoLoaded, setProgressoLoaded] = useState(false)
  // Sub-abas: Medição (cascata de %) e Diário / RDO (registro diário com clima, atividades e fotos)
  const [subTab, setSubTab] = useState<'medicao' | 'diario'>('medicao')

  async function loadDados() {
    setLoading(true)
    const [{ data: etapasData }, { data: orcamentos }] = await Promise.all([
      supabase.from('etapas').select('*').eq('obra_id', obraId).order('ordem'),
      supabase.from('orcamentos').select('id').eq('obra_id', obraId),
    ])
    setEtapas(etapasData || [])

    const orcamentoIds = ((orcamentos || []) as { id: string }[]).map(o => o.id)
    let mapa: Record<string, string[]> = {}
    if (orcamentoIds.length > 0) {
      const { data: itens } = await supabase
        .from('orcamento_itens')
        .select('etapa_id, subetapa')
        .in('orcamento_id', orcamentoIds)
        .order('updated_at')

      mapa = ((itens || []) as { etapa_id: string | null; subetapa: string | null }[]).reduce(
        (acc, item) => {
          if (!item.etapa_id) return acc
          const nome = item.subetapa?.trim()
          if (!nome) return acc
          if (!acc[item.etapa_id]) acc[item.etapa_id] = []
          if (!acc[item.etapa_id].includes(nome)) acc[item.etapa_id].push(nome)
          return acc
        },
        {} as Record<string, string[]>
      )
    }
    setSubetapasPorEtapa(mapa)
    setLoading(false)
  }

  useEffect(() => {
    // Disparo assíncrono evita setState síncrono no corpo do efeito (cascading renders)
    Promise.resolve().then(() => loadDados())
  }, [obraId])

  // Carrega progresso do Supabase para esta obra
  useEffect(() => {
    if (!obraId) return
    setProgressoLoaded(false)
    supabase.from('medicao_progresso').select('chave, percentual').eq('obra_id', obraId)
      .then(({ data }: { data: { chave: string; percentual: number }[] | null }) => {
        const map: Record<string, number> = {}
        ;(data ?? []).forEach((row) => { map[row.chave] = Number(row.percentual) })
        setProgresso(map)
        setProgressoLoaded(true)
      })
  }, [obraId])

  // Persiste progresso no Supabase a cada alteração (upsert em lote)
  useEffect(() => {
    if (!obraId || !progressoLoaded || Object.keys(progresso).length === 0) return
    const rows = Object.entries(progresso).map(([chave, percentual]) => ({ obra_id: obraId, chave, percentual }))
    supabase.from('medicao_progresso').upsert(rows, { onConflict: 'obra_id,chave' })
  }, [obraId, progresso, progressoLoaded])

  const chaveEtapa = (etapaId: string) => `etapa:${etapaId}`
  const chaveSub = (etapaId: string, nome: string) => `sub:${etapaId}::${nome}`

  function getEtapaPercentual(etapaId: string) {
    return progresso[chaveEtapa(etapaId)] ?? 0
  }

  function getSubPercentual(etapaId: string, nome: string) {
    return progresso[chaveSub(etapaId, nome)] ?? 0
  }

  // Etapa → Subetapas: define o % da etapa e propaga para todas as subetapas
  function setEtapaPercentual(etapaId: string, valorBruto: number) {
    const valor = clamp(valorBruto)
    setProgresso(prev => {
      const next = { ...prev, [chaveEtapa(etapaId)]: valor }
      const subs = subetapasPorEtapa[etapaId] || []
      subs.forEach(nome => { next[chaveSub(etapaId, nome)] = valor })
      return next
    })
  }

  // Subetapa → Etapa: define o % da subetapa e recalcula a etapa pela média das subetapas
  function setSubetapaPercentual(etapaId: string, nome: string, valorBruto: number) {
    const valor = clamp(valorBruto)
    setProgresso(prev => {
      const next = { ...prev, [chaveSub(etapaId, nome)]: valor }
      const subs = subetapasPorEtapa[etapaId] || []
      if (subs.length > 0) {
        const soma = subs.reduce((acc, n) => acc + (next[chaveSub(etapaId, n)] ?? 0), 0)
        next[chaveEtapa(etapaId)] = soma / subs.length
      }
      return next
    })
  }

  const avancoGlobal = useMemo(() => {
    if (etapas.length === 0) return 0
    return etapas.reduce((acc, e) => acc + getEtapaPercentual(e.id), 0) / etapas.length
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etapas, progresso])

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Sub-abas: Medição (cascata de %) x Diário / RDO (registro diário) */}
      <div className="flex items-center gap-1.5 p-1 rounded-lg w-fit" style={{ background: 'var(--bg-secondary)' }}>
        <button
          onClick={() => setSubTab('medicao')}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-md text-sm font-medium transition-all"
          style={subTab === 'medicao'
            ? { background: 'var(--accent)', color: 'white' }
            : { color: 'var(--text-secondary)' }}
        >
          <ClipboardList size={15} /> Medição
        </button>
        <button
          onClick={() => setSubTab('diario')}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-md text-sm font-medium transition-all"
          style={subTab === 'diario'
            ? { background: 'var(--accent)', color: 'white' }
            : { color: 'var(--text-secondary)' }}
        >
          <NotebookPen size={15} /> Diário (RDO)
        </button>
      </div>

      {subTab === 'diario' ? (
        <DiarioObra obraId={obraId} etapas={etapas} />
      ) : (
        <>
          {/* Avanço físico global */}
          <div className="card p-4 flex items-center gap-4">
            <TrendingUp size={20} style={{ color: 'var(--accent)' }} />
            <div className="flex-1">
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Avanço físico global</p>
              <div className="flex items-center gap-3 mt-1">
                <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${Math.min(100, avancoGlobal)}%`,
                      background: avancoGlobal >= 100 ? 'var(--success)' : 'var(--accent)',
                    }}
                  />
                </div>
                <span className="text-lg font-bold tabular-nums" style={{ color: 'var(--accent)' }}>
                  {avancoGlobal.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          {/* Cascata Etapa → Subetapa, com edição direta do percentual */}
          {etapas.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="Nenhuma etapa cadastrada"
              description="Cadastre etapas no orçamento ou cronograma para acompanhar o andamento da execução aqui."
            />
          ) : (
            <div className="flex flex-col gap-3 pb-16">
              <div className="px-1">
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Atualize o percentual de execução de cada etapa ou subetapa. Ao definir o valor da etapa, as subetapas acompanham automaticamente — e o inverso também: o percentual da etapa é recalculado pela média das subetapas. Você pode ajustar a qualquer momento.
                </span>
              </div>
              {etapas.map(etapa => {
                const subs = subetapasPorEtapa[etapa.id] || []
                return (
                  <GrupoEtapaProgresso
                    key={etapa.id}
                    nome={etapa.nome}
                    percentual={getEtapaPercentual(etapa.id)}
                    onChangePercentual={v => setEtapaPercentual(etapa.id, v)}
                    subetapas={subs}
                    collapsed={collapsed[etapa.id]}
                    onToggleGrupo={() => setCollapsed(c => ({ ...c, [etapa.id]: !c[etapa.id] }))}
                    getSubPercentual={nome => getSubPercentual(etapa.id, nome)}
                    onChangeSubPercentual={(nome, v) => setSubetapaPercentual(etapa.id, nome, v)}
                  />
                )
              })}
            </div>
          )}

          {/* Registros formais de medição — nome, período, % executado, observação e fotos */}
          <RegistrosMedicao obraId={obraId} etapas={etapas} />
        </>
      )}
    </div>
  )
}

// ─── Linha de percentual editável (compartilhada entre etapa e subetapa) ─────
function CampoPercentual({ valor, onChange, tamanho = 'md' }: {
  valor: number
  onChange: (v: number) => void
  tamanho?: 'md' | 'sm'
}) {
  return (
    <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
      <div className={tamanho === 'md' ? 'w-28' : 'w-20'} style={{ height: tamanho === 'md' ? 6 : 5 }}>
        <div className="h-full rounded-full overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${Math.min(100, valor)}%`, background: corPorPercentual(valor) }}
          />
        </div>
      </div>
      <div className="relative flex items-center">
        <input
          type="number"
          min={0}
          max={100}
          step={0.5}
          value={valor || 0}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="input-base py-1 text-sm text-right tabular-nums"
          style={{ width: tamanho === 'md' ? 84 : 76, color: corPorPercentual(valor), fontWeight: 600, paddingRight: 26 }}
        />
        <span className="absolute right-2.5 text-sm pointer-events-none" style={{ color: 'var(--text-secondary)' }}>%</span>
      </div>
    </div>
  )
}

// ─── Grupo de etapa com cascata de subetapas (mesmo padrão visual do Orçamento/Compras) ──
function GrupoEtapaProgresso({
  nome, percentual, onChangePercentual,
  subetapas, collapsed, onToggleGrupo,
  getSubPercentual, onChangeSubPercentual,
}: {
  nome: string
  percentual: number
  onChangePercentual: (v: number) => void
  subetapas: string[]
  collapsed?: boolean
  onToggleGrupo: () => void
  getSubPercentual: (nome: string) => number
  onChangeSubPercentual: (nome: string, v: number) => void
}) {
  const temSubetapas = subetapas.length > 0

  return (
    <div className="card overflow-hidden">
      {/* Cabeçalho etapa */}
      <div
        className="flex items-center gap-3 px-4 py-3 select-none"
        style={{
          background: 'var(--bg-secondary)',
          borderBottom: collapsed || !temSubetapas ? 'none' : '1px solid var(--border)',
          cursor: temSubetapas ? 'pointer' : 'default',
        }}
        onClick={() => temSubetapas && onToggleGrupo()}
      >
        <span className="flex-shrink-0" style={{ color: 'var(--text-secondary)', visibility: temSubetapas ? 'visible' : 'hidden' }}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{nome}</p>
          {temSubetapas && (
            <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
              {subetapas.length} {subetapas.length === 1 ? 'subetapa' : 'subetapas'}
            </p>
          )}
        </div>
        <CampoPercentual valor={percentual} onChange={onChangePercentual} />
      </div>

      {/* Subetapas */}
      {!collapsed && temSubetapas && (
        <div className="flex flex-col">
          {subetapas.map(subNome => (
            <div
              key={subNome}
              className="flex items-center gap-3 pl-9 pr-4 py-2.5"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <span style={{ color: 'var(--border)', fontSize: 10 }}>└</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{subNome}</p>
              </div>
              <CampoPercentual
                valor={getSubPercentual(subNome)}
                onChange={v => onChangeSubPercentual(subNome, v)}
                tamanho="sm"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Diário de obra (RDO) — registro diário com clima, atividades, observações e fotos ──
type Clima = 'sol' | 'nublado' | 'chuva'

type DiarioEntrada = {
  id: string
  data: string
  clima: Clima
  etapaId: string | null
  atividades: string
  observacoes: string
  fotos: string[]
}

const CLIMA_INFO: Record<Clima, { label: string; icon: typeof Sun }> = {
  sol: { label: 'Sol', icon: Sun },
  nublado: { label: 'Nublado', icon: Cloud },
  chuva: { label: 'Chuva', icon: CloudRain },
}

function DiarioObra({ obraId, etapas }: { obraId: string; etapas: Etapa[] }) {
  const supabase = createClient()
  const [entradas, setEntradas] = useState<DiarioEntrada[]>([])
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10))
  const [clima, setClima] = useState<Clima>('sol')
  const [etapaId, setEtapaId] = useState('')
  const [atividades, setAtividades] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [fotos, setFotos] = useState<string[]>([])

  // Carrega registros do diário do Supabase
  useEffect(() => {
    if (!obraId) return
    supabase.from('diario_obra').select('*').eq('obra_id', obraId).order('data', { ascending: false })
      .then(({ data: rows }: { data: { id: string; data: string; clima: string; etapa_id: string | null; atividades: string | null; observacoes: string | null; fotos: string[] | null }[] | null }) => {
        setEntradas((rows ?? []).map((r) => ({
          id: r.id,
          data: r.data,
          clima: (r.clima as Clima) ?? 'sol',
          etapaId: r.etapa_id,
          atividades: r.atividades ?? '',
          observacoes: r.observacoes ?? '',
          fotos: r.fotos ?? [],
        })))
      })
  }, [obraId])

  function handleFotos(files: FileList | null) {
    if (!files) return
    Array.from(files).forEach(file => {
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') setFotos(prev => [...prev, reader.result as string])
      }
      reader.readAsDataURL(file)
    })
  }

  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [salvandoDiario, setSalvandoDiario] = useState(false)

  function limparFormDiario() {
    setAtividades(''); setObservacoes(''); setFotos([])
    setData(new Date().toISOString().slice(0, 10)); setClima('sol'); setEtapaId('')
  }

  async function adicionarEntrada() {
    if (!atividades.trim() && !observacoes.trim() && fotos.length === 0) return
    setSalvandoDiario(true)
    const payload = {
      obra_id: obraId, data, clima,
      etapa_id: etapaId || null,
      atividades: atividades.trim(),
      observacoes: observacoes.trim(),
      fotos,
    }
    if (editandoId) {
      await supabase.from('diario_obra').update(payload).eq('id', editandoId)
      setEntradas(prev => prev.map(e => e.id === editandoId
        ? { ...e, data, clima, etapaId: etapaId || null, atividades: atividades.trim(), observacoes: observacoes.trim(), fotos }
        : e))
      setEditandoId(null)
    } else {
      const { data: nova } = await supabase.from('diario_obra').insert(payload).select().single()
      if (nova) {
        setEntradas(prev => [{
          id: nova.id, data, clima, etapaId: etapaId || null,
          atividades: atividades.trim(), observacoes: observacoes.trim(), fotos,
        }, ...prev])
      }
    }
    limparFormDiario()
    setSalvandoDiario(false)
  }

  function editarEntrada(entrada: DiarioEntrada) {
    setEditandoId(entrada.id)
    setData(entrada.data); setClima(entrada.clima)
    setEtapaId(entrada.etapaId || ''); setAtividades(entrada.atividades)
    setObservacoes(entrada.observacoes); setFotos(entrada.fotos)
  }

  function cancelarEdicao() {
    setEditandoId(null)
    limparFormDiario()
  }

  async function removerEntrada(id: string) {
    if (!confirm('Remover este registro do diário?')) return
    await supabase.from('diario_obra').delete().eq('id', id)
    setEntradas(prev => prev.filter(e => e.id !== id))
    if (editandoId === id) cancelarEdicao()
  }

  return (
    <div className="flex flex-col gap-4 pb-16">
      {/* Formulário de novo registro diário */}
      <div className="card p-4 flex flex-col gap-3">
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          {editandoId ? 'Editando registro diário' : 'Novo registro diário'}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Data</label>
            <input type="date" value={data} onChange={e => setData(e.target.value)} className="input-base w-full" />
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Clima</label>
            <div className="flex gap-1.5">
              {(Object.keys(CLIMA_INFO) as Clima[]).map(c => {
                const Icone = CLIMA_INFO[c].icon
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setClima(c)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-md text-xs font-medium transition-colors"
                    style={{
                      background: clima === c ? 'var(--accent)' : 'var(--bg-secondary)',
                      color: clima === c ? '#fff' : 'var(--text-secondary)',
                    }}
                  >
                    <Icone size={14} /> {CLIMA_INFO[c].label}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Etapa (opcional)</label>
            <select value={etapaId} onChange={e => setEtapaId(e.target.value)} className="input-base w-full">
              <option value="">Geral / sem vínculo</option>
              {etapas.map(et => <option key={et.id} value={et.id}>{et.nome}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>O que foi executado</label>
          <textarea
            value={atividades}
            onChange={e => setAtividades(e.target.value)}
            rows={2}
            placeholder="Ex.: Concretagem das sapatas do bloco A, montagem de fôrmas da viga baldrame..."
            className="input-base w-full resize-none"
          />
        </div>
        <div>
          <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Observações</label>
          <textarea
            value={observacoes}
            onChange={e => setObservacoes(e.target.value)}
            rows={2}
            placeholder="Ocorrências, mão de obra presente, equipamentos, intercorrências..."
            className="input-base w-full resize-none"
          />
        </div>

        <div>
          <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Fotos</label>
          <div className="flex flex-wrap items-center gap-2">
            {fotos.map((foto, i) => (
              <div key={i} className="relative w-16 h-16 rounded-md overflow-hidden flex-shrink-0" style={{ border: '1px solid var(--border)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={foto} alt={`Anexo ${i + 1}`} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setFotos(prev => prev.filter((_, idx) => idx !== i))}
                  className="absolute top-0.5 right-0.5 rounded-full p-0.5"
                  style={{ background: 'rgba(0,0,0,0.55)', color: '#fff' }}
                >
                  <X size={11} />
                </button>
              </div>
            ))}
            <label
              className="flex flex-col items-center justify-center gap-1 w-16 h-16 rounded-md cursor-pointer text-xs flex-shrink-0"
              style={{ border: '1px dashed var(--border)', color: 'var(--text-secondary)' }}
            >
              <Camera size={16} />
              Anexar
              <input type="file" accept="image/*" multiple className="hidden" onChange={e => handleFotos(e.target.files)} />
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          {editandoId && (
            <button
              onClick={cancelarEdicao}
              className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-medium transition-colors"
              style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
            >
              Cancelar edição
            </button>
          )}
          <button onClick={adicionarEntrada} disabled={salvandoDiario} className="btn-primary flex items-center gap-2 text-sm px-4 py-2 disabled:opacity-60">
            <Plus size={15} /> {salvandoDiario ? 'Salvando...' : editandoId ? 'Salvar alterações' : 'Registrar no diário'}
          </button>
        </div>
      </div>

      {/* Histórico de registros */}
      {entradas.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title="Nenhum registro de diário ainda"
          description="Use o formulário acima para registrar as atividades do dia, clima, observações e fotos da obra (RDO)."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {entradas.map(entrada => {
            const Icone = CLIMA_INFO[entrada.clima].icon
            const etapa = etapas.find(e => e.id === entrada.etapaId)
            return (
              <div key={entrada.id} className="card p-4 flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {new Date(`${entrada.data}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                    <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                      <Icone size={12} /> {CLIMA_INFO[entrada.clima].label}
                    </span>
                    {etapa && (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                        {etapa.nome}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => editarEntrada(entrada)} className="p-1.5 rounded-md hover:opacity-70" style={{ color: 'var(--text-secondary)' }} title="Editar registro">
                      <NotebookPen size={15} />
                    </button>
                    <button onClick={() => removerEntrada(entrada.id)} className="p-1.5 rounded-md hover:opacity-70" style={{ color: 'var(--danger)' }} title="Remover registro">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                {entrada.atividades && (
                  <div>
                    <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--text-secondary)' }}>Executado</p>
                    <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{entrada.atividades}</p>
                  </div>
                )}
                {entrada.observacoes && (
                  <div>
                    <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--text-secondary)' }}>Observações</p>
                    <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{entrada.observacoes}</p>
                  </div>
                )}
                {entrada.fotos.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {entrada.fotos.map((foto, i) => (
                      <div key={i} className="w-20 h-20 rounded-md overflow-hidden flex-shrink-0" style={{ border: '1px solid var(--border)' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={foto} alt={`Foto ${i + 1} do registro de ${entrada.data}`} className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Registros formais de medição (CRUD completo — nome, período, % executado, observação, fotos) ──
// Diferente da cascata ao vivo acima (que é só um indicador editável persistido em localStorage),
// aqui o usuário registra "medições" formais — com nome, datas do período, percentual apurado,
// observações e fotos — que ficam salvas na tabela `medicoes` do Supabase e podem ser editadas
// ou removidas a qualquer momento.
const MEDICAO_VAZIA = {
  nome: '', etapaId: '', periodoInicio: '', periodoFim: '', percentual: '', observacao: '',
}

function RegistrosMedicao({ obraId, etapas }: { obraId: string; etapas: Etapa[] }) {
  const supabase = createClient()
  const [medicoes, setMedicoes] = useState<Medicao[]>([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [form, setForm] = useState(MEDICAO_VAZIA)
  const [fotos, setFotos] = useState<string[]>([])
  const [mostrarForm, setMostrarForm] = useState(false)

  useEffect(() => {
    if (!obraId) return
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obraId])

  async function carregar() {
    setLoading(true)
    const { data } = await supabase.from('medicoes').select('*').eq('obra_id', obraId).order('periodo_inicio', { ascending: false })
    setMedicoes((data || []) as Medicao[])
    setLoading(false)
  }

  function handleFotos(files: FileList | null) {
    if (!files) return
    Array.from(files).forEach(file => {
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') setFotos(prev => [...prev, reader.result as string])
      }
      reader.readAsDataURL(file)
    })
  }

  function novoRegistro() {
    setEditandoId(null)
    setForm(MEDICAO_VAZIA)
    setFotos([])
    setMostrarForm(true)
  }

  function editar(m: Medicao) {
    setEditandoId(m.id)
    setForm({
      nome: m.nome || '',
      etapaId: m.etapa_id || '',
      periodoInicio: m.periodo_inicio || '',
      periodoFim: m.periodo_fim || '',
      percentual: String(m.percentual_executado ?? ''),
      observacao: m.observacao || '',
    })
    setFotos(m.fotos || [])
    setMostrarForm(true)
  }

  function cancelar() {
    setEditandoId(null)
    setForm(MEDICAO_VAZIA)
    setFotos([])
    setMostrarForm(false)
  }

  async function salvar() {
    if (!form.periodoInicio || !form.periodoFim) {
      alert('Preencha o período (início e fim) da medição.')
      return
    }
    setSalvando(true)
    const payloadCompleto = {
      obra_id: obraId,
      etapa_id: form.etapaId || null,
      nome: form.nome.trim() || null,
      periodo_inicio: form.periodoInicio,
      periodo_fim: form.periodoFim,
      percentual_executado: clamp(parseFloat(form.percentual) || 0),
      observacao: form.observacao.trim() || null,
      fotos,
      updated_at: new Date().toISOString(),
    }

    async function tentarSalvar(payload: Record<string, unknown>) {
      if (editandoId) return supabase.from('medicoes').update(payload).eq('id', editandoId)
      return supabase.from('medicoes').insert(payload)
    }

    let { error } = await tentarSalvar(payloadCompleto)

    // Coluna ainda não existe no banco (migração pendente) — tenta de novo só
    // com os campos "antigos" (que já existiam antes da migração de nome/fotos/
    // updated_at), pra pelo menos salvar o essencial em vez de falhar tudo.
    if (error && /column .* does not exist/i.test(error.message)) {
      const { nome: _nome, fotos: _fotos, updated_at: _updated, ...payloadBasico } = payloadCompleto
      void _nome; void _fotos; void _updated
      const tentativa2 = await tentarSalvar(payloadBasico)
      error = tentativa2.error
      if (!error) {
        alert(
          'Medição salva — mas SEM nome/fotos, porque o banco ainda não tem essas colunas.\n\n' +
          'Para habilitar nome, fotos e edição completa da medição, é preciso rodar a migração pendente ' +
          '"supabase/migration_medicoes_registro_completo.sql" no SQL Editor do Supabase (uma vez só).'
        )
      }
    }

    setSalvando(false)
    if (error) {
      console.error('Erro ao salvar medição:', error)
      alert(`Não foi possível salvar a medição.\n\nErro do banco: ${error.message}`)
      return
    }
    cancelar()
    carregar()
  }

  async function remover(id: string) {
    if (!confirm('Remover esta medição? Esta ação não pode ser desfeita.')) return
    const { error } = await supabase.from('medicoes').delete().eq('id', id)
    if (error) {
      console.error('Erro ao remover medição:', error)
      alert(`Não foi possível remover a medição.\n\nErro do banco: ${error.message}`)
      return
    }
    setMedicoes(prev => prev.filter(m => m.id !== id))
    if (editandoId === id) cancelar()
  }

  return (
    <div className="flex flex-col gap-3 pb-16">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Registros de medição</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Registre formalmente cada medição do período — com nome, percentual apurado, observações e fotos comprobatórias.
          </p>
        </div>
        {!mostrarForm && (
          <button onClick={novoRegistro} className="btn-primary flex items-center gap-2 text-sm px-4 py-2 flex-shrink-0">
            <Plus size={15} /> Nova medição
          </button>
        )}
      </div>

      {mostrarForm && (
        <div className="card p-4 flex flex-col gap-3">
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {editandoId ? 'Editar medição' : 'Registrar medição'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Nome / identificação</label>
              <input
                value={form.nome}
                onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                placeholder="Ex.: Medição 1 — Fundação"
                className="input-base w-full"
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Etapa (opcional)</label>
              <select value={form.etapaId} onChange={e => setForm(f => ({ ...f, etapaId: e.target.value }))} className="input-base w-full">
                <option value="">Geral / sem vínculo</option>
                {etapas.map(et => <option key={et.id} value={et.id}>{et.nome}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Período — início *</label>
              <input type="date" value={form.periodoInicio} onChange={e => setForm(f => ({ ...f, periodoInicio: e.target.value }))} className="input-base w-full" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Período — fim *</label>
              <input type="date" value={form.periodoFim} onChange={e => setForm(f => ({ ...f, periodoFim: e.target.value }))} className="input-base w-full" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>% executado no período</label>
              <div className="relative flex items-center">
                <input
                  type="number" min={0} max={100} step={0.5}
                  value={form.percentual}
                  onChange={e => setForm(f => ({ ...f, percentual: e.target.value }))}
                  className="input-base w-full text-right tabular-nums"
                  style={{ paddingRight: 26 }}
                />
                <span className="absolute right-2.5 text-sm pointer-events-none" style={{ color: 'var(--text-secondary)' }}>%</span>
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Observações / descrição</label>
            <textarea
              value={form.observacao}
              onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))}
              rows={3}
              placeholder="Detalhes do que foi medido, critérios de aceitação, ressalvas..."
              className="input-base w-full resize-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Fotos</label>
            <div className="flex flex-wrap items-center gap-2">
              {fotos.map((foto, i) => (
                <div key={i} className="relative w-16 h-16 rounded-md overflow-hidden flex-shrink-0" style={{ border: '1px solid var(--border)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={foto} alt={`Anexo ${i + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setFotos(prev => prev.filter((_, idx) => idx !== i))}
                    className="absolute top-0.5 right-0.5 rounded-full p-0.5"
                    style={{ background: 'rgba(0,0,0,0.55)', color: '#fff' }}
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
              <label
                className="flex flex-col items-center justify-center gap-1 w-16 h-16 rounded-md cursor-pointer text-xs flex-shrink-0"
                style={{ border: '1px dashed var(--border)', color: 'var(--text-secondary)' }}
              >
                <Camera size={16} />
                Anexar
                <input type="file" accept="image/*" multiple className="hidden" onChange={e => handleFotos(e.target.files)} />
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={cancelar}
              className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-medium transition-colors"
              style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
            >
              Cancelar
            </button>
            <button
              onClick={salvar}
              disabled={salvando || !form.periodoInicio || !form.periodoFim}
              className="btn-primary flex items-center gap-2 text-sm px-4 py-2 disabled:opacity-50"
            >
              <Plus size={15} /> {salvando ? 'Salvando...' : editandoId ? 'Salvar alterações' : 'Registrar medição'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : medicoes.length === 0 ? (
        !mostrarForm && (
          <EmptyState
            icon={ClipboardList}
            title="Nenhuma medição registrada ainda"
            description="Registre as medições formais do período — nome, percentual apurado, observações e fotos — para manter o histórico de execução da obra."
            action={
              <button onClick={novoRegistro} className="btn-primary px-4 py-2 text-sm rounded-lg inline-flex items-center gap-2">
                <Plus size={15} /> Nova medição
              </button>
            }
          />
        )
      ) : (
        <div className="flex flex-col gap-3">
          {medicoes.map(m => {
            const etapa = etapas.find(e => e.id === m.etapa_id)
            return (
              <div key={m.id} className="card p-4 flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {m.nome || 'Medição sem nome'}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                      {new Date(`${m.periodo_inicio}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                      {' → '}
                      {new Date(`${m.periodo_fim}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                    {etapa && (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                        {etapa.nome}
                      </span>
                    )}
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ color: corPorPercentual(m.percentual_executado), background: 'var(--bg-secondary)' }}>
                      {Number(m.percentual_executado).toFixed(1)}% executado
                    </span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => editar(m)} className="p-1.5 rounded-md hover:opacity-70" style={{ color: 'var(--text-secondary)' }} title="Editar medição">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => remover(m.id)} className="p-1.5 rounded-md hover:opacity-70" style={{ color: 'var(--danger)' }} title="Remover medição">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                {m.observacao && (
                  <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{m.observacao}</p>
                )}
                {m.fotos && m.fotos.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {m.fotos.map((foto, i) => (
                      <div key={i} className="w-20 h-20 rounded-md overflow-hidden flex-shrink-0" style={{ border: '1px solid var(--border)' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={foto} alt={`Foto ${i + 1} da medição ${m.nome || ''}`} className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
