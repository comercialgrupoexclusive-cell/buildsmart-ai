'use client'

// Laboratório Investidor — hub com as 3 abas (Prospecções | Ativos |
// Comparador). As 3 têm funcionalidade real desde o Marco 5 — Comparador
// não cria tabela própria, só lê Prospecções/Cenários já existentes (ver
// RELATORIO_INVESTIDOR_RODADA_05.md), sem score/ranking próprio.
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Plus, Search, Landmark, Columns3, Calendar, MapPin, ImagePlus, ChevronLeft, ChevronRight, Bot, Play, Clock3, Power, History } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { usePermission } from '@/lib/permissions'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { formatCurrency } from '@/lib/utils'
import { MODALIDADE_LABEL } from '@/components/investidor/ProspeccaoCenarios'
import type { InvestidorAgente, InvestidorRotina, InvestidorRotinaRun, Prospeccao, ProspeccaoFase, ProspeccaoCenario } from '@/lib/types'

type ProspeccaoComPrincipal = Prospeccao & { prospeccao_cenarios?: ProspeccaoCenario[] }
type ProspeccaoComCenarios = Prospeccao & { prospeccao_cenarios: ProspeccaoCenario[] }

type IndicadorKey = 'valor_venda_estimado' | 'valor_arrematacao' | 'investimento_total' | 'valor_liquido_venda' | 'lucro' | 'rentabilidade' | 'prazo_venda_meses'

// "Avaliação" e "venda estimada" da especificação (seção 3.3) mapeados aos
// campos reais do Marco 1: avaliação = premissa valor_venda_estimado (o que
// se acha que vale); "venda estimada" do Comparador é o resultado líquido
// já calculado pelo motor do Marco 3 (valor_liquido_venda) — o que
// efetivamente sobra depois de custos/impostos, não a mesma coisa que a
// avaliação bruta. Mesma disciplina de interpretação documentada na Rodada 2.
const INDICADORES: { key: IndicadorKey; label: string; formato: 'moeda' | 'pct' | 'meses'; melhor?: 'maior' | 'menor' }[] = [
  { key: 'valor_venda_estimado', label: 'Avaliação (venda estimada)', formato: 'moeda' },
  { key: 'valor_arrematacao', label: 'Aquisição', formato: 'moeda' },
  { key: 'investimento_total', label: 'Investimento total', formato: 'moeda', melhor: 'menor' },
  { key: 'valor_liquido_venda', label: 'Venda estimada líquida', formato: 'moeda', melhor: 'maior' },
  { key: 'lucro', label: 'Lucro', formato: 'moeda', melhor: 'maior' },
  { key: 'rentabilidade', label: 'Rentabilidade', formato: 'pct', melhor: 'maior' },
  { key: 'prazo_venda_meses', label: 'Prazo até a venda', formato: 'meses' },
]

function formatarIndicador(valor: number | null, formato: 'moeda' | 'pct' | 'meses') {
  if (valor == null) return '—'
  if (formato === 'moeda') return formatCurrency(valor)
  if (formato === 'pct') return `${valor.toFixed(1)}%`
  return `${valor} ${valor === 1 ? 'mês' : 'meses'}`
}

// Ativo = Project com contexto='investimento' (Marco 4). Tipo mínimo local
// — a tela real de detalhe é a própria /projetos/[id], não uma tela nova.
type AtivoProjeto = {
  id: string
  nome: string
  endereco: string | null
  foto_url: string | null
  fase_ciclo: 'projeto' | 'em_obra' | 'entregue'
  created_at: string
}

const FASE_ATIVO_LABEL: Record<AtivoProjeto['fase_ciclo'], { label: string; color: string }> = {
  projeto: { label: 'Adquirido', color: '#8b5cf6' },
  em_obra: { label: 'Em reforma', color: 'var(--accent)' },
  entregue: { label: 'Pronto', color: '#10b981' },
}

const FASE_META: Record<ProspeccaoFase, { label: string; color: string }> = {
  nova: { label: 'Nova', color: '#64748b' },
  em_analise: { label: 'Em análise', color: 'var(--accent)' },
  aprovada: { label: 'Aprovada', color: '#10b981' },
  em_disputa: { label: 'Em disputa', color: '#f59e0b' },
  adquirida: { label: 'Adquirida', color: '#8b5cf6' },
  descartada: { label: 'Descartada', color: '#ef4444' },
  nao_adquirida: { label: 'Não adquirida', color: '#94a3b8' },
}

const FASES_ORDEM: ProspeccaoFase[] = ['nova', 'em_analise', 'aprovada', 'em_disputa', 'adquirida', 'descartada', 'nao_adquirida']

const EMPTY_FORM = { nome: '', endereco: '', link_leilao: '', data_leilao: '' }
const ROTINA_TIPO_LABEL: Record<InvestidorRotina['tipo'], string> = {
  triagem_prospeccoes: 'Triagem de prospecções',
  revisao_cenarios: 'Revisão de cenários',
  monitoramento_leilao: 'Monitoramento de leilão',
  pesquisa_mercado: 'Pesquisa de mercado',
}
const ROTINA_FREQ_LABEL: Record<InvestidorRotina['frequencia'], string> = {
  manual: 'Manual',
  diaria: 'Diária',
  semanal: 'Semanal',
}
const ROTINA_EMPTY_FORM = {
  nome: 'Triagem semanal de prospecções',
  descricao: 'Verifica oportunidades em análise, leilões próximos e prospecções sem cenário financeiro.',
  tipo: 'triagem_prospeccoes' as InvestidorRotina['tipo'],
  frequencia: 'manual' as InvestidorRotina['frequencia'],
  agente_id: '',
}

export default function InvestidorPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tab = (searchParams.get('tab') as 'prospeccoes' | 'ativos' | 'comparador' | 'rotinas') ?? 'prospeccoes'

  function setTab(next: string) {
    router.push(`/investidor?tab=${next}`)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Landmark size={22} style={{ color: 'var(--accent)' }} /> Investidor
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Laboratório de investimento imobiliário — leilão, análise e aquisição.
          </p>
        </div>
      </div>

      <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        {[
          { id: 'prospeccoes', label: 'Prospecções' },
          { id: 'ativos', label: 'Ativos' },
          { id: 'comparador', label: 'Comparador' },
          { id: 'rotinas', label: 'Rotinas' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="px-3.5 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap"
            style={tab === t.id ? { background: 'var(--accent)', color: 'white' } : { color: 'var(--text-secondary)' }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'prospeccoes' && <ProspeccoesTab />}
      {tab === 'ativos' && <AtivosTab />}
      {tab === 'comparador' && <ComparadorTab />}
      {tab === 'rotinas' && <RotinasAgentesTab />}
    </div>
  )
}

type RotinaComAgente = InvestidorRotina & { agente?: InvestidorAgente | null }

function RotinasAgentesTab() {
  const { isCliente } = usePermission()
  const [agentes, setAgentes] = useState<InvestidorAgente[]>([])
  const [rotinas, setRotinas] = useState<RotinaComAgente[]>([])
  const [runs, setRuns] = useState<InvestidorRotinaRun[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [executingId, setExecutingId] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    function onChanged() { void load() }
    window.addEventListener('buildsmart:investidor-changed', onChanged)
    return () => window.removeEventListener('buildsmart:investidor-changed', onChanged)
  }, [])

  async function load() {
    setLoading(true)
    const supabase = createClient()
    const [{ data: agentesData }, { data: rotinasData }, { data: runsData }] = await Promise.all([
      supabase.from('investidor_agentes').select('*').order('created_at', { ascending: true }),
      supabase.from('investidor_rotinas').select('*, agente:investidor_agentes(*)').order('created_at', { ascending: false }),
      supabase.from('investidor_rotina_runs').select('*').order('started_at', { ascending: false }).limit(8),
    ])
    setAgentes((agentesData ?? []) as InvestidorAgente[])
    setRotinas((rotinasData ?? []) as RotinaComAgente[])
    setRuns((runsData ?? []) as InvestidorRotinaRun[])
    setLoading(false)
  }

  async function executarRotina(rotina: RotinaComAgente) {
    if (!confirm(`Executar agora a rotina "${rotina.nome}"?\n\nEla registra uma leitura auditada e não altera prospecções, cenários ou ativos.`)) return
    setExecutingId(rotina.id)
    const supabase = createClient()
    const { error } = await supabase.rpc('investidor_executar_rotina', {
      p_rotina_id: rotina.id,
      p_actor: 'Painel Investidor',
    })
    setExecutingId(null)
    if (error) {
      alert(`Não foi possível executar a rotina: ${error.message}`)
      return
    }
    window.dispatchEvent(new CustomEvent('buildsmart:investidor-changed'))
    await load()
  }

  async function toggleRotina(rotina: RotinaComAgente) {
    const supabase = createClient()
    const { error } = await supabase.from('investidor_rotinas').update({
      ativo: !rotina.ativo,
      updated_at: new Date().toISOString(),
    }).eq('id', rotina.id)
    if (error) alert(`Não foi possível alterar a rotina: ${error.message}`)
    else await load()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-5">
        <div className="card p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <Bot size={17} style={{ color: 'var(--accent)' }} /> Agentes
              </h2>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                Agentes combinam skill, contexto, gatilho e permissões. Nesta rodada, execução é assistida e auditada.
              </p>
            </div>
          </div>

          {agentes.length === 0 ? (
            <EmptyState icon={Bot} title="Nenhum agente cadastrado" description="Aplique a migration da Rodada 8 para criar o Agente de Prospecção." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {agentes.map(agente => (
                <div key={agente.id} className="rounded-xl p-4 border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{agente.nome}</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{agente.descricao || 'Sem descrição'}</p>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-1 rounded-full flex-shrink-0" style={{
                      background: agente.ativo ? 'rgba(16,185,129,0.12)' : 'rgba(148,163,184,0.12)',
                      color: agente.ativo ? 'var(--success)' : 'var(--text-secondary)',
                    }}>
                      {agente.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {(agente.permissoes || []).map(permissao => (
                      <span key={permissao} className="text-[10px] px-2 py-0.5 rounded-full" style={{ color: 'var(--text-secondary)', background: 'var(--bg-card)' }}>
                        {permissao}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5 space-y-4">
          <div>
            <h2 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <History size={17} style={{ color: 'var(--accent)' }} /> Histórico
            </h2>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Últimas execuções registradas.</p>
          </div>
          {runs.length === 0 ? (
            <p className="text-sm py-8 text-center" style={{ color: 'var(--text-secondary)' }}>Nenhuma rotina executada ainda.</p>
          ) : (
            <div className="space-y-2">
              {runs.map(run => (
                <div key={run.id} className="rounded-lg p-3 border" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold" style={{ color: run.status === 'concluida' ? 'var(--success)' : 'var(--danger)' }}>
                      {run.status}
                    </span>
                    <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      {new Date(run.started_at).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <p className="text-xs mt-1 line-clamp-3" style={{ color: 'var(--text-primary)' }}>{run.resumo || run.erro || 'Sem resumo.'}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Clock3 size={17} style={{ color: 'var(--accent)' }} /> Rotinas
            </h2>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              Rotinas são gatilhos assistidos. A execução manual registra leitura e prepara a base para automações futuras.
            </p>
          </div>
          {!isCliente && (
            <Button onClick={() => setShowModal(true)} icon={<Plus size={16} />}>Nova rotina</Button>
          )}
        </div>

        {rotinas.length === 0 ? (
          <EmptyState
            icon={Clock3}
            title="Nenhuma rotina cadastrada"
            description="Crie uma rotina para acompanhar triagem, cenários, leilões ou pesquisa de mercado."
            action={!isCliente ? <Button onClick={() => setShowModal(true)} icon={<Plus size={16} />}>Nova rotina</Button> : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {rotinas.map(rotina => (
              <div key={rotina.id} className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{rotina.nome}</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{rotina.descricao || ROTINA_TIPO_LABEL[rotina.tipo]}</p>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-1 rounded-full flex-shrink-0" style={{
                    background: rotina.ativo ? 'rgba(16,185,129,0.12)' : 'rgba(148,163,184,0.12)',
                    color: rotina.ativo ? 'var(--success)' : 'var(--text-secondary)',
                  }}>
                    {rotina.ativo ? 'Ativa' : 'Inativa'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
                  <ResumoMini label="Agente" value={rotina.agente?.nome || 'Sem agente'} />
                  <ResumoMini label="Frequência" value={ROTINA_FREQ_LABEL[rotina.frequencia] || rotina.frequencia} />
                  <ResumoMini label="Tipo" value={ROTINA_TIPO_LABEL[rotina.tipo] || rotina.tipo} />
                  <ResumoMini label="Última execução" value={rotina.ultima_execucao ? new Date(rotina.ultima_execucao).toLocaleDateString('pt-BR') : 'Nunca'} />
                </div>
                {!isCliente && (
                  <div className="flex justify-end gap-2 mt-4">
                    <Button variant="secondary" size="sm" icon={<Power size={13} />} onClick={() => toggleRotina(rotina)}>
                      {rotina.ativo ? 'Pausar' : 'Ativar'}
                    </Button>
                    <Button size="sm" icon={<Play size={13} />} loading={executingId === rotina.id} onClick={() => executarRotina(rotina)}>
                      Executar
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <NovaRotinaModal open={showModal} agentes={agentes} onClose={() => setShowModal(false)} onCreated={load} />
    </div>
  )
}

function ResumoMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: 'var(--bg-card)' }}>
      <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>{label}</p>
      <p className="text-xs font-semibold mt-0.5 truncate" style={{ color: 'var(--text-primary)' }}>{value}</p>
    </div>
  )
}

function NovaRotinaModal({ open, agentes, onClose, onCreated }: { open: boolean; agentes: InvestidorAgente[]; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState(ROTINA_EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const agenteSelecionadoId = form.agente_id || agentes[0]?.id || ''

  function closeAndReset() {
    setForm({ ...ROTINA_EMPTY_FORM, agente_id: agentes[0]?.id || '' })
    onClose()
  }

  async function handleSave() {
    if (!form.nome.trim()) return
    setSaving(true)
    const supabase = createClient()
      const { error } = await supabase.from('investidor_rotinas').insert({
      agente_id: agenteSelecionadoId || null,
      nome: form.nome.trim(),
      descricao: form.descricao.trim() || null,
      tipo: form.tipo,
      frequencia: form.frequencia,
      ativo: true,
      parametros: { criado_via: 'painel' },
    })
    setSaving(false)
    if (error) {
      alert(`Não foi possível criar a rotina: ${error.message}`)
      return
    }
    onCreated()
    closeAndReset()
  }

  return (
    <Modal open={open} onClose={() => !saving && closeAndReset()} title="Nova rotina" size="md">
      <div className="space-y-4">
        <Input
          label="Nome *"
          value={form.nome}
          onChange={event => setForm(f => ({ ...f, nome: event.target.value }))}
        />
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-[var(--text-secondary)]">Descrição</label>
          <textarea
            className="input-base min-h-20 resize-none"
            value={form.descricao}
            onChange={event => setForm(f => ({ ...f, descricao: event.target.value }))}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--text-secondary)]">Agente</label>
            <select
              className="input-base"
              value={agenteSelecionadoId}
              onChange={event => setForm(f => ({ ...f, agente_id: event.target.value }))}
            >
              {agentes.map(agente => <option key={agente.id} value={agente.id}>{agente.nome}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--text-secondary)]">Tipo</label>
            <select
              className="input-base"
              value={form.tipo}
              onChange={event => setForm(f => ({ ...f, tipo: event.target.value as InvestidorRotina['tipo'] }))}
            >
              {Object.entries(ROTINA_TIPO_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--text-secondary)]">Frequência</label>
            <select
              className="input-base"
              value={form.frequencia}
              onChange={event => setForm(f => ({ ...f, frequencia: event.target.value as InvestidorRotina['frequencia'] }))}
            >
              {Object.entries(ROTINA_FREQ_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        </div>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Nesta rodada, rotinas ficam prontas para agendamento futuro, mas a execução é manual e auditada para evitar automações silenciosas.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={closeAndReset} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving} disabled={!form.nome.trim() || agentes.length === 0}>Criar rotina</Button>
        </div>
      </div>
    </Modal>
  )
}

function ProspeccoesTab() {
  const { isCliente } = usePermission()
  const [prospeccoes, setProspeccoes] = useState<ProspeccaoComPrincipal[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [faseFilter, setFaseFilter] = useState<'todas' | ProspeccaoFase>('todas')
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  // A Luiza (Marco 6) pode criar/editar uma Prospecção fora desta tela —
  // recarrega sem precisar de F5. Ver components/layout/LuiziaFloatingChat.tsx.
  useEffect(() => {
    function onChanged() { void load() }
    window.addEventListener('buildsmart:investidor-changed', onChanged)
    return () => window.removeEventListener('buildsmart:investidor-changed', onChanged)
  }, [])

  async function load() {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('prospeccoes')
      .select('*, prospeccao_cenarios(id,nome,principal,valor_arrematacao,lucro,rentabilidade)')
      .order('created_at', { ascending: false })
    setProspeccoes((data ?? []) as ProspeccaoComPrincipal[])
    setLoading(false)
  }

  const filtered = prospeccoes.filter(p => {
    const matchesSearch = p.nome.toLowerCase().includes(search.toLowerCase()) ||
      (p.endereco ?? '').toLowerCase().includes(search.toLowerCase())
    const matchesFase = faseFilter === 'todas' || p.fase === faseFilter
    return matchesSearch && matchesFase
  })

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex flex-col sm:flex-row gap-3 flex-1">
          <div className="relative max-w-sm w-full">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
            <input
              className="w-full pl-9 pr-3 py-2 rounded-lg text-sm border outline-none"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              placeholder="Buscar por nome ou endereço..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setFaseFilter('todas')}
              className="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 border transition-colors"
              style={faseFilter === 'todas'
                ? { background: 'var(--accent)', color: 'white', borderColor: 'var(--accent)' }
                : { color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
            >
              Todas
            </button>
            {FASES_ORDEM.map(f => (
              <button
                key={f}
                onClick={() => setFaseFilter(f)}
                className="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 border transition-colors"
                style={faseFilter === f
                  ? { background: FASE_META[f].color, color: 'white', borderColor: FASE_META[f].color }
                  : { color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
              >
                {FASE_META[f].label}
              </button>
            ))}
          </div>
        </div>
        {!isCliente && (
          <Button onClick={() => setShowModal(true)} icon={<Plus size={16} />} className="flex-shrink-0">
            Nova prospecção
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="Nenhuma prospecção encontrada"
          description={search || faseFilter !== 'todas' ? 'Tente outro termo ou filtro.' : 'Cadastre a primeira oportunidade de leilão para começar.'}
          action={!isCliente && !search && faseFilter === 'todas'
            ? <Button onClick={() => setShowModal(true)} icon={<Plus size={16} />}>Nova prospecção</Button>
            : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((p, i) => <ProspeccaoCard key={p.id} prospeccao={p} index={i} />)}
        </div>
      )}

      <NovaProspeccaoModal open={showModal} onClose={() => setShowModal(false)} onCreated={load} />
    </div>
  )
}

function ProspeccaoCard({ prospeccao: p, index }: { prospeccao: ProspeccaoComPrincipal; index: number }) {
  const meta = FASE_META[p.fase]
  const principal = p.prospeccao_cenarios?.find(c => c.principal)
  const temResultado = principal && (principal.lucro != null || principal.rentabilidade != null)

  return (
    <Link
      href={`/investidor/${p.id}`}
      className="group block overflow-hidden rounded-2xl transition-transform hover:scale-[1.015] animate-enter"
      style={{
        animationDelay: `${index * 60}ms`,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
      }}
    >
      <div className="relative h-44 overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
        {p.foto_url ? (
          <img src={p.foto_url} alt={p.nome} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            <Landmark size={40} style={{ color: 'var(--border)' }} />
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Sem foto</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
        <div className="absolute top-3 right-3">
          <span
            className="text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ background: `${meta.color}22`, color: meta.color, border: `1px solid ${meta.color}55`, backdropFilter: 'blur(8px)' }}
          >
            {meta.label}
          </span>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h3 className="font-semibold text-base leading-tight truncate text-white">{p.nome}</h3>
          {p.endereco && (
            <p className="text-xs truncate mt-1 text-white/70 flex items-center gap-1">
              <MapPin size={11} /> {p.endereco}
            </p>
          )}
        </div>
      </div>

      <div className="px-4 py-3 flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
            <Calendar size={11} />
            {p.data_leilao ? new Date(p.data_leilao + 'T12:00:00').toLocaleDateString('pt-BR') : 'Sem data de leilão'}
          </span>
          {principal?.valor_arrematacao != null && (
            <span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
              {formatCurrency(principal.valor_arrematacao)}
            </span>
          )}
        </div>

        {temResultado && (
          <div className="flex items-center justify-between text-xs pt-1" style={{ borderTop: '1px solid var(--border)' }}>
            {principal!.lucro != null && (
              <span style={{ color: principal!.lucro >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                Lucro: {formatCurrency(principal!.lucro)}
              </span>
            )}
            {principal!.rentabilidade != null && (
              <span className="font-semibold" style={{ color: 'var(--accent)' }}>
                {principal!.rentabilidade.toFixed(1)}%
              </span>
            )}
          </div>
        )}

        {p.proxima_acao && (
          <p className="text-xs truncate pt-1" style={{ color: 'var(--text-secondary)', borderTop: temResultado ? 'none' : '1px solid var(--border)' }}>
            Próxima ação: {p.proxima_acao}
          </p>
        )}
      </div>
    </Link>
  )
}

function AtivosTab() {
  const [ativos, setAtivos] = useState<AtivoProjeto[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('projetos')
      .select('id, nome, endereco, foto_url, fase_ciclo, created_at')
      .eq('contexto', 'investimento')
      .order('created_at', { ascending: false })
    setAtivos((data ?? []) as AtivoProjeto[])
    setLoading(false)
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  // A Luiza (Marco 6) pode converter uma Prospecção em Ativo fora desta
  // tela — recarrega sem precisar de F5.
  useEffect(() => {
    function onChanged() { void load() }
    window.addEventListener('buildsmart:investidor-changed', onChanged)
    return () => window.removeEventListener('buildsmart:investidor-changed', onChanged)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  if (ativos.length === 0) {
    return (
      <EmptyState
        icon={Landmark}
        title="Nenhum ativo ainda"
        description="Quando uma Prospecção for adquirida e convertida, ela aparece aqui — reaproveitando Estrutura, Orçamento, Cronograma, Board e Arquivos do Projeto."
      />
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
      {ativos.map((a, i) => <AtivoCard key={a.id} ativo={a} index={i} />)}
    </div>
  )
}

function AtivoCard({ ativo: a, index }: { ativo: AtivoProjeto; index: number }) {
  const meta = FASE_ATIVO_LABEL[a.fase_ciclo]
  return (
    <Link
      href={`/projetos/${a.id}`}
      className="group block overflow-hidden rounded-2xl transition-transform hover:scale-[1.015] animate-enter"
      style={{
        animationDelay: `${index * 60}ms`,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
      }}
    >
      <div className="relative h-44 overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
        {a.foto_url ? (
          <img src={a.foto_url} alt={a.nome} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            <Landmark size={40} style={{ color: 'var(--border)' }} />
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Sem foto</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
        <div className="absolute top-3 right-3">
          <span
            className="text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ background: `${meta.color}22`, color: meta.color, border: `1px solid ${meta.color}55`, backdropFilter: 'blur(8px)' }}
          >
            {meta.label}
          </span>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h3 className="font-semibold text-base leading-tight truncate text-white">{a.nome}</h3>
          {a.endereco && (
            <p className="text-xs truncate mt-1 text-white/70 flex items-center gap-1">
              <MapPin size={11} /> {a.endereco}
            </p>
          )}
        </div>
      </div>
      <div className="px-4 py-3">
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Abrir Projeto do Ativo →</p>
      </div>
    </Link>
  )
}

type Selecao = { prospeccaoId: string; cenarioId: string }

function ComparadorTab() {
  const [prospeccoes, setProspeccoes] = useState<ProspeccaoComCenarios[]>([])
  const [loading, setLoading] = useState(true)
  const [selecoes, setSelecoes] = useState<Selecao[]>([])
  const [parIndex, setParIndex] = useState(0)

  async function load() {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('prospeccoes')
      .select('*, prospeccao_cenarios(*)')
      .order('created_at', { ascending: false })
    const comCenarios = ((data ?? []) as ProspeccaoComCenarios[]).filter(p => p.prospeccao_cenarios?.length > 0)
    setProspeccoes(comCenarios)
    setLoading(false)
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  // A Luiza (Marco 6) pode criar/editar um cenário fora desta tela —
  // recarrega sem precisar de F5.
  useEffect(() => {
    function onChanged() { void load() }
    window.addEventListener('buildsmart:investidor-changed', onChanged)
    return () => window.removeEventListener('buildsmart:investidor-changed', onChanged)
  }, [])

  function toggleSelecao(p: ProspeccaoComCenarios) {
    setSelecoes(prev => {
      if (prev.some(s => s.prospeccaoId === p.id)) return prev.filter(s => s.prospeccaoId !== p.id)
      const cenario = p.prospeccao_cenarios.find(c => c.principal) ?? p.prospeccao_cenarios[0]
      return [...prev, { prospeccaoId: p.id, cenarioId: cenario.id }]
    })
    setParIndex(0)
  }

  function trocarCenario(prospeccaoId: string, cenarioId: string) {
    setSelecoes(prev => prev.map(s => s.prospeccaoId === prospeccaoId ? { ...s, cenarioId } : s))
  }

  const selecionadas = selecoes
    .map(s => {
      const prospeccao = prospeccoes.find(p => p.id === s.prospeccaoId)
      const cenario = prospeccao?.prospeccao_cenarios.find(c => c.id === s.cenarioId)
      return prospeccao && cenario ? { prospeccao, cenario } : null
    })
    .filter((x): x is { prospeccao: ProspeccaoComCenarios; cenario: ProspeccaoCenario } => x != null)

  function melhorValor(ind: typeof INDICADORES[number]) {
    if (!ind.melhor) return null
    const valores = selecionadas.map(s => s.cenario[ind.key]).filter((v): v is number => v != null)
    if (!valores.length) return null
    return ind.melhor === 'maior' ? Math.max(...valores) : Math.min(...valores)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  if (prospeccoes.length === 0) {
    return (
      <EmptyState
        icon={Columns3}
        title="Nada para comparar ainda"
        description="Crie ao menos 2 prospecções com um cenário financeiro (aba Análise) para poder compará-las aqui."
      />
    )
  }

  return (
    <div className="space-y-5">
      <div className="card p-4">
        <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Selecione 2 ou mais prospecções</p>
        <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>Só aparecem aqui prospecções com pelo menos um cenário financeiro.</p>
        <div className="flex flex-col gap-1 max-h-64 overflow-y-auto pr-1">
          {prospeccoes.map(p => {
            const sel = selecoes.find(s => s.prospeccaoId === p.id)
            return (
              <div
                key={p.id}
                className="flex items-center gap-3 p-2 rounded-lg"
                style={{ background: sel ? 'var(--bg-secondary)' : 'transparent' }}
              >
                <input
                  type="checkbox"
                  checked={!!sel}
                  onChange={() => toggleSelecao(p)}
                  style={{ accentColor: 'var(--accent)' }}
                  className="w-4 h-4 flex-shrink-0"
                />
                <span className="flex-1 min-w-0 text-sm truncate" style={{ color: 'var(--text-primary)' }}>{p.nome}</span>
                {sel && p.prospeccao_cenarios.length > 1 && (
                  <select
                    value={sel.cenarioId}
                    onChange={e => trocarCenario(p.id, e.target.value)}
                    className="text-xs rounded-md border px-2 py-1 flex-shrink-0"
                    style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  >
                    {p.prospeccao_cenarios.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {selecionadas.length < 2 ? (
        <EmptyState
          icon={Columns3}
          title="Selecione pelo menos 2"
          description="Marque 2 ou mais prospecções acima para ver a comparação lado a lado."
        />
      ) : (
        <>
          {/* Desktop — todas as selecionadas lado a lado */}
          <div className="hidden md:block card p-4 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="text-left py-2 pr-4 align-bottom" style={{ color: 'var(--text-secondary)' }}>Indicador</th>
                  {selecionadas.map(s => (
                    <th key={s.prospeccao.id} className="text-left py-2 px-3 align-bottom" style={{ minWidth: 170 }}>
                      <p className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{s.prospeccao.nome}</p>
                      <p className="text-xs font-normal truncate" style={{ color: 'var(--text-secondary)' }}>
                        {s.cenario.nome} · {MODALIDADE_LABEL[s.cenario.modalidade]}
                      </p>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {INDICADORES.map(ind => {
                  const melhor = melhorValor(ind)
                  return (
                    <tr key={ind.key} style={{ borderTop: '1px solid var(--border)' }}>
                      <td className="py-2 pr-4" style={{ color: 'var(--text-secondary)' }}>{ind.label}</td>
                      {selecionadas.map(s => {
                        const valor = s.cenario[ind.key]
                        const destaque = melhor != null && valor === melhor
                        return (
                          <td key={s.prospeccao.id} className="py-2 px-3 font-semibold" style={{ color: destaque ? 'var(--success)' : 'var(--text-primary)' }}>
                            {formatarIndicador(valor, ind.formato)}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile — 2 por vez, com paginação se houver mais selecionadas */}
          <div className="md:hidden space-y-3">
            {selecionadas.length > 2 && (
              <div className="flex items-center justify-between text-xs px-1" style={{ color: 'var(--text-secondary)' }}>
                <button
                  onClick={() => setParIndex(i => Math.max(0, i - 2))}
                  disabled={parIndex === 0}
                  className="flex items-center gap-1 disabled:opacity-30"
                >
                  <ChevronLeft size={14} /> Anterior
                </button>
                <span>{parIndex + 1}–{Math.min(parIndex + 2, selecionadas.length)} de {selecionadas.length}</span>
                <button
                  onClick={() => setParIndex(i => Math.min(selecionadas.length - 2, i + 2))}
                  disabled={parIndex + 2 >= selecionadas.length}
                  className="flex items-center gap-1 disabled:opacity-30"
                >
                  Próximo <ChevronRight size={14} />
                </button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {selecionadas.slice(parIndex, parIndex + 2).map(s => (
                <div key={s.prospeccao.id} className="card p-3">
                  <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{s.prospeccao.nome}</p>
                  <p className="text-xs mb-2 truncate" style={{ color: 'var(--text-secondary)' }}>
                    {s.cenario.nome} · {MODALIDADE_LABEL[s.cenario.modalidade]}
                  </p>
                  <div className="flex flex-col gap-2">
                    {INDICADORES.map(ind => {
                      const melhor = melhorValor(ind)
                      const valor = s.cenario[ind.key]
                      const destaque = melhor != null && valor === melhor
                      return (
                        <div key={ind.key}>
                          <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{ind.label}</p>
                          <p className="text-xs font-semibold" style={{ color: destaque ? 'var(--success)' : 'var(--text-primary)' }}>
                            {formatarIndicador(valor, ind.formato)}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function NovaProspeccaoModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [fotoFile, setFotoFile] = useState<File | null>(null)
  const [fotoPreview, setFotoPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function fecharEResetar() {
    setForm(EMPTY_FORM)
    setFotoFile(null)
    setFotoPreview(null)
    onClose()
  }

  async function handleSave() {
    if (!form.nome.trim()) return
    setSaving(true)
    const supabase = createClient()

    let foto_url: string | null = null
    if (fotoFile) {
      try {
        const ext = fotoFile.name.split('.').pop() || 'jpg'
        const path = `prospeccoes/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
        const { error: upErr } = await supabase.storage.from('project-files').upload(path, fotoFile)
        foto_url = upErr ? null : supabase.storage.from('project-files').getPublicUrl(path).data.publicUrl
      } catch {
        foto_url = null
      }
    }

    const { error } = await supabase.from('prospeccoes').insert({
      nome: form.nome.trim(),
      endereco: form.endereco.trim() || null,
      link_leilao: form.link_leilao.trim() || null,
      data_leilao: form.data_leilao || null,
      foto_url,
    })
    setSaving(false)
    if (!error) {
      onCreated()
      fecharEResetar()
    } else {
      alert(`Não foi possível criar a prospecção: ${error.message}`)
    }
  }

  return (
    <Modal open={open} onClose={() => !saving && fecharEResetar()} title="Nova prospecção" size="sm">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          {fotoPreview ? (
            <div className="relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 border" style={{ borderColor: 'var(--border)' }}>
              <img src={fotoPreview} alt="Preview" className="w-full h-full object-cover" />
              <button
                onClick={() => { setFotoFile(null); setFotoPreview(null) }}
                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full flex items-center justify-center text-xs text-white"
                style={{ background: 'rgba(0,0,0,0.6)' }}
              >✕</button>
            </div>
          ) : (
            <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
              <ImagePlus size={16} />
              <span className="text-sm">Foto (opcional)</span>
              <input
                type="file" accept="image/*" className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) { setFotoFile(file); setFotoPreview(URL.createObjectURL(file)) }
                }}
              />
            </label>
          )}
        </div>

        <Input
          label="Nome / apelido *"
          placeholder="Ex: Apto Vila Nova - lote 12"
          value={form.nome}
          onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
          autoFocus
        />
        <Input
          label="Endereço"
          placeholder="Rua, bairro, cidade..."
          value={form.endereco}
          onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))}
        />
        <Input
          label="Link do leilão/anúncio"
          type="url"
          placeholder="https://..."
          value={form.link_leilao}
          onChange={e => setForm(f => ({ ...f, link_leilao: e.target.value }))}
        />
        <Input
          label="Data do leilão"
          type="date"
          value={form.data_leilao}
          onChange={e => setForm(f => ({ ...f, data_leilao: e.target.value }))}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={fecharEResetar} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving} disabled={!form.nome.trim()}>
            Criar prospecção
          </Button>
        </div>
      </div>
    </Modal>
  )
}
