// Testa lib/link-extract.ts (extração de link, Marco 7) sem rede real —
// mocka global.fetch com respostas controladas.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { extrairConteudoDeLink } from '../link-extract'

function fakeStreamResponse(body: string, init: { ok?: boolean; status?: number; contentType?: string } = {}) {
  const bytes = new TextEncoder().encode(body)
  let sent = false
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    headers: new Map([['content-type', init.contentType ?? 'text/html; charset=utf-8']]),
    body: {
      getReader() {
        return {
          async read() {
            if (sent) return { done: true, value: undefined }
            sent = true
            return { done: false, value: bytes }
          },
          async cancel() { /* noop */ },
        }
      },
    },
  } as unknown as Response
}

describe('extrairConteudoDeLink', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('rejeita URL inválida sem tentar rede', async () => {
    const r = await extrairConteudoDeLink('não é url')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toMatch(/inválida/i)
  })

  it('rejeita protocolo que não seja http(s)', async () => {
    const r = await extrairConteudoDeLink('ftp://exemplo.com/arquivo')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toMatch(/http/i)
  })

  it('extrai texto limpo de HTML, removendo script/style/tags', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(fakeStreamResponse(
      '<html><head><style>.a{color:red}</style><script>alert(1)</script></head>' +
      '<body><h1>Edital de Leilão</h1><p>Imóvel na Rua das Flores, 123.</p><p>Lance mínimo: R$ 150.000,00</p></body></html>'
    ))
    const r = await extrairConteudoDeLink('https://exemplo.com/edital')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.texto).toContain('Edital de Leilão')
      expect(r.texto).toContain('Lance mínimo: R$ 150.000,00')
      expect(r.texto).not.toContain('alert(1)')
      expect(r.texto).not.toContain('color:red')
      expect(r.texto).not.toContain('<p>')
    }
  })

  it('retorna erro claro quando a página responde com status de erro', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(fakeStreamResponse('não encontrado', { ok: false, status: 404 }))
    const r = await extrairConteudoDeLink('https://exemplo.com/nao-existe')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toContain('404')
  })

  it('recusa conteúdo que não é HTML/texto (ex.: PDF direto por essa via)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(fakeStreamResponse('%PDF-1.4...', { contentType: 'application/pdf' }))
    const r = await extrairConteudoDeLink('https://exemplo.com/arquivo.pdf')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toMatch(/html/i)
  })

  it('trunca textos muito longos e sinaliza truncado:true', async () => {
    const paragrafo = '<p>' + 'palavra '.repeat(2000) + '</p>'
    vi.spyOn(global, 'fetch').mockResolvedValue(fakeStreamResponse(`<html><body>${paragrafo}</body></html>`))
    const r = await extrairConteudoDeLink('https://exemplo.com/longo')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.truncado).toBe(true)
      expect(r.texto.length).toBeLessThanOrEqual(6000)
    }
  })

  it('propaga erro de rede como mensagem amigável', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('getaddrinfo ENOTFOUND'))
    const r = await extrairConteudoDeLink('https://dominio-que-nao-existe.invalid')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toContain('ENOTFOUND')
  })
})
