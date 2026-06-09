# LOG_FINAL_MVP_2026_06_08

## Resumo

Registro das ultimas entregas realizadas no MVP BuildSmart AI em 08/06/2026.

## Alteracoes implementadas

### Importacao da base antiga

- Criado botao **Importar base antiga** nas abas de composicoes/insumos.
- Criado parser para planilha antiga com as abas:
  - `Insumos`
  - `Composicoes`
  - `Itens_Composicao`
- Fluxo implementado:
  - importa/atualiza insumos proprios;
  - importa/atualiza composicoes proprias;
  - recria vinculos composicao x insumo por coeficiente.
- Arquivos principais:
  - `lib/import-base-antiga.ts`
  - `components/servicos/ImportarBaseAntigaModal.tsx`
  - `app/(app)/servicos/page.tsx`

### Correcoes de usabilidade

- Corrigida listagem de orcamentos para nao exibir orcamentos sem obra vinculada.
- Corrigido cadastro de nova obra para permitir anexar imagem do dispositivo, alem de URL.
- Arquivos principais:
  - `app/(app)/orcamentos/page.tsx`
  - `app/(app)/obras/page.tsx`

### Monitor da Luizia

- Criada rota escondida para monitoramento:
  - `/luizia-monitor`
- O monitor nao aparece mais no menu lateral do sistema.
- Criada API para leitura/gravar historico central:
  - `/api/luizia-monitor`
- Criado fallback local no navegador caso a tabela online ainda nao exista.
- Criado arquivo SQL para tabela central no Supabase:
  - `supabase/create_luizia_logs.sql`
- A Luizia agora tenta registrar:
  - origem da conversa;
  - usuario;
  - pergunta;
  - resposta;
  - modo;
  - modelo;
  - horario.
- Arquivos principais:
  - `app/(app)/luizia-monitor/page.tsx`
  - `app/api/luizia-monitor/route.ts`
  - `lib/luizia-monitor.ts`
  - `components/layout/LuiziaFloatingChat.tsx`
  - `app/(app)/buildassist/page.tsx`

### Controle de comportamento da Luizia

- Adicionado campo de instrucao fixa no monitor.
- A instrucao fica salva no navegador e passa a ser enviada junto nas proximas mensagens.
- Exemplo recomendado:

```text
Responder curto, em linguagem simples. Nunca dizer que criou, salvou ou excluiu registros. Quando o usuario pedir para criar algo, apenas sugerir os dados e pedir confirmacao na tela correta.
```

## Publicacao

- Alteracoes commitadas e enviadas para GitHub.
- Branch `main` atualizada para deploy no Vercel.
- Commits relevantes:
  - `41ac395 feat: importa base antiga de insumos e composicoes`
  - `ad7d8da fix: oculta orcamentos sem obra e adiciona foto na criacao`
  - `dfcef1b feat: adiciona monitor simples da luizia`
  - `60969a9 feat: centraliza monitor da luizia fora do menu`
  - `660c7b5 fix: evita erro 500 no monitor da luizia`

## Validacoes realizadas

- `npm.cmd run build` executado com sucesso apos as alteracoes.
- Confirmado que a API local da Luizia usa IA real quando `OPENAI_API_KEY` esta no `.env.local`.
- Confirmado que a API online estava em fallback por ausencia de `OPENAI_API_KEY` no Vercel.

## Pendencias

### Vercel

Configurar variaveis de ambiente em Production:

```text
OPENAI_API_KEY=sk-...
OPENAI_SIMPLE_MODEL=gpt-4o-mini
OPENAI_COMPLEX_MODEL=gpt-5-mini
```

Depois fazer **Redeploy** no Vercel.

### Supabase

Rodar no SQL Editor:

```text
supabase/create_luizia_logs.sql
```

Isso habilita historico central da Luizia para monitorar conversas de todos os dispositivos.

## Observacao

O monitor da Luizia deve permanecer fora do menu principal. Acesso direto:

```text
/luizia-monitor
```

## Atualizacao segura do monitor - Codex

Objetivo: recriar o monitor da Luizia sem alterar a IA que ja estava funcionando online.

O que foi feito:

- Mantida intacta a rota principal da IA:
  - `app/api/buildassist/route.ts`
- Criada uma API separada somente para historico:
  - `app/api/luizia-monitor/route.ts`
- Criada uma camada cliente separada:
  - `lib/luizia-monitor.ts`
- O registro acontece depois que a resposta da IA ja foi recebida.
- Se o monitor falhar, a conversa da IA continua funcionando.
- O monitor salva uma copia local no navegador e tenta enviar para o Supabase.
- A tela do monitor continua fora do menu principal:
  - `/luizia-monitor`
- Removido o conceito de controle de comportamento da Luizia nesta etapa.

Validacao:

- `npm.cmd run build` executado com sucesso.
- Rotas confirmadas no build:
  - `/api/buildassist`
  - `/api/luizia-monitor`
  - `/buildassist`
  - `/luizia-monitor`

Pendencia para monitoramento central:

- Rodar o SQL `supabase/create_luizia_logs.sql` no Supabase.
- Enquanto a tabela nao existir, o monitor mostra apenas o historico local do navegador.

## Correcao de persistencia de usuarios - Codex

Problema relatado: alteracoes de usuarios e perfis apareciam como salvas, mas ao atualizar a tela voltavam aos dados antigos.

O que foi corrigido:

- O modo Supabase virou o padrao do app.
- O modo local agora so entra quando `NEXT_PUBLIC_DATA_MODE=local` estiver configurado explicitamente.
- Removido o risco de o Vercel cair em modo local silencioso por falta de `NEXT_PUBLIC_DATA_MODE`.
- Centralizada a configuracao publica do Supabase em:
  - `lib/supabase/config.ts`
- Ajustada a tela de configuracoes para nao mostrar sucesso quando o banco nao retorna o perfil atualizado.
- Adicionada validacao do perfil salvo no navegador ao entrar no app:
  - se o perfil existir no Supabase, o navegador atualiza os dados;
  - se o perfil nao existir mais, o sistema volta para selecao de perfil.
- Corrigido caso de navegador preso em perfil antigo local (`local-profile-*`):
  - o app tenta localizar o perfil real no Supabase pelo nome;
  - se encontrar, troca automaticamente para o UUID real;
  - se nao encontrar, solicita trocar de perfil.

Validacao:

- `npm.cmd run build` executado com sucesso.
