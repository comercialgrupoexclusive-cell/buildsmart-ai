'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Eye, EyeOff, Lock } from 'lucide-react'
import { useProfile } from '@/lib/profile-context'
import { createClient } from '@/lib/supabase/client'
import { Profile } from '@/lib/types'

type Tema = {
  nome: string
  logo_url: string | null
  cor_principal: string | null
  cor_destaque: string | null
  cor_fundo_login: string | null
  ativo: boolean
}

// P4.6 Bloco A — tela de login por Organização: /o/[slug]. Carrega nome/
// logo/cores da Organização (RPC pública organizacao_tema_publico, único
// dado de organizations exposto a anon) ANTES de qualquer sessão existir,
// depois pede usuário+senha e chama /api/auth/login-organizacao — que
// resolve para o e-mail técnico interno e autentica de verdade via
// Supabase Auth. Substitui, como experiência final do MVP, o antigo
// seletor global de perfis (app/page.tsx agora só lista Organizações).
export default function LoginOrganizacaoPage() {
  const params = useParams<{ slug: string }>()
  const slug = params.slug
  const router = useRouter()
  const { setCurrentProfile } = useProfile()

  const [tema, setTema] = useState<Tema | null>(null)
  const [loadingTema, setLoadingTema] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [modo, setModo] = useState<'entrar' | 'primeiro_acesso'>('entrar')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function loadTema() {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('organizacao_tema_publico', { p_slug: slug })
      if (cancelled) return
      const row = Array.isArray(data) ? data[0] : data
      if (error || !row) {
        setNotFound(true)
      } else {
        setTema(row as Tema)
      }
      setLoadingTema(false)
    }
    loadTema()
    return () => { cancelled = true }
  }, [slug])

  async function handleSubmit() {
    if (!username.trim() || !password) {
      setError('Preencha usuário e senha.')
      return
    }
    if (modo === 'primeiro_acesso' && password.length < 6) {
      setError('A senha precisa ter pelo menos 6 caracteres.')
      return
    }
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      const endpoint = modo === 'entrar' ? '/api/auth/login-organizacao' : '/api/auth/primeiro-acesso'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, username: username.trim(), password }),
      })
      const data = await res.json().catch(() => ({} as { error?: string }))
      if (!res.ok) {
        setError(data.error || 'Não foi possível entrar.')
        setBusy(false)
        return
      }
      setCurrentProfile(data.profile as Profile)
      const profile = data.profile as Profile
      router.push(profile.onboarding_done ? '/dashboard' : '/onboarding')
    } catch {
      setError('Falha de conexão. Tente novamente.')
      setBusy(false)
    }
  }

  function alternarModo() {
    setModo(m => (m === 'entrar' ? 'primeiro_acesso' : 'entrar'))
    setError(null)
    setInfo(modo === 'entrar' ? 'Primeiro acesso: informe o usuário já cadastrado e crie sua senha.' : null)
    setPassword('')
  }

  const corPrincipal = tema?.cor_principal || 'var(--accent)'
  const corFundo = tema?.cor_fundo_login || 'var(--bg-primary)'

  if (loadingTema) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  if (notFound || tema?.ativo === false) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-8 text-center" style={{ background: 'var(--bg-primary)' }}>
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Organização não encontrada.</p>
        <button onClick={() => router.push('/')} className="text-xs underline" style={{ color: 'var(--text-secondary)' }}>
          Voltar
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8" style={{ background: corFundo }}>
      <div className="mb-10 text-center animate-enter">
        {tema?.logo_url ? (
          <img src={tema.logo_url} alt={tema.nome} className="w-16 h-16 rounded-xl object-cover mx-auto mb-3" />
        ) : (
          <div
            className="w-16 h-16 rounded-xl flex items-center justify-center text-white font-bold text-2xl mx-auto mb-3"
            style={{ background: corPrincipal }}
          >
            {tema?.nome.charAt(0).toUpperCase()}
          </div>
        )}
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{tema?.nome}</h1>
      </div>

      <div className="card w-full max-w-xs p-6 animate-enter" style={{ background: 'var(--bg-card)', animationDelay: '80ms' }}>
        <div className="flex items-center gap-1.5 justify-center mb-5 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <Lock size={11} />
          {modo === 'entrar' ? 'Acesso restrito' : 'Primeiro acesso'}
        </div>
        {info && !error && (
          <p className="text-xs mb-3 text-center" style={{ color: 'var(--text-secondary)' }}>{info}</p>
        )}
        <div className="flex flex-col gap-3 mb-3">
          <input
            value={username}
            onChange={e => { setUsername(e.target.value); setError(null) }}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="Usuário"
            className="input-base"
            autoFocus
            autoCapitalize="none"
            style={error ? { borderColor: 'var(--danger)' } : {}}
          />
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={e => { setPassword(e.target.value); setError(null) }}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder={modo === 'entrar' ? 'Senha' : 'Crie sua senha'}
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
          style={{ background: corPrincipal }}
        >
          {busy ? 'Entrando...' : modo === 'entrar' ? 'Entrar' : 'Criar senha e entrar'}
        </button>
        <button
          onClick={alternarModo}
          disabled={busy}
          className="w-full mt-3 text-xs underline text-center"
          style={{ color: 'var(--text-secondary)' }}
        >
          {modo === 'entrar' ? 'Primeiro acesso' : 'Já tenho senha — Entrar'}
        </button>
      </div>

      <button onClick={() => router.push('/')} className="mt-6 text-xs underline" style={{ color: 'var(--text-secondary)' }}>
        Trocar de organização
      </button>
    </div>
  )
}
