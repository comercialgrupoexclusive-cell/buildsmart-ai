// Pesquisa Imobiliária — modelo estruturado do relatório (fonte única).
//
// Puro, sem IO e sem pdf-lib: transforma o imóvel analisado + comparáveis na
// estrutura que alimenta SIMULTANEAMENTE tabela, gráficos e PDF (doc "Processo
// e Modelos de Saída", §11). Alterar um preço/área aqui reflete em tudo.
//
// Regras invioláveis codificadas:
//  - R$/m² só quando preço E área conhecidos (calcularPrecoM2).
//  - área/dado do comparável NUNCA é atribuído ao imóvel analisado.
//  - dado ausente aparece como "não informado", nunca preenchido por inferência.
//  - preço pedido não é preço de venda (ressalva fixa).
import type { ProspeccaoComparavel } from '@/lib/types'
import { calcularPrecoM2 } from './service'

export type ModeloRelatorio = 'A' | 'B'

export type LinhaImovel = { label: string; valor: string; informado: boolean }
export type LinhaComparavel = {
  ref: string
  rotulo: string
  area: number | null
  tipoArea: string | null
  preco: number | null
  precoM2: number | null
  url: string | null
  fonte: string | null
  dataConsulta: string | null
  disponibilidade: string | null
  observacoes: string | null
  possivelDuplicado: boolean
}
export type PontoGrafico = { label: string; value: number }

export type RelatorioPesquisa = {
  titulo: string
  dataPesquisa: string
  imovelNome: string
  imovelEndereco: string | null
  fichaImovel: LinhaImovel[]
  imovelPreco: number | null
  imovelArea: number | null
  imovelPrecoM2: number | null
  comparaveis: LinhaComparavel[]
  graficoPreco: PontoGrafico[]
  graficoM2: PontoGrafico[]
  fontes: LinhaComparavel[]
  alertas: string[]
  observacoes: string[]
}

const TIPO_AREA_LABEL: Record<string, string> = {
  util: 'útil', privativa: 'privativa', construida: 'construída', total: 'total', outro: 'informada',
}

function numOuNull(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function textoOuNull(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

// Campos-chave da ficha do imóvel analisado, na ordem de apresentação. Cada um
// aparece como "não informado" quando ausente — desconhecido permanece
// desconhecido, de forma explícita.
const CAMPOS_FICHA: { chave: string; label: string; tipo: 'texto' | 'numero' | 'area' | 'moeda' }[] = [
  { chave: 'tipo', label: 'Tipo', tipo: 'texto' },
  { chave: 'area', label: 'Área', tipo: 'area' },
  { chave: 'dormitorios', label: 'Quartos', tipo: 'numero' },
  { chave: 'banheiros', label: 'Banheiros', tipo: 'numero' },
  { chave: 'vagas', label: 'Vagas', tipo: 'numero' },
  { chave: 'andar', label: 'Andar', tipo: 'texto' },
  { chave: 'estado_conservacao', label: 'Estado/ocupação', tipo: 'texto' },
  { chave: 'preco_anunciado', label: 'Preço/valor de referência', tipo: 'moeda' },
]

function fmtMoedaSimples(n: number): string {
  return 'R$ ' + Math.round(n).toLocaleString('pt-BR')
}

export type RelatorioInput = {
  imovelNome: string
  imovelEndereco?: string | null
  fichaConfirmados?: Record<string, unknown> | null
  comparaveis: ProspeccaoComparavel[]
  dataPesquisa?: string
}

export function montarRelatorioPesquisa(input: RelatorioInput): RelatorioPesquisa {
  const conf = input.fichaConfirmados ?? {}
  const dataPesquisa = input.dataPesquisa ?? new Date().toISOString().slice(0, 10)

  const fichaImovel: LinhaImovel[] = CAMPOS_FICHA.map(c => {
    const bruto = conf[c.chave]
    if (bruto == null || String(bruto).trim() === '') {
      return { label: c.label, valor: 'não informado', informado: false }
    }
    if (c.tipo === 'moeda') {
      const n = numOuNull(bruto)
      return { label: c.label, valor: n != null ? fmtMoedaSimples(n) : String(bruto), informado: n != null }
    }
    if (c.tipo === 'area') {
      const n = numOuNull(bruto)
      return { label: c.label, valor: n != null ? `${n} m²` : String(bruto), informado: n != null }
    }
    return { label: c.label, valor: String(bruto), informado: true }
  })

  const imovelPreco = numOuNull(conf['preco_anunciado'])
  const imovelArea = numOuNull(conf['area'])
  const imovelPrecoM2 = calcularPrecoM2(imovelPreco, imovelArea)

  const comparaveis: LinhaComparavel[] = input.comparaveis.map((c, i) => {
    const preco = c.preco != null ? Number(c.preco) : null
    const area = c.area != null ? Number(c.area) : null
    return {
      ref: String(i + 1),
      rotulo: textoOuNull(c.titulo) || textoOuNull(c.fonte) || `Comparável ${i + 1}`,
      area,
      tipoArea: c.tipo_area ? (TIPO_AREA_LABEL[c.tipo_area] ?? c.tipo_area) : null,
      preco,
      // Recalcula do preço/área persistidos — a fonte é sempre a mesma regra.
      precoM2: calcularPrecoM2(preco, area),
      url: textoOuNull(c.url),
      fonte: textoOuNull(c.fonte),
      dataConsulta: textoOuNull(c.data_evidencia),
      disponibilidade: textoOuNull(c.disponibilidade),
      observacoes: textoOuNull(c.diferencas),
      possivelDuplicado: !!c.possivel_duplicado,
    }
  })

  // Regra canônica: possível duplicado permanece na tabela/fontes como
  // evidência (ver montagem de `comparaveis` acima), mas nunca conta como
  // imóvel distinto nos cálculos/gráficos comparativos. Mesma regra aplicada
  // no cliente em components/investidor/ProspeccaoMercado.tsx.
  const comparaveisParaCalculo = comparaveis.filter(c => !c.possivelDuplicado)
  const graficoPreco: PontoGrafico[] = [
    ...(imovelPreco != null ? [{ label: 'A · analisado', value: imovelPreco }] : []),
    ...comparaveisParaCalculo.filter(c => c.preco != null).map(c => ({ label: `${c.ref} · ${c.rotulo}`, value: c.preco as number })),
  ]
  const graficoM2: PontoGrafico[] = [
    ...(imovelPrecoM2 != null ? [{ label: 'A · analisado', value: imovelPrecoM2 }] : []),
    ...comparaveisParaCalculo.filter(c => c.precoM2 != null).map(c => ({ label: `${c.ref} · ${c.rotulo}`, value: c.precoM2 as number })),
  ]

  const alertas: string[] = []
  for (const c of comparaveis) {
    if (c.possivelDuplicado) alertas.push(`Ref ${c.ref} (${c.rotulo}) marcado como possível duplicado — não contar como imóvel distinto.`)
    if (c.disponibilidade && /indispon/i.test(c.disponibilidade)) {
      alertas.push(`Ref ${c.ref} (${c.rotulo}) com anúncio indisponível na conferência — mantido como registro histórico.`)
    }
  }

  const observacoes: string[] = [
    'Pesquisa preliminar por oferta. Os valores são preços anunciados nas fontes consultadas e não representam, por si só, valor definitivo de mercado ou preço efetivo de negociação.',
    'R$/m² = preço publicado ÷ área informada no quadro. As áreas dos anúncios não foram verificadas documentalmente e não são atribuídas ao imóvel analisado.',
    'Endereço igual não confirma identidade da unidade; anúncio no mesmo prédio não significa a mesma unidade; garagem coberta ou escriturada não significa garagem individual fechada.',
    'Não foram aplicados ajustes por estado de conservação, padrão construtivo, idade, ocupação, documentação, reforma, liquidez ou custos acessórios de aquisição.',
  ]

  return {
    titulo: 'Relatório preliminar de pesquisa imobiliária',
    dataPesquisa,
    imovelNome: input.imovelNome,
    imovelEndereco: input.imovelEndereco ?? null,
    fichaImovel,
    imovelPreco,
    imovelArea,
    imovelPrecoM2,
    comparaveis,
    graficoPreco,
    graficoM2,
    fontes: comparaveis,
    alertas,
    observacoes,
  }
}
