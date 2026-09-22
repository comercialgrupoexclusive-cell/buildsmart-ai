'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  criarProcesso,
  listarProcessos,
  listarTemplatesDisponiveis,
  vincularProcessoAOperacao,
  desvincularProcessoDaOperacao,
  type Processo,
  type ProcessoTemplateKey,
} from '@/lib/processo'
import {
  atualizarOperacao,
  criarOperacao,
  listarOperacoes,
  ETAPAS_SEED_INVESTIDOR,
  type Operacao,
} from '@/lib/operacoes'
import { Carregando, PrecisaSessao, Vazio } from './comuns'
import { OperacaoKanban } from './OperacaoKanban'

const TEMPLATES = listarTemplatesDisponiveis()

const STATUS_ROTULO: Record<string, string> = {
  ACTIVE: 'Ativo',
  ON_HOLD: 'Em espera',
  COMPLETED: 'Concluído',
  ARCHIVED: 'Arquivado',
}

// Lista os Processos reais do Motor de Processo (`processos`). Abrir um deles
// troca o contexto do Dock para as abas daquele Processo — é o mesmo dado que
// /processos usa, sem uma segunda listagem própria.
//
// Compatibilização Funcional 01 — acrescenta o agrupador Operação acima dos
// Processos: um seletor no topo e, quando uma Operação está selecionada, o
// Kanban por etapas configuráveis dela. A lista plana abaixo NUNCA some — é
// o fallback exigido e continua sendo a mesma Action/dado de sempre.
export function TelaProcessos({ onAbrir }: { onAbrir: (p: Processo) => void }) {
  const supabase = useMemo(() => createClient(), [])
  const [processos, setProcessos] = useState<Processo[] | null>(null)
  const [semSessao, setSemSessao] = useState(false)
  const [criando, setCriando] = useState(false)
  const [nomeNovo, setNomeNovo] = useState('')
  // Tellus R01/C — mesma receita de composição de /processos/novo. Vazio =
  // sem template, que mantém os módulos enabledByDefault do registry.
  const [templateNovo, setTemplateNovo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  // ─── Compatibilização Funcional 01 — Operações ────────────────────────────
  const [operacoes, setOperacoes] = useState<Operacao[] | null>(null)
  const [operacaoId, setOperacaoId] = useState<string | null>(null)
  const [visao, setVisao] = useState<'kanban' | 'lista'>('kanban')
  const [criandoOperacao, setCriandoOperacao] = useState(false)
  const [nomeOperacaoNova, setNomeOperacaoNova] = useState('')
  const [usarTemplateInvestidor, setUsarTemplateInvestidor] = useState(false)
  const [salvandoOperacao, setSalvandoOperacao] = useState(false)
  const [vinculandoId, setVinculandoId] = useState<string | null>(null)
  const [renomeandoOperacao, setRenomeandoOperacao] = useState(false)
  const [nomeOperacaoEdit, setNomeOperacaoEdit] = useState('')
  const [salvandoRenome, setSalvandoRenome] = useState(false)

  const carregar = async () => {
    try {
      const lista = await listarProcessos(supabase)
      setProcessos(lista)
    } catch {
      setProcessos([])
    }
  }

  const carregarOperacoes = async () => {
    try {
      const lista = await listarOperacoes(supabase)
      setOperacoes(lista)
    } catch {
      setOperacoes([])
    }
  }

  useEffect(() => {
    let vivo = true
    void (async () => {
      const { data } = await supabase.auth.getUser()
      if (!vivo) return
      if (!data.user) { setSemSessao(true); setProcessos([]); setOperacoes([]); return }
      try {
        const [lista, listaOp] = await Promise.all([listarProcessos(supabase), listarOperacoes(supabase)])
        if (!vivo) return
        setProcessos(lista)
        setOperacoes(listaOp)
        // Havendo uma única Operação, abrir direto o Kanban dela — evita o
        // usuário não achar o Kanban por ele exigir um passo extra de seleção
        // quando só existe uma Operação de qualquer forma.
        if (listaOp.length === 1) setOperacaoId(listaOp[0].id)
      } catch {
        if (vivo) { setProcessos([]); setOperacoes([]) }
      }
    })()
    return () => { vivo = false }
  }, [supabase])

  async function salvarNovoProcesso() {
    const nome = nomeNovo.trim()
    if (!nome) { setErro('Dê um nome ao Processo.'); return }
    setSalvando(true)
    setErro('')
    try {
      // Mesma Action do motor real (lib/processo) usada por /processos/novo —
      // organização e módulos padrão são resolvidos por ela, nenhuma segunda
      // regra de criação nasce aqui.
      await criarProcesso(supabase, {
        nome,
        template_key: (templateNovo || null) as ProcessoTemplateKey | null,
      })
      setNomeNovo('')
      setTemplateNovo('')
      setCriando(false)
      await carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível criar o Processo.')
    } finally {
      setSalvando(false)
    }
  }

  async function salvarNovaOperacao() {
    const nome = nomeOperacaoNova.trim()
    if (!nome) { setErro('Dê um nome à Operação.'); return }
    setSalvandoOperacao(true)
    setErro('')
    try {
      const { operacao } = await criarOperacao(supabase, {
        nome,
        etapasIniciais: usarTemplateInvestidor ? ETAPAS_SEED_INVESTIDOR : undefined,
      })
      setNomeOperacaoNova('')
      setUsarTemplateInvestidor(false)
      setCriandoOperacao(false)
      await carregarOperacoes()
      setOperacaoId(operacao.id)
      setVisao('kanban')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível criar a Operação.')
    } finally {
      setSalvandoOperacao(false)
    }
  }

  async function salvarRenomeOperacao() {
    if (!operacaoId) return
    const nome = nomeOperacaoEdit.trim()
    if (!nome) { setRenomeandoOperacao(false); return }
    setSalvandoRenome(true)
    try {
      await atualizarOperacao(supabase, operacaoId, { nome })
      await carregarOperacoes()
      setRenomeandoOperacao(false)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível renomear a Operação.')
    } finally {
      setSalvandoRenome(false)
    }
  }

  async function vincular(processoId: string, alvoOperacaoId: string) {
    setVinculandoId(processoId)
    setErro('')
    try {
      await vincularProcessoAOperacao(supabase, processoId, alvoOperacaoId)
      await carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível vincular o Processo.')
    } finally {
      setVinculandoId(null)
    }
  }

  async function desvincular(processoId: string) {
    setVinculandoId(processoId)
    setErro('')
    try {
      await desvincularProcessoDaOperacao(supabase, processoId)
      await carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível desvincular o Processo.')
    } finally {
      setVinculandoId(null)
    }
  }

  if (semSessao) return <PrecisaSessao modulo="A lista de Processos" />
  if (processos === null || operacoes === null) return <Carregando texto="Carregando Processos…" />

  const operacaoSelecionada = operacaoId ? operacoes.find(o => o.id === operacaoId) ?? null : null
  const processosDaOperacao = operacaoId ? processos.filter(p => p.operacao_id === operacaoId) : []

  const seletorOperacao = (
    <div className="flex flex-col gap-2 rounded-2xl border border-white/8 bg-white/[0.02] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="seletor-operacao" className="text-[11px] uppercase tracking-[0.12em] text-cyan-200/60">
          Operação
        </label>
        <select
          id="seletor-operacao"
          value={operacaoId ?? ''}
          onChange={e => { setOperacaoId(e.target.value || null); setVisao('kanban') }}
          className="min-w-0 flex-1 rounded-xl border border-white/12 bg-black/25 px-3 py-1.5 text-[13px] text-white/92 outline-none focus:border-cyan-200/40"
        >
          <option value="">— Nenhuma (ver todos os Processos) —</option>
          {operacoes.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
        </select>
        <button
          type="button"
          onClick={() => setCriandoOperacao(v => !v)}
          className="shrink-0 rounded-full border border-dashed border-white/15 px-3 py-1.5 text-[12.5px] font-medium text-cyan-100/80 outline-none transition hover:border-cyan-200/30 hover:text-white"
        >
          + Nova Operação
        </button>
      </div>

      {criandoOperacao && (
        <div className="rounded-xl border border-cyan-200/20 bg-cyan-300/[0.06] p-3">
          <input
            autoFocus
            value={nomeOperacaoNova}
            onChange={e => setNomeOperacaoNova(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') salvarNovaOperacao() }}
            placeholder="Ex.: Leilões"
            disabled={salvandoOperacao}
            className="w-full rounded-lg border border-white/12 bg-black/25 px-3 py-1.5 text-[13.5px] text-white/92 outline-none placeholder:text-white/35 focus:border-cyan-200/40"
          />
          <label className="mt-2 flex items-center gap-2 text-[12.5px] text-white/65">
            <input
              type="checkbox"
              checked={usarTemplateInvestidor}
              onChange={e => setUsarTemplateInvestidor(e.target.checked)}
              disabled={salvandoOperacao}
              className="size-3.5 accent-cyan-300"
            />
            Começar com as etapas do Investidor (Aquisição, Reforma, À venda…) — só um ponto de partida, dá para editar depois
          </label>
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={salvarNovaOperacao}
              disabled={salvandoOperacao}
              className="rounded-full bg-cyan-300/90 px-3.5 py-1.5 text-[12.5px] font-medium text-slate-950 outline-none transition hover:bg-cyan-200 disabled:opacity-50"
            >
              {salvandoOperacao ? 'Criando…' : 'Criar Operação'}
            </button>
            <button
              type="button"
              onClick={() => { setCriandoOperacao(false); setNomeOperacaoNova(''); setUsarTemplateInvestidor(false) }}
              disabled={salvandoOperacao}
              className="rounded-full px-3 py-1.5 text-[12.5px] text-white/55 outline-none transition hover:text-white/85"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {operacaoSelecionada && renomeandoOperacao && (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={nomeOperacaoEdit}
            onChange={e => setNomeOperacaoEdit(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') salvarRenomeOperacao(); if (e.key === 'Escape') setRenomeandoOperacao(false) }}
            disabled={salvandoRenome}
            className="min-w-0 flex-1 rounded-lg border border-cyan-200/40 bg-black/30 px-3 py-1.5 text-[13px] text-white/92 outline-none"
          />
          <button type="button" onClick={salvarRenomeOperacao} disabled={salvandoRenome} className="shrink-0 rounded-full bg-cyan-300/90 px-3 py-1.5 text-[12px] font-medium text-slate-950 hover:bg-cyan-200 disabled:opacity-50">
            {salvandoRenome ? 'Salvando…' : 'Salvar'}
          </button>
          <button type="button" onClick={() => setRenomeandoOperacao(false)} disabled={salvandoRenome} className="shrink-0 rounded-full px-2.5 py-1.5 text-[12px] text-white/55 hover:text-white/85">
            Cancelar
          </button>
        </div>
      )}

      {operacaoSelecionada && !renomeandoOperacao && (
        <div className="flex items-center justify-between gap-2 text-[12px] text-white/45">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate">{operacaoSelecionada.descricao || 'Sem descrição'}</span>
            <button
              type="button"
              onClick={() => { setNomeOperacaoEdit(operacaoSelecionada.nome); setRenomeandoOperacao(true) }}
              title="Renomear Operação"
              aria-label="Renomear Operação"
              className="shrink-0 rounded p-1 text-white/35 outline-none hover:text-cyan-100/80"
            >
              <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
          </div>
          <div className="flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-0.5">
            <button
              type="button"
              onClick={() => setVisao('kanban')}
              className={'rounded-full px-2.5 py-1 text-[11.5px] font-medium transition ' + (visao === 'kanban' ? 'bg-cyan-300/20 text-white' : 'text-white/50 hover:text-white/80')}
            >
              Kanban
            </button>
            <button
              type="button"
              onClick={() => setVisao('lista')}
              className={'rounded-full px-2.5 py-1 text-[11.5px] font-medium transition ' + (visao === 'lista' ? 'bg-cyan-300/20 text-white' : 'text-white/50 hover:text-white/80')}
            >
              Lista
            </button>
          </div>
        </div>
      )}
    </div>
  )

  const formularioNovo = criando && (
    <div className="rounded-2xl border border-cyan-200/20 bg-cyan-300/[0.06] p-4">
      <label htmlFor="novo-processo-nome" className="text-[11px] uppercase tracking-[0.12em] text-cyan-200/60">
        Nome do Processo
      </label>
      <input
        id="novo-processo-nome"
        autoFocus
        value={nomeNovo}
        onChange={e => { setNomeNovo(e.target.value); setErro('') }}
        onKeyDown={e => { if (e.key === 'Enter') salvarNovoProcesso() }}
        placeholder="Ex.: Residencial Jardim Allegra"
        disabled={salvando}
        className="mt-1.5 w-full rounded-xl border border-white/12 bg-black/25 px-3 py-2 text-[14px] text-white/92 outline-none placeholder:text-white/35 focus:border-cyan-200/40"
      />
      <label htmlFor="novo-processo-template" className="mt-3 block text-[11px] uppercase tracking-[0.12em] text-cyan-200/60">
        Template
      </label>
      <select
        id="novo-processo-template"
        value={templateNovo}
        onChange={e => { setTemplateNovo(e.target.value); setErro('') }}
        disabled={salvando}
        className="mt-1.5 w-full rounded-xl border border-white/12 bg-black/25 px-3 py-2 text-[14px] text-white/92 outline-none focus:border-cyan-200/40"
      >
        <option value="">— Sem template (módulos padrão) —</option>
        {TEMPLATES.map(t => (
          <option key={`${t.key}-v${t.version}`} value={t.key}>{t.label}</option>
        ))}
      </select>

      {erro && <p className="mt-2 text-[12.5px] text-red-300/85">{erro}</p>}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={salvarNovoProcesso}
          disabled={salvando}
          className="rounded-full bg-cyan-300/90 px-4 py-1.5 text-[13px] font-medium text-slate-950 outline-none transition hover:bg-cyan-200 disabled:opacity-50"
        >
          {salvando ? 'Criando…' : 'Criar Processo'}
        </button>
        <button
          type="button"
          onClick={() => { setCriando(false); setErro('') }}
          disabled={salvando}
          className="rounded-full px-3 py-1.5 text-[13px] text-white/55 outline-none transition hover:text-white/85"
        >
          Cancelar
        </button>
      </div>
    </div>
  )

  const botaoNovo = !criando && (
    <button
      type="button"
      onClick={() => setCriando(true)}
      className="flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-3.5 text-[13.5px] font-medium text-cyan-100/80 outline-none transition hover:border-cyan-200/30 hover:bg-white/[0.05] hover:text-white"
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 5v14M5 12h14" />
      </svg>
      Novo Processo
    </button>
  )

  const erroGlobal = erro && !criando && (
    <p className="rounded-xl border border-red-300/25 bg-red-300/[0.06] px-3 py-2 text-[12.5px] text-red-200/90">{erro}</p>
  )

  if (operacaoSelecionada && visao === 'kanban') {
    return (
      <div className="flex flex-col gap-3">
        {seletorOperacao}
        {erroGlobal}
        <OperacaoKanban
          supabase={supabase}
          operacaoId={operacaoSelecionada.id}
          processos={processosDaOperacao}
          onAbrir={onAbrir}
          onProcessosMudaram={carregar}
        />
      </div>
    )
  }

  const listaBase = operacaoSelecionada ? processosDaOperacao : processos

  if (listaBase.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {seletorOperacao}
        {formularioNovo || botaoNovo}
        {erroGlobal}
        <Vazio
          titulo="Nenhum Processo ainda"
          descricao={operacaoSelecionada ? 'Nenhum Processo vinculado a esta Operação ainda.' : 'Crie o primeiro Processo acima — é a mesma tabela que /processos usa.'}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2.5">
      {seletorOperacao}
      {formularioNovo || botaoNovo}
      {erroGlobal}
      {listaBase.map(p => {
        const operacaoDoProcesso = p.operacao_id ? operacoes.find(o => o.id === p.operacao_id) ?? null : null
        return (
          <div
            key={p.id}
            className="group flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.05] p-4 transition hover:border-cyan-200/30 hover:bg-white/[0.08]"
          >
            <button type="button" onClick={() => onAbrir(p)} className="flex items-center justify-between gap-4 text-left outline-none">
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold text-white/92">{p.nome}</div>
                <div className="mt-0.5 truncate text-[12.5px] text-white/50">
                  {[p.tipo, p.cliente_nome, p.endereco].filter(Boolean).join(' · ') || 'Sem dados adicionais'}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="hidden rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-cyan-100/65 sm:inline">
                  {STATUS_ROTULO[p.status] ?? p.status}
                </span>
                <span className="grid size-9 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-cyan-100/80 transition group-hover:bg-cyan-300/15">
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </span>
              </div>
            </button>
            <div className="flex items-center gap-2 border-t border-white/8 pt-2 text-[11.5px]">
              {operacaoDoProcesso ? (
                <>
                  <span className="text-white/45">Operação: <span className="text-cyan-100/80">{operacaoDoProcesso.nome}</span></span>
                  <button
                    type="button"
                    onClick={() => desvincular(p.id)}
                    disabled={vinculandoId === p.id}
                    className="ml-auto rounded-full px-2.5 py-1 text-white/45 outline-none transition hover:text-red-300/85 disabled:opacity-50"
                  >
                    {vinculandoId === p.id ? 'Desvinculando…' : 'Desvincular'}
                  </button>
                </>
              ) : (
                <select
                  value=""
                  onChange={e => { if (e.target.value) vincular(p.id, e.target.value) }}
                  disabled={vinculandoId === p.id || operacoes.length === 0}
                  className="ml-auto rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11.5px] text-white/55 outline-none focus:border-cyan-200/40 disabled:opacity-40"
                >
                  <option value="">{operacoes.length === 0 ? 'Nenhuma Operação criada' : 'Vincular a uma Operação…'}</option>
                  {operacoes.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                </select>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
