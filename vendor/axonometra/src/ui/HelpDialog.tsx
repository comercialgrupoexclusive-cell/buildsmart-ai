import { ReactNode, useState } from 'react';
import { Dialog, Group, Text } from '@mantine/core';
import { useStore } from '../stores/EditorStore';
import { NavbarLink } from './NavbarLink';
import {
  IconArrowNarrowRight,
  IconClick,
  IconEdit,
  IconGitFork,
  IconHelp,
  IconLayoutAlignMiddle,
  IconMultiplier2x,
  IconTrash,
  IconVector,
  IconZoomIn
} from '@tabler/icons-react';
import { Tool } from '../editor/editor/constants';
import { Image } from '@mantine/core';

const helpAddWall = '/help/add-wall.gif';
const helpDelete = '/help/delete.gif';
const helpEditFurniture = '/help/edit-furniture.gif';
const helpEditWall = '/help/edit-walls.gif';
const helpAddWindow = '/help/add-window.gif';
const helpAddDoor = '/help/add-door.gif';
const helpMeasure = '/help/measure-tool.gif';

interface IHelpBody {
  title: string;
  body: ReactNode;
}

export function HelpDialog() {
  const [opened, setOpened] = useState(false);

  const activeTool = useStore((s) => s.activeTool);
  const helpBody: IHelpBody[] = [];

  helpBody[Tool.View] = {
    title: 'Modo Visualizar',
    body: (
      <>
        <Group>
          <IconClick /> <p>Clique com o botão direito e arraste para mover</p>
        </Group>
        <Group>
          <IconZoomIn />{' '}
          <p>Use a roda do mouse ou o gesto de pinça para dar zoom</p>
        </Group>
      </>
    )
  };

  helpBody[Tool.Remove] = {
    title: 'Modo Apagar',
    body: (
      <>
        <Image src={helpDelete}></Image>
        <Group gap="xs">
          <IconClick /> <IconArrowNarrowRight /> <IconTrash />{' '}
          <p> Toque no elemento para removê-lo da planta</p>
        </Group>
        <Group wrap="nowrap">
          <IconVector />{' '}
          <p>Nós de parede só podem ser removidos se estiverem desconectados</p>
        </Group>
      </>
    )
  };
  helpBody[Tool.Edit] = {
    title: 'Selecionar',
    body: (
      <>
        <Image src={helpEditFurniture}></Image>
        <Group gap="xs">
          <IconClick /> <IconArrowNarrowRight /> <IconEdit />{' '}
          <p>
            {' '}
            Toque numa parede, porta ou janela para selecionar e ver suas
            propriedades
          </p>
        </Group>
        <Image src={helpEditWall}></Image>
        <Group wrap="nowrap">
          <IconVector />{' '}
          <p>
            Arraste os nós da parede para mudar a forma; toque na cota da parede
            selecionada pra editar o comprimento direto
          </p>
        </Group>
      </>
    )
  };
  helpBody[Tool.WallAdd] = {
    title: 'Desenhar parede',
    body: (
      <>
        <Image src={helpAddWall}></Image>
        <Group wrap="nowrap">
          <IconClick />{' '}
          <p>Toque para desenhar uma cadeia de paredes conectadas</p>
        </Group>
        <Group wrap="nowrap">
          <IconMultiplier2x />{' '}
          <p>Toque em Concluir (ou duas vezes no mesmo nó) para terminar</p>
        </Group>
        <Group wrap="nowrap">
          <IconGitFork /> <p>Toque em paredes existentes para conectar</p>
        </Group>
      </>
    )
  };

  helpBody[Tool.FurnitureAddWindow] = {
    title: 'Adicionar janela',
    body: (
      <>
        <Image src={helpAddWindow}></Image>
        <Group wrap="nowrap">
          <IconClick />{' '}
          <p>
            Toque na parede para adicionar a janela — depois de inserir, volta
            pra Selecionar automaticamente
          </p>
        </Group>
      </>
    )
  };
  helpBody[Tool.FurnitureAddDoor] = {
    title: 'Adicionar porta',
    body: (
      <>
        <Image src={helpAddDoor}></Image>
        <Group wrap="nowrap">
          <IconClick />{' '}
          <p>
            Toque na parede para adicionar a porta — depois de inserir, volta
            pra Selecionar automaticamente
          </p>
        </Group>
        <Group wrap="nowrap">
          <IconLayoutAlignMiddle />{' '}
          <p>
            Selecione a porta depois e use o botão Virar para trocar o sentido
          </p>
        </Group>
      </>
    )
  };
  helpBody[Tool.Measure] = {
    title: 'Ferramenta medir',
    body: (
      <>
        <Image src={helpMeasure}></Image>
        <Group wrap="nowrap">
          <IconClick /> <p>Toque e arraste para medir distâncias</p>
        </Group>
      </>
    )
  };

  // Defensive guard: helpBody only has entries for the eight Tool members.
  // If activeTool ever falls outside that set (external state mutation, a
  // malicious plan file, future code), bail rather than crash on an
  // undefined index access.
  const body = helpBody[activeTool];
  if (!body) {
    return null;
  }

  return (
    <>
      <Group justify="center">
        <NavbarLink
          onClick={() => setOpened((o) => !o)}
          icon={IconHelp}
          label="Ajuda"
        />
      </Group>

      <Dialog
        opened={opened}
        withCloseButton
        onClose={() => setOpened(false)}
        size="lg"
        radius="md"
        position={{ top: 20, right: 20 }}
      >
        <Text size="sm" style={{ marginBottom: 10 }} fw={500} component="div">
          <b>{body.title}</b>
          {body.body}
        </Text>
      </Dialog>
    </>
  );
}
