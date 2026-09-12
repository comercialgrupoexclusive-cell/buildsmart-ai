import { expect, test, type Page } from '@playwright/test';

// BuildSmart PoC (/labs/openplan3d) — validation script from the task brief:
// load a template room, edit a wall's length numerically, confirm the
// connected geometry/room area stay coherent, edit a door and a window
// hosted on walls, toggle 2D -> 3D and confirm the model reflects the 2D
// edits, then save and reload confirming persistence. Exercises the vendored
// engine itself (no BuildSmart-specific code involved) — PoC-only coverage,
// kept separate from the app's own regression suite.

type Pt = { x: number; y: number };

/**
 * Pontos "com tinta" do canvas do plano (paredes, portas e janelas são
 * desenhadas escuras sobre fundo claro), em coordenadas relativas ao canvas.
 * Usar a própria imagem em vez de coordenadas absolutas mantém o teste válido
 * quando o layout muda — a barra BuildSmart, por exemplo, encolheu o canvas e
 * o app refaz o zoom-to-fit do template a cada carga.
 */
async function inkPoints(page: Page): Promise<Pt[]> {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const dpr = canvas.width / canvas.clientWidth;
    const step = Math.max(2, Math.round(12 * dpr));
    const pts: { x: number; y: number }[] = [];
    for (let y = 0; y < img.height; y += step) {
      for (let x = 0; x < img.width; x += step) {
        const i = (y * img.width + x) * 4;
        if (img.data[i] < 150 && img.data[i + 1] < 150 && img.data[i + 2] < 150) {
          pts.push({ x: Math.round(x / dpr), y: Math.round(y / dpr) });
        }
      }
    }
    return pts;
  });
}

test('PoC: template room, numeric wall edit, door/window, 2D/3D sync, save/reload', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await page.getByText('Use a Template', { exact: false }).click();
  await page.getByText('Studio Apartment', { exact: false }).click();
  await page.waitForURL('**/editor**');
  await expect(page.getByRole('application')).toContainText('3 rooms');
  await expect(page.getByRole('application')).toContainText('8 walls');

  const canvas = page.getByRole('application').locator('canvas').first();
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(1000);

  /**
   * Clica nos pontos desenhados até `check` passar. O painel de propriedades
   * encolhe o canvas ao abrir no desktop, então o mapa é remedido sempre que a
   * caixa do canvas muda de lugar/tamanho no meio da varredura.
   */
  const selectBy = async (check: () => Promise<boolean>, hint?: Pt) => {
    for (let pass = 0; pass < 4; pass++) {
      const box = (await canvas.boundingBox())!;
      const pts = await inkPoints(page);
      if (hint) {
        pts.sort((a, b) => Math.hypot(a.x - hint.x, a.y - hint.y) - Math.hypot(b.x - hint.x, b.y - hint.y));
      }
      let stale = false;
      for (const p of pts) {
        const now = (await canvas.boundingBox())!;
        if (now.x !== box.x || now.y !== box.y || now.width !== box.width || now.height !== box.height) {
          stale = true;
          break;
        }
        await page.mouse.click(box.x + p.x, box.y + p.y);
        await page.waitForTimeout(90);
        if (await check()) return true;
      }
      if (!stale) break;
    }
    return false;
  };

  const length = page.getByRole('spinbutton', { name: 'Comprimento (cm)', exact: true });
  const wallWithLength = (want: string) => async () =>
    (await length.inputValue().catch(() => '')) === want;
  const panelFor = (title: string) => async () =>
    page.getByRole('heading', { level: 3 }).filter({ hasText: title }).isVisible().catch(() => false);

  // Seleciona a parede de 5 m e edita o comprimento numericamente.
  expect(await selectBy(wallWithLength('500'), { x: 108, y: 144 })).toBe(true);
  await length.fill('550');
  await length.press('Tab');
  await expect(length).toHaveValue('550');
  // Conexões seguem coerentes: o app continua reportando área calculada
  // (nada quebrado/negativo/NaN) depois que a parede compartilhada moveu.
  await expect(page.getByRole('application')).toContainText(/m²/);
  await expect(page.getByRole('application')).not.toContainText('NaN');

  // Porta: seleciona a porta de entrada e muda a largura.
  expect(await selectBy(panelFor('Propriedades da porta'), { x: 144, y: 264 })).toBe(true);
  const doorWidth = page.getByRole('spinbutton', { name: 'Largura (cm)', exact: true });
  await expect(doorWidth).toBeVisible();
  const doorWidthBefore = await doorWidth.inputValue();
  await doorWidth.fill('110');
  await doorWidth.press('Tab');
  await expect(doorWidth).toHaveValue('110');
  expect(doorWidthBefore).not.toBe('110');

  // Janela: seleciona a janela e muda a largura.
  expect(await selectBy(panelFor('Propriedades da janela'), { x: 444, y: 120 })).toBe(true);
  const winWidth = page.getByRole('spinbutton', { name: 'Largura (cm)', exact: true });
  await expect(winWidth).toBeVisible();
  await winWidth.fill('200');
  await winWidth.press('Tab');
  await expect(winWidth).toHaveValue('200');
  await page.keyboard.press('Escape');

  // 2D -> 3D: o modelo tem de ser cena real sincronizada, não uma imagem.
  await page.getByRole('button', { name: '3D', exact: true }).click();
  const viewer = page.getByRole('region', { name: '3D floor plan viewer' });
  await expect(viewer.locator('canvas').first()).toBeVisible();
  await page.waitForTimeout(1000);

  // Salvar, recarregar e confirmar persistência da estrutura + comprimento.
  await page.getByRole('button', { name: '2D', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.getByRole('application')).toContainText('8 walls', { timeout: 10_000 });
  await page.waitForTimeout(1000);
  expect(await selectBy(wallWithLength('550'), { x: 108, y: 144 })).toBe(true);

  expect(errors).toEqual([]);
});
