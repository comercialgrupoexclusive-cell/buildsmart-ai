'use client'

import { useEffect, useState } from 'react'
import { LayoutTemplate, Loader2, Check, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Etapa } from '@/lib/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

// ─── Tipos compartilhados ───────────────────────────────────────────────────

type TemplateItemRow = {
  tipo_linha?: 'subetapa' | 'item'
  etapa_nome: string | null
  etapa_ordem?: number | null
  subetapa: string | null
  ordem?: number | null
  tipo_composicao?: 'propria' | 'sinapi'
  composicao_id?: string | null
  sinapi_composicao_id?: string | null
  quantidade: number | null
  codigo_snapshot?: string | null
  descricao_snapshot?: string | null
  unidade_snapshot?: string | null
  preco_unitario_snapshot?: number | null
  classificacao_snapshot?: string | null
  grupo_snapshot?: string | null
  tipo_item_snapshot?: string | null
  subetapa_categoria_snapshot?: string | null
  subetapa_valor_manual?: number | null
  subetapa_valor_manual_ativo?: boolean | null
  valor_total_informado_snapshot?: number | null
  valor_total_manual_ativo?: boolean | null
}

type OrcamentoTemplate = {
  id: string
  nome: string
  descricao: string | null
  itens: TemplateItemRow[]
  created_at: string
}

type ItemParaTemplate = {
  tipo_linha?: 'item' | 'subetapa' | null
  etapa_id: string | null
  subetapa: string | null
  composicao_id: string | null
  sinapi_composicao_id: string | null
  quantidade: number | null
  ordem?: number | null
  codigo_snapshot?: string | null
  descricao_snapshot?: string | null
  unidade_snapshot?: string | null
  preco_unitario_snapshot?: number | null
  classificacao_snapshot?: string | null
  grupo_snapshot?: string | null
  tipo_item_snapshot?: string | null
  subetapa_categoria_snapshot?: string | null
  subetapa_valor_manual?: number | null
  subetapa_valor_manual_ativo?: boolean | null
  valor_total_informado_snapshot?: number | null
  valor_total_manual_ativo?: boolean | null
}

function normalizarNome(nome: string) {
  return nome.trim().toLocaleLowerCase('pt-BR')
}

// ─── Salvar orçamento atual como template ──────────────────────────────────

export function SalvarTemplateOrcamentoModal({
  open, onClose, itens, etapas, onSaved,
}: {
  open: boolean
  onClose: () => void
  itens: ItemParaTemplate[]
  etapas: Etapa[]
  onSaved?: () => void
}) {
  const supabase = createClient()
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) { setNome(''); setDescricao('') }
  }, [open])

  const linhas = itens.filter(i => i.tipo_linha === 'subetapa' || i.tipo_linha === 'item' || !i.tipo_linha)
  const quantidadeItens = linhas.filter(i => i.tipo_linha !== 'subetapa').length

  async function handleSave() {
    if (!nome.trim() || quantidadeItens === 0) return
    setSaving(true)
    try {
      const etapaNomeById = new Map(etapas.map(e => [e.id, e.nome]))
      const etapaOrdemById = new Map(etapas.map(e => [e.id, e.ordem]))
      const rows: TemplateItemRow[] = linhas.map(item => ({
        tipo_linha: item.tipo_linha === 'subetapa' ? 'subetapa' : 'item',
        etapa_nome: item.etapa_id ? (etapaNomeById.get(item.etapa_id) || null) : null,
        etapa_ordem: item.etapa_id ? (etapaOrdemById.get(item.etapa_id) ?? null) : null,
        subetapa: item.subetapa,
        ordem: item.ordem ?? null,
        tipo_composicao: item.composicao_id ? 'propria' : item.sinapi_composicao_id ? 'sinapi' : undefined,
        composicao_id: item.composicao_id,
        sinapi_composicao_id: item.sinapi_composicao_id,
        quantidade: item.quantidade,
        codigo_snapshot: item.codigo_snapshot ?? null,
        descricao_snapshot: item.descricao_snapshot ?? null,
        unidade_snapshot: item.unidade_snapshot ?? null,
        preco_unitario_snapshot: item.preco_unitario_snapshot ?? 0,
        classificacao_snapshot: item.classificacao_snapshot ?? null,
        grupo_snapshot: item.grupo_snapshot ?? null,
        tipo_item_snapshot: item.tipo_item_snapshot ?? null,
        subetapa_categoria_snapshot: item.subetapa_categoria_snapshot ?? null,
        subetapa_valor_manual: item.subetapa_valor_manual ?? null,
        subetapa_valor_manual_ativo: item.subetapa_valor_manual_ativo ?? null,
        valor_total_informado_snapshot: item.valor_total_informado_snapshot ?? null,
        valor_total_manual_ativo: item.valor_total_manual_ativo ?? null,
      }))
      const { error } = await supabase.from('orcamento_templates').insert({
        nome: nome.trim(),
        descricao: descricao.trim() || null,
        itens: rows,
      })
      if (error) throw error
      onSaved?.()
      onClose()
    } catch (e: any) {
      alert(`Erro ao salvar template: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Salvar como template" size="md">
      <div className="flex flex-col gap-4">
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Salva a estrutura atual (etapas, subetapas e itens) como modelo reutilizável em qualquer orçamento.
          {' '}{quantidadeItens} {quantidadeItens === 1 ? 'item será incluído' : 'itens serão incluídos'}.
        </p>
        <Input label="Nome do template *" value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Casa térrea 120m² — padrão médio" autoFocus />
        <Input label="Descrição (opcional)" value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Breve descrição para identificar depois" />
        <div className="flex gap-3 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" onClick={handleSave} disabled={!nome.trim() || quantidadeItens === 0 || saving}>
            {saving ? 'Salvando...' : 'Salvar template'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Usar template salvo ────────────────────────────────────────────────────

export function UsarTemplateOrcamentoModal({
  open, onClose, obraId, projetoId, orcamentoId, onApplied,
}: {
  open: boolean
  onClose: () => void
  obraId?: string
  projetoId?: string
  orcamentoId: string
  onApplied?: () => void
}) {
  const supabase = createClient()
  const [templates, setTemplates] = useState<OrcamentoTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    if (open) load()
  }, [open])

  async function load() {
    setLoading(true)
    setSelectedId(null)
    const { data } = await supabase.from('orcamento_templates').select('*').order('created_at', { ascending: false })
    setTemplates((data || []) as OrcamentoTemplate[])
    setLoading(false)
  }

  async function handleApply() {
    const tmpl = templates.find(t => t.id === selectedId)
    if (!tmpl) return
    setApplying(true)
    try {
      const { data: orcamento, error: orcamentoError } = await supabase
        .from('orcamentos')
        .select('id, obra_id, projeto_id')
        .eq('id', orcamentoId)
        .single()
      if (orcamentoError || !orcamento) throw orcamentoError || new Error('Orçamento não encontrado.')
      if (obraId && orcamento.obra_id && obraId !== orcamento.obra_id) throw new Error('A obra atual não corresponde ao orçamento selecionado.')
      if (projetoId && orcamento.projeto_id && projetoId !== orcamento.projeto_id) throw new Error('O projeto atual não corresponde ao orçamento selecionado.')

      const obraIdEfetivo = orcamento.obra_id || obraId || null
      const projetoIdEfetivo = orcamento.projeto_id || projetoId || null
      if (!obraIdEfetivo && !projetoIdEfetivo) throw new Error('O orçamento precisa estar vinculado a um projeto ou obra.')

      const { data: etapasExistentesRaw, error: etapasError } = await supabase
        .from('etapas')
        .select('id, nome, ordem')
        .eq('orcamento_id', orcamentoId)
      if (etapasError) throw etapasError
      const etapasExistentes = (etapasExistentesRaw || []) as { id: string; nome: string; ordem: number | null }[]
      const etapaByNome = new Map(etapasExistentes.map(e => [normalizarNome(e.nome), e]))
      let proximaOrdem = etapasExistentes.reduce((max, e) => Math.max(max, e.ordem || 0), 0) + 1

      const avisos: string[] = []
      const etapaIdPorLinha = new Map<TemplateItemRow, string>()

      const etapasDoTemplate = new Map<string, { nome: string; ordem: number | null }>()
      for (const row of tmpl.itens) {
        if (!row.etapa_nome) continue
        const chave = normalizarNome(row.etapa_nome)
        const atual = etapasDoTemplate.get(chave)
        if (!atual || (row.etapa_ordem ?? Number.MAX_SAFE_INTEGER) < (atual.ordem ?? Number.MAX_SAFE_INTEGER)) {
          etapasDoTemplate.set(chave, { nome: row.etapa_nome, ordem: row.etapa_ordem ?? null })
        }
      }

      const etapasOrdenadas = [...etapasDoTemplate.entries()].sort(([, a], [, b]) =>
        (a.ordem ?? Number.MAX_SAFE_INTEGER) - (b.ordem ?? Number.MAX_SAFE_INTEGER))
      for (const [chave, etapaTemplate] of etapasOrdenadas) {
        let etapa = etapaByNome.get(chave)
        if (!etapa) {
          const { data: nova, error } = await supabase.from('etapas')
            .insert({
              obra_id: obraIdEfetivo,
              projeto_id: projetoIdEfetivo,
              orcamento_id: orcamentoId,
              nome: etapaTemplate.nome,
              status: 'planejada',
              ordem: proximaOrdem++,
            })
            .select('id, nome, ordem').single()
          if (error) throw error
          etapa = nova
          etapaByNome.set(chave, nova)
        }
      }

      for (const row of tmpl.itens) {
        if (!row.etapa_nome) { avisos.push('Uma linha sem etapa foi ignorada.'); continue }
        const etapaId = etapaByNome.get(normalizarNome(row.etapa_nome))?.id
        if (!etapaId) { avisos.push(`A etapa "${row.etapa_nome}" não pôde ser criada.`); continue }
        etapaIdPorLinha.set(row, etapaId)
      }

      const { data: cabecalhosRaw, error: cabecalhosError } = await supabase
        .from('orcamento_itens')
        .select('etapa_id, subetapa')
        .eq('orcamento_id', orcamentoId)
        .eq('tipo_linha', 'subetapa')
      if (cabecalhosError) throw cabecalhosError
      const cabecalhos = new Set((cabecalhosRaw || []).map((row: { etapa_id: string | null; subetapa: string | null }) =>
        `${row.etapa_id}:${normalizarNome(row.subetapa || '')}`))
      const cabecalhosParaInserir: Record<string, unknown>[] = []

      for (const row of tmpl.itens) {
        const etapaId = etapaIdPorLinha.get(row)
        if (!etapaId || !row.subetapa) continue
        const chave = `${etapaId}:${normalizarNome(row.subetapa)}`
        if (cabecalhos.has(chave)) continue
        if (row.tipo_linha !== 'subetapa' && tmpl.itens.some(item =>
          item.tipo_linha === 'subetapa' && item.etapa_nome &&
          normalizarNome(item.etapa_nome) === normalizarNome(row.etapa_nome || '') &&
          normalizarNome(item.subetapa || '') === normalizarNome(row.subetapa || ''))) continue

        cabecalhos.add(chave)
        cabecalhosParaInserir.push({
          orcamento_id: orcamentoId,
          etapa_id: etapaId,
          subetapa: row.subetapa,
          tipo_linha: 'subetapa',
          quantidade: row.quantidade || 1,
          ordem: row.ordem ?? 0,
          preco_unitario_snapshot: row.preco_unitario_snapshot ?? 0,
          descricao_snapshot: row.descricao_snapshot || row.subetapa,
          codigo_snapshot: row.codigo_snapshot ?? null,
          unidade_snapshot: row.unidade_snapshot || 'VB',
          subetapa_categoria_snapshot: row.subetapa_categoria_snapshot ?? null,
          subetapa_valor_manual: row.subetapa_valor_manual ?? null,
          subetapa_valor_manual_ativo: row.subetapa_valor_manual_ativo ?? false,
        })
      }

      if (cabecalhosParaInserir.length > 0) {
        const { error } = await supabase.from('orcamento_itens').insert(cabecalhosParaInserir)
        if (error) throw error
      }

      const paraInserir: Record<string, unknown>[] = []
      for (const row of tmpl.itens) {
        if (row.tipo_linha === 'subetapa') continue
        const etapaId = etapaIdPorLinha.get(row)
        if (!etapaId) continue

        let descricao = row.descricao_snapshot || ''
        let codigo = row.codigo_snapshot || ''
        let unidade = row.unidade_snapshot || ''
        let preco = Number(row.preco_unitario_snapshot || 0)
        const composicaoPropriaId = row.tipo_composicao === 'sinapi' ? null : row.composicao_id || null
        const composicaoSinapiId = row.sinapi_composicao_id || (row.tipo_composicao === 'sinapi' ? row.composicao_id || null : null)
        if (composicaoPropriaId) {
          const { data } = await supabase.from('composicoes_proprias').select('descricao, codigo, unidade, custo_unitario').eq('id', composicaoPropriaId).maybeSingle()
          if (data) {
            descricao = data.descricao || descricao; codigo = data.codigo || codigo; unidade = data.unidade || unidade; preco = Number(data.custo_unitario ?? preco)
          } else {
            avisos.push(`Composição própria "${descricao || composicaoPropriaId}" não existe mais; foi usado o snapshot salvo.`)
          }
        } else if (composicaoSinapiId) {
          const { data } = await supabase.from('sinapi_composicoes').select('descricao, codigo, unidade, custo_unitario').eq('id', composicaoSinapiId).maybeSingle()
          if (data) {
            descricao = data.descricao || descricao; codigo = data.codigo || codigo; unidade = data.unidade || unidade; preco = Number(data.custo_unitario ?? preco)
          } else {
            avisos.push(`Composição SINAPI "${descricao || composicaoSinapiId}" não existe mais; foi usado o snapshot salvo.`)
          }
        }

        paraInserir.push({
          orcamento_id: orcamentoId,
          etapa_id: etapaId,
          subetapa: row.subetapa,
          tipo_linha: 'item',
          ordem: row.ordem ?? 0,
          composicao_id: composicaoPropriaId,
          sinapi_composicao_id: composicaoSinapiId,
          quantidade: row.quantidade,
          preco_unitario_snapshot: preco,
          descricao_snapshot: descricao,
          codigo_snapshot: codigo,
          unidade_snapshot: unidade,
          classificacao_snapshot: row.classificacao_snapshot ?? null,
          grupo_snapshot: row.grupo_snapshot ?? null,
          tipo_item_snapshot: row.tipo_item_snapshot ?? null,
          subetapa_categoria_snapshot: row.subetapa_categoria_snapshot ?? null,
          valor_total_informado_snapshot: row.valor_total_informado_snapshot ?? null,
          valor_total_manual_ativo: row.valor_total_manual_ativo ?? false,
        })
      }

      if (paraInserir.length > 0) {
        const { error } = await supabase.from('orcamento_itens').insert(paraInserir)
        if (error) throw error
      }

      if (avisos.length > 0) alert(`Template aplicado com ressalvas:\n\n${avisos.join('\n')}`)
      onApplied?.()
      onClose()
    } catch (e: any) {
      alert(`Erro ao aplicar template: ${e.message}`)
    } finally {
      setApplying(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Usar template de orçamento" size="lg">
      <div className="flex flex-col gap-3">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent)' }} />
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <LayoutTemplate size={28} style={{ color: 'var(--text-secondary)', opacity: 0.5 }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Nenhum template salvo ainda. Monte um orçamento e use "Salvar como template" para criar o primeiro.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-h-[50vh] overflow-y-auto">
            {templates.map(t => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className="text-left rounded-lg px-4 py-3 transition-colors"
                style={{
                  border: `1px solid ${selectedId === t.id ? 'var(--accent)' : 'var(--border)'}`,
                  background: selectedId === t.id ? 'rgba(59,123,248,0.08)' : 'var(--bg-secondary)',
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t.nome}</span>
                  {selectedId === t.id && <Check size={15} style={{ color: 'var(--accent)' }} />}
                </div>
                {t.descricao && <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{t.descricao}</p>}
                <p className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
                  {t.itens.filter(item => item.tipo_linha !== 'subetapa').length} itens
                </p>
              </button>
            ))}
          </div>
        )}

        {selectedId && (
          <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(245,158,11,0.1)', color: '#FBBF24' }}>
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
            <span>Os itens serão adicionados ao orçamento atual. Composições vinculadas usam a base vigente; itens livres e insumos preservam os valores salvos. Etapas com o mesmo nome são reaproveitadas.</span>
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" onClick={handleApply} disabled={!selectedId || applying}>
            {applying ? 'Aplicando...' : 'Aplicar template'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
