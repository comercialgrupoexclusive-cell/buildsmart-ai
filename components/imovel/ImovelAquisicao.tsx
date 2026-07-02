'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Imovel } from '@/lib/types'
import { STATUS_POSSE_LABEL } from '@/lib/utils'
import { Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { ArrowRight } from 'lucide-react'

type Props = { imovel: Imovel; onUpdate: (fields: Partial<Imovel>) => void }

export function ImovelAquisicao({ imovel, onUpdate }: Props) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    valor_proposta: imovel.valor_proposta != null ? String(imovel.valor_proposta) : '',
    valor_lance: imovel.valor_lance != null ? String(imovel.valor_lance) : '',
    valor_compra_final: imovel.valor_compra_final != null ? String(imovel.valor_compra_final) : '',
    data_proposta: imovel.data_proposta || '',
    data_aquisicao: imovel.data_aquisicao || '',
    status_documentacao: imovel.status_documentacao || 'pendente',
    status_posse: imovel.status_posse || 'ocupado',
    custo_documentacao_real: imovel.custo_documentacao_real != null ? String(imovel.custo_documentacao_real) : '',
    custos_aquisicao_extra: imovel.custos_aquisicao_extra != null ? String(imovel.custos_aquisicao_extra) : '',
    observacoes_aquisicao: imovel.observacoes_aquisicao || '',
  })

  const num = (v: string) => (v ? parseFloat(v) : 0)

  async function handleSave() {
    setSaving(true)
    const fields = {
      valor_proposta: form.valor_proposta ? num(form.valor_proposta) : null,
      valor_lance: form.valor_lance ? num(form.valor_lance) : null,
      valor_compra_final: form.valor_compra_final ? num(form.valor_compra_final) : null,
      data_proposta: form.data_proposta || null,
      data_aquisicao: form.data_aquisicao || null,
      status_documentacao: form.status_documentacao,
      status_posse: form.status_posse,
      custo_documentacao_real: form.custo_documentacao_real ? num(form.custo_documentacao_real) : null,
      custos_aquisicao_extra: form.custos_aquisicao_extra ? num(form.custos_aquisicao_extra) : null,
      observacoes_aquisicao: form.observacoes_aquisicao || null,
    }
    onUpdate(fields as Partial<Imovel>)
    const { error } = await supabase.from('imoveis').update(fields).eq('id', imovel.id)
    setSaving(false)
    if (error) alert('Erro ao salvar: ' + error.message)
  }

  async function avancarReforma() {
    await handleSave()
    onUpdate({ fase: 'reforma' })
    await supabase.from('imoveis').update({ fase: 'reforma' }).eq('id', imovel.id)
  }

  return (
    <div className="card p-6 flex flex-col gap-5 max-w-3xl">
      <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Aquisição</h2>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--text-secondary)' }}>Propostas e lances</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Valor da proposta (R$)</label>
            <input type="number" className="input-base" value={form.valor_proposta} onChange={e => setForm(f => ({ ...f, valor_proposta: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Data da proposta</label>
            <input type="date" className="input-base" value={form.data_proposta} onChange={e => setForm(f => ({ ...f, data_proposta: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Valor do lance (leilão, se aplicável)</label>
            <input type="number" className="input-base" value={form.valor_lance} onChange={e => setForm(f => ({ ...f, valor_lance: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Valor final de compra (R$)</label>
            <input type="number" className="input-base" value={form.valor_compra_final} onChange={e => setForm(f => ({ ...f, valor_compra_final: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Data da aquisição</label>
            <input type="date" className="input-base" value={form.data_aquisicao} onChange={e => setForm(f => ({ ...f, data_aquisicao: e.target.value }))} />
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--text-secondary)' }}>Documentos e posse</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Situação da documentação</label>
            <select className="input-base" value={form.status_documentacao} onChange={e => setForm(f => ({ ...f, status_documentacao: e.target.value as NonNullable<Imovel['status_documentacao']> }))}>
              <option value="pendente">Pendente</option>
              <option value="em_andamento">Em andamento</option>
              <option value="concluida">Concluída</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Situação da posse / desocupação</label>
            <select className="input-base" value={form.status_posse} onChange={e => setForm(f => ({ ...f, status_posse: e.target.value as NonNullable<Imovel['status_posse']> }))}>
              {Object.entries(STATUS_POSSE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--text-secondary)' }}>Custos reais da compra</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Documentação (cartório, ITBI...) (R$)</label>
            <input type="number" className="input-base" value={form.custo_documentacao_real} onChange={e => setForm(f => ({ ...f, custo_documentacao_real: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Outros custos de aquisição (R$)</label>
            <input type="number" className="input-base" value={form.custos_aquisicao_extra} onChange={e => setForm(f => ({ ...f, custos_aquisicao_extra: e.target.value }))} />
          </div>
        </div>
      </div>

      <Textarea
        label="Observações (pagamentos, condições, etc.)"
        rows={3}
        value={form.observacoes_aquisicao}
        onChange={e => setForm(f => ({ ...f, observacoes_aquisicao: e.target.value }))}
      />

      <div className="flex flex-wrap gap-3 pt-1">
        <Button loading={saving} onClick={handleSave}>Salvar aquisição</Button>
        {imovel.fase !== 'reforma' && (
          <Button variant="secondary" icon={<ArrowRight size={14} />} onClick={avancarReforma}>
            Avançar para Reforma
          </Button>
        )}
      </div>
    </div>
  )
}
