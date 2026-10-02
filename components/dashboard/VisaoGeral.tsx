'use client'

// Visão Geral — superfície configurável por usuário + organização. Compõe os
// widgets do módulo (investidor, nesta primeira entrega) na ordem que o usuário
// escolher, podendo ocultar o que não usa. Nasce com a composição automática do
// módulo (widgets-registry) e evolui conforme o usuário ajusta.

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Settings2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/profile-context'
import { Modal } from '@/components/ui/Modal'
import { carregarVisaoInvestidor, type VisaoInvestidor } from '@/lib/investidor/carteira'
import {
  carregarPrefs, resolverComposicao, salvarPrefs, type DashboardPrefs,
} from '@/lib/dashboard/preferencias'
import {
  composicaoPadrao, WIDGET_POR_KEY, WIDGETS, type DashboardModulo, type WidgetKey,
} from '@/lib/dashboard/widgets-registry'
import {
  AlertasPendencias, CarteiraAtual, InvestidorKpis, MapaOperacoes, OperacoesPorEtapa, ProspeccaoPublica,
} from '@/components/dashboard/investidor/widgets'
import { PrevisaoTempoWidget } from '@/components/dashboard/PrevisaoTempoWidget'

function RenderWidget({ chave, visao }: { chave: WidgetKey; visao: VisaoInvestidor | null }) {
  switch (chave) {
    case 'investidor_kpis': return visao ? <InvestidorKpis visao={visao} /> : null
    case 'investidor_etapas': return visao ? <OperacoesPorEtapa visao={visao} /> : null
    case 'investidor_alertas': return visao ? <AlertasPendencias visao={visao} /> : null
    case 'investidor_mapa': return visao ? <MapaOperacoes visao={visao} /> : null
    case 'investidor_carteira': return visao ? <CarteiraAtual visao={visao} /> : null
    case 'investidor_prospeccao': return visao ? <ProspeccaoPublica visao={visao} /> : null
    case 'clima': return <PrevisaoTempoWidget />
    default: return null
  }
}

export function VisaoGeral({ modulo = 'investidor' }: { modulo?: DashboardModulo }) {
  const supabase = useMemo(() => createClient(), [])
  const { currentProfile } = useProfile()
  const profileId = currentProfile?.id ?? null

  const [orgId, setOrgId] = useState<string | null>(null)
  const [orgNome, setOrgNome] = useState<string>('')
  const [visao, setVisao] = useState<VisaoInvestidor | null>(null)
  const [prefs, setPrefs] = useState<DashboardPrefs | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [configAberto, setConfigAberto] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const { data: oid } = await supabase.rpc('current_organization_id')
    const organizationId = (oid as string | null) ?? null
    setOrgId(organizationId)

    const [org, dadosInvestidor, preferencias] = await Promise.all([
      organizationId
        ? supabase.from('organizations').select('nome').eq('id', organizationId).maybeSingle()
        : Promise.resolve({ data: null }),
      modulo === 'investidor' ? carregarVisaoInvestidor(supabase) : Promise.resolve(null),
      carregarPrefs(supabase, { profileId, orgId: organizationId, modulo }),
    ])
    setOrgNome(((org.data as { nome?: string } | null)?.nome) ?? '')
    setVisao(dadosInvestidor)
    setPrefs(preferencias)
    setCarregando(false)
  }, [supabase, profileId, modulo])

  useEffect(() => {
    const t = window.setTimeout(() => { void carregar() }, 0)
    return () => window.clearTimeout(t)
  }, [carregar])

  const ordemVisivel = resolverComposicao(modulo, prefs)

  async function aplicarPrefs(novo: DashboardPrefs) {
    setPrefs(novo)
    await salvarPrefs(supabase, { profileId, orgId, modulo }, novo)
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {orgNome && (
            <p className="text-xs font-semibold uppercase tracking-wide truncate" style={{ color: 'var(--accent)' }}>{orgNome}</p>
          )}
          <h1 className="text-2xl sm:text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>Visão geral</h1>
          <p className="text-sm mt-1 max-w-xl" style={{ color: 'var(--text-secondary)' }}>
            Acompanhe a carteira atual com valores conhecidos e pendências reais.
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setConfigAberto(true)}
            title="Configurar visão"
            className="grid size-10 place-items-center rounded-xl"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
          >
            <Settings2 size={18} />
          </button>
          <Link
            href="/investidor"
            title="Nova operação"
            className="grid size-10 place-items-center rounded-xl text-white"
            style={{ background: 'var(--accent)' }}
          >
            <Plus size={20} />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {ordemVisivel.map(chave => {
          const def = WIDGET_POR_KEY[chave]
          if (!def) return null
          return (
            <div key={chave} className={def.largura === 'full' ? 'lg:col-span-2' : ''}>
              <RenderWidget chave={chave} visao={visao} />
            </div>
          )
        })}
        {ordemVisivel.length === 0 && (
          <div className="lg:col-span-2 card p-8 text-center">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Todos os blocos estão ocultos. Toque em configurar para mostrar algo.
            </p>
          </div>
        )}
      </div>

      <ConfigModal
        aberto={configAberto}
        onFechar={() => setConfigAberto(false)}
        modulo={modulo}
        prefs={prefs}
        onAplicar={aplicarPrefs}
      />
    </div>
  )
}

function ConfigModal({ aberto, onFechar, modulo, prefs, onAplicar }: {
  aberto: boolean
  onFechar: () => void
  modulo: DashboardModulo
  prefs: DashboardPrefs | null
  onAplicar: (p: DashboardPrefs) => void
}) {
  // Ordem completa do módulo (inclui ocultos), para o usuário reordenar/mostrar.
  const padrao = composicaoPadrao(modulo)
  const ordemBase = prefs?.ordem?.filter(k => padrao.includes(k)) ?? []
  const ordemCompleta: WidgetKey[] = [...ordemBase, ...padrao.filter(k => !ordemBase.includes(k))]
  const [ordem, setOrdem] = useState<WidgetKey[]>(ordemCompleta)
  const [ocultos, setOcultos] = useState<Set<WidgetKey>>(new Set(prefs?.ocultos ?? []))

  useEffect(() => {
    if (aberto) {
      setOrdem(ordemCompleta)
      setOcultos(new Set(prefs?.ocultos ?? []))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto])

  function mover(i: number, dir: -1 | 1) {
    setOrdem(prev => {
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const copia = [...prev]
      ;[copia[i], copia[j]] = [copia[j], copia[i]]
      return copia
    })
  }

  function alternarOculto(k: WidgetKey) {
    const def = WIDGET_POR_KEY[k]
    if (def?.ocultavel === false) return
    setOcultos(prev => {
      const n = new Set(prev)
      if (n.has(k)) n.delete(k); else n.add(k)
      return n
    })
  }

  function salvar() {
    onAplicar({ ordem, ocultos: Array.from(ocultos) })
    onFechar()
  }

  return (
    <Modal open={aberto} onClose={onFechar} title="Configurar visão geral" size="md">
      <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
        Reordene e mostre/oculte os blocos. Vale só para você, nesta organização.
      </p>
      <div className="flex flex-col gap-2">
        {ordem.map((k, i) => {
          const def = WIDGET_POR_KEY[k]
          if (!def) return null
          const oculto = ocultos.has(k)
          return (
            <div key={k} className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', opacity: oculto ? 0.55 : 1 }}>
              <div className="flex flex-col">
                <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} className="disabled:opacity-30" style={{ color: 'var(--text-secondary)' }}><ArrowUp size={14} /></button>
                <button type="button" onClick={() => mover(i, 1)} disabled={i === ordem.length - 1} className="disabled:opacity-30" style={{ color: 'var(--text-secondary)' }}><ArrowDown size={14} /></button>
              </div>
              <span className="flex-1 text-sm" style={{ color: 'var(--text-primary)' }}>{def.titulo}</span>
              <button
                type="button"
                onClick={() => alternarOculto(k)}
                disabled={def.ocultavel === false}
                title={def.ocultavel === false ? 'Sempre visível' : oculto ? 'Mostrar' : 'Ocultar'}
                className="grid size-8 place-items-center rounded-lg disabled:opacity-30"
                style={{ color: oculto ? 'var(--text-secondary)' : 'var(--accent)' }}
              >
                {oculto ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          )
        })}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onFechar} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-secondary)' }}>Cancelar</button>
        <button type="button" onClick={salvar} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--accent)' }}>Salvar</button>
      </div>
    </Modal>
  )
}
