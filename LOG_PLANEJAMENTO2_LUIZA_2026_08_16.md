# Log técnico — Planejamento 2.0, Gantt, Assistente IA (Luiza) em Obras

Data: 2026-08-16
Branch: `claude/planejamento-2-0-buildsmart-quw4d8` (mesclado em `main`, deploy em produção após cada etapa)

## Objetivo

Sessão contínua com várias entregas: criar o módulo Planejamento 2.0 (cronograma derivado do orçamento), depois evoluir o assistente de IA do sistema — conectando a Luiza (que já existia mas nunca tinha sido plugada em tela nenhuma) ao Orçamento e Cronograma da obra, com templates reutilizáveis e correção de bugs encontrados em teste real.

## 1. Planejamento 2.0

Novo módulo em Obras que usa o **orçamento como fonte única de verdade** — não duplica dados, só adiciona planejamento (datas, status, progresso, predecessoras) aos itens já existentes do orçamento.

- **Migração**: tabelas `planejamento_itens` e `planejamento_dependencias` (índices únicos parciais por etapa/subetapa/item, RLS aberto).
- **Componente**: `components/obra/ObraPlanejamento2.tsx` — árvore Etapa → Subetapa → Serviço, edição inline de datas/duração/status/progresso, seletor de predecessoras (FS/FF/SS/SF) com validação anti-autorreferência.
- **Nova aba "Planejamento 2.0"** na página da obra (`app/(app)/obras/[id]/page.tsx`).
- Regra de duração: `duração = data_fim - data_início + 1` (dias corridos); editar a duração recalcula `data_fim`.

### Gantt: duas versões

1. **Primeira versão**: Gantt interativo com `@svar-ui/react-gantt` (drag-and-drop de datas/duração, criação de predecessoras arrastando conectores). Funcionava, mas testes reais mostraram problemas de usabilidade: conectores de dependência pequenos e difíceis de acertar (~16px), comportamento inconsistente ao mover/redimensionar, sem boa expectativa de uso no celular.
2. **Substituição**: removida a dependência SVAR. Nova visualização **somente leitura**, construída do zero (sem lib externa): barras derivadas dos mesmos dados do Planejamento 2.0, cada barra mostra **Previsto** (marcador tracejado) × **Realizado** (preenchimento sólido) usando os campos `progresso_planejado`/`progresso_executado` já existentes. Edição continua exclusivamente pela Tabela (já testada, sem bugs, mobile-friendly). Rollup de datas/progresso em Etapa/Subetapa calculado a partir dos descendentes com dado próprio.

### Dados de teste

Preenchidas datas reais na obra "Jardim Allegra" (60 subetapas), copiando do cronograma legado existente (`subetapas_cronograma`) via SQL — nomes de etapa/subetapa batiam exatamente entre os dois sistemas.

## 2. Deploy em produção (Vercel)

- Projeto `buildsmart-ai-v2` criado na Vercel, linkado ao repositório GitHub (branch de produção: `main`).
- `.env.production` com as chaves públicas do Supabase (anon key — seguro versionar).
- Fluxo de trabalho adotado a partir daqui: desenvolver no branch, testar, merge fast-forward em `main`, push — a Vercel publica automaticamente.

## 3. Assistente IA (Luiza) conectada em Obras

Descoberta importante: o motor de IA para orçamento **já existia e já era "modo work"** — `/api/obra-ai` já cria/altera/exclui etapas, subetapas, serviços e itens de orçamento via chamadas de função (tool-calling), com escrita direta (sem etapa de confirmação). O componente de chat (`ObraAssistenteIA.tsx`) também já existia, mas **nunca tinha sido montado em nenhuma tela**.

### O que foi feito

- **Templates de orçamento**: nova tabela `orcamento_templates` (nome, descrição, itens em JSON). Componentes `SalvarTemplateOrcamentoModal` e `UsarTemplateOrcamentoModal` — salvar captura etapas/subetapas/composições do orçamento atual; aplicar recalcula o preço vigente das composições no momento (não usa preço congelado) e reaproveita etapas existentes por nome.
- **Estado vazio do Orçamento**: ao criar uma obra nova (orçamento vazio), a tela oferece 3 caminhos — "Adicionar primeiro item" (como já era), "Usar template" e "Criar com a Luiza".
- **Toolbar do Orçamento** (já populado): botões "Salvar como template" e "Assistente IA".
- **Aba Cronograma**: botão "Assistente IA" na mesma barra de ações.
- **Correção**: etapas criadas pela Luiza a partir da aba Cronograma agora recebem o `cronograma_id` da tela selecionada (`/api/obra-ai/route.ts`) — sem isso, ficavam invisíveis na visão filtrada por cronograma (uma obra pode ter mais de um cronograma nomeado).
- Ambas as telas escutam o evento `buildsmart:obra-data-changed` (disparado pela Luiza a cada ação) para recarregar os dados automaticamente.

### Bugs encontrados em teste real e corrigidos

1. **Sem botão de fechar**: o modal da Luiza não tinha X porque não recebia `title`. Corrigido substituindo o modal centralizado por um **painel fixo na parte inferior da tela** (`ObraAssistenteDock.tsx`):
   - Sem fundo bloqueando a página — o conteúdo por trás continua visível e usável.
   - Botão de **recolher**: vira uma barra fina preservando a conversa, para conferir as edições feitas por prompt sem perder o histórico.
   - Botão de **fechar** (X) sempre visível no cabeçalho.
2. **`obraId` vazio**: em orçamentos avulsos (não vinculados a uma obra, fluxo `/orcamentos/[id]`), o chat mandava `obraId` vazio e a API retornava um erro cru. Agora os botões da Luiza ficam desabilitados (com tooltip explicando) quando isso acontece, e o componente tem uma guarda client-side contra esse caso.

## 4. Editar por prompt a estrutura sugerida (Projetos)

Lacuna original identificada: a IA de estrutura em Projetos (`/api/projetos/estrutura-ia`) só permitia **Aplicar** ou **Descartar** a árvore sugerida — nenhuma forma de pedir ajustes antes de confirmar.

- `gerarEstruturaProjeto` (`lib/projeto-ai.ts`) passa a aceitar `itensAtuais` + `instrucao` opcionais: quando presentes, a IA parte da estrutura já sugerida (ainda não aplicada) e aplica **apenas o ajuste pedido**, preservando o resto.
- `ProjetoAssistenteIA.tsx` ganhou um campo "Pedir um ajuste antes de aplicar" abaixo do preview — ex: *"remova o item Paisagismo, adicione Impermeabilização em Fundações"* — sem persistir nada até clicar em "Aplicar estrutura".

## Arquivos principais criados/alterados

- `supabase/migrations/20260813100000_planejamento_2_0.sql`
- `supabase/migrations/20260816020232_orcamento_templates.sql`
- `components/obra/ObraPlanejamento2.tsx`
- `components/obra/ObraAssistenteDock.tsx` (novo)
- `components/obra/ObraAssistenteIA.tsx`
- `components/obra/TemplateOrcamentoModal.tsx` (novo)
- `components/obra/ObraOrcamento.tsx`
- `components/obra/ObraCronogramaTab.tsx`
- `components/projeto/ProjetoAssistenteIA.tsx`
- `app/api/obra-ai/route.ts`
- `app/api/projetos/estrutura-ia/route.ts`
- `lib/projeto-ai.ts`
- `app/(app)/obras/[id]/page.tsx`

## Validação

Todas as entregas foram testadas via Playwright (Chromium local) com interceptação das chamadas REST/API para simular dados reais, e `npm run build` limpo antes de cada push — já que este ambiente não tem acesso de rede direto ao Supabase/OpenAI.

## Pendências (roadmap, não implementado nesta sessão)

- Redesenho do ícone/balão de IA global para caixa de entrada fixa embaixo (estilo assistentes atuais).
- Upload de arquivo no chat (PDF já tem motor pronto em `/api/extract-pdf`, falta plugar; imagem ainda não).
- Gravação e transcrição de áudio no navegador (Whisper já é usado no WhatsApp, falta a gravação client-side).
- Botão de desfazer (“voltar”) global no sistema.
- Aplicar o mesmo padrão de refinamento por prompt (preview editável) ao Orçamento — hoje a Luiza de Orçamento já edita por prompt, mas via chat agentic (escrita direta), não via preview/descartar como em Projetos.
