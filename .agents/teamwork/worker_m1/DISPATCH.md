## 2026-10-15T02:33:33Z
You are the Implementation Worker for Milestone 1 (Foundation, Data Layer, Server & PIN Auth) of the Kotha & Coffee POS project.
Your working directory is: d:\kotha&coffee\.agents\teamwork\worker_m1

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

You MUST read these files before doing anything:
1. d:\kotha&coffee\.agents\teamwork\ORIGINAL_REQUEST.md
2. d:\kotha&coffee\PROJECT.md
3. d:\kotha&coffee\.agents\teamwork\explorer_tech_survey\handoff.md
4. d:\kotha&coffee\.agents\teamwork\spec_miner_survey\handoff.md

Your Scope (Milestone 1):
- Initialize project configuration: `package.json`, `tsconfig.json`, `vite.config.ts`, `tailwind.config.js`, `.gitignore`. Include all fullstack dependencies (Express, @libsql/client, cors, dotenv, jsonwebtoken, etc.) and frontend/test dependencies (React, Vite, Tailwind, Lucide React, Playwright).
- Create `src/server/db/client.ts` with dual-mode `@libsql/client` support:
  - If `DATABASE_URL` is unset or starts with `file:`, operate against local SQLite `data/kotha.db` (or `:memory:`). Ensure directory `data/` is created if missing.
  - If `DATABASE_URL` is set to Turso (`libsql://...`), connect using `DATABASE_AUTH_TOKEN`.
- Create `src/server/db/schema.ts` defining all 5 tables (`settings`, `menu_items`, `daily_counters`, `orders`, `order_items`) and indexes as specified in `PROJECT.md § Interface Contracts`. Execute table creation on startup.
- Create `src/server/middleware/timezone.ts`:
  - Determine date key in `Asia/Kolkata` (UTC+05:30) formatted as `YYYY-MM-DD`.
  - Provide clock simulation test support (override via `X-Mock-Date` header or `/api/test/set-time` endpoint).
- Implement atomic daily sequence generator function:
  - Uses `daily_counters` table with atomic upsert/increment (`BEGIN IMMEDIATE`) returning the next integer sequence starting at 1 for each new date key in `Asia/Kolkata`.
  - Ensures no race condition produces duplicate numbers on the same date.
- Create `src/server/middleware/auth.ts`:
  - PIN verification function (default PIN: '1234', configurable via `ADMIN_PIN` env var or `settings` table).
  - Issues 12-hour signed session token.
  - Middleware `requireReceptionAuth` that blocks unauthenticated mutations with HTTP 401 (`{ error: "Unauthorized" }`).
- Create `src/server/routes/auth.ts`:
  - `POST /api/auth/verify-pin` -> accepts `{ pin }`, returns `{ token, expiresIn }` on success, HTTP 401 on incorrect PIN.
  - `POST /api/auth/change-pin` -> protected, updates PIN in `settings` table.
- Create `src/server/routes/test.ts`:
  - Test endpoints enabled only when `NODE_ENV !== 'production'`:
    - `POST /api/test/set-time` -> accepts `{ timestamp, dateKey }`
    - `POST /api/test/reset-time` -> restores real clock
    - `POST /api/test/reset` -> clears orders and counters for test isolation
- Create `src/server/index.ts`:
  - Initializes database and tables.
  - Registers middlewares, CORS, JSON parsing, routes.
  - Exposes `GET /api/health` returning `{ status: "ok", time, dateKey }`.
  - Configures server to listen on port 3000 (or `PORT` env var).
  - Handles graceful shutdown (`SIGTERM`, `SIGINT`).

Write Ownership:
You exclusively own:
- `package.json`, `tsconfig.json`, `vite.config.ts`, `tailwind.config.js`, `.gitignore`
- `src/server/**`
- `data/`

Verification Requirement:
- Run build and test commands (e.g. `npm install`, compile TypeScript or start server test) to verify that:
  1. Dependencies install cleanly.
  2. The server compiles and starts without errors.
  3. `GET /api/health` returns status 200 with `Asia/Kolkata` dateKey.
  4. Wrong PIN returns 401, correct PIN `1234` returns valid token.
  5. Mutation attempt without token returns 401.
  6. Atomic counter returns #1 for a fresh date key, and increments sequentially.

Deliverables:
- Maintain `d:\kotha&coffee\.agents\teamwork\worker_m1\progress.md` with timestamps.
- Write your complete handoff report to `d:\kotha&coffee\.agents\teamwork\worker_m1\handoff.md` with exact build and test verification output.
- Send a completion message back to me (the orchestrator) with a summary and the handoff file path.
