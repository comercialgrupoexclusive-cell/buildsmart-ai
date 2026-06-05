# BuildSmart AI — Guia de Setup

## Pré-requisitos

- Node.js 18+
- Conta no [Supabase](https://supabase.com)
- Conta na [Anthropic](https://console.anthropic.com) (para BuildAssist IA)

## 1. Instalar dependências

```bash
npm install
```

## 2. Configurar Supabase

1. Crie um novo projeto em [supabase.com](https://supabase.com)
2. Copie a URL e a chave anon do projeto
3. No painel SQL do Supabase, execute o arquivo `supabase/schema.sql`
4. Opcionalmente, execute `supabase/seed.sql` para dados de exemplo

## 3. Variáveis de ambiente

Crie o arquivo `.env.local` com:

```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anon_aqui
ANTHROPIC_API_KEY=sk-ant-sua_chave_aqui
OPENWEATHER_API_KEY=sua_chave_openweather (opcional)
```

## 4. Rodar em desenvolvimento

```bash
npm run dev -- -p 3001
```

Acesse: http://localhost:3001

## 5. Deploy no Vercel

1. Crie um repositório no GitHub e faça push do código
2. Conecte o repositório ao [Vercel](https://vercel.com)
3. Configure as variáveis de ambiente no painel do Vercel
4. O deploy acontece automaticamente a cada push na branch principal

## Estrutura do projeto

```
buildsmart-ai/
├── app/
│   ├── (app)/              # Páginas protegidas (com layout)
│   │   ├── dashboard/
│   │   ├── obras/
│   │   │   └── [id]/       # Detalhe da obra
│   │   ├── sinapi/
│   │   ├── buildassist/
│   │   └── configuracoes/
│   ├── api/
│   │   └── buildassist/    # API route da IA
│   ├── onboarding/
│   └── page.tsx            # Seleção de perfis
├── components/
│   ├── layout/             # Sidebar, Header, AppLayout
│   ├── obra/               # Tabs da obra (Orçamento, Cronograma, etc.)
│   └── ui/                 # Componentes reutilizáveis
├── lib/
│   ├── supabase/           # Clientes Supabase
│   ├── types.ts            # TypeScript types
│   ├── utils.ts            # Helpers
│   └── profile-context.tsx # Estado global do perfil
└── supabase/
    ├── schema.sql          # Schema do banco de dados
    └── seed.sql            # Dados de exemplo
```
