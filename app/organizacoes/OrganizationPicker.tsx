'use client'

import { useState } from 'react'
import type { Membership } from '@/lib/auth/session'

export function OrganizationPicker({ memberships, next }: { memberships: Membership[]; next: string }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function select(organizationId: string) {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/auth/organization', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ organizationId, next }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      window.location.assign(data.next)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Tente novamente.'); setBusy(false) }
  }
  async function logout() {
    setBusy(true)
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' })
      if (!response.ok) throw new Error('Não foi possível sair. Tente novamente.')
      localStorage.removeItem('buildsmart_profile')
      localStorage.removeItem('buildsmart_organization')
      window.location.assign('/login')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Tente novamente.'); setBusy(false) }
  }
  return <section className="w-full max-w-md space-y-4 rounded-3xl border border-white/10 bg-white/5 p-7">
    <h1 className="text-2xl font-medium">{memberships.length ? 'Sua organização' : 'Aguardando convite'}</h1>
    {!memberships.length && <p className="text-slate-400">Sua conta está ativa, mas ainda não tem vínculo com uma organização. Solicite um convite ao responsável.</p>}
    {memberships.map(m => <button key={m.organization_id} disabled={busy} onClick={() => select(m.organization_id)} className="block w-full rounded-xl border border-white/15 p-4 text-left hover:bg-white/10 disabled:opacity-50">{m.organizations.nome}{m.organizations.slug === 'sandbox' && <span className="ml-2 text-xs text-cyan-200">Ambiente de testes</span>}</button>)}
    {error && <p role="alert" className="text-rose-300">{error}</p>}
    <button disabled={busy} onClick={logout} className="text-sm text-slate-400 underline">Sair</button>
  </section>
}
