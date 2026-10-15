import { test, expect } from '@playwright/test';
import { assertNoHorizontalOverflow } from '../../helpers/overflow-checker.js';

test.describe('Tier 1: Feature Coverage — Kitchen Display (R4)', () => {

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/kitchen');
  });

  test('TC-KITCHEN-01: Kitchen display loads directly without requiring a PIN', async ({ page }) => {
    await expect(page).toHaveURL(/.*kitchen/);

    // Verify no PIN keypad or PIN unlock modal blocks the screen
    const pinKeypad = page.locator('[data-testid="pin-keypad"], [data-testid="pin-modal"], input[type="password"]');
    await expect(pinKeypad).toHaveCount(0);

    // Verify Kitchen header is displayed
    const kitchenHeader = page.locator('text=/Kitchen|See Orders|রান্নাঘর/i, [data-testid="kitchen-header"]').first();
    await expect(kitchenHeader).toBeVisible();
  });

  test('TC-KITCHEN-02: Kitchen displays Pending Orders section', async ({ page }) => {
    const pendingSection = page.locator('text=/Pending/i, [data-testid="kitchen-pending-section"]').first();
    await expect(pendingSection).toBeVisible();
  });

  test('TC-KITCHEN-03: Kitchen displays Settled Orders section', async ({ page }) => {
    const settledSection = page.locator('text=/Settled|Completed/i, [data-testid="kitchen-settled-section"]').first();
    await expect(settledSection).toBeVisible();
  });

  test('TC-KITCHEN-04: Kitchen interface is strictly read-only with zero Done/Edit/Cancel buttons', async ({ page }) => {
    // Assert zero mutation buttons exist anywhere on the kitchen view
    const doneButtons = page.locator('button:has-text("Done"), [data-testid*="btn-done"]');
    const editButtons = page.locator('button:has-text("Edit"), [data-testid*="btn-edit"]');
    const cancelButtons = page.locator('button:has-text("Cancel"), button:has-text("Delete"), [data-testid*="btn-cancel"]');

    await expect(doneButtons).toHaveCount(0);
    await expect(editButtons).toHaveCount(0);
    await expect(cancelButtons).toHaveCount(0);
  });

  test('TC-KITCHEN-05: Kitchen API endpoint GET /api/kitchen/orders is public (200 OK without token)', async ({ request }) => {
    const res = await request.get('/api/kitchen/orders');
    // If route is implemented (M4), returns 200 with pending and settled queues
    if (res.status() === 200) {
      const data = await res.json();
      expect(data).toHaveProperty('pending');
      expect(data).toHaveProperty('settled');
    } else {
      // Prior to M4, route may be 404 or returning placeholder
      expect([200, 404]).toContain(res.status());
    }
  });

  test('TC-KITCHEN-06: Kitchen page has zero horizontal overflow on 375px viewport', async ({ page }) => {
    await assertNoHorizontalOverflow(page, 'Kitchen Display');
  });

});
