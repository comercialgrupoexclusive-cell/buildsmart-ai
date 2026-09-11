'use client'

// Tela de item do BOQ — abre direto em edição (P4.4, seção 6: "remover o
// passo intermediário Detalhe → Editar"). Descrição/unidade/quantidade
// sempre editáveis (gravam direto nas colunas snapshot que o motor lê).
// Valor unitário só é editável quando o item NÃO tem composição — quando
// tem, o valor vem sempre da soma ao vivo dos insumos da composição
// (orcamento_item_valor), editar um número aqui não mudaria nada de
// verdade e criaria a falsa impressão de que mudou; a seção de composição
// abaixo explica a origem do valor e permite chegar aos insumos.
//
// Exclusão passa por lib/orcamento/vinculos.ts: bloqueia com mensagem clara
// quando há avanço físico registrado, compra ou material vinculado — nunca
// apaga histórico em cascata silenciosamente.
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ChevronDown, ChevronUp, MoreVertical, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { excluirItemComVinculo } from '@/lib/orcamento/vinculos'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { InsumoDetalhe, LinhaArvore } from './types'

const LABEL_CATEGORIA: Record<string, string> = {
  MATERIAL_SERVICOS: 'Materiais',
  MAO_DE_OBRA: 'Mão de obra',
  EQUIPAMENTO: 'Equipamentos',
}

export function OrcamentoItemDetalhe({
  itemId, linhas, onVoltar, onAtualizado, onExcluido,
}: {
  itemId: string
  linhas: LinhaArvore[]
  onVoltar: () => void
  onAtualizado: () => Promise<void>
  onExcluido: () => Promise<void>
}) {
  const supabase = createClient()
  const [insumos, setInsumos] = useState<InsumoDetalhe[] | null>(null)
  const [carregandoInsumos, setCarregandoInsumos] = useState(false)
  const [mostrarInsumos, setMostrarInsumos] = useState(false)
  const [menuAberto, setMenuAberto] = useState(false)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [excluindo, setExcluindo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const item = useMemo(() => linhas.find(l => l.item_id === itemId), [linhas, itemId])
  const temComposicao = Boolean(item?.composicao_id)

  // Inicialização "preguiçosa" a partir do item encontrado no primeiro
  // render — o componente é montado com key={itemId} em ProcessoOrcamento.tsx,
  // então trocar de item sempre remonta (nunca reaproveita este estado com
  // dados do item anterior), sem precisar de um efeito com setState.
  const [descricao, setDescricao] = useState(() => item?.item_descricao || '')
  const [unidade, setUnidade] = useState(() => item?.unidade || '')
  const [quantidade, setQuantidade] = useState(() => (item?.quantidade != null ? String(item.quantidade) : ''))
  const [precoUnitarioEdit, setPrecoUnitarioEdit] = useState(() => (item?.preco_unitario_snapshot != null ? String(item.preco_unitario_snapshot) : ''))

  useEffect(() => {
    if (!temComposicao || insumos !== null) return
    const timer = window.setTimeout(() => {
      setCarregandoInsumos(true)
      supabase.rpc('orcamento_item_insumos_detalhe', { p_item_id: itemId })
        .then((res: { data: InsumoDetalhe[] | null }) => setInsumos(res.data || []))
        .finally(() => setCarregandoInsumos(false))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [temComposicao, insumos, supabase, itemId])

  const porCategoria = useMemo(() => {
    const acc: Record<string, number> = { MATERIAL_SERVICOS: 0, MAO_DE_OBRA: 0, EQUIPAMENTO: 0 }
    for (const ins of insumos || []) {
      const chave = acc[ins.classificacao] !== undefined ? ins.classificacao : 'MATERIAL_SERVICOS'
      acc[chave] += ins.valor_total
    }
    return acc
  }, [insumos])

  if (!item) {
    return (
      <div className="flex flex-col gap-4">
        <button onClick={onVoltar} className="inline-flex items-center gap-2 text-sm w-fit" style={{ color: 'var(--text-secondary)' }}>
          <ArrowLeft size={16} /> Voltar
        </button>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Serviço não encontrado.</p>
      </div>
    )
  }

  const totalCategorias = porCategoria.MATERIAL_SERVICOS + porCategoria.MAO_DE_OBRA + porCategoria.EQUIPAMENTO

  async function salvar() {
    setErro(null)
    if (!descricao.trim()) { setErro('Descrição obrigatória.'); return }
    setSalvando(true)
    try {
      const qtdNormalizada = quantidade.trim().replace(',', '.')
      const qtd = qtdNormalizada ? parseFloat(qtdNormalizada) : null
      const patch: Record<string, unknown> = {
        descricao_snapshot: descricao.trim(),
        unidade_snapshot: unidade.trim() || 'UN',
        quantidade: qtd != null && !isNaN(qtd) ? qtd : null,
      }
      if (!temComposicao) {
        const precoLimpo = precoUnitarioEdit.replace(/[^\d,.-]/g, '').replace(',', '.')
        const preco = precoLimpo ? parseFloat(precoLimpo) : null
        patch.preco_unitario_snapshot = preco != null && !isNaN(preco) ? preco : null
      }
      const { error } = await supabase.from('orcamento_itens').update(patch).eq('id', itemId)
      if (error) throw error
      await onAtualizado()
      onVoltar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  async function excluir() {
    setExcluindo(true)
    setErro(null)
    try {
      await excluirItemComVinculo(supabase, itemId)
      await onExcluido()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível excluir.')
      setExcluindo(false)
      setConfirmandoExclusao(false)
      setMenuAberto(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <button onClick={onVoltar} className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <ArrowLeft size={16} /> Cancelar
        </button>
        <div className="flex items-center gap-1">
          <div className="relative">
            <button
              onClick={() => setMenuAberto(v => !v)}
              className="p-2 rounded-lg hover:bg-[var(--bg-secondary)]"
              aria-label="Mais ações"
            >
              <MoreVertical size={16} style={{ color: 'var(--text-secondary)' }} />
            </button>
            {menuAberto && !confirmandoExclusao && (
              <div
                className="absolute right-0 top-full mt-1.5 z-20 w-48 rounded-xl py-1.5 shadow-lg"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
              >
                <button
                  onClick={() => setConfirmandoExclusao(true)}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm"
                  style={{ color: 'var(--danger)' }}
                >
                  <Trash2 size={14} /> Excluir serviço
                </button>
              </div>
            )}
          </div>
          <Button size="sm" onClick={salvar} loading={salvando}>Salvar</Button>
        </div>
      </div>

      {confirmandoExclusao && (
        <div className="card p-4 flex flex-col gap-3" style={{ border: '1px solid var(--danger)' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--danger)' }}>Excluir este serviço? Não pode ser desfeito.</p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" className="flex-1" onClick={() => { setConfirmandoExclusao(false); setMenuAberto(false) }}>Cancelar</Button>
            <Button variant="danger" size="sm" className="flex-1" onClick={excluir} loading={excluindo}>Confirmar exclusão</Button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        {item.item_codigo && <Badge variant="default">{item.item_codigo}</Badge>}
        {item.classificacao && <Badge variant="default">{LABEL_CATEGORIA[item.classificacao] || item.classificacao}</Badge>}
      </div>

      <Input label="Descrição" value={descricao} onChange={e => setDescricao(e.target.value)} />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Quantidade" type="text" inputMode="decimal" value={quantidade} onChange={e => setQuantidade(e.target.value)} placeholder="A conferir" />
        <Input label="Unidade" value={unidade} onChange={e => setUnidade(e.target.value)} />
      </div>
      {temComposicao ? (
        <p className="text-xs rounded-lg px-3 py-2" style={{ color: 'var(--text-secondary)', background: 'var(--bg-secondary)' }}>
          Valor unitário calculado a partir dos insumos da composição — para mudar, ajuste os insumos ou a quantidade.
        </p>
      ) : (
        <Input label="Valor unitário" type="text" inputMode="decimal" value={precoUnitarioEdit} onChange={e => setPrecoUnitarioEdit(e.target.value)} placeholder="A conferir" />
      )}

      <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ background: 'var(--bg-secondary)' }}>
        <span className="text-xs font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>Total do serviço</span>
        <span className="text-base font-bold tabular-nums" style={{ color: 'var(--accent)' }}>{formatCurrency(item.valor)}</span>
      </div>

      {erro && (
        <p className="text-sm rounded-lg px-3 py-2" style={{ color: 'var(--danger)', background: 'rgba(239,68,68,0.08)' }}>{erro}</p>
      )}

      {temComposicao && (
        <div className="card p-4 flex flex-col gap-3">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Composição</h3>
          {carregandoInsumos ? (
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Carregando...</p>
          ) : totalCategorias === 0 ? (
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Sem insumos com preço vigente.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {(['MATERIAL_SERVICOS', 'MAO_DE_OBRA', 'EQUIPAMENTO'] as const).filter(cat => porCategoria[cat] > 0).map(cat => (
                <div key={cat} className="flex items-center justify-between text-sm">
                  <span style={{ color: 'var(--text-secondary)' }}>{LABEL_CATEGORIA[cat]}</span>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums" style={{ color: 'var(--text-primary)' }}>{formatCurrency(porCategoria[cat])}</span>
                    <span className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>{Math.round((porCategoria[cat] / totalCategorias) * 100)}%</span>
                  </span>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => setMostrarInsumos(v => !v)}
            className="flex items-center justify-between text-xs font-medium pt-2 border-t"
            style={{ color: 'var(--accent)', borderColor: 'var(--border)' }}
          >
            {mostrarInsumos ? 'Ocultar insumos' : `Ver ${insumos?.length ?? ''} insumos`}
            {mostrarInsumos ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {mostrarInsumos && (
            <div className="flex flex-col gap-2.5">
              {(insumos || []).map((ins, i) => (
                <div key={`${ins.codigo}-${i}`} className="flex items-start justify-between gap-3 rounded-lg px-3 py-2" style={{ background: 'var(--bg-secondary)' }}>
                  <div className="min-w-0">
                    <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{ins.descricao}</p>
                    <p className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                      {ins.quantidade_adotada} {ins.unidade} × {formatCurrency(ins.preco_unitario)}
                    </p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums flex-shrink-0" style={{ color: 'var(--text-primary)' }}>{formatCurrency(ins.valor_total)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
