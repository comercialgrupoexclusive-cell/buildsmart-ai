'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Imovel } from '@/lib/types'
import { formatCurrency, formatPercent } from '@/lib/utils'
import { Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Calculator, ArrowRight } from 'lucide-react'

type Props = { imovel: Imovel; onUpdate: (fields: Partial<Imovel>) => void }

export function ImovelAnalise({ imovel, onUpdate }: Props) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    valor_compra_estimado: imovel.valor_compra_estimado != null ? String(imovel.valor_compra_estimado) : '',
    custo_documentacao_estimado: imovel.custo_documentacao_estimado != null ? String(imovel.custo_documentacao_estimado) : '',
    custo_reforma_estimado: imovel.custo_reforma_estimado != null ? String(imovel.custo_reforma_estimado) : '',
    preco_venda_estimado: imovel.preco_venda_estimado != null ? String(imovel.preco_venda_estimado) : '',
    prazo_estimado_meses: imovel.prazo_estimado_meses != null ? String(imovel.prazo_estimado_meses) : '',
    decisao_analise: imovel.decisao_analise || '',
    observacoes_analise: imovel.observacoes_analise || '',
  })

  const num = (v: string) => (v ? parseFloat(v) : 0)
  const investimentoEstimado = num(form.valor_compra_estimado) + num(form.custo_documentacao_estimado) + num(form.custo_reforma_estimado)
  const margemEstimada = num(form.preco_venda_estimado) - investimentoEstimado
  const margemPercentual = num(form.preco_venda_estimado) > 0 ? (margemEstimada / num(form.preco_venda_estimado)) * 100 : 0
  const retornoPercentual = investimentoEstimado > 0 ? (margemEstimada / investimentoEstimado) * 100 : 0

  const camposPreenchidos = useMemo(
    () => [form.valor_compra_estimado, form.custo_documentacao_estimado, form.custo_reforma_estimado, form.preco_venda_estimado].some(Boolean),
    [form]
  )

  async function handleSave() {
    setSaving(true)
    const fields = {
      valor_compra_estimado: form.valor_compra_estimado ? num(form.valor_compra_estimado) : null,
      custo_documentacao_estimado: form.custo_documentacao_estimado ? num(form.custo_documentacao_estimado) : null,
      custo_reforma_estimado: form.custo_reforma_estimado ? num(form.custo_reforma_estimado) : null,
      preco_venda_estimado: form.preco_venda_estimado ? num(form.preco_venda_estimado) : null,
      prazo_estimado_meses: form.prazo_estimado_meses ? num(form.prazo_estimado_meses) : null,
      decisao_analise: form.decisao_analise || null,
      observacoes_analise: form.observacoes_analise || null,
    }
    onUpdate(fields as Partial<Imovel>)
    const { error } = await supabase.from('imoveis').update(fields).eq('id', imovel.id)
    setSaving(false)
    if (error) alert('Erro ao salvar: ' + error.message)
  }

  async function avancarFase(fase: 'descartado' | 'aquisicao', motivo?: string) {
    await handleSave()
    const fields: Partial<Imovel> = { fase }
    if (motivo !== undefined) fields.motivo_descarte = motivo
    onUpdate(fields)
    await supabase.from('imoveis').update(fields).eq('id', imovel.id)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 card p-6 flex flex-col gap-4">
        <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Análise da Oportunidade</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Valor de compra estimado (R$)</label>
            <input type="number" className="input-base" value={form.valor_compra_estimado} onChange={e => setForm(f => ({ ...f, valor_compra_estimado: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Custos de documentação (R$)</label>
            <input type="number" className="input-base" value={form.custo_documentacao_estimado} onChange={e => setForm(f => ({ ...f, custo_documentacao_estimado: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Reforma estimada (R$)</label>
            <input type="number" className="input-base" value={form.custo_reforma_estimado} onChange={e => setForm(f => ({ ...f, custo_reforma_estimado: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Preço provável de venda (R$)</label>
            <input type="number" className="input-base" value={form.preco_venda_estimado} onChange={e => setForm(f => ({ ...f, preco_venda_estimado: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Prazo previsto (meses)</label>
            <input type="number" className="input-base" value={form.prazo_estimado_meses} onChange={e => setForm(f => ({ ...f, prazo_estimado_meses: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Decisão</label>
            <select className="input-base" value={form.decisao_analise} onChange={e => setForm(f => ({ ...f, decisao_analise: e.target.value }))}>
              <option value="">Ainda não decidido</option>
              <option value="descartar">Descartar</option>
              <option value="acompanhar">Acompanhar</option>
              <option value="comprar">Comprar</option>
            </select>
          </div>
        </div>
        <Textarea
          label="Observações da análise"
          rows={3}
          value={form.observacoes_analise}
          onChange={e => setForm(f => ({ ...f, observacoes_analise: e.target.value }))}
        />
        <div className="flex flex-wrap gap-3 pt-2">
          <Button loading={saving} onClick={handleSave}>Salvar análise</Button>
          {form.decisao_analise === 'comprar' && imovel.fase !== 'aquisicao' && (
            <Button variant="secondary" icon={<ArrowRight size={14} />} onClick={() => avancarFase('aquisicao')}>
              Avançar para Aquisição
            </Button>
          )}
          {form.decisao_analise === 'descartar' && imovel.fase !== 'descartado' && (
            <Button variant="danger" onClick={() => avancarFase('descartado', form.observacoes_analise)}>
              Descartar imóvel
            </Button>
          )}
        </div>
      </div>

      <div className="card p-6 flex flex-col gap-4 h-fit">
        <div className="flex items-center gap-2">
          <Calculator size={16} style={{ color: 'var(--accent)' }} />
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Margem estimada</h2>
        </div>
        {!camposPreenchidos ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Preencha os valores estimados para ver a margem e o retorno calculados automaticamente.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <Metric label="Investimento total estimado" value={formatCurrency(investimentoEstimado)} />
            <Metric label="Margem estimada" value={formatCurrency(margemEstimada)} highlight={margemEstimada >= 0} />
            <Metric label="Margem sobre venda" value={formatPercent(margemPercentual)} highlight={margemPercentual >= 0} />
            <Metric label="Retorno sobre capital" value={formatPercent(retornoPercentual)} highlight={retornoPercentual >= 0} />
          </div>
        )}
      </div>
    </div>
  )
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center pb-2" style={{ borderBottom: '1px solid var(--border)' }}>
      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span
        className="text-sm font-semibold tabular-nums"
        style={{ color: highlight === undefined ? 'var(--text-primary)' : highlight ? 'var(--success)' : 'var(--danger)' }}
      >
        {value}
      </span>
    </div>
  )
}
