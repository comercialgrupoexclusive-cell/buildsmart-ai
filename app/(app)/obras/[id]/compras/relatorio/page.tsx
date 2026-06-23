'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Download, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { CompraItem, Etapa, Obra } from '@/lib/types'
import { formatCurrency, formatDate, FORMA_PAGAMENTO_LABEL, STATUS_ETAPA_LABEL } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { gerarRelatorioComprasPdf } from '@/lib/pdf/relatorio-compras'

export default function RelatorioComprasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const supabase = createClient()
  const [obra, setObra] = useState<Obra | null>(null)
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [itens, setItens] = useState<CompraItem[]>([])
  const [loading, setLoading] = useState(true)
  const [gerando, setGerando] = useState(false)

  useEffect(() => { loadDados() }, [id])

  async function loadDados() {
    setLoading(true)
    const [obraRes, etapasRes, itensRes] = await Promise.all([
      supabase.from('obras').select('*').eq('id', id).single(),
      supabase.from('etapas').select('*').eq('obra_id', id).order('ordem'),
      supabase.from('compra_itens').select('*, etapa:etapas(*), fornecedor:fornecedores(*)').eq('obra_id', id).order('data_limite_pagamento', { ascending: true, nullsFirst: false }),
    ])
    setObra(obraRes.data as Obra)
    setEtapas((etapasRes.data || []) as Etapa[])
    setItens((itensRes.data || []) as CompraItem[])
    setLoading(false)
  }

  async function handleDownload() {
    if (!obra) return
    setGerando(true)
    try {
      const bytes = await gerarRelatorioComprasPdf({ obra, etapas, itens })
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `relatorio-compras-${obra.nome.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setGerando(false)
    }
  }

  const totais = {
    confirmado: itens.filter(i => i.status_valor === 'confirmado').reduce((s, i) => s + (i.valor_total || 0), 0),
    estimado: itens.filter(i => i.status_valor === 'estimado').reduce((s, i) => s + (i.valor_total || 0), 0),
  }
  const teto = totais.confirmado + totais.estimado

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  if (!obra) return null

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href={`/obras/${id}?tab=compras`} className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors">
            <ChevronLeft size={18} style={{ color: 'var(--text-secondary)' }} />
          </Link>
          <div>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Relatório de Compras e Previsões</h1>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{obra.nome}</p>
          </div>
        </div>
        <Button icon={<Download size={14} />} loading={gerando} onClick={handleDownload}>
          Baixar PDF
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card p-4">
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Confirmado</p>
          <p className="text-xl font-bold" style={{ color: 'var(--success)' }}>{formatCurrency(totais.confirmado)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Com estimativa</p>
          <p className="text-xl font-bold" style={{ color: 'var(--warning)' }}>{formatCurrency(totais.estimado)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Teto máximo</p>
          <p className="text-xl font-bold" style={{ color: 'var(--accent)' }}>{formatCurrency(teto)}</p>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <FileText size={16} style={{ color: 'var(--accent)' }} />
          <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Cronograma de atividades</h2>
        </div>
        {etapas.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhuma etapa cadastrada para esta obra.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {etapas.map(e => (
              <div key={e.id} className="flex items-center gap-3 text-sm py-1.5" style={{ borderBottom: '1px solid var(--border)' }}>
                <span className="flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{e.nome}</span>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{STATUS_ETAPA_LABEL[e.status] || e.status}</span>
                <span className="text-xs w-32 text-right" style={{ color: 'var(--text-secondary)' }}>
                  {formatDate(e.data_inicio)} – {formatDate(e.data_fim)}
                </span>
                <span className="text-xs font-semibold w-12 text-right" style={{ color: 'var(--accent)' }}>{e.percentual_executado}%</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-5 overflow-x-auto">
        <div className="flex items-center gap-2 mb-4">
          <FileText size={16} style={{ color: 'var(--accent)' }} />
          <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Itens de compra ({itens.length})</h2>
        </div>
        {itens.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhum item de compra cadastrado.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: 'var(--text-secondary)' }}>
                <th className="text-left py-2 font-medium">Item</th>
                <th className="text-left py-2 font-medium">Fornecedor</th>
                <th className="text-right py-2 font-medium">Valor</th>
                <th className="text-left py-2 font-medium">Data pagto.</th>
                <th className="text-left py-2 font-medium">Forma</th>
              </tr>
            </thead>
            <tbody>
              {itens.map(item => (
                <tr key={item.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td className="py-2" style={{ color: 'var(--text-primary)' }}>{item.descricao}</td>
                  <td className="py-2" style={{ color: 'var(--text-secondary)' }}>{item.fornecedor?.nome || item.fornecedor_nome || '—'}</td>
                  <td className="py-2 text-right font-medium" style={{ color: 'var(--text-primary)' }}>{formatCurrency(item.valor_total)}</td>
                  <td className="py-2" style={{ color: 'var(--text-secondary)' }}>{formatDate(item.data_limite_pagamento)}</td>
                  <td className="py-2" style={{ color: 'var(--text-secondary)' }}>{item.forma_pagamento ? (FORMA_PAGAMENTO_LABEL[item.forma_pagamento] || item.forma_pagamento) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-center" style={{ color: 'var(--text-secondary)' }}>
        O PDF gerado inclui ainda cronograma visual (Gantt), distribuição de investimento por etapa, fluxo de caixa, ranking de fornecedores e cronograma diário de pagamentos.
      </p>
    </div>
  )
}
