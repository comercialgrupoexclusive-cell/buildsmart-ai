import { notifications } from '@mantine/notifications';
import { useFloorPlanStore } from '../../../stores/FloorPlanStore';
import {
  CURRENT_PLAN_VERSION,
  FloorPlanSerializable,
  safeParsePlan,
  validatePlanShape
} from './FloorPlanSerializable';

// Reads and writes the floor plan model held in useFloorPlanStore. The
// editor's Pixi containers are not involved: `Floor.serialize()` produces the
// DTO, and `setPlan` rebuilds the floors from one.
export class Serializer {
  public serialize(): string {
    // Materialise the active floor so a never-touched plan still serialises
    // to a valid single-floor document.
    useFloorPlanStore.getState().getCurrentFloor();
    const { floors, furnitureId } = useFloorPlanStore.getState();

    const floorPlanSerializable = new FloorPlanSerializable();
    // BuildSmart P4.6 Bloco B — todo save sobe o plano para a versão atual
    // (hoje 2); um plano v1 carregado e resalvo migra silenciosamente, sem
    // perder nada (wallSegmentStatus simplesmente nasce {} = tudo EXISTENTE).
    floorPlanSerializable.version = CURRENT_PLAN_VERSION;
    for (const floor of floors) {
      floorPlanSerializable.floors.push(floor.serialize());
    }
    floorPlanSerializable.furnitureId = furnitureId;
    floorPlanSerializable.wallNodeId = floors[0]
      .getWallNodeSequence()
      .getWallNodeId();
    return JSON.stringify(floorPlanSerializable);
  }

  public load(planText: string | null): void {
    if (planText == null || planText === '') {
      notifications.show({
        title: 'Falha ao carregar',
        message: 'Nenhum dado de planta para carregar.',
        color: 'red'
      });
      return;
    }
    let raw: unknown;
    try {
      raw = safeParsePlan(planText);
    } catch {
      notifications.show({
        title: 'Falha ao carregar',
        message: 'O arquivo da planta não é um JSON válido.',
        color: 'red'
      });
      return;
    }
    const plan = validatePlanShape(raw);
    if (!plan) {
      notifications.show({
        title: 'Falha ao carregar',
        message: 'O arquivo da planta está sem campos obrigatórios.',
        color: 'red'
      });
      return;
    }
    // Schema migrations dispatch on plan.version here. v1 -> v2 (BuildSmart
    // P4.6 Bloco B, wallSegmentStatus) needs no data transform: Floor's
    // constructor already defaults any wall missing a status entry to
    // EXISTENTE, which is exactly what a v1 plan (no wallSegmentStatus at
    // all) means. Both versions load through the same path.
    const version = (raw as { version?: number }).version ?? 1;
    if (version !== 1 && version !== 2) {
      notifications.show({
        title: 'Falha ao carregar',
        message: `Versão de planta não suportada: ${version}.`,
        color: 'red'
      });
      return;
    }
    useFloorPlanStore.getState().setPlan(plan);
  }
}

export const serializer = new Serializer();
