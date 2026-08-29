# G01 — Foundation

**Branch:** `v2-g01-foundation`  
**Base:** `main`  
**Status:** **APROVADO**  
**Escopo:** fundação técnica do repositório — estrutura, instalação, testes, build e CI.  
**Fora de escopo:** G02 e alterações funcionais de produto.

## 1. Fatos observados

- Projeto Next.js 16 + React 19 + TypeScript 5.
- O repositório possui `package-lock.json`, portanto o caminho reproduzível de instalação é `npm ci`.
- Scripts existentes no `package.json`:
  - `test`: `vitest run`
  - `build`: `npm run copy:assets && next build`
  - `lint`: `eslint`
  - `postinstall`: cópia dos assets do Excalidraw.
- Existe suíte de testes Vitest em `lib/__tests__` e em `app/api/whatsapp/dispatch/__tests__`.
- `vitest.config.mts` já resolve o alias `@` e fornece stub para `server-only`.
- Antes do G01 não existia `.github/workflows`; portanto não havia CI versionada no repositório.
- A configuração de build do Next não exige variáveis adicionais em `next.config.ts`; `.env.example` documenta integrações externas.

## 2. Alteração realizada no G01

Criado `.github/workflows/ci.yml` com um único job de validação:

1. checkout;
2. Node.js 20 com cache npm;
3. `npm ci`;
4. `npm test`;
5. `npm run build`.

O workflow roda em `push` para `main` e `v2-g01-foundation` e em `pull_request`, com permissão mínima `contents: read`.

## 3. Validação executada

GitHub Actions run **#1**, ID `33229747806`, commit `b4253ecaf421c4f29173f31d74c491b15aa3e477`.

| Verificação | Resultado | Evidência |
|---|---|---|
| Estrutura do repo | OK | `app/`, `components/`, `lib/`, `scripts/`, `supabase/`, configs TS/Next/Vitest presentes |
| Lockfile / instalação | OK | `npm ci` executado com sucesso |
| Testes | OK | `npm test` executado com sucesso |
| Build | OK | `npm run build` executado com sucesso |
| CI versionada | OK | `.github/workflows/ci.yml` criado e executado |
| Pipeline completo | **SUCCESS** | GitHub Actions `validate` concluído com sucesso |

Tempos observados no primeiro run:

- instalação: 19 s;
- testes: 3 s;
- build: 34 s;
- job completo: aproximadamente 72 s.

A tentativa de execução local pelo agente não foi usada como evidência porque o ambiente local não conseguiu resolver `github.com`. A validação canônica foi feita no runner do próprio GitHub Actions.

## 4. Critério de aceite

Critério atingido: `npm ci → npm test → npm run build` executou integralmente no GitHub Actions e terminou com `success`.

**G01 aprovado.**

## 5. Riscos / observações

- O commit da inclusão do CI também disparou deployment Vercel, confirmando integração de deploy ativa na branch; isso é independente da CI.
- Não foi criado script adicional nem alterada lógica de produto: a CI apenas automatiza os comandos já existentes.
- Nenhuma alteração funcional de aplicação, banco ou migração foi feita.
- `lint` existe no projeto, mas não foi incluído no gate G01 porque o escopo solicitado foi instalação, testes e build. Pode ser incorporado em gate posterior somente se houver decisão explícita para torná-lo bloqueante.

## 6. Limite de escopo

**G02 não foi iniciado.**
