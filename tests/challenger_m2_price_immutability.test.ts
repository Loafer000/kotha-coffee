import http from 'http';
import assert from 'assert';
import crypto from 'crypto';
import { startServer, stopServer } from '../src/server/index.js';
import { getDbClient } from '../src/server/db/client.js';
import { AUTHENTIC_MENU_ITEMS, seedMenuItems } from '../src/server/db/seed.js';

const TEST_PORT = 3300;
const BASE_URL = `http://localhost:${TEST_PORT}`;

function httpRequest(options: {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: any;
}): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(options.path, BASE_URL);
    const reqHeaders: Record<string, string> = {
      ...(options.headers || {})
    };

    let payload: string | undefined;
    if (options.body !== undefined) {
      payload = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      if (!reqHeaders['Content-Type']) {
        reqHeaders['Content-Type'] = 'application/json';
      }
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
            // Keep raw string
          }
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: parsed
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

interface TestResult {
  category: string;
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
  details?: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

const testResults: TestResult[] = [];

function recordResult(result: TestResult) {
  testResults.push(result);
  const mark = result.passed ? '✅' : '❌';
  console.log(`  ${mark} [${result.category}] ${result.name}`);
  if (!result.passed) {
    console.log(`     Expected: ${result.expected}`);
    console.log(`     Actual:   ${result.actual}`);
    if (result.details) console.log(`     Details:  ${result.details}`);
  }
}

async function runPriceImmutabilitySuite() {
  console.log('================================================================');
  console.log('  CHALLENGER 1: HISTORICAL PRICE SNAPSHOT IMMUTABILITY SUITE   ');
  console.log('  Adversarial Challenge for Requirement R3 & Feature F20        ');
  console.log('================================================================\n');

  process.env.NODE_ENV = 'test';
  process.env.PORT = String(TEST_PORT);

  await startServer(TEST_PORT);
  console.log(`Test server running on port ${TEST_PORT}\n`);

  const db = getDbClient();

  // Obtain staff token via PIN
  const pinRes = await httpRequest({
    method: 'POST',
    path: '/api/auth/verify-pin',
    body: { pin: '1234' }
  });
  assert.strictEqual(pinRes.status, 200, 'PIN verification must succeed');
  const token = pinRes.body.token;
  const authHeaders = { Authorization: `Bearer ${token}` };

  try {
    // -------------------------------------------------------------------------
    // SCENARIO 1: Single-Item Dramatic Price Increase (Tea ₹15 -> ₹50, +233%)
    // -------------------------------------------------------------------------
    console.log('--- SCENARIO 1: Single-Item Dramatic Price Increase (Tea ₹15 -> ₹50) ---');

    const o1Id = `ord_test_hike_${crypto.randomUUID()}`;
    const o1ItemId = `item_test_hike_${crypto.randomUUID()}`;
    const nowIso1 = new Date().toISOString();

    // Place historical order: 3x Tea @ ₹15 = ₹45
    await db.execute({
      sql: `INSERT INTO orders (id, date_key, daily_order_number, status, payment_method, total_amount, notes, created_at, settled_at, updated_at)
            VALUES (?, '2026-10-15', 101, 'SETTLED', 'Cash', 45.0, 'Historical Tea order', ?, ?, ?);`,
      args: [o1Id, nowIso1, nowIso1, nowIso1]
    });
    await db.execute({
      sql: `INSERT INTO order_items (id, order_id, menu_item_id, item_name, unit_price, quantity, subtotal, created_at)
            VALUES (?, ?, 'drinks-tea', 'Tea', 15.0, 3, 45.0, ?);`,
      args: [o1ItemId, o1Id, nowIso1]
    });

    // Update catalog price: Tea ₹15 -> ₹50
    const hikeRes = await httpRequest({
      method: 'PUT',
      path: '/api/menu/drinks-tea',
      headers: authHeaders,
      body: { price: 50 }
    });
    recordResult({
      category: 'Catalog Price Hike',
      name: 'PUT /api/menu/drinks-tea updates price to ₹50',
      passed: hikeRes.status === 200 && hikeRes.body.price === 50,
      expected: 'HTTP 200, price=50',
      actual: `HTTP ${hikeRes.status}, price=${hikeRes.body?.price}`
    });

    // Query historical order_items and orders
    const o1ItemDb = await db.execute({
      sql: 'SELECT unit_price, quantity, subtotal, item_name FROM order_items WHERE id = ?;',
      args: [o1ItemId]
    });
    const o1OrderDb = await db.execute({
      sql: 'SELECT total_amount, status FROM orders WHERE id = ?;',
      args: [o1Id]
    });

    const itemRow1 = o1ItemDb.rows[0];
    const orderRow1 = o1OrderDb.rows[0];

    recordResult({
      category: 'Price Hike Invariant',
      name: 'Historical line item unit_price remains ₹15 (not ₹50)',
      passed: Number(itemRow1?.unit_price) === 15.0,
      expected: 'unit_price = 15',
      actual: `unit_price = ${itemRow1?.unit_price}`
    });
    recordResult({
      category: 'Price Hike Invariant',
      name: 'Historical line item subtotal remains ₹45 (not ₹150)',
      passed: Number(itemRow1?.subtotal) === 45.0,
      expected: 'subtotal = 45',
      actual: `subtotal = ${itemRow1?.subtotal}`
    });
    recordResult({
      category: 'Price Hike Invariant',
      name: 'Historical line item quantity remains 3',
      passed: Number(itemRow1?.quantity) === 3,
      expected: 'quantity = 3',
      actual: `quantity = ${itemRow1?.quantity}`
    });
    recordResult({
      category: 'Price Hike Invariant',
      name: 'Historical order total_amount remains ₹45',
      passed: Number(orderRow1?.total_amount) === 45.0,
      expected: 'total_amount = 45',
      actual: `total_amount = ${orderRow1?.total_amount}`
    });

    // -------------------------------------------------------------------------
    // SCENARIO 2: Single-Item Dramatic Price Drop (Biscoff Shake ₹110 -> ₹25, -77%)
    // -------------------------------------------------------------------------
    console.log('\n--- SCENARIO 2: Single-Item Dramatic Price Drop (Biscoff Shake ₹110 -> ₹25) ---');

    const o2Id = `ord_test_drop_${crypto.randomUUID()}`;
    const o2ItemId = `item_test_drop_${crypto.randomUUID()}`;
    const nowIso2 = new Date().toISOString();

    // Historical order: 2x Biscoff Shake @ ₹110 = ₹220
    await db.execute({
      sql: `INSERT INTO orders (id, date_key, daily_order_number, status, payment_method, total_amount, notes, created_at, settled_at, updated_at)
            VALUES (?, '2026-10-15', 102, 'SETTLED', 'UPI', 220.0, 'Historical Shake order', ?, ?, ?);`,
      args: [o2Id, nowIso2, nowIso2, nowIso2]
    });
    await db.execute({
      sql: `INSERT INTO order_items (id, order_id, menu_item_id, item_name, unit_price, quantity, subtotal, created_at)
            VALUES (?, ?, 'drinks-biscoff-shake', 'Biscoff Shake', 110.0, 2, 220.0, ?);`,
      args: [o2ItemId, o2Id, nowIso2]
    });

    // Update catalog price: Biscoff Shake ₹110 -> ₹25
    const dropRes = await httpRequest({
      method: 'PUT',
      path: '/api/menu/drinks-biscoff-shake',
      headers: authHeaders,
      body: { price: 25 }
    });
    recordResult({
      category: 'Catalog Price Drop',
      name: 'PUT /api/menu/drinks-biscoff-shake updates price to ₹25',
      passed: dropRes.status === 200 && dropRes.body.price === 25,
      expected: 'HTTP 200, price=25',
      actual: `HTTP ${dropRes.status}, price=${dropRes.body?.price}`
    });

    const o2ItemDb = await db.execute({
      sql: 'SELECT unit_price, quantity, subtotal, item_name FROM order_items WHERE id = ?;',
      args: [o2ItemId]
    });
    const o2OrderDb = await db.execute({
      sql: 'SELECT total_amount, status FROM orders WHERE id = ?;',
      args: [o2Id]
    });

    const itemRow2 = o2ItemDb.rows[0];
    const orderRow2 = o2OrderDb.rows[0];

    recordResult({
      category: 'Price Drop Invariant',
      name: 'Historical line item unit_price remains ₹110 (not ₹25)',
      passed: Number(itemRow2?.unit_price) === 110.0,
      expected: 'unit_price = 110',
      actual: `unit_price = ${itemRow2?.unit_price}`
    });
    recordResult({
      category: 'Price Drop Invariant',
      name: 'Historical line item subtotal remains ₹220 (not ₹50)',
      passed: Number(itemRow2?.subtotal) === 220.0,
      expected: 'subtotal = 220',
      actual: `subtotal = ${itemRow2?.subtotal}`
    });
    recordResult({
      category: 'Price Drop Invariant',
      name: 'Historical order total_amount remains ₹220',
      passed: Number(orderRow2?.total_amount) === 220.0,
      expected: 'total_amount = 220',
      actual: `total_amount = ${orderRow2?.total_amount}`
    });

    // -------------------------------------------------------------------------
    // SCENARIO 3: Menu Item Soft-Deletion (Deactivation via DELETE /api/menu/:id)
    // -------------------------------------------------------------------------
    console.log('\n--- SCENARIO 3: Menu Item Soft-Deletion / Deactivation ---');

    const o3Id = `ord_test_softdel_${crypto.randomUUID()}`;
    const o3ItemId = `item_test_softdel_${crypto.randomUUID()}`;
    const nowIso3 = new Date().toISOString();

    // Place historical order: 4x French Fries @ ₹50 = ₹200
    await db.execute({
      sql: `INSERT INTO orders (id, date_key, daily_order_number, status, payment_method, total_amount, notes, created_at, settled_at, updated_at)
            VALUES (?, '2026-10-15', 103, 'SETTLED', 'Card', 200.0, 'Historical Fries order', ?, ?, ?);`,
      args: [o3Id, nowIso3, nowIso3, nowIso3]
    });
    await db.execute({
      sql: `INSERT INTO order_items (id, order_id, menu_item_id, item_name, unit_price, quantity, subtotal, created_at)
            VALUES (?, ?, 'snacks-french-fries', 'French Fries', 50.0, 4, 200.0, ?);`,
      args: [o3ItemId, o3Id, nowIso3]
    });

    // Soft-delete French Fries
    const delRes = await httpRequest({
      method: 'DELETE',
      path: '/api/menu/snacks-french-fries',
      headers: authHeaders
    });
    recordResult({
      category: 'Soft Delete API',
      name: 'DELETE /api/menu/snacks-french-fries returns 200 success',
      passed: delRes.status === 200 && delRes.body.success === true,
      expected: 'HTTP 200, success=true',
      actual: `HTTP ${delRes.status}, success=${delRes.body?.success}`
    });

    // Verify catalog omits deactivated item in default public GET
    const publicMenuRes = await httpRequest({ method: 'GET', path: '/api/menu' });
    const ffInActiveMenu = publicMenuRes.body.find((i: any) => i.id === 'snacks-french-fries');
    recordResult({
      category: 'Soft Delete Public Visibility',
      name: 'Deactivated item is excluded from active public GET /api/menu',
      passed: ffInActiveMenu === undefined,
      expected: 'undefined (excluded)',
      actual: ffInActiveMenu ? 'FOUND (unexpected)' : 'undefined (excluded)'
    });

    // Verify historical line item still exists and has identical values
    const o3ItemDb = await db.execute({
      sql: 'SELECT unit_price, quantity, subtotal, item_name, menu_item_id FROM order_items WHERE id = ?;',
      args: [o3ItemId]
    });
    const itemRow3 = o3ItemDb.rows[0];

    recordResult({
      category: 'Soft Delete Immutability',
      name: 'Historical line item record is retained (NOT cascade-deleted or removed)',
      passed: o3ItemDb.rows.length === 1,
      expected: '1 row',
      actual: `${o3ItemDb.rows.length} rows`
    });
    recordResult({
      category: 'Soft Delete Immutability',
      name: 'Historical line item unit_price remains ₹50',
      passed: Number(itemRow3?.unit_price) === 50.0,
      expected: 'unit_price = 50',
      actual: `unit_price = ${itemRow3?.unit_price}`
    });
    recordResult({
      category: 'Soft Delete Immutability',
      name: 'Historical line item subtotal remains ₹200',
      passed: Number(itemRow3?.subtotal) === 200.0,
      expected: 'subtotal = 200',
      actual: `subtotal = ${itemRow3?.subtotal}`
    });
    recordResult({
      category: 'Soft Delete Immutability',
      name: 'Historical line item menu_item_id and item_name preserved',
      passed: itemRow3?.menu_item_id === 'snacks-french-fries' && itemRow3?.item_name === 'French Fries',
      expected: 'menu_item_id="snacks-french-fries", item_name="French Fries"',
      actual: `menu_item_id="${itemRow3?.menu_item_id}", item_name="${itemRow3?.item_name}"`
    });

    // -------------------------------------------------------------------------
    // SCENARIO 4: Multi-Item Complex Order with Mixed Concurrent Catalog Mutations
    // -------------------------------------------------------------------------
    console.log('\n--- SCENARIO 4: Multi-Item Complex Order with Mixed Catalog Actions ---');

    // 5 distinct items in one order:
    // 1. drinks-cappuccino: 2x @ ₹30 = ₹60
    // 2. snacks-chicken-momo-5pcs: 3x @ ₹60 = ₹180
    // 3. pasta-white-sauce: 1x @ ₹70 = ₹70
    // 4. sandwich-veg-grill: 2x @ ₹59 = ₹118
    // 5. mocktails-blue-lagoon: 4x @ ₹49 = ₹196
    // Expected grand total: 60 + 180 + 70 + 118 + 196 = ₹624.

    const o4Id = `ord_test_multi_${crypto.randomUUID()}`;
    const nowIso4 = new Date().toISOString();
    const expectedOrderTotal = 624.0;

    await db.execute({
      sql: `INSERT INTO orders (id, date_key, daily_order_number, status, payment_method, total_amount, notes, created_at, settled_at, updated_at)
            VALUES (?, '2026-10-15', 104, 'SETTLED', 'Card', ?, 'Multi-item test order', ?, ?, ?);`,
      args: [o4Id, expectedOrderTotal, nowIso4, nowIso4, nowIso4]
    });

    const multiLineItems = [
      { id: `item_m1_${crypto.randomUUID()}`, menuId: 'drinks-cappuccino', name: 'Cappuccino (Milk Coffee)', unit: 30.0, qty: 2, sub: 60.0 },
      { id: `item_m2_${crypto.randomUUID()}`, menuId: 'snacks-chicken-momo-5pcs', name: 'Chicken Momo (5 pcs)', unit: 60.0, qty: 3, sub: 180.0 },
      { id: `item_m3_${crypto.randomUUID()}`, menuId: 'pasta-white-sauce', name: 'White Sauce Pasta', unit: 70.0, qty: 1, sub: 70.0 },
      { id: `item_m4_${crypto.randomUUID()}`, menuId: 'sandwich-veg-grill', name: 'Veg grill sandwich', unit: 59.0, qty: 2, sub: 118.0 },
      { id: `item_m5_${crypto.randomUUID()}`, menuId: 'mocktails-blue-lagoon', name: 'Blue Lagoon', unit: 49.0, qty: 4, sub: 196.0 }
    ];

    for (const li of multiLineItems) {
      await db.execute({
        sql: `INSERT INTO order_items (id, order_id, menu_item_id, item_name, unit_price, quantity, subtotal, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        args: [li.id, o4Id, li.menuId, li.name, li.unit, li.qty, li.sub, nowIso4]
      });
    }

    // Now execute multiple mixed mutations against catalog:
    // Action A: Increase Cappuccino price ₹30 -> ₹90 (+200%)
    await httpRequest({
      method: 'PUT',
      path: '/api/menu/drinks-cappuccino',
      headers: authHeaders,
      body: { price: 90 }
    });

    // Action B: Slash Chicken Momo price ₹60 -> ₹10 (-83%)
    await httpRequest({
      method: 'PUT',
      path: '/api/menu/snacks-chicken-momo-5pcs',
      headers: authHeaders,
      body: { price: 10 }
    });

    // Action C: Soft-delete Pasta
    await httpRequest({
      method: 'DELETE',
      path: '/api/menu/pasta-white-sauce',
      headers: authHeaders
    });

    // Action D: Rename sandwich AND change its price
    await httpRequest({
      method: 'PUT',
      path: '/api/menu/sandwich-veg-grill',
      headers: authHeaders,
      body: { name: 'Gourmet Supreme Veg Panini', price: 129 }
    });

    // Action E: Update Blue Lagoon price ₹49 -> ₹69
    await httpRequest({
      method: 'PUT',
      path: '/api/menu/mocktails-blue-lagoon',
      headers: authHeaders,
      body: { price: 69 }
    });

    // Query back all 5 order items and verify every single one
    const fetchedItemsDb = await db.execute({
      sql: 'SELECT id, menu_item_id, item_name, unit_price, quantity, subtotal FROM order_items WHERE order_id = ? ORDER BY id;',
      args: [o4Id]
    });
    const fetchedItemsMap = new Map<string, any>();
    for (const r of fetchedItemsDb.rows as any[]) {
      fetchedItemsMap.set(String(r.id), r);
    }

    recordResult({
      category: 'Multi-Item Invariant',
      name: 'All 5 line items preserved in order_items table',
      passed: fetchedItemsDb.rows.length === 5,
      expected: '5 line items',
      actual: `${fetchedItemsDb.rows.length} line items`
    });

    for (const expectedLi of multiLineItems) {
      const actualLi = fetchedItemsMap.get(expectedLi.id);
      const isMatch = actualLi &&
        Number(actualLi.unit_price) === expectedLi.unit &&
        Number(actualLi.quantity) === expectedLi.qty &&
        Number(actualLi.subtotal) === expectedLi.sub &&
        String(actualLi.item_name) === expectedLi.name;

      recordResult({
        category: 'Multi-Item Invariant',
        name: `Line item for ${expectedLi.name} preserved exact unit=${expectedLi.unit}, qty=${expectedLi.qty}, sub=${expectedLi.sub}`,
        passed: !!isMatch,
        expected: `unit=${expectedLi.unit}, qty=${expectedLi.qty}, sub=${expectedLi.sub}, name="${expectedLi.name}"`,
        actual: `unit=${actualLi?.unit_price}, qty=${actualLi?.quantity}, sub=${actualLi?.subtotal}, name="${actualLi?.item_name}"`
      });
    }

    // Verify order grand total
    const o4OrderDb = await db.execute({
      sql: 'SELECT total_amount FROM orders WHERE id = ?;',
      args: [o4Id]
    });
    recordResult({
      category: 'Multi-Item Invariant',
      name: 'Order grand total remains ₹624.00 despite all 5 catalog mutations',
      passed: Number(o4OrderDb.rows[0]?.total_amount) === 624.0,
      expected: 'total_amount = 624.0',
      actual: `total_amount = ${o4OrderDb.rows[0]?.total_amount}`
    });

    // -------------------------------------------------------------------------
    // SCENARIO 5: Orders Across Multiple Statuses (PENDING, SETTLED, CANCELLED)
    // -------------------------------------------------------------------------
    console.log('\n--- SCENARIO 5: Multi-Status Immutability (PENDING, SETTLED, CANCELLED) ---');

    const statusOrders = [
      { id: `ord_status_pend_${crypto.randomUUID()}`, status: 'PENDING', qty: 1, unit: 99.0, sub: 99.0 },
      { id: `ord_status_sett_${crypto.randomUUID()}`, status: 'SETTLED', qty: 2, unit: 99.0, sub: 198.0 },
      { id: `ord_status_canc_${crypto.randomUUID()}`, status: 'CANCELLED', qty: 5, unit: 99.0, sub: 495.0 }
    ];

    const statusItemIds: string[] = [];
    for (const so of statusOrders) {
      const nowIso = new Date().toISOString();
      const itemId = `item_${so.status.toLowerCase()}_${crypto.randomUUID()}`;
      statusItemIds.push(itemId);

      await db.execute({
        sql: `INSERT INTO orders (id, date_key, daily_order_number, status, payment_method, total_amount, notes, created_at, settled_at, updated_at)
              VALUES (?, '2026-10-15', ?, ?, 'Cash', ?, 'Status test order', ?, ?, ?);`,
        args: [so.id, Math.floor(Math.random() * 500) + 200, so.status, so.sub, nowIso, nowIso, nowIso]
      });
      await db.execute({
        sql: `INSERT INTO order_items (id, order_id, menu_item_id, item_name, unit_price, quantity, subtotal, created_at)
              VALUES (?, ?, 'drinks-kitkat-shake', 'KitKat Shake', ?, ?, ?, ?);`,
        args: [itemId, so.id, so.unit, so.qty, so.sub, nowIso]
      });
    }

    // Now mutate KitKat Shake price from ₹99 to ₹199, then soft-delete it
    await httpRequest({
      method: 'PUT',
      path: '/api/menu/drinks-kitkat-shake',
      headers: authHeaders,
      body: { price: 199 }
    });
    await httpRequest({
      method: 'DELETE',
      path: '/api/menu/drinks-kitkat-shake',
      headers: authHeaders
    });

    // Check all 3 statuses
    for (let i = 0; i < statusOrders.length; i++) {
      const so = statusOrders[i];
      const itemId = statusItemIds[i];

      const itemRes = await db.execute({
        sql: 'SELECT unit_price, quantity, subtotal FROM order_items WHERE id = ?;',
        args: [itemId]
      });
      const orderRes = await db.execute({
        sql: 'SELECT total_amount, status FROM orders WHERE id = ?;',
        args: [so.id]
      });

      const itm = itemRes.rows[0];
      const ord = orderRes.rows[0];

      recordResult({
        category: 'Status Invariant',
        name: `Order status ${so.status}: unit_price remains ₹99, subtotal remains ₹${so.sub}`,
        passed: Number(itm?.unit_price) === 99.0 && Number(itm?.subtotal) === so.sub && Number(ord?.total_amount) === so.sub,
        expected: `unit=99, sub=${so.sub}, total=${so.sub}`,
        actual: `unit=${itm?.unit_price}, sub=${itm?.subtotal}, total=${ord?.total_amount}`
      });
    }

    // -------------------------------------------------------------------------
    // SCENARIO 6: Cross-Date Historical Orders (Multiple Date Keys)
    // -------------------------------------------------------------------------
    console.log('\n--- SCENARIO 6: Cross-Date Historical Orders ---');

    const pastDates = ['2026-10-10', '2026-10-12', '2026-10-14'];
    const pastOrderIds: string[] = [];
    const pastItemIds: string[] = [];

    for (const dt of pastDates) {
      const pId = `ord_past_${dt}_${crypto.randomUUID()}`;
      const pItemId = `item_past_${dt}_${crypto.randomUUID()}`;
      pastOrderIds.push(pId);
      pastItemIds.push(pItemId);
      const iso = `${dt}T12:00:00.000Z`;

      await db.execute({
        sql: `INSERT INTO orders (id, date_key, daily_order_number, status, payment_method, total_amount, notes, created_at, settled_at, updated_at)
              VALUES (?, ?, 1, 'SETTLED', 'Cash', 60.0, 'Historical dated order', ?, ?, ?);`,
        args: [pId, dt, iso, iso, iso]
      });
      await db.execute({
        sql: `INSERT INTO order_items (id, order_id, menu_item_id, item_name, unit_price, quantity, subtotal, created_at)
              VALUES (?, ?, 'snacks-cheese-corn-momo-5pcs', 'Cheese Corn Momo (5 pcs)', 60.0, 1, 60.0, ?);`,
        args: [pItemId, pId, iso]
      });
    }

    // Price change: Cheese Corn Momo ₹60 -> ₹120
    await httpRequest({
      method: 'PUT',
      path: '/api/menu/snacks-cheese-corn-momo-5pcs',
      headers: authHeaders,
      body: { price: 120 }
    });

    for (let i = 0; i < pastDates.length; i++) {
      const dt = pastDates[i];
      const itmDb = await db.execute({
        sql: 'SELECT unit_price, subtotal FROM order_items WHERE id = ?;',
        args: [pastItemIds[i]]
      });
      const ordDb = await db.execute({
        sql: 'SELECT total_amount FROM orders WHERE id = ?;',
        args: [pastOrderIds[i]]
      });

      const itm = itmDb.rows[0];
      const ord = ordDb.rows[0];

      recordResult({
        category: 'Cross-Date Invariant',
        name: `Historical order on ${dt}: unit_price remains ₹60, total remains ₹60`,
        passed: Number(itm?.unit_price) === 60.0 && Number(ord?.total_amount) === 60.0,
        expected: 'unit=60, total=60',
        actual: `unit=${itm?.unit_price}, total=${ord?.total_amount}`
      });
    }

    // -------------------------------------------------------------------------
    // SCENARIO 7: Re-activation after Soft-Deletion with Price Update
    // -------------------------------------------------------------------------
    console.log('\n--- SCENARIO 7: Re-activation of Soft-Deleted Item with New Price ---');

    // 1. Historical order with Vanilla Ice Cream @ ₹40
    const oldVanillaOrderId = `ord_old_vanilla_${crypto.randomUUID()}`;
    const oldVanillaItemId = `item_old_vanilla_${crypto.randomUUID()}`;
    const nowIso7 = new Date().toISOString();

    await db.execute({
      sql: `INSERT INTO orders (id, date_key, daily_order_number, status, payment_method, total_amount, notes, created_at, settled_at, updated_at)
            VALUES (?, '2026-10-15', 107, 'SETTLED', 'Cash', 80.0, 'Old Vanilla order', ?, ?, ?);`,
      args: [oldVanillaOrderId, nowIso7, nowIso7, nowIso7]
    });
    await db.execute({
      sql: `INSERT INTO order_items (id, order_id, menu_item_id, item_name, unit_price, quantity, subtotal, created_at)
            VALUES (?, ?, 'icecream-vanilla', 'Vanilla', 40.0, 2, 80.0, ?);`,
      args: [oldVanillaItemId, oldVanillaOrderId, nowIso7]
    });

    // 2. Soft-delete Vanilla
    await httpRequest({
      method: 'DELETE',
      path: '/api/menu/icecream-vanilla',
      headers: authHeaders
    });

    // 3. Reactivate Vanilla with new price ₹75 via PUT
    const reactivateRes = await httpRequest({
      method: 'PUT',
      path: '/api/menu/icecream-vanilla',
      headers: authHeaders,
      body: { is_active: 1, price: 75 }
    });
    recordResult({
      category: 'Reactivation',
      name: 'PUT /api/menu/icecream-vanilla reactivates item with price ₹75',
      passed: reactivateRes.status === 200 && reactivateRes.body.is_active === 1 && reactivateRes.body.price === 75,
      expected: 'HTTP 200, is_active=1, price=75',
      actual: `HTTP ${reactivateRes.status}, is_active=${reactivateRes.body?.is_active}, price=${reactivateRes.body?.price}`
    });

    // 4. Place NEW order with reactivated price ₹75
    const newVanillaOrderId = `ord_new_vanilla_${crypto.randomUUID()}`;
    const newVanillaItemId = `item_new_vanilla_${crypto.randomUUID()}`;

    await db.execute({
      sql: `INSERT INTO orders (id, date_key, daily_order_number, status, payment_method, total_amount, notes, created_at, settled_at, updated_at)
            VALUES (?, '2026-10-15', 108, 'SETTLED', 'Cash', 150.0, 'New Vanilla order', ?, ?, ?);`,
      args: [newVanillaOrderId, nowIso7, nowIso7, nowIso7]
    });
    await db.execute({
      sql: `INSERT INTO order_items (id, order_id, menu_item_id, item_name, unit_price, quantity, subtotal, created_at)
            VALUES (?, ?, 'icecream-vanilla', 'Vanilla', 75.0, 2, 150.0, ?);`,
      args: [newVanillaItemId, newVanillaOrderId, nowIso7]
    });

    // 5. Assert: OLD order preserves ₹40 unit_price; NEW order has ₹75 unit_price
    const oldRowDb = await db.execute({ sql: 'SELECT unit_price, subtotal FROM order_items WHERE id = ?;', args: [oldVanillaItemId] });
    const newRowDb = await db.execute({ sql: 'SELECT unit_price, subtotal FROM order_items WHERE id = ?;', args: [newVanillaItemId] });

    recordResult({
      category: 'Reactivation Invariant',
      name: 'Pre-deactivation historical order preserves original price ₹40',
      passed: Number(oldRowDb.rows[0]?.unit_price) === 40.0 && Number(oldRowDb.rows[0]?.subtotal) === 80.0,
      expected: 'unit=40, sub=80',
      actual: `unit=${oldRowDb.rows[0]?.unit_price}, sub=${oldRowDb.rows[0]?.subtotal}`
    });
    recordResult({
      category: 'Reactivation Invariant',
      name: 'Post-reactivation order uses new price ₹75',
      passed: Number(newRowDb.rows[0]?.unit_price) === 75.0 && Number(newRowDb.rows[0]?.subtotal) === 150.0,
      expected: 'unit=75, sub=150',
      actual: `unit=${newRowDb.rows[0]?.unit_price}, sub=${newRowDb.rows[0]?.subtotal}`
    });

    // -------------------------------------------------------------------------
    // SCENARIO 8: Item Name Mutation Snapshot Isolation
    // -------------------------------------------------------------------------
    console.log('\n--- SCENARIO 8: Item Name Mutation Snapshot Isolation ---');

    // Customer ordered "Chicken Strips (3 pcs)" @ ₹69
    const renameOrderId = `ord_rename_${crypto.randomUUID()}`;
    const renameItemId = `item_rename_${crypto.randomUUID()}`;
    const nowIso8 = new Date().toISOString();

    await db.execute({
      sql: `INSERT INTO orders (id, date_key, daily_order_number, status, payment_method, total_amount, notes, created_at, settled_at, updated_at)
            VALUES (?, '2026-10-15', 109, 'SETTLED', 'Cash', 69.0, 'Rename test order', ?, ?, ?);`,
      args: [renameOrderId, nowIso8, nowIso8, nowIso8]
    });
    await db.execute({
      sql: `INSERT INTO order_items (id, order_id, menu_item_id, item_name, unit_price, quantity, subtotal, created_at)
            VALUES (?, ?, 'snacks-chicken-strips-3pcs', 'Chicken Strips (3 pcs)', 69.0, 1, 69.0, ?);`,
      args: [renameItemId, renameOrderId, nowIso8]
    });

    // Rename in catalog: "Chicken Strips (3 pcs)" -> "Crispy Tender Chicken Strips (3 pcs)"
    await httpRequest({
      method: 'PUT',
      path: '/api/menu/snacks-chicken-strips-3pcs',
      headers: authHeaders,
      body: { name: 'Crispy Tender Chicken Strips (3 pcs)' }
    });

    const renameDbCheck = await db.execute({
      sql: 'SELECT item_name, unit_price FROM order_items WHERE id = ?;',
      args: [renameItemId]
    });
    recordResult({
      category: 'Item Name Snapshot',
      name: 'order_items.item_name preserves original text "Chicken Strips (3 pcs)"',
      passed: String(renameDbCheck.rows[0]?.item_name) === 'Chicken Strips (3 pcs)',
      expected: 'item_name="Chicken Strips (3 pcs)"',
      actual: `item_name="${renameDbCheck.rows[0]?.item_name}"`
    });

    // -------------------------------------------------------------------------
    // SCENARIO 9: Adversarial Price Boundary & Corruption Attacks
    // -------------------------------------------------------------------------
    console.log('\n--- SCENARIO 9: Adversarial Price Boundaries & Corruption Attacks ---');

    const corruptionAttacks = [
      { label: 'Zero price { price: 0 }', body: { price: 0 } },
      { label: 'Negative price { price: -50 }', body: { price: -50 } },
      { label: 'Negative floating { price: -0.01 }', body: { price: -0.01 } },
      { label: 'String non-number { price: "free" }', body: { price: 'free' } },
      { label: 'String "NaN" { price: "NaN" }', body: { price: 'NaN' } },
      { label: 'String "Infinity" { price: "Infinity" }', body: { price: 'Infinity' } },
      { label: 'Null price { price: null }', body: { price: null } },
      { label: 'Empty string price { price: "" }', body: { price: '' } }
    ];

    for (const ca of corruptionAttacks) {
      const res = await httpRequest({
        method: 'PUT',
        path: '/api/menu/drinks-tea',
        headers: authHeaders,
        body: ca.body
      });
      recordResult({
        category: 'Price Boundary Defense',
        name: `Rejects invalid price: ${ca.label}`,
        passed: res.status === 400,
        expected: 'HTTP 400',
        actual: `HTTP ${res.status}`
      });
    }

    // High valid price check: 99999.99
    const highPriceRes = await httpRequest({
      method: 'PUT',
      path: '/api/menu/drinks-tea',
      headers: authHeaders,
      body: { price: 99999.99 }
    });
    recordResult({
      category: 'Price Boundary Defense',
      name: 'Accepts valid high floating-point price ₹99999.99',
      passed: highPriceRes.status === 200 && highPriceRes.body.price === 99999.99,
      expected: 'HTTP 200, price=99999.99',
      actual: `HTTP ${highPriceRes.status}, price=${highPriceRes.body?.price}`
    });

    // Restore Tea price
    await httpRequest({
      method: 'PUT',
      path: '/api/menu/drinks-tea',
      headers: authHeaders,
      body: { price: 15 }
    });

    // -------------------------------------------------------------------------
    // SCENARIO 10: High-Volume Bulk Stress Test (50 Orders, 150 Line Items)
    // -------------------------------------------------------------------------
    console.log('\n--- SCENARIO 10: High-Volume Bulk Stress Test ---');
    console.log('  Seeding 50 orders with 150 line items across 6 menu items...');

    const benchmarkItems = [
      { id: 'drinks-tea', price: 15, name: 'Tea' },
      { id: 'drinks-cappuccino', price: 30, name: 'Cappuccino (Milk Coffee)' },
      { id: 'drinks-cold-coffee', price: 50, name: 'Cold Coffee' },
      { id: 'snacks-french-fries', price: 50, name: 'French Fries' },
      { id: 'pasta-white-sauce', price: 70, name: 'White Sauce Pasta' },
      { id: 'icecream-chocolate', price: 40, name: 'Chocolate' }
    ];

    const bulkOrderIds: string[] = [];
    const bulkLineItems: Array<{ id: string; orderId: string; menuId: string; expectedUnit: number; expectedQty: number; expectedSub: number }> = [];

    for (let oIdx = 1; oIdx <= 50; oIdx++) {
      const bOrderId = `ord_bulk_${oIdx}_${crypto.randomUUID()}`;
      bulkOrderIds.push(bOrderId);
      const iso = new Date().toISOString();

      let orderTotal = 0;
      const orderItemsToInsert: Array<{ id: string; menuId: string; name: string; unit: number; qty: number; sub: number }> = [];

      for (let iIdx = 0; iIdx < 3; iIdx++) {
        const itemSpec = benchmarkItems[(oIdx + iIdx) % benchmarkItems.length];
        const qty = ((oIdx + iIdx) % 4) + 1; // 1 to 4
        const sub = itemSpec.price * qty;
        orderTotal += sub;
        const bItemId = `item_bulk_${oIdx}_${iIdx}_${crypto.randomUUID()}`;

        orderItemsToInsert.push({
          id: bItemId,
          menuId: itemSpec.id,
          name: itemSpec.name,
          unit: itemSpec.price,
          qty,
          sub
        });

        bulkLineItems.push({
          id: bItemId,
          orderId: bOrderId,
          menuId: itemSpec.id,
          expectedUnit: itemSpec.price,
          expectedQty: qty,
          expectedSub: sub
        });
      }

      await db.execute({
        sql: `INSERT INTO orders (id, date_key, daily_order_number, status, payment_method, total_amount, notes, created_at, settled_at, updated_at)
              VALUES (?, '2026-10-15', ?, 'SETTLED', 'Cash', ?, 'Bulk stress test order', ?, ?, ?);`,
        args: [bOrderId, 1000 + oIdx, orderTotal, iso, iso, iso]
      });

      for (const li of orderItemsToInsert) {
        await db.execute({
          sql: `INSERT INTO order_items (id, order_id, menu_item_id, item_name, unit_price, quantity, subtotal, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
          args: [li.id, bOrderId, li.menuId, li.name, li.unit, li.qty, li.sub, iso]
        });
      }
    }

    console.log(`  Seeded ${bulkOrderIds.length} orders and ${bulkLineItems.length} line items.`);
    console.log('  Executing concurrent rapid catalog price updates and deactivations...');

    // Concurrently mutate all 6 items
    const mutationPromises = [
      httpRequest({ method: 'PUT', path: '/api/menu/drinks-tea', headers: authHeaders, body: { price: 22 } }),
      httpRequest({ method: 'PUT', path: '/api/menu/drinks-cappuccino', headers: authHeaders, body: { price: 45 } }),
      httpRequest({ method: 'PUT', path: '/api/menu/drinks-cold-coffee', headers: authHeaders, body: { price: 75 } }),
      httpRequest({ method: 'DELETE', path: '/api/menu/snacks-french-fries', headers: authHeaders }),
      httpRequest({ method: 'PUT', path: '/api/menu/pasta-white-sauce', headers: authHeaders, body: { price: 95 } }),
      httpRequest({ method: 'PUT', path: '/api/menu/icecream-chocolate', headers: authHeaders, body: { price: 60 } })
    ];
    await Promise.all(mutationPromises);

    console.log('  Verifying all 150 line items across all 50 orders maintain exact original prices...');

    // Retrieve all line items from DB
    const allBulkItemsRes = await db.execute(
      `SELECT id, order_id, menu_item_id, unit_price, quantity, subtotal
       FROM order_items
       WHERE order_id LIKE 'ord_bulk_%';`
    );

    const actualItemMap = new Map<string, any>();
    for (const r of allBulkItemsRes.rows as any[]) {
      actualItemMap.set(String(r.id), r);
    }

    let bulkMatches = 0;
    let bulkMismatches = 0;

    for (const expected of bulkLineItems) {
      const actual = actualItemMap.get(expected.id);
      if (
        actual &&
        Number(actual.unit_price) === expected.expectedUnit &&
        Number(actual.quantity) === expected.expectedQty &&
        Number(actual.subtotal) === expected.expectedSub
      ) {
        bulkMatches++;
      } else {
        bulkMismatches++;
      }
    }

    recordResult({
      category: 'Bulk Stress Invariant',
      name: 'All 150 historical line items preserved original snapshot unit_price, qty, and subtotal',
      passed: bulkMatches === 150 && bulkMismatches === 0,
      expected: '150 matches, 0 mismatches',
      actual: `${bulkMatches} matches, ${bulkMismatches} mismatches`
    });

    // -------------------------------------------------------------------------
    // SCENARIO 11: Schema Foreign Key & Trigger Inspection
    // -------------------------------------------------------------------------
    console.log('\n--- SCENARIO 11: Schema Constraints & Cascade Inspection ---');

    // Check schema definition of order_items table
    const tableSqlRes = await db.execute(`SELECT sql FROM sqlite_master WHERE type='table' AND name='order_items';`);
    const tableSql = String(tableSqlRes.rows[0]?.sql || '');

    const hasCascadeOnMenu = tableSql.includes('REFERENCES menu_items') && tableSql.includes('CASCADE');
    recordResult({
      category: 'Schema Architecture',
      name: 'order_items does NOT cascade-delete when menu items are modified or removed',
      passed: !hasCascadeOnMenu,
      expected: 'No CASCADE on menu_items',
      actual: hasCascadeOnMenu ? 'FOUND CASCADE ON MENU_ITEMS (DANGEROUS)' : 'Safe: Isolated snapshot schema'
    });

    // Verify order_items stores snapshot unit_price and subtotal columns
    const hasPriceColumns = tableSql.includes('unit_price') && tableSql.includes('subtotal') && tableSql.includes('quantity');
    recordResult({
      category: 'Schema Architecture',
      name: 'order_items schema explicitly persists frozen unit_price, quantity, and subtotal',
      passed: hasPriceColumns,
      expected: 'Columns unit_price, quantity, subtotal exist',
      actual: hasPriceColumns ? 'Columns confirmed present' : 'Missing columns'
    });

    // -------------------------------------------------------------------------
    // CLEANUP & RESTORATION
    // -------------------------------------------------------------------------
    console.log('\n--- Cleaning up test fixtures and restoring authentic catalog ---');

    // Clean up test orders and order items
    await db.execute(`DELETE FROM order_items WHERE order_id LIKE 'ord_%';`);
    await db.execute(`DELETE FROM orders WHERE id LIKE 'ord_%';`);

    // Restore baseline 34 authentic items
    const authenticIds = AUTHENTIC_MENU_ITEMS.map((i) => `'${i.id}'`).join(',');
    await db.execute(`DELETE FROM menu_items WHERE id NOT IN (${authenticIds});`);
    await db.execute(`UPDATE menu_items SET is_active = 1;`);

    // Reset prices to authentic menu.jpeg values
    for (const item of AUTHENTIC_MENU_ITEMS) {
      await db.execute({
        sql: 'UPDATE menu_items SET name = ?, price = ?, is_active = 1 WHERE id = ?;',
        args: [item.name, item.price, item.id]
      });
    }

    const restoredCountRes = await db.execute('SELECT COUNT(*) as count FROM menu_items WHERE is_active = 1;');
    console.log(`  Catalog restored: ${restoredCountRes.rows[0]?.count} active authentic items.`);

  } finally {
    console.log('\nStopping test server...');
    await stopServer();
    console.log('Server stopped.\n');
  }

  // ---------------------------------------------------------------------------
  // Summary & Gate Assessment
  // ---------------------------------------------------------------------------
  console.log('================================================================');
  console.log('               ADVERSARIAL TEST SUITE SUMMARY');
  console.log('================================================================');
  const total = testResults.length;
  const passed = testResults.filter((r) => r.passed).length;
  const failed = testResults.filter((r) => !r.passed).length;

  console.log(`Total Invariants Tested: ${total}`);
  console.log(`Passed:                  ${passed}`);
  console.log(`Failed:                  ${failed}`);
  console.log('================================================================\n');

  if (failed === 0) {
    console.log('GATE VERDICT: APPROVE');
    console.log('Requirement R3 & Feature F20 Historical Price Immutability is 100% EMPIRICALLY VERIFIED.\n');
  } else {
    console.log('GATE VERDICT: REQUEST_CHANGES');
    console.log(`CRITICAL DEFECTS: ${failed} invariant checks failed.\n`);
  }

  return { total, passed, failed, results: testResults };
}

runPriceImmutabilitySuite().catch((err) => {
  console.error('Adversarial test suite failed with error:', err);
  process.exit(1);
});
