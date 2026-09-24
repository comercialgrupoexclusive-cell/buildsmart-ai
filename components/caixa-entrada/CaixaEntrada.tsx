'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Archive, CheckSquare, Clock, FileText, ImageIcon, Mic, Paperclip, Send, Sparkles, Square, Type } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  criarEntradaArquivo,
  criarEntradaTexto,
  listarEntradasCaixa,
  type EntradaCaixa,
} from '@/lib/processo/caixa-entrada'
import {
  definirTriagem,
  listarTriagens,
  TRIAGEM_STATUS_LABEL,
  type Triagem,
  type TriagemStatus,
} from '@/lib/caixa-entrada/triagem'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'

// Caixa de Entrada. Serve os dois escopos com o mesmo componente:
// processoId preenchido = a aba dentro de um Processo; processoId nulo = a
// Caixa global, onde entra o que ainda não é de nenhum Processo.
//
// A entrada é append-only (RLS não tem UPDATE). O que muda é a triagem, que
// vive em caixa_entrada_triagem — "virou tarefa", "um dia talvez", etc.

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDuracao(segundos: number) {
  const m = Math.floor(segundos / 60)
  const s = Math.round(segundos % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function IconeEntrada({ tipo }: { tipo: EntradaCaixa['tipo'] }) {
  if (tipo === 'imagem') return <ImageIcon size={13} />
  if (tipo === 'audio') return <Mic size={13} />
  if (tipo === 'documento') return <FileText size={13} />
  return <Type size={13} />
}

const CORES_STATUS: Record<TriagemStatus, { fundo: string; texto: string }> = {
  novo: { fundo: 'var(--bg-secondary)', texto: 'var(--text-secondary)' },
  tarefa: { fundo: 'rgba(16,185,129,0.15)', texto: '#10b981' },
  processo: { fundo: 'rgba(59,123,248,0.15)', texto: '#3b7bf8' },
  um_dia_talvez: { fundo: 'rgba(245,158,11,0.15)', texto: '#f59e0b' },
  arquivado: { fundo: 'var(--bg-secondary)', texto: 'var(--text-secondary)' },
}

function CartaoEntrada({ entrada, triagem, onTriar, onStatus, ocupado }: {
  entrada: EntradaCaixa
  triagem: Triagem | undefined
  onTriar: (id: string) => void
  onStatus: (id: string, status: TriagemStatus) => void
  ocupado: boolean
}) {
  const status = triagem?.status ?? 'novo'
  const cor = CORES_STATUS[status]

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-1.5" style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
          <IconeEntrada tipo={entrada.tipo} />
          <span>{new Date(entrada.created_at).toLocaleString('pt-BR')}</span>
        </div>
        <span
          className="flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
          style={{ background: cor.fundo, color: cor.texto }}
        >
          {TRIAGEM_STATUS_LABEL[status]}
        </span>
      </div>

      <div className="mt-2">
        {entrada.tipo === 'texto' && (
          <p className="text-sm whitespace-pre-wrap break-words" style={{ color: 'var(--text-primary)' }}>
            {entrada.conteudo_texto}
          </p>
        )}

        {entrada.tipo === 'imagem' && entrada.arquivo_url && (
          <a href={entrada.arquivo_url} target="_blank" rel="noreferrer" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={entrada.arquivo_url}
              alt={entrada.arquivo_nome ?? 'Imagem'}
              className="max-h-64 rounded-lg object-cover border"
              style={{ borderColor: 'var(--border)' }}
            />
          </a>
        )}

        {entrada.tipo === 'documento' && entrada.arquivo_url && (
          <a
            href={entrada.arquivo_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium hover:underline"
            style={{ color: 'var(--accent)' }}
          >
            <FileText size={14} />
            {entrada.arquivo_nome}
          </a>
        )}

        {entrada.tipo === 'audio' && entrada.arquivo_url && (
          <audio controls src={entrada.arquivo_url} className="w-full max-w-sm h-9" />
        )}

        {entrada.tipo !== 'texto' && (entrada.arquivo_tamanho != null || entrada.duracao_segundos != null) && (
          <p className="mt-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
            {entrada.arquivo_tamanho != null ? formatSize(entrada.arquivo_tamanho) : ''}
            {entrada.duracao_segundos != null ? ` · ${formatDuracao(entrada.duracao_segundos)}` : ''}
          </p>
        )}
      </div>

      {triagem?.resumo && status !== 'novo' && (
        <p className="mt-2 text-xs italic" style={{ color: 'var(--text-secondary)' }}>
          {triagem.resumo}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-2.5" style={{ borderTop: '1px solid var(--border)' }}>
        {triagem?.tarefa_id && (
          <Link
            href="/tarefas"
            className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
            style={{ color: '#10b981' }}
          >
            <CheckSquare size={12} /> Ver tarefa
          </Link>
        )}

        {status === 'novo' && (
          <button
            type="button"
            onClick={() => onTriar(entrada.id)}
            disabled={ocupado}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs disabled:opacity-40"
            style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
          >
            <Sparkles size={12} /> Interpretar
          </button>
        )}

        <button
          type="button"
          onClick={() => onStatus(entrada.id, 'um_dia_talvez')}
          disabled={ocupado || status === 'um_dia_talvez'}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs disabled:opacity-40"
          style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
        >
          <Clock size={12} /> Um dia talvez
        </button>

        <button
          type="button"
          onClick={() => onStatus(entrada.id, 'arquivado')}
          disabled={ocupado || status === 'arquivado'}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs disabled:opacity-40"
          style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
        >
          <Archive size={12} /> Arquivar
        </button>
      </div>
    </div>
  )
}

export function CaixaEntrada({ processoId = null }: { processoId?: string | null }) {
  const supabase = useMemo(() => createClient(), [])
  const inputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const inicioGravacaoRef = useRef(0)

  const [entradas, setEntradas] = useState<EntradaCaixa[]>([])
  const [triagens, setTriagens] = useState<Record<string, Triagem>>({})
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [gravando, setGravando] = useState(false)
  const [triando, setTriando] = useState<string | null>(null)

  // Duas consultas para a lista inteira: entradas e triagens. Nunca uma por
  // card (ver AGENTS.md seção 9).
  const carregar = useCallback(async () => {
    try {
      const lista = await listarEntradasCaixa(supabase, processoId)
      const tri = await listarTriagens(supabase, lista.map(e => e.id))
      setEntradas(lista)
      setTriagens(Object.fromEntries(tri.map(t => [t.entrada_id, t])))
    } catch {
      setErro('Não foi possível carregar a Caixa de Entrada.')
    } finally {
      setCarregando(false)
    }
  }, [supabase, processoId])

  useEffect(() => {
    const timer = window.setTimeout(() => { void carregar() }, 0)
    return () => window.clearTimeout(timer)
  }, [carregar])

  // A IA escreve direto e a pessoa revisa depois — contrato escolhido para
  // esta superfície. Falha de triagem nunca desfaz a entrada: o que foi dito
  // já está gravado, e dá para interpretar de novo pelo botão.
  const triar = useCallback(async (entradaId: string) => {
    setTriando(entradaId)
    try {
      const resposta = await fetch('/api/caixa-entrada/triagem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entradaId }),
      })
      if (!resposta.ok) throw new Error()
      await carregar()
    } catch {
      setErro('Não consegui interpretar esta entrada. Ela continua salva — tente de novo.')
    } finally {
      setTriando(null)
    }
  }, [carregar])

  async function enviarTexto() {
    const valor = texto.trim()
    if (!valor || enviando) return
    setErro('')
    setEnviando(true)
    try {
      const nova = await criarEntradaTexto(supabase, processoId, valor)
      setEntradas(prev => [nova, ...prev])
      setTexto('')
      void triar(nova.id)
    } catch {
      setErro('Não foi possível enviar. Tente novamente.')
    } finally {
      setEnviando(false)
    }
  }

  async function enviarArquivos(files: FileList | null) {
    if (!files?.length || enviando) return
    setErro('')
    setEnviando(true)
    try {
      for (const arquivo of Array.from(files)) {
        const nova = await criarEntradaArquivo(supabase, processoId, arquivo)
        setEntradas(prev => [nova, ...prev])
      }
    } catch {
      setErro('Não foi possível enviar o anexo. Tente novamente.')
    } finally {
      setEnviando(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function mudarStatus(entradaId: string, status: TriagemStatus) {
    setTriando(entradaId)
    try {
      const nova = await definirTriagem(supabase, entradaId, { status })
      setTriagens(prev => ({ ...prev, [entradaId]: nova }))
    } catch {
      setErro('Não foi possível mudar a situação desta entrada.')
    } finally {
      setTriando(null)
    }
  }

  async function alternarGravacao() {
    if (gravando) {
      mediaRecorderRef.current?.stop()
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setErro('Este navegador não suporta gravação direta. Anexe um arquivo de áudio.')
      return
    }
    setErro('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const gravador = new MediaRecorder(stream)
      chunksRef.current = []
      inicioGravacaoRef.current = Date.now()
      gravador.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      gravador.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const duracaoSegundos = (Date.now() - inicioGravacaoRef.current) / 1000
        const blob = new Blob(chunksRef.current, { type: gravador.mimeType || 'audio/webm' })
        const arquivo = new File([blob], `audio-${Date.now()}.webm`, { type: blob.type })
        setGravando(false)
        setEnviando(true)
        void criarEntradaArquivo(supabase, processoId, arquivo, { duracaoSegundos })
          .then(nova => setEntradas(prev => [nova, ...prev]))
          .catch(() => setErro('Não foi possível enviar o áudio gravado.'))
          .finally(() => setEnviando(false))
      }
      mediaRecorderRef.current = gravador
      gravador.start()
      setGravando(true)
    } catch {
      setErro('Não foi possível acessar o microfone. Verifique a permissão do navegador.')
    }
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <textarea
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void enviarTexto() }}
          placeholder="Fazer isso, lembrar daquilo, reunião terça… joga aqui sem organizar."
          rows={3}
          className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-[var(--text-secondary)]"
          style={{ color: 'var(--text-primary)' }}
          disabled={enviando || gravando}
        />
        <div className="mt-3 flex items-center justify-between gap-2 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={enviando || gravando}
              title="Anexar arquivo"
              className="grid size-8 place-items-center rounded-lg text-sm transition-all disabled:opacity-40"
              style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)', background: 'var(--bg-secondary)' }}
            >
              <Paperclip size={15} />
            </button>
            <button
              type="button"
              onClick={() => void alternarGravacao()}
              disabled={enviando}
              title={gravando ? 'Parar gravação' : 'Gravar áudio'}
              className="grid size-8 place-items-center rounded-lg text-sm transition-all disabled:opacity-40"
              style={gravando
                ? { border: '1px solid rgba(248,113,113,0.4)', color: '#f87171', background: 'rgba(248,113,113,0.1)' }
                : { border: '1px solid var(--border)', color: 'var(--text-secondary)', background: 'var(--bg-secondary)' }}
            >
              {gravando ? <Square size={13} /> : <Mic size={15} />}
            </button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
              className="hidden"
              onChange={e => void enviarArquivos(e.target.files)}
            />
            {gravando && <span className="text-xs animate-pulse" style={{ color: '#f87171' }}>Gravando…</span>}
          </div>
          <Button
            onClick={() => void enviarTexto()}
            disabled={enviando || !texto.trim() || gravando}
            loading={enviando && !gravando}
            size="sm"
            icon={<Send size={13} />}
          >
            Enviar
          </Button>
        </div>
      </div>

      {erro && <p className="text-xs px-1" style={{ color: '#f87171' }}>{erro}</p>}

      {entradas.length === 0 ? (
        <EmptyState
          icon={Paperclip}
          title="Nada na caixa ainda"
          description="Escreva, grave ou anexe qualquer coisa. A IA lê e transforma em tarefa quando faz sentido."
        />
      ) : (
        <div className="space-y-3">
          {entradas.map(e => (
            <CartaoEntrada
              key={e.id}
              entrada={e}
              triagem={triagens[e.id]}
              onTriar={id => void triar(id)}
              onStatus={(id, s) => void mudarStatus(id, s)}
              ocupado={triando === e.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}
