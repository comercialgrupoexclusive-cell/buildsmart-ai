'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart3, Calendar, ClipboardList, DollarSign, Eye, Landmark, Plus, Trash2, WalletCards } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Etapa, FonteRecursoTipo, Medicao, ObraFonteRecurso, ObraReembolso, ReembolsoStatus } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import { TODOS_ORCAMENTOS } from '@/lib/obra-orcamento-context'
import { ObraFinanciamentoMedicao } from './ObraFinanciamentoMedicao'

type InnerTab = 'visao' | 'orcamento' | 'cronograma' | 'execucao' | 'acompanhamento' | 'fontes'

const TABS: { id: InnerTab; label: string; icon: typeof Eye }[] = [
  { id: 'visao', label: 'Visão Geral', icon: Eye },
  { id: 'orcamento', label: 'Orçamento', icon: DollarSign },
  { id: 'cronograma', label: 'Cronograma', icon: Calendar },
  { id: 'execucao', label: 'Execução', icon: ClipboardList },
  { id: 'acompanhamento', label: 'Acompanhamento', icon: BarChart3 },
  { id: 'fontes', label: 'Fontes & Reembolsos', icon: WalletCards },
]

const FONTES: { tipo: FonteRecursoTipo; label: string }[] = [
  { tipo: 'recursos_proprios', label: 'Recursos próprios' },
  { tipo: 'financiamento', label: 'Financiamento bancário' },
  { tipo: 'fgts', label: 'FGTS' },
]

const STATUS: { value: ReembolsoStatus; label: string }[] = [
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'solicitado', label: 'Solicitado' },
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'recebido', label: 'Recebido' },
  { value: 'recusado', label: 'Recusado' },
]

const emptyForm = {
  descricao: '', fonte_id: '', etapa_id: '', medicao_id: '', valor_solicitado: '',
  data_solicitacao: '', observacao: '',
}

function fmtInput(v: number | string | null | undefined): string {
  const n = Number(v)
  if (!n && n !== 0) return ''
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function ObraFinanciamento({ obraId, orcamentoId, orcamentoIds }: { obraId: string; orcamentoId: string; orcamentoIds: string[] }) {
  const supabase = createClient()
  const [innerTab, setInnerTab] = useState<InnerTab>('visao')
  const [fontes, setFontes] = useState<ObraFonteRecurso[]>([])
  const [reembolsos, setReembolsos] = useState<ObraReembolso[]>([])
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [medicoes, setMedicoes] = useState<Medicao[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const carregar = useCallback(async () => {
    setLoading(true)
    const [fontesRes, reembolsosRes, etapasRes, medicoesRes] = await Promise.all([
      supabase.from('obra_fontes_recursos').select('*').eq('obra_id', obraId).order('tipo'),
      supabase.from('obra_reembolsos').select('*').eq('obra_id', obraId).order('created_at', { ascending: false }),
      supabase.from('etapas').select('*').eq('obra_id', obraId).order('ordem'),
      supabase.from('medicoes').select('*').eq('obra_id', obraId).order('periodo_fim', { ascending: false }),
    ])
    setFontes((fontesRes.data || []) as ObraFonteRecurso[])
    setReembolsos((reembolsosRes.data || []) as ObraReembolso[])
    setEtapas((etapasRes.data || []) as Etapa[])
    setMedicoes((medicoesRes.data || []) as Medicao[])
    setLoading(false)
  }, [obraId, supabase])

  useEffect(() => { Promise.resolve().then(carregar) }, [carregar])

  const isTodos = orcamentoId === TODOS_ORCAMENTOS
  const fontesVisiveis = useMemo(() => fontes.filter(f => isTodos ? (!f.orcamento_id || orcamentoIds.includes(f.orcamento_id)) : f.orcamento_id === orcamentoId), [fontes, isTodos, orcamentoId, orcamentoIds])
  const reembolsosVisiveis = useMemo(() => reembolsos.filter(r => isTodos ? (!r.orcamento_id || orcamentoIds.includes(r.orcamento_id)) : r.orcamento_id === orcamentoId), [reembolsos, isTodos, orcamentoId, orcamentoIds])
  const medicoesVisiveis = useMemo(() => medicoes.filter(m => isTodos ? (!m.orcamento_id || orcamentoIds.includes(m.orcamento_id)) : m.orcamento_id === orcamentoId), [medicoes, isTodos, orcamentoId, orcamentoIds])
  const fontePorTipo = useMemo(() => new Map(fontesVisiveis.map(f => [f.tipo, f])), [fontesVisiveis])
  const totalPrevisto = fontesVisiveis.reduce((sum, f) => sum + Number(f.valor_previsto || 0), 0)
  const totalSolicitado = reembolsosVisiveis.reduce((sum, r) => sum + Number(r.valor_solicitado || 0), 0)
  const totalRecebido = reembolsosVisiveis.reduce((sum, r) => sum + Number(r.valor_recebido || 0), 0)

  async function salvarFonte(tipo: FonteRecursoTipo, value: string) {
    if (isTodos || !orcamentoId) return
    const cleaned = value.replace(/\./g, '').replace(',', '.')
    const valor = Math.max(0, Number(cleaned) || 0)
    const existente = fontePorTipo.get(tipo)
    const payload = { obra_id: obraId, orcamento_id: orcamentoId || null, tipo, valor_previsto: valor, updated_at: new Date().toISOString() }
    const query = existente
      ? supabase.from('obra_fontes_recursos').update(payload).eq('id', existente.id)
      : supabase.from('obra_fontes_recursos').insert(payload)
    const { data, error } = await query.select().single()
    if (error) return alert(`Não foi possível salvar a fonte: ${error.message}`)
    if (data) setFontes(prev => [...prev.filter(f => f.id !== (data as ObraFonteRecurso).id), data as ObraFonteRecurso])
    if (!existente && data) setForm(prev => ({ ...prev, fonte_id: prev.fonte_id || data.id }))
  }

  async function criarReembolso() {
    if (isTodos || !orcamentoId || !form.descricao.trim() || !(Number(form.valor_solicitado) > 0)) return
    setSaving(true)
    const { data, error } = await supabase.from('obra_reembolsos').insert({
      obra_id: obraId, orcamento_id: orcamentoId || null,
      descricao: form.descricao.trim(), fonte_id: form.fonte_id || null,
      etapa_id: form.etapa_id || null, medicao_id: form.medicao_id || null,
      valor_solicitado: Number(form.valor_solicitado),
      data_solicitacao: form.data_solicitacao || null,
      observacao: form.observacao.trim() || null,
    }).select().single()
    setSaving(false)
    if (error) return alert(`Não foi possível criar o reembolso: ${error.message}`)
    if (data) setReembolsos(prev => [data as ObraReembolso, ...prev])
    setForm(emptyForm)
    setShowForm(false)
  }

  function alterarLocal(id: string, patch: Partial<ObraReembolso>) {
    setReembolsos(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
  }

  async function salvarReembolso(id: string, patch: Partial<ObraReembolso>) {
    alterarLocal(id, patch)
    await supabase.from('obra_reembolsos').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
  }

  async function remover(id: string) {
    if (!confirm('Excluir este reembolso?')) return
    const { error } = await supabase.from('obra_reembolsos').delete().eq('id', id)
    if (error) return alert(`Não foi possível excluir: ${error.message}`)
    setReembolsos(prev => prev.filter(r => r.id !== id))
  }

  if (loading) return <div className="flex justify-center py-16"><div className="w-7 h-7 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} /></div>

  const delegatedViews = ['visao', 'orcamento', 'cronograma', 'execucao', 'acompanhamento'] as const

  return (
    <div className="flex flex-col gap-4 pb-16">
      <div className="flex items-center gap-1 p-1 rounded-lg overflow-x-auto max-w-full" style={{ background: 'var(--bg-secondary)' }}>
        {TABS.map(t => {
          const Ic = t.icon
          return (
            <button key={t.id} onClick={() => setInnerTab(t.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all whitespace-nowrap"
              style={innerTab === t.id ? { background: 'var(--accent)', color: 'white' } : { color: 'var(--text-secondary)' }}>
              <Ic size={14} /> <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.label.split(' ')[0]}</span>
            </button>
          )
        })}
      </div>

      {(delegatedViews as readonly string[]).includes(innerTab) && (
        <ObraFinanciamentoMedicao obraId={obraId} orcamentoId={orcamentoId} orcamentoIds={orcamentoIds} view={innerTab as 'visao' | 'orcamento' | 'cronograma' | 'execucao' | 'acompanhamento'} />
      )}

      {innerTab === 'fontes' && <>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {FONTES.map(({ tipo, label }) => {
            const fonte = fontePorTipo.get(tipo)
            return (
              <label key={`${orcamentoId || 'geral'}-${tipo}`} className="card p-4 block">
                <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</span>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>R$</span>
                  <input type="text" defaultValue={fmtInput(fonte?.valor_previsto)} disabled={isTodos}
                    onFocus={e => e.target.select()}
                    onBlur={e => salvarFonte(tipo, e.target.value)} placeholder="0,00"
                    className="input-base w-full text-right font-semibold" />
                </div>
              </label>
            )
          })}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Resumo label="Total de recursos" valor={totalPrevisto} />
          <Resumo label="Reembolso solicitado" valor={totalSolicitado} />
          <Resumo label="Recebido" valor={totalRecebido} destaque />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Reembolsos do banco</h2>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Acompanhe da solicitação até o recebimento.</p>
          </div>
          <button onClick={() => setShowForm(v => !v)} disabled={isTodos || !orcamentoId} className="btn-primary inline-flex items-center gap-2 px-3 py-2 text-sm disabled:opacity-50"><Plus size={15} /> Novo</button>
        </div>

        {showForm && (
          <div className="card p-4 flex flex-col gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Descrição"><input value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} className="input-base w-full" placeholder="Ex.: Medição da infraestrutura" /></Field>
              <Field label="Valor solicitado"><input type="number" min={0} step="0.01" value={form.valor_solicitado} onChange={e => setForm(f => ({ ...f, valor_solicitado: e.target.value }))} className="input-base w-full" /></Field>
              <Field label="Fonte"><select value={form.fonte_id} onChange={e => setForm(f => ({ ...f, fonte_id: e.target.value }))} className="input-base w-full"><option value="">Não definida</option>{fontes.map(f => <option key={f.id} value={f.id}>{FONTES.find(x => x.tipo === f.tipo)?.label}</option>)}</select></Field>
              <Field label="Etapa"><select value={form.etapa_id} onChange={e => setForm(f => ({ ...f, etapa_id: e.target.value }))} className="input-base w-full"><option value="">Todas / não definida</option>{etapas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></Field>
              <Field label="Boletim de medição"><select value={form.medicao_id} onChange={e => setForm(f => ({ ...f, medicao_id: e.target.value }))} className="input-base w-full"><option value="">Sem vínculo</option>{medicoesVisiveis.map(m => <option key={m.id} value={m.id}>{m.nome || `Medição ${m.numero || ''}`}</option>)}</select></Field>
              <Field label="Data da solicitação"><input type="date" value={form.data_solicitacao} onChange={e => setForm(f => ({ ...f, data_solicitacao: e.target.value }))} className="input-base w-full" /></Field>
            </div>
            <Field label="Observação"><input value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} className="input-base w-full" /></Field>
            <div className="flex justify-end gap-2"><button onClick={() => setShowForm(false)} className="px-3 py-2 text-sm">Cancelar</button><button onClick={criarReembolso} disabled={saving} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">{saving ? 'Salvando...' : 'Criar reembolso'}</button></div>
          </div>
        )}

        {reembolsosVisiveis.length === 0 ? (
          <div className="card p-10 text-center"><Landmark size={28} className="mx-auto mb-2" style={{ color: 'var(--text-secondary)' }} /><p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhum reembolso cadastrado.</p></div>
        ) : reembolsosVisiveis.map(r => (
          <div key={r.id} className="card p-4 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--bg-secondary)' }}><WalletCards size={17} style={{ color: 'var(--accent)' }} /></div>
              <div className="flex-1 min-w-0"><p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{r.descricao}</p><p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Solicitado {formatCurrency(Number(r.valor_solicitado))}</p></div>
              <select value={r.status} disabled={isTodos} onChange={e => salvarReembolso(r.id, { status: e.target.value as ReembolsoStatus })} className="input-base text-xs py-1 w-28 disabled:opacity-60">{STATUS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
              {!isTodos && <button onClick={() => remover(r.id)} className="p-2" title="Excluir"><Trash2 size={14} style={{ color: 'var(--danger)' }} /></button>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <MoneyEdit label="Aprovado" value={r.valor_aprovado} disabled={isTodos} onBlur={v => salvarReembolso(r.id, { valor_aprovado: v })} />
              <MoneyEdit label="Recebido" value={r.valor_recebido} disabled={isTodos} onBlur={v => salvarReembolso(r.id, { valor_recebido: v })} />
              <Field label="Data do recebimento"><input type="date" value={r.data_recebimento || ''} disabled={isTodos} onChange={e => alterarLocal(r.id, { data_recebimento: e.target.value || null })} onBlur={e => salvarReembolso(r.id, { data_recebimento: e.target.value || null })} className="input-base w-full disabled:opacity-60" /></Field>
            </div>
          </div>
        ))}
      </>}
    </div>
  )
}

function Resumo({ label, valor, destaque = false }: { label: string; valor: number; destaque?: boolean }) {
  return <div className="card p-3 min-w-0"><p className="text-[10px] sm:text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{label}</p><p className="text-sm sm:text-lg font-bold truncate" style={{ color: destaque ? 'var(--success)' : 'var(--text-primary)' }}>{formatCurrency(valor)}</p></div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>{label}</span>{children}</label>
}

function MoneyEdit({ label, value, disabled = false, onBlur }: { label: string; value: number; disabled?: boolean; onBlur: (value: number) => void }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-1">
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>R$</span>
        <input type="text" defaultValue={fmtInput(value)} disabled={disabled}
          onFocus={e => e.target.select()}
          onBlur={e => {
            const cleaned = e.target.value.replace(/\./g, '').replace(',', '.')
            const n = Math.max(0, Number(cleaned) || 0)
            e.target.value = fmtInput(n)
            onBlur(n)
          }}
          className="input-base w-full text-right disabled:opacity-60" />
      </div>
    </Field>
  )
}
