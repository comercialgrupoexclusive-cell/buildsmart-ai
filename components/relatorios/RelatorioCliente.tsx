'use client'

import { useEffect, useMemo, useState } from 'react'
import { FileText, Download, Search, BarChart3, CalendarDays, Package, ShoppingCart, type LucideIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { CompraItem, Etapa, Material, Obra, ServicoCronograma, SubetapaCronograma } from '@/lib/types'
import { formatCurrency, STATUS_ETAPA_LABEL, TIPO_CUSTO_LABEL_CURTO } from '@/lib/utils'
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

type ListaCompraResumo = {
  id: string
  nome: string
  status: 'aberta' | 'enviada' | 'concluida'
  itens: { id: string; descricao: string; quantidade: number; unidade: string }[]
  criado_em: string
}

type OrcamentoResumo = {
  bdi_percentual: number
  orcamento_itens: { quantidade: number; preco_unitario_snapshot: number }[]
}

const STATUS_COMPRA_LABEL: Record<Material['status_compra'], string> = {
  nao_comprado: 'Não comprado',
  solicitado: 'Em lista',
  parcial: 'Parcial',
  comprado: 'Comprado',
}

function statusServico(svc: ServicoCronograma): Etapa['status'] {
  if ((svc.percentual_executado ?? 0) >= 100) return 'concluida'
  if ((svc.percentual_executado ?? 0) > 0) return 'em_andamento'
  return 'planejada'
}

export function RelatorioCliente() {
  const supabase = createClient()
  const [obras, setObras] = useState<Obra[]>([])
  const [obraId, setObraId] = useState('')
  const [inicio, setInicio] = useState(primeiroDiaMes())
  const [fim, setFim] = useState(ultimoDiaMes())

  const [obra, setObra] = useState<Obra | null>(null)
  const [itens, setItens] = useState<CompraItem[]>([])
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [subetapas, setSubetapas] = useState<SubetapaCronograma[]>([])
  const [servicos, setServicos] = useState<ServicoCronograma[]>([])
  const [materiais, setMateriais] = useState<Material[]>([])
  const [listas, setListas] = useState<ListaCompraResumo[]>([])
  const [orcamentoTotal, setOrcamentoTotal] = useState(0)
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
    const [obraRes, itensRes, etapasRes, materiaisRes, listasRes, orcRes] = await Promise.all([
      supabase.from('obras').select('*').eq('id', obraId).single(),
      supabase.from('compra_itens')
        .select('*, etapa:etapas(*), fornecedor:fornecedores(*)')
        .eq('obra_id', obraId)
        .gte('data_compra', inicio)
        .lte('data_compra', fim)
        .order('data_compra'),
      supabase.from('etapas').select('*').eq('obra_id', obraId).order('ordem'),
      supabase.from('materiais').select('*, etapa:etapas(*)').eq('obra_id', obraId),
      supabase.from('listas_compra').select('*').eq('obra_id', obraId).order('criado_em', { ascending: false }),
      supabase.from('orcamentos')
        .select('bdi_percentual, orcamento_itens(quantidade, preco_unitario_snapshot)')
        .eq('obra_id', obraId)
        .order('versao', { ascending: false })
        .limit(1),
    ])
    const etapasData = (etapasRes.data || []) as Etapa[]
    const etapaIds = etapasData.map(e => e.id)
    let subsData: SubetapaCronograma[] = []
    let svcsData: ServicoCronograma[] = []
    if (etapaIds.length > 0) {
      const { data: subs } = await supabase
        .from('subetapas_cronograma')
        .select('*')
        .in('etapa_id', etapaIds)
        .order('ordem')
      subsData = (subs || []) as SubetapaCronograma[]
      const subIds = subsData.map(s => s.id)
      if (subIds.length > 0) {
        const { data: svcs } = await supabase
          .from('servicos_cronograma')
          .select('*')
          .in('subetapa_id', subIds)
          .order('ordem')
        svcsData = (svcs || []) as ServicoCronograma[]
      }
    }
    const orcamentoAtual = ((orcRes.data || []) as OrcamentoResumo[])[0]
    const subtotal = (orcamentoAtual?.orcamento_itens || []).reduce((sum, item) => (
      sum + (item.quantidade || 0) * (item.preco_unitario_snapshot || 0)
    ), 0)
    const bdi = orcamentoAtual?.bdi_percentual ?? 0
    setObra(obraRes.data as Obra)
    setItens((itensRes.data || []) as CompraItem[])
    setEtapas(etapasData)
    setSubetapas(subsData)
    setServicos(svcsData)
    setMateriais((materiaisRes.data || []) as Material[])
    setListas((listasRes.data || []) as ListaCompraResumo[])
    setOrcamentoTotal(subtotal * (1 + bdi / 100))
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
  const resumo = useMemo(() => {
    const cronogramaItens = [
      ...etapas,
      ...subetapas,
      ...servicos.map(svc => ({ ...svc, status: statusServico(svc) })),
    ] as Array<{ status: Etapa['status']; percentual_executado: number }>
    const execucaoMedia = cronogramaItens.length
      ? Math.round(cronogramaItens.reduce((sum, item) => sum + (item.percentual_executado || 0), 0) / cronogramaItens.length)
      : 0
    const statusCronograma = cronogramaItens.reduce<Record<Etapa['status'], number>>((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1
      return acc
    }, { planejada: 0, em_andamento: 0, atrasada: 0, concluida: 0 })
    const statusMateriais = materiais.reduce<Record<Material['status_compra'], number>>((acc, item) => {
      acc[item.status_compra] = (acc[item.status_compra] || 0) + 1
      return acc
    }, { nao_comprado: 0, solicitado: 0, parcial: 0, comprado: 0 })
    const proximasEtapas = etapas
      .filter(etapa => etapa.status !== 'concluida')
      .sort((a, b) => (a.data_inicio || '9999-12-31').localeCompare(b.data_inicio || '9999-12-31'))
      .slice(0, 6)
    return { execucaoMedia, statusCronograma, statusMateriais, proximasEtapas }
  }, [etapas, subetapas, servicos, materiais])

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
                  Baixar PDF financeiro
                </Button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <ResumoCard icon={BarChart3} label="Orçamento da obra" value={formatCurrency(orcamentoTotal)} hint="Valor atual com BDI" />
            <ResumoCard icon={CalendarDays} label="Execução média" value={`${resumo.execucaoMedia}%`} hint={`${resumo.statusCronograma.concluida} concluídos · ${resumo.statusCronograma.em_andamento} em andamento`} />
            <ResumoCard icon={Package} label="Materiais pendentes" value={String(resumo.statusMateriais.nao_comprado + resumo.statusMateriais.solicitado + resumo.statusMateriais.parcial)} hint={`${resumo.statusMateriais.comprado} comprados`} />
            <ResumoCard icon={ShoppingCart} label="Listas de compra" value={String(listas.length)} hint={`${listas.filter(l => l.status !== 'concluida').length} em aberto`} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="card p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Cronograma para cliente</h3>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Foco nas etapas ainda não concluídas.</p>
                </div>
                <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'rgba(59,123,248,0.12)', color: 'var(--accent)' }}>
                  {resumo.statusCronograma.atrasada} atenção
                </span>
              </div>
              {resumo.proximasEtapas.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Todas as etapas estão concluídas.</p>
              ) : (
                <div className="flex flex-col">
                  {resumo.proximasEtapas.map(etapa => (
                    <div key={etapa.id} className="py-3 border-t first:border-t-0" style={{ borderColor: 'var(--border)' }}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>{etapa.nome}</p>
                          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{dataBR(etapa.data_inicio)} até {dataBR(etapa.data_fim)}</p>
                        </div>
                        <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{STATUS_ETAPA_LABEL[etapa.status]}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                          <div className="h-full rounded-full" style={{ width: `${etapa.percentual_executado || 0}%`, background: etapa.status === 'atrasada' ? '#F59E0B' : 'var(--accent)' }} />
                        </div>
                        <span className="text-xs font-medium w-10 text-right" style={{ color: 'var(--text-primary)' }}>{etapa.percentual_executado || 0}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Materiais e compras</h3>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Situação das compras ligadas ao orçamento.</p>
                </div>
                <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'rgba(16,185,129,0.12)', color: 'var(--success)' }}>
                  {formatCurrency(total)} no período
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {Object.entries(resumo.statusMateriais).map(([status, count]) => (
                  <div key={status} className="rounded-lg border px-3 py-2" style={{ borderColor: 'var(--border)' }}>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{STATUS_COMPRA_LABEL[status as Material['status_compra']]}</p>
                    <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{count}</p>
                  </div>
                ))}
              </div>
              {listas.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhuma lista de compra criada para esta obra.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {listas.slice(0, 5).map(lista => (
                    <div key={lista.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2" style={{ borderColor: 'var(--border)' }}>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{lista.nome}</p>
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{lista.itens?.length || 0} itens · {dataBR(lista.criado_em?.slice(0, 10) || null)}</p>
                      </div>
                      <span className="text-xs capitalize" style={{ color: lista.status === 'concluida' ? 'var(--success)' : 'var(--accent)' }}>{lista.status}</span>
                    </div>
                  ))}
                </div>
              )}
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

function ResumoCard({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: string; hint: string }) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(59,123,248,0.12)', color: 'var(--accent)' }}>
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</p>
        <p className="text-lg font-bold truncate" style={{ color: 'var(--text-primary)' }}>{value}</p>
        <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{hint}</p>
      </div>
    </div>
  )
}
