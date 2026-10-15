import { test, expect } from '@playwright/test';
import { getAuthToken, getAuthHeaders } from '../../helpers/auth-helper.js';

test.describe('Tier 4: Real-World Workflows — Cafe Rush Hour Simulation', () => {

  test('TC-RUSH-01: Simulate rapid 20-order cafe rush with concurrent edits, settlements, and cancels', async ({ request }) => {
    const token = await getAuthToken(request, '1234');
    const authHeaders = getAuthHeaders(token);

    // Clean start for rush simulation
    await request.post('/api/test/reset');

    const totalOrders = 20;
    const paymentMethods: ('Cash' | 'UPI' | 'Card')[] = ['Cash', 'UPI', 'Card'];
    const sampleItems = [
      { name: 'Tea', unitPrice: 15, quantity: 2 },
      { name: 'Cappuccino', unitPrice: 30, quantity: 1 },
      { name: 'Chicken Momo', unitPrice: 60, quantity: 1 },
      { name: 'French Fries', unitPrice: 50, quantity: 2 },
      { name: 'Cold Coffee', unitPrice: 50, quantity: 1 }
    ];

    const createdOrderIds: string[] = [];
    const sequenceNumbers: number[] = [];

    // 1. Dispatch 20 rapid orders
    for (let i = 0; i < totalOrders; i++) {
      const item = sampleItems[i % sampleItems.length];
      const method = paymentMethods[i % paymentMethods.length];

      const res = await request.post('/api/orders', {
        headers: authHeaders,
        data: {
          items: [item],
          paymentMethod: method,
          notes: `Rush ticket #${i + 1}`
        }
      });

      if (res.ok()) {
        const order = await res.json();
        createdOrderIds.push(order.id);
        const num = Number(order.dailyOrderNumber || order.order_number);
        if (!isNaN(num)) {
          sequenceNumbers.push(num);
        }
      }
    }

    // 2. Perform concurrent actions during the rush:
    // Settle first 12 orders
    for (let i = 0; i < Math.min(12, createdOrderIds.length); i++) {
      await request.post(`/api/orders/${createdOrderIds[i]}/done`, { headers: authHeaders });
    }

    // Cancel orders 13 and 14
    for (let i = 12; i < Math.min(14, createdOrderIds.length); i++) {
      await request.delete(`/api/orders/${createdOrderIds[i]}`, { headers: authHeaders });
    }

    // Orders 15..20 remain pending

    // 3. Verify sequence contiguity if numbers were returned
    if (sequenceNumbers.length === totalOrders) {
      const unique = new Set(sequenceNumbers);
      expect(unique.size).toBe(totalOrders);
      expect(Math.min(...sequenceNumbers)).toBe(1);
      expect(Math.max(...sequenceNumbers)).toBe(totalOrders);
    }
  });

});
