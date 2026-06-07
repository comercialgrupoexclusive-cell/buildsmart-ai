# Log tecnico - MVP arvore e IA

Data: 2026-06-07

## Objetivo

Refinar a arvore do BuildSmart AI para o MVP local de obras residenciais unifamiliares, mantendo o sistema simples e preditivo, com a IA como destaque principal.

## Alteracoes executadas

1. Menu principal
   - Removidos do menu principal os acessos diretos a `Composicoes` e `Base SINAPI`.
   - `Materiais` voltou a ser o nome do modulo principal, separado de mao de obra.
   - `Medicoes` passou a ser apresentado como `Diario / Medicoes`.
   - `BuildAssistente IA` recebeu destaque visual no menu.

2. Orcamentos
   - A tela de `Orcamentos` passou a ter abas internas:
     - Orcamentos
     - Composicoes
     - Insumos
     - Base de referencia
   - As telas existentes de composicoes/insumos e SINAPI foram reaproveitadas como modulos internos.

3. Arquivos da obra
   - Criado o componente `components/obra/ObraArquivos.tsx`.
   - Adicionada area local de arquivos da obra usando `localStorage`.
   - Permite registrar anexos como projeto, planta, memorial, imagem ou outro documento.
   - Inclui atalho para abrir o BuildAssistente IA a partir da obra.

4. Diario / Medicoes
   - A linguagem da tela geral de medicoes foi ajustada para tratar primeiro como registro diario/avanco e depois como medicao.
   - O formulario passou a ser apresentado como `Novo registro diario / medicao`.

5. BuildAssistente IA
   - A tela foi reorganizada para destacar a IA como assistente principal.
   - Foram adicionados botoes de acao:
     - Enviar projeto
     - Ler arquivos da obra
     - Ajudar no orcamento
     - Gerar previsoes
   - A linguagem foi ajustada para previsoes objetivas, sem tom alarmista.

6. Dashboard
   - Parte da linguagem de acoes foi ajustada para previsao objetiva:
     - `Material previsto`
     - `Proxima etapa`

## Modo local

As alteracoes continuam funcionando em modo local.
Arquivos da obra foram implementados com `localStorage`, preparando troca futura por Supabase Storage sem alterar a experiencia principal.

## Validacao tecnica

Comando executado:

```bash
npm.cmd run build
```

Resultado:

- Build passou.
- TypeScript passou.

## Pendencias recomendadas para proxima iteracao

1. Criar entidade/tela real de `Mao de Obra`, separada de materiais.
2. Criar upload real de arquivos quando Supabase Storage for reativado.
3. Conectar BuildAssistente IA aos arquivos da obra.
4. Melhorar Dashboard para previsao por obra selecionada.
5. Limpar textos antigos com codificacao quebrada em paginas historicas.
