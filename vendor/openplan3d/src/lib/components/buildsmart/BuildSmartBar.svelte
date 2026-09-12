<script lang="ts">
  /**
   * Camada de interação BuildSmart (PoC /labs/openplan3d).
   *
   * Barra principal sempre visível, acionável só por toque — sem teclado,
   * sem atalhos V/W/D, sem hover, sem menu lateral escondido. Não
   * reimplementa nada do motor: cada botão aciona as ferramentas que já
   * existem no OpenPlan3D (selectedTool, viewMode, wallChainCommand…).
   *
   * Fica ancorada no rodapé do editor. No BuildSmart o editor roda dentro de
   * um iframe cuja altura já termina acima da barra fixa da Luiza (ver
   * app/(app)/labs/openplan3d/page.tsx), então esta barra cai exatamente
   * imediatamente acima dela, sem esconder nem mover a Luiza.
   */
  import { selectedTool, viewMode, selectedElementId, wallStatusToApply, wallChainActive, wallChainCommand, type Tool } from '$lib/stores/project';
  import { WALL_STATUS_ORDER, WALL_STATUS_LABELS, WALL_STATUS_COLORS } from '$lib/utils/wallStatus';
  import type { WallStatus } from '$lib/models/types';

  let { onMore }: { onMore: () => void } = $props();

  let tool = $state<Tool>('select');
  let mode = $state<'2d' | '3d'>('2d');
  let chainActive = $state(false);
  let status = $state<WallStatus>('EXISTENTE');
  // Seleção guardada ao sair do 2D: o motor limpa a seleção ao entrar no 3D
  // (modo de visualização), então a devolvemos ao voltar.
  let selectionBefore3d: string | null = null;
  let currentSelection: string | null = null;

  $effect(() => selectedTool.subscribe((t) => (tool = t)));
  $effect(() => viewMode.subscribe((m) => (mode = m)));
  $effect(() => wallChainActive.subscribe((a) => (chainActive = a)));
  $effect(() => wallStatusToApply.subscribe((s) => (status = s)));
  $effect(() => selectedElementId.subscribe((id) => (currentSelection = id)));

  function pick(next: Tool) {
    // Trocar de ferramenta sempre encerra a cadeia de parede em andamento
    // (o canvas já zera o desenho ao ver selectedTool mudar).
    selectedTool.set(next);
  }

  function toggleView() {
    if (mode === '2d') {
      selectionBefore3d = currentSelection;
      viewMode.set('3d');
    } else {
      viewMode.set('2d');
      if (selectionBefore3d) selectedElementId.set(selectionBefore3d);
      selectionBefore3d = null;
    }
  }
</script>

<!-- Linha contextual: escolha do estado de reforma + Concluir/Cancelar -->
{#if tool === 'wall'}
  <div
    class="absolute inset-x-0 bottom-full z-30 flex flex-wrap items-center justify-center gap-2 px-3 pb-2"
    data-testid="bs-wall-context"
  >
    <div class="flex items-center gap-1.5 rounded-full bg-white/95 px-2 py-1.5 shadow-lg ring-1 ring-slate-200 backdrop-blur">
      {#each WALL_STATUS_ORDER as s (s)}
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-colors {status === s ? 'bg-slate-900 text-white' : 'text-slate-700 active:bg-slate-100'}"
          aria-pressed={status === s}
          onclick={() => wallStatusToApply.set(s)}
        >
          <span class="h-3 w-3 rounded-full ring-1 ring-black/20" style="background: {WALL_STATUS_COLORS[s]}"></span>
          {WALL_STATUS_LABELS[s]}
        </button>
      {/each}
    </div>
    {#if chainActive}
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg active:bg-emerald-700"
          onclick={() => wallChainCommand.set('finish')}
        >
          Concluir
        </button>
        <button
          type="button"
          class="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-lg ring-1 ring-slate-200 active:bg-slate-100"
          onclick={() => wallChainCommand.set('cancel')}
        >
          Cancelar
        </button>
      </div>
    {/if}
  </div>
{/if}

<!-- Barra principal -->
<nav
  class="flex items-stretch justify-around gap-1 border-t border-slate-200 bg-white px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_12px_rgba(15,23,42,0.08)]"
  aria-label="Ferramentas da planta"
  data-testid="bs-bar"
>
  <button
    type="button" data-testid="bs-select"
    class="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-2 text-[11px] font-medium transition-colors {tool === 'select' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 active:bg-slate-100'}"
    aria-pressed={tool === 'select'}
    onclick={() => pick('select')}
  >
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="M13 13l6 6"/></svg>
    Selecionar
  </button>

  <button
    type="button" data-testid="bs-wall"
    class="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-2 text-[11px] font-medium transition-colors {tool === 'wall' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 active:bg-slate-100'}"
    aria-pressed={tool === 'wall'}
    onclick={() => pick('wall')}
  >
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="8" rx="1"/><line x1="7" y1="8" x2="7" y2="16"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="17" y1="8" x2="17" y2="16"/></svg>
    Parede
  </button>

  <button
    type="button" data-testid="bs-door"
    class="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-2 text-[11px] font-medium transition-colors {tool === 'door' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 active:bg-slate-100'}"
    aria-pressed={tool === 'door'}
    onclick={() => pick('door')}
  >
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21h16"/><path d="M6 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17"/><circle cx="13" cy="12" r="1"/></svg>
    Porta
  </button>

  <button
    type="button" data-testid="bs-window"
    class="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-2 text-[11px] font-medium transition-colors {tool === 'window' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 active:bg-slate-100'}"
    aria-pressed={tool === 'window'}
    onclick={() => pick('window')}
  >
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="1"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="3" y1="12" x2="21" y2="12"/></svg>
    Janela
  </button>

  <button
    type="button" data-testid="bs-view"
    class="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-2 text-[11px] font-medium text-slate-600 transition-colors active:bg-slate-100"
    onclick={toggleView}
  >
    <span class="flex items-center gap-0.5 text-[13px] font-bold leading-none">
      <span class={mode === '2d' ? 'text-blue-700' : 'text-slate-400'}>2D</span>
      <span class="text-slate-300">/</span>
      <span class={mode === '3d' ? 'text-blue-700' : 'text-slate-400'}>3D</span>
    </span>
    {mode === '2d' ? 'Ver 3D' : 'Ver 2D'}
  </button>

  <button
    type="button" data-testid="bs-more"
    class="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-2 text-[11px] font-medium text-slate-600 transition-colors active:bg-slate-100"
    onclick={onMore}
  >
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>
    Mais
  </button>
</nav>
