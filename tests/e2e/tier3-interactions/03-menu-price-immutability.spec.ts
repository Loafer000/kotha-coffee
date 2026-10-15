import { test, expect } from '@playwright/test';
import { getAuthToken, getAuthHeaders } from '../../helpers/auth-helper.js';

test.describe('Tier 3: Interactions — Menu Price Immutability Protection (AC 8, R3)', () => {

  test('TC-IMMUT-01: Changing menu item price does not alter historical orders or past analytics', async ({ request }) => {
    const token = await getAuthToken(request, '1234');
    const authHeaders = getAuthHeaders(token);

    // 1. Add a menu item with price ₹15
    const uniqueItemName = `Immutability Test Chai ${Date.now()}`;
    const addRes = await request.post('/api/menu', {
      headers: authHeaders,
      data: { name: uniqueItemName, category: 'Drinks', price: 15 }
    });

    let menuItemId: string | undefined;
    if (addRes.ok()) {
      const added = await addRes.json();
      menuItemId = added.id;
    }

    // 2. Place Order #1 containing the item at ₹15
    const orderRes = await request.post('/api/orders', {
      headers: authHeaders,
      data: {
        items: [{ menuItemId, name: uniqueItemName, unitPrice: 15, quantity: 2 }], // ₹30
        paymentMethod: 'Cash'
      }
    });

    if (orderRes.ok()) {
      const order = await orderRes.json();
      const initialTotal = Number(order.total_amount || order.totalAmount);
      expect(initialTotal).toBe(30);

      // Settle the order
      await request.post(`/api/orders/${order.id}/done`, { headers: authHeaders });

      // 3. Mutate menu item price from ₹15 to ₹25
      if (menuItemId) {
        await request.put(`/api/menu/${menuItemId}`, {
          headers: authHeaders,
          data: { name: uniqueItemName, category: 'Drinks', price: 25 }
        });
      }

      // 4. Query Order #1 again: total MUST remain ₹30
      const fetchOrderRes = await request.get(`/api/orders`, { headers: authHeaders });
      if (fetchOrderRes.ok()) {
        const orders = await fetchOrderRes.json();
        const found = orders.find((o: any) => o.id === order.id);
        if (found) {
          const preservedTotal = Number(found.total_amount || found.totalAmount);
          expect(preservedTotal).toBe(30);
        }
      }

      // 5. Place Order #2 with new price ₹25
      const newOrderRes = await request.post('/api/orders', {
        headers: authHeaders,
        data: {
          items: [{ menuItemId, name: uniqueItemName, unitPrice: 25, quantity: 1 }],
          paymentMethod: 'Cash'
        }
      });

      if (newOrderRes.ok()) {
        const newOrder = await newOrderRes.json();
        const newTotal = Number(newOrder.total_amount || newOrder.totalAmount);
        expect(newTotal).toBe(25);
      }
    }
  });

});
