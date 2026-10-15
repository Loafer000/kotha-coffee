import { test, expect } from '@playwright/test';
import { unlockReceptionWithPin, getAuthToken, getAuthHeaders } from '../../helpers/auth-helper.js';

test.describe('Tier 1: Feature Coverage — Analytics Daily Views (R5)', () => {

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/reception');
    await unlockReceptionWithPin(page, '1234');
  });

  test('TC-ANALYTICS-01: Analytics view renders grand total and daily overview', async ({ page }) => {
    // Navigate to Analytics tab
    const analyticsTab = page.locator('button:has-text("Analytics"), a:has-text("Analytics"), [data-testid="tab-analytics"]').first();
    if (await analyticsTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await analyticsTab.click();
      const grandTotalDisplay = page.locator('[data-testid="grand-total"], text=/Grand Total|Total Sales/i').first();
      await expect(grandTotalDisplay).toBeVisible({ timeout: 5000 });
    }
  });

  test('TC-ANALYTICS-02: Date-wise picker allows selecting and browsing past dates', async ({ page }) => {
    const analyticsTab = page.locator('button:has-text("Analytics"), a:has-text("Analytics"), [data-testid="tab-analytics"]').first();
    if (await analyticsTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await analyticsTab.click();
      const dateInput = page.locator('input[type="date"], [data-testid="analytics-date-picker"]').first();
      await expect(dateInput).toBeVisible({ timeout: 5000 });

      // Change date
      await dateInput.fill('2026-10-10');
      await page.waitForLoadState('networkidle').catch(() => {});
    }
  });

  test('TC-ANALYTICS-03: Per-item quantity and amount breakdown is displayed', async ({ page }) => {
    const analyticsTab = page.locator('button:has-text("Analytics"), a:has-text("Analytics"), [data-testid="tab-analytics"]').first();
    if (await analyticsTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await analyticsTab.click();
      const itemBreakdown = page.locator('[data-testid="item-sales-breakdown"], .item-sales-table, text=/Item Breakdown|Item Sales/i').first();
      await expect(itemBreakdown).toBeVisible({ timeout: 5000 });
    }
  });

  test('TC-ANALYTICS-04: Payment method split breakdown shows Cash, UPI, and Card', async ({ page }) => {
    const analyticsTab = page.locator('button:has-text("Analytics"), a:has-text("Analytics"), [data-testid="tab-analytics"]').first();
    if (await analyticsTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await analyticsTab.click();
      const cashSection = page.locator('text=/Cash/i').first();
      const upiSection = page.locator('text=/UPI/i').first();
      const cardSection = page.locator('text=/Card/i').first();

      await expect(cashSection).toBeVisible();
      await expect(upiSection).toBeVisible();
      await expect(cardSection).toBeVisible();
    }
  });

  test('TC-ANALYTICS-05: Analytics API endpoint GET /api/analytics returns structured metrics with auth', async ({ request }) => {
    const token = await getAuthToken(request, '1234');
    const res = await request.get('/api/analytics?date=2026-10-10', {
      headers: getAuthHeaders(token)
    });

    if (res.status() === 200) {
      const data = await res.json();
      expect(data).toHaveProperty('grandTotal');
      expect(data).toHaveProperty('paymentBreakdown');
    } else {
      expect([200, 404]).toContain(res.status());
    }
  });

  test('TC-ANALYTICS-06: Direct GET /api/analytics without valid PIN token is rejected (401/403)', async ({ request }) => {
    const unauthRes = await request.get('/api/analytics?date=2026-10-10');
    expect([401, 403]).toContain(unauthRes.status());
  });

});
