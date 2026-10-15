import http from 'http';
import assert from 'assert';
import { startServer, stopServer } from '../src/server/index.js';
import { getDbClient } from '../src/server/db/client.js';
import { getNextDailyOrderNumber, getCurrentDailyOrderNumber } from '../src/server/db/sequence.js';
import { formatDateKey, setMockClock, resetMockClock } from '../src/server/middleware/timezone.js';

const TEST_PORT = 3100;
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

async function runTests() {
  console.log('=== Starting Milestone 1 Verification Suite ===\n');
  process.env.NODE_ENV = 'test';
  process.env.PORT = String(TEST_PORT);

  // Boot test server
  console.log('1. Starting Express server...');
  await startServer(TEST_PORT);
  console.log('   Server running successfully.\n');

  try {
    // Test 1: GET /api/health
    console.log('2. Verifying GET /api/health returns 200 with Asia/Kolkata dateKey...');
    const healthRes = await httpRequest({ method: 'GET', path: '/api/health' });
    assert.strictEqual(healthRes.status, 200, 'Health check should return status 200');
    assert.strictEqual(healthRes.body.status, 'ok', 'Health status should be ok');
    assert.ok(healthRes.body.dateKey, 'Response should contain dateKey');
    assert.match(healthRes.body.dateKey, /^\d{4}-\d{2}-\d{2}$/, 'dateKey must be YYYY-MM-DD');

    // Confirm dateKey matches Asia/Kolkata calculation
    const expectedDateKey = formatDateKey(new Date());
    assert.strictEqual(healthRes.body.dateKey, expectedDateKey, 'dateKey should match Asia/Kolkata current date');
    console.log(`   Health check verified. dateKey=${healthRes.body.dateKey}, time=${healthRes.body.time}\n`);

    // Test 2: PIN Authentication (Invalid PIN)
    console.log('3. Verifying POST /api/auth/verify-pin rejects wrong PIN with 401...');
    const wrongPinRes = await httpRequest({
      method: 'POST',
      path: '/api/auth/verify-pin',
      body: { pin: '9999' }
    });
    assert.strictEqual(wrongPinRes.status, 401, 'Wrong PIN must return 401');
    assert.ok(wrongPinRes.body.error, 'Wrong PIN response must contain error message');
    console.log('   Wrong PIN properly rejected with 401.\n');

    // Test 3: PIN Authentication (Correct PIN: '1234')
    console.log('4. Verifying POST /api/auth/verify-pin with correct PIN "1234" issues valid 12h token...');
    const correctPinRes = await httpRequest({
      method: 'POST',
      path: '/api/auth/verify-pin',
      body: { pin: '1234' }
    });
    assert.strictEqual(correctPinRes.status, 200, 'Correct PIN must return 200');
    assert.ok(correctPinRes.body.token, 'Response must include session token');
    assert.strictEqual(correctPinRes.body.expiresIn, 43200, 'Token expiry must be 12 hours (43200s)');
    const authToken = correctPinRes.body.token;
    console.log('   Session token issued successfully.\n');

    // Test 4: Route Guarding (Unauthenticated mutation blocked with 401)
    console.log('5. Verifying unauthenticated mutations are blocked with 401...');
    const unauthOrderRes = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      body: { items: [] }
    });
    assert.strictEqual(unauthOrderRes.status, 401, 'Unauthenticated order creation must return 401');
    assert.deepStrictEqual(unauthOrderRes.body, { error: 'Unauthorized' });

    const unauthMenuRes = await httpRequest({
      method: 'POST',
      path: '/api/menu',
      body: { name: 'Latte' }
    });
    assert.strictEqual(unauthMenuRes.status, 401, 'Unauthenticated menu mutation must return 401');
    assert.deepStrictEqual(unauthMenuRes.body, { error: 'Unauthorized' });
    console.log('   All unauthenticated mutations blocked with 401 { error: "Unauthorized" }.\n');

    // Test 5: Authenticated Mutation & PIN Security
    console.log('6. Verifying authenticated request passes reception auth guard...');

    // 5.1 Assert initial PIN is stored cryptographically hashed with salt (not plaintext "1234")
    const dbClient = getDbClient();
    const initialPinRow = await dbClient.execute(`SELECT value FROM settings WHERE key = 'reception_pin';`);
    assert.ok(initialPinRow.rows.length > 0, 'reception_pin row must exist in settings table');
    const storedInitialPin = String(initialPinRow.rows[0].value);
    assert.notStrictEqual(storedInitialPin, '1234', 'Stored PIN in database must NOT be plaintext "1234"');
    assert.ok(storedInitialPin.includes(':'), 'Stored PIN must be in "salt:hash" format');
    const [initialSalt, initialHash] = storedInitialPin.split(':');
    assert.strictEqual(initialSalt.length, 32, 'Cryptographic salt must be 32 hex characters (16 bytes)');
    assert.strictEqual(initialHash.length, 64, 'Cryptographic hash must be 64 hex characters (32 bytes)');
    console.log('   Initial PIN verified as cryptographic salt:hash in settings table.');

    // 5.2 Missing currentPin MUST be rejected with HTTP 401
    const missingCurrentPinRes = await httpRequest({
      method: 'POST',
      path: '/api/auth/change-pin',
      headers: { Authorization: `Bearer ${authToken}` },
      body: { newPin: '5678' }
    });
    assert.strictEqual(missingCurrentPinRes.status, 401, 'Missing currentPin must return 401');
    assert.deepStrictEqual(missingCurrentPinRes.body, { error: 'Invalid current PIN' });

    // 5.3 Incorrect currentPin MUST be rejected with HTTP 401
    const wrongCurrentPinRes = await httpRequest({
      method: 'POST',
      path: '/api/auth/change-pin',
      headers: { Authorization: `Bearer ${authToken}` },
      body: { currentPin: '0000', newPin: '5678' }
    });
    assert.strictEqual(wrongCurrentPinRes.status, 401, 'Wrong currentPin must return 401');
    assert.deepStrictEqual(wrongCurrentPinRes.body, { error: 'Invalid current PIN' });

    // 5.4 Non-numeric newPin MUST be rejected with HTTP 400
    const nonNumericNewPinRes = await httpRequest({
      method: 'POST',
      path: '/api/auth/change-pin',
      headers: { Authorization: `Bearer ${authToken}` },
      body: { currentPin: '1234', newPin: 'abcd' }
    });
    assert.strictEqual(nonNumericNewPinRes.status, 400, 'Non-numeric newPin must return 400');
    assert.deepStrictEqual(nonNumericNewPinRes.body, { error: 'PIN must be 4 to 6 digits' });

    // 5.5 Short newPin (< 4 digits) MUST be rejected with HTTP 400
    const shortNewPinRes = await httpRequest({
      method: 'POST',
      path: '/api/auth/change-pin',
      headers: { Authorization: `Bearer ${authToken}` },
      body: { currentPin: '1234', newPin: '123' }
    });
    assert.strictEqual(shortNewPinRes.status, 400, 'Short newPin must return 400');
    assert.deepStrictEqual(shortNewPinRes.body, { error: 'PIN must be 4 to 6 digits' });

    // 5.6 Long newPin (> 6 digits) MUST be rejected with HTTP 400
    const longNewPinRes = await httpRequest({
      method: 'POST',
      path: '/api/auth/change-pin',
      headers: { Authorization: `Bearer ${authToken}` },
      body: { currentPin: '1234', newPin: '1234567' }
    });
    assert.strictEqual(longNewPinRes.status, 400, 'Long newPin must return 400');
    assert.deepStrictEqual(longNewPinRes.body, { error: 'PIN must be 4 to 6 digits' });

    // 5.7 Valid PIN change with currentPin '1234' and newPin '5678'
    const authPinChangeRes = await httpRequest({
      method: 'POST',
      path: '/api/auth/change-pin',
      headers: { Authorization: `Bearer ${authToken}` },
      body: { currentPin: '1234', newPin: '5678' }
    });
    assert.strictEqual(authPinChangeRes.status, 200, 'Authorized PIN change must return 200');
    assert.strictEqual(authPinChangeRes.body.success, true);

    // 5.8 Assert updated PIN is stored hashed with salt (not plaintext "5678")
    const updatedPinRow = await dbClient.execute(`SELECT value FROM settings WHERE key = 'reception_pin';`);
    const storedUpdatedPin = String(updatedPinRow.rows[0].value);
    assert.notStrictEqual(storedUpdatedPin, '5678', 'Updated PIN must NOT be plaintext "5678"');
    assert.ok(storedUpdatedPin.includes(':'), 'Updated PIN must be salt:hash');
    const [upSalt, upHash] = storedUpdatedPin.split(':');
    assert.strictEqual(upSalt.length, 32);
    assert.strictEqual(upHash.length, 64);

    // 5.9 Verify old PIN fails and new PIN succeeds
    const oldPinTest = await httpRequest({
      method: 'POST',
      path: '/api/auth/verify-pin',
      body: { pin: '1234' }
    });
    assert.strictEqual(oldPinTest.status, 401, 'Old PIN must fail after change');

    const newPinTest = await httpRequest({
      method: 'POST',
      path: '/api/auth/verify-pin',
      body: { pin: '5678' }
    });
    assert.strictEqual(newPinTest.status, 200, 'New PIN 5678 must succeed');
    const newAuthToken = newPinTest.body.token;

    // 5.10 Reset PIN back to '1234' using correct currentPin '5678'
    const resetPinRes = await httpRequest({
      method: 'POST',
      path: '/api/auth/change-pin',
      headers: { Authorization: `Bearer ${newAuthToken}` },
      body: { currentPin: '5678', newPin: '1234' }
    });
    assert.strictEqual(resetPinRes.status, 200, 'PIN reset to 1234 must succeed');
    console.log('   PIN change, validation, and cryptographic persistence in settings verified.\n');

    // Test 6: Atomic Counter (Sequential and fresh dateKey reset)
    console.log('7. Verifying atomic daily sequence starts at #1 for fresh date key and increments...');
    const testDate1 = '2026-10-15';
    const testDate2 = '2026-10-16';

    // Clear test table
    await httpRequest({ method: 'POST', path: '/api/test/reset' });

    const seq1 = await getNextDailyOrderNumber(testDate1);
    assert.strictEqual(seq1, 1, 'First order of date 1 must be #1');

    const seq2 = await getNextDailyOrderNumber(testDate1);
    assert.strictEqual(seq2, 2, 'Second order of date 1 must be #2');

    const seq3 = await getNextDailyOrderNumber(testDate1);
    assert.strictEqual(seq3, 3, 'Third order of date 1 must be #3');

    // Date change to testDate2: must reset to #1
    const nextDaySeq1 = await getNextDailyOrderNumber(testDate2);
    assert.strictEqual(nextDaySeq1, 1, 'First order of new day must reset to #1');

    const nextDaySeq2 = await getNextDailyOrderNumber(testDate2);
    assert.strictEqual(nextDaySeq2, 2, 'Second order of new day must be #2');

    // Previous date counter is preserved
    const currentPrevDate = await getCurrentDailyOrderNumber(testDate1);
    assert.strictEqual(currentPrevDate, 3, 'Previous day counter must remain at 3');
    console.log('   Atomic sequential counter and day boundary reset verified.\n');

    // Test 7: Concurrency Test (25 simultaneous requests)
    console.log('8. Stress-testing concurrency on atomic sequence generator (25 parallel requests)...');
    const concurrentDate = '2026-10-17';
    const concurrentCount = 25;
    const promises = Array.from({ length: concurrentCount }, () =>
      getNextDailyOrderNumber(concurrentDate)
    );
    const results = await Promise.all(promises);

    // Verify all 25 numbers are strictly unique and span 1..25
    assert.strictEqual(results.length, concurrentCount, 'Must receive 25 responses');
    const uniqueSet = new Set(results);
    assert.strictEqual(uniqueSet.size, concurrentCount, 'All generated order numbers must be unique under concurrency');

    const sorted = [...results].sort((a, b) => a - b);
    for (let i = 0; i < concurrentCount; i++) {
      assert.strictEqual(sorted[i], i + 1, `Expected sequence #${i + 1}, got #${sorted[i]}`);
    }
    console.log(`   Concurrency test PASSED: Generated ${concurrentCount} unique sequence numbers (1 to ${concurrentCount}) without collisions.\n`);

    // Test 8: Clock Simulation & Timezone Endpoints
    console.log('9. Verifying clock simulation test endpoints (/api/test/set-time, reset-time, X-Mock-Date)...');
    const setTimeRes = await httpRequest({
      method: 'POST',
      path: '/api/test/set-time',
      body: { dateKey: '2027-01-01' }
    });
    assert.strictEqual(setTimeRes.status, 200);
    assert.strictEqual(setTimeRes.body.dateKey, '2027-01-01');

    const mockedHealth = await httpRequest({ method: 'GET', path: '/api/health' });
    assert.strictEqual(mockedHealth.body.dateKey, '2027-01-01', 'Health check must reflect simulated dateKey');

    // Test X-Mock-Date header override in non-production
    const headerMockRes = await httpRequest({
      method: 'GET',
      path: '/api/health',
      headers: { 'X-Mock-Date': '2028-05-20' }
    });
    assert.strictEqual(headerMockRes.body.dateKey, '2028-05-20', 'Header X-Mock-Date must override dateKey in non-production');

    // Test X-Mock-Date header is strictly IGNORED in production mode
    process.env.NODE_ENV = 'production';
    try {
      const prodHeaderMockRes = await httpRequest({
        method: 'GET',
        path: '/api/health',
        headers: { 'X-Mock-Date': '2028-05-20' }
      });
      assert.strictEqual(prodHeaderMockRes.status, 200);
      assert.notStrictEqual(
        prodHeaderMockRes.body.dateKey,
        '2028-05-20',
        'X-Mock-Date header MUST be ignored when NODE_ENV is production'
      );
      assert.strictEqual(
        prodHeaderMockRes.body.dateKey,
        expectedDateKey,
        'dateKey must reflect real Asia/Kolkata clock in production'
      );
      console.log('   X-Mock-Date restriction in production verified (header strictly ignored).');
    } finally {
      process.env.NODE_ENV = 'test';
    }

    // Reset clock
    const resetTimeRes = await httpRequest({ method: 'POST', path: '/api/test/reset-time' });
    assert.strictEqual(resetTimeRes.status, 200);
    assert.strictEqual(resetTimeRes.body.restored, true);

    const restoredHealth = await httpRequest({ method: 'GET', path: '/api/health' });
    assert.strictEqual(restoredHealth.body.dateKey, expectedDateKey, 'Health check must restore to real dateKey');
    console.log('   Clock simulation and mock date headers verified.\n');

    // Test 9: Database Schema & All 5 Tables Verification
    console.log('10. Verifying database schema: all 5 tables and indexes exist...');
    const db = getDbClient();
    const tablesRes = await db.execute(`
      SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;
    `);
    const tableNames = tablesRes.rows.map((r: any) => r.name);
    console.log('    Found tables in database:', tableNames);

    assert.ok(tableNames.includes('settings'), 'Table settings must exist');
    assert.ok(tableNames.includes('menu_items'), 'Table menu_items must exist');
    assert.ok(tableNames.includes('daily_counters'), 'Table daily_counters must exist');
    assert.ok(tableNames.includes('orders'), 'Table orders must exist');
    assert.ok(tableNames.includes('order_items'), 'Table order_items must exist');

    const indexesRes = await db.execute(`
      SELECT name FROM sqlite_master WHERE type='index' ORDER BY name;
    `);
    const indexNames = indexesRes.rows.map((r: any) => r.name);
    console.log('    Found indexes in database:', indexNames);
    assert.ok(indexNames.includes('idx_orders_status'), 'Index idx_orders_status must exist');
    assert.ok(indexNames.includes('idx_orders_date_key'), 'Index idx_orders_date_key must exist');
    assert.ok(indexNames.includes('idx_order_items_order_id'), 'Index idx_order_items_order_id must exist');
    console.log('    All 5 tables and required indexes verified.\n');

    // Test 10: Database Connection Settings (PRAGMA WAL and busy_timeout)
    console.log('11. Verifying database connection settings (PRAGMA WAL and busy_timeout)...');
    const journalModeRes = await db.execute(`PRAGMA journal_mode;`);
    const journalModeVal = String(Object.values(journalModeRes.rows[0])[0]).toLowerCase();
    console.log(`    Active journal_mode: ${journalModeVal}`);
    assert.ok(
      journalModeVal === 'wal' || journalModeVal === 'memory',
      `journal_mode must be wal or memory, got ${journalModeVal}`
    );

    const busyTimeoutRes = await db.execute(`PRAGMA busy_timeout;`);
    const busyTimeoutVal = Number(Object.values(busyTimeoutRes.rows[0])[0]);
    console.log(`    Active busy_timeout: ${busyTimeoutVal}`);
    assert.strictEqual(busyTimeoutVal, 5000, `busy_timeout must be 5000, got ${busyTimeoutVal}`);
    console.log('    Database PRAGMA settings verified.\n');

    console.log('=====================================================');
    console.log('✅ ALL MILESTONE 1 VERIFICATION TESTS PASSED CLEANLY!');
    console.log('=====================================================');
  } finally {
    console.log('\nStopping server and closing connections...');
    resetMockClock();
    await stopServer();
    console.log('Cleanup completed.');
  }
}

runTests().catch((err) => {
  console.error('\n❌ VERIFICATION TEST FAILED:', err);
  process.exit(1);
});
