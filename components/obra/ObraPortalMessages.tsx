'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, MessageSquareText, Send } from 'lucide-react'
import { useProfile } from '@/lib/profile-context'
import { adminRpc } from '@/lib/portal-admin-client'
import type { PortalMessageDTO } from '@/lib/portal/types'

type Recipient = { id: string; nome: string; papel: string }

export function ObraPortalMessages({ obraId }: { obraId: string }) {
  const { currentProfile } = useProfile()
  const [messages, setMessages] = useState<PortalMessageDTO[]>([])
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!currentProfile) return
    const { data, error: loadError } = await adminRpc('portal_messages_admin_get', { p_obra_id: obraId })
    const payload = data as { messages?: PortalMessageDTO[]; recipients?: Recipient[] } | null
    setMessages(payload?.messages || [])
    setRecipients(payload?.recipients || [])
    setError(loadError?.message || '')
    setLoading(false)
  }, [currentProfile, obraId])

  useEffect(() => { void Promise.resolve().then(load) }, [load])

  async function send() {
    if (!currentProfile || !draft.trim() || sending) return
    setSending(true)
    const { data, error: sendError } = await adminRpc('portal_message_admin_send', {
      p_obra_id: obraId, p_portal_access_id: null, p_texto: draft.trim(),
    })
    setSending(false)
    if (sendError) { setError(sendError.message); return }
    setMessages(current => [...current, data as PortalMessageDTO])
    setDraft('')
  }

  return <div className="card overflow-hidden">
    <div className="border-b p-4 sm:p-5" style={{ borderColor: 'var(--border)' }}><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-lg" style={{ background: 'var(--bg-secondary)', color: 'var(--accent)' }}><MessageSquareText size={19} /></div><div><h3 className="font-semibold">Mensagens</h3><p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{recipients.length} usuario(s) atribuido(s) a obra recebem as mensagens do cliente.</p></div></div></div>
    {loading ? <div className="grid min-h-28 place-items-center"><Loader2 className="animate-spin" size={20} /></div> : <div className="max-h-80 space-y-3 overflow-y-auto p-4">{messages.length === 0 ? <p className="py-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhuma mensagem ainda.</p> : messages.map(message => <div key={message.id} className={`flex ${message.authorType === 'equipe' ? 'justify-end' : 'justify-start'}`}><div className="max-w-[88%] rounded-lg px-3 py-2" style={{ background: message.authorType === 'equipe' ? 'var(--accent)' : 'var(--bg-secondary)', color: message.authorType === 'equipe' ? 'white' : 'var(--text-primary)' }}><p className="text-xs font-semibold opacity-75">{message.autor}</p><p className="mt-1 text-sm">{message.texto}</p><p className="mt-1 text-[10px] opacity-60">{new Date(message.createdAt).toLocaleString('pt-BR')}</p></div></div>)}</div>}
    {error && <p className="mx-4 mb-2 text-xs text-red-400">{error}</p>}
    <div className="flex gap-2 border-t p-3" style={{ borderColor: 'var(--border)' }}><textarea value={draft} onChange={event => setDraft(event.target.value)} className="input-base min-h-11 min-w-0 flex-1 resize-none py-2.5 text-sm" rows={1} placeholder="Responder ao cliente..." maxLength={4000} /><button type="button" onClick={() => void send()} disabled={!draft.trim() || sending} className="grid size-11 shrink-0 place-items-center rounded-lg text-white disabled:opacity-40" style={{ background: 'var(--accent)' }} title="Enviar"><Send size={18} /></button></div>
  </div>
}
