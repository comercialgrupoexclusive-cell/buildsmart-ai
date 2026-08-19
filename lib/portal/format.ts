export function formatPercent(value: number, { clamp = false }: { clamp?: boolean } = {}) {
  const raw = Number(value || 0)
  const bounded = clamp ? Math.max(0, Math.min(100, raw)) : raw
  return `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(bounded)}%`
}
