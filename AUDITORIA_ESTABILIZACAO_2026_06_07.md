# Auditoria de estabilizacao - 2026-06-07

Branch de trabalho:

- `fix/estabilizacao-insumos-orcamento`

## Resumo

Foram investigados dois problemas reportados:

1. O botao "Novo insumo" abria o formulario, mas ao inserir o Supabase retornava:
   `new row violates row-level security policy for table "insumos_proprios"`.
2. No orcamento, clicar em "Inserir" para adicionar composicao nao adicionava item.

## Causa encontrada

### Insumos proprios

A tabela `insumos_proprios` existe e permite leitura, mas nao permite insert com a chave anon usada pelo frontend.

Teste realizado via cliente Supabase local:

- `select` em `insumos_proprios`: OK
- `insert` em `insumos_proprios`: erro `42501`, politica RLS bloqueando

Correcao preparada:

- Criado o arquivo SQL separado:
  `supabase/fix_2026_06_07_insumos_orcamento.sql`

Esse arquivo deve ser rodado no SQL Editor do Supabase para liberar as politicas do MVP.

### Insercao de composicoes no orcamento

O banco remoto nao possui as colunas:

- `orcamento_itens.subetapa`
- `orcamento_itens.created_at`

O codigo tentava:

- inserir `subetapa`
- ordenar itens por `created_at`

Isso quebrava o fluxo do orcamento. O app foi ajustado para funcionar com o banco atual:

- nao envia mais `subetapa` no insert;
- mantem a subetapa dentro de `descricao_snapshot`;
- ordena por `updated_at`, coluna existente no banco;
- mostra alerta com erro real caso o Supabase recuse a insercao.

## Validacoes realizadas

Build:

```bash
npm.cmd run build
```

Resultado: OK.

Teste no navegador:

1. Abri a obra `Obra Teste - Simulacao`.
2. Entrei na aba `Orcamento`.
3. Cliquei em `Adicionar item`.
4. Busquei a composicao `CP-003`.
5. Lancei quantidade `0.111` com complemento `TESTE APAGAR CODEX`.
6. Cliquei em `Inserir`.
7. O modal fechou e o contador subiu de 5 para 6 composicoes.
8. O item apareceu na tela.
9. O item de teste foi removido do banco e os materiais sugeridos foram abatidos.
10. A tela voltou para 5 composicoes.

## Lint

`npm.cmd run lint` ainda falha globalmente:

- 57 erros
- 56 warnings

Principais grupos:

- funcoes usadas em `useEffect` antes da declaracao;
- `setState` sincronamente dentro de effects;
- `any` explicitos;
- variaveis/imports nao usados.

Esses problemas ja existiam no projeto e nao impedem o build.

## Arquivos alterados

- `app/(app)/servicos/page.tsx`
- `components/obra/ObraOrcamento.tsx`
- `supabase/fix_2026_06_07_insumos_orcamento.sql`

## Proximo passo recomendado

1. Rodar `supabase/fix_2026_06_07_insumos_orcamento.sql` no SQL Editor do Supabase.
2. Testar novamente o cadastro de insumo proprio pela tela.
3. Depois disso, limpar o lint por blocos pequenos, comecando pelos arquivos de fluxo principal:
   `ObraOrcamento`, `Servicos`, `ObraMateriais`.
