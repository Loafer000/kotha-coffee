import http from 'http';
import assert from 'assert';
import { startServer, stopServer } from '../src/server/index.js';
import { getDbClient } from '../src/server/db/client.js';

const TEST_PORT = 3107;
const BASE_URL = `http://localhost:${TEST_PORT}`;

function httpRequest(options: {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: any;
}): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any; raw: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(options.path, BASE_URL);
    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    let payload: string | undefined;
    if (options.body !== undefined) {
      payload = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      reqHeaders['Content-Length'] = Buffer.byteLength(payload).toString();
    }

    const req = http.request(
      url,
      {
        method: options.method,
        headers: reqHeaders
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          let parsed: any = data;
          try {
            parsed = JSON.parse(data);
          } catch {
            // keep raw string
          }
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: parsed,
            raw: data
          });
        });
      }
    );

    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function runM3VerificationSuite() {
  console.log('========================================================');
  console.log('=== Starting Milestone 3 Verification Test Suite ===');
  console.log('========================================================\n');

  let server: any;
  let authToken: string;

  try {
    // -------------------------------------------------------------------------
    // Step 1: Start Express server and initialize database schema
    // -------------------------------------------------------------------------
    console.log('Step 1: Starting Express server and initializing database schema...');
    server = await startServer(TEST_PORT);
    console.log(`   Server running on ${BASE_URL}`);

    // Reset test database and clock
    await httpRequest({ method: 'POST', path: '/api/test/reset' });
    await httpRequest({ method: 'POST', path: '/api/test/reset-time' });

    // Obtain reception auth token
    const authRes = await httpRequest({
      method: 'POST',
      path: '/api/auth/verify-pin',
      body: { pin: '1234' }
    });
    assert.strictEqual(authRes.status, 200, 'PIN verification should return 200');
    assert.ok(authRes.body.token, 'Should return a valid session token');
    authToken = authRes.body.token;
    const authHeaders = { Authorization: `Bearer ${authToken}` };
    console.log('   Authenticated with default PIN (1234), acquired session token.\n');

    // -------------------------------------------------------------------------
    // Step 2: Verify Unauthenticated Route Guards (Security Boundary R8)
    // -------------------------------------------------------------------------
    console.log('Step 2: Verifying unauthenticated route guards return HTTP 401...');
    
    // POST /api/orders without auth
    const unauthPost = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      body: {
        items: [{ name: 'Tea', unitPrice: 15, quantity: 1 }],
        paymentMethod: 'Cash'
      }
    });
    assert.strictEqual(unauthPost.status, 401, 'Unauthenticated POST /api/orders must return 401');

    // PATCH /api/orders/:id without auth
    const unauthPatch = await httpRequest({
      method: 'PATCH',
      path: '/api/orders/order-fake-123',
      body: { paymentMethod: 'UPI' }
    });
    assert.strictEqual(unauthPatch.status, 401, 'Unauthenticated PATCH /api/orders/:id must return 401');

    // POST /api/orders/:id/done without auth
    const unauthDone = await httpRequest({
      method: 'POST',
      path: '/api/orders/order-fake-123/done'
    });
    assert.strictEqual(unauthDone.status, 401, 'Unauthenticated POST /api/orders/:id/done must return 401');

    // DELETE /api/orders/:id without auth
    const unauthDelete = await httpRequest({
      method: 'DELETE',
      path: '/api/orders/order-fake-123'
    });
    assert.strictEqual(unauthDelete.status, 401, 'Unauthenticated DELETE /api/orders/:id must return 401');

    // GET /api/orders without auth
    const unauthGet = await httpRequest({
      method: 'GET',
      path: '/api/orders'
    });
    assert.strictEqual(unauthGet.status, 401, 'Unauthenticated GET /api/orders must return 401');

    // Public kitchen endpoint GET /api/kitchen/orders should be public (not 401)
    const kitchenGet = await httpRequest({
      method: 'GET',
      path: '/api/kitchen/orders'
    });
    assert.strictEqual(kitchenGet.status, 200, 'Public GET /api/kitchen/orders should return 200 without auth');
    assert.ok(Array.isArray(kitchenGet.body.pending), 'Kitchen response should contain pending array');
    assert.ok(Array.isArray(kitchenGet.body.settled), 'Kitchen response should contain settled array');

    console.log('   All route guards verified: Unauthenticated mutations & reception queries return 401.\n');

    // -------------------------------------------------------------------------
    // Step 3: Validate Input Boundaries (Cart validations)
    // -------------------------------------------------------------------------
    console.log('Step 3: Verifying cart input validation boundaries...');

    // Empty cart (0 items)
    const emptyRes = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: { items: [], paymentMethod: 'Cash' }
    });
    assert.strictEqual(emptyRes.status, 400, 'Empty cart should be rejected with 400');

    // Zero quantity
    const zeroRes = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [{ name: 'Tea', unitPrice: 15, quantity: 0 }],
        paymentMethod: 'Cash'
      }
    });
    assert.strictEqual(zeroRes.status, 400, 'Zero quantity should be rejected with 400');

    // Negative quantity
    const negRes = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [{ name: 'Tea', unitPrice: 15, quantity: -3 }],
        paymentMethod: 'Cash'
      }
    });
    assert.strictEqual(negRes.status, 400, 'Negative quantity should be rejected with 400');

    // Invalid payment method
    const badPayRes = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [{ name: 'Tea', unitPrice: 15, quantity: 1 }],
        paymentMethod: 'Bitcoin'
      }
    });
    assert.strictEqual(badPayRes.status, 400, 'Invalid payment method should be rejected with 400');

    console.log('   Input boundaries verified: empty carts, invalid quantities, and bad payment methods rejected.\n');

    // -------------------------------------------------------------------------
    // Step 4: Create Order & Verify Atomic #1 Sequence & Line-Item Freezing
    // -------------------------------------------------------------------------
    console.log('Step 4: Creating first order of the day and verifying #1 numbering & price snapshot...');

    const createRes1 = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [
          { name: 'Tea', unitPrice: 15, quantity: 2 },                // 30
          { name: 'Chicken Momo (5 pcs)', unitPrice: 60, quantity: 1 } // 60
        ],
        paymentMethod: 'Cash',
        notes: 'Less sugar in tea'
      }
    });
    assert.strictEqual(createRes1.status, 201, 'Order creation should return 201 Created');
    const order1 = createRes1.body;

    assert.ok(order1.id, 'Order should have a valid ID');
    assert.strictEqual(order1.daily_order_number, 1, 'First order of day must be #1');
    assert.strictEqual(order1.status, 'PENDING', 'New order status must be PENDING');
    assert.strictEqual(order1.payment_method, 'Cash', 'Payment method must be Cash');
    assert.strictEqual(order1.total_amount, 90, 'Total amount must be exactly 90 (15*2 + 60*1)');
    assert.strictEqual(order1.notes, 'Less sugar in tea', 'Notes should be preserved');
    assert.strictEqual(order1.items.length, 2, 'Should have 2 line items');
    assert.strictEqual(order1.items[0].subtotal, 30, 'First item subtotal should be 30');
    assert.strictEqual(order1.items[1].subtotal, 60, 'Second item subtotal should be 60');

    // Verify sequential monotonicity: Create second order (#2)
    const createRes2 = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [{ name: 'Cold Coffee', unitPrice: 50, quantity: 1 }],
        paymentMethod: 'UPI'
      }
    });
    assert.strictEqual(createRes2.status, 201);
    const order2 = createRes2.body;
    assert.strictEqual(order2.daily_order_number, 2, 'Second order of day must be #2');
    assert.strictEqual(order2.total_amount, 50);

    console.log('   Orders #1 and #2 created successfully with correct sequence, line-item snapshots, and totals.\n');

    // -------------------------------------------------------------------------
    // Step 5: Edit Pending Order (In-Place Modification)
    // -------------------------------------------------------------------------
    console.log('Step 5: Editing pending order #1 (items, quantities, payment method)...');

    const editRes = await httpRequest({
      method: 'PATCH',
      path: `/api/orders/${order1.id}`,
      headers: authHeaders,
      body: {
        items: [
          { name: 'Tea', unitPrice: 15, quantity: 3 },                // 45
          { name: 'Chicken Momo (5 pcs)', unitPrice: 60, quantity: 2 } // 120
        ],
        paymentMethod: 'Card',
        notes: 'Updated: Extra chili sauce'
      }
    });
    assert.strictEqual(editRes.status, 200, 'Edit order should return 200');
    const editedOrder = editRes.body;

    assert.strictEqual(editedOrder.id, order1.id, 'Order ID must remain unchanged');
    assert.strictEqual(editedOrder.daily_order_number, 1, 'Order number #1 must remain unchanged');
    assert.strictEqual(editedOrder.total_amount, 165, 'Total must recalculate to 165 (45 + 120)');
    assert.strictEqual(editedOrder.payment_method, 'Card', 'Payment method should update to Card');
    assert.strictEqual(editedOrder.notes, 'Updated: Extra chili sauce');
    assert.strictEqual(editedOrder.items.length, 2);

    console.log('   Pending order successfully edited: items updated, total recalculated to ₹165.\n');

    // -------------------------------------------------------------------------
    // Step 6: Mark Order Done (Settle Action)
    // -------------------------------------------------------------------------
    console.log('Step 6: Settle order #1 via POST /api/orders/:id/done...');

    const doneRes = await httpRequest({
      method: 'POST',
      path: `/api/orders/${order1.id}/done`,
      headers: authHeaders
    });
    assert.strictEqual(doneRes.status, 200, 'Done action should return 200');
    const settledOrder = doneRes.body;

    assert.strictEqual(settledOrder.status, 'SETTLED', 'Status must transition to SETTLED');
    assert.ok(settledOrder.settled_at, 'settled_at timestamp must be recorded');
    assert.ok(Date.parse(settledOrder.settled_at) > 0, 'settled_at must be valid ISO timestamp');

    // Attempting to edit a settled order must be rejected (Invariant E4)
    const rejectEditSettled = await httpRequest({
      method: 'PATCH',
      path: `/api/orders/${order1.id}`,
      headers: authHeaders,
      body: { paymentMethod: 'Cash' }
    });
    assert.ok([400, 409].includes(rejectEditSettled.status), 'Editing settled order must be rejected with 400/409');

    // Attempting to settle already settled order must be rejected
    const repeatDone = await httpRequest({
      method: 'POST',
      path: `/api/orders/${order1.id}/done`,
      headers: authHeaders
    });
    assert.ok([400, 409].includes(repeatDone.status), 'Settling already settled order must be rejected with 400/409');

    console.log('   Order moved to SETTLED with timestamp; mutations on settled order properly rejected.\n');

    // -------------------------------------------------------------------------
    // Step 7: Cancel Order (Cancellation Action)
    // -------------------------------------------------------------------------
    console.log('Step 7: Cancelling pending order #2 via DELETE /api/orders/:id...');

    const cancelRes = await httpRequest({
      method: 'DELETE',
      path: `/api/orders/${order2.id}`,
      headers: authHeaders
    });
    assert.strictEqual(cancelRes.status, 200, 'Cancelling order should return 200');

    // Check that cancelled order is excluded from pending orders query
    const pendingListRes = await httpRequest({
      method: 'GET',
      path: '/api/orders?status=PENDING',
      headers: authHeaders
    });
    assert.strictEqual(pendingListRes.status, 200);
    const pendingOrders = pendingListRes.body;
    const foundCancelled = pendingOrders.find((o: any) => o.id === order2.id);
    assert.strictEqual(foundCancelled, undefined, 'Cancelled order must not appear in pending queue');

    // Settled order #1 must appear in settled orders query
    const settledListRes = await httpRequest({
      method: 'GET',
      path: '/api/orders?status=SETTLED',
      headers: authHeaders
    });
    assert.strictEqual(settledListRes.status, 200);
    const settledOrders = settledListRes.body;
    const foundSettled = settledOrders.find((o: any) => o.id === order1.id);
    assert.ok(foundSettled, 'Settled order #1 must appear in settled queue');

    console.log('   Order cancellation verified: order #2 marked CANCELLED and excluded from pending queue.\n');

    // -------------------------------------------------------------------------
    // Step 8: Price Immutability Invariant (R3)
    // -------------------------------------------------------------------------
    console.log('Step 8: Verifying price immutability invariant on order line items...');

    // Create Order #3 with Cold Coffee @ 50
    const createRes3 = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [{ name: 'Cold Coffee', unitPrice: 50, quantity: 2 }],
        paymentMethod: 'Cash'
      }
    });
    assert.strictEqual(createRes3.status, 201);
    const order3 = createRes3.body;
    assert.strictEqual(order3.total_amount, 100);

    // Update catalog price of Cold Coffee from 50 to 80
    await httpRequest({
      method: 'PUT',
      path: '/api/menu/drinks-cold-coffee',
      headers: authHeaders,
      body: {
        name: 'Cold Coffee',
        category: 'Drinks',
        price: 80
      }
    });

    // Fetch order #3 again to confirm frozen price snapshot
    const fetchOrder3 = await httpRequest({
      method: 'GET',
      path: '/api/orders?status=PENDING',
      headers: authHeaders
    });
    const order3After = fetchOrder3.body.find((o: any) => o.id === order3.id);
    assert.ok(order3After, 'Order #3 must exist');
    assert.strictEqual(order3After.total_amount, 100, 'Order total must stay 100 despite menu price hike to 80');
    assert.strictEqual(order3After.items[0].unit_price, 50, 'Line item unit_price must stay 50');

    // Restore Cold Coffee catalog price back to 50
    await httpRequest({
      method: 'PUT',
      path: '/api/menu/drinks-cold-coffee',
      headers: authHeaders,
      body: {
        name: 'Cold Coffee',
        category: 'Drinks',
        price: 50
      }
    });
    console.log('   Price immutability invariant PASSED: Order line item unit price and total stayed frozen.\n');

    // -------------------------------------------------------------------------
    // Step 9: Day Rollover & Asia/Kolkata #1 Sequence Reset
    // -------------------------------------------------------------------------
    console.log('Step 9: Testing midnight day rollover to new date in Asia/Kolkata...');

    const tomorrow = '2026-10-16';
    await httpRequest({
      method: 'POST',
      path: '/api/test/set-time',
      body: { dateKey: tomorrow }
    });

    // Create first order on the new date
    const day2OrderRes = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: {
        ...authHeaders,
        'X-Mock-Date': tomorrow
      },
      body: {
        items: [{ name: 'Cappuccino (Milk Coffee)', unitPrice: 30, quantity: 1 }],
        paymentMethod: 'UPI'
      }
    });
    assert.strictEqual(day2OrderRes.status, 201);
    const day2Order = day2OrderRes.body;
    assert.strictEqual(day2Order.daily_order_number, 1, 'New day must reset order sequence to #1');
    assert.strictEqual(day2Order.date_key, tomorrow, `Date key must be ${tomorrow}`);

    // Reset test time
    await httpRequest({ method: 'POST', path: '/api/test/reset-time' });
    console.log('   Day rollover verified: Sequence reset to #1 on new date.\n');

    // -------------------------------------------------------------------------
    // Step 10: SPA Route Serving Verification (No "Cannot GET" 404s!)
    // -------------------------------------------------------------------------
    console.log('Step 10: Verifying SPA routes /, /reception, /kitchen serve valid HTML (HTTP 200)...');

    const routes = ['/', '/reception', '/kitchen', '/analytics'];
    for (const route of routes) {
      const res = await httpRequest({
        method: 'GET',
        path: route,
        headers: { Accept: 'text/html' }
      });

      assert.strictEqual(res.status, 200, `Route ${route} must return HTTP 200`);
      assert.ok(
        res.raw.toLowerCase().includes('<!doctype html>') || res.raw.includes('<html'),
        `Route ${route} must return valid HTML content`
      );
      assert.ok(
        !res.raw.includes('Cannot GET'),
        `Route ${route} must NOT return Express "Cannot GET" error`
      );
      assert.ok(
        res.raw.includes('কথা') || res.raw.includes('Coffee'),
        `Route ${route} HTML should contain brand mark "কথা & Coffee"`
      );
      console.log(`   Route "${route}" -> HTTP 200 (HTML confirmed)`);
    }

    console.log('\n========================================================');
    console.log('✅ ALL MILESTONE 3 VERIFICATION TESTS PASSED CLEANLY!');
    console.log('========================================================\n');

  } finally {
    if (server) {
      await stopServer();
      console.log('Server stopped cleanly.');
    }
  }
}

runM3VerificationSuite().catch((err) => {
  console.error('\n❌ Milestone 3 Verification Test Failed:\n', err);
  process.exit(1);
});
