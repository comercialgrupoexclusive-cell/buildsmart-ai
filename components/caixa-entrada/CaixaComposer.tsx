'use client'

// Compositor da Caixa de Entrada — reutilizável (AGENTS.md §4: uma
// implementação, usada em todo lugar). Usado pela aba Caixa (CaixaEntrada) e
// pela superfície única WorkItemsStream. Só joga realidade bruta na caixa
// (texto, anexo, áudio); quem decide o que fazer depois é a triagem.
//
// Não guarda a lista: avisa o pai de cada nova entrada por onEnviada. Para
// texto, origemTexto=true permite o pai disparar a triagem automática.

import { useMemo, useRef, useState } from 'react'
import { Mic, Paperclip, Send, Square } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { criarEntradaArquivo, criarEntradaTexto, type EntradaCaixa } from '@/lib/caixa-entrada/entradas'
import { Button } from '@/components/ui/Button'

export function CaixaComposer({ processoId, onEnviada, placeholder }: {
  processoId: string | null
  onEnviada: (nova: EntradaCaixa, origemTexto: boolean) => void
  placeholder?: string
}) {
  const supabase = useMemo(() => createClient(), [])
  const inputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const inicioGravacaoRef = useRef(0)

  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [gravando, setGravando] = useState(false)
  const [erro, setErro] = useState('')

  async function enviarTexto() {
    const valor = texto.trim()
    if (!valor || enviando) return
    setErro('')
    setEnviando(true)
    try {
      const nova = await criarEntradaTexto(supabase, processoId, valor)
      setTexto('')
      onEnviada(nova, true)
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
        onEnviada(nova, false)
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
          .then(nova => onEnviada(nova, false))
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

  return (
    <div className="space-y-2">
      <div className="card p-4">
        <textarea
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void enviarTexto() }}
          placeholder={placeholder ?? 'Fazer isso, lembrar daquilo, reunião terça… joga aqui sem organizar.'}
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
    </div>
  )
}
