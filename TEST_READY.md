# TEST READY — Kotha & Coffee POS Automated E2E Test Suite

**Status**: READY  
**Timestamp**: 2026-10-15T03:30:00Z  
**Author**: E2E Test Writer (`test_writer_e2e`)  
**Target Environment**: Windows (PowerShell) / Node.js / Playwright  

---

## 1. Single Turnkey Test Runner Command

Run the complete automated E2E test suite with a single command:

```powershell
npm test
```
*(or `npm run test:e2e`)*

### Granular Tier Runner Commands:
```powershell
npm run test:tier1        # Tier 1: Feature Coverage (Landing, Reception, Menu, Kitchen, Analytics, PIN)
npm run test:tier2        # Tier 2: Boundary & Edge (Concurrency burst, PIN 401 guards, 375px overflow, Restart)
npm run test:tier3        # Tier 3: Interactions (Live sync <5s, Date roll #1 reset, Immutability, Audio)
npm run test:tier4        # Tier 4: Real-World Workflows (20-order rush hour, 3-day math audit, Lifecycle)
npm run test:screenshots  # Automated Deliverable Screenshots (Captures 7 mobile screenshots into ./screenshots/)
npm run typecheck        # TypeScript compilation verification (0 errors)
```

---

## 2. Test Suite Inventory & Coverage Summary

Total Suite Size: **74 tests across 20 files**

### Tier 1: Feature Coverage (`tests/e2e/tier1-feature-coverage/`)
- `01-landing-role-selection.spec.ts` (6 tests): Two-role entry portal ("Add Order" / "See Orders"), Bengali brand logo and tagline, route transitions, zero 375px overflow.
- `02-reception-order-crud.spec.ts` (7 tests): Add order, automatic total calculation, Cash/UPI/Card payment picker, prominent order slip modal (#), pending queue, in-place edit, done settlement, cancel action.
- `03-menu-management.spec.ts` (6 tests): Active catalog listing, add item, edit item price/name, remove item, negative/empty price validation, direct mutation route protection (401).
- `04-kitchen-display.spec.ts` (6 tests): Public access without PIN, pending queue, settled queue, strictly read-only (zero Done/Edit/Cancel buttons), public kitchen API (200), zero 375px overflow.
- `05-analytics-daily-views.spec.ts` (6 tests): Daily summary with grand total, date-wise calendar picker, item quantity & revenue breakdown, Cash/UPI/Card split, authenticated API, unauthenticated rejection (401).
- `06-pin-unlock-flow.spec.ts` (6 tests): PIN prompt modal, wrong PIN rejection (401), correct PIN (1234) unlock, persistent 12h session caching across page refreshes, owner PIN update, rejection of invalid current PIN.

### Tier 2: Boundary & Edge (`tests/e2e/tier2-boundary-edge/`)
- `01-concurrency-atomic-orders.spec.ts` (3 tests): Parallel burst of 5 simultaneous creations yielding unique consecutive numbers, multi-date interleaved requests, rapid single-session order sequence.
- `02-pin-security-api-bypass.spec.ts` (9 tests): Direct unauthenticated mutations to `POST /api/orders`, `PATCH /api/orders/:id`, `DELETE /api/orders/:id`, `POST /api/orders/:id/done`, `POST /api/menu`, `PUT /api/menu/:id`, `DELETE /api/menu/:id`, and forged Bearer token all return HTTP 401; public kitchen read allowed.
- `03-viewport-overflow-375px.spec.ts` (6 tests): Strict `scrollWidth <= clientWidth` evaluation on Landing, Reception Pending, Reception Settled, Reception Analytics, Reception Menu Management, and Kitchen Display at 375px mobile width.
- `04-server-restart-persistence.spec.ts` (2 tests): Persistent storage verification, order status and item retention across reconnects, daily sequence counter progression without reverting to #1 on same day.
- `05-cart-and-input-boundaries.spec.ts` (5 tests): Empty cart rejection, zero or negative quantities, decimal precision across rupee amounts (₹59, ₹69, ₹79), Bengali script and special characters in item notes, payment method validation.

### Tier 3: Interactions (`tests/e2e/tier3-interactions/`)
- `01-realtime-kitchen-sync.spec.ts` (1 test): Isolated multi-context test asserting reception order creation appears on kitchen display in $<5000\text{ ms}$ with zero page reload.
- `02-date-roll-kolkata-reset.spec.ts` (1 test): Orders #1, #2, #3 on Day 1; advancing mock clock past midnight in `Asia/Kolkata` resets next order to #1; past day orders preserved in history.
- `03-menu-price-immutability.spec.ts` (1 test): Item price updated in catalog does NOT mutate past order line-item totals or historical analytics; new orders adopt updated price.
- `04-kitchen-audio-alert.spec.ts` (1 test): Verifies acoustic chime event triggered on kitchen device upon new order arrival via Web Audio / HTMLAudioElement spy.
- `05-order-settle-cancel-sync.spec.ts` (2 tests): Reception clicks Done $\rightarrow$ moves to Settled in kitchen within 5s; reception cancels order $\rightarrow$ purged from active lists and contributes ₹0 to analytics.

### Tier 4: Real-World Workflows (`tests/e2e/tier4-real-world-workflows/`)
- `01-cafe-rush-hour-simulation.spec.ts` (1 test): 20 rapid orders with mixed menu items, concurrent on-the-fly edits, settlements, and cancels, preserving contiguous sequence numbering.
- `02-seeded-analytics-math-audit.spec.ts` (3 tests): 3-day multi-day dataset verification against mathematically derived ground-truth sums (Day 1: ₹270, Day 2: ₹416, Day 3: ₹525) down to exact ₹0.00 accuracy.
- `03-full-day-lifecycle-e2e.spec.ts` (1 test): Complete cafe day lifecycle from morning opening with PIN, menu special updates, lunch rush, kitchen prep settlements, to evening analytics audit.

### Deliverable Screenshots Generator (`tests/e2e/screenshots/`)
- `generate-deliverable-screenshots.spec.ts`: Captures all 7 required 375px mobile screenshots into `./screenshots/`:
  1. `01_landing.png`
  2. `02_create_order.png`
  3. `03_order_confirmation_slip.png`
  4. `04_reception_pending.png`
  5. `05_reception_settled.png`
  6. `06_reception_analytics.png`
  7. `07_kitchen_view.png`

---

## 3. Test Fixtures & Specialized Helpers

- **Menu Items Fixture** (`tests/fixtures/menu-items.fixture.ts`): All 34 items across 6 categories matching `menu.jpeg` exactly.
- **Seeded Analytics Fixture** (`tests/fixtures/seeded-analytics.fixture.ts`): 3-day multi-day dataset and expected sums.
- **Audio Spy Helper** (`tests/helpers/audio-spy.ts`): Injects headless spies into `HTMLAudioElement.prototype.play` and Web Audio API `AudioContext`.
- **Viewport Overflow Checker** (`tests/helpers/overflow-checker.ts`): Evaluates `scrollWidth <= clientWidth` and flags overflowing elements.
- **Clock Controller Helper** (`tests/helpers/clock-controller.ts`): DateKey formatting and mock date injection for `Asia/Kolkata`.
- **Server Controller Helper** (`tests/helpers/server-controller.ts`): Health check polling and database state reset.
- **Auth Helper** (`tests/helpers/auth-helper.ts`): 12-hour session token generation and PIN UI unlock.

---

## 4. Verification & Readiness Status

- [x] `playwright.config.ts` configured with `baseURL`, `Asia/Kolkata`, `workers: 1`, mobile viewport `{ width: 375, height: 667 }`, and `webServer`.
- [x] All test helpers and fixtures implemented.
- [x] All 4 test tiers implemented and mapped to requirements R1-R8 and Acceptance Criteria AC 1-12.
- [x] Deliverable screenshot generator implemented; verified with 7 generated PNGs.
- [x] TypeScript compilation: **0 errors** (`npm run typecheck`).
- [x] Tier 2 execution: **25 passed in 7.1s**.
- [x] All test scripts registered in `package.json`.
- [x] `TEST_INFRA.md` published at project root.
