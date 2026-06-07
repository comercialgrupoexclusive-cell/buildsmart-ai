# Log de execucao - modo local

Data: 2026-06-07

## Objetivo

Rodar o BuildSmart AI em modo local para testes iniciais, sem conexao com Supabase, mantendo uma camada intermediaria que permita reconectar o Supabase depois sem refazer a logica principal do sistema.

## Execucao

1. Criada a camada local em `lib/data/local-client.ts`.
   - O cliente local imita as chamadas principais usadas pelo app: `select`, `insert`, `upsert`, `update`, `delete`, `eq`, `neq`, `gte`, `is`, `in`, `ilike`, `or`, `order`, `limit`, `single`, `maybeSingle`.
   - A persistencia local usa `localStorage`.
   - O log de operacoes locais fica em `localStorage`, chave `buildsmart-local-log`.

2. Criado o seed limpo em `lib/data/local-seed.ts`.
   - A base local nao importa dados reais ou antigos.
   - Ao iniciar pela primeira vez, grava uma base zerada com apenas dados de exemplo controlados.
   - Se a versao local muda, o armazenamento local e recriado.

3. Criada obra exemplo:
   - `Obra Exemplo Local`
   - Status: `orcamento`
   - Area: `84 m2`
   - UF: `SP`
   - Responsavel: `Eng. Teste Local`

4. Criados dados locais para testar fluxos:
   - perfil local;
   - obra;
   - orcamento;
   - etapas de cronograma;
   - materiais/compras;
   - medicao;
   - insumos SINAPI simplificados;
   - composicoes proprias;
   - vinculos composicao/insumo;
   - uma composicao SINAPI de referencia;
   - um insumo proprio.

5. Ajustado `lib/supabase/client.ts`.
   - Por padrao usa modo local.
   - Para voltar ao Supabase, configurar `NEXT_PUBLIC_DATA_MODE=supabase`.

6. Ajustado `lib/supabase/server.ts`.
   - Evita depender do Supabase durante o modo local.
   - Funcionalidades de IA continuam fora do escopo deste teste.

7. Atualizado `.env.example`.
   - Incluido `NEXT_PUBLIC_DATA_MODE=local`.

8. Ajustes de tipagem feitos em:
   - `app/(app)/obras/page.tsx`
   - `app/(app)/relatorios/page.tsx`
   - `app/(app)/sinapi/page.tsx`

## Limpeza dos dados

Nenhum dado remoto foi apagado.

A limpeza foi aplicada no novo modo local:

- a base local e criada do zero em `localStorage`;
- dados antigos/remotos nao sao carregados;
- o seed contem apenas a obra e registros de exemplo definidos em `lib/data/local-seed.ts`.

## Validacao tecnica

Comando executado:

```bash
npm.cmd run build
```

Resultado:

- Build passou.
- TypeScript passou.

## Validacao no navegador

Rotas verificadas em `http://localhost:3000`:

- `/dashboard`
- `/obras`
- `/orcamentos`
- `/materiais`
- `/cronograma`
- `/medicoes`
- `/servicos`
- `/sinapi`
- `/relatorios`
- `/obras/local-obra-exemplo?tab=orcamento`

Resultado:

- A obra antiga `Obra Teste - Simulacao` nao aparece no modo local.
- A obra `Obra Exemplo Local` aparece nas telas principais.
- O dashboard mostra apenas dados locais.
- A tela de obras mostra a obra exemplo.
- A tela de orcamentos mostra valor local calculado.
- Materiais, cronograma, medicoes, composicoes, SINAPI e relatorios carregam sem erro de runtime.
- Foi feito um teste de insercao de composicao no orcamento local.
- A insercao funcionou e atualizou a tela.
- Em seguida, a versao do seed foi atualizada para `2026-06-07-local-v3`, forcando reset automatico e deixando a base local limpa novamente.

## Como reconectar Supabase depois

Configurar:

```env
NEXT_PUBLIC_DATA_MODE=supabase
```

E manter:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Como as telas continuam chamando `createClient()`, a logica principal do app nao precisa ser refeita.
