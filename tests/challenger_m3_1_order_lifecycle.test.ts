import http from 'http';
import assert from 'assert';
import { startServer, stopServer } from '../src/server/index.js';
import { getDbClient } from '../src/server/db/client.js';

const TEST_PORT = 3108;
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

async function runAdversarialTestHarness() {
  console.log('========================================================================');
  console.log('=== CHALLENGER 1: Empirical Adversarial Order Lifecycle & State Machine ===');
  console.log('========================================================================\n');

  let server: any;
  let authToken: string;

  try {
    server = await startServer(TEST_PORT);
    console.log(`[Setup] Server running on port ${TEST_PORT}`);

    // Reset DB & simulated clock
    await httpRequest({ method: 'POST', path: '/api/test/reset' });
    await httpRequest({ method: 'POST', path: '/api/test/reset-time' });

    // Authenticate
    const authRes = await httpRequest({
      method: 'POST',
      path: '/api/auth/verify-pin',
      body: { pin: '1234' }
    });
    assert.strictEqual(authRes.status, 200, 'PIN verification failed');
    authToken = authRes.body.token;
    const authHeaders = { Authorization: `Bearer ${authToken}` };

    // -------------------------------------------------------------------------
    // SECTION 1: Adversarial State Machine & Invalid Transitions
    // -------------------------------------------------------------------------
    console.log('\n--- Section 1: Testing State Machine Transitions & Invariants ---');

    // 1.1 Create pending order
    const o1Res = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [{ name: 'Espresso', unitPrice: 80, quantity: 1 }],
        paymentMethod: 'Cash'
      }
    });
    assert.strictEqual(o1Res.status, 201);
    const order1 = o1Res.body;
    assert.strictEqual(order1.status, 'PENDING');
    console.log('  [1.1] Created order O1 in PENDING state.');

    // 1.2 Valid transition: PENDING -> SETTLED
    const settleRes = await httpRequest({
      method: 'POST',
      path: `/api/orders/${order1.id}/done`,
      headers: authHeaders
    });
    assert.strictEqual(settleRes.status, 200);
    assert.strictEqual(settleRes.body.status, 'SETTLED');
    assert.ok(settleRes.body.settled_at, 'settled_at timestamp must be present');
    console.log('  [1.2] Valid transition: O1 moved PENDING -> SETTLED.');

    // 1.3 Invalid transition: Edit Settled order (PATCH) -> MUST return 409
    const editSettledPatch = await httpRequest({
      method: 'PATCH',
      path: `/api/orders/${order1.id}`,
      headers: authHeaders,
      body: { items: [{ name: 'Espresso', unitPrice: 80, quantity: 2 }] }
    });
    assert.strictEqual(editSettledPatch.status, 409, 'PATCH settled order must return 409');
    console.log('  [1.3] Invalid transition rejected: PATCH settled order returned HTTP 409.');

    // 1.4 Invalid transition: Edit Settled order (PUT) -> MUST return 409
    const editSettledPut = await httpRequest({
      method: 'PUT',
      path: `/api/orders/${order1.id}`,
      headers: authHeaders,
      body: { paymentMethod: 'Card' }
    });
    assert.strictEqual(editSettledPut.status, 409, 'PUT settled order must return 409');
    console.log('  [1.4] Invalid transition rejected: PUT settled order returned HTTP 409.');

    // 1.5 Invalid transition: Settle already settled order -> MUST return 409
    const settleAgain = await httpRequest({
      method: 'POST',
      path: `/api/orders/${order1.id}/done`,
      headers: authHeaders
    });
    assert.strictEqual(settleAgain.status, 409, 'Settling already settled order must return 409');
    console.log('  [1.5] Invalid transition rejected: Re-settle returned HTTP 409.');

    // 1.6 Invalid transition: Cancel settled order -> MUST return 409
    const cancelSettled = await httpRequest({
      method: 'DELETE',
      path: `/api/orders/${order1.id}`,
      headers: authHeaders
    });
    assert.strictEqual(cancelSettled.status, 409, 'Cannot cancel a settled order, must return 409');
    console.log('  [1.6] Invalid transition rejected: Cancel settled order returned HTTP 409.');

    // 1.7 Create second order for cancellation test
    const o2Res = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [{ name: 'Cold Coffee', unitPrice: 50, quantity: 2 }],
        paymentMethod: 'UPI'
      }
    });
    assert.strictEqual(o2Res.status, 201);
    const order2 = o2Res.body;

    // 1.8 Valid transition: PENDING -> CANCELLED
    const cancelRes = await httpRequest({
      method: 'DELETE',
      path: `/api/orders/${order2.id}`,
      headers: authHeaders
    });
    assert.strictEqual(cancelRes.status, 200);
    assert.strictEqual(cancelRes.body.status, 'CANCELLED');
    console.log('  [1.8] Valid transition: O2 moved PENDING -> CANCELLED.');

    // 1.9 Invalid transition: Edit Cancelled order (PATCH) -> MUST return 409
    const editCancelledPatch = await httpRequest({
      method: 'PATCH',
      path: `/api/orders/${order2.id}`,
      headers: authHeaders,
      body: { items: [{ name: 'Cold Coffee', unitPrice: 50, quantity: 1 }] }
    });
    assert.strictEqual(editCancelledPatch.status, 409, 'PATCH cancelled order must return 409');
    console.log('  [1.9] Invalid transition rejected: PATCH cancelled order returned HTTP 409.');

    // 1.10 Invalid transition: Edit Cancelled order (PUT) -> MUST return 409
    const editCancelledPut = await httpRequest({
      method: 'PUT',
      path: `/api/orders/${order2.id}`,
      headers: authHeaders,
      body: { notes: 'Try to edit cancelled order' }
    });
    assert.strictEqual(editCancelledPut.status, 409, 'PUT cancelled order must return 409');
    console.log('  [1.10] Invalid transition rejected: PUT cancelled order returned HTTP 409.');

    // 1.11 Invalid transition: Settle cancelled order -> MUST return 409
    const settleCancelled = await httpRequest({
      method: 'POST',
      path: `/api/orders/${order2.id}/done`,
      headers: authHeaders
    });
    assert.strictEqual(settleCancelled.status, 409, 'Cannot settle cancelled order, must return 409');
    console.log('  [1.11] Invalid transition rejected: Settle cancelled order returned HTTP 409.');

    // 1.12 Non-existent order checks -> MUST return 404
    const fakeId = 'order_non_existent_123456';
    const fakeSettle = await httpRequest({
      method: 'POST',
      path: `/api/orders/${fakeId}/done`,
      headers: authHeaders
    });
    assert.strictEqual(fakeSettle.status, 404, 'Settle non-existent order must return 404');

    const fakeEdit = await httpRequest({
      method: 'PATCH',
      path: `/api/orders/${fakeId}`,
      headers: authHeaders,
      body: { paymentMethod: 'Cash' }
    });
    assert.strictEqual(fakeEdit.status, 404, 'Edit non-existent order must return 404');

    const fakeDelete = await httpRequest({
      method: 'DELETE',
      path: `/api/orders/${fakeId}`,
      headers: authHeaders
    });
    assert.strictEqual(fakeDelete.status, 404, 'Delete non-existent order must return 404');
    console.log('  [1.12] Non-existent order operations correctly returned HTTP 404.');

    // -------------------------------------------------------------------------
    // SECTION 2: Order Edit Math & Validation Stress
    // -------------------------------------------------------------------------
    console.log('\n--- Section 2: Testing Order Edit Math & Validation Stress ---');

    // 2.1 Create order with 2 items
    const o3Res = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [
          { name: 'Tea', unitPrice: 15, quantity: 2 },                // 30
          { name: 'Chicken Momo (5 pcs)', unitPrice: 60, quantity: 1 } // 60
        ],
        paymentMethod: 'Cash'
      }
    });
    assert.strictEqual(o3Res.status, 201);
    const order3 = o3Res.body;
    assert.strictEqual(order3.total_amount, 90);

    // 2.2 Edit items: change quantities, add new item, remove an item
    const editMathRes = await httpRequest({
      method: 'PATCH',
      path: `/api/orders/${order3.id}`,
      headers: authHeaders,
      body: {
        items: [
          { name: 'Tea', unitPrice: 15, quantity: 4 },                // 60
          { name: 'Cold Coffee', unitPrice: 50, quantity: 2 }          // 100
        ],
        paymentMethod: 'UPI',
        notes: 'Updated order notes'
      }
    });
    assert.strictEqual(editMathRes.status, 200);
    const edited3 = editMathRes.body;
    assert.strictEqual(edited3.total_amount, 160, 'Total should recalculate to 60 + 100 = 160');
    assert.strictEqual(edited3.payment_method, 'UPI');
    assert.strictEqual(edited3.notes, 'Updated order notes');
    assert.strictEqual(edited3.items.length, 2);
    assert.strictEqual(edited3.items[0].subtotal, 60);
    assert.strictEqual(edited3.items[1].subtotal, 100);
    console.log('  [2.1] Order item edit math correctly recalculated total: ₹90 -> ₹160.');

    // 2.3 Fractional and floating-point math check
    const o4Res = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [
          { name: 'Special Item A', unitPrice: 12.50, quantity: 3 }, // 37.50
          { name: 'Special Item B', unitPrice: 33.33, quantity: 2 }  // 66.66
        ],
        paymentMethod: 'Card'
      }
    });
    assert.strictEqual(o4Res.status, 201);
    const order4 = o4Res.body;
    assert.strictEqual(order4.total_amount, 104.16, 'Float math should equal 37.50 + 66.66 = 104.16');
    console.log('  [2.2] Fractional pricing math accurately rounded: ₹104.16.');

    // 2.4 Partial edits: update ONLY paymentMethod without touching items
    const partialPayRes = await httpRequest({
      method: 'PATCH',
      path: `/api/orders/${order4.id}`,
      headers: authHeaders,
      body: { paymentMethod: 'Cash' }
    });
    assert.strictEqual(partialPayRes.status, 200);
    assert.strictEqual(partialPayRes.body.payment_method, 'Cash');
    assert.strictEqual(partialPayRes.body.total_amount, 104.16, 'Total must remain identical');
    assert.strictEqual(partialPayRes.body.items.length, 2, 'Items must remain intact');
    console.log('  [2.3] Partial edit (paymentMethod only) preserved items and total.');

    // 2.5 Partial edits: update ONLY notes without touching items
    const partialNotesRes = await httpRequest({
      method: 'PATCH',
      path: `/api/orders/${order4.id}`,
      headers: authHeaders,
      body: { notes: 'Customer paid cash at counter' }
    });
    assert.strictEqual(partialNotesRes.status, 200);
    assert.strictEqual(partialNotesRes.body.notes, 'Customer paid cash at counter');
    assert.strictEqual(partialNotesRes.body.total_amount, 104.16);
    console.log('  [2.4] Partial edit (notes only) preserved items and total.');

    // 2.6 Invalid edit payloads:
    // Empty items
    const emptyEdit = await httpRequest({
      method: 'PATCH',
      path: `/api/orders/${order4.id}`,
      headers: authHeaders,
      body: { items: [] }
    });
    assert.strictEqual(emptyEdit.status, 400, 'Empty items array on edit must return 400');

    // Zero quantity
    const zeroQtyEdit = await httpRequest({
      method: 'PATCH',
      path: `/api/orders/${order4.id}`,
      headers: authHeaders,
      body: { items: [{ name: 'Tea', unitPrice: 15, quantity: 0 }] }
    });
    assert.strictEqual(zeroQtyEdit.status, 400, 'Zero quantity on edit must return 400');

    // Negative quantity
    const negQtyEdit = await httpRequest({
      method: 'PATCH',
      path: `/api/orders/${order4.id}`,
      headers: authHeaders,
      body: { items: [{ name: 'Tea', unitPrice: 15, quantity: -2 }] }
    });
    assert.strictEqual(negQtyEdit.status, 400, 'Negative quantity on edit must return 400');

    // Non-integer quantity
    const floatQtyEdit = await httpRequest({
      method: 'PATCH',
      path: `/api/orders/${order4.id}`,
      headers: authHeaders,
      body: { items: [{ name: 'Tea', unitPrice: 15, quantity: 1.5 }] }
    });
    assert.strictEqual(floatQtyEdit.status, 400, 'Non-integer quantity on edit must return 400');

    // Invalid payment method
    const badPayEdit = await httpRequest({
      method: 'PATCH',
      path: `/api/orders/${order4.id}`,
      headers: authHeaders,
      body: { paymentMethod: 'Ethereum' }
    });
    assert.strictEqual(badPayEdit.status, 400, 'Invalid payment method on edit must return 400');

    // Tamper attempt: trying to mutate status or daily_order_number via edit
    const tamperEdit = await httpRequest({
      method: 'PATCH',
      path: `/api/orders/${order4.id}`,
      headers: authHeaders,
      body: {
        status: 'SETTLED',
        daily_order_number: 9999
      }
    });
    assert.strictEqual(tamperEdit.status, 200);
    assert.strictEqual(tamperEdit.body.status, 'PENDING', 'status cannot be changed via edit endpoint');
    assert.strictEqual(tamperEdit.body.daily_order_number, order4.daily_order_number, 'order number cannot be tampered');
    console.log('  [2.5] Input validation and tamper protections on edit verified.');

    // -------------------------------------------------------------------------
    // SECTION 3: Price Snapshot Invariance
    // -------------------------------------------------------------------------
    console.log('\n--- Section 3: Testing Price Snapshot Invariance ---');

    // 3.1 Fetch current catalog items
    const menuRes = await httpRequest({ method: 'GET', path: '/api/menu' });
    assert.strictEqual(menuRes.status, 200);
    const menuItems = menuRes.body;
    assert.ok(menuItems.length > 0, 'Menu must have items');

    const testItem = menuItems.find((m: any) => m.name === 'Tea') || menuItems[0];
    const initialPrice = testItem.price;
    console.log(`  [3.1] Target menu item: "${testItem.name}" @ ₹${initialPrice}`);

    // 3.2 Place order with this catalog item
    const snapOrderRes = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [{ menuItemId: testItem.id, quantity: 3 }],
        paymentMethod: 'Cash'
      }
    });
    assert.strictEqual(snapOrderRes.status, 201);
    const snapOrder = snapOrderRes.body;
    const expectedInitialSubtotal = initialPrice * 3;
    assert.strictEqual(snapOrder.total_amount, expectedInitialSubtotal);
    assert.strictEqual(snapOrder.items[0].unit_price, initialPrice);

    // 3.3 Now alter catalog item price (e.g. increase by ₹50)
    const newPrice = initialPrice + 50;
    const updateMenuRes = await httpRequest({
      method: 'PUT',
      path: `/api/menu/${testItem.id}`,
      headers: authHeaders,
      body: {
        name: testItem.name,
        category: testItem.category,
        price: newPrice
      }
    });
    assert.strictEqual(updateMenuRes.status, 200);
    console.log(`  [3.2] Menu item updated in catalog: ₹${initialPrice} -> ₹${newPrice}`);

    // 3.4 Settle the order
    await httpRequest({
      method: 'POST',
      path: `/api/orders/${snapOrder.id}/done`,
      headers: authHeaders
    });

    // 3.5 Verify the existing order retains original unit price and subtotal
    const getOrderRes = await httpRequest({
      method: 'GET',
      path: '/api/orders?status=SETTLED',
      headers: authHeaders
    });
    const foundSnapOrder = getOrderRes.body.find((o: any) => o.id === snapOrder.id);
    assert.ok(foundSnapOrder, 'Settled order must be present in orders list');
    assert.strictEqual(
      foundSnapOrder.total_amount,
      expectedInitialSubtotal,
      `Order total must stay ₹${expectedInitialSubtotal} despite catalog price hike to ₹${newPrice}`
    );
    assert.strictEqual(
      foundSnapOrder.items[0].unit_price,
      initialPrice,
      `Line item unit_price must stay ₹${initialPrice}`
    );
    assert.strictEqual(
      foundSnapOrder.items[0].subtotal,
      expectedInitialSubtotal,
      `Line item subtotal must stay ₹${expectedInitialSubtotal}`
    );
    console.log(`  [3.3] Price snapshot invariant verified: Existing order retained original price ₹${initialPrice} (total ₹${expectedInitialSubtotal}).`);

    // 3.6 Create a new order with same menuItemId: it MUST use the new price
    const newOrderRes = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [{ menuItemId: testItem.id, quantity: 2 }],
        paymentMethod: 'UPI'
      }
    });
    assert.strictEqual(newOrderRes.status, 201);
    assert.strictEqual(newOrderRes.body.items[0].unit_price, newPrice, `New order must use new catalog price ₹${newPrice}`);
    assert.strictEqual(newOrderRes.body.total_amount, newPrice * 2);
    console.log(`  [3.4] New order placed with updated item picked up new price ₹${newPrice}.`);

    // Restore catalog price
    await httpRequest({
      method: 'PUT',
      path: `/api/menu/${testItem.id}`,
      headers: authHeaders,
      body: {
        name: testItem.name,
        category: testItem.category,
        price: initialPrice
      }
    });

    // -------------------------------------------------------------------------
    // SECTION 4: Rapid Sequential Order Creation & High Concurrency
    // -------------------------------------------------------------------------
    console.log('\n--- Section 4: Testing Rapid Sequential & Burst Concurrency ---');

    // 4.1 Rapid sequential creation: 10 orders
    const sequentialNumbers: number[] = [];
    for (let i = 0; i < 10; i++) {
      const res = await httpRequest({
        method: 'POST',
        path: '/api/orders',
        headers: authHeaders,
        body: {
          items: [{ name: 'Tea', unitPrice: 15, quantity: 1 }],
          paymentMethod: 'Cash'
        }
      });
      assert.strictEqual(res.status, 201);
      sequentialNumbers.push(res.body.daily_order_number);
    }

    console.log(`  [4.1] 10 sequential orders generated numbers: [${sequentialNumbers.join(', ')}]`);
    for (let i = 1; i < sequentialNumbers.length; i++) {
      assert.strictEqual(
        sequentialNumbers[i],
        sequentialNumbers[i - 1] + 1,
        `Consecutive numbers required: expected ${sequentialNumbers[i - 1] + 1}, got ${sequentialNumbers[i]}`
      );
    }
    console.log('  [4.1] Rapid sequential test passed: 10 strictly consecutive order numbers with no gaps or duplicates.');

    // 4.2 High concurrency burst: 25 simultaneous order creations
    console.log('  [4.2] Dispatching 25 concurrent order requests via Promise.all...');
    const concurrentRequests = Array.from({ length: 25 }, (_, idx) =>
      httpRequest({
        method: 'POST',
        path: '/api/orders',
        headers: authHeaders,
        body: {
          items: [{ name: 'Cold Coffee', unitPrice: 50, quantity: 1 }],
          paymentMethod: idx % 2 === 0 ? 'Cash' : 'UPI',
          notes: `Concurrent order #${idx + 1}`
        }
      })
    );

    const concurrentResults = await Promise.all(concurrentRequests);
    for (let i = 0; i < concurrentResults.length; i++) {
      assert.strictEqual(concurrentResults[i].status, 201, `Concurrent order #${i} failed with status ${concurrentResults[i].status}`);
    }

    const concurrentNumbers = concurrentResults.map((r) => r.body.daily_order_number);
    console.log(`  [4.2] 25 concurrent orders completed. Order numbers count: ${concurrentNumbers.length}`);

    // Check uniqueness (no duplicates)
    const numberSet = new Set(concurrentNumbers);
    assert.strictEqual(numberSet.size, concurrentNumbers.length, 'All concurrent order numbers must be unique, no duplicates allowed!');

    // Sort and verify contiguity (no gaps)
    concurrentNumbers.sort((a, b) => a - b);
    const startNum = sequentialNumbers[sequentialNumbers.length - 1] + 1;
    for (let i = 0; i < concurrentNumbers.length; i++) {
      assert.strictEqual(
        concurrentNumbers[i],
        startNum + i,
        `Contiguous sequence required: expected ${startNum + i}, got ${concurrentNumbers[i]}`
      );
    }
    console.log(`  [4.2] High concurrency stress test PASSED: 25 concurrent orders received consecutive numbers [${concurrentNumbers[0]}..${concurrentNumbers[concurrentNumbers.length - 1]}] with 0 duplicates and 0 gaps.`);

    // -------------------------------------------------------------------------
    // SECTION 5: Day Rollover & Asia/Kolkata Midnight Boundary
    // -------------------------------------------------------------------------
    console.log('\n--- Section 5: Testing Day Rollover & Asia/Kolkata Midnight Boundary ---');

    // 5.1 Set mock date to Day A (2026-11-01)
    const dayA = '2026-11-01';
    await httpRequest({
      method: 'POST',
      path: '/api/test/set-time',
      body: { dateKey: dayA }
    });

    const dayAHeaders = {
      ...authHeaders,
      'X-Mock-Date': dayA
    };

    // Create 3 orders on Day A
    const dayAOrders = [];
    for (let i = 1; i <= 3; i++) {
      const res = await httpRequest({
        method: 'POST',
        path: '/api/orders',
        headers: dayAHeaders,
        body: {
          items: [{ name: 'Tea', unitPrice: 15, quantity: 1 }],
          paymentMethod: 'Cash'
        }
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.daily_order_number, i);
      assert.strictEqual(res.body.date_key, dayA);
      dayAOrders.push(res.body);
    }
    console.log(`  [5.1] Created 3 orders on Day A (${dayA}): #1, #2, #3.`);

    // 5.2 Advance simulated clock to Day B (2026-11-02)
    const dayB = '2026-11-02';
    await httpRequest({
      method: 'POST',
      path: '/api/test/set-time',
      body: { dateKey: dayB }
    });

    const dayBHeaders = {
      ...authHeaders,
      'X-Mock-Date': dayB
    };

    // Create 3 orders on Day B -> MUST reset to #1, #2, #3
    const dayBOrders = [];
    for (let i = 1; i <= 3; i++) {
      const res = await httpRequest({
        method: 'POST',
        path: '/api/orders',
        headers: dayBHeaders,
        body: {
          items: [{ name: 'Cold Coffee', unitPrice: 50, quantity: 1 }],
          paymentMethod: 'UPI'
        }
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.daily_order_number, i, `Day B order ${i} must have daily_order_number = ${i}`);
      assert.strictEqual(res.body.date_key, dayB);
      dayBOrders.push(res.body);
    }
    console.log(`  [5.2] Reset verified: Day B (${dayB}) orders successfully reset to #1, #2, #3.`);

    // 5.3 Historical query isolation
    const queryDayA = await httpRequest({
      method: 'GET',
      path: `/api/orders?date=${dayA}`,
      headers: authHeaders
    });
    assert.strictEqual(queryDayA.status, 200);
    assert.strictEqual(queryDayA.body.length, 3, 'Day A must return exactly 3 orders');
    for (const o of queryDayA.body) {
      assert.strictEqual(o.date_key, dayA);
    }

    const queryDayB = await httpRequest({
      method: 'GET',
      path: `/api/orders?date=${dayB}`,
      headers: authHeaders
    });
    assert.strictEqual(queryDayB.status, 200);
    assert.strictEqual(queryDayB.body.length, 3, 'Day B must return exactly 3 orders');
    for (const o of queryDayB.body) {
      assert.strictEqual(o.date_key, dayB);
    }
    console.log('  [5.3] Cross-day query isolation verified: Both days retain independent #1, #2, #3 orders without collision.');

    // 5.4 Test exact midnight clock boundary in Asia/Kolkata
    // 23:59:59 IST (UTC+05:30) on 2026-11-02 is 18:29:59 UTC
    const preMidnightTs = '2026-11-02T23:59:59+05:30';
    await httpRequest({
      method: 'POST',
      path: '/api/test/set-time',
      body: { timestamp: preMidnightTs }
    });

    const preMidRes = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [{ name: 'Tea', unitPrice: 15, quantity: 1 }],
        paymentMethod: 'Cash'
      }
    });
    assert.strictEqual(preMidRes.status, 201);
    assert.strictEqual(preMidRes.body.date_key, '2026-11-02', 'Timestamp 23:59:59 IST must map to date 2026-11-02');
    assert.strictEqual(preMidRes.body.daily_order_number, 4, 'Pre-midnight order should increment Day B counter to #4');

    // 00:00:01 IST on 2026-11-03 is 18:30:01 UTC
    const postMidnightTs = '2026-11-03T00:00:01+05:30';
    await httpRequest({
      method: 'POST',
      path: '/api/test/set-time',
      body: { timestamp: postMidnightTs }
    });

    const postMidRes = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [{ name: 'Tea', unitPrice: 15, quantity: 1 }],
        paymentMethod: 'Cash'
      }
    });
    assert.strictEqual(postMidRes.status, 201);
    assert.strictEqual(postMidRes.body.date_key, '2026-11-03', 'Timestamp 00:00:01 IST must map to date 2026-11-03');
    assert.strictEqual(postMidRes.body.daily_order_number, 1, 'Post-midnight order on new date must reset to #1');
    console.log('  [5.4] Midnight boundary (23:59:59 IST -> 00:00:01 IST) correctly evaluated and triggered #1 reset.');

    // Reset clock
    await httpRequest({ method: 'POST', path: '/api/test/reset-time' });

    // -------------------------------------------------------------------------
    // SECTION 6: Kitchen Public Endpoint Invariants
    // -------------------------------------------------------------------------
    console.log('\n--- Section 6: Testing Kitchen Public Read-Only Endpoint ---');

    // Query kitchen orders without auth
    const kitchenRes = await httpRequest({
      method: 'GET',
      path: '/api/kitchen/orders'
    });
    assert.strictEqual(kitchenRes.status, 200, 'Kitchen endpoint must be public (200)');
    assert.ok(Array.isArray(kitchenRes.body.pending), 'pending must be array');
    assert.ok(Array.isArray(kitchenRes.body.settled), 'settled must be array');

    // Verify all pending orders have status = 'PENDING'
    for (const po of kitchenRes.body.pending) {
      assert.strictEqual(po.status, 'PENDING');
      assert.ok(po.daily_order_number > 0);
      assert.ok(po.items.length > 0);
    }
    // Verify all settled orders have status = 'SETTLED'
    for (const so of kitchenRes.body.settled) {
      assert.strictEqual(so.status, 'SETTLED');
    }
    console.log('  [6.1] Kitchen public read-only endpoint verified: pending and settled queues separated, cancelled omitted.');

    // -------------------------------------------------------------------------
    // SECTION 7: Race Conditions on Concurrent State Mutations
    // -------------------------------------------------------------------------
    console.log('\n--- Section 7: Testing Race Conditions on State Transitions ---');

    // 7.1 Race between two concurrent SETTLE requests on the same order
    const raceOrder1Res = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [{ name: 'Tea', unitPrice: 15, quantity: 1 }],
        paymentMethod: 'Cash'
      }
    });
    const raceOrder1 = raceOrder1Res.body;

    const [settleA, settleB] = await Promise.all([
      httpRequest({ method: 'POST', path: `/api/orders/${raceOrder1.id}/done`, headers: authHeaders }),
      httpRequest({ method: 'POST', path: `/api/orders/${raceOrder1.id}/done`, headers: authHeaders })
    ]);

    const settleStatuses = [settleA.status, settleB.status].sort();
    // One must succeed (200) and the second must be rejected (409)
    assert.deepStrictEqual(settleStatuses, [200, 409], 'Concurrent duplicate settle: exactly one 200 and one 409 expected');
    console.log('  [7.1] Race between duplicate settles resolved safely: one 200, one 409.');

    // 7.2 Race between concurrent SETTLE and CANCEL on the same order
    const raceOrder2Res = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [{ name: 'Cold Coffee', unitPrice: 50, quantity: 1 }],
        paymentMethod: 'UPI'
      }
    });
    const raceOrder2 = raceOrder2Res.body;

    const [settleRes2, cancelRes2] = await Promise.all([
      httpRequest({ method: 'POST', path: `/api/orders/${raceOrder2.id}/done`, headers: authHeaders }),
      httpRequest({ method: 'DELETE', path: `/api/orders/${raceOrder2.id}`, headers: authHeaders })
    ]);

    const settleCancelStatuses = [settleRes2.status, cancelRes2.status].sort();
    assert.deepStrictEqual(settleCancelStatuses, [200, 409], 'Concurrent settle vs cancel: exactly one 200 and one 409 expected');

    // Verify order final state in DB is either SETTLED or CANCELLED
    const finalOrderRes = await httpRequest({
      method: 'GET',
      path: `/api/orders?status=ALL`,
      headers: authHeaders
    });
    // Check via DB directly
    const dbClient = getDbClient();
    const finalRow = await dbClient.execute({
      sql: `SELECT status FROM orders WHERE id = ?;`,
      args: [raceOrder2.id]
    });
    const finalStatus = finalRow.rows[0].status;
    assert.ok(
      finalStatus === 'SETTLED' || finalStatus === 'CANCELLED',
      `Order status must be either SETTLED or CANCELLED, got ${finalStatus}`
    );
    console.log(`  [7.2] Race between settle and cancel resolved deterministically: status = ${finalStatus}.`);

    // 7.3 High-load burst: 50 simultaneous orders
    console.log('  [7.3] Dispatching 50 concurrent order requests via Promise.all...');
    const highBurstRequests = Array.from({ length: 50 }, (_, idx) =>
      httpRequest({
        method: 'POST',
        path: '/api/orders',
        headers: authHeaders,
        body: {
          items: [{ name: 'Tea', unitPrice: 15, quantity: 1 }],
          paymentMethod: 'Cash',
          notes: `Burst 50 #${idx + 1}`
        }
      })
    );
    const highBurstResults = await Promise.all(highBurstRequests);
    for (let i = 0; i < highBurstResults.length; i++) {
      assert.strictEqual(highBurstResults[i].status, 201, `High-burst order #${i} failed: ${highBurstResults[i].status}`);
    }
    const highBurstNumbers = highBurstResults.map((r) => r.body.daily_order_number);
    const highBurstSet = new Set(highBurstNumbers);
    assert.strictEqual(highBurstSet.size, 50, 'All 50 high-burst orders must have unique numbers');
    console.log(`  [7.3] 50 simultaneous orders succeeded with 0 duplicates and 0 failures.`);

    // -------------------------------------------------------------------------
    // SECTION 8: Multi-Day Sequence Endurance
    // -------------------------------------------------------------------------
    console.log('\n--- Section 8: Testing Multi-Day Sequence Endurance (5 days) ---');
    const dates = ['2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05'];
    for (const d of dates) {
      await httpRequest({
        method: 'POST',
        path: '/api/test/set-time',
        body: { dateKey: d }
      });
      const dHeaders = { ...authHeaders, 'X-Mock-Date': d };

      // Create 4 orders on this day
      for (let orderNum = 1; orderNum <= 4; orderNum++) {
        const res = await httpRequest({
          method: 'POST',
          path: '/api/orders',
          headers: dHeaders,
          body: {
            items: [{ name: 'Espresso', unitPrice: 80, quantity: 1 }],
            paymentMethod: 'UPI'
          }
        });
        assert.strictEqual(res.status, 201);
        assert.strictEqual(res.body.daily_order_number, orderNum, `Date ${d} order ${orderNum} must be #${orderNum}`);
        assert.strictEqual(res.body.date_key, d);
      }
    }
    console.log('  [8.1] 5 consecutive days verified: every single day reset order sequence to #1, #2, #3, #4.');
    await httpRequest({ method: 'POST', path: '/api/test/reset-time' });

    console.log('\n========================================================================');
    console.log('✅ ALL ADVERSARIAL CHALLENGE TESTS PASSED CLEANLY (0 FAILURES)');
    console.log('========================================================================\n');

  } finally {
    if (server) {
      await stopServer();
      console.log('[Teardown] Server stopped.');
    }
  }
}

runAdversarialTestHarness().catch((err) => {
  console.error('\n❌ Adversarial Test Harness Failed:\n', err);
  process.exit(1);
});
