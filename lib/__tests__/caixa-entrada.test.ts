import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { criarEntradaArquivo, criarEntradaTexto, listarEntradasCaixa } from '../processo/caixa-entrada'

// A regra de segurança de verdade mora no banco (RLS por processo_is_accessible
// + trigger processo_caixa_entrada_set_autor forçando autor_profile_id a
// partir de current_profile_id(), validado ao vivo na migration
// 20260919120000: cross-org insert negado, UPDATE/DELETE inexistentes).
// Este teste só trava o contrato do lado do cliente: nunca manda
// autor_profile_id (o servidor sempre reescreveria mesmo, mas o cliente não
// deve nem tentar), preserva o conteúdo bruto tal como veio, e usa o mesmo
// padrão de bucket/prefixo de components/investidor/ProspeccaoArquivos.tsx.
function mockQuery(result: { data: unknown; error: unknown }) {
  const q = {
    select: vi.fn(() => q),
    eq: vi.fn(() => q),
    order: vi.fn(() => q),
    insert: vi.fn(() => q),
    single: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (v: typeof result) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  }
  return q
}

describe('listarEntradasCaixa', () => {
  it('busca por processo_id ordenando por created_at desc', async () => {
    const entradas = [{ id: 'e1', tipo: 'texto', conteudo_texto: 'oi', created_at: '2026-09-19T00:00:00Z' }]
    const q = mockQuery({ data: entradas, error: null })
    const from = vi.fn(() => q)
    const supabase = { from } as unknown as SupabaseClient

    const lista = await listarEntradasCaixa(supabase, 'proc-1')

    expect(from).toHaveBeenCalledWith('processo_caixa_entrada')
    expect(q.eq).toHaveBeenCalledWith('processo_id', 'proc-1')
    expect(q.order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(lista).toEqual(entradas)
  })

  it('propaga erro do Supabase em vez de engolir', async () => {
    const q = mockQuery({ data: null, error: { message: 'RLS negou' } })
    const supabase = { from: vi.fn(() => q) } as unknown as SupabaseClient
    await expect(listarEntradasCaixa(supabase, 'proc-1')).rejects.toEqual({ message: 'RLS negou' })
  })
})

describe('criarEntradaTexto', () => {
  it('insere tipo texto com o conteúdo aparado, sem mandar autor_profile_id', async () => {
    const nova = { id: 'e2', tipo: 'texto', conteudo_texto: 'relato bruto' }
    const q = mockQuery({ data: nova, error: null })
    const supabase = { from: vi.fn(() => q) } as unknown as SupabaseClient

    const resultado = await criarEntradaTexto(supabase, 'proc-1', '  relato bruto  ')

    expect(q.insert).toHaveBeenCalledWith({ processo_id: 'proc-1', tipo: 'texto', conteudo_texto: 'relato bruto' })
    expect(resultado).toEqual(nova)
  })
})

describe('criarEntradaArquivo', () => {
  function supabaseComStorage(insertResult: { data: unknown; error: unknown }) {
    const q = mockQuery(insertResult)
    const upload = vi.fn(() => Promise.resolve({ error: null }))
    const getPublicUrl = vi.fn((path: string) => ({ data: { publicUrl: `https://storage.example/${path}` } }))
    const storageFrom = vi.fn(() => ({ upload, getPublicUrl }))
    const supabase = {
      from: vi.fn(() => q),
      storage: { from: storageFrom },
    } as unknown as SupabaseClient
    return { supabase, q, upload, storageFrom, getPublicUrl }
  }

  it('sobe pro bucket project-files com prefixo caixa-entrada/<processo> e insere tipo imagem', async () => {
    const { supabase, q, upload, storageFrom } = supabaseComStorage({ data: { id: 'e3' }, error: null })
    const arquivo = new File(['conteudo'], 'foto.png', { type: 'image/png' })

    await criarEntradaArquivo(supabase, 'proc-1', arquivo)

    expect(storageFrom).toHaveBeenCalledWith('project-files')
    const [path] = upload.mock.calls[0]
    expect(path).toMatch(/^caixa-entrada\/proc-1\/.+\.png$/)

    const inserted = q.insert.mock.calls[0][0]
    expect(inserted).toMatchObject({
      processo_id: 'proc-1',
      tipo: 'imagem',
      arquivo_nome: 'foto.png',
      arquivo_tipo: 'image/png',
      arquivo_url: `https://storage.example/${path}`,
    })
    expect(inserted).not.toHaveProperty('autor_profile_id')
  })

  it('classifica áudio pelo mime e propaga duracaoSegundos', async () => {
    const { supabase, q } = supabaseComStorage({ data: { id: 'e4' }, error: null })
    const arquivo = new File(['audio'], 'nota.webm', { type: 'audio/webm' })

    await criarEntradaArquivo(supabase, 'proc-1', arquivo, { duracaoSegundos: 12.4 })

    const inserted = q.insert.mock.calls[0][0]
    expect(inserted).toMatchObject({ tipo: 'audio', duracao_segundos: 12.4 })
  })

  it('documento (nem imagem nem áudio) cai em tipo documento', async () => {
    const { supabase, q } = supabaseComStorage({ data: { id: 'e5' }, error: null })
    const arquivo = new File(['doc'], 'contrato.pdf', { type: 'application/pdf' })

    await criarEntradaArquivo(supabase, 'proc-1', arquivo)

    expect(q.insert.mock.calls[0][0]).toMatchObject({ tipo: 'documento' })
  })

  it('propaga erro de upload sem tentar inserir linha', async () => {
    const q = mockQuery({ data: null, error: null })
    const upload = vi.fn(() => Promise.resolve({ error: { message: 'falha no storage' } }))
    const storageFrom = vi.fn(() => ({ upload, getPublicUrl: vi.fn() }))
    const supabase = { from: vi.fn(() => q), storage: { from: storageFrom } } as unknown as SupabaseClient
    const arquivo = new File(['x'], 'a.pdf', { type: 'application/pdf' })

    await expect(criarEntradaArquivo(supabase, 'proc-1', arquivo)).rejects.toEqual({ message: 'falha no storage' })
    expect(q.insert).not.toHaveBeenCalled()
  })
})
