'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Bot, CheckCircle2, Cloud, FileSearch, Loader2,
  Package, RefreshCw, Send, ShoppingCart, Upload, Users2,
} from 'lucide-react'
import { useProfile } from '@/lib/profile-context'
import { createClient } from '@/lib/supabase/client'
import { logLuizia } from '@/lib/luizia-monitor'

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
  modo: 'sistema'
  geradoEm: string
  usuario: any
  resumoSistema: Record<string, number>
  obraAtual: any
  obras: any[]
  orcamentos: any[]
  itensOrcamento: any[]
  insumosOrcamento: any[]
  etapas: any[]
  materiais: any[]
  medicoes: any[]
  diario: any[]
  progresso: Record<string, number>
  composicoes: any[]
  composicaoInsumos: any[]
  insumos: any[]
  insumosProprios: any[]
  sinapiComposicoes: any[]
  sinapiComposicaoItens: any[]
  fornecedores: any[]
  obraFornecedores: any[]
  listasCompras: any[]
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

const CHAT_STORAGE_KEY = 'buildsmart-luizia-chat-session'

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function storageKey(obraId: string) {
  return `buildsmart_obra_arquivos_${obraId}`
}

function listasStorageKey(obraId: string) {
  return `bs_listas_compra_${obraId}`
}

function diarioStorageKey(obraId: string) {
  return `bs_diario_${obraId}`
}

function progressoStorageKey(obraId: string) {
  return `bs_progresso_${obraId}`
}

function readJsonStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined' || !key) return fallback
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : fallback
  } catch {
    return fallback
  }
}

function pick(row: any, fields: string[]) {
  if (!row) return row
  return fields.reduce((acc, field) => {
    if (row[field] !== undefined && row[field] !== null) acc[field] = row[field]
    return acc
  }, {} as Record<string, any>)
}

function compactInsumo(row: any, uf = 'SP') {
  const base = pick(row, ['id', 'codigo', 'descricao', 'unidade', 'classificacao', 'grupo', 'categoria', 'preco_unitario', 'ativo'])
  const precoUf = row?.precos?.[uf] ?? row?.precos?.SP
  if (precoUf !== undefined) base.preco_uf = precoUf
  return base
}

function compactSinapiComposicao(row: any, uf = 'SP') {
  const base = pick(row, ['id', 'codigo', 'descricao', 'unidade', 'grupo', 'situacao', 'mes_referencia'])
  const custoUf = row?.custos?.[uf] ?? row?.custos?.SP
  if (custoUf !== undefined) base.custo_uf = custoUf
  return base
}

function compactProfile(profile: any) {
  return pick(profile, ['id', 'name', 'apelido', 'descricao', 'cidade', 'estado', 'tipo'])
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
  const [chatLoaded, setChatLoaded] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = sessionStorage.getItem(CHAT_STORAGE_KEY)
    setMessages(stored ? JSON.parse(stored) as Message[] : [])
    setChatLoaded(true)
  }, [])

  useEffect(() => { loadContext(uploadedFiles) }, [uploadedFiles])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  useEffect(() => {
    if (typeof window === 'undefined' || !chatLoaded) return
    sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-60)))
  }, [messages, chatLoaded])

  function getRequestedObraId() {
    if (typeof window === 'undefined') return ''
    return new URLSearchParams(window.location.search).get('obra') || ''
  }

  async function loadContext(files: UploadedFile[]) {
    const [
      obrasRes,
      orcamentosRes,
      itensRes,
      etapasRes,
      materiaisRes,
      medicoesRes,
      orcamentoInsumosRes,
      composicoesRes,
      composicaoInsumosRes,
      insumosRes,
      insumosPropriosRes,
      sinapiComposicoesRes,
      sinapiComposicaoItensRes,
      fornecedoresRes,
      obraFornecedoresRes,
      profilesRes,
    ] = await Promise.all([
      supabase.from('obras').select('*').order('created_at', { ascending: false }),
      supabase.from('orcamentos').select('*').order('created_at', { ascending: false }),
      supabase.from('orcamento_itens').select('*'),
      supabase.from('etapas').select('*, obras(nome)').order('data_inicio'),
      supabase.from('materiais').select('*, obras(nome)').order('data_necessidade'),
      supabase.from('medicoes').select('*, obras(nome)').order('created_at', { ascending: false }),
      supabase.from('orcamento_item_insumos').select('*'),
      supabase.from('composicoes_proprias').select('*').order('codigo'),
      supabase.from('composicao_insumos').select('*'),
      supabase.from('sinapi_insumos').select('*').order('codigo'),
      supabase.from('insumos_proprios').select('*').order('codigo'),
      supabase.from('sinapi_composicoes').select('*').order('codigo'),
      supabase.from('sinapi_composicao_itens').select('*'),
      supabase.from('fornecedores').select('*').order('nome'),
      supabase.from('obra_fornecedores').select('*'),
      supabase.from('profiles').select('id,name,apelido,descricao,cidade,estado,tipo'),
    ])

    const obras = obrasRes.data || []
    const requestedObraId = getRequestedObraId()
    const obraAtual = obras.find((obra: any) => obra.id === requestedObraId) || obras[0] || null
    const obraId = obraAtual?.id || ''
    const uf = obraAtual?.uf || currentProfile?.estado || 'SP'
    const orcamentosDaObra = (orcamentosRes.data || []).filter((item: any) => !obraId || item.obra_id === obraId)
    const orcamentoIds = new Set(orcamentosDaObra.map((orc: any) => orc.id))
    const itemIds = new Set((itensRes.data || [])
      .filter((item: any) => orcamentoIds.has(item.orcamento_id))
      .map((item: any) => item.id))

    const ctx: BuildContext = {
      modo: 'sistema',
      geradoEm: new Date().toISOString(),
      usuario: currentProfile ? compactProfile(currentProfile) : null,
      resumoSistema: {
        usuarios: profilesRes.data?.length || 0,
        obras: obras.length,
        orcamentos: orcamentosRes.data?.length || 0,
        itensOrcamento: itensRes.data?.length || 0,
        insumosOrcamento: orcamentoInsumosRes.data?.length || 0,
        etapas: etapasRes.data?.length || 0,
        materiais: materiaisRes.data?.length || 0,
        medicoes: medicoesRes.data?.length || 0,
        fornecedores: fornecedoresRes.data?.length || 0,
        composicoesProprias: composicoesRes.data?.length || 0,
        composicaoInsumos: composicaoInsumosRes.data?.length || 0,
        sinapiInsumos: insumosRes.data?.length || 0,
        sinapiComposicoes: sinapiComposicoesRes.data?.length || 0,
        sinapiComposicaoItens: sinapiComposicaoItensRes.data?.length || 0,
      },
      obraAtual: obraAtual ? pick(obraAtual, ['id', 'nome', 'endereco', 'status', 'data_inicio', 'data_previsao', 'responsavel', 'area_m2', 'uf']) : null,
      obras: obras.map((obra: any) => pick(obra, ['id', 'nome', 'endereco', 'status', 'data_inicio', 'data_previsao', 'responsavel', 'area_m2', 'uf'])),
      orcamentos: orcamentosDaObra,
      itensOrcamento: (itensRes.data || []).filter((item: any) => orcamentoIds.has(item.orcamento_id)),
      insumosOrcamento: (orcamentoInsumosRes.data || []).filter((item: any) => itemIds.has(item.orcamento_item_id)),
      etapas: (etapasRes.data || []).filter((item: any) => !obraId || item.obra_id === obraId),
      materiais: (materiaisRes.data || []).filter((item: any) => !obraId || item.obra_id === obraId),
      medicoes: (medicoesRes.data || []).filter((item: any) => !obraId || item.obra_id === obraId),
      diario: readJsonStorage<any[]>(diarioStorageKey(obraId), []),
      progresso: readJsonStorage<Record<string, number>>(progressoStorageKey(obraId), {}),
      composicoes: (composicoesRes.data || []).map((item: any) => pick(item, ['id', 'codigo', 'descricao', 'unidade', 'grupo', 'custo_calculado', 'ativo'])),
      composicaoInsumos: (composicaoInsumosRes.data || []).map((item: any) => pick(item, ['id', 'composicao_id', 'insumo_id', 'insumo_proprio_id', 'coeficiente', 'tipo'])),
      insumos: (insumosRes.data || []).map((item: any) => compactInsumo(item, uf)),
      insumosProprios: (insumosPropriosRes.data || []).map((item: any) => compactInsumo(item, uf)),
      sinapiComposicoes: (sinapiComposicoesRes.data || []).map((item: any) => compactSinapiComposicao(item, uf)),
      sinapiComposicaoItens: (sinapiComposicaoItensRes.data || []).map((item: any) => pick(item, ['id', 'composicao_codigo', 'mes_referencia', 'tipo', 'item_codigo', 'item_descricao', 'item_unidade', 'coeficiente', 'situacao'])),
      fornecedores: (fornecedoresRes.data || []).filter((item: any) => !item.obra_id || item.obra_id === obraId),
      obraFornecedores: (obraFornecedoresRes.data || []).filter((item: any) => !obraId || item.obra_id === obraId),
      listasCompras: readJsonStorage<any[]>(listasStorageKey(obraId), []),
      arquivos: readJsonStorage<any[]>(storageKey(obraId), []),
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
    if (ctx.listasCompras.length > 0) {
      msg += `Também encontrei ${ctx.listasCompras.length} lista(s) de compra. `
    }
    if (ctx.diario.length > 0) {
      msg += `Há ${ctx.diario.length} registro(s) de diário da obra. `
    }
    if (ctx.arquivos.length > 0) {
      msg += `E ${ctx.arquivos.length} arquivo(s) anexado(s) à obra. `
    }
    msg += 'Eu sou a Luiza, sua IA da obra. Posso ajudar a interpretar projetos, organizar orçamento, prever materiais, compras, avanço e próximas decisões.'
    setOpeningMsg(msg)
  }

  function buildInsights(ctx: BuildContext) {
    const materiais = ctx.materiais.filter(m => m.status_compra !== 'comprado')
    const etapas = ctx.etapas.filter(e => e.status !== 'concluida')
    const arquivos = [...ctx.arquivos, ...ctx.uploadedFiles]
    const abertas = ctx.listasCompras.filter((lista: any) => lista.status !== 'concluida')

    setInsights([
      {
        icon: <Package size={16} />,
        label: 'MATERIAIS',
        title: `${materiais.length} itens para acompanhar`,
        description: materiais[0]?.descricao || 'Lista de compra ainda pode ser refinada',
        color: 'var(--warning)',
        prompt: 'Liste os materiais previstos e sugira uma ordem simples de compra por etapa e subetapa.',
      },
      {
        icon: <ShoppingCart size={16} />,
        label: 'COMPRAS',
        title: `${abertas.length} lista(s) em aberto`,
        description: ctx.fornecedores[0]?.nome || 'Fornecedores podem apoiar as compras',
        color: '#22C55E',
        prompt: 'Analise listas de compra, materiais em aberto e fornecedores. Sugira próximos passos práticos.',
      },
      {
        icon: <Users2 size={16} />,
        label: 'CRONOGRAMA',
        title: etapas[0]?.nome || 'Sem próxima etapa',
        description: etapas[0]?.data_inicio ? `Prevista para ${etapas[0].data_inicio}` : 'Monte etapas para melhorar previsões',
        color: 'var(--accent)',
        prompt: 'Analise o cronograma, diário e progresso. Diga quais são os próximos passos objetivos.',
      },
      {
        icon: <FileSearch size={16} />,
        label: 'ARQUIVOS',
        title: `${arquivos.length} arquivo(s) disponíveis`,
        description: arquivos[0]?.nome || 'Anexe plantas, memoriais ou imagens da obra',
        color: 'var(--success)',
        prompt: 'Leia os arquivos disponíveis e resuma o que ajuda no orçamento, cronograma, compras e materiais.',
      },
      {
        icon: <Cloud size={16} />,
        label: 'PREVISÕES',
        title: 'Próximas decisões',
        description: 'Síntese objetiva com base no orçamento e avanço',
        color: '#8B5CF6',
        prompt: 'Gere previsões objetivas de próximas etapas, materiais, compras e decisões da obra.',
      },
    ])
  }

  function aplicarPrompt(texto: string) {
    setInput(texto)
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return
    const parsed: UploadedFile[] = []

    for (const file of Array.from(files)) {
      const isText = file.type.startsWith('text/') || /\.(txt|md|csv|json)$/i.test(file.name)
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
      const item: UploadedFile = {
        nome: file.name,
        tipo: file.type || 'arquivo',
        tamanho: file.size,
      }

      if (isText) {
        const text = await file.text()
        item.conteudo = text.slice(0, 12000)
      } else if (isPdf) {
        // Extrai o texto do PDF no servidor para a IA conseguir ler o conteúdo
        try {
          const fd = new FormData()
          fd.append('file', file)
          const res = await fetch('/api/extract-pdf', { method: 'POST', body: fd })
          const data = await res.json()
          if (data?.texto) {
            item.conteudo = `[PDF ${data.paginas} pág.] ${data.texto}`.slice(0, 12000)
          }
        } catch { /* PDF fica só como metadata se a extração falhar */ }
      }

      parsed.push(item)
    }

    setUploadedFiles(prev => [...prev, ...parsed])
    setInput('Analise os arquivos enviados e diga o que ajuda no orçamento, cronograma, materiais, compras e próximas decisões da obra.')
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
      || value.includes('compra')
      || value.includes('diário')
      || value.includes('diario')
      || value.includes('medição')
      || value.includes('medicao')
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
      void logLuizia({
        origem: 'buildassist',
        usuario: currentProfile?.name || null,
        pergunta: userMsg.content,
        resposta: data.message || 'Nao consegui processar agora.',
        mode: data.mode,
        model: data.model,
      })
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.message || 'Não consegui processar agora. Verifique a configuração da IA.',
      }])
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Erro de conexão com a IA. Confira se o servidor está ligado e se a chave da OpenAI foi configurada.',
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
    <div className="flex flex-col lg:flex-row gap-4 min-h-[calc(100vh-8rem)] lg:h-[calc(100vh-8rem)]">
      <div className="flex-1 flex flex-col card overflow-hidden min-h-[560px]">
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

          {/* Ações rápidas em lista suspensa — substitui o grid de cards (melhor em telas pequenas) */}
          <div className="flex gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors hover:bg-[var(--bg-secondary)] flex-shrink-0"
              style={{ color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            >
              <Upload size={14} style={{ color: 'var(--accent)' }} />
              Enviar projeto
            </button>
            <select
              value=""
              onChange={e => {
                const acoes: Record<string, string> = {
                  ler: 'Leia os arquivos anexados desta obra e resuma informações úteis para orçamento, cronograma, compras e materiais.',
                  orcamento: 'Com base na obra atual, sugira um caminho simples para montar ou revisar o orçamento executivo.',
                  compras: 'Analise materiais, listas de compras e fornecedores. Sugira o que comprar primeiro e com quem consultar.',
                  previsoes: 'Gere previsões objetivas de próximas etapas, materiais, compras e pontos de decisão da obra.',
                }
                if (acoes[e.target.value]) aplicarPrompt(acoes[e.target.value])
              }}
              className="input-base text-xs flex-1 min-w-0"
            >
              <option value="">⚡ Ações rápidas...</option>
              <option value="ler">📄 Ler arquivos</option>
              <option value="orcamento">📋 Ajudar orçamento</option>
              <option value="compras">🛒 Planejar compras</option>
              <option value="previsoes">📅 Gerar previsões</option>
            </select>
          </div>

          {uploadedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {uploadedFiles.map(file => (
                <span key={`${file.nome}-${file.tamanho}`} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                  <CheckCircle2 size={12} style={{ color: 'var(--success)' }} />
                  {file.nome} - {formatBytes(file.tamanho)}
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-3">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="Pergunte sobre projeto, orçamento, cronograma, materiais, compras ou previsões..."
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
              onClick={() => {
                setMessages([])
                if (typeof window !== 'undefined') sessionStorage.removeItem(CHAT_STORAGE_KEY)
              }}
              className="flex items-center gap-1.5 text-xs transition-colors"
              style={{ color: 'var(--text-secondary)' }}
            >
              <RefreshCw size={12} /> Nova conversa
            </button>
          )}
        </div>
      </div>

      <div className="w-full lg:w-64 flex flex-col gap-3">
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
