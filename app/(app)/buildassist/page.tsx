'use client'

import { useEffect, useRef, useState } from 'react'
import { Send, Bot, User, Cloud, Package, Users2, Loader2, RefreshCw } from 'lucide-react'
import { useProfile } from '@/lib/profile-context'
import { createClient } from '@/lib/supabase/client'

type Message = {
  role: 'user' | 'assistant'
  content: string
}

type Insight = {
  icon: React.ReactNode
  label: string
  title: string
  description: string
  color: string
}

export default function BuildAssistPage() {
  const { currentProfile } = useProfile()
  const supabase = createClient()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [insights, setInsights] = useState<Insight[]>([])
  const [openingMsg, setOpeningMsg] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadContext()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadContext() {
    const [etapasRes, materiaisRes] = await Promise.all([
      supabase
        .from('etapas')
        .select('*, obras(nome)')
        .gte('data_inicio', new Date().toISOString().split('T')[0])
        .order('data_inicio')
        .limit(5),
      supabase
        .from('materiais')
        .select('*, sinapi_insumos(descricao), obras(nome)')
        .neq('status_compra', 'comprado')
        .limit(5),
    ])

    const etapas = etapasRes.data || []
    const materiais = materiaisRes.data || []

    // Montar mensagem de abertura contextual
    let msg = `Olá${currentProfile ? `, ${currentProfile.name}` : ''}! 👋 `
    if (etapas.length > 0) {
      const prox = etapas[0]
      const dias = Math.round((new Date(prox.data_inicio).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      msg += `A etapa **${prox.nome}** (${prox.obras?.nome}) começa em ${dias} dias. `
    }
    if (materiais.length > 0) {
      msg += `Há ${materiais.length} ${materiais.length === 1 ? 'material pendente' : 'materiais pendentes'} de compra. `
    }
    msg += 'Como posso ajudar?'
    setOpeningMsg(msg)

    // Insights automáticos
    const newInsights: Insight[] = []

    if (materiais.length > 0) {
      newInsights.push({
        icon: <Package size={16} />,
        label: 'SUPRIMENTOS',
        title: `${materiais.length} itens pendentes`,
        description: `${materiais[0]?.sinapi_insumos?.descricao || 'Material'} em ${materiais[0]?.obras?.nome || 'obra'}`,
        color: 'var(--warning)',
      })
    }

    if (etapas.length > 0) {
      newInsights.push({
        icon: <Users2 size={16} />,
        label: 'EQUIPE',
        title: 'Próxima etapa crítica',
        description: `${etapas[0].nome} começa em breve`,
        color: 'var(--accent)',
      })
    }

    newInsights.push({
      icon: <Cloud size={16} />,
      label: 'CLIMA',
      title: 'Janela de oportunidade',
      description: 'Configure a API de clima para alertas meteorológicos',
      color: 'var(--success)',
    })

    setInsights(newInsights)
  }

  async function sendMessage() {
    if (!input.trim() || loading) return

    const userMsg: Message = { role: 'user', content: input.trim() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/buildassist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          profileId: currentProfile?.id,
        }),
      })

      const data = await res.json()

      if (data.message) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.message }])
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'Desculpe, ocorreu um erro ao processar sua mensagem. Verifique a configuração da API.',
        }])
      }
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Erro de conexão. Verifique sua chave de API Anthropic nas configurações.',
      }])
    } finally {
      setLoading(false)
    }
  }

  function formatMessage(text: string) {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>')
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-8rem)]">
      {/* Chat principal */}
      <div className="flex-1 flex flex-col card overflow-hidden">
        {/* Mensagem de abertura */}
        {messages.length === 0 && openingMsg && (
          <div className="p-4 border-b" style={{ borderColor: 'var(--border)', background: 'rgba(59,123,248,0.05)' }}>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent)' }}>
                <Bot size={16} className="text-white" />
              </div>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}
                dangerouslySetInnerHTML={{ __html: formatMessage(openingMsg) }} />
            </div>
          </div>
        )}

        {/* Histórico de mensagens */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex items-start gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: msg.role === 'user' ? (currentProfile?.theme_color || 'var(--accent)') : 'var(--accent)' }}
              >
                {msg.role === 'user'
                  ? <span className="text-white text-xs font-bold">{currentProfile?.name.charAt(0).toUpperCase() || 'U'}</span>
                  : <Bot size={14} className="text-white" />
                }
              </div>
              <div
                className="max-w-[80%] p-3 rounded-xl text-sm leading-relaxed"
                style={msg.role === 'user'
                  ? { background: 'var(--accent)', color: 'white', borderRadius: '12px 4px 12px 12px' }
                  : { background: 'var(--bg-secondary)', color: 'var(--text-primary)', borderRadius: '4px 12px 12px 12px' }
                }
                dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }}
              />
            </div>
          ))}

          {loading && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent)' }}>
                <Bot size={14} className="text-white" />
              </div>
              <div className="p-3 rounded-xl" style={{ background: 'var(--bg-secondary)' }}>
                <Loader2 size={16} className="animate-spin" style={{ color: 'var(--text-secondary)' }} />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="flex gap-3">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="Pergunte sobre otimização, clima ou suprimentos..."
              className="input-base flex-1"
              disabled={loading}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              className="w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:scale-105 disabled:opacity-50"
              style={{ background: 'var(--accent)' }}
            >
              <Send size={16} className="text-white" />
            </button>
          </div>
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="mt-2 flex items-center gap-1.5 text-xs transition-colors"
              style={{ color: 'var(--text-secondary)' }}
            >
              <RefreshCw size={12} /> Nova conversa
            </button>
          )}
        </div>
      </div>

      {/* Painel de insights */}
      <div className="w-64 flex flex-col gap-3">
        <h2 className="text-sm font-semibold px-1" style={{ color: 'var(--text-secondary)' }}>
          Insights automáticos
        </h2>
        {insights.map((insight, i) => (
          <div key={i} className="card p-4 cursor-pointer hover:scale-[1.02] transition-transform" onClick={() => {
            setInput(`Me dê mais detalhes sobre: ${insight.title}`)
          }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: `${insight.color}20`, color: insight.color }}>
                {insight.icon}
              </div>
              <span className="text-xs font-bold tracking-wider" style={{ color: insight.color }}>
                {insight.label}
              </span>
            </div>
            <p className="text-sm font-semibold mb-0.5" style={{ color: 'var(--text-primary)' }}>{insight.title}</p>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{insight.description}</p>
          </div>
        ))}

        <div className="card p-4 border-dashed" style={{ borderStyle: 'dashed' }}>
          <p className="text-xs text-center" style={{ color: 'var(--text-secondary)' }}>
            Clique em um insight para perguntar ao BuildAssist sobre ele
          </p>
        </div>
      </div>
    </div>
  )
}
