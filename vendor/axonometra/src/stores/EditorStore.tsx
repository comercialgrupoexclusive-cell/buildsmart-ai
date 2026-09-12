/** handling current tool state, mainly */
import { create } from 'zustand';
import { AddWallManager } from '../editor/editor/actions/AddWallManager';
import { Tool, WallStatus } from '../editor/editor/constants';
import type { Wall } from '../editor/editor/objects/Walls/Wall';
import type { Furniture } from '../editor/editor/objects/Furniture';

export enum ToolMode {
  FurnitureMode,
  WallMode,
  ViewMode
}

export interface EditorStore {
  mode: ToolMode;
  activeTool: Tool;
  snap: boolean;
  // BuildSmart usabilidade mobile — true enquanto uma sequência de "Desenhar
  // parede" está em andamento (AddWallManager tem um nó anterior guardado).
  // Espelhado a partir do singleton AddWallManager, que não é reativo por si
  // só, pra a UI (barra Concluir/Cancelar) poder aparecer/sumir.
  wallChainActive: boolean;
  // Parede/mobiliário selecionado com a ferramenta Selecionar (Tool.Edit).
  // Um exclui o outro; null quando nada está selecionado.
  selectedWall: Wall | null;
  selectedFurniture: Furniture | null;
  // BuildSmart usabilidade mobile — incrementado quando o usuário toca
  // diretamente na cota (Wall.onLabelMouseDown), pra o painel de
  // propriedades focar o campo de comprimento em vez de só abrir o painel.
  lengthEditRequestId: number;
  // BuildSmart P4.6 Bloco B — status aplicado a paredes NOVAS (ferramenta
  // Desenhar parede) e a paredes clicadas com a ferramenta Status da parede
  // ativa. Escolhido antes de desenhar/clicar, não por parede.
  wallStatusToApply: WallStatus;
  setMode: (mode: ToolMode) => void;
  setTool: (tool: Tool) => void;
  setSnap: (snap: boolean) => void;
  setWallChainActive: (active: boolean) => void;
  setSelectedWall: (wall: Wall | null) => void;
  setSelectedFurniture: (furniture: Furniture | null) => void;
  setWallStatusToApply: (status: WallStatus) => void;
  requestLengthEditFocus: () => void;
}

export const useStore = create<EditorStore>()((set) => ({
  mode: ToolMode.FurnitureMode,
  // BuildSmart usabilidade mobile — o editor abre em Selecionar (Tool.Edit),
  // não em Visualizar: tocar em parede/porta/janela precisa selecionar o
  // elemento assim que a tela carrega, sem exigir um passo extra de trocar
  // de ferramenta primeiro.
  activeTool: Tool.Edit,
  snap: true,
  wallChainActive: false,
  selectedWall: null,
  selectedFurniture: null,
  lengthEditRequestId: 0,
  wallStatusToApply: 'EXISTENTE',
  setMode: (mode: ToolMode) => {
    set(() => ({
      mode: mode
    }));
  },
  setTool: (tool: Tool) => {
    set(() => ({
      activeTool: tool,
      selectedWall: null,
      selectedFurniture: null
    }));
    AddWallManager.Instance.resetTools();
  },
  setSnap: (snap: boolean) => {
    set(() => ({
      snap: snap
    }));
  },
  setWallChainActive: (active: boolean) => {
    set(() => ({
      wallChainActive: active
    }));
  },
  setSelectedWall: (wall: Wall | null) => {
    set((state) => ({
      selectedWall: wall,
      // Selecionar uma parede troca fora qualquer mobiliário selecionado;
      // desselecionar a parede (wall=null) não mexe no mobiliário.
      selectedFurniture: wall ? null : state.selectedFurniture
    }));
  },
  setSelectedFurniture: (furniture: Furniture | null) => {
    set((state) => ({
      selectedFurniture: furniture,
      selectedWall: furniture ? null : state.selectedWall
    }));
  },
  setWallStatusToApply: (status: WallStatus) => {
    set(() => ({
      wallStatusToApply: status
    }));
  },
  requestLengthEditFocus: () => {
    set((state) => ({
      lengthEditRequestId: state.lengthEditRequestId + 1
    }));
  }
}));
