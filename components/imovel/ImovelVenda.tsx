'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Imovel, ImovelProposta } from '@/lib/types'
import { formatCurrency, formatDate, FINANCIAMENTO_LABEL } from '@/lib/utils'
import { Textarea, Input, Select } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { Plus, Trash2, CheckCircle2, Users } from 'lucide-react'

type Props = { imovel: Imovel; onUpdate: (fields: Partial<Imovel>) => void }

const STATUS_PROPOSTA_VARIANT: Record<string, 'default' | 'success' | 'danger'> = {
  em_analise: 'default', aceita: 'success', recusada: 'danger',
}
const STATUS_PROPOSTA_LABEL: Record<string, string> = { em_analise: 'Em análise', aceita: 'Aceita', recusada: 'Recusada' }

export function ImovelVenda({ imovel, onUpdate }: Props) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [propostas, setPropostas] = useState<ImovelProposta[]>([])
  const [loadingPropostas, setLoadingPropostas] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [savingProposta, setSavingProposta] = useState(false)
  const [form, setForm] = useState({
    preco_anuncio: imovel.preco_anuncio != null ? String(imovel.preco_anuncio) : '',
    data_anuncio: imovel.data_anuncio || '',
    financiamento_mcmv: imovel.financiamento_mcmv,
    comissao_percentual: imovel.comissao_percentual != null ? String(imovel.comissao_percentual) : '',
    comissao_valor: imovel.comissao_valor != null ? String(imovel.comissao_valor) : '',
    comprador_nome: imovel.comprador_nome || '',
    status_documentacao_venda: imovel.status_documentacao_venda || 'pendente',
    preco_venda_final: imovel.preco_venda_final != null ? String(imovel.preco_venda_final) : '',
    data_venda: imovel.data_venda || '',
    observacoes_venda: imovel.observacoes_venda || '',
  })
  const [propostaForm, setPropostaForm] = useState({ nome_interessado: '', contato: '', valor_proposta: '', financiamento: 'a_vista', data: '', observacoes: '' })

  useEffect(() => { loadPropostas() }, [imovel.id])

  async function loadPropostas() {
    setLoadingPropostas(true)
    const { data } = await supabase.from('imovel_propostas').select('*').eq('imovel_id', imovel.id).order('created_at', { ascending: false })
    setPropostas((data || []) as ImovelProposta[])
    setLoadingPropostas(false)
  }

  const num = (v: string) => (v ? parseFloat(v) : 0)

  async function handleSave() {
    setSaving(true)
    const fields = {
      preco_anuncio: form.preco_anuncio ? num(form.preco_anuncio) : null,
      data_anuncio: form.data_anuncio || null,
      financiamento_mcmv: form.financiamento_mcmv,
      comissao_percentual: form.comissao_percentual ? num(form.comissao_percentual) : null,
      comissao_valor: form.comissao_valor ? num(form.comissao_valor) : null,
      comprador_nome: form.comprador_nome || null,
      status_documentacao_venda: form.status_documentacao_venda,
      preco_venda_final: form.preco_venda_final ? num(form.preco_venda_final) : null,
      data_venda: form.data_venda || null,
      observacoes_venda: form.observacoes_venda || null,
    }
    onUpdate(fields as Partial<Imovel>)
    const { error } = await supabase.from('imoveis').update(fields).eq('id', imovel.id)
    setSaving(false)
    if (error) alert('Erro ao salvar: ' + error.message)
  }

  async function concluirVenda() {
    if (!form.preco_venda_final || !form.data_venda) {
      alert('Informe o preço final e a data da venda antes de concluir.')
      return
    }
    await handleSave()
    onUpdate({ fase: 'concluido' })
    await supabase.from('imoveis').update({ fase: 'concluido' }).eq('id', imovel.id)
  }

  async function handleAddProposta() {
    if (!propostaForm.nome_interessado.trim()) return
    setSavingProposta(true)
    const { data, error } = await supabase.from('imovel_propostas').insert({
      imovel_id: imovel.id,
      nome_interessado: propostaForm.nome_interessado,
      contato: propostaForm.contato || null,
      valor_proposta: propostaForm.valor_proposta ? num(propostaForm.valor_proposta) : null,
      financiamento: propostaForm.financiamento,
      status: 'em_analise',
      data: propostaForm.data || null,
      observacoes: propostaForm.observacoes || null,
    }).select().single()
    setSavingProposta(false)
    if (error) { alert('Erro ao adicionar: ' + error.message); return }
    if (data) setPropostas([data as ImovelProposta, ...propostas])
    setShowModal(false)
    setPropostaForm({ nome_interessado: '', contato: '', valor_proposta: '', financiamento: 'a_vista', data: '', observacoes: '' })
  }

  async function handlePropostaStatus(id: string, status: ImovelProposta['status']) {
    setPropostas(propostas.map(p => p.id === id ? { ...p, status } : p))
    await supabase.from('imovel_propostas').update({ status }).eq('id', id)
  }

  async function handleRemoveProposta(id: string) {
    setPropostas(propostas.filter(p => p.id !== id))
    await supabase.from('imovel_propostas').delete().eq('id', id)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card p-6 flex flex-col gap-5">
        <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Preparação e condições da venda</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Preço de anúncio (R$)</label>
            <input type="number" className="input-base" value={form.preco_anuncio} onChange={e => setForm(f => ({ ...f, preco_anuncio: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Data do anúncio</label>
            <input type="date" className="input-base" value={form.data_anuncio} onChange={e => setForm(f => ({ ...f, data_anuncio: e.target.value }))} />
          </div>
          <label className="flex items-center gap-2 text-sm mt-6" style={{ color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={form.financiamento_mcmv} onChange={e => setForm(f => ({ ...f, financiamento_mcmv: e.target.checked }))} className="w-4 h-4 rounded" />
            Elegível para Minha Casa Minha Vida
          </label>
          <div>
            <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Comissão (%)</label>
            <input type="number" className="input-base" value={form.comissao_percentual} onChange={e => setForm(f => ({ ...f, comissao_percentual: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Comissão (R$)</label>
            <input type="number" className="input-base" value={form.comissao_valor} onChange={e => setForm(f => ({ ...f, comissao_valor: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Situação da documentação</label>
            <select className="input-base" value={form.status_documentacao_venda} onChange={e => setForm(f => ({ ...f, status_documentacao_venda: e.target.value as NonNullable<Imovel['status_documentacao_venda']> }))}>
              <option value="pendente">Pendente</option>
              <option value="em_andamento">Em andamento</option>
              <option value="concluida">Concluída</option>
            </select>
          </div>
        </div>

        <div className="pt-2" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--text-secondary)' }}>Conclusão da venda</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Preço final de venda (R$)</label>
              <input type="number" className="input-base" value={form.preco_venda_final} onChange={e => setForm(f => ({ ...f, preco_venda_final: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Data da venda</label>
              <input type="date" className="input-base" value={form.data_venda} onChange={e => setForm(f => ({ ...f, data_venda: e.target.value }))} />
            </div>
            <Input label="Comprador" value={form.comprador_nome} onChange={e => setForm(f => ({ ...f, comprador_nome: e.target.value }))} />
          </div>
        </div>

        <Textarea label="Observações" rows={3} value={form.observacoes_venda} onChange={e => setForm(f => ({ ...f, observacoes_venda: e.target.value }))} />

        <div className="flex flex-wrap gap-3">
          <Button loading={saving} onClick={handleSave}>Salvar venda</Button>
          {imovel.fase !== 'concluido' && (
            <Button variant="secondary" icon={<CheckCircle2 size={14} />} onClick={concluirVenda}>Concluir venda</Button>
          )}
        </div>
      </div>

      <div className="card p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={16} style={{ color: 'var(--accent)' }} />
            <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Interessados e propostas</h3>
          </div>
          <Button size="sm" icon={<Plus size={14} />} onClick={() => setShowModal(true)}>Nova proposta</Button>
        </div>

        {loadingPropostas ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
          </div>
        ) : propostas.length === 0 ? (
          <EmptyState icon={Users} title="Nenhuma proposta registrada" description="Cadastre interessados e propostas recebidas durante o anúncio." />
        ) : (
          <div className="flex flex-col gap-3">
            {propostas.map(proposta => (
              <div key={proposta.id} className="flex items-center gap-4 p-3 rounded-lg flex-wrap" style={{ border: '1px solid var(--border)' }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{proposta.nome_interessado}</p>
                    <Badge variant={STATUS_PROPOSTA_VARIANT[proposta.status]}>{STATUS_PROPOSTA_LABEL[proposta.status]}</Badge>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {proposta.contato || '—'} · {FINANCIAMENTO_LABEL[proposta.financiamento]} · {formatDate(proposta.data)}
                  </p>
                </div>
                {proposta.valor_proposta != null && (
                  <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--accent)' }}>{formatCurrency(proposta.valor_proposta)}</span>
                )}
                <select
                  value={proposta.status}
                  onChange={e => handlePropostaStatus(proposta.id, e.target.value as ImovelProposta['status'])}
                  className="input-base py-1 text-xs w-32"
                >
                  <option value="em_analise">Em análise</option>
                  <option value="aceita">Aceita</option>
                  <option value="recusada">Recusada</option>
                </select>
                <button onClick={() => handleRemoveProposta(proposta.id)} className="p-1.5 rounded hover:bg-[var(--bg-secondary)]" style={{ color: 'var(--danger)' }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Nova proposta" size="md">
        <div className="flex flex-col gap-4">
          <Input label="Interessado *" value={propostaForm.nome_interessado} onChange={e => setPropostaForm(f => ({ ...f, nome_interessado: e.target.value }))} />
          <Input label="Contato" value={propostaForm.contato} onChange={e => setPropostaForm(f => ({ ...f, contato: e.target.value }))} placeholder="Telefone / e-mail" />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Valor da proposta (R$)" type="number" value={propostaForm.valor_proposta} onChange={e => setPropostaForm(f => ({ ...f, valor_proposta: e.target.value }))} />
            <Input label="Data" type="date" value={propostaForm.data} onChange={e => setPropostaForm(f => ({ ...f, data: e.target.value }))} />
          </div>
          <Select label="Forma de pagamento" value={propostaForm.financiamento} onChange={e => setPropostaForm(f => ({ ...f, financiamento: e.target.value }))}>
            {Object.entries(FINANCIAMENTO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Textarea label="Observações" rows={2} value={propostaForm.observacoes} onChange={e => setPropostaForm(f => ({ ...f, observacoes: e.target.value }))} />
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button className="flex-1" loading={savingProposta} disabled={!propostaForm.nome_interessado.trim()} onClick={handleAddProposta}>Adicionar</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
