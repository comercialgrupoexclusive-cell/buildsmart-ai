// how many pixels is a meter
export const METER = 100;
export const WALL_THICKNESS = 0.2 * METER;
export const INTERIOR_WALL_THICKNESS = 0.16 * METER;

export const LABEL_OFFSET = 10;

// AddWallManager rejects new nodes within this distance of an existing node
// or the previous node in the current chain.
export const SNAP_THRESHOLD = 0.3 * METER;
// Floor.addNodeToWall rejects mid-wall splits this close to an endpoint.
export const MISCLICK_THRESHOLD = 0.2 * METER;

export const WALL_COLOR = 0x1a1a1a;
export const NODE_COLOR = 0x222222;
// BuildSmart usabilidade mobile — contorno de destaque quando a parede está
// selecionada (ferramenta Selecionar). Ver Wall.setSelected/drawLine.
export const SELECTION_COLOR = 0x2f6fed;
export const HANDLE_MOBILE_SCALE = 2.5;
export const LABEL_FONT = 'Arial';
export const LABEL_FONT_SIZE = 16;
export const LABEL_COLOR = 0x000000;

// BuildSmart P4.6 Bloco B — status de reforma por parede. Convenção fixada
// pelo usuário: EXISTENTE = cinza, CONSTRUIR = vermelho, DEMOLIR = amarelo.
// EXISTENTE é o padrão de toda parede nova e de toda parede de um plano v1
// sem status salvo (ver Wall.ts e Floor.ts).
export type WallStatus = 'EXISTENTE' | 'CONSTRUIR' | 'DEMOLIR';
export const WALL_STATUS_COLORS: Record<WallStatus, number> = {
  EXISTENTE: 0x9e9e9e,
  CONSTRUIR: 0xe53935,
  DEMOLIR: 0xfdd835
};
export const WALL_STATUS_LABELS: Record<WallStatus, string> = {
  EXISTENTE: 'Existente',
  CONSTRUIR: 'Construir',
  DEMOLIR: 'Demolir'
};

export enum Modes {
  Idle,
  Dragging,
  Editing
}

export enum Coord {
  NE,
  E,
  SE,
  S,
  C,
  Horizontal,
  Vertical
}

export enum LabelAxis {
  Horizontal,
  Vertical
}

export enum Tool {
  WallAdd,
  Edit,
  Remove,
  Measure,
  FurnitureAddWindow,
  FurnitureAddDoor,
  View,
  // BuildSmart P4.6 Bloco B — pinta o status (EXISTENTE/CONSTRUIR/DEMOLIR) de
  // paredes já existentes ao clicar; a cor escolhida vem de EditorStore.wallStatusToApply.
  WallStatus
}
