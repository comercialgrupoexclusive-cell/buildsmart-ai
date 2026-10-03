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

### ✅ Rodada 03/out — dois defeitos reportados pelo usuário (testados ponta a ponta)
- **Lançar item "Livre" no orçamento falhava** ("Não foi possível adicionar o item"). Causa raiz: a
  tabela contador `orcamento_codigo_livre_seq` tinha RLS com **só política RESTRITIVA e nenhuma
  PERMISSIVA** (acesso negado a todos) — foi esquecida quando a RLS por organização entrou.
  Corrigido com política permissiva igual à das tabelas irmãs
  (`20261003100000_orcamento_codigo_livre_seq_policy.sql`, já aplicada no banco). Testado como o
  usuário autenticado (gera `LIV-001`) e recusado em orçamento de outra organização.
  A tela escondia o motivo: erro do Supabase não é `Error`. Novo `lib/erros.ts` (`mensagemDeErro`),
  aplicado nos 7 pontos do fluxo orçamento/processo.
- **EAP: o aviso de "alterações não salvas" só cobria trocar de etapa e fechar a aba do navegador.**
  Trocar de aba do Processo ou clicar no menu **perdia a edição em silêncio**. Novo guarda de
  navegação (`components/ui/GuardaNavegacao.tsx` + `ConfirmarSaidaModal.tsx`): aviso com
  *Salvar e sair / Descartar / Continuar editando* (substitui o `confirm()` em que "Cancelar" = descartar).
  Gravações da EAP (`lib/eap`) agora **lançam o erro do banco** (antes ignoravam) e a tela mostra o
  motivo; se o salvar falhar, o usuário **fica na tela**. Testado: aba, link do menu, as 3 escolhas e
  falha simulada de gravação.
- Verificado que **nada da EAP foi removido** (commit `c37e72a` está na branch; arraste só pela alça,
  mesmo nível, atraso de 200 ms no toque). `origin/main` **não tem a EAP** — link vindo de `main` não mostra nada disso.

### ✅ Rodada 03/out (2) — EAP inutilizável no celular (reportado pelo usuário, reproduzido em 375×812)
- **Rolar a tela arrastava as etapas.** Causa: `SortableList` usava `PointerSensor`, que também aceita
  toque → um deslize de rolagem sobre a alça iniciava o arraste na hora (proteção de "segurar 200 ms" do
  `TouchSensor` era furada); alça com `touch-action: none` (nem rolava a partir dela) e só 20×20 px.
  Agora: `MouseSensor` (4 px) + `TouchSensor` (**segurar ~250 ms parado**, tolerância 8 px), alça com
  `touch-action: manipulation` e 32×32 px em tela de toque. Vale também pro orçamento (mesmo componente).
- **Sem onde salvar no celular.** O Salvar ficava só no topo do cartão de detalhes e saía da tela ao
  rolar. Nova `components/processo/eap/BarraSalvar.tsx`: barra fixa *Alterações não salvas · Descartar ·
  Salvar* acima da barra do chat, **só com edição pendente e só abaixo de `lg`**; o "+" flutuante some
  nesse período; o Salvar do cartão fica só no desktop (`max-lg:hidden`). Tocar numa etapa leva a tela
  até o cartão de detalhes.
- Testado em 375×812: deslize de rolagem não arrasta; toque longo arrasta; mouse arrasta; barra visível
  em toda posição de rolagem; Salvar grava; Descartar volta o valor; desktop sem a barra e com Salvar.
- **Lição:** os testes anteriores da EAP foram só em desktop e passaram — testar TAMBÉM em viewport de
  celular antes de dizer que "funciona". O toque real (dedo/gesto) ainda é do usuário confirmar no aparelho.

### ⚠️ Limitações / pendências desta rodada
- **"Voltar" do navegador/celular agora é interceptado** (`GuardaNavegacao`, técnica da "sentinela": o
  Next não tem API pra bloquear o voltar no App Router; usa `pushState` nativo). Testado no app com
  `history.back()` (avisa; continuar recoloca a proteção; descartar completa o voltar; depois de salvar,
  um toque vai direto, pulando a sentinela velha). **NÃO testado no celular de verdade**: o Chrome
  pode ignorar entradas de histórico criadas sem toque recente do usuário (proteção dele contra
  "sequestro do voltar") — se isso ocorrer, o voltar passa sem aviso. Conferir no aparelho.
- **"Fechar" a aba/app**: só o aviso nativo genérico do navegador (`beforeunload`, não customizável),
  e só dispara com edição pendente (testado). No celular costuma NÃO aparecer ao fechar pelo seletor de
  abas/trocar de app. Solução real seria **rascunho local com "restaurar"** (não é autosave no banco) —
  proposta, não implementada.
- O padrão `instanceof Error ? e.message : '…'` que esconde erro do banco existe em **~71 outros
  pontos** do código (fora do fluxo orçamento/processo). Trocar por `mensagemDeErro` aos poucos.
- Varredura de RLS: 16 tabelas sem **nenhuma** política (`feed_*`, `portal_*`, `luizia_*`,
  `bootstrap_owner_tokens`, `board_item_comments`, `obra_previsoes`). Padrão do projeto = só servidor
  (service role/RPC), então **não mexi** — mas não verifiquei se alguma é acessada direto pelo navegador.

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
