'use client'

// Adicionar um serviço (composição própria, SINAPI, insumo direto ou item
// livre) a uma etapa ou a um grupo/subetapa já existente. Tela própria (não
// modal), fluxo linear: escolher fonte → buscar/selecionar → quantidade →
// confirmar. Escrita sempre via inserirItemOrcamento (lib/orcamento/
// inserir-item.ts) — mesmo caminho canônico usado por
// TemplateOrcamentoModal, nunca um insert construído à mão aqui.
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Loader2, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import {
  buscarComposicoesProprias, buscarComposicoesSinapi, buscarInsumosCatalogo,
  type ComposicaoPropriaComCusto, type SinapiComposicaoResumo, type InsumoCatalogo,
} from '@/lib/orcamento/buscar-catalogo'
import { inserirItemOrcamento, type NovoItemOrcamento, type ClassificacaoInsumo } from '@/lib/orcamento/inserir-item'
import { LinhaArvore } from './types'

type Fonte = 'propria' | 'sinapi' | 'insumo' | 'livre'

type Selecionado = {
  descricao: string
  unidade: string
  preco: number
  codigo: string
  classificacao: ClassificacaoInsumo | null
} & (
  | { fonte: 'propria'; composicaoId: string }
  | { fonte: 'sinapi'; sinapiComposicaoId: string }
  | { fonte: 'insumo' }
)

const FONTES: { id: Fonte; label: string }[] = [
  { id: 'propria', label: 'Composições' },
  { id: 'sinapi', label: 'SINAPI' },
  { id: 'insumo', label: 'Insumos' },
  { id: 'livre', label: 'Item livre' },
]

export function OrcamentoAdicionarItem({
  orcamentoId, etapaId, grupoId, linhas, uf, onVoltar, onInserido,
}: {
  orcamentoId: string
  etapaId: string
  grupoId: string | null
  linhas: LinhaArvore[]
  uf: string
  onVoltar: () => void
  onInserido: () => Promise<void>
}) {
  const supabase = createClient()
  const [fonte, setFonte] = useState<Fonte>('propria')
  const [busca, setBusca] = useState('')
  const [composicoesProprias, setComposicoesProprias] = useState<ComposicaoPropriaComCusto[] | null>(null)
  const [composicoesSinapi, setComposicoesSinapi] = useState<SinapiComposicaoResumo[]>([])
  const [insumos, setInsumos] = useState<InsumoCatalogo[]>([])
  const [carregando, setCarregando] = useState(false)
  const [selecionado, setSelecionado] = useState<Selecionado | null>(null)
  const [quantidade, setQuantidade] = useState('')
  const [livreDescricao, setLivreDescricao] = useState('')
  const [livreUnidade, setLivreUnidade] = useState('UN')
  const [livrePreco, setLivrePreco] = useState('')
  const [livreClassificacao, setLivreClassificacao] = useState<ClassificacaoInsumo>('MATERIAL_SERVICOS')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const etapaNome = linhas.find(l => l.etapa_id === etapaId)?.etapa_nome || 'Etapa'
  const grupo = grupoId ? linhas.find(l => l.item_id === grupoId) : null
  const grupoNome = grupo ? (grupo.grupo_nome || grupo.item_descricao) : null

  useEffect(() => {
    if (fonte !== 'propria' || composicoesProprias !== null) return
    const timer = window.setTimeout(() => {
      setCarregando(true)
      buscarComposicoesProprias(supabase, uf).then(setComposicoesProprias).finally(() => setCarregando(false))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [fonte, composicoesProprias, supabase, uf])

  useEffect(() => {
    if (fonte !== 'sinapi' && fonte !== 'insumo') return
    const termo = busca.trim()
    if (termo.length === 1) return
    const timer = window.setTimeout(() => {
      setCarregando(true)
      const promessa = fonte === 'sinapi'
        ? buscarComposicoesSinapi(supabase, termo).then(setComposicoesSinapi)
        : buscarInsumosCatalogo(supabase, termo, uf).then(setInsumos)
      promessa.finally(() => setCarregando(false))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [fonte, busca, supabase, uf])

  const composicoesPropriasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const lista = composicoesProprias || []
    return termo ? lista.filter(c => c.descricao.toLowerCase().includes(termo)) : lista
  }, [composicoesProprias, busca])

  function selecionarFonte(f: Fonte) {
    setFonte(f)
    setSelecionado(null)
    setBusca('')
  }

  async function confirmar() {
    setErro(null)
    const qtdNormalizada = quantidade.trim().replace(',', '.')
    const qtd = qtdNormalizada ? parseFloat(qtdNormalizada) : null
    if (fonte === 'livre' && !livreDescricao.trim()) { setErro('Descrição obrigatória.'); return }
    if (fonte !== 'livre' && !selecionado) { setErro('Selecione um item da lista.'); return }

    setSalvando(true)
    try {
      const base = {
        orcamentoId,
        etapaId,
        grupoId,
        subetapa: grupoNome || null,
        quantidade: qtd != null && !isNaN(qtd) ? qtd : null,
        ordem: null,
      }
      let novoItem: NovoItemOrcamento
      if (fonte === 'livre') {
        const precoLimpo = livrePreco.replace(/[^\d,.-]/g, '').replace(',', '.')
        const preco = precoLimpo ? parseFloat(precoLimpo) : null
        novoItem = {
          ...base,
          descricao: livreDescricao.trim(),
          unidade: livreUnidade.trim() || 'UN',
          classificacao: livreClassificacao,
          fonte: 'item_livre',
          precoUnitario: preco != null && !isNaN(preco) ? preco : null,
        }
      } else if (selecionado!.fonte === 'propria') {
        novoItem = {
          ...base,
          descricao: selecionado!.descricao,
          unidade: selecionado!.unidade,
          classificacao: selecionado!.classificacao,
          fonte: 'propria',
          composicaoId: selecionado!.composicaoId,
          codigo: selecionado!.codigo,
          precoUnitario: selecionado!.preco,
        }
      } else if (selecionado!.fonte === 'sinapi') {
        novoItem = {
          ...base,
          descricao: selecionado!.descricao,
          unidade: selecionado!.unidade,
          classificacao: selecionado!.classificacao,
          fonte: 'sinapi',
          sinapiComposicaoId: selecionado!.sinapiComposicaoId,
          codigo: selecionado!.codigo,
          precoUnitario: selecionado!.preco,
        }
      } else {
        novoItem = {
          ...base,
          descricao: selecionado!.descricao,
          unidade: selecionado!.unidade,
          classificacao: selecionado!.classificacao,
          fonte: 'insumo',
          codigo: selecionado!.codigo,
          precoUnitario: selecionado!.preco,
        }
      }
      await inserirItemOrcamento(supabase, novoItem)
      await onInserido()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível adicionar o item.')
    } finally {
      setSalvando(false)
    }
  }

  const podeConfirmar = fonte === 'livre' ? livreDescricao.trim().length > 0 : Boolean(selecionado)

  return (
    <div className="flex flex-col gap-4">
      <button onClick={onVoltar} className="inline-flex items-center gap-2 text-sm w-fit" style={{ color: 'var(--text-secondary)' }}>
        <ArrowLeft size={16} /> {grupoNome || etapaNome}
      </button>

      <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Adicionar serviço</h2>

      <div className="flex gap-1 p-1 rounded-xl w-full overflow-x-auto" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
        {FONTES.map(f => (
          <button
            key={f.id}
            onClick={() => selecionarFonte(f.id)}
            className="px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex-shrink-0"
            style={fonte === f.id ? { background: 'var(--accent)', color: 'white' } : { color: 'var(--text-secondary)' }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {fonte === 'livre' ? (
        <div className="flex flex-col gap-3">
          <Input label="Descrição *" value={livreDescricao} onChange={e => setLivreDescricao(e.target.value)} placeholder="Ex: Frete, projeto, taxa..." autoFocus />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Unidade" value={livreUnidade} onChange={e => setLivreUnidade(e.target.value)} placeholder="UN" />
            <Input label="Valor unitário" type="text" inputMode="decimal" value={livrePreco} onChange={e => setLivrePreco(e.target.value)} placeholder="A conferir" />
          </div>
          <Select label="Classificação" value={livreClassificacao} onChange={e => setLivreClassificacao(e.target.value as ClassificacaoInsumo)}>
            <option value="MATERIAL_SERVICOS">Material / Serviço</option>
            <option value="MAO_DE_OBRA">Mão de obra</option>
            <option value="EQUIPAMENTO">Equipamento</option>
          </Select>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder={fonte === 'propria' ? 'Buscar composição própria...' : fonte === 'sinapi' ? 'Buscar composição SINAPI...' : 'Buscar insumo...'}
              className="input-base pl-9 w-full"
              autoFocus
            />
          </div>

          {selecionado ? (
            <div className="card p-4 flex flex-col gap-2" style={{ border: '1px solid var(--accent)' }}>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{selecionado.descricao}</p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{formatCurrency(selecionado.preco)}/{selecionado.unidade}</p>
              <button onClick={() => setSelecionado(null)} className="text-xs font-medium w-fit" style={{ color: 'var(--accent)' }}>Trocar seleção</button>
            </div>
          ) : carregando ? (
            <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>
          ) : (
            <div className="flex flex-col divide-y max-h-72 overflow-y-auto rounded-xl" style={{ border: '1px solid var(--border)', '--tw-divide-color': 'var(--border)' } as React.CSSProperties}>
              {fonte === 'propria' && composicoesPropriasFiltradas.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelecionado({ fonte: 'propria', composicaoId: c.id, codigo: c.codigo, descricao: c.descricao, unidade: c.unidade, preco: c.custo_calculado, classificacao: null })}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-[var(--bg-secondary)]"
                >
                  <span className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{c.descricao}</span>
                  <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>{formatCurrency(c.custo_calculado)}/{c.unidade}</span>
                </button>
              ))}
              {fonte === 'sinapi' && composicoesSinapi.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelecionado({ fonte: 'sinapi', sinapiComposicaoId: c.id, codigo: c.codigo, descricao: c.descricao, unidade: c.unidade, preco: Number(c.custos?.[uf] ?? c.custo_unitario ?? 0), classificacao: null })}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-[var(--bg-secondary)]"
                >
                  <span className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{c.descricao}</span>
                  <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>{formatCurrency(Number(c.custos?.[uf] ?? c.custo_unitario ?? 0))}/{c.unidade}</span>
                </button>
              ))}
              {fonte === 'insumo' && insumos.map(ins => (
                <button
                  key={ins.id}
                  onClick={() => setSelecionado({ fonte: 'insumo', codigo: ins.codigo, descricao: ins.descricao, unidade: ins.unidade, preco: ins.preco_unitario, classificacao: ins.classificacao })}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-[var(--bg-secondary)]"
                >
                  <span className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{ins.descricao}</span>
                  <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>{formatCurrency(ins.preco_unitario)}/{ins.unidade}</span>
                </button>
              ))}
              {!carregando && ((fonte === 'propria' && composicoesPropriasFiltradas.length === 0) || (fonte === 'sinapi' && composicoesSinapi.length === 0 && busca.trim()) || (fonte === 'insumo' && insumos.length === 0 && busca.trim())) && (
                <p className="text-sm text-center py-6" style={{ color: 'var(--text-secondary)' }}>Nenhum resultado.</p>
              )}
            </div>
          )}
        </>
      )}

      <Input
        label={`Quantidade${selecionado ? ` (${selecionado.unidade})` : ''}`}
        type="text"
        inputMode="decimal"
        value={quantidade}
        onChange={e => setQuantidade(e.target.value)}
        placeholder="A conferir"
      />

      {erro && (
        <p className="text-sm rounded-lg px-3 py-2" style={{ color: 'var(--danger)', background: 'rgba(239,68,68,0.08)' }}>{erro}</p>
      )}

      <Button onClick={confirmar} loading={salvando} disabled={!podeConfirmar || salvando} className="w-full justify-center">
        Adicionar
      </Button>
    </div>
  )
}
