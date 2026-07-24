'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronRight, ChevronDown, Plus, Trash2, Check, Pencil, Paperclip, Flag, Link2, Square, CheckSquare, MoreVertical, CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { PdfAnnotator } from '@/components/pdf/PdfAnnotator'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

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
  is_marco: boolean
  status: string | null
  children?: ProjetoItemNode[]
}

export type ProjetoItemDependencia = {
  id: string
  projeto_id: string
  item_id: string
  predecessor_id: string
  created_at?: string
}

type ProjetoItemUpdate = Partial<Pick<ProjetoItemNode, 'responsavel' | 'data_inicio' | 'data_prazo' | 'is_marco' | 'status'>> & { concluido?: boolean }

type Props = {
  itens: ProjetoItemNode[]
  projetoId: string
  canEdit?: boolean
  profiles?: { id: string; name: string; apelido: string | null }[]
  dependencias?: ProjetoItemDependencia[]
  onToggle: (id: string, concluido: boolean) => void
  onAdd: (parentId: string | null, nivel: number, nome: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, nome: string) => void
  onUpdateItem?: (id: string, fields: ProjetoItemUpdate) => void
  onSavePredecessoras?: (itemId: string, predecessorIds: string[]) => void
}

type ProjectItemFile = {
  id: string
  project_id: string
  item_id: string
  file_name: string
  file_url: string
  file_size: number
  created_at: string
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
  if (node.status && (node.status as StatusKey) in STATUS_CFG) return node.status as StatusKey
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

const STATUS_ORDER: StatusKey[] = ['pendente', 'em_andamento', 'concluido', 'atrasado']

function calcDurationDays(inicio: string, fim: string): number | null {
  if (!inicio || !fim) return null
  const d1 = new Date(inicio + 'T00:00:00')
  const d2 = new Date(fim + 'T00:00:00')
  const diff = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))
  return diff >= 0 ? diff : null
}

function addDaysToDate(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function projectFilesKey(projetoId: string) {
  return `buildsmart_project_item_files_${projetoId}`
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function ProjetoCascata({ itens, projetoId, canEdit = true, profiles = [], dependencias = [], onToggle, onAdd, onDelete, onRename, onUpdateItem, onSavePredecessoras }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<ProjectItemFile[]>([])
  const [targetItemId, setTargetItemId] = useState<string | null>(null)
  const [pdfAberto, setPdfAberto] = useState<ProjectItemFile | null>(null)
  const [predecessorTarget, setPredecessorTarget] = useState<ProjetoItemNode | null>(null)

  useEffect(() => {
    const raw = localStorage.getItem(projectFilesKey(projetoId))
    if (raw) setFiles(JSON.parse(raw))
    createClient().from('project_item_files').select('*').eq('project_id', projetoId)
      .then(({ data }: { data: ProjectItemFile[] | null }) => {
        if (data?.length) {
          const rows = data as ProjectItemFile[]
          setFiles(rows)
          localStorage.setItem(projectFilesKey(projetoId), JSON.stringify(rows))
        }
      })
  }, [projetoId])

  function persist(next: ProjectItemFile[]) {
    setFiles(next)
    localStorage.setItem(projectFilesKey(projetoId), JSON.stringify(next))
  }

  async function handleFile(filesList: FileList | null) {
    const file = filesList?.[0]
    if (!file || !targetItemId) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      alert('Anexe um arquivo PDF.')
      return
    }
    const row: ProjectItemFile = {
      id: `project-file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      project_id: projetoId,
      item_id: targetItemId,
      file_name: file.name,
      file_url: await fileToDataUrl(file),
      file_size: file.size,
      created_at: new Date().toISOString(),
    }
    const next = [row, ...files.filter(f => f.item_id !== targetItemId)]
    persist(next)
    try {
      await createClient().from('project_item_files').insert({
        project_id: row.project_id,
        item_id: row.item_id,
        file_name: row.file_name,
        file_url: row.file_url,
        file_size: row.file_size,
        created_at: row.created_at,
      })
    } catch {
      // fallback local
    }
    if (inputRef.current) inputRef.current.value = ''
    setTargetItemId(null)
  }

  function attachToItem(itemId: string) {
    setTargetItemId(itemId)
    inputRef.current?.click()
  }

  async function removeFile(file: ProjectItemFile) {
    if (!confirm(`Remover o PDF "${file.file_name}" deste item?`)) return
    const next = files.filter(f => f.id !== file.id)
    persist(next)
    try {
      await createClient().from('project_item_files').delete().eq('id', file.id)
    } catch {
      // fallback local
    }
    if (pdfAberto?.id === file.id) setPdfAberto(null)
  }

  return (
    <div className="min-w-0">
      <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={e => void handleFile(e.target.files)} />
      {/* Cabeçalho de colunas */}
      <div
        className="hidden sm:grid text-xs font-medium px-2 py-2 rounded-t-lg mb-1"
        style={{
          gridTemplateColumns: '1fr 130px 110px 70px 110px',
          background: 'var(--bg-secondary)',
          color: 'var(--text-secondary)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span className="pl-10">Item / Disciplina</span>
        <span>Responsável</span>
        <span>Início</span>
        <span>Duração</span>
        <span>Fim</span>
      </div>

      <div className="space-y-0.5">
        {itens.map(item => (
          <CascataNode
            key={item.id}
            item={item}
            canEdit={canEdit}
            profiles={profiles}
            onToggle={onToggle}
            onAdd={onAdd}
            onDelete={onDelete}
            onRename={onRename}
            onUpdateItem={onUpdateItem}
            dependencias={dependencias}
            onEditPredecessoras={canEdit && onSavePredecessoras ? setPredecessorTarget : undefined}
            file={files.find(f => f.item_id === item.id)}
            allFiles={files}
            onAttach={attachToItem}
            onOpenFile={setPdfAberto}
            onRemoveFile={removeFile}
          />
        ))}
        {canEdit && (
          <AddInlineRow parentId={null} nivel={1} placeholder="+ Nova disciplina" onAdd={onAdd} />
        )}
      </div>
      {pdfAberto && (
        <PdfAnnotator
          fileUrl={pdfAberto.file_url}
          fileName={pdfAberto.file_name}
          contextType="projeto"
          contextId={projetoId}
          itemId={pdfAberto.item_id}
          onClose={() => setPdfAberto(null)}
        />
      )}
      <ProjetoPredecessorPicker
        open={!!predecessorTarget}
        item={predecessorTarget}
        itens={itens}
        dependencias={dependencias}
        onClose={() => setPredecessorTarget(null)}
        onConfirmar={ids => {
          if (predecessorTarget) onSavePredecessoras?.(predecessorTarget.id, ids)
          setPredecessorTarget(null)
        }}
      />
    </div>
  )
}

function CascataNode({ item, canEdit, profiles = [], onToggle, onAdd, onDelete, onRename, onUpdateItem, dependencias, onEditPredecessoras, file, allFiles, onAttach, onOpenFile, onRemoveFile }: {
  item: ProjetoItemNode
  canEdit: boolean
  profiles: { id: string; name: string; apelido: string | null }[]
  onToggle: (id: string, concluido: boolean) => void
  onAdd: (parentId: string | null, nivel: number, nome: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, nome: string) => void
  onUpdateItem?: (id: string, fields: ProjetoItemUpdate) => void
  dependencias: ProjetoItemDependencia[]
  onEditPredecessoras?: (item: ProjetoItemNode) => void
  file?: ProjectItemFile
  allFiles: ProjectItemFile[]
  onAttach: (itemId: string) => void
  onOpenFile: (file: ProjectItemFile) => void
  onRemoveFile: (file: ProjectItemFile) => void
}) {
  const [open, setOpen]               = useState(item.nivel !== 1)
  const [editingNome, setEditingNome] = useState(false)
  const [editValue, setEditValue]     = useState(item.nome)
  const [editingResp, setEditingResp] = useState(false)
  const [tempResp, setTempResp]       = useState(item.responsavel ?? '')
  const [editingDate, setEditingDate] = useState<'inicio' | 'fim' | 'duracao' | null>(null)
  // Mobile: menu de ações (3 pontinhos) + painel de datas
  const [menuOpen, setMenuOpen] = useState(false)
  const [showDatesMobile, setShowDatesMobile] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  const hasChildren     = (item.children?.length ?? 0) > 0
  const canHaveChildren = item.nivel < 3
  // Datas editáveis em todos os níveis (inclui subitem nível 3)
  const hasDateInput    = item.nivel <= 3
  const status          = calcStatus(item)
  const hasPredecessoras = dependencias.some(d => d.item_id === item.id)

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
        className="block sm:grid items-center group hover:bg-[var(--bg-secondary)] transition-colors rounded-xl sm:rounded-none mb-2 sm:mb-0 px-3 sm:px-0 py-3 sm:py-0 border sm:border-0"
        style={{
          gridTemplateColumns: '1fr 130px 110px 70px 110px',
          paddingLeft: 8,
          paddingRight: 8,
          minHeight: 36,
          background: item.nivel === 1 ? NIVEL_BG[1] : item.nivel === 2 ? 'rgba(255,255,255,0.018)' : 'transparent',
          borderColor: 'var(--border)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {/* Coluna 1 — checkbox + expand + nome */}
        <div className="flex items-start sm:items-center gap-2 sm:gap-1.5 py-1.5 min-w-0 flex-wrap sm:flex-nowrap" style={{ paddingLeft: indent }}>
          <button
            className="w-7 h-8 sm:w-4 sm:h-4 flex items-center justify-center flex-shrink-0 rounded-lg sm:rounded-none"
            style={{ color: 'var(--text-secondary)', visibility: hasChildren ? 'visible' : 'hidden' }}
            onClick={() => setOpen(o => !o)}
          >
            {open ? <ChevronDown size={18} className="sm:hidden" /> : <ChevronRight size={18} className="sm:hidden" />}
            {open ? <ChevronDown size={13} className="hidden sm:block" /> : <ChevronRight size={13} className="hidden sm:block" />}
          </button>

          <button
            className={cn(
              'w-6 h-6 sm:w-4 sm:h-4 rounded-md sm:rounded border flex items-center justify-center flex-shrink-0 transition-colors shadow-sm',
              item.concluido ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[rgba(59,123,248,0.35)] bg-[rgba(59,123,248,0.08)]'
            )}
            title={item.concluido ? 'Marcar como pendente' : 'Marcar como concluído'}
            onClick={() => onToggle(item.id, !item.concluido)}
          >
            {item.concluido && <Check size={14} className="text-white sm:hidden" strokeWidth={3} />}
            {item.concluido && <Check size={9} className="text-white hidden sm:block" strokeWidth={3} />}
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
              className={cn('flex-1 text-[15px] sm:text-sm leading-snug sm:truncate min-w-0', item.concluido && 'line-through opacity-50')}
              style={{ color: NIVEL_COLORS[item.nivel], fontWeight: item.nivel === 1 ? 600 : 400 }}
            >
              {item.nome}
            </span>
          )}

          {/* Marco flag + % de conclusão (agrupados) */}
          {(canEdit || item.is_marco || (item.nivel === 1 && progress && progress.total > 0)) && (
            <span className="flex items-center gap-1 flex-shrink-0">
              {canEdit ? (
                <button
                  className="p-0.5 rounded hover:bg-[var(--bg-card)] transition-colors relative"
                  title={item.is_marco ? 'Marco de projeto — clique para remover' : 'Marcar como marco'}
                  onClick={e => { e.stopPropagation(); onUpdateItem?.(item.id, { is_marco: !item.is_marco }) }}
                >
                  <Flag size={item.is_marco ? 16 : 12} style={{ color: item.is_marco ? '#F59E0B' : 'var(--text-secondary)' }} fill={item.is_marco ? '#F59E0B' : 'none'} strokeWidth={item.is_marco ? 2.5 : 1.5} />
                </button>
              ) : item.is_marco ? (
                <Flag size={16} style={{ color: '#F59E0B' }} fill="#F59E0B" />
              ) : null}
              {item.nivel === 1 && progress && progress.total > 0 && (
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none"
                  style={{
                    color: progPct >= 100 ? '#10B981' : progPct > 0 ? 'var(--accent)' : 'var(--text-secondary)',
                    background: progPct >= 100 ? 'rgba(16,185,129,0.14)' : progPct > 0 ? 'rgba(59,123,248,0.12)' : 'var(--bg-secondary)',
                  }}
                >
                  {progPct}%
                </span>
              )}
            </span>
          )}

          {canEdit && onEditPredecessoras && (
            <button
              className="hidden sm:inline-flex p-1 rounded flex-shrink-0 hover:bg-[var(--bg-card)] transition-colors"
              title={hasPredecessoras ? 'Predecessoras configuradas' : 'Adicionar predecessoras'}
              onClick={e => {
                e.stopPropagation()
                onEditPredecessoras(item)
              }}
              style={{
                color: hasPredecessoras ? 'var(--accent)' : 'var(--text-secondary)',
                background: hasPredecessoras ? 'rgba(59,123,248,0.12)' : 'transparent',
              }}
            >
              <Link2 size={12} strokeWidth={hasPredecessoras ? 2.6 : 1.8} />
            </button>
          )}

          {/* Badge de status — clicável para alterar */}
          {item.nivel <= 2 && (
            canEdit ? (
              <button
                className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 hover:ring-1 hover:ring-current transition-all"
                style={{ color: STATUS_CFG[status].color, background: STATUS_CFG[status].bg, whiteSpace: 'nowrap' }}
                title="Clique para alterar status"
                onClick={e => {
                  e.stopPropagation()
                  const idx = STATUS_ORDER.indexOf(status)
                  const next = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length]
                  onUpdateItem?.(item.id, { status: next, concluido: next === 'concluido' })
                }}
              >
                {STATUS_CFG[status].label}
              </button>
            ) : (
              <span
                className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
                style={{ color: STATUS_CFG[status].color, background: STATUS_CFG[status].bg, whiteSpace: 'nowrap' }}
              >
                {STATUS_CFG[status].label}
              </span>
            )
          )}

          <button
            className="hidden sm:inline-flex p-1 rounded hover:bg-[var(--bg-card)] flex-shrink-0"
            title={file ? `Abrir ${file.file_name}` : 'Anexar PDF'}
            onClick={e => {
              e.stopPropagation()
              if (file) onOpenFile(file)
              else if (canEdit) onAttach(item.id)
            }}
            style={{ color: file ? 'var(--accent)' : 'var(--text-secondary)', opacity: file || canEdit ? 1 : 0.35 }}
          >
            <Paperclip size={12} />
          </button>
          {file && canEdit && (
            <button
              className="hidden sm:inline-flex p-1 rounded hover:bg-red-500/10 flex-shrink-0"
              title="Remover PDF"
              onClick={e => {
                e.stopPropagation()
                onRemoveFile(file)
              }}
              style={{ color: '#f87171' }}
            >
              <Trash2 size={11} />
            </button>
          )}

          {/* Mobile: linha de info (toque p/ editar datas) + menu de 3 pontinhos */}
          <div className="basis-full mt-2 sm:hidden" style={{ paddingLeft: 42 }}>
            <div className="flex items-start justify-between gap-2">
              <button
                type="button"
                onClick={() => { if (canEdit && hasDateInput) setShowDatesMobile(v => !v) }}
                className="min-w-0 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-left"
                style={{ color: 'var(--text-secondary)' }}
              >
                {item.responsavel && <span>👤 {item.responsavel}</span>}
                {(eff.inicio || eff.fim) ? (
                  <span style={{ color: atrasado ? '#EF4444' : 'var(--text-secondary)' }}>
                    {atrasado && '⚠ '}{eff.inicio ? fmtDate(eff.inicio) : '--'}{eff.fim ? ` → ${fmtDate(eff.fim)}` : ''}
                    {(() => { const d = calcDurationDays(eff.inicio ?? '', eff.fim ?? ''); return d !== null ? ` · ${d}d` : '' })()}
                  </span>
                ) : canEdit && hasDateInput ? (
                  <span className="opacity-60">+ definir datas</span>
                ) : null}
                {file && <span className="truncate" style={{ color: 'var(--accent)' }}>{file.file_name}</span>}
              </button>

              {canEdit && !editingNome && (
                <div className="relative flex-shrink-0" ref={menuRef}>
                  <button
                    className="h-8 w-8 rounded-lg border flex items-center justify-center"
                    style={{ color: 'var(--text-secondary)', borderColor: 'rgba(148,163,184,0.22)', background: 'rgba(148,163,184,0.08)' }}
                    onClick={() => setMenuOpen(v => !v)}
                    title="Ações"
                  >
                    <MoreVertical size={16} />
                  </button>
                  {menuOpen && (
                    <div className="absolute right-0 top-9 z-30 w-52 rounded-xl border py-1 shadow-lg" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                      <MenuItem icon={Pencil} label="Renomear" onClick={() => { setMenuOpen(false); setEditingNome(true); setOpen(true) }} />
                      {canHaveChildren && <MenuItem icon={Plus} label={`Adicionar ${NIVEL_LABELS[item.nivel + 1]}`} onClick={() => { setMenuOpen(false); setOpen(true) }} />}
                      {hasDateInput && <MenuItem icon={CalendarDays} label="Editar datas" onClick={() => { setMenuOpen(false); setShowDatesMobile(true) }} />}
                      <MenuItem icon={Flag} label={item.is_marco ? 'Remover marco' : 'Marcar como marco'} onClick={() => { setMenuOpen(false); onUpdateItem?.(item.id, { is_marco: !item.is_marco }) }} />
                      {onEditPredecessoras && <MenuItem icon={Link2} label="Predecessoras" onClick={() => { setMenuOpen(false); onEditPredecessoras(item) }} />}
                      {file ? (
                        <MenuItem icon={Paperclip} label="Abrir PDF" onClick={() => { setMenuOpen(false); onOpenFile(file) }} />
                      ) : (
                        <MenuItem icon={Paperclip} label="Anexar PDF" onClick={() => { setMenuOpen(false); onAttach(item.id) }} />
                      )}
                      {file && <MenuItem icon={Trash2} label="Remover PDF" danger onClick={() => { setMenuOpen(false); onRemoveFile(file) }} />}
                      <MenuItem icon={Trash2} label="Excluir" danger onClick={() => { setMenuOpen(false); onDelete(item.id) }} />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Painel de datas mobile (Início / Duração / Fim) */}
            {canEdit && hasDateInput && showDatesMobile && (
              <div className="grid grid-cols-3 gap-2 mt-2">
                <label className="min-w-0">
                  <span className="block text-[10px] mb-1" style={{ color: 'var(--text-secondary)' }}>Início</span>
                  <input
                    type="date"
                    className="w-full min-h-10 rounded-lg border px-2 text-xs outline-none"
                    style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    value={item.data_inicio ?? ''}
                    onChange={e => onUpdateItem?.(item.id, { data_inicio: e.target.value || null })}
                  />
                </label>
                <label className="min-w-0">
                  <span className="block text-[10px] mb-1" style={{ color: 'var(--text-secondary)' }}>Duração</span>
                  <input
                    type="number"
                    min={0}
                    className="w-full min-h-10 rounded-lg border px-2 text-xs outline-none"
                    style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    placeholder="dias"
                    value={calcDurationDays(item.data_inicio ?? '', item.data_prazo ?? '') ?? ''}
                    onChange={e => {
                      const days = parseInt(e.target.value)
                      if (!isNaN(days) && days >= 0 && item.data_inicio) {
                        onUpdateItem?.(item.id, { data_prazo: addDaysToDate(item.data_inicio, days) })
                      }
                    }}
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
          </div>

          {canEdit && !editingNome && (
            <div className="hidden sm:flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-shrink-0 ml-1">
              <button
                className="p-1 rounded hover:bg-[var(--bg-card)]"
                title="Renomear"
                onClick={() => { setEditingNome(true); setOpen(true) }}
              >
                <Pencil size={11} style={{ color: 'var(--text-secondary)' }} />
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
                onChange={e => {
                  const newInicio = e.target.value || null
                  if (newInicio && item.data_prazo) {
                    onUpdateItem?.(item.id, { data_inicio: newInicio })
                  } else {
                    onUpdateItem?.(item.id, { data_inicio: newInicio })
                  }
                }}
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

        {/* Coluna 4 — Duração */}
        <div className="hidden sm:block py-1 pr-1">
          {hasDateInput ? (
            editingDate === 'duracao' && canEdit ? (
              <input
                type="number"
                autoFocus
                min={0}
                className="text-xs rounded-md border px-1.5 py-0.5 outline-none w-full"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--accent)', color: 'var(--text-primary)' }}
                defaultValue={calcDurationDays(item.data_inicio ?? '', item.data_prazo ?? '') ?? ''}
                onBlur={e => {
                  const days = parseInt(e.target.value)
                  if (!isNaN(days) && days >= 0 && item.data_inicio) {
                    onUpdateItem?.(item.id, { data_prazo: addDaysToDate(item.data_inicio, days) })
                  }
                  setEditingDate(null)
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const days = parseInt((e.target as HTMLInputElement).value)
                    if (!isNaN(days) && days >= 0 && item.data_inicio) {
                      onUpdateItem?.(item.id, { data_prazo: addDaysToDate(item.data_inicio, days) })
                    }
                    setEditingDate(null)
                  }
                  if (e.key === 'Escape') setEditingDate(null)
                }}
              />
            ) : (
              <button
                className="text-left w-full rounded px-1 py-0.5 hover:bg-[var(--bg-secondary)] transition-colors"
                disabled={!canEdit || !item.data_inicio}
                onClick={() => canEdit && item.data_inicio && setEditingDate('duracao')}
                title={!item.data_inicio ? 'Defina a data de início primeiro' : 'Clique para editar duração'}
              >
                {(() => {
                  const dur = calcDurationDays(item.data_inicio ?? '', item.data_prazo ?? '')
                  return dur !== null ? (
                    <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {dur}d
                    </span>
                  ) : (
                    <span className="text-xs opacity-0 group-hover:opacity-30 transition-opacity" style={{ color: 'var(--text-secondary)' }}>—</span>
                  )
                })()}
              </button>
            )
          ) : (() => {
            const dur = calcDurationDays(eff.inicio ?? '', eff.fim ?? '')
            return dur !== null ? (
              <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                {dur}d
              </span>
            ) : (
              <span className="text-xs opacity-30" style={{ color: 'var(--text-secondary)' }}>—</span>
            )
          })()}
        </div>

        {/* Coluna 5 — Fim */}
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
              onToggle={onToggle}
              onAdd={onAdd}
              onDelete={onDelete}
              onRename={onRename}
              onUpdateItem={onUpdateItem}
              dependencias={dependencias}
              onEditPredecessoras={onEditPredecessoras}
              file={allFiles.find(f => f.item_id === child.id)}
              allFiles={allFiles}
              onAttach={onAttach}
              onOpenFile={onOpenFile}
              onRemoveFile={onRemoveFile}
            />
          ))}
        </div>
      )}

      {/* Adicionar filho inline — always visible when no children or when expanded */}
      {(open || !hasChildren) && canEdit && canHaveChildren && (
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

function ProjetoPredecessorPicker({ open, item, itens, dependencias, onClose, onConfirmar }: {
  open: boolean
  item: ProjetoItemNode | null
  itens: ProjetoItemNode[]
  dependencias: ProjetoItemDependencia[]
  onClose: () => void
  onConfirmar: (ids: string[]) => void
}) {
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!open || !item) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelecionados(new Set(dependencias.filter(d => d.item_id === item.id).map(d => d.predecessor_id)))
  }, [open, item, dependencias])

  if (!item) return null

  const excluirIds = new Set([item.id, ...collectNodeDescendants(item)])

  function toggle(id: string) {
    setSelecionados(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function renderNode(node: ProjetoItemNode, depth = 0) {
    if (excluirIds.has(node.id)) return null
    const hasKids = (node.children?.filter(child => !excluirIds.has(child.id)).length ?? 0) > 0
    const isCollapsed = collapsed[node.id] ?? false
    const checked = selecionados.has(node.id)

    return (
      <div key={node.id}>
        <div
          className="flex items-center gap-2 border-b px-3 py-2"
          style={{ borderColor: 'var(--border)', paddingLeft: 12 + depth * 18, background: node.nivel === 1 ? 'var(--bg-secondary)' : 'transparent' }}
        >
          {hasKids ? (
            <button
              type="button"
              onClick={() => setCollapsed(prev => ({ ...prev, [node.id]: !prev[node.id] }))}
              className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded"
              style={{ color: 'var(--text-secondary)' }}
            >
              {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
            </button>
          ) : (
            <span className="h-6 w-6 flex-shrink-0" />
          )}
          <button
            type="button"
            onClick={() => toggle(node.id)}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
            style={{ color: checked ? 'var(--accent)' : 'var(--text-primary)' }}
          >
            {checked ? <CheckSquare size={15} /> : <Square size={15} />}
            <span className={cn('truncate text-sm', node.nivel === 1 && 'font-semibold')}>{node.nome}</span>
          </button>
          {(node.data_prazo || node.data_inicio) && (
            <span className="hidden text-[10px] sm:inline" style={{ color: 'var(--text-secondary)' }}>
              {fmtDate(node.data_inicio)}{node.data_prazo ? ` -> ${fmtDate(node.data_prazo)}` : ''}
            </span>
          )}
        </div>
        {!isCollapsed && node.children?.map(child => renderNode(child, depth + 1))}
      </div>
    )
  }

  return (
    <Modal open={open} onClose={onClose} title="Selecionar predecessoras" size="lg">
      <div className="flex flex-col gap-3">
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Marque o que precisa terminar antes de &quot;{item.nome}&quot; começar.
        </p>
        <div className="max-h-[52vh] overflow-y-auto rounded-lg border" style={{ borderColor: 'var(--border)' }}>
          {itens.map(node => renderNode(node))}
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" onClick={() => onConfirmar(Array.from(selecionados))}>
            Confirmar ({selecionados.size})
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function collectNodeDescendants(node: ProjetoItemNode): string[] {
  return (node.children ?? []).flatMap(child => [child.id, ...collectNodeDescendants(child)])
}

function MenuItem({ icon: Icon, label, onClick, danger }: {
  icon: typeof Pencil
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-[var(--bg-secondary)] transition-colors"
      style={{ color: danger ? '#f87171' : 'var(--text-primary)' }}
    >
      <Icon size={15} style={{ color: danger ? '#f87171' : 'var(--text-secondary)' }} />
      {label}
    </button>
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
