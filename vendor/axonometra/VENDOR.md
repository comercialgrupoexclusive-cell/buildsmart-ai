# Vendoring note — BuildSmart P4.6 Bloco B

Este diretório é uma cópia vendorizada e pinada do editor 2D de planta baixa
[Axonometra](https://github.com/qant-au/axonometra), incorporado ao BuildSmart
para o módulo Planta Baixa do Processo (reforma do escritório Espindola).

- **Commit pinado:** `45c5a79888fb3331b449a81ca4f34ee65b8a6e94` (branch `main`,
  sem tags no upstream em 2026-08-10; não há release v1.0.0 ainda — o próprio
  README avisa sobre breaking changes até lá).
- **Licença:** MIT (`LICENSE` neste diretório, preservado do upstream). O
  upstream é por sua vez um fork de mehanix/arcada (Apache-2.0), relicenciado
  para MIT conforme permitido pela Apache-2.0 §4 — a atribuição original está
  preservada no `LICENSE` e não foi alterada. Sem divergência entre `LICENSE`
  e o que o `README.md` anuncia: ambos afirmam MIT.
- **Não atualizar automaticamente.** Se uma nova versão upstream for
  necessária, repetir esta auditoria (licença + `EMBEDDING.md` +
  `PLAN-FORMAT.md`) antes de re-vendorizar, e registrar o novo commit aqui.
- **Sem dependência de axonometra.com em runtime** — esta cópia é buildada e
  servida pelo próprio BuildSmart (ver `README-BUILDSMART.md` nesta pasta para
  como o build é acoplado ao `npm run build` do app principal).

## Diferenças em relação ao upstream (P4.6 Bloco B)

Extensão mínima e versionada para suportar status de reforma por parede —
**sem reescrever** engine Pixi, snap, portas, janelas, móveis ou medição:

- `status: 'EXISTENTE' | 'CONSTRUIR' | 'DEMOLIR'` por segmento de parede
  (EXISTENTE = cinza, CONSTRUIR = vermelho, DEMOLIR = amarelo), guardado por
  `(minNodeId, maxNodeId)` — o par de nós já é canônico no código original
  (`WallNodeSequence.addWall` já normaliza `leftNodeId < rightNodeId`).
- Formato do plano sobe de `version: 1` para `version: 2`, aditivo
  (`wallSegmentStatus` é um mapa opcional); planos v1 sem o campo carregam
  com todas as paredes assumindo EXISTENTE (comportamento padrão da classe
  `Wall`, não uma migração de dados separada).
- Nova ferramenta "Status da parede" na barra lateral + paleta de 3 cores na
  ferramenta "Desenhar parede" (parede nasce com o estado escolhido) + legenda
  sempre visível no canto da tela.

Arquivos tocados (diff mínimo, ver histórico git do BuildSmart para o diff
exato): `src/editor/editor/constants.ts`, `src/stores/EditorStore.tsx`,
`src/editor/editor/objects/Walls/Wall.ts`,
`src/editor/editor/actions/AddWallAction.ts`,
`src/editor/editor/persistence/FloorSerializable.ts`,
`src/editor/editor/persistence/FloorPlanSerializable.ts`,
`src/editor/editor/persistence/Serializer.ts`,
`src/editor/editor/objects/Floor.ts`, `src/ui/Layout/ToolNavbar.tsx`, e um
novo `src/ui/WallStatusLegend.tsx`.
