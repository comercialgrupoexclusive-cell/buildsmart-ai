'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { obterPlanta, salvarPlanoPlanta, type Planta } from '@/lib/processo/planta-baixa'
import { useProfile } from '@/lib/profile-context'

// P4.6 Bloco B — hospeda o Axonometra vendorizado (public/axonometra/,
// commit pinado em vendor/axonometra/VENDOR.md) num iframe same-origin e
// fala o protocolo documentado em EMBEDDING.md: axo:ready (mount) ->
// axo:load (nós mandamos o plano salvo) -> ... usuário edita ... ->
// axo:request-save (nós pedimos) -> axo:save (editor responde com o JSON
// atual) -> gravamos em plantas.plan_json. Nunca usamos '*' como
// targetOrigin nas mensagens que ENVIAMOS (window.location.origin, que é
// exatamente a origem que o próprio bridge do editor aceita — ver
// vendor/axonometra/src/embed/embedConfig.ts).
export function PlantaEditor({ plantaId, onClose }: { plantaId: string; onClose: () => void }) {
  const supabase = createClient()
  const { currentProfile } = useProfile()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [planta, setPlanta] = useState<Planta | null>(null)
  const [loading, setLoading] = useState(true)
  const [editorReady, setEditorReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    obterPlanta(supabase, plantaId)
      .then(setPlanta)
      .catch(() => setError('Não foi possível carregar a planta.'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantaId])

  const axoOrigin = typeof window !== 'undefined' ? window.location.origin : ''

  const enviarPlano = useCallback((plano: unknown) => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'axo:load', plan: plano }, axoOrigin)
  }, [axoOrigin])

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== axoOrigin) return
      const data = event.data as { type?: string; plan?: string }
      if (data?.type === 'axo:ready') {
        setEditorReady(true)
        if (planta) enviarPlano(planta.plan_json)
      }
      if (data?.type === 'axo:save' && typeof data.plan === 'string') {
        setSaving(true)
        setError(null)
        let parsed: unknown
        try {
          parsed = JSON.parse(data.plan)
        } catch {
          setSaving(false)
          setError('O editor devolveu um plano inválido — nada foi salvo.')
          return
        }
        salvarPlanoPlanta(supabase, plantaId, parsed, currentProfile?.id)
          .then(() => setSavedAt(new Date()))
          .catch(() => setError('Não foi possível salvar a planta.'))
          .finally(() => setSaving(false))
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [axoOrigin, planta, plantaId, currentProfile?.id, supabase, enviarPlano])

  // Se o editor já sinalizou pronto antes da planta terminar de carregar
  // (raro, mas possível), manda assim que ela chegar.
  useEffect(() => {
    if (editorReady && planta) enviarPlano(planta.plan_json)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorReady, planta])

  function handleSalvar() {
    iframeRef.current?.contentWindow?.postMessage({ type: 'axo:request-save' }, axoOrigin)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--bg-primary)' }}>
      <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{planta?.nome || 'Planta Baixa'}</p>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {error ? <span style={{ color: 'var(--danger)' }}>{error}</span>
              : saving ? 'Salvando...'
              : savedAt ? `Salvo às ${savedAt.toLocaleTimeString('pt-BR')}`
              : editorReady ? 'Pronto' : 'Carregando editor...'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleSalvar}
            disabled={!editorReady || saving}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : 'Salvar'}
          </button>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--bg-secondary)]" aria-label="Fechar">
            <X size={18} style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>
      </div>

      <div className="flex-1 relative">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            src="/axonometra/index.html?embed=1"
            className="w-full h-full border-0"
            title="Editor de Planta Baixa"
            sandbox="allow-scripts allow-same-origin allow-downloads"
          />
        )}
      </div>
    </div>
  )
}
