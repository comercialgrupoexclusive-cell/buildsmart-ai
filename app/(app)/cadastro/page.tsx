'use client'

import { useEffect, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { CadastroCard } from '@/components/cadastro/CadastroCard'
import { NovoCadastroModal } from '@/components/cadastro/NovoCadastroModal'
import type { CadastroTipoNovo } from '@/components/cadastro/NovoCadastroModal'

const STATUS_PROJETO = {
  em_andamento: { label: 'Em andamento', color: '#3B7BF8' },
  concluido:    { label: 'Concluído',    color: '#10B981' },
  suspenso:     { label: 'Suspenso',     color: '#6B7280' },
}
const STATUS_OBRA = {
  orcamento:  { label: 'Orçamento',  color: '#3B7BF8' },
  ativa:      { label: 'Ativa',      color: '#10B981' },
  concluida:  { label: 'Concluída',  color: '#6B7280' },
  paralisada: { label: 'Paralisada', color: '#EF4444' },
}
const STATUS_ORC = {
  rascunho:   { label: 'Rascunho',   color: '#F59E0B' },
  ativo:      { label: 'Ativo',      color: '#10B981' },
  finalizado: { label: 'Finalizado', color: '#6B7280' },
}

type TabKey = 'projetos' | 'obras' | 'orcamentos'

interface ProjetoRow {
  id: string; nome: string; status: string; cliente: string | null
  data_inicio: string | null; data_previsao: string | null; foto_url: string | null
  projeto_usuarios: { profiles: { name: string; apelido: string | null } | null }[]
}
interface ObraRow {
  id: string; nome: string; status: string; endereco: string
  data_inicio: string | null; data_previsao: string | null; foto_url: string | null
  obra_usuarios: { profiles: { name: string; apelido: string | null } | null }[]
  avanco: number
}
interface OrcRow {
  id: string; obra_id: string; status: string; versao: number
  bdi_percentual: number; created_at: string
  obras: { nome: string; foto_url: string | null } | null
}

export default function CadastroPage() {
  const supabase = createClient()
  const [tab, setTab]           = useState<TabKey>('projetos')
  const [busca, setBusca]       = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [projetos, setProjetos] = useState<ProjetoRow[]>([])
  const [obras, setObras]       = useState<ObraRow[]>([])
  const [orcamentos, setOrcamentos] = useState<OrcRow[]>([])
  const [projetoStats, setProjetoStats] = useState<Record<string, number>>({})
  const [templates, setTemplates] = useState<{ id: string; nome: string }[]>([])
  const [profiles, setProfiles] = useState<{ id: string; name: string; apelido: string | null }[]>([])
  const [loading, setLoading]   = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [modalTipo, setModalTipo] = useState<CadastroTipoNovo>('projeto')

  useEffect(() => { loadAll() }, [])
  useEffect(() => { setBusca(''); setFiltroStatus('todos') }, [tab])

  async function loadAll() {
    setLoading(true)

    // Todas as queries em paralelo — sem N+1
    const [
      { data: projs },
      { data: obs },
      { data: orcs },
      { data: items },
      { data: meds },
      { data: tmpls },
      { data: profs },
    ] = await Promise.all([
      supabase.from('projetos').select('*, projeto_usuarios(profiles(name, apelido))').order('created_at', { ascending: false }),
      supabase.from('obras').select('*, obra_usuarios(profiles(name, apelido))').order('created_at', { ascending: false }),
      supabase.from('orcamentos').select('*, obras(nome, foto_url)').order('created_at', { ascending: false }),
      supabase.from('projeto_itens').select('projeto_id, concluido'),
      // Uma única query para medições — aggregação em JS
      supabase.from('medicoes').select('obra_id, percentual_executado, periodo_inicio, created_at').order('periodo_inicio', { ascending: false }),
      supabase.from('projeto_templates').select('id, nome').order('nome'),
      supabase.from('profiles').select('id, name, apelido').order('name'),
    ])

    // Última medição por obra (já ordenado desc, primeiro hit = mais recente)
    const latestMed: Record<string, number> = {}
    ;(meds ?? []).forEach((m: { obra_id: string; percentual_executado: number }) => {
      if (!(m.obra_id in latestMed)) latestMed[m.obra_id] = m.percentual_executado
    })
    const obraComAvanco = ((obs ?? []) as ObraRow[]).map(o => ({ ...o, avanco: latestMed[o.id] ?? 0 }))

    // Progresso de projetos
    const byProj: Record<string, { total: number; done: number }> = {}
    ;(items ?? []).forEach((i: { projeto_id: string; concluido: boolean }) => {
      if (!byProj[i.projeto_id]) byProj[i.projeto_id] = { total: 0, done: 0 }
      byProj[i.projeto_id].total++
      if (i.concluido) byProj[i.projeto_id].done++
    })
    const stats: Record<string, number> = {}
    Object.entries(byProj).forEach(([pid, { total, done }]) => {
      stats[pid] = total > 0 ? Math.round((done / total) * 100) : 0
    })

    setProjetos((projs ?? []) as ProjetoRow[])
    setObras(obraComAvanco)
    setOrcamentos((orcs ?? []) as OrcRow[])
    setProjetoStats(stats)
    setTemplates((tmpls ?? []) as { id: string; nome: string }[])
    setProfiles((profs ?? []) as { id: string; name: string; apelido: string | null }[])
    setLoading(false)
  }

  async function handleDeleteProjeto(id: string) {
    if (!confirm('Excluir projeto e todos os itens?')) return
    await supabase.from('projetos').delete().eq('id', id)
    setProjetos(prev => prev.filter(p => p.id !== id))
  }
  async function handleDeleteObra(id: string) {
    if (!confirm('Excluir obra e orçamentos vinculados?')) return
    await supabase.from('obras').delete().eq('id', id)
    setObras(prev => prev.filter(o => o.id !== id))
  }
  async function handleDeleteOrc(id: string) {
    if (!confirm('Excluir orçamento?')) return
    await supabase.from('orcamentos').delete().eq('id', id)
    setOrcamentos(prev => prev.filter(o => o.id !== id))
  }

  const filtroStatusOptions: Record<TabKey, string[]> = {
    projetos:   ['todos', 'em_andamento', 'concluido', 'suspenso'],
    obras:      ['todos', 'orcamento', 'ativa', 'concluida', 'paralisada'],
    orcamentos: ['todos', 'rascunho', 'ativo', 'finalizado'],
  }
  const filtroStatusLabel: Record<TabKey, Record<string, string>> = {
    projetos:   { todos: 'Todos', ...Object.fromEntries(Object.entries(STATUS_PROJETO).map(([k, v]) => [k, v.label])) },
    obras:      { todos: 'Todas', ...Object.fromEntries(Object.entries(STATUS_OBRA).map(([k, v]) => [k, v.label])) },
    orcamentos: { todos: 'Todos', ...Object.fromEntries(Object.entries(STATUS_ORC).map(([k, v]) => [k, v.label])) },
  }

  const projetosFiltrados = projetos.filter(p => {
    const matchStatus = filtroStatus === 'todos' || p.status === filtroStatus
    const matchBusca = !busca || p.nome.toLowerCase().includes(busca.toLowerCase()) || (p.cliente ?? '').toLowerCase().includes(busca.toLowerCase())
    return matchStatus && matchBusca
  })
  const obrasFiltradas = obras.filter(o => {
    const matchStatus = filtroStatus === 'todos' || o.status === filtroStatus
    return matchStatus && (!busca || o.nome.toLowerCase().includes(busca.toLowerCase()))
  })
  const orcFiltrados = orcamentos.filter(o => {
    const matchStatus = filtroStatus === 'todos' || o.status === filtroStatus
    return matchStatus && (!busca || (o.obras?.nome ?? '').toLowerCase().includes(busca.toLowerCase()))
  })

  const totalTab = tab === 'projetos' ? projetosFiltrados.length : tab === 'obras' ? obrasFiltradas.length : orcFiltrados.length

  // Obras disponíveis para o modal de orçamento
  const obrasParaModal = obras.map(o => ({ id: o.id, nome: o.nome }))

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Cadastro</h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Projetos, Obras e Orçamentos</p>
        </div>
        <Button
          icon={<Plus size={16} />}
          onClick={() => {
            setModalTipo(tab === 'obras' ? 'obra' : tab === 'orcamentos' ? 'orcamento' : 'projeto')
            setShowModal(true)
          }}
        >
          Novo +
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-lg w-fit" style={{ background: 'var(--bg-secondary)' }}>
        {(['projetos', 'obras', 'orcamentos'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-1.5 rounded-md text-sm font-medium transition-all"
            style={tab === t
              ? { background: 'var(--accent)', color: 'white' }
              : { color: 'var(--text-secondary)' }}
          >
            {t === 'orcamentos' ? 'Orçamentos' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap">
        {/* Fix 1.1 — padding-left via style para garantir espaço da lupa */}
        <div className="relative flex-1 min-w-[180px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-secondary)' }} />
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder={`Buscar ${tab}...`}
            className="input-base w-full"
            style={{ paddingLeft: '2.25rem' }}
          />
        </div>
        <select
          value={filtroStatus}
          onChange={e => setFiltroStatus(e.target.value)}
          className="input-base w-auto"
        >
          {filtroStatusOptions[tab].map(s => (
            <option key={s} value={s}>{filtroStatusLabel[tab][s]}</option>
          ))}
        </select>
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : totalTab === 0 ? (
        <div className="text-center py-20" style={{ color: 'var(--text-secondary)' }}>
          <p className="text-4xl mb-3">📋</p>
          <p className="font-medium">Nenhum resultado</p>
          <p className="text-sm mt-1">Tente outro filtro ou crie um novo cadastro</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {tab === 'projetos' && projetosFiltrados.map(p => {
            const st = STATUS_PROJETO[p.status as keyof typeof STATUS_PROJETO] ?? { label: p.status, color: '#6B7280' }
            const resps = (p.projeto_usuarios ?? []).map(u => u.profiles?.apelido ?? u.profiles?.name ?? '').filter(Boolean)
            return (
              <CadastroCard key={p.id} tipo="projeto" id={p.id} nome={p.nome} foto_url={p.foto_url}
                status={p.status} statusLabel={st.label} statusColor={st.color} cliente={p.cliente}
                data_inicio={p.data_inicio} data_previsao={p.data_previsao} responsaveis={resps}
                progress={projetoStats[p.id]} href={`/projetos/${p.id}`}
                onEdit={() => { window.location.href = `/projetos/${p.id}` }}
                onDelete={() => handleDeleteProjeto(p.id)}
              />
            )
          })}

          {tab === 'obras' && obrasFiltradas.map(o => {
            const st = STATUS_OBRA[o.status as keyof typeof STATUS_OBRA] ?? { label: o.status, color: '#6B7280' }
            const resps = (o.obra_usuarios ?? []).map(u => u.profiles?.apelido ?? u.profiles?.name ?? '').filter(Boolean)
            return (
              <CadastroCard key={o.id} tipo="obra" id={o.id} nome={o.nome} foto_url={o.foto_url}
                status={o.status} statusLabel={st.label} statusColor={st.color}
                data_inicio={o.data_inicio} data_previsao={o.data_previsao} responsaveis={resps}
                progress={o.avanco} href={`/obras/${o.id}`}
                onEdit={() => { window.location.href = `/obras/${o.id}` }}
                onDelete={() => handleDeleteObra(o.id)}
              />
            )
          })}

          {tab === 'orcamentos' && orcFiltrados.map(o => {
            const st = STATUS_ORC[o.status as keyof typeof STATUS_ORC] ?? { label: o.status, color: '#6B7280' }
            return (
              <CadastroCard key={o.id} tipo="orcamento" id={o.id}
                nome={o.obras?.nome ? `Orç. v${o.versao} — ${o.obras.nome}` : `Orçamento v${o.versao}`}
                foto_url={o.obras?.foto_url} status={o.status} statusLabel={st.label} statusColor={st.color}
                data_inicio={o.created_at} responsaveis={[]} href={`/obras/${o.obra_id}?tab=orcamento`}
                onEdit={() => { window.location.href = `/obras/${o.obra_id}?tab=orcamento` }}
                onDelete={() => handleDeleteOrc(o.id)}
              />
            )
          })}
        </div>
      )}

      {showModal && (
        <NovoCadastroModal
          tipo={modalTipo}
          templates={templates}
          profiles={profiles}
          obras={obrasParaModal}
          onClose={() => setShowModal(false)}
          onCreated={loadAll}
        />
      )}
    </div>
  )
}
