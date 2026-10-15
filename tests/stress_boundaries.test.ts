import assert from 'assert';
import { initSchema } from '../src/server/db/schema.js';
import { getDbClient, closeDbClient } from '../src/server/db/client.js';
import {
  formatDateKey,
  formatKolkataTime,
  getCafeDateKey,
  getCafeNow,
  setMockClock,
  resetMockClock
} from '../src/server/middleware/timezone.js';
import {
  getNextDailyOrderNumber,
  getCurrentDailyOrderNumber,
  resetDailyCounter
} from '../src/server/db/sequence.js';

async function runBoundariesStressSuite() {
  console.log('=== Starting Adversarial Date Boundaries & Rollover Stress Suite ===\n');

  await initSchema();
  const db = getDbClient();

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Exact Millisecond Rollover at 23:59:59.999 -> 00:00:00.000 IST
    // ------------------------------------------------------------------------
    console.log('1. Testing exact millisecond midnight transition (Asia/Kolkata)...');
    // Asia/Kolkata is UTC+05:30.
    // 2026-10-15 23:59:59.999 IST corresponds to 2026-10-15 18:29:59.999 UTC.
    const preMidnightDate = new Date('2026-10-15T18:29:59.999Z');
    const midnightDate = new Date('2026-10-15T18:30:00.000Z');
    const postMidnightDate = new Date('2026-10-15T18:30:00.001Z');

    const keyBefore = formatDateKey(preMidnightDate);
    const keyAt = formatDateKey(midnightDate);
    const keyAfter = formatDateKey(postMidnightDate);

    assert.strictEqual(keyBefore, '2026-10-15', '1 millisecond before midnight must be 2026-10-15');
    assert.strictEqual(keyAt, '2026-10-16', 'Exactly midnight (18:30:00.000Z) must be 2026-10-16');
    assert.strictEqual(keyAfter, '2026-10-16', '1 millisecond after midnight must be 2026-10-16');
    console.log(`   PASSED: Millisecond transition strictly verified: ${keyBefore} -> ${keyAt} -> ${keyAfter}\n`);

    // ------------------------------------------------------------------------
    // TEST 2: Sequence Reset Across Simulated Midnight Rollover
    // ------------------------------------------------------------------------
    console.log('2. Testing daily counter reset across simulated midnight rollover...');
    await resetDailyCounter('2026-10-15');
    await resetDailyCounter('2026-10-16');

    // Simulate order 1, 2, 3 before midnight
    setMockClock({ timestamp: '2026-10-15T18:29:50.000Z' });
    const dateKeyDay1 = getCafeDateKey();
    assert.strictEqual(dateKeyDay1, '2026-10-15');

    const day1Num1 = await getNextDailyOrderNumber(dateKeyDay1);
    const day1Num2 = await getNextDailyOrderNumber(dateKeyDay1);
    const day1Num3 = await getNextDailyOrderNumber(dateKeyDay1);
    assert.strictEqual(day1Num1, 1);
    assert.strictEqual(day1Num2, 2);
    assert.strictEqual(day1Num3, 3);

    // Cross the midnight boundary to 00:00:05 IST
    setMockClock({ timestamp: '2026-10-15T18:30:05.000Z' });
    const dateKeyDay2 = getCafeDateKey();
    assert.strictEqual(dateKeyDay2, '2026-10-16');

    // First order of new day MUST be #1
    const day2Num1 = await getNextDailyOrderNumber(dateKeyDay2);
    const day2Num2 = await getNextDailyOrderNumber(dateKeyDay2);
    assert.strictEqual(day2Num1, 1, 'First order after midnight rollover MUST reset to #1');
    assert.strictEqual(day2Num2, 2, 'Second order after rollover MUST be #2');

    // Verify Day 1 counter is untouched and preserved
    const day1Final = await getCurrentDailyOrderNumber('2026-10-15');
    assert.strictEqual(day1Final, 3, 'Day 1 counter must remain at 3');

    // Verify out-of-order order on Day 1 increments Day 1 to 4 without touching Day 2
    const day1LateOrder = await getNextDailyOrderNumber('2026-10-15');
    assert.strictEqual(day1LateOrder, 4, 'Late order for Day 1 must increment Day 1 to #4');
    const day2Check = await getCurrentDailyOrderNumber('2026-10-16');
    assert.strictEqual(day2Check, 2, 'Day 2 counter must remain unaffected by Day 1 late order');

    resetMockClock();
    console.log('   PASSED: Order sequence resets to #1 on new day and isolates across dates.\n');

    // ------------------------------------------------------------------------
    // TEST 3: Leap Year Rollover (2024 & 2028 leap, 2026 non-leap)
    // ------------------------------------------------------------------------
    console.log('3. Testing leap year date boundaries (Feb 28 -> Feb 29 -> Mar 01)...');
    // Leap year 2024: Feb 29 exists
    const feb28_2024 = new Date('2024-02-28T18:29:59.999Z'); // Feb 28 23:59:59 IST
    const feb29_2024 = new Date('2024-02-28T18:30:00.000Z'); // Feb 29 00:00:00 IST
    const mar01_2024 = new Date('2024-02-29T18:30:00.000Z'); // Mar 01 00:00:00 IST

    assert.strictEqual(formatDateKey(feb28_2024), '2024-02-28');
    assert.strictEqual(formatDateKey(feb29_2024), '2024-02-29', '2024 is a leap year; Feb 29 must exist');
    assert.strictEqual(formatDateKey(mar01_2024), '2024-03-01');

    // Leap year 2028: Feb 29 exists
    const feb29_2028 = new Date('2028-02-28T18:30:00.000Z'); // Feb 29 00:00:00 IST
    assert.strictEqual(formatDateKey(feb29_2028), '2028-02-29', '2028 is a leap year; Feb 29 must exist');

    // Non-leap year 2026: Feb 28 rolls directly to Mar 01
    const feb28_2026 = new Date('2026-02-28T18:29:59.999Z');
    const mar01_2026 = new Date('2026-02-28T18:30:00.000Z');
    assert.strictEqual(formatDateKey(feb28_2026), '2026-02-28');
    assert.strictEqual(formatDateKey(mar01_2026), '2026-03-01', '2026 is non-leap; Feb 28 must roll to Mar 01');
    console.log('   PASSED: Leap and non-leap February transitions verified.\n');

    // ------------------------------------------------------------------------
    // TEST 4: Year-End Boundary (Dec 31 -> Jan 01)
    // ------------------------------------------------------------------------
    console.log('4. Testing New Year boundary rollover (2026-12-31 -> 2027-01-01)...');
    const newYearEve = new Date('2026-12-31T18:29:59.999Z');
    const newYearDay = new Date('2026-12-31T18:30:00.000Z');

    assert.strictEqual(formatDateKey(newYearEve), '2026-12-31');
    assert.strictEqual(formatDateKey(newYearDay), '2027-01-01');

    await resetDailyCounter('2026-12-31');
    await resetDailyCounter('2027-01-01');

    const nyeNum = await getNextDailyOrderNumber('2026-12-31');
    assert.strictEqual(nyeNum, 1);
    const nydNum = await getNextDailyOrderNumber('2027-01-01');
    assert.strictEqual(nydNum, 1, 'First order of new year must start at #1');
    console.log('   PASSED: New Year date and sequence boundary verified.\n');

    // ------------------------------------------------------------------------
    // TEST 5: Interleaved Multi-Day Concurrency Burst (90 requests across 3 dates)
    // ------------------------------------------------------------------------
    console.log('5. Stress Test: Interleaved multi-day concurrent burst (90 requests across 3 dates)...');
    const dateA = '2026-11-01';
    const dateB = '2026-11-02';
    const dateC = '2026-11-03';

    await resetDailyCounter(dateA);
    await resetDailyCounter(dateB);
    await resetDailyCounter(dateC);

    const dates = [dateA, dateB, dateC];
    const interleavedRequests: { dateKey: string; promise: Promise<number> }[] = [];

    // Queue 30 requests per date, interleaved
    for (let i = 0; i < 30; i++) {
      for (const d of dates) {
        interleavedRequests.push({
          dateKey: d,
          promise: getNextDailyOrderNumber(d)
        });
      }
    }

    const settledResults = await Promise.all(
      interleavedRequests.map(async (r) => ({
        dateKey: r.dateKey,
        num: await r.promise
      }))
    );

    const resultsA = settledResults.filter((r) => r.dateKey === dateA).map((r) => r.num);
    const resultsB = settledResults.filter((r) => r.dateKey === dateB).map((r) => r.num);
    const resultsC = settledResults.filter((r) => r.dateKey === dateC).map((r) => r.num);

    assert.strictEqual(resultsA.length, 30);
    assert.strictEqual(resultsB.length, 30);
    assert.strictEqual(resultsC.length, 30);

    const setA = new Set(resultsA);
    const setB = new Set(resultsB);
    const setC = new Set(resultsC);

    assert.strictEqual(setA.size, 30, 'Date A numbers must be completely unique');
    assert.strictEqual(setB.size, 30, 'Date B numbers must be completely unique');
    assert.strictEqual(setC.size, 30, 'Date C numbers must be completely unique');

    const sortedA = [...resultsA].sort((a, b) => a - b);
    for (let i = 0; i < 30; i++) assert.strictEqual(sortedA[i], i + 1);

    const sortedB = [...resultsB].sort((a, b) => a - b);
    for (let i = 0; i < 30; i++) assert.strictEqual(sortedB[i], i + 1);

    const sortedC = [...resultsC].sort((a, b) => a - b);
    for (let i = 0; i < 30; i++) assert.strictEqual(sortedC[i], i + 1);

    console.log('   PASSED: 90 interleaved requests generated isolated sequences 1..30 across 3 days with 0 collisions.\n');

    // ------------------------------------------------------------------------
    // TEST 6: Unique Database Constraint Enforcement (uq_daily_order)
    // ------------------------------------------------------------------------
    console.log('6. Verifying database UNIQUE constraint uq_daily_order in orders table...');
    const testOrderId1 = 'test-order-uuid-1';
    const testOrderId2 = 'test-order-uuid-2';
    const constraintDate = '2026-11-04';

    // Cleanup test records
    await db.execute({ sql: 'DELETE FROM orders WHERE date_key = ?', args: [constraintDate] });

    // Insert first order with order #1
    await db.execute({
      sql: `INSERT INTO orders (id, date_key, daily_order_number, status, payment_method, total_amount, created_at, updated_at)
            VALUES (?, ?, 1, 'PENDING', 'Cash', 150.00, datetime('now'), datetime('now'));`,
      args: [testOrderId1, constraintDate]
    });

    // Attempt to insert duplicate (same date_key, same order number #1)
    let duplicateRejected = false;
    let constraintError: any = null;
    try {
      await db.execute({
        sql: `INSERT INTO orders (id, date_key, daily_order_number, status, payment_method, total_amount, created_at, updated_at)
              VALUES (?, ?, 1, 'PENDING', 'UPI', 200.00, datetime('now'), datetime('now'));`,
        args: [testOrderId2, constraintDate]
      });
    } catch (err: any) {
      duplicateRejected = true;
      constraintError = err;
    }

    assert.ok(duplicateRejected, 'Database MUST reject duplicate (date_key, daily_order_number) with constraint error');
    assert.ok(
      constraintError.message.includes('UNIQUE constraint failed') ||
      constraintError.code === 'SQLITE_CONSTRAINT',
      `Expected SQLite constraint violation, got: ${constraintError.message}`
    );

    // Insert second order with order #2 on same day (MUST succeed)
    await db.execute({
      sql: `INSERT INTO orders (id, date_key, daily_order_number, status, payment_method, total_amount, created_at, updated_at)
            VALUES (?, ?, 2, 'PENDING', 'UPI', 200.00, datetime('now'), datetime('now'));`,
      args: [testOrderId2, constraintDate]
    });

    // Clean up
    await db.execute({ sql: 'DELETE FROM orders WHERE date_key = ?', args: [constraintDate] });
    console.log('   PASSED: Database table constraint uq_daily_order strictly prevents duplicates.\n');

    // ------------------------------------------------------------------------
    // TEST 7: Malformed and Edge-Case Date Keys
    // ------------------------------------------------------------------------
    console.log('7. Testing malformed dateKey error handling and SQL injection prevention...');
    // Empty dateKey
    let emptyCaught = false;
    try {
      await getNextDailyOrderNumber('');
    } catch {
      emptyCaught = true;
    }
    assert.ok(emptyCaught, 'Empty dateKey must reject');

    // Non-string dateKey
    let nullCaught = false;
    try {
      await getNextDailyOrderNumber(null as any);
    } catch {
      nullCaught = true;
    }
    assert.ok(nullCaught, 'null dateKey must reject');

    // SQL Injection attempt in dateKey
    const injectionDateKey = "2026-11-05'; DROP TABLE orders; --";
    const injectionNum = await getNextDailyOrderNumber(injectionDateKey);
    assert.strictEqual(injectionNum, 1);

    // Verify orders table was NOT dropped
    const ordersTableCheck = await db.execute(`SELECT name FROM sqlite_master WHERE type='table' AND name='orders';`);
    assert.strictEqual(ordersTableCheck.rows.length, 1, 'orders table must still exist (SQL injection prevented)');

    await resetDailyCounter(injectionDateKey);
    console.log('   PASSED: Malformed inputs rejected and parameterized SQL injection prevented.\n');

    console.log('=====================================================');
    console.log('✅ ALL BOUNDARIES & ROLLOVER STRESS TESTS PASSED CLEANLY!');
    console.log('=====================================================');
  } finally {
    resetMockClock();
    await closeDbClient();
  }
}

runBoundariesStressSuite().catch((err) => {
  console.error('\n❌ BOUNDARIES STRESS SUITE FAILED:', err);
  process.exit(1);
});
