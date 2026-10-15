## 2026-10-15T03:42:04Z
You are the Implementation Worker for Milestone 3 (Reception POS & Order Lifecycle) of the Kotha & Coffee POS project.
Your working directory is: d:\kotha&coffee\.agents\teamwork\worker_m3

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

You MUST read these files before doing anything:
1. d:\kotha&coffee\.agents\teamwork\ORIGINAL_REQUEST.md (Note the urgent parent directive regarding screenshots and serving real UI!)
2. d:\kotha&coffee\PROJECT.md
3. d:\kotha&coffee\.agents\teamwork\spec_miner_survey\handoff.md
4. d:\kotha&coffee\.agents\teamwork\worker_m2\handoff.md

Your Scope:
1. Backend Order Lifecycle Routes (`src/server/routes/orders.ts`):
   - `POST /api/orders`: Protected by `requireReceptionAuth`. Validates cart has >= 1 items, positive integer quantities. Computes total amount. Generates atomic daily order number (`#1`, `#2`, …) in `Asia/Kolkata` for `date_key`. Freezes line-item unit prices and subtotals in `order_items`. Inserts order with `status = 'PENDING'`. Returns order with items and order number.
   - `GET /api/orders`: Protected by `requireReceptionAuth`. Query params: `?date=YYYY-MM-DD&status=PENDING|SETTLED`. Returns orders with items sorted by order number.
   - `PATCH /api/orders/:id`: Protected. In-place edit of pending order (items, quantities, payment method). Re-validates items, recalculates totals, updates `order_items` snapshot and order total. Rejects with HTTP 400/409 if order is already Settled or Cancelled.
   - `POST /api/orders/:id/done`: Protected. Moves order from `PENDING` to `SETTLED`. Records `settled_at` ISO timestamp. Rejects if already settled or cancelled.
   - `DELETE /api/orders/:id`: Protected. Cancels order (`status = 'CANCELLED'`). Excludes it from pending queues.
2. Complete Frontend React SPA Assembly (`src/client/`):
   - Create root `index.html` at project root for Vite if missing, with viewport meta `width=device-width, initial-scale=1.0`.
   - Brand Theme: Bengali typography "কথা & Coffee", tagline "এক কাপ কফি, না বলা কিছু কথা -", rich espresso `#3E2723`, cream `#FFF8E7`, parchment `#FAF3E0`, leaf green `#33691E`, terracotta `#8D493A`.
   - Responsive Phone-First Shell (`src/client/components/Layout.tsx`): Strict 375px mobile viewport constraint with `overflow-x: hidden` and touch targets >= 44px.
   - Two-Role Landing Portal (`src/client/pages/Landing.tsx`): Large cards for "Add Order" (reception) and "See Orders" (kitchen).
   - Numeric PIN Keypad Modal (`src/client/components/PinModal.tsx`): 4-digit PIN unlock for `/reception`, shake animation on wrong PIN, 12h session caching in localStorage.
   - Order Creation POS (`src/client/components/OrderCreate.tsx`): Category tabs, item cards with `+`/`-` steppers, running total in sticky bottom bar, Cash/UPI/Card payment selector.
   - Prominent Order Slip Confirmation (`src/client/components/OrderSlip.tsx`): Large order `#N` modal displayed immediately after placement for cashier to write on paper slip, with "Next Order" button.
   - Reception Views (`src/client/pages/Reception.tsx`): Tab switcher between:
     - "Create Order"
     - "Pending Orders" (with Edit, Done, Cancel actions)
     - "Settled Orders" (read-only list of today's settled orders)
     - "Menu Management" (`MenuAdmin.tsx`)
     - "Analytics" (placeholder or initial view until M5)
   - Read-Only Kitchen View initial shell (`src/client/pages/Kitchen.tsx`): Shows Pending and Settled orders (ready for SSE wiring in M4).
3. Express Server Integration (`src/server/index.ts`):
   - Mount `ordersRouter` on `/api/orders`.
   - Configure static file serving from `dist/client/` (and `public/` for logos).
   - Configure SPA fallback: Any unmatched route (`*`) sends `dist/client/index.html`.
4. Build & Production Serving Verification:
   - Run `npm run build` (Vite compiles React SPA to `dist/client/`).
   - Verify that starting the server and requesting `/`, `/reception`, `/kitchen` returns HTTP 200 with real HTML, NOT Express "Cannot GET" 404!
5. Automated Verification Test (`tests/m3_verification.test.ts`):
   - Create order -> receives #1, line items frozen, total calculated correctly.
   - Edit order -> updates items, total recalculates.
   - Done button -> order moves to Settled with settled_at timestamp.
   - Cancel order -> status cancelled.
   - Unauthenticated mutations return 401.
   - SPA route test -> GET `/`, `/reception`, `/kitchen` returns 200 with HTML content.
