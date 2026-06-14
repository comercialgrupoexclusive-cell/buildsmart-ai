'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Package, AlertTriangle, CheckCircle,
  Plus, Pencil, Trash2, ChevronDown, ChevronRight,
  Square, CheckSquare, ShoppingCart, Copy, X,
  Building2, Send, PackageCheck, ClipboardList, Download, FileText,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { diasAteData } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { ObraFornecedores } from '@/components/obra/ObraFornecedores'
import { ObraRequisicoes } from '@/components/obra/ObraRequisicoes'

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
  etapas?: { nome: string } | null
}

type MateriaisSchema = 'snapshot' | 'insumo_id'

type MaterialBancoInsumoId = {
  id: string
  obra_id: string
  etapa_id: string | null
  subetapa?: string | null
  insumo_id: string | null
  quantidade_total: number
  quantidade_comprada: number
  status_compra: MaterialRow['status_compra']
  data_necessidade: string | null
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

export function ObraMateriais({ obraId }: { obraId: string }) {
  const supabase = createClient()
  const [materiais, setMateriais] = useState<MaterialRow[]>([])
  const [etapas, setEtapas] = useState<{ id: string; nome: string }[]>([])
  const [fornecedores, setFornecedores] = useState<{ id: string; nome: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroEtapa, setFiltroEtapa] = useState('todas')
  const [filtroStatus, setFiltroStatus] = useState('abertas')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [collapsedSub, setCollapsedSub] = useState<Record<string, boolean>>({})
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [showLista, setShowLista] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [marcandoLote, setMarcandoLote] = useState(false)
  const [salvandoLista, setSalvandoLista] = useState(false)
  const [nomeLista, setNomeLista] = useState('')
  const [fornecedorLista, setFornecedorLista] = useState('')
  const [importando, setImportando] = useState(false)

  // ── Sub-aba: Materiais x Listas de compra ──
  const [subView, setSubView] = useState<'materiais' | 'compras' | 'fornecedores' | 'requisicoes'>('materiais')
  const [listas, setListas] = useState<ListaCompra[]>([])
  const [listasCarregadas, setListasCarregadas] = useState(false)

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
      etapas: row.etapas,
    }
  }

  async function resolverInsumoIdPorCodigo(codigo: string) {
    const { data } = await supabase.from('sinapi_insumos').select('id').eq('codigo', codigo).limit(1).maybeSingle()
    return data?.id as string | undefined
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
        .select('id, obra_id, etapa_id, subetapa, insumo_id, quantidade_total, quantidade_comprada, status_compra, data_necessidade, etapas(nome), insumo:sinapi_insumos(codigo,descricao,unidade)')
        .eq('obra_id', obraId)
        .order('data_necessidade', { ascending: true, nullsFirst: false })
    const [matsRes, etapasRes, fornecedoresRes] = await Promise.all([
      matsQuery,
      supabase.from('etapas').select('id, nome').eq('obra_id', obraId).order('ordem'),
      supabase
        .from('fornecedores')
        .select('id, nome, obra_id')
        .or(`obra_id.is.null,obra_id.eq.${obraId}`)
        .order('nome'),
    ])
    setMateriais(schemaMateriais === 'snapshot'
      ? (matsRes.data || []) as MaterialRow[]
      : ((matsRes.data || []) as unknown as MaterialBancoInsumoId[]).map(normalizarMaterialInsumoId))
    setEtapas(etapasRes.data || [])
    setFornecedores(fornecedoresRes.data || [])
    setLoading(false)
  }
  // --- Importar do orçamento ────────────────────────────────────────────────
  // Pergunta do usuário: "como faço pra puxar os insumos do orçamento pra
  // materiais? / faça um botão de importar os dados do orçamento em materiais".
  // Varre todos os itens de todos os orçamentos da obra, deriva os insumos de
  // cada composição (analítico SINAPI ou própria) e GRAVA (idempotente — soma
  // do zero, não duplica) o total por (etapa, subetapa, código) em "materiais".
  // Quando não há detalhamento de insumos disponível para a composição, lança
  // a própria composição como material — garante que o dado sempre "puxe".
  async function importarDoOrcamento() {
    if (importando) return
    setImportando(true)
    try {
      // 1) Orçamentos da obra
      const { data: orcs, error: erroOrcs } = await supabase.from('orcamentos').select('id').eq('obra_id', obraId)
      if (erroOrcs) { alert(`Não foi possível ler os orçamentos da obra.\n\nErro: ${erroOrcs.message}`); return }
      const orcamentoIds = ((orcs || []) as { id: string }[]).map(o => o.id)
      if (orcamentoIds.length === 0) {
        alert('Esta obra ainda não tem orçamento. Crie um orçamento na aba "Orçamento" primeiro — os materiais são derivados dele.')
        return
      }

      // 2) Itens do orçamento — consulta ENXUTA (sem embeds pesados, evita
      // joins aninhados caros que travam/expiram quando há muitos itens).
      type ItemLean = {
        etapa_id: string | null
        subetapa: string | null
        composicao_id: string | null
        sinapi_composicao_id: string | null
        quantidade: number
        descricao_snapshot: string | null
        codigo_snapshot: string | null
        unidade_snapshot: string | null
      }
      const { data: itensRaw, error: erroItens } = await supabase
        .from('orcamento_itens')
        .select('etapa_id, subetapa, composicao_id, sinapi_composicao_id, quantidade, descricao_snapshot, codigo_snapshot, unidade_snapshot')
        .in('orcamento_id', orcamentoIds)

      if (erroItens) {
        alert(`Não foi possível ler os itens do orçamento.\n\nErro: ${erroItens.message}`)
        return
      }

      const itens = (itensRaw || []) as ItemLean[]
      if (itens.length === 0) {
        alert('O orçamento desta obra ainda não tem itens lançados. Adicione composições na aba "Orçamento" — os materiais são derivados delas.')
        return
      }

      // 3) Detalhamento das composições PRÓPRIAS usadas (base própria — a mais
      // usada). Busca em LOTE, só dos códigos realmente referenciados.
      type InsumoJoin = {
        coeficiente: number
        insumo?: { codigo: string; descricao: string; unidade: string } | null
        insumo_proprio?: { codigo: string; descricao: string; unidade: string } | null
      }
      type ComposicaoPropriaRow = { id: string; codigo: string; descricao: string; unidade: string; composicao_insumos?: InsumoJoin[] | null }
      const composicaoIds = Array.from(new Set(itens.map(i => i.composicao_id).filter((v): v is string => !!v)))
      const composicoesProprias = new Map<string, ComposicaoPropriaRow>()
      if (composicaoIds.length > 0) {
        const { data, error } = await supabase
          .from('composicoes_proprias')
          .select('id, codigo, descricao, unidade, composicao_insumos(coeficiente, insumo:sinapi_insumos(codigo,descricao,unidade), insumo_proprio:insumos_proprios(codigo,descricao,unidade))')
          .in('id', composicaoIds)
        if (error) { alert(`Não foi possível ler as composições próprias do orçamento.\n\nErro: ${error.message}`); return }
        for (const c of (data || []) as unknown as ComposicaoPropriaRow[]) composicoesProprias.set(c.id, c)
      }

      // 4) Composições da base SINAPI usadas (quando houver) — também em lote
      type SinapiCompRow = { id: string; codigo: string; descricao: string; unidade: string; mes_referencia: string | null }
      const sinapiCompIds = Array.from(new Set(itens.map(i => i.sinapi_composicao_id).filter((v): v is string => !!v)))
      const sinapiComposicoes = new Map<string, SinapiCompRow>()
      if (sinapiCompIds.length > 0) {
        const { data, error } = await supabase.from('sinapi_composicoes')
          .select('id, codigo, descricao, unidade, mes_referencia')
          .in('id', sinapiCompIds)
        if (error) { alert(`Não foi possível ler as composições SINAPI do orçamento.\n\nErro: ${error.message}`); return }
        for (const c of (data || []) as SinapiCompRow[]) sinapiComposicoes.set(c.id, c)
      }

      // 5) Detalhamento analítico SINAPI (opcional) — também em lote, por código
      type AnaliticoRow = { composicao_codigo: string; item_codigo: string; item_descricao: string; item_unidade: string; coeficiente: number }
      const sinapiCodigos = Array.from(new Set(Array.from(sinapiComposicoes.values()).map(c => c.codigo)))
      const analiticosPorCodigo = new Map<string, AnaliticoRow[]>()
      if (sinapiCodigos.length > 0) {
        const { data } = await supabase.from('sinapi_composicao_itens')
          .select('composicao_codigo, item_codigo, item_descricao, item_unidade, coeficiente')
          .in('composicao_codigo', sinapiCodigos).eq('tipo', 'INSUMO')
        for (const r of (data || []) as AnaliticoRow[]) {
          const lista = analiticosPorCodigo.get(r.composicao_codigo) || []
          lista.push(r)
          analiticosPorCodigo.set(r.composicao_codigo, lista)
        }
      }

      // 5b) Detecta se a coluna materiais.subetapa existe — em alguns bancos a
      // migração "supabase/fix_2026_06_08_supabase_v1_2_columns.sql" ainda não
      // rodou. Se não existir, agrupamos tudo sob "sem subetapa" em vez de
      // travar a importação inteira por causa de uma coluna ausente.
      let temSubetapa = true
      {
        const { error } = await supabase.from('materiais').select('subetapa').eq('obra_id', obraId).limit(1)
        if (error && /column .* does not exist/i.test(error.message)) temSubetapa = false
      }

      // 6) Acumula em memória — sem nenhum round-trip ao banco aqui dentro
      type Acc = { qtd: number; descricao: string; unidade: string }
      const mapa = new Map<string, Acc>()
      const acumular = (etapaId: string | null, subetapaOriginal: string | null, codigo: string, descricao: string, unidade: string, qtd: number) => {
        if (!codigo || codigo === '—' || qtd <= 0) return
        const subetapa = temSubetapa ? subetapaOriginal : null
        const key = `${etapaId ?? 'null'}|${subetapa ?? 'null'}|${codigo}`
        const atual = mapa.get(key)
        if (atual) atual.qtd += qtd
        else mapa.set(key, { qtd, descricao, unidade })
      }

      for (const item of itens) {
        const cp = item.composicao_id ? composicoesProprias.get(item.composicao_id) : undefined
        const sc = item.sinapi_composicao_id ? sinapiComposicoes.get(item.sinapi_composicao_id) : undefined
        const codigo = cp?.codigo || sc?.codigo || item.codigo_snapshot || '—'
        const descricao = item.descricao_snapshot || cp?.descricao || sc?.descricao || '—'
        const unidade = cp?.unidade || sc?.unidade || item.unidade_snapshot || 'UN'
        const qtd = Number(item.quantidade) || 0
        if (qtd <= 0) continue

        if (sc) {
          const lista = analiticosPorCodigo.get(sc.codigo) || []
          if (lista.length === 0) {
            acumular(item.etapa_id, item.subetapa, codigo, descricao, unidade, qtd)
          } else {
            for (const ins of lista) {
              if (!ins.item_codigo) continue
              acumular(item.etapa_id, item.subetapa, ins.item_codigo, ins.item_descricao || ins.item_codigo, ins.item_unidade || 'UN', qtd * ins.coeficiente)
            }
          }
        } else if (cp) {
          const lista = cp.composicao_insumos || []
          if (lista.length === 0) {
            acumular(item.etapa_id, item.subetapa, codigo, descricao, unidade, qtd)
          } else {
            for (const ins of lista) {
              const di = ins.insumo || ins.insumo_proprio
              if (!di?.codigo) continue
              acumular(item.etapa_id, item.subetapa, di.codigo, di.descricao, di.unidade, qtd * ins.coeficiente)
            }
          }
        } else if (codigo !== '—') {
          // Item lançado manualmente no orçamento (sem composição vinculada),
          // mas com código/descrição próprios — ainda assim lança como material.
          acumular(item.etapa_id, item.subetapa, codigo, descricao, unidade, qtd)
        }
      }

      if (mapa.size === 0) {
        alert('Não há insumos para importar a partir deste orçamento — os itens lançados não têm composição nem código/descrição que permitam gerar materiais.')
        return
      }

      // 7) Grava - busca os materiais existentes e decide update/insert.
      const schemaMateriais = await detectarSchemaMateriais()
      const existentesQuery = schemaMateriais === 'snapshot'
        ? supabase
          .from('materiais')
          .select(temSubetapa ? 'id, etapa_id, subetapa, sinapi_codigo, quantidade_total' : 'id, etapa_id, sinapi_codigo, quantidade_total')
          .eq('obra_id', obraId)
        : supabase
          .from('materiais')
          .select(temSubetapa ? 'id, etapa_id, subetapa, insumo_id, quantidade_total, insumo:sinapi_insumos(codigo)' : 'id, etapa_id, insumo_id, quantidade_total, insumo:sinapi_insumos(codigo)')
          .eq('obra_id', obraId)
      const { data: existentesRaw, error: erroExistentes } = await existentesQuery
      if (erroExistentes) { alert(`Nao foi possivel ler os materiais ja cadastrados.\n\nErro: ${erroExistentes.message}`); return }
      const existentesMap = new Map<string, { id: string; quantidade_total: number }>()
      for (const e of (existentesRaw || []) as { id: string; etapa_id: string | null; subetapa?: string | null; sinapi_codigo?: string | null; insumo_id?: string | null; quantidade_total: number; insumo?: { codigo: string } | null }[]) {
        const codigoExistente = schemaMateriais === 'snapshot' ? e.sinapi_codigo : e.insumo?.codigo
        if (!codigoExistente) continue
        const subetapaChave = temSubetapa ? (e.subetapa ?? 'null') : 'null'
        const key = `${e.etapa_id ?? 'null'}|${subetapaChave}|${codigoExistente}`
        existentesMap.set(key, { id: e.id, quantidade_total: e.quantidade_total })
      }
      let criados = 0
      let atualizados = 0
      const errosDb: string[] = []
      for (const [key, acc] of mapa) {
        const [etapaIdRaw, subetapaRaw, codigo] = key.split('|')
        const etapaId = etapaIdRaw === 'null' ? null : etapaIdRaw
        const subetapa = subetapaRaw === 'null' ? null : subetapaRaw
        const qtdArred = Math.round(acc.qtd * 10000) / 10000
        const existente = existentesMap.get(key)
        if (existente) {
          if (Number(existente.quantidade_total) !== qtdArred) {
            const { error } = await supabase.from('materiais').update({ quantidade_total: qtdArred }).eq('id', existente.id)
            if (error) errosDb.push(error.message); else atualizados++
          }
        } else {
          const novoMaterial: Record<string, unknown> = schemaMateriais === 'snapshot'
            ? {
              obra_id: obraId, etapa_id: etapaId,
              sinapi_codigo: codigo, descricao: acc.descricao, unidade: acc.unidade,
              quantidade_total: qtdArred, quantidade_comprada: 0, status_compra: 'nao_comprado',
            }
            : {
              obra_id: obraId, etapa_id: etapaId,
              insumo_id: await resolverInsumoIdPorCodigo(codigo),
              quantidade_total: qtdArred, quantidade_comprada: 0, status_compra: 'nao_comprado',
            }
          if (schemaMateriais === 'insumo_id' && !novoMaterial.insumo_id) {
            errosDb.push(`Insumo ${codigo} nao encontrado na base SINAPI; material nao criado.`)
            continue
          }
          if (temSubetapa) novoMaterial.subetapa = subetapa
          const { error } = await supabase.from('materiais').insert(novoMaterial)
          if (error) errosDb.push(error.message); else criados++
        }
      }

      await loadMateriais()

      if (!temSubetapa) {
        alert(
          `Importação concluída (sem agrupamento por subetapa — coluna pendente no banco).\n\n` +
          `${criados} novo(s) material(is) criado(s) · ${atualizados} atualizado(s) · ${errosDb.length} erro(s)${errosDb.length > 0 ? `\nPrimeiro erro: ${errosDb[0]}` : ''}\n\n` +
          `Para habilitar o agrupamento por subetapa, rode a migração pendente "supabase/fix_2026_06_08_supabase_v1_2_columns.sql" no SQL Editor do Supabase (uma vez só).`
        )
      } else if (errosDb.length > 0) {
        alert(`Importação concluída com ${errosDb.length} erro(s) do banco.\n\nCriados: ${criados} · Atualizados: ${atualizados}\n\nPrimeiro erro: ${errosDb[0]}`)
      } else if (criados === 0 && atualizados === 0) {
        alert(`Materiais já estavam em dia com o orçamento — nada novo para importar.\n\n(${mapa.size} ${mapa.size === 1 ? 'insumo conferido' : 'insumos conferidos'}, sem mudanças de quantidade.)`)
      } else {
        alert(`Importação concluída.\n\n${criados} novo(s) material(is) criado(s).\n${atualizados} material(is) com quantidade atualizada.\n\nTotal de insumos considerados: ${mapa.size}`)
      }
    } catch (e) {
      console.error('Erro ao importar materiais do orçamento:', e)
      const msg = e instanceof Error ? e.message : 'Erro desconhecido'
      alert(`Não foi possível importar os dados do orçamento.\n\nErro: ${msg}`)
    } finally {
      setImportando(false)
    }
  }

  useEffect(() => {
    // Disparo assíncrono evita setState síncrono no corpo do efeito (cascading renders)
    Promise.resolve().then(() => loadMateriais())
  }, [obraId])

  // ── Listas de compra — carrega do Supabase ──
  useEffect(() => {
    if (!obraId) return
    supabase.from('listas_compra').select('*').eq('obra_id', obraId).order('criado_em', { ascending: false })
      .then(({ data }: { data: { id: string; nome: string; fornecedor_id: string | null; itens: ListaCompraItem[]; status: StatusLista; criado_em: string }[] | null }) => {
        setListas((data ?? []).map((r) => ({
          id: r.id, nome: r.nome, fornecedorId: r.fornecedor_id,
          itens: r.itens ?? [], status: r.status, criadoEm: r.criado_em,
        })))
        setListasCarregadas(true)
      })
  }, [obraId])

  async function handleSave() {
    if (!form.descricao.trim() || !form.quantidade_total) return
    setSaving(true)
    const payloadCompleto = {
      obra_id: obraId,
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

  async function marcarComprado(m: MaterialRow) {
    await supabase.from('materiais').update({
      status_compra: 'comprado',
      quantidade_comprada: m.quantidade_total,
    }).eq('id', m.id)
    setMateriais(prev => prev.map(mat => mat.id === m.id
      ? { ...mat, status_compra: 'comprado', quantidade_comprada: mat.quantidade_total }
      : mat))
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
          const falta = Math.max(0, m.quantidade_total - m.quantidade_comprada)
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
    if (!nomeLista.trim() || itensSelecionados.length === 0) return
    setSalvandoLista(true)
    const itensLista: ListaCompraItem[] = itensSelecionados.map(m => ({
      id: m.id,
      descricao: m.descricao,
      quantidade: Math.max(0, m.quantidade_total - m.quantidade_comprada),
      unidade: m.unidade,
      sinapiCodigo: m.sinapi_codigo,
    }))
    const { data: nova } = await supabase.from('listas_compra').insert({
      obra_id: obraId,
      nome: nomeLista.trim(),
      fornecedor_id: fornecedorLista || null,
      itens: itensLista,
      status: 'aberta',
    }).select().single()
    if (nova) {
      setListas(prev => [{
        id: nova.id, nome: nova.nome, fornecedorId: nova.fornecedor_id,
        itens: itensLista, status: 'aberta', criadoEm: nova.criado_em,
      }, ...prev])
    }
    setNomeLista(''); setFornecedorLista('')
    setSalvandoLista(false); setShowLista(false)
    limparSelecao(); setSubView('compras')
  }

  async function atualizarStatusLista(id: string, status: StatusLista) {
    setListas(prev => prev.map(l => l.id === id ? { ...l, status } : l))
    await supabase.from('listas_compra').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
  }

  async function removerLista(id: string) {
    if (!confirm('Remover esta lista de compras?')) return
    setListas(prev => prev.filter(l => l.id !== id))
    await supabase.from('listas_compra').delete().eq('id', id)
  }

  async function marcarSelecionadosComoComprados() {
    if (itensSelecionados.length === 0) return
    setMarcandoLote(true)
    await Promise.all(itensSelecionados.map(m => supabase.from('materiais').update({
      status_compra: 'comprado',
      quantidade_comprada: m.quantidade_total,
    }).eq('id', m.id)))
    setMateriais(prev => prev.map(m => selecionados.has(m.id)
      ? { ...m, status_compra: 'comprado' as const, quantidade_comprada: m.quantidade_total }
      : m))
    setMarcandoLote(false)
    setShowLista(false)
    limparSelecao()
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
      {/* ── Sub-abas: Materiais x Listas de compra ── */}
      <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ background: 'var(--bg-secondary)' }}>
        {[
          { id: 'materiais' as const, label: 'Materiais', icon: Package },
          { id: 'compras' as const, label: 'Listas de compra', icon: ShoppingCart, badge: listas.length },
          { id: 'requisicoes' as const, label: 'Requisições', icon: FileText },
          { id: 'fornecedores' as const, label: 'Fornecedores', icon: Building2 },
        ].map(({ id, label, icon: Icon, badge }) => (
          <button
            key={id}
            onClick={() => setSubView(id)}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-md text-sm font-medium transition-all"
            style={subView === id
              ? { background: 'var(--accent)', color: 'white' }
              : { color: 'var(--text-secondary)' }}
          >
            <Icon size={15} />
            {label}
            {!!badge && (
              <span
                className="text-xs font-semibold px-1.5 py-0.5 rounded-full leading-none"
                style={{ background: 'var(--accent)', color: 'white' }}
              >
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {subView === 'fornecedores' ? (
        <ObraFornecedores obraId={obraId} />
      ) : subView === 'requisicoes' ? (
        <ObraRequisicoes obraId={obraId} />
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
          <Button
            size="sm"
            variant="secondary"
            icon={<Download size={14} className={importando ? 'animate-pulse' : ''} />}
            onClick={importarDoOrcamento}
            disabled={importando}
            title="Recalcula os materiais a partir das composições lançadas no orçamento (pode rodar quantas vezes quiser — não duplica)"
          >
            {importando ? 'Importando...' : 'Importar do orçamento'}
          </Button>
          <Button size="sm" icon={<Plus size={14} />} onClick={openNew}>
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
      {materiaisFiltrados.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Nenhum material"
          description={'Os materiais são gerados pelas composições do orçamento ou adicionados manualmente. Já lançou itens no orçamento? Clique em "Importar do orçamento" para puxá-los pra cá.'}
          action={
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                icon={<Download size={14} className={importando ? 'animate-pulse' : ''} />}
                onClick={importarDoOrcamento}
                disabled={importando}
              >
                {importando ? 'Importando...' : 'Importar do orçamento'}
              </Button>
              <Button size="sm" icon={<Plus size={14} />} onClick={openNew}>Adicionar material</Button>
            </div>
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
              onComprado={marcarComprado}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          )}
          {etapas.map(etapa => {
            const itensDaEtapa = materiaisPorEtapa[etapa.id] || []
            if (itensDaEtapa.length === 0) return null
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
                onComprado={marcarComprado}
                onEdit={openEdit}
                onDelete={handleDelete}
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
          <Button size="sm" variant="secondary" icon={<ShoppingCart size={14} />} onClick={() => setShowLista(true)}>
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
            {itensSelecionados.length} {itensSelecionados.length === 1 ? 'item selecionado' : 'itens selecionados'}, agrupados por etapa. Copie o texto para enviar ao fornecedor ou marque tudo como comprado de uma vez.
          </p>
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
            <Button
              className="flex-1"
              icon={<CheckCircle size={14} />}
              loading={marcandoLote}
              onClick={marcarSelecionadosComoComprados}
            >
              Marcar tudo como comprado
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
              disabled={!nomeLista.trim() || itensSelecionados.length === 0}
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
  onComprado, onEdit, onDelete,
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
  onEdit: (m: MaterialRow) => void
  onDelete: (id: string) => void
}) {
  const pendentes = itens.filter(m => m.status_compra !== 'comprado')
  const todosSelecionados = itens.length > 0 && itens.every(m => selecionados.has(m.id))
  const algunsSelecionados = !todosSelecionados && itens.some(m => selecionados.has(m.id))
  const gruposSub = useMemo(() => agruparPorSubetapa(itens), [itens])
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
          {gruposSub.map(grupo => {
            if (!exibirSubcabecalhos) {
              return grupo.itens.map(m => (
                <LinhaMaterial
                  key={m.id} material={m}
                  selecionado={selecionados.has(m.id)}
                  onToggleItem={onToggleItem} onComprado={onComprado} onEdit={onEdit} onDelete={onDelete}
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
  onComprado, onEdit, onDelete,
}: {
  nome: string
  itens: MaterialRow[]
  collapsed?: boolean
  onToggleGrupo: () => void
  selecionados: Set<string>
  onToggleItem: (id: string) => void
  onToggleGrupoSelecao: () => void
  onComprado: (m: MaterialRow) => void
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
          {itens.map(m => (
            <LinhaMaterial
              key={m.id} material={m} recuado
              selecionado={selecionados.has(m.id)}
              onToggleItem={onToggleItem} onComprado={onComprado} onEdit={onEdit} onDelete={onDelete}
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
  onToggleItem, onComprado, onEdit, onDelete,
}: {
  material: MaterialRow
  selecionado: boolean
  recuado?: boolean
  onToggleItem: (id: string) => void
  onComprado: (m: MaterialRow) => void
  onEdit: (m: MaterialRow) => void
  onDelete: (id: string) => void
}) {
  const falta = Math.max(0, m.quantidade_total - m.quantidade_comprada)
  const diasParaNecessidade = m.data_necessidade ? diasAteData(m.data_necessidade) : null
  const urgente = diasParaNecessidade !== null && diasParaNecessidade <= 7 && m.status_compra !== 'comprado'

  return (
    <div
      onClick={() => onToggleItem(m.id)}
      className={`flex items-center gap-3 ${recuado ? 'pl-9' : 'px-4'} pr-4 py-3 cursor-pointer transition-colors`}
      style={{
        borderBottom: '1px solid var(--border)',
        background: selecionado ? 'rgba(59,123,248,0.08)' : 'transparent',
      }}
    >
      <span className="flex-shrink-0" style={{ color: selecionado ? 'var(--accent)' : 'var(--text-secondary)' }}>
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

      <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
        {m.status_compra !== 'comprado' && (
          <button
            onClick={() => onComprado(m)}
            title="Marcar como comprado"
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{ background: 'rgba(16,185,129,0.14)', color: 'var(--success)' }}
          >
            <CheckCircle size={13} /> <span className="hidden md:inline">Comprado</span>
          </button>
        )}
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
