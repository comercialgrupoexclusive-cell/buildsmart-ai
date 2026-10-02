'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Archive, CheckSquare, Clock, FileText, ImageIcon, Mic, Paperclip, Sparkles, Type } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
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
import { CaixaComposer } from '@/components/caixa-entrada/CaixaComposer'
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

export function CaixaEntrada({ processoId = null, filtroStatus, ocultarComposer = false }: {
  processoId?: string | null
  // Quando presente, mostra só entradas cuja triagem está nesses status
  // (usado pelo filtro "Informações" do Fluxo). Sem filtro = tudo.
  filtroStatus?: TriagemStatus[]
  // Some com o campo de entrada — para superfícies só de leitura (ex.: filtro
  // Informações), onde a entrada bruta é feita na aba Entradas ou na Luiza.
  ocultarComposer?: boolean
}) {
  const supabase = useMemo(() => createClient(), [])

  const [entradas, setEntradas] = useState<EntradaCaixa[]>([])
  const [triagens, setTriagens] = useState<Record<string, Triagem>>({})
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
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

  // Nova entrada vinda do compositor: entra na lista; se foi texto, a IA
  // interpreta na hora (mesmo contrato de antes — escreve e a pessoa revisa).
  function aoEnviar(nova: EntradaCaixa, origemTexto: boolean) {
    setEntradas(prev => [nova, ...prev])
    if (origemTexto) void triar(nova.id)
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

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  const entradasVisiveis = filtroStatus
    ? entradas.filter(e => filtroStatus.includes(triagens[e.id]?.status ?? 'novo'))
    : entradas

  return (
    <div className="space-y-4">
      {!ocultarComposer && <CaixaComposer processoId={processoId} onEnviada={aoEnviar} />}

      {erro && <p className="text-xs px-1" style={{ color: '#f87171' }}>{erro}</p>}

      {entradasVisiveis.length === 0 ? (
        <EmptyState
          icon={Paperclip}
          title={filtroStatus ? 'Nenhuma informação por aqui' : 'Nada na caixa ainda'}
          description={filtroStatus ? 'Entradas que você marcar como conhecimento do Processo aparecem aqui.' : 'Escreva, grave ou anexe qualquer coisa. A IA lê e transforma em tarefa quando faz sentido.'}
        />
      ) : (
        <div className="space-y-3">
          {entradasVisiveis.map(e => (
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
