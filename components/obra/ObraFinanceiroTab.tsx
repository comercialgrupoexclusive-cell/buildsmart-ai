'use client'

import { useState } from 'react'
import { Banknote, Landmark } from 'lucide-react'
import { ObraAvancoFinanceiro } from '@/components/obra/ObraAvancoFinanceiro'
import { ObraFinanciamento } from '@/components/obra/ObraFinanciamento'

type SubTab = 'financeiro' | 'financiamento'

const TABS: { id: SubTab; label: string; icon: typeof Banknote }[] = [
  { id: 'financeiro', label: 'Financeiro', icon: Banknote },
  { id: 'financiamento', label: 'Financiamento', icon: Landmark },
]

export function ObraFinanceiroTab({ obraId, orcamentoId, orcamentoIds }: { obraId: string; orcamentoId: string; orcamentoIds: string[] }) {
  const [subTab, setSubTab] = useState<SubTab>('financeiro')

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1.5 p-1 rounded-lg w-fit overflow-x-auto max-w-full" style={{ background: 'var(--bg-secondary)' }}>
        {TABS.map(t => {
          const Ic = t.icon
          return (
            <button key={t.id} onClick={() => setSubTab(t.id)}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap"
              style={subTab === t.id ? { background: 'var(--accent)', color: 'white' } : { color: 'var(--text-secondary)' }}>
              <Ic size={15} /> {t.label}
            </button>
          )
        })}
      </div>

      {subTab === 'financeiro' && <ObraAvancoFinanceiro obraId={obraId} orcamentoId={orcamentoId} orcamentoIds={orcamentoIds} />}
      {subTab === 'financiamento' && <ObraFinanciamento obraId={obraId} orcamentoId={orcamentoId} orcamentoIds={orcamentoIds} />}
    </div>
  )
}
