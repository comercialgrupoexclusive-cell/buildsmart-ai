'use client'

// UI canônica do Orçamento no Processo — árvore BOQ inline (referência 06).
// Uma tela só: resumo financeiro, avançado (BDI/gerenciamento), busca, a
// árvore Etapa → Subetapa → Item e a ação "Lançar item". Substituiu a antiga
// pilha de telas (Resumo → Etapa → Grupo → Item → Adicionar) e o formulário
// "Começar orçamento": o primeiro item e o centésimo entram pelo mesmo modal.
//
// Fonte única de valor: orcamento_arvore_valores() (RPC) — nenhum total é
// recalculado aqui, só somado (calcularTotal / calcularTotalOperacional).
// Escrita passa sempre por lib/orcamento (inserir-item / vinculos) — nunca uma
// fórmula paralela.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Plus, Search, Settings2, Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { calcularTotalOperacional } from '@/lib/orcamento/arvore'
import { MetricCard } from '@/components/ui/InsightCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { LinhaArvore, calcularTotal } from './types'
import { OrcamentoArvore } from './OrcamentoArvore'
import { OrcamentoItemModal } from './OrcamentoItemModal'
import { OrcamentoItemDetalhe } from './OrcamentoItemDetalhe'

type OrcamentoInfo = {
  id: string
  processo_id: string | null
  versao: number
  status: string
  bdi_percentual: number
  gerenciamento_percentual: number
  gerenciamento_valor_fixo: number | null
  uf: string
}

export function ProcessoOrcamento({ orcamentoId, processoNome }: { orcamentoId: string; processoNome: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [orcamento, setOrcamento] = useState<OrcamentoInfo | null>(null)
  const [linhas, setLinhas] = useState<LinhaArvore[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [avancadoAberto, setAvancadoAberto] = useState(false)

  const [bdi, setBdi] = useState('0')
  const [gerPct, setGerPct] = useState('0')
  const [gerFixo, setGerFixo] = useState('')
  const [salvandoAvancado, setSalvandoAvancado] = useState(false)

  // Modais: adicionar item (com etapa/subetapa opcionalmente pré-selecionadas)
  // e detalhe/edição de um item existente.
  const [modalItem, setModalItem] = useState<{ etapaId: string | null; grupoId: string | null } | null>(null)
  const [itemEmEdicao, setItemEmEdicao] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setErro(null)
    const [{ data: orc, error: orcError }, { data: arvore, error: arvoreError }] = await Promise.all([
      supabase.from('orcamentos').select('id, processo_id, versao, status, bdi_percentual, gerenciamento_percentual, gerenciamento_valor_fixo, uf').eq('id', orcamentoId).single(),
      supabase.rpc('orcamento_arvore_valores', { p_orcamento_ids: [orcamentoId] }),
    ])
    if (orcError || arvoreError) {
      setErro(orcError?.message || arvoreError?.message || 'Não foi possível carregar o orçamento.')
      setLoading(false)
      return
    }
    const info = orc as OrcamentoInfo
    setOrcamento(info)
    setBdi(String(info.bdi_percentual))
    setGerPct(String(info.gerenciamento_percentual))
    setGerFixo(info.gerenciamento_valor_fixo != null ? String(info.gerenciamento_valor_fixo) : '')
    setLinhas((arvore || []) as LinhaArvore[])
    setLoading(false)
  }, [supabase, orcamentoId])

  useEffect(() => {
    const timer = window.setTimeout(() => { void carregar() }, 0)
    return () => window.clearTimeout(timer)
  }, [carregar])

  const custoDireto = useMemo(() => calcularTotal(linhas), [linhas])
  const { bdi: bdiValor, gerenciamento, total: totalGeral } = useMemo(() => calcularTotalOperacional({
    custoDireto,
    bdiPercentual: orcamento?.bdi_percentual ?? 0,
    gerenciamentoPercentual: orcamento?.gerenciamento_percentual ?? 0,
    gerenciamentoValorFixo: orcamento?.gerenciamento_valor_fixo ?? null,
  }), [custoDireto, orcamento])

  async function salvarAvancado() {
    if (!orcamento) return
    setSalvandoAvancado(true)
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
      await carregar()
      setAvancadoAberto(false)
    } finally {
      setSalvandoAvancado(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  if (erro || !orcamento) {
    return <div className="card p-5 text-sm" style={{ color: 'var(--danger)' }}>{erro || 'Orçamento não encontrado.'}</div>
  }

  const vazio = linhas.length === 0

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
            <Input label="Gerenciamento — valor fixo contratado (opcional)" type="text" inputMode="decimal" value={gerFixo} onChange={e => setGerFixo(e.target.value)} placeholder="Deixe vazio para usar o percentual acima" />
            <Button size="sm" onClick={salvarAvancado} loading={salvandoAvancado} className="w-full justify-center">Salvar</Button>
          </div>
        )}
      </div>

      {!vazio && (
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar etapa..." className="input-base pl-9 w-full" />
        </div>
      )}

      {vazio ? (
        <EmptyState
          icon={Wallet}
          title="Orçamento em branco"
          description="Lance o primeiro item para montar a árvore. A etapa e o serviço são criados no próprio lançamento."
          action={<Button icon={<Plus size={15} />} onClick={() => setModalItem({ etapaId: null, grupoId: null })}>Lançar item</Button>}
        />
      ) : (
        <>
          <OrcamentoArvore
            orcamentoId={orcamentoId}
            linhas={linhas}
            busca={busca}
            onAdicionarItem={ctx => setModalItem(ctx)}
            onEditarItem={id => setItemEmEdicao(id)}
            onAtualizado={carregar}
          />
          <Button icon={<Plus size={16} />} onClick={() => setModalItem({ etapaId: null, grupoId: null })} className="w-full justify-center">
            Lançar item
          </Button>
        </>
      )}

      {modalItem && (
        <OrcamentoItemModal
          aberto
          orcamentoId={orcamentoId}
          processoId={orcamento.processo_id}
          uf={orcamento.uf}
          linhas={linhas}
          etapaInicial={modalItem.etapaId}
          grupoInicial={modalItem.grupoId}
          onFechar={() => setModalItem(null)}
          onInserido={carregar}
        />
      )}

      <Modal open={!!itemEmEdicao} onClose={() => setItemEmEdicao(null)} size="md">
        {itemEmEdicao && (
          <OrcamentoItemDetalhe
            key={itemEmEdicao}
            itemId={itemEmEdicao}
            linhas={linhas}
            onVoltar={() => setItemEmEdicao(null)}
            onAtualizado={carregar}
            onExcluido={async () => { await carregar(); setItemEmEdicao(null) }}
          />
        )}
      </Modal>
    </div>
  )
}
