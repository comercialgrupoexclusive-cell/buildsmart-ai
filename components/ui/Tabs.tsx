'use client'

import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// Abas de seção de página (ícone + rótulo, trilha com pílula ativa) — mesmo
// padrão visual que já existia em app/(app)/projetos/[id]/page.tsx,
// extraído aqui para o Motor de Processo não recriar de novo. Diferente de
// FilterTabs (que filtra uma lista): Tabs troca o conteúdo exibido abaixo.
export type TabOption<T extends string> = {
  key: T
  label: string
  icon?: LucideIcon
}

export function Tabs<T extends string>({
  options, value, onChange, className,
}: {
  options: TabOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div className={cn('max-w-full overflow-x-auto pb-1', className)}>
      <div className="flex items-center gap-1 p-1 rounded-lg w-max" style={{ background: 'var(--bg-secondary)' }}>
        {options.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap flex-shrink-0"
            style={value === key ? { background: 'var(--accent)', color: 'white' } : { color: 'var(--text-secondary)' }}
          >
            {Icon && <Icon size={15} />}
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
