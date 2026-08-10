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
  const [orcamentos, setOrcamentos] = useState<OrcamentoSelecao[]>([])
  const [obraId, setObraIdState] = useState('')
  const [orcamentoId, setOrcamentoIdState] = useState('')
  const [loading, setLoading] = useState(true)

  const setObraId = useCallback((id: string) => {
    setObraIdState(id)
    if (id) localStorage.setItem(STORAGE_OBRA, id)
    else localStorage.removeItem(STORAGE_OBRA)
  }, [])

  const setOrcamentoId = useCallback((id: string) => {
    setOrcamentoIdState(id)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadObras() {
      const { data } = await supabase.from('obras').select('id,nome').order('created_at', { ascending: false })
      if (cancelled) return
      const list = (data || []) as ObraSelecao[]
      setObras(list)
      const saved = stored(STORAGE_OBRA)
      setObraId(saved && list.some(o => o.id === saved) ? saved : (list[0]?.id || ''))
      if (list.length === 0) setLoading(false)
    }
    void loadObras()
    return () => { cancelled = true }
  }, [supabase, setObraId])

  const refreshOrcamentos = useCallback(async () => {
    if (!obraId) {
      setOrcamentos([])
      setOrcamentoId('')
      setLoading(false)
      return
    }
    setLoading(true)
    const { data } = await supabase
      .from('orcamentos')
      .select('id,nome,versao,status')
      .eq('obra_id', obraId)
      .order('versao', { ascending: false })
    const list = (data || []) as OrcamentoSelecao[]
    setOrcamentos(list)
    // Uma obra possui um unico orcamento operacional. A selecao e automatica.
    setOrcamentoId(list[0]?.id || '')
    setLoading(false)
  }, [obraId, setOrcamentoId, supabase])

  // A troca de obra sincroniza a seleção com os orçamentos persistidos no Supabase.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void refreshOrcamentos() }, [obraId])

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
