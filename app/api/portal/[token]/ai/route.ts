import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { commentPortalBoardItem, createPortalBoardItem, updatePortalBoardItem } from '@/lib/portal/portal-board-service'
import { getPortalContext } from '@/lib/portal/portal-service'
import type { PortalBoardStatus, PortalCategoria, PortalContextDTO } from '@/lib/portal/types'

export const maxDuration = 60

type Message = { role: 'user' | 'assistant'; content: string }
type ToolArgs = Record<string, unknown>

const tools: OpenAI.Chat.ChatCompletionTool[] = [
  { type: 'function', function: { name: 'board_list_items', description: 'Lista itens visiveis ao cliente no Board.', parameters: { type: 'object', properties: { termo: { type: 'string' }, ambiente: { type: 'string' }, status: { type: 'string' } } } } },
  { type: 'function', function: { name: 'board_get_item', description: 'Consulta um item visivel pelo ID.', parameters: { type: 'object', properties: { item_id: { type: 'string' } }, required: ['item_id'] } } },
  { type: 'function', function: { name: 'board_create_item', description: 'Cria uma anotacao, duvida, aprovacao, alteracao ou pendencia.', parameters: { type: 'object', properties: { titulo: { type: 'string' }, descricao: { type: 'string' }, categoria: { type: 'string', enum: ['observacao', 'duvida', 'aprovacao', 'alteracao', 'pendencia', 'nao_conformidade'] }, ambiente: { type: 'string' } }, required: ['titulo', 'categoria'] } } },
  { type: 'function', function: { name: 'board_update_item', description: 'Edita titulo, descricao, categoria ou ambiente de um item visivel.', parameters: { type: 'object', properties: { item_id: { type: 'string' }, titulo: { type: 'string' }, descricao: { type: 'string' }, categoria: { type: 'string', enum: ['observacao', 'duvida', 'aprovacao', 'alteracao', 'pendencia', 'nao_conformidade'] }, ambiente: { type: 'string' } }, required: ['item_id'] } } },
  { type: 'function', function: { name: 'board_add_comment', description: 'Adiciona um comentario a um item visivel.', parameters: { type: 'object', properties: { item_id: { type: 'string' }, mensagem: { type: 'string' } }, required: ['item_id', 'mensagem'] } } },
  { type: 'function', function: { name: 'board_change_status', description: 'Altera o status de um item visivel.', parameters: { type: 'object', properties: { item_id: { type: 'string' }, status: { type: 'string', enum: ['aberto', 'em_analise', 'aguardando_cliente', 'aguardando_equipe', 'resolvido'] } }, required: ['item_id', 'status'] } } },
  { type: 'function', function: { name: 'board_archive_item', description: 'Arquiva um item. Use apenas apos confirmacao quando houver ambiguidade.', parameters: { type: 'object', properties: { item_id: { type: 'string' } }, required: ['item_id'] } } },
]

function stringArg(args: ToolArgs, key: string) {
  return typeof args[key] === 'string' ? args[key] as string : ''
}

function resolveItemId(value: string, context: PortalContextDTO) {
  if (context.boardItems.some(item => item.id === value)) return value
  const term = value.trim().toLocaleLowerCase('pt-BR')
  if (!term) return ''
  const matches = context.boardItems.filter(item => item.titulo.toLocaleLowerCase('pt-BR').includes(term))
  return matches.length === 1 ? matches[0].id : ''
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  try {
    const body = await request.json() as { messages?: Message[]; orcamentoId?: string; tourContext?: Record<string, unknown> }
    const messages = (body.messages || []).slice(-12)
    if (messages.length === 0) return NextResponse.json({ error: 'Mensagem obrigatoria.' }, { status: 400 })
    let context = await getPortalContext(token, body.orcamentoId || 'todos')
    if (!context) return NextResponse.json({ error: 'Link invalido ou expirado.' }, { status: 403 })
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'IA indisponivel neste ambiente.' }, { status: 503 })

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const selectedBudgetId = context.selectedOrcamentoId
    const selectedBudgetName = selectedBudgetId === 'todos'
      ? 'Todos os orcamentos'
      : context.orcamentos.find(item => item.id === selectedBudgetId)?.nome || 'Orcamento selecionado'
    const system = `Voce e a assistente exclusiva do Portal do Cliente da BuildSmart AI.
Obra autorizada: ${context.obra.nome}.
Orcamento selecionado: ${selectedBudgetName}.
Nesta fase voce trabalha somente com o Board visivel ao cliente.
Nunca afirme que viu itens internos. Nunca execute SQL. Nunca exclua fisicamente.
Pode listar, consultar, criar, editar, comentar, mudar status e arquivar por meio das ferramentas.
Se houver mais de um item correspondente, apresente as opcoes antes de alterar.
Se o usuario pedir explicitamente para criar algo e houver dados suficientes, crie sem confirmacao adicional.
Responda em portugues brasileiro, de forma clara e curta.`

    const aiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: system },
      ...messages.map(message => ({ role: message.role, content: message.content } as OpenAI.Chat.ChatCompletionMessageParam)),
    ]
    let changed = false
    let answer = ''

    for (let round = 0; round < 5; round++) {
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_SIMPLE_MODEL || 'gpt-4o-mini',
        messages: aiMessages,
        tools,
        tool_choice: 'auto',
        max_tokens: 900,
      })
      const message = completion.choices[0]?.message
      if (!message) break
      if (!message.tool_calls?.length) {
        answer = message.content?.trim() || ''
        break
      }
      aiMessages.push(message)
      for (const call of message.tool_calls) {
        if (call.type !== 'function') continue
        let args: ToolArgs = {}
        try { args = JSON.parse(call.function.arguments) as ToolArgs } catch { args = {} }
        let result: unknown
        const itemIdArg = stringArg(args, 'item_id')
        const itemId = resolveItemId(itemIdArg, context)

        if (call.function.name === 'board_list_items') {
          const term = stringArg(args, 'termo').toLocaleLowerCase('pt-BR')
          const ambiente = stringArg(args, 'ambiente').toLocaleLowerCase('pt-BR')
          const status = stringArg(args, 'status')
          result = context.boardItems.filter(item =>
            (!term || `${item.titulo} ${item.descricao || ''}`.toLocaleLowerCase('pt-BR').includes(term)) &&
            (!ambiente || (item.ambiente || '').toLocaleLowerCase('pt-BR').includes(ambiente)) &&
            (!status || item.status === status)
          )
        } else if (call.function.name === 'board_get_item') {
          result = context.boardItems.find(item => item.id === itemId) || { error: 'Item nao encontrado, nao permitido ou ambiguo.' }
        } else if (call.function.name === 'board_create_item') {
          result = await createPortalBoardItem(token, {
            orcamentoId: context.selectedOrcamentoId,
            titulo: stringArg(args, 'titulo'),
            descricao: stringArg(args, 'descricao'),
            categoria: stringArg(args, 'categoria') as PortalCategoria,
            ambiente: stringArg(args, 'ambiente'),
            tour: body.tourContext && typeof body.tourContext.nodeId === 'string' ? {
              nodeId: body.tourContext.nodeId,
              ambiente: typeof body.tourContext.ambiente === 'string' ? body.tourContext.ambiente : null,
              yaw: Number(body.tourContext.yaw), pitch: Number(body.tourContext.pitch),
            } : null,
          }, 'portal_ai')
          changed = true
        } else if (call.function.name === 'board_update_item') {
          result = itemId ? await updatePortalBoardItem(token, itemId, {
            titulo: stringArg(args, 'titulo') || undefined,
            descricao: stringArg(args, 'descricao') || undefined,
            categoria: stringArg(args, 'categoria') as PortalCategoria || undefined,
            ambiente: stringArg(args, 'ambiente') || undefined,
          }, 'portal_ai') : { error: 'Item nao encontrado, nao permitido ou ambiguo.' }
          changed = Boolean(itemId)
        } else if (call.function.name === 'board_add_comment') {
          result = itemId ? await commentPortalBoardItem(token, itemId, stringArg(args, 'mensagem'), 'portal_ai') : { error: 'Item nao encontrado, nao permitido ou ambiguo.' }
          changed = Boolean(itemId)
        } else if (call.function.name === 'board_change_status') {
          result = itemId ? await updatePortalBoardItem(token, itemId, { status: stringArg(args, 'status') as PortalBoardStatus }, 'portal_ai') : { error: 'Item nao encontrado, nao permitido ou ambiguo.' }
          changed = Boolean(itemId)
        } else if (call.function.name === 'board_archive_item') {
          result = itemId ? await updatePortalBoardItem(token, itemId, { status: 'arquivado' }, 'portal_ai') : { error: 'Item nao encontrado, nao permitido ou ambiguo.' }
          changed = Boolean(itemId)
        } else {
          result = { error: 'Ferramenta nao permitida.' }
        }

        aiMessages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) })
        if (changed) context = await getPortalContext(token, body.orcamentoId || 'todos') || context
      }
    }

    return NextResponse.json({ message: answer || 'Ação concluída.', changed })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao consultar a IA.' }, { status: 400 })
  }
}
