'use client'

// Segmented control de filtro (ex.: status) — mesmo padrão visual que já
// existia reimplementado em cada listagem (app/(app)/projetos,
// app/(app)/orcamentos, app/(app)/investidor): pílulas dentro de uma trilha,
// cor de destaque por opção quando ativa. Extraído para virar o padrão daqui
// pra frente em vez de recriar a cada tela nova.
export type FilterTabOption<T extends string> = {
  value: T
  label: string
  activeColor?: string // default: var(--accent)
}

export function FilterTabs<T extends string>({
  options, value, onChange, className,
}: {
  options: FilterTabOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div
      className={`flex gap-1 p-1 rounded-lg flex-shrink-0 overflow-x-auto ${className ?? ''}`}
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      {options.map(opt => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap"
            style={active
              ? { background: opt.activeColor ?? 'var(--accent)', color: 'white' }
              : { color: 'var(--text-secondary)' }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
