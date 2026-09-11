/** handling current tool state, mainly */
import { create } from 'zustand';
import { AddWallManager } from '../editor/editor/actions/AddWallManager';
import { Tool, WallStatus } from '../editor/editor/constants';

export enum ToolMode {
  FurnitureMode,
  WallMode,
  ViewMode
}

export interface EditorStore {
  mode: ToolMode;
  activeTool: Tool;
  snap: boolean;
  // BuildSmart P4.6 Bloco B — status aplicado a paredes NOVAS (ferramenta
  // Desenhar parede) e a paredes clicadas com a ferramenta Status da parede
  // ativa. Escolhido antes de desenhar/clicar, não por parede.
  wallStatusToApply: WallStatus;
  setMode: (mode: ToolMode) => void;
  setTool: (tool: Tool) => void;
  setSnap: (snap: boolean) => void;
  setWallStatusToApply: (status: WallStatus) => void;
}

export const useStore = create<EditorStore>()((set) => ({
  mode: ToolMode.FurnitureMode,
  activeTool: Tool.View,
  snap: true,
  wallStatusToApply: 'EXISTENTE',
  setMode: (mode: ToolMode) => {
    set(() => ({
      mode: mode
    }));
  },
  setTool: (tool: Tool) => {
    set(() => ({
      activeTool: tool
    }));
    AddWallManager.Instance.resetTools();
  },
  setSnap: (snap: boolean) => {
    set(() => ({
      snap: snap
    }));
  },
  setWallStatusToApply: (status: WallStatus) => {
    set(() => ({
      wallStatusToApply: status
    }));
  }
}));
