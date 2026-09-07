'use client'

// Telas 4 e 5 do fluxo de referência (aqui juntas numa tela com toggle, não
// duas telas separadas — o conteúdo é pequeno o suficiente pra caber sem
// densidade excessiva): detalhe do serviço + composição por categoria +
// lista de insumos. Insumos vêm de orcamento_item_insumos_detalhe() — nunca
// recalculados aqui; classificação/rollup por categoria é só agrupamento
// dos valores que a função já devolve.
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { InsumoDetalhe, LinhaArvore } from './types'

const LABEL_CATEGORIA: Record<string, string> = {
  MATERIAL_SERVICOS: 'Materiais',
  MAO_DE_OBRA: 'Mão de obra',
  EQUIPAMENTO: 'Equipamentos',
}

export function OrcamentoItemDetalhe({
  itemId, linhas, onVoltar,
}: {
  itemId: string
  linhas: LinhaArvore[]
  onVoltar: () => void
}) {
  const supabase = createClient()
  const [insumos, setInsumos] = useState<InsumoDetalhe[] | null>(null)
  const [carregandoInsumos, setCarregandoInsumos] = useState(false)
  const [mostrarInsumos, setMostrarInsumos] = useState(false)

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

  const precoUnitario = item.quantidade && item.quantidade > 0 ? item.valor / item.quantidade : null
  const totalCategorias = porCategoria.MATERIAL_SERVICOS + porCategoria.MAO_DE_OBRA + porCategoria.EQUIPAMENTO

  return (
    <div className="flex flex-col gap-4">
      <button onClick={onVoltar} className="inline-flex items-center gap-2 text-sm w-fit" style={{ color: 'var(--text-secondary)' }}>
        <ArrowLeft size={16} /> Voltar
      </button>

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
