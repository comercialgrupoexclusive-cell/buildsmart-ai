'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { APP_VERSION } from '@/lib/version'
import { createClient } from '@/lib/supabase/client'

type OrganizacaoPublica = {
  nome: string
  slug: string
  logo_url: string | null
  cor_principal: string | null
}

// P4.6 Bloco A — substitui o antigo seletor global de perfis (P4.4/P4.5)
// como experiência final do MVP: agora lista Organizações, não pessoas. Só
// dado cosmético e público (organizacoes_publicas, RPC anon-safe); usuário
// entra pela tela tematizada da própria Organização (/o/[slug]), com
// usuário+senha, nunca e-mail.
export default function OrganizacaoPickerPage() {
  const router = useRouter()
  const [orgs, setOrgs] = useState<OrganizacaoPublica[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    loadOrgs()
  }, [])

  async function loadOrgs() {
    setLoading(true)
    setLoadError(null)
    try {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('organizacoes_publicas')
      if (error) throw error
      setOrgs((data || []) as OrganizacaoPublica[])
    } catch {
      setLoadError('Não foi possível carregar as organizações.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8" style={{ background: 'var(--bg-primary)' }}>
      <div className="mb-12 text-center animate-enter">
        <div className="inline-flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-xl" style={{ background: 'var(--accent)' }}>
            B
          </div>
          <h1 className="text-4xl font-bold" style={{ fontFamily: 'var(--font-sans)', color: 'var(--text-primary)' }}>
            BuildSmart <span style={{ color: 'var(--accent)' }}>AI</span>
            <span
              className="ml-2 align-middle text-xs font-medium px-1.5 py-0.5 rounded-md"
              style={{ fontFamily: 'var(--font-sans)', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
            >
              v{APP_VERSION}
            </span>
          </h1>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Gestão de obras residenciais inteligente
        </p>
      </div>

      <div className="w-full max-w-2xl animate-enter" style={{ animationDelay: '100ms' }}>
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center gap-3 text-center rounded-2xl border p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Organizações não carregaram</p>
            <p className="text-xs max-w-sm" style={{ color: 'var(--text-secondary)' }}>{loadError}</p>
            <button onClick={loadOrgs} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--accent)' }}>
              Tentar novamente
            </button>
          </div>
        ) : orgs.length === 0 ? (
          <p className="text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
            Nenhuma organização ativa no momento.
          </p>
        ) : (
          <>
            <p className="text-center text-sm mb-6 font-medium" style={{ color: 'var(--text-secondary)' }}>
              Qual organização?
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              {orgs.map((org) => (
                <div
                  key={org.slug}
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/o/${org.slug}`)}
                  onKeyDown={e => e.key === 'Enter' && router.push(`/o/${org.slug}`)}
                  className="relative group flex flex-col items-center gap-3 p-5 rounded-2xl border transition-all duration-200 hover:scale-105 w-36 cursor-pointer"
                  style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                >
                  {org.logo_url ? (
                    <img src={org.logo_url} alt={org.nome} className="w-16 h-16 rounded-full object-cover" />
                  ) : (
                    <div
                      className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold"
                      style={{ background: org.cor_principal || 'var(--accent)' }}
                    >
                      {org.nome.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="text-sm font-medium text-center leading-tight" style={{ color: 'var(--text-primary)' }}>
                    {org.nome}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <button
        onClick={() => router.push('/criar-organizacao')}
        className="mt-10 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-all hover:scale-[1.02]"
        style={{ background: 'var(--accent)' }}
      >
        Criar organização
      </button>
    </div>
  )
}
