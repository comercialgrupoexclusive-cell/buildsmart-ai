import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runInvestidorSkill, type InvestidorAnexo } from '@/lib/luizia-investidor-runtime'

export const maxDuration = 60

function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// Skill 1 (Pesquisa e Análise de Mercado Imobiliário) — botões dedicados que
// chamam a Luiza automaticamente com um prompt fixo (em vez de exigir que o
// usuário digite no chat), mas reaproveitam 100% runInvestidorSkill/web_search
// já existentes. Cada firing é isolado (history: []) — não é uma conversa,
// é uma ação determinística de tela.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'JSON inválido', status: 'erro' }, { status: 400 })

  const { action, prospeccaoId, profileId, actor, anexo, fonteUrl, ampliarBusca } = body as {
    action?: string
    prospeccaoId?: string
    profileId?: string | null
    actor?: string
    anexo?: InvestidorAnexo | null
    fonteUrl?: string
    ampliarBusca?: boolean
  }
  if (!prospeccaoId) return NextResponse.json({ error: 'prospeccaoId é obrigatório', status: 'erro' }, { status: 400 })

  let prompt: string | null = null
  if (action === 'extrair_ficha') {
    if (fonteUrl) {
      prompt = `Leia a fonte deste imóvel-alvo (link: ${fonteUrl}) com extrair_link e registre na ficha, com preencher_ficha_extraida, todos os atributos que a fonte realmente informa — sem tratar nada como confirmado.`
    } else if (anexo) {
      prompt = `Leia o ${anexo.tipo === 'pdf' ? 'PDF' : 'foto'} anexado deste imóvel-alvo e registre na ficha, com preencher_ficha_extraida, todos os atributos que a fonte realmente mostra — sem tratar nada como confirmado.`
    }
  } else if (action === 'pesquisar_comparaveis') {
    // "Ampliar busca" (hotfix pós-teste real da Bella): a pesquisa normal não
    // encontrou nada — reforça a mesma ordem de prioridade, mas autoriza
    // ampliar até o bairro se ainda faltar amostra. Não é um agente/prompt
    // novo, só uma instrução mais ampla da mesma ação.
    prompt = ampliarBusca
      ? 'A busca anterior de comparáveis para o imóvel-alvo desta prospecção não retornou nenhum resultado registrado. Amplie a pesquisa: procure de novo por mesmo prédio/condomínio, mesma rua e entorno próximo e, se mesmo assim não houver amostra suficiente, amplie para o bairro. Registre CADA resultado com registrar_comparaveis_brutos antes de tirar qualquer conclusão. Se ainda assim não encontrar nada real, não invente nenhum resultado.'
      : 'Pesquise comparáveis para o imóvel-alvo desta prospecção, usando a ficha validada e as evidências já registradas como referência. Priorize nesta ordem: mesmo prédio/condomínio, mesma rua, entorno imediato, e só então bairro. Registre CADA resultado com registrar_comparaveis_brutos antes de tirar qualquer conclusão.'
  } else if (action === 'analisar_mercado') {
    prompt = 'Analise o mercado para esta prospecção, usando a ficha validada, as evidências e os comparáveis já salvos/favoritados (não os brutos que ainda não foram selecionados). Entregue o resultado com registrar_analise_mercado.'
  }

  if (!prompt) return NextResponse.json({ error: 'Ação inválida ou faltando fonteUrl/anexo.', status: 'erro' }, { status: 400 })

  try {
    const resultado = await runInvestidorSkill({
      prompt,
      history: [],
      modo: 'work',
      profileId: profileId ?? null,
      actor: actor || 'Usuário do painel',
      fixedProspeccaoId: prospeccaoId,
      anexo: action === 'extrair_ficha' ? (anexo ?? null) : null,
    })

    // Pós-condição real (hotfix): HTTP 200 não pode significar sucesso
    // funcional se a pesquisa não registrou nenhum comparável — antes disso
    // a UI não tinha como distinguir "achou e salvou" de "rodou e não achou
    // nada", e mostrava as duas coisas como sucesso silencioso.
    if (action !== 'pesquisar_comparaveis') return NextResponse.json(resultado)
    if (resultado.blocked) return NextResponse.json({ ...resultado, status: 'erro' })

    const db = supabase()
    if (!db) return NextResponse.json({ ...resultado, status: 'erro', error: 'Banco de dados indisponível para conferir os resultados.' })
    const { count, error } = await db.from('prospeccao_comparaveis').select('id', { count: 'exact', head: true }).eq('prospeccao_id', prospeccaoId)
    if (error) return NextResponse.json({ ...resultado, status: 'erro', error: error.message })

    const total = count ?? 0
    return NextResponse.json({ ...resultado, status: total === 0 ? 'sem_resultados' : 'ok', totalComparaveis: total })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro ao processar a ação.', status: 'erro' }, { status: 500 })
  }
}
