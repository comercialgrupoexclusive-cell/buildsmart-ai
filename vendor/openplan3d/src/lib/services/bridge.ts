import { get } from 'svelte/store';
import { currentProject, loadProject, createDefaultProject } from '$lib/stores/project';
import { markClean } from '$lib/stores/saveStatus';
import { readProject } from '$lib/utils/projectValidation';
import { isEmbedded } from '$lib/stores/embed';

// BuildSmart — bridge same-origin com o módulo oficial Planta 2D/3D do
// Processo (components/processo/planta-baixa/PlantaEditor.tsx). Mesmo
// desenho de protocolo que existia para o Axonometra vendorizado (agora
// descartado): bs:ready (mount) -> bs:load (parent manda o plano) ->
// ... usuário edita ... -> bs:request-save (parent pede) -> bs:save (nós
// respondemos com o projeto atual). Supabase (`plantas.plan_json`) passa a
// ser a fonte canônica; IndexedDB deixa de ser usado enquanto o bridge está
// ativo (ver o guard em saveStatus.ts `persist()`).
type BsInbound = { type: 'bs:load'; plan: unknown } | { type: 'bs:request-save' };

function isBsInbound(data: unknown): data is BsInbound {
  if (typeof data !== 'object' || data === null) return false;
  const type = (data as { type?: unknown }).type;
  return typeof type === 'string' && type.startsWith('bs:');
}

/** Mesma origem que hospeda este documento: o iframe é sempre same-origin (ver VENDOR.md). */
function originAllowed(origin: string): boolean {
  return typeof window !== 'undefined' && origin === window.location.origin;
}

/**
 * Converte o payload de `bs:load` num projeto válido. `null`/`undefined`
 * (planta nova) e qualquer objeto que não seja um projeto OpenPlan3D válido
 * (ex.: formato legado do Axonometra) resultam em documento novo — o motor
 * nunca tenta migrar geometria de outro formato; substituição só acontece
 * quando o usuário salvar explicitamente.
 */
function projectFromBridgePlan(plan: unknown) {
  if (plan && typeof plan === 'object') {
    try { return readProject(plan); } catch { /* formato legado/inválido — cai para documento novo */ }
  }
  return createDefaultProject();
}

/** Ativa o bridge quando `?embed=1`. Retorna uma função de limpeza (unmount). */
export function initBridge(): () => void {
  const handler = (event: MessageEvent) => {
    if (!originAllowed(event.origin)) return;
    if (!isBsInbound(event.data)) return;
    const source = event.source as Window | null;
    switch (event.data.type) {
      case 'bs:load': {
        loadProject(projectFromBridgePlan(event.data.plan));
        markClean();
        break;
      }
      case 'bs:request-save': {
        const project = get(currentProject);
        if (project) source?.postMessage({ type: 'bs:save', plan: JSON.stringify(project) }, event.origin);
        break;
      }
    }
  };
  window.addEventListener('message', handler);
  if (window.parent !== window) {
    window.parent.postMessage({ type: 'bs:ready' }, window.location.origin);
  }
  return () => window.removeEventListener('message', handler);
}

export { isEmbedded };
