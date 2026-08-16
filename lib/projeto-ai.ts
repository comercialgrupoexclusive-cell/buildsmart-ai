import OpenAI from 'openai'
import { hasOpenAiKey, modelFor } from '@/lib/luizia-core'
import type { ItemArvore } from '@/lib/projeto-itens'
import { DEFAULT_PROMPT_ESTRUTURA, DEFAULT_PROMPT_CRONOGRAMA } from '@/lib/projeto-ai-prompts'

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

export async function gerarEstruturaProjeto({ nomeProjeto, descricao, promptPersonalizado, itensAtuais, instrucao }: {
  nomeProjeto: string
  descricao?: string
  promptPersonalizado?: string | null
  // Quando informados, a IA parte da estrutura já sugerida (ainda não aplicada)
  // e aplica apenas o ajuste pedido — usado para refinar por prompt antes de
  // confirmar, em vez de só permitir aceitar ou descartar tudo.
  itensAtuais?: ItemArvore[]
  instrucao?: string
}): Promise<{ itens: ItemArvore[] }> {
  if (!hasOpenAiKey()) {
    throw new Error('Configure OPENAI_API_KEY para gerar estrutura com IA.')
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const model = modelFor(false)

  const systemPrompt = promptPersonalizado?.trim() || DEFAULT_PROMPT_ESTRUTURA

  const temRefinamento = Array.isArray(itensAtuais) && itensAtuais.length > 0 && !!instrucao?.trim()

  const userPrompt = temRefinamento
    ? `Projeto: ${nomeProjeto}${descricao ? `\nDescricao/tipo de obra: ${descricao}` : ''}

Estrutura atual sugerida, ainda não aplicada (JSON):
${JSON.stringify(itensAtuais, null, 2)}

O usuario pediu o seguinte ajuste nessa estrutura:
"${instrucao!.trim()}"

Aplique APENAS o ajuste pedido, preservando o restante da estrutura exatamente como esta. Retorne a estrutura JSON completa e atualizada, no mesmo formato {"itens": [...]}.`
    : `Projeto: ${nomeProjeto}${descricao ? `\nDescricao/tipo de obra: ${descricao}` : ''}`

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

export async function sugerirCronogramaProjeto({ itens, dataInicioObra, promptPersonalizado }: {
  itens: ItemParaCronograma[]
  dataInicioObra: string | null
  promptPersonalizado?: string | null
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

  const systemPrompt = promptPersonalizado?.trim() || DEFAULT_PROMPT_CRONOGRAMA

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
