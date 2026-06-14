'use client'

import { MoreVertical, Pencil, Trash2 } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { formatDate } from '@/lib/utils'

export type CadastroTipo = 'projeto' | 'obra' | 'orcamento'

export interface CadastroCardProps {
  tipo: CadastroTipo
  id: string
  nome: string
  foto_url?: string | null
  status: string
  statusLabel: string
  statusColor: string
  cliente?: string | null
  data_inicio?: string | null
  data_previsao?: string | null
  responsaveis?: string[]
  progress?: number
  href: string
  onEdit: () => void
  onDelete: () => void
}

const TIPO_GRADIENT: Record<CadastroTipo, string> = {
  obra:      'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
  projeto:   'linear-gradient(135deg, #065f46 0%, #10b981 100%)',
  orcamento: 'linear-gradient(135deg, #92400e 0%, #f59e0b 100%)',
}

const TIPO_LABEL: Record<CadastroTipo, string> = {
  obra:      'Obra',
  projeto:   'Projeto',
  orcamento: 'Orçamento',
}

export function CadastroCard({
  tipo, id, nome, foto_url, status, statusLabel, statusColor,
  cliente, data_inicio, data_previsao, responsaveis = [],
  progress, href, onEdit, onDelete,
}: CadastroCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  return (
    <div className="card overflow-hidden relative" style={{ cursor: 'default' }}>
      {/* Foto ou gradiente */}
      <a href={href} className="block" style={{ textDecoration: 'none' }}>
        <div className="relative" style={{ paddingBottom: '56.25%', background: TIPO_GRADIENT[tipo] }}>
          {foto_url && (
            <img
              src={foto_url}
              alt={nome}
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}
          {/* Badge tipo */}
          <span
            className="absolute top-2 right-2 text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(0,0,0,0.45)', color: '#fff', backdropFilter: 'blur(4px)' }}
          >
            {TIPO_LABEL[tipo]}
          </span>
        </div>

        {/* Corpo */}
        <div className="p-4 space-y-2">
          {/* Status badge */}
          <span
            className="inline-block text-xs font-medium px-2 py-0.5 rounded-full"
            style={{ background: statusColor + '22', color: statusColor }}
          >
            {statusLabel}
          </span>

          <h3 className="font-semibold text-sm leading-tight line-clamp-2" style={{ color: 'var(--text-primary)' }}>
            {nome}
          </h3>

          {cliente && (
            <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
              {cliente}
            </p>
          )}

          {/* Barra de progresso */}
          {progress !== undefined && (
            <div className="space-y-1">
              <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${progress}%`, background: 'var(--accent)' }}
                />
              </div>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{progress}% concluído</p>
            </div>
          )}

          {/* Responsáveis + datas */}
          <div className="flex items-center justify-between gap-2 pt-1">
            {responsaveis.length > 0 ? (
              <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                👤 {responsaveis.slice(0, 2).join(', ')}{responsaveis.length > 2 ? ` +${responsaveis.length - 2}` : ''}
              </p>
            ) : (
              <span />
            )}
            {(data_inicio || data_previsao) && (
              <p className="text-xs flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
                📅 {formatDate(data_previsao ?? data_inicio ?? '')}
              </p>
            )}
          </div>
        </div>
      </a>

      {/* Menu de ações — fora do <a> */}
      <div ref={menuRef} className="absolute top-2 left-2" style={{ zIndex: 10 }}>
        <button
          onClick={e => { e.preventDefault(); e.stopPropagation(); setMenuOpen(v => !v) }}
          className="p-1.5 rounded-full transition-colors"
          style={{ background: 'rgba(0,0,0,0.35)', color: '#fff', backdropFilter: 'blur(4px)' }}
        >
          <MoreVertical size={14} />
        </button>
        {menuOpen && (
          <div
            className="absolute left-0 mt-1 w-36 rounded-xl border shadow-xl z-50 overflow-hidden"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(false); onEdit() }}
              className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-left hover:bg-[var(--bg-secondary)] transition-colors"
              style={{ color: 'var(--text-primary)' }}
            >
              <Pencil size={13} /> Editar
            </button>
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(false); onDelete() }}
              className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-left hover:bg-red-500/10 transition-colors"
              style={{ color: 'var(--danger)' }}
            >
              <Trash2 size={13} /> Excluir
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
