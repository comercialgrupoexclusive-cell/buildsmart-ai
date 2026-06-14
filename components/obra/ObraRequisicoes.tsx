'use client'

import { useEffect, useState } from 'react'
import {
  Plus, Trash2, ChevronDown, ChevronRight, AlertCircle,
  Check, Building2, Calendar, FileText, ShoppingCart,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'

type Requisicao = {
  id: string
  obra_id: string
  numero: string | null
  data_solicitacao: string
  status: 'aberta' | 'aprovada' | 'comprada' | 'cancelada'
  observacao: string | null
  solicitante: string | null
  created_at: string
}

type ReqItem = {
  id: string
  requisicao_id: string
  material_id: string | null
  descricao: string
  quantidade: number | null
  unidade: string | null
  urgente: boolean
  observacao: string | null
}

type Cotacao = {
  id: string
  requisicao_id: string
  fornecedor_id: string | null
  fornecedor_nome: string | null
  data_cotacao: string
  validade: string | null
  valor_total: number | null
  observacao: string | null
  vencedora: boolean
}

type Fornecedor = { id: string; nome: string }

const STATUS_META = {
  aberta:    { label: 'Aberta',    color: 'var(--accent)',   bg: 'rgba(59,123,248,0.1)' },
  aprovada:  { label: 'Aprovada',  color: '#10b981',         bg: 'rgba(16,185,129,0.1)' },
  comprada:  { label: 'Comprada',  color: '#6b7280',         bg: 'rgba(107,114,128,0.1)' },
  cancelada: { label: 'Cancelada', color: '#ef4444',         bg: 'rgba(239,68,68,0.1)' },
}

const EMPTY_REQ: { numero: string; data_solicitacao: string; status: Requisicao['status']; observacao: string; solicitante: string } = { numero: '', data_solicitacao: new Date().toISOString().slice(0, 10), status: 'aberta', observacao: '', solicitante: '' }
const EMPTY_ITEM = { descricao: '', quantidade: '', unidade: '', urgente: false, observacao: '' }
const EMPTY_COT = { fornecedor_id: '', fornecedor_nome: '', data_cotacao: new Date().toISOString().slice(0, 10), validade: '', valor_total: '', observacao: '' }

export function ObraRequisicoes({ obraId }: { obraId: string }) {
  const supabase = createClient()
  const [requisicoes, setRequisicoes] = useState<Requisicao[]>([])
  const [itens, setItens] = useState<ReqItem[]>([])
  const [cotacoes, setCotacoes] = useState<Cotacao[]>([])
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  // Modais
  const [reqModal, setReqModal] = useState(false)
  const [reqForm, setReqForm] = useState(EMPTY_REQ)
  const [reqItems, setReqItems] = useState<typeof EMPTY_ITEM[]>([{ ...EMPTY_ITEM }])
  const [savingReq, setSavingReq] = useState(false)

  const [cotModal, setCotModal] = useState<string | null>(null) // requisicao_id
  const [cotForm, setCotForm] = useState(EMPTY_COT)
  const [savingCot, setSavingCot] = useState(false)

  useEffect(() => { loadData() }, [obraId])

  async function loadData() {
    setLoading(true)
    const [{ data: reqs }, { data: its }, { data: cots }, { data: fors }] = await Promise.all([
      supabase.from('requisicoes_compra').select('*').eq('obra_id', obraId).order('created_at', { ascending: false }),
      supabase.from('requisicao_itens').select('*').order('descricao'),
      supabase.from('cotacoes').select('*').order('created_at', { ascending: false }),
      supabase.from('fornecedores').select('id, nome').or(`obra_id.is.null,obra_id.eq.${obraId}`).order('nome'),
    ])
    setRequisicoes((reqs ?? []) as Requisicao[])
    // filtrar por requisicoes desta obra
    const reqIds = new Set((reqs ?? []).map((r: any) => r.id))
    setItens(((its ?? []) as ReqItem[]).filter(i => reqIds.has(i.requisicao_id)))
    setCotacoes(((cots ?? []) as Cotacao[]).filter(c => reqIds.has(c.requisicao_id)))
    setFornecedores((fors ?? []) as Fornecedor[])
    setLoading(false)
  }

  // ── Requisição ────────────────────────────────────────────────────────────

  function gerarNumero() {
    const n = requisicoes.length + 1
    return `RC-${String(n).padStart(3, '0')}`
  }

  async function saveReq() {
    setSavingReq(true)
    const numero = reqForm.numero.trim() || gerarNumero()
    const { data: req, error } = await supabase.from('requisicoes_compra').insert({
      obra_id: obraId,
      numero,
      data_solicitacao: reqForm.data_solicitacao,
      status: reqForm.status,
      observacao: reqForm.observacao || null,
      solicitante: reqForm.solicitante || null,
    }).select().single()

    if (!error && req) {
      const validItems = reqItems.filter(i => i.descricao.trim())
      if (validItems.length > 0) {
        await supabase.from('requisicao_itens').insert(
          validItems.map(i => ({
            requisicao_id: req.id,
            descricao: i.descricao.trim(),
            quantidade: i.quantidade ? Number(i.quantidade) : null,
            unidade: i.unidade || null,
            urgente: i.urgente,
            observacao: i.observacao || null,
          }))
        )
      }
      await loadData()
      setReqModal(false)
      setReqForm(EMPTY_REQ)
      setReqItems([{ ...EMPTY_ITEM }])
      setExpanded(e => ({ ...e, [req.id]: true }))
    }
    setSavingReq(false)
  }

  async function deleteReq(id: string) {
    if (!confirm('Excluir esta requisição e todos os itens e cotações?')) return
    await supabase.from('requisicoes_compra').delete().eq('id', id)
    setRequisicoes(prev => prev.filter(r => r.id !== id))
    setItens(prev => prev.filter(i => i.requisicao_id !== id))
    setCotacoes(prev => prev.filter(c => c.requisicao_id !== id))
  }

  async function updateStatus(id: string, status: Requisicao['status']) {
    await supabase.from('requisicoes_compra').update({ status }).eq('id', id)
    setRequisicoes(prev => prev.map(r => r.id === id ? { ...r, status } : r))
  }

  // ── Cotação ───────────────────────────────────────────────────────────────

  async function saveCot() {
    if (!cotModal) return
    setSavingCot(true)
    const fornNome = cotForm.fornecedor_id
      ? (fornecedores.find(f => f.id === cotForm.fornecedor_id)?.nome ?? cotForm.fornecedor_nome)
      : cotForm.fornecedor_nome
    const { data, error } = await supabase.from('cotacoes').insert({
      requisicao_id: cotModal,
      fornecedor_id: cotForm.fornecedor_id || null,
      fornecedor_nome: fornNome || null,
      data_cotacao: cotForm.data_cotacao,
      validade: cotForm.validade || null,
      valor_total: cotForm.valor_total ? Number(cotForm.valor_total) : null,
      observacao: cotForm.observacao || null,
      vencedora: false,
    }).select().single()
    if (!error && data) setCotacoes(prev => [data as Cotacao, ...prev])
    setSavingCot(false)
    setCotModal(null)
    setCotForm(EMPTY_COT)
  }

  async function toggleVencedora(cot: Cotacao) {
    // Só uma vencedora por requisição
    const novaVencedora = !cot.vencedora
    if (novaVencedora) {
      const daCot = cotacoes.filter(c => c.requisicao_id === cot.requisicao_id)
      await Promise.all(daCot.map(c =>
        supabase.from('cotacoes').update({ vencedora: c.id === cot.id }).eq('id', c.id)
      ))
      setCotacoes(prev => prev.map(c =>
        c.requisicao_id === cot.requisicao_id ? { ...c, vencedora: c.id === cot.id } : c
      ))
    } else {
      await supabase.from('cotacoes').update({ vencedora: false }).eq('id', cot.id)
      setCotacoes(prev => prev.map(c => c.id === cot.id ? { ...c, vencedora: false } : c))
    }
  }

  async function deleteCot(id: string) {
    await supabase.from('cotacoes').delete().eq('id', id)
    setCotacoes(prev => prev.filter(c => c.id !== id))
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {requisicoes.length} {requisicoes.length === 1 ? 'requisição' : 'requisições'}
        </p>
        <Button icon={<Plus size={15} />} size="sm" onClick={() => { setReqForm({ ...EMPTY_REQ, numero: gerarNumero() }); setReqModal(true) }}>
          Nova Requisição
        </Button>
      </div>

      {requisicoes.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="Nenhuma requisição"
          description="Crie uma requisição de compra para controlar o que precisa ser adquirido para esta obra."
          action={<Button icon={<Plus size={14} />} size="sm" onClick={() => setReqModal(true)}>Nova Requisição</Button>}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {requisicoes.map(req => {
            const meta = STATUS_META[req.status]
            const reqItens = itens.filter(i => i.requisicao_id === req.id)
            const reqCots = cotacoes.filter(c => c.requisicao_id === req.id)
            const isOpen = expanded[req.id]
            const menorCot = reqCots.filter(c => c.valor_total).sort((a, b) => (a.valor_total ?? 0) - (b.valor_total ?? 0))[0]

            return (
              <div key={req.id} className="card overflow-hidden">
                {/* Header */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none hover:bg-[var(--bg-secondary)] transition-colors"
                  style={{ background: 'var(--bg-secondary)', borderBottom: isOpen ? '1px solid var(--border)' : 'none' }}
                  onClick={() => setExpanded(e => ({ ...e, [req.id]: !e[req.id] }))}
                >
                  <span style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>
                    {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{req.numero ?? 'RC-?'}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ color: meta.color, background: meta.bg }}>{meta.label}</span>
                      {reqItens.some(i => i.urgente) && (
                        <span className="text-xs flex items-center gap-1 text-red-400"><AlertCircle size={12} /> Urgente</span>
                      )}
                    </div>
                    <p className="text-xs mt-0.5 flex items-center gap-3 flex-wrap" style={{ color: 'var(--text-secondary)' }}>
                      <span className="flex items-center gap-1"><Calendar size={11} />{new Date(req.data_solicitacao + 'T12:00').toLocaleDateString('pt-BR')}</span>
                      <span>{reqItens.length} {reqItens.length === 1 ? 'item' : 'itens'}</span>
                      {reqCots.length > 0 && <span>{reqCots.length} {reqCots.length === 1 ? 'cotação' : 'cotações'}</span>}
                      {menorCot && <span className="font-medium" style={{ color: '#10b981' }}>Menor: R$ {menorCot.valor_total?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>}
                    </p>
                  </div>
                  {/* Ações */}
                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <select
                      value={req.status}
                      onChange={e => updateStatus(req.id, e.target.value as Requisicao['status'])}
                      className="text-xs px-2 py-1 rounded-lg border outline-none hidden sm:block"
                      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    >
                      {Object.entries(STATUS_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
                    </select>
                    <button onClick={() => deleteReq(req.id)} className="p-1.5 rounded hover:bg-red-500/10">
                      <Trash2 size={13} style={{ color: 'var(--danger)' }} />
                    </button>
                  </div>
                </div>

                {/* Conteúdo expandido */}
                {isOpen && (
                  <div>
                    {/* Itens */}
                    <div style={{ borderBottom: '1px solid var(--border)' }}>
                      <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                        Itens solicitados
                      </p>
                      {reqItens.length === 0 ? (
                        <p className="px-4 pb-3 text-xs" style={{ color: 'var(--text-secondary)' }}>Nenhum item cadastrado.</p>
                      ) : reqItens.map(item => (
                        <div key={item.id} className="flex items-center gap-3 px-4 py-2.5" style={{ borderTop: '1px solid var(--border)' }}>
                          {item.urgente && <AlertCircle size={13} className="flex-shrink-0 text-red-400" />}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{item.descricao}</p>
                            {item.observacao && <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{item.observacao}</p>}
                          </div>
                          {item.quantidade && (
                            <span className="text-sm font-medium flex-shrink-0" style={{ color: 'var(--text-primary)' }}>
                              {item.quantidade} {item.unidade ?? ''}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Cotações */}
                    <div>
                      <div className="flex items-center justify-between px-4 pt-3 pb-1">
                        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                          Cotações ({reqCots.length})
                        </p>
                        <button
                          onClick={() => { setCotForm(EMPTY_COT); setCotModal(req.id) }}
                          className="text-xs flex items-center gap-1 font-medium"
                          style={{ color: 'var(--accent)' }}
                        >
                          <Plus size={12} /> Adicionar cotação
                        </button>
                      </div>
                      {reqCots.length === 0 ? (
                        <p className="px-4 pb-3 text-xs" style={{ color: 'var(--text-secondary)' }}>Nenhuma cotação ainda.</p>
                      ) : reqCots.map(cot => (
                        <div
                          key={cot.id}
                          className="flex items-center gap-3 px-4 py-2.5"
                          style={{ borderTop: '1px solid var(--border)', background: cot.vencedora ? 'rgba(16,185,129,0.05)' : 'transparent' }}
                        >
                          {cot.vencedora && <Check size={14} className="flex-shrink-0" style={{ color: '#10b981' }} />}
                          {!cot.vencedora && <Building2 size={14} className="flex-shrink-0" style={{ color: 'var(--text-secondary)' }} />}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                              {cot.fornecedor_nome ?? '—'}
                              {cot.vencedora && <span className="ml-2 text-xs font-semibold" style={{ color: '#10b981' }}>✓ Vencedora</span>}
                            </p>
                            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                              {new Date(cot.data_cotacao + 'T12:00').toLocaleDateString('pt-BR')}
                              {cot.validade && ` · válido até ${new Date(cot.validade + 'T12:00').toLocaleDateString('pt-BR')}`}
                              {cot.observacao && ` · ${cot.observacao}`}
                            </p>
                          </div>
                          {cot.valor_total && (
                            <span className="text-sm font-semibold flex-shrink-0" style={{ color: cot.vencedora ? '#10b981' : 'var(--text-primary)' }}>
                              R$ {cot.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                          )}
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => toggleVencedora(cot)}
                              className="p-1 rounded text-xs hover:bg-[var(--bg-secondary)]"
                              title={cot.vencedora ? 'Remover vencedora' : 'Marcar como vencedora'}
                              style={{ color: cot.vencedora ? '#10b981' : 'var(--text-secondary)' }}
                            >
                              <Check size={13} />
                            </button>
                            <button onClick={() => deleteCot(cot.id)} className="p-1 rounded hover:bg-red-500/10">
                              <Trash2 size={13} style={{ color: 'var(--danger)' }} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {req.observacao && (
                      <p className="px-4 py-2 text-xs border-t" style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}>
                        <strong>Obs:</strong> {req.observacao}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal — Nova Requisição */}
      <Modal open={reqModal} onClose={() => setReqModal(false)} title="Nova Requisição de Compra" size="lg">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Número (ex: RC-001)" value={reqForm.numero} onChange={e => setReqForm(f => ({ ...f, numero: e.target.value }))} placeholder={gerarNumero()} />
            <Input label="Data" type="date" value={reqForm.data_solicitacao} onChange={e => setReqForm(f => ({ ...f, data_solicitacao: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Solicitante" value={reqForm.solicitante} onChange={e => setReqForm(f => ({ ...f, solicitante: e.target.value }))} placeholder="Nome ou setor" />
            <div className="space-y-1">
              <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Status</label>
              <select className="w-full px-3 py-2 rounded-lg text-sm border outline-none" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                value={reqForm.status} onChange={e => setReqForm(f => ({ ...f, status: e.target.value as Requisicao['status'] }))}>
                {Object.entries(STATUS_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
              </select>
            </div>
          </div>
          <Input label="Observação" value={reqForm.observacao} onChange={e => setReqForm(f => ({ ...f, observacao: e.target.value }))} placeholder="Motivo, urgência..." />

          {/* Itens inline */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Itens</p>
              <button onClick={() => setReqItems(i => [...i, { ...EMPTY_ITEM }])} className="text-xs" style={{ color: 'var(--accent)' }}>+ item</button>
            </div>
            {reqItems.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-5">
                  <input className="w-full px-2 py-1.5 text-sm rounded-lg border outline-none" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    placeholder="Descrição *"
                    value={item.descricao}
                    onChange={e => setReqItems(its => its.map((it, i) => i === idx ? { ...it, descricao: e.target.value } : it))}
                  />
                </div>
                <div className="col-span-2">
                  <input type="number" className="w-full px-2 py-1.5 text-sm rounded-lg border outline-none text-center" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    placeholder="Qtd"
                    value={item.quantidade}
                    onChange={e => setReqItems(its => its.map((it, i) => i === idx ? { ...it, quantidade: e.target.value } : it))}
                  />
                </div>
                <div className="col-span-2">
                  <input className="w-full px-2 py-1.5 text-sm rounded-lg border outline-none" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    placeholder="UN"
                    value={item.unidade}
                    onChange={e => setReqItems(its => its.map((it, i) => i === idx ? { ...it, unidade: e.target.value } : it))}
                  />
                </div>
                <div className="col-span-2 flex items-center gap-1">
                  <input type="checkbox" id={`urg-${idx}`} checked={item.urgente}
                    onChange={e => setReqItems(its => its.map((it, i) => i === idx ? { ...it, urgente: e.target.checked } : it))}
                  />
                  <label htmlFor={`urg-${idx}`} className="text-xs" style={{ color: 'var(--text-secondary)' }}>Urgente</label>
                </div>
                <div className="col-span-1 flex justify-end">
                  {reqItems.length > 1 && (
                    <button onClick={() => setReqItems(its => its.filter((_, i) => i !== idx))} className="p-1 rounded hover:bg-red-500/10">
                      <Trash2 size={13} style={{ color: 'var(--danger)' }} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setReqModal(false)}>Cancelar</Button>
            <Button className="flex-1" loading={savingReq} onClick={saveReq}>Criar Requisição</Button>
          </div>
        </div>
      </Modal>

      {/* Modal — Cotação */}
      <Modal open={!!cotModal} onClose={() => setCotModal(null)} title="Adicionar Cotação" size="md">
        <div className="flex flex-col gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Fornecedor cadastrado</label>
            <select className="w-full px-3 py-2 rounded-lg text-sm border outline-none" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              value={cotForm.fornecedor_id} onChange={e => setCotForm(f => ({ ...f, fornecedor_id: e.target.value }))}>
              <option value="">Digitar nome manualmente →</option>
              {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
          {!cotForm.fornecedor_id && (
            <Input label="Nome do fornecedor" value={cotForm.fornecedor_nome} onChange={e => setCotForm(f => ({ ...f, fornecedor_nome: e.target.value }))} placeholder="Ex: Leroy Merlin, Ferreira Brás..." />
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input label="Data cotação" type="date" value={cotForm.data_cotacao} onChange={e => setCotForm(f => ({ ...f, data_cotacao: e.target.value }))} />
            <Input label="Validade" type="date" value={cotForm.validade} onChange={e => setCotForm(f => ({ ...f, validade: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Valor total (R$)</label>
            <input type="number" step="0.01" min="0" className="w-full px-3 py-2 rounded-lg text-sm border outline-none" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              placeholder="0,00"
              value={cotForm.valor_total}
              onChange={e => setCotForm(f => ({ ...f, valor_total: e.target.value }))}
            />
          </div>
          <Input label="Observação" value={cotForm.observacao} onChange={e => setCotForm(f => ({ ...f, observacao: e.target.value }))} placeholder="Condições de pagamento, prazo de entrega..." />
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setCotModal(null)}>Cancelar</Button>
            <Button className="flex-1" loading={savingCot} onClick={saveCot}>Salvar Cotação</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
