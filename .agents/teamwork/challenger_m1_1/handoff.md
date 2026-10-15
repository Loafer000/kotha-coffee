# Milestone 1 Adversarial Challenge Report: Sequence Generator & Date Boundaries

**Author:** Challenger 1 (`challenger_m1_1`)  
**Role:** Empirical Challenger (critic, specialist)  
**Target:** Milestone 1 Core Sequence Generator, Database Schema & Date Boundary Architecture  
**Verdict:** **APPROVE** (with recommendations)  
**Date:** 2026-10-15  

---

## 1. Observation

1. **Baseline Verification**:
   - `npm run typecheck` (`node node_modules/typescript/bin/tsc --noEmit`): Exited with code 0 across the entire codebase.
   - `npm run test:m1` (`node node_modules/tsx/dist/cli.mjs tests/m1_verification.test.ts`): Exited with code 0. All 10 verification steps passed cleanly.

2. **Empirical Stress Test Suite 1: Concurrency Bursts (`tests/stress_concurrency.test.ts`)**:
   Executed command:
   ```bash
   node node_modules/tsx/dist/cli.mjs tests/stress_concurrency.test.ts
   ```
   *Direct Output*:
   ```
   === Starting Adversarial Concurrency Stress Suite ===

   1. Stress Test: Massive in-process burst (150 simultaneous requests)...
      PASSED: 150 parallel requests generated numbers 1..150 in 46ms with 0 collisions.

   2. Stress Test: Multi-process concurrency across 4 separate Node OS processes (100 total requests)...
      PASSED: 4 parallel OS processes generated 100 unique contiguous sequence numbers (1..100) in 1009ms with 0 lock collisions.

   3. Stress Test: Multi-connection contention (5 separate @libsql/client instances bypassing in-memory queue)...
      PASSED: 5 independent DB clients generated 75 distinct sequence numbers with 0 collisions.

   4. Stress Test: Queue fault isolation & liveness after rejection...
      PASSED: sequenceQueue cleanly recovers after task rejection.

   =====================================================
   ✅ ALL CONCURRENCY STRESS TESTS PASSED CLEANLY!
   =====================================================
   ```

3. **Empirical Stress Test Suite 2: Date Boundaries & Rollover (`tests/stress_boundaries.test.ts`)**:
   Executed command:
   ```bash
   node node_modules/tsx/dist/cli.mjs tests/stress_boundaries.test.ts
   ```
   *Direct Output*:
   ```
   === Starting Adversarial Date Boundaries & Rollover Stress Suite ===

   1. Testing exact millisecond midnight transition (Asia/Kolkata)...
      PASSED: Millisecond transition strictly verified: 2026-10-15 -> 2026-10-16 -> 2026-10-16

   2. Testing daily counter reset across simulated midnight rollover...
      PASSED: Order sequence resets to #1 on new day and isolates across dates.

   3. Testing leap year date boundaries (Feb 28 -> Feb 29 -> Mar 01)...
      PASSED: Leap and non-leap February transitions verified.

   4. Testing New Year boundary rollover (2026-12-31 -> 2027-01-01)...
      PASSED: New Year date and sequence boundary verified.

   5. Stress Test: Interleaved multi-day concurrent burst (90 requests across 3 dates)...
      PASSED: 90 interleaved requests generated isolated sequences 1..30 across 3 days with 0 collisions.

   6. Verifying database UNIQUE constraint uq_daily_order in orders table...
      PASSED: Database table constraint uq_daily_order strictly prevents duplicates.

   7. Testing malformed dateKey error handling and SQL injection prevention...
      PASSED: Malformed inputs rejected and parameterized SQL injection prevented.

   =====================================================
   ✅ ALL BOUNDARIES & ROLLOVER STRESS TESTS PASSED CLEANLY!
   =====================================================
   ```

4. **Code Observations & Architectural Vulnerability Discovered**:
   - `src/server/db/schema.ts` (lines 70–73):
     ```ts
     try {
       await db.execute('PRAGMA journal_mode = WAL;');
       await db.execute('PRAGMA busy_timeout = 5000;');
     } catch { ... }
     ```
     `PRAGMA busy_timeout = 5000;` is executed only within `initSchema()`.
   - `src/server/db/client.ts` (lines 46–48):
     ```ts
     clientInstance = createClient({
       url: fileUrl
     });
     ```
     `getDbClient()` does not execute `PRAGMA busy_timeout = 5000;`. SQLite pragmas in `@libsql/client` (via `better-sqlite3` native driver) are connection-scoped. If a secondary worker, background script, or test creates a client without calling `initSchema()`, `busy_timeout` defaults to 0ms.
   - When multi-process workers ran without `busy_timeout` configured, write operations on SQLite locked immediately with `SQLITE_BUSY: database is locked`. Once `PRAGMA busy_timeout = 5000;` is applied at startup (as happens in the Express server lifecycle via `startServer()`), 100 requests across 4 OS processes completed with 0 lock failures.
   - `src/server/db/sequence.ts` (lines 28–36):
     ```ts
     // If returning did not return rows, query the current value
     const selectResult = await db.execute({
       sql: `SELECT last_number FROM daily_counters WHERE date_key = ?;`,
       args: [dateKey]
     });
     ```
     In modern SQLite / LibSQL, `INSERT ... ON CONFLICT DO UPDATE ... RETURNING last_number` always returns rows. A fallback to an un-isolated `SELECT last_number` would not be atomic under race conditions.

---

## 2. Logic Chain

1. **Atomic Sequence Invariant (Observation 1.2 -> Step 1)**:
   - In `src/server/db/sequence.ts`, sequence numbers are generated via an atomic upsert:
     `INSERT INTO daily_counters (date_key, last_number) VALUES (?, 1) ON CONFLICT(date_key) DO UPDATE SET last_number = daily_counters.last_number + 1 RETURNING last_number;`
   - In-process requests are further serialized through a promise chain `sequenceQueue`. Under a burst of 150 concurrent calls within the Node.js process, all 150 numbers generated were strictly unique, contiguous integers from 1 to 150 with zero collisions and zero gaps.

2. **Cross-Process & Multi-Connection Safety (Observation 1.2 & 1.4 -> Step 2)**:
   - When 5 separate `@libsql/client` instances hit `data/kotha.db` concurrently without sharing an in-memory queue, LibSQL atomic upsert and retry backoff generated 75 strictly unique sequence numbers.
   - When 4 separate OS child processes hammered the database simultaneously (100 total requests), all 100 sequence numbers were strictly distinct (spanning 1..100) when `busy_timeout` was configured.

3. **Date Boundary & Midnight Rollover Invariant (Observation 1.3 -> Step 3)**:
   - Asia/Kolkata timezone offset is fixed at UTC+05:30 (India does not observe Daylight Saving Time).
   - At `2026-10-15T18:29:59.999Z` (23:59:59.999 IST), `formatDateKey` yields `2026-10-15`.
   - At `2026-10-15T18:30:00.000Z` (00:00:00.000 IST), `formatDateKey` rolls over to `2026-10-16`.
   - Sequence numbers reset to #1 upon crossing midnight. Out-of-order orders tagging previous dates increment only the previous date counter, leaving the current day's counter unaffected.
   - Leap years (2024, 2028: Feb 29; 2026: Feb 28 -> Mar 01) and year boundary (2026-12-31 -> 2027-01-01) operate with 100% precision.

4. **Database-Level Constraint Protection (Observation 1.3 -> Step 4)**:
   - Table `orders` contains `CONSTRAINT uq_daily_order UNIQUE (date_key, daily_order_number)`.
   - Direct empirical attempt to insert duplicate `(date_key, daily_order_number)` was rejected by the database engine with `SQLITE_CONSTRAINT: UNIQUE constraint failed`.

5. **Fault Isolation & Queue Liveness (Observation 1.2 -> Step 5)**:
   - When an invalid task (empty `dateKey`) was pushed to `sequenceQueue`, the promise rejected properly without breaking subsequent queue tasks, confirming queue recovery.

---

## 3. Caveats

1. **Single-Process Deployment Assumption**:
   - `PROJECT.md` specifies that Kotha & Coffee runs as a single lightweight Node.js Express process. The `sequenceQueue` serialization pattern protects against in-process race conditions.
   - For multi-process clustering or external scripts, callers must ensure `PRAGMA busy_timeout = 5000;` is executed on their connections.
2. **Cloud Turso Replication**:
   - In cloud production (`libsql://`), concurrency serialization is handled remotely by the Turso serverless primary. This local review tested SQLite in WAL file mode.

---

## 4. Conclusion

**VERDICT: APPROVE**

The Milestone 1 sequence generator, database schema, and date boundary logic are empirically sound, robust against high concurrency bursts, and mathematically exact across midnight and leap year transitions.

### Non-blocking Recommendations for Subsequent Milestones:
1. **Connection-level `busy_timeout`**: In `src/server/db/client.ts`, configure `PRAGMA busy_timeout = 5000;` immediately upon connection creation (or inside a connection hook) so auxiliary worker scripts or test runners automatically inherit lock patience without needing to call `initSchema()`.
2. **Fallback Query Removal**: In `src/server/db/sequence.ts` lines 28–36, remove the fallback `SELECT last_number` since `RETURNING last_number` is fully supported by LibSQL / SQLite 3.35+, eliminating any theoretical non-atomic read branch.

---

## 5. Verification Method

To independently verify all findings and stress tests:

1. **Run TypeScript Typecheck**:
   ```bash
   npm run typecheck
   ```
   *Expected*: Code 0, zero errors.

2. **Run Milestone 1 Verification Suite**:
   ```bash
   npm run test:m1
   ```
   *Expected*: 10/10 steps pass, code 0.

3. **Run Adversarial Concurrency Stress Suite**:
   ```bash
   node node_modules/tsx/dist/cli.mjs tests/stress_concurrency.test.ts
   ```
   *Expected*: 150 in-process parallel requests, 100 multi-process requests across 4 OS processes, 75 multi-connection requests, and queue fault recovery all pass with 0 collisions.

4. **Run Adversarial Date Boundaries & Rollover Stress Suite**:
   ```bash
   node node_modules/tsx/dist/cli.mjs tests/stress_boundaries.test.ts
   ```
   *Expected*: All 7 boundary tests (millisecond midnight rollover, leap years, New Year rollover, multi-day interleaving, DB constraint verification, SQL injection protection) pass with 0 errors.
