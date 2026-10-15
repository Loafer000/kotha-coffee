import { test } from '@playwright/test';
import { assertNoHorizontalOverflow } from '../../helpers/overflow-checker.js';
import { unlockReceptionWithPin } from '../../helpers/auth-helper.js';

test.describe('Tier 2: Boundary & Edge — 375px Viewport Horizontal Overflow (AC 11, R7)', () => {

  test.beforeEach(async ({ page }) => {
    // Lock viewport to exact 375px mobile phone width (iPhone SE standard)
    await page.setViewportSize({ width: 375, height: 667 });
  });

  test('TC-OVERFLOW-01: Landing portal has zero horizontal overflow at 375px', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle').catch(() => {});
    await assertNoHorizontalOverflow(page, 'Landing Portal');
  });

  test('TC-OVERFLOW-02: Reception Pending Orders queue has zero horizontal overflow at 375px', async ({ page }) => {
    await page.goto('/reception');
    await unlockReceptionWithPin(page, '1234');
    const pendingTab = page.locator('button:has-text("Pending"), [data-testid="tab-pending"]').first();
    if (await pendingTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await pendingTab.click();
    }
    await assertNoHorizontalOverflow(page, 'Reception Pending Orders');
  });

  test('TC-OVERFLOW-03: Reception Settled Orders queue has zero horizontal overflow at 375px', async ({ page }) => {
    await page.goto('/reception');
    await unlockReceptionWithPin(page, '1234');
    const settledTab = page.locator('button:has-text("Settled"), [data-testid="tab-settled"]').first();
    if (await settledTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await settledTab.click();
    }
    await assertNoHorizontalOverflow(page, 'Reception Settled Orders');
  });

  test('TC-OVERFLOW-04: Reception Analytics dashboard has zero horizontal overflow at 375px', async ({ page }) => {
    await page.goto('/reception');
    await unlockReceptionWithPin(page, '1234');
    const analyticsTab = page.locator('button:has-text("Analytics"), [data-testid="tab-analytics"]').first();
    if (await analyticsTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await analyticsTab.click();
    }
    await assertNoHorizontalOverflow(page, 'Reception Analytics');
  });

  test('TC-OVERFLOW-05: Reception Menu Management has zero horizontal overflow at 375px', async ({ page }) => {
    await page.goto('/reception');
    await unlockReceptionWithPin(page, '1234');
    const menuTab = page.locator('button:has-text("Menu"), [data-testid="tab-menu"]').first();
    if (await menuTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await menuTab.click();
    }
    await assertNoHorizontalOverflow(page, 'Reception Menu Management');
  });

  test('TC-OVERFLOW-06: Kitchen Display view has zero horizontal overflow at 375px', async ({ page }) => {
    await page.goto('/kitchen');
    await page.waitForLoadState('networkidle').catch(() => {});
    await assertNoHorizontalOverflow(page, 'Kitchen Display');
  });

});
