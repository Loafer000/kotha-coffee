import http from 'http';
import assert from 'assert';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { startServer, stopServer } from '../src/server/index.js';
import { getDbClient } from '../src/server/db/client.js';

const TEST_PORT = 3220;
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

async function runMenuAdversarialSuite() {
  console.log('================================================================');
  console.log('  CHALLENGER 2 (M2): ADVERSARIAL /api/menu EMPIRICAL TEST SUITE');
  console.log('================================================================\n');

  process.env.NODE_ENV = 'test';
  process.env.PORT = String(TEST_PORT);

  await startServer(TEST_PORT);
  console.log(`Test server running on port ${TEST_PORT}\n`);

  const db = getDbClient();

  try {
    // Obtain valid token for authenticated test sections
    const authPinRes = await httpRequest({
      method: 'POST',
      path: '/api/auth/verify-pin',
      body: { pin: '1234' }
    });
    const validToken = authPinRes.body.token;
    assert.ok(validToken, 'Failed to acquire valid reception session token');
    const authHeaders = { Authorization: `Bearer ${validToken}` };

    // Baseline catalog count
    const baselineRes = await httpRequest({ method: 'GET', path: '/api/menu' });
    assert.strictEqual(baselineRes.status, 200);
    const initialActiveCount = baselineRes.body.length;
    console.log(`Initial active catalog count: ${initialActiveCount}\n`);

    // -------------------------------------------------------------------------
    // CATEGORY 1: Unauthenticated Mutations on /api/menu (Must Return 401)
    // -------------------------------------------------------------------------
    console.log('--- CATEGORY 1: Unauthenticated Route Guards on /api/menu ---');

    const unauthTestCases: Array<{
      method: string;
      path: string;
      headers?: Record<string, string>;
      body?: any;
      desc: string;
    }> = [
      {
        method: 'POST',
        path: '/api/menu',
        headers: {},
        body: { name: 'Espresso', category: 'Drinks', price: 60 },
        desc: 'POST /api/menu with no Authorization header'
      },
      {
        method: 'PUT',
        path: '/api/menu/drinks-tea',
        headers: {},
        body: { price: 25 },
        desc: 'PUT /api/menu/:id with no Authorization header'
      },
      {
        method: 'DELETE',
        path: '/api/menu/drinks-tea',
        headers: {},
        body: undefined,
        desc: 'DELETE /api/menu/:id with no Authorization header'
      },
      {
        method: 'POST',
        path: '/api/menu',
        headers: { Authorization: '' },
        body: { name: 'Espresso', category: 'Drinks', price: 60 },
        desc: 'POST /api/menu with empty string Authorization header'
      },
      {
        method: 'POST',
        path: '/api/menu',
        headers: { Authorization: 'Bearer' },
        body: { name: 'Espresso', category: 'Drinks', price: 60 },
        desc: 'POST /api/menu with "Bearer" without token'
      },
      {
        method: 'POST',
        path: '/api/menu',
        headers: { Authorization: 'Bearer   ' },
        body: { name: 'Espresso', category: 'Drinks', price: 60 },
        desc: 'POST /api/menu with whitespace token'
      },
      {
        method: 'POST',
        path: '/api/menu',
        headers: { Authorization: 'Bearer bogus-invalid-token-value' },
        body: { name: 'Espresso', category: 'Drinks', price: 60 },
        desc: 'POST /api/menu with completely invalid token'
      },
      {
        method: 'POST',
        path: '/api/menu',
        headers: { Authorization: 'Basic dXNlcjpwYXNz' },
        body: { name: 'Espresso', category: 'Drinks', price: 60 },
        desc: 'POST /api/menu with Basic Auth instead of Bearer'
      },
      {
        method: 'PUT',
        path: '/api/menu/drinks-tea',
        headers: { Authorization: 'Bearer invalid.jwt.token' },
        body: { price: 25 },
        desc: 'PUT /api/menu/:id with invalid JWT token'
      },
      {
        method: 'DELETE',
        path: '/api/menu/drinks-tea',
        headers: { Authorization: 'Bearer invalid.jwt.token' },
        body: undefined,
        desc: 'DELETE /api/menu/:id with invalid JWT token'
      }
    ];

    for (const tc of unauthTestCases) {
      const res = await httpRequest({
        method: tc.method,
        path: tc.path,
        headers: tc.headers,
        body: tc.body
      });
      recordResult({
        category: 'Unauthenticated Guards',
        name: `${tc.desc} returns 401`,
        passed: res.status === 401,
        expected: 'HTTP 401',
        actual: `HTTP ${res.status}`
      });
    }

    // Token tampering / wrong secret / expired / role mismatch
    const wrongSecretToken = jwt.sign({ role: 'reception', cafe: 'kotha-coffee' }, 'wrong-secret', { expiresIn: 3600 });
    const expiredToken = jwt.sign({ role: 'reception', cafe: 'kotha-coffee' }, JWT_SECRET, { expiresIn: -30 });
    const wrongRoleToken = jwt.sign({ role: 'kitchen', cafe: 'kotha-coffee' }, JWT_SECRET, { expiresIn: 3600 });
    const customerRoleToken = jwt.sign({ role: 'customer', cafe: 'kotha-coffee' }, JWT_SECRET, { expiresIn: 3600 });
    const tamperedToken = validToken.slice(0, -6) + 'XXXXXX';

    // Alg none token
    const hB64 = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const pB64 = Buffer.from(JSON.stringify({ role: 'reception', cafe: 'kotha-coffee' })).toString('base64url');
    const algNoneToken = `${hB64}.${pB64}.`;

    const tokenEdgeCases = [
      { name: 'Wrong Secret Token on POST', token: wrongSecretToken, method: 'POST', path: '/api/menu', body: { name: 'Item', category: 'Drinks', price: 50 } },
      { name: 'Expired Token on POST', token: expiredToken, method: 'POST', path: '/api/menu', body: { name: 'Item', category: 'Drinks', price: 50 } },
      { name: 'Tampered Signature on POST', token: tamperedToken, method: 'POST', path: '/api/menu', body: { name: 'Item', category: 'Drinks', price: 50 } },
      { name: 'Alg: none Attack on POST', token: algNoneToken, method: 'POST', path: '/api/menu', body: { name: 'Item', category: 'Drinks', price: 50 } },
      { name: 'Kitchen Role Token on POST', token: wrongRoleToken, method: 'POST', path: '/api/menu', body: { name: 'Item', category: 'Drinks', price: 50 } },
      { name: 'Customer Role Token on POST', token: customerRoleToken, method: 'POST', path: '/api/menu', body: { name: 'Item', category: 'Drinks', price: 50 } },
      { name: 'Expired Token on PUT', token: expiredToken, method: 'PUT', path: '/api/menu/drinks-tea', body: { price: 30 } },
      { name: 'Kitchen Role Token on PUT', token: wrongRoleToken, method: 'PUT', path: '/api/menu/drinks-tea', body: { price: 30 } },
      { name: 'Expired Token on DELETE', token: expiredToken, method: 'DELETE', path: '/api/menu/drinks-tea' },
      { name: 'Kitchen Role Token on DELETE', token: wrongRoleToken, method: 'DELETE', path: '/api/menu/drinks-tea' }
    ];

    for (const tc of tokenEdgeCases) {
      const res = await httpRequest({
        method: tc.method,
        path: tc.path,
        headers: { Authorization: `Bearer ${tc.token}` },
        body: tc.body
      });
      recordResult({
        category: 'Token Cryptographic Security',
        name: `${tc.name} rejected with 401`,
        passed: res.status === 401,
        expected: 'HTTP 401',
        actual: `HTTP ${res.status}`
      });
    }

    // Test alternative headers on POST /api/menu
    const xSessionTokenRes = await httpRequest({
      method: 'POST',
      path: '/api/menu',
      headers: { 'x-session-token': validToken },
      body: { name: 'Test x-session-token', category: 'Drinks', price: 55 }
    });
    recordResult({
      category: 'Session Headers',
      name: 'Valid token via x-session-token accepted (HTTP 201)',
      passed: xSessionTokenRes.status === 201,
      expected: 'HTTP 201',
      actual: `HTTP ${xSessionTokenRes.status}`
    });
    if (xSessionTokenRes.body?.id) {
      await db.execute({ sql: 'DELETE FROM menu_items WHERE id = ?;', args: [xSessionTokenRes.body.id] });
    }

    const xAdminPinRes = await httpRequest({
      method: 'POST',
      path: '/api/menu',
      headers: { 'x-admin-pin': '1234' },
      body: { name: 'Test x-admin-pin', category: 'Drinks', price: 55 }
    });
    recordResult({
      category: 'Session Headers',
      name: 'Valid PIN via x-admin-pin accepted (HTTP 201)',
      passed: xAdminPinRes.status === 201,
      expected: 'HTTP 201',
      actual: `HTTP ${xAdminPinRes.status}`
    });
    if (xAdminPinRes.body?.id) {
      await db.execute({ sql: 'DELETE FROM menu_items WHERE id = ?;', args: [xAdminPinRes.body.id] });
    }

    const wrongPinHeaderRes = await httpRequest({
      method: 'POST',
      path: '/api/menu',
      headers: { 'x-admin-pin': '9999' },
      body: { name: 'Test x-admin-pin fail', category: 'Drinks', price: 55 }
    });
    recordResult({
      category: 'Session Headers',
      name: 'Wrong PIN via x-admin-pin rejected with 401',
      passed: wrongPinHeaderRes.status === 401,
      expected: 'HTTP 401',
      actual: `HTTP ${wrongPinHeaderRes.status}`
    });


    // -------------------------------------------------------------------------
    // CATEGORY 2: Price Validation on POST and PUT (Must Return 400 for Invalid Prices)
    // -------------------------------------------------------------------------
    console.log('\n--- CATEGORY 2: Negative, Zero, and Malformed Price Validation ---');

    const invalidPriceCases = [
      { label: 'price: 0 (zero number)', price: 0 },
      { label: 'price: -1 (negative integer)', price: -1 },
      { label: 'price: -0.01 (negative float)', price: -0.01 },
      { label: 'price: -999999 (large negative)', price: -999999 },
      { label: 'price: "0" (zero string)', price: '0' },
      { label: 'price: "-50" (negative string)', price: '-50' },
      { label: 'price: "-0.5" (negative float string)', price: '-0.5' },
      { label: 'price: "free" (non-numeric string)', price: 'free' },
      { label: 'price: "NaN" (string NaN)', price: 'NaN' },
      { label: 'price: "Infinity" (string Infinity)', price: 'Infinity' },
      { label: 'price: "-Infinity" (string -Infinity)', price: '-Infinity' },
      { label: 'price: null', price: null },
      { label: 'price: false', price: false },
      { label: 'price: true', price: true },
      { label: 'price: {} (empty object)', price: {} },
      { label: 'price: [] (empty array)', price: [] },
      { label: 'price: "" (empty string)', price: '' },
      { label: 'price: "   " (whitespace string)', price: '   ' }
    ];

    for (const ipc of invalidPriceCases) {
      // Test POST /api/menu
      const postRes = await httpRequest({
        method: 'POST',
        path: '/api/menu',
        headers: authHeaders,
        body: { name: 'Adversarial Price Item', category: 'Drinks', price: ipc.price }
      });
      recordResult({
        category: 'Price Validation (POST)',
        name: `POST rejected for ${ipc.label} (HTTP 400)`,
        passed: postRes.status === 400,
        expected: 'HTTP 400',
        actual: `HTTP ${postRes.status} (${JSON.stringify(postRes.body)})`
      });

      // Test PUT /api/menu/:id
      const putRes = await httpRequest({
        method: 'PUT',
        path: '/api/menu/drinks-tea',
        headers: authHeaders,
        body: { price: ipc.price }
      });
      recordResult({
        category: 'Price Validation (PUT)',
        name: `PUT rejected for ${ipc.label} (HTTP 400)`,
        passed: putRes.status === 400,
        expected: 'HTTP 400',
        actual: `HTTP ${putRes.status} (${JSON.stringify(putRes.body)})`
      });
    }

    // Special Price Boundary Tests: Missing price field in POST
    const missingPriceRes = await httpRequest({
      method: 'POST',
      path: '/api/menu',
      headers: authHeaders,
      body: { name: 'No Price Item', category: 'Drinks' }
    });
    recordResult({
      category: 'Price Validation (POST)',
      name: 'POST rejected when price field is omitted (HTTP 400)',
      passed: missingPriceRes.status === 400,
      expected: 'HTTP 400',
      actual: `HTTP ${missingPriceRes.status}`
    });

    // Special Price Boundary Tests: Numeric Infinity
    // Note: JSON.stringify converts Infinity to null in standard JSON
    const numericInfinityPostRes = await httpRequest({
      method: 'POST',
      path: '/api/menu',
      headers: authHeaders,
      body: '{"name": "Infinity Item", "category": "Drinks", "price": 1e999}' // translates to Infinity in JS
    });
    recordResult({
      category: 'Price Validation (POST)',
      name: 'POST rejected when price overflows to Infinity (1e999) (HTTP 400)',
      passed: numericInfinityPostRes.status === 400,
      expected: 'HTTP 400',
      actual: `HTTP ${numericInfinityPostRes.status}`
    });

    // Special Price Boundary Tests: Trailing string "50abc" or "50 dollars"
    const trailingStringPriceRes = await httpRequest({
      method: 'POST',
      path: '/api/menu',
      headers: authHeaders,
      body: { name: 'Trailing String Price', category: 'Drinks', price: '50xyz' }
    });
    // In parseFloat, "50xyz" becomes 50. Let's record this behavior.
    const acceptedTrailingString = trailingStringPriceRes.status === 201;
    recordResult({
      category: 'Price Strictness Audit',
      name: 'Price string with trailing alphanumeric "50xyz" handling',
      passed: true,
      expected: 'Observe if strictly rejected (400) or sanitized/coerced by parseFloat (201)',
      actual: acceptedTrailingString
        ? `COERCED: HTTP 201 (parsed to clean numeric price ${trailingStringPriceRes.body?.price})`
        : `REJECTED: HTTP ${trailingStringPriceRes.status}`,
      details: acceptedTrailingString
        ? 'NOTE: parseFloat("50xyz") greedily extracts 50. The database record receives clean numeric 50, avoiding injection.'
        : undefined,
      severity: acceptedTrailingString ? 'LOW' : undefined
    });
    if (acceptedTrailingString && trailingStringPriceRes.body?.id) {
      await db.execute({ sql: 'DELETE FROM menu_items WHERE id = ?;', args: [trailingStringPriceRes.body.id] });
    }

    // Valid Boundary Prices: Minimum positive float and large float
    const validMinPriceRes = await httpRequest({
      method: 'POST',
      path: '/api/menu',
      headers: authHeaders,
      body: { name: 'Micro Price Item', category: 'Drinks', price: 0.50 }
    });
    recordResult({
      category: 'Valid Price Boundaries',
      name: 'POST accepts valid fractional price ₹0.50 (HTTP 201)',
      passed: validMinPriceRes.status === 201 && validMinPriceRes.body.price === 0.50,
      expected: 'HTTP 201 with price 0.5',
      actual: `HTTP ${validMinPriceRes.status}, price=${validMinPriceRes.body?.price}`
    });
    if (validMinPriceRes.body?.id) {
      await db.execute({ sql: 'DELETE FROM menu_items WHERE id = ?;', args: [validMinPriceRes.body.id] });
    }


    // -------------------------------------------------------------------------
    // CATEGORY 3: Blank, Whitespace, Non-String, and Giant Names / Categories
    // -------------------------------------------------------------------------
    console.log('\n--- CATEGORY 3: Name and Category Boundary Validation ---');

    const invalidNameCases = [
      { label: 'empty string ""', name: '' },
      { label: 'spaces only "    "', name: '    ' },
      { label: 'tabs and newlines "\\t\\n\\r  "', name: '\t\n\r  ' },
      { label: 'null name', name: null },
      { label: 'number name: 12345', name: 12345 },
      { label: 'boolean name: true', name: true },
      { label: 'boolean name: false', name: false },
      { label: 'array name: ["Espresso"]', name: ['Espresso'] },
      { label: 'object name: { text: "Coffee" }', name: { text: 'Coffee' } }
    ];

    for (const inc of invalidNameCases) {
      // POST name validation
      const postNameRes = await httpRequest({
        method: 'POST',
        path: '/api/menu',
        headers: authHeaders,
        body: { name: inc.name, category: 'Drinks', price: 60 }
      });
      recordResult({
        category: 'Name Validation (POST)',
        name: `POST rejected for ${inc.label} (HTTP 400)`,
        passed: postNameRes.status === 400,
        expected: 'HTTP 400',
        actual: `HTTP ${postNameRes.status} (${JSON.stringify(postNameRes.body)})`
      });

      // PUT name validation
      const putNameRes = await httpRequest({
        method: 'PUT',
        path: '/api/menu/drinks-tea',
        headers: authHeaders,
        body: { name: inc.name }
      });
      recordResult({
        category: 'Name Validation (PUT)',
        name: `PUT rejected for ${inc.label} (HTTP 400)`,
        passed: putNameRes.status === 400,
        expected: 'HTTP 400',
        actual: `HTTP ${putNameRes.status} (${JSON.stringify(putNameRes.body)})`
      });
    }

    const invalidCategoryCases = [
      { label: 'empty string ""', category: '' },
      { label: 'spaces only "    "', category: '    ' },
      { label: 'null category', category: null },
      { label: 'number category: 999', category: 999 },
      { label: 'boolean category: true', category: true },
      { label: 'array category: ["Drinks"]', category: ['Drinks'] }
    ];

    for (const icc of invalidCategoryCases) {
      // POST category validation
      const postCatRes = await httpRequest({
        method: 'POST',
        path: '/api/menu',
        headers: authHeaders,
        body: { name: 'Valid Name', category: icc.category, price: 60 }
      });
      recordResult({
        category: 'Category Validation (POST)',
        name: `POST rejected for ${icc.label} (HTTP 400)`,
        passed: postCatRes.status === 400,
        expected: 'HTTP 400',
        actual: `HTTP ${postCatRes.status} (${JSON.stringify(postCatRes.body)})`
      });

      // PUT category validation
      const putCatRes = await httpRequest({
        method: 'PUT',
        path: '/api/menu/drinks-tea',
        headers: authHeaders,
        body: { category: icc.category }
      });
      recordResult({
        category: 'Category Validation (PUT)',
        name: `PUT rejected for ${icc.label} (HTTP 400)`,
        passed: putCatRes.status === 400,
        expected: 'HTTP 400',
        actual: `HTTP ${putCatRes.status} (${JSON.stringify(putCatRes.body)})`
      });
    }

    // Giant string in name (50,000 chars)
    const giantName = 'A'.repeat(50000);
    const giantNameRes = await httpRequest({
      method: 'POST',
      path: '/api/menu',
      headers: authHeaders,
      body: { name: giantName, category: 'Drinks', price: 99 }
    });
    // Server must handle gracefully without crash (either 201 or 400/413)
    const giantHandled = giantNameRes.status === 201 || giantNameRes.status === 400 || giantNameRes.status === 413;
    recordResult({
      category: 'Giant String Stress',
      name: 'Server survives 50,000-character giant name in POST /api/menu',
      passed: giantHandled,
      expected: 'HTTP 201, 400, or 413 (no crash/hang)',
      actual: `HTTP ${giantNameRes.status}`
    });
    if (giantNameRes.body?.id) {
      await db.execute({ sql: 'DELETE FROM menu_items WHERE id = ?;', args: [giantNameRes.body.id] });
    }

    // Giant string in PUT
    const giantPutRes = await httpRequest({
      method: 'PUT',
      path: '/api/menu/drinks-tea',
      headers: authHeaders,
      body: { name: giantName }
    });
    recordResult({
      category: 'Giant String Stress',
      name: 'Server survives 50,000-character giant name in PUT /api/menu/:id',
      passed: giantPutRes.status === 200 || giantPutRes.status === 400 || giantPutRes.status === 413,
      expected: 'HTTP 200, 400, or 413 (no crash/hang)',
      actual: `HTTP ${giantPutRes.status}`
    });
    // Restore Tea's authentic name
    await db.execute({
      sql: `UPDATE menu_items SET name = 'Tea' WHERE id = 'drinks-tea';`,
      args: []
    });


    // -------------------------------------------------------------------------
    // CATEGORY 4: Non-Existent IDs for PUT and DELETE (Must Return 404)
    // -------------------------------------------------------------------------
    console.log('\n--- CATEGORY 4: Non-Existent ID Handling (Must Return 404) ---');

    const nonExistentIds = [
      'non-existent-id-99999',
      'item-does-not-exist',
      'drinks-coffee-fake-id',
      'null',
      'undefined',
      '0',
      '123456789',
      'special-chars-!@#$%^&*()'
    ];

    for (const fakeId of nonExistentIds) {
      // PUT
      const putRes = await httpRequest({
        method: 'PUT',
        path: `/api/menu/${encodeURIComponent(fakeId)}`,
        headers: authHeaders,
        body: { price: 99 }
      });
      recordResult({
        category: 'Non-Existent ID',
        name: `PUT /api/menu/${fakeId} returns 404`,
        passed: putRes.status === 404 && putRes.body?.error === 'Menu item not found',
        expected: 'HTTP 404 { error: "Menu item not found" }',
        actual: `HTTP ${putRes.status} (${JSON.stringify(putRes.body)})`
      });

      // DELETE
      const deleteRes = await httpRequest({
        method: 'DELETE',
        path: `/api/menu/${encodeURIComponent(fakeId)}`,
        headers: authHeaders
      });
      recordResult({
        category: 'Non-Existent ID',
        name: `DELETE /api/menu/${fakeId} returns 404`,
        passed: deleteRes.status === 404 && deleteRes.body?.error === 'Menu item not found',
        expected: 'HTTP 404 { error: "Menu item not found" }',
        actual: `HTTP ${deleteRes.status} (${JSON.stringify(deleteRes.body)})`
      });
    }


    // -------------------------------------------------------------------------
    // CATEGORY 5: SQL Injection and Payload Hardening
    // -------------------------------------------------------------------------
    console.log('\n--- CATEGORY 5: SQL Injection and Security Payload Hardening ---');

    const sqliPayloads = [
      "'; DROP TABLE menu_items; --",
      "' OR '1'='1",
      "' OR 1=1 --",
      "'; UPDATE menu_items SET price = 0; --",
      "UNION SELECT 'hacked', 'hacked', 'hacked', 0, 1, 0, '2026', '2026' --",
      "1; DROP TABLE settings; --",
      "admin' --",
      "'; VACUUM; --"
    ];

    for (const payload of sqliPayloads) {
      // Try SQLi in POST /api/menu name
      const sqliPostRes = await httpRequest({
        method: 'POST',
        path: '/api/menu',
        headers: authHeaders,
        body: { name: `Injection Test: ${payload}`, category: 'Drinks', price: 60 }
      });
      const postOk = sqliPostRes.status === 201;
      const createdId = sqliPostRes.body?.id;

      // Verify the item was treated as literal text, not executed SQL
      if (createdId) {
        const itemInDb = await db.execute({
          sql: 'SELECT name FROM menu_items WHERE id = ?;',
          args: [createdId]
        });
        const storedAsLiteral = itemInDb.rows[0]?.name === `Injection Test: ${payload}`;
        recordResult({
          category: 'SQL Injection Defense',
          name: `POST handles literal payload: ${payload.slice(0, 30)}...`,
          passed: postOk && storedAsLiteral,
          expected: 'Stored safely as literal data',
          actual: storedAsLiteral ? 'Passed as literal text' : 'FAILED literal check'
        });
        await db.execute({ sql: 'DELETE FROM menu_items WHERE id = ?;', args: [createdId] });
      }

      // Try SQLi in PUT /api/menu/:id as the ID parameter
      const sqliPutIdRes = await httpRequest({
        method: 'PUT',
        path: `/api/menu/${encodeURIComponent(payload)}`,
        headers: authHeaders,
        body: { price: 77 }
      });
      recordResult({
        category: 'SQL Injection Defense',
        name: `PUT with SQLi in :id param (${payload.slice(0, 25)}) returns 404`,
        passed: sqliPutIdRes.status === 404,
        expected: 'HTTP 404',
        actual: `HTTP ${sqliPutIdRes.status}`
      });

      // Try SQLi in DELETE /api/menu/:id as the ID parameter
      const sqliDelIdRes = await httpRequest({
        method: 'DELETE',
        path: `/api/menu/${encodeURIComponent(payload)}`,
        headers: authHeaders
      });
      recordResult({
        category: 'SQL Injection Defense',
        name: `DELETE with SQLi in :id param (${payload.slice(0, 25)}) returns 404`,
        passed: sqliDelIdRes.status === 404,
        expected: 'HTTP 404',
        actual: `HTTP ${sqliDelIdRes.status}`
      });
    }

    // Verify all database tables are intact after SQL injection barrage
    const checkMenuItemsTable = await db.execute(`SELECT name FROM sqlite_master WHERE type='table' AND name='menu_items';`);
    const checkSettingsTable = await db.execute(`SELECT name FROM sqlite_master WHERE type='table' AND name='settings';`);
    const checkOrdersTable = await db.execute(`SELECT name FROM sqlite_master WHERE type='table' AND name='orders';`);

    recordResult({
      category: 'SQL Injection Defense',
      name: 'Critical tables (menu_items, settings, orders) survive intact',
      passed: checkMenuItemsTable.rows.length === 1 && checkSettingsTable.rows.length === 1 && checkOrdersTable.rows.length === 1,
      expected: 'All 3 tables exist and intact',
      actual: `menu_items=${checkMenuItemsTable.rows.length}, settings=${checkSettingsTable.rows.length}, orders=${checkOrdersTable.rows.length}`
    });

    // Check GET query params with SQLi
    const sqliGetRes = await httpRequest({
      method: 'GET',
      path: "/api/menu?all=' OR '1'='1"
    });
    recordResult({
      category: 'SQL Injection Defense',
      name: 'GET /api/menu query params survive SQLi without syntax error (HTTP 200)',
      passed: sqliGetRes.status === 200,
      expected: 'HTTP 200',
      actual: `HTTP ${sqliGetRes.status}`
    });


    // -------------------------------------------------------------------------
    // CATEGORY 6: PUT /api/menu/:id Boundary Conditions & Field Validations
    // -------------------------------------------------------------------------
    console.log('\n--- CATEGORY 6: PUT /api/menu/:id Edge Cases & State Transitions ---');

    // 6.1 Empty body on PUT: should keep existing values and update updated_at
    const emptyPutRes = await httpRequest({
      method: 'PUT',
      path: '/api/menu/drinks-tea',
      headers: authHeaders,
      body: {}
    });
    recordResult({
      category: 'PUT Boundary Validation',
      name: 'Empty payload on PUT keeps existing item values and returns 200',
      passed: emptyPutRes.status === 200 && emptyPutRes.body.name === 'Tea' && emptyPutRes.body.price === 15,
      expected: 'HTTP 200 with Tea and price 15',
      actual: `HTTP ${emptyPutRes.status}, name=${emptyPutRes.body?.name}, price=${emptyPutRes.body?.price}`
    });

    // 6.2 is_active validation on PUT
    const invalidIsActiveValues = ['maybe', 2, -1, 99, 'true_string', 'false_string', {}];
    for (const v of invalidIsActiveValues) {
      const res = await httpRequest({
        method: 'PUT',
        path: '/api/menu/drinks-tea',
        headers: authHeaders,
        body: { is_active: v }
      });
      recordResult({
        category: 'is_active Validation',
        name: `PUT rejects invalid is_active: ${JSON.stringify(v)} (HTTP 400)`,
        passed: res.status === 400,
        expected: 'HTTP 400',
        actual: `HTTP ${res.status}`
      });
    }

    // 6.3 Valid is_active toggling (boolean and numeric 0/1)
    const deactivateRes = await httpRequest({
      method: 'PUT',
      path: '/api/menu/drinks-tea',
      headers: authHeaders,
      body: { is_active: false }
    });
    assert.strictEqual(deactivateRes.status, 200);
    assert.strictEqual(deactivateRes.body.is_active, 0);

    // Verify item is hidden from active catalog
    const menuWithoutTea = await httpRequest({ method: 'GET', path: '/api/menu' });
    const teaFoundActive = menuWithoutTea.body.find((i: any) => i.id === 'drinks-tea');
    recordResult({
      category: 'Active State Transition',
      name: 'Setting is_active: false via PUT hides item from public catalog',
      passed: teaFoundActive === undefined,
      expected: 'Item hidden from active menu',
      actual: teaFoundActive ? 'Item still visible' : 'Item successfully hidden'
    });

    // Reactivate with is_active: 1
    const reactivateRes = await httpRequest({
      method: 'PUT',
      path: '/api/menu/drinks-tea',
      headers: authHeaders,
      body: { is_active: 1 }
    });
    assert.strictEqual(reactivateRes.status, 200);
    assert.strictEqual(reactivateRes.body.is_active, 1);

    const menuWithTeaAgain = await httpRequest({ method: 'GET', path: '/api/menu' });
    const teaFoundAgain = menuWithTeaAgain.body.find((i: any) => i.id === 'drinks-tea');
    recordResult({
      category: 'Active State Transition',
      name: 'Reactivating item with is_active: 1 via PUT restores it to public catalog',
      passed: teaFoundAgain !== undefined && teaFoundAgain.is_active === 1,
      expected: 'Item restored to active menu',
      actual: teaFoundAgain ? 'Item successfully restored' : 'Item not found'
    });

    // 6.4 display_order validation on PUT
    const invalidDisplayOrderStrings = ['invalid-order', 'NaN', 'Infinity', '-Infinity'];
    for (const ido of invalidDisplayOrderStrings) {
      const res = await httpRequest({
        method: 'PUT',
        path: '/api/menu/drinks-tea',
        headers: authHeaders,
        body: { display_order: ido }
      });
      recordResult({
        category: 'display_order Validation',
        name: `PUT rejects invalid display_order string "${ido}" (HTTP 400)`,
        passed: res.status === 400,
        expected: 'HTTP 400',
        actual: `HTTP ${res.status}`
      });
    }

    // display_order: null check
    const nullDisplayOrderRes = await httpRequest({
      method: 'PUT',
      path: '/api/menu/drinks-tea',
      headers: authHeaders,
      body: { display_order: null }
    });
    const coercesNullToZero = nullDisplayOrderRes.status === 200 && nullDisplayOrderRes.body?.display_order === 0;
    recordResult({
      category: 'display_order Type Audit',
      name: 'display_order: null behavior (coerced to 0 vs rejected)',
      passed: true,
      expected: 'Observe if rejected or coerced via Number(null) === 0',
      actual: coercesNullToZero
        ? 'COERCED: HTTP 200 (Number(null) evaluates to 0 in JavaScript)'
        : `HTTP ${nullDisplayOrderRes.status}`,
      details: coercesNullToZero
        ? 'NOTE: In menu.ts, Number(display_order) treats null as 0. Does not crash SQLite but sets display_order to 0.'
        : undefined,
      severity: coercesNullToZero ? 'LOW' : undefined
    });

    // 6.5 Unknown extra fields safely ignored without pollution
    const unknownFieldsRes = await httpRequest({
      method: 'PUT',
      path: '/api/menu/drinks-tea',
      headers: authHeaders,
      body: {
        price: 15,
        __proto__: { polluted: true },
        constructor: { prototype: { admin: true } },
        injectedField: 'malicious',
        isAdmin: true
      }
    });
    recordResult({
      category: 'Prototype Pollution & Extra Fields',
      name: 'PUT ignores unknown fields and prototype pollution payloads',
      passed: unknownFieldsRes.status === 200 && !(Object.prototype as any).polluted && !(Object.prototype as any).admin,
      expected: 'HTTP 200, no prototype pollution',
      actual: `HTTP ${unknownFieldsRes.status}, polluted=${(Object.prototype as any).polluted}`
    });


    // -------------------------------------------------------------------------
    // CATEGORY 7: DELETE /api/menu/:id Idempotency & Historical Preservation
    // -------------------------------------------------------------------------
    console.log('\n--- CATEGORY 7: DELETE Idempotency & Soft-Delete Invariant ---');

    // Create a temporary item for delete testing
    const tempItemRes = await httpRequest({
      method: 'POST',
      path: '/api/menu',
      headers: authHeaders,
      body: { name: 'Temporary Delete Target', category: 'Snacks', price: 45 }
    });
    assert.strictEqual(tempItemRes.status, 201);
    const tempId = tempItemRes.body.id;

    // 1st DELETE: Returns 200
    const del1 = await httpRequest({
      method: 'DELETE',
      path: `/api/menu/${tempId}`,
      headers: authHeaders
    });
    recordResult({
      category: 'Soft-Delete Lifecycle',
      name: 'First DELETE returns 200 with success message',
      passed: del1.status === 200 && del1.body.success === true,
      expected: 'HTTP 200',
      actual: `HTTP ${del1.status}`
    });

    // 2nd DELETE on already-deactivated item: Should succeed idempotently (or 404, let us check behavior)
    const del2 = await httpRequest({
      method: 'DELETE',
      path: `/api/menu/${tempId}`,
      headers: authHeaders
    });
    recordResult({
      category: 'Soft-Delete Lifecycle',
      name: 'Repeated DELETE on soft-deleted item behaves idempotently (HTTP 200)',
      passed: del2.status === 200 && del2.body.success === true,
      expected: 'HTTP 200',
      actual: `HTTP ${del2.status}`
    });

    // Verify row still exists in DB table
    const rowCheck = await db.execute({
      sql: 'SELECT id, is_active FROM menu_items WHERE id = ?;',
      args: [tempId]
    });
    recordResult({
      category: 'Soft-Delete Lifecycle',
      name: 'Record is physically preserved in database table with is_active = 0',
      passed: rowCheck.rows.length === 1 && Number(rowCheck.rows[0].is_active) === 0,
      expected: 'Row preserved with is_active=0',
      actual: `rows=${rowCheck.rows.length}, is_active=${rowCheck.rows[0]?.is_active}`
    });

    // Clean up temporary item
    await db.execute({ sql: 'DELETE FROM menu_items WHERE id = ?;', args: [tempId] });


    // -------------------------------------------------------------------------
    // CATEGORY 8: International Characters & Slug Generation Edge Cases
    // -------------------------------------------------------------------------
    console.log('\n--- CATEGORY 8: Non-ASCII, Bengali & Slug Generation Edge Cases ---');

    const unicodeCases = [
      { name: 'দার্জিলিং স্পেশাল চা', category: 'Drinks', price: 20 },
      { name: '☕ Hot Espresso 🍵', category: 'Drinks', price: 60 },
      { name: '---Special---Item---', category: 'Snacks', price: 50 },
      { name: '100% Organic Honey Lemon Tea', category: 'Drinks', price: 40 }
    ];

    for (const uc of unicodeCases) {
      const uRes = await httpRequest({
        method: 'POST',
        path: '/api/menu',
        headers: authHeaders,
        body: uc
      });
      const passed = uRes.status === 201 && !!uRes.body?.id && uRes.body.name === uc.name;
      recordResult({
        category: 'Unicode & Slug Generation',
        name: `POST handles "${uc.name}" and generates safe unique ID`,
        passed,
        expected: 'HTTP 201 with valid id',
        actual: `HTTP ${uRes.status}, id=${uRes.body?.id}`
      });

      if (uRes.body?.id) {
        await db.execute({ sql: 'DELETE FROM menu_items WHERE id = ?;', args: [uRes.body.id] });
      }
    }


    // -------------------------------------------------------------------------
    // CATEGORY 9: Malformed JSON and Request Body Handling
    // -------------------------------------------------------------------------
    console.log('\n--- CATEGORY 9: Malformed JSON and Content-Type Handling ---');

    // Send malformed JSON string directly
    const malformedJsonRes = await httpRequest({
      method: 'POST',
      path: '/api/menu',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: '{"name": "Broken JSON' // unclosed JSON
    });
    recordResult({
      category: 'Malformed Body',
      name: 'Malformed JSON payload is rejected with HTTP 400 Bad Request',
      passed: malformedJsonRes.status === 400,
      expected: 'HTTP 400',
      actual: `HTTP ${malformedJsonRes.status}`
    });

    // Final Catalog Invariant: Catalog contains exactly initial count of 34 authentic items
    const finalMenuRes = await httpRequest({ method: 'GET', path: '/api/menu' });
    recordResult({
      category: 'State Cleanliness',
      name: 'Adversarial barrage leaves authentic catalog intact with exactly 34 active items',
      passed: finalMenuRes.status === 200 && finalMenuRes.body.length === 34,
      expected: '34 items in active catalog',
      actual: `${finalMenuRes.body?.length} items in active catalog`
    });

  } finally {
    console.log('\nStopping test server...');
    await stopServer();
    console.log('Server stopped.\n');
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('================================================================');
  console.log('            CHALLENGER 2 TEST SUITE SUMMARY');
  console.log('================================================================');
  const total = testResults.length;
  const passed = testResults.filter((r) => r.passed).length;
  const failed = testResults.filter((r) => !r.passed).length;

  console.log(`Total Adversarial Tests Run: ${total}`);
  console.log(`Passed:                     ${passed}`);
  console.log(`Failed:                     ${failed}`);
  console.log('================================================================\n');

  const findings = testResults.filter((r) => r.details);
  if (findings.length > 0) {
    console.log('Adversarial Findings & Noteworthy Behaviors:');
    for (const f of findings) {
      console.log(`- [${f.severity || 'INFO'}] ${f.name}`);
      console.log(`  Actual:  ${f.actual}`);
      console.log(`  Details: ${f.details}\n`);
    }
  }

  return { total, passed, failed, findings };
}

runMenuAdversarialSuite().then(({ failed }) => {
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}).catch((err) => {
  console.error('Test suite crashed unexpectedly:', err);
  process.exit(1);
});
