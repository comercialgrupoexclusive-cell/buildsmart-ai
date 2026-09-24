'use client'

// Modal "Lançar item" — ÚNICA porta de entrada do orçamento (referência 08).
// Melhorias canônicas vs versão anterior:
// · subetapa pré-preenchida quando vem do contexto de uma subetapa (grupoInicial)
// · subetapas existentes mostradas como chips clicáveis, não datalist
// · quantidade fica junto ao item selecionado, não isolada no rodapé
// · labels das abas curtas para caber no mobile sem overflow
// · item livre tem campo de quantidade
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Loader2, Plus, Search, X } from 'lucide-react'
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

// Labels curtas para caber no mobile (4 abas em linha).
const FONTES: { id: Fonte; label: string }[] = [
  { id: 'propria', label: 'Composição' },
  { id: 'insumo', label: 'Insumo' },
  { id: 'sinapi', label: 'SINAPI' },
  { id: 'livre', label: 'Livre' },
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

  // Subetapa pré-preenchida quando vem do contexto de uma subetapa existente.
  const [subetapaAberta, setSubetapaAberta] = useState(Boolean(grupoInicial))
  const [subetapaNome, setSubetapaNome] = useState(() => {
    if (!grupoInicial) return ''
    const linha = linhas.find(l => l.tipo_linha === 'subetapa' && l.item_id === grupoInicial)
    return linha?.grupo_nome || linha?.item_descricao || ''
  })

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
  const [livreQuantidade, setLivreQuantidade] = useState('')
  const [livreClassificacao, setLivreClassificacao] = useState<ClassificacaoInsumo>('MATERIAL_SERVICOS')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Subetapas existentes na etapa selecionada — chips clicáveis.
  const subetapasDaEtapa = useMemo(() => {
    if (!etapaId) return []
    return linhas
      .filter(l => l.tipo_linha === 'subetapa' && l.etapa_id === etapaId)
      .map(l => ({ id: l.item_id, nome: l.grupo_nome || l.item_descricao || '' }))
      .filter(s => s.nome)
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
    if (fonte === 'livre' && !livreDescricao.trim()) { setErro('Descrição obrigatória.'); return }
    if (fonte !== 'livre' && !selecionado) { setErro('Selecione um item da lista.'); return }

    setSalvando(true)
    try {
      const nomeSub = subetapaNome.trim()
      const grupoId = nomeSub
        ? await resolverGrupoId(supabase, { orcamentoId, etapaId, nomeSubetapa: nomeSub })
        : (grupoInicial ?? null)

      const parseQtd = (v: string) => {
        const n = parseFloat(v.trim().replace(',', '.'))
        return isNaN(n) ? null : n
      }

      const base = { orcamentoId, etapaId, grupoId, subetapa: nomeSub || null, ordem: null }
      let novoItem: NovoItemOrcamento
      if (fonte === 'livre') {
        const precoLimpo = livrePreco.replace(/[^\d,.-]/g, '').replace(',', '.')
        const preco = precoLimpo ? parseFloat(precoLimpo) : null
        novoItem = {
          ...base,
          quantidade: parseQtd(livreQuantidade),
          descricao: livreDescricao.trim(),
          unidade: livreUnidade.trim() || 'UN',
          classificacao: livreClassificacao,
          fonte: 'item_livre',
          precoUnitario: preco != null && !isNaN(preco) ? preco : null,
        }
      } else if (selecionado!.fonte === 'propria') {
        novoItem = { ...base, quantidade: parseQtd(quantidade), descricao: selecionado!.descricao, unidade: selecionado!.unidade, classificacao: selecionado!.classificacao, fonte: 'propria', composicaoId: selecionado!.composicaoId, codigo: selecionado!.codigo, precoUnitario: selecionado!.preco }
      } else if (selecionado!.fonte === 'sinapi') {
        novoItem = { ...base, quantidade: parseQtd(quantidade), descricao: selecionado!.descricao, unidade: selecionado!.unidade, classificacao: selecionado!.classificacao, fonte: 'sinapi', sinapiComposicaoId: selecionado!.sinapiComposicaoId, codigo: selecionado!.codigo, precoUnitario: selecionado!.preco }
      } else {
        novoItem = { ...base, quantidade: parseQtd(quantidade), descricao: selecionado!.descricao, unidade: selecionado!.unidade, classificacao: selecionado!.classificacao, fonte: 'insumo', codigo: selecionado!.codigo, precoUnitario: selecionado!.preco }
      }
      await inserirItemOrcamento(supabase, novoItem)
      // Reset leve para lançar itens seguidos sem reabrir.
      setSelecionado(null)
      setQuantidade('')
      setLivreDescricao('')
      setLivrePreco('')
      setLivreQuantidade('')
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
    <Modal open={aberto} onClose={onFechar} title="Lançar item" size="lg">
      <div className="space-y-4">

        {/* ── Etapa ───────────────────────────────────────────────── */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
            Etapa
          </label>
          <div className="mt-1.5 flex gap-2">
            <Select value={etapaId} onChange={e => setEtapaId(e.target.value)} className="flex-1">
              <option value="">— Selecionar etapa —</option>
              {etapas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </Select>
            <button
              type="button"
              onClick={() => setCriandoEtapa(v => !v)}
              aria-label="Nova etapa"
              className="grid size-10 flex-shrink-0 place-items-center rounded-lg"
              style={{ background: 'var(--accent)', color: 'white' }}
            >
              <Plus size={16} />
            </button>
          </div>
          {criandoEtapa && (
            <div className="mt-2 flex gap-2">
              <Input
                value={nomeNovaEtapa}
                onChange={e => setNomeNovaEtapa(e.target.value)}
                placeholder="Nome da nova etapa"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') void criarEtapa() }}
              />
              <Button size="sm" onClick={() => void criarEtapa()} disabled={!nomeNovaEtapa.trim()}>Criar</Button>
            </div>
          )}
        </div>

        {/* ── Serviço / subetapa ───────────────────────────────────── */}
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={() => setSubetapaAberta(v => !v)}
            className="flex items-center justify-between w-full px-3.5 py-2.5 text-sm font-medium"
            style={{
              background: 'var(--bg-secondary)',
              color: subetapaNome ? 'var(--accent)' : 'var(--text-secondary)',
            }}
          >
            <span className="flex items-center gap-2 min-w-0">
              {subetapaNome
                ? <><Check size={14} className="flex-shrink-0" /><span className="truncate">{subetapaNome}</span></>
                : <>Serviço / subetapa <span className="font-normal opacity-60">(opcional)</span></>
              }
            </span>
            {subetapaNome
              ? (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setSubetapaNome('') }}
                  className="flex-shrink-0 p-0.5 rounded"
                  aria-label="Limpar serviço"
                >
                  <X size={13} />
                </button>
              )
              : null
            }
          </button>

          {subetapaAberta && (
            <div className="px-3.5 pb-3.5 pt-3 flex flex-col gap-2.5" style={{ borderTop: '1px solid var(--border)' }}>
              {/* Chips de subetapas existentes na etapa */}
              {subetapasDaEtapa.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {subetapasDaEtapa.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSubetapaNome(prev => prev === s.nome ? '' : s.nome)}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                      style={
                        subetapaNome === s.nome
                          ? { background: 'var(--accent)', color: 'white' }
                          : { background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }
                      }
                    >
                      {s.nome}
                    </button>
                  ))}
                </div>
              )}
              <Input
                value={subetapaNome}
                onChange={e => setSubetapaNome(e.target.value)}
                placeholder={subetapasDaEtapa.length > 0 ? 'Ou criar novo serviço...' : 'Nome do serviço'}
              />
            </div>
          )}
        </div>

        {/* ── Abas de fonte ───────────────────────────────────────── */}
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          {FONTES.map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => selecionarFonte(f.id)}
              className="flex-1 py-2 rounded-lg text-xs font-medium transition-all"
              style={fonte === f.id ? { background: 'var(--accent)', color: 'white' } : { color: 'var(--text-secondary)' }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* ── Conteúdo da fonte ────────────────────────────────────── */}
        {fonte === 'livre' ? (
          <div className="flex flex-col gap-3">
            <Input label="Descrição *" value={livreDescricao} onChange={e => setLivreDescricao(e.target.value)} placeholder="Ex: Frete, projeto, taxa..." />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Quantidade" type="text" inputMode="decimal" value={livreQuantidade} onChange={e => setLivreQuantidade(e.target.value)} placeholder="A conferir" />
              <Input label="Unidade" value={livreUnidade} onChange={e => setLivreUnidade(e.target.value)} placeholder="UN" />
            </div>
            <Input label="Valor unitário" type="text" inputMode="decimal" value={livrePreco} onChange={e => setLivrePreco(e.target.value)} placeholder="A conferir" />
            <Select label="Classificação" value={livreClassificacao} onChange={e => setLivreClassificacao(e.target.value as ClassificacaoInsumo)}>
              <option value="MATERIAL_SERVICOS">Material / Serviço</option>
              <option value="MAO_DE_OBRA">Mão de obra</option>
              <option value="EQUIPAMENTO">Equipamento</option>
            </Select>
          </div>
        ) : (
          <>
            {/* Busca */}
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
              <input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder={
                  fonte === 'propria' ? 'Buscar composição...'
                  : fonte === 'sinapi' ? 'Buscar no SINAPI...'
                  : 'Buscar insumo...'
                }
                className="input-base pl-9 w-full"
              />
            </div>

            {/* Item selecionado + quantidade juntos */}
            {selecionado ? (
              <div className="rounded-xl p-3.5 flex flex-col gap-3" style={{ border: '1px solid var(--accent)', background: 'var(--bg-secondary)' }}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug" style={{ color: 'var(--text-primary)' }}>{selecionado.descricao}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{formatCurrency(selecionado.preco)}/{selecionado.unidade}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelecionado(null)}
                    className="flex-shrink-0 p-1.5 rounded-lg"
                    aria-label="Trocar"
                    style={{ background: 'var(--bg-card)' }}
                  >
                    <X size={13} style={{ color: 'var(--text-secondary)' }} />
                  </button>
                </div>
                <Input
                  label={`Quantidade (${selecionado.unidade})`}
                  type="text"
                  inputMode="decimal"
                  value={quantidade}
                  onChange={e => setQuantidade(e.target.value)}
                  placeholder="A conferir"
                />
              </div>
            ) : carregando ? (
              <div className="flex justify-center py-8">
                <Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent)' }} />
              </div>
            ) : (
              <div
                className="flex flex-col divide-y max-h-52 overflow-y-auto rounded-xl"
                style={{ border: '1px solid var(--border)', '--tw-divide-color': 'var(--border)' } as React.CSSProperties}
              >
                {fonte === 'propria' && composicoesPropriasFiltradas.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelecionado({ fonte: 'propria', composicaoId: c.id, codigo: c.codigo, descricao: c.descricao, unidade: c.unidade, preco: c.custo_calculado, classificacao: null })}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 text-left"
                    style={{ background: 'var(--bg-card)' }}
                  >
                    <span className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{c.descricao}</span>
                    <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>{formatCurrency(c.custo_calculado)}/{c.unidade}</span>
                  </button>
                ))}
                {fonte === 'sinapi' && composicoesSinapi.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelecionado({ fonte: 'sinapi', sinapiComposicaoId: c.id, codigo: c.codigo, descricao: c.descricao, unidade: c.unidade, preco: Number(c.custos?.[uf] ?? c.custo_unitario ?? 0), classificacao: null })}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 text-left"
                    style={{ background: 'var(--bg-card)' }}
                  >
                    <span className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{c.descricao}</span>
                    <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>{formatCurrency(Number(c.custos?.[uf] ?? c.custo_unitario ?? 0))}/{c.unidade}</span>
                  </button>
                ))}
                {fonte === 'insumo' && insumos.map(ins => (
                  <button
                    key={ins.id}
                    type="button"
                    onClick={() => setSelecionado({ fonte: 'insumo', codigo: ins.codigo, descricao: ins.descricao, unidade: ins.unidade, preco: ins.preco_unitario, classificacao: ins.classificacao })}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 text-left"
                    style={{ background: 'var(--bg-card)' }}
                  >
                    <span className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{ins.descricao}</span>
                    <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>{formatCurrency(ins.preco_unitario)}/{ins.unidade}</span>
                  </button>
                ))}
                {!carregando && (
                  (fonte === 'propria' && composicoesPropriasFiltradas.length === 0) ||
                  (fonte === 'sinapi' && composicoesSinapi.length === 0) ||
                  (fonte === 'insumo' && insumos.length === 0)
                ) && (
                  <p className="text-sm text-center py-6" style={{ color: 'var(--text-secondary)' }}>
                    {fonte === 'propria' ? 'Nenhuma composição própria.' : 'Digite para buscar.'}
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {erro && (
          <p className="text-sm rounded-lg px-3 py-2" style={{ color: 'var(--danger)', background: 'rgba(239,68,68,0.08)' }}>
            {erro}
          </p>
        )}

        <div className="flex justify-between gap-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
          <Button variant="secondary" onClick={onFechar} disabled={salvando}>Fechar</Button>
          <Button onClick={() => void inserir()} loading={salvando} disabled={!podeInserir}>Inserir</Button>
        </div>
      </div>
    </Modal>
  )
}
