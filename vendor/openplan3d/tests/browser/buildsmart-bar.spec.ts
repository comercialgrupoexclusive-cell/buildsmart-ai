import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/**
 * Camada de interação BuildSmart (PoC /labs/openplan3d) — script obrigatório
 * da rodada, ponto a ponto, sem teclado e sem atalhos: tudo pelos controles
 * da barra. Roda em desktop e no viewport mobile com toque real.
 */

const YELLOW = { r: 0xea, g: 0xb3, b: 0x08 }; // DEMOLIR (ver $lib/utils/wallStatus)

async function exportPlan(page: Page) {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download JSON', exact: true }).click();
  return JSON.parse(await readFile((await (await pending).path())!, 'utf8'));
}

/**
 * Procura a cor de status em todo o canvas do plano. Varrer o canvas inteiro
 * evita depender de coordenadas: no desktop o painel de propriedades encolhe
 * o canvas ao aparecer, deslocando o desenho.
 */
async function canvasHasColor(page: Page, want: { r: number; g: number; b: number }) {
  return page.evaluate(
    ({ want }) => {
      const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
      if (!canvas) return false;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return false;
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < data.length; i += 4) {
        if (Math.abs(data[i] - want.r) < 26 && Math.abs(data[i + 1] - want.g) < 26 && Math.abs(data[i + 2] - want.b) < 26) return true;
      }
      return false;
    },
    { want },
  );
}

for (const variant of [
  { label: 'desktop', width: 1440, height: 900, touch: false },
  { label: 'mobile', width: 675, height: 1500, touch: true },
]) {
  test.describe(`BuildSmart bar — ${variant.label}`, () => {
    test.use({
      viewport: { width: variant.width, height: variant.height },
      hasTouch: variant.touch,
      isMobile: variant.touch,
    });

    test(`fluxo obrigatório por toque (${variant.label})`, async ({ page }) => {
      test.setTimeout(120_000);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));

      const tap = async (sel: string) => {
        const target = page.locator(sel);
        if (variant.touch) await target.tap();
        else await target.click();
      };
      const tapAt = async (x: number, y: number) => {
        if (variant.touch) await page.touchscreen.tap(x, y);
        else await page.mouse.click(x, y);
        await page.waitForTimeout(180);
      };

      /** Toca um canto vazio do canvas, remedindo-o antes (o painel de
       *  propriedades encolhe o canvas no desktop ao aparecer). */
      const deselect = async () => {
        const fresh = (await canvas.boundingBox())!;
        await tapAt(fresh.x + fresh.width - 40, fresh.y + 40);
        await page.waitForTimeout(400);
      };

      /**
       * Toca perto do ponto esperado até a checagem passar. O motor ajusta os
       * pontos à grade ao desenhar, então a parede fica alguns pixels fora de
       * onde o toque original caiu — um usuário simplesmente tocaria de novo
       * um pouco ao lado.
       */
      const tapNearUntil = async (x: number, y: number, check: () => Promise<boolean>) => {
        for (const d of [0, 10, -10, 20, -20, 30, -30]) {
          await tapAt(x, y + d);
          if (await check()) return true;
          // O canvas converte dois toques próximos em menos de 350 ms num
          // duplo toque (que divide a parede). Espera passar essa janela
          // antes da próxima tentativa.
          await page.waitForTimeout(420);
        }
        return false;
      };

      // 1. abrir editor (projeto novo, vazio)
      await page.goto('/editor');
      const canvas = page.getByRole('application').locator('canvas').first();
      await expect(canvas).toBeVisible();
      await expect(page.getByTestId('bs-bar')).toBeVisible();

      // 2. Selecionar está ativo por padrão
      await expect(page.getByTestId('bs-select')).toHaveAttribute('aria-pressed', 'true');

      // 3. tocar Parede → desenho começa imediatamente
      await tap('[data-testid="bs-wall"]');
      await expect(page.getByTestId('bs-wall')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('bs-wall-context')).toBeVisible();

      // 4. escolher Construir
      await page.getByTestId('bs-wall-context').getByRole('button', { name: 'Construir' }).click();
      await expect(page.getByTestId('bs-wall-context').getByRole('button', { name: 'Construir' }))
        .toHaveAttribute('aria-pressed', 'true');

      // O motor dá um zoom-to-fit único assim que a primeira parede do
      // projeto aparece, o que moveria a câmera no meio da sequência de
      // toques. Gastamos esse fit com um traço descartável (desfeito logo em
      // seguida) para desenhar depois com a câmera estável.
      {
        const warm = (await canvas.boundingBox())!;
        await tapAt(warm.x + warm.width * 0.3, warm.y + warm.height * 0.3);
        await tapAt(warm.x + warm.width * 0.45, warm.y + warm.height * 0.3);
        await page.waitForTimeout(900);
        await page.getByRole('button', { name: 'Undo', exact: true }).click();
        await page.waitForTimeout(300);
        await tap('[data-testid="bs-select"]');
        await tap('[data-testid="bs-wall"]');
        await page.waitForTimeout(200);
      }

      // 5. desenhar 4 segmentos (cadeia aberta: 5 toques, 4 paredes)
      const box = (await canvas.boundingBox())!;
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      const half = Math.min(box.width, box.height) * 0.22;
      const corners = [
        { x: cx - half, y: cy - half },
        { x: cx + half, y: cy - half },
        { x: cx + half, y: cy + half },
        { x: cx - half, y: cy + half },
        { x: cx - half, y: cy },
      ];
      for (const c of corners) await tapAt(c.x, c.y);
      await expect(page.getByRole('application')).toContainText('4 walls');

      // 6. tocar Concluir → encerra a cadeia e volta para Selecionar, sem
      // inventar nenhuma parede além das que o usuário desenhou
      await tap('[data-testid="bs-wall-context"] >> text=Concluir');
      await expect(page.getByTestId('bs-select')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('bs-wall-context')).toHaveCount(0);
      await expect(page.getByRole('application')).toContainText('4 walls');

      // 7. nenhum toque seguinte cria parede
      await tapAt(box.x + box.width - 60, box.y + 60);
      await page.waitForTimeout(420);
      await tapAt(box.x + box.width - 140, box.y + 160);
      await expect(page.getByRole('application')).toContainText('4 walls');

      // 8. selecionar uma parede (meio do lado superior)
      const topMid = { x: cx, y: corners[0].y };
      const length = page.getByRole('spinbutton', { name: 'Comprimento (cm)', exact: true });
      expect(await tapNearUntil(topMid.x, topMid.y, () => length.isVisible()),
        'parede do topo selecionada por toque').toBe(true);

      // 9./10. alterar comprimento numericamente e confirmar na geometria
      const before = Number(await length.inputValue());
      expect(before).toBeGreaterThan(0);
      await length.fill('300');
      await length.press('Tab');
      await expect(length).toHaveValue('300');
      let plan = await exportPlan(page);
      const topWall = plan.floors[0].walls.find(
        (w: { start: { x: number; y: number }; end: { x: number; y: number } }) =>
          Math.abs(Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y) - 300) < 1,
      );
      expect(topWall, 'a parede editada mede 300 cm no modelo').toBeTruthy();
      expect(plan.floors[0].walls).toHaveLength(4);
      // status escolhido na criação ficou na parede
      expect(plan.floors[0].walls.every((w: { status?: string }) => w.status === 'CONSTRUIR')).toBe(true);

      // 11. trocar status para Demolir e confirmar o amarelo no desenho
      await page.getByTestId('bs-wall-status').getByRole('button', { name: 'Demolir' }).click();
      await expect(page.getByTestId('bs-wall-status').getByRole('button', { name: 'Demolir' }))
        .toHaveAttribute('aria-pressed', 'true');
      plan = await exportPlan(page);
      expect(plan.floors[0].walls.filter((w: { status?: string }) => w.status === 'DEMOLIR')).toHaveLength(1);
      // desselecionar para a cor de seleção não mascarar a cor de status
      await page.waitForTimeout(420);
      await deselect();
      expect(await canvasHasColor(page, YELLOW), 'parede DEMOLIR desenhada em amarelo').toBe(true);

      // 12./13. inserir porta pelo ícone e voltar sozinho para Selecionar
      await tap('[data-testid="bs-door"]');
      await expect(page.getByTestId('bs-door')).toHaveAttribute('aria-pressed', 'true');
      const bottomMid = { x: cx, y: corners[2].y };
      expect(await tapNearUntil(bottomMid.x, bottomMid.y,
        () => page.getByRole('application').innerText().then((t) => /1 door/.test(t))),
        'porta inserida tocando a parede').toBe(true);
      await expect(page.getByTestId('bs-select')).toHaveAttribute('aria-pressed', 'true');

      // 14./15. inserir janela pelo ícone e voltar sozinho para Selecionar
      await tap('[data-testid="bs-window"]');
      await expect(page.getByTestId('bs-window')).toHaveAttribute('aria-pressed', 'true');
      // meio da 4ª parede (vertical, do canto inferior esquerdo para cima)
      const leftMid = { x: corners[3].x, y: cy + half * 0.5 };
      let windowPlaced = false;
      for (const d of [0, 10, -10, 20, -20, 30, -30]) {
        await tapAt(leftMid.x + d, leftMid.y);
        if (/1 window/.test(await page.getByRole('application').innerText())) { windowPlaced = true; break; }
        await page.waitForTimeout(420);
      }
      expect(windowPlaced, 'janela inserida tocando a parede').toBe(true);
      await expect(page.getByTestId('bs-select')).toHaveAttribute('aria-pressed', 'true');

      // 16. alternar para 3D pela barra
      await tap('[data-testid="bs-view"]');
      const viewer = page.getByRole('region', { name: '3D floor plan viewer' });
      await expect(viewer.locator('canvas').first()).toBeVisible();
      await page.waitForTimeout(1200);

      // 17. navegar no 3D por toque/arraste
      const vbox = (await viewer.locator('canvas').first().boundingBox())!;
      const from = { x: vbox.x + vbox.width / 2, y: vbox.y + vbox.height / 2 };
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(from.x - 140, from.y - 80, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(400);
      await expect(viewer.locator('canvas').first()).toBeVisible();

      // 18. voltar ao 2D
      await tap('[data-testid="bs-view"]');
      await expect(page.getByRole('application').locator('canvas').first()).toBeVisible();

      // 19. salvar
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await page.waitForTimeout(600);

      // 20. reabrir e conferir geometria + porta + janela + status
      await page.reload();
      await expect(page.getByRole('application')).toContainText('4 walls', { timeout: 15_000 });
      await expect(page.getByRole('application')).toContainText('1 door');
      await expect(page.getByRole('application')).toContainText('1 window');
      const reopened = await exportPlan(page);
      expect(reopened.floors[0].walls).toHaveLength(4);
      expect(reopened.floors[0].doors).toHaveLength(1);
      expect(reopened.floors[0].windows).toHaveLength(1);
      expect(reopened.floors[0].walls.filter((w: { status?: string }) => w.status === 'DEMOLIR')).toHaveLength(1);
      expect(reopened.floors[0].walls.filter((w: { status?: string }) => w.status === 'CONSTRUIR')).toHaveLength(3);
      const keptLength = reopened.floors[0].walls.some(
        (w: { start: { x: number; y: number }; end: { x: number; y: number } }) =>
          Math.abs(Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y) - 300) < 1,
      );
      expect(keptLength, 'o comprimento editado sobreviveu ao save/reload').toBe(true);

      expect(errors).toEqual([]);
    });
  });
}
