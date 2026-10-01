'use client'

import { useState } from 'react'
import { Boxes, ChevronDown, Settings2 } from 'lucide-react'
import type { ProcessoModuloVinculo } from '@/lib/processo'
import { listarModulosDisponiveis, lerConfigBool } from '@/lib/processo'

// "Mais" é a configuração do Processo: quais módulos viram aba e, ao expandir um
// módulo, suas opções internas (ex.: EAP exibir/ocultar numeração). Com isso +
// templates, o mesmo motor de Processos opera obra, projeto e qualquer coisa.

export function ProcessoMais({ modulos, moduloEmEdicao, onAlternar, onSalvarConfig }: {
  modulos: ProcessoModuloVinculo[]
  moduloEmEdicao: string | null
  onAlternar: (key: string, habilitarAgora: boolean) => void
  onSalvarConfig: (key: string, config: Record<string, unknown>) => void
}) {
  const registry = listarModulosDisponiveis()
  const habilitados = new Set(modulos.filter(m => m.enabled).map(m => m.module_key))
  const configDe = (key: string) => modulos.find(m => m.module_key === key)?.config ?? {}
  const [expandido, setExpandido] = useState<string | null>(null)

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-1">
        <Boxes size={18} style={{ color: 'var(--accent)' }} />
        <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Módulos do processo</h2>
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
        Cada módulo habilitado vira uma aba deste Processo. Desabilitar esconde a aba — nada do que já foi
        registrado é apagado. Módulos com engrenagem podem ser personalizados.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {registry.map(mod => {
          const ativo = habilitados.has(mod.key)
          const temConfig = !!mod.configOpcoes?.length && ativo
          const aberto = expandido === mod.key
          const def = mod
          const config = configDe(mod.key)
          return (
            <div key={mod.key} className="rounded-lg" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="flex items-center gap-2 text-sm" style={{ color: ativo ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                  {temConfig && (
                    <button type="button" onClick={() => setExpandido(a => a === mod.key ? null : mod.key)} aria-label="Configurar" style={{ color: 'var(--text-secondary)' }}>
                      <Settings2 size={14} />
                    </button>
                  )}
                  {mod.label}
                </span>
                <div className="flex items-center gap-1.5">
                  {temConfig && (
                    <button type="button" onClick={() => setExpandido(a => a === mod.key ? null : mod.key)} aria-label="Expandir" className="grid size-6 place-items-center" style={{ color: 'var(--text-secondary)' }}>
                      <ChevronDown size={14} style={{ transform: aberto ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
                    </button>
                  )}
                  <button
                    onClick={() => onAlternar(mod.key, !ativo)}
                    disabled={moduloEmEdicao === mod.key}
                    className="text-xs font-medium px-2.5 py-1 rounded-full disabled:opacity-50"
                    style={ativo
                      ? { background: 'rgba(16,185,129,0.15)', color: '#10b981' }
                      : { background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                  >
                    {ativo ? 'Habilitado' : 'Habilitar'}
                  </button>
                </div>
              </div>

              {temConfig && aberto && (
                <div className="space-y-2 px-3 pb-3 pt-1" style={{ borderTop: '1px solid var(--border)' }}>
                  {mod.configOpcoes!.map(opt => {
                    const valor = lerConfigBool(def, config, opt.key)
                    return (
                      <label key={opt.key} className="flex items-center justify-between gap-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        <span>{opt.label}</span>
                        <button
                          type="button"
                          onClick={() => onSalvarConfig(mod.key, { ...config, [opt.key]: !valor })}
                          className="relative h-5 w-9 flex-shrink-0 rounded-full transition-colors"
                          style={{ background: valor ? 'var(--accent)' : 'var(--border)' }}
                          aria-pressed={valor}
                        >
                          <span className="absolute top-0.5 size-4 rounded-full bg-white transition-all" style={{ left: valor ? 18 : 2 }} />
                        </button>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
