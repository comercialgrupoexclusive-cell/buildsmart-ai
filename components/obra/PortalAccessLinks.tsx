'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, ExternalLink, Link2, Loader2 } from 'lucide-react'
import { useProfile } from '@/lib/profile-context'
import { adminRpc } from '@/lib/portal-admin-client'

type PortalLink = {
  id: string
  ativo: boolean
  token_hint: string | null
}

const FIXED_HINT = 'portal-fixo'

async function sha256(value: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
}

export function PortalAccessLinks({ obraId }: { obraId: string }) {
  const { currentProfile } = useProfile()
  const [url, setUrl] = useState('')
  const [ready, setReady] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  const ensureFixedLink = useCallback(async () => {
    if (!currentProfile) return
    const fixedUrl = `${window.location.origin}/portal/${obraId}`
    setUrl(fixedUrl)
    setReady(false)
    setError('')

    const { data, error: listError } = await adminRpc('portal_links_list', { p_obra_id: obraId })
    if (listError) {
      setError('Não foi possível ativar o Portal desta obra.')
      return
    }

    const fixed = ((data || []) as PortalLink[]).find(link => link.token_hint === FIXED_HINT)
    if (!fixed) {
      const { error: createError } = await adminRpc('portal_link_create', {
        p_obra_id: obraId,
        p_token_hash: await sha256(obraId),
        p_token_hint: FIXED_HINT,
        p_nome: 'Portal do cliente',
      })
      if (createError && createError.code !== '23505') {
        setError('Não foi possível ativar o Portal desta obra.')
        return
      }
    } else if (!fixed.ativo) {
      const { error: activateError } = await adminRpc('portal_link_set_active', {
        p_link_id: fixed.id,
        p_obra_id: obraId,
        p_ativo: true,
      })
      if (activateError) {
        setError('Não foi possível reativar o Portal desta obra.')
        return
      }
    }

    setReady(true)
  }, [currentProfile, obraId])

  useEffect(() => { void Promise.resolve().then(ensureFixedLink) }, [ensureFixedLink])

  async function copy() {
    if (!url) return
    await navigator.clipboard.writeText(url)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <section className="rounded-lg p-4 sm:p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-lg" style={{ background: 'var(--bg-secondary)', color: 'var(--accent)' }}>
          <Link2 size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">Link permanente do cliente</h3>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ready ? 'bg-green-500/15 text-green-400' : 'bg-blue-500/15 text-blue-400'}`}>
              {ready ? 'Ativo' : 'Ativando'}
            </span>
          </div>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Este é o único link desta obra. Ele permanece o mesmo e abre exatamente a visão do cliente.
          </p>
          <p className="mt-3 break-all rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
            {url || 'Preparando link...'}
          </p>
        </div>
      </div>

      {error && <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={copy} disabled={!url} className="flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium disabled:opacity-50" style={{ border: '1px solid var(--border)' }}>
          {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copiado' : 'Copiar link'}
        </button>
        <a href={url || undefined} target="_blank" rel="noreferrer" aria-disabled={!url} className="flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-white" style={{ background: 'var(--accent)', opacity: url ? 1 : 0.5, pointerEvents: url ? 'auto' : 'none' }}>
          {ready ? <ExternalLink size={15} /> : <Loader2 size={15} className="animate-spin" />} Ver como cliente
        </a>
      </div>
    </section>
  )
}
