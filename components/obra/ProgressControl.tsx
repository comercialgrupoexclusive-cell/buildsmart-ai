'use client'

import { useRef, useState } from 'react'
import { CheckSquare, Square } from 'lucide-react'
import { clampPct, corPorPercentual } from '@/lib/obra-progresso'

export function ProgressControl({ valor, onChange, compact = false, minimo = 0, disabled = false }: {
  valor: number
  onChange: (valor: number) => void
  compact?: boolean
  minimo?: number
  disabled?: boolean
}) {
  return <ProgressControlState key={`${valor}-${minimo}`} valor={valor} onChange={onChange} compact={compact} minimo={minimo} disabled={disabled} />
}

function ProgressControlState({ valor, onChange, compact, minimo, disabled }: {
  valor: number
  onChange: (valor: number) => void
  compact: boolean
  minimo: number
  disabled: boolean
}) {
  const [draft, setDraft] = useState(valor)
  const submittedRef = useRef<number | null>(null)

  function commit(next = draft) {
    const normalized = Math.max(minimo, clampPct(Number(next) || 0))
    setDraft(normalized)
    if (disabled || Math.abs(normalized - valor) < 0.01 || submittedRef.current === normalized) return
    submittedRef.current = normalized
    onChange(normalized)
  }

  const presets = [
    { label: 'Pendente', short: 'Pendente', value: 0, active: draft <= 0, editable: minimo <= 0 },
    { label: 'Em andamento', short: 'Andamento', value: null, active: draft > 0 && draft < 100, editable: false },
    { label: 'Concluído', short: 'Concluído', value: 100, active: draft >= 100, editable: true },
  ]

  return <div className={`flex flex-col flex-shrink-0 ${compact ? 'gap-1.5' : 'gap-2'} w-full sm:w-auto`} onClick={event => event.stopPropagation()}>
    <div className="grid grid-cols-3 gap-1">
      {presets.map(preset => <button key={preset.label} type="button" disabled={disabled || !preset.editable}
        onClick={() => { if (preset.value == null) return; setDraft(preset.value); commit(preset.value) }}
        aria-pressed={preset.active} title={preset.editable ? `Marcar como ${preset.label.toLowerCase()}` : 'O andamento acompanha o percentual'}
        className={`inline-flex items-center justify-center gap-1 rounded-md px-1.5 text-[10px] font-medium transition-all ${compact ? 'h-6' : 'h-7'}`}
        style={preset.active
          ? { background: 'color-mix(in srgb, var(--accent) 16%, transparent)', color: 'var(--accent)', border: '1px solid color-mix(in srgb, var(--accent) 42%, var(--border))' }
          : { background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', opacity: preset.editable ? 1 : 0.72 }}>
        {preset.active ? <CheckSquare size={11} /> : <Square size={11} />}
        <span>{preset.short}</span>
      </button>)}
    </div>
    <div className="flex items-center gap-2">
      <input type="range" min={minimo} max={100} step={1} value={Math.round(draft)} disabled={disabled}
        onChange={event => setDraft(Number(event.target.value))}
        onPointerUp={() => commit()} onTouchEnd={() => commit()} onKeyUp={() => commit()} onBlur={() => commit()}
        className="flex-1 min-w-20 accent-[var(--accent)] disabled:opacity-60" aria-label="Percentual de avanço" />
      <div className="relative flex items-center">
        <input type="number" min={minimo} max={100} step={0.5} value={Number(draft.toFixed(1)) || 0} disabled={disabled}
          onChange={event => setDraft(Math.max(minimo, clampPct(parseFloat(event.target.value))))}
          onBlur={() => commit()} onKeyDown={event => { if (event.key === 'Enter') commit() }}
          className="input-base py-1 text-xs text-right tabular-nums disabled:opacity-70"
          style={{ width: compact ? 68 : 76, height: compact ? 30 : 34, color: corPorPercentual(draft), fontWeight: 700, paddingRight: 21 }} />
        <span className="absolute right-2 text-xs pointer-events-none" style={{ color: 'var(--text-secondary)' }}>%</span>
      </div>
    </div>
  </div>
}
