'use client'

import { useEffect, useState } from 'react'
import { LayoutTemplate, Loader2, Check, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Etapa } from '@/lib/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { inserirItemOrcamento, type NovoItemOrcamento } from '@/lib/orcamento/inserir-item'

// ─── Tipos compartilhados ───────────────────────────────────────────────────
// Fase 2a do rebuild de Orçamento: orcamento_templates deixou de guardar um
// JSONB solto indexado por nome de etapa (sem integridade referencial —
// causa raiz do bug em que aplicar um template com composição própria
// sempre caía em "composição não existe mais", porque a query lia
// composicoes_proprias.custo_unitario, coluna que nunca existiu). Agora as
// linhas moram em orcamento_template_itens, com FK real para composição, e
// o preço vigente é resolvido por preco_vigente_composicao() — a mesma
// função que qualquer outra tela vai usar daqui pra frente.

type TemplateItemRow = {
  id: string
  template_id: string
  grupo_id: string | null
  tipo_linha: 'subetapa' | 'item'
  etapa_nome: string
  composicao_id: string | null
  sinapi_composicao_id: string | null
  tipo_item_snapshot: 'COMPOSICAO' | 'INSUMO' | 'ITEM_LIVRE' | null
  descricao_snapshot: string | null
  codigo_snapshot: string | null
  unidade_snapshot: string | null
  quantidade: number | null
  classificacao_snapshot: 'EQUIPAMENTO' | 'MAO_DE_OBRA' | 'MATERIAL_SERVICOS' | null
  grupo_snapshot: string | null
  ordem: number | null
}

type OrcamentoTemplate = {
  id: string
  nome: string
  descricao: string | null
  created_at: string
  quantidade_itens: number
}

type ItemParaTemplate = {
  id: string
  tipo_linha?: 'item' | 'subetapa' | null
  etapa_id: string | null
  grupo_id?: string | null
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
      const { data: tmpl, error: tmplError } = await supabase
        .from('orcamento_templates')
        .insert({ nome: nome.trim(), descricao: descricao.trim() || null })
        .select('id')
        .single()
      if (tmplError || !tmpl) throw tmplError || new Error('Não foi possível criar o template.')

      const etapaNomeById = new Map(etapas.map(e => [e.id, e.nome]))

      // grupo_id de origem (orcamento_itens.id do cabeçalho) → id da linha
      // recém-criada em orcamento_template_itens — permite que os itens
      // referenciem seu grupo por id também dentro do template, em vez de
      // voltar a comparar texto.
      const grupoIdMap = new Map<string, string>()

      const cabecalhos = linhas.filter(i => i.tipo_linha === 'subetapa')
      for (const item of cabecalhos) {
        const etapaNome = item.etapa_id ? etapaNomeById.get(item.etapa_id) : null
        if (!etapaNome) continue
        const { data, error } = await supabase
          .from('orcamento_template_itens')
          .insert({
            template_id: tmpl.id,
            tipo_linha: 'subetapa',
            etapa_nome: etapaNome,
            descricao_snapshot: item.descricao_snapshot ?? item.subetapa,
            ordem: item.ordem ?? 0,
          })
          .select('id')
          .single()
        if (error) throw error
        grupoIdMap.set(item.id, data.id as string)
      }

      const itensLeaf = linhas.filter(i => i.tipo_linha !== 'subetapa')
      for (const item of itensLeaf) {
        const etapaNome = item.etapa_id ? etapaNomeById.get(item.etapa_id) : null
        if (!etapaNome) continue
        const { error } = await supabase.from('orcamento_template_itens').insert({
          template_id: tmpl.id,
          grupo_id: item.grupo_id ? grupoIdMap.get(item.grupo_id) ?? null : null,
          tipo_linha: 'item',
          etapa_nome: etapaNome,
          composicao_id: item.composicao_id,
          sinapi_composicao_id: item.sinapi_composicao_id,
          tipo_item_snapshot: item.tipo_item_snapshot ?? (item.composicao_id || item.sinapi_composicao_id ? 'COMPOSICAO' : 'ITEM_LIVRE'),
          descricao_snapshot: item.descricao_snapshot ?? null,
          codigo_snapshot: item.codigo_snapshot ?? null,
          unidade_snapshot: item.unidade_snapshot ?? null,
          quantidade: item.quantidade,
          classificacao_snapshot: item.classificacao_snapshot ?? null,
          grupo_snapshot: item.grupo_snapshot ?? null,
          ordem: item.ordem ?? 0,
        })
        if (error) throw error
      }

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
  open, onClose, obraId, projetoId, processoId, orcamentoId, onApplied,
}: {
  open: boolean
  onClose: () => void
  obraId?: string
  projetoId?: string
  // Motor de Processo (P3.3B) — terceiro root, mesmo padrão de obraId/
  // projetoId. Sem isso o modal nunca reconhecia um orçamento de Processo
  // (obra_id e projeto_id ambos nulos) e recusava aplicar o template.
  processoId?: string
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
    const { data } = await supabase
      .from('orcamento_templates')
      .select('id, nome, descricao, created_at, orcamento_template_itens(count)')
      .order('created_at', { ascending: false })
    type TemplateRow = { id: string; nome: string; descricao: string | null; created_at: string; orcamento_template_itens: { count: number }[] }
    setTemplates(((data || []) as TemplateRow[]).map(t => ({
      id: t.id,
      nome: t.nome,
      descricao: t.descricao,
      created_at: t.created_at,
      quantidade_itens: t.orcamento_template_itens?.[0]?.count ?? 0,
    })))
    setLoading(false)
  }

  async function handleApply() {
    const tmpl = templates.find(t => t.id === selectedId)
    if (!tmpl) return
    setApplying(true)
    try {
      const { data: orcamento, error: orcamentoError } = await supabase
        .from('orcamentos')
        .select('id, obra_id, projeto_id, processo_id, uf')
        .eq('id', orcamentoId)
        .single()
      if (orcamentoError || !orcamento) throw orcamentoError || new Error('Orçamento não encontrado.')
      if (obraId && orcamento.obra_id && obraId !== orcamento.obra_id) throw new Error('A obra atual não corresponde ao orçamento selecionado.')
      if (projetoId && orcamento.projeto_id && projetoId !== orcamento.projeto_id) throw new Error('O projeto atual não corresponde ao orçamento selecionado.')
      if (processoId && orcamento.processo_id && processoId !== orcamento.processo_id) throw new Error('O processo atual não corresponde ao orçamento selecionado.')

      const obraIdEfetivo = orcamento.obra_id || obraId || null
      const projetoIdEfetivo = orcamento.projeto_id || projetoId || null
      const processoIdEfetivo = orcamento.processo_id || processoId || null
      if (!obraIdEfetivo && !projetoIdEfetivo && !processoIdEfetivo) throw new Error('O orçamento precisa estar vinculado a um processo, projeto ou obra.')
      const uf = orcamento.uf || 'SP'

      const { data: linhasTemplateRaw, error: linhasError } = await supabase
        .from('orcamento_template_itens')
        .select('*')
        .eq('template_id', tmpl.id)
        .order('ordem')
      if (linhasError) throw linhasError
      const linhasTemplate = (linhasTemplateRaw || []) as TemplateItemRow[]

      const { data: etapasExistentesRaw, error: etapasError } = await supabase
        .from('etapas')
        .select('id, nome, ordem')
        .eq('orcamento_id', orcamentoId)
      if (etapasError) throw etapasError
      const etapasExistentes = (etapasExistentesRaw || []) as { id: string; nome: string; ordem: number | null }[]
      const etapaByNome = new Map(etapasExistentes.map(e => [normalizarNome(e.nome), e]))
      let proximaOrdem = etapasExistentes.reduce((max, e) => Math.max(max, e.ordem || 0), 0) + 1

      const avisos: string[] = []

      const etapasDoTemplate = new Set(linhasTemplate.map(l => normalizarNome(l.etapa_nome)))
      for (const chave of etapasDoTemplate) {
        if (etapaByNome.has(chave)) continue
        const original = linhasTemplate.find(l => normalizarNome(l.etapa_nome) === chave)!
        const { data: nova, error } = await supabase.from('etapas')
          .insert({
            obra_id: obraIdEfetivo,
            projeto_id: projetoIdEfetivo,
            processo_id: processoIdEfetivo,
            orcamento_id: orcamentoId,
            nome: original.etapa_nome,
            status: 'planejada',
            ordem: proximaOrdem++,
          })
          .select('id, nome, ordem').single()
        if (error) throw error
        etapaByNome.set(chave, nova)
      }

      // grupo_id do template → id do cabeçalho recém-criado em
      // orcamento_itens (mesma técnica do Salvar, na direção inversa).
      const grupoIdMap = new Map<string, string>()
      for (const row of linhasTemplate.filter(l => l.tipo_linha === 'subetapa')) {
        const etapa = etapaByNome.get(normalizarNome(row.etapa_nome))
        if (!etapa) { avisos.push(`A etapa "${row.etapa_nome}" não pôde ser criada.`); continue }
        const { data, error } = await supabase.from('orcamento_itens').insert({
          orcamento_id: orcamentoId,
          etapa_id: etapa.id,
          subetapa: row.descricao_snapshot,
          tipo_linha: 'subetapa',
          quantidade: 1,
          preco_unitario_snapshot: 0,
          descricao_snapshot: row.descricao_snapshot,
          codigo_snapshot: row.codigo_snapshot,
          unidade_snapshot: 'VB',
          ordem: row.ordem ?? 0,
        }).select('id').single()
        if (error) throw error
        grupoIdMap.set(row.id, data.id as string)
      }

      for (const row of linhasTemplate.filter(l => l.tipo_linha === 'item')) {
        const etapa = etapaByNome.get(normalizarNome(row.etapa_nome))
        if (!etapa) { avisos.push(`A etapa "${row.etapa_nome}" não pôde ser criada.`); continue }

        let preco = 0
        const descricao = row.descricao_snapshot || ''
        const codigo = row.codigo_snapshot || ''
        const unidade = row.unidade_snapshot || 'UN'

        if (row.composicao_id || row.sinapi_composicao_id) {
          const { data: precoVigente } = await supabase.rpc('preco_vigente_composicao', {
            p_composicao_id: row.composicao_id,
            p_sinapi_composicao_id: row.sinapi_composicao_id,
            p_uf: uf,
          })
          if (precoVigente != null) {
            preco = Number(precoVigente)
          } else {
            avisos.push(`A composição de "${descricao || codigo}" não existe mais ou está sem preço vigente; foi usado o valor salvo no template.`)
          }
        }

        const grupoId = row.grupo_id ? grupoIdMap.get(row.grupo_id) ?? null : null
        const base = {
          orcamentoId,
          etapaId: etapa.id,
          grupoId,
          subetapa: null,
          quantidade: row.quantidade,
          descricao,
          unidade,
          classificacao: row.classificacao_snapshot,
          grupoSnapshot: row.grupo_snapshot,
          ordem: row.ordem,
        }

        const novoItem: NovoItemOrcamento = row.composicao_id
          ? { ...base, fonte: 'propria', composicaoId: row.composicao_id, codigo, precoUnitario: preco }
          : row.sinapi_composicao_id
            ? { ...base, fonte: 'sinapi', sinapiComposicaoId: row.sinapi_composicao_id, codigo, precoUnitario: preco }
            : row.tipo_item_snapshot === 'INSUMO'
              ? { ...base, fonte: 'insumo', codigo, precoUnitario: preco }
              : { ...base, fonte: 'item_livre', codigo, precoUnitario: preco }

        await inserirItemOrcamento(supabase, novoItem)
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
                  {t.quantidade_itens} itens
                </p>
              </button>
            ))}
          </div>
        )}

        {selectedId && (
          <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(245,158,11,0.1)', color: '#FBBF24' }}>
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
            <span>Os itens serão adicionados ao orçamento atual. Composições vinculadas usam o preço vigente calculado agora; itens livres e insumos preservam os valores salvos. Etapas com o mesmo nome são reaproveitadas.</span>
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
