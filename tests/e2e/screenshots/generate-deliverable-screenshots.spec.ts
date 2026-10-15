import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { getAuthToken, getAuthHeaders, seedSessionToken } from '../../helpers/auth-helper.js';

test.describe('Deliverable Mobile Screenshots Generator (375px)', () => {
  const screenshotsDir = path.resolve(process.cwd(), 'screenshots');

  test.beforeAll(() => {
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
  });

  test('Generate 7 deliverable mobile phone screenshots with real cafe data', async ({ page, request, baseURL }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 375, height: 667 });

    const serverUrl = baseURL || 'http://localhost:3001';
    const token = await getAuthToken(request, '1234', serverUrl);
    const authHeaders = getAuthHeaders(token);

    // Seed menu if needed
    const menuRes = await request.get(`${serverUrl}/api/menu`);
    const menuItems = await menuRes.json();
    expect(menuItems.length).toBeGreaterThan(0);

    const firstItem = menuItems[0];
    const secondItem = menuItems[1] || menuItems[0];

    // Seed 1 settled order and 1 pending order for rich visual data
    await request.post(`${serverUrl}/api/orders`, {
      headers: authHeaders,
      data: {
        items: [
          { menuItemId: firstItem.id, name: firstItem.name, unitPrice: firstItem.price, quantity: 2 },
          { menuItemId: secondItem.id, name: secondItem.name, unitPrice: secondItem.price, quantity: 1 }
        ],
        paymentMethod: 'UPI'
      }
    });

    const createSettledRes = await request.post(`${serverUrl}/api/orders`, {
      headers: authHeaders,
      data: {
        items: [
          { menuItemId: firstItem.id, name: firstItem.name, unitPrice: firstItem.price, quantity: 1 }
        ],
        paymentMethod: 'Cash'
      }
    });
    const settledJson = await createSettledRes.json();
    await request.post(`${serverUrl}/api/orders/${settledJson.id}/done`, {
      headers: authHeaders
    });

    // 1. Landing View
    await page.goto('/');
    await page.waitForSelector('text=কথা & Coffee');
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(screenshotsDir, '01_landing.png') });

    // 2. Reception & Create Order View (unlocked session)
    await seedSessionToken(page, token);
    await page.goto('/reception');
    await page.waitForSelector('[data-testid="tab-create-order"]');
    const addOrderTab = page.locator('[data-testid="tab-create-order"]');
    await addOrderTab.click();
    await page.waitForSelector('.menu-item-card', { timeout: 8000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(screenshotsDir, '02_create_order.png') });

    // 3. Order Confirmation Slip (#)
    // Tap the first item card's Add button to add to cart and place an order to show the Slip
    const addBtn = page.locator('.menu-item-card button:has-text("Add")').first();
    await addBtn.click();
    await page.waitForTimeout(400);
    const placeOrderBtn = page.locator('[data-testid="btn-submit-order"]');
    await placeOrderBtn.click();
    // Wait for the large slip modal
    await page.waitForSelector('[data-testid="order-confirmation-slip"]', { timeout: 10000 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(screenshotsDir, '03_order_confirmation_slip.png') });

    // Dismiss slip by clicking "Next Order"
    const nextBtn = page.locator('[data-testid="btn-next-order"]');
    if (await nextBtn.isVisible()) {
      await nextBtn.click();
      await page.waitForTimeout(500);
    }

    // 4. Reception Pending View
    const pendingTab = page.locator('[data-testid="tab-pending"]');
    await pendingTab.click();
    await page.waitForSelector('[data-testid="pending-queue"]', { timeout: 8000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(screenshotsDir, '04_reception_pending.png') });

    // 5. Reception Settled View
    const settledTab = page.locator('[data-testid="tab-settled"]');
    await settledTab.click();
    await page.waitForSelector('.order-card', { timeout: 8000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(screenshotsDir, '05_reception_settled.png') });

    // 6. Reception Analytics View
    const analyticsTab = page.locator('[data-testid="tab-analytics"]');
    await analyticsTab.click();
    await page.waitForSelector('[data-testid="kpi-grand-total"]', { timeout: 8000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(screenshotsDir, '06_reception_analytics.png') });

    // 7. Kitchen View
    await page.goto('/kitchen');
    await page.waitForSelector('text=Kitchen Order Tickets', { timeout: 8000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(screenshotsDir, '07_kitchen_view.png') });
  });
});
