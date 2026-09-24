'use client'

// Árvore BOQ inline (referência 06, normativa): Etapa → Subetapa → Item, cada
// nível expansível/recolhível, tudo numa tela só. Substitui a antiga pilha de
// telas (Resumo → Etapa → Grupo → Item). Não recalcula valor — lê `valor` da
// LinhaArvore (fonte canônica orcamento_item_valor); escrita de subetapa/
// exclusão passa por resolverGrupoId / excluirItemComVinculo.
import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { resolverGrupoId } from '@/lib/orcamento/inserir-item'
import { excluirItemComVinculo } from '@/lib/orcamento/vinculos'
import { LinhaArvore } from './types'

type ItemNode = {
  id: string
  descricao: string
  unidade: string | null
  quantidade: number | null
  valorUnit: number
  valorTotal: number
}
type SubetapaNode = { id: string; nome: string; valor: number; itens: ItemNode[] }
type EtapaNode = { id: string; nome: string; valor: number; subetapas: SubetapaNode[]; itensSoltos: ItemNode[] }

function toItem(l: LinhaArvore): ItemNode {
  const qtd = l.quantidade
  const valorUnit = qtd && qtd !== 0 ? l.valor / qtd : (l.preco_unitario_snapshot ?? l.valor)
  return {
    id: l.item_id,
    descricao: l.item_descricao || 'Sem descrição',
    unidade: l.unidade,
    quantidade: qtd,
    valorUnit,
    valorTotal: l.valor,
  }
}

export function OrcamentoArvore({
  orcamentoId, linhas, busca, onAdicionarItem, onEditarItem, onAtualizado,
}: {
  orcamentoId: string
  linhas: LinhaArvore[]
  busca: string
  // Abre o modal já com a etapa/subetapa pré-selecionadas quando vem do
  // contexto de uma etapa específica.
  onAdicionarItem: (ctx: { etapaId: string | null; grupoId: string | null }) => void
  onEditarItem: (itemId: string) => void
  onAtualizado: () => Promise<void>
}) {
  const supabase = useMemo(() => createClient(), [])
  const [etapasAbertas, setEtapasAbertas] = useState<Set<string>>(() => new Set())
  const [subsAbertas, setSubsAbertas] = useState<Set<string>>(() => new Set())
  const [menu, setMenu] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const etapas = useMemo<EtapaNode[]>(() => {
    const mapa = new Map<string, EtapaNode>()
    const ordem = new Map<string, number>()
    for (const l of linhas) {
      if (!l.etapa_id) continue
      if (!mapa.has(l.etapa_id)) {
        mapa.set(l.etapa_id, { id: l.etapa_id, nome: l.etapa_nome || 'Etapa', valor: 0, subetapas: [], itensSoltos: [] })
        ordem.set(l.etapa_id, l.etapa_ordem ?? Number.MAX_SAFE_INTEGER)
      }
    }
    // Subetapas primeiro, para os itens acharem o pai.
    for (const l of linhas) {
      if (l.tipo_linha === 'subetapa' && l.etapa_id) {
        mapa.get(l.etapa_id)?.subetapas.push({ id: l.item_id, nome: l.grupo_nome || l.item_descricao || 'Serviço', valor: 0, itens: [] })
      }
    }
    for (const l of linhas) {
      if (l.tipo_linha !== 'item' || !l.etapa_id) continue
      const etapa = mapa.get(l.etapa_id)
      if (!etapa) continue
      const item = toItem(l)
      if (l.grupo_id) {
        const sub = etapa.subetapas.find(s => s.id === l.grupo_id)
        if (sub) { sub.itens.push(item); sub.valor += item.valorTotal }
        else { etapa.itensSoltos.push(item) }
      } else {
        etapa.itensSoltos.push(item)
      }
      etapa.valor += item.valorTotal
    }
    return [...mapa.values()].sort((a, b) => (ordem.get(a.id)! - ordem.get(b.id)!))
  }, [linhas])

  const termo = busca.trim().toLowerCase()
  const etapasFiltradas = termo
    ? etapas.filter(e =>
        e.nome.toLowerCase().includes(termo) ||
        e.subetapas.some(s => s.nome.toLowerCase().includes(termo) || s.itens.some(i => i.descricao.toLowerCase().includes(termo))) ||
        e.itensSoltos.some(i => i.descricao.toLowerCase().includes(termo)))
    : etapas

  function toggle(set: Set<string>, id: string, setter: (s: Set<string>) => void) {
    const novo = new Set(set)
    if (novo.has(id)) novo.delete(id); else novo.add(id)
    setter(novo)
  }

  async function adicionarSubetapa(etapaId: string) {
    const nome = window.prompt('Nome do serviço / subetapa:')
    if (!nome || !nome.trim()) return
    setErro(null)
    try {
      await resolverGrupoId(supabase, { orcamentoId, etapaId, nomeSubetapa: nome.trim() })
      await onAtualizado()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível criar a subetapa.')
    }
  }

  async function excluir(id: string, label: string, temFilhos: boolean) {
    setMenu(null)
    if (temFilhos) { setErro('Este item tem serviços dentro — exclua ou mova o conteúdo antes.'); return }
    if (!window.confirm(`Excluir "${label}"? Não pode ser desfeito.`)) return
    setErro(null)
    try {
      await excluirItemComVinculo(supabase, id)
      await onAtualizado()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível excluir.')
    }
  }

  async function renomearSubetapa(id: string, nomeAtual: string) {
    setMenu(null)
    const novo = window.prompt('Novo nome do serviço:', nomeAtual)
    if (!novo || !novo.trim() || novo.trim() === nomeAtual) return
    setErro(null)
    try {
      const { error } = await supabase.from('orcamento_itens').update({ descricao_snapshot: novo.trim(), subetapa: novo.trim() }).eq('id', id)
      if (error) throw error
      await onAtualizado()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível renomear.')
    }
  }

  return (
    <div className="flex flex-col gap-2.5" onClick={() => menu && setMenu(null)}>
      {erro && <p className="text-sm rounded-lg px-3 py-2" style={{ color: 'var(--danger)', background: 'rgba(239,68,68,0.08)' }}>{erro}</p>}

      {etapasFiltradas.map((etapa, idx) => {
        const abertaEtapa = etapasAbertas.has(etapa.id)
        return (
          <div key={etapa.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
            {/* ETAPA */}
            <div className="flex items-center" style={{ borderLeft: '3px solid var(--accent)' }}>
              <button onClick={() => toggle(etapasAbertas, etapa.id, setEtapasAbertas)} className="flex flex-1 items-center gap-2 px-3 py-3 text-left min-w-0">
                {abertaEtapa ? <ChevronDown size={16} className="flex-shrink-0" style={{ color: 'var(--text-secondary)' }} /> : <ChevronRight size={16} className="flex-shrink-0" style={{ color: 'var(--text-secondary)' }} />}
                <span className="min-w-0 flex-1 text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{idx + 1}. {etapa.nome}</span>
                <span className="flex-shrink-0 text-sm font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{formatCurrency(etapa.valor)}</span>
              </button>
            </div>

            {abertaEtapa && (
              <div className="px-2 pb-2 flex flex-col gap-1.5" style={{ borderTop: '1px solid var(--border)' }}>
                {etapa.subetapas.map((sub, sidx) => {
                  const abertaSub = subsAbertas.has(sub.id)
                  return (
                    <div key={sub.id} className="rounded-lg mt-1.5" style={{ background: 'var(--bg-secondary)' }}>
                      <div className="flex items-center">
                        <button onClick={() => toggle(subsAbertas, sub.id, setSubsAbertas)} className="flex flex-1 items-center gap-2 px-3 py-2 text-left min-w-0">
                          {abertaSub ? <ChevronDown size={14} className="flex-shrink-0" style={{ color: 'var(--text-secondary)' }} /> : <ChevronRight size={14} className="flex-shrink-0" style={{ color: 'var(--text-secondary)' }} />}
                          <span className="min-w-0 flex-1 text-sm truncate" style={{ color: 'var(--text-primary)' }}>{idx + 1}.{sidx + 1} {sub.nome}</span>
                          <span className="flex-shrink-0 text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>{formatCurrency(sub.valor)}</span>
                        </button>
                        <div className="relative pr-1.5" onClick={e => e.stopPropagation()}>
                          <button onClick={() => setMenu(m => m === sub.id ? null : sub.id)} className="p-1.5 rounded-lg" aria-label="Ações do serviço">
                            <MoreVertical size={14} style={{ color: 'var(--text-secondary)' }} />
                          </button>
                          {menu === sub.id && (
                            <div className="absolute right-1.5 top-full z-20 w-44 rounded-lg py-1 shadow-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                              <button onClick={() => renomearSubetapa(sub.id, sub.nome)} className="flex w-full items-center gap-2 px-3 py-2 text-sm" style={{ color: 'var(--text-primary)' }}><Pencil size={13} /> Renomear</button>
                              <button onClick={() => excluir(sub.id, sub.nome, sub.itens.length > 0)} className="flex w-full items-center gap-2 px-3 py-2 text-sm" style={{ color: 'var(--danger)' }}><Trash2 size={13} /> Excluir</button>
                            </div>
                          )}
                        </div>
                      </div>

                      {abertaSub && (
                        <div className="px-1.5 pb-1.5 flex flex-col gap-1">
                          {sub.itens.map(item => <ItemLinha key={item.id} item={item} menu={menu} setMenu={setMenu} onEditar={onEditarItem} onExcluir={excluir} />)}
                          <button onClick={() => onAdicionarItem({ etapaId: etapa.id, grupoId: sub.id })} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium" style={{ color: 'var(--accent)' }}>
                            <Plus size={13} /> Lançar item aqui
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}

                {etapa.itensSoltos.map(item => (
                  <div key={item.id} className="mt-1.5">
                    <ItemLinha item={item} menu={menu} setMenu={setMenu} onEditar={onEditarItem} onExcluir={excluir} />
                  </div>
                ))}

                <button
                  onClick={() => adicionarSubetapa(etapa.id)}
                  className="mt-1.5 flex items-center justify-center gap-1.5 rounded-lg border border-dashed py-2 text-xs font-medium"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  <Plus size={13} /> Adicionar subetapa
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ItemLinha({ item, menu, setMenu, onEditar, onExcluir }: {
  item: ItemNode
  menu: string | null
  setMenu: (m: string | null) => void
  onEditar: (id: string) => void
  onExcluir: (id: string, label: string, temFilhos: boolean) => void
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg px-2.5 py-2" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <button onClick={() => onEditar(item.id)} className="min-w-0 flex-1 text-left">
        <span className="block text-sm truncate" style={{ color: 'var(--text-primary)' }}>{item.descricao}</span>
        <span className="block text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
          {item.quantidade != null ? `${item.quantidade} ${item.unidade || ''}` : (item.unidade || '')}
          {item.quantidade != null ? ` · ${formatCurrency(item.valorUnit)}` : ''}
        </span>
      </button>
      <span className="flex-shrink-0 text-sm font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{formatCurrency(item.valorTotal)}</span>
      <div className="relative flex-shrink-0" onClick={e => e.stopPropagation()}>
        <button onClick={() => setMenu(menu === item.id ? null : item.id)} className="p-1.5 rounded-lg" aria-label="Ações do item">
          <MoreVertical size={14} style={{ color: 'var(--text-secondary)' }} />
        </button>
        {menu === item.id && (
          <div className="absolute right-0 top-full z-20 w-40 rounded-lg py-1 shadow-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <button onClick={() => { setMenu(null); onEditar(item.id) }} className="flex w-full items-center gap-2 px-3 py-2 text-sm" style={{ color: 'var(--text-primary)' }}><Pencil size={13} /> Editar</button>
            <button onClick={() => onExcluir(item.id, item.descricao, false)} className="flex w-full items-center gap-2 px-3 py-2 text-sm" style={{ color: 'var(--danger)' }}><Trash2 size={13} /> Excluir</button>
          </div>
        )}
      </div>
    </div>
  )
}
