'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'

export const TODOS_ORCAMENTOS = 'todos'

export type ObraSelecao = { id: string; nome: string }
export type OrcamentoSelecao = { id: string; nome: string | null; versao: number; status: string }

type ObraOrcamentoContextValue = {
  obras: ObraSelecao[]
  orcamentos: OrcamentoSelecao[]
  obraId: string
  orcamentoId: string
  orcamentoIds: string[]
  loading: boolean
  setObraId: (id: string) => void
  setOrcamentoId: (id: string) => void
  refreshOrcamentos: () => Promise<void>
}

const STORAGE_OBRA = 'buildsmart_obra_selecionada'
const ObraOrcamentoContext = createContext<ObraOrcamentoContextValue | null>(null)

function stored(key: string) {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(key) || ''
}

export function ObraOrcamentoProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), [])
  const [obras, setObras] = useState<ObraSelecao[]>([])
  const [orcamentosPorObra, setOrcamentosPorObra] = useState<Record<string, OrcamentoSelecao[]>>({})
  const [obraId, setObraIdState] = useState('')
  const [loading, setLoading] = useState(true)

  const setObraId = useCallback((id: string) => {
    setObraIdState(id)
    if (id) localStorage.setItem(STORAGE_OBRA, id)
    else localStorage.removeItem(STORAGE_OBRA)
  }, [])

  // Mantido por compatibilidade. O orcamento agora e determinado pela obra.
  const setOrcamentoId = useCallback(() => {}, [])

  useEffect(() => {
    let cancelled = false
    async function loadObras() {
      const { data } = await supabase
        .from('obras')
        .select('id,nome,orcamentos(id,nome,versao,status)')
        .order('created_at', { ascending: false })
      if (cancelled) return

      const rows = (data || []) as (ObraSelecao & { orcamentos?: OrcamentoSelecao[] })[]
      const list = rows.map(({ id, nome }) => ({ id, nome }))
      setObras(list)
      setOrcamentosPorObra(Object.fromEntries(rows.map(row => [row.id, row.orcamentos || []])))

      const saved = stored(STORAGE_OBRA)
      setObraId(saved && list.some(obra => obra.id === saved) ? saved : (list[0]?.id || ''))
      setLoading(false)
    }
    void loadObras()
    return () => { cancelled = true }
  }, [supabase, setObraId])

  const refreshOrcamentos = useCallback(async () => {
    if (!obraId) return
    const { data } = await supabase
      .from('orcamentos')
      .select('id,nome,versao,status')
      .eq('obra_id', obraId)
      .order('versao', { ascending: false })
    setOrcamentosPorObra(current => ({
      ...current,
      [obraId]: (data || []) as OrcamentoSelecao[],
    }))
  }, [obraId, supabase])

  const orcamentos = useMemo(() => orcamentosPorObra[obraId] || [], [obraId, orcamentosPorObra])
  const orcamentoId = orcamentos[0]?.id || ''
  const orcamentoIds = useMemo(() => orcamentoId ? [orcamentoId] : [], [orcamentoId])

  const value = useMemo(() => ({
    obras, orcamentos, obraId, orcamentoId, orcamentoIds, loading,
    setObraId, setOrcamentoId, refreshOrcamentos,
  }), [obras, orcamentos, obraId, orcamentoId, orcamentoIds, loading, setObraId, setOrcamentoId, refreshOrcamentos])

  return <ObraOrcamentoContext.Provider value={value}>{children}</ObraOrcamentoContext.Provider>
}

export function useObraOrcamento() {
  const value = useContext(ObraOrcamentoContext)
  if (!value) throw new Error('useObraOrcamento deve ser usado dentro de ObraOrcamentoProvider')
  return value
}
