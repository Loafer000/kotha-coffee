import http from 'http';
import assert from 'assert';
import { startServer, stopServer } from '../src/server/index.js';
import { getDbClient } from '../src/server/db/client.js';

const TEST_PORT = 3201;
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
            // keep raw
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

async function runForensicProbe() {
  console.log('========================================================');
  console.log('=== FORENSIC AUDIT EMPIRICAL PROBE FOR MILESTONE 3 ===');
  console.log('========================================================\n');

  let server: any;
  try {
    server = await startServer(TEST_PORT);
    const db = getDbClient();

    // Reset test database and test clock
    await httpRequest({ method: 'POST', path: '/api/test/reset' });
    await httpRequest({ method: 'POST', path: '/api/test/reset-time' });

    // 1. PIN Auth
    console.log('[Check 1] Verifying PIN authentication and 12h session token...');
    const authRes = await httpRequest({
      method: 'POST',
      path: '/api/auth/verify-pin',
      body: { pin: '1234' }
    });
    assert.strictEqual(authRes.status, 200, 'PIN verification must return 200');
    assert.ok(authRes.body.token, 'Must return session token');
    const token = authRes.body.token;
    const authHeaders = { Authorization: `Bearer ${token}` };
    console.log('  -> PASS: Valid session token acquired.\n');

    // 2. Direct SQLite Persistence Verification
    console.log('[Check 2] Verifying authentic SQLite persistence (orders & order_items tables)...');
    const createRes1 = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [
          { name: 'Tea', unitPrice: 15, quantity: 2 },
          { name: 'Chicken Momo (5 pcs)', unitPrice: 60, quantity: 1 }
        ],
        paymentMethod: 'Cash',
        notes: 'Forensic persistence test order'
      }
    });
    assert.strictEqual(createRes1.status, 201, 'Order creation must return 201');
    const order1 = createRes1.body;

    // Settle Order 1
    const doneRes = await httpRequest({
      method: 'POST',
      path: `/api/orders/${order1.id}/done`,
      headers: authHeaders
    });
    assert.strictEqual(doneRes.status, 200, 'Settle order must return 200');

    // DIRECT SQLITE DATABASE INSPECTION
    const ordersInDb = await db.execute({
      sql: 'SELECT id, date_key, daily_order_number, status, payment_method, total_amount, notes, created_at, settled_at, updated_at FROM orders WHERE id = ?;',
      args: [order1.id]
    });
    assert.strictEqual(ordersInDb.rows.length, 1, 'Physical row must exist in SQLite orders table');
    const dbOrder = ordersInDb.rows[0];
    console.log('  Raw orders table row in SQLite:', JSON.stringify(dbOrder));
    assert.strictEqual(String(dbOrder.id), order1.id);
    assert.strictEqual(Number(dbOrder.daily_order_number), 1);
    assert.strictEqual(String(dbOrder.status), 'SETTLED');
    assert.strictEqual(String(dbOrder.payment_method), 'Cash');
    assert.strictEqual(Number(dbOrder.total_amount), 90);
    assert.strictEqual(String(dbOrder.notes), 'Forensic persistence test order');
    assert.ok(dbOrder.created_at, 'created_at must be populated');
    assert.ok(dbOrder.settled_at, 'settled_at must be populated');
    assert.ok(Date.parse(String(dbOrder.settled_at)) > 0, 'settled_at must be a genuine ISO timestamp');

    const itemsInDb = await db.execute({
      sql: 'SELECT id, order_id, item_name, unit_price, quantity, subtotal, created_at FROM order_items WHERE order_id = ? ORDER BY unit_price ASC;',
      args: [order1.id]
    });
    assert.strictEqual(itemsInDb.rows.length, 2, 'Physical rows must exist in SQLite order_items table');
    console.log('  Raw order_items table rows in SQLite:', JSON.stringify(itemsInDb.rows));
    
    // Check item 1
    assert.strictEqual(String(itemsInDb.rows[0].item_name), 'Tea');
    assert.strictEqual(Number(itemsInDb.rows[0].unit_price), 15);
    assert.strictEqual(Number(itemsInDb.rows[0].quantity), 2);
    assert.strictEqual(Number(itemsInDb.rows[0].subtotal), 30);
    assert.strictEqual(String(itemsInDb.rows[0].order_id), order1.id);

    // Check item 2
    assert.strictEqual(String(itemsInDb.rows[1].item_name), 'Chicken Momo (5 pcs)');
    assert.strictEqual(Number(itemsInDb.rows[1].unit_price), 60);
    assert.strictEqual(Number(itemsInDb.rows[1].quantity), 1);
    assert.strictEqual(Number(itemsInDb.rows[1].subtotal), 60);
    assert.strictEqual(String(itemsInDb.rows[1].order_id), order1.id);

    console.log('  -> PASS: Genuine SQLite database persistence confirmed with real rows, timestamps, and foreign keys.\n');

    // 3. Price Freezing Verification
    console.log('[Check 3] Verifying physical price freezing in order_items (historical price immutability)...');
    const createRes2 = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [{ menuItemId: 'drinks-cold-coffee', name: 'Cold Coffee', unitPrice: 50, quantity: 2 }],
        paymentMethod: 'UPI'
      }
    });
    assert.strictEqual(createRes2.status, 201);
    const order2 = createRes2.body;

    // Mutate catalog price of Cold Coffee from 50 to 888 in SQLite
    await db.execute("UPDATE menu_items SET price = 888.0 WHERE id = 'drinks-cold-coffee';");

    // Inspect SQLite order_items row directly
    const itemsOrder2 = await db.execute({
      sql: 'SELECT unit_price, subtotal FROM order_items WHERE order_id = ?;',
      args: [order2.id]
    });
    assert.strictEqual(Number(itemsOrder2.rows[0].unit_price), 50, 'order_items unit_price must remain 50 in SQLite');
    assert.strictEqual(Number(itemsOrder2.rows[0].subtotal), 100, 'order_items subtotal must remain 100 in SQLite');

    // Inspect SQLite orders row directly
    const order2InDb = await db.execute({
      sql: 'SELECT total_amount FROM orders WHERE id = ?;',
      args: [order2.id]
    });
    assert.strictEqual(Number(order2InDb.rows[0].total_amount), 100, 'orders total_amount must remain 100 in SQLite');

    // Restore catalog price
    await db.execute("UPDATE menu_items SET price = 50.0 WHERE id = 'drinks-cold-coffee';");
    console.log('  -> PASS: Price freezing confirmed. Menu catalog changes do NOT affect historical order_items columns.\n');

    // 4. Built Assets and Express Route Serving Verification
    console.log('[Check 4] Verifying built assets in dist/client/ and Express route serving (no 404s)...');
    const routes = ['/', '/reception', '/kitchen', '/analytics'];
    for (const route of routes) {
      const res = await httpRequest({
        method: 'GET',
        path: route,
        headers: { Accept: 'text/html' }
      });
      assert.strictEqual(res.status, 200, `Route ${route} must return HTTP 200`);
      assert.ok(res.headers['content-type']?.includes('text/html'), `Route ${route} must return Content-Type text/html`);
      assert.ok(!res.raw.includes('Cannot GET'), `Route ${route} must not return Express 404 error`);
      assert.ok(res.raw.includes('div id="root"'), `Route ${route} must contain React root div`);
      assert.ok(res.raw.includes('/assets/index-'), `Route ${route} must link to compiled Vite asset bundle`);
      console.log(`     Route "${route}" -> HTTP 200 (HTML verified)`);
    }

    // Verify actual JS bundle delivery
    const rootHtml = (await httpRequest({ method: 'GET', path: '/' })).raw;
    const jsMatch = rootHtml.match(/\/assets\/index-[a-zA-Z0-9_-]+\.js/);
    assert.ok(jsMatch, 'Root HTML must contain compiled JS bundle script reference');
    const jsUrl = jsMatch[0];
    const jsRes = await httpRequest({ method: 'GET', path: jsUrl });
    assert.strictEqual(jsRes.status, 200, 'Compiled JS bundle must return HTTP 200');
    assert.ok(jsRes.raw.length > 50000, `JS bundle size (${jsRes.raw.length} bytes) must be genuine compiled React application (> 50KB)`);
    console.log(`     Compiled JS Bundle: ${jsUrl} (${jsRes.raw.length} bytes delivered)`);

    // Verify actual CSS delivery
    const cssMatch = rootHtml.match(/\/assets\/index-[a-zA-Z0-9_-]+\.css/);
    assert.ok(cssMatch, 'Root HTML must contain compiled CSS stylesheet reference');
    const cssUrl = cssMatch[0];
    const cssRes = await httpRequest({ method: 'GET', path: cssUrl });
    assert.strictEqual(cssRes.status, 200, 'Compiled CSS bundle must return HTTP 200');
    assert.ok(cssRes.raw.length > 5000, `CSS bundle size (${cssRes.raw.length} bytes) must be genuine compiled Tailwind stylesheet (> 5KB)`);
    console.log(`     Compiled CSS Bundle: ${cssUrl} (${cssRes.raw.length} bytes delivered)`);

    console.log('  -> PASS: Express server genuinely serves compiled React SPA and assets without stubs or 404s.\n');

    // 5. Invariant & Security Enforcement
    console.log('[Check 5] Verifying state transition invariants and security boundaries...');
    // Settling already settled order
    const repeatDone = await httpRequest({
      method: 'POST',
      path: `/api/orders/${order1.id}/done`,
      headers: authHeaders
    });
    assert.strictEqual(repeatDone.status, 409, 'Repeat settle must return HTTP 409 Conflict');

    // Editing settled order
    const editSettled = await httpRequest({
      method: 'PATCH',
      path: `/api/orders/${order1.id}`,
      headers: authHeaders,
      body: { paymentMethod: 'UPI' }
    });
    assert.strictEqual(editSettled.status, 409, 'Editing settled order must return HTTP 409 Conflict');

    // Cancelling settled order
    const cancelSettled = await httpRequest({
      method: 'DELETE',
      path: `/api/orders/${order1.id}`,
      headers: authHeaders
    });
    assert.strictEqual(cancelSettled.status, 409, 'Cancelling settled order must return HTTP 409 Conflict');

    // Unauthenticated mutations
    const unauthPost = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      body: { items: [{ name: 'Tea', unitPrice: 15, quantity: 1 }], paymentMethod: 'Cash' }
    });
    assert.strictEqual(unauthPost.status, 401, 'Unauthenticated order creation must return 401');

    console.log('  -> PASS: Invariants enforced (409 on invalid transitions, 401 on unauthenticated attempts).\n');

    // 6. Concurrency Stress Test
    console.log('[Check 6] Concurrency stress test: 10 parallel order placement requests...');
    const parallelCalls = Array.from({ length: 10 }).map((_, i) =>
      httpRequest({
        method: 'POST',
        path: '/api/orders',
        headers: authHeaders,
        body: {
          items: [{ name: 'Tea', unitPrice: 15, quantity: 1 }],
          paymentMethod: 'Cash',
          notes: `Concurrent test order #${i + 1}`
        }
      })
    );
    const parallelResults = await Promise.all(parallelCalls);
    for (const r of parallelResults) {
      assert.strictEqual(r.status, 201, 'Concurrent order request must return 201');
    }
    const orderNumbers = parallelResults.map((r) => r.body.daily_order_number);
    const uniqueSet = new Set(orderNumbers);
    assert.strictEqual(uniqueSet.size, 10, 'All 10 concurrent orders must have unique sequence numbers');
    console.log(`  Assigned sequence numbers: ${orderNumbers.sort((a, b) => a - b).join(', ')}`);
    console.log('  -> PASS: Concurrency test passed with zero duplicate sequence numbers.\n');

    console.log('========================================================');
    console.log('✅ ALL FORENSIC EMPIRICAL CHECKS PASSED CLEANLY!');
    console.log('========================================================\n');

  } finally {
    if (server) {
      await stopServer();
    }
  }
}

runForensicProbe().catch((err) => {
  console.error('\n❌ FORENSIC EMPIRICAL PROBE FAILED:\n', err);
  process.exit(1);
});
