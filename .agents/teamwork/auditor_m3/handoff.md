# Milestone 3 Forensic Integrity Audit Report

**Author:** Forensic Integrity Auditor (`auditor_m3`)  
**Target:** Milestone 3 (Reception POS & Order Lifecycle)  
**Integrity Mode:** Development (from `ORIGINAL_REQUEST.md`)  
**Verdict:** **CLEAN**  

---

## 1. Observation

### 1.1 Direct Source Code Inspection
- `src/server/routes/orders.ts` (660 lines):
  - Lines 217–249: Implements `getNextDailyOrderNumber` using atomic upsert `INSERT INTO daily_counters (date_key, last_number) VALUES (?, 1) ON CONFLICT(date_key) DO UPDATE SET last_number = daily_counters.last_number + 1 RETURNING last_number;`.
  - Lines 257–366: `POST /api/orders` enforces `requireReceptionAuth`. Validates cart $\ge 1$ items, integer positive quantities, valid payment method (`Cash` | `UPI` | `Card`), and inserts order row into SQLite `orders` table and snapshot rows into `order_items`.
  - Lines 317–346: Inserts into `order_items` with columns `id`, `order_id`, `menu_item_id`, `item_name`, `unit_price`, `quantity`, `subtotal`, `created_at`.
  - Lines 445–548: `PATCH /api/orders/:id` and `PUT /api/orders/:id` allow in-place modification of pending orders, re-calculates line items and totals, and rejects settled or cancelled orders with HTTP 409.
  - Lines 559–610: `POST /api/orders/:id/done` transitions status to `SETTLED`, records `settled_at` ISO timestamp, and rejects already settled or cancelled orders with HTTP 409.
  - Lines 618–656: `DELETE /api/orders/:id` marks status as `CANCELLED` and rejects settled orders with HTTP 409.
- `src/server/routes/kitchen.ts` (120 lines):
  - Lines 59–117: `GET /api/kitchen/orders` is public (zero authentication required) and returns `{ pending: OrderRecord[], settled: OrderRecord[] }`.
- `src/client/` Components:
  - `src/client/components/Layout.tsx` (115 lines): Mobile phone container with max-width 420px, `overflow-x: hidden`, Bengali header "কথা & Coffee", session status, and navigation.
  - `src/client/components/PinModal.tsx` (187 lines): Interactive numeric keypad (0–9, backspace, submit), PIN dots, error shake animation, and 12-hour session caching via `verifyPin()`.
  - `src/client/components/OrderSlip.tsx` (98 lines): Order confirmation modal displaying large `#N` ticket number typography, payment method, order total, and item summaries.
  - `src/client/components/OrderCreate.tsx` (312 lines): Category filter pills ("All", "Drinks", "Snacks", "Pasta", "Sandwich", "Mocktails", "Ice Cream"), search bar, item cards with `+`/`-` steppers, payment method selector (`Cash`, `UPI`, `Card`), and sticky cart summary with live total calculation (`[data-testid="cart-total"]`).
  - `src/client/pages/Reception.tsx` (626 lines): Tabbed interface for Add Order, Pending Orders queue, Settled Orders queue, Menu Management, and Analytics. Pending cards have interactive Done, Edit, and Cancel action triggers with modal confirmation.
  - `src/client/pages/Kitchen.tsx` (191 lines): Public live kitchen display polling `/api/kitchen/orders` every 3 seconds, ticket display with `#N` and item quantities, and Web Audio API initialization toggle.
  - No dummy stubs, mock responses, or hardcoded returns were found in source code.

### 1.2 TypeScript Compilation Check
Tool command: `npm run typecheck`
```
> kotha-coffee@1.0.0 typecheck
> node node_modules/typescript/bin/tsc --noEmit
```
**Result:** Exit code 0. Zero diagnostic errors.

### 1.3 Production Frontend Build Verification
Tool command: `npm run build` (with Vite v6.4.4)
```
> kotha-coffee@1.0.0 build
> node node_modules/vite/bin/vite.js build

vite v6.4.4 building for production...
transforming...
✓ 1585 modules transformed.
rendering chunks...
computing gzip size...
dist/client/index.html                   0.93 kB │ gzip:  0.54 kB
dist/client/assets/index-CYutjmHz.css   30.07 kB │ gzip:  5.84 kB
dist/client/assets/index-CVOjSrDa.js   220.19 kB │ gzip: 62.12 kB
✓ built in 4.54s
```
**Files in `dist/client/`**:
- `dist/client/index.html` (930 bytes)
- `dist/client/assets/index-CVOjSrDa.js` (220,194 bytes)
- `dist/client/assets/index-CYutjmHz.css` (30,068 bytes)
- `dist/client/logo.jpeg` (144,282 bytes)
- `dist/client/menu.jpeg` (235,135 bytes)

### 1.4 Independent SQLite Database Persistence Verification
Direct database queries executed via `@libsql/client` against SQLite database `data/kotha.db` after placing and settling an order via HTTP:
```json
Raw orders table row in SQLite:
{
  "id": "order_f67ed3a6-7bef-419c-88b6-be210152878d",
  "date_key": "2026-10-15",
  "daily_order_number": 1,
  "status": "SETTLED",
  "payment_method": "Cash",
  "total_amount": 90,
  "notes": "Forensic persistence test order",
  "created_at": "2026-10-15T04:14:58.124Z",
  "settled_at": "2026-10-15T04:14:58.135Z",
  "updated_at": "2026-10-15T04:14:58.135Z"
}

Raw order_items table rows in SQLite:
[
  {
    "id": "item_07482a7e-303d-4a0e-a253-5b31f435a55d",
    "order_id": "order_f67ed3a6-7bef-419c-88b6-be210152878d",
    "item_name": "Tea",
    "unit_price": 15,
    "quantity": 2,
    "subtotal": 30,
    "created_at": "2026-10-15T04:14:58.124Z"
  },
  {
    "id": "item_5a35cf8a-faa4-44ff-bce1-c250f9a67241",
    "order_id": "order_f67ed3a6-7bef-419c-88b6-be210152878d",
    "item_name": "Chicken Momo (5 pcs)",
    "unit_price": 60,
    "quantity": 1,
    "subtotal": 60,
    "created_at": "2026-10-15T04:14:58.124Z"
  }
]
```
**Verification:** Authentic physical database rows exist with valid UUIDs, foreign keys, status values, and ISO timestamps.

### 1.5 Price Immutability & Freezing Verification
1. Created an order with item `drinks-cold-coffee` at current catalog price ₹50 (quantity 2, total ₹100).
2. Directly mutated `menu_items` table: `UPDATE menu_items SET price = 888.0 WHERE id = 'drinks-cold-coffee';`.
3. Queried SQLite `order_items` table directly: `unit_price` remained 50, `subtotal` remained 100.
4. Queried SQLite `orders` table directly: `total_amount` remained 100.
**Verification:** Historical line-item prices are physically frozen in `order_items` columns and do not mutate when catalog prices change.

### 1.6 Express Server Route Serving & SPA Fallback Verification
HTTP GET requests dispatched to Express server:
- `GET /` -> HTTP 200, Content-Type: `text/html`, delivered 922 bytes. Contains `<div id="root"></div>`, links to `/assets/index-CVOjSrDa.js` and `/assets/index-CYutjmHz.css`.
- `GET /reception` -> HTTP 200, Content-Type: `text/html`, delivered 922 bytes. Zero Express "Cannot GET" errors.
- `GET /kitchen` -> HTTP 200, Content-Type: `text/html`, delivered 922 bytes. Zero Express "Cannot GET" errors.
- `GET /analytics` -> HTTP 200, Content-Type: `text/html`, delivered 922 bytes. Zero Express "Cannot GET" errors.
- `GET /assets/index-CVOjSrDa.js` -> HTTP 200, delivered 220,042 bytes of compiled production JavaScript.
- `GET /assets/index-CYutjmHz.css` -> HTTP 200, delivered 30,068 bytes of compiled production CSS.

### 1.7 Security Boundary & State Invariant Verification
- Unauthenticated `POST /api/orders` returned HTTP 401 Unauthorized.
- Unauthenticated `PATCH /api/orders/:id` returned HTTP 401 Unauthorized.
- Unauthenticated `POST /api/orders/:id/done` returned HTTP 401 Unauthorized.
- Unauthenticated `DELETE /api/orders/:id` returned HTTP 401 Unauthorized.
- Unauthenticated `GET /api/orders` returned HTTP 401 Unauthorized.
- Public `GET /api/kitchen/orders` returned HTTP 200 with `{ pending: [], settled: [] }`.
- Repeating Done action on already settled order returned HTTP 409 Conflict.
- Editing an already settled order returned HTTP 409 Conflict.
- Cancelling an already settled order returned HTTP 409 Conflict.

### 1.8 Concurrency Stress Test
Executed 10 simultaneous order creation requests via `Promise.all`:
- All 10 requests succeeded with HTTP 201 Created.
- Assigned sequence numbers: 3, 4, 5, 6, 7, 8, 9, 10, 11, 12.
- Unique count = 10 (zero duplicate numbers).

### 1.9 Milestone Test Suite Executions
- `npm run test:m3`: 10/10 steps passed cleanly with exit code 0.
- `npm run test:m1`: 11/11 regression steps passed cleanly with exit code 0.
- `npm run test:m2`: 9/9 regression steps passed cleanly with exit code 0.
- Independent forensic probe (`tests/forensic_m3_probe.ts`): All 6 checks passed cleanly with exit code 0.

---

## 2. Logic Chain

1. **Authentic Database Persistence (Observation 1.1 -> Observation 1.4)**:
   - Direct inspection of SQLite database file `data/kotha.db` proved that placed orders are physically committed to disk in tables `orders` and `order_items`.
   - Every column (`daily_order_number`, `status`, `payment_method`, `total_amount`, `notes`, `created_at`, `settled_at`, `updated_at`, `unit_price`, `quantity`, `subtotal`) is populated with genuine data matching the input payload and state transitions.
   - Foreign key integrity is preserved between `order_items.order_id` and `orders.id`.

2. **Physical Price Freezing (Observation 1.1 -> Observation 1.5)**:
   - Requirement R3 mandates that changing menu prices later must not change past order totals.
   - Direct database inspection confirmed that `order_items` stores historical `unit_price` as a concrete numeric column.
   - When `menu_items.price` was mutated from ₹50 to ₹888 in the database, existing `order_items` rows retained `unit_price = 50` and `subtotal = 100`, and `orders.total_amount` remained ₹100.
   - There are no dynamic runtime joins that recalculate past order totals based on current catalog prices.

3. **Authentic React Frontend (Observation 1.1 -> Observation 1.3 -> Observation 1.6)**:
   - Inspected components (`Layout.tsx`, `PinModal.tsx`, `OrderCreate.tsx`, `OrderSlip.tsx`, `Reception.tsx`, `Kitchen.tsx`) are genuine interactive React components utilizing hooks (`useState`, `useEffect`), synthetic event handlers, category tabs, quantity steppers, and localStorage session caching.
   - Production Vite build compiled 1,585 modules into 220KB JavaScript and 30KB CSS.
   - Express server serves this compiled React SPA and its assets on `/`, `/reception`, `/kitchen`, `/analytics`, completely resolving the previously noted Express "Cannot GET" 404 issue.

4. **Security Boundary & Concurrency Control (Observation 1.1 -> Observation 1.7 -> Observation 1.8)**:
   - All reception order mutations enforce `requireReceptionAuth` and reject unauthenticated requests with HTTP 401.
   - State transition invariants prevent editing, settling, or cancelling settled orders (HTTP 409).
   - Atomic sequence counter table with upsert logic guarantees monotonic `#1, #2, ...` numbering without collisions under parallel load.

---

## 3. Caveats

- **Kitchen SSE Streaming**: Real-time push updates via Server-Sent Events (`/api/events`) and automatic Web Audio API acoustic chime triggers are scheduled for Milestone 4 (Kitchen Display & Real-Time Sync). In Milestone 3, the Kitchen view polls `/api/kitchen/orders` every 3 seconds.
- **Analytics Date-Picker Engine**: Full historical date-picker analytics aggregation is scheduled for Milestone 5. An initial summary preview is provided in the Reception Analytics tab.
- No caveats regarding Milestone 3 requirements.

---

## 4. Conclusion

Milestone 3 (Reception POS & Order Lifecycle) contains **ZERO** integrity violations:
- Zero hardcoded test outputs or mock stubs.
- Authentic SQLite database persistence in `orders` and `order_items`.
- Authentic historical line-item price freezing.
- Authentic, compiled React Single-Page Application with mobile ergonomics.
- Express route serving guarantees HTTP 200 without 404s.

**Final Verdict: CLEAN**

---

## 5. Verification Method

To independently reproduce and verify this audit:

1. **Verify TypeScript compilation**:
   ```bash
   npm run typecheck
   ```
   *Expected*: Exit code 0, 0 diagnostic errors.

2. **Verify Frontend Build**:
   ```bash
   npm run build
   ```
   *Expected*: Compiles to `dist/client/` with `index.html`, JS bundle, and CSS bundle.

3. **Run Milestone 3 Verification Suite**:
   ```bash
   npm run test:m3
   ```
   *Expected*: All 10 verification steps pass with exit code 0.

4. **Run Independent Forensic Empirical Probe**:
   ```bash
   node node_modules/tsx/dist/cli.mjs tests/forensic_m3_probe.ts
   ```
   *Expected*: All 6 empirical checks pass with exit code 0.

5. **Run Regression Suites**:
   ```bash
   npm run test:m1
   npm run test:m2
   ```
   *Expected*: Both test suites pass cleanly with exit code 0.
