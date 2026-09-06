'use client'

// Motor de Processo — shell do Processo: dados gerais, status, módulos
// habilitados (P3.2) e, a partir da P3.3, o primeiro módulo com conteúdo
// real (Orçamento) — reaproveitando 100% de components/obra/ObraOrcamento.tsx
// sem duplicar o módulo (ver RELATORIO_PROCESSO_P3_P3.3.md).
//
// UI construída só com os padrões de components/ui/ (ver
// PROCESSO_P3_PADROES_UI.md) — nenhum estilo inline reinventado aqui.
import { use, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Boxes, Calculator } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  alterarStatusProcesso,
  desabilitarModulo,
  habilitarModulo,
  listarModulosDisponiveis,
  listarModulosDoProcesso,
  obterProcesso,
  type Processo,
  type ProcessoModuloVinculo,
  type ProcessoStatus,
} from '@/lib/processo'
import { ProcessProvider } from '@/lib/processo/context'
import { getOrCreateOrcamentoDoProcesso } from '@/lib/processo/orcamento'
import { ObraOrcamento } from '@/components/obra/ObraOrcamento'
import { Select } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { Tabs, type TabOption } from '@/components/ui/Tabs'

const STATUS_OPCOES: { value: ProcessoStatus; label: string }[] = [
  { value: 'ACTIVE', label: 'Ativo' },
  { value: 'ON_HOLD', label: 'Em espera' },
  { value: 'COMPLETED', label: 'Concluído' },
  { value: 'ARCHIVED', label: 'Arquivado' },
]

type ProcessoTab = 'modulos' | 'orcamento'

export default function ProcessoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const supabase = useMemo(() => createClient(), [])
  const [processo, setProcesso] = useState<Processo | null>(null)
  const [modulos, setModulos] = useState<ProcessoModuloVinculo[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [savingStatus, setSavingStatus] = useState(false)
  const [moduloEmEdicao, setModuloEmEdicao] = useState<string | null>(null)
  const [tab, setTab] = useState<ProcessoTab>('modulos')
  const [orcamentoId, setOrcamentoId] = useState<string | null>(null)
  const [resolvendoOrcamento, setResolvendoOrcamento] = useState(false)

  async function load() {
    setLoading(true)
    const [p, m] = await Promise.all([obterProcesso(supabase, id), listarModulosDoProcesso(supabase, id)])
    if (!p) {
      setNotFound(true)
      setLoading(false)
      return
    }
    setProcesso(p)
    setModulos(m)
    setLoading(false)
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (tab !== 'orcamento' || orcamentoId) return
    setResolvendoOrcamento(true)
    getOrCreateOrcamentoDoProcesso(supabase, id)
      .then(setOrcamentoId)
      .finally(() => setResolvendoOrcamento(false))
  }, [tab, orcamentoId, supabase, id])

  async function handleStatusChange(status: ProcessoStatus) {
    if (!processo) return
    setSavingStatus(true)
    try {
      const atualizado = await alterarStatusProcesso(supabase, processo.id, status)
      setProcesso(atualizado)
    } finally {
      setSavingStatus(false)
    }
  }

  async function handleToggleModulo(key: string, habilitarAgora: boolean) {
    setModuloEmEdicao(key)
    try {
      if (habilitarAgora) await habilitarModulo(supabase, id, key)
      else await desabilitarModulo(supabase, id, key)
      setModulos(await listarModulosDoProcesso(supabase, id))
    } finally {
      setModuloEmEdicao(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  if (notFound || !processo) {
    return (
      <EmptyState
        icon={Boxes}
        title="Processo não encontrado"
        action={<Link href="/processos" className="text-sm" style={{ color: 'var(--accent)' }}>Voltar para Processos</Link>}
      />
    )
  }

  const registry = listarModulosDisponiveis()
  const habilitados = new Set(modulos.filter(m => m.enabled).map(m => m.module_key))

  const tabOptions: TabOption<ProcessoTab>[] = [
    { key: 'modulos', label: 'Módulos', icon: Boxes },
    ...(habilitados.has('orcamento') ? [{ key: 'orcamento' as const, label: 'Orçamento', icon: Calculator }] : []),
  ]

  return (
    <ProcessProvider processoId={processo.id}>
      <div className="space-y-6">
        <Link href="/processos" className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <ArrowLeft size={16} />
          Voltar para Processos
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{processo.nome}</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {[processo.tipo, processo.cliente_nome, processo.endereco].filter(Boolean).join(' · ') || 'Sem dados adicionais'}
            </p>
          </div>
          <Select
            className="sm:w-auto"
            value={processo.status}
            disabled={savingStatus}
            onChange={e => handleStatusChange(e.target.value as ProcessoStatus)}
          >
            {STATUS_OPCOES.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </Select>
        </div>

        <Tabs options={tabOptions} value={tab} onChange={setTab} />

        {tab === 'modulos' && (
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Boxes size={18} style={{ color: 'var(--accent)' }} />
              <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Módulos</h2>
            </div>
            <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
              Só o Orçamento tem tela própria por enquanto (P3.3) — os demais módulos ainda são só o vínculo
              habilitado/desabilitado, sem conteúdo. A migração continua módulo a módulo.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {registry.map(mod => {
                const ativo = habilitados.has(mod.key)
                return (
                  <div
                    key={mod.key}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg"
                    style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
                  >
                    <span className="text-sm" style={{ color: ativo ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                      {mod.label}
                    </span>
                    <button
                      onClick={() => handleToggleModulo(mod.key, !ativo)}
                      disabled={moduloEmEdicao === mod.key}
                      className="text-xs font-medium px-2.5 py-1 rounded-full disabled:opacity-50"
                      style={ativo
                        ? { background: 'rgba(16,185,129,0.15)', color: '#10b981' }
                        : { background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                    >
                      {ativo ? 'Habilitado' : 'Habilitar'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {tab === 'orcamento' && (
          resolvendoOrcamento || !orcamentoId ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
            </div>
          ) : (
            <ObraOrcamento key={orcamentoId} processoId={processo.id} orcamentoId={orcamentoId} obraName={processo.nome} />
          )
        )}
      </div>
    </ProcessProvider>
  )
}
