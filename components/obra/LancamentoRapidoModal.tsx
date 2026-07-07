'use client'

import { useEffect, useState, useCallback } from 'react'
import { Zap } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { TIPO_CUSTO_LABEL } from '@/lib/utils'
import { CompraItem, Etapa, Fornecedor, TipoCusto } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input, Select } from '@/components/ui/Input'

type ObraOption = { id: string; nome: string }

const hoje = () => new Date().toISOString().slice(0, 10)

function formInicial() {
  return {
    valor_total: '',
    etapa_id: '',
    tipo_custo: '' as TipoCusto | '',
    fornecedor_id: '',
    fornecedor_nome: '',
    data_compra: hoje(),
    vencimento: '',
    descricao: '',
  }
}

/**
 * Lançamento rápido de nota — modal enxuto para registrar uma compra em poucos
 * campos (valor total + centro de custo + tipo + fornecedor). Grava em
 * `compra_itens` com status_valor = 'confirmado' (nota real).
 *
 * - Com `obraId`: usado dentro da obra (aba Compras). Carrega etapas/fornecedores da obra.
 * - Sem `obraId` (null): modo global (atalho do dashboard). O primeiro campo é o
 *   seletor de obra; ao escolher, carrega etapas/fornecedores dela.
 */
export function LancamentoRapidoModal({
  open,
  onClose,
  obraId = null,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  obraId?: string | null
  onSaved?: (item: CompraItem) => void
}) {
  const supabase = createClient()
  const modoGlobal = !obraId

  const [obras, setObras] = useState<ObraOption[]>([])
  const [obraSelecionada, setObraSelecionada] = useState<string>(obraId || '')
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [fornecedorManual, setFornecedorManual] = useState(false)
  const [form, setForm] = useState(formInicial)
  const [saving, setSaving] = useState(false)

  const obraAtiva = obraId || obraSelecionada

  // Carrega a lista de obras uma vez, apenas no modo global.
  useEffect(() => {
    if (!open || !modoGlobal) return
    supabase
      .from('obras')
      .select('id,nome,status')
      .neq('status', 'concluida')
      .order('nome')
      .then(({ data }: { data: ObraOption[] | null }) => setObras((data || []) as ObraOption[]))
  }, [open, modoGlobal, supabase])

  // Carrega etapas + fornecedores da obra ativa.
  const carregarObra = useCallback(
    async (id: string) => {
      const [etapasRes, fornecedoresRes] = await Promise.all([
        supabase.from('etapas').select('*').eq('obra_id', id).order('ordem'),
        supabase.from('fornecedores').select('*').or(`obra_id.is.null,obra_id.eq.${id}`).order('nome'),
      ])
      setEtapas((etapasRes.data || []) as Etapa[])
      setFornecedores((fornecedoresRes.data || []) as Fornecedor[])
    },
    [supabase]
  )

  useEffect(() => {
    if (!open || !obraAtiva) return
    carregarObra(obraAtiva)
  }, [open, obraAtiva, carregarObra])

  // Reseta o estado ao reabrir.
  useEffect(() => {
    if (open) {
      setForm(formInicial())
      setFornecedorManual(false)
      setObraSelecionada(obraId || '')
    }
  }, [open, obraId])

  function fechar() {
    onClose()
  }

  async function salvar(continuar: boolean) {
    if (!obraAtiva || !form.valor_total) return
    setSaving(true)
    const nomeFornecedor = fornecedorManual
      ? form.fornecedor_nome.trim()
      : fornecedores.find(f => f.id === form.fornecedor_id)?.nome
    const payload = {
      obra_id: obraAtiva,
      etapa_id: form.etapa_id || null,
      descricao: form.descricao.trim() || `Nota — ${nomeFornecedor || 'lançamento rápido'}`,
      fornecedor_id: fornecedorManual ? null : form.fornecedor_id || null,
      fornecedor_nome: fornecedorManual ? form.fornecedor_nome.trim() || null : null,
      valor_total: parseFloat(String(form.valor_total).replace(',', '.')),
      tipo_custo: form.tipo_custo || null,
      data_compra: form.data_compra || hoje(),
      data_limite_pagamento: form.vencimento || null,
      status_valor: 'confirmado' as const,
      updated_at: new Date().toISOString(),
    }
    const { data, error } = await supabase
      .from('compra_itens')
      .insert(payload)
      .select('*, etapa:etapas(*), fornecedor:fornecedores(*)')
      .single()
    setSaving(false)
    if (error) {
      alert(`Não foi possível salvar o lançamento.\n\nErro: ${error.message}`)
      return
    }
    if (data && onSaved) onSaved(data as CompraItem)

    if (continuar) {
      // Mantém obra/etapa/tipo/fornecedor; limpa valor e descrição para a próxima nota.
      setForm(f => ({ ...f, valor_total: '', descricao: '', vencimento: '' }))
    } else {
      fechar()
    }
  }

  const podeSalvar = !!obraAtiva && !!form.valor_total && !saving

  return (
    <Modal open={open} onClose={fechar} title="Lançamento rápido" size="md">
      <div className="flex flex-col gap-4">
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Registre uma nota em poucos campos: valor total, centro de custo (etapa) e tipo. O detalhamento
          por item pode ser feito depois na aba Compras.
        </p>

        {modoGlobal && (
          <Select
            label="Obra *"
            value={obraSelecionada}
            onChange={e => {
              setObraSelecionada(e.target.value)
              setForm(f => ({ ...f, etapa_id: '', fornecedor_id: '' }))
            }}
          >
            <option value="">Selecione a obra…</option>
            {obras.map(o => (
              <option key={o.id} value={o.id}>{o.nome}</option>
            ))}
          </Select>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Valor total da nota (R$) *"
            type="number"
            min="0"
            step="0.01"
            value={form.valor_total}
            onChange={e => setForm(f => ({ ...f, valor_total: e.target.value }))}
            placeholder="0,00"
            autoFocus={!modoGlobal}
          />
          <Input
            label="Data da compra"
            type="date"
            value={form.data_compra}
            onChange={e => setForm(f => ({ ...f, data_compra: e.target.value }))}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Centro de custo (etapa)"
            value={form.etapa_id}
            onChange={e => setForm(f => ({ ...f, etapa_id: e.target.value }))}
            disabled={!obraAtiva}
          >
            <option value="">Sem etapa</option>
            {etapas.map(e => (
              <option key={e.id} value={e.id}>{e.nome}</option>
            ))}
          </Select>
          <Select
            label="Tipo de custo"
            value={form.tipo_custo}
            onChange={e => setForm(f => ({ ...f, tipo_custo: e.target.value as TipoCusto }))}
          >
            <option value="">Não classificado</option>
            {Object.entries(TIPO_CUSTO_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Fornecedor</label>
            <button
              type="button"
              onClick={() => setFornecedorManual(v => !v)}
              className="text-xs font-medium"
              style={{ color: 'var(--accent)' }}
            >
              {fornecedorManual ? 'Selecionar cadastrado' : 'Digitar manualmente'}
            </button>
          </div>
          {fornecedorManual ? (
            <Input
              value={form.fornecedor_nome}
              onChange={e => setForm(f => ({ ...f, fornecedor_nome: e.target.value }))}
              placeholder="Nome do fornecedor"
            />
          ) : (
            <select
              value={form.fornecedor_id}
              onChange={e => setForm(f => ({ ...f, fornecedor_id: e.target.value }))}
              className="input-base"
              disabled={!obraAtiva}
            >
              <option value="">Sem fornecedor definido</option>
              {fornecedores.map(f => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </select>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Vencimento"
            type="date"
            value={form.vencimento}
            onChange={e => setForm(f => ({ ...f, vencimento: e.target.value }))}
          />
          <Input
            label="Descrição (opcional)"
            value={form.descricao}
            onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
            placeholder="Ex: Aço infraestrutura"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button variant="secondary" className="flex-1" onClick={fechar}>
            Fechar
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            disabled={!podeSalvar}
            onClick={() => salvar(true)}
          >
            Salvar e lançar outro
          </Button>
          <Button
            className="flex-1"
            icon={<Zap size={14} />}
            loading={saving}
            disabled={!podeSalvar}
            onClick={() => salvar(false)}
          >
            Salvar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
