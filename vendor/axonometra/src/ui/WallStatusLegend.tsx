import { Group, Paper, Text } from '@mantine/core';
import {
  WALL_STATUS_COLORS,
  WALL_STATUS_LABELS,
  WallStatus
} from '../editor/editor/constants';

// BuildSmart P4.6 Bloco B — legenda sempre visível das cores de status de
// parede (EXISTENTE cinza / CONSTRUIR vermelho / DEMOLIR amarelo), exigência
// explícita do P4.6. Fica fixa no canto inferior direito, fora do fluxo dos
// outros painéis (ToolNavbar à esquerda, propriedades à direita/topo).
const ORDER: WallStatus[] = ['EXISTENTE', 'CONSTRUIR', 'DEMOLIR'];

function toCss(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

export function WallStatusLegend() {
  return (
    <Paper
      shadow="sm"
      radius="md"
      p="xs"
      style={{
        position: 'absolute',
        right: 12,
        bottom: 12,
        zIndex: 20,
        pointerEvents: 'none'
      }}
    >
      <Group gap="sm">
        {ORDER.map((status) => (
          <Group key={status} gap={6}>
            <span
              style={{
                display: 'inline-block',
                width: 12,
                height: 12,
                borderRadius: 2,
                background: toCss(WALL_STATUS_COLORS[status]),
                border: '1px solid rgba(0,0,0,0.25)'
              }}
            />
            <Text size="xs">{WALL_STATUS_LABELS[status]}</Text>
          </Group>
        ))}
      </Group>
    </Paper>
  );
}
