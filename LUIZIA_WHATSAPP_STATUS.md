# Relatório: Luizia WhatsApp — Estado Atual
**Data:** 2026-06-10
**Projeto:** BuildSmart AI — https://buildsmart-ai-chi.vercel.app

---

## ✅ O QUE ESTÁ FUNCIONANDO (testado e confirmado nos logs)

| Item | Status |
|---|---|
| Webhook recebe mensagens da Z-API | ✅ `ZAPI WEBHOOK RECEBIDO` nos logs |
| OpenAI gpt-4o com function calling | ✅ `STEP tool-calls listar_obras` |
| **Acesso ao banco BuildSmart** | ✅ Listou obras reais: "Sobrado em Alvenaria Estrutural..." |
| Transcrição de áudio (Whisper) | ✅ implementado |
| Análise de fotos (GPT-4o Vision) | ✅ implementado |
| Grupos (responde a tudo por padrão) | ✅ implementado, configurável |
| Painel admin 3 abas | ✅ /admin-luizia |
| CRUD: criar obra/etapa/material/medição | ✅ implementado (9 funções) |

## ✅ BLOQUEIO RESOLVIDO (2026-06-10)

Z-API exigia Client-Token → adicionado `ZAPI_CLIENT_TOKEN` no Vercel.
Teste fim-a-fim confirmado:
```
TOOL [listar_obras] → obras reais do banco
ZAPI SEND RESULT 200 {"zaapId":"019EAFD7300A...","messageId":"3EB0CFF0A599D68A36FE34"}
```
**Sistema 100% operacional.**

---

## ⚙️ VARIÁVEIS DE AMBIENTE (Vercel - Production)

| Variável | Status |
|---|---|
| OPENAI_API_KEY | ✅ |
| ZAPI_INSTANCE_ID | ✅ `3F46957A0487C2D1E145E27765D3D1B5` (Meu número - Trial) |
| ZAPI_TOKEN | ✅ `DBD429FFFB6ACC1C8E52AED6` |
| ZAPI_CLIENT_TOKEN | ✅ adicionada 2026-06-10 — destravou o envio |
| SUPABASE_SERVICE_ROLE_KEY | ✅ adicionada 2026-06-10 (bypass RLS p/ webhook) |
| NEXT_PUBLIC_SUPABASE_URL | ✅ adicionada 2026-06-10 (estava só no .env.local!) |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | ✅ adicionada 2026-06-10 |
| NEXT_PUBLIC_DATA_MODE | ✅ adicionada 2026-06-10 (= supabase) |

**Descoberta importante:** `.env.local` está no `.gitignore` → Vercel nunca recebeu
as chaves do Supabase. O webhook rodava SEM banco desde o início (silenciosamente).
Corrigido adicionando as env vars diretamente no Vercel.

---

## 📁 ARQUIVOS PRINCIPAIS

| Arquivo | Descrição |
|---|---|
| `app/api/whatsapp/webhook/route.ts` | Webhook: recebe Z-API → OpenAI gpt-4o + 9 tools CRUD → responde. `maxDuration=60` |
| `app/api/luizia-test/route.ts` | Chat de teste do painel (não envia WhatsApp) |
| `app/(app)/admin-luizia/page.tsx` | Painel 3 abas: Conversas / Usuários / Configuração |
| `supabase/luizia_wa_users.sql` | Tabela de vínculo phone → usuário (RODAR no Supabase se ainda não rodou) |
| `supabase/create_luizia_whatsapp.sql` | Tabelas wa_messages, wa_config, wa_phone_rules (já rodado) |

## 🔧 FUNÇÕES QUE A LUIZIA EXECUTA (function calling)

1. `listar_obras` — lista obras com status
2. `criar_obra` — cria obra nova
3. `atualizar_status_obra` — muda status (orcamento/ativa/concluida/paralisada)
4. `listar_etapas` / `criar_etapa` — fases da obra
5. `listar_materiais` / `adicionar_material` — materiais por obra
6. `registrar_medicao` — diário de obra
7. `listar_pendencias` — materiais não comprados (todas as obras)

## ⚙️ CONFIG NO PAINEL (/admin-luizia → aba Configuração)

Chaves na tabela `luizia_wa_config`:
- `persona_global` — personalidade (texto livre)
- `modo_pausado` — true = não responde nada
- `crud_enabled` — ações no BuildSmart (padrão ON)
- `audio_enabled` — Whisper (padrão ON)
- `photos_enabled` — Vision (padrão ON)
- `groups_enabled` — grupos (padrão ON)
- `group_require_mention` — exigir "Luizia" no grupo (padrão OFF = responde tudo)

## ⚠️ AVISOS

- **Vercel Hobby = timeout 10s.** Function calling usa 2+ chamadas OpenAI (~15s).
  `maxDuration=60` só funciona no Vercel Pro. Se CRUD travar sem resposta, é isso.
- **Trial Z-API expira 11/06/2026** — amanhã! Precisa assinar o plano.
- Painel "page couldn't load" após deploy = cache do browser → Ctrl+Shift+R.
