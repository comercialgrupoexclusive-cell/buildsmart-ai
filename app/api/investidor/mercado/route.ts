import { NextRequest, NextResponse } from 'next/server'
import { runInvestidorSkill, type InvestidorAnexo } from '@/lib/luizia-investidor-runtime'

export const maxDuration = 60

// Skill 1 (Pesquisa e Análise de Mercado Imobiliário) — botões dedicados que
// chamam a Luiza automaticamente com um prompt fixo (em vez de exigir que o
// usuário digite no chat), mas reaproveitam 100% runInvestidorSkill/web_search
// já existentes. Cada firing é isolado (history: []) — não é uma conversa,
// é uma ação determinística de tela.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })

  const { action, prospeccaoId, profileId, actor, anexo, fonteUrl } = body as {
    action?: string
    prospeccaoId?: string
    profileId?: string | null
    actor?: string
    anexo?: InvestidorAnexo | null
    fonteUrl?: string
  }
  if (!prospeccaoId) return NextResponse.json({ error: 'prospeccaoId é obrigatório' }, { status: 400 })

  let prompt: string | null = null
  if (action === 'extrair_ficha') {
    if (fonteUrl) {
      prompt = `Leia a fonte deste imóvel-alvo (link: ${fonteUrl}) com extrair_link e registre na ficha, com preencher_ficha_extraida, todos os atributos que a fonte realmente informa — sem tratar nada como confirmado.`
    } else if (anexo) {
      prompt = `Leia o ${anexo.tipo === 'pdf' ? 'PDF' : 'foto'} anexado deste imóvel-alvo e registre na ficha, com preencher_ficha_extraida, todos os atributos que a fonte realmente mostra — sem tratar nada como confirmado.`
    }
  } else if (action === 'pesquisar_comparaveis') {
    prompt = 'Pesquise comparáveis para o imóvel-alvo desta prospecção, usando a ficha validada e as evidências já registradas como referência. Priorize nesta ordem: mesmo prédio/condomínio, mesma rua, entorno imediato, e só então bairro. Registre CADA resultado com registrar_comparaveis_brutos antes de tirar qualquer conclusão.'
  } else if (action === 'analisar_mercado') {
    prompt = 'Analise o mercado para esta prospecção, usando a ficha validada, as evidências e os comparáveis já salvos/favoritados (não os brutos que ainda não foram selecionados). Entregue o resultado com registrar_analise_mercado.'
  }

  if (!prompt) return NextResponse.json({ error: 'Ação inválida ou faltando fonteUrl/anexo.' }, { status: 400 })

  const resultado = await runInvestidorSkill({
    prompt,
    history: [],
    modo: 'work',
    profileId: profileId ?? null,
    actor: actor || 'Usuário do painel',
    fixedProspeccaoId: prospeccaoId,
    anexo: action === 'extrair_ficha' ? (anexo ?? null) : null,
  })

  return NextResponse.json(resultado)
}
