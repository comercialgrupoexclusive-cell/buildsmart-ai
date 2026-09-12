import { test, expect } from '@playwright/test';

test('axonometra loads, renders the welcome modal, and mounts a canvas', async ({
  page
}) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto('/');

  await expect(page).toHaveTitle('Axonometra');

  // The WelcomeModal opens with three actions: Nova planta / Carregar do
  // disco / Carregar do salvamento local. The "Bem-vindo ao Axonometra"
  // string itself shows in a notification *after* the modal is dismissed, so
  // we anchor on a stable modal-visible button instead.
  await expect(page.getByRole('button', { name: /nova planta/i })).toBeVisible({
    timeout: 5000
  });

  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 5000 });

  expect(
    consoleErrors,
    `unexpected console errors: ${consoleErrors.join('\n')}`
  ).toEqual([]);
});
