'use client'

import { useEffect, useState } from 'react'
import { FileText, Download, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { CompraItem, Obra } from '@/lib/types'
import { formatCurrency, TIPO_CUSTO_LABEL_CURTO } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { gerarRelatorioClientePdf } from '@/lib/pdf/relatorio-cliente'

function primeiroDiaMes() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}
function ultimoDiaMes() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
}
function dataBR(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR')
}

export function RelatorioCliente() {
  const supabase = createClient()
  const [obras, setObras] = useState<Obra[]>([])
  const [obraId, setObraId] = useState('')
  const [inicio, setInicio] = useState(primeiroDiaMes())
  const [fim, setFim] = useState(ultimoDiaMes())

  const [obra, setObra] = useState<Obra | null>(null)
  const [itens, setItens] = useState<CompraItem[]>([])
  const [gerado, setGerado] = useState(false)
  const [loading, setLoading] = useState(false)
  const [baixando, setBaixando] = useState(false)

  useEffect(() => {
    supabase.from('obras').select('*').order('created_at', { ascending: false }).then(({ data }: { data: Obra[] | null }) => {
      const lista = (data || []) as Obra[]
      setObras(lista)
      if (lista.length > 0 && !obraId) {
        const ativa = lista.find(o => o.status === 'ativa')
        setObraId((ativa || lista[0]).id)
      }
    })
  }, [supabase])

  async function gerar() {
    if (!obraId) return
    setLoading(true)
    const [obraRes, itensRes] = await Promise.all([
      supabase.from('obras').select('*').eq('id', obraId).single(),
      supabase.from('compra_itens')
        .select('*, etapa:etapas(*), fornecedor:fornecedores(*)')
        .eq('obra_id', obraId)
        .gte('data_compra', inicio)
        .lte('data_compra', fim)
        .order('data_compra'),
    ])
    setObra(obraRes.data as Obra)
    setItens((itensRes.data || []) as CompraItem[])
    setGerado(true)
    setLoading(false)
  }

  async function baixarPdf() {
    if (!obra) return
    setBaixando(true)
    try {
      const bytes = await gerarRelatorioClientePdf({ obra, itens, inicio, fim })
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `relatorio-cliente-${obra.nome.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${inicio}-${fim}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setBaixando(false)
    }
  }

  const total = itens.reduce((s, i) => s + (i.valor_total || 0), 0)

  return (
    <div className="flex flex-col gap-5">
      {/* Filtros */}
      <div className="card p-5 flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="sm:col-span-2">
            <Select label="Obra" value={obraId} onChange={e => { setObraId(e.target.value); setGerado(false) }}>
              {obras.length === 0 && <option value="">Nenhuma obra</option>}
              {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </Select>
          </div>
          <Input label="De" type="date" value={inicio} onChange={e => { setInicio(e.target.value); setGerado(false) }} />
          <Input label="Até" type="date" value={fim} onChange={e => { setFim(e.target.value); setGerado(false) }} />
        </div>
        <div>
          <Button icon={<Search size={14} />} loading={loading} disabled={!obraId} onClick={gerar}>
            Gerar relatório
          </Button>
        </div>
      </div>

      {!gerado ? (
        <EmptyState
          icon={FileText}
          title="Relatório do cliente"
          description="Escolha a obra e o período, gere o relatório e baixe o PDF para enviar ao cliente."
        />
      ) : !obra ? null : (
        <>
          {/* Cabeçalho do relatório */}
          <div className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  <span style={{ color: 'var(--text-secondary)' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>OBRA:</strong> {obra.nome}
                  </span>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>RESPONSÁVEL:</strong> {obra.responsavel || '—'}
                  </span>
                </div>
                <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
                  De {dataBR(inicio)} à {dataBR(fim)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Custo do período</p>
                  <p className="text-xl font-bold" style={{ color: 'var(--accent)' }}>{formatCurrency(total)}</p>
                </div>
                <Button icon={<Download size={14} />} loading={baixando} onClick={baixarPdf} disabled={itens.length === 0}>
                  Baixar PDF
                </Button>
              </div>
            </div>
          </div>

          {/* Tabela de lançamentos */}
          <div className="card p-5 overflow-x-auto">
            {itens.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhum lançamento no período selecionado.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: 'var(--text-secondary)' }}>
                    <th className="text-left py-2 font-medium">DATA</th>
                    <th className="text-left py-2 font-medium">DESCRIÇÃO</th>
                    <th className="text-left py-2 font-medium">FORNECEDOR</th>
                    <th className="text-left py-2 font-medium">VENCIMENTO</th>
                    <th className="text-left py-2 font-medium">TIPO</th>
                    <th className="text-right py-2 font-medium">VALOR</th>
                    <th className="text-left py-2 font-medium">CENTRO DE CUSTO</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map(i => (
                    <tr key={i.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td className="py-2" style={{ color: 'var(--text-secondary)' }}>{dataBR(i.data_compra)}</td>
                      <td className="py-2" style={{ color: 'var(--text-primary)' }}>{i.descricao}</td>
                      <td className="py-2" style={{ color: 'var(--text-secondary)' }}>{i.fornecedor?.nome || i.fornecedor_nome || '—'}</td>
                      <td className="py-2" style={{ color: 'var(--text-secondary)' }}>{dataBR(i.data_limite_pagamento)}</td>
                      <td className="py-2" style={{ color: 'var(--text-secondary)' }}>{i.tipo_custo ? (TIPO_CUSTO_LABEL_CURTO[i.tipo_custo] || i.tipo_custo) : '—'}</td>
                      <td className="py-2 text-right font-medium" style={{ color: 'var(--text-primary)' }}>{formatCurrency(i.valor_total)}</td>
                      <td className="py-2" style={{ color: 'var(--text-secondary)' }}>{i.etapa?.nome || 'Sem etapa'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--border)' }}>
                    <td className="py-2 font-bold" style={{ color: 'var(--text-primary)' }} colSpan={5}>TOTAL</td>
                    <td className="py-2 text-right font-bold" style={{ color: 'var(--accent)' }}>{formatCurrency(total)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
