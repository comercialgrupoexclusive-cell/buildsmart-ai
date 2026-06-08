# Auditoria Supabase v1.2.0 - 2026-06-08

## Estado do projeto

- Branch atual: `feat/admin-onboarding-clima-melhorias`
- Commit base analisado: `818302f`
- Build: `npm.cmd run build` passou
- Lint: `npm.cmd run lint` ainda falha com erros globais antigos/estruturais de TypeScript e regras React
- Modo atual do app: `NEXT_PUBLIC_DATA_MODE=local`

## Supabase remoto configurado

- Projeto remoto configurado em `.env.local`
- O app ainda nao deve ser ligado em modo Supabase antes de rodar o setup SQL
- O arquivo `.env.local` esta ignorado pelo Git

## Resultado da checagem remota

Consulta via anon key encontrou:

- `profiles`: 2 registros
- `obras`: 1 registro
- `orcamentos`: 1 registro
- `orcamento_itens`: 7 registros
- `sinapi_insumos`: 182 registros
- `sinapi_composicoes`: 2 registros
- `composicoes_proprias`: 6 registros
- `composicao_insumos`: 9 registros
- `insumos_proprios`: 0 registros

Problemas confirmados:

- `fornecedores` nao existe no schema cache remoto
- `obra_fornecedores` nao existe no schema cache remoto
- `orcamento_item_insumos` nao existe no schema cache remoto
- `composicao_itens` nao existe, mas o app atual usa `composicao_insumos`
- insert em `insumos_proprios` falha por RLS
- a importacao gerada pelo Claude ainda nao foi aplicada no banco remoto

## Correcoes preparadas

- `supabase/schema.sql` foi alinhado ao schema real usado pelo app:
  - adiciona `insumos_proprios`
  - troca a tabela legada `composicao_itens` por `composicao_insumos`
- Criado `supabase/migration_composicao_insumos_schema_real.sql`
- Criado `supabase/policies_mvp_local_beta.sql`
- Criado `supabase/setup_remote_v1_2_0.sql` como arquivo unico para rodar no SQL Editor do Supabase

## Proximo passo objetivo

Rodar `supabase/setup_remote_v1_2_0.sql` no SQL Editor do Supabase.

Depois disso:

1. Reconsultar contagens no remoto.
2. Testar insert/delete temporario em `insumos_proprios` e `fornecedores`.
3. Mudar `.env.local` para `NEXT_PUBLIC_DATA_MODE=supabase`.
4. Reiniciar o servidor local.
5. Testar fluxo principal como usuario.

## Observacao de seguranca

As politicas em `policies_mvp_local_beta.sql` sao abertas para permitir o MVP beta com chave anon no frontend. Antes de producao real/multiempresa, devem ser substituidas por RLS restrito por usuario/empresa/obra.
