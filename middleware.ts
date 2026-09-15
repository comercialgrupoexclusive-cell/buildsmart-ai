import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase/config'
import { ORG_COOKIE, destinoSeguro, sanitizarSlug } from '@/lib/auth/next-path'

// P4.5 FOCO 1 — antes desta rodada não existia middleware nenhum: toda
// leitura/escrita rodava com a anon key, sem sessão real, e as policies de
// RLS eram permissivas para compensar (o P0 de segurança confirmado no
// teste real da Allegra). Agora que RLS exige auth.uid() (ver migration
// p4_5_rls_autenticado_contextual), uma aba sem sessão simplesmente não
// carrega dados — melhor redirecionar cedo para o seletor de perfil, que é
// onde a sessão real é estabelecida (app/page.tsx, supabase.auth.signIn*).
export async function middleware(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_DATA_MODE === 'local') return NextResponse.next()

  const url = supabaseUrl()
  const key = supabaseAnonKey()
  if (!url || !key) return NextResponse.next()

  let response = NextResponse.next({ request })
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    // Em vez de descartar o destino, leva-o junto: depois de autenticar a
    // pessoa volta exatamente para onde tentou entrar. Só caminho interno
    // sobrevive a destinoSeguro() — um "next" externo é simplesmente ignorado.
    const destino = destinoSeguro(request.nextUrl.pathname + request.nextUrl.search)
    // O cookie da Organização é só uma lembrança de qual login mostrar; sem
    // ele cai no seletor de Organizações, que carrega o "next" adiante.
    const slug = sanitizarSlug(request.cookies.get(ORG_COOKIE)?.value)
    const redirectUrl = new URL(slug ? `/o/${slug}` : '/', request.url)
    if (destino) redirectUrl.searchParams.set('next', destino)
    return NextResponse.redirect(redirectUrl)
  }
  return response
}

export const config = {
  matcher: [
    // Tudo exceto: seletor de organização (/, casamento via "$" no
    // lookahead — representa o restante vazio depois da barra inicial),
    // login tematizado por Organização (/o/[slug] — P4.6, roda antes de
    // qualquer sessão existir), criar-organizacao (P4.7 — signUp acontece
    // aqui, também sem sessão prévia), onboarding (fluxo pós-cadastro que
    // ainda não tem sessão), API, portal público por token, e assets
    // estáticos/imagens/favicon.
    //
    // `experimento-360` SAIU desta lista: enquanto estava fora do middleware
    // ele abria sem sessão e os módulos reais batiam em RLS sem auth.uid(),
    // devolvendo tela vazia. Agora entra pelo mesmo portão do resto do
    // sistema e volta sozinho depois do login, via "next".
    '/((?!$|o/|criar-organizacao|onboarding|api|portal|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
