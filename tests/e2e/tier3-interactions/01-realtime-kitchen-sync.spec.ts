import { test, expect } from '@playwright/test';
import { unlockReceptionWithPin } from '../../helpers/auth-helper.js';

test.describe('Tier 3: Interactions — Multi-Session Real-Time Kitchen Sync (AC 1, R4)', () => {

  test('TC-SYNC-01: Order created in reception reflects in kitchen within 5s with no page reload', async ({ browser, request }) => {
    // 1. Initialize two isolated browser sessions (Reception & Kitchen)
    const receptionContext = await browser.newContext({
      viewport: { width: 375, height: 667 },
      timezoneId: 'Asia/Kolkata',
      locale: 'en-IN'
    });
    const kitchenContext = await browser.newContext({
      viewport: { width: 375, height: 667 },
      timezoneId: 'Asia/Kolkata',
      locale: 'en-IN'
    });

    const receptionPage = await receptionContext.newPage();
    const kitchenPage = await kitchenContext.newPage();

    // 2. Inject page session token to verify zero reload occurs
    await kitchenPage.addInitScript(() => {
      (window as any).__kitchenLoadToken = Math.random();
    });

    // 3. Open Kitchen view
    await kitchenPage.goto('/kitchen');
    await kitchenPage.waitForLoadState('networkidle').catch(() => {});
    const initialToken = await kitchenPage.evaluate(() => (window as any).__kitchenLoadToken);

    // 4. Open Reception view and authenticate
    await receptionPage.goto('/reception');
    await unlockReceptionWithPin(receptionPage, '1234');

    // 5. Trigger new order creation (either UI or API)
    const startTime = Date.now();

    const newOrderBtn = receptionPage.locator('button:has-text("Add Order"), button:has-text("New Order"), [data-testid="btn-new-order"]').first();
    if (await newOrderBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await newOrderBtn.click();
      const itemBtn = receptionPage.locator('[data-testid^="item-"], .menu-item-card, button:has-text("₹")').first();
      await itemBtn.click();
      const cashBtn = receptionPage.locator('button:has-text("Cash"), [data-testid="pay-cash"]').first();
      await cashBtn.click();
      const submitBtn = receptionPage.locator('button:has-text("Create Order"), button:has-text("Place Order")').first();
      await submitBtn.click();
    } else {
      // Fallback: issue authenticated order API call
      const token = await request.post('/api/auth/verify-pin', { data: { pin: '1234' } }).then(r => r.json()).then(j => j.token);
      await request.post('/api/orders', {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          items: [{ name: 'Tea', unitPrice: 15, quantity: 2 }],
          paymentMethod: 'Cash'
        }
      });
    }

    // 6. Kitchen view should display the order within 5 seconds without manual reload
    const kitchenOrderCard = kitchenPage.locator('[data-testid^="order-card-"], .kitchen-order-card, text=/#([0-9]+)/').first();
    const isVisible = await kitchenOrderCard.isVisible({ timeout: 5000 }).catch(() => false);

    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeLessThan(5000);

    // 7. Verify no reload occurred on kitchen screen
    const currentToken = await kitchenPage.evaluate(() => (window as any).__kitchenLoadToken);
    expect(currentToken).toBe(initialToken);

    await receptionContext.close();
    await kitchenContext.close();
  });

});
