import OpenAI from 'openai'
import { hasOpenAiKey, modelFor } from '@/lib/luizia-core'

export type ItemEstruturaComposicao = { codigo: string; quantidade: number }
export type SubetapaEstrutura = { nome: string | null; composicoes: ItemEstruturaComposicao[] }
export type EtapaEstrutura = { nome: string; subetapas: SubetapaEstrutura[] }

function isEtapaEstrutura(value: unknown): value is EtapaEstrutura {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (typeof v.nome !== 'string' || !v.nome.trim()) return false
  if (!Array.isArray(v.subetapas)) return false
  return v.subetapas.every(sub => {
    if (!sub || typeof sub !== 'object') return false
    const s = sub as Record<string, unknown>
    if (s.nome !== null && typeof s.nome !== 'string') return false
    if (!Array.isArray(s.composicoes)) return false
    return s.composicoes.every(c => {
      if (!c || typeof c !== 'object') return false
      const item = c as Record<string, unknown>
      return typeof item.codigo === 'string' && typeof item.quantidade === 'number'
    })
  })
}

export async function gerarEstruturaOrcamento({ obraNome, descricaoObra, catalogo, itensAtuais, instrucao }: {
  obraNome: string
  descricaoObra?: string
  // Catálogo de composições disponíveis — a IA só pode usar códigos desta lista,
  // já que cada item do orçamento precisa referenciar uma composição real (com
  // insumos e custo próprios), diferente da árvore livre de Projetos.
  catalogo: { codigo: string; descricao: string; unidade: string }[]
  itensAtuais?: EtapaEstrutura[]
  instrucao?: string
}): Promise<{ etapas: EtapaEstrutura[] }> {
  if (!hasOpenAiKey()) {
    throw new Error('Configure OPENAI_API_KEY para gerar estrutura com IA.')
  }
  if (catalogo.length === 0) {
    throw new Error('Nenhuma composição própria cadastrada ainda — cadastre composições antes de gerar a estrutura por IA.')
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const model = modelFor(false)

  const catalogoTexto = catalogo.map(c => `${c.codigo} — ${c.descricao} (${c.unidade})`).join('\n')

  const systemPrompt = `Você monta a estrutura inicial de um orçamento de obra civil: etapas, subetapas (opcional) e as composições de cada uma, com quantidade estimada.

Regras obrigatórias:
- Use SOMENTE códigos de composição da lista de catálogo fornecida abaixo. Nunca invente um código.
- Cada composição usada deve ter uma quantidade numérica estimada e realista (> 0), na unidade da própria composição.
- Agrupe por etapas de obra civil coerentes (ex.: Serviços Preliminares, Fundação, Estrutura, Alvenaria, Instalações, Acabamentos...). Subetapas são opcionais — use apenas quando ajudam a organizar (pode ser null).
- Não repita a mesma composição na mesma etapa/subetapa.
- Responda em JSON no formato exato: {"etapas": [{"nome": string, "subetapas": [{"nome": string|null, "composicoes": [{"codigo": string, "quantidade": number}]}]}]}

Catálogo de composições disponíveis (código — descrição (unidade)):
${catalogoTexto}`

  const temRefinamento = Array.isArray(itensAtuais) && itensAtuais.length > 0 && !!instrucao?.trim()

  const userPrompt = temRefinamento
    ? `Obra: ${obraNome}${descricaoObra ? `\nContexto/tipo de obra: ${descricaoObra}` : ''}

Estrutura atual sugerida, ainda não aplicada (JSON):
${JSON.stringify(itensAtuais, null, 2)}

O usuário pediu o seguinte ajuste:
"${instrucao!.trim()}"

Aplique APENAS o ajuste pedido, preservando o restante da estrutura exatamente como está. Continue usando somente códigos do catálogo. Retorne a estrutura JSON completa e atualizada, no mesmo formato {"etapas": [...]}.`
    : `Obra: ${obraNome}${descricaoObra ? `\nContexto/tipo de obra: ${descricaoObra}` : ''}`

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

  const etapasRaw = (parsed as { etapas?: unknown })?.etapas
  if (!Array.isArray(etapasRaw) || etapasRaw.length === 0 || !etapasRaw.every(isEtapaEstrutura)) {
    throw new Error('A IA retornou uma estrutura inválida. Tente gerar novamente.')
  }

  // Descarta códigos que a IA eventualmente tenha inventado fora do catálogo.
  const codigosValidos = new Set(catalogo.map(c => c.codigo))
  const etapas = (etapasRaw as EtapaEstrutura[])
    .map(etapa => ({
      nome: etapa.nome,
      subetapas: etapa.subetapas
        .map(sub => ({ nome: sub.nome, composicoes: sub.composicoes.filter(c => codigosValidos.has(c.codigo) && c.quantidade > 0) }))
        .filter(sub => sub.composicoes.length > 0),
    }))
    .filter(etapa => etapa.subetapas.length > 0)

  if (etapas.length === 0) {
    throw new Error('A IA não retornou nenhuma composição válida do catálogo. Tente novamente ou refine o pedido.')
  }

  return { etapas }
}
