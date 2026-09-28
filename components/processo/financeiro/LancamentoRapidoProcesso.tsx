'use client'

// Seção 11 canônica: LANÇAMENTO RÁPIDO — form enxuto para registrar uma
// receita/despesa no contexto de um Processo sem atravessar formulário longo.
// Grava em compra_itens com processo_id e orcamento_id preenchidos.
// Fornecedor segue o cadastro no ponto de uso (seção 4): escolhe um cadastrado
// ou digita manualmente — mesmo padrão de ComprasLancamentos.

import { useEffect, useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Fornecedor } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { TIPO_CUSTO_LABEL } from '@/lib/utils'

const TIPOS_CUSTO = Object.entries(TIPO_CUSTO_LABEL) as [string, string][]
const hoje = () => new Date().toISOString().slice(0, 10)

type Props = {
  processoId: string
  orcamentoId: string
  onSalvo?: () => void
}

export function LancamentoRapidoProcesso({ processoId, orcamentoId, onSalvo }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [aberto, setAberto] = useState(false)
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [data, setData] = useState(hoje())
  const [tipoCusto, setTipoCusto] = useState('')
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [fornecedorId, setFornecedorId] = useState('')
  const [fornecedorNome, setFornecedorNome] = useState('')
  const [fornecedorManual, setFornecedorManual] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let cancelado = false
    // Fornecedores da organização (obra_id nulo = compartilhados). RLS isola por org.
    supabase.from('fornecedores').select('*').is('obra_id', null).order('nome').then(({ data }: { data: Fornecedor[] | null }) => {
      if (!cancelado) setFornecedores(data ?? [])
    })
    return () => { cancelado = true }
  }, [supabase])

  function abrir() {
    setDescricao('')
    setValor('')
    setData(hoje())
    setTipoCusto('')
    setFornecedorId('')
    setFornecedorNome('')
    setFornecedorManual(false)
    setErro('')
    setAberto(true)
  }

  async function salvar() {
    const valorNum = parseFloat(valor.replace(',', '.'))
    if (!descricao.trim()) { setErro('Informe uma descrição.'); return }
    if (isNaN(valorNum) || valorNum <= 0) { setErro('Informe um valor válido.'); return }
    setErro('')
    setSalvando(true)
    try {
      const { error } = await supabase.from('compra_itens').insert({
        processo_id: processoId,
        orcamento_id: orcamentoId,
        descricao: descricao.trim(),
        valor_total: valorNum,
        data_compra: data || hoje(),
        tipo_custo: tipoCusto || null,
        fornecedor_id: fornecedorManual ? null : (fornecedorId || null),
        fornecedor_nome: fornecedorManual ? (fornecedorNome.trim() || null) : null,
        status_valor: 'confirmado',
        status_pagamento: 'pendente',
      })
      if (error) throw error
      setAberto(false)
      onSalvo?.()
    } catch {
      setErro('Não foi possível salvar o lançamento.')
    } finally {
      setSalvando(false)
    }
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={abrir}
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition"
        style={{ background: 'var(--accent)', color: 'white' }}
      >
        <Plus size={15} />
        Lançar
      </button>
    )
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Lançamento rápido</p>
        <button type="button" onClick={() => setAberto(false)} style={{ color: 'var(--text-secondary)' }}><X size={16} /></button>
      </div>

      <Input label="Descrição" value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Ex: Cimento, Mão de obra…" />

      <div className="grid grid-cols-2 gap-3">
        <Input label="Valor (R$)" value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00" inputMode="decimal" />
        <Input label="Data" type="date" value={data} onChange={e => setData(e.target.value)} />
      </div>

      <Select label="Tipo de custo" value={tipoCusto} onChange={e => setTipoCusto(e.target.value)}>
        <option value="">Não classificado</option>
        {TIPOS_CUSTO.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </Select>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Fornecedor</label>
          <button
            type="button"
            onClick={() => setFornecedorManual(v => !v)}
            className="text-xs"
            style={{ color: 'var(--accent)' }}
          >
            {fornecedorManual ? 'Selecionar cadastrado' : 'Digitar manualmente'}
          </button>
        </div>
        {fornecedorManual ? (
          <Input value={fornecedorNome} onChange={e => setFornecedorNome(e.target.value)} placeholder="Nome do fornecedor" />
        ) : (
          <Select value={fornecedorId} onChange={e => setFornecedorId(e.target.value)}>
            <option value="">Sem fornecedor definido</option>
            {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </Select>
        )}
      </div>

      {erro && <p className="text-xs" style={{ color: '#f87171' }}>{erro}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setAberto(false)} disabled={salvando}>Cancelar</Button>
        <Button onClick={() => void salvar()} loading={salvando}>Salvar lançamento</Button>
      </div>
    </div>
  )
}
