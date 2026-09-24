'use client'

import { Boxes } from 'lucide-react'
import type { ProcessoModuloVinculo } from '@/lib/processo'
import { listarModulosDisponiveis } from '@/lib/processo'

// "Mais" é a configuração do Processo. Hoje o que existe aqui é escolher
// quais módulos ficam visíveis como aba — antes isso era a primeira aba
// ("Módulos"), o que dava ao ajuste mais destaque que ao trabalho.

export function ProcessoMais({ modulos, moduloEmEdicao, onAlternar }: {
  modulos: ProcessoModuloVinculo[]
  moduloEmEdicao: string | null
  onAlternar: (key: string, habilitarAgora: boolean) => void
}) {
  const registry = listarModulosDisponiveis()
  const habilitados = new Set(modulos.filter(m => m.enabled).map(m => m.module_key))

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-1">
        <Boxes size={18} style={{ color: 'var(--accent)' }} />
        <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Módulos do processo</h2>
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
        Cada módulo habilitado vira uma aba deste Processo. Desabilitar esconde a aba — nada do que já foi
        registrado é apagado.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {registry.map(mod => {
          const ativo = habilitados.has(mod.key)
          return (
            <div
              key={mod.key}
              className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
            >
              <span className="text-sm" style={{ color: ativo ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                {mod.label}
              </span>
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
          )
        })}
      </div>
    </div>
  )
}
