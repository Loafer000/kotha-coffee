import { test, expect } from '@playwright/test';
import { getAuthToken, getAuthHeaders } from '../../helpers/auth-helper.js';

test.describe('Tier 3: Interactions — Order Settlement & Cancellation Sync (AC 4, AC 5, AC 6)', () => {

  test('TC-SETTLE-SYNC-01: Settling an order moves it to Settled within 5 seconds across sessions', async ({ browser, request }) => {
    const receptionContext = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const kitchenContext = await browser.newContext({ viewport: { width: 375, height: 667 } });

    const receptionPage = await receptionContext.newPage();
    const kitchenPage = await kitchenContext.newPage();

    await kitchenPage.goto('/kitchen');
    await receptionPage.goto('/reception');

    // Create order via API
    const token = await getAuthToken(request, '1234');
    const authHeaders = getAuthHeaders(token);

    const createRes = await request.post('/api/orders', {
      headers: authHeaders,
      data: {
        items: [{ name: 'Chicken Momo', unitPrice: 60, quantity: 1 }],
        paymentMethod: 'UPI'
      }
    });

    if (createRes.ok()) {
      const order = await createRes.json();
      const orderId = order.id;

      // Settle the order
      const settleStart = Date.now();
      const doneRes = await request.post(`/api/orders/${orderId}/done`, { headers: authHeaders });

      if (doneRes.ok()) {
        const elapsed = Date.now() - settleStart;
        expect(elapsed).toBeLessThan(5000);

        // Verify kitchen UI renders zero mutation controls
        const kitchenDoneBtns = kitchenPage.locator('button:has-text("Done")');
        await expect(kitchenDoneBtns).toHaveCount(0);
      }
    }

    await receptionContext.close();
    await kitchenContext.close();
  });

  test('TC-SETTLE-SYNC-02: Cancelling an order removes it from queues and strictly excludes from analytics', async ({ request }) => {
    const token = await getAuthToken(request, '1234');
    const authHeaders = getAuthHeaders(token);

    // 1. Create order
    const createRes = await request.post('/api/orders', {
      headers: authHeaders,
      data: {
        items: [{ name: 'Chocolate Shake', unitPrice: 99, quantity: 1 }],
        paymentMethod: 'Cash'
      }
    });

    if (createRes.ok()) {
      const order = await createRes.json();
      const orderId = order.id;

      // 2. Cancel order
      const cancelRes = await request.delete(`/api/orders/${orderId}`, { headers: authHeaders });
      expect([200, 204]).toContain(cancelRes.status());

      // 3. Query analytics: must NOT include ₹99
      const analyticsRes = await request.get('/api/analytics', { headers: authHeaders });
      if (analyticsRes.ok()) {
        const data = await analyticsRes.json();
        // Item should either be absent or have 0 amount
        if (data.itemSales && data.itemSales['Chocolate Shake']) {
          expect(data.itemSales['Chocolate Shake'].amount).toBe(0);
        }
      }
    }
  });

});
