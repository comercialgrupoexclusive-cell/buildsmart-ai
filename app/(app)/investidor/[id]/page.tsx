'use client'

// Laboratório Investidor — tela interna da Prospecção. Resumo é funcional
// (exibe + edita); Análise é o CRUD completo de Cenários financeiros do
// Marco 3 (components/investidor/ProspeccaoCenarios.tsx, ver
// RELATORIO_INVESTIDOR_RODADA_03.md); Arquivos reaproveita o mesmo padrão
// de ObraArquivos (tabela própria, ver RELATORIO_INVESTIDOR_RODADA_02.md);
// Board reaproveita ExcalidrawBoard (mesmo componente do Board de Project,
// com prop prospeccaoId).
import { useEffect, useState, use } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { ArrowLeft, Info, LineChart, FileText as FileTextIcon, LayoutDashboard, Save, Pencil, ImagePlus, Building2, ArrowUpRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { usePermission } from '@/lib/permissions'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ProspeccaoArquivos } from '@/components/investidor/ProspeccaoArquivos'
import { ProspeccaoCenarios } from '@/components/investidor/ProspeccaoCenarios'
import { formatCurrency } from '@/lib/utils'
import type { Prospeccao, ProspeccaoFase, ProspeccaoCenario } from '@/lib/types'

const ExcalidrawBoard = dynamic(
  () => import('@/components/board/ExcalidrawBoard').then(m => ({ default: m.ExcalidrawBoard })),
  { ssr: false, loading: () => (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>
      Carregando board…
    </div>
  )},
)

const FASE_OPTIONS: { value: ProspeccaoFase; label: string }[] = [
  { value: 'nova', label: 'Nova' },
  { value: 'em_analise', label: 'Em análise' },
  { value: 'aprovada', label: 'Aprovada' },
  { value: 'em_disputa', label: 'Em disputa' },
  { value: 'adquirida', label: 'Adquirida' },
  { value: 'descartada', label: 'Descartada' },
  { value: 'nao_adquirida', label: 'Não adquirida' },
]

type Tab = 'resumo' | 'analise' | 'arquivos' | 'board'

export default function ProspeccaoDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const tab = (searchParams.get('tab') as Tab) ?? 'resumo'

  const [prospeccao, setProspeccao] = useState<Prospeccao | null>(null)
  const [cenarios, setCenarios] = useState<ProspeccaoCenario[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { void loadData() }, [id])

  // A Luiza (Marco 6) pode alterar esta prospecção ou seus cenários fora
  // desta tela — recarrega sem precisar de F5.
  useEffect(() => {
    function onChanged() { void loadData() }
    window.addEventListener('buildsmart:investidor-changed', onChanged)
    return () => window.removeEventListener('buildsmart:investidor-changed', onChanged)
  }, [])

  async function loadData() {
    setLoading(true)
    const supabase = createClient()
    const [{ data: p }, { data: c }] = await Promise.all([
      supabase.from('prospeccoes').select('*').eq('id', id).single(),
      supabase.from('prospeccao_cenarios').select('*').eq('prospeccao_id', id).order('created_at'),
    ])
    setProspeccao(p as Prospeccao | null)
    setCenarios((c ?? []) as ProspeccaoCenario[])
    setLoading(false)
  }

  function setTab(next: Tab) {
    router.push(`/investidor/${id}?tab=${next}`)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  if (!prospeccao) {
    return (
      <EmptyState icon={Info} title="Prospecção não encontrada" description="Ela pode ter sido excluída." action={
        <Link href="/investidor" className="text-sm font-medium" style={{ color: 'var(--accent)' }}>Voltar para Investidor</Link>
      } />
    )
  }

  const principal = cenarios.find(c => c.principal)

  return (
    <div className="space-y-5">
      <Link href="/investidor" className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
        <ArrowLeft size={15} /> Investidor
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0" style={{ background: 'var(--bg-secondary)' }}>
          {prospeccao.foto_url ? (
            <img src={prospeccao.foto_url} alt={prospeccao.nome} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImagePlus size={20} style={{ color: 'var(--border)' }} />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold truncate" style={{ color: 'var(--text-primary)' }}>{prospeccao.nome}</h1>
          <p className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>{prospeccao.endereco || 'Sem endereço'}</p>
        </div>
      </div>

      <div className="flex gap-1 p-1 rounded-lg w-fit overflow-x-auto" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        {[
          { id: 'resumo' as const, label: 'Resumo', icon: LayoutDashboard },
          { id: 'analise' as const, label: 'Análise', icon: LineChart },
          { id: 'arquivos' as const, label: 'Arquivos', icon: FileTextIcon },
          { id: 'board' as const, label: 'Board', icon: Pencil },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap"
            style={tab === t.id ? { background: 'var(--accent)', color: 'white' } : { color: 'var(--text-secondary)' }}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'resumo' && (
        <ResumoTab prospeccao={prospeccao} principal={principal} onSaved={loadData} />
      )}

      {tab === 'analise' && (
        <ProspeccaoCenarios prospeccaoId={id} cenarios={cenarios} onChanged={loadData} />
      )}

      {tab === 'arquivos' && <ProspeccaoArquivos prospeccaoId={id} />}

      {tab === 'board' && (
        <div className="card overflow-hidden" style={{ height: '70vh' }}>
          <ExcalidrawBoard prospeccaoId={id} />
        </div>
      )}
    </div>
  )
}

function ResumoTab({ prospeccao, principal, onSaved }: { prospeccao: Prospeccao; principal?: ProspeccaoCenario; onSaved: () => void }) {
  const router = useRouter()
  const { isCliente } = usePermission()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(prospeccao)
  const [saving, setSaving] = useState(false)
  const [convertendo, setConvertendo] = useState(false)

  // Marco 4 — conversão Prospecção adquirida → Imóvel (Project com
  // contexto=investimento). Reaproveita a mesma tabela `projetos` e todas
  // as suas telas (Estrutura/Orçamento/Cronograma/Board/Arquivos/Tarefas) —
  // nenhuma tela nova de "obra do investidor" é criada. A Prospecção nunca
  // é apagada; o vínculo fica em prospeccoes.project_id (histórico
  // previsto × realizado para marcos futuros).
  async function handleConverterEmAtivo() {
    if (!confirm(
      `Criar imóvel para "${prospeccao.nome}"?\n\nIsso cria um Project de investimento reaproveitando Estrutura, Orçamento, Cronograma, Board e Arquivos. A prospecção continua existindo e fica vinculada ao imóvel.`
    )) return
    setConvertendo(true)
    const supabase = createClient()
    const { data: atual, error: atualError } = await supabase.from('prospeccoes').select('project_id').eq('id', prospeccao.id).single()
    if (atualError) {
      setConvertendo(false)
      alert(`Não foi possível conferir a prospecção: ${atualError.message}`)
      return
    }
    if (atual?.project_id) {
      setConvertendo(false)
      router.push(`/projetos/${atual.project_id}`)
      return
    }
    const { data: novoProjeto, error } = await supabase.from('projetos').insert({
      nome: prospeccao.nome,
      endereco: prospeccao.endereco,
      foto_url: prospeccao.foto_url,
      contexto: 'investimento',
      status: 'aguardando',
      fase_ciclo: 'projeto',
    }).select('id').single()
    if (error || !novoProjeto) {
      setConvertendo(false)
      alert(`Não foi possível criar o imóvel: ${error?.message}`)
      return
    }
    const { error: linkError } = await supabase.from('prospeccoes').update({ project_id: novoProjeto.id }).eq('id', prospeccao.id).is('project_id', null)
    setConvertendo(false)
    if (linkError) {
      alert(`O imóvel foi criado, mas não foi possível vincular à prospecção automaticamente: ${linkError.message}`)
    }
    onSaved()
    router.push(`/projetos/${novoProjeto.id}`)
  }

  async function handleSave() {
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('prospeccoes').update({
      nome: form.nome.trim(),
      endereco: form.endereco || null,
      link_leilao: form.link_leilao || null,
      data_leilao: form.data_leilao || null,
      fase: form.fase,
      responsavel: form.responsavel || null,
      proxima_acao: form.proxima_acao || null,
      observacao: form.observacao || null,
    }).eq('id', prospeccao.id)
    setSaving(false)
    if (!error) {
      setEditing(false)
      onSaved()
    } else {
      alert(`Não foi possível salvar: ${error.message}`)
    }
  }

  const temResultado = principal && (principal.lucro != null || principal.rentabilidade != null)

  if (!editing) {
    return (
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Resumo</h2>
          <div className="flex items-center gap-2">
            {!isCliente && prospeccao.fase === 'adquirida' && (
              prospeccao.project_id ? (
                <Link
                  href={`/projetos/${prospeccao.project_id}`}
                  className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg"
                  style={{ color: 'var(--accent)' }}
                >
                  Imóvel criado — Abrir imóvel <ArrowUpRight size={14} />
                </Link>
              ) : (
                <Button size="sm" icon={<Building2 size={13} />} onClick={handleConverterEmAtivo} loading={convertendo}>
                  Criar imóvel
                </Button>
              )
            )}
            <Button variant="secondary" size="sm" icon={<Pencil size={13} />} onClick={() => { setForm(prospeccao); setEditing(true) }}>Editar</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <Campo label="Fase" valor={FASE_OPTIONS.find(f => f.value === prospeccao.fase)?.label} />
          <Campo label="Data do leilão" valor={prospeccao.data_leilao ? new Date(prospeccao.data_leilao + 'T12:00:00').toLocaleDateString('pt-BR') : null} />
          <Campo label="Avaliação (venda estimada, cenário principal)" valor={principal?.valor_venda_estimado != null ? formatCurrency(principal.valor_venda_estimado) : null} />
          <Campo label="Lance/arrematação (cenário principal)" valor={principal?.valor_arrematacao != null ? formatCurrency(principal.valor_arrematacao) : null} />
          {temResultado && (
            <>
              <Campo label="Lucro estimado (cenário principal)" valor={principal!.lucro != null ? formatCurrency(principal!.lucro) : null} />
              <Campo label="Rentabilidade (cenário principal)" valor={principal!.rentabilidade != null ? `${principal!.rentabilidade.toFixed(1)}%` : null} />
            </>
          )}
          <Campo label="Responsável" valor={prospeccao.responsavel} />
          <Campo label="Próxima ação" valor={prospeccao.proxima_acao} />
          {prospeccao.link_leilao && (
            <div className="sm:col-span-2">
              <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Link do leilão/anúncio</p>
              <a href={prospeccao.link_leilao} target="_blank" rel="noreferrer" className="text-sm break-all hover:underline" style={{ color: 'var(--accent)' }}>
                {prospeccao.link_leilao}
              </a>
            </div>
          )}
          <div className="sm:col-span-2">
            <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Observação</p>
            <p className="text-sm whitespace-pre-wrap" style={{ color: prospeccao.observacao ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
              {prospeccao.observacao || '—'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Editar prospecção</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label="Nome / apelido" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
        <Select label="Fase" value={form.fase} onChange={e => setForm(f => ({ ...f, fase: e.target.value as ProspeccaoFase }))}>
          {FASE_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </Select>
        <Input label="Endereço" value={form.endereco ?? ''} onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))} />
        <Input label="Link do leilão/anúncio" type="url" value={form.link_leilao ?? ''} onChange={e => setForm(f => ({ ...f, link_leilao: e.target.value }))} />
        <Input label="Data do leilão" type="date" value={form.data_leilao ?? ''} onChange={e => setForm(f => ({ ...f, data_leilao: e.target.value }))} />
        <Input label="Responsável" value={form.responsavel ?? ''} onChange={e => setForm(f => ({ ...f, responsavel: e.target.value }))} />
        <Input label="Próxima ação" value={form.proxima_acao ?? ''} onChange={e => setForm(f => ({ ...f, proxima_acao: e.target.value }))} />
      </div>
      <Textarea label="Observação" rows={3} value={form.observacao ?? ''} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} />
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={() => { setForm(prospeccao); setEditing(false) }} disabled={saving}>Cancelar</Button>
        <Button onClick={handleSave} loading={saving} icon={<Save size={14} />} disabled={!form.nome.trim()}>Salvar</Button>
      </div>
    </div>
  )
}

function Campo({ label, valor }: { label: string; valor?: string | null }) {
  return (
    <div>
      <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>{label}</p>
      <p className="text-sm font-medium" style={{ color: valor ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{valor || '—'}</p>
    </div>
  )
}
