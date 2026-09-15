import { describe, expect, it } from 'vitest'
import { destinoSeguro, sanitizarNext, sanitizarSlug } from '@/lib/auth/next-path'

// O "next" do login é um parâmetro controlado por quem monta a URL. Estes
// testes fixam a fronteira: só caminho interno deste app volta a ser destino.
describe('sanitizarNext', () => {
  it('aceita caminho interno, com query e hash', () => {
    expect(sanitizarNext('/experimento-360')).toBe('/experimento-360')
    expect(sanitizarNext('/processos/abc?tab=board#topo')).toBe('/processos/abc?tab=board#topo')
  })

  it('recusa URL absoluta e esquemas perigosos', () => {
    expect(sanitizarNext('https://evil.com')).toBeNull()
    expect(sanitizarNext('http://evil.com/x')).toBeNull()
    expect(sanitizarNext('javascript:alert(1)')).toBeNull()
    expect(sanitizarNext('data:text/html,<script>')).toBeNull()
  })

  it('recusa protocol-relative e a variante com barra invertida', () => {
    expect(sanitizarNext('//evil.com')).toBeNull()
    expect(sanitizarNext('/\\evil.com')).toBeNull()
    expect(sanitizarNext('//evil.com/path')).toBeNull()
  })

  it('recusa caminho relativo e vazio', () => {
    expect(sanitizarNext('experimento-360')).toBeNull()
    expect(sanitizarNext('')).toBeNull()
    expect(sanitizarNext(null)).toBeNull()
    expect(sanitizarNext(undefined)).toBeNull()
  })

  it('normaliza ".." sem deixar escapar da origem', () => {
    expect(sanitizarNext('/a/../b')).toBe('/b')
    expect(sanitizarNext('/../../etc')).toBe('/etc')
  })
})

describe('destinoSeguro', () => {
  it('não devolve o próprio login como destino (evita laço)', () => {
    expect(destinoSeguro('/o/buildsmart')).toBeNull()
    expect(destinoSeguro('/criar-organizacao')).toBeNull()
    expect(destinoSeguro('/')).toBeNull()
  })

  it('devolve destinos internos legítimos', () => {
    expect(destinoSeguro('/experimento-360')).toBe('/experimento-360')
    expect(destinoSeguro('/dashboard')).toBe('/dashboard')
  })

  it('herda as recusas de sanitizarNext', () => {
    expect(destinoSeguro('https://evil.com')).toBeNull()
    expect(destinoSeguro('//evil.com')).toBeNull()
  })
})

describe('sanitizarSlug', () => {
  it('aceita slug público válido', () => {
    expect(sanitizarSlug('buildsmart')).toBe('buildsmart')
    expect(sanitizarSlug('Espindola-Teste-Operacional')).toBe('espindola-teste-operacional')
  })

  it('recusa slug com caractere de caminho ou vazio', () => {
    expect(sanitizarSlug('../admin')).toBeNull()
    expect(sanitizarSlug('a/b')).toBeNull()
    expect(sanitizarSlug('-comeca-com-hifen')).toBeNull()
    expect(sanitizarSlug('')).toBeNull()
  })
})
