import { beforeEach, describe, expect, it, vi } from 'vitest';

// BuildSmart P4.6 Bloco B — status de reforma por parede (EXISTENTE/
// CONSTRUIR/DEMOLIR). Mesma estratégia de mock que WallNodeSequence.test.ts:
// Wall/AddWallAction tocam Pixi, api-client, EditorStore e FloorPlanStore só
// o suficiente para existir, sem precisar de um canvas real.

vi.mock('pixi.js', async () => {
  const { createPixiMock } = await import('../../../test/pixiMock');
  return createPixiMock();
});

vi.mock('../../../helpers/isMobile', () => ({ isMobile: false }));

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() }
}));

vi.mock('../../../api/api-client', () => ({
  getDoor: () => Promise.resolve([]),
  getWindow: () => Promise.resolve([])
}));

// Mutable so tests can drive which status AddWallAction stamps onto a new
// wall, exactly like the real store's wallStatusToApply.
const editorState = {
  activeTool: 0,
  snap: false,
  wallStatusToApply: 'EXISTENTE'
};
vi.mock('../../../stores/EditorStore', () => ({
  useStore: { getState: () => editorState }
}));
vi.mock('../../../stores/FloorPlanStore', () => ({
  useFloorPlanStore: { getState: () => ({ redrawWalls: vi.fn() }) }
}));
vi.mock('../../EditorRoot', () => ({
  getMain: () => ({ scale: { x: 1, y: 1 }, corner: { x: 0, y: 0 } })
}));

const { WallNodeSequence } = await import('../objects/Walls/WallNodeSequence');
const { AddWallAction } = await import('../actions/AddWallAction');
const { FloorSerializable } = await import('../persistence/FloorSerializable');
const { useFloorPlanStore } = await import('../../../stores/FloorPlanStore');

describe('Wall status (P4.6 Bloco B)', () => {
  beforeEach(() => {
    editorState.wallStatusToApply = 'EXISTENTE';
    new WallNodeSequence().setId(0);
  });

  it('a new wall defaults to EXISTENTE', () => {
    const seq = new WallNodeSequence();
    seq.addNode(0, 0);
    seq.addNode(100, 0);
    const wall = seq.addWall(1, 2);
    expect(wall?.getStatus()).toBe('EXISTENTE');
  });

  it('setStatus/getStatus round-trip without touching geometry', () => {
    const seq = new WallNodeSequence();
    seq.addNode(0, 0);
    seq.addNode(100, 0);
    const wall = seq.addWall(1, 2)!;
    const before = { x1: wall.leftNode.x, x2: wall.rightNode.x };
    wall.setStatus('DEMOLIR');
    expect(wall.getStatus()).toBe('DEMOLIR');
    expect({ x1: wall.leftNode.x, x2: wall.rightNode.x }).toEqual(before);
  });

  it('AddWallAction stamps the status chosen in EditorStore onto a new wall', () => {
    const seq = new WallNodeSequence();
    const a = seq.addNode(0, 0);
    const b = seq.addNode(100, 0);
    // WallNodeSequence.addWall alone (used by AddWallManager/WallNodeSequence
    // tests) doesn't know about status — only AddWallAction, the entry point
    // real user interaction goes through, stamps it.
    vi.spyOn(seq, 'addWall');

    editorState.wallStatusToApply = 'CONSTRUIR';
    // AddWallAction reads useFloorPlanStore().getWallNodeSeq() — stub it to
    // return our sequence directly.
    (useFloorPlanStore as unknown as { getState: () => unknown }).getState =
      () => ({ getWallNodeSeq: () => seq });

    const action = new AddWallAction(a, b);
    const wall = action.execute();
    expect(wall?.getStatus()).toBe('CONSTRUIR');
  });

  it('FloorSerializable starts with an empty wallSegmentStatus map', () => {
    const plan = new FloorSerializable();
    expect(plan.wallSegmentStatus).toEqual({});
  });

  it('the canonical segment key matches leftNode/rightNode after addWall normalises order', () => {
    const seq = new WallNodeSequence();
    seq.addNode(0, 0); // id 1
    seq.addNode(100, 0); // id 2
    // addWall(2, 1) is normalised internally to left=1, right=2 (see
    // WallNodeSequence.addWall) — the canonical (min,max) pair the P4.6 doc
    // asks wall-status metadata to be keyed by.
    const wall = seq.addWall(2, 1)!;
    const key = `${wall.leftNode.getId()}-${wall.rightNode.getId()}`;
    expect(key).toBe('1-2');
  });
});
