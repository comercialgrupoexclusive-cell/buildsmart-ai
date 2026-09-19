'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, ImageIcon, Mic, Paperclip, Send, Square } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  criarEntradaArquivo,
  criarEntradaTexto,
  listarEntradasCaixa,
  type EntradaCaixa,
} from '@/lib/processo/caixa-entrada'
import { Carregando, PrecisaSessao, Vazio } from './comuns'

// Caixa de Entrada do Processo — núcleo do novo sistema. Não é um módulo de
// tarefas: aqui o usuário despeja realidade bruta (texto, imagem, documento,
// áudio) sem organizar nada antes. O registro fica intacto para sempre —
// nenhuma ação nesta tela edita ou apaga uma entrada já criada (RLS nem
// permite: só existem policies de select/insert em processo_caixa_entrada).
// A camada de agentes que lê e interpreta isso é um passo futuro, fora
// desta rodada.
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
  const cls = 'size-4 text-cyan-200/70'
  if (tipo === 'imagem') return <ImageIcon className={cls} />
  if (tipo === 'audio') return <Mic className={cls} />
  if (tipo === 'documento') return <FileText className={cls} />
  return <Send className={cls} />
}

function CartaoEntrada({ entrada }: { entrada: EntradaCaixa }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
      <div className="flex items-center gap-2 text-[11px] text-white/45">
        <IconeEntrada tipo={entrada.tipo} />
        <span>{new Date(entrada.created_at).toLocaleString('pt-BR')}</span>
      </div>

      {entrada.tipo === 'texto' && (
        <p className="mt-1.5 whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-white/88">
          {entrada.conteudo_texto}
        </p>
      )}

      {entrada.tipo === 'imagem' && entrada.arquivo_url && (
        <a href={entrada.arquivo_url} target="_blank" rel="noreferrer" className="mt-2 block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={entrada.arquivo_url} alt={entrada.arquivo_nome ?? 'Imagem enviada'} className="max-h-64 rounded-xl border border-white/10 object-cover" />
        </a>
      )}

      {entrada.tipo === 'documento' && entrada.arquivo_url && (
        <a
          href={entrada.arquivo_url}
          target="_blank"
          rel="noreferrer"
          className="mt-1.5 inline-flex items-center gap-2 text-[13px] font-medium text-cyan-100/90 hover:underline"
        >
          <FileText className="size-4" />
          {entrada.arquivo_nome}
        </a>
      )}

      {entrada.tipo === 'audio' && entrada.arquivo_url && (
        <div className="mt-2">
          <audio controls src={entrada.arquivo_url} className="h-9 w-full max-w-sm" />
        </div>
      )}

      {(entrada.tipo === 'documento' || entrada.tipo === 'audio') && entrada.arquivo_tamanho != null && (
        <p className="mt-1 text-[11px] text-white/40">
          {formatSize(entrada.arquivo_tamanho)}
          {entrada.duracao_segundos != null ? ` · ${formatDuracao(entrada.duracao_segundos)}` : ''}
        </p>
      )}
    </div>
  )
}

export function TelaCaixaEntrada({ processoId }: { processoId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const inputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const inicioGravacaoRef = useRef(0)

  const [entradas, setEntradas] = useState<EntradaCaixa[]>([])
  const [carregando, setCarregando] = useState(true)
  const [semSessao, setSemSessao] = useState(false)
  const [erro, setErro] = useState('')
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [gravando, setGravando] = useState(false)

  useEffect(() => {
    let vivo = true
    void (async () => {
      const { data } = await supabase.auth.getUser()
      if (!vivo) return
      if (!data.user) { setSemSessao(true); setCarregando(false); return }
      try {
        const lista = await listarEntradasCaixa(supabase, processoId)
        if (vivo) setEntradas(lista)
      } catch {
        if (vivo) setErro('Não foi possível carregar a Caixa de Entrada deste Processo.')
      } finally {
        if (vivo) setCarregando(false)
      }
    })()
    return () => { vivo = false }
  }, [supabase, processoId])

  async function enviarTexto() {
    const valor = texto.trim()
    if (!valor || enviando) return
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
      setErro('Este navegador não permite gravar áudio diretamente. Anexe um arquivo de áudio já gravado.')
      return
    }
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

  if (semSessao) return <PrecisaSessao modulo="A Caixa de Entrada" />
  if (carregando) return <Carregando texto="Abrindo a Caixa de Entrada…" />

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
        <textarea
          value={texto}
          onChange={e => setTexto(e.target.value)}
          placeholder="Escreva o que aconteceu, sem se preocupar em organizar agora…"
          rows={3}
          className="w-full resize-none bg-transparent text-[13.5px] text-white/90 outline-none placeholder:text-white/35"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={enviando || gravando}
              title="Anexar imagem ou documento"
              className="grid size-8 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-white/65 outline-none transition hover:bg-white/10 disabled:opacity-40"
            >
              <Paperclip className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => void alternarGravacao()}
              disabled={enviando}
              title={gravando ? 'Parar gravação' : 'Gravar áudio'}
              className={
                'grid size-8 place-items-center rounded-full border outline-none transition disabled:opacity-40 ' +
                (gravando
                  ? 'border-red-300/40 bg-red-400/20 text-red-100 animate-pulse'
                  : 'border-white/10 bg-white/[0.04] text-white/65 hover:bg-white/10')
              }
            >
              {gravando ? <Square className="size-3.5" /> : <Mic className="size-4" />}
            </button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
              className="hidden"
              onChange={e => void enviarArquivos(e.target.files)}
            />
          </div>
          <button
            type="button"
            onClick={() => void enviarTexto()}
            disabled={enviando || !texto.trim()}
            className="inline-flex items-center gap-1.5 rounded-full bg-cyan-300/15 px-4 py-1.5 text-[13px] font-medium text-white shadow-[inset_0_0_0_1px_rgba(120,205,255,0.32)] outline-none transition hover:bg-cyan-300/22 disabled:opacity-40"
          >
            <Send className="size-3.5" /> Enviar
          </button>
        </div>
      </div>

      {erro && <p className="text-[12.5px] text-red-300/85">{erro}</p>}

      {entradas.length === 0 ? (
        <Vazio
          titulo="Nenhuma entrada ainda"
          descricao="Tudo que chegar aqui — texto, foto, documento ou áudio — fica registrado como foi enviado, sem precisar classificar nada agora."
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {entradas.map(e => <CartaoEntrada key={e.id} entrada={e} />)}
        </div>
      )}
    </div>
  )
}
