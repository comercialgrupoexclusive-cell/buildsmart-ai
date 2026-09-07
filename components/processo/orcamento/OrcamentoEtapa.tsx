'use client'

// Tela 2 do fluxo de referência: dentro de uma etapa, lista de
// grupos/subetapas (navega pra OrcamentoGrupo) e itens soltos sem subetapa
// (navega direto pra OrcamentoItemDetalhe) — nunca a etapa inteira expandida
// de uma vez.
import { useMemo, useState } from 'react'
import { ArrowLeft, Boxes, ChevronRight, Search } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import { LinhaArvore } from './types'

type GrupoResumo = { id: string; nome: string; valor: number; quantidadeItens: number }
type ItemSolto = { id: string; descricao: string; quantidade: number | null; unidade: string | null; valor: number }

export function OrcamentoEtapa({
  etapaId, linhas, onVoltar, onAbrirGrupo, onAbrirItem,
}: {
  etapaId: string
  linhas: LinhaArvore[]
  onVoltar: () => void
  onAbrirGrupo: (grupoId: string) => void
  onAbrirItem: (itemId: string) => void
}) {
  const [busca, setBusca] = useState('')

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

  const termo = busca.trim().toLowerCase()
  const gruposFiltrados = termo ? grupos.filter(g => g.nome.toLowerCase().includes(termo)) : grupos
  const itensSoltosFiltrados = termo ? itensSoltos.filter(i => i.descricao.toLowerCase().includes(termo)) : itensSoltos

  return (
    <div className="flex flex-col gap-4">
      <button onClick={onVoltar} className="inline-flex items-center gap-2 text-sm w-fit" style={{ color: 'var(--text-secondary)' }}>
        <ArrowLeft size={16} /> Orçamento
      </button>

      <div>
        <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{etapaNome}</h2>
        <p className="text-sm font-semibold tabular-nums" style={{ color: 'var(--accent)' }}>{formatCurrency(totalEtapa)}</p>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar serviço..." className="input-base pl-9 w-full" />
      </div>

      {gruposFiltrados.length === 0 && itensSoltosFiltrados.length === 0 ? (
        <EmptyState icon={Boxes} title="Nenhum serviço encontrado" description={termo ? 'Ajuste a busca.' : 'Esta etapa ainda não tem serviços.'} />
      ) : (
        <div className="flex flex-col divide-y rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', '--tw-divide-color': 'var(--border)' } as React.CSSProperties}>
          {gruposFiltrados.map(grupo => (
            <button
              key={grupo.id}
              onClick={() => onAbrirGrupo(grupo.id)}
              className="flex items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[var(--bg-secondary)]"
              style={{ background: 'var(--bg-card)' }}
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{grupo.nome}</span>
                <span className="block text-xs" style={{ color: 'var(--text-secondary)' }}>{grupo.quantidadeItens} {grupo.quantidadeItens === 1 ? 'serviço' : 'serviços'}</span>
              </span>
              <span className="flex items-center gap-2 flex-shrink-0">
                <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{formatCurrency(grupo.valor)}</span>
                <ChevronRight size={16} style={{ color: 'var(--text-secondary)' }} />
              </span>
            </button>
          ))}
          {itensSoltosFiltrados.map(item => (
            <button
              key={item.id}
              onClick={() => onAbrirItem(item.id)}
              className="flex items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[var(--bg-secondary)]"
              style={{ background: 'var(--bg-card)' }}
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{item.descricao}</span>
                {item.quantidade != null && <span className="block text-xs" style={{ color: 'var(--text-secondary)' }}>{item.quantidade} {item.unidade}</span>}
              </span>
              <span className="flex items-center gap-2 flex-shrink-0">
                <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{formatCurrency(item.valor)}</span>
                <ChevronRight size={16} style={{ color: 'var(--text-secondary)' }} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
