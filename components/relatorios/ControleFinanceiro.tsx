'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import Link from 'next/link'
import { Wallet, TrendingDown, TrendingUp, Percent } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { createClient } from '@/lib/supabase/client'
import { CompraItem, Etapa, EtapaCaixa, Obra } from '@/lib/types'
import { formatCurrency, formatPercent, TIPO_CUSTO_LABEL_CURTO, TIPO_CUSTO_COLOR } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import { Select } from '@/components/ui/Input'
import { CaixaRealTable } from '@/components/relatorios/CaixaRealTable'

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function mesLabel(iso: string) {
  // iso = 'YYYY-MM'
  const [ano, mes] = iso.split('-')
  return `${MESES[parseInt(mes, 10) - 1] || mes}/${ano.slice(2)}`
}

export function ControleFinanceiro() {
  const supabase = createClient()
  const [obras, setObras] = useState<Obra[]>([])
  const [obraId, setObraId] = useState<string>('')
  const [obra, setObra] = useState<Obra | null>(null)
  const [itens, setItens] = useState<CompraItem[]>([])
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [caixas, setCaixas] = useState<EtapaCaixa[]>([])
  const [totalOrcado, setTotalOrcado] = useState(0)
  const [loading, setLoading] = useState(false)

  // Lista de obras (default: primeira ativa, senão a primeira).
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

  const loadDados = useCallback(async (id: string) => {
    setLoading(true)
    const [obraRes, itensRes, etapasRes, orcRes, caixaRes] = await Promise.all([
      supabase.from('obras').select('*').eq('id', id).single(),
      supabase.from('compra_itens').select('*, fornecedor:fornecedores(nome)').eq('obra_id', id),
      supabase.from('etapas').select('*').eq('obra_id', id).order('ordem'),
      supabase.from('orcamentos')
        .select('bdi_percentual, orcamento_itens(quantidade, preco_unitario_snapshot)')
        .eq('obra_id', id).order('versao', { ascending: false }).limit(1),
      supabase.from('etapa_caixa').select('*').eq('obra_id', id),
    ])
    setObra(obraRes.data as Obra)
    setItens((itensRes.data || []) as CompraItem[])
    setEtapas((etapasRes.data || []) as Etapa[])
    setCaixas((caixaRes.data || []) as EtapaCaixa[])

    const orc = (orcRes.data || [])[0] as any
    const bdi = orc?.bdi_percentual ?? 25
    const orcItens = orc?.orcamento_itens || []
    const subtotal = orcItens.reduce((a: number, i: any) => a + i.quantidade * i.preco_unitario_snapshot, 0)
    setTotalOrcado(subtotal * (1 + bdi / 100))
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    if (obraId) loadDados(obraId)
  }, [obraId, loadDados])

  // ─── Agregações ──────────────────────────────────────────────────────────
  const custoAtual = useMemo(() => itens.reduce((s, i) => s + (i.valor_total || 0), 0), [itens])
  const confirmado = useMemo(() => itens.filter(i => i.status_valor === 'confirmado').reduce((s, i) => s + (i.valor_total || 0), 0), [itens])
  const estimado = custoAtual - confirmado

  const valorObra = (obra?.valor_contrato ?? 0) > 0 ? obra!.valor_contrato! : totalOrcado
  const origemValor = (obra?.valor_contrato ?? 0) > 0 ? 'valor de contrato' : 'estimado pelo orçamento'
  const saldo = valorObra - custoAtual
  const pctCusto = valorObra > 0 ? (custoAtual / valorObra) * 100 : 0

  const nomeEtapaPorId = useMemo(() => new Map(etapas.map(e => [e.id, e.nome])), [etapas])

  const porCentroCusto = useMemo(() => {
    const m = new Map<string, number>()
    itens.forEach(i => {
      const nome = i.etapa_id ? (nomeEtapaPorId.get(i.etapa_id) || 'Sem etapa') : 'Sem etapa'
      m.set(nome, (m.get(nome) || 0) + (i.valor_total || 0))
    })
    return Array.from(m.entries()).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor)
  }, [itens, nomeEtapaPorId])

  const porTipo = useMemo(() => {
    const m = new Map<string, number>()
    itens.forEach(i => {
      const chave = i.tipo_custo || 'nao_classificado'
      m.set(chave, (m.get(chave) || 0) + (i.valor_total || 0))
    })
    return Array.from(m.entries()).map(([chave, valor]) => ({
      chave,
      nome: chave === 'nao_classificado' ? 'Não classificado' : (TIPO_CUSTO_LABEL_CURTO[chave] || chave),
      cor: chave === 'nao_classificado' ? '#94A3B8' : (TIPO_CUSTO_COLOR[chave] || '#64748B'),
      valor,
    })).sort((a, b) => b.valor - a.valor)
  }, [itens])

  const porMes = useMemo(() => {
    const m = new Map<string, number>()
    itens.forEach(i => {
      const base = (i.data_compra || i.created_at || '').slice(0, 7)
      if (!base) return
      m.set(base, (m.get(base) || 0) + (i.valor_total || 0))
    })
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([iso, valor]) => ({ mes: mesLabel(iso), valor }))
  }, [itens])

  const porFornecedor = useMemo(() => {
    const m = new Map<string, number>()
    itens.forEach(i => {
      const nome = i.fornecedor?.nome || i.fornecedor_nome || 'Não definido'
      m.set(nome, (m.get(nome) || 0) + (i.valor_total || 0))
    })
    return Array.from(m.entries()).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor).slice(0, 8)
  }, [itens])

  const pctColor = pctCusto > 100 ? 'var(--danger)' : pctCusto >= 80 ? 'var(--warning)' : 'var(--success)'

  return (
    <div className="flex flex-col gap-5">
      {/* Seletor de obra */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="w-full sm:w-80">
          <Select label="Obra" value={obraId} onChange={e => setObraId(e.target.value)}>
            {obras.length === 0 && <option value="">Nenhuma obra</option>}
            {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : !obra ? (
        <EmptyState icon={Wallet} title="Selecione uma obra" description="Escolha uma obra para ver o controle financeiro." />
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              icon={Wallet} color="var(--accent)"
              label="Valor da Obra" value={formatCurrency(valorObra)} sub={origemValor}
            />
            <KpiCard
              icon={TrendingUp} color="var(--warning)"
              label="Custo Atual" value={formatCurrency(custoAtual)}
              sub={`${formatCurrency(confirmado)} confirmado · ${formatCurrency(estimado)} estimado`}
            />
            <KpiCard
              icon={TrendingDown} color={saldo >= 0 ? 'var(--success)' : 'var(--danger)'}
              label="Saldo" value={formatCurrency(saldo)} sub={saldo >= 0 ? 'dentro do previsto' : 'acima do valor da obra'}
            />
            <KpiCard
              icon={Percent} color={pctColor}
              label="% de Custo" value={formatPercent(pctCusto)} sub="do valor da obra consumido"
            />
          </div>

          {valorObra === 0 && (
            <div className="card p-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
              Esta obra não tem <strong>valor de contrato</strong> nem orçamento com itens.{' '}
              <Link href={`/obras/${obra.id}`} className="font-medium" style={{ color: 'var(--accent)' }}>
                Defina o valor da obra
              </Link>{' '}para ver saldo e % de custo.
            </div>
          )}

          {/* Gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Custo por centro de custo">
              {porCentroCusto.length === 0 ? <SemDados /> : (
                <ResponsiveContainer width="100%" height={Math.max(180, porCentroCusto.length * 34)}>
                  <BarChart data={porCentroCusto} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} tickFormatter={v => formatCurrency(v)} />
                    <YAxis type="category" dataKey="nome" width={120} tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} />
                    <Tooltip formatter={(v) => [formatCurrency(Number(v)), ""]} />
                    <Bar dataKey="valor" fill="var(--accent)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Custo por tipo">
              {porTipo.length === 0 ? <SemDados /> : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={porTipo} dataKey="valor" nameKey="nome" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2}>
                      {porTipo.map(t => <Cell key={t.chave} fill={t.cor} />)}
                    </Pie>
                    <Tooltip formatter={(v) => [formatCurrency(Number(v)), ""]} />
                    <Legend
                      formatter={(_value, _entry, i) => {
                        const t = porTipo[i as number]
                        const pct = custoAtual > 0 ? (t.valor / custoAtual) * 100 : 0
                        return `${t.nome} — ${pct.toFixed(0)}%`
                      }}
                      wrapperStyle={{ fontSize: 11 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Custo por mês">
              {porMes.length === 0 ? <SemDados /> : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={porMes} margin={{ left: 8, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="mes" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} tickFormatter={v => formatCurrency(v)} width={70} />
                    <Tooltip formatter={(v) => [formatCurrency(Number(v)), ""]} />
                    <Bar dataKey="valor" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Custo por fornecedor (top 8)">
              {porFornecedor.length === 0 ? <SemDados /> : (
                <ResponsiveContainer width="100%" height={Math.max(180, porFornecedor.length * 34)}>
                  <BarChart data={porFornecedor} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} tickFormatter={v => formatCurrency(v)} />
                    <YAxis type="category" dataKey="nome" width={120} tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} />
                    <Tooltip formatter={(v) => [formatCurrency(Number(v)), ""]} />
                    <Bar dataKey="valor" fill="#06B6D4" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          {/* Caixa x Real */}
          <CaixaRealTable
            obraId={obra.id}
            etapas={etapas}
            itens={itens}
            caixas={caixas}
            valorObra={valorObra}
            onCaixaChange={setCaixas}
          />
        </>
      )}
    </div>
  )
}

function KpiCard({ icon: Icon, color, label, value, sub }: {
  icon: typeof Wallet; color: string; label: string; value: string; sub: string
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}20` }}>
          <Icon size={18} style={{ color }} />
        </div>
        <span className="text-xs font-medium leading-tight" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      </div>
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
      <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{sub}</p>
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>{title}</h3>
      {children}
    </div>
  )
}

function SemDados() {
  return (
    <div className="flex items-center justify-center h-40 text-sm" style={{ color: 'var(--text-secondary)' }}>
      Sem lançamentos para exibir.
    </div>
  )
}
