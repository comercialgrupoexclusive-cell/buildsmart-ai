import OpenAI from 'openai'

type Row = Record<string, unknown>

export type LuiziaMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type LuiziaContext = {
  modo?: string
  obraAtual?: Row | null
  obras?: Row[]
  orcamentos?: Row[]
  itensOrcamento?: Row[]
  etapas?: Row[]
  materiais?: Row[]
  medicoes?: Row[]
  diario?: Row[]
  progresso?: Record<string, number>
  composicoes?: Row[]
  insumos?: Row[]
  fornecedores?: Row[]
  listasCompras?: Row[]
  arquivos?: Row[]
  uploadedFiles?: Row[]
  [key: string]: unknown
}

export type LuiziaResult = {
  message: string
  mode: 'local-fallback' | 'openai'
  model?: string
}

function hasOpenAiKey() {
  const key = process.env.OPENAI_API_KEY || ''
  return key.startsWith('sk-') && !key.includes('placeholder') && !key.includes('your_')
}

function modelFor(complex: boolean) {
  const requested = complex ? process.env.OPENAI_COMPLEX_MODEL : process.env.OPENAI_SIMPLE_MODEL
  const allowed = new Set(['gpt-4o-mini', 'gpt-4o'])
  if (requested && allowed.has(requested)) return requested
  return complex ? 'gpt-4o' : 'gpt-4o-mini'
}

function limitJson(value: unknown, maxLength = 60000) {
  const text = JSON.stringify(value, null, 2)
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}\n... contexto reduzido para caber na chamada ...`
}

function firstUserQuestion(messages: LuiziaMessage[]) {
  return [...messages].reverse().find(m => m.role === 'user')?.content || ''
}

function summarizeList<T>(items: T[] | undefined, limit = 5) {
  return Array.isArray(items) ? items.slice(0, limit) : []
}

function localFallback(messages: LuiziaMessage[], context: LuiziaContext) {
  const question = firstUserQuestion(messages).toLowerCase()
  const obra = context.obraAtual || context.obras?.[0]
  const etapas = context.etapas || []
  const materiais = context.materiais || []
  const orcamentos = context.orcamentos || []
  const fornecedores = context.fornecedores || []
  const listasCompras = context.listasCompras || []
  const diario = context.diario || []
  const arquivos = [...(context.arquivos || []), ...(context.uploadedFiles || [])]

  const proximasEtapas = etapas
    .filter(e => e.status !== 'concluida')
    .slice(0, 4)
    .map(e => `- ${e.nome}${e.data_inicio ? `: inicio previsto em ${e.data_inicio}` : ''}`)
    .join('\n')

  const materiaisAComprar = materiais
    .filter(m => m.status_compra !== 'comprado')
    .slice(0, 5)
    .map(m => `- ${m.descricao}: ${Number(m.quantidade_total || 0).toLocaleString('pt-BR')} ${m.unidade || ''}${m.subetapa ? ` (${m.subetapa})` : ''}`)
    .join('\n')

  if (question.includes('arquivo') || question.includes('projeto') || question.includes('planta')) {
    return [
      `Estou em modo local sem chave da OpenAI configurada, mas ja consigo organizar os arquivos da obra ${obra?.nome || 'selecionada'}.`,
      arquivos.length > 0
        ? `Arquivos recebidos/anexados:\n${arquivos.slice(0, 6).map(a => `- ${a.nome || a.name}: ${a.categoria || a.tipo || a.type || 'arquivo'}`).join('\n')}`
        : 'Ainda nao encontrei arquivo anexado ou enviado nesta conversa.',
      'Quando voce colar a OPENAI_API_KEY no .env.local, eu passo a interpretar o conteudo enviado e cruzar com orcamento, cronograma, compras, diario e materiais.',
    ].join('\n\n')
  }

  if (question.includes('compra') || question.includes('comprar') || question.includes('fornecedor')) {
    return [
      `Para a obra ${obra?.nome || 'atual'}, encontrei ${materiais.filter(m => m.status_compra !== 'comprado').length} material(is) em aberto, ${listasCompras.length} lista(s) de compra e ${fornecedores.length} fornecedor(es) disponiveis.`,
      materiaisAComprar ? `Materiais para acompanhar:\n${materiaisAComprar}` : 'Nao encontrei materiais em aberto.',
      fornecedores.length > 0 ? `Fornecedores de referencia:\n${summarizeList(fornecedores, 4).map(f => `- ${f.nome} (${f.categoria})`).join('\n')}` : 'Ainda nao ha fornecedores cadastrados para cruzar com compras.',
    ].join('\n\n')
  }

  if (question.includes('diario') || question.includes('diÃ¡rio') || question.includes('medicao') || question.includes('mediÃ§Ã£o') || question.includes('avanco') || question.includes('avanÃ§o')) {
    return [
      `Para a obra ${obra?.nome || 'atual'}, encontrei ${diario.length} registro(s) de diario e ${context.medicoes?.length || 0} medicao(oes).`,
      proximasEtapas ? `Etapas para comparar com o avanco:\n${proximasEtapas}` : 'Ainda faltam etapas planejadas para comparar o avanco.',
      'Com a chave da OpenAI configurada, eu consigo resumir diario, progresso e proximas decisoes com mais precisao.',
    ].join('\n\n')
  }

  if (question.includes('orcamento') || question.includes('orÃ§amento')) {
    return [
      `Para a obra ${obra?.nome || 'atual'}, encontrei ${orcamentos.length} orcamento(s) local(is).`,
      proximasEtapas ? `Etapas que ajudam a ordenar o orcamento:\n${proximasEtapas}` : 'Ainda faltam etapas suficientes para estruturar o orcamento por execucao.',
      materiaisAComprar ? `Materiais ja previstos:\n${materiaisAComprar}` : 'Ainda nao ha materiais previstos a partir do orcamento.',
    ].join('\n\n')
  }

  return [
    `Resumo local da obra ${obra?.nome || 'atual'}: ${etapas.length} etapa(s), ${materiais.length} material(is), ${orcamentos.length} orcamento(s), ${fornecedores.length} fornecedor(es) e ${diario.length} registro(s) de diario.`,
    proximasEtapas ? `Proximas etapas previstas:\n${proximasEtapas}` : 'Nao encontrei proximas etapas planejadas.',
    materiaisAComprar ? `Materiais para acompanhar:\n${materiaisAComprar}` : 'Nao encontrei materiais em aberto para compra.',
    'Esta resposta foi gerada em modo local de teste. Para ativar IA real, configure OPENAI_API_KEY no .env.local e reinicie o servidor.',
  ].join('\n\n')
}

export async function askLuizia({
  messages,
  complex = false,
  context = {},
}: {
  messages: LuiziaMessage[]
  complex?: boolean
  context?: LuiziaContext
}): Promise<LuiziaResult> {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('Mensagem vazia')
  }

  if (!hasOpenAiKey()) {
    return {
      message: localFallback(messages, context),
      mode: 'local-fallback',
    }
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const hoje = new Date().toLocaleDateString('pt-BR')
  const model = modelFor(complex)

  const systemPrompt = `Voce e a Luizia, a assistente IA da BuildSmart AI. O nome vem de Luiz + IA.

DATA ATUAL: ${hoje}

PAPEL:
- Ajudar usuarios leigos a controlar obras residenciais de 40m2 a 200m2.
- Ser pratico, simples e preditivo.
- Prever proximas etapas, proximos materiais, compras, medicoes e pontos de decisao.
- Nao usar tom alarmista. Prefira "previsto", "ponto de atencao", "proximo passo".

REGRAS:
- Responda sempre em portugues brasileiro.
- Use apenas os dados do contexto quando falar da obra.
- Voce pode cruzar todos os dados recebidos no contexto: obras, orcamentos, itens, insumos, composicoes, materiais, compras, fornecedores, cronograma, diario, medicoes, arquivos e usuarios.
- Quando faltar dado, diga claramente o que falta.
- Seja curto: ate 4 blocos pequenos.
- Separe materiais, mao de obra e equipamentos quando esse assunto aparecer.
- Diferencie material em aberto, material parcial e material comprado.
- Ao falar de compras, considere fornecedores e listas de compra.
- Ao falar de avanco, considere diario, medicoes e progresso.
- Nao prometa leitura real de arquivos se o conteudo do arquivo nao foi enviado.
- Quando sugerir criacao/alteracao no sistema, deixe claro que o usuario deve revisar antes de salvar.
- Voce ainda nao executa acoes no banco nem cria registros diretamente.
- O contexto e somente leitura. Nao invente que alterou dados.
- Nunca diga que criou, salvou, excluiu ou alterou uma obra, orcamento, compra, diario ou material.
- Quando o usuario pedir para criar algo, responda preparando os dados sugeridos e diga que ele precisa confirmar/salvar pela tela correspondente.

CONTEXTO LOCAL/SISTEMA:
${limitJson(context)}`

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages.map(message => ({
        role: message.role as 'user' | 'assistant',
        content: message.content,
      })),
    ],
    max_tokens: complex ? 1800 : 900,
  })

  const content = response.choices[0]?.message?.content
  if (!content) throw new Error('Resposta vazia da IA')

  return { message: content, model, mode: 'openai' }
}
