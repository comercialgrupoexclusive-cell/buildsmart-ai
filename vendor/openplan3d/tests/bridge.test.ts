import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { currentProject, createDefaultProject } from '$lib/stores/project';
import { saveState } from '$lib/stores/saveStatus';
import { initBridge, isEmbedded } from '$lib/services/bridge';

// BuildSmart bridge (?embed=1) — protocolo com o módulo oficial Planta 2D/3D
// do Processo (components/processo/planta-baixa/PlantaEditor.tsx): bs:ready
// no mount, bs:load/bs:request-save recebidos, bs:save respondido. Supabase
// é a fonte canônica; um payload legado (Axonometra) ou vazio nunca é
// convertido — cai para documento novo.

function fakeWindow(search: string) {
  const target = new EventTarget() as unknown as Window;
  Object.assign(target, {
    location: { origin: 'http://buildsmart.test', search },
    parent: {} as Window, // != target => "estamos num iframe"
  });
  return target;
}

let stop: (() => void) | null = null;

beforeEach(() => { currentProject.set(createDefaultProject()); });
afterEach(() => { stop?.(); stop = null; vi.unstubAllGlobals(); });

it('isEmbedded lê ?embed=1 da URL e nada mais', () => {
  vi.stubGlobal('window', fakeWindow('?embed=1'));
  expect(isEmbedded()).toBe(true);
  vi.stubGlobal('window', fakeWindow('?embed=0'));
  expect(isEmbedded()).toBe(false);
  vi.stubGlobal('window', fakeWindow(''));
  expect(isEmbedded()).toBe(false);
});

it('avisa bs:ready ao parent no mount, same-origin', () => {
  const win = fakeWindow('?embed=1');
  const posted: unknown[] = [];
  (win.parent as any).postMessage = (msg: unknown) => posted.push(msg);
  vi.stubGlobal('window', win);
  stop = initBridge();
  expect(posted).toEqual([{ type: 'bs:ready' }]);
});

it('bs:load com projeto válido substitui o documento atual e marca como salvo', () => {
  const win = fakeWindow('?embed=1');
  (win.parent as any).postMessage = () => {};
  vi.stubGlobal('window', win);
  stop = initBridge();

  const incoming = createDefaultProject('Vindo do Supabase');
  win.dispatchEvent(new MessageEvent('message', { origin: 'http://buildsmart.test', data: { type: 'bs:load', plan: incoming } }));

  expect(get(currentProject)?.name).toBe('Vindo do Supabase');
  expect(get(currentProject)?.id).toBe(incoming.id);
  expect(get(saveState)).toBe('saved');
});

it('bs:load com planta nova (plan: null) cria um documento em branco, não trava', () => {
  const win = fakeWindow('?embed=1');
  (win.parent as any).postMessage = () => {};
  vi.stubGlobal('window', win);
  stop = initBridge();

  win.dispatchEvent(new MessageEvent('message', { origin: 'http://buildsmart.test', data: { type: 'bs:load', plan: null } }));

  const project = get(currentProject);
  expect(project).toBeTruthy();
  expect(project?.floors?.length).toBeGreaterThan(0);
});

it('bs:load com formato legado (Axonometra) não é convertido — cai para documento novo', () => {
  const win = fakeWindow('?embed=1');
  (win.parent as any).postMessage = () => {};
  vi.stubGlobal('window', win);
  stop = initBridge();

  const legado = { version: 2, floors: [{ furnitureArray: [], wallNodes: [{ id: 1, x: 0, y: 0 }], wallNodeLinks: [], wallSegmentStatus: {} }], furnitureId: 0, wallNodeId: 0 };
  win.dispatchEvent(new MessageEvent('message', { origin: 'http://buildsmart.test', data: { type: 'bs:load', plan: legado } }));

  const project = get(currentProject);
  // Não deve ter absorvido campos do formato antigo (sem `wallNodes`/`furnitureId` num Project válido).
  expect((project as any).wallNodes).toBeUndefined();
  expect(project?.floors?.[0]?.walls).toEqual([]);
});

function messageWithSource(data: unknown, origin: string, source: unknown): MessageEvent {
  // jsdom's MessageEvent valida `source` como MessagePort no eventInitDict —
  // o mock do parent não é um MessagePort real, então sobrescreve depois de
  // construído (o próprio bridge só usa `.postMessage`, exatamente como o
  // `event.source` real de uma janela pai teria).
  const event = new MessageEvent('message', { data, origin });
  Object.defineProperty(event, 'source', { value: source });
  return event;
}

it('bs:request-save responde ao remetente (source) com bs:save contendo o projeto serializado', () => {
  const win = fakeWindow('?embed=1');
  (win.parent as any).postMessage = () => {};
  vi.stubGlobal('window', win);
  stop = initBridge();

  currentProject.set(createDefaultProject('Para salvar'));
  const posted: unknown[] = [];
  const source = { postMessage: (msg: unknown) => posted.push(msg) };
  win.dispatchEvent(messageWithSource({ type: 'bs:request-save' }, 'http://buildsmart.test', source));

  expect(posted).toHaveLength(1);
  const reply = posted[0] as { type: string; plan: string };
  expect(reply.type).toBe('bs:save');
  expect(JSON.parse(reply.plan).name).toBe('Para salvar');
});

it('ignora mensagens de origem diferente', () => {
  const win = fakeWindow('?embed=1');
  (win.parent as any).postMessage = () => {};
  vi.stubGlobal('window', win);
  stop = initBridge();

  const before = get(currentProject);
  win.dispatchEvent(new MessageEvent('message', { origin: 'http://evil.test', data: { type: 'bs:load', plan: createDefaultProject('Invasor') } }));
  expect(get(currentProject)).toBe(before);
});

it('para de escutar depois do cleanup', () => {
  const win = fakeWindow('?embed=1');
  (win.parent as any).postMessage = () => {};
  vi.stubGlobal('window', win);
  const stopFn = initBridge();
  stopFn();

  const before = get(currentProject);
  win.dispatchEvent(new MessageEvent('message', { origin: 'http://buildsmart.test', data: { type: 'bs:load', plan: createDefaultProject('Depois do unmount') } }));
  expect(get(currentProject)).toBe(before);
});
