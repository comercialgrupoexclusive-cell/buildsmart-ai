# BuildSmart — Roadmap de Implementação

> **Aqui moram os próximos passos.** Você executa em cima deste documento e verifica.
> - **O QUE o sistema é:** `ARQUITETURA.md` · **COMO trabalhar:** `AGENTS.md` ·
>   **O que já foi feito:** `HANDOFF_BUILDSMART.md` · **Vocabulário:** `ARQUITETURA.md` §14.
> - Revisão de código e de canonicidade: GPT / Codex como par de revisão.

---

## Alvo (a visão)

Um **motor único e versátil** — um "sistema operacional de processos" que serve
qualquer uso: **obra, casa, contas a pagar, leilão/prospecção**, e novos como **BIM** e
**fluxo de caixa (empresarial e doméstico)**. Cada uso é um **Template** que liga os
**módulos** certos. **Nenhum uso novo vira app novo nem raiz nova — vira módulo/template.**

Princípios que guiam tudo (ver `ARQUITETURA.md`):
- **Processo é a raiz única.** Módulos compõem; `processo_id` em tudo.
- **Fonte única da verdade (DRY):** reusar componentes compartilhados; nunca duplicar.
- **Modularidade real:** cada módulo autocontido — dá pra ligar/desligar/remover **sem
  quebrar** o resto.

---

## O estado honesto hoje (ponto de partida)

- ✅ **Núcleo do motor** (`lib/processo`) bem desenhado: contrato por Actions, registry,
  templates como dado.
- ✅ **Primitivas compartilhadas** existem e funcionam (`HierarchyTree`, `SortableList`,
  `components/ui/`). A EAP nova já as usa.
- ⚠️ **Modularidade incompleta:** módulos ainda compartilham `lib`/tabelas; **remover um
  módulo do código pode quebrar o projeto.**
- ⚠️ **Legado entrelaçado** (`components/obra/*`, `projeto/*`, motor antigo) — ruído,
  milhares de linhas, e partes que quebraram sob o Processo.
- ⚠️ **Duplicação pontual** (ex.: 3 telas `VisaoGeral` separadas; Orçamento com árvore
  própria em vez do `HierarchyTree`).
- ⚠️ **Dispersão de git:** muitas branches (`planejamento-2-0`, `finalizacao`, `tellus/*`,
  `codex/*`…) e `main` velha (111 commits atrás).

---

## Roadmap (fases, em ordem)

### Fase 0 — Base canônica + um tronco só  *(em andamento)*
- [x] `ARQUITETURA.md` (motor de processos) + Glossário canônico.
- [x] `ROADMAP.md` (este).
- [ ] Arquivar histórico (`RELATORIO_*`, `LOG_*`, fósseis) em `docs/historico/`.
- [ ] **Decidir o branch tronco** (candidato: `planejamento-2-0`, o mais avançado) e
      podar o branch-sprawl. Canonicidade vale pro git também.

### Fase 1 — Auditoria de acoplamento  ✅ feita (02/out/2026)

**Tomografia (dados reais):**
- ✅ Núcleo `lib/processo` **limpo e independente**: **0** imports de legado; **1.313** linhas.
- ✅ Acoplamento **unidirecional** (novo → velho; **0** velho → novo) e **bounded**.
- ⚠️ Fluxo do Processo ainda **reusa componentes legados de obra** em **6 pontos**:
  `planejamento` (`ObraPlanejamento2`), `medições` (`ObraMedicoes`), `financeiro`
  (`ObraAvancoFinanceiro`/`ObraFinanciamento`), `compras` (`ComprasLancamentos`/`ObraRequisicoes`).
  São "casca nova sobre obra velho" → **apagar `components/obra` hoje quebra o Processo**.
- 📏 `components/obra` = **20.235** linhas (o "monte de linha"); `components/projeto` = 3.185.

**Veredito: SALVAR o núcleo — não refazer do zero.** Repo novo jogaria fora o núcleo
limpo (1.313) + `components/processo` (4.517) pra fugir de um acoplamento curto e
conhecido. Backup travado no GitHub: tag `legado-snapshot-20261002` + branch
`legado/buildsmart-snapshot-20261002`.

**Fragmentação confirmada (02/out):** cada módulo está espalhado em **2–4 lugares** (ex.:
Orçamento em `lib/processo/orcamento.ts` + `lib/orcamento/` + `components/processo/orcamento/`
+ `components/obra/ObraOrcamento.tsx`). O motor (`lib/processo/`) tem arquivos de módulo
vazados dentro dele (`eap.ts`, `orcamento.ts`, `caixa-entrada.ts`, `clientes.ts`, `planta-baixa.ts`).

- [x] **Padrão de módulo definido** → `ARQUITETURA.md` §18 (uma casa por módulo:
      `lib/modules/<m>/` + `components/modules/<m>/`; motor fininho).
- [ ] **Aplicar o padrão** (organizacional, sem reescrever): reunir cada módulo em
      `lib/modules/<m>/`, começando pelo **piloto Orçamento**.

### Fase 2 — Refazer os módulos acoplados (nativos) e aposentar o legado
Para cada módulo ainda em "casca sobre obra": **refazer nativo no Processo compondo
componentes compartilhados** → cortar o import do legado → testar → só então remover obra.
- [ ] `planejamento` · `medições` · `financeiro` · `compras/requisições` (os 4 acoplados).
- [ ] Ocultar legado da **navegação** conforme cada módulo é substituído.
- [ ] Deletar `components/obra/*` (20k linhas) só **depois** do equivalente provado (regra P2).

### Fase 3 — EAP como estrutura/componente único
- [ ] Decidir **Modelo A** (mesma árvore reutilizada, dados anexos) × **Modelo B**
      (mesmo `HierarchyTree`, dados separados). Alvo declarado: Modelo A.
- [ ] Orçamento/Cronograma passam a compor o mesmo tronco de EAP.

### Fase 4 — Novos módulos versáteis
- [ ] **BIM** (módulo novo, no padrão da Fase 1, compondo primitivas).
- [ ] **Fluxo de caixa empresarial** (módulo novo).
- [ ] **Fluxo de caixa doméstico** (módulo novo).
- [ ] Cada um: entra no `registry` + compõe componentes compartilhados; **não** cria app/raiz.

### Fase 5 — Templates por uso
- [ ] Templates: Obra, Casa, Contas a pagar, Leilão/Prospecção, BIM, Fluxo de caixa…
      (cada um liga seu conjunto de módulos).

### Fase 6 — Qualidade para a auditoria
- [ ] Prettier (`printWidth: 100`) + ESLint (`max-len`) como regra canônica.
- [ ] Reduzir as ~5.114 linhas > 120 colunas (tela a tela, conforme tocamos).
- [ ] GPT/Codex no loop de revisão de código e de canonicidade.

---

## Como executar cada item (o loop)

1. Ler `ARQUITETURA.md` (o quê) + `AGENTS.md` (como).
2. Trabalhar em **pacote funcional** (capacidade testável ponta a ponta).
3. Reusar componentes compartilhados — nunca duplicar (DRY).
4. Verificar local (`npm run dev`) + `tsc`/build; revisão GPT/Codex.
5. Atualizar `HANDOFF_BUILDSMART.md` ao final. Um push por pacote.
