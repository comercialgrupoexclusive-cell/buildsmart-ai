'use client'

import { useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { BarChart3, Wallet, FileText } from 'lucide-react'
import { PortfolioResumo } from '@/components/relatorios/PortfolioResumo'
import { ControleFinanceiro } from '@/components/relatorios/ControleFinanceiro'
import { RelatorioCliente } from '@/components/relatorios/RelatorioCliente'

type Tab = 'visao-geral' | 'financeiro' | 'relatorio-cliente'

const TABS: { id: Tab; label: string; icon: typeof BarChart3 }[] = [
  { id: 'visao-geral', label: 'Visão Geral', icon: BarChart3 },
  { id: 'financeiro', label: 'Controle Financeiro', icon: Wallet },
  { id: 'relatorio-cliente', label: 'Relatório Cliente', icon: FileText },
]

export default function RelatoriosPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>(() => {
    const t = searchParams.get('tab') as Tab | null
    return t && TABS.some(x => x.id === t) ? t : 'visao-geral'
  })

  function selecionar(t: Tab) {
    setTab(t)
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    params.set('tab', t)
    router.replace(`/relatorios?${params.toString()}`)
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Abas */}
      <div className="flex gap-1 overflow-x-auto border-b" style={{ borderColor: 'var(--border)' }}>
        {TABS.map(({ id, label, icon: Icon }) => {
          const ativo = tab === id
          return (
            <button
              key={id}
              onClick={() => selecionar(id)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px"
              style={ativo
                ? { color: 'var(--accent)', borderColor: 'var(--accent)' }
                : { color: 'var(--text-secondary)', borderColor: 'transparent' }}
            >
              <Icon size={16} /> {label}
            </button>
          )
        })}
      </div>

      {tab === 'visao-geral' && <PortfolioResumo />}
      {tab === 'financeiro' && <ControleFinanceiro />}
      {tab === 'relatorio-cliente' && <RelatorioCliente />}
    </div>
  )
}
