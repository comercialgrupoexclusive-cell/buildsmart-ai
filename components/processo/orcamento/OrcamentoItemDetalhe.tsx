'use client'

// Telas 4 e 5 do fluxo de referência (aqui juntas numa tela com toggle, não
// duas telas separadas — o conteúdo é pequeno o suficiente pra caber sem
// densidade excessiva): detalhe do serviço + composição por categoria +
// lista de insumos, com edição/exclusão do serviço. Insumos vêm de
// orcamento_item_insumos_detalhe() — nunca recalculados aqui; classificação/
// rollup por categoria é só agrupamento dos valores que a função já devolve.
//
// Edição: descrição/unidade/quantidade sempre editáveis (gravam direto nas
// colunas snapshot que o motor lê). Valor unitário só é editável quando o
// item NÃO tem composicao_id — quando tem, o valor vem sempre da soma ao
// vivo dos insumos da composição (orcamento_item_valor), editar um número
// aqui não mudaria nada de verdade e criaria a falsa impressão de que mudou.
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
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
  const [editando, setEditando] = useState(false)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erroEdicao, setErroEdicao] = useState<string | null>(null)
  const [descricao, setDescricao] = useState('')
  const [unidade, setUnidade] = useState('')
  const [quantidade, setQuantidade] = useState('')
  const [precoUnitarioEdit, setPrecoUnitarioEdit] = useState('')

  const item = useMemo(() => linhas.find(l => l.item_id === itemId), [linhas, itemId])
  const temComposicao = Boolean(item?.composicao_id)

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

  // Composição própria: preço vem sempre da soma ao vivo dos insumos, só dá
  // pra mostrar como valor/quantidade. Fora isso (item livre/insumo/SINAPI),
  // o preço é o snapshot gravado — mostrar ele direto, não valor/quantidade,
  // senão "a conferir" na quantidade esconde um preço que já é conhecido.
  const precoUnitario = temComposicao
    ? (item.quantidade && item.quantidade > 0 ? item.valor / item.quantidade : null)
    : item.preco_unitario_snapshot
  const totalCategorias = porCategoria.MATERIAL_SERVICOS + porCategoria.MAO_DE_OBRA + porCategoria.EQUIPAMENTO

  function iniciarEdicao() {
    setDescricao(item!.item_descricao || '')
    setUnidade(item!.unidade || '')
    setQuantidade(item!.quantidade != null ? String(item!.quantidade) : '')
    setPrecoUnitarioEdit(item!.preco_unitario_snapshot != null ? String(item!.preco_unitario_snapshot) : '')
    setErroEdicao(null)
    setEditando(true)
  }

  async function salvarEdicao() {
    setErroEdicao(null)
    if (!descricao.trim()) { setErroEdicao('Descrição obrigatória.'); return }
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
      setEditando(false)
      await onAtualizado()
    } catch (e) {
      setErroEdicao(e instanceof Error ? e.message : 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  async function excluir() {
    setSalvando(true)
    try {
      const { error } = await supabase.from('orcamento_itens').delete().eq('id', itemId)
      if (error) throw error
      await onExcluido()
    } catch (e) {
      setErroEdicao(e instanceof Error ? e.message : 'Não foi possível excluir.')
      setSalvando(false)
      setConfirmandoExclusao(false)
    }
  }

  if (editando) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <button onClick={() => setEditando(false)} className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <ArrowLeft size={16} /> Cancelar
          </button>
          <Button size="sm" onClick={salvarEdicao} loading={salvando}>Salvar</Button>
        </div>

        <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Editar serviço</h2>

        <Input label="Descrição" value={descricao} onChange={e => setDescricao(e.target.value)} autoFocus />
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

        {erroEdicao && (
          <p className="text-sm rounded-lg px-3 py-2" style={{ color: 'var(--danger)', background: 'rgba(239,68,68,0.08)' }}>{erroEdicao}</p>
        )}

        <div className="pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
          {confirmandoExclusao ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm" style={{ color: 'var(--danger)' }}>Excluir este serviço? Não pode ser desfeito.</p>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" className="flex-1" onClick={() => setConfirmandoExclusao(false)}>Cancelar</Button>
                <Button variant="danger" size="sm" className="flex-1" onClick={excluir} loading={salvando}>Confirmar exclusão</Button>
              </div>
            </div>
          ) : (
            <button onClick={() => setConfirmandoExclusao(true)} className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--danger)' }}>
              <Trash2 size={14} /> Excluir serviço
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <button onClick={onVoltar} className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <ArrowLeft size={16} /> Voltar
        </button>
        <button onClick={iniciarEdicao} className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--accent)' }}>
          <Pencil size={14} /> Editar
        </button>
      </div>

      <div className="card p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{item.item_descricao}</h2>
          {item.item_codigo && <Badge variant="default">{item.item_codigo}</Badge>}
        </div>
        <div className="grid grid-cols-3 gap-3 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
          <div>
            <p className="text-[11px] uppercase font-semibold" style={{ color: 'var(--text-secondary)' }}>Quantidade</p>
            <p className="text-sm font-semibold tabular-nums" style={{ color: item.quantidade != null ? 'var(--text-primary)' : 'var(--warning)' }}>
              {item.quantidade != null ? `${item.quantidade} ${item.unidade || ''}` : 'A conferir'}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase font-semibold" style={{ color: 'var(--text-secondary)' }}>Valor unitário</p>
            <p className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
              {precoUnitario != null ? `${formatCurrency(precoUnitario)}/${item.unidade}` : '—'}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase font-semibold" style={{ color: 'var(--text-secondary)' }}>Total</p>
            <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--accent)' }}>{formatCurrency(item.valor)}</p>
          </div>
        </div>
      </div>

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
            <div className="flex flex-col divide-y" style={{ borderColor: 'var(--border)', '--tw-divide-color': 'var(--border)' } as React.CSSProperties}>
              {(insumos || []).map((ins, i) => (
                <div key={`${ins.codigo}-${i}`} className="py-2.5 flex items-start justify-between gap-3">
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
