'use client'

// Tela 3 do fluxo de referência: serviços de um grupo/subetapa, de forma
// compacta (descrição, quantidade, unidade, total) — toque abre o detalhe
// direto (P4.4). + contextual no cabeçalho e menu de três pontos por item
// (excluir com checagem de vínculo) — sem divide-y pesado entre linhas.
import { useMemo, useState } from 'react'
import { ArrowLeft, MoreVertical, PackageSearch, Plus, Search, Trash2, Wrench } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { excluirItemComVinculo } from '@/lib/orcamento/vinculos'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { LinhaArvore } from './types'

export function OrcamentoGrupo({
  etapaId, grupoId, linhas, onVoltar, onAbrirItem, onAdicionarItem, onAtualizado,
}: {
  etapaId: string
  grupoId: string
  linhas: LinhaArvore[]
  onVoltar: () => void
  onAbrirItem: (itemId: string) => void
  onAdicionarItem: () => void
  onAtualizado: () => Promise<void>
}) {
  const supabase = createClient()
  const [busca, setBusca] = useState('')
  const [menuAberto, setMenuAberto] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const grupoHeader = useMemo(() => linhas.find(l => l.item_id === grupoId && l.tipo_linha === 'subetapa'), [linhas, grupoId])
  const itens = useMemo(
    () => linhas.filter(l => l.etapa_id === etapaId && l.tipo_linha === 'item' && l.grupo_id === grupoId),
    [linhas, etapaId, grupoId]
  )
  const totalGrupo = grupoHeader?.subetapa_valor_manual_ativo ? grupoHeader.valor : itens.reduce((s, i) => s + i.valor, 0)

  const termo = busca.trim().toLowerCase()
  const itensFiltrados = termo ? itens.filter(i => (i.item_descricao || '').toLowerCase().includes(termo)) : itens

  async function excluirItem(item: { item_id: string; item_descricao: string | null }) {
    setErro(null)
    setMenuAberto(null)
    if (!window.confirm(`Excluir "${item.item_descricao || 'este serviço'}"? Não pode ser desfeito.`)) return
    try {
      await excluirItemComVinculo(supabase, item.item_id)
      await onAtualizado()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível excluir.')
    }
  }

  return (
    <div className="flex flex-col gap-4" onClick={() => menuAberto && setMenuAberto(null)}>
      <button onClick={onVoltar} className="inline-flex items-center gap-2 text-sm w-fit" style={{ color: 'var(--text-secondary)' }}>
        <ArrowLeft size={16} /> {linhas.find(l => l.etapa_id === etapaId)?.etapa_nome || 'Etapa'}
      </button>

      <div>
        <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{grupoHeader?.grupo_nome || grupoHeader?.item_descricao || 'Serviços'}</h2>
        <p className="text-base font-bold tabular-nums" style={{ color: 'var(--accent)' }}>{formatCurrency(totalGrupo)}</p>
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

      {itensFiltrados.length === 0 ? (
        <EmptyState icon={PackageSearch} title="Nenhum serviço encontrado" description={termo ? 'Ajuste a busca.' : 'Este grupo ainda não tem serviços.'} action={<Button size="sm" icon={<Plus size={14} />} onClick={onAdicionarItem}>Adicionar serviço</Button>} />
      ) : (
        <div className="flex flex-col gap-2">
          {itensFiltrados.map(item => (
            <div key={item.item_id} className="flex items-center gap-1 rounded-xl transition-colors hover:bg-[var(--bg-secondary)]" style={{ background: 'var(--bg-card)' }}>
              <button
                onClick={() => onAbrirItem(item.item_id)}
                className="flex items-center gap-3 px-4 py-3.5 text-left flex-1 min-w-0"
              >
                <span className="flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: 'var(--bg-secondary)', color: 'var(--accent)' }}>
                  <Wrench size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{item.item_descricao}</span>
                  {item.quantidade != null && (
                    <span className="block text-xs" style={{ color: 'var(--text-secondary)' }}>{item.quantidade} {item.unidade}</span>
                  )}
                </span>
                <span className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{formatCurrency(item.valor)}</span>
                </span>
              </button>
              <div className="relative pr-2" onClick={e => e.stopPropagation()}>
                <button onClick={() => setMenuAberto(v => v === item.item_id ? null : item.item_id)} className="p-2 rounded-lg hover:bg-[var(--bg-secondary)]" aria-label="Mais ações do item">
                  <MoreVertical size={15} style={{ color: 'var(--text-secondary)' }} />
                </button>
                {menuAberto === item.item_id && (
                  <div className="absolute right-2 top-full z-20 w-44 rounded-xl py-1.5 shadow-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                    <button onClick={() => excluirItem(item)} className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm" style={{ color: 'var(--danger)' }}>
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
