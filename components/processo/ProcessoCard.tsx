'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Copy, FolderPlus, MapPin, MoreVertical, Pencil, Trash2 } from 'lucide-react'
import type { Processo, ProcessoStatus } from '@/lib/processo'
import { Badge } from '@/components/ui/Badge'

function enderecoFormatado(p: Processo): string | null {
  if (p.logradouro) {
    const partes = [p.logradouro, p.numero, p.bairro, p.cidade, p.uf].filter(Boolean)
    return partes.join(', ')
  }
  return p.endereco ?? null
}

function urlMapa(p: Processo): string {
  const end = enderecoFormatado(p)
  return end ? `https://maps.google.com/?q=${encodeURIComponent(end)}` : ''
}

// Card do Processo na listagem. A capa é o fundo; o conteúdo vive sobre um
// degradê para o texto continuar legível com qualquer foto. Sem capa, o
// degradê sozinho já é o visual — nenhum card fica "quebrado".

const STATUS_LABEL: Record<ProcessoStatus, string> = {
  ACTIVE: 'Ativo',
  ON_HOLD: 'Em espera',
  COMPLETED: 'Concluído',
  ARCHIVED: 'Arquivado',
}

const STATUS_BADGE_VARIANT: Record<ProcessoStatus, 'info' | 'warning' | 'success' | 'default'> = {
  ACTIVE: 'info',
  ON_HOLD: 'warning',
  COMPLETED: 'success',
  ARCHIVED: 'default',
}

export type AcaoCard = { key: string; label: string }

type Props = {
  processo: Processo
  // Últimas ações da pessoa neste Processo; quando não há uso, a listagem
  // manda os módulos habilitados (já sem a Visão Geral).
  acoes: AcaoCard[]
  onEditar: (p: Processo) => void
  onExcluir: (p: Processo) => void
  onDuplicar: (p: Processo) => void
  onAgrupar: (p: Processo) => void
}

export function ProcessoCard({ processo, acoes, onEditar, onExcluir, onDuplicar, onAgrupar }: Props) {
  const [menuAberto, setMenuAberto] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuAberto) return
    function fora(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [menuAberto])

  function executar(acao: () => void) {
    setMenuAberto(false)
    acao()
  }

  const endFormatado = enderecoFormatado(processo)
  const legenda = [processo.cliente_nome, endFormatado].filter(Boolean).join(' · ')
  const mapaUrl = urlMapa(processo)

  return (
    <div className="relative group">
      <Link
        href={`/processos/${processo.id}`}
        className="block overflow-hidden rounded-xl transition-transform hover:scale-[1.01]"
        style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}
      >
        {processo.capa_url ? (
          // Com foto: a imagem é o fundo, texto branco sobre um degradê que
          // só existe para dar contraste à foto real.
          <div className="relative h-36">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={processo.capa_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0.12) 100%)' }}
            />
            {processo.status !== 'ACTIVE' && (
              <div className="absolute top-3 left-3">
                <Badge variant={STATUS_BADGE_VARIANT[processo.status]}>{STATUS_LABEL[processo.status]}</Badge>
              </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 p-3.5">
              <h3 className="font-semibold text-base leading-tight text-white drop-shadow-sm">{processo.nome}</h3>
              {legenda && (
              <p className="mt-0.5 truncate text-xs text-white/70 flex items-center gap-1">
                {mapaUrl && endFormatado && (
                  <a href={mapaUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} aria-label="Abrir no mapa">
                    <MapPin size={11} className="flex-shrink-0 opacity-70" />
                  </a>
                )}
                {legenda}
              </p>
            )}
            </div>
          </div>
        ) : (
          // Sem foto: nenhum bloco escuro falso. O card assume o fundo do tema
          // e o texto usa os tokens normais — limpo em claro e escuro.
          <div className="p-3.5 pr-10">
            {processo.status !== 'ACTIVE' && (
              <div className="mb-2">
                <Badge variant={STATUS_BADGE_VARIANT[processo.status]}>{STATUS_LABEL[processo.status]}</Badge>
              </div>
            )}
            <h3 className="font-semibold text-base leading-tight" style={{ color: 'var(--text-primary)' }}>{processo.nome}</h3>
            {legenda && (
              <p className="mt-0.5 truncate text-xs flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                {mapaUrl && endFormatado && (
                  <a href={mapaUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} aria-label="Abrir no mapa" style={{ color: 'var(--accent)' }}>
                    <MapPin size={11} className="flex-shrink-0" />
                  </a>
                )}
                {legenda}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5 px-3.5 py-2.5 min-h-[42px]" style={{ borderTop: '1px solid var(--border)' }}>
          {acoes.length === 0 ? (
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Sem módulos habilitados</span>
          ) : (
            acoes.map(a => (
              <span
                key={a.key}
                className="rounded-full px-2 py-0.5 text-xs"
                style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
              >
                {a.label}
              </span>
            ))
          )}
        </div>
      </Link>

      <div ref={menuRef} className="absolute top-2.5 right-2.5">
        <button
          type="button"
          aria-label="Ações do processo"
          onClick={() => setMenuAberto(v => !v)}
          className="grid size-7 place-items-center rounded-lg backdrop-blur-sm transition"
          style={processo.capa_url
            // Sobre foto: pastilha escura translúcida com ícone branco.
            ? { background: 'rgba(0,0,0,0.45)', color: 'rgba(255,255,255,0.9)' }
            // Sobre card do tema: ícone discreto, sem pastilha escura falsa.
            : { color: 'var(--text-secondary)' }}
        >
          <MoreVertical size={15} />
        </button>

        {menuAberto && (
          <div
            className="absolute right-0 top-8 z-20 w-40 overflow-hidden rounded-lg py-1 shadow-lg"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <ItemMenu icon={<Pencil size={14} />} label="Editar" onClick={() => executar(() => onEditar(processo))} />
            <ItemMenu icon={<Copy size={14} />} label="Duplicar" onClick={() => executar(() => onDuplicar(processo))} />
            <ItemMenu icon={<FolderPlus size={14} />} label="Agrupar" onClick={() => executar(() => onAgrupar(processo))} />
            <ItemMenu icon={<Trash2 size={14} />} label="Excluir" destrutivo onClick={() => executar(() => onExcluir(processo))} />
          </div>
        )}
      </div>
    </div>
  )
}

function ItemMenu({ icon, label, onClick, destrutivo }: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  destrutivo?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-[var(--bg-secondary)]"
      style={{ color: destrutivo ? '#f87171' : 'var(--text-primary)' }}
    >
      {icon}
      {label}
    </button>
  )
}
