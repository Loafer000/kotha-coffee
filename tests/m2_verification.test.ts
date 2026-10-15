import http from 'http';
import assert from 'assert';
import crypto from 'crypto';
import { startServer, stopServer } from '../src/server/index.js';
import { getDbClient } from '../src/server/db/client.js';
import { AUTHENTIC_MENU_ITEMS, AUTHENTIC_CATEGORIES, seedMenuItems } from '../src/server/db/seed.js';

const TEST_PORT = 3105;
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

async function runM2Verification() {
  console.log('========================================================');
  console.log('=== Starting Milestone 2 Verification Test Suite ===');
  console.log('========================================================\n');

  process.env.NODE_ENV = 'test';
  process.env.PORT = String(TEST_PORT);

  // 1. Boot Express server and initialize database tables
  console.log('Step 1: Starting Express server and initializing database schema...');
  await startServer(TEST_PORT);
  console.log('   Server running on ' + BASE_URL + '\n');

  const db = getDbClient();

  try {
    // 2. Seed Data Verification
    console.log('Step 2: Verifying database catalog seeded with all 34 authentic items from menu.jpeg...');
    const authenticIds = AUTHENTIC_MENU_ITEMS.map((i) => `'${i.id}'`).join(',');
    await db.execute(`DELETE FROM menu_items WHERE id NOT IN (${authenticIds});`);
    await db.execute(`UPDATE menu_items SET is_active = 1 WHERE is_active = 0;`);
    await seedMenuItems(db);

    const allDbItems = await db.execute('SELECT * FROM menu_items ORDER BY display_order ASC;');
    assert.strictEqual(
      allDbItems.rows.length,
      34,
      `Expected exactly 34 menu items in database, found ${allDbItems.rows.length}`
    );
    console.log(`   Database contains exactly ${allDbItems.rows.length} seeded items.`);

    // 2.1 Verify all 6 authentic categories exist
    const categoriesInDb = new Set(allDbItems.rows.map((r: any) => String(r.category)));
    for (const cat of AUTHENTIC_CATEGORIES) {
      assert.ok(
        categoriesInDb.has(cat),
        `Missing expected authentic category: ${cat}`
      );
    }
    assert.strictEqual(
      categoriesInDb.size,
      6,
      `Expected 6 distinct categories, found ${categoriesInDb.size}`
    );
    console.log('   All 6 categories verified: ' + Array.from(categoriesInDb).join(', '));

    // 2.2 Verify category counts match authentic menu distribution
    const categoryCounts: Record<string, number> = {};
    for (const r of allDbItems.rows as any[]) {
      categoryCounts[r.category] = (categoryCounts[r.category] || 0) + 1;
    }
    assert.strictEqual(categoryCounts['Drinks'], 9, 'Expected 9 Drinks');
    assert.strictEqual(categoryCounts['Snacks'], 13, 'Expected 13 Snacks');
    assert.strictEqual(categoryCounts['Pasta'], 1, 'Expected 1 Pasta');
    assert.strictEqual(categoryCounts['Sandwich'], 4, 'Expected 4 Sandwiches');
    assert.strictEqual(categoryCounts['Mocktails'], 4, 'Expected 4 Mocktails');
    assert.strictEqual(categoryCounts['Ice Cream'], 3, 'Expected 3 Ice Creams');
    console.log('   Category item distribution verified (9 Drinks, 13 Snacks, 1 Pasta, 4 Sandwiches, 4 Mocktails, 3 Ice Creams).');

    // 2.3 Verify exact authentic prices for key benchmark items from menu.jpeg
    const itemMap = new Map<string, any>();
    for (const r of allDbItems.rows as any[]) {
      itemMap.set(String(r.id), r);
    }

    const priceChecks: Array<[string, string, number]> = [
      ['drinks-tea', 'Tea', 15],
      ['drinks-cappuccino', 'Cappuccino (Milk Coffee)', 30],
      ['drinks-cold-coffee', 'Cold Coffee', 50],
      ['drinks-cold-coffee-ice-cream', 'Cold Coffee / with Ice Cream', 70],
      ['drinks-biscoff-shake', 'Biscoff Shake', 110],
      ['snacks-chicken-momo-5pcs', 'Chicken Momo (5 pcs)', 60],
      ['snacks-french-fries', 'French Fries', 50],
      ['snacks-chicken-cheese-loaded-fries', 'Chicken Cheese Loaded Fries', 89],
      ['pasta-white-sauce', 'White Sauce Pasta', 70],
      ['sandwich-veg-grill', 'Veg grill sandwich', 59],
      ['sandwich-chicken-cheese-grill', 'Chicken cheese grill sandwich', 89],
      ['mocktails-green-mint-mojito', 'Green Mint Mojito', 49],
      ['icecream-chocolate', 'Chocolate', 40],
      ['icecream-vanilla', 'Vanilla', 40],
      ['icecream-butterscotch', 'Butterscotch', 40]
    ];

    for (const [id, expectedName, expectedPrice] of priceChecks) {
      const item = itemMap.get(id);
      assert.ok(item, `Seeded item ${id} not found in database`);
      assert.strictEqual(String(item.name), expectedName, `Item ${id} name mismatch`);
      assert.strictEqual(Number(item.price), expectedPrice, `Item ${id} price mismatch: expected ${expectedPrice}, got ${item.price}`);
      assert.strictEqual(Number(item.is_active), 1, `Item ${id} should be active`);
    }
    console.log('   All sample authentic menu items & prices verified against menu.jpeg.');

    // 2.4 Verify seed function idempotency
    const reseedResult = await seedMenuItems(db);
    assert.strictEqual(reseedResult.seeded, false, 'Second seed call must not duplicate items');
    assert.strictEqual(reseedResult.count, 34, 'Item count must remain 34');
    console.log('   seedMenuItems idempotency verified.\n');

    // 3. Public GET /api/menu
    console.log('Step 3: Verifying public GET /api/menu (unauthenticated)...');
    const publicMenuRes = await httpRequest({
      method: 'GET',
      path: '/api/menu'
    });
    assert.strictEqual(publicMenuRes.status, 200, 'GET /api/menu must return 200');
    assert.ok(Array.isArray(publicMenuRes.body), 'Response must be an array');
    assert.strictEqual(publicMenuRes.body.length, 34, 'Must return all 34 active items');

    // Verify all returned items have is_active = 1
    for (const item of publicMenuRes.body) {
      assert.strictEqual(item.is_active, 1, `Item ${item.id} returned in active menu must have is_active=1`);
      assert.ok(typeof item.id === 'string' && item.id.length > 0);
      assert.ok(typeof item.name === 'string' && item.name.length > 0);
      assert.ok(typeof item.category === 'string' && item.category.length > 0);
      assert.ok(typeof item.price === 'number' && item.price > 0);
    }
    console.log('   Public GET /api/menu returned 34 active items correctly structured.\n');

    // 4. Protected Routes Guard (Unauthenticated requests rejected with 401)
    console.log('Step 4: Verifying route guards reject unauthenticated mutations with 401...');

    // 4.1 POST /api/menu without auth
    const unauthPost = await httpRequest({
      method: 'POST',
      path: '/api/menu',
      body: { name: 'Test Item', category: 'Snacks', price: 50 }
    });
    assert.strictEqual(unauthPost.status, 401, 'Unauthenticated POST /api/menu must return 401');
    assert.deepStrictEqual(unauthPost.body, { error: 'Unauthorized' });

    // 4.2 PUT /api/menu/:id without auth
    const unauthPut = await httpRequest({
      method: 'PUT',
      path: '/api/menu/drinks-tea',
      body: { price: 20 }
    });
    assert.strictEqual(unauthPut.status, 401, 'Unauthenticated PUT /api/menu/:id must return 401');
    assert.deepStrictEqual(unauthPut.body, { error: 'Unauthorized' });

    // 4.3 DELETE /api/menu/:id without auth
    const unauthDelete = await httpRequest({
      method: 'DELETE',
      path: '/api/menu/drinks-tea'
    });
    assert.strictEqual(unauthDelete.status, 401, 'Unauthenticated DELETE /api/menu/:id must return 401');
    assert.deepStrictEqual(unauthDelete.body, { error: 'Unauthorized' });

    // 4.4 Requests with invalid token
    const invalidTokenPost = await httpRequest({
      method: 'POST',
      path: '/api/menu',
      headers: { Authorization: 'Bearer bogus-invalid-jwt-token-12345' },
      body: { name: 'Test Item', category: 'Snacks', price: 50 }
    });
    assert.strictEqual(invalidTokenPost.status, 401, 'Invalid token POST must return 401');
    assert.deepStrictEqual(invalidTokenPost.body, { error: 'Unauthorized' });
    console.log('   Route guarding verified: POST, PUT, DELETE all return HTTP 401 without valid session.\n');

    // 5. PIN Authentication to obtain Reception token
    console.log('Step 5: Authenticating reception session with PIN...');
    const pinRes = await httpRequest({
      method: 'POST',
      path: '/api/auth/verify-pin',
      body: { pin: '1234' }
    });
    assert.strictEqual(pinRes.status, 200, 'PIN 1234 verification must succeed');
    const token = pinRes.body.token;
    assert.ok(token, 'Session token must be present');
    const authHeaders = { Authorization: `Bearer ${token}` };
    console.log('   Session token acquired successfully.\n');

    // 6. Adding Menu Items (POST /api/menu)
    console.log('Step 6: Verifying POST /api/menu validation and creation with valid session...');

    // 6.1 Validation: Empty name
    const emptyNameRes = await httpRequest({
      method: 'POST',
      path: '/api/menu',
      headers: authHeaders,
      body: { name: '', category: 'Snacks', price: 50 }
    });
    assert.strictEqual(emptyNameRes.status, 400, 'Empty name must return 400');
    assert.ok(emptyNameRes.body.error);

    // 6.2 Validation: Whitespace name
    const whitespaceNameRes = await httpRequest({
      method: 'POST',
      path: '/api/menu',
      headers: authHeaders,
      body: { name: '   ', category: 'Snacks', price: 50 }
    });
    assert.strictEqual(whitespaceNameRes.status, 400, 'Whitespace name must return 400');

    // 6.3 Validation: Missing category
    const missingCatRes = await httpRequest({
      method: 'POST',
      path: '/api/menu',
      headers: authHeaders,
      body: { name: 'Hot Dog', category: '', price: 50 }
    });
    assert.strictEqual(missingCatRes.status, 400, 'Empty category must return 400');

    // 6.4 Validation: Price <= 0
    const zeroPriceRes = await httpRequest({
      method: 'POST',
      path: '/api/menu',
      headers: authHeaders,
      body: { name: 'Hot Dog', category: 'Snacks', price: 0 }
    });
    assert.strictEqual(zeroPriceRes.status, 400, 'Zero price must return 400');

    const negPriceRes = await httpRequest({
      method: 'POST',
      path: '/api/menu',
      headers: authHeaders,
      body: { name: 'Hot Dog', category: 'Snacks', price: -25 }
    });
    assert.strictEqual(negPriceRes.status, 400, 'Negative price must return 400');

    // 6.5 Validation: Non-numeric price
    const nonNumericPriceRes = await httpRequest({
      method: 'POST',
      path: '/api/menu',
      headers: authHeaders,
      body: { name: 'Hot Dog', category: 'Snacks', price: 'free' }
    });
    assert.strictEqual(nonNumericPriceRes.status, 400, 'Non-numeric price must return 400');

    // 6.6 Valid Item Creation
    const newItemPayload = {
      name: 'Paneer Cheese Momo (5 pcs)',
      category: 'Snacks',
      price: 75
    };
    const createRes = await httpRequest({
      method: 'POST',
      path: '/api/menu',
      headers: authHeaders,
      body: newItemPayload
    });
    assert.strictEqual(createRes.status, 201, 'Valid item creation must return 201');
    assert.ok(createRes.body.id, 'Created item must have an id');
    assert.strictEqual(createRes.body.name, newItemPayload.name);
    assert.strictEqual(createRes.body.category, newItemPayload.category);
    assert.strictEqual(createRes.body.price, 75);
    assert.strictEqual(createRes.body.is_active, 1);
    const createdItemId = createRes.body.id;

    // 6.7 Verify item appears in public GET /api/menu (now 35 items)
    const menuAfterAdd = await httpRequest({ method: 'GET', path: '/api/menu' });
    assert.strictEqual(menuAfterAdd.body.length, 35, 'Catalog must now contain 35 items');
    const addedItemInMenu = menuAfterAdd.body.find((i: any) => i.id === createdItemId);
    assert.ok(addedItemInMenu, 'New item must be present in GET /api/menu');
    assert.strictEqual(addedItemInMenu.name, newItemPayload.name);
    assert.strictEqual(addedItemInMenu.price, 75);
    console.log('   POST /api/menu input validation and item creation verified successfully.\n');

    // 7. Editing Menu Items (PUT /api/menu/:id)
    console.log('Step 7: Verifying PUT /api/menu/:id editing and validation...');

    // 7.1 Non-existent item returns 404
    const notFoundPut = await httpRequest({
      method: 'PUT',
      path: '/api/menu/non-existent-id-999',
      headers: authHeaders,
      body: { price: 80 }
    });
    assert.strictEqual(notFoundPut.status, 404, 'Non-existent item must return 404');
    assert.strictEqual(notFoundPut.body.error, 'Menu item not found');

    // 7.2 Validation on edit: invalid price
    const invalidPriceEdit = await httpRequest({
      method: 'PUT',
      path: `/api/menu/${createdItemId}`,
      headers: authHeaders,
      body: { price: -50 }
    });
    assert.strictEqual(invalidPriceEdit.status, 400, 'Invalid price on edit must return 400');

    // 7.3 Validation on edit: empty name
    const emptyNameEdit = await httpRequest({
      method: 'PUT',
      path: `/api/menu/${createdItemId}`,
      headers: authHeaders,
      body: { name: '   ' }
    });
    assert.strictEqual(emptyNameEdit.status, 400, 'Empty name on edit must return 400');

    // 7.4 Valid update: Update name and price
    const validEditRes = await httpRequest({
      method: 'PUT',
      path: `/api/menu/${createdItemId}`,
      headers: authHeaders,
      body: {
        name: 'Crispy Paneer Cheese Momo (5 pcs)',
        price: 85
      }
    });
    assert.strictEqual(validEditRes.status, 200, 'Valid edit must return 200');
    assert.strictEqual(validEditRes.body.name, 'Crispy Paneer Cheese Momo (5 pcs)');
    assert.strictEqual(validEditRes.body.price, 85);
    assert.strictEqual(validEditRes.body.category, 'Snacks'); // Unchanged category preserved

    // 7.5 Verify update reflected in public GET /api/menu
    const menuAfterEdit = await httpRequest({ method: 'GET', path: '/api/menu' });
    const editedInMenu = menuAfterEdit.body.find((i: any) => i.id === createdItemId);
    assert.ok(editedInMenu);
    assert.strictEqual(editedInMenu.name, 'Crispy Paneer Cheese Momo (5 pcs)');
    assert.strictEqual(editedInMenu.price, 85);
    console.log('   PUT /api/menu/:id editing, field preservation, and validation verified.\n');

    // 8. Soft-Delete Menu Item (DELETE /api/menu/:id)
    console.log('Step 8: Verifying DELETE /api/menu/:id soft-deletes item...');

    // 8.1 Non-existent item returns 404
    const notFoundDelete = await httpRequest({
      method: 'DELETE',
      path: '/api/menu/non-existent-id-999',
      headers: authHeaders
    });
    assert.strictEqual(notFoundDelete.status, 404, 'Deleting non-existent item must return 404');

    // 8.2 Valid soft-delete
    const deleteRes = await httpRequest({
      method: 'DELETE',
      path: `/api/menu/${createdItemId}`,
      headers: authHeaders
    });
    assert.strictEqual(deleteRes.status, 200, 'Soft-delete must return 200');
    assert.strictEqual(deleteRes.body.success, true);
    assert.strictEqual(deleteRes.body.message, 'Menu item deactivated');

    // 8.3 Verify item disappears from public active GET /api/menu (back to 34 items)
    const menuAfterDelete = await httpRequest({ method: 'GET', path: '/api/menu' });
    assert.strictEqual(menuAfterDelete.body.length, 34, 'Active catalog must return to 34 items');
    const deletedInPublicMenu = menuAfterDelete.body.find((i: any) => i.id === createdItemId);
    assert.strictEqual(deletedInPublicMenu, undefined, 'Soft-deleted item must not appear in active public menu');

    // 8.4 Verify item STILL exists in the database table with is_active = 0 (SOFT DELETE VERIFICATION)
    const dbRecordRes = await db.execute({
      sql: 'SELECT id, name, is_active FROM menu_items WHERE id = ?;',
      args: [createdItemId]
    });
    assert.strictEqual(dbRecordRes.rows.length, 1, 'Item MUST still exist in database table');
    assert.strictEqual(Number(dbRecordRes.rows[0].is_active), 0, 'is_active MUST be set to 0');
    console.log('   Soft-delete verified: Record retained in DB with is_active=0 and excluded from public catalog.\n');

    // 8.5 Verify GET /api/menu?include_inactive=true returns the deactivated item
    const fullCatalogRes = await httpRequest({
      method: 'GET',
      path: '/api/menu?include_inactive=true'
    });
    assert.strictEqual(fullCatalogRes.status, 200);
    assert.strictEqual(fullCatalogRes.body.length, 35, 'Catalog with inactive items must contain 35 items');
    const inactiveFound = fullCatalogRes.body.find((i: any) => i.id === createdItemId);
    assert.ok(inactiveFound, 'Inactive item must be returned when include_inactive=true');
    assert.strictEqual(inactiveFound.is_active, 0);
    console.log('   GET /api/menu?include_inactive=true verified.\n');

    // 9. Historical Price Immutability Invariant Verification
    console.log('Step 9: Verifying historical price immutability invariant on order line items...');
    // Create an order in `orders` and a line item in `order_items` referencing "Cold Coffee" @ ₹50
    const testOrderId = `order_${crypto.randomUUID()}`;
    const testOrderItemId = `item_${crypto.randomUUID()}`;
    const orderDateKey = '2026-10-15';
    const originalPrice = 50.0;
    const originalQuantity = 2;
    const originalSubtotal = 100.0;
    const nowIso = new Date().toISOString();

    // Insert historical order
    await db.execute({
      sql: `INSERT INTO orders (id, date_key, daily_order_number, status, payment_method, total_amount, notes, created_at, settled_at, updated_at)
            VALUES (?, ?, 999, 'SETTLED', 'Cash', ?, 'Historical price test order', ?, ?, ?);`,
      args: [testOrderId, orderDateKey, originalSubtotal, nowIso, nowIso, nowIso]
    });

    // Insert historical order item with frozen snapshot price
    await db.execute({
      sql: `INSERT INTO order_items (id, order_id, menu_item_id, item_name, unit_price, quantity, subtotal, created_at)
            VALUES (?, ?, 'drinks-cold-coffee', 'Cold Coffee', ?, ?, ?, ?);`,
      args: [testOrderItemId, testOrderId, originalPrice, originalQuantity, originalSubtotal, nowIso]
    });

    console.log(`   Created historical test order #${testOrderId} with 2x Cold Coffee @ ₹${originalPrice} = ₹${originalSubtotal}`);

    // Now modify the price of "drinks-cold-coffee" in the menu from ₹50 to ₹80
    console.log('   Updating Cold Coffee catalog price from ₹50 to ₹80 via PUT /api/menu/drinks-cold-coffee...');
    const updatePriceRes = await httpRequest({
      method: 'PUT',
      path: '/api/menu/drinks-cold-coffee',
      headers: authHeaders,
      body: { price: 80 }
    });
    assert.strictEqual(updatePriceRes.status, 200);
    assert.strictEqual(updatePriceRes.body.price, 80);

    // Verify catalog reflects ₹80
    const updatedMenuRes = await httpRequest({ method: 'GET', path: '/api/menu' });
    const coldCoffeeInMenu = updatedMenuRes.body.find((i: any) => i.id === 'drinks-cold-coffee');
    assert.ok(coldCoffeeInMenu);
    assert.strictEqual(coldCoffeeInMenu.price, 80, 'Catalog price must be 80');

    // Invariant Check 1: Existing order line items in order_items MUST NOT CHANGE
    const lineItemAfterPriceUpdate = await db.execute({
      sql: 'SELECT unit_price, subtotal, item_name FROM order_items WHERE id = ?;',
      args: [testOrderItemId]
    });
    assert.strictEqual(lineItemAfterPriceUpdate.rows.length, 1);
    const row1 = lineItemAfterPriceUpdate.rows[0];
    assert.strictEqual(
      Number(row1.unit_price),
      50,
      `INVARIANT VIOLATION: order_items.unit_price was altered to ${row1.unit_price}, expected 50`
    );
    assert.strictEqual(
      Number(row1.subtotal),
      100,
      `INVARIANT VIOLATION: order_items.subtotal was altered to ${row1.subtotal}, expected 100`
    );
    assert.strictEqual(
      String(row1.item_name),
      'Cold Coffee',
      'item_name in order_items must remain unchanged'
    );
    console.log('   Invariant 1 PASSED: Menu price increase to ₹80 did NOT mutate historical order line items (unit_price=50, subtotal=100 preserved).');

    // Invariant Check 2: Soft-deleting menu item MUST NOT alter or delete historical order items
    console.log('   Deactivating (soft-deleting) Cold Coffee from menu via DELETE /api/menu/drinks-cold-coffee...');
    const deleteColdCoffeeRes = await httpRequest({
      method: 'DELETE',
      path: '/api/menu/drinks-cold-coffee',
      headers: authHeaders
    });
    assert.strictEqual(deleteColdCoffeeRes.status, 200);

    const lineItemAfterDelete = await db.execute({
      sql: 'SELECT unit_price, subtotal, item_name FROM order_items WHERE id = ?;',
      args: [testOrderItemId]
    });
    assert.strictEqual(lineItemAfterDelete.rows.length, 1);
    const row2 = lineItemAfterDelete.rows[0];
    assert.strictEqual(Number(row2.unit_price), 50);
    assert.strictEqual(Number(row2.subtotal), 100);
    assert.strictEqual(String(row2.item_name), 'Cold Coffee');
    console.log('   Invariant 2 PASSED: Soft-deleting menu item did NOT remove or alter historical order line items.');

    // Cleanup: restore Cold Coffee back to active with price 50 for clean DB state
    await httpRequest({
      method: 'PUT',
      path: '/api/menu/drinks-cold-coffee',
      headers: authHeaders,
      body: { price: 50, is_active: 1 }
    });

    // Cleanup test order and test item
    await db.execute({ sql: 'DELETE FROM order_items WHERE id = ?;', args: [testOrderItemId] });
    await db.execute({ sql: 'DELETE FROM orders WHERE id = ?;', args: [testOrderId] });
    await db.execute({ sql: 'DELETE FROM menu_items WHERE id = ?;', args: [createdItemId] });
    console.log('   Test fixtures cleaned up and catalog restored to baseline 34 authentic items.\n');

    console.log('========================================================');
    console.log('✅ ALL MILESTONE 2 VERIFICATION TESTS PASSED CLEANLY!');
    console.log('========================================================');
  } finally {
    console.log('\nStopping test server...');
    await stopServer();
    console.log('Server stopped.');
  }
}

runM2Verification().catch((err) => {
  console.error('\n❌ MILESTONE 2 VERIFICATION FAILED:', err);
  process.exit(1);
});
