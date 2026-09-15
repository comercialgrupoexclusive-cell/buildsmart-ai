'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { listarProcessos, type Processo } from '@/lib/processo'
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

  if (semSessao) return <PrecisaSessao modulo="A lista de Processos" />
  if (processos === null) return <Carregando texto="Carregando Processos…" />
  if (processos.length === 0) {
    return (
      <Vazio
        titulo="Nenhum Processo ainda"
        descricao="Crie um Processo no BuildSmart e ele aparece aqui — esta tela lê a mesma tabela de /processos."
      />
    )
  }

  return (
    <div className="flex flex-col gap-2.5">
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
