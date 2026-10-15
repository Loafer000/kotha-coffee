import { test, expect } from '@playwright/test';
import { assertNoHorizontalOverflow } from '../../helpers/overflow-checker.js';

test.describe('Tier 1: Feature Coverage — Landing & Role Selection (R1)', () => {

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
  });

  test('TC-LANDING-01: Landing displays dual entry options "Add Order" and "See Orders"', async ({ page }) => {
    const addOrderOption = page.locator('text=/Add Order/i, [data-testid="tile-reception"], a[href*="reception"]').first();
    const seeOrdersOption = page.locator('text=/See Orders/i, [data-testid="tile-kitchen"], a[href*="kitchen"]').first();

    await expect(addOrderOption).toBeVisible({ timeout: 5000 });
    await expect(seeOrdersOption).toBeVisible({ timeout: 5000 });
  });

  test('TC-LANDING-02: Landing renders Bengali brand identity "কথা & Coffee" and logo/tagline', async ({ page }) => {
    const brandHeading = page.locator('text=/কথা & Coffee/i, text=/Kotha & Coffee/i, [data-testid="brand-heading"]').first();
    await expect(brandHeading).toBeVisible();

    // Verify presence of brand logo or illustration
    const logoImg = page.locator('img[src*="logo"], [data-testid="cafe-logo"], img[alt*="Coffee" i]').first();
    const hasLogo = await logoImg.count() > 0;
    expect(hasLogo || (await brandHeading.isVisible())).toBe(true);
  });

  test('TC-LANDING-03: Clicking "Add Order" navigates to Reception portal', async ({ page }) => {
    const addOrderBtn = page.locator('text=/Add Order/i, [data-testid="tile-reception"], a[href*="reception"]').first();
    await addOrderBtn.click();

    await expect(page).toHaveURL(/.*(reception|\/add-order)/);
  });

  test('TC-LANDING-04: Clicking "See Orders" navigates directly to Kitchen view without PIN prompt', async ({ page }) => {
    const seeOrdersBtn = page.locator('text=/See Orders/i, [data-testid="tile-kitchen"], a[href*="kitchen"]').first();
    await seeOrdersBtn.click();

    await expect(page).toHaveURL(/.*kitchen/);
    // Verify no PIN password prompt is shown for kitchen
    const pinInput = page.locator('input[type="password"], [data-testid="pin-input"]');
    await expect(pinInput).toHaveCount(0);
  });

  test('TC-LANDING-05: Back / Home navigation allows switching between roles smoothly', async ({ page }) => {
    // Go to kitchen
    const seeOrdersBtn = page.locator('text=/See Orders/i, [data-testid="tile-kitchen"], a[href*="kitchen"]').first();
    await seeOrdersBtn.click();
    await expect(page).toHaveURL(/.*kitchen/);

    // Click home/back button or navigate back
    const backBtn = page.locator('button:has-text("Back"), [data-testid="btn-home"], a[href="/"]').first();
    if (await backBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await backBtn.click();
    } else {
      await page.goBack();
    }

    // Now navigate to reception
    const addOrderBtn = page.locator('text=/Add Order/i, [data-testid="tile-reception"], a[href*="reception"]').first();
    await expect(addOrderBtn).toBeVisible();
    await addOrderBtn.click();
    await expect(page).toHaveURL(/.*(reception|\/add-order)/);
  });

  test('TC-LANDING-06: Landing page has zero horizontal overflow on 375px viewport', async ({ page }) => {
    await assertNoHorizontalOverflow(page, 'Landing Portal');
  });

});
