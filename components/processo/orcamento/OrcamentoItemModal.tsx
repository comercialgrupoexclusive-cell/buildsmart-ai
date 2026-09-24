'use client'

// Modal "Adicionar item" — a ÚNICA porta de inclusão no Orçamento (referência
// 08). O primeiro item e o centésimo entram pelo mesmo lugar: por isso o modal
// escolhe/cria a etapa e, opcionalmente, a subetapa aqui dentro — não existe
// mais um formulário "Começar orçamento" separado.
//
// Reaproveita o motor inteiro: buscar-catalogo (Composições próprias, SINAPI,
// Insumos), resolverGrupoId (subetapa por nome) e inserirItemOrcamento — mesmo
// caminho canônico de escrita usado por TemplateOrcamentoModal. Nenhuma
// fórmula de valor nem insert à mão aqui.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, Plus, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import {
  buscarComposicoesProprias, buscarComposicoesSinapi, buscarInsumosCatalogo,
  type ComposicaoPropriaComCusto, type SinapiComposicaoResumo, type InsumoCatalogo,
} from '@/lib/orcamento/buscar-catalogo'
import { inserirItemOrcamento, resolverGrupoId, type NovoItemOrcamento, type ClassificacaoInsumo } from '@/lib/orcamento/inserir-item'
import { LinhaArvore } from './types'

type Fonte = 'propria' | 'insumo' | 'sinapi' | 'livre'

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
  { id: 'propria', label: 'Composições Próprias' },
  { id: 'insumo', label: 'Insumos' },
  { id: 'sinapi', label: 'Referência SINAPI' },
  { id: 'livre', label: 'Item livre' },
]

type EtapaOpcao = { id: string; nome: string }

export function OrcamentoItemModal({
  aberto, orcamentoId, processoId, uf, linhas,
  etapaInicial = null, grupoInicial = null,
  onFechar, onInserido,
}: {
  aberto: boolean
  orcamentoId: string
  processoId: string | null
  uf: string
  linhas: LinhaArvore[]
  etapaInicial?: string | null
  grupoInicial?: string | null
  onFechar: () => void
  onInserido: () => Promise<void>
}) {
  const supabase = useMemo(() => createClient(), [])

  const [etapas, setEtapas] = useState<EtapaOpcao[]>([])
  const [etapaId, setEtapaId] = useState<string>(etapaInicial ?? '')
  const [criandoEtapa, setCriandoEtapa] = useState(false)
  const [nomeNovaEtapa, setNomeNovaEtapa] = useState('')

  const [agruparAberto, setAgruparAberto] = useState(Boolean(grupoInicial))
  const [subetapaNome, setSubetapaNome] = useState('')

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

  // Subetapas já existentes na etapa escolhida — sugeridas para reaproveitar
  // em vez de recriar um serviço com o mesmo nome.
  const subetapasDaEtapa = useMemo(() => {
    if (!etapaId) return []
    return linhas
      .filter(l => l.tipo_linha === 'subetapa' && l.etapa_id === etapaId)
      .map(l => l.grupo_nome || l.item_descricao || '')
      .filter(Boolean)
  }, [linhas, etapaId])

  const carregarEtapas = useCallback(async () => {
    const { data } = await supabase
      .from('etapas')
      .select('id, nome, ordem')
      .eq('orcamento_id', orcamentoId)
      .order('ordem')
    setEtapas(((data ?? []) as { id: string; nome: string }[]).map(e => ({ id: e.id, nome: e.nome })))
  }, [supabase, orcamentoId])

  useEffect(() => {
    if (!aberto) return
    const timer = window.setTimeout(() => { void carregarEtapas() }, 0)
    return () => window.clearTimeout(timer)
  }, [aberto, carregarEtapas])

  // Composições próprias: carregadas uma vez, filtradas no cliente.
  useEffect(() => {
    if (!aberto || fonte !== 'propria' || composicoesProprias !== null) return
    const timer = window.setTimeout(() => {
      setCarregando(true)
      buscarComposicoesProprias(supabase, uf).then(setComposicoesProprias).finally(() => setCarregando(false))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [aberto, fonte, composicoesProprias, supabase, uf])

  // SINAPI / insumos: busca no servidor conforme o termo.
  useEffect(() => {
    if (!aberto || (fonte !== 'sinapi' && fonte !== 'insumo')) return
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
  }, [aberto, fonte, busca, supabase, uf])

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

  async function criarEtapa() {
    const nome = nomeNovaEtapa.trim()
    if (!nome) return
    setErro(null)
    try {
      const { data: ultimas } = await supabase
        .from('etapas').select('ordem').eq('orcamento_id', orcamentoId).order('ordem', { ascending: false }).limit(1)
      const proximaOrdem = Number(ultimas?.[0]?.ordem ?? 0) + 1
      const { data, error } = await supabase
        .from('etapas')
        .insert({ processo_id: processoId, orcamento_id: orcamentoId, nome, status: 'planejada', ordem: proximaOrdem })
        .select('id, nome')
        .single()
      if (error || !data) throw error || new Error('Falha ao criar etapa.')
      await carregarEtapas()
      setEtapaId(data.id as string)
      setNomeNovaEtapa('')
      setCriandoEtapa(false)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível criar a etapa.')
    }
  }

  async function inserir() {
    setErro(null)
    if (!etapaId) { setErro('Escolha a etapa.'); return }
    const qtdNormalizada = quantidade.trim().replace(',', '.')
    const qtd = qtdNormalizada ? parseFloat(qtdNormalizada) : null
    if (fonte === 'livre' && !livreDescricao.trim()) { setErro('Descrição obrigatória.'); return }
    if (fonte !== 'livre' && !selecionado) { setErro('Selecione um item da lista.'); return }

    setSalvando(true)
    try {
      const nomeSub = subetapaNome.trim()
      const grupoId = nomeSub
        ? await resolverGrupoId(supabase, { orcamentoId, etapaId, nomeSubetapa: nomeSub })
        : (grupoInicial ?? null)

      const base = {
        orcamentoId,
        etapaId,
        grupoId,
        subetapa: nomeSub || null,
        quantidade: qtd != null && !isNaN(qtd) ? qtd : null,
        ordem: null,
      }
      let novoItem: NovoItemOrcamento
      if (fonte === 'livre') {
        const precoLimpo = livrePreco.replace(/[^\d,.-]/g, '').replace(',', '.')
        const preco = precoLimpo ? parseFloat(precoLimpo) : null
        novoItem = { ...base, descricao: livreDescricao.trim(), unidade: livreUnidade.trim() || 'UN', classificacao: livreClassificacao, fonte: 'item_livre', precoUnitario: preco != null && !isNaN(preco) ? preco : null }
      } else if (selecionado!.fonte === 'propria') {
        novoItem = { ...base, descricao: selecionado!.descricao, unidade: selecionado!.unidade, classificacao: selecionado!.classificacao, fonte: 'propria', composicaoId: selecionado!.composicaoId, codigo: selecionado!.codigo, precoUnitario: selecionado!.preco }
      } else if (selecionado!.fonte === 'sinapi') {
        novoItem = { ...base, descricao: selecionado!.descricao, unidade: selecionado!.unidade, classificacao: selecionado!.classificacao, fonte: 'sinapi', sinapiComposicaoId: selecionado!.sinapiComposicaoId, codigo: selecionado!.codigo, precoUnitario: selecionado!.preco }
      } else {
        novoItem = { ...base, descricao: selecionado!.descricao, unidade: selecionado!.unidade, classificacao: selecionado!.classificacao, fonte: 'insumo', codigo: selecionado!.codigo, precoUnitario: selecionado!.preco }
      }
      await inserirItemOrcamento(supabase, novoItem)
      // Reset leve para permitir lançar vários itens seguidos sem reabrir.
      setSelecionado(null)
      setQuantidade('')
      setLivreDescricao('')
      setLivrePreco('')
      setBusca('')
      await onInserido()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível adicionar o item.')
    } finally {
      setSalvando(false)
    }
  }

  const podeInserir = Boolean(etapaId) && (fonte === 'livre' ? livreDescricao.trim().length > 0 : Boolean(selecionado))

  return (
    <Modal open={aberto} onClose={onFechar} title="Adicionar item" size="lg">
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Etapa</label>
          <div className="mt-1.5 flex gap-2">
            <Select value={etapaId} onChange={e => setEtapaId(e.target.value)} className="flex-1">
              <option value="">— Selecionar etapa —</option>
              {etapas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </Select>
            <button
              type="button"
              onClick={() => setCriandoEtapa(v => !v)}
              aria-label="Criar etapa"
              className="grid size-10 flex-shrink-0 place-items-center rounded-lg"
              style={{ background: 'var(--accent)', color: 'white' }}
            >
              <Plus size={16} />
            </button>
          </div>
          {criandoEtapa && (
            <div className="mt-2 flex gap-2">
              <Input value={nomeNovaEtapa} onChange={e => setNomeNovaEtapa(e.target.value)} placeholder="Nome da nova etapa" autoFocus
                onKeyDown={e => { if (e.key === 'Enter') void criarEtapa() }} />
              <Button size="sm" onClick={() => void criarEtapa()} disabled={!nomeNovaEtapa.trim()}>Criar</Button>
            </div>
          )}
        </div>

        <div>
          <button
            type="button"
            onClick={() => setAgruparAberto(v => !v)}
            className="inline-flex items-center gap-1.5 text-sm font-medium"
            style={{ color: 'var(--accent)' }}
          >
            {agruparAberto ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            Agrupar em um serviço (subetapa opcional)
          </button>
          {agruparAberto && (
            <div className="mt-2">
              <Input
                value={subetapaNome}
                onChange={e => setSubetapaNome(e.target.value)}
                placeholder="Nome do serviço / subetapa"
                list="subetapas-existentes"
              />
              {subetapasDaEtapa.length > 0 && (
                <datalist id="subetapas-existentes">
                  {subetapasDaEtapa.map((nome, i) => <option key={i} value={nome} />)}
                </datalist>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-1 p-1 rounded-xl w-full overflow-x-auto" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          {FONTES.map(f => (
            <button
              key={f.id}
              type="button"
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
            <Input label="Descrição *" value={livreDescricao} onChange={e => setLivreDescricao(e.target.value)} placeholder="Ex: Frete, projeto, taxa..." />
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
                placeholder={fonte === 'propria' ? 'Buscar composição...' : fonte === 'sinapi' ? 'Buscar composição SINAPI...' : 'Buscar insumo...'}
                className="input-base pl-9 w-full"
              />
            </div>

            {selecionado ? (
              <div className="card p-4 flex flex-col gap-2" style={{ border: '1px solid var(--accent)' }}>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{selecionado.descricao}</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{formatCurrency(selecionado.preco)}/{selecionado.unidade}</p>
                <button type="button" onClick={() => setSelecionado(null)} className="text-xs font-medium w-fit" style={{ color: 'var(--accent)' }}>Trocar seleção</button>
              </div>
            ) : carregando ? (
              <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>
            ) : (
              <div className="flex flex-col divide-y max-h-64 overflow-y-auto rounded-xl" style={{ border: '1px solid var(--border)', '--tw-divide-color': 'var(--border)' } as React.CSSProperties}>
                {fonte === 'propria' && composicoesPropriasFiltradas.map(c => (
                  <button key={c.id} type="button" onClick={() => setSelecionado({ fonte: 'propria', composicaoId: c.id, codigo: c.codigo, descricao: c.descricao, unidade: c.unidade, preco: c.custo_calculado, classificacao: null })} className="flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-[var(--bg-secondary)]">
                    <span className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{c.descricao}</span>
                    <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>{formatCurrency(c.custo_calculado)}/{c.unidade}</span>
                  </button>
                ))}
                {fonte === 'sinapi' && composicoesSinapi.map(c => (
                  <button key={c.id} type="button" onClick={() => setSelecionado({ fonte: 'sinapi', sinapiComposicaoId: c.id, codigo: c.codigo, descricao: c.descricao, unidade: c.unidade, preco: Number(c.custos?.[uf] ?? c.custo_unitario ?? 0), classificacao: null })} className="flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-[var(--bg-secondary)]">
                    <span className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{c.descricao}</span>
                    <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>{formatCurrency(Number(c.custos?.[uf] ?? c.custo_unitario ?? 0))}/{c.unidade}</span>
                  </button>
                ))}
                {fonte === 'insumo' && insumos.map(ins => (
                  <button key={ins.id} type="button" onClick={() => setSelecionado({ fonte: 'insumo', codigo: ins.codigo, descricao: ins.descricao, unidade: ins.unidade, preco: ins.preco_unitario, classificacao: ins.classificacao })} className="flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-[var(--bg-secondary)]">
                    <span className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{ins.descricao}</span>
                    <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>{formatCurrency(ins.preco_unitario)}/{ins.unidade}</span>
                  </button>
                ))}
                {!carregando && ((fonte === 'propria' && composicoesPropriasFiltradas.length === 0) || (fonte === 'sinapi' && composicoesSinapi.length === 0) || (fonte === 'insumo' && insumos.length === 0)) && (
                  <p className="text-sm text-center py-6" style={{ color: 'var(--text-secondary)' }}>
                    {fonte === 'propria' ? 'Nenhuma composição própria.' : 'Digite para buscar.'}
                  </p>
                )}
              </div>
            )}

            <Input
              label={`Quantidade${selecionado ? ` (${selecionado.unidade})` : ''}`}
              type="text"
              inputMode="decimal"
              value={quantidade}
              onChange={e => setQuantidade(e.target.value)}
              placeholder="A conferir"
            />
          </>
        )}

        {erro && <p className="text-sm rounded-lg px-3 py-2" style={{ color: 'var(--danger)', background: 'rgba(239,68,68,0.08)' }}>{erro}</p>}

        <div className="flex justify-between gap-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
          <Button variant="secondary" onClick={onFechar} disabled={salvando}>Fechar</Button>
          <Button onClick={() => void inserir()} loading={salvando} disabled={!podeInserir}>Inserir</Button>
        </div>
      </div>
    </Modal>
  )
}
