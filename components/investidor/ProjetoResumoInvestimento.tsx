'use client'

// Aba "Investimento" do Project quando contexto='investimento' (Laboratório
// Investidor, Rodada 4 — Marco 4: Ativos). Mostra o vínculo com a
// Prospecção de origem e o resultado do cenário principal — leitura, sem
// nenhuma lógica de cálculo própria (reaproveita os mesmos números já
// persistidos em prospeccao_cenarios pelo motor do Marco 3). Financeiro
// real (comprometido/pago) e Comercialização ficam para marcos futuros —
// aqui é só o "previsto" herdado da Prospecção.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowUpRight, Landmark, TrendingUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/profile-context'
import { EmptyState } from '@/components/ui/EmptyState'
import { Select } from '@/components/ui/Input'
import { formatCurrency } from '@/lib/utils'
import { getProspeccaoVenda } from '@/lib/investidor-venda'
import { resultadoCenarioValido } from '@/lib/investidor-calculadora'
import type { Prospeccao, ProspeccaoCenario } from '@/lib/types'

// Núcleo N06.3 — fase operacional do ciclo de investimento (spec V0 do
// Laboratório Investidor), independente do fase_ciclo genérico
// (projeto/em_obra/entregue) usado no cabeçalho do Project. Ver migração
// projetos_fase_investimento.sql e RPC mudar_fase_investimento (grava
// Audit em portal_audit_log).
const FASE_INVESTIMENTO_LABEL: Record<string, string> = {
  aquisicao_concluida: 'Aquisição concluída',
  regularizacao_posse: 'Regularização/Posse',
  reforma: 'Reforma',
  pronto_para_venda: 'Pronto para venda',
  a_venda: 'À venda',
  negociacao: 'Negociação',
  vendido: 'Vendido',
  encerrado: 'Encerrado',
}
const FASE_INVESTIMENTO_ORDEM = Object.keys(FASE_INVESTIMENTO_LABEL)

function FaseAtivoCard({ projetoId, faseInvestimento, onChanged }: {
  projetoId: string; faseInvestimento: string | null; onChanged?: () => void
}) {
  const { currentProfile } = useProfile()
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function mudarFase(novaFase: string) {
    if (!novaFase || novaFase === faseInvestimento) return
    setSalvando(true)
    setErro(null)
    const supabase = createClient()
    const { error } = await supabase.rpc('mudar_fase_investimento', {
      p_projeto_id: projetoId,
      p_fase_investimento: novaFase,
      p_profile_id: currentProfile?.id ?? null,
    })
    setSalvando(false)
    if (error) { setErro(error.message); return }
    onChanged?.()
  }

  return (
    <div className="card p-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Fase do Ativo</p>
        {erro && <p className="text-xs mt-0.5" style={{ color: 'var(--danger)' }}>{erro}</p>}
      </div>
      <Select
        value={faseInvestimento ?? ''}
        onChange={e => void mudarFase(e.target.value)}
        disabled={salvando}
        className="w-auto min-w-[190px] py-1.5 text-sm flex-shrink-0"
      >
        <option value="" disabled>— Não definida —</option>
        {FASE_INVESTIMENTO_ORDEM.map(v => <option key={v} value={v}>{FASE_INVESTIMENTO_LABEL[v]}</option>)}
      </Select>
    </div>
  )
}

export function ProjetoResumoInvestimento({ projetoId, faseInvestimento, onFaseChanged }: {
  projetoId: string; faseInvestimento?: string | null; onFaseChanged?: () => void
}) {
  const [prospeccao, setProspeccao] = useState<Prospeccao | null>(null)
  const [principal, setPrincipal] = useState<ProspeccaoCenario | null>(null)
  const [vendaPrincipal, setVendaPrincipal] = useState<ProspeccaoCenario | null>(null)
  const [vendaFaixaBase, setVendaFaixaBase] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const supabase = createClient()
    const { data: p } = await supabase.from('prospeccoes').select('*').eq('project_id', projetoId).eq('is_venda', false).maybeSingle()
    if (p) {
      const { data: c } = await supabase.from('prospeccao_cenarios').select('*').eq('prospeccao_id', p.id).eq('principal', true).maybeSingle()
      setPrincipal((c as ProspeccaoCenario | null) ?? null)
    }
    setProspeccao((p as Prospeccao | null) ?? null)

    // Lado da venda: só LÊ a prospecção-sombra (não cria) — ver
    // lib/investidor-venda.ts. Se o usuário nunca abriu as abas Pesquisa de
    // mercado/Viabilidade do Imóvel, ela simplesmente ainda não existe.
    const venda = await getProspeccaoVenda(supabase, projetoId)
    if (venda) {
      const [{ data: cVenda }, { data: analisesVenda }] = await Promise.all([
        supabase.from('prospeccao_cenarios').select('*').eq('prospeccao_id', venda.id).eq('principal', true).maybeSingle(),
        supabase.from('prospeccao_analises_mercado').select('faixa_base').eq('prospeccao_id', venda.id).order('created_at', { ascending: false }).limit(1),
      ])
      setVendaPrincipal((cVenda as ProspeccaoCenario | null) ?? null)
      setVendaFaixaBase(analisesVenda?.[0]?.faixa_base ?? null)
    } else {
      setVendaPrincipal(null)
      setVendaFaixaBase(null)
    }
    setLoading(false)
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projetoId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  const temVenda = vendaPrincipal || vendaFaixaBase != null
  const vendaCard = temVenda && (
    <div className="card p-4">
      <p className="text-xs font-medium mb-3 flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}><TrendingUp size={12} /> VENDA</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Campo label="Preço de venda estimado" valor={vendaPrincipal?.valor_venda_estimado != null ? formatCurrency(vendaPrincipal.valor_venda_estimado) : '—'} />
        {vendaFaixaBase != null && <Campo label="Faixa de mercado (base)" valor={formatCurrency(vendaFaixaBase)} />}
      </div>
      <Link
        href={`/projetos/${projetoId}?tab=mercado_venda`}
        className="inline-flex items-center gap-1 text-xs font-medium mt-3"
        style={{ color: 'var(--accent)' }}
      >
        Analisar preço de venda <ArrowUpRight size={12} />
      </Link>
    </div>
  )

  if (!prospeccao) {
    // Cadastro direto (sem passar por uma Prospecção) é um caminho válido de
    // criar um Imóvel — não é um erro nem uma inconsistência de dados. As
    // outras abas (Estrutura, Orçamento, Planejamento...) funcionam
    // normalmente mesmo sem prospecção de origem. Se já existir alguma
    // pesquisa/viabilidade de venda, ela aparece aqui mesmo sem prospecção
    // de compra — Visão Geral deixa de ficar vazia nesse caso.
    return temVenda ? (
      <div className="flex flex-col gap-4">
        <FaseAtivoCard projetoId={projetoId} faseInvestimento={faseInvestimento ?? null} onChanged={onFaseChanged} />
        {vendaCard}
      </div>
    ) : (
      <div className="flex flex-col gap-4">
        <FaseAtivoCard projetoId={projetoId} faseInvestimento={faseInvestimento ?? null} onChanged={onFaseChanged} />
        <EmptyState
          icon={Landmark}
          title="Cadastro direto"
          description="Este imóvel foi cadastrado diretamente, sem uma prospecção de origem. Preencha os dados do imóvel e pesquise o mercado para decidir o preço de venda."
        />
        <div className="flex flex-col sm:flex-row gap-2">
          <Link
            href={`/projetos/${projetoId}?tab=mercado_venda`}
            className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg border flex-1"
            style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}
          >
            Preencher dados do imóvel <ArrowUpRight size={13} />
          </Link>
          <Link
            href={`/projetos/${projetoId}?tab=viabilidade_venda`}
            className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg border flex-1"
            style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}
          >
            Analisar viabilidade de venda <ArrowUpRight size={13} />
          </Link>
        </div>
      </div>
    )
  }

  const temResultado = principal && resultadoCenarioValido(principal)
  const positivo = (principal?.lucro ?? 0) >= 0
  const camposPendentes = [
    !prospeccao.endereco && 'endereço',
    !principal?.valor_arrematacao && 'preço/aquisição',
    !principal?.valor_venda_estimado && 'venda estimada',
  ].filter(Boolean) as string[]

  return (
    <div className="flex flex-col gap-4">
      <FaseAtivoCard projetoId={projetoId} faseInvestimento={faseInvestimento ?? null} onChanged={onFaseChanged} />

      <div className="card p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Origem</p>
          <p className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{prospeccao.nome}</p>
        </div>
        <Link
          href={`/investidor/${prospeccao.id}`}
          className="inline-flex items-center gap-1 text-sm font-medium flex-shrink-0"
          style={{ color: 'var(--accent)' }}
        >
          Ver prospecção <ArrowUpRight size={14} />
        </Link>
      </div>

      {camposPendentes.length > 0 && (
        <div className="card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3" style={{ borderColor: 'rgba(245,158,11,0.45)' }}>
          <div className="flex items-start gap-3 min-w-0">
            <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" style={{ color: '#f59e0b' }} />
            <div className="min-w-0">
              <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>Ficha da prospecção incompleta</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                Falta preencher: {camposPendentes.join(', ')}.
              </p>
            </div>
          </div>
          <Link
            href={`/investidor/${prospeccao.id}?tab=decidir`}
            className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border flex-shrink-0"
            style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}
          >
            Preencher imóvel <ArrowUpRight size={13} />
          </Link>
        </div>
      )}

      <div className="card p-4">
        <p className="text-xs font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>
          CENÁRIO PRINCIPAL {principal ? `(${principal.nome})` : ''}
        </p>
        {!principal ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            A prospecção de origem ainda não tem um cenário principal definido.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Campo label="Valor de aquisição" valor={principal.valor_arrematacao != null ? formatCurrency(principal.valor_arrematacao) : '—'} />
            <Campo label="Valor de venda estimado" valor={principal.valor_venda_estimado != null ? formatCurrency(principal.valor_venda_estimado) : '—'} />
            {temResultado ? (
              <>
                <Campo label="Lucro estimado" valor={formatCurrency(principal.lucro!)} cor={positivo ? 'var(--success)' : 'var(--danger)'} />
                <Campo label="Rentabilidade" valor={`${principal.rentabilidade!.toFixed(1)}%`} cor={positivo ? 'var(--success)' : 'var(--danger)'} />
              </>
            ) : (
              <Campo label="Investimento total" valor={principal.investimento_total != null ? formatCurrency(principal.investimento_total) : '—'} />
            )}
          </div>
        )}
      </div>

      {vendaCard}

      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
        Estes valores refletem o cenário previsto na prospecção de compra{temVenda ? ' e a pesquisa de venda feita no próprio Imóvel' : ''}.
        Comparação com o realizado (financeiro real da obra) e Comercialização chegam em marcos futuros do Laboratório Investidor.
      </p>
    </div>
  )
}

function Campo({ label, valor, cor }: { label: string; valor: string; cor?: string }) {
  return (
    <div>
      <p className="text-xs mb-0.5" style={{ color: 'var(--text-secondary)' }}>{label}</p>
      <p className="font-bold text-sm sm:text-base" style={{ color: cor ?? 'var(--text-primary)' }}>{valor}</p>
    </div>
  )
}
