import { Button, Group, Paper } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import { useStore } from '../stores/EditorStore';
import { AddWallManager } from '../editor/editor/actions/AddWallManager';

// BuildSmart usabilidade mobile — enquanto uma sequência de parede está em
// andamento (wallChainActive), oferece uma forma explícita e sempre visível
// de terminar: "Concluir" e "Cancelar". Substitui o duplo-clique no nó como
// único jeito de parar (que não funciona bem por toque). Fica no rodapé
// central, longe do ToolNavbar (esquerda) e da legenda de status (canto
// inferior direito) — nenhum dos dois fica coberto.
export function WallChainActionBar() {
  const wallChainActive = useStore((s) => s.wallChainActive);

  if (!wallChainActive) {
    return null;
  }

  return (
    <Paper
      shadow="md"
      radius="xl"
      p="xs"
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 20,
        transform: 'translateX(-50%)',
        zIndex: 30
      }}
    >
      <Group gap="xs">
        <Button
          color="red"
          variant="subtle"
          size="md"
          leftSection={<IconX size={18} />}
          onClick={() => AddWallManager.Instance.cancel()}
        >
          Cancelar
        </Button>
        <Button
          color="blue"
          size="md"
          leftSection={<IconCheck size={18} />}
          onClick={() => AddWallManager.Instance.finish()}
        >
          Concluir
        </Button>
      </Group>
    </Paper>
  );
}
