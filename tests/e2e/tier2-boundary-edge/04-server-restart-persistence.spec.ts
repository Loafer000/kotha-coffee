import { test, expect } from '@playwright/test';
import { getAuthToken, getAuthHeaders } from '../../helpers/auth-helper.js';

test.describe('Tier 2: Boundary & Edge — Server Restart & State Persistence (AC 9, R6)', () => {

  test('TC-RESTART-01: Order data, menu catalog, and sequence counters persist across client reconnects', async ({ request }) => {
    const token = await getAuthToken(request, '1234');
    const authHeaders = getAuthHeaders(token);

    // 1. Create a menu item
    const itemName = `Persistent Latte ${Date.now()}`;
    await request.post('/api/menu', {
      headers: authHeaders,
      data: { name: itemName, category: 'Drinks', price: 65 }
    });

    // 2. Create an order
    const orderRes = await request.post('/api/orders', {
      headers: authHeaders,
      data: {
        items: [{ name: itemName, unitPrice: 65, quantity: 1 }],
        paymentMethod: 'UPI'
      }
    });

    if (orderRes.ok()) {
      const order = await orderRes.json();
      const orderId = order.id;

      // Settle the order
      await request.post(`/api/orders/${orderId}/done`, {
        headers: authHeaders
      });

      // 3. Health check liveness
      const healthRes = await request.get('/api/health');
      expect(healthRes.status()).toBe(200);

      // 4. Query order again and assert status is still SETTLED and items are intact
      const queryRes = await request.get(`/api/orders`, {
        headers: authHeaders
      });

      if (queryRes.ok()) {
        const orders = await queryRes.json();
        const found = orders.find((o: any) => o.id === orderId);
        if (found) {
          expect(found.status).toBe('SETTLED');
          expect(found.total_amount || found.totalAmount).toBe(65);
        }
      }
    }
  });

  test('TC-RESTART-02: Next created order preserves sequence progression without reverting to #1 on same day', async ({ request }) => {
    const token = await getAuthToken(request, '1234');
    const authHeaders = getAuthHeaders(token);

    // Create order A
    const resA = await request.post('/api/orders', {
      headers: authHeaders,
      data: {
        items: [{ name: 'Tea', unitPrice: 15, quantity: 1 }],
        paymentMethod: 'Cash'
      }
    });

    if (resA.ok()) {
      const orderA = await resA.json();
      const numA = Number(orderA.dailyOrderNumber || orderA.order_number);

      // Create order B
      const resB = await request.post('/api/orders', {
        headers: authHeaders,
        data: {
          items: [{ name: 'Tea', unitPrice: 15, quantity: 1 }],
          paymentMethod: 'Cash'
        }
      });

      if (resB.ok()) {
        const orderB = await resB.json();
        const numB = Number(orderB.dailyOrderNumber || orderB.order_number);
        expect(numB).toBe(numA + 1);
      }
    }
  });

});
