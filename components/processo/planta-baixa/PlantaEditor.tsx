'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { obterPlanta, salvarPlanoPlanta, wrapOpenPlan3DProject, unwrapOpenPlan3DProject, type Planta } from '@/lib/processo/planta-baixa'
import { useProfile } from '@/lib/profile-context'

// Motor oficial do Planta 2D/3D: OpenPlan3D vendorizado
// (public/labs/openplan3d-runtime/, commit pinado — ver
// vendor/openplan3d/VENDOR.md), hospedado num iframe same-origin. Protocolo
// bs:* (mesma forma do bridge que existia para o Axonometra, agora
// descartado): bs:ready (mount) -> bs:load (nós mandamos o projeto,
// unwrapOpenPlan3DProject decide se é um projeto válido ou planta
// nova/legada) -> ... usuário edita ... -> bs:request-save (nós pedimos) ->
// bs:save (editor devolve o JSON do projeto) -> gravamos em
// plantas.plan_json, envelopado por wrapOpenPlan3DProject (engine +
// schemaVersion). Nunca usamos '*' como targetOrigin nas mensagens que
// ENVIAMOS (window.location.origin — mesma origem que o próprio bridge do
// editor aceita, ver vendor/openplan3d/src/lib/services/bridge.ts).
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

  const bsOrigin = typeof window !== 'undefined' ? window.location.origin : ''

  const enviarPlano = useCallback((plantaAtual: Planta) => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'bs:load', plan: unwrapOpenPlan3DProject(plantaAtual.plan_json) },
      bsOrigin,
    )
  }, [bsOrigin])

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== bsOrigin) return
      const data = event.data as { type?: string; plan?: string }
      if (data?.type === 'bs:ready') {
        setEditorReady(true)
        if (planta) enviarPlano(planta)
      }
      if (data?.type === 'bs:save' && typeof data.plan === 'string') {
        setSaving(true)
        setError(null)
        let project: unknown
        try {
          project = JSON.parse(data.plan)
        } catch {
          setSaving(false)
          setError('O editor devolveu um plano inválido — nada foi salvo.')
          return
        }
        const envelope = wrapOpenPlan3DProject(project)
        salvarPlanoPlanta(supabase, plantaId, envelope, currentProfile?.id)
          .then(() => {
            setSavedAt(new Date())
            setPlanta((p) => (p ? { ...p, plan_json: envelope } : p))
          })
          .catch(() => setError('Não foi possível salvar a planta.'))
          .finally(() => setSaving(false))
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [bsOrigin, planta, plantaId, currentProfile?.id, supabase, enviarPlano])

  // Se o editor já sinalizou pronto antes da planta terminar de carregar
  // (raro, mas possível), manda assim que ela chegar.
  useEffect(() => {
    if (editorReady && planta) enviarPlano(planta)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorReady, planta])

  function handleSalvar() {
    iframeRef.current?.contentWindow?.postMessage({ type: 'bs:request-save' }, bsOrigin)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--bg-primary)' }}>
      <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{planta?.nome || 'Planta 2D/3D'}</p>
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

      {/* pb reserva a altura da barra fixa da Luiza (LuiziaFloatingChat),
          reusando os mesmos valores que o AppLayout já usa para isso — a
          barra principal de ferramentas do OpenPlan3D (BuildSmartBar, no
          rodapé do iframe) fica assim imediatamente acima da Luiza, sem
          escondê-la nem movê-la. */}
      <div className="flex-1 relative pb-24 sm:pb-28">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            src="/labs/openplan3d-runtime/editor?embed=1"
            className="w-full h-full border-0"
            title="Editor de Planta 2D/3D"
            sandbox="allow-scripts allow-same-origin allow-downloads allow-forms allow-popups"
          />
        )}
      </div>
    </div>
  )
}
