import http from 'http';
import assert from 'assert';
import jwt from 'jsonwebtoken';
import { startServer, stopServer } from '../src/server/index.js';
import { getDbClient } from '../src/server/db/client.js';

const TEST_PORT = 3106;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const JWT_SECRET = process.env.JWT_SECRET || 'kotha-coffee-reception-session-secret-2026';

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
            // raw string
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

async function runAdversarialM2Suite() {
  console.log('================================================================');
  console.log('  REVIEWER 2: ADVERSARIAL MENU & EDGE CASE STRESS TEST SUITE   ');
  console.log('================================================================\n');

  process.env.NODE_ENV = 'test';
  await startServer(TEST_PORT);
  console.log(`Test server running on port ${TEST_PORT}\n`);

  const db = getDbClient();
  let passed = 0;
  let failed = 0;

  function recordPass(testName: string) {
    passed++;
    console.log(`  ✅ [PASS] ${testName}`);
  }

  function recordFail(testName: string, err: any) {
    failed++;
    console.error(`  ❌ [FAIL] ${testName}:`, err);
  }

  // Generate valid token
  const validToken = jwt.sign({ role: 'reception', cafe: 'kotha-coffee' }, JWT_SECRET, { expiresIn: 3600 });
  const authHeaders = { Authorization: `Bearer ${validToken}` };

  try {
    // -------------------------------------------------------------
    // CATEGORY 1: UNICODE & BENGALI ITEM CREATION
    // -------------------------------------------------------------
    console.log('--- CATEGORY 1: Unicode & Non-ASCII Character Handling ---');
    try {
      const bengaliRes = await httpRequest({
        method: 'POST',
        path: '/api/menu',
        headers: authHeaders,
        body: {
          name: 'দুধ চা (Special Milk Tea)',
          category: 'Drinks',
          price: 25
        }
      });
      assert.strictEqual(bengaliRes.status, 201);
      assert.strictEqual(bengaliRes.body.name, 'দুধ চা (Special Milk Tea)');
      assert.ok(bengaliRes.body.id.startsWith('drinks-'), 'ID should generate safely with category prefix');
      assert.ok(bengaliRes.body.id.length > 10, 'ID generated');

      // Verify it is readable from public menu
      const menuRes = await httpRequest({ method: 'GET', path: '/api/menu' });
      const found = menuRes.body.find((i: any) => i.id === bengaliRes.body.id);
      assert.ok(found);
      assert.strictEqual(found.name, 'দুধ চা (Special Milk Tea)');
      assert.strictEqual(found.price, 25);

      // Clean up
      await db.execute({ sql: 'DELETE FROM menu_items WHERE id = ?;', args: [bengaliRes.body.id] });
      recordPass('Create & fetch menu item with Bengali script & special characters');
    } catch (e) {
      recordFail('Create & fetch menu item with Bengali script & special characters', e);
    }

    try {
      const emojiRes = await httpRequest({
        method: 'POST',
        path: '/api/menu',
        headers: authHeaders,
        body: {
          name: '☕ Special Espresso 🍩',
          category: 'Drinks',
          price: 45
        }
      });
      assert.strictEqual(emojiRes.status, 201);
      assert.strictEqual(emojiRes.body.name, '☕ Special Espresso 🍩');
      assert.ok(emojiRes.body.id);

      await db.execute({ sql: 'DELETE FROM menu_items WHERE id = ?;', args: [emojiRes.body.id] });
      recordPass('Create menu item with Emoji and unicode symbols');
    } catch (e) {
      recordFail('Create menu item with Emoji and unicode symbols', e);
    }

    // -------------------------------------------------------------
    // CATEGORY 2: MALFORMED & EXTREME NUMERICAL INPUTS
    // -------------------------------------------------------------
    console.log('\n--- CATEGORY 2: Numerical & Extreme Inputs ---');

    const invalidPrices = [
      { label: 'Infinity', value: Infinity },
      { label: '-Infinity', value: -Infinity },
      { label: 'NaN', value: NaN },
      { label: 'Zero price', value: 0 },
      { label: 'Negative price', value: -10 },
      { label: 'Non-numeric string', value: 'free' },
      { label: 'Non-numeric array', value: ['free'] },
      { label: 'Object price', value: { amount: 50 } }
    ];

    for (const testCase of invalidPrices) {
      try {
        const res = await httpRequest({
          method: 'POST',
          path: '/api/menu',
          headers: authHeaders,
          body: {
            name: 'Extreme Item',
            category: 'Snacks',
            price: testCase.value
          }
        });
        assert.strictEqual(res.status, 400, `Expected 400 for price ${testCase.label}, got ${res.status}`);
        recordPass(`POST /api/menu rejects invalid price: ${testCase.label}`);
      } catch (e) {
        recordFail(`POST /api/menu rejects invalid price: ${testCase.label}`, e);
      }
    }

    // Valid fractional prices (paisa)
    try {
      const fractionalRes = await httpRequest({
        method: 'POST',
        path: '/api/menu',
        headers: authHeaders,
        body: {
          name: 'Discount Cookie',
          category: 'Snacks',
          price: 12.50
        }
      });
      assert.strictEqual(fractionalRes.status, 201);
      assert.strictEqual(fractionalRes.body.price, 12.50);
      await db.execute({ sql: 'DELETE FROM menu_items WHERE id = ?;', args: [fractionalRes.body.id] });
      recordPass('POST /api/menu correctly handles decimal prices (e.g. ₹12.50)');
    } catch (e) {
      recordFail('POST /api/menu correctly handles decimal prices (e.g. ₹12.50)', e);
    }

    // String number price (e.g. "50.00")
    try {
      const stringNumRes = await httpRequest({
        method: 'POST',
        path: '/api/menu',
        headers: authHeaders,
        body: {
          name: 'String Number Item',
          category: 'Snacks',
          price: '50.00'
        }
      });
      assert.strictEqual(stringNumRes.status, 201);
      assert.strictEqual(stringNumRes.body.price, 50);
      await db.execute({ sql: 'DELETE FROM menu_items WHERE id = ?;', args: [stringNumRes.body.id] });
      recordPass('POST /api/menu coerces valid string numbers (e.g. "50.00")');
    } catch (e) {
      recordFail('POST /api/menu coerces valid string numbers (e.g. "50.00")', e);
    }

    // -------------------------------------------------------------
    // CATEGORY 3: SQL INJECTION & PARAMETER TAMPERING
    // -------------------------------------------------------------
    console.log('\n--- CATEGORY 3: SQL Injection & Parameter Tampering ---');

    const sqliIds = [
      "' OR '1'='1",
      "drinks-tea'; DROP TABLE menu_items; --",
      "../../etc/passwd",
      "non-existent\0null-byte"
    ];

    for (const sqli of sqliIds) {
      try {
        const res = await httpRequest({
          method: 'PUT',
          path: `/api/menu/${encodeURIComponent(sqli)}`,
          headers: authHeaders,
          body: { price: 99 }
        });
        assert.strictEqual(res.status, 404, `Expected 404 for SQLi ID, got ${res.status}`);
        recordPass(`PUT /api/menu/:id safely returns 404 for SQLi attempt: ${sqli}`);
      } catch (e) {
        recordFail(`PUT /api/menu/:id safely returns 404 for SQLi attempt: ${sqli}`, e);
      }
    }

    // Verify database table survived SQLi attempts
    try {
      const countRes = await db.execute('SELECT COUNT(*) as count FROM menu_items;');
      assert.ok(Number(countRes.rows[0].count) >= 34);
      recordPass('Database integrity preserved: menu_items table intact after SQLi attack');
    } catch (e) {
      recordFail('Database integrity preserved: menu_items table intact after SQLi attack', e);
    }

    // -------------------------------------------------------------
    // CATEGORY 4: PARTIAL UPDATE & FIELD PRESERVATION IN PUT
    // -------------------------------------------------------------
    console.log('\n--- CATEGORY 4: Partial Updates in PUT /api/menu/:id ---');

    let testItemId = '';
    try {
      const createRes = await httpRequest({
        method: 'POST',
        path: '/api/menu',
        headers: authHeaders,
        body: {
          name: 'Original Test Name',
          category: 'Snacks',
          price: 55,
          display_order: 100
        }
      });
      assert.strictEqual(createRes.status, 201);
      testItemId = createRes.body.id;

      // Update ONLY price
      const updatePriceRes = await httpRequest({
        method: 'PUT',
        path: `/api/menu/${testItemId}`,
        headers: authHeaders,
        body: { price: 65 }
      });
      assert.strictEqual(updatePriceRes.status, 200);
      assert.strictEqual(updatePriceRes.body.price, 65);
      assert.strictEqual(updatePriceRes.body.name, 'Original Test Name', 'Name should be preserved');
      assert.strictEqual(updatePriceRes.body.category, 'Snacks', 'Category should be preserved');
      assert.strictEqual(updatePriceRes.body.display_order, 100, 'Display order should be preserved');
      recordPass('PUT updates price while preserving name, category, and display_order');

      // Update ONLY name
      const updateNameRes = await httpRequest({
        method: 'PUT',
        path: `/api/menu/${testItemId}`,
        headers: authHeaders,
        body: { name: 'Renamed Test Name' }
      });
      assert.strictEqual(updateNameRes.status, 200);
      assert.strictEqual(updateNameRes.body.name, 'Renamed Test Name');
      assert.strictEqual(updateNameRes.body.price, 65, 'Price should be preserved');
      assert.strictEqual(updateNameRes.body.category, 'Snacks', 'Category should be preserved');
      recordPass('PUT updates name while preserving price and category');

      // Update is_active to 0 via PUT (alternative deactivation)
      const deactRes = await httpRequest({
        method: 'PUT',
        path: `/api/menu/${testItemId}`,
        headers: authHeaders,
        body: { is_active: false }
      });
      assert.strictEqual(deactRes.status, 200);
      assert.strictEqual(deactRes.body.is_active, 0);
      recordPass('PUT toggles is_active to false (0)');

      // Reactivate via PUT
      const reactRes = await httpRequest({
        method: 'PUT',
        path: `/api/menu/${testItemId}`,
        headers: authHeaders,
        body: { is_active: true }
      });
      assert.strictEqual(reactRes.status, 200);
      assert.strictEqual(reactRes.body.is_active, 1);
      recordPass('PUT toggles is_active to true (1) - reactivating item');

      // Invalid is_active values
      const badActiveRes = await httpRequest({
        method: 'PUT',
        path: `/api/menu/${testItemId}`,
        headers: authHeaders,
        body: { is_active: 'yes_please' }
      });
      assert.strictEqual(badActiveRes.status, 400);
      recordPass('PUT rejects invalid is_active string');

    } catch (e) {
      recordFail('Partial updates in PUT /api/menu/:id', e);
    } finally {
      if (testItemId) {
        await db.execute({ sql: 'DELETE FROM menu_items WHERE id = ?;', args: [testItemId] });
      }
    }

    // -------------------------------------------------------------
    // CATEGORY 5: ROUTE GUARD AUTHENTICATION CHALLENGES
    // -------------------------------------------------------------
    console.log('\n--- CATEGORY 5: Route Guard Token Variants ---');

    // Wrong role in token
    const kitchenToken = jwt.sign({ role: 'kitchen', cafe: 'kotha-coffee' }, JWT_SECRET, { expiresIn: 3600 });
    try {
      const res = await httpRequest({
        method: 'POST',
        path: '/api/menu',
        headers: { Authorization: `Bearer ${kitchenToken}` },
        body: { name: 'Unauthorized Item', category: 'Drinks', price: 10 }
      });
      assert.strictEqual(res.status, 401, 'Token with role=kitchen must be rejected with 401');
      recordPass('Route guard rejects role="kitchen" token');
    } catch (e) {
      recordFail('Route guard rejects role="kitchen" token', e);
    }

    // Token signed with wrong secret
    const forgedToken = jwt.sign({ role: 'reception', cafe: 'kotha-coffee' }, 'wrong-secret-key-999', { expiresIn: 3600 });
    try {
      const res = await httpRequest({
        method: 'DELETE',
        path: '/api/menu/drinks-tea',
        headers: { Authorization: `Bearer ${forgedToken}` }
      });
      assert.strictEqual(res.status, 401, 'Forged token must return 401');
      recordPass('Route guard rejects forged token');
    } catch (e) {
      recordFail('Route guard rejects forged token', e);
    }

    // Expired token
    const expiredToken = jwt.sign({ role: 'reception', cafe: 'kotha-coffee' }, JWT_SECRET, { expiresIn: -10 });
    try {
      const res = await httpRequest({
        method: 'PUT',
        path: '/api/menu/drinks-tea',
        headers: { Authorization: `Bearer ${expiredToken}` },
        body: { price: 20 }
      });
      assert.strictEqual(res.status, 401, 'Expired token must return 401');
      recordPass('Route guard rejects expired token');
    } catch (e) {
      recordFail('Route guard rejects expired token', e);
    }

    // x-admin-pin header support
    try {
      const pinDirectRes = await httpRequest({
        method: 'POST',
        path: '/api/menu',
        headers: { 'x-admin-pin': '1234' },
        body: { name: 'Pin Direct Item', category: 'Drinks', price: 30 }
      });
      assert.strictEqual(pinDirectRes.status, 201, 'x-admin-pin allows mutation');
      await db.execute({ sql: 'DELETE FROM menu_items WHERE id = ?;', args: [pinDirectRes.body.id] });
      recordPass('Route guard accepts valid x-admin-pin header');
    } catch (e) {
      recordFail('Route guard accepts valid x-admin-pin header', e);
    }

    // x-session-token header support
    try {
      const sessionHeaderRes = await httpRequest({
        method: 'POST',
        path: '/api/menu',
        headers: { 'x-session-token': validToken },
        body: { name: 'Session Token Item', category: 'Drinks', price: 30 }
      });
      assert.strictEqual(sessionHeaderRes.status, 201, 'x-session-token allows mutation');
      await db.execute({ sql: 'DELETE FROM menu_items WHERE id = ?;', args: [sessionHeaderRes.body.id] });
      recordPass('Route guard accepts valid x-session-token header');
    } catch (e) {
      recordFail('Route guard accepts valid x-session-token header', e);
    }

    // -------------------------------------------------------------
    // CATEGORY 6: DELETE & SOFT-DELETE EDGE CASES
    // -------------------------------------------------------------
    console.log('\n--- CATEGORY 6: Soft-Delete Invariant & Repeated Deletes ---');

    let deleteTestId = '';
    try {
      const itemRes = await httpRequest({
        method: 'POST',
        path: '/api/menu',
        headers: authHeaders,
        body: { name: 'Double Delete Item', category: 'Snacks', price: 40 }
      });
      deleteTestId = itemRes.body.id;

      // First DELETE: returns 200
      const del1 = await httpRequest({
        method: 'DELETE',
        path: `/api/menu/${deleteTestId}`,
        headers: authHeaders
      });
      assert.strictEqual(del1.status, 200);
      assert.strictEqual(del1.body.success, true);
      recordPass('First DELETE soft-deactivates item with 200');

      // Second DELETE: item already inactive, but row still exists: should still succeed or return 200 idempotently
      const del2 = await httpRequest({
        method: 'DELETE',
        path: `/api/menu/${deleteTestId}`,
        headers: authHeaders
      });
      assert.strictEqual(del2.status, 200);
      assert.strictEqual(del2.body.success, true);
      recordPass('Second DELETE is idempotent (200 success)');

      // Verify item still in DB with is_active = 0
      const dbCheck = await db.execute({ sql: 'SELECT is_active FROM menu_items WHERE id = ?;', args: [deleteTestId] });
      assert.strictEqual(dbCheck.rows.length, 1);
      assert.strictEqual(Number(dbCheck.rows[0].is_active), 0);
      recordPass('Item permanently preserved in DB with is_active=0');

    } catch (e) {
      recordFail('Soft-delete idempotency', e);
    } finally {
      if (deleteTestId) {
        await db.execute({ sql: 'DELETE FROM menu_items WHERE id = ?;', args: [deleteTestId] });
      }
    }

    console.log('\n================================================================');
    console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================');
    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    await stopServer();
  }
}

runAdversarialM2Suite().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
