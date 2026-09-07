'use client'

// Tela 1 do fluxo de referência: contexto, total, busca e lista de etapas
// (fechadas por padrão — abrir uma etapa é navegar pra tela seguinte, nunca
// expandir centenas de itens aqui).
import { useMemo, useState } from 'react'
import { ChevronRight, Search, Wallet } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { MetricCard } from '@/components/ui/InsightCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { LinhaArvore, agruparPorEtapa, calcularTotal } from './types'

export function OrcamentoResumo({
  processoNome, orcamento, linhas, onAbrirEtapa,
}: {
  processoNome: string
  orcamento: { versao: number; status: string; bdi_percentual: number }
  linhas: LinhaArvore[]
  onAbrirEtapa: (etapaId: string) => void
}) {
  const [busca, setBusca] = useState('')

  const totalGeral = useMemo(() => calcularTotal(linhas), [linhas])
  const etapas = useMemo(() => agruparPorEtapa(linhas), [linhas])
  const etapasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return etapas
    return etapas.filter(e => e.nome.toLowerCase().includes(termo))
  }, [etapas, busca])

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Orçamento</h2>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {processoNome} · versão {orcamento.versao} · {orcamento.status === 'em_projeto' ? 'em projeto' : orcamento.status}
        </p>
      </div>

      <MetricCard label="Valor total do orçamento" value={formatCurrency(totalGeral)} detail={`BDI ${orcamento.bdi_percentual}%`} tone="accent" />

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar etapa..."
          className="input-base pl-9 w-full"
        />
      </div>

      {etapasFiltradas.length === 0 ? (
        <EmptyState icon={Wallet} title="Nenhuma etapa encontrada" description={busca ? 'Ajuste a busca.' : 'Este orçamento ainda não tem etapas.'} />
      ) : (
        <div className="flex flex-col divide-y rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', '--tw-divide-color': 'var(--border)' } as React.CSSProperties}>
          {etapasFiltradas.map(etapa => (
            <button
              key={etapa.id}
              onClick={() => onAbrirEtapa(etapa.id)}
              className="flex items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[var(--bg-secondary)]"
              style={{ background: 'var(--bg-card)' }}
            >
              <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{etapa.nome}</span>
              <span className="flex items-center gap-2 flex-shrink-0">
                <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{formatCurrency(etapa.valor)}</span>
                <ChevronRight size={16} style={{ color: 'var(--text-secondary)' }} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
