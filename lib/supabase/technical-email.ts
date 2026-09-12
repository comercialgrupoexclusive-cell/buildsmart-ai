// P4.6 — e-mail técnico interno usado como identificador do Supabase Auth
// por trás do username visível ao usuário. Determinístico a partir do
// profile_id (nunca muda, mesmo que o username seja editado depois) e
// nunca exposto na UI. Compartilhado entre as rotas que criam/gerenciam
// acesso (org-admin, bootstrap-owner) para não haver duas definições
// divergentes do mesmo formato.
//
// P4.7 — ".internal" foi trocado por ".app": confirmado ao vivo que o
// Supabase Auth (signUp público) rejeita ".internal" com "Email address is
// invalid" — é um sufixo reservado para uso especial (RFC 1918/9476), e o
// validador de e-mail do GoTrue bloqueia esse tipo de domínio mesmo sendo
// sintaticamente válido. ".app" é um TLD real (não reservado) e não exige
// DNS/MX de verdade para passar na validação de formato.
const EMAIL_DOMAIN = 'users.buildsmart.app'

export function technicalEmail(profileId: string): string {
  return `p-${profileId}@${EMAIL_DOMAIN}`
}
