'use client'

// Tela 2 do fluxo de referência: dentro de uma etapa, lista de
// grupos/subetapas (navega pra OrcamentoGrupo) e itens soltos sem subetapa
// (navega direto pra OrcamentoItemDetalhe) — nunca a etapa inteira expandida
// de uma vez.
//
// P4.4 (validação real Allegra, seção 6): + contextual no cabeçalho (sem
// precisar rolar até o fim da lista para adicionar), menu de três pontos por
// linha (grupo: renomear/excluir se vazio; item solto: excluir com
// checagem de vínculo) e lista sem divisórias brancas pesadas — cards
// leves com espaçamento em vez de divide-y + borda em todas as linhas.
import { useMemo, useState } from 'react'
import { ArrowLeft, Boxes, ChevronRight, Layers, MoreVertical, Package, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { excluirItemComVinculo } from '@/lib/orcamento/vinculos'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { LinhaArvore, calcularTotal } from './types'

type GrupoResumo = { id: string; nome: string; valor: number; quantidadeItens: number }
type ItemSolto = { id: string; descricao: string; quantidade: number | null; unidade: string | null; valor: number }

export function OrcamentoEtapa({
  etapaId, linhas, onVoltar, onAbrirGrupo, onAbrirItem, onAdicionarItem, onAtualizado,
}: {
  etapaId: string
  linhas: LinhaArvore[]
  onVoltar: () => void
  onAbrirGrupo: (grupoId: string) => void
  onAbrirItem: (itemId: string) => void
  onAdicionarItem: () => void
  onAtualizado: () => Promise<void>
}) {
  const supabase = createClient()
  const [busca, setBusca] = useState('')
  const [menuAberto, setMenuAberto] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const linhasDaEtapa = useMemo(() => linhas.filter(l => l.etapa_id === etapaId), [linhas, etapaId])
  const etapaNome = linhasDaEtapa[0]?.etapa_nome || 'Etapa'
  const itensDaEtapa = useMemo(() => linhasDaEtapa.filter(l => l.tipo_linha === 'item'), [linhasDaEtapa])

  const grupos = useMemo<GrupoResumo[]>(() => {
    return linhasDaEtapa
      .filter(l => l.tipo_linha === 'subetapa')
      .map(sub => {
        const itensDoGrupo = itensDaEtapa.filter(i => i.grupo_id === sub.item_id)
        const valor = sub.subetapa_valor_manual_ativo ? sub.valor : itensDoGrupo.reduce((s, i) => s + i.valor, 0)
        return { id: sub.item_id, nome: sub.grupo_nome || sub.item_descricao || 'Sem nome', valor, quantidadeItens: itensDoGrupo.length }
      })
  }, [linhasDaEtapa, itensDaEtapa])

  const itensSoltos = useMemo<ItemSolto[]>(() => {
    return itensDaEtapa
      .filter(i => !i.grupo_id)
      .map(i => ({ id: i.item_id, descricao: i.item_descricao || 'Sem descrição', quantidade: i.quantidade, unidade: i.unidade, valor: i.valor }))
  }, [itensDaEtapa])

  const totalEtapa = grupos.reduce((s, g) => s + g.valor, 0) + itensSoltos.reduce((s, i) => s + i.valor, 0)
  const totalOrcamento = useMemo(() => calcularTotal(linhas), [linhas])
  const percentualDoOrcamento = totalOrcamento > 0 ? (totalEtapa / totalOrcamento) * 100 : 0

  const termo = busca.trim().toLowerCase()
  const gruposFiltrados = termo ? grupos.filter(g => g.nome.toLowerCase().includes(termo)) : grupos
  const itensSoltosFiltrados = termo ? itensSoltos.filter(i => i.descricao.toLowerCase().includes(termo)) : itensSoltos

  async function excluirGrupo(grupo: GrupoResumo) {
    setErro(null)
    if (grupo.quantidadeItens > 0) {
      setErro('Este grupo tem serviços dentro — mova ou exclua os serviços antes de excluir o grupo.')
      setMenuAberto(null)
      return
    }
    setMenuAberto(null)
    if (!window.confirm(`Excluir o grupo "${grupo.nome}"? Não pode ser desfeito.`)) return
    try {
      await excluirItemComVinculo(supabase, grupo.id)
      await onAtualizado()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível excluir o grupo.')
    } finally {
      setMenuAberto(null)
    }
  }

  async function excluirItemSolto(item: ItemSolto) {
    setErro(null)
    setMenuAberto(null)
    if (!window.confirm(`Excluir "${item.descricao}"? Não pode ser desfeito.`)) return
    try {
      await excluirItemComVinculo(supabase, item.id)
      await onAtualizado()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível excluir.')
    } finally {
      setMenuAberto(null)
    }
  }

  async function renomearGrupo(grupo: GrupoResumo) {
    setMenuAberto(null)
    const novoNome = window.prompt('Novo nome do grupo:', grupo.nome)
    if (!novoNome || !novoNome.trim() || novoNome.trim() === grupo.nome) return
    setErro(null)
    try {
      const { error } = await supabase.from('orcamento_itens').update({ descricao_snapshot: novoNome.trim(), subetapa: novoNome.trim() }).eq('id', grupo.id)
      if (error) throw error
      await onAtualizado()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível renomear.')
    }
  }

  return (
    <div className="flex flex-col gap-4" onClick={() => menuAberto && setMenuAberto(null)}>
      <button onClick={onVoltar} className="inline-flex items-center gap-2 text-sm w-fit" style={{ color: 'var(--text-secondary)' }}>
        <ArrowLeft size={16} /> Orçamento
      </button>

      <div>
        <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{etapaNome}</h2>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-base font-bold tabular-nums" style={{ color: 'var(--accent)' }}>{formatCurrency(totalEtapa)}</p>
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>· {percentualDoOrcamento.toFixed(1)}% do orçamento</span>
        </div>
        <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, percentualDoOrcamento)}%`, background: 'var(--accent)' }} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar serviço..." className="input-base pl-9 w-full" />
        </div>
        <button
          onClick={onAdicionarItem}
          className="flex-shrink-0 flex items-center justify-center h-10 w-10 rounded-xl"
          style={{ background: 'var(--accent)', color: 'white' }}
          aria-label="Adicionar serviço"
          title="Adicionar serviço"
        >
          <Plus size={18} />
        </button>
      </div>

      {erro && (
        <p className="text-sm rounded-lg px-3 py-2" style={{ color: 'var(--danger)', background: 'rgba(239,68,68,0.08)' }}>{erro}</p>
      )}

      {gruposFiltrados.length === 0 && itensSoltosFiltrados.length === 0 ? (
        <EmptyState icon={Boxes} title="Nenhum serviço encontrado" description={termo ? 'Ajuste a busca.' : 'Esta etapa ainda não tem serviços.'} action={<Button size="sm" icon={<Plus size={14} />} onClick={onAdicionarItem}>Adicionar serviço</Button>} />
      ) : (
        <div className="flex flex-col gap-2">
          {gruposFiltrados.map(grupo => (
            <div key={grupo.id} className="flex items-center gap-1 rounded-xl transition-colors hover:bg-[var(--bg-secondary)]" style={{ background: 'var(--bg-card)' }}>
              <button
                onClick={() => onAbrirGrupo(grupo.id)}
                className="flex items-center gap-3 px-4 py-3.5 text-left flex-1 min-w-0"
              >
                <span className="flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: 'var(--bg-secondary)', color: 'var(--accent)' }}>
                  <Layers size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{grupo.nome}</span>
                  <span className="block text-xs" style={{ color: 'var(--text-secondary)' }}>{grupo.quantidadeItens} {grupo.quantidadeItens === 1 ? 'serviço' : 'serviços'}</span>
                </span>
                <span className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{formatCurrency(grupo.valor)}</span>
                  <ChevronRight size={16} style={{ color: 'var(--text-secondary)' }} />
                </span>
              </button>
              <div className="relative pr-2" onClick={e => e.stopPropagation()}>
                <button onClick={() => setMenuAberto(v => v === grupo.id ? null : grupo.id)} className="p-2 rounded-lg hover:bg-[var(--bg-secondary)]" aria-label="Mais ações do grupo">
                  <MoreVertical size={15} style={{ color: 'var(--text-secondary)' }} />
                </button>
                {menuAberto === grupo.id && (
                  <div className="absolute right-2 top-full z-20 w-48 rounded-xl py-1.5 shadow-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                    <button onClick={() => renomearGrupo(grupo)} className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm" style={{ color: 'var(--text-primary)' }}>
                      <Pencil size={13} /> Renomear
                    </button>
                    <button onClick={() => excluirGrupo(grupo)} className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm" style={{ color: 'var(--danger)' }}>
                      <Trash2 size={13} /> Excluir grupo
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {itensSoltosFiltrados.map(item => (
            <div key={item.id} className="flex items-center gap-1 rounded-xl transition-colors hover:bg-[var(--bg-secondary)]" style={{ background: 'var(--bg-card)' }}>
              <button
                onClick={() => onAbrirItem(item.id)}
                className="flex items-center gap-3 px-4 py-3.5 text-left flex-1 min-w-0"
              >
                <span className="flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                  <Package size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{item.descricao}</span>
                  {item.quantidade != null && <span className="block text-xs" style={{ color: 'var(--text-secondary)' }}>{item.quantidade} {item.unidade}</span>}
                </span>
                <span className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{formatCurrency(item.valor)}</span>
                </span>
              </button>
              <div className="relative pr-2" onClick={e => e.stopPropagation()}>
                <button onClick={() => setMenuAberto(v => v === item.id ? null : item.id)} className="p-2 rounded-lg hover:bg-[var(--bg-secondary)]" aria-label="Mais ações do item">
                  <MoreVertical size={15} style={{ color: 'var(--text-secondary)' }} />
                </button>
                {menuAberto === item.id && (
                  <div className="absolute right-2 top-full z-20 w-44 rounded-xl py-1.5 shadow-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                    <button onClick={() => excluirItemSolto(item)} className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm" style={{ color: 'var(--danger)' }}>
                      <Trash2 size={13} /> Excluir
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
