'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, ChevronDown, Eye, EyeOff, Loader2, PanelsTopLeft } from 'lucide-react'
import { useProfile } from '@/lib/profile-context'
import { adminRpc } from '@/lib/portal-admin-client'
import {
  DEFAULT_PORTAL_CONTENT_VISIBILITY, DEFAULT_PORTAL_VISIBILITY, PORTAL_CONTENT_ITEMS, PORTAL_SECTIONS,
  normalizePortalContentVisibility, normalizePortalVisibility, type PortalContentSection,
  type PortalContentVisibility, type PortalSectionId, type PortalVisibility,
} from '@/lib/portal/sections'

export function PortalVisibilitySettings({ obraId }: { obraId: string }) {
  const { currentProfile } = useProfile()
  const [visibility, setVisibility] = useState<PortalVisibility>(DEFAULT_PORTAL_VISIBILITY)
  const [content, setContent] = useState<PortalContentVisibility>(DEFAULT_PORTAL_CONTENT_VISIBILITY)
  const [expanded, setExpanded] = useState<PortalSectionId | null>('feed')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!currentProfile) return
    setLoading(true)
    const [sectionsResult, contentResult] = await Promise.all([
      adminRpc('portal_visibility_admin_get', { p_obra_id: obraId }),
      adminRpc('portal_content_admin_get', { p_obra_id: obraId }),
    ])
    setLoading(false)
    if (sectionsResult.error || contentResult.error) { setError('Nao foi possivel carregar a configuracao do Portal.'); return }
    setError('')
    setVisibility(normalizePortalVisibility(sectionsResult.data as Partial<PortalVisibility>))
    setContent(normalizePortalContentVisibility(contentResult.data as Partial<PortalContentVisibility>))
  }, [currentProfile, obraId])

  useEffect(() => { void Promise.resolve().then(load) }, [load])

  async function toggleSection(sectionId: PortalSectionId) {
    if (!currentProfile || saving) return
    const next = !visibility[sectionId]
    const previous = visibility
    setSaving(sectionId); setVisibility(current => ({ ...current, [sectionId]: next }))
    const result = await adminRpc('portal_visibility_admin_set', { p_obra_id: obraId, p_secao: sectionId, p_habilitada: next })
    setSaving(null)
    if (result.error) { setVisibility(previous); setError(result.error.code === '23514' ? 'Mantenha pelo menos uma secao visivel.' : 'Nao foi possivel salvar.'); return }
    setVisibility(normalizePortalVisibility(result.data as Partial<PortalVisibility>))
  }

  async function toggleItem(section: PortalContentSection, item: string) {
    if (!currentProfile || saving) return
    const key = `${section}.${item}`
    const previous = content
    const next = !content[section][item as keyof (typeof content)[typeof section]]
    setSaving(key); setContent(current => ({ ...current, [section]: { ...current[section], [item]: next } }))
    const result = await adminRpc('portal_content_admin_set', { p_obra_id: obraId, p_secao: section, p_item: item, p_habilitado: next })
    setSaving(null)
    if (result.error) { setContent(previous); setError('Nao foi possivel salvar este conteudo.'); return }
    setContent(normalizePortalContentVisibility(result.data as Partial<PortalContentVisibility>))
  }

  const enabledCount = Object.values(visibility).filter(Boolean).length
  return <section className="space-y-4">
    <div className="card p-4 sm:p-5"><div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-lg" style={{ background: 'var(--bg-secondary)', color: 'var(--accent)' }}><PanelsTopLeft size={18} /></div><div><h3 className="font-semibold">Conteudo do Portal</h3><p className="mt-1 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>Ative abas inteiras ou abra cada uma para escolher seus cards e blocos.</p></div></div></div>
    {error && <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>}
    {loading ? <div className="grid min-h-48 place-items-center card"><Loader2 size={20} className="animate-spin" /></div> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{PORTAL_SECTIONS.map(section => {
      const enabled = visibility[section.id]
      const hasItems = section.id in PORTAL_CONTENT_ITEMS
      const isLast = enabled && enabledCount === 1
      return <article key={section.id} className={`card relative overflow-hidden p-4 transition-opacity ${enabled ? '' : 'opacity-55'}`}><div className="absolute inset-y-0 left-0 w-1" style={{ background: enabled ? 'var(--accent)' : 'var(--border)' }} /><div className="pl-1"><div className="flex items-start gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-lg" style={{ background: 'var(--bg-secondary)', color: enabled ? 'var(--accent)' : 'var(--text-secondary)' }}>{enabled ? <Eye size={17} /> : <EyeOff size={17} />}</div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><button type="button" onClick={() => hasItems && setExpanded(value => value === section.id ? null : section.id)} className="flex min-w-0 items-center gap-2 text-left"><span className="font-semibold">{section.label}</span>{hasItems && <ChevronDown size={15} className={expanded === section.id ? 'rotate-180' : ''} />}</button><label className={`relative inline-flex h-7 w-12 shrink-0 items-center ${isLast ? 'cursor-not-allowed' : 'cursor-pointer'}`}><input type="checkbox" className="sr-only" checked={enabled} disabled={Boolean(saving) || isLast} onChange={() => void toggleSection(section.id)} /><span className="absolute inset-0 rounded-full" style={{ background: enabled ? 'var(--accent)' : 'var(--border)' }} /><span className={`relative ml-1 grid size-5 place-items-center rounded-full bg-white text-blue-600 shadow transition-transform ${enabled ? 'translate-x-5' : ''}`}>{saving === section.id ? <Loader2 size={11} className="animate-spin" /> : enabled ? <Check size={11} /> : null}</span></label></div><p className="mt-1 text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>{section.description}</p></div></div>
      {enabled && hasItems && expanded === section.id && <div className="mt-4 space-y-1 border-t pt-3" style={{ borderColor: 'var(--border)' }}>{PORTAL_CONTENT_ITEMS[section.id as PortalContentSection].map(item => { const checked = content[section.id as PortalContentSection][item.id]; const key = `${section.id}.${item.id}`; return <label key={item.id} className="flex min-h-9 cursor-pointer items-center justify-between gap-3 rounded-md px-2 text-xs hover:bg-[var(--bg-secondary)]"><span>{item.label}</span>{saving === key ? <Loader2 size={14} className="animate-spin" /> : <input type="checkbox" checked={checked} onChange={() => void toggleItem(section.id as PortalContentSection, item.id)} />}</label> })}</div>}</div></article>
    })}</div>}
  </section>
}
