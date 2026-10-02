'use client'

// Superfície única de WorkItem: Caixa de Entrada + Tarefas num fluxo só,
// deduplicado por referência (ver lib/work-items.ts). Uma entrada que virou
// tarefa aparece UMA vez — como a tarefa, que carrega a origem. Entradas cruas
// aparecem para serem triadas. É a materialização da unificação: você joga
// algo na caixa, a IA interpreta, e o que precisa de ação já está na mesma
// lista como tarefa, sem virar um registro solto noutro lugar.

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Archive, CheckSquare, Clock, FileText, ImageIcon, Inbox, Mic, Sparkles, Type } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { listarWorkItems, type WorkItem } from '@/lib/work-items'
import { definirTriagem, TRIAGEM_STATUS_LABEL, type TriagemStatus } from '@/lib/caixa-entrada/triagem'
import { PRIORIDADE_LABEL, STATUS_LABEL, isAtrasada } from '@/lib/tarefas'
import type { EntradaCaixa } from '@/lib/processo/caixa-entrada'
import type { Tarefa } from '@/lib/types'
import { CaixaComposer } from '@/components/caixa-entrada/CaixaComposer'
import { EmptyState } from '@/components/ui/EmptyState'

const CORES_TRIAGEM: Record<TriagemStatus, { fundo: string; texto: string }> = {
  novo: { fundo: 'var(--bg-secondary)', texto: 'var(--text-secondary)' },
  tarefa: { fundo: 'rgba(16,185,129,0.15)', texto: '#10b981' },
  processo: { fundo: 'rgba(59,123,248,0.15)', texto: '#3b7bf8' },
  um_dia_talvez: { fundo: 'rgba(245,158,11,0.15)', texto: '#f59e0b' },
  arquivado: { fundo: 'var(--bg-secondary)', texto: 'var(--text-secondary)' },
}

const CORES_TAREFA: Record<Tarefa['status'], { fundo: string; texto: string }> = {
  pendente: { fundo: 'var(--bg-secondary)', texto: 'var(--text-secondary)' },
  em_andamento: { fundo: 'rgba(59,123,248,0.15)', texto: '#3b7bf8' },
  aguardando: { fundo: 'rgba(245,158,11,0.15)', texto: '#f59e0b' },
  concluida: { fundo: 'rgba(16,185,129,0.15)', texto: '#10b981' },
  cancelada: { fundo: 'var(--bg-secondary)', texto: 'var(--text-secondary)' },
}

function IconeEntrada({ tipo }: { tipo: EntradaCaixa['tipo'] }) {
  if (tipo === 'imagem') return <ImageIcon size={13} />
  if (tipo === 'audio') return <Mic size={13} />
  if (tipo === 'documento') return <FileText size={13} />
  return <Type size={13} />
}

function formatPrazo(iso: string | null): string {
  if (!iso) return 'sem prazo'
  return new Date(iso + 'T12:00').toLocaleDateString('pt-BR')
}

function CartaoTarefa({ item }: { item: WorkItem }) {
  const t = item.tarefa!
  const cor = CORES_TAREFA[t.status]
  const atrasada = isAtrasada(t)
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-1.5" style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
          <CheckSquare size={13} /> <span>Tarefa</span>
        </div>
        <span className="flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: cor.fundo, color: cor.texto }}>
          {STATUS_LABEL[t.status]}
        </span>
      </div>
      <p className="mt-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t.titulo}</p>
      {t.descricao && <p className="mt-1 text-sm whitespace-pre-wrap break-words" style={{ color: 'var(--text-secondary)' }}>{t.descricao}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
        <span style={{ color: atrasada ? '#f87171' : undefined }}>Prazo: {formatPrazo(t.data_prazo)}{atrasada ? ' (atrasada)' : ''}</span>
        <span>Prioridade: {PRIORIDADE_LABEL[t.prioridade]}</span>
        {t.responsavel_nome && <span>Responsável: {t.responsavel_nome}</span>}
      </div>
      {t.origem_entrada_id && (
        <p className="mt-2 flex items-center gap-1 text-xs pt-2" style={{ color: 'var(--text-secondary)', borderTop: '1px solid var(--border)' }}>
          <Inbox size={12} /> Veio da Caixa de Entrada
        </p>
      )}
    </div>
  )
}

function CartaoEntrada({ item, onTriar, onStatus, ocupado }: {
  item: WorkItem
  onTriar: (id: string) => void
  onStatus: (id: string, status: TriagemStatus) => void
  ocupado: boolean
}) {
  const e = item.entrada!
  const status = item.entradaTriagem ?? 'novo'
  const cor = CORES_TRIAGEM[status]
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-1.5" style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
          <IconeEntrada tipo={e.tipo} />
          <span>{new Date(e.created_at).toLocaleString('pt-BR')}</span>
        </div>
        <span className="flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: cor.fundo, color: cor.texto }}>
          {TRIAGEM_STATUS_LABEL[status]}
        </span>
      </div>

      <div className="mt-2">
        {e.tipo === 'texto' && (
          <p className="text-sm whitespace-pre-wrap break-words" style={{ color: 'var(--text-primary)' }}>{e.conteudo_texto}</p>
        )}
        {e.tipo === 'imagem' && e.arquivo_url && (
          <a href={e.arquivo_url} target="_blank" rel="noreferrer" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={e.arquivo_url} alt={e.arquivo_nome ?? 'Imagem'} className="max-h-64 rounded-lg object-cover border" style={{ borderColor: 'var(--border)' }} />
          </a>
        )}
        {e.tipo === 'documento' && e.arquivo_url && (
          <a href={e.arquivo_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-medium hover:underline" style={{ color: 'var(--accent)' }}>
            <FileText size={14} /> {e.arquivo_nome}
          </a>
        )}
        {e.tipo === 'audio' && e.arquivo_url && (
          <audio controls src={e.arquivo_url} className="w-full max-w-sm h-9" />
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-2.5" style={{ borderTop: '1px solid var(--border)' }}>
        {status === 'novo' && (
          <button type="button" onClick={() => onTriar(e.id)} disabled={ocupado}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs disabled:opacity-40"
            style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
            <Sparkles size={12} /> Interpretar
          </button>
        )}
        <button type="button" onClick={() => onStatus(e.id, 'um_dia_talvez')} disabled={ocupado || status === 'um_dia_talvez'}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs disabled:opacity-40"
          style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
          <Clock size={12} /> Um dia talvez
        </button>
        <button type="button" onClick={() => onStatus(e.id, 'arquivado')} disabled={ocupado || status === 'arquivado'}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs disabled:opacity-40"
          style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
          <Archive size={12} /> Arquivar
        </button>
      </div>
    </div>
  )
}

export function WorkItemsStream({ processoId = null, ocultarComposer = false }: {
  processoId?: string | null
  ocultarComposer?: boolean
}) {
  const supabase = useMemo(() => createClient(), [])
  const [itens, setItens] = useState<WorkItem[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      setItens(await listarWorkItems(supabase, processoId))
    } catch {
      setErro('Não foi possível carregar o trabalho deste Processo.')
    } finally {
      setCarregando(false)
    }
  }, [supabase, processoId])

  useEffect(() => {
    const timer = window.setTimeout(() => { void carregar() }, 0)
    return () => window.clearTimeout(timer)
  }, [carregar])

  const triar = useCallback(async (entradaId: string) => {
    setOcupado(entradaId)
    try {
      const r = await fetch('/api/caixa-entrada/triagem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entradaId }),
      })
      if (!r.ok) throw new Error()
      await carregar()
    } catch {
      setErro('Não consegui interpretar esta entrada. Ela continua salva — tente de novo.')
    } finally {
      setOcupado(null)
    }
  }, [carregar])

  async function aoEnviar(nova: EntradaCaixa, origemTexto: boolean) {
    if (origemTexto) await triar(nova.id)
    else await carregar()
  }

  async function mudarStatus(entradaId: string, status: TriagemStatus) {
    setOcupado(entradaId)
    try {
      await definirTriagem(supabase, entradaId, { status })
      await carregar()
    } catch {
      setErro('Não foi possível mudar a situação desta entrada.')
    } finally {
      setOcupado(null)
    }
  }

  return (
    <div className="space-y-4">
      {!ocultarComposer && <CaixaComposer processoId={processoId} onEnviada={aoEnviar} />}

      {erro && <p className="text-xs px-1" style={{ color: '#f87171' }}>{erro}</p>}

      {carregando ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : itens.length === 0 ? (
        <EmptyState icon={Inbox} title="Nada aqui ainda"
          description="Escreva, grave ou anexe qualquer coisa. A IA lê e, quando é ação, já vira tarefa nesta mesma lista." />
      ) : (
        <div className="space-y-3">
          {itens.map(item => item.kind === 'tarefa'
            ? <CartaoTarefa key={`t-${item.id}`} item={item} />
            : <CartaoEntrada key={`e-${item.id}`} item={item} onTriar={id => void triar(id)} onStatus={(id, s) => void mudarStatus(id, s)} ocupado={ocupado === item.id} />,
          )}
        </div>
      )}
    </div>
  )
}
