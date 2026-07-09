'use client'

import { useEffect, useRef, useState } from 'react'
import { Sparkles, Send, Loader2, Trash2, RotateCcw } from 'lucide-react'

type Message = { role: 'user' | 'assistant'; content: string }

const CHAT_KEY_PREFIX = 'buildsmart-obra-ai-'

const SUGESTOES = [
  'Crie as etapas de cronograma para uma casa de 150m²',
  'Liste o cronograma atual',
  'Liste o orçamento',
  'Busque composições de fundação',
]

function formatMessage(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>')
}

export function ObraAssistenteIA({ obraId, obraNome, obraUf }: {
  obraId: string
  obraNome: string
  obraUf: string
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const chatKey = CHAT_KEY_PREFIX + obraId

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = sessionStorage.getItem(chatKey)
    setMessages(stored ? JSON.parse(stored) : [])
    setLoaded(true)
  }, [chatKey])

  useEffect(() => {
    if (!loaded || typeof window === 'undefined') return
    sessionStorage.setItem(chatKey, JSON.stringify(messages.slice(-60)))
  }, [messages, loaded, chatKey])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!loading) inputRef.current?.focus()
  }, [loading])

  async function sendMessage(text?: string) {
    const msg = (text || input).trim()
    if (!msg || loading) return
    const userMsg: Message = { role: 'user', content: msg }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/obra-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          obraId,
          obraNome,
          obraUf,
          messages: next.slice(-20),
        }),
      })
      const data = await res.json()
      if (data.error) {
        setMessages(prev => [...prev, { role: 'assistant', content: `Erro: ${data.error}` }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.message }])
        window.dispatchEvent(new Event('buildsmart:obra-data-changed'))
      }
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Erro de conexao: ${err?.message || 'tente novamente'}` }])
    } finally {
      setLoading(false)
    }
  }

  function clearChat() {
    setMessages([])
    sessionStorage.removeItem(chatKey)
  }

  const isEmpty = messages.length === 0 && !loading

  return (
    <div className="flex flex-col h-[calc(100vh-220px)] min-h-[400px]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 rounded-t-2xl"
        style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #7C3AED, #3B82F6)' }}>
            <Sparkles size={16} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Luiza</p>
            <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Assistente IA • Cronograma & Orçamento</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button onClick={clearChat} className="p-1.5 rounded-lg transition-colors hover:opacity-80"
            style={{ color: 'var(--text-secondary)' }} title="Limpar conversa">
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
        style={{ background: 'var(--bg-primary)' }}>

        {isEmpty && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #7C3AED22, #3B82F622)' }}>
              <Sparkles size={24} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Olá! Eu sou a Luiza.
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                Posso criar etapas, subetapas e serviços no cronograma,<br />
                adicionar composições ao orçamento, e muito mais.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 justify-center max-w-md">
              {SUGESTOES.map(s => (
                <button key={s} onClick={() => sendMessage(s)}
                  className="text-[11px] px-3 py-1.5 rounded-full transition-all hover:scale-[1.02]"
                  style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                msg.role === 'user' ? 'rounded-br-md' : 'rounded-bl-md'
              }`}
              style={msg.role === 'user'
                ? { background: 'var(--accent)', color: 'white' }
                : { background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)' }
              }
              dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }}
            />
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent)' }} />
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Luiza está pensando...</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 rounded-b-2xl"
        style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--border)' }}>
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
            }}
            placeholder="Ex: Crie as etapas para uma casa de 120m²..."
            rows={1}
            className="flex-1 resize-none text-sm px-3 py-2 rounded-xl outline-none"
            style={{
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
              maxHeight: '120px',
            }}
            disabled={loading}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            className="p-2.5 rounded-xl transition-all flex-shrink-0"
            style={{
              background: input.trim() && !loading ? 'var(--accent)' : 'var(--bg-secondary)',
              color: input.trim() && !loading ? 'white' : 'var(--text-secondary)',
            }}
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
