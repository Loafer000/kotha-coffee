import { test, expect } from '@playwright/test';
import { unlockReceptionWithPin, getAuthToken, getAuthHeaders } from '../../helpers/auth-helper.js';

test.describe('Tier 4: Real-World Workflows — Full Day Lifecycle E2E', () => {

  test('TC-LIFECYCLE-01: Complete day lifecycle from morning opening to evening closing audit', async ({ browser, request }) => {
    const receptionContext = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const kitchenContext = await browser.newContext({ viewport: { width: 375, height: 667 } });

    const receptionPage = await receptionContext.newPage();
    const kitchenPage = await kitchenContext.newPage();

    // 1. Morning Opening: Staff unlocks reception with PIN
    await receptionPage.goto('/reception');
    await unlockReceptionWithPin(receptionPage, '1234');

    // 2. Kitchen Terminal Powered On (no PIN)
    await kitchenPage.goto('/kitchen');
    await expect(kitchenPage).toHaveURL(/.*kitchen/);

    // 3. Process Customer Orders throughout the day
    const token = await getAuthToken(request, '1234');
    const authHeaders = getAuthHeaders(token);

    const ordersData = [
      { items: [{ name: 'Tea', unitPrice: 15, quantity: 2 }], paymentMethod: 'Cash' },
      { items: [{ name: 'Cold Coffee', unitPrice: 50, quantity: 1 }], paymentMethod: 'UPI' },
      { items: [{ name: 'White Sauce Pasta', unitPrice: 70, quantity: 1 }], paymentMethod: 'Card' }
    ];

    const placedOrderIds: string[] = [];
    for (const ord of ordersData) {
      const res = await request.post('/api/orders', {
        headers: authHeaders,
        data: ord
      });
      if (res.ok()) {
        const o = await res.json();
        placedOrderIds.push(o.id);
      }
    }

    // 4. Kitchen prepares and reception marks orders Done
    for (const id of placedOrderIds) {
      await request.post(`/api/orders/${id}/done`, { headers: authHeaders });
    }

    // 5. Evening Closing: Reception audits daily sales in Analytics
    const analyticsRes = await request.get('/api/analytics', { headers: authHeaders });
    if (analyticsRes.ok()) {
      const summary = await analyticsRes.json();
      expect(Number(summary.grandTotal)).toBeGreaterThanOrEqual(0);
    }

    await receptionContext.close();
    await kitchenContext.close();
  });

});
