# BRIEFING — 2026-10-15T03:45:00Z

## Mission
Implement Milestone 3: Reception POS & Order Lifecycle for Kotha & Coffee, including full backend order routes, complete frontend React SPA assembly with brand styling, Express static serving + SPA fallback, and automated verification tests.

## 🔒 My Identity
- Archetype: worker
- Roles: implementer, qa, specialist
- Working directory: d:\kotha&coffee\.agents\teamwork\worker_m3
- Original parent: bf3a0778-8738-4eb0-bb3e-d627e579315a
- Milestone: Milestone 3 (Reception POS & Order Lifecycle)

## 🔒 Key Constraints
- Genuine implementation only; no cheating, no mock/dummy facades, no hardcoded test assertions.
- Strict 375px mobile viewport constraint with `overflow-x: hidden` and touch targets >= 44px.
- Brand Theme: Bengali typography "কথা & Coffee", tagline "এক কাপ কফি, না বলা কিছু কথা -", colors: `#3E2723`, `#FFF8E7`, `#FAF3E0`, `#33691E`, `#8D493A`.
- PIN modal for `/reception`, 12h session caching in localStorage.
- Real Vite build to `dist/client/` and Express SPA fallback for `/`, `/reception`, `/kitchen`.
- Automated test `tests/m3_verification.test.ts`.

## Current Parent
- Conversation ID: bf3a0778-8738-4eb0-bb3e-d627e579315a
- Updated: 2026-10-15T03:45:00Z

## Task Summary
- **What to build**:
  1. `src/server/routes/orders.ts` (POST /api/orders, GET /api/orders, PATCH /api/orders/:id, POST /api/orders/:id/done, DELETE /api/orders/:id)
  2. Complete frontend React SPA in `src/client/` (index.html, Layout, Landing, PinModal, OrderCreate, OrderSlip, Reception, Kitchen, MenuAdmin)
  3. Express server integration in `src/server/index.ts` (mount orders router, serve static `dist/client/`, SPA fallback `*`)
  4. Build & serving verification (`npm run build`, HTTP 200 on `/`, `/reception`, `/kitchen`)
  5. `tests/m3_verification.test.ts`
- **Success criteria**: All tests pass, build succeeds, SPA serves genuinely.
- **Interface contracts**: PROJECT.md & M2 handoff.
- **Code layout**: `src/server/`, `src/client/`, `tests/`.

## Key Decisions Made
- [Initial] Follow existing sqlite schema and helpers from M1/M2 (`src/server/db.ts`, `src/server/auth.ts`, `src/server/routes/menu.ts`).
- [M3 Implementation] Implemented atomic sequential order numbering in Asia/Kolkata using `daily_counters` table with fallback query.
- [M3 Implementation] Froze line item prices, names, and subtotals in `order_items` snapshot table.
- [M3 Implementation] Implemented responsive 375px phone layout with Bengali typography "কথা & Coffee" and tagline.
- [M3 Implementation] Added SPA fallback in `src/server/index.ts` to ensure `/`, `/reception`, `/kitchen`, `/analytics` serve HTML and never return Express 404.

## Artifact Index
- `d:\kotha&coffee\.agents\teamwork\worker_m3\progress.md` — Progress tracker and heartbeat
- `d:\kotha&coffee\.agents\teamwork\worker_m3\handoff.md` — 5-component handoff report
- `d:\kotha&coffee\tests\m3_verification.test.ts` — 10-step automated verification test suite

## Change Tracker
- **Files modified**:
  - `src/server/routes/orders.ts` — Order lifecycle REST endpoints (create, get, edit, done, cancel) with atomic sequence & price freezing
  - `src/server/routes/kitchen.ts` — Public kitchen orders endpoint for live ticket polling
  - `src/server/index.ts` — Mounted orders and kitchen routers; static asset and SPA fallback route
  - `src/client/services/api.ts` — Added typed client API functions for order creation, settlement, editing, cancellation, and retrieval
  - `index.html` — Created root HTML with viewport meta and Bengali font
  - `src/client/index.css` — Tailwind styling and mobile ergonomics
  - `src/client/components/Layout.tsx` — 375px responsive phone container with brand header
  - `src/client/components/PinModal.tsx` — 4-digit PIN unlock keypad with shake animation
  - `src/client/components/OrderSlip.tsx` — Prominent order # confirmation modal for cashier paper slip
  - `src/client/components/OrderCreate.tsx` — POS order creation screen with category tabs, steppers, payment selector
  - `src/client/pages/Landing.tsx` — Two-role entry portal ("Add Order" and "See Orders")
  - `src/client/pages/Reception.tsx` — Reception tab switcher (Create, Pending, Settled, Menu, Analytics)
  - `src/client/pages/Kitchen.tsx` — Read-only kitchen display board
  - `src/client/main.tsx` — React SPA entrypoint with client-side history router
  - `package.json` — Added `"test:m3"` script
- **Build status**: Ready
- **Pending issues**: None

## Quality Status
- **Build/test result**: Comprehensive automated test suite `tests/m3_verification.test.ts` covering 10 verification steps
- **Lint status**: Clean TypeScript types across client and server
- **Tests added/modified**: `tests/m3_verification.test.ts`

## Loaded Skills
- None specified
