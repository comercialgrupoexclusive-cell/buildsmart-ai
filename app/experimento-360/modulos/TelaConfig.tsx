'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  desabilitarModulo,
  habilitarModulo,
  listarModulosDisponiveis,
  listarModulosDoProcesso,
} from '@/lib/processo'
import { Carregando, PrecisaSessao } from './comuns'

// Config do Processo = habilitar/desabilitar módulos, exatamente a aba
// "Módulos" de /processos/[id], sobre as mesmas actions do Motor de Processo.
// O registry (lib/processo/domain/module-registry.ts) continua sendo a única
// fonte das chaves válidas — nada é declarado aqui.
export function TelaConfig({ processoId, onMudou }: { processoId: string; onMudou?: () => void }) {
  const supabase = useMemo(() => createClient(), [])
  const registry = useMemo(() => listarModulosDisponiveis(), [])
  const [habilitados, setHabilitados] = useState<Set<string> | null>(null)
  const [semSessao, setSemSessao] = useState(false)
  const [emEdicao, setEmEdicao] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    void (async () => {
      const { data } = await supabase.auth.getUser()
      if (!vivo) return
      if (!data.user) { setSemSessao(true); return }
      const vinculos = await listarModulosDoProcesso(supabase, processoId)
      if (vivo) setHabilitados(new Set(vinculos.filter(v => v.enabled).map(v => v.module_key)))
    })()
    return () => { vivo = false }
  }, [supabase, processoId])

  async function alternar(key: string, ligar: boolean) {
    setEmEdicao(key)
    try {
      if (ligar) await habilitarModulo(supabase, processoId, key)
      else await desabilitarModulo(supabase, processoId, key)
      const vinculos = await listarModulosDoProcesso(supabase, processoId)
      setHabilitados(new Set(vinculos.filter(v => v.enabled).map(v => v.module_key)))
      onMudou?.()
    } finally {
      setEmEdicao(null)
    }
  }

  if (semSessao) return <PrecisaSessao modulo="A configuração do Processo" />
  if (!habilitados) return <Carregando texto="Carregando módulos…" />

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12.5px] leading-relaxed text-white/45">
        Habilitar ou desabilitar módulos deste Processo. É o mesmo vínculo que a
        aba Módulos do BuildSmart controla.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {registry.map(mod => {
          const ativo = habilitados.has(mod.key)
          return (
            <div
              key={mod.key}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-2.5"
            >
              <span className={ativo ? 'text-[13.5px] text-white/88' : 'text-[13.5px] text-white/50'}>{mod.label}</span>
              <button
                type="button"
                onClick={() => alternar(mod.key, !ativo)}
                disabled={emEdicao === mod.key}
                className={
                  'shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-medium outline-none transition disabled:opacity-50 ' +
                  (ativo
                    ? 'border border-emerald-300/30 bg-emerald-400/15 text-emerald-200'
                    : 'border border-white/10 bg-white/[0.04] text-white/55 hover:text-white/85')
                }
              >
                {ativo ? 'Habilitado' : 'Habilitar'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
