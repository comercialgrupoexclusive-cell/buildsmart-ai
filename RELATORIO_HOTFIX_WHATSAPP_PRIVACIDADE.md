# Hotfix curto — Luiza / WhatsApp / Privacidade

```
=== PARA O CHATGPT REVISAR ===

FATOS
- luizia_wa_phone_rules não distinguia contato individual de grupo. resolverTelefoneDoProfile()
  (usada por "me avise"/avisos pessoais) aceitava qualquer vínculo, incluindo grupo.
- Estado real do banco (projeto jwezrjyatfjvvsugtugo): as 2 phone_rules existentes são AMBAS
  grupos ("120363...-group"), uma delas vinculada a profile_id=Luiz — ou seja, o vínculo "pessoal"
  de produção era, na prática, um grupo. Confirmado por consulta direta e pelo backfill da migração.
- /admin-luiza e /luizia-monitor não tinham nenhum gate — qualquer perfil (ou navegação direta pela
  URL) via histórico de WhatsApp de todos os usuários.
- Duas APIs administrativas sensíveis também sem gate: GET /api/luizia-monitor (dump de 250 logs de
  conversa) e o branch de "Enviar agora" em POST /api/whatsapp/dispatch (dispara WhatsApp real para
  qualquer dispatch_id, sem checar secret nem identidade) — achadas durante a auditoria pedida.
- profiles.tipo já existe no schema ('admin'|'usuario'|'cliente'|'prestador') e já era usado como
  badge visual em app/page.tsx — nenhum sistema de sessão/token real existe no app (confirmado:
  sem middleware.ts, currentProfile é só localStorage).

IMPLEMENTADO
1) luizia_wa_phone_rules ganhou coluna is_group (migração 20260822020000, aplicada). Populada por
   evidência real do provider: app/api/whatsapp/webhook/route.ts agora faz upsert(phone, is_group)
   a cada mensagem usando body.isGroup do Z-API — nunca inferência por nome. Backfill das 2 linhas
   existentes usou a mesma heurística estrutural já usada no admin (JID de grupo), confirmando as
   duas como grupo.
   lib/luizia-dispatch.ts: resolverTelefoneDoProfile() agora filtra .eq('is_group', false) — só
   contatos individuais contam como "meu WhatsApp". Sem individual: recusa citando "WhatsApp
   pessoal" explicitamente. Múltiplos individuais: pede escolha (comportamento já existia, mantido).
   Grupo continua existindo normalmente para resumo por obra/equipe — só sai deste resolvedor.
2) lib/luizia-admin-guard.ts (novo): isProfileAdmin(db, profileId) consulta profiles.tipo no banco
   (nunca confia num booleano vindo do cliente). Aplicado em:
   - app/(app)/admin-luiza/page.tsx e app/(app)/luizia-monitor/page.tsx: gate client-side — só
     busca/pinta dados quando currentProfile.tipo==='admin'; não-admin vê "Acesso restrito", nenhuma
     query dispara.
   - GET /api/luizia-monitor: exige ?profileId= verificado como admin, senão 403.
   - POST /api/whatsapp/dispatch (branch manual dispatch_id): exige profile_id verificado como
     admin no corpo, senão 403 — o branch de cron (com DISPATCH_SECRET) não foi tocado.
   Limitação documentada: sem sessão real, a trava confia no profile_id que o cliente afirma ser o
   seu — mesmo modelo de confiança de todo o resto do app. Não é RBAC completo (não reconstruído,
   fora de escopo); é a melhor trava consistente com a arquitetura atual.

TESTES
84/84 passando (77 anteriores + 7 novos): lib/__tests__/luizia-admin-guard.test.ts (admin acessa,
usuário comum bloqueado, sem profileId bloqueado, profileId inexistente bloqueado) e 3 novos em
lib/__tests__/luizia-avisos-ai-tools.test.ts (profile vinculado só a grupo → aviso pessoal recusado;
1 contato individual → resolve; grupo + individual → usa só o individual, nunca o grupo — mais os
testes existentes atualizados com is_group nos seeds). tsc limpo. build ok (40 rotas). eslint: 57
problemas nos arquivos tocados, idêntico à contagem pré-existente (comparado via git stash).
Limitação: o comportamento HTTP (403 real) dos 2 endpoints gateados não foi exercitado via request
de rede real — o sandbox não tem acesso a *.supabase.co, então getSupabase()/supabase() retornam
null antes mesmo de alcançar o novo check nos testes automatizados; a lógica de autorização em si
(isProfileAdmin) está coberta diretamente.

RISCOS
- ctx.profileId/profile_id continuam não verificados criptograficamente (mesma limitação de toda a
  base) — a trava impede acesso casual/por URL adivinhada, não um atacante que descubra o UUID de
  um perfil admin.
- Após este fix, o vínculo "pessoal" atual de Luiz em produção (que é um grupo) deixa de servir para
  avisos pessoais — comportamento esperado e correto, mas um admin precisará vincular um contato
  individual real para "me avise" voltar a funcionar para ele.
- 403 dos 2 endpoints administrativos não testado com request HTTP real (ver TESTES).

COMMIT
f2fab55 — "Hotfix Luiza/WhatsApp: separa grupo de contato pessoal, protege Painel Luiza" — em main e
previsoes/prazo-fornecimento-material (fast-forward, sem conflito).

DEPLOY
READY — push feito em main (pipeline Vercel automático). Migração 20260822020000 já aplicada ao
banco de produção antes do commit/push.
```
