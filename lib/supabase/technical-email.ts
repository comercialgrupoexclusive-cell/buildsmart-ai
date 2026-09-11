// P4.6 — e-mail técnico interno usado como identificador do Supabase Auth
// por trás do username visível ao usuário. Determinístico a partir do
// profile_id (nunca muda, mesmo que o username seja editado depois) e
// nunca exposto na UI. Compartilhado entre as rotas que criam/gerenciam
// acesso (org-admin, bootstrap-owner) para não haver duas definições
// divergentes do mesmo formato.
const EMAIL_DOMAIN = 'users.buildsmart.internal'

export function technicalEmail(profileId: string): string {
  return `p-${profileId}@${EMAIL_DOMAIN}`
}
