'use client'

// Tela 1 do fluxo de referência: contexto, total, busca e lista de etapas
// (fechadas por padrão — abrir uma etapa é navegar pra tela seguinte, nunca
// expandir centenas de itens aqui).
//
// P4.4: lista sem divisórias brancas pesadas (cards leves com espaçamento em
// vez de divide-y + borda em toda linha) e seção "Avançado" para
// BDI/gerenciamento — inclusive valor fixo contratado (P1: evita erro de
// arredondamento de converter um valor fixo real em percentual).
import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, ChevronUp, Search, Settings2, Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { calcularTotalOperacional } from '@/lib/orcamento/arvore'
import { MetricCard } from '@/components/ui/InsightCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { LinhaArvore, agruparPorEtapa, calcularTotal } from './types'

type OrcamentoResumoInfo = {
  id: string
  versao: number
  status: string
  bdi_percentual: number
  gerenciamento_percentual: number
  gerenciamento_valor_fixo: number | null
}

export function OrcamentoResumo({
  processoNome, orcamento, linhas, onAbrirEtapa, onAtualizarOrcamento,
}: {
  processoNome: string
  orcamento: OrcamentoResumoInfo
  linhas: LinhaArvore[]
  onAbrirEtapa: (etapaId: string) => void
  onAtualizarOrcamento: () => Promise<void>
}) {
  const supabase = createClient()
  const [busca, setBusca] = useState('')
  const [avancadoAberto, setAvancadoAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [bdi, setBdi] = useState(String(orcamento.bdi_percentual))
  const [gerPct, setGerPct] = useState(String(orcamento.gerenciamento_percentual))
  const [gerFixo, setGerFixo] = useState(orcamento.gerenciamento_valor_fixo != null ? String(orcamento.gerenciamento_valor_fixo) : '')

  const custoDireto = useMemo(() => calcularTotal(linhas), [linhas])
  const { bdi: bdiValor, gerenciamento, total: totalGeral } = useMemo(() => calcularTotalOperacional({
    custoDireto,
    bdiPercentual: orcamento.bdi_percentual,
    gerenciamentoPercentual: orcamento.gerenciamento_percentual,
    gerenciamentoValorFixo: orcamento.gerenciamento_valor_fixo,
  }), [custoDireto, orcamento])
  const etapas = useMemo(() => agruparPorEtapa(linhas), [linhas])
  const etapasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return etapas
    return etapas.filter(e => e.nome.toLowerCase().includes(termo))
  }, [etapas, busca])

  async function salvarAvancado() {
    setSalvando(true)
    try {
      const bdiNum = parseFloat(bdi.replace(',', '.'))
      const gerPctNum = parseFloat(gerPct.replace(',', '.'))
      const gerFixoLimpo = gerFixo.trim().replace(/[^\d,.-]/g, '').replace(',', '.')
      const gerFixoNum = gerFixoLimpo ? parseFloat(gerFixoLimpo) : null
      const { error } = await supabase.from('orcamentos').update({
        bdi_percentual: isNaN(bdiNum) ? 0 : bdiNum,
        gerenciamento_percentual: isNaN(gerPctNum) ? 0 : gerPctNum,
        gerenciamento_valor_fixo: gerFixoNum != null && !isNaN(gerFixoNum) ? gerFixoNum : null,
      }).eq('id', orcamento.id)
      if (error) throw error
      await onAtualizarOrcamento()
      setAvancadoAberto(false)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Orçamento</h2>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {processoNome} · versão {orcamento.versao} · {orcamento.status === 'em_projeto' ? 'em projeto' : orcamento.status}
        </p>
      </div>

      <MetricCard label="Valor total do orçamento" value={formatCurrency(totalGeral)} detail={`Direto ${formatCurrency(custoDireto)} · BDI ${formatCurrency(bdiValor)} · Gerenciamento ${formatCurrency(gerenciamento)}`} tone="accent" />

      <div className="card p-0 overflow-hidden">
        <button onClick={() => setAvancadoAberto(v => !v)} className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
          <span className="flex items-center gap-2"><Settings2 size={14} /> Avançado — BDI e gerenciamento</span>
          {avancadoAberto ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
        {avancadoAberto && (
          <div className="px-4 pb-4 flex flex-col gap-3 border-t" style={{ borderColor: 'var(--border)' }}>
            <div className="grid grid-cols-2 gap-3 pt-3">
              <Input label="BDI (%)" type="text" inputMode="decimal" value={bdi} onChange={e => setBdi(e.target.value)} />
              <Input label="Gerenciamento (%)" type="text" inputMode="decimal" value={gerPct} onChange={e => setGerPct(e.target.value)} />
            </div>
            <Input
              label="Gerenciamento — valor fixo contratado (opcional)"
              type="text"
              inputMode="decimal"
              value={gerFixo}
              onChange={e => setGerFixo(e.target.value)}
              placeholder="Deixe vazio para usar o percentual acima"
            />
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Quando o valor fixo é preenchido, ele vence o percentual — evita diferença de centavos ao converter um valor contratado em percentual.
            </p>
            <Button size="sm" onClick={salvarAvancado} loading={salvando} className="w-full justify-center">Salvar</Button>
          </div>
        )}
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar etapa..."
          className="input-base pl-9 w-full"
        />
      </div>

      {etapasFiltradas.length === 0 ? (
        <EmptyState icon={Wallet} title="Nenhuma etapa encontrada" description={busca ? 'Ajuste a busca.' : 'Este orçamento ainda não tem etapas.'} />
      ) : (
        <div className="flex flex-col gap-2">
          {etapasFiltradas.map((etapa, i) => (
            <button
              key={etapa.id}
              onClick={() => onAbrirEtapa(etapa.id)}
              className="flex items-center gap-3 px-4 py-3.5 text-left rounded-xl transition-colors hover:bg-[var(--bg-secondary)]"
              style={{ background: 'var(--bg-card)' }}
            >
              <span
                className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold tabular-nums"
                style={{ background: 'var(--bg-secondary)', color: 'var(--accent)' }}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="min-w-0 flex-1 text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{etapa.nome}</span>
              <span className="flex items-center gap-2 flex-shrink-0">
                <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{formatCurrency(etapa.valor)}</span>
                <ChevronRight size={16} style={{ color: 'var(--text-secondary)' }} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
