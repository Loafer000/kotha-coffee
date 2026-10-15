# Milestone 1 Review & Adversarial Challenge Report

**Author:** Reviewer 2 (`reviewer_m1_2`)  
**Roles:** Reviewer, Critic  
**Date:** 2026-10-15  
**Target:** Milestone 1 (Foundation, Data Layer, Server & PIN Auth)  
**Verdict:** **REQUEST_CHANGES**  

---

## 1. Observation

1. **Independent Verification Execution**:
   - Executed `npm run typecheck` (`node node_modules/typescript/bin/tsc --noEmit`).
     - **Result**: Exit code 0, 0 diagnostic errors.
   - Executed `npm run test:m1` (`node node_modules/tsx/dist/cli.mjs tests/m1_verification.test.ts`).
     - **Result**: Exit code 0. 10/10 test blocks passed cleanly against test port 3100.
   - Verified timezone boundary behavior: evaluated `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' })` at 18:29:59 UTC (`2026-10-14`), 18:30:00 UTC (`2026-10-15`), and 18:30:01 UTC (`2026-10-15`). Date rollover at exact IST midnight (18:30:00 UTC) functions as expected.

2. **Source Code Inspection — Security & PIN Handling**:
   - In `src/server/middleware/auth.ts` lines 22–72:
     - Line 25: `SELECT value FROM settings WHERE key = 'reception_pin';`
     - Line 51: `const expectedPin = await getAdminPin();`
     - Line 52: `return pin.trim() === expectedPin;`
     - Line 67: `INSERT INTO settings (key, value, updated_at) VALUES ('reception_pin', ?, ?)` with `args: [newPin.trim(), now]`
     - **Observation**: The reception PIN is stored directly as plaintext in the SQLite/LibSQL database, and verification is performed via raw plaintext string equality (`===`). No cryptographic hashing (`crypto.scrypt`, `crypto.pbkdf2`, or `bcrypt`) is utilized.

3. **Source Code Inspection — PIN Modification Verification**:
   - In `src/server/routes/auth.ts` lines 47–53:
     ```ts
     if (currentPin) {
       const isCurrentValid = await verifyPin(currentPin);
       if (!isCurrentValid) {
         return res.status(401).json({ error: "Current PIN is incorrect" });
       }
     }
     ```
     - **Observation**: `currentPin` is conditional (`if (currentPin)`). If a caller submits `{ newPin: "5678" }` with an existing session token, `currentPin` is neither required nor validated, and the PIN update succeeds.
     - In `tests/m1_verification.test.ts` lines 135–139: The verification test omitted `currentPin` from the request body (`body: { newPin: '5678' }`), masking the contract violation against `PROJECT.md § 2 (Table: POST /api/auth/change-pin { currentPin: string, newPin: string })`.

4. **Source Code Inspection — Timezone Mocking in Production**:
   - In `src/server/middleware/timezone.ts` lines 72–83 & 98–107:
     ```ts
     export function getCafeNow(req?: Request): Date {
       if (req) {
         const headerMock = req.header('X-Mock-Date') || req.header('x-mock-date');
         if (headerMock) {
           if (/^\d{4}-\d{2}-\d{2}$/.test(headerMock)) {
             const d = new Date(`${headerMock}T12:00:00+05:30`);
             if (!isNaN(d.getTime())) return d;
     ...
     ```
     - **Observation**: The `X-Mock-Date` HTTP header is evaluated globally across all incoming requests without checking `process.env.NODE_ENV !== 'production'`. In contrast, `/api/test/*` endpoints in `src/server/routes/test.ts` line 9 strictly check `process.env.NODE_ENV === 'production'`.

5. **Source Code Inspection — Session Token & Secret**:
   - In `src/server/middleware/auth.ts` line 6:
     `const JWT_SECRET = process.env.JWT_SECRET || 'kotha-coffee-reception-session-secret-2026';`
     - **Observation**: When `process.env.JWT_SECRET` is unset, a static fallback string committed to version control is used.
   - In `src/server/middleware/auth.ts` lines 137–144:
     `const pinHeader = req.headers['x-admin-pin'];`
     - **Observation**: An undocumented bypass header `x-admin-pin` permits authenticating mutating requests directly by sending the PIN in every header without session tokens, and is active in production.

6. **Source Code Inspection — Daily Counter & Mutating Route Guards**:
   - In `src/server/db/sequence.ts`: Queue serialization (`sequenceQueue`) and atomic `INSERT ... ON CONFLICT(date_key) DO UPDATE SET last_number = daily_counters.last_number + 1 RETURNING last_number;` are implemented. Concurrency stress test generated 25 sequential unique numbers without gaps or collisions.
   - In `src/server/index.ts` lines 42–54: `requireReceptionAuth` middleware guards all non-`GET` HTTP methods on `/api/orders` and `/api/menu`.

---

## 2. Logic Chain

1. **Security Vulnerability: Plaintext PIN Persistence (Observation 1.2 -> Finding 1)**:
   - The user dispatch instructed: *"Objectively review security architecture: PIN hashing, JWT session signing, 12h validity..."*.
   - In the implementation, the PIN is saved as raw text in the `settings` table (`key='reception_pin', value='...'`).
   - Because the project is architected for cloud deployment via Turso LibSQL over the internet (PROJECT.md R6), database credentials or file dumps leak the plaintext PIN directly.
   - Comparing PINs with `pin.trim() === expectedPin` lacks timing-safe comparison.
   - Therefore, PIN hashing is missing from the security architecture.

2. **Security Vulnerability: PIN Change Without Current PIN Verification (Observation 1.3 -> Finding 2)**:
   - `PROJECT.md` specifies the API contract for `POST /api/auth/change-pin` as `{ currentPin: string, newPin: string }`.
   - The implementation only checks `currentPin` if supplied (`if (currentPin)`).
   - This allows any client possessing an active 12h session token (e.g. an unattended mobile device during cafe rush) to change the PIN without proving knowledge of the current PIN, effectively locking the owner out.
   - The test suite omitted `currentPin`, creating an unverified assumption.

3. **Adversarial Vector: Production Date Spoofing via Header (Observation 1.4 -> Finding 3)**:
   - While `routes/test.ts` restricts `/api/test/*` endpoints to non-production environments (`NODE_ENV !== 'production'`), `middleware/timezone.ts` processes `X-Mock-Date` unconditionally.
   - An attacker or misconfigured client in production can supply `X-Mock-Date: 1990-01-01` on any order creation request, which would cause orders to be assigned sequence numbers and timestamps for arbitrary dates, corrupting financial reports and daily sequence counters.

4. **Integrity Assessment**:
   - The codebase does NOT contain dummy facades or fabricated outputs: database tables, sequence counters, Express server, and timezone conversions are genuine functional implementations.
   - However, the absence of PIN hashing and the relaxation of PIN change validation constitute major security and contract deficiencies that must be rectified before proceeding to dependent milestones.

---

## 3. Caveats

- **Scope Boundary**: Milestones 2 through 5 (Menu catalog, POS orders, SSE live stream, and Analytics dashboards) are not yet implemented. Review was strictly scoped to Milestone 1 foundational components (DB schema, server, auth, sequence generation, timezone).
- **Local vs Remote Turso Latency**: Tests were executed against local SQLite (`data/kotha.db` and `:memory:`). High-latency network interactions with Turso cloud clusters under concurrency were not tested live as cloud accounts are not created in local testing.

---

## 4. Conclusion

The foundational architecture is well-structured: the LibSQL client, table DDL, atomic sequence generator, Express server lifecycle, 12h JWT session signing, and Asia/Kolkata date rollover work cleanly.

However, because:
1. The PIN is stored and verified in plaintext without cryptographic hashing,
2. `POST /api/auth/change-pin` allows changing the PIN without verifying `currentPin`,
3. `X-Mock-Date` header allows date spoofing in production,

The verdict is **REQUEST_CHANGES**. These security gaps must be corrected before Milestone 2 begins.

---

## 5. Verification Method

To verify the required fixes:
1. Run `npm run typecheck` to confirm zero TypeScript compilation errors.
2. Run `npm run test:m1` with updated assertions that:
   - Prove PIN is stored hashed in `settings` table (not plaintext).
   - Prove `POST /api/auth/change-pin` returns 400/401 when `currentPin` is missing or wrong.
   - Prove `X-Mock-Date` is ignored when `NODE_ENV === 'production'`.
3. Invalidation condition: If `SELECT value FROM settings WHERE key='reception_pin'` returns a raw 4-digit number, or if changing the PIN without `currentPin` returns 200, the security criteria remain unfulfilled.

---

# Quality Review Report

## Review Summary

**Verdict**: **REQUEST_CHANGES**

---

## Findings

### [Major] Finding 1: Plaintext PIN Storage and Missing Cryptographic Hashing
- **What**: The reception PIN is stored directly in plaintext in the database (`settings` table) and verified using standard string equality.
- **Where**: `src/server/middleware/auth.ts`, lines 22–72.
- **Why**: Violates the security architecture specification (PIN hashing). In a cloud deployment with Turso or local SQLite dumps, credentials are exposed in plaintext. String comparison `===` is also non-constant-time.
- **Suggestion**: Use Node's built-in `crypto.scryptSync` (or `crypto.pbkdf2Sync`) with a salt to store the PIN hash (e.g., `salt:hash`), and use `crypto.timingSafeEqual` for verification. Support default `'1234'` or `ADMIN_PIN` by hashing upon comparison or during initialization.

### [Major] Finding 2: `POST /api/auth/change-pin` Skips `currentPin` Verification When Omitted
- **What**: In `src/server/routes/auth.ts`, `currentPin` is only checked if present (`if (currentPin)`). If omitted, the PIN change succeeds immediately.
- **Where**: `src/server/routes/auth.ts`, lines 47–53.
- **Why**: Violates `PROJECT.md` API contract (`{ currentPin: string, newPin: string }`). Allows any device with an active shift session to overwrite the PIN without knowing the current PIN.
- **Suggestion**: Make `currentPin` mandatory in `change-pin`. Return HTTP 400 if `currentPin` is missing, and HTTP 401 if `currentPin` is incorrect. Update `tests/m1_verification.test.ts` to test both valid and invalid `currentPin`.

### [Major] Finding 3: `X-Mock-Date` Header Honored in Production
- **What**: `getCafeNow` and `getCafeDateKey` accept `X-Mock-Date` unconditionally without checking `NODE_ENV`.
- **Where**: `src/server/middleware/timezone.ts`, lines 72–83, 98–107.
- **Why**: Allows any external client to spoof order dates and timestamps in production, corrupting order numbering and analytics.
- **Suggestion**: Only check `X-Mock-Date` if `process.env.NODE_ENV !== 'production'`.

### [Minor] Finding 4: Insecure Default Fallback for `JWT_SECRET`
- **What**: When `JWT_SECRET` is unset, a hardcoded string `'kotha-coffee-reception-session-secret-2026'` is used.
- **Where**: `src/server/middleware/auth.ts`, line 6.
- **Why**: If deployed to cloud without setting `JWT_SECRET`, an attacker can forge tokens.
- **Suggestion**: In production mode (`NODE_ENV === 'production'`), throw an error or warn at startup if `JWT_SECRET` is not set.

### [Minor] Finding 5: Non-Numeric PIN Input Permitted
- **What**: `updateAdminPin` checks `newPin.trim().length < 4`, but does not enforce numeric digits.
- **Where**: `src/server/routes/auth.ts`, line 43.
- **Why**: Staff could accidentally set an alphanumeric PIN, which would be impossible to input on the mobile numeric PIN keypad modal (R8, F2).
- **Suggestion**: Validate with `/^\d{4,8}$/` and return HTTP 400 if non-digits are provided.

---

## Verified Claims

- `npm run typecheck` passes with 0 errors → verified via command execution → **PASS**
- `npm run test:m1` passes 10/10 test blocks → verified via command execution → **PASS**
- Concurrency on atomic sequence generation (25 simultaneous requests) → verified 25 strictly unique numbers (1..25) → **PASS**
- 12h JWT token expiration (`TOKEN_EXPIRY_SECONDS = 43200`) → verified via code inspection and test assertion → **PASS**
- `requireReceptionAuth` blocks unauthenticated mutations on `/api/orders` and `/api/menu` with HTTP 401 → verified via test assertions → **PASS**
- `Asia/Kolkata` date rollover at 18:30:00 UTC (00:00:00 IST) → verified via standalone Node evaluation → **PASS**
- Database schema creates all 5 tables and required indexes → verified via SQLite catalog query in test → **PASS**

---

## Coverage Gaps

- Turso remote cloud connection latency and reconnection handling — risk level: **LOW** (dual-mode LibSQL client handles standard HTTP/WS protocol). Recommendation: accept risk for M1, re-evaluate in M6 deployment testing.

---

## Unverified Items

- None. All source files and test executions were directly inspected and executed.

---

# Adversarial Challenge Report

## Challenge Summary

**Overall risk assessment**: **HIGH** (Plaintext PIN storage and unverified PIN change endpoint represent high authorization vulnerabilities).

---

## Challenges

### [High] Challenge 1: Unauthenticated PIN Takeover via Session Hijacking
- **Assumption challenged**: The solution assumes only authorized owners change the PIN and that possession of a JWT token is sufficient.
- **Attack scenario**: A staff member's phone remains unlocked for 12 hours during shift. A disgruntled employee or customer taps into the phone and sends `POST /api/auth/change-pin` with `{ newPin: "9999" }`. Because `currentPin` is not required by `routes/auth.ts:47`, the server updates the PIN.
- **Blast radius**: The owner is locked out of reception, menu administration, and analytics.
- **Mitigation**: Require `currentPin` in the request body, verify it against the stored hash before permitting updates, and invalidate existing sessions upon PIN change.

### [High] Challenge 2: Date Corruption via Injected HTTP Header in Production
- **Assumption challenged**: The solution assumes mock dates are only passed during local Playwright/unit tests.
- **Attack scenario**: A user discovers `X-Mock-Date` from client code or documentation and sends `X-Mock-Date: 2024-01-01` while placing an order. `timezoneMiddleware` stamps the order with `date_key = '2024-01-01'`.
- **Blast radius**: Daily sequence counters and sales analytics are corrupted.
- **Mitigation**: Enforce `if (process.env.NODE_ENV === 'production') return normalDate;`.

### [Medium] Challenge 3: Credential Leakage via Database Exposure
- **Assumption challenged**: The solution assumes the database file/connection is completely private.
- **Attack scenario**: A backup of `kotha.db` is leaked, or the Turso read token is exposed.
- **Blast radius**: Attacker reads `settings` table and immediately learns the reception PIN.
- **Mitigation**: Hash the PIN using salted PBKDF2 or Scrypt before persisting.

---

## Stress Test Results

- `25 concurrent sequence requests` → Expected 25 unique numbers → Actual: 25 unique numbers (1 to 25) → **PASS**
- `Timezone rollover at 18:30:00 UTC` → Expected dateKey to increment from 2026-10-14 to 2026-10-15 → Actual: shifted at exact second → **PASS**
- `POST /api/auth/change-pin without currentPin` → Expected HTTP 400 Bad Request → Actual: HTTP 200 Success → **FAIL** (Vulnerability confirmed)
- `X-Mock-Date header in NODE_ENV=production` → Expected header to be ignored → Actual: header overrides system date → **FAIL** (Vulnerability confirmed)
- `Database inspection of settings table` → Expected hashed PIN → Actual: plaintext `"1234"` / `"5678"` → **FAIL** (Defect confirmed)

---

## Unchallenged Areas

- Audio alert synthesis and SSE broadcasting: Out of scope for Milestone 1 (planned for Milestone 4).
