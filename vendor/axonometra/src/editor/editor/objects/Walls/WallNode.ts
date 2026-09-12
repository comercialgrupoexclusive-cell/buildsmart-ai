import { Graphics, FederatedPointerEvent, Rectangle } from 'pixi.js';
import { INTERIOR_WALL_THICKNESS, NODE_COLOR, Tool } from '../../constants';
import { useStore } from '../../../../stores/EditorStore';
import { AddWallManager } from '../../actions/AddWallManager';
import { DeleteWallNodeAction } from '../../actions/DeleteWallNodeAction';
import { INodeSerializable } from '../../persistence/INodeSerializable';
import { useFloorPlanStore } from '../../../../stores/FloorPlanStore';
import { viewportX, viewportY } from '../../../../helpers/ViewportCoordinates';

// BuildSmart usabilidade mobile — a área de toque do nó (hitArea) é sempre
// generosa, mesmo no desktop; o desenho visual (setNodeSize) é pequeno e
// discreto nos dois. Antes disso, o nó dobrava de tamanho VISUAL no celular
// (isMobile) só pra ter uma área de toque decente — resultado eram quadrados
// enormes cobrindo os cantos do desenho. Separar as duas coisas resolve os
// dois lados: nó pequeno igual a um nó de CAD, e ainda fácil de tocar.
const TOUCH_HIT_RADIUS = 22;

export class WallNode extends Graphics {
  private dragging!: boolean;
  private id: number;

  constructor(x: number, y: number, nodeId: number) {
    super();
    this.eventMode = 'static';
    this.id = nodeId;

    this.setNodeSize(INTERIOR_WALL_THICKNESS);

    this.position.set(x, y);
    this.zIndex = 999;
    this.on('pointerdown', this.onMouseDown);
    this.on('pointermove', this.onMouseMove);
    this.on('pointerup', this.onMouseUp);
    this.on('pointerupoutside', this.onMouseUp);
  }

  public getId() {
    return this.id;
  }

  // Not `setSize`: v8's Container has a built-in setSize(width, height).
  // Desenha um círculo pequeno (nó de CAD), não o quadrado grande de antes —
  // e sempre redefine a hitArea, generosa e independente do tamanho visual,
  // porque setIsExterior também chama isso (Wall.ts) ao trocar a espessura.
  public setNodeSize(size: number) {
    this.clear();
    this.circle(size / 2, size / 2, size / 2).fill(NODE_COLOR);
    this.pivot.set(size / 2, size / 2);
    this.hitArea = new Rectangle(
      size / 2 - TOUCH_HIT_RADIUS,
      size / 2 - TOUCH_HIT_RADIUS,
      TOUCH_HIT_RADIUS * 2,
      TOUCH_HIT_RADIUS * 2
    );
  }
  private onMouseDown(ev: FederatedPointerEvent) {
    ev.stopPropagation();
    switch (useStore.getState().activeTool) {
      case Tool.Edit:
        this.dragging = true;
        break;
      case Tool.Remove: {
        const action = new DeleteWallNodeAction(this.id);
        action.execute();
        break;
      }
      case Tool.WallAdd:
        AddWallManager.Instance.step(this);
        break;
    }
  }
  private onMouseMove(ev: FederatedPointerEvent) {
    if (!this.dragging) {
      return;
    }
    const currentPoint = { x: ev.global.x, y: ev.global.y };

    this.x = viewportX(currentPoint.x);
    this.y = viewportY(currentPoint.y);

    useFloorPlanStore.getState().redrawWalls();
  }

  public setPosition(x: number, y: number) {
    this.x = viewportX(x);
    this.y = viewportY(y);
    useFloorPlanStore.getState().redrawWalls();
  }

  // BuildSmart usabilidade mobile — edição de cota (Wall.setLength) já tem a
  // posição alvo em coordenadas de MUNDO (não de tela/ponteiro), então não
  // pode reusar setPosition (que converte via viewportX/viewportY, feito
  // pra eventos de arrastar). Mesmo efeito colateral de redesenhar as
  // paredes conectadas.
  public setWorldPosition(x: number, y: number) {
    this.x = x;
    this.y = y;
    useFloorPlanStore.getState().redrawWalls();
  }

  private onMouseUp() {
    this.dragging = false;
  }

  public serialize() {
    const res: INodeSerializable = {
      id: this.id,
      x: this.x,
      y: this.y
    };
    return res;
  }
}
