import { Point } from './Point';

// BuildSmart usabilidade mobile — regra de edição de cota: um extremo da
// parede fica fixo, o outro se move ao longo do eixo atual (mesma direção
// leftNode->rightNode) até a parede atingir o novo comprimento (em px de
// mundo). Nós compartilhados com outras paredes continuam nos mesmos
// objetos — Wall.setLength move o WallNode em si, então WallNodeSequence's
// redrawWalls() propaga a mudança pra qualquer parede conectada, sem
// duplicar geometria.
export function computeNewEndpoint(
  fixed: Point,
  moving: Point,
  newLength: number
): Point {
  const dx = moving.x - fixed.x;
  const dy = moving.y - fixed.y;
  const currentLength = Math.hypot(dx, dy);
  if (currentLength === 0) {
    // Degenerate wall (both endpoints coincide) — no defined axis to move
    // along, so leave the moving endpoint where it is.
    return { x: moving.x, y: moving.y };
  }
  const ux = dx / currentLength;
  const uy = dy / currentLength;
  return {
    x: fixed.x + ux * newLength,
    y: fixed.y + uy * newLength
  };
}
