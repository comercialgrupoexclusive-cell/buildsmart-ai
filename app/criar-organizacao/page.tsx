'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Building2 } from 'lucide-react'
import { useProfile } from '@/lib/profile-context'
import { Profile } from '@/lib/types'

// P4.7 — Fluxo 1 (nova Organização): formulário mínimo (nome da
// organização, nome do usuário, username, senha) que já cria e autentica
// de ponta a ponta via /api/auth/criar-organizacao (Supabase Auth público —
// sem e-mail visível, sem service_role). Ao concluir, entra direto no
// sistema como owner — sem etapa de operador no meio.
export default function CriarOrganizacaoPage() {
  const router = useRouter()
  const { setCurrentProfile } = useProfile()

  const [orgNome, setOrgNome] = useState('')
  const [userNome, setUserNome] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!orgNome.trim() || !userNome.trim() || !username.trim() || !password) {
      setError('Preencha todos os campos.')
      return
    }
    if (password.length < 6) {
      setError('A senha precisa ter pelo menos 6 caracteres.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/criar-organizacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgNome: orgNome.trim(),
          userNome: userNome.trim(),
          username: username.trim(),
          password,
        }),
      })
      const data = await res.json().catch(() => ({} as { error?: string }))
      if (!res.ok) {
        setError(data.error || 'Não foi possível criar a organização.')
        setBusy(false)
        return
      }
      setCurrentProfile(data.profile as Profile)
      router.push('/onboarding')
    } catch {
      setError('Falha de conexão. Tente novamente.')
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8" style={{ background: 'var(--bg-primary)' }}>
      <div className="mb-8 text-center animate-enter">
        <div
          className="w-16 h-16 rounded-xl flex items-center justify-center text-white mx-auto mb-3"
          style={{ background: 'var(--accent)' }}
        >
          <Building2 size={28} />
        </div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Criar organização</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Você vira o owner, com acesso total</p>
      </div>

      <div className="card w-full max-w-xs p-6 animate-enter" style={{ background: 'var(--bg-card)', animationDelay: '80ms' }}>
        <div className="flex flex-col gap-3 mb-3">
          <input
            value={orgNome}
            onChange={e => { setOrgNome(e.target.value); setError(null) }}
            placeholder="Nome da organização"
            className="input-base"
            autoFocus
            style={error ? { borderColor: 'var(--danger)' } : {}}
          />
          <input
            value={userNome}
            onChange={e => { setUserNome(e.target.value); setError(null) }}
            placeholder="Seu nome"
            className="input-base"
            style={error ? { borderColor: 'var(--danger)' } : {}}
          />
          <input
            value={username}
            onChange={e => { setUsername(e.target.value); setError(null) }}
            placeholder="Usuário (login)"
            className="input-base"
            autoCapitalize="none"
            style={error ? { borderColor: 'var(--danger)' } : {}}
          />
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={e => { setPassword(e.target.value); setError(null) }}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="Senha"
              className="input-base pr-10"
              style={error ? { borderColor: 'var(--danger)' } : {}}
            />
            <button onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }}>
              {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>
        {error && <p className="text-xs mb-3 text-center" style={{ color: 'var(--danger)' }}>{error}</p>}
        <button
          onClick={handleSubmit}
          disabled={busy}
          className="w-full py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-all hover:scale-[1.02]"
          style={{ background: 'var(--accent)' }}
        >
          {busy ? 'Criando...' : 'Criar organização e entrar'}
        </button>
      </div>

      <button onClick={() => router.push('/')} className="mt-6 text-xs underline" style={{ color: 'var(--text-secondary)' }}>
        Voltar
      </button>
    </div>
  )
}
