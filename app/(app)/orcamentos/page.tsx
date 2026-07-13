'use client'

import { useEffect, useState, useRef } from 'react'
import { FileText, Plus, HardHat, MoreVertical, Pencil, Copy, Trash2, CheckCircle, Circle, Archive } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate, STATUS_OBRA_COLOR, STATUS_OBRA_LABEL } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { NovoCadastroModal } from '@/components/cadastro/NovoCadastroModal'

import ServicosPage from '@/app/(app)/servicos/page'
import SinapiPage from '@/app/(app)/sinapi/page'

type OrcamentoComObra = {
  id: string
  obra_id: string | null
  projeto_id: string | null
  nome: string | null
  tipo: string
  bdi_percentual: number
  status: string
  versao: number
  created_at: string
  obra: { id: string; nome: string; endereco: string; status: string; foto_url: string | null } | null
  total_itens: number
  valor_total: number
}

export default function OrcamentosPage() {
  const supabase = createClient()
  const router = useRouter()
  const [orcamentos, setOrcamentos] = useState<OrcamentoComObra[]>([])
  const [obras, setObras] = useState<{ id: string; nome: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<string>('todos')
  const STATUS_ORC_BTN_COLOR: Record<string, string> = {
    rascunho: '#3B82F6',
    ativo: '#10B981',
    finalizado: '#6B7280',
  }
  const [projetos, setProjetos] = useState<{ id: string; nome: string }[]>([])
  const [aba, setAba] = useState<'orcamentos' | 'composicoes' | 'insumos' | 'base'>('orcamentos')
  const [showNovoModal, setShowNovoModal] = useState(false)
  const [menuId, setMenuId] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Editar nome inline
  const [editId, setEditId] = useState<string | null>(null)
  const [editNome, setEditNome] = useState('')

  useEffect(() => {
    loadOrcamentos()
    supabase.from('obras').select('id, nome').order('nome').then((res: { data: { id: string; nome: string }[] | null }) => setObras(res.data ?? []))
    supabase.from('projetos').select('id, nome').order('nome').then((res: { data: { id: string; nome: string }[] | null }) => setProjetos(res.data ?? []))
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuId(null)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function loadOrcamentos() {
    setLoading(true)
    const { data } = await supabase
      .from('orcamentos')
      .select(`
        *,
        obra:obras(id, nome, endereco, status, foto_url),
        orcamento_itens(quantidade, preco_unitario_snapshot)
      `)
      .order('created_at', { ascending: false })

    const enriched = (data || []).map((o: any) => {
      const itens = o.orcamento_itens || []
      const subtotal = itens.reduce((acc: number, i: any) => acc + (i.quantidade * i.preco_unitario_snapshot), 0)
      const valor_total = subtotal * (1 + o.bdi_percentual / 100)
      return {
        ...o,
        obra: o.obra,
        total_itens: itens.length,
        valor_total,
      }
    })
    setOrcamentos(enriched)
    setLoading(false)
  }

  async function handleDuplicate(orc: OrcamentoComObra) {
    setMenuId(null)
    const { data: novoOrc } = await supabase.from('orcamentos').insert({
      obra_id: orc.obra_id,
      projeto_id: orc.projeto_id,
      nome: (orc.nome || `Orçamento v${orc.versao}`) + ' (cópia)',
      tipo: orc.tipo,
      bdi_percentual: orc.bdi_percentual,
      status: 'rascunho',
      versao: 1,
    }).select().single()

    if (!novoOrc) return

    const { data: itensOrigem } = await supabase
      .from('orcamento_itens')
      .select('*')
      .eq('orcamento_id', orc.id)

    if (itensOrigem && itensOrigem.length > 0) {
      const novosItens = itensOrigem.map(({ id, created_at, orcamento_id, ...rest }: any) => ({
        ...rest,
        orcamento_id: novoOrc.id,
      }))
      await supabase.from('orcamento_itens').insert(novosItens)
    }

    await loadOrcamentos()
  }

  async function handleDelete(orc: OrcamentoComObra) {
    setMenuId(null)
    const nomeExibido = orc.nome || orc.obra?.nome || `Orçamento v${orc.versao}`
    if (!confirm(`Excluir "${nomeExibido}"? Todos os itens serão removidos.`)) return
    await supabase.from('orcamento_itens').delete().eq('orcamento_id', orc.id)
    await supabase.from('orcamentos').delete().eq('id', orc.id)
    await loadOrcamentos()
  }

  async function handleStatusChange(orc: OrcamentoComObra, novoStatus: string) {
    setMenuId(null)
    await supabase.from('orcamentos').update({ status: novoStatus }).eq('id', orc.id)
    setOrcamentos(prev => prev.map(o => o.id === orc.id ? { ...o, status: novoStatus } : o))
  }

  async function handleRename(orc: OrcamentoComObra) {
    setMenuId(null)
    setEditId(orc.id)
    setEditNome(orc.nome || orc.obra?.nome || `Orçamento v${orc.versao}`)
  }

  async function saveRename() {
    if (!editId || !editNome.trim()) return
    await supabase.from('orcamentos').update({ nome: editNome.trim() }).eq('id', editId)
    setOrcamentos(prev => prev.map(o => o.id === editId ? { ...o, nome: editNome.trim() } : o))
    setEditId(null)
  }

  const STATUS_ORC_COLOR: Record<string, string> = {
    rascunho: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    ativo:    'bg-green-500/20 text-green-400 border-green-500/30',
    finalizado: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  }
  const STATUS_ORC_LABEL: Record<string, string> = {
    rascunho: 'Rascunho', ativo: 'Ativo', finalizado: 'Finalizado',
  }

  const filtrados = filtro === 'todos'
    ? orcamentos
    : orcamentos.filter(o => o.status === filtro)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex gap-1 p-1 rounded-xl w-fit flex-wrap" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          {[
            { id: 'orcamentos', label: 'Orçamentos' },
            { id: 'composicoes', label: 'Composições' },
            { id: 'insumos', label: 'Insumos' },
            { id: 'base', label: 'Base de referência' },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setAba(item.id as typeof aba)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={aba === item.id
                ? { background: 'var(--accent)', color: 'white' }
                : { color: 'var(--text-secondary)' }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {aba === 'composicoes' && <ServicosPage initialTab="composicoes" embedded />}
      {aba === 'insumos' && <ServicosPage initialTab="insumos" embedded />}
      {aba === 'base' && <SinapiPage />}

      {aba === 'orcamentos' && (
      <>
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-1 p-1 rounded-lg flex-wrap" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          {(['todos', 'rascunho', 'ativo', 'finalizado'] as const).map(s => (
            <button
              key={s}
              onClick={() => setFiltro(s)}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap"
              style={filtro === s
                ? { background: s === 'todos' ? 'var(--accent)' : STATUS_ORC_BTN_COLOR[s], color: 'white' }
                : { color: 'var(--text-secondary)' }}
            >
              {s === 'todos' ? 'Todos' : STATUS_ORC_LABEL[s]}
            </button>
          ))}
        </div>
        <Button onClick={() => setShowNovoModal(true)} icon={<Plus size={16} />}>
          Novo Orçamento
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : filtrados.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhum orçamento encontrado"
          description="Crie um novo orçamento para começar."
          action={
            <Button onClick={() => setShowNovoModal(true)} icon={<Plus size={16} />}>
              Novo Orçamento
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {filtrados.map((orc, i) => {
            const nomeExibido = orc.nome || orc.obra?.nome || `Orçamento v${orc.versao}`
            return (
            <div
              key={orc.id}
              className="card p-5 flex flex-col sm:flex-row gap-4 items-start sm:items-center hover:scale-[1.005] transition-transform animate-enter relative"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              {/* Thumb obra */}
              <Link href={`/orcamentos/${orc.id}`} className="w-16 h-16 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--bg-secondary)' }}>
                {orc.obra?.foto_url ? (
                  <img src={orc.obra.foto_url} alt={nomeExibido} className="w-full h-full rounded-xl object-cover" />
                ) : (
                  <HardHat size={24} style={{ color: 'var(--text-secondary)' }} />
                )}
              </Link>

              {/* Dados */}
              <Link href={`/orcamentos/${orc.id}`} className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  {editId === orc.id ? (
                    <input
                      autoFocus
                      value={editNome}
                      onChange={e => setEditNome(e.target.value)}
                      onBlur={saveRename}
                      onKeyDown={e => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setEditId(null) }}
                      onClick={e => e.preventDefault()}
                      className="input-base text-sm font-semibold py-0.5 px-1.5 -ml-1.5"
                      style={{ maxWidth: 300 }}
                    />
                  ) : (
                    <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                      {nomeExibido}
                    </span>
                  )}
                  {orc.obra?.status && (
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_OBRA_COLOR[orc.obra.status]}`}>
                      {STATUS_OBRA_LABEL[orc.obra.status]}
                    </span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_ORC_COLOR[orc.status]}`}>
                    Orç. v{orc.versao} — {STATUS_ORC_LABEL[orc.status]}
                  </span>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {orc.total_itens} {orc.total_itens === 1 ? 'item' : 'itens'} · BDI {orc.bdi_percentual}% · Criado em {formatDate(orc.created_at)}
                </p>
              </Link>

              {/* Valor */}
              <Link href={`/orcamentos/${orc.id}`} className="text-right flex-shrink-0">
                <p className="text-xs mb-0.5" style={{ color: 'var(--text-secondary)' }}>Total c/ BDI</p>
                <p className="text-lg font-bold" style={{ color: 'var(--accent)' }}>
                  {formatCurrency(orc.valor_total)}
                </p>
              </Link>

              {/* Menu 3 pontinhos */}
              <div className="relative flex-shrink-0" ref={menuId === orc.id ? menuRef : undefined}>
                <button
                  onClick={e => { e.preventDefault(); e.stopPropagation(); setMenuId(menuId === orc.id ? null : orc.id) }}
                  className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <MoreVertical size={18} />
                </button>

                {menuId === orc.id && (
                  <div
                    className="absolute right-0 top-full mt-1 w-52 rounded-xl shadow-xl z-50 py-1 animate-enter"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                  >
                    <button
                      onClick={() => { router.push(`/orcamentos/${orc.id}`); setMenuId(null) }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-[var(--bg-secondary)] transition-colors"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      <Pencil size={15} /> Editar
                    </button>
                    <button
                      onClick={() => handleRename(orc)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-[var(--bg-secondary)] transition-colors"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      <FileText size={15} /> Renomear
                    </button>
                    <button
                      onClick={() => handleDuplicate(orc)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-[var(--bg-secondary)] transition-colors"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      <Copy size={15} /> Duplicar
                    </button>

                    <div className="mx-3 my-1 border-t" style={{ borderColor: 'var(--border)' }} />

                    <p className="px-4 py-1 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Status</p>
                    {orc.status !== 'rascunho' && (
                      <button
                        onClick={() => handleStatusChange(orc, 'rascunho')}
                        className="w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-[var(--bg-secondary)] transition-colors"
                        style={{ color: '#3B82F6' }}
                      >
                        <Circle size={15} /> Rascunho
                      </button>
                    )}
                    {orc.status !== 'ativo' && (
                      <button
                        onClick={() => handleStatusChange(orc, 'ativo')}
                        className="w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-[var(--bg-secondary)] transition-colors"
                        style={{ color: '#10B981' }}
                      >
                        <CheckCircle size={15} /> Ativo
                      </button>
                    )}
                    {orc.status !== 'finalizado' && (
                      <button
                        onClick={() => handleStatusChange(orc, 'finalizado')}
                        className="w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-[var(--bg-secondary)] transition-colors"
                        style={{ color: '#6B7280' }}
                      >
                        <Archive size={15} /> Finalizado
                      </button>
                    )}

                    <div className="mx-3 my-1 border-t" style={{ borderColor: 'var(--border)' }} />

                    <button
                      onClick={() => handleDelete(orc)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-red-500/10 transition-colors"
                      style={{ color: 'var(--danger, #EF4444)' }}
                    >
                      <Trash2 size={15} /> Excluir
                    </button>
                  </div>
                )}
              </div>
            </div>
          )})}
        </div>
      )}
      </>
      )}

      {showNovoModal && (
        <NovoCadastroModal
          tipo="orcamento"
          obras={obras}
          projetos={projetos}
          onClose={() => setShowNovoModal(false)}
          onCreated={loadOrcamentos}
        />
      )}
    </div>
  )
}
