# Milestone 1 (Iteration 2) Handoff Report: Security Hardening & Gate Resolution

**Author:** Milestone 1 Implementation Worker Iteration 2 (`worker_m1_gen2`)  
**Date:** 2026-10-15  
**Target Directory:** `d:\kotha&coffee`  
**Handoff Type:** Hard (Task Complete)  

---

## 1. Observation

1. **Review Findings from Iteration 1**:
   - `d:\kotha&coffee\.agents\teamwork\reviewer_m1_2\handoff.md` requested changes on 4 security & validation deficiencies:
     1. Storing PIN in plaintext in `settings` table without cryptographic hashing.
     2. `POST /api/auth/change-pin` permitted updating the PIN without verifying `currentPin` if omitted.
     3. `X-Mock-Date` header evaluated unconditionally in production mode.
     4. `newPin` allowed non-numeric alphanumeric values.
     5. SQLite connections needed explicit `PRAGMA busy_timeout = 5000;` and `PRAGMA journal_mode = WAL;`.

2. **Executed Code Changes**:
   - `src/server/middleware/auth.ts`:
     - Added `hashPin(pin: string, salt?: string): string` using `crypto.scryptSync(pin, actualSalt, 32)` returning `${actualSalt}:${derivedKey.toString('hex')}`.
     - Added `verifyPinAgainstHash(pin: string, storedHashOrPlain: string): boolean` using `crypto.timingSafeEqual`, constant-time fallback for legacy plaintext PINs, and null-byte injection rejection (`\0`).
     - Added `ensureDefaultPinHashed(dbClient?: any): Promise<void>` to seed default reception PIN as `salt:hash` if missing and automatically upgrade plaintext values.
     - Updated `updateAdminPin(newPin: string)` to validate `/^\d{4,6}$/` and store `salt:hash`.
     - Added security warning in production if `JWT_SECRET` is unset.
   - `src/server/routes/auth.ts`:
     - In `POST /api/auth/change-pin`: Enforced validation of `newPin` as `/^\d{4,6}$/` (returning HTTP 400 `{ error: "PIN must be 4 to 6 digits" }`).
     - Enforced mandatory `currentPin` verification against the stored cryptographic hash via `verifyPin(currentPin)` (returning HTTP 401 `{ error: "Invalid current PIN" }` if missing or incorrect).
   - `src/server/middleware/timezone.ts`:
     - In `getCafeNow(req?: Request)` and `getCafeDateKey(req?: Request)`: Restricted parsing of `X-Mock-Date` and simulated clocks to `process.env.NODE_ENV !== 'production'`. When `NODE_ENV === 'production'`, real system clock formatted in `Asia/Kolkata` is strictly used.
   - `src/server/db/client.ts` & `src/server/db/schema.ts`:
     - Added `configureLocalPragmas(client: Client)` executing `PRAGMA journal_mode = WAL;` and `PRAGMA busy_timeout = 5000;`.
     - Invoked automatically on local SQLite client connection creation and during `initSchema()`.
     - `initSchema()` also calls `ensureDefaultPinHashed()`.
   - `tests/m1_verification.test.ts`:
     - Asserted that initial and updated PINs in `settings` table are stored in `salt:hash` format (16-byte salt, 32-byte scrypt hash) and never in plaintext.
     - Asserted that `POST /api/auth/change-pin` returns 401 `{ error: "Invalid current PIN" }` when `currentPin` is missing or wrong.
     - Asserted that `POST /api/auth/change-pin` returns 400 `{ error: "PIN must be 4 to 6 digits" }` when `newPin` is non-numeric, short (<4), or long (>6).
     - Asserted that `X-Mock-Date` header is strictly ignored when `NODE_ENV === 'production'`.
     - Asserted that `PRAGMA journal_mode` is `wal` (or `memory`) and `PRAGMA busy_timeout` is `5000`.

3. **Command Execution Results**:
   - `npm run typecheck` (`node node_modules/typescript/bin/tsc --noEmit`):
     ```
     > kotha-coffee@1.0.0 typecheck
     > node node_modules/typescript/bin/tsc --noEmit
     ```
     *Result*: Exit code 0, 0 diagnostic errors.

   - `npm run test:m1` (`node node_modules/tsx/dist/cli.mjs tests/m1_verification.test.ts`):
     ```
     === Starting Milestone 1 Verification Suite ===

     1. Starting Express server...
     [Kotha & Coffee] Server running on http://localhost:3100
        Server running successfully.

     2. Verifying GET /api/health returns 200 with Asia/Kolkata dateKey...
        Health check verified. dateKey=2026-10-15, time=2026-10-15T03:09:19.558Z

     3. Verifying POST /api/auth/verify-pin rejects wrong PIN with 401...
        Wrong PIN properly rejected with 401.

     4. Verifying POST /api/auth/verify-pin with correct PIN "1234" issues valid 12h token...
        Session token issued successfully.

     5. Verifying unauthenticated mutations are blocked with 401...
        All unauthenticated mutations blocked with 401 { error: "Unauthorized" }.

     6. Verifying authenticated request passes reception auth guard...
        Initial PIN verified as cryptographic salt:hash in settings table.
        PIN change, validation, and cryptographic persistence in settings verified.

     7. Verifying atomic daily sequence starts at #1 for fresh date key and increments...
        Atomic sequential counter and day boundary reset verified.

     8. Stress-testing concurrency on atomic sequence generator (25 parallel requests)...
        Concurrency test PASSED: Generated 25 unique sequence numbers (1 to 25) without collisions.

     9. Verifying clock simulation test endpoints (/api/test/set-time, reset-time, X-Mock-Date)...
        X-Mock-Date restriction in production verified (header strictly ignored).
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

     11. Verifying database connection settings (PRAGMA WAL and busy_timeout)...
         Active journal_mode: wal
         Active busy_timeout: 5000
         Database PRAGMA settings verified.

     =====================================================
     ✅ ALL MILESTONE 1 VERIFICATION TESTS PASSED CLEANLY!
     =====================================================

     Stopping server and closing connections...
     Cleanup completed.
     ```
     *Result*: Exit code 0, 11/11 verification steps passed.

   - `node node_modules/tsx/dist/cli.mjs tests/challenger_m1_auth_edge.test.ts`:
     ```
     Total Tests Run: 66
     Passed:         66
     Failed:         0
     ```
     *Result*: Exit code 0, 66/66 adversarial tests passed (including null-byte injection rejection, currentPin audit, and numeric PIN enforcement).

   - `node node_modules/tsx/dist/cli.mjs tests/stress_boundaries.test.ts`:
     ```
     ✅ ALL BOUNDARIES & ROLLOVER STRESS TESTS PASSED CLEANLY!
     ```
     *Result*: Exit code 0, 7/7 edge boundary scenarios passed.

   - `node node_modules/tsx/dist/cli.mjs tests/stress_concurrency.test.ts`:
     ```
     ✅ ALL CONCURRENCY STRESS TESTS PASSED CLEANLY!
     ```
     *Result*: Exit code 0 (150-request burst, 4-process parallel contending requests, and client contention all passed).

---

## 2. Logic Chain

1. **PIN Cryptographic Hashing (Observation 1.1 -> Observation 1.2 -> Step 1)**:
   - Persisting plaintext credentials in SQLite/LibSQL exposes staff credentials if a database backup or token is compromised.
   - We implemented salted scrypt derivation using Node.js built-in `crypto.scryptSync(pin, salt, 32)` and store strings in the format `salt:hashHex`.
   - Comparison uses `crypto.timingSafeEqual` over buffers, removing string-length and prefix timing leakages.
   - Backward compatibility for legacy plaintext PINs is maintained via constant-time comparison.
   - `ensureDefaultPinHashed` seeds the initial default PIN (`1234` or `ADMIN_PIN`) into `settings` during `initSchema()`, guaranteeing that `SELECT value FROM settings WHERE key='reception_pin'` never returns plaintext.

2. **Strict PIN Change Authorization (Observation 1.1 -> Observation 1.2 -> Step 2)**:
   - In Iteration 1, having an active 12h JWT session allowed changing the owner PIN without re-proving knowledge of the existing PIN.
   - Per `PROJECT.md § Interface Contracts`, the contract requires `{ currentPin: string, newPin: string }`.
   - We updated `src/server/routes/auth.ts` to require `newPin` to match `/^\d{4,6}$/` (returning 400 on non-numeric or invalid length) and require `currentPin` to match the stored hash (returning 401 `{ error: "Invalid current PIN" }` if missing or incorrect).

3. **Production Date Spoofing Prevention (Observation 1.1 -> Observation 1.2 -> Step 3)**:
   - `src/server/middleware/timezone.ts` formerly checked `X-Mock-Date` without environment guards.
   - In production, accepting external date overrides would allow rogue clients to backdate or postdate orders, disrupting daily counter sequencing and financial analytics.
   - We added `if (!isProduction && req) ...` guards to ensure `X-Mock-Date` and simulated clocks are ignored in production, forcing the system to use the real system clock in `Asia/Kolkata`.

4. **Connection Pragmas (Observation 1.1 -> Observation 1.2 -> Step 4)**:
   - Setting `PRAGMA journal_mode = WAL;` and `PRAGMA busy_timeout = 5000;` on local SQLite connections prevents `SQLITE_BUSY` contention during parallel access.
   - Configured via `configureLocalPragmas()` in `src/server/db/client.ts` upon client initialization and in `initSchema()`.

---

## 3. Caveats

- **Cloud LibSQL Pragmas**: Turso cloud databases handle concurrency and write-ahead logging at the service engine level; SQLite local pragmas (`PRAGMA journal_mode`) are selectively ignored or unsupported by cloud LibSQL endpoints, which is handled gracefully by error catching.
- **Scope Boundary**: Milestones 2 through 6 (Menu management UI, Reception POS, SSE live kitchen broadcasting, and Analytics) remain planned for subsequent milestones.

---

## 4. Conclusion

All 5 review findings and dispatch requirements from Iteration 1 have been completely resolved and genuinely implemented:
1. Reception PIN is cryptographically salted and hashed using `scryptSync`, verified using `timingSafeEqual`.
2. `POST /api/auth/change-pin` strictly enforces mandatory `currentPin` (HTTP 401 on missing or incorrect) and validates `newPin` as 4-6 numeric digits (HTTP 400).
3. `X-Mock-Date` is restricted to non-production environments and ignored when `NODE_ENV === 'production'`.
4. `PRAGMA busy_timeout = 5000;` and `PRAGMA journal_mode = WAL;` are configured on local SQLite connections.
5. All test suites (`typecheck`, `test:m1`, `challenger_m1_auth_edge`, `stress_boundaries`, `stress_concurrency`) pass 100% cleanly.

The codebase is ready for Milestone 1 Gate Approval.

---

## 5. Verification Method

To independently reproduce and verify the fixes:

1. **Run TypeScript Compilation**:
   ```bash
   npm run typecheck
   ```
   *Expected*: Exit code 0, 0 diagnostic errors.

2. **Run Milestone 1 Verification Suite**:
   ```bash
   npm run test:m1
   ```
   *Expected*: All 11 verification steps pass cleanly with exit code 0.

3. **Run Adversarial Security Suite**:
   ```bash
   node node_modules/tsx/dist/cli.mjs tests/challenger_m1_auth_edge.test.ts
   ```
   *Expected*: 66/66 tests pass with 0 failures.

4. **Run Stress & Boundary Suites**:
   ```bash
   node node_modules/tsx/dist/cli.mjs tests/stress_boundaries.test.ts
   node node_modules/tsx/dist/cli.mjs tests/stress_concurrency.test.ts
   ```
   *Expected*: All rollover and multi-process concurrency tests pass with 0 collisions.

5. **Direct Database Verification**:
   ```bash
   # In Node:
   node -e "import('./dist/server/db/client.js').then(async m => { const db = m.getDbClient(); const r = await db.execute('SELECT value FROM settings WHERE key=\\'reception_pin\\''); console.log('PIN in DB:', r.rows[0].value); })"
   ```
   *Expected*: Outputs `PIN in DB: <32-hex-salt>:<64-hex-scrypt-hash>`, confirming zero plaintext persistence.
