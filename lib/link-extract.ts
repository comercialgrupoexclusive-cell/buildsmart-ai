// ═══════════════════════════════════════════════════════════════════════════
// Extração de link (Laboratório Investidor, Marco 7) — busca uma URL
// ESPECÍFICA que o usuário já informou (edital, anúncio, matrícula
// publicada online etc.) e extrai o texto legível da página.
//
// Diferente da tool nativa `web_search` (que pesquisa por termo e decide o
// que abrir): aqui a Luiza já tem a URL exata, só precisa ler o conteúdo —
// por isso é uma tool própria do domínio (lib/investidor-ai-tools.ts), sem
// nenhum provedor externo/chave de API, só fetch + limpeza de HTML.
// ═══════════════════════════════════════════════════════════════════════════

const MAX_CHARS = 6000
const MAX_BYTES = 3 * 1024 * 1024 // 3MB — suficiente para uma página de texto/edital
const TIMEOUT_MS = 8000

export type ExtracaoLink =
  | { ok: true; texto: string; truncado: boolean }
  | { ok: false; erro: string }

function limparHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|p|div|li|tr|h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim()
}

export async function extrairConteudoDeLink(url: string): Promise<ExtracaoLink> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { ok: false, erro: 'URL inválida.' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, erro: 'Só URLs http(s) são suportadas.' }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BuildSmartAI/1.0)' },
    })
    if (!res.ok) return { ok: false, erro: `A página respondeu com erro ${res.status}.` }

    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return { ok: false, erro: `Conteúdo não é uma página de texto/HTML (${contentType || 'tipo desconhecido'}).` }
    }

    const reader = res.body?.getReader()
    const chunks: Uint8Array[] = []
    let recebido = 0
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          recebido += value.byteLength
          if (recebido > MAX_BYTES) { await reader.cancel(); break }
          chunks.push(value)
        }
      }
    }
    const html = Buffer.concat(chunks.map(c => Buffer.from(c))).toString('utf-8')
    const texto = limparHtml(html)
    if (!texto) return { ok: false, erro: 'Não consegui extrair texto legível dessa página.' }
    return { ok: true, texto: texto.slice(0, MAX_CHARS), truncado: texto.length > MAX_CHARS }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return { ok: false, erro: 'A página demorou demais para responder.' }
    return { ok: false, erro: err instanceof Error ? err.message : 'Erro ao acessar a página.' }
  } finally {
    clearTimeout(timer)
  }
}
