'use client'
import { useState, type FormEvent } from 'react'

export default function ResetPasswordPage() {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    if (data.get('password') !== data.get('confirm')) { setMessage('As senhas não coincidem.'); return }
    setBusy(true)
    try {
      const response = await fetch('/api/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: data.get('password') }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      window.location.assign('/login')
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Tente novamente.'); setBusy(false) }
  }
  return <main className="flex min-h-dvh items-center justify-center bg-[#080e1b] p-5 text-slate-100"><form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-3xl border border-white/10 p-7">
    <h1 className="text-2xl">Definir senha</h1><p className="text-sm text-slate-400">Abra esta página pelo link do seu convite ou de recuperação.</p>
    <label className="block">Nova senha<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={1024} required className="mt-2 w-full rounded-xl bg-white/10 p-3" /></label>
    <label className="block">Confirmar senha<input name="confirm" type="password" autoComplete="new-password" minLength={12} required className="mt-2 w-full rounded-xl bg-white/10 p-3" /></label>
    {message && <p role="alert">{message}</p>}<button disabled={busy} className="w-full rounded-xl bg-cyan-200 p-3 text-slate-950">{busy ? 'Salvando…' : 'Salvar senha'}</button>
  </form></main>
}
