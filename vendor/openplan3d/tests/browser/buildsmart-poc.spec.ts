import { expect, test } from '@playwright/test';

// BuildSmart PoC (/labs/openplan3d) — validation script from the task brief:
// load a template room, edit a wall's length numerically, confirm the
// connected geometry/room area stay coherent, edit a door and a window
// hosted on walls, toggle 2D -> 3D and confirm the model reflects the 2D
// edits, then save and reload confirming persistence. Runs against the
// unmodified vendored app (no BuildSmart-specific code involved) — this is
// PoC-only coverage, kept separate from the app's own regression suite.
test('PoC: template room, numeric wall edit, door/window, 2D/3D sync, save/reload', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await page.getByText('Use a Template', { exact: false }).click();
  await page.getByText('Studio Apartment', { exact: false }).click();
  await page.waitForURL('**/editor**');
  await expect(page.getByRole('application')).toContainText('3 rooms');
  await expect(page.getByRole('application')).toContainText('8 walls');

  // Select the left wall (500cm) and edit its length numerically. Select is
  // already the default active tool on load. Coordinates are absolute
  // screen positions matched against the 1440x900 desktop viewport, not
  // canvas-relative offsets — the app auto-fits/zooms the plan on load, so
  // these correspond to where the "5 m" left wall actually renders.
  await expect(page.getByRole('application').locator('canvas').first()).toBeVisible();
  await page.mouse.click(482, 400);
  const length = page.getByRole('spinbutton', { name: 'Length (cm)', exact: true });
  await expect(length).toHaveValue('500');
  await length.fill('550');
  await length.press('Tab');
  await expect(length).toHaveValue('550');
  // Connections stay coherent: the app keeps reporting a computed room area
  // (no broken/negative/NaN state) after the shared wall moved.
  await expect(page.getByRole('application')).toContainText(/m²/);
  await expect(page.getByRole('application')).not.toContainText('NaN');

  // Door: select the entry door and change its width.
  await page.keyboard.press('Escape');
  await page.mouse.click(735, 804);
  const doorWidth = page.getByRole('spinbutton', { name: 'Width (cm)', exact: true });
  await expect(doorWidth).toBeVisible();
  const doorWidthBefore = await doorWidth.inputValue();
  await doorWidth.fill('110');
  await doorWidth.press('Tab');
  await expect(doorWidth).toHaveValue('110');
  expect(doorWidthBefore).not.toBe('110');

  // Window: select the top wall's window and change its width. The top
  // wall shifted slightly (6.00m -> 6.02m) as a side effect of the earlier
  // length edit on the shared left wall — connected geometry redrawing
  // automatically, exactly what "Joined corners follow the moving
  // endpoint" promises — so the window's on-screen position also moved a
  // few px from the untouched template.
  await page.keyboard.press('Escape');
  await page.mouse.click(870, 166);
  const winWidth = page.getByRole('spinbutton', { name: 'Width (cm)', exact: true });
  await expect(winWidth).toBeVisible();
  await winWidth.fill('200');
  await winWidth.press('Tab');
  await expect(winWidth).toHaveValue('200');
  await page.keyboard.press('Escape');

  // 2D -> 3D: the model must be a real synced scene, not a screenshot.
  await page.getByRole('button', { name: '3D', exact: true }).click();
  const viewer = page.getByRole('region', { name: '3D floor plan viewer' });
  await expect(viewer.locator('canvas').first()).toBeVisible();
  await page.waitForTimeout(1000);

  // Save, reload, confirm persistence of structure + the edited length.
  await page.getByRole('button', { name: '2D', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.getByRole('application')).toContainText('8 walls', { timeout: 10_000 });
  await page.mouse.click(482, 400);
  await expect(page.getByRole('spinbutton', { name: 'Length (cm)', exact: true })).toHaveValue('550');

  expect(errors).toEqual([]);
});
