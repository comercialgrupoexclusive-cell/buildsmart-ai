import { WallStatus } from '../constants';
import { IFurnitureSerializable } from './IFurnitureSerializable';
import { INodeSerializable } from './INodeSerializable';

export class FloorSerializable {
  public furnitureArray: IFurnitureSerializable[];
  public wallNodes: INodeSerializable[];
  public wallNodeLinks: [number, number[]][];
  // BuildSmart P4.6 Bloco B — status por segmento de parede, chave
  // `${minNodeId}-${maxNodeId}` (par canônico — wallNodeLinks/addWall já
  // normalizam leftNodeId < rightNodeId). Aditivo sobre o formato v1:
  // segmentos ausentes aqui (planos v1, ou uma parede nova neste mesmo
  // save) assumem EXISTENTE, o padrão da classe Wall — não há necessidade
  // de backfill explícito.
  public wallSegmentStatus: Record<string, WallStatus>;

  public constructor() {
    this.furnitureArray = [];
    this.wallNodes = [];
    this.wallNodeLinks = [];
    this.wallSegmentStatus = {};
  }
}
