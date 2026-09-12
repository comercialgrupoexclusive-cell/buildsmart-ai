import { test, expect, Page } from '@playwright/test';

// BuildSmart usabilidade mobile — cenário de teste obrigatório da rodada:
// abrir a Planta Baixa, desenhar uma sala, concluir o desenho, selecionar
// uma parede, editar a cota, inserir porta e janela, editar suas
// propriedades (largura, sentido), dar zoom out até caber tudo, salvar e
// reabrir confirmando persistência. Cobre, na ordem, os 15 passos do script
// de validação da rodada de usabilidade do editor 2D.
//
// __axo (dev-only handle) é usado para configurar a ferramenta ativa e ler
// o estado do modelo — os mesmos atalhos já usados em place-wall.spec.ts.
// As interações do usuário em si (clique na parede, no botão Concluir, nos
// campos do painel de propriedades) passam pela UI real, em PT-BR.
//
// Nota: cada page.evaluate() abaixo referencia `window.__axo` diretamente,
// nunca uma função auxiliar deste arquivo — o callback é serializado e
// roda no contexto do browser, que não enxerga closures do lado Node.

type Axo = {
  getMain: () => {
    scale: { x: number };
    moveCenter: (x: number, y: number) => void;
    setZoom: (scale: number, center?: boolean) => void;
  };
  getPlan: () => {
    getWallNodeSeq: () => {
      getWalls: () => Array<{
        leftNode: { getId(): number; x: number; y: number };
        rightNode: { getId(): number; x: number; y: number };
        length: number;
        toGlobal: (p: { x: number; y: number }) => { x: number; y: number };
        thickness: number;
      }>;
      getWallNodes: () => Map<
        number,
        { x: number; y: number; getGlobalPosition(): { x: number; y: number } }
      >;
    };
    getFurniture: () => Map<
      number,
      {
        getId(): number;
        width: number;
        resourcePath: string;
        getBounds: () => {
          x: number;
          y: number;
          width: number;
          height: number;
        };
      }
    >;
  };
  getStore: () => {
    activeTool: number;
    wallChainActive: boolean;
    setTool: (n: number) => void;
  };
};

async function dismissWelcome(page: Page) {
  await page.getByRole('button', { name: /nova planta/i }).click();
  await expect(page.getByRole('button', { name: /nova planta/i })).toHaveCount(
    0,
    { timeout: 3000 }
  );
}

async function waitForEditorReady(page: Page) {
  await page.waitForFunction(
    () =>
      !!(
        window as unknown as {
          __axo?: { getMain: () => { bkgPattern?: unknown } };
        }
      ).__axo?.getMain().bkgPattern,
    { timeout: 5000 }
  );
}

async function setTool(page: Page, tool: number) {
  await page.evaluate(
    (t) => (window as unknown as { __axo: Axo }).__axo.getStore().setTool(t),
    tool
  );
}

async function activeTool(page: Page) {
  return page.evaluate(
    () => (window as unknown as { __axo: Axo }).__axo.getStore().activeTool
  );
}

async function wallCount(page: Page) {
  return page.evaluate(
    () =>
      (window as unknown as { __axo: Axo }).__axo
        .getPlan()
        .getWallNodeSeq()
        .getWalls().length
  );
}

async function furnitureCount(page: Page) {
  return page.evaluate(
    () =>
      (window as unknown as { __axo: Axo }).__axo.getPlan().getFurniture().size
  );
}

// Screen-space point on the Nth wall (0-indexed, insertion order), at a
// FRACTION of its current length (not a fixed px offset) so it always lands
// well clear of the length label, which floats at the wall's exact
// midpoint (local x = length / 2) regardless of how long the wall is —
// this matters here because editing one wall's length moves a shared node,
// which can reshape (even skew) a connected wall the test touches later.
async function wallPointAtFraction(
  page: Page,
  wallIndex: number,
  fraction: number
) {
  return page.evaluate(
    ({ wallIndex, fraction }) => {
      const wall = (window as unknown as { __axo: Axo }).__axo
        .getPlan()
        .getWallNodeSeq()
        .getWalls()[wallIndex];
      return wall.toGlobal({
        x: wall.length * fraction,
        y: wall.thickness / 2
      });
    },
    { wallIndex, fraction }
  );
}

test.describe('mandatory usability validation script (Planta Baixa 2D editor)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // 1) Abrir Planta Baixa.
    await expect(
      page.getByRole('button', { name: /nova planta/i })
    ).toBeVisible({ timeout: 5000 });
    await dismissWelcome(page);
    await expect(page.locator('canvas').first()).toBeVisible();
    if (
      !(await page.evaluate(
        () =>
          typeof (window as unknown as { __axo?: unknown }).__axo !==
          'undefined'
      ))
    ) {
      test.skip(true, 'window.__axo is DEV-only — run against `npm run dev`');
    }
    await waitForEditorReady(page);
  });

  test('full 15-step round trip: draw, conclude, edit cota, door, window, zoom, save, reopen', async ({
    page
  }) => {
    // Editor abre em Selecionar (Tool.Edit=1) por padrão.
    expect(await activeTool(page)).toBe(1);

    // 2) Desenhar uma sala (3 lados de um retângulo — o objetivo aqui é
    // exercitar o encadeamento + o botão Concluir explícito, não a
    // geometria perfeita de uma sala fechada).
    await setTool(page, 0); // Tool.WallAdd
    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas has no bounding box');
    const ox = box.x + 150;
    const oy = box.y + 150;
    await page.mouse.click(ox, oy);
    await page.mouse.click(ox + 400, oy);
    await page.mouse.click(ox + 400, oy + 300);
    await page.mouse.click(ox, oy + 300);

    // A barra Concluir/Cancelar deve estar visível enquanto a cadeia está
    // ativa.
    await expect(page.getByRole('button', { name: /concluir/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /cancelar/i })).toBeVisible();

    // 3) Concluir o desenho.
    await page.getByRole('button', { name: /concluir/i }).click();

    expect(await activeTool(page)).toBe(1); // volta pra Selecionar
    expect(await wallCount(page)).toBe(3);
    await expect(page.getByRole('button', { name: /concluir/i })).toHaveCount(
      0
    );

    // Tocar no canvas vazio agora (Tool.Edit) não cria parede nenhuma.
    await page.mouse.click(box.x + box.width - 300, box.y + box.height - 300);
    expect(await wallCount(page)).toBe(3);

    // 4) Selecionar uma parede (a primeira, horizontal, no topo).
    const wallPoint = await wallPointAtFraction(page, 0, 0.15);
    await page.mouse.click(wallPoint.x, wallPoint.y);
    await expect(page.getByLabel('Comprimento (m)')).toBeVisible();

    const originalLength = await page.evaluate(
      () =>
        (window as unknown as { __axo: Axo }).__axo
          .getPlan()
          .getWallNodeSeq()
          .getWalls()[0].length
    );
    expect(originalLength).toBeCloseTo(400, -2); // tolerância pro snap-to-grid

    // 5) Mudar a cota (4.00m -> 5.00m, mesma mecânica do exemplo 2.40->3.00
    // do usuário: mantém leftNode fixo, move rightNode).
    const lengthInput = page.getByLabel('Comprimento (m)');
    await lengthInput.fill('5');
    await lengthInput.blur();

    // 6) Confirmar que a geometria foi atualizada.
    const afterEdit = await page.evaluate(() => {
      const wall = (window as unknown as { __axo: Axo }).__axo
        .getPlan()
        .getWallNodeSeq()
        .getWalls()[0];
      return { length: wall.length };
    });
    expect(afterEdit.length).toBeCloseTo(500, -2);

    // Deselect before moving on.
    await page.mouse.click(box.x + box.width - 300, box.y + box.height - 300);

    // 7) Inserir uma porta na parede de baixo (índice 2 — não compartilha
    // nó com a parede do topo cuja cota acabamos de editar, então sua
    // geometria não muda por efeito colateral do passo anterior).
    await setTool(page, 5); // Tool.FurnitureAddDoor
    const doorPoint = await wallPointAtFraction(page, 2, 0.25);
    await page.mouse.click(doorPoint.x, doorPoint.y);
    await page.waitForTimeout(200);

    expect(await activeTool(page)).toBe(1); // volta pra Selecionar sozinho
    expect(await furnitureCount(page)).toBe(1);

    // 8) Selecionar a porta.
    const doorGlobalPos = await page.evaluate(() => {
      const door = [
        ...(window as unknown as { __axo: Axo }).__axo
          .getPlan()
          .getFurniture()
          .values()
      ][0];
      const b = door.getBounds();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });
    await page.mouse.click(doorGlobalPos.x, doorGlobalPos.y);
    await expect(page.getByLabel('Largura (m)')).toBeVisible();

    // 9) Mudar a largura da porta.
    const doorWidthInput = page.getByLabel('Largura (m)');
    await doorWidthInput.fill('1.1');
    await doorWidthInput.blur();
    const doorWidthAfterEdit = await page.evaluate(
      () =>
        [
          ...(window as unknown as { __axo: Axo }).__axo
            .getPlan()
            .getFurniture()
            .values()
        ][0].width
    );
    expect(doorWidthAfterEdit).toBeCloseTo(110, 0);

    // 10) Mudar o sentido da porta via botão Virar — sem depender de
    // clique com o botão direito.
    await page.getByRole('button', { name: /virar/i }).click();

    // Deselect before moving on.
    await page.mouse.click(box.x + box.width - 300, box.y + box.height - 300);

    // 11) Inserir uma janela na parede do lado direito (índice 1) — essa é
    // a parede que ficou diagonal como efeito colateral de mover o nó
    // compartilhado no passo 5/6; inserir aqui também comprova que a
    // ferramenta funciona igual numa parede não-ortogonal.
    await setTool(page, 4); // Tool.FurnitureAddWindow
    // Bem afastado do meio (0.5) — a parede 1 ficou curta depois de virar
    // diagonal (efeito colateral do passo 5/6), então até uma janela
    // padrão pode encostar na área de toque da cota se inserida perto do
    // centro.
    const windowPoint = await wallPointAtFraction(page, 1, 0.1);
    await page.mouse.click(windowPoint.x, windowPoint.y);
    await page.waitForTimeout(200);

    expect(await activeTool(page)).toBe(1);
    expect(await furnitureCount(page)).toBe(2);

    // 12) Mudar a largura da janela.
    const windowFurniture = await page.evaluate(() => {
      const list = [
        ...(window as unknown as { __axo: Axo }).__axo
          .getPlan()
          .getFurniture()
          .values()
      ];
      const win = list.find((f) => f.resourcePath === 'window')!;
      const b = win.getBounds();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });
    await page.mouse.click(windowFurniture.x, windowFurniture.y);
    await expect(page.getByLabel('Largura (m)')).toBeVisible();
    const windowWidthInput = page.getByLabel('Largura (m)');
    await windowWidthInput.fill('1.4');
    await windowWidthInput.blur();

    await page.mouse.click(box.x + box.width - 300, box.y + box.height - 300);

    // 13) Zoom out até caber tudo na tela.
    await page.evaluate(() => {
      const axo = (window as unknown as { __axo: Axo }).__axo;
      const main = axo.getMain();
      const nodes = [...axo.getPlan().getWallNodeSeq().getWallNodes().values()];
      const xs = nodes.map((n) => n.x);
      const ys = nodes.map((n) => n.y);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      main.setZoom(0.0001, true); // pede o menor zoom possível
      main.moveCenter(cx, cy);
    });
    const scaleAfterZoomOut = await page.evaluate(
      () => (window as unknown as { __axo: Axo }).__axo.getMain().scale.x
    );
    expect(scaleAfterZoomOut).toBeCloseTo(0.1, 2); // minScale configurado

    const fitsOnScreen = await page.evaluate(() => {
      const nodes = [
        ...(window as unknown as { __axo: Axo }).__axo
          .getPlan()
          .getWallNodeSeq()
          .getWallNodes()
          .values()
      ];
      const pts = nodes.map((n) => n.getGlobalPosition());
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      return {
        w: Math.max(...xs) - Math.min(...xs),
        h: Math.max(...ys) - Math.min(...ys),
        screenW: window.innerWidth,
        screenH: window.innerHeight
      };
    });
    expect(fitsOnScreen.w).toBeLessThanOrEqual(fitsOnScreen.screenW);
    expect(fitsOnScreen.h).toBeLessThanOrEqual(fitsOnScreen.screenH);

    // 14) Salvar.
    await page.keyboard.press('Control+s');
    await expect(page.locator('text=Salvo no armazenamento local')).toBeVisible(
      { timeout: 3000 }
    );

    const beforeReload = await page.evaluate(() => {
      const axo = (window as unknown as { __axo: Axo }).__axo;
      const wall = axo.getPlan().getWallNodeSeq().getWalls()[0];
      const furniture = [...axo.getPlan().getFurniture().values()];
      const door = furniture.find((f) => f.resourcePath === 'door')!;
      const win = furniture.find((f) => f.resourcePath === 'window')!;
      return {
        wallLength: wall.length,
        doorId: door.getId(),
        doorWidth: door.width,
        windowWidth: win.width,
        wallCount: axo.getPlan().getWallNodeSeq().getWalls().length
      };
    });

    // 15) Reabrir e confirmar persistência.
    await page.reload();
    await page
      .getByRole('button', { name: /carregar do salvamento local/i })
      .click();
    await expect(page.locator('canvas').first()).toBeVisible();
    await page.waitForFunction(
      (expectedWallCount: number) =>
        (window as unknown as { __axo?: Axo }).__axo
          ?.getPlan()
          .getWallNodeSeq()
          .getWalls().length === expectedWallCount,
      beforeReload.wallCount,
      { timeout: 3000 }
    );

    const afterReload = await page.evaluate((doorId: number) => {
      const axo = (window as unknown as { __axo: Axo }).__axo;
      const wall = axo.getPlan().getWallNodeSeq().getWalls()[0];
      const furniture = [...axo.getPlan().getFurniture().values()];
      const door = furniture.find((f) => f.getId() === doorId)!;
      const win = furniture.find((f) => f.resourcePath === 'window')!;
      return {
        wallLength: wall.length,
        doorWidth: door.width,
        windowWidth: win.width
      };
    }, beforeReload.doorId);

    expect(afterReload.wallLength).toBeCloseTo(beforeReload.wallLength, 0);
    expect(afterReload.doorWidth).toBeCloseTo(beforeReload.doorWidth, 0);
    expect(afterReload.windowWidth).toBeCloseTo(beforeReload.windowWidth, 0);
  });
});
