'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeftRight, BotMessageSquare, CheckCircle2, ChevronDown, ChevronUp, ExternalLink, Loader2, Mic, Plus, Send, Trash2, X } from 'lucide-react'
import { useProfile } from '@/lib/profile-context'
import { logLuizia } from '@/lib/luizia-monitor'
import { createClient } from '@/lib/supabase/client'
import { useObraOrcamento, TODOS_ORCAMENTOS } from '@/lib/obra-orcamento-context'
import { detectSkill, type LuiziaDraft, type LuiziaPageContext } from '@/lib/luizia-work'
import type { LuiziaModo } from '@/lib/luizia-core'
import {
  readLuizaMessages, writeLuizaMessages, readLuizaModo, writeLuizaModo, readLuizaDraft, writeLuizaDraft,
  type LuizaChatMessage,
} from '@/lib/luizia-chat-storage'

type Message = LuizaChatMessage

type UploadedFile = {
  nome: string
  tipo: string
  tamanho: number
  conteudo?: string
  dataUrl?: string
}

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

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'))
    reader.readAsDataURL(file)
  })
}

function isWebSearchRequest(text: string) {
  return /\b(pesquis(e|a|ar)|busc(a|ar)|procure|internet|web|not[íi]cia|noticias|atualizado|mais recente|últim[ao]s?|pre[çc]o atual|norma atual)\b/i.test(text)
}

// Deriva projetoId/obraId/orcamentoId/aba da URL atual + da obra/orçamento
// globalmente selecionados (lib/obra-orcamento-context). O contexto da
// página sempre tem prioridade: se a rota é /obras/[id], é essa obra que
// vale, nunca a primeira obra da lista.
function derivarContextoPagina(pathname: string | null, tabParam: string | null, obraIdGlobal: string, orcamentoIdGlobal: string): LuiziaPageContext {
  const obraMatch = pathname?.match(/^\/obras\/([^/?#]+)/)
  const projetoMatch = pathname?.match(/^\/projetos\/([^/?#]+)/)
  const prospeccaoMatch = pathname?.match(/^\/investidor\/([^/?#]+)/)
  const obraIdDaRota = obraMatch && obraMatch[1] !== 'novo' ? obraMatch[1] : null
  const projetoId = projetoMatch && projetoMatch[1] !== 'novo' ? projetoMatch[1] : null
  const prospeccaoId = prospeccaoMatch ? prospeccaoMatch[1] : null
  const obraId = obraIdDaRota || obraIdGlobal || null
  const orcamentoId = orcamentoIdGlobal && orcamentoIdGlobal !== TODOS_ORCAMENTOS ? orcamentoIdGlobal : null
  // `aba` também precisa existir para rotas de Projeto (não só Obra) — é o
  // sinal que diz "estou na aba Tarefas deste projeto/obra", usado para
  // herdar obra_id/projeto_id nas consultas de Tarefas (Luiza unificada).
  const aba = obraIdDaRota ? (tabParam || 'projeto') : projetoId ? (tabParam || null) : null

  return { pathname: pathname || null, projetoId, obraId, orcamentoId, aba, prospeccaoId }
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
  const [modoFeedback, setModoFeedback] = useState<LuiziaModo | null>(null)
  const [draft, setDraft] = useState<LuiziaDraft | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Qual profile_id o estado React ATUAL pertence a — os efeitos de
  // salvamento abaixo gravam usando esta ref (não currentProfile?.id direto)
  // para nunca escrever o conteúdo de um perfil na chave de outro durante a
  // troca (ver o efeito de troca de perfil logo abaixo).
  const activeProfileIdRef = useRef<string | null | undefined>(undefined)
  const entradaTratadaRef = useRef(false)

  // Troca de perfil (ou carga inicial): limpa o estado React IMEDIATAMENTE
  // (useLayoutEffect — antes do navegador pintar, nunca um frame com
  // conteúdo do perfil anterior) e carrega chat/modo/draft do novo perfil a
  // partir da chave namespaced dele. Nunca restaura histórico de outro
  // usuário; sem currentProfile, só o bucket "anon" (nunca contém conversa
  // real) é usado.
  useLayoutEffect(() => {
    const novoId = currentProfile?.id ?? null
    if (activeProfileIdRef.current === novoId) return
    activeProfileIdRef.current = novoId

    if (typeof window === 'undefined') { setLoaded(true); return }

    setMessages(readLuizaMessages(sessionStorage, novoId))
    setModo(readLuizaModo(sessionStorage, novoId))
    setDraft(readLuizaDraft<LuiziaDraft>(sessionStorage, novoId))

    setLoaded(true)

    // O "abrir com saudação ao entrar" é por navegação de página, não por
    // perfil — só dispara uma vez por montagem do componente, nunca de novo
    // a cada troca de perfil.
    if (!entradaTratadaRef.current && sessionStorage.getItem(ASSIST_ON_ENTRY_KEY) === '1') {
      entradaTratadaRef.current = true
      sessionStorage.removeItem(ASSIST_ON_ENTRY_KEY)
      setHistoryOpen(true)
      setMessages(current => current.length > 0
        ? current
        : [{ role: 'assistant', content: greeting(currentProfile?.apelido || currentProfile?.name) }]
      )
    }
    // apelido/name só entram na saudação; deliberadamente não disparam este
    // efeito de novo sozinhos — só uma troca real de profile_id deve limpar
    // e recarregar o estado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProfile?.id])

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
    writeLuizaMessages(sessionStorage, activeProfileIdRef.current, messages)
  }, [messages, loaded])

  useEffect(() => {
    if (!loaded || typeof window === 'undefined') return
    writeLuizaModo(sessionStorage, activeProfileIdRef.current, modo)
  }, [modo, loaded])

  useEffect(() => {
    if (!loaded || typeof window === 'undefined') return
    writeLuizaDraft(sessionStorage, activeProfileIdRef.current, draft)
  }, [draft, loaded])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, historyOpen])

  useEffect(() => () => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
  }, [])

  function limparConversa() {
    setMessages([])
    setDraft(null)
    setUploadedFiles([])
  }

  function alternarModo() {
    const proximo: LuiziaModo = modo === 'chat' ? 'work' : 'chat'
    setModo(proximo)
    setModoFeedback(proximo)
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
    feedbackTimerRef.current = setTimeout(() => setModoFeedback(null), 1400)
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length || loading) return
    const parsed: UploadedFile[] = []

    for (const file of Array.from(files)) {
      const tipo = file.type || 'arquivo'
      const item: UploadedFile = { nome: file.name, tipo, tamanho: file.size }
      const isText = tipo.startsWith('text/') || /\.(txt|md|csv|json)$/i.test(file.name)
      const isPdf = tipo === 'application/pdf' || /\.pdf$/i.test(file.name)
      const isImage = tipo.startsWith('image/')
      const isAudio = tipo.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|webm)$/i.test(file.name)

      if (isImage) {
        item.dataUrl = await readAsDataUrl(file)
      } else if (isText) {
        item.conteudo = (await file.text()).slice(0, 12000)
      } else if (isPdf) {
        try {
          const fd = new FormData()
          fd.append('file', file)
          const res = await fetch('/api/extract-pdf', { method: 'POST', body: fd })
          const data = await res.json()
          item.conteudo = data?.texto
            ? `[PDF ${data.paginas || '?'} pág.] ${String(data.texto).slice(0, 12000)}`
            : 'PDF recebido, mas não foi possível extrair texto automaticamente.'
        } catch {
          item.conteudo = 'PDF recebido, mas não foi possível extrair texto automaticamente.'
        }
      } else if (isAudio) {
        try {
          const fd = new FormData()
          fd.append('file', file)
          const res = await fetch('/api/luizia-transcribe', { method: 'POST', body: fd })
          const data = await res.json()
          item.conteudo = data?.texto
            ? `[áudio transcrito] ${String(data.texto).slice(0, 12000)}`
            : 'Áudio recebido, mas não foi possível transcrever automaticamente.'
        } catch {
          item.conteudo = 'Áudio recebido, mas não foi possível transcrever automaticamente.'
        }
      }

      parsed.push(item)
    }

    setUploadedFiles(prev => [...prev, ...parsed])
    if (!input.trim()) setInput('Analise os anexos enviados e relacione com a obra atual.')
  }

  function removeUploadedFile(index: number) {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index))
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
      // Contexto da página manda: a obra da rota atual (ou a última obra
      // selecionada globalmente) tem prioridade sobre qualquer outra —
      // nunca a primeira obra da lista (obras[0]).
      const pagina = derivarContextoPagina(pathname, searchParams.get('tab'), obraIdGlobal, orcamentoIdGlobal)
      const usuario = currentProfile ? {
        id: currentProfile.id,
        name: currentProfile.name,
        apelido: currentProfile.apelido,
        cidade: currentProfile.cidade,
        estado: currentProfile.estado,
        tipo: currentProfile.tipo,
      } : null

      // Tarefas e Avisos têm tools/consulta próprias no servidor
      // (lib/luizia-tarefas-runtime.ts / lib/luizia-avisos-runtime.ts) —
      // contexto sob demanda: nem pergunta o banco inteiro (obras/
      // orçamentos/etapas/materiais/medições/fornecedores/composições/
      // insumos) pra uma pergunta de tarefa ou aviso, o servidor busca só o
      // que a tool precisar.
      const skill = detectSkill(pagina, userMsg.content)
      const contextoBase = {
        modo: 'atalho-luizia',
        modoLuiza: modo,
        pagina,
        draftAtual: draft,
        geradoEm: new Date().toISOString(),
        usuario,
        uploadedFiles,
        webSearch: isWebSearchRequest(userMsg.content),
      }

      const body = (skill === 'tarefas' || skill === 'avisos')
        ? { messages: next, complex: false, context: contextoBase }
        : await (async () => {
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
            const obraId = pagina.obraId || ''
            const obraAtual = obras.find((o: any) => o.id === obraId) || null
            return {
              messages: next,
              complex: false,
              context: {
                ...contextoBase,
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
            }
          })()

      const res = await fetch('/api/buildassist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
      setUploadedFiles([])
      // Luiza escreveu em `tarefas` ou em `luizia_wa_dispatches` fora da
      // página que os mostra (ou dela mesma, se estava aberta em outra aba)
      // — avisa quem estiver ouvindo para recarregar sem precisar de F5.
      // Ver app/(app)/tarefas/page.tsx e app/(app)/admin-luiza/page.tsx.
      if (typeof window !== 'undefined') {
        if (data.mutatedDomain === 'tarefas') window.dispatchEvent(new Event('buildsmart:tarefas-changed'))
        else if (data.mutatedDomain === 'avisos') window.dispatchEvent(new Event('buildsmart:luiza-dispatches-changed'))
        else if (data.mutatedDomain === 'investidor') window.dispatchEvent(new Event('buildsmart:investidor-changed'))
      }
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
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,application/pdf,text/*,.txt,.md,.csv,.json"
            className="hidden"
            onChange={event => void handleFiles(event.target.files)}
          />
          <input
            ref={audioInputRef}
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm"
            className="hidden"
            onChange={event => void handleFiles(event.target.files)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Anexar imagem, PDF ou texto"
            className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center hover:bg-[var(--bg-secondary)]"
            style={{ color: 'var(--text-secondary)' }}
          >
            <Plus size={18} />
          </button>

          <div className="relative shrink-0">
            <button
              type="button"
              onClick={alternarModo}
              title={modo === 'chat' ? 'Modo Chat — mudar para Work' : 'Modo Work — mudar para Chat'}
              aria-label={modo === 'chat' ? 'Modo Chat — mudar para Work' : 'Modo Work — mudar para Chat'}
              className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
              style={modo === 'work'
                ? { background: 'color-mix(in srgb, var(--accent) 16%, transparent)', color: 'var(--accent)', border: '1px solid color-mix(in srgb, var(--accent) 40%, var(--border))' }
                : { background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              <ArrowLeftRight size={15} />
            </button>
            {modoFeedback && (
              <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-semibold shadow-lg"
                style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                Modo {modoFeedback === 'chat' ? 'Chat' : 'Work'}
              </span>
            )}
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
            onClick={() => audioInputRef.current?.click()}
            title="Enviar áudio para transcrever"
            className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center hover:bg-[var(--bg-secondary)]"
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
        {uploadedFiles.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5 rounded-xl px-2 py-2 text-xs pointer-events-auto" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            {uploadedFiles.map((file, index) => (
              <span key={`${file.nome}-${file.tamanho}-${index}`} className="inline-flex max-w-full items-center gap-1.5 rounded-lg px-2 py-1" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                <CheckCircle2 size={12} style={{ color: 'var(--success)' }} />
                <span className="truncate">{file.nome}</span>
                <span className="shrink-0 opacity-70">{formatBytes(file.tamanho)}</span>
                <button type="button" onClick={() => removeUploadedFile(index)} className="shrink-0 rounded p-0.5 hover:bg-black/10" title="Remover anexo">
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
