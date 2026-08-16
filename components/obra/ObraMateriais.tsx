'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Package, AlertTriangle,
  Plus, Pencil, Trash2, ChevronDown, ChevronRight,
  Square, CheckSquare, ShoppingCart, Copy, X,
  Building2, Send, PackageCheck, ClipboardList, FileText, Zap, RefreshCw,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { diasAteData } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { ObraFornecedores } from '@/components/obra/ObraFornecedores'
import { ObraRequisicoes } from '@/components/obra/ObraRequisicoes'
import { ComprasLancamentos, PrefillLancamento } from '@/components/obra/ComprasLancamentos'
import { sincronizarMateriaisDoOrcamento as sincronizarMateriaisLib } from '@/lib/materiais-sync'

const STATUS_LABEL: Record<string, string> = {
  nao_comprado: 'Não comprado',
  solicitado: 'Solicitado',
  parcial: 'Parcial',
  comprado: 'Comprado',
}

const STATUS_DOT: Record<string, string> = {
  nao_comprado: '#EF4444',
  solicitado: '#3B7BF8',
  parcial: '#F59E0B',
  comprado: '#10B981',
}

type MaterialRow = {
  id: string
  obra_id: string
  orcamento_id: string | null
  etapa_id: string | null
  subetapa: string | null
  insumo_id?: string | null
  sinapi_codigo: string | null
  descricao: string
  unidade: string
  quantidade_total: number
  quantidade_comprada: number
  status_compra: 'nao_comprado' | 'solicitado' | 'parcial' | 'comprado'
  data_necessidade: string | null
  data_recebimento: string | null
  etapas?: { nome: string } | null
}

type MateriaisSchema = 'snapshot' | 'insumo_id'

type MaterialBancoInsumoId = {
  id: string
  obra_id: string
  orcamento_id: string | null
  etapa_id: string | null
  subetapa?: string | null
  insumo_id: string | null
  quantidade_total: number
  quantidade_comprada: number
  status_compra: MaterialRow['status_compra']
  data_necessidade: string | null
  data_recebimento?: string | null
  etapas?: { nome: string } | null
  insumo?: { codigo: string; descricao: string; unidade: string } | null
  sinapi_insumos?: { codigo: string; descricao: string; unidade: string } | null
}

const SEM_SUBETAPA = 'Sem subetapa'

type ListaCompraItem = {
  id: string
  descricao: string
  quantidade: number
  unidade: string
  sinapiCodigo: string | null
}

type StatusLista = 'aberta' | 'enviada' | 'concluida'

type ListaCompra = {
  id: string
  orcamentoId: string | null
  nome: string
  fornecedorId: string | null
  itens: ListaCompraItem[]
  status: StatusLista
  criadoEm: string
}

const STATUS_LISTA_INFO: Record<StatusLista, { label: string; icon: typeof Send; color: string }> = {
  aberta: { label: 'Aberta', icon: ClipboardList, color: 'var(--text-secondary)' },
  enviada: { label: 'Enviada ao fornecedor', icon: Send, color: 'var(--warning)' },
  concluida: { label: 'Concluída', icon: PackageCheck, color: 'var(--success)' },
}

// Agrupa uma lista de materiais (já filtrada por etapa) em blocos por subetapa,
// preservando a ordem de primeira aparição. Itens sem subetapa caem no grupo "Sem subetapa".
function agruparPorSubetapa(itens: MaterialRow[]): { nome: string; itens: MaterialRow[] }[] {
  const ordem: string[] = []
  const grupos: Record<string, MaterialRow[]> = {}
  itens.forEach(m => {
    const nome = m.subetapa?.trim() || SEM_SUBETAPA
    if (!grupos[nome]) { grupos[nome] = []; ordem.push(nome) }
    grupos[nome].push(m)
  })
  // "Sem subetapa" sempre por último
  return ordem
    .sort((a, b) => (a === SEM_SUBETAPA ? 1 : b === SEM_SUBETAPA ? -1 : 0))
    .map(nome => ({ nome, itens: grupos[nome] }))
}

function statusOperacional(material: MaterialRow) {
  if (material.status_compra === 'comprado') return 'comprado'
  const dias = material.data_necessidade ? diasAteData(material.data_necessidade) : null
  if (dias !== null && dias <= 7) return 'agora'
  if (material.status_compra === 'parcial') return 'parcial'
  return 'pendente'
}

export function ObraMateriais({ obraId, orcamentoId, orcamentoIds }: { obraId: string; orcamentoId: string; orcamentoIds: string[] }) {
  const supabase = useMemo(() => createClient(), [])
  const [materiais, setMateriais] = useState<MaterialRow[]>([])
  const [etapas, setEtapas] = useState<{ id: string; nome: string }[]>([])
  const [subetapasOrcamento, setSubetapasOrcamento] = useState<Record<string, string[]>>({})
  const [fornecedores, setFornecedores] = useState<{ id: string; nome: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroEtapa, setFiltroEtapa] = useState('todas')
  const [filtroStatus, setFiltroStatus] = useState('abertas')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [collapsedSub, setCollapsedSub] = useState<Record<string, boolean>>({})
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [showLista, setShowLista] = useState(false)
  const [quantidadesLista, setQuantidadesLista] = useState<Record<string, string>>({})
  const [copiado, setCopiado] = useState(false)
  const [salvandoLista, setSalvandoLista] = useState(false)
  const [nomeLista, setNomeLista] = useState('')
  const [fornecedorLista, setFornecedorLista] = useState('')
  const [importando, setImportando] = useState(false)

  // ── Sub-abas: Lançamentos → Lista de Compras (materiais/listas) → Requisições → Fornecedores ──
  const [subView, setSubView] = useState<'lancamentos' | 'materiais' | 'compras' | 'fornecedores' | 'requisicoes'>('lancamentos')
  const [prefillLancamento, setPrefillLancamento] = useState<PrefillLancamento>(null)
  const [listas, setListas] = useState<ListaCompra[]>([])
  const consolidado = false

  // Modal editar / novo
  const [editando, setEditando] = useState<MaterialRow | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    sinapi_codigo: '',
    descricao: '',
    unidade: '',
    quantidade_total: '',
    quantidade_comprada: '',
    data_necessidade: '',
    etapa_id: '',
    subetapa: '',
    status_compra: 'nao_comprado' as MaterialRow['status_compra'],
  })

  async function detectarSchemaMateriais(): Promise<MateriaisSchema> {
    const { error } = await supabase.from('materiais').select('sinapi_codigo,descricao,unidade').limit(1)
    return error && /column .* does not exist/i.test(error.message) ? 'insumo_id' : 'snapshot'
  }

  function normalizarMaterialInsumoId(row: MaterialBancoInsumoId): MaterialRow {
    const insumo = row.insumo || row.sinapi_insumos || null
    return {
      id: row.id,
      obra_id: row.obra_id,
      orcamento_id: row.orcamento_id,
      etapa_id: row.etapa_id,
      subetapa: row.subetapa ?? null,
      insumo_id: row.insumo_id,
      sinapi_codigo: insumo?.codigo || row.insumo_id || null,
      descricao: insumo?.descricao || 'Insumo sem descricao',
      unidade: insumo?.unidade || 'UN',
      quantidade_total: Number(row.quantidade_total) || 0,
      quantidade_comprada: Number(row.quantidade_comprada) || 0,
      status_compra: row.status_compra,
      data_necessidade: row.data_necessidade,
      data_recebimento: row.data_recebimento ?? null,
      etapas: row.etapas,
    }
  }

  async function loadMateriais() {
    setLoading(true)
    const schemaMateriais = await detectarSchemaMateriais()
    const matsQuery = schemaMateriais === 'snapshot'
      ? supabase
        .from('materiais')
        .select('*, etapas(nome)')
        .eq('obra_id', obraId)
        .order('data_necessidade', { ascending: true, nullsFirst: false })
      : supabase
        .from('materiais')
        .select('id, obra_id, orcamento_id, etapa_id, subetapa, insumo_id, quantidade_total, quantidade_comprada, status_compra, data_necessidade, data_recebimento, etapas(nome), insumo:sinapi_insumos(codigo,descricao,unidade)')
        .eq('obra_id', obraId)
        .order('data_necessidade', { ascending: true, nullsFirst: false })
    const [matsRes, etapasRes, fornecedoresRes, subetapasRes] = await Promise.all([
      matsQuery,
      supabase.from('etapas').select('id, nome').eq('obra_id', obraId).order('ordem'),
      supabase
        .from('fornecedores')
        .select('id, nome, obra_id')
        .or(`obra_id.is.null,obra_id.eq.${obraId}`)
        .order('nome'),
      supabase
        .from('orcamentos')
        .select('id, orcamento_itens(etapa_id, subetapa)')
        .eq('obra_id', obraId),
    ])
    const materiaisCarregados = schemaMateriais === 'snapshot'
      ? (matsRes.data || []) as MaterialRow[]
      : ((matsRes.data || []) as unknown as MaterialBancoInsumoId[]).map(normalizarMaterialInsumoId)
    setMateriais(materiaisCarregados.filter(material => consolidado
      ? (!material.orcamento_id || orcamentoIds.includes(material.orcamento_id))
      : material.orcamento_id === orcamentoId))
    setEtapas(etapasRes.data || [])
    setFornecedores(fornecedoresRes.data || [])
    const subMap: Record<string, string[]> = {}
    const orcs = (subetapasRes.data || []) as { id: string; orcamento_itens?: { etapa_id: string | null; subetapa: string | null }[] }[]
    orcs.filter(orc => orcamentoIds.includes(orc.id)).forEach(orc => (orc.orcamento_itens || []).forEach(item => {
      if (!item.etapa_id || !item.subetapa?.trim()) return
      if (!subMap[item.etapa_id]) subMap[item.etapa_id] = []
      if (!subMap[item.etapa_id].includes(item.subetapa.trim())) subMap[item.etapa_id].push(item.subetapa.trim())
    }))
    setSubetapasOrcamento(subMap)
    setLoading(false)
  }

  async function loadListas() {
    const { data } = await supabase
      .from('listas_compra')
      .select('id, orcamento_id, nome, fornecedor_id, itens, status, criado_em')
      .eq('obra_id', obraId)
      .order('criado_em', { ascending: false })
    setListas(((data ?? []) as { id: string; orcamento_id: string | null; nome: string; fornecedor_id: string | null; itens: ListaCompraItem[]; status: StatusLista; criado_em: string }[])
      .filter(r => consolidado ? (!r.orcamento_id || orcamentoIds.includes(r.orcamento_id)) : r.orcamento_id === orcamentoId)
      .map((r) => ({
      id: r.id,
      orcamentoId: r.orcamento_id,
      nome: r.nome,
      fornecedorId: r.fornecedor_id,
      itens: r.itens ?? [],
      status: r.status,
      criadoEm: r.criado_em,
    })))
  }
  // --- Sincronizar com o orçamento ──────────────────────────────────────────
  // Fonte única (lib/materiais-sync.ts), a mesma usada pelo botão "Importar
  // p/ Materiais" na aba Orçamento — upsert idempotente por (obra, orçamento,
  // etapa, subetapa estável, código do insumo). Roda por orçamento (não dá
  // pra sincronizar no modo consolidado, que mistura vários orçamentos).
  async function sincronizarComOrcamento() {
    if (importando) return
    if (consolidado || !orcamentoId) {
      alert('Selecione um orçamento específico para sincronizar os materiais.')
      return
    }
    setImportando(true)
    try {
      const { criados, atualizados } = await sincronizarMateriaisLib(supabase, { obraId, orcamentoId })
      await loadMateriais()
      if (criados === 0 && atualizados === 0) {
        alert('Materiais já estavam em dia com o orçamento — nada para sincronizar.')
      } else {
        alert(`Materiais sincronizados com o orçamento.\n\n${criados} novo(s) material(is) criado(s).\n${atualizados} material(is) com quantidade atualizada.`)
      }
    } catch (e) {
      console.error('Erro ao sincronizar materiais:', e)
      const msg = e instanceof Error ? e.message : 'Erro desconhecido'
      alert(`Não foi possível sincronizar os materiais com o orçamento.\n\nErro: ${msg}`)
    } finally {
      setImportando(false)
    }
  }


  useEffect(() => {
    void Promise.resolve().then(() => Promise.all([loadMateriais(), loadListas()]))
    // Os carregadores pertencem a este componente e devem rodar somente quando
    // muda a obra ou seu orçamento único.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obraId, orcamentoId, orcamentoIds])

  async function handleSave() {
    if (consolidado || !orcamentoId || !form.descricao.trim() || !form.quantidade_total) return
    setSaving(true)
    const payloadCompleto = {
      obra_id: obraId,
      orcamento_id: editando?.orcamento_id || orcamentoId,
      etapa_id: form.etapa_id || null,
      subetapa: form.subetapa.trim() || null,
      sinapi_codigo: form.sinapi_codigo.trim() || null,
      descricao: form.descricao.trim(),
      unidade: form.unidade.trim() || 'UN',
      quantidade_total: parseFloat(form.quantidade_total),
      quantidade_comprada: parseFloat(form.quantidade_comprada) || 0,
      status_compra: form.status_compra,
      data_necessidade: form.data_necessidade || null,
    }

    async function tentarSalvar(payload: Record<string, unknown>) {
      if (editando) return supabase.from('materiais').update(payload).eq('id', editando.id)
      return supabase.from('materiais').insert(payload)
    }

    let { error } = await tentarSalvar(payloadCompleto)

    // Coluna "subetapa" pode não existir ainda no banco (migração pendente —
    // supabase/fix_2026_06_08_supabase_v1_2_columns.sql) — tenta de novo sem
    // ela, pra não bloquear o salvamento do material por completo.
    if (error && /column .* does not exist/i.test(error.message)) {
      const { subetapa: _subetapa, ...payloadSemSubetapa } = payloadCompleto
      void _subetapa
      const tentativa2 = await tentarSalvar(payloadSemSubetapa)
      error = tentativa2.error
      if (!error) {
        alert(
          'Material salvo — mas SEM subetapa, porque o banco ainda não tem essa coluna.\n\n' +
          'Para habilitar o agrupamento por subetapa nos materiais, é preciso rodar a migração pendente ' +
          '"supabase/fix_2026_06_08_supabase_v1_2_columns.sql" no SQL Editor do Supabase (uma vez só).'
        )
      }
    }

    setSaving(false)
    if (error) {
      console.error('Erro ao salvar material:', error)
      alert(`Não foi possível salvar o material.\n\nErro do banco: ${error.message}`)
      return
    }
    setShowModal(false)
    setEditando(null)
    resetForm()
    loadMateriais()
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover este material?')) return
    await supabase.from('materiais').delete().eq('id', id)
    setMateriais(prev => prev.filter(m => m.id !== id))
  }

  async function alternarComprado(m: MaterialRow) {
    const comprado = m.status_compra === 'comprado'
    const proximoStatus: MaterialRow['status_compra'] = comprado ? 'nao_comprado' : 'comprado'
    const proximaQuantidade = comprado ? 0 : m.quantidade_total

    await supabase.from('materiais').update({
      status_compra: proximoStatus,
      quantidade_comprada: proximaQuantidade,
    }).eq('id', m.id)

    setMateriais(prev => prev.map(mat => mat.id === m.id
      ? { ...mat, status_compra: proximoStatus, quantidade_comprada: proximoStatus === 'comprado' ? mat.quantidade_total : 0 }
      : mat))
  }

  // "Recebido no canteiro" — estoque leve: só marca se o material já chegou
  // fisicamente na obra, independente do status de compra. Não é uma ficha de
  // estoque (sem movimentação/saldo), só fecha a pergunta "isso já chegou?".
  async function alternarRecebido(m: MaterialRow) {
    const recebido = !!m.data_recebimento
    const novaData = recebido ? null : new Date().toISOString().slice(0, 10)
    await supabase.from('materiais').update({ data_recebimento: novaData }).eq('id', m.id)
    setMateriais(prev => prev.map(mat => mat.id === m.id ? { ...mat, data_recebimento: novaData } : mat))
  }

  function openEdit(m: MaterialRow) {
    setEditando(m)
    setForm({
      sinapi_codigo: m.sinapi_codigo || '',
      descricao: m.descricao,
      unidade: m.unidade,
      quantidade_total: String(m.quantidade_total),
      quantidade_comprada: String(m.quantidade_comprada),
      data_necessidade: m.data_necessidade || '',
      etapa_id: m.etapa_id || '',
      subetapa: m.subetapa || '',
      status_compra: m.status_compra,
    })
    setShowModal(true)
  }

  function openNew() {
    if (consolidado || !orcamentoId) return
    setEditando(null)
    resetForm()
    setShowModal(true)
  }

  function resetForm() {
    setForm({
      sinapi_codigo: '', descricao: '', unidade: '', quantidade_total: '',
      quantidade_comprada: '0', data_necessidade: '', etapa_id: '', subetapa: '', status_compra: 'nao_comprado',
    })
  }

  const materiaisFiltrados = materiais.filter(m => {
    const matchEtapa = filtroEtapa === 'todas' || m.etapa_id === filtroEtapa
    const estado = statusOperacional(m)
    const matchStatus =
      filtroStatus === 'todos' ||
      (filtroStatus === 'abertas' && m.status_compra !== 'comprado') ||
      filtroStatus === estado ||
      filtroStatus === m.status_compra
    return matchEtapa && matchStatus
  })

  const pendentes = materiais.filter(m => m.status_compra !== 'comprado')
  const urgentes = pendentes.filter(m => m.data_necessidade && diasAteData(m.data_necessidade) <= 7)

  // ── Agrupamento em cascata por etapa (igual ao Orçamento) ──
  const materiaisPorEtapa = useMemo(() => {
    const grupos: Record<string, MaterialRow[]> = { sem_etapa: [] }
    etapas.forEach(e => { grupos[e.id] = [] })
    materiaisFiltrados.forEach(m => {
      const chave = m.etapa_id && grupos[m.etapa_id] ? m.etapa_id : 'sem_etapa'
      grupos[chave].push(m)
    })
    return grupos
  }, [materiaisFiltrados, etapas])

  // ── Seleção para lista de compras ──
  function toggleSelecionado(id: string) {
    setSelecionados(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelecionarGrupo(itensDoGrupo: MaterialRow[]) {
    const ids = itensDoGrupo.map(m => m.id)
    const todosSelecionados = ids.length > 0 && ids.every(id => selecionados.has(id))
    setSelecionados(prev => {
      const next = new Set(prev)
      ids.forEach(id => {
        if (todosSelecionados) next.delete(id)
        else next.add(id)
      })
      return next
    })
  }

  function limparSelecao() {
    setSelecionados(new Set())
  }

  const itensSelecionados = materiais.filter(m => selecionados.has(m.id))

  function quantidadePendente(m: MaterialRow) {
    return Math.max(0, m.quantidade_total - m.quantidade_comprada)
  }

  function quantidadeDaLista(m: MaterialRow) {
    const valor = quantidadesLista[m.id]
    const parsed = Number(String(valor ?? '').replace(',', '.'))
    const pendente = quantidadePendente(m)
    if (!Number.isFinite(parsed)) return pendente
    return Math.min(pendente, Math.max(0, parsed))
  }

  function abrirListaCompras() {
    const quantidades: Record<string, string> = {}
    itensSelecionados.forEach(m => {
      quantidades[m.id] = String(quantidadePendente(m))
    })
    setQuantidadesLista(quantidades)
    setShowLista(true)
  }

  function gerarTextoLista() {
    const linhas: string[] = ['Lista de compras', '']
    const grupos: Record<string, MaterialRow[]> = { sem_etapa: [] }
    etapas.forEach(e => { grupos[e.id] = [] })
    itensSelecionados.forEach(m => {
      const chave = m.etapa_id && grupos[m.etapa_id] ? m.etapa_id : 'sem_etapa'
      grupos[chave].push(m)
    })
    etapas.concat([{ id: 'sem_etapa', nome: 'Sem etapa' }]).forEach(e => {
      const itens = grupos[e.id]
      if (!itens || itens.length === 0) return
      linhas.push(`${e.nome}:`)
      agruparPorSubetapa(itens).forEach(({ nome: subNome, itens: subItens }) => {
        if (subNome !== SEM_SUBETAPA) linhas.push(`  ${subNome}:`)
        subItens.forEach(m => {
          const falta = quantidadeDaLista(m)
          const prefixo = subNome !== SEM_SUBETAPA ? '    ' : '  '
          linhas.push(`${prefixo}- ${m.descricao}: ${falta} ${m.unidade}${m.sinapi_codigo ? ` (${m.sinapi_codigo})` : ''}`)
        })
      })
      linhas.push('')
    })
    return linhas.join('\n').trim()
  }

  async function copiarLista() {
    try {
      await navigator.clipboard.writeText(gerarTextoLista())
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Sem permissão de clipboard — usuário pode copiar manualmente do texto exibido
    }
  }

  async function salvarLista() {
    if (consolidado || !orcamentoId || !nomeLista.trim() || itensSelecionados.length === 0) return
    setSalvandoLista(true)
    const itensLista: ListaCompraItem[] = itensSelecionados
      .map(m => ({
        id: m.id,
        descricao: m.descricao,
        quantidade: quantidadeDaLista(m),
        unidade: m.unidade,
        sinapiCodigo: m.sinapi_codigo,
      }))
      .filter(item => item.quantidade > 0)

    if (itensLista.length === 0) {
      setSalvandoLista(false)
      return
    }

    const { data: nova } = await supabase.from('listas_compra').insert({
      obra_id: obraId,
      orcamento_id: orcamentoId,
      nome: nomeLista.trim(),
      fornecedor_id: fornecedorLista || null,
      itens: itensLista,
      status: 'aberta',
    }).select().single()
    if (nova) {
      setListas(prev => [{
        id: nova.id, orcamentoId: nova.orcamento_id, nome: nova.nome, fornecedorId: nova.fornecedor_id,
        itens: itensLista, status: 'aberta', criadoEm: nova.criado_em,
      }, ...prev])

      try {
        const { count } = await supabase
          .from('requisicoes_compra')
          .select('id', { count: 'exact', head: true })
          .eq('obra_id', obraId)
        const numero = `RC-${String((count ?? 0) + 1).padStart(3, '0')}`
        const { data: req } = await supabase.from('requisicoes_compra').insert({
          obra_id: obraId,
          orcamento_id: orcamentoId,
          numero,
          data_solicitacao: new Date().toISOString().slice(0, 10),
          status: 'aberta',
          observacao: `Gerada pela lista de compras: ${nomeLista.trim()}`,
          solicitante: null,
        }).select().single()

        if (req) {
          await supabase.from('requisicao_itens').insert(itensLista.map(item => ({
            requisicao_id: req.id,
            material_id: item.id,
            descricao: item.descricao,
            quantidade: item.quantidade,
            unidade: item.unidade,
            urgente: false,
            observacao: item.sinapiCodigo ? `Código: ${item.sinapiCodigo}` : null,
          })))
        }
      } catch (e) {
        console.error('Lista salva, mas não foi possível criar a requisição formal:', e)
      }
    }
    const idsSolicitados = new Set(itensLista.map(item => item.id))
    await Promise.all(itensLista.map(item => supabase.from('materiais').update({
      status_compra: 'solicitado',
    }).eq('id', item.id)))
    setMateriais(prev => prev.map(m => idsSolicitados.has(m.id) && m.status_compra !== 'comprado'
      ? { ...m, status_compra: 'solicitado' as const }
      : m))
    setNomeLista(''); setFornecedorLista(''); setQuantidadesLista({})
    setSalvandoLista(false); setShowLista(false)
    limparSelecao(); setSubView('compras')
  }

  async function atualizarStatusLista(id: string, status: StatusLista) {
    const listaAtual = listas.find(l => l.id === id)
    setListas(prev => prev.map(l => l.id === id ? { ...l, status } : l))
    await supabase.from('listas_compra').update({ status, updated_at: new Date().toISOString() }).eq('id', id)

    if (status === 'concluida' && listaAtual?.itens.length) {
      const idsDaLista = new Set(listaAtual.itens.map(item => item.id))
      const materiaisDaLista = materiais.filter(m => idsDaLista.has(m.id))

      await Promise.all(materiaisDaLista.map(m => {
        const itemLista = listaAtual.itens.find(item => item.id === m.id)
        const novaQuantidade = Math.min(m.quantidade_total, m.quantidade_comprada + (itemLista?.quantidade ?? 0))
        const novoStatus: MaterialRow['status_compra'] = novaQuantidade >= m.quantidade_total ? 'comprado' : 'parcial'
        return supabase.from('materiais').update({
          status_compra: novoStatus,
          quantidade_comprada: novaQuantidade,
        }).eq('id', m.id)
      }))

      setMateriais(prev => prev.map(m => idsDaLista.has(m.id)
        ? (() => {
          const itemLista = listaAtual.itens.find(item => item.id === m.id)
          const novaQuantidade = Math.min(m.quantidade_total, m.quantidade_comprada + (itemLista?.quantidade ?? 0))
          return {
            ...m,
            status_compra: novaQuantidade >= m.quantidade_total ? 'comprado' as const : 'parcial' as const,
            quantidade_comprada: novaQuantidade,
          }
        })()
        : m))
    }
  }

  async function removerLista(id: string) {
    if (!confirm('Remover esta lista de compras?')) return
    setListas(prev => prev.filter(l => l.id !== id))
    await supabase.from('listas_compra').delete().eq('id', id)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Sub-abas: Lançamentos → Lista de Compras → Requisições → Fornecedores ── */}
      <div className="flex gap-1 p-1 rounded-lg w-full max-w-full overflow-x-auto sm:w-fit" style={{ background: 'var(--bg-secondary)' }}>
        {[
          { id: 'lancamentos' as const, label: 'Lançamentos', mobileLabel: 'Lanç.', icon: Zap },
          { id: 'materiais' as const, label: 'Lista de Compras', mobileLabel: 'Lista', icon: ShoppingCart, active: subView === 'materiais' || subView === 'compras' },
          { id: 'requisicoes' as const, label: 'Requisições', mobileLabel: 'Req.', icon: FileText },
          { id: 'fornecedores' as const, label: 'Fornecedores', mobileLabel: 'Forn.', icon: Building2 },
        ].map(({ id, label, mobileLabel, icon: Icon, active }) => (
          <button
            key={id}
            onClick={() => setSubView(id)}
            className="flex flex-shrink-0 items-center gap-2 px-3.5 py-1.5 rounded-md text-sm font-medium transition-all"
            style={(active ?? subView === id)
              ? { background: 'var(--accent)', color: 'white' }
              : { color: 'var(--text-secondary)' }}
          >
            <Icon size={15} />
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden">{mobileLabel}</span>
          </button>
        ))}
      </div>

      {subView === 'lancamentos' ? (
        <ComprasLancamentos
          obraId={obraId}
          orcamentoId={orcamentoId}
          orcamentoIds={orcamentoIds}
          prefill={prefillLancamento}
          onPrefillConsumed={() => setPrefillLancamento(null)}
        />
      ) : subView === 'fornecedores' ? (
        <ObraFornecedores obraId={obraId} />
      ) : subView === 'requisicoes' ? (
        <ObraRequisicoes
          obraId={obraId}
          orcamentoId={orcamentoId}
          orcamentoIds={orcamentoIds}
          onLancarComoCompra={dados => { setPrefillLancamento(dados); setSubView('lancamentos') }}
        />
      ) : subView === 'compras' ? (
        <ListasDeComprasView
          listas={listas}
          fornecedores={fornecedores}
          onAtualizarStatus={atualizarStatusLista}
          onRemover={removerLista}
          onIrParaMateriais={() => setSubView('materiais')}
        />
      ) : (
      <>
      {/* Alerta urgentes */}
      {urgentes.length > 0 && (
        <div className="card p-4 border-l-4 flex items-start gap-3" style={{ borderLeftColor: 'var(--danger)' }}>
          <AlertTriangle size={18} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 1 }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {urgentes.length} {urgentes.length === 1 ? 'material urgente' : 'materiais urgentes'} (prazo ≤ 7 dias)
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {urgentes.map(m => m.descricao.substring(0, 30)).join(' · ')}
            </p>
          </div>
        </div>
      )}

      {/* KPIs mini */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Comprar agora', value: urgentes.length, color: urgentes.length > 0 ? 'var(--danger)' : 'var(--success)' },
          { label: 'Em aberto', value: pendentes.length, color: pendentes.length > 0 ? 'var(--warning)' : 'var(--success)' },
          { label: 'Total', value: materiais.length, color: 'var(--accent)' },
          { label: 'Comprados', value: materiais.length - pendentes.length, color: 'var(--success)' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card p-3 text-center">
            <p className="text-2xl font-bold" style={{ color }}>{value}</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Barra filtros + botão */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} className="input-base w-full sm:w-52">
          <option value="abertas">Em aberto</option>
          <option value="agora">Comprar agora</option>
          <option value="solicitado">Solicitados</option>
          <option value="parcial">Parciais</option>
          <option value="comprado">Comprados</option>
          <option value="todos">Todos</option>
        </select>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" icon={<RefreshCw size={14} className={importando ? 'animate-spin' : ''} />} onClick={sincronizarComOrcamento} disabled={consolidado || importando}>
            Sincronizar
          </Button>
          <Button size="sm" variant="secondary" icon={<ShoppingCart size={14} />} onClick={() => setSubView('compras')}>
            Listas salvas{listas.length > 0 ? ` (${listas.length})` : ''}
          </Button>
          <Button size="sm" icon={<Plus size={14} />} onClick={openNew} disabled={consolidado}>
            Adicionar
          </Button>
        </div>
      </div>

      {/* Filtro por etapa */}
      {etapas.length > 0 && (
        <select value={filtroEtapa} onChange={e => setFiltroEtapa(e.target.value)} className="input-base w-full sm:w-64">
          <option value="todas">Todas etapas</option>
          {etapas.map(e => (
            <option key={e.id} value={e.id}>{e.nome}</option>
          ))}
        </select>
      )}

      {/* ── Compras em cascata por etapa ── */}
      {materiaisFiltrados.length === 0 && etapas.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Nenhum material"
          description={'Os materiais vêm das composições do orçamento. Se o orçamento já tem itens e ainda não apareceu nada, sincronize uma vez ou confira se os itens possuem composição/insumos vinculados.'}
          action={
            <Button size="sm" icon={<Plus size={14} />} onClick={openNew} disabled={consolidado}>Adicionar material</Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3 pb-16">
          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
              {materiaisFiltrados.length} {materiaisFiltrados.length === 1 ? 'material' : 'materiais'} · clique no item para selecionar e montar a lista de compras
            </span>
          </div>

          {materiaisPorEtapa.sem_etapa.length > 0 && (
            <GrupoCompra
              chaveEtapa="sem_etapa"
              nome="Sem etapa"
              itens={materiaisPorEtapa.sem_etapa}
              collapsed={collapsed['sem_etapa']}
              onToggleGrupo={() => setCollapsed(c => ({ ...c, sem_etapa: !c['sem_etapa'] }))}
              collapsedSub={collapsedSub}
              onToggleSubGrupo={chave => setCollapsedSub(c => ({ ...c, [chave]: !c[chave] }))}
              selecionados={selecionados}
              onToggleItem={toggleSelecionado}
              onToggleGrupoSelecao={() => toggleSelecionarGrupo(materiaisPorEtapa.sem_etapa)}
              onToggleSubGrupoSelecao={toggleSelecionarGrupo}
              onComprado={alternarComprado}
              onRecebido={alternarRecebido}
              onEdit={openEdit}
              onDelete={handleDelete}
              subetapasVazias={[]}
            />
          )}
          {etapas.map(etapa => {
            const itensDaEtapa = materiaisPorEtapa[etapa.id] || []
            return (
              <GrupoCompra
                key={etapa.id}
                chaveEtapa={etapa.id}
                nome={etapa.nome}
                itens={itensDaEtapa}
                collapsed={collapsed[etapa.id]}
                onToggleGrupo={() => setCollapsed(c => ({ ...c, [etapa.id]: !c[etapa.id] }))}
                collapsedSub={collapsedSub}
                onToggleSubGrupo={chave => setCollapsedSub(c => ({ ...c, [chave]: !c[chave] }))}
                selecionados={selecionados}
                onToggleItem={toggleSelecionado}
                onToggleGrupoSelecao={() => toggleSelecionarGrupo(itensDaEtapa)}
                onToggleSubGrupoSelecao={toggleSelecionarGrupo}
                onComprado={alternarComprado}
                onRecebido={alternarRecebido}
                onEdit={openEdit}
                onDelete={handleDelete}
                subetapasVazias={subetapasOrcamento[etapa.id] || []}
              />
            )
          })}
        </div>
      )}

      {/* ── Barra flutuante de seleção ── */}
      {selecionados.size > 0 && (
        <div
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-lg animate-enter"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {selecionados.size} {selecionados.size === 1 ? 'selecionado' : 'selecionados'}
          </span>
          <button
            onClick={limparSelecao}
            className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
            title="Limpar seleção"
          >
            <X size={14} style={{ color: 'var(--text-secondary)' }} />
          </button>
          <Button size="sm" variant="secondary" icon={<ShoppingCart size={14} />} onClick={abrirListaCompras} disabled={consolidado}>
            Gerar lista de compras
          </Button>
        </div>
      )}
      </>
      )}

      {/* ── Modal lista de compras ── */}
      <Modal open={showLista} onClose={() => setShowLista(false)} title="Lista de compras" size="md">
        <div className="flex flex-col gap-4">
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {itensSelecionados.length} {itensSelecionados.length === 1 ? 'item selecionado' : 'itens selecionados'}. Ajuste a quantidade a solicitar; ao salvar, os insumos passam para status Solicitado.
          </p>
          <div className="flex flex-col rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {itensSelecionados.map(m => {
              const pendente = quantidadePendente(m)
              return (
                <div key={m.id} className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-2 p-3" style={{ borderBottom: '1px solid var(--border)' }}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{m.descricao}</p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      Pendente: {pendente} {m.unidade}{m.sinapi_codigo ? ` · ${m.sinapi_codigo}` : ''}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Qtd solicitada</label>
                    <input
                      type="number"
                      min="0"
                      max={pendente}
                      step="any"
                      value={quantidadesLista[m.id] ?? String(pendente)}
                      onChange={e => setQuantidadesLista(prev => ({ ...prev, [m.id]: e.target.value }))}
                      className="input-base w-full text-right"
                    />
                  </div>
                </div>
              )
            })}
          </div>
          <pre
            className="text-xs whitespace-pre-wrap rounded-lg p-3 max-h-80 overflow-y-auto"
            style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace' }}
          >
            {gerarTextoLista()}
          </pre>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" icon={<Copy size={14} />} onClick={copiarLista}>
              {copiado ? 'Copiado!' : 'Copiar lista'}
            </Button>
          </div>

          <div className="pt-3 flex flex-col gap-3" style={{ borderTop: '1px solid var(--border)' }}>
            <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              Ou salve esta seleção como uma lista de compras vinculada a um fornecedor
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Nome da lista *"
                value={nomeLista}
                onChange={e => setNomeLista(e.target.value)}
                placeholder="Ex: Compra acabamentos — semana 1"
              />
              <div>
                <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Fornecedor</label>
                <select
                  value={fornecedorLista}
                  onChange={e => setFornecedorLista(e.target.value)}
                  className="input-base"
                >
                  <option value="">Sem fornecedor definido</option>
                  {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </div>
            </div>
            <Button
              variant="secondary"
              icon={<ClipboardList size={14} />}
              loading={salvandoLista}
              disabled={consolidado || !nomeLista.trim() || itensSelecionados.length === 0}
              onClick={salvarLista}
            >
              Salvar lista de compras
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal editar/criar */}
      <Modal
        open={showModal}
        onClose={() => { setShowModal(false); setEditando(null); resetForm() }}
        title={editando ? 'Editar material' : 'Adicionar material'}
        size="md"
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Código SINAPI"
              value={form.sinapi_codigo}
              onChange={e => setForm(f => ({ ...f, sinapi_codigo: e.target.value }))}
              placeholder="opcional"
            />
            <Input
              label="Unidade"
              value={form.unidade}
              onChange={e => setForm(f => ({ ...f, unidade: e.target.value }))}
              placeholder="M2, UN, KG..."
            />
            <div>
              <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Etapa</label>
              <select
                value={form.etapa_id}
                onChange={e => setForm(f => ({ ...f, etapa_id: e.target.value }))}
                className="input-base"
              >
                <option value="">Sem etapa</option>
                {etapas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            </div>
          </div>

          <Input
            label="Subetapa"
            value={form.subetapa}
            onChange={e => setForm(f => ({ ...f, subetapa: e.target.value }))}
            placeholder="opcional — ex: Baldrames, térreo, bloco A..."
          />

          <Input
            label="Descrição *"
            value={form.descricao}
            onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
            placeholder="Nome/descrição do material"
            autoFocus={!editando}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Qtd total *"
              type="number"
              min="0"
              step="any"
              value={form.quantidade_total}
              onChange={e => setForm(f => ({ ...f, quantidade_total: e.target.value }))}
              placeholder="0"
            />
            <Input
              label="Qtd comprada"
              type="number"
              min="0"
              step="any"
              value={form.quantidade_comprada}
              onChange={e => setForm(f => ({ ...f, quantidade_comprada: e.target.value }))}
              placeholder="0"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Data de necessidade"
              type="date"
              value={form.data_necessidade}
              onChange={e => setForm(f => ({ ...f, data_necessidade: e.target.value }))}
            />
            <div>
              <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Status</label>
              <select
                value={form.status_compra}
                onChange={e => setForm(f => ({ ...f, status_compra: e.target.value as MaterialRow['status_compra'] }))}
                className="input-base"
              >
                <option value="nao_comprado">Não comprado</option>
                <option value="solicitado">Solicitado</option>
                <option value="parcial">Parcial</option>
                <option value="comprado">Comprado</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => { setShowModal(false); setEditando(null); resetForm() }}>
              Cancelar
            </Button>
            <Button
              className="flex-1"
              loading={saving}
              disabled={!form.descricao.trim() || !form.quantidade_total}
              onClick={handleSave}
            >
              {editando ? 'Salvar' : 'Adicionar'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ─── Grupo de etapa para compras (cascata Etapa → Subetapa → Insumo) ─────────
function GrupoCompra({
  chaveEtapa, nome, itens, collapsed, onToggleGrupo,
  collapsedSub, onToggleSubGrupo,
  selecionados, onToggleItem, onToggleGrupoSelecao, onToggleSubGrupoSelecao,
  onComprado, onRecebido, onEdit, onDelete, subetapasVazias = [],
}: {
  chaveEtapa: string
  nome: string
  itens: MaterialRow[]
  collapsed?: boolean
  onToggleGrupo: () => void
  collapsedSub: Record<string, boolean>
  onToggleSubGrupo: (chave: string) => void
  selecionados: Set<string>
  onToggleItem: (id: string) => void
  onToggleGrupoSelecao: () => void
  onToggleSubGrupoSelecao: (itensDoGrupo: MaterialRow[]) => void
  onComprado: (m: MaterialRow) => void
  onRecebido: (m: MaterialRow) => void
  onEdit: (m: MaterialRow) => void
  onDelete: (id: string) => void
  subetapasVazias?: string[]
}) {
  const pendentes = itens.filter(m => m.status_compra !== 'comprado')
  const todosSelecionados = itens.length > 0 && itens.every(m => selecionados.has(m.id))
  const algunsSelecionados = !todosSelecionados && itens.some(m => selecionados.has(m.id))
  const gruposSub = useMemo(() => {
    const grupos = agruparPorSubetapa(itens)
    subetapasVazias.forEach(nomeSub => {
      if (!grupos.some(g => g.nome === nomeSub)) grupos.push({ nome: nomeSub, itens: [] })
    })
    return grupos
  }, [itens, subetapasVazias])
  const exibirSubcabecalhos = !(gruposSub.length === 1 && gruposSub[0].nome === SEM_SUBETAPA)

  return (
    <div className="card overflow-hidden">
      {/* Cabeçalho etapa */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        style={{ background: 'var(--bg-secondary)', borderBottom: collapsed ? 'none' : '1px solid var(--border)' }}
        onClick={onToggleGrupo}
      >
        <span className="flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </span>
        <button
          onClick={e => { e.stopPropagation(); onToggleGrupoSelecao() }}
          title="Selecionar todos os itens da etapa"
          className="flex-shrink-0 p-0.5 rounded hover:bg-[var(--bg-card)] transition-colors"
        >
          {todosSelecionados
            ? <CheckSquare size={16} style={{ color: 'var(--accent)' }} />
            : <Square size={16} style={{ color: algunsSelecionados ? 'var(--accent)' : 'var(--text-secondary)', opacity: algunsSelecionados ? 0.6 : 1 }} />}
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{nome}</p>
          <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
            {itens.length} {itens.length === 1 ? 'item' : 'itens'} · {pendentes.length} {pendentes.length === 1 ? 'pendente' : 'pendentes'}
          </p>
        </div>
      </div>

      {/* Subetapas */}
      {!collapsed && (
        <div className="flex flex-col">
          {gruposSub.length === 0 ? (
            <div className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)', borderTop: '1px solid var(--border)' }}>
              Nenhuma subetapa/material vinculado ainda.
            </div>
          ) : gruposSub.map(grupo => {
            if (!exibirSubcabecalhos) {
              return grupo.itens.map(m => (
                <LinhaMaterial
                  key={m.id} material={m}
                  selecionado={selecionados.has(m.id)}
                  onToggleItem={onToggleItem} onComprado={onComprado} onRecebido={onRecebido} onEdit={onEdit} onDelete={onDelete}
                />
              ))
            }
            const chaveSub = `${chaveEtapa}__${grupo.nome}`
            return (
              <GrupoSubetapaCompra
                key={chaveSub}
                nome={grupo.nome}
                itens={grupo.itens}
                collapsed={collapsedSub[chaveSub]}
                onToggleGrupo={() => onToggleSubGrupo(chaveSub)}
                selecionados={selecionados}
                onToggleItem={onToggleItem}
                onToggleGrupoSelecao={() => onToggleSubGrupoSelecao(grupo.itens)}
                onComprado={onComprado}
                onRecebido={onRecebido}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Grupo de subetapa (nível intermediário da cascata) ──────────────────────
function GrupoSubetapaCompra({
  nome, itens, collapsed, onToggleGrupo,
  selecionados, onToggleItem, onToggleGrupoSelecao,
  onComprado, onRecebido, onEdit, onDelete,
}: {
  nome: string
  itens: MaterialRow[]
  collapsed?: boolean
  onToggleGrupo: () => void
  selecionados: Set<string>
  onToggleItem: (id: string) => void
  onToggleGrupoSelecao: () => void
  onComprado: (m: MaterialRow) => void
  onRecebido: (m: MaterialRow) => void
  onEdit: (m: MaterialRow) => void
  onDelete: (id: string) => void
}) {
  const pendentes = itens.filter(m => m.status_compra !== 'comprado')
  const todosSelecionados = itens.length > 0 && itens.every(m => selecionados.has(m.id))
  const algunsSelecionados = !todosSelecionados && itens.some(m => selecionados.has(m.id))

  return (
    <div style={{ borderTop: '1px solid var(--border)' }}>
      {/* Cabeçalho subetapa — recuado em relação à etapa */}
      <div
        className="flex items-center gap-3 pl-9 pr-4 py-2.5 cursor-pointer select-none transition-colors hover:bg-[var(--bg-secondary)]"
        onClick={onToggleGrupo}
      >
        <span className="flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </span>
        <button
          onClick={e => { e.stopPropagation(); onToggleGrupoSelecao() }}
          title="Selecionar todos os itens da subetapa"
          className="flex-shrink-0 p-0.5 rounded hover:bg-[var(--bg-card)] transition-colors"
        >
          {todosSelecionados
            ? <CheckSquare size={15} style={{ color: 'var(--accent)' }} />
            : <Square size={15} style={{ color: algunsSelecionados ? 'var(--accent)' : 'var(--text-secondary)', opacity: algunsSelecionados ? 0.6 : 1 }} />}
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{nome}</p>
        </div>
        <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
          {itens.length} {itens.length === 1 ? 'item' : 'itens'} · {pendentes.length} {pendentes.length === 1 ? 'pendente' : 'pendentes'}
        </span>
      </div>

      {/* Insumos */}
      {!collapsed && (
        <div className="flex flex-col">
          {itens.length === 0 ? (
            <div className="pl-16 pr-4 py-3 text-xs" style={{ color: 'var(--text-secondary)', borderTop: '1px solid var(--border)' }}>
              Nenhum insumo/material vinculado ainda.
            </div>
          ) : itens.map(m => (
            <LinhaMaterial
              key={m.id} material={m} recuado
              selecionado={selecionados.has(m.id)}
              onToggleItem={onToggleItem} onComprado={onComprado} onRecebido={onRecebido} onEdit={onEdit} onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Linha de insumo selecionável (folha da cascata) ──────────────────────────
function LinhaMaterial({
  material: m, selecionado, recuado,
  onToggleItem, onComprado, onRecebido, onEdit, onDelete,
}: {
  material: MaterialRow
  selecionado: boolean
  recuado?: boolean
  onToggleItem: (id: string) => void
  onComprado: (m: MaterialRow) => void
  onRecebido: (m: MaterialRow) => void
  onEdit: (m: MaterialRow) => void
  onDelete: (id: string) => void
}) {
  const falta = Math.max(0, m.quantidade_total - m.quantidade_comprada)
  const diasParaNecessidade = m.data_necessidade ? diasAteData(m.data_necessidade) : null
  const urgente = diasParaNecessidade !== null && diasParaNecessidade <= 7 && m.status_compra !== 'comprado'
  const comprado = m.status_compra === 'comprado'
  const recebido = !!m.data_recebimento

  return (
    <div
      onClick={() => onToggleItem(m.id)}
      className={`flex items-start gap-3 ${recuado ? 'pl-9' : 'px-4'} pr-4 py-3 cursor-pointer transition-colors`}
      style={{
        borderBottom: '1px solid var(--border)',
        background: selecionado ? 'rgba(59,123,248,0.08)' : 'transparent',
      }}
    >
      <span
        className="flex-shrink-0 pt-1"
        title="Selecionar para lista de compras"
        style={{ color: selecionado ? 'var(--accent)' : 'var(--text-secondary)' }}
      >
        {selecionado ? <CheckSquare size={16} /> : <Square size={16} />}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{m.descricao}</p>
        <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
          {m.sinapi_codigo && <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{m.sinapi_codigo}</span>}
          <span>Falta: <strong style={{ color: falta > 0 ? 'var(--danger)' : 'var(--success)' }}>{falta > 0 ? `${falta} ${m.unidade}` : 'nada'}</strong></span>
          {m.data_necessidade && (
            <span className="inline-flex items-center gap-1" style={{ color: urgente ? 'var(--danger)' : 'var(--text-secondary)' }}>
              {urgente && <AlertTriangle size={11} />}
              {new Date(m.data_necessidade + 'T12:00').toLocaleDateString('pt-BR')}
            </span>
          )}
        </div>
      </div>

      <span
        className="hidden sm:inline text-xs font-semibold px-2 py-1 rounded-full flex-shrink-0"
        style={{ color: urgente ? 'var(--danger)' : STATUS_DOT[m.status_compra], background: 'var(--bg-card)' }}
      >
        {urgente ? 'Comprar agora' : STATUS_LABEL[m.status_compra]}
      </span>

      <div className="flex items-center gap-1 flex-shrink-0 pt-0.5" onClick={e => e.stopPropagation()}>
        <button
          onClick={() => onComprado(m)}
          title={comprado ? 'Desfazer compra' : 'Marcar como comprado'}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors"
          style={comprado
            ? { background: 'rgba(16,185,129,0.16)', color: 'var(--success)', border: '1px solid rgba(16,185,129,0.35)' }
            : { background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
        >
          {comprado ? <CheckSquare size={14} /> : <Square size={14} />}
          <span className="hidden sm:inline">{comprado ? 'Comprado' : 'Comprar'}</span>
        </button>
        <button
          onClick={() => onRecebido(m)}
          title={recebido ? `Recebido em ${new Date(m.data_recebimento! + 'T12:00').toLocaleDateString('pt-BR')} — clique para desfazer` : 'Marcar como recebido no canteiro'}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors"
          style={recebido
            ? { background: 'rgba(59,123,248,0.16)', color: 'var(--accent)', border: '1px solid rgba(59,123,248,0.35)' }
            : { background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
        >
          <PackageCheck size={14} />
          <span className="hidden sm:inline">{recebido ? 'Recebido' : 'Marcar recebido'}</span>
        </button>
        <button onClick={() => onEdit(m)} title="Editar" className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors">
          <Pencil size={14} style={{ color: 'var(--text-secondary)' }} />
        </button>
        <button onClick={() => onDelete(m.id)} title="Remover" className="p-1.5 rounded-lg hover:bg-red-500/20 transition-colors">
          <Trash2 size={14} style={{ color: 'var(--danger)' }} />
        </button>
      </div>
    </div>
  )
}

// ─── Sub-aba: Listas de compra geradas a partir da seleção de materiais ──────
// Cada lista pode ser vinculada a um fornecedor (cadastrado na aba Fornecedores
// do orçamento) e acompanhada por status (aberta → enviada → concluída).
function ListasDeComprasView({
  listas, fornecedores, onAtualizarStatus, onRemover, onIrParaMateriais,
}: {
  listas: ListaCompra[]
  fornecedores: { id: string; nome: string }[]
  onAtualizarStatus: (id: string, status: StatusLista) => void
  onRemover: (id: string) => void
  onIrParaMateriais: () => void
}) {
  const [expandida, setExpandida] = useState<Record<string, boolean>>({})

  function nomeFornecedor(id: string | null) {
    if (!id) return null
    return fornecedores.find(f => f.id === id)?.nome || null
  }

  if (listas.length === 0) {
    return (
      <EmptyState
        icon={ShoppingCart}
        title="Nenhuma lista de compras salva"
        description="Selecione materiais pendentes na aba Materiais, clique em &quot;Gerar lista de compras&quot; e salve a lista vinculando um fornecedor para acompanhar o pedido aqui."
        action={<Button size="sm" icon={<Package size={14} />} onClick={onIrParaMateriais}>Ir para Materiais</Button>}
      />
    )
  }

  return (
    <div className="flex flex-col gap-3 pb-4">
      <p className="text-xs px-1" style={{ color: 'var(--text-secondary)' }}>
        {listas.length} {listas.length === 1 ? 'lista salva' : 'listas salvas'} · gere novas listas selecionando itens na aba Materiais
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {(Object.keys(STATUS_LISTA_INFO) as StatusLista[]).map(status => {
          const info = STATUS_LISTA_INFO[status]
          const Icon = info.icon
          const listasDaColuna = listas.filter(lista => lista.status === status)
          return (
            <div key={status} className="card p-3 flex flex-col gap-2 min-h-32">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: info.color }}>
                  <Icon size={15} /> {info.label}
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ color: 'var(--text-secondary)', background: 'var(--bg-secondary)' }}>
                  {listasDaColuna.length}
                </span>
              </div>
              {listasDaColuna.length === 0 ? (
                <p className="text-xs py-3" style={{ color: 'var(--text-secondary)' }}>Sem listas neste status.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {listasDaColuna.map(lista => {
                    const fornecedor = nomeFornecedor(lista.fornecedorId)
                    return (
                      <button
                        key={lista.id}
                        onClick={() => setExpandida(e => ({ ...e, [lista.id]: true }))}
                        className="text-left rounded-lg p-2 transition-colors hover:bg-[var(--bg-secondary)]"
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                      >
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{lista.nome}</p>
                        <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                          {lista.itens.length} {lista.itens.length === 1 ? 'item' : 'itens'}{fornecedor ? ` · ${fornecedor}` : ''}
                        </p>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {listas.map(lista => {
        const fornecedor = nomeFornecedor(lista.fornecedorId)
        const StatusIcon = STATUS_LISTA_INFO[lista.status].icon
        const aberta = !!expandida[lista.id]
        return (
          <div key={lista.id} className="card overflow-hidden">
            <div
              className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
              style={{ background: 'var(--bg-secondary)', borderBottom: aberta ? '1px solid var(--border)' : 'none' }}
              onClick={() => setExpandida(e => ({ ...e, [lista.id]: !e[lista.id] }))}
            >
              <span className="flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
                {aberta ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{lista.nome}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span>{lista.itens.length} {lista.itens.length === 1 ? 'item' : 'itens'}</span>
                  <span>{new Date(lista.criadoEm).toLocaleDateString('pt-BR')}</span>
                  {fornecedor && (
                    <span className="inline-flex items-center gap-1">
                      <Building2 size={11} /> {fornecedor}
                    </span>
                  )}
                </div>
              </div>
              <span
                className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0"
                style={{ color: STATUS_LISTA_INFO[lista.status].color, background: 'var(--bg-card)' }}
              >
                <StatusIcon size={12} /> {STATUS_LISTA_INFO[lista.status].label}
              </span>
              <button
                onClick={e => { e.stopPropagation(); onRemover(lista.id) }}
                title="Remover lista"
                className="p-1.5 rounded-lg hover:bg-red-500/20 transition-colors flex-shrink-0"
              >
                <Trash2 size={14} style={{ color: 'var(--danger)' }} />
              </button>
            </div>

            {aberta && (
              <div className="flex flex-col">
                <div className="flex flex-wrap items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                  <span className="text-xs font-medium mr-1" style={{ color: 'var(--text-secondary)' }}>Status:</span>
                  {(Object.keys(STATUS_LISTA_INFO) as StatusLista[]).map(status => {
                    const info = STATUS_LISTA_INFO[status]
                    const Icon = info.icon
                    const ativo = lista.status === status
                    return (
                      <button
                        key={status}
                        onClick={() => onAtualizarStatus(lista.id, status)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                        style={ativo
                          ? { background: 'var(--accent)', color: 'white' }
                          : { background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                      >
                        <Icon size={12} /> {info.label}
                      </button>
                    )
                  })}
                </div>
                <div className="flex flex-col">
                  {lista.itens.map(item => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 px-4 py-2.5"
                      style={{ borderBottom: '1px solid var(--border)' }}
                    >
                      <Package size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{item.descricao}</p>
                        {item.sinapiCodigo && (
                          <p className="text-xs" style={{ color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace' }}>{item.sinapiCodigo}</p>
                        )}
                      </div>
                      <span className="text-sm font-semibold flex-shrink-0" style={{ color: 'var(--text-primary)' }}>
                        {item.quantidade} {item.unidade}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
