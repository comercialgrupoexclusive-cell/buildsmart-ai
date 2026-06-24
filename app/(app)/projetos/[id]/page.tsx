'use client'

import { useState, useEffect, use } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, Save, Pencil, LayoutList, Info, CalendarDays, LayoutDashboard, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { usePermission } from '@/lib/permissions'
import { ProjetoCascata, buildProjetoTree, type ProjetoItemNode } from '@/components/projeto/ProjetoCascata'
import { ProjetoCronograma } from '@/components/projeto/ProjetoCronograma'
import { ProjetoAssistenteIA } from '@/components/projeto/ProjetoAssistenteIA'
import dynamic from 'next/dynamic'

const ExcalidrawBoard = dynamic(
  () => import('@/components/board/ExcalidrawBoard').then(m => ({ default: m.ExcalidrawBoard })),
  { ssr: false, loading: () => (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>
      Carregando board…
    </div>
  )},
)

type Projeto = {
  id: string
  nome: string
  cliente: string | null
  endereco: string | null
  data_inicio: string | null
  data_previsao: string | null
  status: 'em_andamento' | 'concluido' | 'suspenso'
  obra_id: string | null
  responsavel: string | null
  created_at: string
}

const STATUS_OPTIONS = [
  { value: 'em_andamento', label: 'Em andamento' },
  { value: 'concluido',    label: 'Concluído' },
  { value: 'suspenso',     label: 'Suspenso' },
]

export default function ProjetoDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { isCliente, canDelete } = usePermission()
  const searchParams = useSearchParams()
  const [projeto, setProjeto] = useState<Projeto | null>(null)
  const [itens, setItens] = useState<ProjetoItemNode[]>([])
  const [tree, setTree] = useState<ProjetoItemNode[]>([])
  const [tab, setTab] = useState<'estrutura' | 'dados' | 'cronograma' | 'board' | 'ia'>(
    (searchParams.get('tab') as 'estrutura' | 'dados' | 'cronograma' | 'board' | 'ia') ?? 'estrutura'
  )
  const [profiles, setProfiles] = useState<{ id: string; name: string; apelido: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [editingDados, setEditingDados] = useState(false)
  const [dadosForm, setDadosForm] = useState<Partial<Projeto>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadData() }, [id])

  async function loadData() {
    setLoading(true)
    const supabase = createClient()
    const [{ data: p }, { data: its }, { data: profs }] = await Promise.all([
      supabase.from('projetos').select('*').eq('id', id).single(),
      supabase.from('projeto_itens').select('*').eq('projeto_id', id).order('ordem'),
      supabase.from('profiles').select('id, name, apelido').order('name'),
    ])
    setProfiles((profs ?? []) as { id: string; name: string; apelido: string | null }[])
    if (p) {
      setProjeto(p)
      setDadosForm(p)
    }
    const flat = (its ?? []) as ProjetoItemNode[]
    setItens(flat)
    setTree(buildProjetoTree(flat))
    setLoading(false)
  }

  // ── Cascata handlers ──

  async function handleToggle(itemId: string, concluido: boolean) {
    const supabase = createClient()
    const descendants = collectDescendants(itens, itemId)
    const allIds = [itemId, ...descendants]
    await supabase.from('projeto_itens').update({ concluido }).in('id', allIds)
    const updated = itens.map(i => allIds.includes(i.id) ? { ...i, concluido } : i)
    setItens(updated)
    setTree(buildProjetoTree(updated))
  }

  async function handleAdd(parentId: string | null, nivel: number, nome: string) {
    const supabase = createClient()
    const ordem = itens.filter(i => i.parent_id === parentId).length
    const { data } = await supabase.from('projeto_itens').insert({
      projeto_id: id,
      parent_id: parentId,
      nome,
      nivel,
      ordem,
    }).select().single()
    if (data) {
      const updated = [...itens, data as ProjetoItemNode]
      setItens(updated)
      setTree(buildProjetoTree(updated))
    }
  }

  async function handleDelete(itemId: string) {
    if (!confirm('Excluir item e todos os subitens?')) return
    const supabase = createClient()
    // Coletar todos IDs filhos recursivamente
    const toDelete = collectDescendants(itens, itemId)
    toDelete.push(itemId)
    await supabase.from('projeto_itens').delete().in('id', toDelete)
    const updated = itens.filter(i => !toDelete.includes(i.id))
    setItens(updated)
    setTree(buildProjetoTree(updated))
  }

  async function handleUpdateItem(itemId: string, fields: Partial<Pick<ProjetoItemNode, 'responsavel' | 'data_inicio' | 'data_prazo'>>) {
    // Atualização otimista imediata (UI responsiva)
    const updated = itens.map(i => i.id === itemId ? { ...i, ...fields } : i)
    setItens(updated)
    setTree(buildProjetoTree(updated))
    // Persiste e revela erro real (ex.: coluna inexistente)
    const supabase = createClient()
    const { error } = await supabase.from('projeto_itens').update(fields).eq('id', itemId)
    if (error) {
      alert('Erro ao salvar: ' + error.message + '\n\nVerifique se as colunas data_inicio / data_prazo / responsavel existem na tabela projeto_itens.')
    }
  }

  async function handleRename(itemId: string, nome: string) {
    const supabase = createClient()
    await supabase.from('projeto_itens').update({ nome }).eq('id', itemId)
    const updated = itens.map(i => i.id === itemId ? { ...i, nome } : i)
    setItens(updated)
    setTree(buildProjetoTree(updated))
  }

  // ── Dados gerais ──

  async function saveDados() {
    if (!projeto) return
    setSaving(true)
    const supabase = createClient()
    const payload = {
      nome: dadosForm.nome ?? projeto.nome,
      cliente: dadosForm.cliente ?? null,
      endereco: dadosForm.endereco ?? null,
      data_inicio: dadosForm.data_inicio ?? null,
      data_previsao: dadosForm.data_previsao ?? null,
      status: dadosForm.status ?? projeto.status,
      responsavel: dadosForm.responsavel ?? null,
      updated_at: new Date().toISOString(),
    }
    const { data } = await supabase.from('projetos').update(payload).eq('id', id).select().single()
    if (data) { setProjeto(data); setEditingDados(false) }
    setSaving(false)
  }

  // Calcula progresso
  const totalItens = itens.length
  const concluidosCount = itens.filter(i => i.concluido).length
  const progresso = totalItens > 0 ? Math.round((concluidosCount / totalItens) * 100) : 0

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  if (!projeto) {
    return (
      <div className="text-center py-32" style={{ color: 'var(--text-secondary)' }}>
        Projeto não encontrado.
        <a href="/projetos" className="block mt-3 text-sm" style={{ color: 'var(--accent)' }}>← Voltar</a>
      </div>
    )
  }

  return (
    <div className="space-y-4 min-w-0">
      {/* Header */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <a href="/projetos" className="p-2 rounded-lg hover:bg-[var(--bg-card)]" style={{ color: 'var(--text-secondary)' }}>
          <ArrowLeft size={18} />
        </a>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate" style={{ color: 'var(--text-primary)' }}>{projeto.nome}</h1>
          {projeto.cliente && <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{projeto.cliente}</p>}
        </div>
        {/* Barra de progresso */}
        {totalItens > 0 && (
          <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
            <div className="w-24 h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${progresso}%`, background: 'var(--accent)' }} />
            </div>
            <span className="text-xs font-medium" style={{ color: 'var(--accent)' }}>{progresso}%</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="max-w-full overflow-x-auto pb-1">
        <div className="flex items-center gap-1 p-1 rounded-lg w-max" style={{ background: 'var(--bg-secondary)' }}>
        {([
          { key: 'estrutura',  label: 'Estrutura',    icon: LayoutList },
          { key: 'cronograma', label: 'Cronograma',   icon: CalendarDays },
          { key: 'board',      label: 'Board',        icon: LayoutDashboard },
          { key: 'dados',      label: 'Dados Gerais', icon: Info },
          { key: 'ia',         label: 'Assistente IA', icon: Sparkles },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap flex-shrink-0"
            style={tab === key
              ? { background: 'var(--accent)', color: 'white' }
              : { color: 'var(--text-secondary)' }}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
        </div>
      </div>

      {/* Conteúdo */}
      {tab === 'estrutura' && (
        <div className="rounded-xl border p-3 sm:p-4 min-w-0 overflow-hidden" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          {itens.length === 0 ? (
            <p className="text-sm mb-4 opacity-60" style={{ color: 'var(--text-secondary)' }}>
              Estrutura vazia — adicione uma disciplina para começar.
            </p>
          ) : (
            <p className="hidden sm:block text-xs mb-3 opacity-50" style={{ color: 'var(--text-secondary)' }}>
              Passe o mouse sobre um item para ver as ações · clique no ✏ para renomear · checkbox marca concluído e todos os filhos
            </p>
          )}
          <ProjetoCascata
            itens={tree}
            projetoId={projeto.id}
            canEdit={!isCliente}
            profiles={profiles}
            onToggle={handleToggle}
            onAdd={handleAdd}
            onDelete={handleDelete}
            onRename={handleRename}
            onUpdateItem={(id, fields) => handleUpdateItem(id, fields)}
          />
        </div>
      )}

      {tab === 'cronograma' && (
        <ProjetoCronograma projetoId={projeto.id} profiles={profiles} />
      )}

      {tab === 'board' && (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)', height: 'calc(100vh - 200px)', minHeight: 520 }}>
          <ExcalidrawBoard projectId={projeto.id} />
        </div>
      )}

      {tab === 'ia' && (
        <ProjetoAssistenteIA projeto={projeto} itens={itens} onReload={loadData} />
      )}

      {tab === 'dados' && (
        <div className="rounded-xl border p-6 space-y-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Informações do Projeto</h2>
            {!isCliente && !editingDados && (
              <button
                onClick={() => setEditingDados(true)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border"
                style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
              >
                <Pencil size={13} /> Editar
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DadosField label="Nome" editing={editingDados} value={dadosForm.nome ?? ''} onChange={v => setDadosForm(f => ({ ...f, nome: v }))} />
            <DadosField label="Cliente" editing={editingDados} value={dadosForm.cliente ?? ''} onChange={v => setDadosForm(f => ({ ...f, cliente: v }))} />
            <DadosField label="Endereço" editing={editingDados} value={dadosForm.endereco ?? ''} onChange={v => setDadosForm(f => ({ ...f, endereco: v }))} className="sm:col-span-2" />
            <DadosField label="Início" editing={editingDados} type="date" value={dadosForm.data_inicio ?? ''} onChange={v => setDadosForm(f => ({ ...f, data_inicio: v }))} />
            <DadosField label="Previsão" editing={editingDados} type="date" value={dadosForm.data_previsao ?? ''} onChange={v => setDadosForm(f => ({ ...f, data_previsao: v }))} />
            <DadosField label="Responsável" editing={editingDados} value={dadosForm.responsavel ?? ''} onChange={v => setDadosForm(f => ({ ...f, responsavel: v }))} />

            {editingDados ? (
              <div className="space-y-1">
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Status</label>
                <select
                  className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                  style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  value={dadosForm.status ?? 'em_andamento'}
                  onChange={e => setDadosForm(f => ({ ...f, status: e.target.value as Projeto['status'] }))}
                >
                  {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Status</label>
                <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                  {STATUS_OPTIONS.find(o => o.value === projeto.status)?.label ?? '—'}
                </p>
              </div>
            )}
          </div>

          {editingDados && (
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => { setEditingDados(false); setDadosForm(projeto) }}
                className="px-4 py-2 text-sm border rounded-lg"
                style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
              >
                Cancelar
              </button>
              <button
                onClick={saveDados}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
                style={{ background: 'var(--accent)' }}
              >
                <Save size={14} />
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DadosField({ label, value, editing, onChange, type = 'text', className = '' }: {
  label: string
  value: string
  editing: boolean
  onChange: (v: string) => void
  type?: string
  className?: string
}) {
  return (
    <div className={`space-y-1 ${className}`}>
      <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</label>
      {editing ? (
        <input
          type={type}
          className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      ) : (
        <p className="text-sm" style={{ color: value ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
          {value || '—'}
        </p>
      )}
    </div>
  )
}

function collectDescendants(itens: ProjetoItemNode[], parentId: string): string[] {
  const children = itens.filter(i => i.parent_id === parentId).map(i => i.id)
  return children.flatMap(cid => [cid, ...collectDescendants(itens, cid)])
}
