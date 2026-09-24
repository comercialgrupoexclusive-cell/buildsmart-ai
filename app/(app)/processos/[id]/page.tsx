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
import { ArrowLeft, Boxes, Calculator, CalendarDays, ClipboardList, FileBarChart, Inbox, LayoutGrid, MoreHorizontal, Search, ShoppingCart, Users, Wallet, Landmark, LayoutTemplate, LayoutDashboard } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  alterarStatusProcesso,
  desabilitarModulo,
  habilitarModulo,
  listarModulosDoProcesso,
  listarTemplates,
  obterProcesso,
  registrarUso,
  type Processo,
  type ProcessoModuloVinculo,
  type ProcessoStatus,
  type ProcessoTemplate,
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
import { ProcessoBoard } from '@/components/processo/board/ProcessoBoard'
import { CaixaEntrada } from '@/components/caixa-entrada/CaixaEntrada'
import { ProcessoVisaoGeral } from '@/components/processo/ProcessoVisaoGeral'
import { ProcessoMais } from '@/components/processo/ProcessoMais'
import { ProcessoPortalCliente } from '@/components/processo/portal/ProcessoPortalCliente'
import { ProcessoPesquisa } from '@/components/processo/pesquisa/ProcessoPesquisa'
import { Select } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { Tabs, type TabOption } from '@/components/ui/Tabs'

const STATUS_OPCOES: { value: ProcessoStatus; label: string }[] = [
  { value: 'ACTIVE', label: 'Ativo' },
  { value: 'ON_HOLD', label: 'Em espera' },
  { value: 'COMPLETED', label: 'Concluído' },
  { value: 'ARCHIVED', label: 'Arquivado' },
]

type ProcessoTab = 'visao_geral' | 'mais' | 'orcamento' | 'planejamento' | 'tarefas' | 'medicoes' | 'compras' | 'financeiro' | 'financiamento' | 'planta_baixa' | 'board' | 'caixa_entrada' | 'portal_cliente' | 'pesquisa_mercado'

// A aba aberta vira rastro de uso (processo_uso): é isso que ordena a
// listagem por "último uso" e preenche as últimas ações do card. Visão
// Geral e Mais não contam — abrir o Processo sempre passa por elas, então
// registrá-las não diria nada sobre o que a pessoa estava fazendo.
const TABS_SEM_RASTRO = new Set<ProcessoTab>(['visao_geral', 'mais'])

export default function ProcessoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const supabase = useMemo(() => createClient(), [])
  const [processo, setProcesso] = useState<Processo | null>(null)
  const [modulos, setModulos] = useState<ProcessoModuloVinculo[]>([])
  const [template, setTemplate] = useState<ProcessoTemplate | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [savingStatus, setSavingStatus] = useState(false)
  const [moduloEmEdicao, setModuloEmEdicao] = useState<string | null>(null)
  const [tab, setTab] = useState<ProcessoTab>('visao_geral')
  const [orcamentoId, setOrcamentoId] = useState<string | null>(null)
  const [resolvendoOrcamento, setResolvendoOrcamento] = useState(false)

  async function load() {
    setLoading(true)
    const [p, m, ts] = await Promise.all([
      obterProcesso(supabase, id),
      listarModulosDoProcesso(supabase, id),
      listarTemplates(supabase).catch(() => []),
    ])
    if (!p) {
      setNotFound(true)
      setLoading(false)
      return
    }
    setProcesso(p)
    setModulos(m)
    setTemplate(ts.find(t => t.id === p.template_id) ?? null)
    setLoading(false)
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (TABS_SEM_RASTRO.has(tab)) return
    const timer = window.setTimeout(() => {
      void (async () => {
        const { data } = await supabase.auth.getUser()
        if (!data.user) return
        const { data: perfil } = await supabase
          .from('profiles')
          .select('id')
          .eq('auth_user_id', data.user.id)
          .maybeSingle()
        if (perfil?.id) await registrarUso(supabase, id, perfil.id, tab).catch(() => {})
      })()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [tab, supabase, id])

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

  const habilitados = new Set(modulos.filter(m => m.enabled).map(m => m.module_key))

  // Visão Geral abre o Processo; "Mais" (configuração) fecha a lista. O
  // trabalho fica no meio.
  const tabOptions: TabOption<ProcessoTab>[] = [
    { key: 'visao_geral', label: 'Visão Geral', icon: LayoutGrid },
    { key: 'caixa_entrada', label: 'Caixa de Entrada', icon: Inbox },
    ...(habilitados.has('orcamento') ? [{ key: 'orcamento' as const, label: 'Orçamento', icon: Calculator }] : []),
    ...(habilitados.has('planejamento') ? [{ key: 'planejamento' as const, label: 'Planejamento', icon: CalendarDays }] : []),
    ...(habilitados.has('tarefas') ? [{ key: 'tarefas' as const, label: 'Tarefas', icon: ClipboardList }] : []),
    ...(habilitados.has('medicoes') ? [{ key: 'medicoes' as const, label: 'Medições', icon: FileBarChart }] : []),
    ...(habilitados.has('compras') ? [{ key: 'compras' as const, label: 'Compras', icon: ShoppingCart }] : []),
    ...(habilitados.has('financeiro') ? [{ key: 'financeiro' as const, label: 'Financeiro', icon: Wallet }] : []),
    ...(habilitados.has('financiamento') ? [{ key: 'financiamento' as const, label: 'Financiamento', icon: Landmark }] : []),
    ...(habilitados.has('planta_baixa') ? [{ key: 'planta_baixa' as const, label: 'Planta 2D/3D', icon: LayoutTemplate }] : []),
    ...(habilitados.has('board') ? [{ key: 'board' as const, label: 'Board', icon: LayoutDashboard }] : []),
    ...(habilitados.has('pesquisa_mercado') ? [{ key: 'pesquisa_mercado' as const, label: 'Pesquisa de Mercado', icon: Search }] : []),
    ...(habilitados.has('portal_cliente') ? [{ key: 'portal_cliente' as const, label: 'Portal do Cliente', icon: Users }] : []),
    { key: 'mais', label: 'Mais', icon: MoreHorizontal },
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

        {tab === 'visao_geral' && (
          <ProcessoVisaoGeral processo={processo} template={template} onAtualizado={setProcesso} />
        )}

        {tab === 'mais' && (
          <ProcessoMais modulos={modulos} moduloEmEdicao={moduloEmEdicao} onAlternar={handleToggleModulo} />
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

        {tab === 'board' && <ProcessoBoard processoId={processo.id} />}

        {tab === 'caixa_entrada' && <CaixaEntrada processoId={processo.id} />}

        {tab === 'pesquisa_mercado' && <ProcessoPesquisa processoId={processo.id} processoNome={processo.nome} />}

        {tab === 'portal_cliente' && <ProcessoPortalCliente processoId={processo.id} />}
      </div>
    </ProcessProvider>
  )
}
