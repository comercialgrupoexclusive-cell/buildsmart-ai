// Testa as partes puras/determinísticas de lib/luizia-investidor-runtime.ts
// que não dependem da OpenAI (sem OPENAI_API_KEY no sandbox, o loop de IA
// em si não é testável aqui — mesmo padrão de luizia-tarefas-runtime.test.ts).
// Cobre a migração para a Responses API (Marco 7): adaptação do formato de
// tool, extração de texto+fontes da resposta, e montagem da mensagem do
// usuário com anexo multimodal (imagem/PDF).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import { FakeDB } from './fake-supabase'
import {
  paraFunctionToolResponses, extrairTextoComFontes, montarMensagemUsuario, runInvestidorSkill,
  type InvestidorAnexo,
} from '../luizia-investidor-runtime'

vi.mock('@supabase/supabase-js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@supabase/supabase-js')>()
  return { ...actual, createClient: vi.fn() }
})

describe('paraFunctionToolResponses — adapta Chat Completions -> Responses API', () => {
  it('converte type/name/description/parameters para o formato flat', () => {
    const original: OpenAI.Chat.ChatCompletionTool = {
      type: 'function',
      function: {
        name: 'list_evidencias',
        description: 'Lista evidências',
        parameters: { type: 'object', properties: { prospeccao_nome: { type: 'string' } }, required: [] },
      },
    }
    const convertido = paraFunctionToolResponses(original)
    expect(convertido).toEqual({
      type: 'function',
      name: 'list_evidencias',
      description: 'Lista evidências',
      parameters: { type: 'object', properties: { prospeccao_nome: { type: 'string' } }, required: [] },
      strict: false,
    })
  })

  it('lança erro para uma tool que não seja function (nunca deveria acontecer com as tools do Investidor)', () => {
    const custom = { type: 'custom', custom: { name: 'x' } } as unknown as OpenAI.Chat.ChatCompletionTool
    expect(() => paraFunctionToolResponses(custom)).toThrow()
  })
})

describe('extrairTextoComFontes — junta texto de saída + fontes de web_search (url_citation)', () => {
  it('retorna vazio quando não há mensagem de texto', () => {
    expect(extrairTextoComFontes([])).toBe('')
  })

  it('retorna só o texto quando não há citações', () => {
    const output = [{
      type: 'message', id: 'm1', role: 'assistant', status: 'completed',
      content: [{ type: 'output_text', text: 'Encontrei 3 prospecções.', annotations: [] }],
    }] as unknown as OpenAI.Responses.Response['output']
    expect(extrairTextoComFontes(output)).toBe('Encontrei 3 prospecções.')
  })

  it('anexa a seção Fontes quando há url_citation, sem duplicar URLs repetidas', () => {
    const output = [{
      type: 'message', id: 'm1', role: 'assistant', status: 'completed',
      content: [{
        type: 'output_text',
        text: 'O valor de mercado estimado é R$ 420.000.',
        annotations: [
          { type: 'url_citation', url: 'https://exemplo.com/a', title: 'Anúncio A', start_index: 0, end_index: 1 },
          { type: 'url_citation', url: 'https://exemplo.com/a', title: 'Anúncio A (repetido)', start_index: 2, end_index: 3 },
          { type: 'url_citation', url: 'https://exemplo.com/b', title: 'Anúncio B', start_index: 4, end_index: 5 },
        ],
      }],
    }] as unknown as OpenAI.Responses.Response['output']
    const texto = extrairTextoComFontes(output)
    expect(texto).toContain('O valor de mercado estimado é R$ 420.000.')
    expect(texto).toContain('Fontes:')
    expect(texto).toContain('Anúncio A: https://exemplo.com/a')
    expect(texto).toContain('Anúncio B: https://exemplo.com/b')
    expect(texto.match(/exemplo\.com\/a/g)?.length).toBe(1)
  })

  it('ignora itens de output que não são mensagem (ex.: a própria chamada de web_search)', () => {
    const output = [
      { type: 'web_search_call', id: 'w1', status: 'completed' },
      {
        type: 'message', id: 'm1', role: 'assistant', status: 'completed',
        content: [{ type: 'output_text', text: 'Pronto.', annotations: [] }],
      },
    ] as unknown as OpenAI.Responses.Response['output']
    expect(extrairTextoComFontes(output)).toBe('Pronto.')
  })
})

describe('montarMensagemUsuario — entrada multimodal (Marco 7)', () => {
  it('sem anexo, mantém o formato simples de string', () => {
    const msg = montarMensagemUsuario('Quais prospecções eu tenho?', null)
    expect(msg).toEqual({ role: 'user', content: 'Quais prospecções eu tenho?' })
  })

  it('com anexo de imagem, gera input_text + input_image com o data URL', () => {
    const anexo: InvestidorAnexo = { tipo: 'imagem', nome: 'foto-imovel.jpg', dataUrl: 'data:image/jpeg;base64,ABC123' }
    const msg = montarMensagemUsuario('O que você vê nessa foto?', anexo)
    expect(msg.role).toBe('user')
    const partes = msg.content as OpenAI.Responses.ResponseInputContent[]
    expect(Array.isArray(partes)).toBe(true)
    const textoParte = partes.find(p => p.type === 'input_text') as OpenAI.Responses.ResponseInputText
    expect(textoParte.text).toContain('O que você vê nessa foto?')
    const imagemParte = partes.find(p => p.type === 'input_image') as OpenAI.Responses.ResponseInputImage
    expect(imagemParte.image_url).toBe('data:image/jpeg;base64,ABC123')
    expect(imagemParte.detail).toBe('auto')
  })

  it('com anexo de PDF, inclui o texto extraído no input_text (sem tool própria de PDF)', () => {
    const anexo: InvestidorAnexo = { tipo: 'pdf', nome: 'edital.pdf', textoExtraido: 'Lance mínimo: R$ 150.000,00' }
    const msg = montarMensagemUsuario('Resuma esse edital', anexo)
    const partes = msg.content as OpenAI.Responses.ResponseInputContent[]
    expect(partes).toHaveLength(1)
    const textoParte = partes[0] as OpenAI.Responses.ResponseInputText
    expect(textoParte.text).toContain('Resuma esse edital')
    expect(textoParte.text).toContain('edital.pdf')
    expect(textoParte.text).toContain('Lance mínimo: R$ 150.000,00')
  })

  it('com anexo de imagem e prompt vazio, ainda inclui a parte de imagem', () => {
    const anexo: InvestidorAnexo = { tipo: 'imagem', nome: 'foto.jpg', dataUrl: 'data:image/jpeg;base64,XYZ' }
    const msg = montarMensagemUsuario('', anexo)
    const partes = msg.content as OpenAI.Responses.ResponseInputContent[]
    expect(partes.some(p => p.type === 'input_image')).toBe(true)
  })
})

describe('runInvestidorSkill — anexo nunca usa o fast path de listagem', () => {
  const envAntes = { ...process.env }

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fake.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key'
    delete process.env.OPENAI_API_KEY
    const db = new FakeDB()
    db.seed('prospeccoes', [{ id: 'p1', nome: 'Apto Vila Nova', endereco: null, fase: 'nova', project_id: null }])
    vi.mocked(createClient).mockReturnValue(db as unknown as ReturnType<typeof createClient>)
  })

  afterEach(() => {
    process.env = { ...envAntes }
    vi.mocked(createClient).mockReset()
  })

  it('sem anexo, "quais são as prospecções" usa o fast path (usedLLM=false, lista direto)', async () => {
    const resultado = await runInvestidorSkill({
      prompt: 'quais são as prospecções',
      history: [],
      modo: 'chat',
      profileId: 'user-1',
      actor: 'Teste',
    })
    expect(resultado.usedLLM).toBe(false)
    expect(resultado.message).toContain('Apto Vila Nova')
  })

  it('com anexo presente, a mesma pergunta vai para o loop de IA em vez do fast path', async () => {
    const resultado = await runInvestidorSkill({
      prompt: 'quais são as prospecções',
      history: [],
      modo: 'chat',
      profileId: 'user-1',
      actor: 'Teste',
      anexo: { tipo: 'imagem', nome: 'foto.jpg', dataUrl: 'data:image/jpeg;base64,ABC' },
    })
    // Sem OPENAI_API_KEY, o loop de IA responde com a mensagem de
    // configuração — o que já prova que NÃO caiu no fast path (que
    // responderia com a lista de prospecções via usedLLM=false, como no
    // teste acima).
    expect(resultado.usedLLM).toBe(true)
    expect(resultado.message).toMatch(/não está configurada/i)
  })
})
