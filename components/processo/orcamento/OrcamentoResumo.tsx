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
import { ChevronDown, ChevronRight, ChevronUp, Plus, Search, Settings2, Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { calcularTotalOperacional } from '@/lib/orcamento/arvore'
import { inserirItemOrcamento, resolverGrupoId, type ClassificacaoInsumo } from '@/lib/orcamento/inserir-item'
import { MetricCard } from '@/components/ui/InsightCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { LinhaArvore, agruparPorEtapa, calcularTotal } from './types'

type OrcamentoResumoInfo = {
  id: string
  processo_id: string | null
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
  const [novaEtapa, setNovaEtapa] = useState('')
  const [novaSubetapa, setNovaSubetapa] = useState('')
  const [novoItem, setNovoItem] = useState('')
  const [novaUnidade, setNovaUnidade] = useState('UN')
  const [novaQuantidade, setNovaQuantidade] = useState('')
  const [novoValor, setNovoValor] = useState('')
  const [novaClassificacao, setNovaClassificacao] = useState<ClassificacaoInsumo>('MATERIAL_SERVICOS')
  const [criandoEstrutura, setCriandoEstrutura] = useState(false)
  const [erroEstrutura, setErroEstrutura] = useState<string | null>(null)

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

  async function criarPrimeiraEstrutura() {
    setErroEstrutura(null)
    if (!novaEtapa.trim()) { setErroEstrutura('Informe a etapa.'); return }
    if (!novaSubetapa.trim()) { setErroEstrutura('Informe a subetapa.'); return }
    if (!novoItem.trim()) { setErroEstrutura('Informe o item.'); return }
    setCriandoEstrutura(true)
    try {
      const { data: etapasExistentes } = await supabase
        .from('etapas')
        .select('ordem')
        .eq('orcamento_id', orcamento.id)
        .order('ordem', { ascending: false })
        .limit(1)

      const proximaOrdem = Number(etapasExistentes?.[0]?.ordem ?? 0) + 1
      const { data: etapaCriada, error: etapaError } = await supabase
        .from('etapas')
        .insert({
          processo_id: orcamento.processo_id,
          orcamento_id: orcamento.id,
          nome: novaEtapa.trim(),
          status: 'planejada',
          ordem: proximaOrdem,
        })
        .select('id')
        .single()
      if (etapaError || !etapaCriada?.id) throw etapaError || new Error('Não foi possível criar a etapa.')

      const grupoId = await resolverGrupoId(supabase, {
        orcamentoId: orcamento.id,
        etapaId: etapaCriada.id as string,
        nomeSubetapa: novaSubetapa.trim(),
      })

      const qtdLimpa = novaQuantidade.trim().replace(',', '.')
      const valorLimpo = novoValor.trim().replace(/[^\d,.-]/g, '').replace(',', '.')
      const qtd = qtdLimpa ? parseFloat(qtdLimpa) : null
      const valor = valorLimpo ? parseFloat(valorLimpo) : null

      await inserirItemOrcamento(supabase, {
        orcamentoId: orcamento.id,
        etapaId: etapaCriada.id as string,
        grupoId,
        subetapa: novaSubetapa.trim(),
        quantidade: qtd != null && !Number.isNaN(qtd) ? qtd : null,
        descricao: novoItem.trim(),
        unidade: novaUnidade.trim() || 'UN',
        classificacao: novaClassificacao,
        fonte: 'item_livre',
        precoUnitario: valor != null && !Number.isNaN(valor) ? valor : null,
      })

      setNovaEtapa('')
      setNovaSubetapa('')
      setNovoItem('')
      setNovaUnidade('UN')
      setNovaQuantidade('')
      setNovoValor('')
      setNovaClassificacao('MATERIAL_SERVICOS')
      await onAtualizarOrcamento()
    } catch (e) {
      setErroEstrutura(e instanceof Error ? e.message : 'Não foi possível criar a estrutura.')
    } finally {
      setCriandoEstrutura(false)
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
        busca ? (
          <EmptyState icon={Wallet} title="Nenhuma etapa encontrada" description="Ajuste a busca." />
        ) : (
          <div className="card p-4 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <span className="h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--bg-secondary)', color: 'var(--accent)' }}>
                <Plus size={17} />
              </span>
              <div>
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Começar orçamento</h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  Cadastre a primeira etapa, subetapa e item. Depois você adiciona mais itens dentro da própria árvore.
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Etapa" value={novaEtapa} onChange={e => setNovaEtapa(e.target.value)} placeholder="Ex: Projetos" />
              <Input label="Subetapa" value={novaSubetapa} onChange={e => setNovaSubetapa(e.target.value)} placeholder="Ex: Hidrossanitário / elétrico" />
            </div>
            <Input label="Item" value={novoItem} onChange={e => setNovoItem(e.target.value)} placeholder="Ex: Finalização hidrossanitário/elétrico" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Input label="Un." value={novaUnidade} onChange={e => setNovaUnidade(e.target.value)} placeholder="UN" />
              <Input label="Qtd." inputMode="decimal" value={novaQuantidade} onChange={e => setNovaQuantidade(e.target.value)} placeholder="A conferir" />
              <Input label="Valor unit." inputMode="decimal" value={novoValor} onChange={e => setNovoValor(e.target.value)} placeholder="A definir" />
              <Select label="Classificação" value={novaClassificacao} onChange={e => setNovaClassificacao(e.target.value as ClassificacaoInsumo)}>
                <option value="MATERIAL_SERVICOS">Material / Serviço</option>
                <option value="MAO_DE_OBRA">Mão de obra</option>
                <option value="EQUIPAMENTO">Equipamento</option>
              </Select>
            </div>
            {erroEstrutura && <p className="text-sm rounded-lg px-3 py-2" style={{ color: 'var(--danger)', background: 'rgba(239,68,68,0.08)' }}>{erroEstrutura}</p>}
            <Button onClick={criarPrimeiraEstrutura} loading={criandoEstrutura} className="w-full justify-center">
              Criar primeira estrutura
            </Button>
          </div>
        )
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
