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
  etapa_nome: string | null
  subetapa: string | null
  tipo_composicao: 'propria' | 'sinapi'
  composicao_id: string
  quantidade: number
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
  quantidade: number
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

  const linhas = itens.filter(i => i.tipo_linha !== 'subetapa' && (i.composicao_id || i.sinapi_composicao_id))

  async function handleSave() {
    if (!nome.trim() || linhas.length === 0) return
    setSaving(true)
    try {
      const etapaNomeById = new Map(etapas.map(e => [e.id, e.nome]))
      const rows: TemplateItemRow[] = linhas.map(item => ({
        etapa_nome: item.etapa_id ? (etapaNomeById.get(item.etapa_id) || null) : null,
        subetapa: item.subetapa,
        tipo_composicao: item.composicao_id ? 'propria' : 'sinapi',
        composicao_id: (item.composicao_id || item.sinapi_composicao_id)!,
        quantidade: item.quantidade,
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
          Salva a estrutura atual (etapas, subetapas e composições) como modelo reutilizável em qualquer obra nova.
          {' '}{linhas.length} {linhas.length === 1 ? 'item será incluído' : 'itens serão incluídos'}.
        </p>
        <Input label="Nome do template *" value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Casa térrea 120m² — padrão médio" autoFocus />
        <Input label="Descrição (opcional)" value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Breve descrição para identificar depois" />
        <div className="flex gap-3 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" onClick={handleSave} disabled={!nome.trim() || linhas.length === 0 || saving}>
            {saving ? 'Salvando...' : 'Salvar template'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Usar template salvo ────────────────────────────────────────────────────

export function UsarTemplateOrcamentoModal({
  open, onClose, obraId, orcamentoId, onApplied,
}: {
  open: boolean
  onClose: () => void
  obraId: string
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
      const { data: etapasExistentesRaw } = await supabase.from('etapas').select('id, nome, ordem').eq('obra_id', obraId)
      const etapasExistentes = (etapasExistentesRaw || []) as { id: string; nome: string; ordem: number | null }[]
      const etapaByNome = new Map(etapasExistentes.map(e => [normalizarNome(e.nome), e]))
      let proximaOrdem = etapasExistentes.reduce((max, e) => Math.max(max, e.ordem || 0), 0) + 1

      const avisos: string[] = []
      const paraInserir: any[] = []

      for (const row of tmpl.itens) {
        let etapaId: string | null = null
        if (row.etapa_nome) {
          const chave = normalizarNome(row.etapa_nome)
          let etapa = etapaByNome.get(chave)
          if (!etapa) {
            const { data: nova } = await supabase.from('etapas')
              .insert({ obra_id: obraId, nome: row.etapa_nome, status: 'planejada', ordem: proximaOrdem++ })
              .select('id, nome, ordem').single()
            if (nova) { etapa = nova; etapaByNome.set(chave, nova) }
          }
          etapaId = etapa?.id || null
        }

        let descricao = '', codigo = '', unidade = '', preco = 0
        if (row.tipo_composicao === 'propria') {
          const { data } = await supabase.from('composicoes_proprias').select('descricao, codigo, unidade, custo_unitario').eq('id', row.composicao_id).single()
          if (!data) { avisos.push(`Composição própria "${row.composicao_id}" não existe mais — item ignorado.`); continue }
          descricao = data.descricao; codigo = data.codigo; unidade = data.unidade; preco = data.custo_unitario || 0
        } else {
          const { data } = await supabase.from('sinapi_composicoes').select('descricao, codigo, unidade, custo_unitario').eq('id', row.composicao_id).single()
          if (!data) { avisos.push(`Composição SINAPI "${row.composicao_id}" não existe mais — item ignorado.`); continue }
          descricao = data.descricao; codigo = data.codigo; unidade = data.unidade; preco = data.custo_unitario || 0
        }

        paraInserir.push({
          orcamento_id: orcamentoId,
          etapa_id: etapaId,
          subetapa: row.subetapa,
          composicao_id: row.tipo_composicao === 'propria' ? row.composicao_id : null,
          sinapi_composicao_id: row.tipo_composicao === 'sinapi' ? row.composicao_id : null,
          quantidade: row.quantidade,
          preco_unitario_snapshot: preco,
          descricao_snapshot: descricao,
          codigo_snapshot: codigo,
          unidade_snapshot: unidade,
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
                <p className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>{t.itens.length} itens</p>
              </button>
            ))}
          </div>
        )}

        {selectedId && (
          <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(245,158,11,0.1)', color: '#FBBF24' }}>
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
            <span>Os itens do template serão adicionados ao orçamento atual (preços recalculados pela base vigente). Etapas com o mesmo nome são reaproveitadas; as demais são criadas.</span>
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
