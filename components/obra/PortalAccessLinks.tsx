'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Copy, ExternalLink, Link2, Loader2, Power, Plus } from 'lucide-react'
import { useProfile } from '@/lib/profile-context'
import { createClient } from '@/lib/supabase/client'

type PortalLink = {
  id: string
  nome: string | null
  ativo: boolean
  token_hint: string | null
  expires_at: string | null
  last_accessed_at: string | null
  created_at: string
}

function createToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sha256(value: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
}

function storageKey(linkId: string) {
  return `buildsmart_portal_link_${linkId}`
}

export function PortalAccessLinks({ obraId }: { obraId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const { currentProfile } = useProfile()
  const [links, setLinks] = useState<PortalLink[]>([])
  const [localUrls, setLocalUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!currentProfile) return
    setLoading(true)
    const { data, error: loadError } = await supabase.rpc('portal_links_list', {
      p_obra_id: obraId,
      p_profile_id: currentProfile.id,
    })
    if (loadError) setError(loadError.message)
    const rows = (data || []) as PortalLink[]
    setLinks(rows)
    const cached: Record<string, string> = {}
    rows.forEach(link => {
      const value = localStorage.getItem(storageKey(link.id))
      if (value) cached[link.id] = value
    })
    setLocalUrls(cached)
    setLoading(false)
  }, [currentProfile, obraId, supabase])

  // O carregamento assíncrono evita uma atualização síncrona em cascata no mount.
  useEffect(() => { void Promise.resolve().then(load) }, [load])

  async function generate() {
    if (!currentProfile) return
    setSaving(true); setError(''); setMessage('')
    const token = createToken()
    const url = `${window.location.origin}/portal/${token}`
    const { data, error: createError } = await supabase.rpc('portal_link_create', {
      p_obra_id: obraId,
      p_profile_id: currentProfile.id,
      p_token_hash: await sha256(token),
      p_token_hint: token.slice(-8),
      p_nome: 'Acesso do cliente',
    })
    if (createError || !data) {
      setError(createError?.message || 'Não foi possível gerar o link.')
      setSaving(false)
      return
    }
    const linkId = String(data)
    localStorage.setItem(storageKey(linkId), url)
    setLocalUrls(previous => ({ ...previous, [linkId]: url }))
    await navigator.clipboard.writeText(url).catch(() => undefined)
    setMessage('Novo link gerado e copiado.')
    setSaving(false)
    await load()
  }

  async function toggle(link: PortalLink) {
    if (!currentProfile) return
    setError(''); setMessage('')
    const { error: toggleError } = await supabase.rpc('portal_link_set_active', {
      p_link_id: link.id,
      p_obra_id: obraId,
      p_profile_id: currentProfile.id,
      p_ativo: !link.ativo,
    })
    if (toggleError) { setError(toggleError.message); return }
    setMessage(link.ativo ? 'Link desativado.' : 'Link reativado.')
    await load()
  }

  async function copy(url: string) {
    await navigator.clipboard.writeText(url)
    setMessage('Link copiado.')
  }

  return (
    <section className="rounded-lg p-4 sm:p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><Link2 size={17} style={{ color: 'var(--accent)' }} /><h3 className="font-semibold">Link do cliente</h3></div>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>Acesso direto ao Portal desta obra, sem senha.</p>
        </div>
        <button type="button" onClick={generate} disabled={saving || !currentProfile} className="flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--accent)' }}>
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Gerar novo link
        </button>
      </div>

      {message && <p className="mt-3 rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-400">{message}</p>}
      {error && <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

      <div className="mt-4 space-y-2">
        {loading ? <p className="py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>Carregando acessos...</p> : links.length === 0 ? <p className="rounded-lg border border-dashed p-4 text-sm" style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}>Nenhum link criado para esta obra.</p> : links.map(link => {
          const url = localUrls[link.id]
          return <div key={link.id} className="flex flex-col gap-3 rounded-lg p-3 sm:flex-row sm:items-center" style={{ background: 'var(--bg-secondary)' }}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium">{link.nome || 'Acesso do cliente'}</p><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${link.ativo ? 'bg-green-500/15 text-green-400' : 'bg-gray-500/15 text-gray-400'}`}>{link.ativo ? 'Ativo' : 'Desativado'}</span></div>
              <p className="mt-1 truncate text-xs" style={{ color: 'var(--text-secondary)' }}>{url || `Link protegido · final ${link.token_hint || 'não disponível'}`}</p>
              {link.last_accessed_at && <p className="mt-1 text-[11px]" style={{ color: 'var(--text-secondary)' }}>Último acesso: {new Date(link.last_accessed_at).toLocaleString('pt-BR')}</p>}
            </div>
            <div className="flex gap-1 self-end sm:self-auto">
              {url && <><button type="button" onClick={() => copy(url)} className="grid size-10 place-items-center rounded-lg" title="Copiar link" style={{ border: '1px solid var(--border)' }}><Copy size={15} /></button><a href={url} target="_blank" rel="noreferrer" className="grid size-10 place-items-center rounded-lg" title="Abrir Portal" style={{ border: '1px solid var(--border)' }}><ExternalLink size={15} /></a></>}
              <button type="button" onClick={() => toggle(link)} className="grid size-10 place-items-center rounded-lg" title={link.ativo ? 'Desativar link' : 'Reativar link'} style={{ border: '1px solid var(--border)', color: link.ativo ? 'var(--danger)' : 'var(--success)' }}><Power size={15} /></button>
            </div>
          </div>
        })}
      </div>
      {links.some(link => !localUrls[link.id]) && <p className="mt-3 text-xs" style={{ color: 'var(--text-secondary)' }}>Links antigos não podem ser reconstruídos porque o BuildSmart guarda somente o hash. Gere um novo para copiar a URL completa.</p>}
    </section>
  )
}
