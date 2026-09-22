'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  atualizarLancamentoFinanceiro,
  criarLancamentoFinanceiro,
  excluirLancamentoFinanceiro,
  listarLancamentosFinanceiros,
  marcarLancamentoRealizado,
  obterResumoFinanceiroDoProcesso,
  NATUREZAS_LANCAMENTO,
  STATUS_LANCAMENTO,
  type LancamentoFinanceiro,
  type NaturezaLancamento,
  type ResumoFinanceiroProcesso,
  type StatusLancamento,
} from '@/lib/processo-financeiro'
import { Carregando, PrecisaSessao, Vazio } from './comuns'

// Sugestões de categoria — texto livre (datalist), NUNCA um enum: o usuário
// pode digitar qualquer coisa. Lista de exemplos do Investidor, sem nenhum
// comportamento derivado do texto escolhido.
const CATEGORIAS_SUGERIDAS = [
  'Aquisição / Arrematação', 'Leiloeiro', 'ITBI', 'Registro / Escritura',
  'Condomínio', 'IPTU', 'Reforma', 'Jurídico', 'Corretagem', 'Impostos', 'Venda', 'Outros',
]

const STATUS_ROTULO: Record<StatusLancamento, string> = { PENDENTE: 'Pendente', REALIZADO: 'Realizado', CANCELADO: 'Cancelado' }
const STATUS_COR: Record<StatusLancamento, string> = {
  PENDENTE: 'text-amber-200/85 bg-amber-300/10 border-amber-300/25',
  REALIZADO: 'text-emerald-200/85 bg-emerald-300/10 border-emerald-300/25',
  CANCELADO: 'text-white/40 bg-white/[0.03] border-white/10',
}

function formatarMoeda(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function formatarData(v: string | null): string {
  if (!v) return '—'
  return new Date(`${v.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR')
}

type FormState = {
  natureza: NaturezaLancamento
  categoria: string
  descricao: string
  valor: string
  status: StatusLancamento
  data_lancamento: string
  data_realizacao: string
  comprovante_url: string
  observacao: string
}

const FORM_VAZIO: FormState = {
  natureza: 'SAIDA', categoria: '', descricao: '', valor: '', status: 'PENDENTE',
  data_lancamento: '', data_realizacao: '', comprovante_url: '', observacao: '',
}

// Financeiro Real do Processo — para Processos do template Investidor
// (investimento_imobiliario_investidor). Fonte própria (lib/processo-financeiro),
// distinta do Orçamento/compra_itens (Financeiro de obra) e de
// prospeccao_cenarios (viabilidade/simulação). Sem dashboard, sem gráfico —
// resumo simples + lista + CRUD.
export function FinanceiroInvestidor({ processoId }: { processoId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [semSessao, setSemSessao] = useState(false)
  const [lancamentos, setLancamentos] = useState<LancamentoFinanceiro[] | null>(null)
  const [resumo, setResumo] = useState<ResumoFinanceiroProcesso | null>(null)
  const [erro, setErro] = useState('')
  const [criando, setCriando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(FORM_VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [ocupadoId, setOcupadoId] = useState<string | null>(null)

  const carregar = async () => {
    try {
      const [lista, res] = await Promise.all([
        listarLancamentosFinanceiros(supabase, processoId),
        obterResumoFinanceiroDoProcesso(supabase, processoId),
      ])
      setLancamentos(lista)
      setResumo(res)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar o Financeiro.')
      setLancamentos([])
    }
  }

  useEffect(() => {
    let vivo = true
    void (async () => {
      const { data } = await supabase.auth.getUser()
      if (!vivo) return
      if (!data.user) { setSemSessao(true); setLancamentos([]); return }
      try {
        const [lista, res] = await Promise.all([
          listarLancamentosFinanceiros(supabase, processoId),
          obterResumoFinanceiroDoProcesso(supabase, processoId),
        ])
        if (vivo) { setLancamentos(lista); setResumo(res) }
      } catch {
        if (vivo) setLancamentos([])
      }
    })()
    return () => { vivo = false }
  }, [supabase, processoId])

  function abrirNovo() {
    setForm(FORM_VAZIO)
    setEditandoId(null)
    setCriando(true)
    setErro('')
  }

  function abrirEdicao(l: LancamentoFinanceiro) {
    setForm({
      natureza: l.natureza,
      categoria: l.categoria,
      descricao: l.descricao ?? '',
      valor: String(l.valor),
      status: l.status,
      data_lancamento: l.data_lancamento ?? '',
      data_realizacao: l.data_realizacao ?? '',
      comprovante_url: l.comprovante_url ?? '',
      observacao: l.observacao ?? '',
    })
    setCriando(false)
    setEditandoId(l.id)
    setErro('')
  }

  function fecharFormulario() {
    setCriando(false)
    setEditandoId(null)
  }

  async function salvar() {
    const categoria = form.categoria.trim()
    if (!categoria) { setErro('Dê uma categoria ao lançamento.'); return }
    const valor = Number(form.valor.replace(',', '.'))
    if (!(valor > 0)) { setErro('Informe um valor maior que zero.'); return }

    setSalvando(true)
    setErro('')
    const payload = {
      natureza: form.natureza,
      categoria,
      descricao: form.descricao.trim() || null,
      valor,
      status: form.status,
      data_lancamento: form.data_lancamento || null,
      data_realizacao: form.data_realizacao || null,
      comprovante_url: form.comprovante_url.trim() || null,
      observacao: form.observacao.trim() || null,
    }
    try {
      if (editandoId) {
        await atualizarLancamentoFinanceiro(supabase, editandoId, payload)
      } else {
        await criarLancamentoFinanceiro(supabase, { processo_id: processoId, ...payload })
      }
      fecharFormulario()
      await carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar o lançamento.')
    } finally {
      setSalvando(false)
    }
  }

  async function alternarRealizado(l: LancamentoFinanceiro) {
    setOcupadoId(l.id)
    setErro('')
    try {
      if (l.status === 'REALIZADO') {
        await atualizarLancamentoFinanceiro(supabase, l.id, { status: 'PENDENTE' })
      } else {
        await marcarLancamentoRealizado(supabase, l.id)
      }
      await carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível atualizar o status.')
    } finally {
      setOcupadoId(null)
    }
  }

  async function excluir(id: string) {
    if (!confirm('Excluir este lançamento? Essa ação não pode ser desfeita.')) return
    setOcupadoId(id)
    setErro('')
    try {
      await excluirLancamentoFinanceiro(supabase, id)
      if (editandoId === id) fecharFormulario()
      await carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível excluir o lançamento.')
    } finally {
      setOcupadoId(null)
    }
  }

  if (semSessao) return <PrecisaSessao modulo="O Financeiro deste Processo" />
  if (lancamentos === null || resumo === null) return <Carregando texto="Carregando o Financeiro…" />

  const formulario = (criando || editandoId) && (
    <div className="rounded-2xl border border-cyan-200/20 bg-cyan-300/[0.06] p-4">
      <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-0.5 w-fit">
        {NATUREZAS_LANCAMENTO.map(n => (
          <button
            key={n}
            type="button"
            onClick={() => setForm(f => ({ ...f, natureza: n }))}
            className={'rounded-full px-3 py-1 text-[12px] font-medium transition ' + (form.natureza === n
              ? n === 'ENTRADA' ? 'bg-emerald-300/20 text-emerald-100' : 'bg-red-300/20 text-red-100'
              : 'text-white/50 hover:text-white/80')}
          >
            {n === 'ENTRADA' ? 'Entrada' : 'Saída'}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="text-[11px] uppercase tracking-[0.12em] text-cyan-200/60">Categoria</label>
          <input
            list="categorias-sugeridas"
            value={form.categoria}
            onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
            placeholder="Ex.: Reforma"
            disabled={salvando}
            className="mt-1.5 w-full rounded-xl border border-white/12 bg-black/25 px-3 py-2 text-[14px] text-white/92 outline-none placeholder:text-white/35 focus:border-cyan-200/40"
          />
          <datalist id="categorias-sugeridas">
            {CATEGORIAS_SUGERIDAS.map(c => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-[0.12em] text-cyan-200/60">Valor (R$)</label>
          <input
            inputMode="decimal"
            value={form.valor}
            onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
            placeholder="0,00"
            disabled={salvando}
            className="mt-1.5 w-full rounded-xl border border-white/12 bg-black/25 px-3 py-2 text-[14px] text-white/92 outline-none placeholder:text-white/35 focus:border-cyan-200/40"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-[11px] uppercase tracking-[0.12em] text-cyan-200/60">Descrição</label>
          <input
            value={form.descricao}
            onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
            placeholder="Opcional"
            disabled={salvando}
            className="mt-1.5 w-full rounded-xl border border-white/12 bg-black/25 px-3 py-2 text-[14px] text-white/92 outline-none placeholder:text-white/35 focus:border-cyan-200/40"
          />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-[0.12em] text-cyan-200/60">Status</label>
          <select
            value={form.status}
            onChange={e => setForm(f => ({ ...f, status: e.target.value as StatusLancamento }))}
            disabled={salvando}
            className="mt-1.5 w-full rounded-xl border border-white/12 bg-black/25 px-3 py-2 text-[14px] text-white/92 outline-none focus:border-cyan-200/40"
          >
            {STATUS_LANCAMENTO.map(s => <option key={s} value={s}>{STATUS_ROTULO[s]}</option>)}
          </select>
        </div>
        <div />
        <div>
          <label className="text-[11px] uppercase tracking-[0.12em] text-cyan-200/60">Data de competência</label>
          <input
            type="date"
            value={form.data_lancamento}
            onChange={e => setForm(f => ({ ...f, data_lancamento: e.target.value }))}
            disabled={salvando}
            className="mt-1.5 w-full rounded-xl border border-white/12 bg-black/25 px-3 py-2 text-[14px] text-white/92 outline-none focus:border-cyan-200/40 [color-scheme:dark]"
          />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-[0.12em] text-cyan-200/60">Data de realização</label>
          <input
            type="date"
            value={form.data_realizacao}
            onChange={e => setForm(f => ({ ...f, data_realizacao: e.target.value }))}
            disabled={salvando}
            className="mt-1.5 w-full rounded-xl border border-white/12 bg-black/25 px-3 py-2 text-[14px] text-white/92 outline-none focus:border-cyan-200/40 [color-scheme:dark]"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-[11px] uppercase tracking-[0.12em] text-cyan-200/60">Comprovante (link)</label>
          <input
            value={form.comprovante_url}
            onChange={e => setForm(f => ({ ...f, comprovante_url: e.target.value }))}
            placeholder="Opcional — link do comprovante/evidência"
            disabled={salvando}
            className="mt-1.5 w-full rounded-xl border border-white/12 bg-black/25 px-3 py-2 text-[14px] text-white/92 outline-none placeholder:text-white/35 focus:border-cyan-200/40"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-[11px] uppercase tracking-[0.12em] text-cyan-200/60">Observação</label>
          <input
            value={form.observacao}
            onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))}
            placeholder="Opcional"
            disabled={salvando}
            className="mt-1.5 w-full rounded-xl border border-white/12 bg-black/25 px-3 py-2 text-[14px] text-white/92 outline-none placeholder:text-white/35 focus:border-cyan-200/40"
          />
        </div>
      </div>

      {erro && <p className="mt-2 text-[12.5px] text-red-300/85">{erro}</p>}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={salvar}
          disabled={salvando}
          className="rounded-full bg-cyan-300/90 px-4 py-1.5 text-[13px] font-medium text-slate-950 outline-none transition hover:bg-cyan-200 disabled:opacity-50"
        >
          {salvando ? 'Salvando…' : editandoId ? 'Salvar alterações' : 'Adicionar lançamento'}
        </button>
        <button
          type="button"
          onClick={fecharFormulario}
          disabled={salvando}
          className="rounded-full px-3 py-1.5 text-[13px] text-white/55 outline-none transition hover:text-white/85"
        >
          Cancelar
        </button>
        {editandoId && (
          <button
            type="button"
            onClick={() => excluir(editandoId)}
            disabled={salvando || ocupadoId === editandoId}
            className="ml-auto rounded-full px-3 py-1.5 text-[13px] text-red-300/75 outline-none transition hover:text-red-300"
          >
            Excluir
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
          <div className="text-[10.5px] uppercase tracking-[0.1em] text-white/40">Saídas realizadas</div>
          <div className="mt-1 text-[15px] font-semibold text-red-200/90">{formatarMoeda(resumo.saidas_realizadas)}</div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
          <div className="text-[10.5px] uppercase tracking-[0.1em] text-white/40">Entradas realizadas</div>
          <div className="mt-1 text-[15px] font-semibold text-emerald-200/90">{formatarMoeda(resumo.entradas_realizadas)}</div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
          <div className="text-[10.5px] uppercase tracking-[0.1em] text-white/40">Saldo realizado</div>
          <div className={'mt-1 text-[15px] font-semibold ' + (resumo.saldo_realizado < 0 ? 'text-red-200/90' : 'text-white/92')}>
            {formatarMoeda(resumo.saldo_realizado)}
          </div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
          <div className="text-[10.5px] uppercase tracking-[0.1em] text-white/40">Pendências</div>
          <div className="mt-1 text-[15px] font-semibold text-amber-200/90">
            {formatarMoeda(resumo.saidas_pendentes)} <span className="text-[11px] text-white/40">saída</span>
          </div>
          {resumo.entradas_pendentes > 0 && (
            <div className="text-[11px] text-white/40">+ {formatarMoeda(resumo.entradas_pendentes)} entrada</div>
          )}
        </div>
      </div>

      {!criando && !editandoId && (
        <button
          type="button"
          onClick={abrirNovo}
          className="flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-3 text-[13px] font-medium text-cyan-100/80 outline-none transition hover:border-cyan-200/30 hover:bg-white/[0.05] hover:text-white"
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
          Novo lançamento
        </button>
      )}

      {formulario}

      {erro && !criando && !editandoId && (
        <p className="rounded-xl border border-red-300/25 bg-red-300/[0.06] px-3 py-2 text-[12.5px] text-red-200/90">{erro}</p>
      )}

      {lancamentos.length === 0 ? (
        <Vazio titulo="Nenhum lançamento ainda" descricao="Adicione o primeiro lançamento acima — entradas e saídas reais deste Processo." />
      ) : (
        <div className="flex flex-col gap-2">
          {lancamentos.map(l => (
            <button
              key={l.id}
              type="button"
              onClick={() => abrirEdicao(l)}
              className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.05] p-3.5 text-left outline-none transition hover:border-cyan-200/30 hover:bg-white/[0.08]"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={'text-[11px] font-semibold ' + (l.natureza === 'ENTRADA' ? 'text-emerald-300/85' : 'text-red-300/85')}>
                    {l.natureza === 'ENTRADA' ? '+' : '−'}
                  </span>
                  <span className="truncate text-[14px] font-semibold text-white/92">{l.categoria}</span>
                </div>
                <div className="mt-0.5 truncate text-[12px] text-white/45">
                  {[formatarData(l.data_lancamento), l.descricao].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={'text-[13.5px] font-semibold ' + (l.natureza === 'ENTRADA' ? 'text-emerald-200/90' : 'text-white/85')}>
                  {formatarMoeda(l.valor)}
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={e => { e.stopPropagation(); alternarRealizado(l) }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); alternarRealizado(l) } }}
                  title={l.status === 'REALIZADO' ? 'Marcar como pendente' : 'Marcar como realizado'}
                  className={'rounded-full border px-2 py-0.5 text-[10.5px] font-medium outline-none ' + STATUS_COR[l.status] + (ocupadoId === l.id ? ' opacity-50' : ' cursor-pointer')}
                >
                  {STATUS_ROTULO[l.status]}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
