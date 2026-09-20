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
  const [pendentes, setPendentes] = useState<File[]>([])
  // Duração só existe para áudio gravado aqui; WeakMap-like por arquivo para
  // não inventar um tipo novo só por causa de um número opcional.
  const duracaoPendenteRef = useRef<Map<File, number>>(new Map())
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

  // Anexo e áudio NÃO entram sozinhos: viram pendências visíveis, e só vão
  // embora quando o usuário aperta Enviar — junto com o texto, se houver.
  function adicionarArquivos(files: FileList | null) {
    if (!files?.length) return
    setErro('')
    setPendentes(prev => [...prev, ...Array.from(files)])
    if (inputRef.current) inputRef.current.value = ''
  }

  function removerPendente(indice: number) {
    setPendentes(prev => prev.filter((_, i) => i !== indice))
  }

  async function enviar() {
    const valor = texto.trim()
    if ((!valor && pendentes.length === 0) || enviando) return
    setEnviando(true)
    setErro('')
    try {
      if (valor) {
        const nova = await criarEntradaTexto(supabase, processoId, valor)
        setEntradas(prev => [nova, ...prev])
        setTexto('')
      }
      for (const arquivo of pendentes) {
        const duracaoSegundos = duracaoPendenteRef.current.get(arquivo)
        const nova = await criarEntradaArquivo(
          supabase, processoId, arquivo,
          duracaoSegundos !== undefined ? { duracaoSegundos } : undefined,
        )
        duracaoPendenteRef.current.delete(arquivo)
        setEntradas(prev => [nova, ...prev])
      }
      setPendentes([])
    } catch (e) {
      // Mensagem real do erro. A versão anterior engolia a causa e só dizia
      // "não foi possível", o que tornava qualquer falha indiagnosticável.
      const causa = e instanceof Error ? e.message : String(e)
      setErro(`Não foi possível enviar: ${causa}`)
    } finally {
      setEnviando(false)
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
        // No Android o mimeType vem como `audio/webm;codecs=opus`. O sufixo
        // `;codecs=` quebra o Content-Type no upload do Storage, então o tipo
        // é normalizado e a extensão passa a seguir o tipo real (o Safari
        // grava em mp4, não webm — fixar ".webm" gerava arquivo inválido).
        const bruto = gravador.mimeType || 'audio/webm'
        const tipo = bruto.split(';')[0].trim() || 'audio/webm'
        const ext = tipo.includes('mp4') ? 'm4a' : tipo.includes('ogg') ? 'ogg' : 'webm'
        const blob = new Blob(chunksRef.current, { type: tipo })
        const arquivo = new File([blob], `audio-${Date.now()}.${ext}`, { type: tipo })
        setGravando(false)
        // Áudio também vira pendência: o usuário confere e aperta Enviar.
        setPendentes(prev => [...prev, arquivo])
        duracaoPendenteRef.current.set(arquivo, (Date.now() - inicioGravacaoRef.current) / 1000)
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
        {pendentes.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1.5">
            {pendentes.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center justify-between gap-2 rounded-xl border border-cyan-200/18 bg-cyan-300/[0.07] px-3 py-2"
              >
                <span className="min-w-0 truncate text-[12.5px] text-white/85">
                  {f.type.startsWith('audio/') ? '🎤 ' : '📎 '}{f.name}
                </span>
                <button
                  type="button"
                  onClick={() => removerPendente(i)}
                  disabled={enviando}
                  aria-label={`Remover ${f.name}`}
                  className="shrink-0 rounded-full px-2 py-0.5 text-[12px] text-white/55 outline-none transition hover:text-red-200 disabled:opacity-40"
                >
                  remover
                </button>
              </li>
            ))}
          </ul>
        )}

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
              onChange={e => adicionarArquivos(e.target.files)}
            />
          </div>
          <button
            type="button"
            onClick={() => void enviar()}
            disabled={enviando || (!texto.trim() && pendentes.length === 0)}
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
