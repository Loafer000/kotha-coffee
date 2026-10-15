import { test, expect } from '@playwright/test';

test.describe('Tier 2: Boundary & Edge — PIN Security & API Route Guarding (AC 12, R8)', () => {

  test('TC-SEC-01: Direct unauthenticated POST /api/orders is rejected with HTTP 401', async ({ request }) => {
    const res = await request.post('/api/orders', {
      data: {
        items: [{ name: 'Tea', unitPrice: 15, quantity: 1 }],
        paymentMethod: 'Cash'
      }
    });
    expect([401, 403]).toContain(res.status());
  });

  test('TC-SEC-02: Direct unauthenticated PATCH /api/orders/:id is rejected with HTTP 401', async ({ request }) => {
    const res = await request.patch('/api/orders/order-fake-id', {
      data: { paymentMethod: 'Card' }
    });
    expect([401, 403]).toContain(res.status());
  });

  test('TC-SEC-03: Direct unauthenticated DELETE /api/orders/:id is rejected with HTTP 401', async ({ request }) => {
    const res = await request.delete('/api/orders/order-fake-id');
    expect([401, 403]).toContain(res.status());
  });

  test('TC-SEC-04: Direct unauthenticated POST /api/orders/:id/done is rejected with HTTP 401', async ({ request }) => {
    const res = await request.post('/api/orders/order-fake-id/done');
    expect([401, 403]).toContain(res.status());
  });

  test('TC-SEC-05: Direct unauthenticated POST /api/menu is rejected with HTTP 401', async ({ request }) => {
    const res = await request.post('/api/menu', {
      data: { name: 'Unauthorized Item', category: 'Drinks', price: 99 }
    });
    expect([401, 403]).toContain(res.status());
  });

  test('TC-SEC-06: Direct unauthenticated PUT /api/menu/:id is rejected with HTTP 401', async ({ request }) => {
    const res = await request.put('/api/menu/fake-item-id', {
      data: { price: 10 }
    });
    expect([401, 403]).toContain(res.status());
  });

  test('TC-SEC-07: Direct unauthenticated DELETE /api/menu/:id is rejected with HTTP 401', async ({ request }) => {
    const res = await request.delete('/api/menu/fake-item-id');
    expect([401, 403]).toContain(res.status());
  });

  test('TC-SEC-08: Malformed or forged Bearer token is rejected with HTTP 401', async ({ request }) => {
    const res = await request.post('/api/orders', {
      headers: { Authorization: 'Bearer invalid.tampered.token' },
      data: { items: [], paymentMethod: 'Cash' }
    });
    expect([401, 403]).toContain(res.status());
  });

  test('TC-SEC-09: Kitchen read routes are public and accessible without authentication', async ({ request }) => {
    const res = await request.get('/api/kitchen/orders');
    // Kitchen read endpoint must not reject with 401/403
    expect(res.status()).not.toBe(401);
    expect(res.status()).not.toBe(403);
  });

});
