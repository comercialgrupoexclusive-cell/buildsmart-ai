import { NextResponse } from 'next/server'

// P4.6 — DESATIVADO. Este endpoint aceitava profileId + email + senha
// livres do corpo da requisição para vincular auth_user_id a qualquer
// profile ainda sem credencial real — inseguro por design: qualquer um que
// soubesse (ou adivinhasse) um profileId podia reivindicar aquele perfil
// sem nenhuma prova de identidade prévia.
//
// Substituído por:
// - app/api/auth/org-admin (ação bootstrap/create_member/reset_password),
//   que exige sessão owner/admin já autenticada da organização; e
// - app/api/auth/bootstrap-owner, token de uso único gerado só pelo
//   servidor/operador, para o primeiro owner de uma organização (quando
//   ainda não existe nenhuma sessão owner/admin para usar a rota acima).
//
// Sem chamadores no código atual — app/page.tsx virou o seletor de
// Organização na P4.6 Bloco A e não usa mais este fluxo. Mantido só para
// responder de forma explícita e segura a quem ainda tiver a rota antiga
// em cache/bookmark, em vez de simplesmente remover o arquivo.
export async function POST() {
  return NextResponse.json(
    { error: 'Este acesso foi desativado. Entre pela Organização em /o/[slug].' },
    { status: 410 }
  )
}
