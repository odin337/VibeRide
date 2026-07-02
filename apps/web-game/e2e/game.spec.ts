import { expect, test } from '@playwright/test';

/**
 * Smoke suite against the built app (vite preview, chromium only). The
 * demo track needs no audio file, so the full menu → playing → results
 * loop runs headlessly; WebAudio may stay suspended under autoplay
 * policy, which the game tolerates (it runs on its own clock).
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('menu renders with a file input and a demo button', async ({ page }) => {
  await expect(page.locator('[data-game-state="menu"]')).toBeVisible();
  await expect(page.getByLabel('Choose an audio track')).toBeAttached();
  await expect(page.getByRole('button', { name: 'Play demo track' })).toBeVisible();
});

test('demo run reaches the playing state with a canvas and HUD', async ({ page }) => {
  await page.getByRole('button', { name: 'Play demo track' }).click();
  await expect(page.locator('[data-game-state="playing"]')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-testid="stage"] canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('hud')).toBeVisible();
});

test('keyboard jump does not break the run', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => {
    pageErrors.push(error);
  });

  await page.getByRole('button', { name: 'Play demo track' }).click();
  await expect(page.locator('[data-game-state="playing"]')).toBeVisible({ timeout: 15_000 });

  await page.keyboard.press('Space');
  await page.waitForTimeout(500);
  await page.keyboard.press('Space');

  const state = await page.locator('.vr-app').getAttribute('data-game-state');
  expect(['playing', 'crashed', 'finished']).toContain(state);
  expect(pageErrors).toEqual([]);
});

test('a demo run eventually ends on the results screen', async ({ page }) => {
  test.setTimeout(90_000);
  await page.getByRole('button', { name: 'Play demo track' }).click();
  await expect(page.locator('[data-game-state="playing"]')).toBeVisible({ timeout: 15_000 });

  // The demo is ~20 s; without input the first obstacle ends the run much
  // earlier. Either way the app must land on a results state.
  await expect(
    page.locator('[data-game-state="crashed"], [data-game-state="finished"]'),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('final-score')).toBeVisible();
});
