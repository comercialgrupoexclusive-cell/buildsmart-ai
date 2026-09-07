'use client'

// Tela 3 do fluxo de referência: serviços de um grupo/subetapa, de forma
// compacta (descrição, quantidade, unidade, total) — toque abre o detalhe.
import { useMemo, useState } from 'react'
import { ArrowLeft, ChevronRight, PackageSearch, Search } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import { LinhaArvore } from './types'

export function OrcamentoGrupo({
  etapaId, grupoId, linhas, onVoltar, onAbrirItem,
}: {
  etapaId: string
  grupoId: string
  linhas: LinhaArvore[]
  onVoltar: () => void
  onAbrirItem: (itemId: string) => void
}) {
  const [busca, setBusca] = useState('')

  const grupoHeader = useMemo(() => linhas.find(l => l.item_id === grupoId && l.tipo_linha === 'subetapa'), [linhas, grupoId])
  const itens = useMemo(
    () => linhas.filter(l => l.etapa_id === etapaId && l.tipo_linha === 'item' && l.grupo_id === grupoId),
    [linhas, etapaId, grupoId]
  )
  const totalGrupo = grupoHeader?.subetapa_valor_manual_ativo ? grupoHeader.valor : itens.reduce((s, i) => s + i.valor, 0)

  const termo = busca.trim().toLowerCase()
  const itensFiltrados = termo ? itens.filter(i => (i.item_descricao || '').toLowerCase().includes(termo)) : itens

  return (
    <div className="flex flex-col gap-4">
      <button onClick={onVoltar} className="inline-flex items-center gap-2 text-sm w-fit" style={{ color: 'var(--text-secondary)' }}>
        <ArrowLeft size={16} /> {linhas.find(l => l.etapa_id === etapaId)?.etapa_nome || 'Etapa'}
      </button>

      <div>
        <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{grupoHeader?.grupo_nome || grupoHeader?.item_descricao || 'Serviços'}</h2>
        <p className="text-sm font-semibold tabular-nums" style={{ color: 'var(--accent)' }}>{formatCurrency(totalGrupo)}</p>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar serviço..." className="input-base pl-9 w-full" />
      </div>

      {itensFiltrados.length === 0 ? (
        <EmptyState icon={PackageSearch} title="Nenhum serviço encontrado" description={termo ? 'Ajuste a busca.' : 'Este grupo ainda não tem serviços.'} />
      ) : (
        <div className="flex flex-col divide-y rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', '--tw-divide-color': 'var(--border)' } as React.CSSProperties}>
          {itensFiltrados.map(item => (
            <button
              key={item.item_id}
              onClick={() => onAbrirItem(item.item_id)}
              className="flex items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[var(--bg-secondary)]"
              style={{ background: 'var(--bg-card)' }}
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{item.item_descricao}</span>
                {item.quantidade != null && (
                  <span className="block text-xs" style={{ color: 'var(--text-secondary)' }}>{item.quantidade} {item.unidade}</span>
                )}
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
