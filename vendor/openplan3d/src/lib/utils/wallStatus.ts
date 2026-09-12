import type { Wall, WallStatus } from '$lib/models/types';

/**
 * BuildSmart PoC — convenção de reforma já usada no BuildSmart (Axonometra):
 * EXISTENTE = cinza, CONSTRUIR = vermelho, DEMOLIR = amarelo.
 *
 * Fonte única: o 2D (canvasRenderer), o 3D (ThreeViewer) e a UI (barra
 * BuildSmart + painel de propriedades) leem daqui, para não haver duas
 * tabelas de cor divergindo.
 */
export const WALL_STATUS_ORDER: WallStatus[] = ['EXISTENTE', 'CONSTRUIR', 'DEMOLIR'];

export const WALL_STATUS_LABELS: Record<WallStatus, string> = {
  EXISTENTE: 'Existente',
  CONSTRUIR: 'Construir',
  DEMOLIR: 'Demolir',
};

export const WALL_STATUS_COLORS: Record<WallStatus, string> = {
  EXISTENTE: '#6b7280',
  CONSTRUIR: '#dc2626',
  DEMOLIR: '#eab308',
};

export function isWallStatus(value: unknown): value is WallStatus {
  return value === 'EXISTENTE' || value === 'CONSTRUIR' || value === 'DEMOLIR';
}

/** Status efetivo: plano antigo sem o campo conta como EXISTENTE. */
export function wallStatusOf(wall: Pick<Wall, 'status'>): WallStatus {
  return isWallStatus(wall.status) ? wall.status : 'EXISTENTE';
}

/**
 * Cor de reforma a aplicar, ou null quando a parede deve manter a aparência
 * normal do motor (cor/textura escolhida pelo usuário). Só EXISTENTE devolve
 * null: é o estado neutro/padrão, então uma parede sem reforma continua
 * exatamente com o visual original do OpenPlan3D.
 */
export function wallStatusColor(wall: Pick<Wall, 'status'>): string | null {
  const status = wallStatusOf(wall);
  return status === 'EXISTENTE' ? null : WALL_STATUS_COLORS[status];
}
