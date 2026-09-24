'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, ImageIcon, Mic, Paperclip, Send, Square, Type } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  criarEntradaArquivo,
  criarEntradaTexto,
  listarEntradasCaixa,
  type EntradaCaixa,
} from '@/lib/processo/caixa-entrada'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'

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

function CartaoEntrada({ entrada }: { entrada: EntradaCaixa }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-1.5 mb-2" style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
        <IconeEntrada tipo={entrada.tipo} />
        <span className="capitalize">{entrada.tipo}</span>
        <span>·</span>
        <span>{new Date(entrada.created_at).toLocaleString('pt-BR')}</span>
      </div>

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
        <audio controls src={entrada.arquivo_url} className="w-full max-w-sm h-9 mt-1" />
      )}

      {(entrada.tipo !== 'texto') && (entrada.arquivo_tamanho != null || entrada.duracao_segundos != null) && (
        <p className="mt-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
          {entrada.arquivo_tamanho != null ? formatSize(entrada.arquivo_tamanho) : ''}
          {entrada.duracao_segundos != null ? ` · ${formatDuracao(entrada.duracao_segundos)}` : ''}
        </p>
      )}
    </div>
  )
}

export function ProcessoCaixaEntrada({ processoId }: { processoId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const inputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const inicioGravacaoRef = useRef(0)

  const [entradas, setEntradas] = useState<EntradaCaixa[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [gravando, setGravando] = useState(false)

  useEffect(() => {
    let vivo = true
    void (async () => {
      try {
        const lista = await listarEntradasCaixa(supabase, processoId)
        if (vivo) setEntradas(lista)
      } catch {
        if (vivo) setErro('Não foi possível carregar a Caixa de Entrada.')
      } finally {
        if (vivo) setCarregando(false)
      }
    })()
    return () => { vivo = false }
  }, [supabase, processoId])

  async function enviarTexto() {
    const valor = texto.trim()
    if (!valor || enviando) return
    setErro('')
    setEnviando(true)
    try {
      const nova = await criarEntradaTexto(supabase, processoId, valor)
      setEntradas(prev => [nova, ...prev])
      setTexto('')
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
      {/* Área de entrada */}
      <div className="card p-4">
        <textarea
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void enviarTexto() }}
          placeholder="Escreva o que aconteceu, sem precisar organizar agora…"
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
                ? { border: '1px solid rgba(248,113,113,0.4)', color: '#f87171', background: 'rgba(248,113,113,0.1)', animation: 'pulse 1.5s ease-in-out infinite' }
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
            {gravando && (
              <span className="text-xs animate-pulse" style={{ color: '#f87171' }}>
                Gravando…
              </span>
            )}
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

      {erro && (
        <p className="text-xs px-1" style={{ color: '#f87171' }}>{erro}</p>
      )}

      {/* Lista de entradas */}
      {entradas.length === 0 ? (
        <EmptyState
          icon={Paperclip}
          title="Nenhuma entrada ainda"
          description="Texto, imagem, documento ou áudio — tudo fica registrado como foi enviado."
        />
      ) : (
        <div className="space-y-3">
          {entradas.map(e => <CartaoEntrada key={e.id} entrada={e} />)}
        </div>
      )}
    </div>
  )
}
