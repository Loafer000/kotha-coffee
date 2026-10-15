# Forensic Audit Report: Milestone 1

**Work Product**: Milestone 1 Implementation (`src/server/`, `tests/m1_verification.test.ts`, `data/kotha.db`)  
**Auditor**: Forensic Integrity Auditor (`auditor_m1`)  
**Integrity Mode**: Development (per `ORIGINAL_REQUEST.md` line 8)  
**Profile**: General Project  
**Verdict**: **CLEAN**

---

## 1. Observation

Direct forensic observations of code, tool commands, database contents, and runtime executions:

### 1.1 Source Code and Architecture Verification
- **Express Server (`src/server/index.ts`)**: Initializes database schema (`initSchema()`) on startup, binds `timezoneMiddleware`, mounts `/api/auth` and `/api/test`, and enforces `requireReceptionAuth` on any mutating HTTP requests (`req.method !== 'GET'`) to `/api/orders` and `/api/menu`.
- **Database Layer (`src/server/db/client.ts` & `src/server/db/schema.ts`)**: Uses `@libsql/client` in dual-mode (local SQLite file `data/kotha.db` vs Turso cloud). Schema DDL creates 5 tables (`settings`, `menu_items`, `daily_counters`, `orders`, `order_items`) and 3 indexes (`idx_orders_status`, `idx_orders_date_key`, `idx_order_items_order_id`). Sets `PRAGMA journal_mode = WAL;` and `PRAGMA busy_timeout = 5000;`.
- **Sequence Generator (`src/server/db/sequence.ts`)**: Executes atomic upsert statement `INSERT INTO daily_counters (date_key, last_number) VALUES (?, 1) ON CONFLICT(date_key) DO UPDATE SET last_number = daily_counters.last_number + 1 RETURNING last_number;` serialized via promise chaining and backed by exponential retry.
- **Authentication & Security Guard (`src/server/middleware/auth.ts`)**: Implements `jsonwebtoken` signing with 12-hour expiration (`43200s`), `verifyPin` querying SQLite `settings` table, and route middleware blocking unauthorized requests with HTTP 401 `{ error: "Unauthorized" }`.
- **Timezone Engine (`src/server/middleware/timezone.ts`)**: Formats dates using `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' })` (UTC+05:30), with mock clock injection facilities for testing midnight rollover.

### 1.2 Empirical Tool Command Outputs

#### A. Typecheck (`npm run typecheck`)
```
> kotha-coffee@1.0.0 typecheck
> node node_modules/typescript/bin/tsc --noEmit

Exit code: 0
```

#### B. Verification Suite (`npm run test:m1`)
```
> kotha-coffee@1.0.0 test:m1
> node node_modules/tsx/dist/cli.mjs tests/m1_verification.test.ts

=== Starting Milestone 1 Verification Suite ===

1. Starting Express server...
[Kotha & Coffee] Server running on http://localhost:3100
   Server running successfully.

2. Verifying GET /api/health returns 200 with Asia/Kolkata dateKey...
   Health check verified. dateKey=2026-10-15, time=2026-10-15T02:48:32.818Z

3. Verifying POST /api/auth/verify-pin rejects wrong PIN with 401...
   Wrong PIN properly rejected with 401.

4. Verifying POST /api/auth/verify-pin with correct PIN "1234" issues valid 12h token...
   Session token issued successfully.

5. Verifying unauthenticated mutations are blocked with 401...
   All unauthenticated mutations blocked with 401 { error: "Unauthorized" }.

6. Verifying authenticated request passes reception auth guard...
   PIN change and persistence in settings table verified.

7. Verifying atomic daily sequence starts at #1 for fresh date key and increments...
   Atomic sequential counter and day boundary reset verified.

8. Stress-testing concurrency on atomic sequence generator (25 parallel requests)...
   Concurrency test PASSED: Generated 25 unique sequence numbers (1 to 25) without collisions.

9. Verifying clock simulation test endpoints (/api/test/set-time, reset-time, X-Mock-Date)...
   Clock simulation and mock date headers verified.

10. Verifying database schema: all 5 tables and indexes exist...
    Found tables in database: [ 'daily_counters', 'menu_items', 'order_items', 'orders', 'settings' ]
    Found indexes in database: [
  'idx_order_items_order_id',
  'idx_orders_date_key',
  'idx_orders_status',
  'sqlite_autoindex_daily_counters_1',
  'sqlite_autoindex_menu_items_1',
  'sqlite_autoindex_order_items_1',
  'sqlite_autoindex_orders_1',
  'sqlite_autoindex_orders_2',
  'sqlite_autoindex_settings_1'
]
    All 5 tables and required indexes verified.

=====================================================
✅ ALL MILESTONE 1 VERIFICATION TESTS PASSED CLEANLY!
=====================================================

Stopping server and closing connections...
Cleanup completed.

Exit code: 0
```

#### C. Direct SQLite Database Inspection (`data/kotha.db`)
Direct execution of query against SQLite storage:
```
Tables: [ 'settings', 'menu_items', 'daily_counters', 'orders', 'order_items' ]
Settings: [
  {
    key: 'reception_pin',
    value: '1234',
    updated_at: '2026-10-15T02:46:32.745Z'
  }
]
Counters: [
  { date_key: '2026-10-15', last_number: 3 },
  { date_key: '2026-10-16', last_number: 2 },
  { date_key: '2026-10-17', last_number: 25 }
]
```

#### D. Independent Adversarial Probes
1. **JWT Cryptographic Integrity**:
   - Legitimate signed token verified: role `'reception'`, cafe `'kotha-coffee'`, 12h expiry.
   - Forged token with invalid HMAC secret: rejected (`null`).
   - Tampered token payload (modified cafe payload without updating signature): rejected (`null`).
   - Expired token: rejected (`null`).
   - Non-reception role token: rejected (`null`).
2. **PIN Security & Database Persistence**:
   - `updateAdminPin('9876')` persisted directly to SQLite `settings` table.
   - `verifyPin('9876')` -> `true`.
   - `verifyPin('0000')` -> `false`.
   - `verifyPin('')` and `verifyPin(null)` -> `false`.
   - `updateAdminPin('12')` (< 4 digits) -> rejected with validation error.
3. **Asia/Kolkata Midnight Boundary**:
   - `2026-10-15T18:29:59Z` (IST 23:59:59) -> `2026-10-15`.
   - `2026-10-15T18:30:00Z` (IST 00:00:00 next day) -> `2026-10-16`.
4. **SQLite Table Constraint Enforcement**:
   - Attempted duplicate order insert with identical `(date_key, daily_order_number)` -> SQLite threw `SQLITE_CONSTRAINT_UNIQUE: UNIQUE constraint failed: orders.date_key, orders.daily_order_number`.
5. **High Concurrency Sequence Stress-Test**:
   - Executed 50 simultaneous parallel calls to `getNextDailyOrderNumber('2026-10-19')`.
   - Generated 50 strictly unique, monotonic integers spanning `1..50` with zero collisions.
   - Final `daily_counters` row in SQLite updated to `last_number = 50`.
6. **HTTP Route Guard Matrix**:
   - Verified that unauthenticated requests to `POST /api/orders`, `PATCH /api/orders/:id`, `PUT /api/orders/:id`, `DELETE /api/orders/:id`, `POST /api/orders/:id/done`, `POST /api/menu`, `PUT /api/menu/:id`, `DELETE /api/menu/:id`, and `POST /api/auth/change-pin` are all intercepted and rejected with HTTP 401 `{ error: "Unauthorized" }`.

---

## 2. Logic Chain

1. **Authentication Authenticity**:
   - The system does not use hardcoded PIN equality (`if (pin === '1234')`). Instead, `getAdminPin()` executes an actual SQL query on the `settings` table (`SELECT value FROM settings WHERE key = 'reception_pin'`). If found, it compares against that stored value. Changing the PIN persists the new PIN into the SQLite table and updates future verifications immediately.
2. **Cryptographic Token Integrity**:
   - The session tokens are genuine JSON Web Tokens signed using `jwt.sign` with a secret and verified using `jwt.verify`. Forged signatures, payload tampering, and expired tokens are rejected at the cryptographic level.
3. **Database Layer & Schema Completeness**:
   - All 5 required tables and indexes exist in SQLite, with real DDL executed on server boot. Constraints such as `uq_daily_order UNIQUE (date_key, daily_order_number)` are genuinely enforced by SQLite's storage engine.
4. **Concurrency & Sequence Invariant**:
   - The sequence generator uses LibSQL atomic upsert (`INSERT ... ON CONFLICT DO UPDATE ... RETURNING last_number`) coupled with an in-memory execution queue and exponential backoff retry. Stress tests under 25 and 50 concurrent requests generated perfectly consecutive, non-colliding order numbers.
5. **Absence of Facades or Cheats**:
   - Code inspections revealed zero stubbed returns, zero pre-populated test cheats, and zero simulated test assertions. All verified behaviors run against the live Express server and local SQLite database engine.

---

## 3. Caveats

- **Scope Boundary**: Milestone 1 delivers the foundational backend data, sequence, timezone, server, and authentication layers. Specific order lifecycle CRUD routes (Milestone 3), menu catalog seeding and CRUD (Milestone 2), kitchen SSE broadcaster (Milestone 4), and analytics aggregations (Milestone 5) are planned for subsequent milestones as specified in `PROJECT.md`.
- **In-Memory Concurrency vs Multi-Process**: The in-memory promise queue serializes concurrent requests within a single Node.js process. In a distributed multi-instance deployment, SQLite's WAL mode, database-level atomic upsert, and `busy_timeout` backoff handle process-level locking.

---

## 4. Conclusion

**Verdict: CLEAN**

Milestone 1 is completely authentic, robust, and free of integrity violations:
- Zero facade implementations.
- Zero hardcoded test responses.
- Real SQLite queries, transactions, and unique constraints are executed and verified.
- Real cryptographic JWT tokens and database-backed PIN validation are enforced.
- Concurrency and daily timezone rollover logic operate accurately under stress.

The work product is approved without reservations.

---

## 5. Verification Method

To independently reproduce the forensic verification findings:

```bash
# 1. Verify TypeScript types
npm run typecheck

# 2. Run Milestone 1 automated verification test suite
npm run test:m1

# 3. Query the SQLite database directly to confirm persisted rows
node -e "import('@libsql/client').then(async ({ createClient }) => { const db = createClient({ url: 'file:data/kotha.db' }); const s = await db.execute('SELECT * FROM settings;'); console.log('Settings:', s.rows); const c = await db.execute('SELECT * FROM daily_counters;'); console.log('Counters:', c.rows); });"
```
