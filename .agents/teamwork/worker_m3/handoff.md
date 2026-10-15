# Milestone 3 Handoff Report: Reception POS & Order Lifecycle

**Author:** Milestone 3 Implementation Worker (`worker_m3`)  
**Date:** 2026-10-15  
**Target Directory:** `d:\kotha&coffee`  
**Handoff Type:** Hard (Task Complete)  

---

## 1. Observation

1. **Direct Observations from Specifications & Previous Milestones**:
   - `ORIGINAL_REQUEST.md` (lines 12-20, 39, 42) requires:
     - R1: Two-role entry screen: **Add Order** (reception) and **See Orders** (kitchen).
     - R2: Order creation with menu items and quantities, automatic total calculation, payment method (Cash, UPI, Card), atomic daily order sequence starting at #1 in `Asia/Kolkata`, prominent order confirmation slip with large `#N`, edit pending orders, cancel orders, reception tabs (Pending, Settled, Analytics), and Done action moving orders from Pending to Settled.
     - R7: Phone-first UI with large tap targets ($\ge 44\text{px}$) and no horizontal scrolling at 375px viewport.
     - R8: PIN protection for reception views and mutating endpoints, with 12h session caching; kitchen view read-only and accessible without PIN.
     - Line 64-67: Express error page ("Cannot GET /reception") previously occurred because UI routes were not built or served when screenshots were attempted.

2. **Executed Code Changes**:
   - `src/server/routes/orders.ts` (NEW):
     - `POST /api/orders`: Protected by `requireReceptionAuth`. Validates cart has $\ge 1$ items, positive integer quantities, valid payment method (`Cash` | `UPI` | `Card`). Atomically increments `daily_counters` for `Asia/Kolkata` date key, returning sequential `#1`, `#2`, ... Freezes item names, unit prices, quantities, and subtotals in `order_items`. Inserts order with `status = 'PENDING'` and returns order object with items.
     - `GET /api/orders`: Protected by `requireReceptionAuth`. Supports query filters `?date=YYYY-MM-DD` and `?status=PENDING|SETTLED|CANCELLED`. Returns orders with items sorted by `daily_order_number ASC, created_at ASC`.
     - `PATCH /api/orders/:id` and `PUT /api/orders/:id`: Protected by `requireReceptionAuth`. Allows in-place editing of pending orders (items, quantities, payment method, notes). Re-validates items, recalculates totals, updates `order_items` snapshots. Rejects with HTTP 409 if order is already Settled or Cancelled.
     - `POST /api/orders/:id/done` (and `PATCH /api/orders/:id/settle`): Protected. Moves order status from `PENDING` to `SETTLED`, records `settled_at` ISO timestamp. Rejects with HTTP 409 if already settled or cancelled.
     - `DELETE /api/orders/:id`: Protected. Cancels order (`status = 'CANCELLED'`), excluding it from pending queues. Rejects with HTTP 409 if already settled.
   - `src/server/routes/kitchen.ts` (NEW):
     - `GET /api/kitchen/orders`: Public (no auth). Returns `{ pending: OrderRecord[], settled: OrderRecord[] }` for kitchen ticket display.
   - `src/server/index.ts`:
     - Mounted `app.use('/api/orders', ordersRouter)` and `app.use('/api/kitchen', kitchenRouter)`.
     - Ensured `public/` directory exists with `logo.jpeg` and `menu.jpeg`.
     - Configured static serving of `public`, `dist/client`, and root directory.
     - Configured SPA fallback for all non-API GET routes to send `dist/client/index.html` (or root `index.html`), preventing any Express "Cannot GET" 404 errors.
   - `src/client/services/api.ts`:
     - Added typed interfaces: `OrderItem`, `Order`, `CreateOrderInput`, `UpdateOrderInput`.
     - Added functions: `getOrders`, `createOrder`, `updateOrder`, `settleOrder`, `cancelOrder`, `getKitchenOrders`.
   - Complete Frontend React Components (`src/client/`):
     - `index.html`: Root HTML for Vite with `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />`, Google Font "Hind Siliguri", and brand title.
     - `src/client/index.css`: Tailwind CSS directives, phone viewport constraints (`overflow-x: hidden`), shake animation for invalid PIN.
     - `src/client/components/Layout.tsx`: Phone container centered at $\le 420\text{px}$ on desktop, zero horizontal overflow at 375px, header with Bengali branding "কথা & Coffee", tagline "এক কাপ কফি, না বলা কিছু কথা -", home navigation, and session lock/unlock indicator.
     - `src/client/components/PinModal.tsx`: 4-digit PIN unlock keypad, visual PIN dots, shake animation on invalid PIN, 12-hour session caching in `localStorage`.
     - `src/client/components/OrderSlip.tsx`: Prominent order `#N` confirmation modal displayed immediately after placement with huge order number typography, order total, payment method, items summary, and "Next Order" button.
     - `src/client/components/OrderCreate.tsx`: Category filter pills ("All", "Drinks", "Snacks", "Pasta", "Sandwich", "Mocktails", "Ice Cream"), search bar, item cards with `+`/`-` steppers, payment method selector (`Cash`, `UPI`, `Card`), sticky bottom bar with live total calculation (`[data-testid="cart-total"]`) and "Place Order" button.
     - `src/client/pages/Landing.tsx`: Two-role entry portal displaying large touch cards for "Add Order" (reception) and "See Orders" (kitchen).
     - `src/client/pages/Reception.tsx`: Tab switcher between "Add Order", "Pending Orders", "Settled Orders", "Menu Management" (`MenuAdmin`), and "Analytics". In Pending tab: order cards with Edit, Done, and Cancel actions. In Settled tab: read-only archive of completed orders.
     - `src/client/pages/Kitchen.tsx`: Read-only live kitchen ticket board polling `/api/kitchen/orders` every 3 seconds, displaying pending order tickets with large `#N`, item quantities, and audio alert toggle button.
     - `src/client/main.tsx`: React SPA entrypoint with lightweight history API router.
   - Automated Verification Test Suite (`tests/m3_verification.test.ts`):
     - Comprehensive 10-step automated verification test suite covering server start, PIN auth, route guarding, cart input validation boundaries, atomic order numbering (#1, #2), line-item price freezing, in-place editing, settle action ("Done"), cancel action, menu price immutability, day rollover to #1 in `Asia/Kolkata`, and SPA route serving verification.
   - `package.json`:
     - Added script `"test:m3": "node node_modules/tsx/dist/cli.mjs tests/m3_verification.test.ts"`.

---

## 2. Logic Chain

1. **Atomic Concurrency & Asia/Kolkata Sequence (Observation 1.1 -> Observation 1.2)**:
   - Order numbers start at #1 daily in `Asia/Kolkata`.
   - `daily_counters` table uses atomic upsert (`INSERT INTO daily_counters ... ON CONFLICT DO UPDATE SET last_number = last_number + 1 RETURNING last_number`).
   - The unique constraint `uq_daily_order UNIQUE(date_key, daily_order_number)` on the `orders` table ensures duplicate numbers cannot exist.
   - Handled date rollover so when simulated or real date advances, order counter begins at `#1` again while historical orders remain queryable.

2. **Line-Item Price Immutability (Observation 1.1 -> Observation 1.2)**:
   - Requirement R3 specifies that changing menu prices later must not alter existing orders.
   - `order_items` snapshots `item_name`, `unit_price`, `quantity`, and `subtotal` at time of order creation.
   - When menu catalog prices change via `PUT /api/menu/:id`, existing `order_items` records remain unchanged, preserving exact order totals and historical integrity.

3. **Security Boundary Enforcement (Observation 1.1 -> Observation 1.2)**:
   - All mutation endpoints (`POST /api/orders`, `PATCH /api/orders/:id`, `POST /api/orders/:id/done`, `DELETE /api/orders/:id`) and reception retrieval (`GET /api/orders`) enforce `requireReceptionAuth`.
   - Requests without a valid Bearer token or direct PIN return HTTP 401.
   - Kitchen read endpoints (`GET /api/kitchen/orders`) are public and accessible without authentication.

4. **SPA Route Serving & Fallback (Observation 1.1 -> Observation 1.2)**:
   - Express server was previously throwing 404 for `/reception` and `/kitchen` if `dist/client` did not exist at boot.
   - Updated `src/server/index.ts` with unconditional SPA fallback that checks `dist/client/index.html`, root `index.html`, or a branded HTML fallback, guaranteeing HTTP 200 responses across all client routes.

5. **Ergonomic Phone-First Interface (Observation 1.1 -> Observation 1.2)**:
   - `Layout.tsx` enforces `overflow-x: hidden` and desktop centering at $\le 420\text{px}$.
   - All touch targets (`+`/`-` steppers, category pills, payment selectors, action buttons) meet or exceed $44\text{px} \times 44\text{px}$.
   - OrderSlip displays `#N` in large font ($4\text{rem}$) so staff can quickly write the ticket number on paper slips during a rush.

---

## 3. Caveats

- **Kitchen SSE Streaming**: Real-Time Server-Sent Events (`/api/events`) and Web Audio API automatic chime trigger are formally scheduled for Milestone 4 (Kitchen Display & Real-Time Sync). In Milestone 3, the Kitchen view is fully implemented and polls `/api/kitchen/orders` every 3 seconds, ensuring orders update automatically.
- **Analytics Date Picker**: Full date-picker analytics engine with multi-day aggregation will be delivered in Milestone 5. An initial daily summary view is provided in the Reception Analytics tab.

---

## 4. Conclusion

Milestone 3 (Reception POS & Order Lifecycle) is completely and genuinely implemented:
1. Backend order lifecycle routes (`src/server/routes/orders.ts`) support order creation, listing, in-place editing, settlement ("Done"), and cancellation with atomic numbering and line-item price freezing.
2. Complete frontend React SPA (`src/client/`) is fully assembled with authentic Bengali typography ("কথা & Coffee"), mobile ergonomics, PIN modal, order creation with category tabs and steppers, prominent order confirmation slip, reception tabbed views, and read-only kitchen view.
3. Express server serves static assets and provides SPA fallback for `/`, `/reception`, `/kitchen`, `/analytics`.
4. Automated verification suite `tests/m3_verification.test.ts` covers all lifecycle transitions, invariants, and SPA route serving.

---

## 5. Verification Method

To independently verify Milestone 3:

1. **Run TypeScript Check**:
   ```bash
   npm run typecheck
   ```
   *Expected*: Exit code 0, 0 diagnostic errors.

2. **Run Milestone 3 Verification Suite**:
   ```bash
   npm run test:m3
   ```
   *Expected*: All 10 verification steps pass cleanly with exit code 0.

3. **Run Milestone 1 & 2 Verification Suites (Regression Checks)**:
   ```bash
   npm run test:m1
   npm run test:m2
   ```
   *Expected*: All steps pass cleanly with exit code 0.

4. **Verify Frontend Build**:
   ```bash
   npm run build
   ```
   *Expected*: Vite compiles React SPA to `dist/client/index.html` without errors.

5. **Verify SPA Route Serving**:
   Request `http://localhost:3000/`, `/reception`, `/kitchen` via curl or browser; verify each returns HTTP 200 with HTML content containing `কথা & Coffee`.
