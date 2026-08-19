import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type Tone = 'accent' | 'success' | 'warning' | 'danger' | 'neutral'

export const toneColor: Record<Tone, string> = {
  accent: 'var(--accent)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
  neutral: 'var(--text-secondary)',
}

export function MetricCard({
  label, value, detail, tone = 'accent', className,
}: {
  label: string
  value: string
  detail?: string
  tone?: Tone
  className?: string
}) {
  return (
    <article className={cn('card relative min-w-0 overflow-hidden p-4 sm:p-5', className)}>
      <span className="absolute inset-x-0 top-0 h-0.5" style={{ background: toneColor[tone] }} />
      <p className="text-[11px] font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>{label}</p>
      <p className="mt-2 whitespace-nowrap text-lg font-bold leading-tight tabular-nums sm:text-2xl" style={{ color: 'var(--text-primary)' }}>{value}</p>
      {detail && <p className="mt-1.5 text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>{detail}</p>}
    </article>
  )
}

export function StatusItemCard({
  title, eyebrow, meta, value, detail, badge, tone = 'accent', actions, children, className,
}: {
  title: string
  eyebrow?: string
  meta?: ReactNode
  value?: string
  detail?: string
  badge?: ReactNode
  tone?: Tone
  actions?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <article className={cn('card relative min-w-0 overflow-hidden p-4 pl-5', className)}>
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: toneColor[tone] }} />
      <div className="flex min-w-0 items-start gap-3">
        <div className="min-w-0 flex-1">
          {eyebrow && <p className="truncate text-[11px] font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>{eyebrow}</p>}
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="min-w-0 text-sm font-semibold sm:text-base" style={{ color: 'var(--text-primary)' }}>{title}</h3>
            {badge}
          </div>
          {meta && <div className="mt-2 text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>{meta}</div>}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      {(value || detail) && (
        <div className="mt-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
          {value && <p className="text-base font-bold tabular-nums sm:text-lg" style={{ color: 'var(--text-primary)' }}>{value}</p>}
          {detail && <p className="text-xs font-medium" style={{ color: toneColor[tone] }}>{detail}</p>}
        </div>
      )}
      {children}
    </article>
  )
}
