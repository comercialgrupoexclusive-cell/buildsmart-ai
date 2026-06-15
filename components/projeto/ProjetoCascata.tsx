'use client'

import { useState } from 'react'
import { ChevronRight, ChevronDown, Plus, Trash2, Check, Pencil, Paperclip } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ProjectItemFile } from '@/lib/types'

export type { ProjectItemFile }

export type ProjetoItemNode = {
  id: string
  projeto_id: string
  parent_id: string | null
  nome: string
  nivel: number  // 1=disciplina 2=item 3=subitem
  concluido: boolean
  ordem: number
  responsavel: string | null
  data_inicio: string | null
  data_prazo: string | null
  children?: ProjetoItemNode[]
}

type Props = {
  itens: ProjetoItemNode[]
  canEdit?: boolean
  profiles?: { id: string; name: string; apelido: string | null }[]
  itemFiles?: Record<string, ProjectItemFile[]>
  onToggle: (id: string, concluido: boolean) => void
  onAdd: (parentId: string | null, nivel: number, nome: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, nome: string) => void
  onUpdateItem?: (id: string, fields: Partial<Pick<ProjetoItemNode, 'responsavel' | 'data_inicio' | 'data_prazo'>>) => void
  onAttachFile?: (itemId: string) => void
  onOpenFile?: (file: ProjectItemFile) => void
}

const NIVEL_LABELS = ['', 'Disciplina', 'Item', 'Subitem']
const NIVEL_COLORS = ['', 'var(--accent)', 'var(--text-primary)', 'var(--text-secondary)']
const NIVEL_BG    = ['', 'rgba(59,123,248,0.06)', 'transparent', 'transparent']

function calcProgress(node: ProjetoItemNode): { total: number; done: number } {
  if (!node.children || node.children.length === 0) return { total: 1, done: node.concluido ? 1 : 0 }
  return node.children.reduce((acc, c) => {
    const p = calcProgress(c)
    return { total: acc.total + p.total, done: acc.done + p.done }
  }, { total: 0, done: 0 })
}

function fmtDate(d: string | null) {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${String(y).slice(2)}`
}

/** Datas efetivas: item direto usa próprias datas; disciplina = menor início → maior fim dos filhos */
function effectiveDates(node: ProjetoItemNode): { inicio: string | null; fim: string | null } {
  if (!node.children || node.children.length === 0) {
    return { inicio: node.data_inicio, fim: node.data_prazo }
  }
  const childDates = node.children.map(effectiveDates)
  const inicios = childDates.map(d => d.inicio).filter(Boolean) as string[]
  const fims    = childDates.map(d => d.fim).filter(Boolean) as string[]
  return {
    inicio: inicios.length ? inicios.reduce((a, b) => (a < b ? a : b)) : node.data_inicio,
    fim:    fims.length    ? fims.reduce((a, b) => (a > b ? a : b))    : node.data_prazo,
  }
}

type StatusKey = 'pendente' | 'em_andamento' | 'atrasado' | 'concluido'
const STATUS_CFG: Record<StatusKey, { label: string; color: string; bg: string }> = {
  pendente:     { label: 'Pendente',  color: '#6B7280', bg: 'rgba(107,114,128,0.14)' },
  em_andamento: { label: 'Andamento', color: '#3B7BF8', bg: 'rgba(59,123,248,0.14)'  },
  atrasado:     { label: 'Atrasado',  color: '#EF4444', bg: 'rgba(239,68,68,0.14)'   },
  concluido:    { label: 'Concluído', color: '#10B981', bg: 'rgba(16,185,129,0.14)'  },
}

function calcStatus(node: ProjetoItemNode): StatusKey {
  if (node.nivel === 1 && node.children?.length) {
    const p = calcProgress(node)
    if (p.total > 0 && p.done === p.total) return 'concluido'
  } else if (node.concluido) {
    return 'concluido'
  }
  const today = new Date(); today.setHours(0, 0, 0, 0)
  if (node.data_prazo && new Date(node.data_prazo) < today) return 'atrasado'
  if (node.data_inicio && new Date(node.data_inicio) <= today) return 'em_andamento'
  return 'pendente'
}

export function ProjetoCascata({ itens, canEdit = true, profiles = [], itemFiles = {}, onToggle, onAdd, onDelete, onRename, onUpdateItem, onAttachFile, onOpenFile }: Props) {
  return (
    <div className="min-w-0">
      {/* Cabeçalho de colunas */}
      <div
        className="hidden sm:grid text-xs font-medium px-2 py-2 rounded-t-lg mb-1"
        style={{
          gridTemplateColumns: '1fr 130px 110px 110px',
          background: 'var(--bg-secondary)',
          color: 'var(--text-secondary)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span className="pl-10">Item / Disciplina</span>
        <span>Responsável</span>
        <span>Início</span>
        <span>Fim</span>
      </div>

      <div className="space-y-0.5">
        {itens.map(item => (
          <CascataNode
            key={item.id}
            item={item}
            canEdit={canEdit}
            profiles={profiles}
            itemFiles={itemFiles}
            onToggle={onToggle}
            onAdd={onAdd}
            onDelete={onDelete}
            onRename={onRename}
            onUpdateItem={onUpdateItem}
            onAttachFile={onAttachFile}
            onOpenFile={onOpenFile}
          />
        ))}
        {canEdit && (
          <AddInlineRow parentId={null} nivel={1} placeholder="+ Nova disciplina" onAdd={onAdd} />
        )}
      </div>
    </div>
  )
}

function CascataNode({ item, canEdit, profiles = [], itemFiles = {}, onToggle, onAdd, onDelete, onRename, onUpdateItem, onAttachFile, onOpenFile }: {
  item: ProjetoItemNode
  canEdit: boolean
  profiles: { id: string; name: string; apelido: string | null }[]
  itemFiles: Record<string, ProjectItemFile[]>
  onToggle: (id: string, concluido: boolean) => void
  onAdd: (parentId: string | null, nivel: number, nome: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, nome: string) => void
  onUpdateItem?: (id: string, fields: Partial<Pick<ProjetoItemNode, 'responsavel' | 'data_inicio' | 'data_prazo'>>) => void
  onAttachFile?: (itemId: string) => void
  onOpenFile?: (file: ProjectItemFile) => void
}) {
  const [open, setOpen]               = useState(item.nivel !== 1)
  const [editingNome, setEditingNome] = useState(false)
  const [editValue, setEditValue]     = useState(item.nome)
  const [editingResp, setEditingResp] = useState(false)
  const [tempResp, setTempResp]       = useState(item.responsavel ?? '')
  const [editingDate, setEditingDate] = useState<'inicio' | 'fim' | null>(null)

  const hasChildren     = (item.children?.length ?? 0) > 0
  const canHaveChildren = item.nivel < 3
  const hasDateInput    = item.nivel <= 2
  const status          = calcStatus(item)

  const progress = item.nivel === 1 ? calcProgress(item) : null
  const progPct  = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  const eff      = effectiveDates(item)
  const atrasado = !!(item.data_prazo && !item.concluido && new Date(item.data_prazo) < new Date())

  function commitNome() {
    const t = editValue.trim()
    if (t && t !== item.nome) onRename(item.id, t)
    else setEditValue(item.nome)
    setEditingNome(false)
  }

  function saveResp() {
    onUpdateItem?.(item.id, { responsavel: tempResp.trim() || null })
    setEditingResp(false)
  }

  const indent = (item.nivel - 1) * 20

  return (
    <div>
      {/* Linha principal — grid de 3 colunas */}
      <div
        className="block sm:grid items-center group hover:bg-[var(--bg-secondary)] transition-colors rounded-lg sm:rounded-none mb-1 sm:mb-0 px-2 sm:px-0 py-2 sm:py-0"
        style={{
          gridTemplateColumns: '1fr 130px 110px 110px',
          paddingLeft: 8,
          paddingRight: 8,
          minHeight: 36,
          background: item.nivel === 1 ? NIVEL_BG[1] : item.nivel === 2 ? 'rgba(255,255,255,0.018)' : 'transparent',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {/* Coluna 1 — checkbox + expand + nome */}
        <div className="flex items-center gap-1.5 py-1.5 min-w-0 flex-wrap sm:flex-nowrap" style={{ paddingLeft: indent }}>
          <button
            className="w-4 h-4 flex items-center justify-center flex-shrink-0"
            style={{ color: 'var(--text-secondary)', visibility: hasChildren ? 'visible' : 'hidden' }}
            onClick={() => setOpen(o => !o)}
          >
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>

          <button
            className={cn(
              'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors',
              item.concluido ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[var(--border)]'
            )}
            onClick={() => onToggle(item.id, !item.concluido)}
          >
            {item.concluido && <Check size={9} className="text-white" strokeWidth={3} />}
          </button>

          {editingNome ? (
            <input
              autoFocus
              className="flex-1 bg-transparent border-b border-[var(--accent)] outline-none text-sm px-0.5 min-w-0"
              style={{ color: 'var(--text-primary)' }}
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={commitNome}
              onKeyDown={e => {
                if (e.key === 'Enter') commitNome()
                if (e.key === 'Escape') { setEditValue(item.nome); setEditingNome(false) }
              }}
            />
          ) : (
            <span
              className={cn('flex-1 text-sm truncate min-w-0', item.concluido && 'line-through opacity-50')}
              style={{ color: NIVEL_COLORS[item.nivel], fontWeight: item.nivel === 1 ? 600 : 400 }}
            >
              {item.nome}
              {item.nivel === 1 && progress && progress.total > 0 && (
                <span className="ml-2 text-[10px] font-normal opacity-60">{progPct}%</span>
              )}
            </span>
          )}

          {/* Badge de status */}
          {item.nivel <= 2 && (
            <span
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
              style={{ color: STATUS_CFG[status].color, background: STATUS_CFG[status].bg, whiteSpace: 'nowrap' }}
            >
              {STATUS_CFG[status].label}
            </span>
          )}

          {/* File attachment indicator */}
          {(itemFiles[item.id]?.length ?? 0) > 0 && (
            <button
              onClick={() => onOpenFile?.(itemFiles[item.id][0])}
              className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 hover:opacity-80 transition-opacity"
              style={{ background: 'rgba(59,123,248,0.12)', color: 'var(--accent)' }}
              title={itemFiles[item.id][0].file_name}
            >
              <Paperclip size={9} />
              <span className="max-w-[80px] truncate hidden sm:inline">{itemFiles[item.id][0].file_name}</span>
              {itemFiles[item.id].length > 1 && <span>+{itemFiles[item.id].length - 1}</span>}
            </button>
          )}

          <div className="basis-full mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] sm:hidden" style={{ color: 'var(--text-secondary)', paddingLeft: 42 }}>
            {item.responsavel && <span>{item.responsavel}</span>}
            {(eff.inicio || eff.fim) && (
              <span>
                {eff.inicio ? fmtDate(eff.inicio) : '--'}
                {eff.fim ? ` -> ${fmtDate(eff.fim)}` : ''}
              </span>
            )}
          </div>

          {/* Ações hover */}
          {canEdit && hasDateInput && (
            <div className="basis-full sm:hidden grid grid-cols-2 gap-2 mt-2" style={{ paddingLeft: 42 }}>
              <label className="min-w-0">
                <span className="block text-[10px] mb-1" style={{ color: 'var(--text-secondary)' }}>Inicio</span>
                <input
                  type="date"
                  className="w-full min-h-10 rounded-lg border px-2 text-xs outline-none"
                  style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  value={item.data_inicio ?? ''}
                  onChange={e => onUpdateItem?.(item.id, { data_inicio: e.target.value || null })}
                />
              </label>
              <label className="min-w-0">
                <span className="block text-[10px] mb-1" style={{ color: atrasado ? '#EF4444' : 'var(--text-secondary)' }}>Fim</span>
                <input
                  type="date"
                  className="w-full min-h-10 rounded-lg border px-2 text-xs outline-none"
                  style={{ background: 'var(--bg-card)', borderColor: atrasado ? '#EF4444' : 'var(--border)', color: 'var(--text-primary)' }}
                  value={item.data_prazo ?? ''}
                  onChange={e => onUpdateItem?.(item.id, { data_prazo: e.target.value || null })}
                />
              </label>
            </div>
          )}

          {canEdit && !editingNome && (
            <div className="flex items-center gap-0.5 opacity-40 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-1">
              <button
                className="p-1 rounded hover:bg-[var(--bg-card)]"
                title="Renomear"
                onClick={() => { setEditingNome(true); setOpen(true) }}
              >
                <Pencil size={11} style={{ color: 'var(--text-secondary)' }} />
              </button>
              {/* Paperclip: attach or open file */}
              <button
                className="p-1 rounded hover:bg-[var(--bg-card)]"
                title="Anexar PDF"
                onClick={() => onAttachFile?.(item.id)}
                style={{ color: (itemFiles[item.id]?.length ?? 0) > 0 ? 'var(--accent)' : 'var(--text-secondary)' }}
              >
                <Paperclip size={11} />
              </button>
              {canHaveChildren && (
                <button
                  className="p-1 rounded hover:bg-[var(--bg-card)]"
                  title={`Adicionar ${NIVEL_LABELS[item.nivel + 1]}`}
                  onClick={() => setOpen(true)}
                  style={{ color: 'var(--accent)' }}
                >
                  <Plus size={11} />
                </button>
              )}
              <button
                className="p-1 rounded hover:bg-red-500/10"
                title="Excluir"
                onClick={() => onDelete(item.id)}
                style={{ color: '#f87171' }}
              >
                <Trash2 size={11} />
              </button>
            </div>
          )}
        </div>

        {/* Coluna 2 — Responsável */}
        <div className="hidden sm:block py-1.5 pr-2">
          {editingResp ? (
            <div className="flex items-center gap-1">
              {profiles.length > 0 ? (
                <select
                  autoFocus
                  className="input-base text-xs flex-1"
                  value={tempResp}
                  onChange={e => setTempResp(e.target.value)}
                  onBlur={saveResp}
                >
                  <option value="">—</option>
                  {profiles.map(p => (
                    <option key={p.id} value={p.apelido ?? p.name}>{p.apelido ?? p.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  autoFocus
                  type="text"
                  className="input-base text-xs flex-1"
                  value={tempResp}
                  onChange={e => setTempResp(e.target.value)}
                  onBlur={saveResp}
                  onKeyDown={e => { if (e.key === 'Enter') saveResp(); if (e.key === 'Escape') setEditingResp(false) }}
                />
              )}
            </div>
          ) : (
            <button
              className="text-left w-full"
              onClick={() => { setTempResp(item.responsavel ?? ''); setEditingResp(true) }}
              disabled={!canEdit}
            >
              {item.responsavel ? (
                <span className="text-xs truncate block" style={{ color: 'var(--text-primary)' }}>
                  👤 {item.responsavel}
                </span>
              ) : (
                <span className="text-xs opacity-0 group-hover:opacity-40 transition-opacity" style={{ color: 'var(--text-secondary)' }}>
                  + responsável
                </span>
              )}
            </button>
          )}
        </div>

        {/* Coluna 3 — Início */}
        <div className="hidden sm:block py-1 pr-1">
          {hasDateInput ? (
            editingDate === 'inicio' && canEdit ? (
              <input
                type="date"
                autoFocus
                className="text-xs rounded-md border px-1.5 py-0.5 outline-none w-full"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--accent)', color: 'var(--text-primary)' }}
                value={item.data_inicio ?? ''}
                onChange={e => onUpdateItem?.(item.id, { data_inicio: e.target.value || null })}
                onBlur={() => setEditingDate(null)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditingDate(null) }}
              />
            ) : (
              <button
                className="text-left w-full rounded px-1 py-0.5 hover:bg-[var(--bg-secondary)] transition-colors"
                disabled={!canEdit}
                onClick={() => canEdit && setEditingDate('inicio')}
              >
                {item.data_inicio ? (
                  <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    {fmtDate(item.data_inicio)}
                  </span>
                ) : (
                  <span className="text-xs opacity-0 group-hover:opacity-30 transition-opacity" style={{ color: 'var(--text-secondary)' }}>—</span>
                )}
              </button>
            )
          ) : eff.inicio ? (
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              {fmtDate(eff.inicio)}
            </span>
          ) : (
            <span className="text-xs opacity-30" style={{ color: 'var(--text-secondary)' }}>—</span>
          )}
        </div>

        {/* Coluna 4 — Fim */}
        <div className="hidden sm:block py-1 pr-2">
          {hasDateInput ? (
            editingDate === 'fim' && canEdit ? (
              <input
                type="date"
                autoFocus
                className="text-xs rounded-md border px-1.5 py-0.5 outline-none w-full"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--accent)', color: 'var(--text-primary)' }}
                value={item.data_prazo ?? ''}
                onChange={e => onUpdateItem?.(item.id, { data_prazo: e.target.value || null })}
                onBlur={() => setEditingDate(null)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditingDate(null) }}
              />
            ) : (
              <button
                className="text-left w-full rounded px-1 py-0.5 hover:bg-[var(--bg-secondary)] transition-colors"
                disabled={!canEdit}
                onClick={() => canEdit && setEditingDate('fim')}
              >
                {item.data_prazo ? (
                  <span className="text-xs font-medium flex items-center gap-1" style={{ color: atrasado ? '#EF4444' : 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    {atrasado && '⚠'}{fmtDate(item.data_prazo)}
                  </span>
                ) : (
                  <span className="text-xs opacity-0 group-hover:opacity-30 transition-opacity" style={{ color: 'var(--text-secondary)' }}>—</span>
                )}
              </button>
            )
          ) : eff.fim ? (
            <span className="text-xs font-medium flex items-center gap-1" style={{ color: atrasado ? '#EF4444' : '#10B981', whiteSpace: 'nowrap' }}>
              {atrasado && '⚠'}{fmtDate(eff.fim)}
            </span>
          ) : (
            <span className="text-xs opacity-30" style={{ color: 'var(--text-secondary)' }}>—</span>
          )}
        </div>
      </div>

      {/* Filhos */}
      {open && (item.children?.length ?? 0) > 0 && (
        <div>
          {item.children!.map(child => (
            <CascataNode
              key={child.id}
              item={child}
              canEdit={canEdit}
              profiles={profiles}
              itemFiles={itemFiles}
              onToggle={onToggle}
              onAdd={onAdd}
              onDelete={onDelete}
              onRename={onRename}
              onUpdateItem={onUpdateItem}
              onAttachFile={onAttachFile}
              onOpenFile={onOpenFile}
            />
          ))}
        </div>
      )}

      {/* Adicionar filho inline */}
      {open && canEdit && canHaveChildren && (
        <div style={{ paddingLeft: indent + 52 }}>
          <AddInlineRow
            parentId={item.id}
            nivel={item.nivel + 1}
            placeholder={`+ ${NIVEL_LABELS[item.nivel + 1]}`}
            onAdd={onAdd}
          />
        </div>
      )}
    </div>
  )
}

function AddInlineRow({ parentId, nivel, placeholder, onAdd }: {
  parentId: string | null
  nivel: number
  placeholder: string
  onAdd: (parentId: string | null, nivel: number, nome: string) => void
}) {
  const [active, setActive] = useState(false)
  const [value, setValue]   = useState('')

  function commit() {
    const t = value.trim()
    if (t) onAdd(parentId, nivel, t)
    setValue(''); setActive(false)
  }

  if (!active) {
    return (
      <button
        className="text-xs px-2 py-1 rounded opacity-30 hover:opacity-70 transition-opacity w-full text-left"
        style={{ color: 'var(--text-secondary)' }}
        onClick={() => setActive(true)}
      >
        {placeholder}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 px-2 py-1">
      <input
        autoFocus
        className="flex-1 text-sm bg-[var(--bg-card)] border border-[var(--accent)] rounded px-2 py-1 outline-none"
        style={{ color: 'var(--text-primary)' }}
        placeholder={placeholder.replace('+ ', '')}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') { setValue(''); setActive(false) }
        }}
        onBlur={() => { if (!value.trim()) setActive(false) }}
      />
      <button className="text-xs px-2 py-1 rounded text-white" style={{ background: 'var(--accent)' }} onClick={commit}>OK</button>
    </div>
  )
}

/** Utilitário: converte lista plana em árvore */
export function buildProjetoTree(itens: ProjetoItemNode[]): ProjetoItemNode[] {
  const map   = new Map<string, ProjetoItemNode>()
  const roots: ProjetoItemNode[] = []

  itens.forEach(item => map.set(item.id, { ...item, children: [] }))

  itens.forEach(item => {
    const node = map.get(item.id)!
    if (item.parent_id && map.has(item.parent_id)) {
      map.get(item.parent_id)!.children!.push(node)
    } else {
      roots.push(node)
    }
  })

  return roots
}
