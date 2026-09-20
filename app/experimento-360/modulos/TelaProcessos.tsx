'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { criarProcesso, listarProcessos, type Processo } from '@/lib/processo'
import { obterOuCriarProspeccaoDoProcesso } from '@/lib/investidor-processo'
import { Carregando, PrecisaSessao, Vazio } from './comuns'

const STATUS_ROTULO: Record<string, string> = {
  ACTIVE: 'Ativo',
  ON_HOLD: 'Em espera',
  COMPLETED: 'Concluído',
  ARCHIVED: 'Arquivado',
}

// Lista os Processos reais do Motor de Processo (`processos`). Abrir um deles
// troca o contexto do Dock para as abas daquele Processo — é o mesmo dado que
// /processos usa, sem uma segunda listagem própria.
export function TelaProcessos({ onAbrir }: { onAbrir: (p: Processo) => void }) {
  const supabase = useMemo(() => createClient(), [])
  const [processos, setProcessos] = useState<Processo[] | null>(null)
  const [semSessao, setSemSessao] = useState(false)
  const [criando, setCriando] = useState(false)
  const [nomeNovo, setNomeNovo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = async () => {
    try {
      const lista = await listarProcessos(supabase)
      setProcessos(lista)
    } catch {
      setProcessos([])
    }
  }

  useEffect(() => {
    let vivo = true
    void (async () => {
      const { data } = await supabase.auth.getUser()
      if (!vivo) return
      if (!data.user) { setSemSessao(true); setProcessos([]); return }
      try {
        const lista = await listarProcessos(supabase)
        if (vivo) setProcessos(lista)
      } catch {
        if (vivo) setProcessos([])
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
      const processo = await criarProcesso(supabase, { nome })
      // Template Investidor: a oportunidade interna (1:1) já nasce com o
      // Processo, para o usuário nunca ter de "criar o imóvel" depois. É
      // find-or-create idempotente — a Pesquisa reaproveita a mesma linha.
      // Uma falha aqui não impede a criação do Processo (a Pesquisa recria).
      try {
        await obterOuCriarProspeccaoDoProcesso(supabase, processo)
      } catch {
        // silencioso: a Pesquisa resolve na primeira abertura
      }
      setNomeNovo('')
      setCriando(false)
      await carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível criar o Processo.')
    } finally {
      setSalvando(false)
    }
  }

  if (semSessao) return <PrecisaSessao modulo="A lista de Processos" />
  if (processos === null) return <Carregando texto="Carregando Processos…" />

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

  if (processos.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {formularioNovo || botaoNovo}
        <Vazio
          titulo="Nenhum Processo ainda"
          descricao="Crie o primeiro Processo acima — é a mesma tabela que /processos usa."
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2.5">
      {formularioNovo || botaoNovo}
      {processos.map(p => (
        <button
          key={p.id}
          type="button"
          onClick={() => onAbrir(p)}
          className="group flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.05] p-4 text-left outline-none transition hover:border-cyan-200/30 hover:bg-white/[0.08] focus-visible:border-cyan-200/30"
        >
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
      ))}
    </div>
  )
}
