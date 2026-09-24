'use client'

// Listagem de Processos. Ordem é sempre "o que você mexeu por último"; sem
// rastro de uso, cai para ordem de cadastro. Consome só as Actions públicas
// de lib/processo, nunca repository/service diretamente.
//
// Carrega em 3 consultas fixas — processos, rastro de uso e módulos de todos
// os cards de uma vez. Nunca uma consulta por card.
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Boxes, LayoutTemplate, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  agruparProcessos,
  atualizarDadosProcesso,
  criarGrupo as criarGrupoAction,
  duplicarProcesso,
  excluirProcesso,
  getProcessoModuleDefinition,
  listarGrupos,
  listarModulosDeVarios,
  listarProcessos,
  listarUso,
  type Processo,
  type ProcessoGrupo,
  type ProcessoStatus,
} from '@/lib/processo'
import { PageHeader } from '@/components/ui/PageHeader'
import { SearchInput } from '@/components/ui/SearchInput'
import { FilterTabs, type FilterTabOption } from '@/components/ui/FilterTabs'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { ProcessoCard, type AcaoCard } from '@/components/processo/ProcessoCard'
import { AgruparProcessoModal } from '@/components/processo/AgruparProcessoModal'
import { ProcessoDadosForm } from '@/components/processo/ProcessoDadosForm'

const STATUS_LABEL: Record<ProcessoStatus, string> = {
  ACTIVE: 'Ativo',
  ON_HOLD: 'Em espera',
  COMPLETED: 'Concluído',
  ARCHIVED: 'Arquivado',
}

const FILTROS: FilterTabOption<'todos' | ProcessoStatus>[] = [
  { value: 'ACTIVE', label: STATUS_LABEL.ACTIVE },
  { value: 'todos', label: 'Todos' },
  { value: 'ON_HOLD', label: STATUS_LABEL.ON_HOLD, activeColor: '#f59e0b' },
  { value: 'COMPLETED', label: STATUS_LABEL.COMPLETED, activeColor: '#10b981' },
  { value: 'ARCHIVED', label: STATUS_LABEL.ARCHIVED, activeColor: '#6b7280' },
]

// Visão Geral é a aba de abertura de todo Processo — mostrá-la como "ação"
// no card não informaria nada.
const MODULO_OCULTO_NO_CARD = 'dados_gerais'

export default function ProcessosPage() {
  const supabase = useMemo(() => createClient(), [])
  const [processos, setProcessos] = useState<Processo[]>([])
  const [grupos, setGrupos] = useState<ProcessoGrupo[]>([])
  const [acoesPorProcesso, setAcoesPorProcesso] = useState<Record<string, AcaoCard[]>>({})
  const [ordemUso, setOrdemUso] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'todos' | ProcessoStatus>('ACTIVE')

  const [editando, setEditando] = useState<Processo | null>(null)
  const [agrupando, setAgrupando] = useState<Processo | null>(null)
  const [excluindo, setExcluindo] = useState<Processo | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const filtros = statusFilter === 'todos' ? {} : { status: statusFilter }
      const [lista, listaGrupos] = await Promise.all([
        listarProcessos(supabase, filtros),
        listarGrupos(supabase),
      ])

      const ids = lista.map(p => p.id)
      const [uso, modulos] = await Promise.all([
        listarUso(supabase),
        listarModulosDeVarios(supabase, ids),
      ])

      // Últimas 3 ações da pessoa; sem uso, cai para os módulos habilitados.
      const usoPorProcesso: Record<string, string[]> = {}
      const maisRecente: Record<string, string> = {}
      for (const u of uso) {
        if (u.module_key === MODULO_OCULTO_NO_CARD) continue
        const atual = usoPorProcesso[u.processo_id] ?? []
        if (atual.length < 3) atual.push(u.module_key)
        usoPorProcesso[u.processo_id] = atual
        if (!maisRecente[u.processo_id]) maisRecente[u.processo_id] = u.used_at
      }

      const habilitadosPorProcesso: Record<string, string[]> = {}
      for (const m of modulos) {
        if (m.module_key === MODULO_OCULTO_NO_CARD) continue
        habilitadosPorProcesso[m.processo_id] = [...(habilitadosPorProcesso[m.processo_id] ?? []), m.module_key]
      }

      const rotular = (keys: string[]): AcaoCard[] =>
        keys
          .map(key => ({ key, label: getProcessoModuleDefinition(key)?.label ?? key }))
          .slice(0, 3)

      const acoes: Record<string, AcaoCard[]> = {}
      for (const p of lista) {
        const usados = usoPorProcesso[p.id] ?? []
        acoes[p.id] = rotular(usados.length > 0 ? usados : (habilitadosPorProcesso[p.id] ?? []))
      }

      setProcessos(lista)
      setGrupos(listaGrupos)
      setAcoesPorProcesso(acoes)
      setOrdemUso(maisRecente)
    } finally {
      setLoading(false)
    }
  }, [supabase, statusFilter])

  // setTimeout(0) é o padrão já usado nas outras telas do motor para não
  // disparar setState síncrono dentro do efeito.
  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const filtrados = useMemo(() => {
    const termo = search.trim().toLowerCase()
    return processos
      .filter(p => p.nome.toLowerCase().includes(termo))
      .sort((a, b) => {
        const usoA = ordemUso[a.id]
        const usoB = ordemUso[b.id]
        if (usoA && usoB) return usoB.localeCompare(usoA)
        if (usoA) return -1
        if (usoB) return 1
        return b.created_at.localeCompare(a.created_at)
      })
  }, [processos, search, ordemUso])

  // Grupo envolve os cards dele; quem não tem grupo fica solto, na mesma
  // grade, depois dos grupos.
  const { agrupados, soltos } = useMemo(() => {
    const porGrupo = new Map<string, Processo[]>()
    const semGrupo: Processo[] = []
    for (const p of filtrados) {
      if (p.grupo_id) porGrupo.set(p.grupo_id, [...(porGrupo.get(p.grupo_id) ?? []), p])
      else semGrupo.push(p)
    }
    const blocos = grupos
      .map(g => ({ grupo: g, itens: porGrupo.get(g.id) ?? [] }))
      .filter(b => b.itens.length > 0)
    return { agrupados: blocos, soltos: semGrupo }
  }, [filtrados, grupos])

  async function salvarEdicao(dados: Parameters<typeof atualizarDadosProcesso>[2] & { status?: ProcessoStatus }) {
    if (!editando) return
    const { status, ...patch } = dados
    await atualizarDadosProcesso(supabase, editando.id, patch)
    if (status && status !== editando.status) {
      const { alterarStatusProcesso } = await import('@/lib/processo')
      await alterarStatusProcesso(supabase, editando.id, status)
    }
    setEditando(null)
    await load()
  }

  async function confirmarExclusao() {
    if (!excluindo || ocupado) return
    setOcupado(true)
    try {
      await excluirProcesso(supabase, excluindo.id)
      setExcluindo(null)
      await load()
    } finally {
      setOcupado(false)
    }
  }

  async function duplicar(p: Processo) {
    if (ocupado) return
    setOcupado(true)
    try {
      await duplicarProcesso(supabase, p.id)
      await load()
    } finally {
      setOcupado(false)
    }
  }

  const renderCard = (p: Processo) => (
    <ProcessoCard
      key={p.id}
      processo={p}
      acoes={acoesPorProcesso[p.id] ?? []}
      onEditar={setEditando}
      onExcluir={setExcluindo}
      onDuplicar={pp => void duplicar(pp)}
      onAgrupar={setAgrupando}
    />
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Processos"
        titleAction={
          // Largura fixa igual nos dois: rótulos curtos ("Processo" e
          // "Templates") cabem no mesmo w-32 sem quebrar, o que "Novo
          // Processo" não fazia.
          <div className="flex items-center gap-2">
            <Link href="/processos/novo">
              <Button size="sm" icon={<Plus size={15} />} className="w-32">Processo</Button>
            </Link>
            <Link href="/processos/templates">
              <Button size="sm" variant="secondary" icon={<LayoutTemplate size={15} />} className="w-32">
                Templates
              </Button>
            </Link>
          </div>
        }
      />

      <div className="flex flex-col sm:flex-row gap-3">
        <SearchInput placeholder="Buscar processos..." value={search} onChange={e => setSearch(e.target.value)} />
        <FilterTabs options={FILTROS} value={statusFilter} onChange={setStatusFilter} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : filtrados.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="Nenhum processo encontrado"
          description={search ? 'Tente outro termo de busca.' : 'Crie o primeiro Processo para começar.'}
        />
      ) : (
        <div className="space-y-6">
          {agrupados.map(({ grupo, itens }) => (
            <section key={grupo.id} className="rounded-xl p-3.5" style={{ border: '1px solid var(--border)' }}>
              <h2 className="mb-3 px-0.5 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                {grupo.nome}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {itens.map(renderCard)}
              </div>
            </section>
          ))}

          {soltos.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {soltos.map(renderCard)}
            </div>
          )}
        </div>
      )}

      <Modal open={!!editando} onClose={() => setEditando(null)} title="Editar processo" size="md">
        {editando && (
          <ProcessoDadosForm
            processo={editando}
            onSalvar={salvarEdicao}
            onCancelar={() => setEditando(null)}
          />
        )}
      </Modal>

      {agrupando && (
        <AgruparProcessoModal
          aberto
          onFechar={() => setAgrupando(null)}
          processoBase={agrupando}
          processos={processos}
          grupos={grupos}
          onCriarGrupo={async nome => {
            const grupo = await criarGrupoAction(supabase, nome, agrupando.organization_id)
            setGrupos(atual => (atual.some(g => g.id === grupo.id) ? atual : [...atual, grupo]))
            return grupo
          }}
          onConfirmar={async (grupoId, ids) => {
            await agruparProcessos(supabase, ids, grupoId)
            setAgrupando(null)
            await load()
          }}
        />
      )}

      <Modal open={!!excluindo} onClose={() => setExcluindo(null)} title="Excluir processo" size="sm">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Excluir <strong style={{ color: 'var(--text-primary)' }}>{excluindo?.nome}</strong> apaga junto tudo que
          está dentro dele. Não dá para desfazer.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setExcluindo(null)} disabled={ocupado}>Cancelar</Button>
          <Button variant="danger" onClick={() => void confirmarExclusao()} loading={ocupado}>Excluir</Button>
        </div>
      </Modal>
    </div>
  )
}
