'use client'

import { useState } from 'react'
import { MessageSquareText, Send } from 'lucide-react'
import type { PortalMessageDTO } from '@/lib/portal/types'

export function PortalMessages({ token, initialMessages }: { token: string; initialMessages: PortalMessageDTO[] }) {
  const [messages, setMessages] = useState(initialMessages)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  async function send() {
    if (!draft.trim() || sending) return
    setSending(true)
    try {
      const response = await fetch(`/api/portal/${token}/feed`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_message', texto: draft.trim() }),
      })
      if (!response.ok) throw new Error('Nao foi possivel enviar a mensagem.')
      const payload = await response.json() as { message: PortalMessageDTO }
      setMessages(current => [...current, payload.message])
      setDraft('')
    } finally { setSending(false) }
  }

  return <div className="card overflow-hidden">
    <div className="border-b p-4 sm:p-5" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-lg" style={{ background: 'var(--bg-secondary)', color: 'var(--accent)' }}><MessageSquareText size={19} /></div><div><h2 className="font-semibold">Mensagens da obra</h2><p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Converse com a equipe atribuida a esta obra.</p></div></div>
    </div>
    <div className="max-h-[480px] space-y-3 overflow-y-auto p-4 sm:p-5">
      {messages.length === 0 && <p className="py-10 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhuma mensagem ainda.</p>}
      {messages.map(message => <div key={message.id} className={`flex ${message.authorType === 'cliente' ? 'justify-end' : 'justify-start'}`}><div className="max-w-[88%] rounded-lg px-3.5 py-2.5" style={{ background: message.authorType === 'cliente' ? 'var(--accent)' : 'var(--bg-secondary)', color: message.authorType === 'cliente' ? 'white' : 'var(--text-primary)' }}><p className="text-xs font-semibold opacity-75">{message.autor}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-5">{message.texto}</p><p className="mt-1 text-[10px] opacity-60">{new Date(message.createdAt).toLocaleString('pt-BR')}</p></div></div>)}
    </div>
    <div className="flex gap-2 border-t p-3" style={{ borderColor: 'var(--border)' }}><textarea value={draft} onChange={event => setDraft(event.target.value)} className="input-base min-h-11 min-w-0 flex-1 resize-none py-2.5 text-sm" rows={1} placeholder="Escreva para a equipe..." maxLength={4000} /><button type="button" onClick={() => void send()} disabled={!draft.trim() || sending} className="grid size-11 shrink-0 place-items-center rounded-lg text-white disabled:opacity-40" style={{ background: 'var(--accent)' }} title="Enviar mensagem"><Send size={18} /></button></div>
  </div>
}
