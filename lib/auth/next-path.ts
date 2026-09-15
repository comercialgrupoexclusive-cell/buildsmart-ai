// Destino de retorno pós-login ("next"). Um parâmetro de redirecionamento é
// uma superfície clássica de open redirect: quem controla a URL controla para
// onde a pessoa vai depois de autenticar. Por isso só caminhos internos deste
// mesmo app são aceitos — nunca uma URL absoluta, nunca outro host.

// Cookie que lembra a última Organização usada. Guarda só o slug, que já é
// dado público (organizacoes_publicas/organizacao_tema_publico): serve
// exclusivamente para escolher QUAL tela de login mostrar. Não concede acesso
// a nada — quem decide o que a pessoa enxerga continua sendo a sessão do
// Supabase Auth e o RLS.
export const ORG_COOKIE = 'bs_org'

const SLUG_VALIDO = /^[a-z0-9][a-z0-9-]{0,62}$/

export function sanitizarSlug(valor: string | undefined | null): string | null {
  if (!valor) return null
  const slug = valor.trim().toLowerCase()
  return SLUG_VALIDO.test(slug) ? slug : null
}

/**
 * Devolve `valor` se for um destino interno seguro, senão `null`.
 *
 * Recusa: URL absoluta ou com esquema (`https://…`, `javascript:`), caminho
 * protocol-relative (`//evil.com`), a variante com barra invertida que alguns
 * navegadores normalizam para `//` (`/\evil.com`), e qualquer coisa que não
 * comece com uma única barra. Preserva query e hash do caminho interno.
 */
export function sanitizarNext(valor: string | undefined | null): string | null {
  if (!valor) return null
  const bruto = valor.trim()
  if (!bruto.startsWith('/')) return null
  if (bruto.startsWith('//') || bruto.startsWith('/\\')) return null
  // `new URL` com base fictícia normaliza `..` e revela qualquer esquema
  // embutido; se o resultado escapar da base, o destino não é interno.
  try {
    const base = 'http://interno.invalid'
    const url = new URL(bruto, base)
    if (url.origin !== base) return null
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return null
  }
}

// Rotas que nunca fazem sentido como destino de retorno: voltar para o próprio
// login criaria um laço.
const NUNCA_RETORNAR = ['/o/', '/criar-organizacao']

export function destinoSeguro(valor: string | undefined | null): string | null {
  const next = sanitizarNext(valor)
  if (!next) return null
  if (next === '/') return null
  if (NUNCA_RETORNAR.some(p => next.startsWith(p))) return null
  return next
}
