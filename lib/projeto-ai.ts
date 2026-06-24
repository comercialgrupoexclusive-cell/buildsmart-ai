import OpenAI from 'openai'
import { hasOpenAiKey, modelFor } from '@/lib/luizia-core'
import type { ItemArvore } from '@/lib/projeto-itens'

function isItemArvore(value: unknown): value is ItemArvore {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (typeof v.nome !== 'string' || !v.nome.trim()) return false
  if (typeof v.nivel !== 'number' || v.nivel < 1 || v.nivel > 3) return false
  if (v.children !== undefined) {
    if (!Array.isArray(v.children)) return false
    return v.children.every(isItemArvore)
  }
  return true
}

export async function gerarEstruturaProjeto({ nomeProjeto, descricao }: {
  nomeProjeto: string
  descricao?: string
}): Promise<{ itens: ItemArvore[] }> {
  if (!hasOpenAiKey()) {
    throw new Error('Configure OPENAI_API_KEY para gerar estrutura com IA.')
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const model = modelFor(false)

  const systemPrompt = `Voce ajuda a montar a estrutura de um projeto tecnico de obra residencial (40 a 200m2), organizada em arvore com 3 niveis:
- nivel 1 = Disciplina (ex: Arquitetura, Estrutural, Eletrico, Hidrossanitario, Acabamento)
- nivel 2 = Item (etapa dentro da disciplina)
- nivel 3 = Subitem (detalhe dentro do item, opcional)

Responda SOMENTE com um JSON no formato exato:
{"itens": [{"nome": "Fundacao", "nivel": 1, "children": [{"nome": "Escavacao", "nivel": 2, "children": [{"nome": "Locacao da obra", "nivel": 3}]}]}]}

Regras:
- Gere entre 3 e 8 disciplinas (nivel 1) plausiveis para o projeto descrito.
- Cada disciplina deve ter de 2 a 6 itens (nivel 2).
- Use subitens (nivel 3) apenas quando agregarem clareza, nao e obrigatorio em todo item.
- Nomes curtos, em portugues brasileiro, sem numeracao.
- Nao inclua nenhum texto fora do JSON.`

  const userPrompt = `Projeto: ${nomeProjeto}${descricao ? `\nDescricao/tipo de obra: ${descricao}` : ''}`

  const response = await openai.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    max_tokens: 2000,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  })

  const content = response.choices[0]?.message?.content
  if (!content) throw new Error('Resposta vazia da IA.')

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('A IA retornou um formato inválido. Tente gerar novamente.')
  }

  const itens = (parsed as { itens?: unknown })?.itens
  if (!Array.isArray(itens) || itens.length === 0 || !itens.every(isItemArvore)) {
    throw new Error('A IA retornou uma estrutura inválida. Tente gerar novamente.')
  }

  return { itens: itens as ItemArvore[] }
}

export type ItemParaCronograma = {
  id: string
  nome: string
  nivel: number
  parent_id: string | null
  data_inicio: string | null
  data_prazo: string | null
}

type SugestaoData = { id: string; data_inicio: string; data_prazo: string }

function isSugestaoData(value: unknown): value is SugestaoData {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.id === 'string' && typeof v.data_inicio === 'string' && typeof v.data_prazo === 'string'
}

export async function sugerirCronogramaProjeto({ itens, dataInicioObra }: {
  itens: ItemParaCronograma[]
  dataInicioObra: string | null
}): Promise<{ datas: SugestaoData[] }> {
  if (!hasOpenAiKey()) {
    throw new Error('Configure OPENAI_API_KEY para sugerir cronograma com IA.')
  }

  const pendentes = itens.filter(i => !i.data_inicio || !i.data_prazo)
  if (pendentes.length === 0) {
    return { datas: [] }
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const model = modelFor(false)

  const systemPrompt = `Voce sugere datas de cronograma (data_inicio e data_prazo, formato YYYY-MM-DD) para itens de um projeto de obra residencial organizados em arvore (nivel 1=Disciplina, 2=Item, 3=Subitem, relacionados por parent_id).

Regras:
- O intervalo de datas de um item pai deve cobrir o intervalo de seus filhos.
- Itens do mesmo nivel sem dependencia clara podem ser sequenciais (um comeca quando o anterior termina) ou paralelos quando fizer sentido (ex: disciplinas independentes).
- Duracao tipica: disciplinas (nivel 1) somam semanas/meses; itens (nivel 2) de poucos dias a poucas semanas; subitens (nivel 3) de 1 a 5 dias.
- So sugira datas para os itens que estao na lista recebida (eles ja nao tem data_inicio ou data_prazo).
- Use a data de inicio da obra como ponto de partida quando fornecida; senao, use uma data proxima razoavel.
- Responda SOMENTE com um JSON no formato exato:
{"datas": [{"id": "<id do item>", "data_inicio": "YYYY-MM-DD", "data_prazo": "YYYY-MM-DD"}]}
- Inclua um objeto para cada item recebido, usando o mesmo "id".`

  const userPrompt = `Data de inicio da obra: ${dataInicioObra || 'não informada'}\n\nItens (arvore plana, JSON):\n${JSON.stringify(pendentes, null, 2)}`

  const response = await openai.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    max_tokens: 3000,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  })

  const content = response.choices[0]?.message?.content
  if (!content) throw new Error('Resposta vazia da IA.')

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('A IA retornou um formato inválido. Tente gerar novamente.')
  }

  const datas = (parsed as { datas?: unknown })?.datas
  if (!Array.isArray(datas) || !datas.every(isSugestaoData)) {
    throw new Error('A IA retornou datas em formato inválido. Tente gerar novamente.')
  }

  const idsValidos = new Set(pendentes.map(i => i.id))
  return { datas: (datas as SugestaoData[]).filter(d => idsValidos.has(d.id)) }
}
