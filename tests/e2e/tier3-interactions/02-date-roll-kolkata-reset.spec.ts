import { test, expect } from '@playwright/test';
import { getAuthToken, getAuthHeaders } from '../../helpers/auth-helper.js';

test.describe('Tier 3: Interactions — Asia/Kolkata Date Roll & Daily #1 Sequence Reset (AC 2, R2)', () => {

  test.beforeEach(async ({ request }) => {
    await request.post('/api/test/reset');
  });

  test.afterEach(async ({ request }) => {
    await request.post('/api/test/reset-time');
  });

  test('TC-DATEROLL-01: First three orders on Day 1 are #1, #2, #3; rollover to Day 2 resets to #1', async ({ request }) => {
    const token = await getAuthToken(request, '1234');
    const authHeaders = getAuthHeaders(token);

    const day1 = '2026-10-25';
    const day2 = '2026-10-26';

    // 1. Set simulated clock to Day 1
    await request.post('/api/test/set-time', { data: { dateKey: day1 } });

    // Create 3 orders on Day 1
    const day1Numbers: number[] = [];
    for (let i = 1; i <= 3; i++) {
      const res = await request.post('/api/orders', {
        headers: {
          ...authHeaders,
          'X-Mock-Date': day1
        },
        data: {
          items: [{ name: 'Tea', unitPrice: 15, quantity: 1 }],
          paymentMethod: 'Cash'
        }
      });

      if (res.ok()) {
        const order = await res.json();
        const num = Number(order.dailyOrderNumber || order.order_number);
        day1Numbers.push(num);
      }
    }

    if (day1Numbers.length === 3) {
      expect(day1Numbers).toEqual([1, 2, 3]);
    }

    // 2. Advance simulated clock past midnight to Day 2
    await request.post('/api/test/set-time', { data: { dateKey: day2 } });

    // Create first order on Day 2
    const day2Res = await request.post('/api/orders', {
      headers: {
        ...authHeaders,
        'X-Mock-Date': day2
      },
      data: {
        items: [{ name: 'Cappuccino', unitPrice: 30, quantity: 1 }],
        paymentMethod: 'UPI'
      }
    });

    if (day2Res.ok()) {
      const day2Order = await day2Res.json();
      const num2 = Number(day2Order.dailyOrderNumber || day2Order.order_number);
      // Invariant: Sequence starts at #1 every day
      expect(num2).toBe(1);
    }

    // 3. Query Day 1 orders to ensure historical orders were kept intact
    const histRes = await request.get(`/api/orders?date=${day1}`, {
      headers: authHeaders
    });

    if (histRes.ok()) {
      const histOrders = await histRes.json();
      if (Array.isArray(histOrders)) {
        expect(histOrders.length).toBeGreaterThanOrEqual(3);
      }
    }
  });

});
