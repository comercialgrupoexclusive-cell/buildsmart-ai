import { useFloorPlanStore } from '../../../stores/FloorPlanStore';
import { useStore } from '../../../stores/EditorStore';
import { WallNode } from '../objects/Walls/WallNode';
import { Action } from './Action';

// Add wall between two nodes of the active floor
export class AddWallAction implements Action {
  private leftNode: number;
  private rightNode: number;

  constructor(left: WallNode, right: WallNode) {
    this.leftNode = left.getId();
    this.rightNode = right.getId();
  }

  public execute() {
    const wall = useFloorPlanStore
      .getState()
      .getWallNodeSeq()
      .addWall(this.leftNode, this.rightNode);
    // BuildSmart P4.6 Bloco B — parede nova nasce com o status escolhido na
    // ferramenta Desenhar parede (padrão EXISTENTE se nenhum foi escolhido).
    wall?.setStatus(useStore.getState().wallStatusToApply);
    return wall;
  }
}
