# WhatsApp Business + Luizia

Este guia conecta o WhatsApp Business/Sandbox da Twilio com a Luizia do BuildSmart AI.

## O que foi criado

- Webhook: `/api/whatsapp/luizia`
- Metodo usado pela Twilio: `POST`
- Resposta enviada ao WhatsApp: TwiML com a mensagem da Luizia
- Origem registrada no monitor: `whatsapp`
- Modo seguro: a Luizia apenas responde e consulta contexto em leitura. Ela nao cria, edita ou exclui dados.

## Variaveis de ambiente

No `.env.local` e tambem na Vercel, configure:

```env
OPENAI_API_KEY=sua_chave_openai
TWILIO_ACCOUNT_SID=seu_account_sid
TWILIO_AUTH_TOKEN=seu_auth_token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
WHATSAPP_LUIZIA_WEBHOOK_URL=https://seu-dominio.vercel.app/api/whatsapp/luizia
TWILIO_VALIDATE_SIGNATURE=false
```

Observacoes:

- `OPENAI_API_KEY` ja existe no projeto.
- `TWILIO_WHATSAPP_FROM` no Sandbox geralmente e `whatsapp:+14155238886`, mas confirme no painel da Twilio.
- `TWILIO_VALIDATE_SIGNATURE=false` facilita o primeiro teste. Depois que estiver funcionando em producao, pode trocar para `true`.
- Nunca coloque chaves reais dentro do codigo.

## Configuracao local

1. Copie as variaveis acima para `.env.local`.
2. Rode o projeto:

```bash
npm run dev
```

3. Teste se a rota existe:

```bash
curl http://localhost:3000/api/whatsapp/luizia
```

4. Para testar um POST local simulando a Twilio:

```bash
curl -X POST http://localhost:3000/api/whatsapp/luizia \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "From=whatsapp:+5511999999999" \
  --data-urlencode "Body=Luizia, quais materiais devo acompanhar primeiro?"
```

5. A resposta deve vir em XML com `<Response><Message>...`.

Para receber mensagens reais da Twilio no computador local, use um tunel publico como ngrok e coloque a URL gerada no webhook da Twilio:

```text
https://seu-tunel.ngrok-free.app/api/whatsapp/luizia
```

## Configuracao na Vercel

1. Abra o projeto na Vercel.
2. Va em `Settings` > `Environment Variables`.
3. Adicione as variaveis:
   - `OPENAI_API_KEY`
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_WHATSAPP_FROM`
   - `WHATSAPP_LUIZIA_WEBHOOK_URL`
   - `TWILIO_VALIDATE_SIGNATURE`
4. Faca um novo deploy.
5. A URL publica do webhook sera:

```text
https://seu-dominio.vercel.app/api/whatsapp/luizia
```

## Configuracao na Twilio Sandbox

1. Entre no painel da Twilio.
2. Abra `Messaging` > `Try it out` > `Send a WhatsApp message`.
3. Ative o Sandbox e conecte seu celular seguindo o codigo exibido pela Twilio.
4. No campo `When a message comes in`, coloque:

```text
https://seu-dominio.vercel.app/api/whatsapp/luizia
```

5. Selecione metodo `POST`.
6. Salve.
7. Envie uma mensagem do seu WhatsApp para o numero Sandbox da Twilio.

## Monitor da Luizia

As conversas do WhatsApp sao registradas com:

```text
origem = whatsapp
```

Para o banco aceitar essa origem, rode novamente no SQL Editor do Supabase:

```text
supabase/create_luizia_logs.sql
```

Se o Supabase ainda nao estiver configurado, a Luizia continua respondendo, mas o monitor remoto pode nao registrar a conversa.

## Como explicar para um usuario leigo

1. A pessoa manda uma mensagem para o WhatsApp da empresa.
2. A Twilio recebe essa mensagem.
3. A Twilio chama o link do BuildSmart AI.
4. O BuildSmart AI entrega a pergunta para a Luizia.
5. A Luizia consulta somente dados autorizados e responde.
6. O BuildSmart AI devolve a resposta para a Twilio.
7. A Twilio envia a resposta de volta no WhatsApp.

Importante: a Luizia pelo WhatsApp nao altera dados sozinha. Quando ela sugerir algo, o usuario ainda precisa revisar e salvar dentro do sistema.
