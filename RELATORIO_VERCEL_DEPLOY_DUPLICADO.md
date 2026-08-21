```markdown
FATOS
- Time Vercel correto confirmado: comercialgrupoexclusive-7249's projects
- Team ID: team_g9JK2TEQI4UwGtJAty9tR9a8
- Projetos encontrados no time correto:
  - buildsmart-ai: prj_bH23OJchVcm48m8XO5tqvhIrgY1J
  - buildsmart-ai-v2: prj_31PvI1yVuXzq4Q3BVmFAomACNNMc
- Os dois projetos estão ligados ao mesmo repositório GitHub:
  comercialgrupoexclusive-cell/buildsmart-ai
- Os deploys recentes mostram o mesmo commit gerando deployment nos dois projetos.
- O domínio operacional com tráfego real é do projeto principal:
  buildsmart-ai-chi.vercel.app
- O endpoint /api/whatsapp/dispatch tem tráfego real no projeto buildsmart-ai.
- O projeto buildsmart-ai-v2 não apresentou logs de /api/whatsapp/dispatch nas últimas 24h.
- Não há vercel.json versionado com cron jobs neste repositório.
- Não foi identificado cron versionado no repositório para o BuildSmart.

PROJETO PRINCIPAL
- Nome: buildsmart-ai
- Project ID: prj_bH23OJchVcm48m8XO5tqvhIrgY1J
- Team ID: team_g9JK2TEQI4UwGtJAty9tR9a8
- Framework: Next.js
- Node.js: 24.x
- Domínios informados pelo conector:
  - buildsmart-ai-chi.vercel.app
  - buildsmart-ai-comercialgrupoexclusive-7249s-projects.vercel.app
  - buildsmart-ai-git-main-comercialgrupoexclusive-7249s-projects.vercel.app
- Deploy production recente em main: READY
- Logs confirmados:
  - POST /api/whatsapp/dispatch 200 em produção
  - 12 ocorrências agrupadas por requestPath em janela recente
- Decisão: MANTER este projeto como produção operacional.

CONFIGURAÇÃO V2
- Nome: buildsmart-ai-v2
- Project ID: prj_31PvI1yVuXzq4Q3BVmFAomACNNMc
- Team ID: team_g9JK2TEQI4UwGtJAty9tR9a8
- Framework: Next.js
- Node.js: 24.x
- Domínios informados pelo conector:
  - buildsmart-ai-v2.vercel.app
  - buildsmart-ai-v2-comercialgrupoexclusive-7249s-projects.vercel.app
  - buildsmart-ai-git-0bca78-comercialgrupoexclusive-7249s-projects.vercel.app
- Deploy production recente em main: READY
- Logs:
  - Nenhum log encontrado para /api/whatsapp/dispatch nas últimas 24h.
- Evidência de duplicidade:
  - Mesmo repositório GitHub.
  - Mesmo commit SHA aparece nos dois projetos.
  - Mesmo push em main gera production deployment nos dois projetos.
- Nada exclusivo do v2 foi confirmado como necessário para produção durante esta auditoria.
- Variáveis de ambiente do Vercel v2 conferidas via Vercel CLI após renovar login:
  - buildsmart-ai-v2 não possui Environment Variables cadastradas.
  - Portanto não há variável exclusiva do v2 para migrar ao projeto principal.

AÇÃO EXECUTADA
- Auditoria de projetos Vercel executada no time correto.
- Auditoria de deployments recentes executada.
- Auditoria de domínios via conector executada.
- Auditoria de logs runtime executada:
  - buildsmart-ai com tráfego real em /api/whatsapp/dispatch.
  - buildsmart-ai-v2 sem tráfego nessa rota.
- Auditoria de arquivos locais executada:
  - .env.production está versionado.
  - .env.local existe localmente, mas não está versionado.
  - .vercel existe, mas não possui project.json/repo.json no checkout atual.
- O VERCEL_TOKEN antigo inválido foi removido do ambiente de usuário do Windows.
- Login Vercel CLI renovado com sucesso.
- Environment Variables comparadas por nome:
  - buildsmart-ai possui variáveis de produção.
  - buildsmart-ai-v2 não possui variáveis.
- O checkout foi linkado temporariamente ao projeto buildsmart-ai-v2 apenas para executar o comando de desconexão.
- Git desconectado do buildsmart-ai-v2 via Vercel CLI:
  npx vercel@latest git disconnect --scope comercialgrupoexclusive-7249s-projects
- O link local .vercel gerado temporariamente foi removido para não deixar o checkout apontado ao v2.
- O projeto buildsmart-ai-v2 NÃO deve ser excluído nesta etapa.

VALIDAÇÃO
- Antes da desconexão:
  - duplicidade confirmada por deployments em buildsmart-ai e buildsmart-ai-v2.
- Produção operacional:
  - buildsmart-ai-chi.vercel.app permanece associado ao projeto principal buildsmart-ai.
  - /api/whatsapp/dispatch respondeu 200 no projeto principal.
- v2:
  - sem evidência de tráfego recente em /api/whatsapp/dispatch.
- Validação pós-desconexão:
  - Pendente executar novo commit em main para confirmar que gera deploy apenas no buildsmart-ai;
  - buildsmart-ai-chi.vercel.app continuar respondendo;
  - /api/whatsapp/dispatch continuar operacional;
  - nenhum cron importante ficar preso ao v2.

ENV PRODUCTION
- Arquivo versionado encontrado: .env.production
- Variáveis presentes no .env.production:
  - NEXT_PUBLIC_SUPABASE_URL
  - NEXT_PUBLIC_SUPABASE_ANON_KEY
- Valores não foram impressos nem incluídos neste relatório.
- Ambos possuem valores preenchidos.
- NEXT_PUBLIC_SUPABASE_ANON_KEY é uma chave publicável/anon, mas por política de higiene de segredos recomenda-se remover .env.production do Git e manter variáveis na Vercel.
- Se algum valor versionado já foi usado em produção e for considerado sensível pela política do projeto, rotacionar/remover do Git.
- .env.local também contém variáveis sensíveis locais, inclusive chaves de IA e service role, mas não apareceu como versionado pelo git ls-files.
- Variáveis Vercel por projeto auditadas por nome via CLI:
  - buildsmart-ai:
    - ZAPI_CLIENT_TOKEN
    - DISPATCH_SECRET
    - NEXT_PUBLIC_DATA_MODE
    - NEXT_PUBLIC_SUPABASE_ANON_KEY
    - NEXT_PUBLIC_SUPABASE_URL
    - SUPABASE_SERVICE_ROLE_KEY
    - ZAPI_TOKEN
    - ZAPI_INSTANCE_ID
    - OPENAI_COMPLEX_MODEL
    - OPENAI_SIMPLE_MODEL
    - OPENAI_API_KEY
  - buildsmart-ai-v2:
    - Nenhuma variável encontrada.

RISCOS
- Risco principal mitigado: o Git foi desconectado do buildsmart-ai-v2.
- Desconectar o Git do v2 pelo projeto errado poderia afetar produção; a ação foi feita somente após link temporário explícito ao buildsmart-ai-v2.
- buildsmart-ai-v2 não tinha Environment Variables, então não havia configuração exclusiva a migrar.
- Como .env.production está versionado, há risco de configuração sensível ficar no histórico do Git, mesmo que as variáveis sejam publicáveis.
- O VERCEL_TOKEN local inválido pode continuar atrapalhando comandos da CLI até ser removido/atualizado.

PENDÊNCIAS
- Fazer um commit pequeno em main para confirmar que apenas buildsmart-ai recebe deploy.
- Remover .env.production do versionamento em rodada separada, adicionar regra ao .gitignore se ainda não existir, e avaliar rotação das chaves expostas no histórico.
- O VERCEL_TOKEN inválido foi removido do ambiente de usuário do Windows; a sessão atual do Codex ainda pode herdar o valor antigo em subprocessos, então comandos Vercel nesta sessão devem limpar Env:VERCEL_TOKEN antes de executar.
```
