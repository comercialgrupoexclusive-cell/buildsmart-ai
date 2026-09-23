'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/profile-context'
import { listarProcessos, type Processo, type ProcessoStatus } from '@/lib/processo'
import { listarEtapasDaOperacao } from '@/lib/operacoes'
import { lerAcessosRecentes } from '../acesso-recente'
import { Carregando, PrecisaSessao, Vazio } from './comuns'

// Visão Geral (Início) — o que está acontecendo agora. Mostra apenas os 3
// Processos mais recentemente acessados, em cards discretos: nome, etapa/estado
// atual e endereço quando existir. Nada de Cliente/Responsável/Tipo, módulos,
// dashboard ou indicadores — só o suficiente para reconhecer e reabrir o
// Processo. Tocar no card abre o Processo pela mesma via de sempre.

const STATUS: Record<ProcessoStatus, { rotulo: string; cor: string }> = {
  ACTIVE: { rotulo: 'Ativo', cor: '#10b981' },
  ON_HOLD: { rotulo: 'Em espera', cor: '#f59e0b' },
  COMPLETED: { rotulo: 'Concluído', cor: '#58a8ff' },
  ARCHIVED: { rotulo: 'Arquivado', cor: '#94a3b8' },
}

const COR_ETAPA_PADRAO = '#7cc4ff'

type Estagio = { rotulo: string; cor: string }

function saudacao(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function dataDeHoje(): string {
  const d = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  return d.charAt(0).toUpperCase() + d.slice(1)
}

// Ordena por acesso recente (histórico local) e completa com os mais
// recentemente atualizados — sempre no máximo 3.
function escolherTresRecentes(processos: Processo[], recentes: string[]): Processo[] {
  const porId = new Map(processos.map(p => [p.id, p]))
  const acessados = recentes.map(id => porId.get(id)).filter((p): p is Processo => !!p)
  const restantes = processos
    .filter(p => !recentes.includes(p.id))
    .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
  return [...acessados, ...restantes].slice(0, 3)
}

function ThumbProcesso() {
  // Placeholder neutro: Processo não tem imagem no schema, então não há foto
  // real a mostrar. Um bloco discreto com um glifo de imóvel — chrome, não
  // dado fabricado.
  return (
    <div className="grid size-14 shrink-0 place-items-center rounded-2xl border border-white/8 bg-[linear-gradient(140deg,rgba(60,110,170,0.25),rgba(20,40,70,0.35))] text-cyan-100/45">
      <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 10.5 12 4l9 6.5" />
        <path d="M5 9.5V20h14V9.5" />
        <path d="M9.5 20v-5h5v5" />
      </svg>
    </div>
  )
}

export function TelaInicio({ onAbrir }: { onAbrir: (p: Processo) => void }) {
  const supabase = useMemo(() => createClient(), [])
  const { currentProfile } = useProfile()
  const [semSessao, setSemSessao] = useState(false)
  const [processos, setProcessos] = useState<Processo[] | null>(null)
  const [estagios, setEstagios] = useState<Record<string, Estagio>>({})

  useEffect(() => {
    let vivo = true
    void (async () => {
      const { data } = await supabase.auth.getUser()
      if (!vivo) return
      if (!data.user) { setSemSessao(true); setProcessos([]); return }
      try {
        const todos = await listarProcessos(supabase)
        if (!vivo) return
        const tres = escolherTresRecentes(todos, lerAcessosRecentes())
        setProcessos(tres)

        // Nome da etapa operacional só para os cards mostrados (no máx. 3),
        // buscando por Operação distinta — não é dashboard, é só o rótulo do
        // estágio atual de cada card.
        const opIds = [...new Set(tres.filter(p => p.operacao_id && p.etapa_operacional_id).map(p => p.operacao_id as string))]
        const mapa: Record<string, Estagio> = {}
        await Promise.all(opIds.map(async opId => {
          try {
            const etapas = await listarEtapasDaOperacao(supabase, opId)
            for (const e of etapas) mapa[e.id] = { rotulo: e.nome, cor: e.cor || COR_ETAPA_PADRAO }
          } catch { /* etapa some do card; cai para o status técnico */ }
        }))
        if (vivo) setEstagios(mapa)
      } catch {
        if (vivo) setProcessos([])
      }
    })()
    return () => { vivo = false }
  }, [supabase])

  const primeiroNome = currentProfile?.name?.trim().split(/\s+/)[0] ?? ''

  if (semSessao) return <PrecisaSessao modulo="A Visão Geral" />
  if (processos === null) return <Carregando texto="Carregando…" />

  function estagioDe(p: Processo): Estagio {
    if (p.etapa_operacional_id && estagios[p.etapa_operacional_id]) return estagios[p.etapa_operacional_id]
    const s = STATUS[p.status] ?? { rotulo: p.status, cor: '#94a3b8' }
    return s
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-semibold leading-tight text-white/95">
          {saudacao()}{primeiroNome ? `, ${primeiroNome}` : ''}.
        </h1>
        <p className="mt-1 text-[13px] text-white/45">O que está acontecendo agora · {dataDeHoje()}</p>
      </div>

      {processos.length === 0 ? (
        <Vazio
          titulo="Nenhum Processo ainda"
          descricao="Quando você abrir Processos, os últimos acessados aparecem aqui."
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {processos.map(p => {
            const estagio = estagioDe(p)
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onAbrir(p)}
                className="group flex items-center gap-3.5 rounded-2xl border border-white/10 bg-white/[0.05] p-3.5 text-left outline-none transition hover:border-cyan-200/30 hover:bg-white/[0.08] focus-visible:border-cyan-200/30"
              >
                <ThumbProcesso />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15.5px] font-semibold text-white/92">{p.nome}</div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: estagio.cor }} aria-hidden />
                    <span className="truncate text-[12.5px] text-white/60">{estagio.rotulo}</span>
                  </div>
                  {p.endereco && (
                    <div className="mt-0.5 truncate text-[12px] text-white/40">{p.endereco}</div>
                  )}
                </div>
                <span className="grid size-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-cyan-100/80 transition group-hover:bg-cyan-300/15">
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
