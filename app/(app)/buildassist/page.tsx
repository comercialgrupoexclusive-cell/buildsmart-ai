'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Bot, CalendarDays, CheckCircle2, Cloud, FileSearch, FileText, Loader2,
  Package, RefreshCw, Send, Upload, Users2,
} from 'lucide-react'
import { useProfile } from '@/lib/profile-context'
import { createClient } from '@/lib/supabase/client'

type Message = {
  role: 'user' | 'assistant'
  content: string
}

type UploadedFile = {
  nome: string
  tipo: string
  tamanho: number
  conteudo?: string
}

type BuildContext = {
  modo: 'local'
  obraAtual: any
  obras: any[]
  orcamentos: any[]
  itensOrcamento: any[]
  etapas: any[]
  materiais: any[]
  medicoes: any[]
  composicoes: any[]
  insumos: any[]
  arquivos: any[]
  uploadedFiles: UploadedFile[]
}

type Insight = {
  icon: React.ReactNode
  label: string
  title: string
  description: string
  color: string
  prompt: string
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function storageKey(obraId: string) {
  return `buildsmart_obra_arquivos_${obraId}`
}

export default function BuildAssistPage() {
  const { currentProfile } = useProfile()
  const supabase = createClient()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [insights, setInsights] = useState<Insight[]>([])
  const [openingMsg, setOpeningMsg] = useState('')
  const [context, setContext] = useState<BuildContext | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadContext(uploadedFiles) }, [uploadedFiles])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  function getRequestedObraId() {
    if (typeof window === 'undefined') return ''
    return new URLSearchParams(window.location.search).get('obra') || ''
  }

  function readArquivosDaObra(obraId: string) {
    if (typeof window === 'undefined' || !obraId) return []
    try {
      return JSON.parse(localStorage.getItem(storageKey(obraId)) || '[]')
    } catch {
      return []
    }
  }

  async function loadContext(files: UploadedFile[]) {
    const [
      obrasRes,
      orcamentosRes,
      itensRes,
      etapasRes,
      materiaisRes,
      medicoesRes,
      composicoesRes,
      insumosRes,
    ] = await Promise.all([
      supabase.from('obras').select('*').order('created_at', { ascending: false }),
      supabase.from('orcamentos').select('*').order('created_at', { ascending: false }),
      supabase.from('orcamento_itens').select('*'),
      supabase.from('etapas').select('*, obras(nome)').order('data_inicio'),
      supabase.from('materiais').select('*, obras(nome)').order('data_necessidade'),
      supabase.from('medicoes').select('*, obras(nome)').order('created_at', { ascending: false }),
      supabase.from('composicoes_proprias').select('*').limit(20),
      supabase.from('sinapi_insumos').select('*').limit(30),
    ])

    const obras = obrasRes.data || []
    const requestedObraId = getRequestedObraId()
    const obraAtual = obras.find((obra: any) => obra.id === requestedObraId) || obras[0] || null
    const obraId = obraAtual?.id

    const ctx: BuildContext = {
      modo: 'local',
      obraAtual,
      obras,
      orcamentos: (orcamentosRes.data || []).filter((item: any) => !obraId || item.obra_id === obraId),
      itensOrcamento: itensRes.data || [],
      etapas: (etapasRes.data || []).filter((item: any) => !obraId || item.obra_id === obraId),
      materiais: (materiaisRes.data || []).filter((item: any) => !obraId || item.obra_id === obraId),
      medicoes: (medicoesRes.data || []).filter((item: any) => !obraId || item.obra_id === obraId),
      composicoes: composicoesRes.data || [],
      insumos: insumosRes.data || [],
      arquivos: readArquivosDaObra(obraId),
      uploadedFiles: files,
    }

    setContext(ctx)
    buildOpening(ctx)
    buildInsights(ctx)
  }

  function buildOpening(ctx: BuildContext) {
    const etapas = ctx.etapas.filter(e => e.status !== 'concluida')
    const materiais = ctx.materiais.filter(m => m.status_compra !== 'comprado')
    let msg = `Olá${currentProfile ? `, ${currentProfile.name}` : ''}! `

    if (ctx.obraAtual) msg += `Estou olhando a obra **${ctx.obraAtual.nome}**. `
    if (etapas.length > 0) {
      const prox = etapas[0]
      msg += `A próxima etapa prevista é **${prox.nome}**${prox.data_inicio ? ` em ${prox.data_inicio}` : ''}. `
    }
    if (materiais.length > 0) {
      msg += `Há ${materiais.length} ${materiais.length === 1 ? 'material em acompanhamento' : 'materiais em acompanhamento'}. `
    }
    if (ctx.arquivos.length > 0) {
      msg += `Também encontrei ${ctx.arquivos.length} arquivo(s) anexado(s) à obra. `
    }
    msg += 'Posso ajudar a interpretar projetos, organizar orçamento, prever materiais e apoiar decisões da obra.'
    setOpeningMsg(msg)
  }

  function buildInsights(ctx: BuildContext) {
    const materiais = ctx.materiais.filter(m => m.status_compra !== 'comprado')
    const etapas = ctx.etapas.filter(e => e.status !== 'concluida')
    const arquivos = [...ctx.arquivos, ...ctx.uploadedFiles]

    const next: Insight[] = [
      {
        icon: <Package size={16} />,
        label: 'MATERIAIS',
        title: `${materiais.length} itens para acompanhar`,
        description: materiais[0]?.descricao || 'Lista de compra ainda pode ser refinada',
        color: 'var(--warning)',
        prompt: 'Liste os materiais previstos e sugira uma ordem simples de compra por etapa.',
      },
      {
        icon: <Users2 size={16} />,
        label: 'CRONOGRAMA',
        title: etapas[0]?.nome || 'Sem próxima etapa',
        description: etapas[0]?.data_inicio ? `Prevista para ${etapas[0].data_inicio}` : 'Monte etapas para melhorar previsões',
        color: 'var(--accent)',
        prompt: 'Analise o cronograma e diga quais são os próximos passos objetivos.',
      },
      {
        icon: <FileSearch size={16} />,
        label: 'ARQUIVOS',
        title: `${arquivos.length} arquivo(s) disponíveis`,
        description: arquivos[0]?.nome || 'Anexe plantas, memoriais ou imagens da obra',
        color: 'var(--success)',
        prompt: 'Leia os arquivos disponíveis e resuma o que ajuda no orçamento, cronograma e materiais.',
      },
      {
        icon: <Cloud size={16} />,
        label: 'PREVISÕES',
        title: 'Próximas decisões',
        description: 'Síntese objetiva com base no orçamento e avanço',
        color: '#8B5CF6',
        prompt: 'Gere previsões objetivas de próximas etapas, materiais e decisões da obra.',
      },
    ]
    setInsights(next)
  }

  function aplicarPrompt(texto: string) {
    setInput(texto)
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return
    const parsed: UploadedFile[] = []

    for (const file of Array.from(files)) {
      const isText = file.type.startsWith('text/') || /\.(txt|md|csv|json)$/i.test(file.name)
      const item: UploadedFile = {
        nome: file.name,
        tipo: file.type || 'arquivo',
        tamanho: file.size,
      }

      if (isText) {
        const text = await file.text()
        item.conteudo = text.slice(0, 12000)
      }

      parsed.push(item)
    }

    setUploadedFiles(prev => [...prev, ...parsed])
    setInput('Analise os arquivos enviados e diga o que ajuda no orçamento, cronograma, materiais e próximas decisões da obra.')
  }

  function shouldUseComplexModel(text: string) {
    const value = text.toLowerCase()
    return uploadedFiles.length > 0
      || value.includes('arquivo')
      || value.includes('projeto')
      || value.includes('planta')
      || value.includes('orçamento')
      || value.includes('orcamento')
      || value.includes('cronograma')
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
          complex: shouldUseComplexModel(userMsg.content),
          profileId: currentProfile?.id,
          context,
        }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.message || 'Não consegui processar agora. Verifique a configuração da IA.',
      }])
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Erro de conexão com a IA. Nesta fase local, confira se o servidor está ligado e se a chave da OpenAI foi configurada.',
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
      <div className="flex-1 flex flex-col card overflow-hidden">
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

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex items-start gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: msg.role === 'user' ? (currentProfile?.theme_color || 'var(--accent)') : 'var(--accent)' }}
              >
                {msg.role === 'user'
                  ? <span className="text-white text-xs font-bold">{currentProfile?.name.charAt(0).toUpperCase() || 'U'}</span>
                  : <Bot size={14} className="text-white" />}
              </div>
              <div
                className="max-w-[80%] p-3 rounded-xl text-sm leading-relaxed"
                style={msg.role === 'user'
                  ? { background: 'var(--accent)', color: 'white', borderRadius: '12px 4px 12px 12px' }
                  : { background: 'var(--bg-secondary)', color: 'var(--text-primary)', borderRadius: '4px 12px 12px 12px' }}
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

        <div className="p-4 border-t flex flex-col gap-3" style={{ borderColor: 'var(--border)' }}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={event => handleFiles(event.target.files)}
          />

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors hover:bg-[var(--bg-secondary)]"
              style={{ color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            >
              <Upload size={14} style={{ color: 'var(--accent)' }} />
              Enviar projeto
            </button>
            {[
              { icon: FileSearch, label: 'Ler arquivos da obra', prompt: 'Leia os arquivos anexados desta obra e resuma informações úteis para orçamento, cronograma e materiais.' },
              { icon: FileText, label: 'Ajudar no orçamento', prompt: 'Com base na obra atual, sugira um caminho simples para montar o orçamento executivo.' },
              { icon: CalendarDays, label: 'Gerar previsões', prompt: 'Gere previsões objetivas de próximas etapas, materiais e pontos de decisão da obra.' },
            ].map(action => (
              <button
                key={action.label}
                onClick={() => aplicarPrompt(action.prompt)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors hover:bg-[var(--bg-secondary)]"
                style={{ color: 'var(--text-primary)', border: '1px solid var(--border)' }}
              >
                <action.icon size={14} style={{ color: 'var(--accent)' }} />
                {action.label}
              </button>
            ))}
          </div>

          {uploadedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {uploadedFiles.map(file => (
                <span key={`${file.nome}-${file.tamanho}`} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                  <CheckCircle2 size={12} style={{ color: 'var(--success)' }} />
                  {file.nome} · {formatBytes(file.tamanho)}
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-3">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="Pergunte sobre projeto, orçamento, cronograma, materiais ou previsões..."
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
              className="flex items-center gap-1.5 text-xs transition-colors"
              style={{ color: 'var(--text-secondary)' }}
            >
              <RefreshCw size={12} /> Nova conversa
            </button>
          )}
        </div>
      </div>

      <div className="w-64 flex flex-col gap-3">
        <h2 className="text-sm font-semibold px-1" style={{ color: 'var(--text-secondary)' }}>
          Previsões do sistema
        </h2>
        {insights.map((insight, i) => (
          <div key={i} className="card p-4 cursor-pointer hover:scale-[1.02] transition-transform" onClick={() => setInput(insight.prompt)}>
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
      </div>
    </div>
  )
}
