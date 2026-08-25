'use client'

// Aba "Investimento" do Project quando contexto='investimento' (Laboratório
// Investidor, Rodada 4 — Marco 4: Ativos). Mostra o vínculo com a
// Prospecção de origem e o resultado do cenário principal — leitura, sem
// nenhuma lógica de cálculo própria (reaproveita os mesmos números já
// persistidos em prospeccao_cenarios pelo motor do Marco 3). Financeiro
// real (comprometido/pago) e Comercialização ficam para marcos futuros —
// aqui é só o "previsto" herdado da Prospecção.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Landmark } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatCurrency } from '@/lib/utils'
import type { Prospeccao, ProspeccaoCenario } from '@/lib/types'

export function ProjetoResumoInvestimento({ projetoId }: { projetoId: string }) {
  const [prospeccao, setProspeccao] = useState<Prospeccao | null>(null)
  const [principal, setPrincipal] = useState<ProspeccaoCenario | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const supabase = createClient()
    const { data: p } = await supabase.from('prospeccoes').select('*').eq('project_id', projetoId).maybeSingle()
    if (p) {
      const { data: c } = await supabase.from('prospeccao_cenarios').select('*').eq('prospeccao_id', p.id).eq('principal', true).maybeSingle()
      setPrincipal((c as ProspeccaoCenario | null) ?? null)
    }
    setProspeccao((p as Prospeccao | null) ?? null)
    setLoading(false)
  }

  useEffect(() => { void load() }, [projetoId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  if (!prospeccao) {
    return (
      <EmptyState
        icon={Landmark}
        title="Nenhuma prospecção vinculada"
        description="Este projeto está marcado como investimento, mas não foi encontrado o vínculo com a prospecção de origem."
      />
    )
  }

  const temResultado = principal && (principal.lucro != null || principal.rentabilidade != null)
  const positivo = (principal?.lucro ?? 0) >= 0

  return (
    <div className="flex flex-col gap-4">
      <div className="card p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Origem</p>
          <p className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{prospeccao.nome}</p>
        </div>
        <Link
          href={`/investidor/${prospeccao.id}`}
          className="inline-flex items-center gap-1 text-sm font-medium flex-shrink-0"
          style={{ color: 'var(--accent)' }}
        >
          Ver prospecção <ArrowUpRight size={14} />
        </Link>
      </div>

      <div className="card p-4">
        <p className="text-xs font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>
          CENÁRIO PRINCIPAL {principal ? `(${principal.nome})` : ''}
        </p>
        {!principal ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            A prospecção de origem ainda não tem um cenário principal definido.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Campo label="Valor de arrematação" valor={principal.valor_arrematacao != null ? formatCurrency(principal.valor_arrematacao) : '—'} />
            <Campo label="Valor de venda estimado" valor={principal.valor_venda_estimado != null ? formatCurrency(principal.valor_venda_estimado) : '—'} />
            {temResultado ? (
              <>
                <Campo label="Lucro estimado" valor={formatCurrency(principal.lucro!)} cor={positivo ? 'var(--success)' : 'var(--danger)'} />
                <Campo label="Rentabilidade" valor={`${principal.rentabilidade!.toFixed(1)}%`} cor={positivo ? 'var(--success)' : 'var(--danger)'} />
              </>
            ) : (
              <Campo label="Investimento total" valor={principal.investimento_total != null ? formatCurrency(principal.investimento_total) : '—'} />
            )}
          </div>
        )}
      </div>

      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
        Estes valores refletem o cenário previsto na prospecção. Comparação com o realizado
        (financeiro real da obra) e Comercialização chegam em marcos futuros do Laboratório Investidor.
      </p>
    </div>
  )
}

function Campo({ label, valor, cor }: { label: string; valor: string; cor?: string }) {
  return (
    <div>
      <p className="text-xs mb-0.5" style={{ color: 'var(--text-secondary)' }}>{label}</p>
      <p className="font-bold text-sm sm:text-base" style={{ color: cor ?? 'var(--text-primary)' }}>{valor}</p>
    </div>
  )
}
