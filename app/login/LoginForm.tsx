'use client'

import { useState, type FormEvent, type MouseEvent } from 'react'

export function LoginForm({ next }: { next: string | null }) {
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState<'login' | 'recovery' | null>(null)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy('login')
    setError('')
    setMessage('')
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
      setBusy(null)
    }
  }
  async function recover(event: MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.form
    const email = form ? new FormData(form).get('email') : null
    if (typeof email !== 'string' || !email.trim()) {
      setError('Informe seu e-mail para receber o link.')
      return
    }
    setBusy('recovery')
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/auth/recovery', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      setMessage('Se o e-mail estiver cadastrado, você receberá um link para definir a senha.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível solicitar o link.')
    } finally {
      setBusy(null)
    }
  }
  return <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-3xl border border-white/10 bg-white/5 p-7">
    <h1 className="text-2xl font-medium">Entrar</h1>
    <p className="text-sm text-slate-400">Use seu e-mail e senha. Acesso por convite.</p>
    <label className="block text-sm">E-mail<input name="email" type="email" autoComplete="username" required maxLength={254} className="mt-2 block w-full rounded-xl border border-white/15 bg-black/20 p-3" /></label>
    <label className="block text-sm">Senha<input name="password" type="password" autoComplete="current-password" required maxLength={1024} className="mt-2 block w-full rounded-xl border border-white/15 bg-black/20 p-3" /></label>
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    {message && <p role="status" className="text-sm text-cyan-100">{message}</p>}
    <button disabled={busy !== null} className="w-full rounded-xl bg-cyan-200 px-4 py-3 font-medium text-slate-950 disabled:opacity-50">{busy === 'login' ? 'Entrando…' : 'Entrar'}</button>
    <button type="button" onClick={recover} disabled={busy !== null} className="w-full text-sm text-cyan-100 underline-offset-4 hover:underline disabled:opacity-50">{busy === 'recovery' ? 'Enviando…' : 'Definir ou redefinir senha'}</button>
  </form>
}
