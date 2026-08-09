'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Eye, EyeOff, Loader2, PanelsTopLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/profile-context'
import {
  DEFAULT_PORTAL_VISIBILITY,
  PORTAL_SECTIONS,
  normalizePortalVisibility,
  type PortalSectionId,
  type PortalVisibility,
} from '@/lib/portal/sections'

export function PortalVisibilitySettings({ obraId }: { obraId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const { currentProfile } = useProfile()
  const [visibility, setVisibility] = useState<PortalVisibility>(DEFAULT_PORTAL_VISIBILITY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<PortalSectionId | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!currentProfile) return
    setLoading(true)
    const { data, error: loadError } = await supabase.rpc('portal_visibility_admin_get', {
      p_profile_id: currentProfile.id,
      p_obra_id: obraId,
    })
    setLoading(false)
    if (loadError) {
      setError('Não foi possível carregar a configuração do Portal.')
      return
    }
    setError('')
    setVisibility(normalizePortalVisibility(data as Partial<PortalVisibility>))
  }, [currentProfile, obraId, supabase])

  useEffect(() => { void Promise.resolve().then(load) }, [load])

  async function toggle(sectionId: PortalSectionId) {
    if (!currentProfile || saving) return
    const nextEnabled = !visibility[sectionId]
    const previous = visibility
    setSaving(sectionId)
    setError('')
    setVisibility(value => ({ ...value, [sectionId]: nextEnabled }))

    const { data, error: saveError } = await supabase.rpc('portal_visibility_admin_set', {
      p_profile_id: currentProfile.id,
      p_obra_id: obraId,
      p_secao: sectionId,
      p_habilitada: nextEnabled,
    })
    setSaving(null)
    if (saveError) {
      setVisibility(previous)
      setError(saveError.code === '23514' ? 'Mantenha pelo menos uma seção visível.' : 'Não foi possível salvar esta alteração.')
      return
    }
    setVisibility(normalizePortalVisibility(data as Partial<PortalVisibility>))
  }

  const enabledCount = Object.values(visibility).filter(Boolean).length

  return (
    <section className="space-y-4">
      <div className="rounded-lg p-4 sm:p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg" style={{ background: 'var(--bg-secondary)', color: 'var(--accent)' }}>
            <PanelsTopLeft size={18} />
          </div>
          <div>
            <h3 className="font-semibold">Conteúdo do Portal</h3>
            <p className="mt-1 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
              Escolha o que aparece para o cliente. A alteração é aplicada imediatamente no link permanente.
            </p>
          </div>
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>}

      {loading ? (
        <div className="grid min-h-48 place-items-center rounded-lg" style={{ border: '1px solid var(--border)' }}>
          <Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent)' }} />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {PORTAL_SECTIONS.map(section => {
            const enabled = visibility[section.id]
            const isSaving = saving === section.id
            const isLastEnabled = enabled && enabledCount === 1
            return (
              <article
                key={section.id}
                className={`relative overflow-hidden rounded-lg p-4 transition-all ${enabled ? '' : 'opacity-55'}`}
                style={{
                  background: 'var(--bg-card)',
                  border: `1px ${enabled ? 'solid' : 'dashed'} ${enabled ? 'color-mix(in srgb, var(--accent) 38%, var(--border))' : 'var(--border)'}`,
                }}
              >
                <div className="absolute inset-y-0 left-0 w-1" style={{ background: enabled ? 'var(--accent)' : 'var(--border)' }} />
                <div className="flex items-start gap-3 pl-1">
                  <div className="grid size-9 shrink-0 place-items-center rounded-lg" style={{ background: 'var(--bg-secondary)', color: enabled ? 'var(--accent)' : 'var(--text-secondary)' }}>
                    {enabled ? <Eye size={17} /> : <EyeOff size={17} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="font-semibold">{section.label}</h4>
                      <label className={`relative inline-flex h-7 w-12 shrink-0 items-center ${isLastEnabled ? 'cursor-not-allowed' : 'cursor-pointer'}`} title={isLastEnabled ? 'Mantenha ao menos uma seção visível' : `${enabled ? 'Ocultar' : 'Exibir'} ${section.label}`}>
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={enabled}
                          disabled={Boolean(saving) || isLastEnabled}
                          onChange={() => toggle(section.id)}
                        />
                        <span className="absolute inset-0 rounded-full transition-colors" style={{ background: enabled ? 'var(--accent)' : 'var(--border)' }} />
                        <span className={`relative ml-1 grid size-5 place-items-center rounded-full bg-white text-[10px] text-blue-600 shadow transition-transform ${enabled ? 'translate-x-5' : ''}`}>
                          {isSaving ? <Loader2 size={11} className="animate-spin" /> : enabled ? <Check size={11} strokeWidth={3} /> : null}
                        </span>
                      </label>
                    </div>
                    <p className="mt-1 text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>{section.description}</p>
                    <p className="mt-3 text-[11px] font-semibold uppercase" style={{ color: enabled ? 'var(--success)' : 'var(--text-secondary)' }}>
                      {enabled ? 'Visível para o cliente' : 'Oculto no Portal'}
                    </p>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
