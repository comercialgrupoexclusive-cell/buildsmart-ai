import { beforeEach, describe, expect, it, vi } from 'vitest';

// Install the Pixi mock before importing anything that touches pixi.js.
// vi.mock factories are hoisted, so the dynamic import inside resolves
// before AddWallManager.ts pulls in Graphics.
vi.mock('pixi.js', async () => {
  const { createPixiMock } = await import('../../../test/pixiMock');
  return createPixiMock();
});

// The floor plan store is what checkStep iterates. We stub it so checkStep
// sees a deterministic node map. addWall is what step() calls when chaining
// two distinct nodes — stub a wall-like object with a no-op setStatus so
// AddWallAction.execute() doesn't need a real Wall/Pixi Graphics instance.
const wallNodes = new Map<number, { x: number; y: number }>();
const addWall = vi.fn(() => ({ setStatus: vi.fn() }));
vi.mock('../../../stores/FloorPlanStore', () => ({
  useFloorPlanStore: {
    getState: () => ({
      getWallNodeSeq: () => ({
        getWallNodes: () => wallNodes,
        addWall
      })
    })
  }
}));

const { AddWallManager } = await import('../actions/AddWallManager');
const { SNAP_THRESHOLD, METER, Tool } = await import('../constants');
const { useStore } = await import('../../../stores/EditorStore');
type WallNode = import('../objects/Walls/WallNode').WallNode;

// Minimal WallNode-like fake — step()/finish()/cancel() only need getId()
// and .position (read by Preview.set()).
function fakeNode(id: number, x = 0, y = 0): WallNode {
  return { getId: () => id, position: { x, y } } as unknown as WallNode;
}

describe('AddWallManager.checkStep', () => {
  beforeEach(() => {
    wallNodes.clear();
    // Reset singleton between tests so previousNode doesn't leak.
    AddWallManager.Instance.unset();
  });

  describe('with no previousNode (first click)', () => {
    it('accepts coords that are far from every existing node', () => {
      wallNodes.set(1, { x: 0, y: 0 });
      const ok = AddWallManager.Instance.checkStep({
        x: 5 * METER,
        y: 5 * METER
      });
      expect(ok).toBe(true);
    });

    it('accepts the very first node when the map is empty', () => {
      expect(AddWallManager.Instance.checkStep({ x: 100, y: 100 })).toBe(true);
    });

    it('rejects coords within SNAP_THRESHOLD of an existing node', () => {
      wallNodes.set(1, { x: 0, y: 0 });
      // SNAP_THRESHOLD = 0.3 * METER = 30; (10, 10) is sqrt(200) ≈ 14.1 from origin
      expect(AddWallManager.Instance.checkStep({ x: 10, y: 10 })).toBe(false);
    });

    it('accepts coords exactly at SNAP_THRESHOLD distance', () => {
      wallNodes.set(1, { x: 0, y: 0 });
      // Distance exactly SNAP_THRESHOLD — the predicate is strict `<`, so accepted.
      expect(
        AddWallManager.Instance.checkStep({ x: SNAP_THRESHOLD, y: 0 })
      ).toBe(true);
    });
  });

  describe('with a previousNode (mid-chain)', () => {
    beforeEach(() => {
      // Plant a fake previousNode at the origin without going through
      // step() (which needs a real WallNode for AddWallAction).
      (
        AddWallManager.Instance as unknown as {
          previousNode: { x: number; y: number };
        }
      ).previousNode = { x: 0, y: 0 };
    });

    it('rejects coords within SNAP_THRESHOLD of the previous node', () => {
      expect(AddWallManager.Instance.checkStep({ x: 10, y: 10 })).toBe(false);
    });

    it('accepts coords outside SNAP_THRESHOLD of the previous node', () => {
      expect(AddWallManager.Instance.checkStep({ x: 2 * METER, y: 0 })).toBe(
        true
      );
    });
  });
});

// BuildSmart usabilidade mobile — fim de cadeia de parede: antes só era
// coberto pelo double-click no mesmo nó (implícito); agora finish()/cancel()
// (acionados pela barra Concluir/Cancelar) precisam terminar a sequência do
// mesmo jeito, e o estado wallChainActive no EditorStore precisa refletir
// isso pra a barra aparecer/sumir.
describe('AddWallManager chain lifecycle', () => {
  beforeEach(() => {
    wallNodes.clear();
    addWall.mockClear();
    AddWallManager.Instance.unset();
    useStore.getState().setTool(Tool.WallAdd);
  });

  it('marks the chain active on the first step and inactive after unset', () => {
    expect(useStore.getState().wallChainActive).toBe(false);
    AddWallManager.Instance.step(fakeNode(1));
    expect(useStore.getState().wallChainActive).toBe(true);
    AddWallManager.Instance.unset();
    expect(useStore.getState().wallChainActive).toBe(false);
  });

  it('chains a second distinct node into a wall and stays active', () => {
    AddWallManager.Instance.step(fakeNode(1, 0, 0));
    AddWallManager.Instance.step(fakeNode(2, 100, 0));
    expect(addWall).toHaveBeenCalledWith(1, 2);
    expect(useStore.getState().wallChainActive).toBe(true);
    expect(AddWallManager.Instance.previousNode?.getId()).toBe(2);
  });

  it('clicking the same node again ends the chain (desktop shortcut)', () => {
    const node = fakeNode(1);
    AddWallManager.Instance.step(node);
    AddWallManager.Instance.step(node);
    expect(AddWallManager.Instance.previousNode).toBeUndefined();
    expect(useStore.getState().wallChainActive).toBe(false);
  });

  it('finish() ends an in-progress chain and switches to Tool.Edit', () => {
    AddWallManager.Instance.step(fakeNode(1));
    expect(useStore.getState().wallChainActive).toBe(true);
    AddWallManager.Instance.finish();
    expect(AddWallManager.Instance.previousNode).toBeUndefined();
    expect(useStore.getState().wallChainActive).toBe(false);
    expect(useStore.getState().activeTool).toBe(Tool.Edit);
  });

  it('cancel() ends an in-progress chain without committing a pending wall', () => {
    AddWallManager.Instance.step(fakeNode(1));
    AddWallManager.Instance.cancel();
    expect(AddWallManager.Instance.previousNode).toBeUndefined();
    expect(useStore.getState().wallChainActive).toBe(false);
    expect(useStore.getState().activeTool).toBe(Tool.Edit);
    // Only the first click happened — no second node, so no wall was ever
    // committed for cancel() to have to undo.
    expect(addWall).not.toHaveBeenCalled();
  });
});
