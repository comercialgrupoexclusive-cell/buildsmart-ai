'use client'

import { useEffect, useState } from 'react'
import { Plus, Star, Scale, ListChecks, CalendarRange } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { formatCurrency } from '@/lib/utils'
import { ObraOrcamento } from '@/components/obra/ObraOrcamento'
import { ObraPlanejamento2 } from '@/components/obra/ObraPlanejamento2'

type OrcamentoResumo = {
  id: string
  nome: string | null
  versao: number
  status: string
  is_principal: boolean
  bdi_percentual: number
  created_at: string
  total: number
  totalItens: number
  totalEtapas: number
}

const STATUS_LABEL: Record<string, string> = {
  em_projeto: 'Em projeto',
  ativo: 'Ativo (obra)',
  finalizado: 'Finalizado',
  arquivado: 'Arquivado',
}

export function ProjetoOrcamentosPanel({ projetoId, projetoNome, obraId }: { projetoId: string; projetoNome?: string; obraId?: string | null }) {
  const supabase = createClient()
  const [orcamentos, setOrcamentos] = useState<OrcamentoResumo[]>([])
  const [loading, setLoading] = useState(true)
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null)
  const [subTab, setSubTab] = useState<'itens' | 'planejamento'>('itens')
  const [comparar, setComparar] = useState(false)
  const [criandoNovo, setCriandoNovo] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [salvandoNovo, setSalvandoNovo] = useState(false)

  useEffect(() => { load() }, [projetoId])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('orcamentos')
      .select('id, nome, versao, status, is_principal, bdi_percentual, created_at')
      .eq('projeto_id', projetoId)
      .order('is_principal', { ascending: false })
      .order('created_at', { ascending: true })
    const lista = ((data || []) as Omit<OrcamentoResumo, 'total' | 'totalItens' | 'totalEtapas'>[])
      .map(o => ({ ...o, total: 0, totalItens: 0, totalEtapas: 0 }))

    if (lista.length > 0) {
      const ids = lista.map(o => o.id)
      const { data: itensData } = await supabase
        .from('orcamento_itens')
        .select('orcamento_id, quantidade, preco_unitario_snapshot, etapa_id')
        .in('orcamento_id', ids)

      const totais = new Map<string, number>()
      const contagem = new Map<string, number>()
      const etapasPorOrc = new Map<string, Set<string>>()
      ;(itensData || []).forEach((it: { orcamento_id: string; quantidade: number; preco_unitario_snapshot: number; etapa_id: string | null }) => {
        totais.set(it.orcamento_id, (totais.get(it.orcamento_id) || 0) + Number(it.quantidade) * Number(it.preco_unitario_snapshot))
        contagem.set(it.orcamento_id, (contagem.get(it.orcamento_id) || 0) + 1)
        if (it.etapa_id) {
          if (!etapasPorOrc.has(it.orcamento_id)) etapasPorOrc.set(it.orcamento_id, new Set())
          etapasPorOrc.get(it.orcamento_id)!.add(it.etapa_id)
        }
      })
      lista.forEach(o => {
        o.total = totais.get(o.id) || 0
        o.totalItens = contagem.get(o.id) || 0
        o.totalEtapas = etapasPorOrc.get(o.id)?.size || 0
      })
    }

    setOrcamentos(lista)
    setSelecionadoId(prev => (prev && lista.some(o => o.id === prev)) ? prev : (lista.find(o => o.is_principal)?.id || lista[0]?.id || null))
    setLoading(false)
  }

  async function criarOrcamento() {
    const nome = novoNome.trim()
    if (!nome) return
    setSalvandoNovo(true)
    try {
      const proximaVersao = orcamentos.reduce((max, o) => Math.max(max, o.versao || 0), 0) + 1
      const { data, error } = await supabase.from('orcamentos').insert({
        projeto_id: projetoId, nome, versao: proximaVersao, is_principal: false,
        tipo: 'executivo', bdi_percentual: 25, status: 'em_projeto',
      }).select('id').single()
      if (error) throw error
      setNovoNome('')
      setCriandoNovo(false)
      await load()
      if (data) setSelecionadoId(data.id)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Erro ao criar orçamento')
    } finally {
      setSalvandoNovo(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  const selecionado = orcamentos.find(o => o.id === selecionadoId)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {orcamentos.map(o => (
          <button
            key={o.id}
            onClick={() => { setSelecionadoId(o.id); setComparar(false) }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border"
            style={!comparar && selecionadoId === o.id
              ? { background: 'var(--accent)', color: 'white', borderColor: 'var(--accent)' }
              : { color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
          >
            {o.is_principal && <Star size={11} />}
            {o.nome || `Orçamento v${o.versao}`}
          </button>
        ))}

        {criandoNovo ? (
          <div className="flex items-center gap-1.5">
            <Input
              value={novoNome}
              onChange={e => setNovoNome(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && criarOrcamento()}
              placeholder="Nome do novo orçamento"
              autoFocus
              className="h-8 text-xs"
            />
            <Button size="sm" onClick={criarOrcamento} disabled={!novoNome.trim() || salvandoNovo}>
              {salvandoNovo ? 'Criando...' : 'Criar'}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => { setCriandoNovo(false); setNovoNome('') }}>Cancelar</Button>
          </div>
        ) : (
          <button
            onClick={() => setCriandoNovo(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed"
            style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
            title="Criar um orçamento alternativo para comparar com o principal"
          >
            <Plus size={13} /> Novo orçamento
          </button>
        )}

        {orcamentos.length > 1 && (
          <button
            onClick={() => setComparar(v => !v)}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border"
            style={comparar
              ? { background: 'var(--accent)', color: 'white', borderColor: 'var(--accent)' }
              : { color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
          >
            <Scale size={13} /> Comparar
          </button>
        )}
      </div>

      {comparar ? (
        <div className="rounded-xl border overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Orçamento</th>
                <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Status</th>
                <th className="text-right px-3 py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Etapas</th>
                <th className="text-right px-3 py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Itens</th>
                <th className="text-right px-3 py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>BDI</th>
                <th className="text-right px-3 py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Valor total</th>
              </tr>
            </thead>
            <tbody>
              {orcamentos.map(o => (
                <tr key={o.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <td className="px-3 py-2" style={{ color: 'var(--text-primary)' }}>
                    <span className="flex items-center gap-1.5">
                      {o.is_principal && <Star size={12} style={{ color: 'var(--accent)' }} />}
                      {o.nome || `Orçamento v${o.versao}`}
                    </span>
                  </td>
                  <td className="px-3 py-2" style={{ color: 'var(--text-secondary)' }}>{STATUS_LABEL[o.status] || o.status}</td>
                  <td className="px-3 py-2 text-right" style={{ color: 'var(--text-secondary)' }}>{o.totalEtapas}</td>
                  <td className="px-3 py-2 text-right" style={{ color: 'var(--text-secondary)' }}>{o.totalItens}</td>
                  <td className="px-3 py-2 text-right" style={{ color: 'var(--text-secondary)' }}>{o.bdi_percentual}%</td>
                  <td className="px-3 py-2 text-right font-medium" style={{ color: 'var(--accent)' }}>{formatCurrency(o.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : selecionado ? (
        <div className="flex flex-col gap-3">
          <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ background: 'var(--bg-secondary)' }}>
            {([['itens', 'Itens', ListChecks], ['planejamento', 'Planejamento', CalendarRange]] as const).map(([key, label, Icon]) => (
              <button
                key={key}
                onClick={() => setSubTab(key)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                style={{
                  background: subTab === key ? 'var(--bg-card)' : 'transparent',
                  color: subTab === key ? 'var(--text-primary)' : 'var(--text-secondary)',
                  boxShadow: subTab === key ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>

          {subTab === 'itens' && (
            <ObraOrcamento
              key={selecionado.id}
              projetoId={projetoId}
              obraId={obraId ?? undefined}
              orcamentoId={selecionado.id}
              obraName={projetoNome}
            />
          )}
          {subTab === 'planejamento' && (
            <ObraPlanejamento2
              key={selecionado.id}
              projetoId={obraId ? undefined : projetoId}
              obraId={obraId ?? undefined}
              orcamentoId={selecionado.id}
            />
          )}
        </div>
      ) : (
        <div className="card p-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
          Nenhum orçamento ainda.
        </div>
      )}
    </div>
  )
}
