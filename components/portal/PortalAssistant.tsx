'use client'

import { useState } from 'react'
import { Bot, Send, Sparkles } from 'lucide-react'

type Message = { role: 'user' | 'assistant'; content: string }

const SUGGESTIONS = [
  'Quais pendências estão abertas?',
  'Quanto está previsto para os próximos 30 dias?',
  'Crie uma dúvida sobre a bancada da cozinha.',
]

export function PortalAssistant({ token, orcamentoId, onBoardChanged }: { token: string; orcamentoId: string; onBoardChanged: () => Promise<void> }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function send(text = input) {
    const value = text.trim()
    if (!value || loading) return
    const next = [...messages, { role: 'user', content: value } as Message]
    setMessages(next)
    setInput('')
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/portal/${token}/ai`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, orcamentoId }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'A IA não conseguiu responder.')
      setMessages(current => [...current, { role: 'assistant', content: payload.message }])
      if (payload.changed) await onBoardChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'A IA não conseguiu responder.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="mx-auto max-w-3xl">
      <div className="flex items-center gap-3"><div className="grid size-12 place-items-center rounded-full" style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)' }}><Bot size={23} /></div><div><p className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-secondary)' }}>Contexto restrito</p><h1 className="text-2xl font-semibold">Pergunte sobre sua obra</h1></div></div>
      <p className="mt-4 max-w-2xl text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>A IA consulta o Board e as previsões publicadas do orçamento selecionado. Alterações continuam restritas ao Board.</p>

      {messages.length === 0 && <div className="mt-7 grid gap-2 sm:grid-cols-3">{SUGGESTIONS.map(suggestion => <button key={suggestion} type="button" onClick={() => send(suggestion)} className="card min-h-24 p-3 text-left text-sm hover:border-[var(--accent)]"><Sparkles size={16} className="mb-3" style={{ color: 'var(--accent)' }} />{suggestion}</button>)}</div>}

      <div className="mt-6 space-y-3">{messages.map((message, index) => <div key={`${message.role}-${index}`} className={`max-w-[88%] rounded-lg px-4 py-3 text-sm leading-6 ${message.role === 'user' ? 'ml-auto text-white' : 'card'}`} style={message.role === 'user' ? { background: 'var(--accent)' } : undefined}>{message.content}</div>)}{loading && <div className="card w-max px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>Consultando o Board...</div>}</div>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      <div className="card sticky bottom-3 mt-6 flex gap-2 p-2 shadow-lg"><textarea rows={1} value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send() } }} className="min-h-11 min-w-0 flex-1 resize-none bg-transparent px-2 py-2.5 text-sm outline-none" placeholder="Pergunte sobre Board ou previsões" /><button type="button" onClick={() => send()} disabled={loading || !input.trim()} className="grid size-11 place-items-center rounded-lg text-white disabled:opacity-40" style={{ background: 'var(--accent)' }} aria-label="Enviar"><Send size={18} /></button></div>
    </section>
  )
}
