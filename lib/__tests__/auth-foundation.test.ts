import { describe, expect, it } from 'vitest'
import { destinoSeguro } from '@/lib/auth/next-path'
import { loginDestination, chooseMembership } from '@/lib/auth/access'

describe('global auth routing', () => {
  it.each(['/login', '/login?next=/experimento-360', '/organizacoes', '/auth/confirm', '/api/session', '/%2f%2fevil.com', '/a\\b', '/\nevil.com'])('rejects unsafe or looping next %s', value => {
    expect(destinoSeguro(value)).toBeNull()
  })
  it('retains original internal route after login', () => {
    expect(loginDestination('/processos/abc?tab=board', 1)).toBe('/processos/abc?tab=board')
    expect(loginDestination('https://evil.com', 1)).toBe('/experimento-360')
  })
  it('sends zero and multiple memberships to selection without special admin UX', () => {
    expect(loginDestination('/experimento-360', 0)).toBe('/organizacoes?next=%2Fexperimento-360')
    expect(loginDestination('/processos/abc', 2)).toBe('/organizacoes?next=%2Fprocessos%2Fabc')
  })
  it('never selects an unauthorized cookie organization', () => {
    expect(chooseMembership(['a'], 'b')).toBe('a')
    expect(chooseMembership(['a','b'], 'c')).toBeNull()
    expect(chooseMembership([], 'a')).toBeNull()
    expect(chooseMembership(['a','b'], 'b')).toBe('b')
  })
})
