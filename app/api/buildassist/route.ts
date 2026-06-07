import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

type BuildAssistMessage = {
  role: 'user' | 'assistant'
  content: string
}

type BuildAssistContext = {
  modo?: string
  obraAtual?: any
  obras?: any[]
  orcamentos?: any[]
  itensOrcamento?: any[]
  etapas?: any[]
  materiais?: any[]
  medicoes?: any[]
  composicoes?: any[]
  insumos?: any[]
  arquivos?: any[]
  uploadedFiles?: any[]
}

function hasOpenAiKey() {
  const key = process.env.OPENAI_API_KEY || ''
  return key.startsWith('sk-') && !key.includes('placeholder')
}

function limitJson(value: unknown, maxLength = 18000) {
  const text = JSON.stringify(value, null, 2)
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}\n... contexto reduzido para caber na chamada ...`
}

function firstUserQuestion(messages: BuildAssistMessage[]) {
  return [...messages].reverse().find(m => m.role === 'user')?.content || ''
}

function localFallback(messages: BuildAssistMessage[], context: BuildAssistContext) {
  const question = firstUserQuestion(messages).toLowerCase()
  const obra = context.obraAtual || context.obras?.[0]
  const etapas = context.etapas || []
  const materiais = context.materiais || []
  const orcamentos = context.orcamentos || []
  const arquivos = [...(context.arquivos || []), ...(context.uploadedFiles || [])]

  const proximasEtapas = etapas
    .filter(e => e.status !== 'concluida')
    .slice(0, 3)
    .map(e => `- ${e.nome}${e.data_inicio ? `: inicio previsto em ${e.data_inicio}` : ''}`)
    .join('\n')

  const materiaisAComprar = materiais
    .filter(m => m.status_compra !== 'comprado')
    .slice(0, 4)
    .map(m => `- ${m.descricao}: ${Number(m.quantidade_total || 0).toLocaleString('pt-BR')} ${m.unidade || ''}`)
    .join('\n')

  if (question.includes('arquivo') || question.includes('projeto') || question.includes('planta')) {
    return [
      `Estou em modo local sem chave da OpenAI configurada, mas ja consigo organizar os arquivos da obra ${obra?.nome || 'selecionada'}.`,
      arquivos.length > 0
        ? `Arquivos recebidos/anexados:\n${arquivos.slice(0, 5).map(a => `- ${a.nome || a.name}: ${a.categoria || a.type || 'arquivo'}`).join('\n')}`
        : 'Ainda nao encontrei arquivo anexado ou enviado nesta conversa.',
      'Proximo passo pratico: ao configurar OPENAI_API_KEY, eu passo a interpretar o conteudo enviado e cruzar com orcamento, cronograma e materiais.',
    ].join('\n\n')
  }

  if (question.includes('orcamento') || question.includes('orçamento')) {
    return [
      `Para a obra ${obra?.nome || 'atual'}, encontrei ${orcamentos.length} orcamento(s) local(is).`,
      proximasEtapas ? `Etapas que ajudam a ordenar o orcamento:\n${proximasEtapas}` : 'Ainda faltam etapas suficientes para estruturar o orcamento por execucao.',
      materiaisAComprar ? `Materiais ja previstos:\n${materiaisAComprar}` : 'Ainda nao ha materiais previstos a partir do orcamento.',
    ].join('\n\n')
  }

  return [
    `Resumo local da obra ${obra?.nome || 'atual'}: ${etapas.length} etapa(s), ${materiais.length} material(is), ${orcamentos.length} orcamento(s).`,
    proximasEtapas ? `Proximas etapas previstas:\n${proximasEtapas}` : 'Nao encontrei proximas etapas planejadas.',
    materiaisAComprar ? `Materiais para acompanhar:\n${materiaisAComprar}` : 'Nao encontrei materiais em aberto para compra.',
    'Esta resposta foi gerada em modo local de teste. Para ativar IA real, configure OPENAI_API_KEY no .env.local.',
  ].join('\n\n')
}

export async function POST(req: NextRequest) {
  try {
    const { messages = [], complex = false, context = {} } = await req.json() as {
      messages: BuildAssistMessage[]
      complex?: boolean
      context?: BuildAssistContext
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Mensagem vazia' }, { status: 400 })
    }

    if (!hasOpenAiKey()) {
      return NextResponse.json({
        message: localFallback(messages, context),
        mode: 'local-fallback',
      })
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const hoje = new Date().toLocaleDateString('pt-BR')
    const model = complex ? 'gpt-5-mini' : 'gpt-4o-mini'

    const systemPrompt = `Voce e o BuildAssistente IA da BuildSmart AI.

DATA ATUAL: ${hoje}

PAPEL:
- Ajudar usuarios leigos a controlar obras residenciais de 40m2 a 200m2.
- Ser pratico, simples e preditivo.
- Prever proximas etapas, materiais, medicoes e pontos de decisao.
- Nao usar tom alarmista. Prefira "previsto", "ponto de atencao", "proximo passo".

REGRAS:
- Responda sempre em portugues brasileiro.
- Use apenas os dados do contexto quando falar da obra.
- Quando faltar dado, diga claramente o que falta.
- Seja curto: ate 4 blocos pequenos.
- Separe materiais de mao de obra quando esse assunto aparecer.
- Nao prometa leitura real de arquivos se o conteudo do arquivo nao foi enviado.

CONTEXTO LOCAL/SISTEMA:
${limitJson(context)}`

    const response = await openai.responses.create({
      model,
      instructions: systemPrompt,
      input: messages.map(message => ({
        role: message.role,
        content: message.content,
      })),
      max_output_tokens: complex ? 1800 : 900,
    })

    const content = response.output_text
    if (!content) throw new Error('Resposta vazia da IA')

    return NextResponse.json({ message: content, model, mode: 'openai' })
  } catch (error) {
    console.error('BuildAssist error:', error)
    return NextResponse.json({ error: 'Erro ao processar mensagem' }, { status: 500 })
  }
}
