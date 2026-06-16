'use client'

import { useState } from 'react'

export interface NCData {
  titulo: string
  descricao: string
  responsavel: string
  status: 'aberto' | 'em_andamento' | 'resolvido'
  dataPrazo: string
}

interface Props {
  initialData: NCData | null
  onSave: (data: NCData) => void
  onRemove?: () => void
}

const input: React.CSSProperties = {
  width: '100%', padding: '6px 10px', fontSize: 13, borderRadius: 6,
  border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--fg)',
  boxSizing: 'border-box', outline: 'none',
}

const label: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: 'var(--fg-muted)',
  display: 'block', marginBottom: 4,
}

export function NCForm({ initialData, onSave, onRemove }: Props) {
  const [titulo, setTitulo]           = useState(initialData?.titulo ?? '')
  const [descricao, setDescricao]     = useState(initialData?.descricao ?? '')
  const [responsavel, setResponsavel] = useState(initialData?.responsavel ?? '')
  const [status, setStatus]           = useState<NCData['status']>(initialData?.status ?? 'aberto')
  const [dataPrazo, setDataPrazo]     = useState(initialData?.dataPrazo ?? '')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!titulo.trim()) return
    onSave({ titulo: titulo.trim(), descricao, responsavel, status, dataPrazo })
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <label style={label}>Título *</label>
        <input
          style={input} value={titulo}
          onChange={e => setTitulo(e.target.value)}
          placeholder="Ex: Pintura fora do padrão"
          required
        />
      </div>

      <div>
        <label style={label}>Descrição</label>
        <textarea
          style={{ ...input, resize: 'none', height: 58 }}
          value={descricao}
          onChange={e => setDescricao(e.target.value)}
          placeholder="Detalhe a não-conformidade…"
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <label style={label}>Responsável</label>
          <input
            style={input} value={responsavel}
            onChange={e => setResponsavel(e.target.value)}
            placeholder="Nome"
          />
        </div>
        <div>
          <label style={label}>Prazo</label>
          <input style={input} type="date" value={dataPrazo} onChange={e => setDataPrazo(e.target.value)} />
        </div>
      </div>

      <div>
        <label style={label}>Status</label>
        <select style={input} value={status} onChange={e => setStatus(e.target.value as NCData['status'])}>
          <option value="aberto">Aberto</option>
          <option value="em_andamento">Em andamento</option>
          <option value="resolvido">Resolvido</option>
        </select>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="submit"
          style={{
            flex: 1, padding: '7px 0', borderRadius: 6, fontSize: 13, fontWeight: 600,
            background: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer',
          }}
        >
          {initialData ? 'Atualizar NC' : 'Marcar como NC'}
        </button>
        {onRemove && (
          <button
            type="button" onClick={onRemove}
            style={{
              padding: '7px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
              background: 'transparent', color: 'var(--fg-muted)',
              border: '1px solid var(--border)', cursor: 'pointer',
            }}
          >
            Remover
          </button>
        )}
      </div>
    </form>
  )
}
