'use client'

// Motor de Processo — shell do Processo: dados gerais, status, módulos
// habilitados (P3.2) e o Orçamento com UI própria e nativa do Processo
// (components/processo/orcamento/ProcessoOrcamento.tsx), sobre o mesmo
// motor/schema de dados que components/obra/ObraOrcamento.tsx usa —
// "Processo -> Orçamento -> Actions/Services/Repositories -> dados", não
// "Processo -> ObraOrcamento -> exceções". A P3.3 tinha reaproveitado o
// componente de Obra diretamente aqui (ver RELATORIO_PROCESSO_P3_P3.3.md);
// isso foi trocado por esta UI própria — ObraOrcamento.tsx continua servindo
// /obras e /projetos sem alteração.
//
// UI construída só com os padrões de components/ui/ (ver
// PROCESSO_P3_PADROES_UI.md) — nenhum estilo inline reinventado aqui.
import { use, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Boxes, Calculator, CalendarDays, ClipboardList, FileBarChart, ShoppingCart, Wallet, Landmark, LayoutTemplate } from 'lucide-react'
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
import { ProcessoOrcamento } from '@/components/processo/orcamento/ProcessoOrcamento'
import { ObraPlanejamento2 } from '@/components/obra/ObraPlanejamento2'
import { ContextoTarefas } from '@/components/tarefas/ContextoTarefas'
import { ObraMedicoes } from '@/components/obra/ObraMedicoes'
import { ProcessoCompras } from '@/components/processo/compras/ProcessoCompras'
import { ObraAvancoFinanceiro } from '@/components/obra/ObraAvancoFinanceiro'
import { ObraFinanciamento } from '@/components/obra/ObraFinanciamento'
import { ProcessoPlantaBaixa } from '@/components/processo/planta-baixa/ProcessoPlantaBaixa'
import { Select } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { Tabs, type TabOption } from '@/components/ui/Tabs'

const STATUS_OPCOES: { value: ProcessoStatus; label: string }[] = [
  { value: 'ACTIVE', label: 'Ativo' },
  { value: 'ON_HOLD', label: 'Em espera' },
  { value: 'COMPLETED', label: 'Concluído' },
  { value: 'ARCHIVED', label: 'Arquivado' },
]

type ProcessoTab = 'modulos' | 'orcamento' | 'planejamento' | 'tarefas' | 'medicoes' | 'compras' | 'financeiro' | 'financiamento' | 'planta_baixa'

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
    const precisaOrcamento = tab === 'orcamento' || tab === 'planejamento' || tab === 'medicoes' || tab === 'compras' || tab === 'financeiro' || tab === 'financiamento'
    if (!precisaOrcamento || orcamentoId) return
    const timer = window.setTimeout(() => {
      setResolvendoOrcamento(true)
      getOrCreateOrcamentoDoProcesso(supabase, id)
        .then(setOrcamentoId)
        .finally(() => setResolvendoOrcamento(false))
    }, 0)
    return () => window.clearTimeout(timer)
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
    ...(habilitados.has('planejamento') ? [{ key: 'planejamento' as const, label: 'Planejamento', icon: CalendarDays }] : []),
    ...(habilitados.has('tarefas') ? [{ key: 'tarefas' as const, label: 'Tarefas', icon: ClipboardList }] : []),
    ...(habilitados.has('medicoes') ? [{ key: 'medicoes' as const, label: 'Medições', icon: FileBarChart }] : []),
    ...(habilitados.has('compras') ? [{ key: 'compras' as const, label: 'Compras', icon: ShoppingCart }] : []),
    ...(habilitados.has('financeiro') ? [{ key: 'financeiro' as const, label: 'Financeiro', icon: Wallet }] : []),
    ...(habilitados.has('financiamento') ? [{ key: 'financiamento' as const, label: 'Financiamento', icon: Landmark }] : []),
    ...(habilitados.has('planta_baixa') ? [{ key: 'planta_baixa' as const, label: 'Planta Baixa', icon: LayoutTemplate }] : []),
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
              Orçamento, Planejamento, Tarefas, Medições, Compras, Financeiro e Financiamento já têm tela própria.
              Projeto Técnico/Arquivos e Relatórios ainda são só o vínculo habilitado/desabilitado, sem conteúdo —
              a migração continua módulo a módulo.
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

        {(tab === 'orcamento' || tab === 'planejamento' || tab === 'medicoes' || tab === 'compras' || tab === 'financeiro' || tab === 'financiamento') && (
          resolvendoOrcamento || !orcamentoId ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
            </div>
          ) : tab === 'orcamento' ? (
            <ProcessoOrcamento key={orcamentoId} orcamentoId={orcamentoId} processoNome={processo.nome} />
          ) : tab === 'planejamento' ? (
            <ObraPlanejamento2 key={orcamentoId} processoId={processo.id} orcamentoId={orcamentoId} />
          ) : tab === 'medicoes' ? (
            <ObraMedicoes key={orcamentoId} processoId={processo.id} orcamentoId={orcamentoId} orcamentoIds={[orcamentoId]} />
          ) : tab === 'compras' ? (
            <ProcessoCompras key={orcamentoId} processoId={processo.id} orcamentoId={orcamentoId} />
          ) : tab === 'financeiro' ? (
            <ObraAvancoFinanceiro key={orcamentoId} processoId={processo.id} orcamentoId={orcamentoId} orcamentoIds={[orcamentoId]} />
          ) : (
            <ObraFinanciamento key={orcamentoId} processoId={processo.id} orcamentoId={orcamentoId} orcamentoIds={[orcamentoId]} />
          )
        )}

        {tab === 'tarefas' && <ContextoTarefas processoId={processo.id} />}

        {tab === 'planta_baixa' && <ProcessoPlantaBaixa processoId={processo.id} />}
      </div>
    </ProcessProvider>
  )
}
