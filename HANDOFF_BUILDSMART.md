# BuildSmart — Handoff

> Arquivo único de handoff. Sempre **sobrescrever**; reflete o estado REAL ao fim da
> última rodada. Canônico: `ARQUITETURA.md` (o quê) · `ROADMAP.md` (próximos passos) ·
> `RELATORIO_COMPONENTES_NOVA_ORGANIZACAO.md` (componentes) · `AGENTS.md` (como).

## Estado atual — sessão autônoma de organização (02/out/2026)

Fase de **teste** (sem dados reais). Tronco: `claude/planejamento-2-0-buildsmart-quw4d8`.
App roda local em `localhost:3003`. Tudo abaixo foi commitado e enviado ao GitHub,
verificado com `tsc` limpo + app rodando a cada passo.

### ✅ Feito nesta sessão
1. **Base canônica** criada: `ARQUITETURA.md` (motor, glossário, harness por fase, SQL por
   fase, era-anterior×atual, governança, padrão de módulo §18) + `ROADMAP.md`.
2. **Motor esvaziado** (`lib/processo/` = só núcleo): `orcamento`, `eap`, `caixa-entrada`,
   `clientes`, `planta-baixa` saíram para suas casas `lib/<m>/`.
3. **Casas de módulo consolidadas** (lib espalhada → 1 pasta por módulo):
   - `lib/orcamento/` — processo, arvore, buscar-catalogo, inserir-item, vinculos, export,
     import-export, ai, import-export-templates.
   - `lib/investidor/` — ai-tools, calculadora, oportunidade, venda (+ carteira já existente).
   - `lib/portal/` — + admin-client.
4. **`RELATORIO_COMPONENTES_NOVA_ORGANIZACAO.md`**: inventário de reutilizáveis + duplicação.
5. Auditoria **"Visão Geral"**: 3 componentes **distintos, não cópias** → mantidos separados.
6. **Bug de frontend corrigido:** `<a>` aninhado no `ProcessoCard` (hydration error) → `<span>`.

### ✅ Também feito (mesma sessão, após feedback de UX)
- **Sidebar:** Canteiro (legado) saiu do menu; itens de IA viraram "Assistente IA" /
  "Assistente (WhatsApp)"; marca única `MarcaLogo` com a **foto da organização**.
- **Assistente configurável por organização** (não é mais "Luiza"): `organizations.assistente_nome`,
  RPC `organizacao_branding_atualizar` (só owner/admin da org; sem UPDATE geral na tabela),
  `lib/organizacao/{contexto,branding}`, card **Identidade da organização** em Configurações
  (nome + upload de logo). Textos visíveis trocados (chat, boas-vindas, Assistente IA, monitor,
  telas do Investidor) com helpers neutros de gênero. Testado ponta a ponta (salvar + isolamento
  entre orgs + logo no menu); dados de teste restaurados.
- Migrations desta rodada: `20261002160000_organizations_assistente_nome`,
  `20261002170000_organizacao_branding_atualizar` (aplicadas direto — fase de teste).

### ⚠️ Gaps conhecidos (decisão do usuário necessária)
- **WhatsApp** (`app/(app)/admin-luiza`, `luizia_wa_config`: `bot_name`, `persona_global`) é
  **global** e ainda diz "Luiza" → precisa virar config **por organização**.
- **Telas legadas de obra** (`components/obra/*`, `/obras`) ainda dizem "Luiza"; saem na Fase 2.
- **Boas-vindas** ainda descreve "A obra é o centro do sistema" (modelo antigo; hoje é Processo).
- Saudação inicial gravada na conversa usa o nome padrão se o chat abrir antes da org carregar.

### Governança (fechada)
Claude constrói · GPT apoia · o dev faz verificação de segurança só no final · regras
desta fase (docs do repo) prevalecem sobre os docs antigos do dev no Drive `00 - CENTRAL`.

### ▶ Próximos passos (recomendo com você / supervisionado)
- **Cluster Luiza/IA** (13 arquivos `luizia-*` + `*-ai-tools` soltos em `lib/`): organizar
  numa casa (`lib/luiza/`?) envolve **decisão de arquitetura da camada de IA** — melhor junto.
- **Fase 2 (grande e sensível):** refazer nativos os 4 módulos acoplados (planejamento,
  medições, financeiro, compras) **compondo o design system** (ver `RELATORIO_COMPONENTES` §6)
  → cortar imports de `components/obra` → deletar o legado (regra P2). Mexe em telas; fazer
  tela a tela, com alinhamento.
- Legados `obra-*`/`projeto-*` em `lib/`: ficam como estão até a Fase 2 (mover agora = churn).

### Pendências menores
- Arquivar `RELATORIO_*` antigos/`LOG_*`/fósseis em `docs/historico/`.
- Consolidar branch-sprawl num tronco único.
- Qualidade p/ auditoria: Prettier/ESLint `printWidth: 100` (~5.114 linhas > 120 col).
