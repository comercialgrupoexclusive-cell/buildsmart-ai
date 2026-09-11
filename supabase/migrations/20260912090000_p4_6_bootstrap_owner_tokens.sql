-- P4.6 — correção do bootstrap do primeiro OWNER de uma Organização.
--
-- Problema real: configurar a credencial real de um owner (auth_user_id)
-- hoje só é possível via app/api/auth/org-admin (ação bootstrap), que exige
-- uma sessão owner/admin JÁ autenticada da própria organização — circular
-- para o primeiro acesso, antes de qualquer owner ter credencial real.
--
-- Esta tabela guarda tokens de uso único, gerados e mantidos SÓ pelo
-- servidor/operador (nunca aceitos do cliente como profileId/email/senha
-- livres — essa era a falha do antigo /api/auth/claim, agora desativado),
-- que ativam um organization_members específico já existente, já marcado
-- 'owner' e ainda sem auth_user_id. Não cria organização, papel ou membro
-- novo — só destrava a credencial de um vínculo que já existe.
create table if not exists public.bootstrap_owner_tokens (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.organization_members(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Só um token pendente por vínculo — evita acumular tokens válidos órfãos
-- se um novo for gerado antes do anterior expirar/ser usado.
create unique index if not exists bootstrap_owner_tokens_member_pending_key
  on public.bootstrap_owner_tokens (member_id)
  where used_at is null;

alter table public.bootstrap_owner_tokens enable row level security;
-- Nenhuma policy: RLS ligado sem nenhuma regra bloqueia anon/authenticated
-- por completo via PostgREST. Só o service_role (server, nunca o browser)
-- toca esta tabela — a mesma garantia que as outras tabelas administrativas
-- do P4.6 (organization_members, plantas) já usam via RLS, aqui reforçada
-- por não ter policy nenhuma.
