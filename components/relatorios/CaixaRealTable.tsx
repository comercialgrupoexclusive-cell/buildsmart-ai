'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CompraItem, Etapa, EtapaCaixa } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'

const SEM_ETAPA = 'sem_etapa'

/**
 * Caixa x Real — espelha a aba "Orçamento x Reembolso Caixa" da planilha.
 * Cada etapa tem um "valor caixa" (teto de reembolso definido no início da obra,
 * editável inline) comparado ao custo real lançado. Diferença = caixa − real.
 */
export function CaixaRealTable({
  obraId, etapas, itens, caixas, valorObra, onCaixaChange,
}: {
  obraId: string
  etapas: Etapa[]
  itens: CompraItem[]
  caixas: EtapaCaixa[]
  valorObra: number
  onCaixaChange: (caixas: EtapaCaixa[]) => void
}) {
  const supabase = createClient()
  const [salvandoId, setSalvandoId] = useState<string | null>(null)

  // Custo real por etapa (soma dos lançamentos).
  const realPorEtapa = useMemo(() => {
    const m = new Map<string, number>()
    itens.forEach(i => {
      const chave = i.etapa_id || SEM_ETAPA
      m.set(chave, (m.get(chave) || 0) + (i.valor_total || 0))
    })
    return m
  }, [itens])

  const caixaPorEtapa = useMemo(() => new Map(caixas.map(c => [c.etapa_id, c])), [caixas])

  const totalCaixa = useMemo(() => caixas.reduce((s, c) => s + (c.valor_caixa || 0), 0), [caixas])

  // Linhas: uma por etapa (+ "Sem etapa" se houver lançamentos sem etapa).
  const linhas = useMemo(() => {
    const arr = etapas.map(e => ({ etapaId: e.id, nome: e.nome }))
    if ((realPorEtapa.get(SEM_ETAPA) || 0) > 0) arr.push({ etapaId: SEM_ETAPA, nome: 'Sem etapa' })
    return arr
  }, [etapas, realPorEtapa])

  const totalReal = useMemo(() => Array.from(realPorEtapa.values()).reduce((s, v) => s + v, 0), [realPorEtapa])

  async function salvarCaixa(etapaId: string, valorStr: string) {
    if (etapaId === SEM_ETAPA) return // "Sem etapa" não tem caixa (sem FK)
    const valor = parseFloat(String(valorStr).replace(',', '.')) || 0
    const existente = caixaPorEtapa.get(etapaId)
    if (existente && existente.valor_caixa === valor) return
    setSalvandoId(etapaId)
    if (existente) {
      const { error } = await supabase
        .from('etapa_caixa')
        .update({ valor_caixa: valor, updated_at: new Date().toISOString() })
        .eq('id', existente.id)
      if (error) alert(`Não foi possível salvar o valor de caixa.\n\nErro: ${error.message}`)
      else onCaixaChange(caixas.map(c => c.id === existente.id ? { ...c, valor_caixa: valor } : c))
    } else {
      const { data, error } = await supabase
        .from('etapa_caixa')
        .insert({ obra_id: obraId, etapa_id: etapaId, valor_caixa: valor })
        .select('*')
        .single()
      if (error) alert(`Não foi possível salvar o valor de caixa.\n\nErro: ${error.message}`)
      else if (data) onCaixaChange([...caixas, data as EtapaCaixa])
    }
    setSalvandoId(null)
  }

  return (
    <div className="card p-5 overflow-x-auto">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Caixa × Real por etapa</h3>
        {salvandoId && <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>salvando…</span>}
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
        Valor caixa = teto de reembolso definido no início da obra. Diferença = caixa − custo real lançado.
      </p>

      {linhas.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Cadastre etapas nesta obra para usar o controle de caixa.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr style={{ color: 'var(--text-secondary)' }}>
              <th className="text-left py-2 font-medium">Etapa</th>
              <th className="text-right py-2 font-medium">Valor Caixa (R$)</th>
              <th className="text-right py-2 font-medium">Custo Real</th>
              <th className="text-right py-2 font-medium">Diferença</th>
              <th className="text-right py-2 font-medium">% da obra</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(linha => {
              const caixa = caixaPorEtapa.get(linha.etapaId)
              const valorCaixa = caixa?.valor_caixa ?? 0
              const real = realPorEtapa.get(linha.etapaId) || 0
              const diferenca = valorCaixa - real
              const pctObra = totalCaixa > 0 ? (valorCaixa / totalCaixa) * 100 : null
              const semEtapa = linha.etapaId === SEM_ETAPA
              return (
                <tr key={linha.etapaId} style={{ borderTop: '1px solid var(--border)' }}>
                  <td className="py-2" style={{ color: 'var(--text-primary)' }}>{linha.nome}</td>
                  <td className="py-2 text-right">
                    {semEtapa ? (
                      <span style={{ color: 'var(--text-secondary)' }}>—</span>
                    ) : (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={valorCaixa || ''}
                        onBlur={e => salvarCaixa(linha.etapaId, e.target.value)}
                        placeholder="0,00"
                        className="input-base w-32 text-right py-1"
                      />
                    )}
                  </td>
                  <td className="py-2 text-right font-medium" style={{ color: 'var(--text-primary)' }}>{formatCurrency(real)}</td>
                  <td className="py-2 text-right font-semibold" style={{ color: diferenca >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {formatCurrency(diferenca)}
                  </td>
                  <td className="py-2 text-right" style={{ color: 'var(--text-secondary)' }}>
                    {pctObra !== null ? `${pctObra.toFixed(1)}%` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid var(--border)' }}>
              <td className="py-2 font-bold" style={{ color: 'var(--text-primary)' }}>Total</td>
              <td className="py-2 text-right font-bold" style={{ color: 'var(--text-primary)' }}>{formatCurrency(totalCaixa)}</td>
              <td className="py-2 text-right font-bold" style={{ color: 'var(--text-primary)' }}>{formatCurrency(totalReal)}</td>
              <td className="py-2 text-right font-bold" style={{ color: totalCaixa - totalReal >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {formatCurrency(totalCaixa - totalReal)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      )}

      {totalCaixa > 0 && valorObra > 0 && Math.abs(totalCaixa - valorObra) > 0.01 && (
        <p className="text-xs mt-3" style={{ color: 'var(--warning)' }}>
          O total de caixa ({formatCurrency(totalCaixa)}) difere do valor da obra ({formatCurrency(valorObra)}) em{' '}
          {formatCurrency(Math.abs(totalCaixa - valorObra))}.
        </p>
      )}
    </div>
  )
}
