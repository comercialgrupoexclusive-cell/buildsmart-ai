'use client'

import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { InputHTMLAttributes } from 'react'

// Campo de busca com ícone à esquerda — mesmo markup que já existia
// duplicado (ícone posicionado em absolute sobre um input-base) em
// app/(app)/projetos e app/(app)/investidor. Extraído para não repetir de
// novo a cada listagem nova.
type SearchInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  containerClassName?: string
}

export function SearchInput({ className, containerClassName, ...props }: SearchInputProps) {
  return (
    <div className={cn('relative max-w-sm w-full', containerClassName)}>
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-secondary)' }} />
      <input type="text" className={cn('input-base pl-9', className)} {...props} />
    </div>
  )
}
