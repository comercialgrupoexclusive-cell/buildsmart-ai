# BuildSmart — Handoff

> Arquivo único de handoff. Sempre **sobrescrever** este; reflete o estado REAL ao fim da
> última rodada. Canônico: `ARQUITETURA.md` (o quê) · `ROADMAP.md` (próximos passos) ·
> `AGENTS.md` (como).

## Estado atual — rodada "canonicidade + auditoria de modularidade" (02/out/2026)

Fase de **teste** (sem dados reais, nada em produção). Tronco de trabalho:
`claude/planejamento-2-0-buildsmart-quw4d8`. App roda local em `localhost:3003`
(`npm run dev`).

### O que foi feito nesta rodada
- Criado `ARQUITETURA.md` canônico: motor de processos · glossário (§14) · harness por
  fase (§15) · era-anterior×atual (§16) · governança (§17) · **padrão de módulo (§18)**.
  SQL/banco é **livre na fase de teste** (a regra "sem SQL livre" do dev é de produção).
- Criado `ROADMAP.md`: alvo = **motor único versátil** (obra, casa, contas, leilão, +
  **BIM** e **fluxo de caixa** empresarial/doméstico); fases 0–6.
- **Auditoria de acoplamento** → veredito **SALVAR o núcleo, não refazer do zero**:
  - Núcleo `lib/processo` limpo (0 imports de legado, 1.313 linhas).
  - **4 módulos ainda acoplados ao legado obra**: planejamento (`ObraPlanejamento2`),
    medições (`ObraMedicoes`), financeiro (`ObraAvancoFinanceiro`/`ObraFinanciamento`),
    compras/requisições (`ComprasLancamentos`/`ObraRequisicoes`). `components/obra` = 20k linhas.
  - **Fragmentação**: cada módulo espalhado em 2–4 lugares; motor contaminado com
    arquivos de módulo (`eap.ts`, `orcamento.ts`, `caixa-entrada.ts`, `clientes.ts`, `planta-baixa.ts`).
- Backup do legado: tag `legado-snapshot-20261002` + branch `legado/buildsmart-snapshot-20261002` (GitHub).
- Fonte canônica do dev localizada: Google Drive `00 - CENTRAL` (harness SPEC V0-09,
  Arquitetura V0, Motor de Processo, Mapa Mestre). São **referência**; as regras desta fase prevalecem.

### Governança (fechada)
**Claude constrói · GPT apoia · o dev faz a verificação de segurança só no final**, antes
dos testes. Usuário (Luiz) define visão e verifica; delega o "como".

### PRÓXIMO PASSO — continuar daqui
Padrão de módulo = `lib/<m>/` (cérebro) + `components/processo/<m>/` (telas); motor fininho.
Ver `ARQUITETURA.md` §18. Organizacional (mover/reunir, NÃO reescrever), 1 de cada vez,
com `tsc` + app rodando (`localhost:3003`).

**✅ Feito — piloto Orçamento:** `lib/processo/orcamento.ts` → `lib/orcamento/processo.ts`
(commit 9d0c1b8; tsc limpo, app ok). Cérebro do Orçamento consolidado em `lib/orcamento/`.

**▶ Continuar — esvaziar o motor dos outros arquivos de módulo vazados** (mesmo padrão do
piloto): `lib/processo/eap.ts`, `caixa-entrada.ts`, `clientes.ts`, `planta-baixa.ts` →
suas pastas `lib/<m>/`.

**Depois (Fase 2):** refazer nativos os 4 módulos acoplados (planejamento, medições,
financeiro, compras) → cortar imports de `components/obra` → deletar o legado (regra P2).

**Obs.:** bug pré-existente encontrado (não do piloto): `<a>` aninhado em
`components/processo/ProcessoCard.tsx` (hydration error na lista). Flagueado como task.

## Pendências ainda abertas
- Arquivar `RELATORIO_*`/`LOG_*`/fósseis em `docs/historico/`.
- Consolidar o branch-sprawl num tronco único (ver `ROADMAP.md` Fase 0).
- Qualidade p/ auditoria: Prettier/ESLint `printWidth: 100` (~5.114 linhas > 120 col).
