'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { BotMessageSquare, ChevronDown, ChevronUp, ExternalLink, Loader2, Mic, Plus, Send, Trash2 } from 'lucide-react'
import { useProfile } from '@/lib/profile-context'
import { logLuizia } from '@/lib/luizia-monitor'
import { createClient } from '@/lib/supabase/client'
import { useObraOrcamento, TODOS_ORCAMENTOS } from '@/lib/obra-orcamento-context'
import type { LuiziaDraft, LuiziaPageContext } from '@/lib/luizia-work'
import type { LuiziaModo } from '@/lib/luizia-core'

type Message = {
  role: 'user' | 'assistant'
  content: string
}

const CHAT_KEY = 'buildsmart-luizia-floating-chat-session'
const ASSIST_ON_ENTRY_KEY = 'buildsmart-open-luizia-on-entry'
const MODE_KEY = 'buildsmart-luizia-modo'
const DRAFT_KEY = 'buildsmart-luizia-draft'

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

// Deriva projetoId/obraId/orcamentoId/aba da URL atual + da obra/orçamento
// globalmente selecionados (lib/obra-orcamento-context). O contexto da
// página sempre tem prioridade: se a rota é /obras/[id], é essa obra que
// vale, nunca a primeira obra da lista.
function derivarContextoPagina(pathname: string | null, tabParam: string | null, obraIdGlobal: string, orcamentoIdGlobal: string): LuiziaPageContext {
  const obraMatch = pathname?.match(/^\/obras\/([^/?#]+)/)
  const projetoMatch = pathname?.match(/^\/projetos\/([^/?#]+)/)
  const obraIdDaRota = obraMatch && obraMatch[1] !== 'novo' ? obraMatch[1] : null
  const projetoId = projetoMatch && projetoMatch[1] !== 'novo' ? projetoMatch[1] : null
  const obraId = obraIdDaRota || obraIdGlobal || null
  const orcamentoId = orcamentoIdGlobal && orcamentoIdGlobal !== TODOS_ORCAMENTOS ? orcamentoIdGlobal : null
  const aba = obraIdDaRota ? (tabParam || 'projeto') : null

  return { pathname: pathname || null, projetoId, obraId, orcamentoId, aba }
}

export function LuiziaFloatingChat() {
  const { currentProfile } = useProfile()
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { obraId: obraIdGlobal, orcamentoId: orcamentoIdGlobal } = useObraOrcamento()
  const [historyOpen, setHistoryOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [modo, setModo] = useState<LuiziaModo>('chat')
  const [draft, setDraft] = useState<LuiziaDraft | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = sessionStorage.getItem(CHAT_KEY)
    const initial = stored ? JSON.parse(stored) as Message[] : []
    setMessages(initial)

    const storedModo = sessionStorage.getItem(MODE_KEY)
    if (storedModo === 'work' || storedModo === 'chat') setModo(storedModo)

    const storedDraft = sessionStorage.getItem(DRAFT_KEY)
    if (storedDraft) {
      try { setDraft(JSON.parse(storedDraft)) } catch { /* rascunho corrompido, ignora */ }
    }

    setLoaded(true)

    if (sessionStorage.getItem(ASSIST_ON_ENTRY_KEY) === '1') {
      sessionStorage.removeItem(ASSIST_ON_ENTRY_KEY)
      setHistoryOpen(true)
      setMessages(current => current.length > 0
        ? current
        : [{ role: 'assistant', content: greeting(currentProfile?.apelido || currentProfile?.name) }]
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function openFromGuide() {
      setHistoryOpen(true)
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
    if (!loaded || typeof window === 'undefined') return
    sessionStorage.setItem(MODE_KEY, modo)
  }, [modo, loaded])

  useEffect(() => {
    if (!loaded || typeof window === 'undefined') return
    if (draft) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    else sessionStorage.removeItem(DRAFT_KEY)
  }, [draft, loaded])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, historyOpen])

  function limparConversa() {
    setMessages([])
    setDraft(null)
  }

  async function sendMessage() {
    if (!input.trim() || loading) return
    const userMsg: Message = { role: 'user', content: input.trim() }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput('')
    setLoading(true)
    setHistoryOpen(true)

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
        supabase.from('insumos_proprios').select('id,codigo,descricao,unidade,categoria,classificacao,grupo,preco_unitario,ativo').order('codigo').limit(80),
      ])
      const obras = safeRows(obrasRes)

      // Contexto da página manda: a obra da rota atual (ou a última obra
      // selecionada globalmente) tem prioridade sobre qualquer outra —
      // nunca a primeira obra da lista (obras[0]).
      const pagina = derivarContextoPagina(pathname, searchParams.get('tab'), obraIdGlobal, orcamentoIdGlobal)
      const obraId = pagina.obraId || ''
      const obraAtual = obras.find((o: any) => o.id === obraId) || null

      const res = await fetch('/api/buildassist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next,
          complex: false,
          context: {
            modo: 'atalho-luizia',
            modoLuiza: modo,
            pagina,
            draftAtual: draft,
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
      if ('draft' in data) setDraft(data.draft || null)
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Nao consegui conectar agora. Confira se o servidor local esta ligado.',
      }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-3 sm:px-4 sm:pb-4 pointer-events-none">
      <div className="w-full max-w-2xl pointer-events-auto">
        {historyOpen && (
          <div
            className="mb-2 rounded-2xl shadow-2xl overflow-hidden animate-enter"
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
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button
                    onClick={limparConversa}
                    className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)]"
                    style={{ color: 'var(--text-secondary)' }}
                    title="Limpar conversa"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
                <button
                  onClick={() => setHistoryOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)]"
                  style={{ color: 'var(--text-secondary)' }}
                  title="Recolher"
                >
                  <ChevronDown size={16} />
                </button>
              </div>
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

            <div className="px-4 py-2 border-t" style={{ borderColor: 'var(--border)' }}>
              <Link href="/buildassist" className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--accent)' }}>
                Abrir chat completo <ExternalLink size={12} />
              </Link>
            </div>
          </div>
        )}

        <div
          className="rounded-2xl shadow-2xl flex items-center gap-1.5 px-2 py-2 sm:gap-2 sm:px-3"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          <button
            type="button"
            disabled
            title="Anexar (em breve)"
            className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center disabled:opacity-50"
            style={{ color: 'var(--text-secondary)' }}
          >
            <Plus size={18} />
          </button>

          {/* Seletor Chat/Work — discreto, ao estilo de um seletor de modelo
              de IA. Não é um botão grande e não muda o layout da barra. */}
          <div
            className="flex items-center gap-0.5 rounded-full p-0.5 shrink-0"
            style={{ background: 'var(--bg-secondary)' }}
            title="Chat: só leitura. Work: prepara um rascunho de alteração."
          >
            <button
              type="button"
              onClick={() => setModo('chat')}
              className="px-2 sm:px-2.5 h-7 rounded-full text-[11px] font-semibold transition-colors"
              style={modo === 'chat' ? { background: 'var(--accent)', color: 'white' } : { color: 'var(--text-secondary)' }}
            >
              Chat
            </button>
            <button
              type="button"
              onClick={() => setModo('work')}
              className="px-2 sm:px-2.5 h-7 rounded-full text-[11px] font-semibold transition-colors"
              style={modo === 'work' ? { background: 'var(--accent)', color: 'white' } : { color: 'var(--text-secondary)' }}
            >
              Work
            </button>
          </div>

          {!historyOpen && messages.length > 0 && (
            <button
              onClick={() => setHistoryOpen(true)}
              className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center hover:bg-[var(--bg-secondary)]"
              style={{ color: 'var(--text-secondary)' }}
              title="Ver conversa"
            >
              <ChevronUp size={18} />
            </button>
          )}

          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            onFocus={() => messages.length > 0 && setHistoryOpen(true)}
            placeholder={modo === 'work' ? 'Peça uma alteração ou pergunte à Luiza...' : 'Pergunte à Luiza...'}
            className="flex-1 min-w-0 h-10 text-sm bg-transparent border-0 outline-none placeholder:text-[var(--text-secondary)]"
            style={{ color: 'var(--text-primary)' }}
            disabled={loading}
          />

          <button
            type="button"
            disabled
            title="Microfone (em breve)"
            className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center disabled:opacity-50"
            style={{ color: 'var(--text-secondary)' }}
          >
            <Mic size={18} />
          </button>

          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
            title="Enviar"
          >
            {loading ? <Loader2 size={16} className="animate-spin text-white" /> : <Send size={15} className="text-white" />}
          </button>
        </div>
      </div>
    </div>
  )
}
