import { useEffect, useReducer, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ActionIcon,
  Button,
  Group,
  NumberInput,
  Paper,
  Stack,
  Text,
  UnstyledButton
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconRotate, IconX } from '@tabler/icons-react';
import { useStore } from '../stores/EditorStore';
import { TransformLayer } from '../editor/editor/objects/TransformControls/TransformLayer';
import type { Wall } from '../editor/editor/objects/Walls/Wall';
import type { Furniture } from '../editor/editor/objects/Furniture';
import {
  METER,
  WALL_STATUS_COLORS,
  WALL_STATUS_LABELS,
  WallStatus
} from '../editor/editor/constants';

const STATUS_ORDER: WallStatus[] = ['EXISTENTE', 'CONSTRUIR', 'DEMOLIR'];
const MIN_LENGTH_METERS = 0.05;
const MIN_WIDTH_METERS = 0.1;

function toCss(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function PanelShell({
  isMobile,
  title,
  onClose,
  children
}: {
  isMobile: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Paper
      shadow="md"
      radius={isMobile ? 0 : 'md'}
      p="md"
      style={
        isMobile
          ? {
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 25,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16
            }
          : {
              position: 'absolute',
              top: 12,
              right: 12,
              width: 280,
              zIndex: 25
            }
      }
    >
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={600}>{title}</Text>
          <ActionIcon variant="subtle" color="gray" onClick={onClose}>
            <IconX size={18} />
          </ActionIcon>
        </Group>
        {children}
      </Stack>
    </Paper>
  );
}

// BuildSmart usabilidade mobile — painel de propriedades do elemento
// selecionado (parede OU porta/janela — nunca os dois, seleção é exclusiva).
// Bottom sheet no celular, painel no canto superior direito no desktop —
// livre do ToolNavbar (esquerda), da legenda de status e da barra
// Concluir/Cancelar (rodapé), que nunca aparecem junto com uma seleção
// (seleção só existe em Tool.Edit; as barras de ação só nas ferramentas de
// desenho/inserção).
export function WallPropertiesPanel() {
  const selectedWall = useStore((s) => s.selectedWall);
  const selectedFurniture = useStore((s) => s.selectedFurniture);
  const isMobile = useMediaQuery('(max-width: 768px)') ?? false;

  if (selectedWall) {
    return <WallPanel wall={selectedWall} isMobile={isMobile} />;
  }
  if (selectedFurniture) {
    return <FurniturePanel furniture={selectedFurniture} isMobile={isMobile} />;
  }
  return null;
}

function WallPanel({ wall, isMobile }: { wall: Wall; isMobile: boolean }) {
  const lengthEditRequestId = useStore((s) => s.lengthEditRequestId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [, forceRerender] = useReducer((n: number) => n + 1, 0);
  const [lengthInput, setLengthInput] = useState<number | string>(
    round2(wall.length / METER)
  );

  useEffect(() => {
    setLengthInput(round2(wall.length / METER));
  }, [wall]);

  useEffect(() => {
    if (lengthEditRequestId === 0) {
      return;
    }
    // BuildSmart usabilidade mobile — o clique que abriu o painel ainda está
    // em andamento (mousedown/pointerdown no canvas do Pixi): o navegador só
    // aplica o foco/blur padrão do clique DEPOIS que o evento termina de
    // disparar, e como o canvas não é focável, esse padrão devolve o foco
    // pro <body> e desfaz o focus() chamado aqui de forma síncrona. Adiar
    // pra depois desse passo (setTimeout 0) garante que o campo realmente
    // fique focado ao final do toque/clique.
    const id = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => clearTimeout(id);
  }, [lengthEditRequestId]);

  function close() {
    wall.setSelected(false);
    useStore.getState().setSelectedWall(null);
  }

  function commitLength() {
    const meters =
      typeof lengthInput === 'number' ? lengthInput : parseFloat(lengthInput);
    if (!Number.isFinite(meters) || meters < MIN_LENGTH_METERS) {
      setLengthInput(round2(wall.length / METER));
      return;
    }
    wall.setLength(meters);
    TransformLayer.Instance.update();
    forceRerender();
    setLengthInput(round2(wall.length / METER));
  }

  return (
    <PanelShell isMobile={isMobile} title="Parede" onClose={close}>
      <NumberInput
        ref={inputRef}
        label="Comprimento (m)"
        value={lengthInput}
        onChange={setLengthInput}
        onBlur={commitLength}
        onKeyDown={(ev) => {
          if (ev.key === 'Enter') {
            inputRef.current?.blur();
          }
        }}
        decimalScale={2}
        step={0.01}
        min={MIN_LENGTH_METERS}
      />

      <div>
        <Text size="sm" fw={500} mb={4}>
          Status
        </Text>
        <Group gap={6}>
          {STATUS_ORDER.map((status) => (
            <UnstyledButton
              key={status}
              onClick={() => {
                wall.setStatus(status);
                forceRerender();
              }}
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                border:
                  wall.getStatus() === status
                    ? '2px solid #2f6fed'
                    : '1px solid rgba(0,0,0,0.15)',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: toCss(WALL_STATUS_COLORS[status])
                }}
              />
              <Text size="xs">{WALL_STATUS_LABELS[status]}</Text>
            </UnstyledButton>
          ))}
        </Group>
      </div>
    </PanelShell>
  );
}

function FurniturePanel({
  furniture,
  isMobile
}: {
  furniture: Furniture;
  isMobile: boolean;
}) {
  const [, forceRerender] = useReducer((n: number) => n + 1, 0);
  const [widthInput, setWidthInput] = useState<number | string>(
    round2(furniture.width / METER)
  );
  const [positionInput, setPositionInput] = useState<number | string>(
    round2(furniture.position.x / METER)
  );

  useEffect(() => {
    setWidthInput(round2(furniture.width / METER));
    setPositionInput(round2(furniture.position.x / METER));
  }, [furniture]);

  const isDoor = furniture.resourcePath === 'door';
  const title = isDoor ? 'Porta' : 'Janela';

  function close() {
    TransformLayer.Instance.deselect();
  }

  function commitWidth() {
    const meters =
      typeof widthInput === 'number' ? widthInput : parseFloat(widthInput);
    if (!Number.isFinite(meters) || meters < MIN_WIDTH_METERS) {
      setWidthInput(round2(furniture.width / METER));
      return;
    }
    furniture.width = meters * METER;
    TransformLayer.Instance.update();
    forceRerender();
    setWidthInput(round2(furniture.width / METER));
  }

  function commitPosition() {
    const meters =
      typeof positionInput === 'number'
        ? positionInput
        : parseFloat(positionInput);
    if (!Number.isFinite(meters)) {
      setPositionInput(round2(furniture.position.x / METER));
      return;
    }
    furniture.position.x = meters * METER;
    TransformLayer.Instance.update();
    forceRerender();
    setPositionInput(round2(furniture.position.x / METER));
  }

  return (
    <PanelShell isMobile={isMobile} title={title} onClose={close}>
      <NumberInput
        label="Largura (m)"
        value={widthInput}
        onChange={setWidthInput}
        onBlur={commitWidth}
        decimalScale={2}
        step={0.01}
        min={MIN_WIDTH_METERS}
      />

      {furniture.isAttached && (
        <NumberInput
          label="Posição na parede (m)"
          value={positionInput}
          onChange={setPositionInput}
          onBlur={commitPosition}
          decimalScale={2}
          step={0.01}
        />
      )}

      {isDoor && (
        <Button
          variant="light"
          leftSection={<IconRotate size={18} />}
          onClick={() => {
            furniture.switchOrientation();
            TransformLayer.Instance.update();
            forceRerender();
          }}
        >
          Virar
        </Button>
      )}
    </PanelShell>
  );
}
