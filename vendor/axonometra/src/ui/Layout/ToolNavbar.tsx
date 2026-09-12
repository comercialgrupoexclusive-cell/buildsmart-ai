import {
  ChangeEvent,
  Dispatch,
  SetStateAction,
  Suspense,
  lazy,
  useRef,
  useState
} from 'react';
import {
  Box,
  Tooltip,
  UnstyledButton,
  Stack,
  Menu,
  Divider,
  Drawer
} from '@mantine/core';
import classes from './ToolNavbar.module.css';
import {
  IconArmchair,
  IconArrowDownSquare,
  IconDeviceFloppy,
  IconUpload,
  IconRuler2,
  IconStairsUp,
  IconStairsDown,
  IconEye,
  IconPointer,
  IconEraser,
  IconWindow,
  IconDoor,
  IconPlus,
  IconSquareX,
  IconDimensions,
  IconPrinter,
  IconTable,
  IconTableOff,
  IconTag
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useStore } from '../../stores/EditorStore';
import { useFloorPlanStore } from '../../stores/FloorPlanStore';
import { ChangeFloorAction } from '../../editor/editor/actions/ChangeFloorAction';
import { LoadAction } from '../../editor/editor/actions/LoadAction';
import { readPlanFile } from '../../helpers/readPlanFile';
import { SaveAction } from '../../editor/editor/actions/SaveAction';
import {
  Tool,
  WALL_STATUS_COLORS,
  WALL_STATUS_LABELS,
  WallStatus
} from '../../editor/editor/constants';
import { PrintAction } from '../../editor/editor/actions/PrintAction';
import { ToggleLabelAction } from '../../editor/editor/actions/ToggleLabelAction';
import { NavbarLink } from '../NavbarLink';

// BuildSmart P4.6 Bloco B — ordem fixa de exibição das 3 opções de status.
const WALL_STATUS_ORDER: WallStatus[] = ['EXISTENTE', 'CONSTRUIR', 'DEMOLIR'];

function toCss(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

function StatusSwatch({ status }: { status: WallStatus }) {
  return (
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
  );
}

const FurnitureAddPanel = lazy(() =>
  import('../FurnitureControls/FurnitureAddPanel/FurnitureAddPanel').then(
    (m) => ({ default: m.FurnitureAddPanel })
  )
);
const HelpDialog = lazy(() =>
  import('../HelpDialog').then((m) => ({ default: m.HelpDialog }))
);
import { DeleteFloorAction } from '../../editor/editor/actions/DeleteFloorAction';
import { useFurnitureStore } from '../../stores/FurnitureStore';

const modes = [
  { icon: IconEye, label: 'Visualizar', tool: Tool.View },
  { icon: IconPointer, label: 'Selecionar', tool: Tool.Edit },
  { icon: IconEraser, label: 'Apagar', tool: Tool.Remove }
];

function AddMenu({ setter }: { setter: Dispatch<SetStateAction<number>> }) {
  const setTool = useStore((s) => s.setTool);
  const [drawerOpened, setDrawerOpened] = useState(false);

  const [_modalOpened, _setModalOpened] = useState(false);
  const getCategories = useFurnitureStore((s) => s.getCategories);

  const addButton = (
    <UnstyledButton className={classes.link}>
      <IconPlus />
    </UnstyledButton>
  );

  return (
    <>
      <Drawer
        opened={drawerOpened}
        position="right"
        onClose={() => {
          getCategories();
          setDrawerOpened(false);
        }}
        title="Adicionar mobiliário"
        padding="xl"
        size="lg"
        overlayProps={{ backgroundOpacity: 0 }}
      >
        <Suspense fallback={null}>
          <FurnitureAddPanel />
        </Suspense>
      </Drawer>
      <Menu position="right" offset={22} trigger="hover" closeDelay={500}>
        <Menu.Target>{addButton}</Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<IconArmchair size={18} />}
            onClick={() => {
              setDrawerOpened(true);
              // -1 = no active toolbar tool (deselect while the drawer is open)
              setter(-1);
            }}
          >
            Adicionar mobiliário
          </Menu.Item>
          <Divider />
          {/* BuildSmart P4.6 Bloco B — escolher o status ANTES de desenhar:
              a parede nasce com o estado escolhido (AddWallAction lê
              wallStatusToApply). Substitui o único item "Draw wall". */}
          {WALL_STATUS_ORDER.map((status) => (
            <Menu.Item
              key={`draw-${status}`}
              leftSection={<StatusSwatch status={status} />}
              onClick={() => {
                setter(-1);
                useStore.getState().setWallStatusToApply(status);
                setTool(Tool.WallAdd);
                notifications.clean();
                notifications.show({
                  title: '✏️ Modo desenhar parede',
                  message: `Toque para desenhar paredes (${WALL_STATUS_LABELS[status].toLowerCase()}). Toque em Concluir pra terminar.`,
                  color: 'blue'
                });
              }}
            >
              Desenhar parede — {WALL_STATUS_LABELS[status]}
            </Menu.Item>
          ))}
          <Divider />
          {/* BuildSmart P4.6 Bloco B — pintar paredes já existentes: escolhe
              o status e clica em quantas paredes quiser (não desenha nada
              novo, não move nó, só troca a cor — ver Wall.onMouseDown). */}
          {WALL_STATUS_ORDER.map((status) => (
            <Menu.Item
              key={`paint-${status}`}
              leftSection={<StatusSwatch status={status} />}
              onClick={() => {
                setter(-1);
                useStore.getState().setWallStatusToApply(status);
                setTool(Tool.WallStatus);
                notifications.clean();
                notifications.show({
                  title: '🎨 Modo status da parede',
                  message: `Toque nas paredes para marcá-las como ${WALL_STATUS_LABELS[status].toLowerCase()}.`,
                  color: 'blue'
                });
              }}
            >
              Definir status — {WALL_STATUS_LABELS[status]}
            </Menu.Item>
          ))}
          <Divider />
          <Menu.Item
            leftSection={<IconWindow size={18} />}
            onClick={() => {
              setTool(Tool.FurnitureAddWindow);
              setter(-1);
              notifications.clean();

              notifications.show({
                title: '🪟 Adicionar janela',
                message: 'Toque na parede para adicionar a janela',
                color: 'blue'
              });
            }}
          >
            Adicionar janela
          </Menu.Item>
          <Menu.Item
            leftSection={<IconDoor size={18} />}
            onClick={() => {
              setTool(Tool.FurnitureAddDoor);
              setter(-1);
              notifications.clean();

              notifications.show({
                title: '🚪 Adicionar porta',
                message:
                  'Toque na parede para adicionar a porta. Depois, selecione-a e use Virar para trocar o sentido.',
                color: 'blue'
              });
            }}
          >
            Adicionar porta
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </>
  );
}

export function ToolNavbar() {
  // BuildSmart usabilidade mobile — o editor abre em Selecionar (Tool.Edit),
  // não em Visualizar (ver EditorStore.activeTool); o índice inicial aqui
  // precisa bater com a posição de Selecionar em `modes` (índice 1), senão a
  // barra lateral destaca "Visualizar" enquanto a ferramenta real é outra.
  const [active, setActive] = useState(1);

  const setTool = useStore((s) => s.setTool);
  const floor = useFloorPlanStore((s) => s.currentFloor);
  const setSnap = useStore((s) => s.setSnap);
  const snap = useStore((s) => s.snap);

  const fileRef = useRef<HTMLInputElement>(null);

  const toolModes = modes.map((link, index) => (
    <NavbarLink
      {...link}
      key={link.label}
      active={index === active}
      onClick={() => {
        setActive(index);

        setTool(link.tool);
      }}
    />
  ));

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const resultText = await readPlanFile(e.target.files?.[0]);
    if (!resultText) {
      return;
    }
    const action = new LoadAction(resultText);
    action.execute();
  };

  return (
    <div style={{ position: 'absolute' }}>
      <Box className={classes.navbar}>
        <Box className={classes.sectionGrow}>
          <Stack align="center" gap={0}>
            <AddMenu setter={setActive} />
            {toolModes}
          </Stack>
        </Box>
        <Box className={classes.sectionGrow}>
          <Stack align="center" gap={0}>
            <Tooltip
              label={'Andar atual'}
              position="right"
              withArrow
              transitionProps={{ duration: 0 }}
            >
              <div className={classes.link}>{floor}</div>
            </Tooltip>

            <NavbarLink
              icon={IconStairsUp}
              label="Próximo andar"
              onClick={() => {
                const action = new ChangeFloorAction(1);
                action.execute();
              }}
            />
            <NavbarLink
              icon={IconStairsDown}
              label="Andar anterior"
              onClick={() => {
                const action = new ChangeFloorAction(-1);
                action.execute();
              }}
            />
            <NavbarLink
              icon={IconSquareX}
              label="Excluir andar"
              onClick={() => {
                const action = new DeleteFloorAction();
                action.execute();
              }}
            />
          </Stack>
        </Box>
        <Box className={classes.sectionGrow}>
          <Stack align="center" gap={0}>
            <NavbarLink
              icon={IconRuler2}
              label="Medir"
              onClick={() => {
                setTool(Tool.Measure);
                notifications.clean();
                notifications.show({
                  title: '📐 Ferramenta medir',
                  message: 'Toque e arraste para medir áreas'
                });
              }}
            />
            <NavbarLink
              icon={IconArrowDownSquare}
              label="Ajustar à grade"
              onClick={() => {
                const next = !snap;
                setSnap(next);
                notifications.clean();
                notifications.show({
                  message:
                    'Ajustar à grade ' + (next ? 'ativado' : 'desativado'),
                  icon: next ? <IconTable /> : <IconTableOff />
                });
              }}
            />
            <NavbarLink
              icon={IconDimensions}
              label="Exibir/ocultar cotas"
              onClick={() => {
                const action = new ToggleLabelAction();
                action.execute();
                notifications.clean();
                notifications.show({
                  message: 'Exibição de cotas alternada',
                  icon: <IconTag />
                });
              }}
            />
            <Suspense fallback={null}>
              <HelpDialog />
            </Suspense>
          </Stack>
        </Box>
        <Box className={classes.section}>
          <Stack align="center" gap={0}>
            <NavbarLink
              icon={IconPrinter}
              label="Imprimir"
              onClick={() => {
                const action = new PrintAction();
                action.execute();
              }}
            />
            <NavbarLink
              icon={IconDeviceFloppy}
              label="Salvar planta"
              onClick={() => {
                const action = new SaveAction();
                action.execute();
              }}
            />

            <NavbarLink
              onClick={() => fileRef.current?.click()}
              icon={IconUpload}
              label="Carregar planta"
            />
            <input
              ref={fileRef}
              onChange={handleChange}
              accept=".json,application/json,text/plain"
              multiple={false}
              type="file"
              hidden
            />
          </Stack>
        </Box>
      </Box>
    </div>
  );
}
