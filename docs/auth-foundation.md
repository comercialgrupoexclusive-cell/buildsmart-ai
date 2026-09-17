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

## Ambiente aplicado

Por decisão explícita do responsável, as migrations foram aplicadas diretamente
ao projeto Supabase ativo `jwezrjyatfjvvsugtugo` em 17/09/2026:

1. `20260917061212_fundacao_auth_global.sql` — identidade, sessão, membership,
   RLS e auditoria;
2. `20260917234152_quarantine_unscoped_legacy_rls.sql` — fechamento reversível
   de tabelas antigas sem vínculo de tenant demonstrado;
3. `20260917234538_quarantine_legacy_security_definers.sql` — revogação dos
   RPCs administrativos antigos ainda expostos à Data API.

Nenhuma linha de negócio foi apagada. A quarentena preservou os dados e fechou
o acesso de `anon` e `authenticated` até o domínio receber uma política de tenant.

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
- 54 tabelas de negócio sem vínculo direto ou indireto demonstrado com Processo
  estão em quarentena. Uma rodada de domínio deve reabri-las individualmente.
- Os 24 avisos `rls_enabled_no_policy` são tabelas fechadas por padrão; não
  representam acesso público, mas precisam de política antes de voltar ao uso.
- Permanecem para revisão separada: seis funções legadas com `search_path`
  mutável, a extensão `pg_net` no schema `public` e a proteção de senhas vazadas
  desativada no Supabase Auth.
- Os avisos de `SECURITY DEFINER` restantes foram revisados: sete helpers de
  autenticação validados por sessão e vinte RPCs públicos do portal validados por
  hash de token. Nenhuma função administrativa antiga continua executável por
  `anon` ou `authenticated`.

## Validação real

- `comercialgrupoexclusive@gmail.com`: e-mail confirmado, `platform_admin` e
  `owner` da organização `Sandbox` (`d724950e-4b55-431a-ba64-8fb58f43d7a7`).
- Login correto, senha incorreta, logout e invalidação da sessão foram exercitados
  contra o Supabase e contra os handlers reais da aplicação.
- O retorno por `next` preservou uma rota interna e rejeitou URL externa.
- Usuários temporários validaram zero e múltiplas organizações e foram removidos
  depois do teste.
- Uma membership da Sandbox não conseguiu selecionar nem ler a organização de
  outro tenant; `platform_admin` usou o fluxo normal e não contornou RLS.
- A recuperação de senha foi solicitada pelo fluxo do Supabase. A senha final
  deve ser definida pelo link enviado ao e-mail da conta; nenhuma senha foi
  gravada no repositório.
- Após as migrations: 54 tabelas em quarentena, zero política aberta sem guarda
  e zero RPC administrativo legado executável pelos papéis da Data API.
