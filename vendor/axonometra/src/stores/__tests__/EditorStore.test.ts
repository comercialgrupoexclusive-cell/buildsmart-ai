import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Tool } from '../../editor/editor/constants';

// setTool calls AddWallManager.Instance.resetTools() — stub that out so the
// store tests don't depend on the Pixi-side singleton.
const resetTools = vi.fn();
vi.mock('../../editor/editor/actions/AddWallManager', () => ({
  AddWallManager: { Instance: { resetTools } }
}));

const { useStore, ToolMode } = await import('../EditorStore');

const initial = useStore.getState();

describe('EditorStore', () => {
  beforeEach(() => {
    useStore.setState(initial);
    resetTools.mockClear();
  });

  it('starts in FurnitureMode with snap on and Edit (Selecionar) tool', () => {
    const s = useStore.getState();
    expect(s.mode).toBe(ToolMode.FurnitureMode);
    // BuildSmart usabilidade mobile — abre em Selecionar (Tool.Edit), não em
    // Visualizar (Tool.View), ver EditorStore.tsx.
    expect(s.activeTool).toBe(Tool.Edit);
    expect(s.snap).toBe(true);
  });

  it('setTool(Tool.Edit) clears selectedWall/selectedFurniture', () => {
    useStore.setState({
      selectedWall: {} as never,
      selectedFurniture: null
    });
    useStore.getState().setTool(Tool.Edit);
    expect(useStore.getState().selectedWall).toBeNull();
  });

  it('wallChainActive toggles independently', () => {
    useStore.getState().setWallChainActive(true);
    expect(useStore.getState().wallChainActive).toBe(true);
    useStore.getState().setWallChainActive(false);
    expect(useStore.getState().wallChainActive).toBe(false);
  });

  it('setSelectedWall clears selectedFurniture only when selecting a wall', () => {
    useStore.getState().setSelectedFurniture({} as never);
    useStore.getState().setSelectedWall(null);
    expect(useStore.getState().selectedFurniture).not.toBeNull();
    useStore.getState().setSelectedWall({} as never);
    expect(useStore.getState().selectedFurniture).toBeNull();
  });

  it('setMode updates the mode', () => {
    useStore.getState().setMode(ToolMode.WallMode);
    expect(useStore.getState().mode).toBe(ToolMode.WallMode);
  });

  it('setTool updates activeTool and resets AddWallManager', () => {
    useStore.getState().setTool(Tool.Edit);
    expect(useStore.getState().activeTool).toBe(Tool.Edit);
    expect(resetTools).toHaveBeenCalledOnce();
  });

  it('setSnap toggles snap', () => {
    useStore.getState().setSnap(false);
    expect(useStore.getState().snap).toBe(false);
    useStore.getState().setSnap(true);
    expect(useStore.getState().snap).toBe(true);
  });

  it('repeated setMode is idempotent', () => {
    useStore.getState().setMode(ToolMode.ViewMode);
    useStore.getState().setMode(ToolMode.ViewMode);
    expect(useStore.getState().mode).toBe(ToolMode.ViewMode);
  });
});
