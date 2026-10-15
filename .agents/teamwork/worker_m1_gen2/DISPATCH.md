## 2026-10-15T03:00:22Z
You are the Implementation Worker (Iteration 2) for Milestone 1 (Foundation, Data Layer, Server & PIN Auth) of the Kotha & Coffee POS project.
Your working directory is: d:\kotha&coffee\.agents\teamwork\worker_m1_gen2

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

You MUST read these files before doing anything:
1. d:\kotha&coffee\.agents\teamwork\ORIGINAL_REQUEST.md
2. d:\kotha&coffee\PROJECT.md
3. d:\kotha&coffee\.agents\teamwork\orchestrator\GATE_STATUS.md
4. d:\kotha&coffee\.agents\teamwork\reviewer_m1_2\handoff.md
5. d:\kotha&coffee\.agents\teamwork\worker_m1\handoff.md

Your Task:
Address the specific review findings from Iteration 1 to pass the Milestone 1 Gate:
1. Cryptographic PIN Hashing (`src/server/middleware/auth.ts`):
   - Replace plaintext PIN storage in the `settings` table with cryptographic hashing using salt (e.g. `crypto.scryptSync(pin, salt, 32)` or `crypto.pbkdf2Sync`).
   - Store as `salt:hash` string in the `settings` table (`key = 'reception_pin'`).
   - Compare hashes using `crypto.timingSafeEqual` to avoid timing attacks.
   - Maintain backward compatibility for initial setup or default PIN ('1234').
2. Strict `currentPin` Verification on PIN Change (`src/server/routes/auth.ts`):
   - `POST /api/auth/change-pin` MUST require both `currentPin` and `newPin` per `PROJECT.md § Interface Contracts`.
   - Verify `currentPin` against the stored hash before updating. If missing or incorrect, reject with HTTP 401 `{ error: "Invalid current PIN" }`.
   - Validate that `newPin` is a numeric string of 4 to 6 digits (`/^\d{4,6}$/`). If invalid, reject with HTTP 400 `{ error: "PIN must be 4 to 6 digits" }`.
3. Non-Production Restriction on `X-Mock-Date` (`src/server/middleware/timezone.ts`):
   - Ensure `X-Mock-Date` header is ONLY parsed and respected when `process.env.NODE_ENV !== 'production'`.
   - In production mode, always use the real system clock formatted in `Asia/Kolkata`.
4. Database Connection Settings (`src/server/db/client.ts`):
   - Ensure `PRAGMA busy_timeout = 5000;` and `PRAGMA journal_mode = WAL;` are configured on local SQLite connections.
5. Verification & Testing:
   - Update `tests/m1_verification.test.ts` to assert:
     - The stored PIN in `settings` table is hashed with salt (not plaintext).
     - Changing PIN requires correct `currentPin`, and rejects missing/wrong `currentPin` with 401.
     - Non-numeric or invalid-length PINs are rejected with 400.
     - `X-Mock-Date` is ignored when `NODE_ENV === 'production'`.
   - Run `npm run typecheck` and `npm run test:m1` to verify all tests pass cleanly.

Deliverables:
- Maintain `d:\kotha&coffee\.agents\teamwork\worker_m1_gen2\progress.md` with timestamps.
- Write your complete handoff report to `d:\kotha&coffee\.agents\teamwork\worker_m1_gen2\handoff.md` with exact build and test verification outputs.
- Send a completion message back to me (the orchestrator) with your summary and handoff path.
