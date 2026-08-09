'use client'

import { useState } from 'react'
import { Bot, Send, Sparkles } from 'lucide-react'

type Message = { role: 'user' | 'assistant'; content: string }

const SUGGESTIONS = [
  'Quais pendências estão abertas?',
  'Quais observações existem na cozinha?',
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
      <div className="flex items-center gap-3"><div className="grid size-12 place-items-center rounded-full bg-[#e7efe9] text-[#176b55]"><Bot size={23} /></div><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#68706a]">Contexto restrito</p><h1 className="text-2xl font-semibold">Pergunte sobre sua obra</h1></div></div>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-[#68706a]">Nesta fase, a IA consulta e organiza somente os itens compartilhados no Board do orçamento selecionado.</p>

      {messages.length === 0 && <div className="mt-7 grid gap-2 sm:grid-cols-3">{SUGGESTIONS.map(suggestion => <button key={suggestion} type="button" onClick={() => send(suggestion)} className="min-h-24 rounded-lg border border-[#dfe4df] bg-white p-3 text-left text-sm hover:border-[#176b55]"><Sparkles size={16} className="mb-3 text-[#a67c3f]" />{suggestion}</button>)}</div>}

      <div className="mt-6 space-y-3">{messages.map((message, index) => <div key={`${message.role}-${index}`} className={`max-w-[88%] rounded-lg px-4 py-3 text-sm leading-6 ${message.role === 'user' ? 'ml-auto bg-[#176b55] text-white' : 'bg-white border border-[#dfe4df]'}`}>{message.content}</div>)}{loading && <div className="w-max rounded-lg border border-[#dfe4df] bg-white px-4 py-3 text-sm text-[#68706a]">Consultando o Board...</div>}</div>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      <div className="sticky bottom-3 mt-6 flex gap-2 rounded-lg border border-[#dfe4df] bg-white p-2 shadow-lg"><textarea rows={1} value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send() } }} className="min-h-11 min-w-0 flex-1 resize-none px-2 py-2.5 text-sm outline-none" placeholder="Pergunte ou peça para registrar algo no Board" /><button type="button" onClick={() => send()} disabled={loading || !input.trim()} className="grid size-11 place-items-center rounded-md bg-[#176b55] text-white disabled:opacity-40" aria-label="Enviar"><Send size={18} /></button></div>
    </section>
  )
}
