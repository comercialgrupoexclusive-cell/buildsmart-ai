import { FederatedPointerEvent } from 'pixi.js';
import { euclideanDistance } from '../../../helpers/EuclideanDistance';
import { Point } from '../../../helpers/Point';

import { SNAP_THRESHOLD, Tool } from '../constants';
import { useFloorPlanStore } from '../../../stores/FloorPlanStore';
import { useStore } from '../../../stores/EditorStore';

import { TransformLayer } from '../objects/TransformControls/TransformLayer';
import { WallNode } from '../objects/Walls/WallNode';
import { AddWallAction } from './AddWallAction';
import { Preview } from './MeasureToolManager';

// tracks current action data
export class AddWallManager {
  private static instance: AddWallManager | undefined;

  public previousNode: WallNode | undefined;

  public preview: Preview;

  private constructor() {
    this.previousNode = undefined;
    this.preview = new Preview();
  }

  // checks if step is valid
  public checkStep(coords: Point) {
    if (this.previousNode == undefined) {
      for (const [_id, node] of useFloorPlanStore
        .getState()
        .getWallNodeSeq()
        .getWallNodes()) {
        if (
          euclideanDistance(coords.x, node.x, coords.y, node.y) < SNAP_THRESHOLD
        ) {
          return false;
        }
      }
      return true;
    }

    if (
      euclideanDistance(
        coords.x,
        this.previousNode.x,
        coords.y,
        this.previousNode.y
      ) < SNAP_THRESHOLD
    ) {
      return false;
    }
    return true;
  }
  public step(node: WallNode) {
    // first click. set first node
    if (this.previousNode === undefined) {
      this.previousNode = node;
      this.preview.set(this.previousNode.position);
      useStore.getState().setWallChainActive(true);
      return;
    }

    // BuildSmart usabilidade mobile — clicar de novo no mesmo nó ainda
    // encerra a sequência (atalho de desktop), mas não é mais o único jeito:
    // ver finish()/cancel(), acionados pela barra Concluir/Cancelar.
    if (this.previousNode.getId() === node.getId()) {
      this.unset();
      return;
    }

    //new node on screen
    const wallAction = new AddWallAction(this.previousNode, node);
    wallAction.execute();
    this.preview.set(node.position);

    this.previousNode = node;
    this.preview.set(this.previousNode.position);
    // this.sizeLabel.visible = false;
  }

  public updatePreview(ev: FederatedPointerEvent) {
    this.preview.updatePreview(ev, true);
  }
  public unset() {
    this.previousNode = undefined;
    this.preview.set(undefined);
    useStore.getState().setWallChainActive(false);
  }

  // BuildSmart usabilidade mobile — "Concluir": encerra a sequência atual
  // (os segmentos já desenhados ficam, cada um já foi commitado no clique
  // que o criou) e volta pra Selecionar. Sem histórico de undo no motor,
  // "Cancelar" tem o mesmo efeito sobre a cadeia — a diferença é só de
  // intenção pro usuário; nenhum dos dois desfaz segmentos já desenhados.
  // setTool(Tool.Edit) já chama resetTools() -> unset() por baixo (ver
  // EditorStore.setTool), então isso também zera a cadeia.
  public finish() {
    useStore.getState().setTool(Tool.Edit);
  }

  public cancel() {
    useStore.getState().setTool(Tool.Edit);
  }

  public static get Instance() {
    return this.instance || (this.instance = new this());
  }

  // Chamado por EditorStore.setTool a cada troca de ferramenta — ponto
  // único pra garantir que nada fica "preso" selecionado/destacado ao trocar
  // de ferramenta (mobiliário via TransformLayer, parede via seu próprio
  // contorno azul).
  public resetTools() {
    TransformLayer.Instance.deselect();
    const wall = useStore.getState().selectedWall;
    if (wall) {
      wall.setSelected(false);
      useStore.getState().setSelectedWall(null);
    }
    this.unset();
  }

  public dispose() {
    this.unset();
    AddWallManager.instance = undefined;
  }
}
