import type { SupabaseClient } from '@supabase/supabase-js'

// Agregação da carteira do Investidor (Espíndolar e afins: compra, reforma,
// vende). Alimenta a Visão Geral. Fonte de verdade — já espalhada no banco:
//   • Ativo (imóvel na carteira) = projetos.contexto = 'investimento'
//   • Arremate (previsto)        = cenário principal da prospecção vinculada
//   • Custos pagos (realizado)   = soma de projeto_custos_aquisicao
//   • Investido conhecido        = arremate + custos pagos
//   • Prospecção pública         = prospeccoes sem project_id (fora da carteira)
//
// Uma consulta por fonte, nunca uma por item (AGENTS.md §9).

export const FASE_INVESTIMENTO_LABEL: Record<string, string> = {
  aquisicao_concluida: 'Aquisição concluída',
  regularizacao_posse: 'Regularização/Posse',
  reforma: 'Reforma',
  pronto_para_venda: 'Pronto para venda',
  a_venda: 'À venda',
  negociacao: 'Negociação',
  vendido: 'Vendido',
  encerrado: 'Encerrado',
}

export const FASE_INVESTIMENTO_ORDEM = Object.keys(FASE_INVESTIMENTO_LABEL)

// Cor por fase — tons do tema, para a barra de "Operações por etapa" e badges.
export const FASE_INVESTIMENTO_COR: Record<string, string> = {
  aquisicao_concluida: '#64748b',
  regularizacao_posse: '#94a3b8',
  reforma: '#8a1c2b',
  pronto_para_venda: '#3b7bf8',
  a_venda: '#0ea5e9',
  negociacao: '#f59e0b',
  vendido: '#10b981',
  encerrado: '#64748b',
}

const UFS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
])

// Extrai UF e cidade de um endereço livre ("Guaíba, RS", "Cachoeirinha, RS · Casa",
// "Rua X, 10 - Biguaçu / SC"). Best-effort: pega a última sigla de UF válida e a
// palavra/token imediatamente antes como cidade. Sem UF → { uf: null }.
export function extrairUfCidade(endereco: string | null | undefined): { uf: string | null; cidade: string | null } {
  if (!endereco) return { uf: null, cidade: null }
  const limpo = endereco.replace(/·.*$/, '').trim()
  const tokens = limpo.split(/[,\-/]/).map(t => t.trim()).filter(Boolean)
  let uf: string | null = null
  let idxUf = -1
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i].toUpperCase()
    if (UFS.has(t)) { uf = t; idxUf = i; break }
  }
  const cidade = idxUf > 0 ? tokens[idxUf - 1] : null
  return { uf, cidade: cidade || null }
}

export type AtivoCarteira = {
  id: string
  nome: string
  endereco: string | null
  foto_url: string | null
  fase: string | null
  faseLabel: string
  uf: string | null
  cidade: string | null
  arremate: number | null       // previsto (cenário principal)
  custosPagos: number           // realizado (soma projeto_custos_aquisicao)
  investido: number | null      // arremate + custosPagos (quando há arremate)
  prospeccaoId: string | null
}

export type ProspeccaoPublica = {
  id: string
  nome: string
  endereco: string | null
  uf: string | null
  cidade: string | null
  tipo_aquisicao: string
  data_leilao: string | null
  arremate: number | null
}

export type EstadoResumo = {
  uf: string
  ativos: number
  prospeccoes: number
  investido: number
  cidades: { cidade: string; ativos: number }[]
}

export type VisaoInvestidor = {
  ativos: AtivoCarteira[]
  prospeccoes: ProspeccaoPublica[]
  kpis: {
    nAtivos: number
    totalArrematado: number
    custosPagos: number
    investido: number
  }
  porFase: { fase: string; label: string; cor: string; count: number }[]
  porEstado: EstadoResumo[]
}

type ProjetoRow = { id: string; nome: string; endereco: string | null; foto_url: string | null; fase_investimento: string | null }
type ProspeccaoRow = {
  id: string; nome: string; endereco: string | null; project_id: string | null; is_venda: boolean
  tipo_aquisicao: string; data_leilao: string | null
}
type CenarioRow = { prospeccao_id: string; valor_arrematacao: number | null }
type CustoRow = { projeto_id: string; valor: number }

export async function carregarVisaoInvestidor(supabase: SupabaseClient): Promise<VisaoInvestidor> {
  // 1. Ativos da carteira + prospecções (as duas fontes brutas, em paralelo).
  const [{ data: projetosData }, { data: prospeccoesData }] = await Promise.all([
    supabase.from('projetos').select('id,nome,endereco,foto_url,fase_investimento').eq('contexto', 'investimento'),
    supabase.from('prospeccoes').select('id,nome,endereco,project_id,is_venda,tipo_aquisicao,data_leilao').eq('is_venda', false),
  ])
  const projetos = (projetosData ?? []) as ProjetoRow[]
  const prospeccoes = (prospeccoesData ?? []) as ProspeccaoRow[]
  const ativoIds = projetos.map(p => p.id)

  // 2. Prospecções da carteira (p/ arremate) e custos — uma consulta cada.
  const prospeccoesDaCarteira = prospeccoes.filter(p => p.project_id && ativoIds.includes(p.project_id))
  const prospIds = prospeccoesDaCarteira.map(p => p.id)
  const [{ data: cenariosData }, { data: custosData }] = await Promise.all([
    prospIds.length
      ? supabase.from('prospeccao_cenarios').select('prospeccao_id,valor_arrematacao').eq('principal', true).in('prospeccao_id', prospIds)
      : Promise.resolve({ data: [] as CenarioRow[] }),
    ativoIds.length
      ? supabase.from('projeto_custos_aquisicao').select('projeto_id,valor').in('projeto_id', ativoIds)
      : Promise.resolve({ data: [] as CustoRow[] }),
  ])

  const arremateePorProspeccao = new Map<string, number | null>()
  for (const c of (cenariosData ?? []) as CenarioRow[]) arremateePorProspeccao.set(c.prospeccao_id, c.valor_arrematacao)
  const prospeccaoPorProjeto = new Map<string, ProspeccaoRow>()
  for (const p of prospeccoesDaCarteira) if (p.project_id) prospeccaoPorProjeto.set(p.project_id, p)
  const custosPorProjeto = new Map<string, number>()
  for (const c of (custosData ?? []) as CustoRow[]) custosPorProjeto.set(c.projeto_id, (custosPorProjeto.get(c.projeto_id) ?? 0) + Number(c.valor || 0))

  // 3. Monta os ativos.
  const ativos: AtivoCarteira[] = projetos.map(pj => {
    const prosp = prospeccaoPorProjeto.get(pj.id) ?? null
    const arremate = prosp ? (arremateePorProspeccao.get(prosp.id) ?? null) : null
    const custosPagos = custosPorProjeto.get(pj.id) ?? 0
    const investido = arremate != null ? arremate + custosPagos : (custosPagos > 0 ? custosPagos : null)
    const { uf, cidade } = extrairUfCidade(pj.endereco)
    return {
      id: pj.id,
      nome: pj.nome,
      endereco: pj.endereco,
      foto_url: pj.foto_url,
      fase: pj.fase_investimento,
      faseLabel: pj.fase_investimento ? (FASE_INVESTIMENTO_LABEL[pj.fase_investimento] ?? pj.fase_investimento) : 'Sem fase',
      uf, cidade,
      arremate, custosPagos, investido,
      prospeccaoId: prosp?.id ?? null,
    }
  })

  // 4. Prospecção pública = fora da carteira (sem project_id).
  const prospeccaoPublica: ProspeccaoPublica[] = prospeccoes
    .filter(p => !p.project_id)
    .map(p => {
      const { uf, cidade } = extrairUfCidade(p.endereco)
      return {
        id: p.id, nome: p.nome, endereco: p.endereco, uf, cidade,
        tipo_aquisicao: p.tipo_aquisicao, data_leilao: p.data_leilao,
        arremate: arremateePorProspeccao.get(p.id) ?? null,
      }
    })

  // 5. KPIs.
  const totalArrematado = ativos.reduce((s, a) => s + (a.arremate ?? 0), 0)
  const custosPagos = ativos.reduce((s, a) => s + a.custosPagos, 0)
  const investido = totalArrematado + custosPagos

  // 6. Operações por etapa (ordem canônica do ciclo).
  const faseCount = new Map<string, number>()
  for (const a of ativos) {
    const f = a.fase ?? 'sem_fase'
    faseCount.set(f, (faseCount.get(f) ?? 0) + 1)
  }
  const porFase = FASE_INVESTIMENTO_ORDEM
    .filter(f => (faseCount.get(f) ?? 0) > 0)
    .map(f => ({ fase: f, label: FASE_INVESTIMENTO_LABEL[f], cor: FASE_INVESTIMENTO_COR[f] ?? '#64748b', count: faseCount.get(f)! }))
  if (faseCount.get('sem_fase')) {
    porFase.push({ fase: 'sem_fase', label: 'Sem fase', cor: '#cbd5e1', count: faseCount.get('sem_fase')! })
  }

  // 7. Por estado (carteira + prospecção).
  const estados = new Map<string, EstadoResumo>()
  const garante = (uf: string) => {
    if (!estados.has(uf)) estados.set(uf, { uf, ativos: 0, prospeccoes: 0, investido: 0, cidades: [] })
    return estados.get(uf)!
  }
  const cidadeAcc = new Map<string, Map<string, number>>() // uf -> cidade -> count
  for (const a of ativos) {
    if (!a.uf) continue
    const e = garante(a.uf)
    e.ativos += 1
    e.investido += a.investido ?? 0
    if (a.cidade) {
      if (!cidadeAcc.has(a.uf)) cidadeAcc.set(a.uf, new Map())
      const cm = cidadeAcc.get(a.uf)!
      cm.set(a.cidade, (cm.get(a.cidade) ?? 0) + 1)
    }
  }
  for (const p of prospeccaoPublica) {
    if (!p.uf) continue
    garante(p.uf).prospeccoes += 1
  }
  for (const [uf, cm] of cidadeAcc) {
    garante(uf).cidades = Array.from(cm.entries())
      .map(([cidade, ativos]) => ({ cidade, ativos }))
      .sort((a, b) => b.ativos - a.ativos)
  }
  const porEstado = Array.from(estados.values()).sort((a, b) => b.ativos - a.ativos || b.prospeccoes - a.prospeccoes)

  return {
    ativos,
    prospeccoes: prospeccaoPublica,
    kpis: { nAtivos: ativos.length, totalArrematado, custosPagos, investido },
    porFase,
    porEstado,
  }
}
