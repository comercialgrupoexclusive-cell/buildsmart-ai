import { Graphics, FederatedPointerEvent } from 'pixi.js';
import { getDoor, getWindow } from '../../../../api/api-client';
import { euclideanDistance } from '../../../../helpers/EuclideanDistance';
import { Point } from '../../../../helpers/Point';
import { computeNewEndpoint } from '../../../../helpers/WallGeometry';

import { viewportX, viewportY } from '../../../../helpers/ViewportCoordinates';

import { useStore } from '../../../../stores/EditorStore';
import { AddFurnitureAction } from '../../actions/AddFurnitureAction';
import { AddNodeAction } from '../../actions/AddNodeAction';
import { DeleteWallAction } from '../../actions/DeleteWallAction';
import {
  INTERIOR_WALL_THICKNESS,
  METER,
  SELECTION_COLOR,
  Tool,
  WALL_COLOR,
  WALL_STATUS_COLORS,
  WALL_THICKNESS,
  WallStatus
} from '../../constants';
import { TransformLayer } from '../TransformControls/TransformLayer';
import { Label } from '../TransformControls/Label';
import { WallNode } from './WallNode';

export class Wall extends Graphics {
  leftNode: WallNode;
  rightNode: WallNode;
  length!: number;
  // Not `label`: v8's Container has a built-in `label: string` property.
  lengthLabel: Label;

  x1!: number;
  x2!: number;
  y1!: number;
  y2!: number;
  thickness: number;
  isExteriorWall: boolean;
  // BuildSmart P4.6 Bloco B — status de reforma. Nasce EXISTENTE por padrão
  // tanto para paredes novas sem ferramenta de status ativa quanto para
  // paredes de um plano v1 sem wallSegmentStatus salvo (ver Floor.ts).
  status: WallStatus;
  // BuildSmart usabilidade mobile — true quando selecionada pela ferramenta
  // Selecionar (Tool.Edit). Só desenha o contorno de destaque; não afeta
  // geometria/status. Ver setSelected/drawLine.
  isSelected: boolean;

  dragging: boolean;
  mouseStartPoint: Point;
  startLeftNode: Point;
  startRightNode: Point;

  constructor(leftNode: WallNode, rightNode: WallNode) {
    super();
    this.sortableChildren = true;

    this.eventMode = 'static';
    this.leftNode = leftNode;
    this.rightNode = rightNode;
    this.dragging = false;
    this.mouseStartPoint = { x: 0, y: 0 };
    this.startLeftNode = { x: 0, y: 0 };
    this.startRightNode = { x: 0, y: 0 };
    this.setLineCoords();
    this.lengthLabel = new Label(0);

    this.addChild(this.lengthLabel);
    this.thickness = INTERIOR_WALL_THICKNESS;
    this.pivot.set(0, INTERIOR_WALL_THICKNESS / 2);
    this.zIndex = 100;
    this.isExteriorWall = false;
    this.status = 'EXISTENTE';
    this.isSelected = false;
    // this.drawLine();

    this.on('pointerdown', this.onMouseDown);
    this.on('rightdown', this.onRightDown);
    this.on('pointermove', this.onMouseMove);
    this.on('pointerup', this.onMouseUp);
    this.on('pointerupoutside', this.onMouseUp);
    // BuildSmart usabilidade mobile — tocar direto na cota também seleciona
    // a parede e pede foco no campo de comprimento do painel de
    // propriedades (ver EditorStore.requestLengthEditFocus).
    this.lengthLabel.on('pointerdown', this.onLabelMouseDown);
  }

  public setIsExterior(value: boolean) {
    this.isExteriorWall = value;
    if (value) {
      this.thickness = WALL_THICKNESS;
    } else {
      this.thickness = INTERIOR_WALL_THICKNESS;
    }
    this.pivot.set(0, this.thickness / 2);
    this.leftNode.setNodeSize(this.thickness);
    this.rightNode.setNodeSize(this.thickness);
    this.drawLine();
  }

  public getIsExterior() {
    return this.isExteriorWall;
  }

  // BuildSmart P4.6 Bloco B — troca o status e redesenha (não duplica
  // parede nem mexe em geometria/nós, só a cor de preenchimento).
  public setStatus(status: WallStatus) {
    this.status = status;
    this.drawLine();
  }

  public getStatus(): WallStatus {
    return this.status;
  }

  // BuildSmart usabilidade mobile — liga/desliga o contorno de destaque de
  // seleção. Chamado pelo fluxo de seleção em onMouseDown e por quem
  // desseleciona (Main.checkTools no clique vazio, outra Wall sendo
  // selecionada).
  public setSelected(selected: boolean) {
    this.isSelected = selected;
    this.drawLine();
  }

  // BuildSmart usabilidade mobile — edição de cota: mantém leftNode fixo e
  // move rightNode ao longo do eixo atual da parede até atingir o novo
  // comprimento (em metros). WallNode.setWorldPosition dispara
  // redrawWalls(), que redesenha automaticamente qualquer outra parede
  // ligada ao mesmo nó — sem duplicar geometria nem criar parede nova.
  public setLength(newLengthMeters: number) {
    const newLengthPx = newLengthMeters * METER;
    const newPos = computeNewEndpoint(
      { x: this.leftNode.x, y: this.leftNode.y },
      { x: this.rightNode.x, y: this.rightNode.y },
      newLengthPx
    );
    this.rightNode.setWorldPosition(newPos.x, newPos.y);
  }

  // BuildSmart usabilidade mobile — arrow function (não método comum): é
  // registrada em this.lengthLabel.on(...), então precisa manter `this`
  // como a Wall mesmo sendo chamada pelo emit() do Label, não da Wall.
  //
  // A cota fica ACIMA da faixa preenchida da própria parede (offset visual
  // de LABEL_OFFSET/25px) — fora da área de desenho dela. Sem tratamento
  // especial, tocar perto da cota com qualquer ferramenta que não seja
  // Selecionar (inserir porta/janela, apagar, pintar status) não acertaria
  // NADA: só a cota tem área de toque ali, e ela borbulharia pro clique vazio
  // do Main (nenhuma ferramenta de ação tem caso pra clique vazio). Por isso,
  // fora do Selecionar, delega direto pro onMouseDown da própria parede —
  // localCoords.x (única coordenada que as ações de porta/janela usam) é a
  // mesma, só a y difere, e onMouseDown já corrige o y ao dividir uma parede.
  private onLabelMouseDown = (ev: FederatedPointerEvent) => {
    const state = useStore.getState();
    if (state.activeTool !== Tool.Edit) {
      this.onMouseDown(ev);
      return;
    }
    ev.stopPropagation();
    TransformLayer.Instance.deselect();
    const previousWall = state.selectedWall;
    if (previousWall && previousWall !== this) {
      previousWall.setSelected(false);
    }
    this.setSelected(true);
    state.setSelectedWall(this);
    state.requestLengthEditFocus();
  };

  public setLineCoords() {
    if (this.leftNode.x == this.rightNode.x) {
      if (this.leftNode.y < this.rightNode.y) {
        return [
          this.leftNode.x,
          this.leftNode.y,
          this.rightNode.x,
          this.rightNode.y
        ];
      } else {
        return [
          this.rightNode.x,
          this.rightNode.y,
          this.leftNode.x,
          this.leftNode.y
        ];
      }
    } else if (this.leftNode.x < this.rightNode.x) {
      return [
        this.leftNode.x,
        this.leftNode.y,
        this.rightNode.x,
        this.rightNode.y
      ];
    } else {
      return [
        this.rightNode.x,
        this.rightNode.y,
        this.leftNode.x,
        this.leftNode.y
      ];
    }
  }

  public drawLine() {
    this.clear();
    [this.x1, this.y1, this.x2, this.y2] = this.setLineCoords();

    let theta = Math.atan2(this.y2 - this.y1, this.x2 - this.x1); // aflu unghiul sa pot roti
    theta *= 180 / Math.PI; // rads to degs, range (-180, 180]
    if (theta < 0) theta = 360 + theta; // range [0, 360)
    this.length = euclideanDistance(this.x1, this.x2, this.y1, this.y2);

    this.rect(0, 0, this.length, this.thickness)
      .fill(WALL_STATUS_COLORS[this.status])
      .stroke(
        this.isSelected
          ? { width: 3, color: SELECTION_COLOR }
          : { width: 1, color: WALL_COLOR }
      );
    this.position.set(this.x1, this.y1);
    this.angle = theta;

    this.leftNode.angle = theta;
    this.rightNode.angle = theta;

    this.lengthLabel.update(this.length - WALL_THICKNESS);
    this.lengthLabel.position.x = this.width / 2;
    this.lengthLabel.angle = 360 - theta;

    this.lengthLabel.position.y = 25;
    this.lengthLabel.zIndex = 998;
  }

  private onRightDown(ev: FederatedPointerEvent) {
    ev.stopPropagation();
    this.setIsExterior(!this.isExteriorWall);
    return;
  }

  private onMouseMove(ev: FederatedPointerEvent) {
    if (!this.dragging) {
      return;
    }
    const currentPoint = ev.global;
    const delta = {
      x: currentPoint.x - this.mouseStartPoint.x,
      y: currentPoint.y - this.mouseStartPoint.y
    };

    this.leftNode.setPosition(
      this.startLeftNode.x + delta.x,
      this.startLeftNode.y + delta.y
    );
    this.rightNode.setPosition(
      this.startRightNode.x + delta.x,
      this.startRightNode.y + delta.y
    );
  }

  private onMouseUp(_ev: FederatedPointerEvent) {
    this.dragging = false;
    return;
  }

  private onMouseDown(ev: FederatedPointerEvent) {
    ev.stopPropagation();

    const coords = {
      x: viewportX(ev.global.x),
      y: viewportY(ev.global.y)
    };
    const localCoords = ev.getLocalPosition(this);

    const state = useStore.getState();

    if (state.activeTool == Tool.Remove) {
      const action = new DeleteWallAction(this);
      action.execute();
    }

    // BuildSmart P4.6 Bloco B — ferramenta "Status da parede": clique pinta
    // a parede com o status escolhido na barra lateral (ToolNavbar), sem
    // duplicar geometria nem criar/remover nós.
    if (state.activeTool == Tool.WallStatus) {
      this.setStatus(state.wallStatusToApply);
      return;
    }

    if (state.activeTool == Tool.WallAdd) {
      const addNode = new AddNodeAction(this, coords);
      addNode.execute();
    }
    // BuildSmart usabilidade mobile — regra geral das ferramentas de ação:
    // insere UMA unidade e volta pra Selecionar (Tool.Edit), em vez de ficar
    // inserindo indefinidamente a cada toque na parede.
    if (state.activeTool == Tool.FurnitureAddWindow) {
      getWindow().then((res) => {
        const action = new AddFurnitureAction(
          res[0],
          this,
          { x: localCoords.x, y: 0 },
          this.leftNode.getId(),
          this.rightNode.getId()
        );
        action.execute();
        useStore.getState().setTool(Tool.Edit);
      });
    }

    if (state.activeTool == Tool.FurnitureAddDoor) {
      getDoor().then((res) => {
        const action = new AddFurnitureAction(
          res[0],
          this,
          { x: localCoords.x, y: 0 },
          this.leftNode.getId(),
          this.rightNode.getId()
        );
        action.execute();
        useStore.getState().setTool(Tool.Edit);
      });
    }

    // BuildSmart usabilidade mobile — Selecionar (Tool.Edit) nunca arrasta
    // no primeiro toque: o primeiro toque só seleciona (destaca + abre
    // propriedades via EditorStore.selectedWall). Só arrasta a parede
    // inteira se ela JÁ estava selecionada antes deste toque — evita mover
    // parede sem querer ao tentar selecioná-la no celular.
    if (state.activeTool == Tool.Edit) {
      if (!this.isSelected) {
        TransformLayer.Instance.deselect();
        const previousWall = state.selectedWall;
        if (previousWall && previousWall !== this) {
          previousWall.setSelected(false);
        }
        this.setSelected(true);
        state.setSelectedWall(this);
        return;
      }

      if (!this.dragging) {
        this.dragging = true;
        this.mouseStartPoint.x = viewportX(ev.global.x);
        this.mouseStartPoint.y = viewportY(ev.global.y);
        this.startLeftNode.x = this.leftNode.position.x;
        this.startLeftNode.y = this.leftNode.position.y;

        this.startRightNode.x = this.rightNode.position.x;
        this.startRightNode.y = this.rightNode.position.y;
      }
      return;
    }
  }
}
