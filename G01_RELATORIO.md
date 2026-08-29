# G01_RELATORIO.md — Fundação técnica BuildSmart V2

## Estado
PRONTO PARA REVISÃO (autoavaliação do executor — o PASS final depende do Product Owner).
G01.1 a G01.8 executados. Duas pendências externas ficaram registradas (Vercel Git link e
branch protection), conforme detalhado abaixo.

## Branch
`claude/buildsmartv2-g01-foundation-s17o1d` (dentro do repositório `buildsmart-ai`).

**Desvio registrado em relação à seção 3, item 2 do G01_PLANO.md:** o plano exige que a V2
viva em um repositório Git próprio, separado do repositório da V1 (isolamento de código, não
apenas de branch). Esta sessão foi executada dentro do repositório GitHub `buildsmart-ai` (V1),
na branch pré-atribuída pelo ambiente de execução. Diante do conflito entre o plano e o
ambiente disponível, a decisão foi levada ao Product Owner via pergunta direta, que optou
explicitamente por: **usar o repositório/branch `buildsmart-ai` já designado**, em vez de criar
um repositório novo.

Para minimizar o desvio e preservar o espírito de isolamento do plano (não reaproveitar código
funcional da V1), a aplicação V2 foi criada **inteiramente dentro de uma subpasta nova `v2/`**,
sem tocar em `app/`, `components/`, `lib/`, `supabase/` ou qualquer arquivo da V1. O `v2/` tem
seu próprio `package.json`, `node_modules`, configuração de TypeScript/Tailwind/lint/testes — é
tecnicamente uma aplicação independente que não importa nenhum módulo da V1.

**Isso ainda não satisfaz o critério objetivo "repositório V2 é próprio, separado do
repositório V1" da seção 9.** Fica registrado como pendência para decisão do Product Owner: se
for necessário separar fisicamente em outro repositório GitHub mais adiante, o conteúdo de
`v2/` pode ser extraído com `git subtree split` preservando histórico.

**Tentativa de correção do desvio (mesma sessão, rodada posterior):** a pedido do Product
Owner, o executor tentou de fato migrar `v2/` para um repositório GitHub novo e separado
(`buildsmart-v2`), com o objetivo de manter a V1 rodando normalmente em `buildsmart-ai/main`
enquanto a V2 é construída de forma isolada. O histórico de `v2/` foi extraído com sucesso via
`git subtree split -P v2` (branch local `v2-split`, 2 commits, `v2/` como raiz). A criação do
repositório novo, porém, falhou: `mcp__github__create_repository` retornou
`403 Resource not accessible by integration` — a integração GitHub desta sessão não tem
permissão para criar repositórios, apenas para ler/escrever em repositórios já existentes e
já autorizados. Diante disso, o Product Owner optou por **cancelar a migração** e manter o
desvio como está (V2 em `buildsmart-ai/v2/`) até que exista uma forma de criar o repositório
(ex.: o próprio Product Owner cria um repositório vazio no GitHub e autoriza esta sessão a
usá-lo). A branch temporária `v2-split` foi removida do repositório local; nenhum dado foi
perdido, pois o conteúdo permanece intacto em `v2/` na branch de trabalho.

## Ambiente (versões efetivamente instaladas)
- Node.js: v22.22.2
- npm: 10.9.7
- next: 14.2.35 (ver nota de segurança abaixo)
- react / react-dom: 18.3.1
- @supabase/supabase-js: ^2.112.4
- typescript: ^5.6.3
- tailwindcss: ^3.4.14
- vitest: ^2.1.4 / @testing-library/react: ^16.0.1
- eslint: ^8.57.1 / eslint-config-next: 14.2.35

## Alterações executadas

### G01.1 — Aplicação limpa
Aplicação Next.js 14 criada do zero em `v2/`, App Router, TypeScript estrito, Tailwind
configurado, página inicial mínima, sem nenhum código de negócio da V1.

### G01.2 — Estrutura mínima
Estrutura final de `v2/`:
```
v2/app/                 → aplicação/UI (layout, page, estilos globais)
v2/lib/supabase/        → infraestrutura de conexão (cliente Supabase)
v2/supabase/            → configuração e migrations (Supabase CLI)
v2/tests/               → testes
v2/*.config.*, tsconfig → configuração
```
Não foi criada pasta `components/` — não há nenhum componente compartilhado real ainda (a
página inicial é o único elemento de UI); criar a pasta vazia seria antecipar arquitetura
especulativa, o que o plano proíbe explicitamente (seção 6). Será criada quando o primeiro
componente compartilhado real existir (G02+).

### G01.5 — Supabase V2
Infraestrutura de conexão preparada, sem antecipar domínios funcionais:
- **Projeto Supabase físico criado** (o executor tinha acesso via MCP): nome `buildsmart-v2`,
  ref `csqkhuwdghhupktwpeth`, organização `rjyskceybloqqqvhpjzd`
  (`comercialgrupoexclusive-cell's Org`), região `sa-east-1`, status `ACTIVE_HEALTHY`, custo
  confirmado em R$0/mês (plano gratuito) antes da criação.
- URL do projeto: `https://csqkhuwdghhupktwpeth.supabase.co`
- `v2/lib/supabase/client.ts`: cliente único, lê `NEXT_PUBLIC_SUPABASE_URL` e
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` do ambiente; lança erro claro se ausentes. Nenhuma
  Organization/Membership/Project/RLS funcional foi criada.
- `v2/.env.example`: documenta as duas variáveis, sem valores reais.
- `v2/.env.local` (gitignorado, não commitado): contém a URL real e a chave publicável/anon
  real do projeto, para uso local. **Não está no repositório** (confirmado com
  `git check-ignore -v`).
- `v2/supabase/config.toml` + `v2/supabase/migrations/` (com `.gitkeep`): estrutura padrão do
  Supabase CLI para migrations dos Gates seguintes. Nenhuma migration de schema foi criada
  neste Gate.
- V1 e V2 seguem com projetos Supabase totalmente distintos — nenhum dado ou schema
  compartilhado.

### G01.6 — Vercel V2
Tentativa de criar o novo projeto Vercel exclusivo da V2 via MCP
(`comercialgrupoexclusive-7249's projects`, team `team_g9JK2TEQI4UwGtJAty9tR9a8`), apontando
`rootDirectory: v2`. **Resultado: falhou.** A chamada retornou um `project id`
(`prj_cdQBcz3N6q6PqeZokyjm4z93kyyP`), mas a verificação do vínculo Git com
`comercialgrupoexclusive-cell/buildsmart-ai` falhou (404 — "Project not found" na verificação),
e uma checagem posterior via `list_projects`/`get_project` confirma que **nenhum projeto foi
efetivamente persistido** na conta Vercel. Causa provável: a integração/GitHub App do Vercel
não está autorizada para este repositório ou organização GitHub.
**Pendência externa registrada:** o Product Owner (ou alguém com acesso ao painel Vercel)
precisa instalar/autorizar a integração do Vercel com o GitHub do repositório `buildsmart-ai`
antes de recriar o projeto `buildsmart-v2` (root directory `v2/`). Nenhum deploy, URL ou
configuração foi inventado — nada existe de fato no lado do Vercel até essa autorização.
Não reutilizamos nenhum projeto Vercel da V1.

### G01.7 — CI
Criado `.github/workflows/v2-ci.yml` na raiz do repositório (compartilhada com a V1, dado o
desvio de repositório registrado acima). O workflow:
- dispara em `pull_request` contra `main` e em `push` para
  `claude/buildsmartv2-g01-foundation-s17o1d` (a branch de trabalho efetiva do G01, já que o
  plano nomeia `v2-g01-foundation`, que não é a branch designada pelo ambiente);
- é restrito por `paths: v2/**` (mais o próprio workflow) para não disparar em mudanças que
  toquem apenas a V1, evitando ruído/CI cruzado no repositório compartilhado;
- executa, em sequência, dentro de `v2/`: `npm ci`, `npm run lint`, `npm run typecheck`,
  `npm run test`, `npm run build` — os mesmos comandos validados localmente nesta rodada.
- Não usa nenhum segredo (build básico não depende de credencial de produção, incluindo
  Supabase — o cliente só falha em runtime se importado sem env vars, e nenhuma página do G01
  o importa ainda).

**Branch protection em `main` — pendência externa registrada.** O executor não encontrou,
entre as ferramentas do GitHub MCP disponíveis nesta sessão, nenhuma que configure regras de
proteção de branch (todas as ferramentas listadas cobrem arquivos, commits, PRs, Actions,
issues — nenhuma cobre `branch protection rules`). Configuração de branch protection exigindo
o check `BuildSmart V2 CI / build` em `main` fica pendente de execução manual pelo Product
Owner (Settings → Branches → Branch protection rules, no repositório `buildsmart-ai`).

### G01.8 — Ambiente e segurança básica
- `.gitignore` próprio em `v2/`: exclui `node_modules`, `.next/`, `.env*.local`/`.env.local`,
  `*.tsbuildinfo`, `next-env.d.ts`.
- `.env.example` existe e não contém valores reais.
- Busca por padrões de segredo (`sk-`, `api_key`, `secret`, `password`, `token`,
  `service_role`, `postgres://`, `supabase_access_token`) em todos os arquivos novos: nenhum
  resultado nos arquivos que serão commitados. A única credencial real gerada
  (`NEXT_PUBLIC_SUPABASE_ANON_KEY`, uma chave publicável, feita para ser exposta no cliente)
  está apenas em `v2/.env.local`, confirmado fora do controle de versão.
- Lockfile `v2/package-lock.json` versionado.
- Node fixado via CI (`actions/setup-node@v4`, versão 22, igual ao ambiente local).

## Comandos executados e resultados (após todas as rodadas)
Executados dentro de `v2/`:

| Comando | Resultado |
|---|---|
| `npm install` | OK — 532 pacotes instalados (após adicionar `@supabase/supabase-js`) |
| `npx tsc --noEmit` (modo estrito) | OK — 0 erros |
| `npm run lint` (`eslint . --ext .ts,.tsx`, flat config da V1 isolado) | OK — 0 erros, 0 warnings |
| `npm run test` (`vitest run`) | OK — 1 arquivo de teste, 1 teste passando |
| `npm run build` (`next build`) | OK — build de produção concluído, 2 rotas estáticas geradas |

## Testes (G01.4)
- Ferramenta: Vitest + @testing-library/react + jsdom
- Comando: `npm run test`
- Quantidade: 1 teste
- O que verifica: `tests/page.test.tsx` renderiza o componente real `app/page.tsx` (Home) e
  verifica que o elemento com `data-testid="app-title"` contém o texto "BuildSmart V2" — teste
  de comportamento real de render, não trivial.
- Resultado: 1 passed (1)

## Nota de segurança de dependências (Next.js)
`npm audit` aponta múltiplos advisories em `next` cujo intervalo de correção começa apenas na
major 15 (ex.: GHSA-c4j6-fc7j-m34r, GHSA-m99w-x7hq-7vfj, GHSA-89xv-2m56-2m9x — corrigidos só a
partir de `15.5.x`). A versão instalada, `14.2.35`, é o último patch publicado na linha 14.x
fixada pelo plano (seção 4). Não há patch 14.x disponível para essas vulnerabilidades. Fica
registrado como **dívida técnica conhecida** — decisão de migrar para 15.x (fora do escopo
deste Gate, que fixa 14.x) cabe ao Product Owner.

## Dependências instaladas — justificativa
Nenhuma biblioteca além da stack-base definida na seção 4 do plano, mais o cliente oficial do
Supabase (também parte da stack-base, seção 4: "Supabase"). Adições:
- `@supabase/supabase-js` — cliente oficial, exigido pelo G01.5.
- `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@vitejs/plugin-react`,
  `jsdom` — infraestrutura de testes exigida pelo G01.4.
- `autoprefixer`, `postcss` — pré-requisitos diretos do Tailwind CSS.
- `eslint`, `eslint-config-next` — comando de lint exigido pelo G01.3.
- Tipos (`@types/*`) — apenas suporte a TypeScript estrito, sem runtime.

## Erros encontrados e correções durante a execução
- `npm run lint` inicialmente falhou com `ERR_MODULE_NOT_FOUND` porque o ESLint 8 detectou e
  tentou carregar o `eslint.config.mjs` (flat config) da V1 no diretório pai. Corrigido
  forçando `ESLINT_USE_FLAT_CONFIG=false` no script `lint` de `v2/package.json`, isolando a
  configuração legada (`.eslintrc.json`) da V2 da configuração da V1.
- `next@14.2.18` (versão inicialmente escolhida) apresentava vulnerabilidade crítica reportada
  pelo próprio `npm install`. Atualizado para `14.2.35`, último patch da série 14.x.
- Criação do projeto Vercel falhou na verificação do vínculo Git (ver G01.6) — nenhum
  workaround aplicado; registrado como pendência externa em vez de forçar uma alternativa
  (ex.: deploy manual de arquivos), que criaria um projeto desconectado do Git e fora do
  espírito do critério "novo projeto Vercel exclusivo da V2" com deploy contínuo.

## Dívida técnica criada
- Vulnerabilidades de `next` sem patch disponível na major 14.x (ver nota de segurança acima).
- V2 fisicamente dentro do mesmo repositório da V1 (subpasta `v2/`), não em repositório próprio
  — decisão explícita do Product Owner, documentada na seção "Branch" acima.
- Workflow de CI vive na raiz compartilhada do repositório (`.github/workflows/`), não isolado
  em `v2/`, por ser a única localização válida para GitHub Actions.

## Itens deliberadamente não implementados
- Login, autenticação funcional, Organization, Membership, RBAC, Project, e qualquer regra de
  negócio ou RLS funcional — proibidos neste Gate pela seção 6 do plano.
- Pasta `components/` — nenhum componente compartilhado real existe ainda (ver G01.2 acima).
- Migrations de schema do Supabase — pertencem aos Gates seguintes.

## Pendências externas (fora do controle do executor)
1. **Vercel:** autorizar a integração/GitHub App do Vercel para o repositório
   `buildsmart-ai` e recriar/reconectar o projeto `buildsmart-v2` (root directory `v2/`).
2. **Branch protection em `main`:** configurar manualmente exigindo o check
   `BuildSmart V2 CI / build`, já que nenhuma ferramenta disponível nesta sessão cobre essa
   configuração.
3. **Isolamento físico de repositório** (seção 9, primeiro critério): decisão já tomada pelo
   Product Owner nesta sessão (permanecer em `buildsmart-ai/v2/`), registrada como desvio
   consciente, não como pendência em aberto — mas fica destacado aqui para visibilidade na
   revisão final do Gate.

## Evidências para revisão
- Commits desta sessão na branch `claude/buildsmartv2-g01-foundation-s17o1d` do repositório
  `buildsmart-ai` (histórico de `v2/`, `.github/workflows/v2-ci.yml` e este relatório).
- Saída de `npm run test`: `Test Files 1 passed (1)` / `Tests 1 passed (1)`.
- Saída de `npm run build`: build de produção concluído com sucesso, rotas `/` e `/_not-found`
  geradas estaticamente.
- Projeto Supabase `buildsmart-v2` (ref `csqkhuwdghhupktwpeth`) visível no dashboard da
  organização `comercialgrupoexclusive-cell's Org`.

## Autoavaliação do Gate
**PRONTO PARA REVISÃO**, com duas pendências externas explícitas (Vercel e branch protection)
e um desvio de repositório já decidido pelo Product Owner. Todos os critérios objetivos da
seção 9 que dependem exclusivamente do executor foram atendidos: aplicação criada do zero,
instalação/lint/testes/build passando, teste real não trivial, CI criada e coerente com os
checks locais, nenhuma dependência fora da stack-base sem justificativa, `.env.example`
existente, nenhum segredo commitado, integração base com Supabase V2 preparada sem antecipar
G02, nenhum domínio funcional antecipado. O PASS final depende da revisão e aprovação
explícita do Product Owner, incluindo a decisão sobre as pendências externas acima.
