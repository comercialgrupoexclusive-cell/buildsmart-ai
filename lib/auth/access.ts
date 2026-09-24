import { destinoSeguro } from './next-path'

export const DEFAULT_DESTINATION = '/processos'

export function loginDestination(next: string | null, memberships: number) {
  const destination = destinoSeguro(next) || DEFAULT_DESTINATION
  return memberships === 1 ? destination : `/organizacoes?next=${encodeURIComponent(destination)}`
}

export function chooseMembership(ids: string[], current: string | null): string | null {
  if (current && ids.includes(current)) return current
  return ids.length === 1 ? ids[0] : null
}
