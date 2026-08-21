'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Tarefa } from '@/lib/types'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { PRIORIDADE_LABEL, STATUS_LABEL } from '@/lib/tarefas'

type FormState = {
  titulo: string
  descricao: string
  responsavel_id: string
  prioridade: Tarefa['prioridade']
  data_prazo: string
  status: Tarefa['status']
}

function formVazio(): FormState {
  return { titulo: '', descricao: '', responsavel_id: '', prioridade: 'normal', data_prazo: '', status: 'pendente' }
}

// Modal única de criação/edição de tarefa, reutilizada pelo painel de
// contexto (Obra/Projeto) e pela tela global. Criação exige só o título;
// obra_id/projeto_id são herdados automaticamente do contexto (se houver) e
// nunca aparecem como campo — o usuário não escolhe "onde" a tarefa mora.
export function TarefaModal({
  open, onClose, editando, obraId, projetoId, onSaved,
}: {
  open: boolean
  onClose: () => void
  editando: Tarefa | null
  obraId?: string | null
  projetoId?: string | null
  onSaved: (t: Tarefa) => void
}) {
  return (
    <Modal open={open} onClose={onClose} title={editando ? 'Editar tarefa' : 'Nova tarefa'} size="md">
      {open && (
        <TarefaModalForm
          key={editando?.id || 'novo'}
          editando={editando}
          obraId={obraId}
          projetoId={projetoId}
          onSaved={onSaved}
          onClose={onClose}
        />
      )}
    </Modal>
  )
}

// Componente interno remontado a cada abertura (a Modal desmonta os filhos
// quando fecha), o que permite inicializar o form direto no useState sem
// precisar de um efeito só para sincronizar com a prop `editando`.
function TarefaModalForm({
  editando, obraId, projetoId, onSaved, onClose,
}: {
  editando: Tarefa | null
  obraId?: string | null
  projetoId?: string | null
  onSaved: (t: Tarefa) => void
  onClose: () => void
}) {
  const supabase = createClient()
  const [usuarios, setUsuarios] = useState<{ id: string; name: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<FormState>(() => editando ? {
    titulo: editando.titulo,
    descricao: editando.descricao || '',
    responsavel_id: editando.responsavel_id || '',
    prioridade: editando.prioridade,
    data_prazo: editando.data_prazo || '',
    status: editando.status,
  } : formVazio())

  useEffect(() => {
    supabase.from('profiles').select('id, name').order('name').then(({ data }: { data: { id: string; name: string }[] | null }) => setUsuarios(data || []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSave() {
    if (!form.titulo.trim()) return
    setSaving(true)
    const responsavelNome = usuarios.find(u => u.id === form.responsavel_id)?.name || null
    const payload: Record<string, unknown> = {
      titulo: form.titulo.trim(),
      descricao: form.descricao.trim() || null,
      responsavel_id: form.responsavel_id || null,
      responsavel_nome: form.responsavel_id ? responsavelNome : null,
      prioridade: form.prioridade,
      data_prazo: form.data_prazo || null,
      updated_at: new Date().toISOString(),
    }
    const embed = '*, obra:obras(nome), projeto:projetos(nome)'
    const result = editando
      ? await supabase.from('tarefas').update({
          ...payload,
          status: form.status,
          concluida: form.status === 'concluida',
          concluida_em: form.status === 'concluida' ? (editando.concluida_em || new Date().toISOString()) : null,
        }).eq('id', editando.id).select(embed).single()
      : await supabase.from('tarefas').insert({
          ...payload,
          obra_id: obraId || null,
          projeto_id: projetoId || null,
          status: 'pendente',
          concluida: false,
        }).select(embed).single()
    setSaving(false)
    if (result.error) {
      alert(`Não foi possível salvar a tarefa.\n\n${result.error.message}`)
      return
    }
    if (result.data) onSaved(result.data as unknown as Tarefa)
    onClose()
  }

  return (
      <div className="flex flex-col gap-4">
        <Input
          label="Título *"
          value={form.titulo}
          onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
          placeholder="Ex: Confirmar pontos de ar-condicionado antes da concretagem"
          autoFocus={!editando}
        />
        <Textarea
          label="Descrição"
          value={form.descricao}
          onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
          placeholder="Detalhes opcionais"
          rows={3}
        />
        <Select label="Responsável" value={form.responsavel_id} onChange={e => setForm(f => ({ ...f, responsavel_id: e.target.value }))}>
          <option value="">Sem responsável definido</option>
          {usuarios.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Prioridade" value={form.prioridade} onChange={e => setForm(f => ({ ...f, prioridade: e.target.value as Tarefa['prioridade'] }))}>
            {(['baixa', 'normal', 'alta', 'urgente'] as const).map(p => (
              <option key={p} value={p}>{PRIORIDADE_LABEL[p]}</option>
            ))}
          </Select>
          <Input
            label="Prazo"
            type="date"
            value={form.data_prazo}
            onChange={e => setForm(f => ({ ...f, data_prazo: e.target.value }))}
          />
        </div>
        {editando && (
          <Select label="Status" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Tarefa['status'] }))}>
            {(['pendente', 'em_andamento', 'aguardando', 'concluida', 'cancelada'] as const).map(s => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </Select>
        )}
        <div className="flex gap-3 pt-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" loading={saving} disabled={!form.titulo.trim()} onClick={handleSave}>
            {editando ? 'Salvar' : 'Adicionar'}
          </Button>
        </div>
      </div>
  )
}
