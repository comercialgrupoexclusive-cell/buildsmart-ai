# Como ativar a integração com o Google Drive

> Realize estes passos depois que o deploy já estiver no Vercel.

---

## Passo 1 — Criar a Service Account no Google Cloud

1. Acesse https://console.cloud.google.com
2. Selecione (ou crie) o projeto desejado
3. Menu lateral → **IAM e administração** → **Contas de serviço**
4. Clique em **Criar conta de serviço**
   - Nome: `buildsmart-drive` (ou qualquer nome)
   - Clique em **Criar e continuar** → **Concluído**
5. Na lista, clique na conta recem-criada → aba **Chaves**
6. **Adicionar chave** → **Criar nova chave** → tipo **JSON** → **Criar**
   - O arquivo `.json` será baixado automaticamente — guarde-o com segurança

---

## Passo 2 — Ativar a API do Google Drive

1. No Cloud Console → **APIs e serviços** → **Biblioteca**
2. Busque **Google Drive API** e clique em **Ativar**

---

## Passo 3 — Configurar variáveis de ambiente no Vercel

1. Acesse https://vercel.com → seu projeto **buildsmart-ai**
2. Vá em **Settings** → **Environment Variables**
3. Adicione as duas variáveis abaixo:

| Variável | Valor |
|----------|-------|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | O campo `client_email` do JSON baixado |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | O campo `private_key` do JSON (incluindo `-----BEGIN RSA PRIVATE KEY-----` e `-----END RSA PRIVATE KEY-----`) |

> **Atenção:** a chave privada contém quebras de linha (`\n`). Cole o valor exatamente como aparece no JSON.

4. Clique em **Save** e depois faça um **Redeploy** para as variáveis entrarem em vigor.

---

## Passo 4 — Compartilhar as pastas do Drive com a Service Account

Para cada projeto que tiver uma pasta no Drive:

1. Abra a pasta no Google Drive
2. Clique em **Compartilhar**
3. No campo de e-mail, cole o `client_email` da Service Account (ex: `buildsmart-drive@meu-projeto.iam.gserviceaccount.com`)
4. Permissão: **Leitor** (somente leitura é suficiente)
5. Clique em **Compartilhar**

---

## Passo 5 — Vincular a pasta ao projeto no BuildSmart

1. Acesse o projeto desejado em `/projetos`
2. Aba **Dados Gerais** → botão **Editar**
3. Campo **Pasta do Drive (projeto)**: cole a URL da pasta, ex:
   ```
   https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrSt
   ```
4. Salvar — o ID da pasta é extraído automaticamente
5. Acesse a aba **Arquivos** — os arquivos da pasta serão listados

---

## Como funciona após a ativação

- **Aba Arquivos** no detalhe de cada projeto: lista arquivos e subpastas, com navegação por breadcrumbs, ícones por tipo e link direto para cada arquivo
- **Card "Atividade recente no Drive"** no Dashboard: exibe os últimos 5 arquivos sincronizados com seus respectivos projetos
- Os arquivos são registrados na tabela `drive_events` na primeira visualização (sem duplicatas)

---

## Troubleshooting

| Sintoma | Causa provável |
|---------|---------------|
| Erro 503 na aba Arquivos | Variáveis de ambiente não configuradas no Vercel |
| Erro 403 / permission denied | Pasta não compartilhada com o e-mail da Service Account |
| Aba Arquivos vazia | Pasta vazia ou ID de pasta incorreto |
| Card do Dashboard vazio | Normal até a primeira visita à aba Arquivos de algum projeto |
