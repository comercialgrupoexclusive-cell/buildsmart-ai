# G01_RELATORIO.md — Fundação técnica BuildSmart V2

## Estado
NÃO PRONTO PARA REVISÃO — em execução, rodada 1 de N concluída (G01.1).

## Branch
`claude/buildsmartv2-g01-foundation-s17o1d` (dentro do repositório `buildsmart-ai`).

**Desvio registrado em relação à seção 3, item 2 do G01_PLANO.md:** o plano exige que a V2
viva em um repositório Git próprio, separado do repositório da V1 (isolamento de código, não
apenas de branch). Esta sessão foi executada dentro do repositório GitHub `buildsmart-ai`
(V1), na branch pré-atribuída pelo ambiente de execução. Diante do conflito entre o plano e o
ambiente disponível, a decisão foi levada ao Product Owner via pergunta direta, que optou
explicitamente por: **usar o repositório/branch `buildsmart-ai` já designado**, em vez de criar
um repositório novo.

Para minimizar o desvio e preservar o espírito de isolamento do plano (não reaproveitar
código funcional da V1), a aplicação V2 foi criada **inteiramente dentro de uma subpasta nova
`v2/`**, sem tocar em `app/`, `components/`, `lib/`, `supabase/` ou qualquer arquivo da V1. O
`v2/` tem seu próprio `package.json`, `node_modules`, configuração de TypeScript/Tailwind/lint/
testes — é tecnicamente uma aplicação independente que não importa nenhum módulo da V1.

**Isso ainda não satisfaz o critério objetivo "repositório V2 é próprio, separado do
repositório V1" da seção 9.** Fica registrado como pendência para decisão do Product Owner:
se for necessário separar fisicamente em outro repositório GitHub mais adiante, o conteúdo de
`v2/` pode ser extraído com `git subtree split` preservando histórico.

## Ambiente (versões efetivamente instaladas)
- Node.js: v22.22.2
- npm: 10.9.7
- next: 14.2.35 (ver nota de segurança abaixo)
- react / react-dom: 18.3.1
- typescript: ^5.6.3 (resolvido: verificar `v2/package-lock.json`)
- tailwindcss: ^3.4.14
- vitest: ^2.1.4
- @testing-library/react: ^16.0.1
- eslint: ^8.57.1 / eslint-config-next: 14.2.35

## Alterações executadas (rodada 1 — G01.1 — Aplicação limpa)
Criada a aplicação Next.js 14 do zero em `v2/`, App Router, TypeScript estrito, Tailwind
configurado, página inicial mínima, sem nenhum código de negócio da V1.

## Arquivos criados
```
v2/.eslintrc.json
v2/.gitignore
v2/app/globals.css
v2/app/layout.tsx
v2/app/page.tsx
v2/next.config.mjs
v2/package.json
v2/package-lock.json
v2/postcss.config.mjs
v2/tailwind.config.ts
v2/tests/page.test.tsx
v2/tests/setup.ts
v2/tsconfig.json
v2/vitest.config.ts
G01_RELATORIO.md
```
Nenhum arquivo da V1 foi alterado.

## Comandos executados
Todos executados dentro de `v2/`:

| Comando | Resultado |
|---|---|
| `npm install` | OK — 520 pacotes instalados |
| `npx tsc --noEmit` (modo estrito) | OK — 0 erros |
| `npm run lint` (`eslint . --ext .ts,.tsx`) | OK — 0 erros, 0 warnings |
| `npm run test` (`vitest run`) | OK — 1 arquivo de teste, 1 teste passando |
| `npm run build` (`next build`) | OK — build de produção concluído, 2 rotas estáticas geradas |

## Testes (G01.4 — parcialmente adiantado nesta rodada por ser pré-requisito de build)
- Ferramenta: Vitest + @testing-library/react + jsdom
- Comando: `npm run test`
- Quantidade: 1 teste
- O que verifica: `tests/page.test.tsx` renderiza o componente real `app/page.tsx` (Home) e
  verifica que o elemento com `data-testid="app-title"` contém o texto "BuildSmart V2" — um
  teste de comportamento real de render, não trivial.
- Resultado: 1 passed (1)

Este item cobre o requisito mínimo do G01.4, mas o item completo (infraestrutura de testes
documentada como rodada própria) será formalizado/expandido, se necessário, em rodada dedicada.

## Segurança
- Nenhum segredo, token, chave ou credencial foi commitado em `v2/` (verificado por busca por
  padrões `sk-`, `api_key`, `secret`, `password`, `token` nos arquivos criados — nenhum
  resultado).
- `.gitignore` próprio em `v2/` exclui `node_modules`, `.next/`, `.env*`, `*.tsbuildinfo`,
  `next-env.d.ts`.
- `.env.example` da V2 ainda **não foi criado** — pertence ao item G01.5 (Supabase V2), que
  será tratado em rodada própria, conforme regra de "no máximo um item por rodada".

## Nota de segurança de dependências (Next.js)
`npm audit` aponta múltiplos advisories em `next` cujo intervalo de correção começa apenas na
major 15 (ex.: GHSA-c4j6-fc7j-m34r, GHSA-m99w-x7hq-7vfj, GHSA-89xv-2m56-2m9x — corrigidos só a
partir de `15.5.x`). A versão instalada, `14.2.35`, é o último patch publicado na linha 14.x
fixada pelo plano (seção 4). Não há patch 14.x disponível para essas vulnerabilidades. Fica
registrado como **dívida técnica conhecida** — decisão de migrar para 15.x (fora do escopo
deste Gate, que fixa 14.x) cabe ao Product Owner.

## Dependências instaladas — justificativa
Nenhuma biblioteca além da stack-base definida na seção 4 do plano. Adições exclusivamente de
ferramental necessário para os critérios de aceite:
- `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@vitejs/plugin-react`,
  `jsdom` — infraestrutura de testes exigida pelo G01.4.
- `autoprefixer`, `postcss` — pré-requisitos diretos do Tailwind CSS (stack-base, seção 4).
- `eslint`, `eslint-config-next` — comando de lint exigido pelo G01.3.
- Tipos (`@types/*`) — apenas suporte a TypeScript estrito, sem runtime.

## Supabase V2 (G01.5)
Não iniciado nesta rodada. Pendência: não há confirmação de que um novo projeto Supabase
físico para a V2 já existe. Será tratado em rodada dedicada, incluindo `.env.example` e
documentação de variáveis, sem antecipar Organization/Membership/Project/RLS funcional.

## Vercel V2 (G01.6)
Não iniciado nesta rodada.

## CI (G01.7)
Não iniciado nesta rodada.

## Erros encontrados e correções durante a rodada
- `npm run lint` inicialmente falhou com `ERR_MODULE_NOT_FOUND` porque o ESLint 8 detectou e
  tentou carregar o `eslint.config.mjs` (flat config) da V1 no diretório pai. Corrigido
  forçando `ESLINT_USE_FLAT_CONFIG=false` no script `lint` de `v2/package.json`, isolando a
  configuração legada (`.eslintrc.json`) da V2 da configuração da V1.
- `next@14.2.18` (versão inicialmente escolhida) apresentava vulnerabilidade crítica reportada
  pelo próprio `npm install`. Atualizado para `14.2.35`, último patch da série 14.x.

## Dívida técnica criada
- Vulnerabilidades de `next` sem patch disponível na major 14.x (ver seção acima).
- V2 fisicamente dentro do mesmo repositório da V1 (subpasta `v2/`), não em repositório próprio
  — decisão explícita do Product Owner nesta sessão, documentada acima.

## Itens deliberadamente não implementados nesta rodada
G01.2 (estrutura mínima além de `app/`), G01.5 (Supabase V2), G01.6 (Vercel V2), G01.7 (CI +
branch protection), G01.8 (checklist final de segurança/ambiente) — cada um será tratado em
rodada própria, conforme a regra de "no máximo um item por rodada" (seção 7).

## Evidências para revisão
- Diretório `v2/` no commit desta rodada (a ser criado logo em seguida a este relatório).
- Saída de `npm run test`: `Test Files 1 passed (1)` / `Tests 1 passed (1)`.
- Saída de `npm run build`: build de produção concluído com sucesso, rotas `/` e `/_not-found`
  geradas estaticamente.

## Autoavaliação do Gate
**NÃO PRONTO** — apenas G01.1 foi concluído. Faltam G01.2, G01.5, G01.6, G01.7, G01.8 e a
decisão pendente sobre isolamento físico de repositório (seção 9, primeiro critério). Próxima
rodada: G01.2 (estrutura mínima) ou o item que o Product Owner priorizar.
