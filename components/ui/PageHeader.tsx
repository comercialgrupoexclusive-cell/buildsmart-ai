import { cn } from '@/lib/utils'

// Cabeçalho padrão de página de listagem: título + subtítulo + ações à
// direita. Esse bloco existia duplicado (título/estilo levemente diferente
// a cada tela) em app/(app)/projetos, app/(app)/orcamentos,
// app/(app)/investidor etc. — extraído aqui para não repetir de novo em
// cada módulo novo do Motor de Processo.
export function PageHeader({
  title, subtitle, actions, className,
}: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3', className)}>
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{title}</h1>
        {subtitle && (
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
