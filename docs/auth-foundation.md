# Fundação de autenticação global

Base: `710c7bc1c054b2e36eeb06d42c9fbaac32bdf7b6`

Esta rodada substitui o login por perfil/organização por uma identidade global do
Supabase Auth. A identidade pertence ao usuário; o acesso a uma organização vem
somente de uma membership explícita (`user_id`, `organization_id`, `role`).

## Fluxo

1. O proxy valida a sessão com `auth.getUser()` e exige uma organização ativa
   para rotas protegidas.
2. O login usa e-mail e senha do Supabase Auth. Com uma membership, seleciona a
   organização automaticamente. Com zero ou mais de uma, abre `/organizacoes`.
3. A organização selecionada fica vinculada ao `session_id` validado em
   `auth.sessions`; nenhum cookie ou valor do navegador concede autorização.
4. RLS combina a sessão viva, a membership ativa e a organização selecionada.
   `platform_admin` é global, privado e não contorna isolamento de tenant.
5. Logout registra auditoria, revoga a sessão atual no provedor e limpa apenas
   caches legados depois da revogação.

O cadastro é fechado. A migration cria um convite privado para
`comercialgrupoexclusive@gmail.com`, cria a organização `Sandbox` e provisiona
essa conta como `owner` e `platform_admin` depois que o e-mail estiver confirmado.

## Aplicação segura

A migration `20260917061212_fundacao_auth_global.sql` deve ser aplicada primeiro
em um projeto Supabase de desenvolvimento. Depois:

1. confirmar que `Sandbox` e o convite foram criados;
2. convidar ou criar `comercialgrupoexclusive@gmail.com` pelo painel Auth;
3. confirmar o e-mail e definir uma senha pelo link do próprio Supabase;
4. executar os cenários de login, memberships e isolamento;
5. somente então aplicar a mesma migration no ambiente desejado.

O repositório aceita `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e
`SUPABASE_SECRET_KEY`, com fallback temporário para as chaves legadas `anon` e
`service_role`. Nenhuma chave foi migrada automaticamente.

## Limites desta rodada

- A administração avançada de usuários ficou fechada; os endpoints antigos de
  claim, bootstrap e senha retornam `410`.
- As RPCs administrativas antigas do Portal foram colocadas em quarentena porque
  não vinculam todo alvo à organização ativa.
- O webhook do WhatsApp agora exige `ZAPI_WEBHOOK_SECRET` no cabeçalho
  `x-webhook-secret`; a variável precisa ser configurada antes de reativá-lo.
- Tabelas de negócio sem vínculo direto ou indireto com Processo exigem uma
  auditoria de domínio separada. Esta rodada não atribui tenant por suposição.
- Nenhuma migration foi aplicada ao projeto Supabase ativo durante o preparo
  local; o ambiente remoto deve ser escolhido explicitamente.
