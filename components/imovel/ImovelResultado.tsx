'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Imovel } from '@/lib/types'
import { formatCurrency, formatPercent } from '@/lib/utils'
import { TrendingUp, TrendingDown, Wallet, Calendar, Percent, Target } from 'lucide-react'

type Props = { imovel: Imovel }

export function ImovelResultado({ imovel }: Props) {
  const supabase = createClient()
  const [custoReformaReal, setCustoReformaReal] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      const { data } = await supabase.from('imovel_reforma_itens').select('valor_realizado').eq('imovel_id', imovel.id)
      if (!active) return
      const itens = (data || []) as { valor_realizado: number | null }[]
      const temRealizado = itens.some(i => i.valor_realizado != null)
      setCustoReformaReal(temRealizado ? itens.reduce((s, i) => s + (i.valor_realizado ?? 0), 0) : null)
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [imovel.id])

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  // ── Realizado (usa valor real; cai para estimado quando ainda não há dado real) ──
  const compraReal = imovel.valor_compra_final ?? imovel.valor_compra_estimado ?? 0
  const docReal = imovel.custo_documentacao_real ?? imovel.custo_documentacao_estimado ?? 0
  const extraAquisicaoReal = imovel.custos_aquisicao_extra ?? 0
  const reformaReal = custoReformaReal ?? imovel.orcamento_reforma ?? imovel.custo_reforma_estimado ?? 0
  const comissaoReal = imovel.comissao_valor ?? 0
  const vendaReal = imovel.preco_venda_final ?? imovel.preco_venda_estimado ?? 0

  const investimentoTotal = compraReal + docReal + extraAquisicaoReal + reformaReal
  const lucroLiquido = vendaReal - investimentoTotal - comissaoReal
  const margem = vendaReal > 0 ? (lucroLiquido / vendaReal) * 100 : 0
  const retornoCapital = investimentoTotal > 0 ? (lucroLiquido / investimentoTotal) * 100 : 0

  let prazoTotalDias: number | null = null
  if (imovel.data_venda) {
    const inicio = new Date(imovel.created_at).getTime()
    const fim = new Date(`${imovel.data_venda}T00:00:00`).getTime()
    prazoTotalDias = Math.round((fim - inicio) / (1000 * 60 * 60 * 24))
  }

  // ── Estimado (fase de análise) ──
  const investimentoEstimado = (imovel.valor_compra_estimado ?? 0) + (imovel.custo_documentacao_estimado ?? 0) + (imovel.custo_reforma_estimado ?? 0)
  const margemEstimada = (imovel.preco_venda_estimado ?? 0) - investimentoEstimado
  const temEstimativa = imovel.valor_compra_estimado != null || imovel.preco_venda_estimado != null

  const naoFinalizado = imovel.fase !== 'concluido'

  return (
    <div className="flex flex-col gap-4">
      {naoFinalizado && (
        <div className="p-3 rounded-lg text-sm" style={{ background: 'rgba(59,123,248,0.1)', border: '1px solid rgba(59,123,248,0.3)', color: 'var(--accent)' }}>
          Operação ainda em andamento — os números abaixo combinam valores reais já registrados com estimativas para os campos ainda em aberto.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <ResultCard icon={Wallet} label="Investimento total" value={formatCurrency(investimentoTotal)} />
        <ResultCard icon={lucroLiquido >= 0 ? TrendingUp : TrendingDown} label="Lucro líquido" value={formatCurrency(lucroLiquido)} positive={lucroLiquido >= 0} />
        <ResultCard icon={Percent} label="Margem sobre venda" value={formatPercent(margem)} positive={margem >= 0} />
        <ResultCard icon={Target} label="Retorno sobre capital" value={formatPercent(retornoCapital)} positive={retornoCapital >= 0} />
      </div>

      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Calendar size={16} style={{ color: 'var(--accent)' }} />
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Prazo da operação</h2>
        </div>
        {prazoTotalDias != null ? (
          <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
            <span className="text-xl font-semibold tabular-nums">{prazoTotalDias}</span> dias
            <span style={{ color: 'var(--text-secondary)' }}> (~{(prazoTotalDias / 30).toFixed(1)} meses)</span> entre a prospecção e a venda concluída.
            {imovel.prazo_estimado_meses != null && (
              <span style={{ color: 'var(--text-secondary)' }}> Previsto na análise: {imovel.prazo_estimado_meses} meses.</span>
            )}
          </p>
        ) : (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>O prazo total será calculado automaticamente quando a venda for concluída.</p>
        )}
      </div>

      <div className="card p-6">
        <h2 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Previsto (análise) × Realizado</h2>
        {!temEstimativa ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Preencha a aba Análise para comparar as estimativas com os valores reais.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['', 'Previsto', 'Realizado', 'Diferença'].map(h => (
                    <th key={h} className="text-left py-2 px-2 font-medium" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <CompareRow label="Valor de compra" previsto={imovel.valor_compra_estimado} realizado={imovel.valor_compra_final} />
                <CompareRow label="Custo de documentação" previsto={imovel.custo_documentacao_estimado} realizado={imovel.custo_documentacao_real} />
                <CompareRow label="Custo de reforma" previsto={imovel.custo_reforma_estimado} realizado={custoReformaReal} />
                <CompareRow label="Preço de venda" previsto={imovel.preco_venda_estimado} realizado={imovel.preco_venda_final} />
                <CompareRow label="Margem" previsto={margemEstimada} realizado={imovel.preco_venda_final != null ? lucroLiquido : null} isMoney />
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function ResultCard({ icon: Icon, label, value, positive }: { icon: typeof Wallet; label: string; value: string; positive?: boolean }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={16} style={{ color: 'var(--accent)' }} />
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      </div>
      <p className="text-xl font-semibold tabular-nums" style={{ color: positive === undefined ? 'var(--text-primary)' : positive ? 'var(--success)' : 'var(--danger)' }}>
        {value}
      </p>
    </div>
  )
}

function CompareRow({ label, previsto, realizado }: { label: string; previsto: number | null | undefined; realizado: number | null | undefined; isMoney?: boolean }) {
  const diferenca = previsto != null && realizado != null ? realizado - previsto : null
  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      <td className="py-2 px-2" style={{ color: 'var(--text-primary)' }}>{label}</td>
      <td className="py-2 px-2 tabular-nums" style={{ color: 'var(--text-secondary)' }}>{previsto != null ? formatCurrency(previsto) : '—'}</td>
      <td className="py-2 px-2 tabular-nums" style={{ color: 'var(--text-primary)' }}>{realizado != null ? formatCurrency(realizado) : '—'}</td>
      <td className="py-2 px-2 tabular-nums font-medium" style={{ color: diferenca == null ? 'var(--text-secondary)' : diferenca <= 0 ? 'var(--success)' : 'var(--danger)' }}>
        {diferenca != null ? `${diferenca > 0 ? '+' : ''}${formatCurrency(diferenca)}` : '—'}
      </td>
    </tr>
  )
}
