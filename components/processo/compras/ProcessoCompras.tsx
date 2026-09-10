'use client'

// Motor de Processo — Compras/Suprimentos (P4.3).
//
// Reaproveita os componentes já generalizados (compra_itens/requisicoes_compra
// com processo_id, decisão B do P4.2/P4.3) em vez de reimplementar CRUD: só
// compõe Lançamentos + Requisições sob duas abas, no mesmo padrão de
// ObraFinanciamento.tsx. ObraMateriais.tsx (1478 linhas, Lista de Compras +
// sincronização Orçamento→Materiais específica de obra) não é tocado — essa
// sincronização automática continua exclusiva de /obras (decisão E); no
// Processo a necessidade nasce manual, via Requisições ou lançamento direto.
import { useState } from 'react'
import { ClipboardList, ShoppingCart } from 'lucide-react'
import { ComprasLancamentos } from '@/components/obra/ComprasLancamentos'
import { ObraRequisicoes } from '@/components/obra/ObraRequisicoes'

type Tab = 'lancamentos' | 'requisicoes'

export function ProcessoCompras({ processoId, orcamentoId }: { processoId: string; orcamentoId: string }) {
  const [tab, setTab] = useState<Tab>('lancamentos')

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1 p-1 rounded-lg w-fit" style={{ background: 'var(--bg-secondary)' }}>
        <button
          onClick={() => setTab('lancamentos')}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-md text-sm font-medium transition-all"
          style={tab === 'lancamentos' ? { background: 'var(--accent)', color: 'white' } : { color: 'var(--text-secondary)' }}
        >
          <ShoppingCart size={15} /> Lançamentos
        </button>
        <button
          onClick={() => setTab('requisicoes')}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-md text-sm font-medium transition-all"
          style={tab === 'requisicoes' ? { background: 'var(--accent)', color: 'white' } : { color: 'var(--text-secondary)' }}
        >
          <ClipboardList size={15} /> Requisições
        </button>
      </div>

      {tab === 'lancamentos' && (
        <ComprasLancamentos processoId={processoId} orcamentoId={orcamentoId} orcamentoIds={[orcamentoId]} />
      )}
      {tab === 'requisicoes' && (
        <ObraRequisicoes processoId={processoId} orcamentoId={orcamentoId} orcamentoIds={[orcamentoId]} />
      )}
    </div>
  )
}
