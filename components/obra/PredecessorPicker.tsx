'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Square, CheckSquare } from 'lucide-react'
import { Etapa, SubetapaCronograma, ServicoCronograma, CronogramaItemTipo } from '@/lib/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

export type PredecessoraRef = {
  tipo: CronogramaItemTipo
  id: string
  nome: string
  data_fim: string | null
}

/**
 * Picker de predecessoras — cascata Etapa → Subetapa → Serviço com seleção
 * múltipla (padrão Set<string> + botão Square/CheckSquare, igual à seleção
 * de materiais em ObraMateriais.tsx). Exclui o próprio item e seus
 * descendentes (evita ciclo trivial "depende de si mesmo/de um filho seu").
 */
export function PredecessorPicker({
  open, onClose, etapas, subetapas, servicos, excluirIds, jaSelecionadosIds, onConfirmar,
}: {
  open: boolean
  onClose: () => void
  etapas: Etapa[]
  subetapas: SubetapaCronograma[]
  servicos: ServicoCronograma[]
  excluirIds: Set<string>
  jaSelecionadosIds: Set<string>
  onConfirmar: (selecionados: PredecessoraRef[]) => void
}) {
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (open) setSelecionados(new Set(jaSelecionadosIds))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function toggle(id: string) {
    setSelecionados(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function confirmar() {
    const refs: PredecessoraRef[] = []
    etapas.forEach(e => { if (selecionados.has(e.id)) refs.push({ tipo: 'etapa', id: e.id, nome: e.nome, data_fim: e.data_fim }) })
    subetapas.forEach(s => { if (selecionados.has(s.id)) refs.push({ tipo: 'subetapa', id: s.id, nome: s.nome, data_fim: s.data_fim }) })
    servicos.forEach(s => { if (selecionados.has(s.id)) refs.push({ tipo: 'servico', id: s.id, nome: s.nome, data_fim: s.data_fim }) })
    onConfirmar(refs)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Selecionar predecessoras" size="lg">
      <div className="flex flex-col gap-3">
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Marque as tarefas que precisam terminar antes desta começar.
        </p>
        <div className="flex flex-col rounded-lg overflow-hidden max-h-[50vh] overflow-y-auto" style={{ border: '1px solid var(--border)' }}>
          {etapas.filter(e => !excluirIds.has(e.id)).map(etapa => {
            const subs = subetapas.filter(s => s.etapa_id === etapa.id && !excluirIds.has(s.id))
            const isCollapsed = collapsed[etapa.id] ?? false
            return (
              <div key={etapa.id}>
                <div className="flex items-center gap-2 px-3 py-2" style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                  {subs.length > 0 && (
                    <button onClick={() => setCollapsed(c => ({ ...c, [etapa.id]: !c[etapa.id] }))} className="p-0.5 rounded" style={{ color: 'var(--text-secondary)' }}>
                      {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                    </button>
                  )}
                  <button onClick={() => toggle(etapa.id)} className="flex items-center gap-2 flex-1 min-w-0 text-left" style={{ color: selecionados.has(etapa.id) ? 'var(--accent)' : 'var(--text-primary)' }}>
                    {selecionados.has(etapa.id) ? <CheckSquare size={15} /> : <Square size={15} />}
                    <span className="text-sm font-medium truncate">{etapa.nome}</span>
                  </button>
                </div>
                {!isCollapsed && subs.map(sub => {
                  const svcs = servicos.filter(s => s.subetapa_id === sub.id && !excluirIds.has(s.id))
                  return (
                    <div key={sub.id}>
                      <div className="flex items-center gap-2 pl-8 pr-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                        <button onClick={() => toggle(sub.id)} className="flex items-center gap-2 flex-1 min-w-0 text-left" style={{ color: selecionados.has(sub.id) ? 'var(--accent)' : 'var(--text-primary)' }}>
                          {selecionados.has(sub.id) ? <CheckSquare size={14} /> : <Square size={14} />}
                          <span className="text-sm truncate">{sub.nome}</span>
                        </button>
                      </div>
                      {svcs.map(svc => (
                        <div key={svc.id} className="flex items-center gap-2 pl-14 pr-3 py-1.5" style={{ borderBottom: '1px solid var(--border)' }}>
                          <button onClick={() => toggle(svc.id)} className="flex items-center gap-2 flex-1 min-w-0 text-left" style={{ color: selecionados.has(svc.id) ? 'var(--accent)' : 'var(--text-primary)' }}>
                            {selecionados.has(svc.id) ? <CheckSquare size={13} /> : <Square size={13} />}
                            <span className="text-xs truncate">{svc.nome}</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
        <div className="flex gap-3 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" onClick={confirmar}>Confirmar seleção ({selecionados.size})</Button>
        </div>
      </div>
    </Modal>
  )
}
