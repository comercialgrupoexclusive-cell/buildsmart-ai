// ═══════════════════════════════════════════════════════════════════════════
// Menor trava de acesso administrativo consistente com a arquitetura atual
// (hotfix "Luiza/WhatsApp/privacidade", item 2).
//
// O BuildSmart não tem sessão/token real amarrando o browser a um usuário —
// `currentProfile` é só um perfil escolhido num seletor e guardado em
// localStorage (ver lib/profile-context.tsx), o mesmo modelo de confiança
// que TODO o resto do app já usa (inclusive as tools de Tarefas/Avisos da
// Luiza). Não dá pra provar criptograficamente "isso é realmente o Luiz".
//
// O que ESTE módulo garante, de verdade: o `profile_id` que o cliente
// afirma ser o seu precisa corresponder, no banco, a um profile com
// `tipo = 'admin'` — o servidor consulta isso direto (não confia em um
// booleano que o cliente possa simplesmente mandar "true"). Isso transforma
// "qualquer um acessa" em "só quem sabe/tem o profile_id de um admin
// acessa" — não é RBAC completo (não reconstruído nesta rodada, fora de
// escopo), é a melhor trava possível dado o que já existe.
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js'

type DB = SupabaseClient

export async function isProfileAdmin(db: DB, profileId: string | null | undefined): Promise<boolean> {
  if (!profileId) return false
  const { data } = await db.from('profiles').select('tipo').eq('id', profileId).maybeSingle()
  return (data as { tipo?: string } | null)?.tipo === 'admin'
}
