// Tipos compartilhados da UI canônica do Orçamento no Processo. Uma linha
// aqui = uma linha de orcamento_arvore_valores() (RPC) — nenhum campo
// derivado por cálculo próprio; "valor" já vem de orcamento_item_valor()
// no banco, não é recalculado em nenhum lugar deste módulo.
export type LinhaArvore = {
  orcamento_id: string
  etapa_id: string | null
  etapa_nome: string | null
  etapa_ordem: number | null
  grupo_id: string | null
  grupo_nome: string | null
  item_id: string
  tipo_linha: 'item' | 'subetapa'
  tipo_item_snapshot: 'COMPOSICAO' | 'INSUMO' | 'ITEM_LIVRE' | null
  item_descricao: string | null
  item_codigo: string | null
  quantidade: number | null
  unidade: string | null
  classificacao: 'EQUIPAMENTO' | 'MAO_DE_OBRA' | 'MATERIAL_SERVICOS' | null
  ordem: number | null
  composicao_id: string | null
  sinapi_composicao_id: string | null
  subetapa_valor_manual_ativo: boolean | null
  valor_total_manual_ativo: boolean | null
  preco_unitario_snapshot: number | null
  valor: number
}

export type InsumoDetalhe = {
  origem: 'materializado' | 'composicao_viva'
  insumo_id: string | null
  codigo: string
  descricao: string
  unidade: string
  classificacao: 'EQUIPAMENTO' | 'MAO_DE_OBRA' | 'MATERIAL_SERVICOS' | string
  coeficiente: number | null
  quantidade_calculada: number | null
  quantidade_adotada: number | null
  preco_unitario: number
  valor_total: number
}

export type EtapaResumo = {
  id: string
  nome: string
  ordem: number
  valor: number
}

// Total do orçamento = soma dos itens-folha + delta das subetapas com valor
// manual ativo — mesma fórmula (não uma nova) que ObraOrcamento.tsx usa em
// `subtotal` (linhas ~885-892): quando uma subetapa tem valor manual, ele
// substitui a soma calculada dos itens dela, não se soma a ela.
export function calcularTotal(linhas: LinhaArvore[]): number {
  const itens = linhas.filter(l => l.tipo_linha === 'item')
  const subtotalItens = itens.reduce((acc, l) => acc + l.valor, 0)
  const subetapasManuais = linhas.filter(l => l.tipo_linha === 'subetapa' && l.subetapa_valor_manual_ativo)
  const ajusteManual = subetapasManuais.reduce((acc, sub) => {
    const calculado = itens.filter(i => i.grupo_id === sub.item_id).reduce((s, i) => s + i.valor, 0)
    return acc + (sub.valor - calculado)
  }, 0)
  return subtotalItens + ajusteManual
}

export const SEM_ETAPA_ID = '__sem_etapa__'

export function agruparPorEtapa(linhas: LinhaArvore[]): EtapaResumo[] {
  const porEtapa = new Map<string, EtapaResumo>()
  for (const l of linhas) {
    const etapaId = l.etapa_id || SEM_ETAPA_ID
    const atual = porEtapa.get(etapaId) || { id: etapaId, nome: l.etapa_nome || 'Sem etapa', ordem: l.etapa_ordem ?? Number.MAX_SAFE_INTEGER, valor: 0 }
    if (l.tipo_linha === 'item') {
      const donoDeSubetapaManual = l.grupo_id && linhas.some(s => s.item_id === l.grupo_id && s.tipo_linha === 'subetapa' && s.subetapa_valor_manual_ativo)
      if (!donoDeSubetapaManual) atual.valor += l.valor
    } else if (l.subetapa_valor_manual_ativo) {
      atual.valor += l.valor
    }
    porEtapa.set(etapaId, atual)
  }
  return [...porEtapa.values()].sort((a, b) => a.ordem - b.ordem)
}
