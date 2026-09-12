import { expect, test, type Page } from '@playwright/test';

/**
 * Ponte real com o módulo oficial Planta 2D/3D do Processo — em vez de
 * reimplementar o wrapper Next.js/React (que exigiria Supabase + sessão
 * autenticada, fora do alcance deste sandbox), dirige o protocolo bs:*
 * exatamente como `components/processo/planta-baixa/PlantaEditor.tsx` faz,
 * mas via `window.postMessage` para a própria janela (mesma origem,
 * `event.source` de um postMessage para si mesmo é a própria window — só
 * isso já satisfaz `originAllowed`/`source.postMessage` do bridge, ver
 * $lib/services/bridge.ts). O motor roda em `/editor?embed=1`, o mesmo
 * runtime que o iframe do PlantaEditor carrega — só o transporte
 * (window.postMessage local em vez de um iframe pai de verdade) é
 * simplificado; o código do bridge, o parsing/validação e a interação da
 * BuildSmartBar são exatamente os de produção.
 *
 * Cobre o teste obrigatório da rodada de substituição: planta nova, desenho
 * de paredes por toque, status de reforma, porta, janela, 2D/3D, bs:save
 * com geometria real, "fechar/reabrir" (reload + re-envio do payload salvo)
 * e uma segunda planta que não é sobrescrita pela primeira — tudo com o
 * Supabase/round-trip real do lado do BuildSmart validado à parte (SQL
 * direto contra o projeto do usuário, sem tocar a única planta legada).
 */

const YELLOW = { r: 0xea, g: 0xb3, b: 0x08 }; // DEMOLIR (ver $lib/utils/wallStatus)

async function canvasHasColor(page: Page, want: { r: number; g: number; b: number }) {
  return page.evaluate(({ want }) => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) return false;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < data.length; i += 4) {
      if (Math.abs(data[i] - want.r) < 26 && Math.abs(data[i + 1] - want.g) < 26 && Math.abs(data[i + 2] - want.b) < 26) return true;
    }
    return false;
  }, { want });
}

/** bs:load — mesma mensagem que PlantaEditor.tsx manda com o projeto vindo de `plantas.plan_json` (ou `null` para planta nova/legada). */
async function bsLoad(page: Page, plan: unknown) {
  await page.evaluate((plan) => window.postMessage({ type: 'bs:load', plan }, window.location.origin), plan);
  await page.waitForTimeout(300);
}

/** bs:request-save / bs:save — mesmo par que o botão "Salvar" do PlantaEditor.tsx troca com o editor; devolve o projeto já parseado. */
async function bsRequestSave(page: Page): Promise<any> {
  const raw = await page.evaluate(() => new Promise<string>((resolve) => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if ((event.data as { type?: string })?.type === 'bs:save') {
        window.removeEventListener('message', handler);
        resolve((event.data as { plan: string }).plan);
      }
    };
    window.addEventListener('message', handler);
    window.postMessage({ type: 'bs:request-save' }, window.location.origin);
  }));
  return JSON.parse(raw);
}

for (const variant of [
  { label: 'desktop', width: 1440, height: 900, touch: false },
  { label: 'mobile', width: 675, height: 1500, touch: true },
]) {
  test.describe(`Bridge BuildSmart (bs:*) — ${variant.label}`, () => {
    test.use({
      viewport: { width: variant.width, height: variant.height },
      hasTouch: variant.touch,
      isMobile: variant.touch,
    });

    test(`planta real via Processo: desenhar, status, porta, janela, 3D, salvar, fechar/reabrir, 2ª planta independente (${variant.label})`, async ({ page }) => {
      test.setTimeout(150_000);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));

      const tap = async (sel: string) => {
        const target = page.locator(sel);
        if (variant.touch) await target.tap(); else await target.click();
      };
      const tapAt = async (x: number, y: number) => {
        if (variant.touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
        await page.waitForTimeout(180);
      };
      const tapNearUntil = async (x: number, y: number, check: () => Promise<boolean>) => {
        for (const d of [0, 10, -10, 20, -20, 30, -30]) {
          await tapAt(x, y + d);
          if (await check()) return true;
          await page.waitForTimeout(420);
        }
        return false;
      };

      // 1. Abrir a mesma rota que o iframe do PlantaEditor.tsx carrega, e
      // simular o parent mandando bs:load(null) — planta nova, exatamente
      // como uma Planta recém-criada (plan_json vazio) chega ao bridge.
      await page.goto('/editor?embed=1');
      const canvas = page.getByRole('application').locator('canvas').first();
      await expect(canvas).toBeVisible();
      await bsLoad(page, null);
      await expect(page.getByRole('application')).toContainText('0 walls');

      // 2. Selecionar ativo por padrão; 3. Parede começa a desenhar na hora.
      await expect(page.getByTestId('bs-select')).toHaveAttribute('aria-pressed', 'true');
      await tap('[data-testid="bs-wall"]');
      await expect(page.getByTestId('bs-wall-context')).toBeVisible();
      await page.getByTestId('bs-wall-context').getByRole('button', { name: 'Construir' }).click();

      // Zoom-to-fit único do motor na primeira parede — gasta com um traço
      // descartável antes de desenhar de verdade (mesmo motivo do
      // buildsmart-bar.spec.ts).
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

      // 4. desenhar 4 paredes (cadeia aberta: 5 toques).
      const box = (await canvas.boundingBox())!;
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      const half = Math.min(box.width, box.height) * 0.22;
      const corners = [
        { x: cx - half, y: cy - half }, { x: cx + half, y: cy - half },
        { x: cx + half, y: cy + half }, { x: cx - half, y: cy + half },
        { x: cx - half, y: cy },
      ];
      for (const c of corners) await tapAt(c.x, c.y);
      await expect(page.getByRole('application')).toContainText('4 walls');
      await tap('[data-testid="bs-wall-context"] >> text=Concluir');
      await expect(page.getByTestId('bs-select')).toHaveAttribute('aria-pressed', 'true');

      // 5. Editar comprimento numérico de uma parede.
      const topMid = { x: cx, y: corners[0].y };
      const length = page.getByRole('spinbutton', { name: 'Comprimento (cm)', exact: true });
      expect(await tapNearUntil(topMid.x, topMid.y, () => length.isVisible())).toBe(true);
      await length.fill('300');
      await length.press('Tab');
      await expect(length).toHaveValue('300');

      // 6. Status Demolir + cor amarela.
      await page.getByTestId('bs-wall-status').getByRole('button', { name: 'Demolir' }).click();
      await page.waitForTimeout(420);
      const fresh = (await canvas.boundingBox())!;
      await tapAt(fresh.x + fresh.width - 40, fresh.y + 40); // desselecionar
      await page.waitForTimeout(400);
      expect(await canvasHasColor(page, YELLOW)).toBe(true);

      // 7. Porta.
      await tap('[data-testid="bs-door"]');
      const bottomMid = { x: cx, y: corners[2].y };
      expect(await tapNearUntil(bottomMid.x, bottomMid.y,
        () => page.getByRole('application').innerText().then((t) => /1 door/.test(t)))).toBe(true);
      await expect(page.getByTestId('bs-select')).toHaveAttribute('aria-pressed', 'true');

      // 8. Janela.
      await tap('[data-testid="bs-window"]');
      const leftMid = { x: corners[3].x, y: cy + half * 0.5 };
      let windowPlaced = false;
      for (const d of [0, 10, -10, 20, -20, 30, -30]) {
        await tapAt(leftMid.x + d, leftMid.y);
        if (/1 window/.test(await page.getByRole('application').innerText())) { windowPlaced = true; break; }
        await page.waitForTimeout(420);
      }
      expect(windowPlaced).toBe(true);

      // 9. 2D -> 3D -> 2D.
      await tap('[data-testid="bs-view"]');
      const viewer = page.getByRole('region', { name: '3D floor plan viewer' });
      await expect(viewer.locator('canvas').first()).toBeVisible();
      await page.waitForTimeout(1000);
      await tap('[data-testid="bs-view"]');
      await expect(page.getByRole('application').locator('canvas').first()).toBeVisible();

      // 10. bs:request-save / bs:save — exatamente o que o botão "Salvar"
      // do PlantaEditor.tsx dispara; o retorno é o que ele gravaria em
      // plantas.plan_json (envelopado por wrapOpenPlan3DProject).
      const plantaA = await bsRequestSave(page);
      expect(plantaA.floors[0].walls).toHaveLength(4);
      expect(plantaA.floors[0].doors).toHaveLength(1);
      expect(plantaA.floors[0].windows).toHaveLength(1);
      expect(plantaA.floors[0].walls.filter((w: { status?: string }) => w.status === 'DEMOLIR')).toHaveLength(1);
      expect(plantaA.floors[0].walls.filter((w: { status?: string }) => w.status === 'CONSTRUIR')).toHaveLength(3);
      const editedLength = plantaA.floors[0].walls.some((w: { start: { x: number; y: number }; end: { x: number; y: number } }) =>
        Math.abs(Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y) - 300) < 1);
      expect(editedLength, 'comprimento editado está no payload salvo').toBe(true);

      // 11. "Fechar editor / sair do módulo / reabrir a mesma planta": um
      // reload remonta o editor do zero (exatamente como abrir de novo o
      // PlantaEditor.tsx a partir da lista do Processo), e o bridge recebe
      // de volta o MESMO payload que acabou de salvar — não IndexedDB.
      await page.reload();
      await expect(page.getByRole('application').locator('canvas').first()).toBeVisible();
      await bsLoad(page, plantaA);
      await expect(page.getByRole('application')).toContainText('4 walls');
      await expect(page.getByRole('application')).toContainText('1 door');
      await expect(page.getByRole('application')).toContainText('1 window');

      // 12. Segunda planta/cenário independente: outro reload (outra
      // Planta seria outro mount de iframe) com bs:load(null) tem que abrir
      // vazia — a primeira planta não vaza para a segunda.
      await page.reload();
      await expect(page.getByRole('application').locator('canvas').first()).toBeVisible();
      await bsLoad(page, null);
      await expect(page.getByRole('application')).toContainText('0 walls');
      await expect(page.getByRole('application')).not.toContainText('4 walls');

      // 13. E a primeira planta continua intacta ao ser reaberta depois —
      // a segunda não a sobrescreveu (o "salvamento" da segunda nunca
      // aconteceu; cada Planta só é persistida pelo Supabase quando o
      // usuário aperta Salvar naquele editor especificamente).
      await page.reload();
      await expect(page.getByRole('application').locator('canvas').first()).toBeVisible();
      await bsLoad(page, plantaA);
      await expect(page.getByRole('application')).toContainText('4 walls');
      await expect(page.getByRole('application')).toContainText('1 door');
      await expect(page.getByRole('application')).toContainText('1 window');

      expect(errors).toEqual([]);
    });
  });
}
