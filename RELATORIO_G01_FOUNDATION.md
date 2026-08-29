# G01 — Foundation

**Branch:** `v2-g01-foundation`  
**Base:** `main`  
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

## 3. Validação

| Verificação | Resultado | Evidência |
|---|---|---|
| Estrutura do repo | OK | `app/`, `components/`, `lib/`, `scripts/`, `supabase/`, configs TS/Next/Vitest presentes |
| Lockfile para instalação reproduzível | OK | `package-lock.json` presente |
| Script de testes | OK estrutural | `npm test` → `vitest run` |
| Script de build | OK estrutural | `npm run build` → assets + `next build` |
| Suíte de testes | OK estrutural | múltiplos arquivos `*.test.ts` presentes |
| CI versionada | CORRIGIDO NO G01 | `.github/workflows/ci.yml` criado |
| Execução local neste agente | NÃO EXECUTADA | ambiente de execução sem resolução DNS para `github.com`; não é falha do projeto |
| Execução CI GitHub | PENDENTE DE EVIDÊNCIA | a inclusão inicial do workflow não gerou run observável imediatamente; o commit deste relatório serve como novo `push` com o workflow já existente |

## 4. Critério de aceite

O G01 fica tecnicamente preparado quando o pipeline `npm ci → npm test → npm run build` executar no GitHub Actions. Não considerar o pipeline “verde” apenas pela existência do YAML; o resultado deve ser confirmado por run.

## 5. Riscos / observações

- O commit da inclusão do CI disparou deployment Vercel, mostrando integração de deploy ativa na branch; isso não substitui testes automatizados.
- Não foi adicionado script, pasta, ferramenta ou regra além da CI necessária para provar os comandos já existentes.
- Nenhuma alteração funcional de aplicação, banco ou migração foi feita.

## 6. Limite de escopo

**G02 não foi iniciado.**
