# Log tecnico - BuildAssistente IA

Data: 2026-06-07

## Objetivo

Ativar a primeira versao funcional do BuildAssistente IA no MVP local, mantendo a logica principal independente do Supabase.

## Alteracoes executadas

1. Rota `/api/buildassist`
   - Removida a busca direta de contexto no Supabase dentro da API.
   - A rota agora recebe o contexto local montado pela tela.
   - Adicionado fallback local quando `OPENAI_API_KEY` nao esta configurada.
   - Preparado uso de OpenAI:
     - `gpt-4o-mini` para perguntas simples;
     - `gpt-5-mini` para tarefas complexas, como projetos, arquivos, orcamento e cronograma.

2. Tela `/buildassist`
   - Passou a montar um pacote local da obra com:
     - obra atual;
     - orcamentos;
     - itens do orcamento;
     - etapas;
     - materiais;
     - medicoes;
     - composicoes;
     - insumos;
     - arquivos anexados na obra;
     - arquivos enviados na conversa.
   - Botao `Enviar projeto` agora abre seletor de arquivos.
   - Arquivos de texto (`txt`, `md`, `csv`, `json`) tem conteudo lido parcialmente para analise.
   - PDFs, imagens e outros arquivos entram por metadados nesta fase local.
   - As respostas usam linguagem preditiva e objetiva.

3. Modo local
   - Sem chave da OpenAI, o sistema nao quebra.
   - A resposta local permite testar o fluxo de IA com dados reais do modo local.
   - Com `OPENAI_API_KEY` configurada, a mesma rota passa a chamar a OpenAI.

## Validacao

- `npm.cmd run build` executado com sucesso.
- Testado no navegador em `http://localhost:3000/buildassist`.
- Pergunta enviada:
  - "Gere previsoes objetivas para a obra exemplo."
- Resultado:
  - A tela respondeu usando a obra local, etapas, materiais e orcamento.

## Pendente

1. Configurar `OPENAI_API_KEY` real no `.env.local`.
2. Evoluir leitura real de PDF/imagens/projetos tecnicos.
3. Criar armazenamento local temporario ou futuro Supabase Storage para arquivos completos.
4. Conectar respostas da IA a acoes do sistema, como gerar itens de orcamento, cronograma e lista de materiais com revisao do usuario antes de salvar.
