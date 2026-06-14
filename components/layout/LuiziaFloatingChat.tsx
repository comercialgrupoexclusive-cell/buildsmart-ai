'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { BotMessageSquare, ExternalLink, Loader2, MessageCircle, Send, X } from 'lucide-react'
import { useProfile } from '@/lib/profile-context'
import { logLuizia } from '@/lib/luizia-monitor'
import { createClient } from '@/lib/supabase/client'

type Message = {
  role: 'user' | 'assistant'
  content: string
}

const CHAT_KEY = 'buildsmart-luizia-floating-chat-session'
const ASSIST_ON_ENTRY_KEY = 'buildsmart-open-luizia-on-entry'

function greeting(name?: string) {
  return `Oi${name ? `, ${name}` : ''}! Eu sou a Luiza.

Prometo nao complicar sua vida: posso ajudar com orcamento, materiais, compras, cronograma e aquelas duvidas de obra que aparecem do nada.

Ah, e se quiser deixar o sistema mais confortavel, tem tema claro e escuro no botao de sol/lua la no topo.

Como voce esta hoje? Quer que eu te ajude a dar uma olhada na obra atual?`
}

function formatMessage(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>')
}

function safeRows(result: any) {
  return Array.isArray(result?.data) ? result.data : []
}

export function LuiziaFloatingChat() {
  const { currentProfile } = useProfile()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = sessionStorage.getItem(CHAT_KEY)
    const initial = stored ? JSON.parse(stored) as Message[] : []
    setMessages(initial)
    setLoaded(true)

    if (sessionStorage.getItem(ASSIST_ON_ENTRY_KEY) === '1') {
      sessionStorage.removeItem(ASSIST_ON_ENTRY_KEY)
      setOpen(true)
      setMessages(current => current.length > 0
        ? current
        : [{ role: 'assistant', content: greeting(currentProfile?.apelido || currentProfile?.name) }]
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function openFromGuide() {
      setOpen(true)
      setMessages(current => current.length > 0
        ? current
        : [{ role: 'assistant', content: greeting(currentProfile?.apelido || currentProfile?.name) }]
      )
    }

    window.addEventListener('buildsmart:open-luizia', openFromGuide)
    return () => window.removeEventListener('buildsmart:open-luizia', openFromGuide)
  }, [currentProfile?.apelido, currentProfile?.name])

  useEffect(() => {
    if (!loaded || typeof window === 'undefined') return
    sessionStorage.setItem(CHAT_KEY, JSON.stringify(messages.slice(-40)))
  }, [messages, loaded])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  async function sendMessage() {
    if (!input.trim() || loading) return
    const userMsg: Message = { role: 'user', content: input.trim() }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput('')
    setLoading(true)

    try {
      const [
        obrasRes,
        orcamentosRes,
        etapasRes,
        materiaisRes,
        medicoesRes,
        fornecedoresRes,
        composicoesRes,
        insumosRes,
      ] = await Promise.all([
        supabase.from('obras').select('id,nome,status,data_inicio,data_previsao,responsavel,area_m2,uf').order('created_at', { ascending: false }),
        supabase.from('orcamentos').select('id,obra_id,tipo,status,versao,bdi_percentual,created_at').order('created_at', { ascending: false }),
        supabase.from('etapas').select('id,obra_id,nome,data_inicio,data_fim,status,ordem').order('data_inicio'),
        supabase.from('materiais').select('id,obra_id,etapa_id,subetapa,descricao,unidade,quantidade_total,quantidade_comprada,status_compra,data_necessidade').order('data_necessidade'),
        supabase.from('medicoes').select('id,obra_id,etapa_id,periodo_inicio,periodo_fim,percentual_executado,observacao,created_at').order('created_at', { ascending: false }).limit(20),
        supabase.from('fornecedores').select('id,obra_id,nome,categoria,contato,telefone,email,ativo').order('nome'),
        supabase.from('composicoes_proprias').select('id,codigo,descricao,unidade,grupo,ativo').order('codigo').limit(50),
        supabase.from('insumos_proprios').select('id,codigo,descricao,unidade,categoria,grupo,preco_unitario,ativo').order('codigo').limit(80),
      ])
      const obras = safeRows(obrasRes)
      const obraAtual = obras[0] || null
      const obraId = obraAtual?.id || ''

      const res = await fetch('/api/buildassist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next,
          complex: false,
          context: {
            modo: 'atalho-luizia',
            geradoEm: new Date().toISOString(),
            usuario: currentProfile ? {
              id: currentProfile.id,
              name: currentProfile.name,
              apelido: currentProfile.apelido,
              cidade: currentProfile.cidade,
              estado: currentProfile.estado,
              tipo: currentProfile.tipo,
            } : null,
            obraAtual,
            obras,
            orcamentos: safeRows(orcamentosRes).filter((item: any) => !obraId || item.obra_id === obraId),
            etapas: safeRows(etapasRes).filter((item: any) => !obraId || item.obra_id === obraId),
            materiais: safeRows(materiaisRes).filter((item: any) => !obraId || item.obra_id === obraId),
            medicoes: safeRows(medicoesRes).filter((item: any) => !obraId || item.obra_id === obraId),
            fornecedores: safeRows(fornecedoresRes).filter((item: any) => !item.obra_id || item.obra_id === obraId),
            composicoes: safeRows(composicoesRes),
            insumosProprios: safeRows(insumosRes),
            resumoSistema: {
              obras: obras.length,
              orcamentos: safeRows(orcamentosRes).length,
              etapas: safeRows(etapasRes).length,
              materiais: safeRows(materiaisRes).length,
              medicoes: safeRows(medicoesRes).length,
              fornecedores: safeRows(fornecedoresRes).length,
              composicoesProprias: safeRows(composicoesRes).length,
              insumosProprios: safeRows(insumosRes).length,
            },
            observacao: 'Chat rapido flutuante. Contexto resumido do sistema carregado somente para leitura.',
          },
        }),
      })
      const data = await res.json()
      void logLuizia({
        origem: 'floating',
        usuario: currentProfile?.name || null,
        pergunta: userMsg.content,
        resposta: data.message || 'Nao consegui responder agora.',
        mode: data.mode,
        model: data.model,
      })
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.message || 'Nao consegui responder agora. Abra o BuildAssistente IA para tentar de novo.',
      }])
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Nao consegui conectar agora. Confira se o servidor local esta ligado.',
      }])
    } finally {
      setLoading(false)
    }
  }

  function openChat() {
    setOpen(true)
  }

  return (
    <>
      {open && (
        <div
          className="fixed bottom-24 right-5 z-50 w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl shadow-2xl overflow-hidden"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white" style={{ background: 'var(--accent)' }}>
                <BotMessageSquare size={16} />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Luiza</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Assistente rapida da obra</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)]" style={{ color: 'var(--text-secondary)' }}>
              <X size={16} />
            </button>
          </div>

          <div className="h-72 overflow-y-auto p-3 flex flex-col gap-3">
            {messages.length === 0 && (
              <div className="text-sm leading-relaxed rounded-xl p-3 whitespace-pre-line" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
                {greeting(currentProfile?.name)}
              </div>
            )}
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`text-sm leading-relaxed rounded-xl p-3 max-w-[88%] ${msg.role === 'user' ? 'self-end' : 'self-start'}`}
                style={msg.role === 'user'
                  ? { background: 'var(--accent)', color: 'white' }
                  : { background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }}
              />
            ))}
            {loading && (
              <div className="self-start rounded-xl p-3" style={{ background: 'var(--bg-secondary)' }}>
                <Loader2 size={16} className="animate-spin" style={{ color: 'var(--text-secondary)' }} />
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="p-3 border-t space-y-2" style={{ borderColor: 'var(--border)' }}>
            <div className="flex gap-2">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                placeholder="Pergunte para a Luiza..."
                className="input-base flex-1 h-10 text-sm"
                disabled={loading}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                className="w-10 h-10 rounded-xl flex items-center justify-center disabled:opacity-50"
                style={{ background: 'var(--accent)' }}
              >
                <Send size={15} className="text-white" />
              </button>
            </div>
            <Link href="/buildassist" className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--accent)' }}>
              Abrir chat completo <ExternalLink size={12} />
            </Link>
          </div>
        </div>
      )}

      <button
        onClick={() => {
          setOpen(v => !v)
        }}
        className="fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-transform hover:scale-105"
        style={{ background: 'var(--accent)', color: 'white' }}
        title="Falar com a Luiza"
      >
        {open ? <X size={22} /> : <MessageCircle size={23} />}
      </button>
    </>
  )
}
