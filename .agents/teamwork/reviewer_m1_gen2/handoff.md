# Milestone 1 (Iteration 2) Gate Review & Adversarial Challenge Report

**Author:** Gate Reviewer 2 (`reviewer_m1_gen2`)  
**Roles:** Reviewer, Critic  
**Date:** 2026-10-15  
**Target:** Milestone 1 (Foundation, Data Layer, Server & PIN Auth)  
**Gate Verdict:** **APPROVE**  

---

## 1. Observation

1. **Independent Verification Commands Executed**:
   - `npm run typecheck` (`node node_modules/typescript/bin/tsc --noEmit`):
     - **Result**: Exit code 0, 0 diagnostic errors.
   - `npm run test:m1` (`node node_modules/tsx/dist/cli.mjs tests/m1_verification.test.ts`):
     - **Result**: Exit code 0. All 11/11 verification steps passed cleanly.
   - `node node_modules/tsx/dist/cli.mjs tests/challenger_m1_auth_edge.test.ts`:
     - **Result**: Exit code 0. Total 66/66 adversarial security and input validation tests passed with 0 failures.
   - `node node_modules/tsx/dist/cli.mjs tests/stress_boundaries.test.ts`:
     - **Result**: Exit code 0. All 7/7 millisecond boundary, midnight rollover, and leap-year transition scenarios passed.
   - `node node_modules/tsx/dist/cli.mjs tests/stress_concurrency.test.ts`:
     - **Result**: Exit code 0. 150-request in-process burst, 4-process parallel multi-core contention (100 requests), and 5-client contention generated contiguous unique sequences with 0 collisions.

2. **Database State & PIN Cryptographic Persistence**:
   - Evaluated active SQLite `settings` table in `data/kotha.db`:
     - Query: `SELECT * FROM settings WHERE key = 'reception_pin';`
     - Record:
       ```json
       [
         {
           "key": "reception_pin",
           "value": "4f0967d907e70e9a1f6831b5d64694a7:b5ec3efa599cbdf03ec68288bab951ec6d94f8d771e8cbb8e35b6827a703a372",
           "updated_at": "2026-10-15T03:13:05.829Z"
         }
       ]
       ```
     - Verbatim inspection confirms zero plaintext PIN (`1234` or `5678`) in SQLite storage.
     - Stored format is `<32 hex chars (16 bytes salt)>:<64 hex chars (32 bytes scrypt hash)>`.
     - Verified that successive calls to `hashPin('1234')` generate cryptographically distinct salts while both verify via `crypto.timingSafeEqual`.

3. **Source Code Inspection — PIN Hashing & Timing-Safe Verification**:
   - In `src/server/middleware/auth.ts`:
     - Lines 25–29: `hashPin` generates a 16-byte random salt and derives key via `crypto.scryptSync(pin, actualSalt, 32)`.
     - Lines 35–67: `verifyPinAgainstHash` extracts salt and hash, derives key with `crypto.scryptSync`, and compares using `crypto.timingSafeEqual(derivedKey, expectedBuffer)`.
     - Lines 40–43: Explicitly rejects null-byte injection attempts (`if (pin.includes('\0')) return false;`).
     - Lines 98–131: `ensureDefaultPinHashed` seeds default PIN as `salt:hash` and automatically upgrades any legacy plaintext values upon initialization.
     - Lines 147–163: `updateAdminPin` enforces `/^\d{4,6}$/` and stores hashed representation.

4. **Source Code Inspection — Mandatory `currentPin` & Digit Validation**:
   - In `src/server/routes/auth.ts`:
     - Lines 43–46:
       ```ts
       if (!newPin || typeof newPin !== 'string' || !/^\d{4,6}$/.test(newPin.trim())) {
         return res.status(400).json({ error: "PIN must be 4 to 6 digits" });
       }
       ```
     - Lines 48–56:
       ```ts
       if (!currentPin || typeof currentPin !== 'string') {
         return res.status(401).json({ error: "Invalid current PIN" });
       }
       const isCurrentValid = await verifyPin(currentPin);
       if (!isCurrentValid) {
         return res.status(401).json({ error: "Invalid current PIN" });
       }
       ```
     - Verbatim inspection confirms: omitting `currentPin` returns HTTP 401 `{ error: "Invalid current PIN" }`. Providing wrong `currentPin` returns HTTP 401. Providing non-numeric or invalid length `newPin` returns HTTP 400 `{ error: "PIN must be 4 to 6 digits" }`.

5. **Source Code Inspection — Production Guard on `X-Mock-Date`**:
   - In `src/server/middleware/timezone.ts`:
     - Line 72: `const isProduction = process.env.NODE_ENV === 'production';`
     - Lines 74–85: `if (!isProduction && req) { ... }` guards `X-Mock-Date` header evaluation.
     - Lines 87–89: `if (!isProduction && mockDate) { ... }` guards simulated in-memory clock.
     - Lines 99–119: Same guard enforced in `getCafeDateKey(req?: Request)`.
     - Empirical verification in `tests/m1_verification.test.ts` (lines 313–334) and `tests/challenger_m1_auth_edge.test.ts` (lines 588–608) confirms `X-Mock-Date: 2028-05-20` is strictly ignored when `NODE_ENV === 'production'`.

6. **Source Code Inspection — SQLite Connection Pragmas**:
   - In `src/server/db/client.ts` lines 65–72 & `src/server/db/schema.ts` lines 71–73:
     - `configureLocalPragmas` executes `PRAGMA journal_mode = WAL;` and `PRAGMA busy_timeout = 5000;`.
     - Live database query confirms:
       - `PRAGMA journal_mode;` -> `{ journal_mode: 'wal' }`
       - `PRAGMA busy_timeout;` -> `{ timeout: 5000 }`

7. **Forensic Integrity Inspection**:
   - No mock facades or hardcoded test returns exist in application routes.
   - Database operations use real parameterized SQL execution against SQLite / LibSQL.
   - Counter sequence generation uses atomic SQL upsert with database UNIQUE constraints (`uq_daily_order`).
   - All tests run against genuine live Express server listening on local TCP ports.

---

## 2. Logic Chain

1. **Resolution of PIN Storage Vulnerability (Observation 1.2, 1.3 -> Finding 1 Resolved)**:
   - In Iteration 1, `reviewer_m1_2` flagged that `settings` held plaintext `'1234'`.
   - Inspection of `auth.ts` and direct database query on `settings` proves the PIN is now persisted as a 16-byte random salt and 32-byte Scrypt hash (`salt:hashHex`).
   - Verification uses `crypto.timingSafeEqual`, preventing timing side-channel analysis.
   - Therefore, PIN storage security is resolved.

2. **Resolution of Unauthenticated PIN Takeover (Observation 1.4 -> Finding 2 Resolved)**:
   - In Iteration 1, `POST /api/auth/change-pin` allowed omitting `currentPin`.
   - In Iteration 2, `src/server/routes/auth.ts:49` strictly checks `!currentPin || typeof currentPin !== 'string'`, returning HTTP 401 `{ error: "Invalid current PIN" }` before attempting any mutation.
   - Tested across both `tests/m1_verification.test.ts` and `tests/challenger_m1_auth_edge.test.ts`: requests without `currentPin` are rejected with 401.
   - Therefore, the API contract and authorization guard are fully satisfied.

3. **Resolution of Non-Numeric PIN Validation (Observation 1.4 -> Finding 5 Resolved)**:
   - `src/server/routes/auth.ts:44` checks `!/^\d{4,6}$/.test(newPin.trim())` and returns HTTP 400 `{ error: "PIN must be 4 to 6 digits" }`.
   - Rejects non-numeric characters, short strings (<4 digits), and long strings (>6 digits).
   - Therefore, staff cannot set incompatible credentials that would brick mobile numeric PIN keypads.

4. **Resolution of Production Date Spoofing (Observation 1.5 -> Finding 3 Resolved)**:
   - `src/server/middleware/timezone.ts` lines 72 and 99 check `process.env.NODE_ENV === 'production'`.
   - When running in production, external callers passing `X-Mock-Date` cannot override the cafe date or timestamp. The real system clock formatted in `Asia/Kolkata` is used.
   - Therefore, date spoofing in production is closed.

5. **Resolution of Database Concurrency Pragmas (Observation 1.6)**:
   - `configureLocalPragmas` sets WAL mode and 5000ms busy timeout on connection creation and schema initialization.
   - Verified active on `data/kotha.db` via direct PRAGMA queries.
   - High-throughput tests (150 in-process, 100 multi-process across 4 PIDs) ran with zero `SQLITE_BUSY` errors.

---

## 3. Caveats

- **Turso Cloud Production Pragmas**: In Turso serverless deployments over HTTP/WebSocket, local SQLite PRAGMAs (`journal_mode = WAL`) are managed automatically by the remote Turso infrastructure and are gracefully bypassed in local client initialization.
- **Scope Boundary**: Milestone 1 is strictly scoped to the foundation, data layer, server lifecycle, and PIN authentication. Endpoints for full order lifecycle (M3), menu catalog UI (M2), SSE broadcasting (M4), and analytics dashboard (M5) remain planned for their respective milestones.

---

## 4. Conclusion

All 5 items requested in Iteration 1 have been completely, authentically, and securely resolved:
1. Salted Scrypt PIN hashing with timing-safe comparison; zero plaintext PIN in database.
2. Mandatory `currentPin` validation in `POST /api/auth/change-pin` returning HTTP 401 on missing/invalid.
3. Strict 4-6 numeric digit validation on `newPin` returning HTTP 400 on invalid input.
4. Non-production restriction on `X-Mock-Date` in `timezone.ts`.
5. SQLite `busy_timeout = 5000` and `journal_mode = WAL` connection pragmas active.

All test suites (`typecheck`, `test:m1`, `challenger_m1_auth_edge`, `stress_boundaries`, `stress_concurrency`) pass 100%. No integrity violations or shortcuts were found.

**Final Gate Verdict: APPROVE.**

---

## 5. Verification Method

To independently reproduce this verification:

1. **Type Check**:
   ```powershell
   npm run typecheck
   ```
   *Expected*: Code 0, 0 diagnostic errors.

2. **Milestone 1 Verification Suite**:
   ```powershell
   npm run test:m1
   ```
   *Expected*: All 11 verification blocks pass cleanly with exit code 0.

3. **Challenger Adversarial Security Suite**:
   ```powershell
   node node_modules/tsx/dist/cli.mjs tests/challenger_m1_auth_edge.test.ts
   ```
   *Expected*: Total Tests Run: 66, Passed: 66, Failed: 0.

4. **Direct Database Hashing Inspection**:
   ```powershell
   node node_modules/tsx/dist/cli.mjs -e "import('./src/server/db/client.ts').then(async m => { const db = m.getDbClient(); const r = await db.execute('SELECT value FROM settings WHERE key=\'reception_pin\''); console.log('Stored PIN:', r.rows[0].value); })"
   ```
   *Expected*: Outputs `<32-hex-salt>:<64-hex-hash>`, confirming zero plaintext persistence.

5. **Direct Database PRAGMA Inspection**:
   ```powershell
   node node_modules/tsx/dist/cli.mjs -e "import('./src/server/db/client.ts').then(async m => { const db = m.getDbClient(); await m.configureLocalPragmas(db); const j = await db.execute('PRAGMA journal_mode;'); const b = await db.execute('PRAGMA busy_timeout;'); console.log(j.rows[0], b.rows[0]); })"
   ```
   *Expected*: `{ journal_mode: 'wal' } { timeout: 5000 }`.

---

# Quality Review Report

## Review Summary
**Verdict**: **APPROVE**

## Findings
None. All 5 findings from Iteration 1 have been completely resolved with clean, idiomatic TypeScript and appropriate defense-in-depth safeguards.

## Verified Claims
- `Salted Scrypt PIN hashing` → verified via database query and code inspection → **PASS**
- `Timing-safe equality comparison` → verified via `crypto.timingSafeEqual` in `auth.ts:57` → **PASS**
- `Mandatory currentPin check in change-pin` → verified via unit assertions (omitted -> 401, wrong -> 401) → **PASS**
- `4-6 digit numeric validation on newPin` → verified via unit assertions (non-numeric, <4, >6 -> 400) → **PASS**
- `X-Mock-Date disabled in production` → verified via `NODE_ENV=production` tests → **PASS**
- `PRAGMA WAL and busy_timeout=5000` → verified via live DB query → **PASS**
- `npm run typecheck` → verified with 0 errors → **PASS**
- `npm run test:m1` → verified 11/11 tests pass → **PASS**
- `tests/challenger_m1_auth_edge.test.ts` → verified 66/66 tests pass → **PASS**
- `tests/stress_boundaries.test.ts` → verified 7/7 tests pass → **PASS**
- `tests/stress_concurrency.test.ts` → verified 4/4 stress scenarios pass → **PASS**

## Coverage Gaps
- None for Milestone 1.

## Unverified Items
- None.

---

# Adversarial Challenge Report

## Challenge Summary
**Overall risk assessment**: **LOW** (All critical and high severity vulnerabilities identified in Iteration 1 have been remediated).

## Challenges

### [Resolved] Challenge 1: Unauthenticated PIN Takeover
- **Status**: **RESOLVED & MITIGATED**
- **Test**: `POST /api/auth/change-pin` with `{ newPin: "7777" }` omitting `currentPin`.
- **Result**: Rejected with HTTP 401 `{ error: "Invalid current PIN" }`. Owner credentials cannot be hijacked without verifying existing PIN.

### [Resolved] Challenge 2: Date Spoofing via Header in Production
- **Status**: **RESOLVED & MITIGATED**
- **Test**: `GET /api/health` with `X-Mock-Date: 2028-05-20` and `NODE_ENV=production`.
- **Result**: Header is ignored; real system time in `Asia/Kolkata` is returned.

### [Resolved] Challenge 3: Plaintext Credential Exposure
- **Status**: **RESOLVED & MITIGATED**
- **Test**: Inspect `settings` table in SQLite storage.
- **Result**: Stored as `16-byte random hex salt : 32-byte Scrypt derived key`. Zero plaintext exposure.

### [Resolved] Challenge 4: Alphanumeric PIN Lockout
- **Status**: **RESOLVED & MITIGATED**
- **Test**: `POST /api/auth/change-pin` with `newPin: "abcd"`.
- **Result**: Rejected with HTTP 400 `{ error: "PIN must be 4 to 6 digits" }`.

## Stress Test Results
- `150 in-process concurrent requests` → Expected 150 unique contiguous numbers → Actual: 1..150 in 81ms (0 collisions) → **PASS**
- `4 OS processes parallel contention (100 requests)` → Expected 100 unique numbers → Actual: 1..100 in 1050ms (0 collisions) → **PASS**
- `5 independent DB client contention` → Expected 75 unique numbers → Actual: 75 unique numbers (0 collisions) → **PASS**
- `Rollover at exact IST midnight (18:30:00 UTC)` → Expected dateKey increment and sequence reset → Actual: Clean reset to #1 → **PASS**
- `Null-byte PIN injection ("1234\0")` → Expected rejection → Actual: Rejected with 401 → **PASS**

## Unchallenged Areas
- SSE live broadcast (<5s latency) and Web Audio chime alert: Scheduled for Milestone 4.
