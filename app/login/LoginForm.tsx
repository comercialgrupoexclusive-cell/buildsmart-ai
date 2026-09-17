'use client'

import { useState, type FormEvent } from 'react'

export function LoginForm({ next }: { next: string | null }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const form = new FormData(event.currentTarget)
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.get('email'), password: form.get('password'), next }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      // Full navigation discards all data belonging to the previous session.
      window.location.assign(result.next)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível entrar. Tente novamente.')
      setBusy(false)
    }
  }
  return <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-3xl border border-white/10 bg-white/5 p-7">
    <h1 className="text-2xl font-medium">Entrar</h1>
    <p className="text-sm text-slate-400">Use seu e-mail e senha. Acesso por convite.</p>
    <label className="block text-sm">E-mail<input name="email" type="email" autoComplete="username" required maxLength={254} className="mt-2 block w-full rounded-xl border border-white/15 bg-black/20 p-3" /></label>
    <label className="block text-sm">Senha<input name="password" type="password" autoComplete="current-password" required maxLength={1024} className="mt-2 block w-full rounded-xl border border-white/15 bg-black/20 p-3" /></label>
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    <button disabled={busy} className="w-full rounded-xl bg-cyan-200 px-4 py-3 font-medium text-slate-950 disabled:opacity-50">{busy ? 'Entrando…' : 'Entrar'}</button>
    <p className="text-xs text-slate-400">Para definir ou redefinir sua senha, solicite um link de acesso ao responsável pelo convite.</p>
  </form>
}
