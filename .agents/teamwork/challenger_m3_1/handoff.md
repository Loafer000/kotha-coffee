# Challenger 1 Report: Milestone 3 Order Lifecycle & State Machine

**Agent:** Challenger 1 (`challenger_m3_1`)  
**Date:** 2026-10-15  
**Working Directory:** `d:\kotha&coffee\.agents\teamwork\challenger_m3_1`  
**Verdict:** **APPROVE**  

---

## 1. Observation

1. **Codebase Inspection**:
   - `src/server/routes/orders.ts`:
     - Line 461-466: In `handleEditOrder`, returns HTTP 409 Conflict if `existingOrder.status === 'SETTLED'` or `existingOrder.status === 'CANCELLED'`.
     - Line 574-579: In `handleSettleOrder`, returns HTTP 409 Conflict if `order.status === 'SETTLED'` or `order.status === 'CANCELLED'`.
     - Line 633-636: In `DELETE /api/orders/:id`, returns HTTP 409 Conflict if `order.status === 'SETTLED'`.
     - Line 217-249: `getNextDailyOrderNumber` utilizes `INSERT INTO daily_counters (date_key, last_number) VALUES (?, 1) ON CONFLICT(date_key) DO UPDATE SET last_number = daily_counters.last_number + 1 RETURNING last_number;` to achieve atomic sequential allocation.
     - Line 317-346: Freezes `item_name`, `unit_price`, `quantity`, and `subtotal` in the `order_items` table at order placement.
     - Line 488-522: When editing an order, deletes previous line items and re-inserts updated frozen line items, recalculating `total_amount = sum(subtotals)` with 2-decimal precision.
   - `src/server/routes/kitchen.ts`:
     - Line 59-81: `GET /api/kitchen/orders` is public (no `requireReceptionAuth`), returns `{ pending: [...], settled: [...] }`, and filters out cancelled orders.
   - `src/server/middleware/timezone.ts`:
     - Computes date keys in `Asia/Kolkata` (UTC+05:30) and provides mock clock hooks for test environments.

2. **Empirical Test Suite Execution (`tests/challenger_m3_1_order_lifecycle.test.ts`)**:
   - Authored and executed an 8-section adversarial challenge test suite:
     ```
     node node_modules/tsx/dist/cli.mjs tests/challenger_m3_1_order_lifecycle.test.ts
     ```
   - Verbatim console output:
     ```
     ========================================================================
     === CHALLENGER 1: Empirical Adversarial Order Lifecycle & State Machine ===
     ========================================================================

     [Kotha & Coffee] Server running on http://localhost:3108
     [Setup] Server running on port 3108

     --- Section 1: Testing State Machine Transitions & Invariants ---
       [1.1] Created order O1 in PENDING state.
       [1.2] Valid transition: O1 moved PENDING -> SETTLED.
       [1.3] Invalid transition rejected: PATCH settled order returned HTTP 409.
       [1.4] Invalid transition rejected: PUT settled order returned HTTP 409.
       [1.5] Invalid transition rejected: Re-settle returned HTTP 409.
       [1.6] Invalid transition rejected: Cancel settled order returned HTTP 409.
       [1.8] Valid transition: O2 moved PENDING -> CANCELLED.
       [1.9] Invalid transition rejected: PATCH cancelled order returned HTTP 409.
       [1.10] Invalid transition rejected: PUT cancelled order returned HTTP 409.
       [1.11] Invalid transition rejected: Settle cancelled order returned HTTP 409.
       [1.12] Non-existent order operations correctly returned HTTP 404.

     --- Section 2: Testing Order Edit Math & Validation Stress ---
       [2.1] Order item edit math correctly recalculated total: ₹90 -> ₹160.
       [2.2] Fractional pricing math accurately rounded: ₹104.16.
       [2.3] Partial edit (paymentMethod only) preserved items and total.
       [2.4] Partial edit (notes only) preserved items and total.
       [2.5] Input validation and tamper protections on edit verified.

     --- Section 3: Testing Price Snapshot Invariance ---
       [3.1] Target menu item: "Tea" @ ₹15
       [3.2] Menu item updated in catalog: ₹15 -> ₹65
       [3.3] Price snapshot invariant verified: Existing order retained original price ₹15 (total ₹45).
       [3.4] New order placed with updated item picked up new price ₹65.

     --- Section 4: Testing Rapid Sequential & Burst Concurrency ---
       [4.1] 10 sequential orders generated numbers: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
       [4.1] Rapid sequential test passed: 10 strictly consecutive order numbers with no gaps or duplicates.
       [4.2] Dispatching 25 concurrent order requests via Promise.all...
       [4.2] 25 concurrent orders completed. Order numbers count: 25
       [4.2] High concurrency stress test PASSED: 25 concurrent orders received consecutive numbers [17..41] with 0 duplicates and 0 gaps.

     --- Section 5: Testing Day Rollover & Asia/Kolkata Midnight Boundary ---
       [5.1] Created 3 orders on Day A (2026-11-01): #1, #2, #3.
       [5.2] Reset verified: Day B (2026-11-02) orders successfully reset to #1, #2, #3.
       [5.3] Cross-day query isolation verified: Both days retain independent #1, #2, #3 orders without collision.
       [5.4] Midnight boundary (23:59:59 IST -> 00:00:01 IST) correctly evaluated and triggered #1 reset.

     --- Section 6: Testing Kitchen Public Read-Only Endpoint ---
       [6.1] Kitchen public read-only endpoint verified: pending and settled queues separated, cancelled omitted.

     --- Section 7: Testing Race Conditions on State Transitions ---
       [7.1] Race between duplicate settles resolved safely: one 200, one 409.
       [7.2] Race between settle and cancel resolved deterministically: status = SETTLED.
       [7.3] Dispatching 50 concurrent order requests via Promise.all...
       [7.3] 50 simultaneous orders succeeded with 0 duplicates and 0 failures.

     --- Section 8: Testing Multi-Day Sequence Endurance (5 days) ---
       [8.1] 5 consecutive days verified: every single day reset order sequence to #1, #2, #3, #4.

     ========================================================================
     ✅ ALL ADVERSARIAL CHALLENGE TESTS PASSED CLEANLY (0 FAILURES)
     ========================================================================
     ```

3. **Regression & Build Checks**:
   - `npm run typecheck`: Exit code 0, 0 errors.
   - `npm run test:m1`: Exit code 0, all 11 steps passed.
   - `npm run test:m2`: Exit code 0, all 9 steps passed.
   - `npm run test:m3`: Exit code 0, all 10 steps passed.
   - `npm run build`: Exit code 0, Vite compiled client SPA cleanly (`dist/client/index.html`, CSS, JS).

---

## 2. Logic Chain

1. **State Machine Invariant Enforcement (Observation 1.1, 1.2 -> 2.1)**:
   - Specification mandates: Settled and Cancelled orders must reject subsequent edits with HTTP 409; Cancelled orders cannot be settled (HTTP 409); Settled orders cannot be cancelled (HTTP 409); Duplicate settlements must reject with HTTP 409.
   - In Section 1 and Section 7, all prohibited transitions were actively executed against the server. Every invalid transition was rejected with HTTP 409 Conflict.
   - Concurrent race conditions between competing settle requests and settle-vs-cancel requests resulted in exactly one successful mutation (HTTP 200) and one rejected attempt (HTTP 409), leaving the order in a valid terminal state without database corruption.

2. **Order Edit Math & Frozen Snapshots (Observation 1.1, 1.2 -> 2.2)**:
   - When an order's line items are modified, the backend replaces line items in `order_items` and recalculates the grand total.
   - Tested adding items, updating quantities, removing items, and fractional cent arithmetic (₹104.16).
   - Partial updates (e.g. changing only payment method or only notes) preserve previous line items and total amounts.
   - Malformed payloads (empty items `[]`, zero quantity, negative quantity, non-integer quantity, invalid payment methods) are rejected with HTTP 400 Bad Request.

3. **Price Snapshot Invariance (Observation 1.1, 1.2 -> 2.3)**:
   - Line items freeze `unit_price` at the moment of order placement.
   - Modifying a catalog item's price in `menu_items` (e.g. Tea from ₹15 to ₹65) or deactivating an item does not affect existing orders.
   - Existing orders queried before and after catalog updates retained identical unit prices (₹15), subtotals (₹45), and order totals (₹45).
   - New orders placed after the catalog change correctly adopt the updated price (₹65).

4. **Atomic Concurrency & Sequence Monotonicity (Observation 1.1, 1.2 -> 2.4)**:
   - Tested rapid sequential creation (10 orders): generated strictly contiguous sequence numbers with zero gaps or duplicates.
   - Tested high concurrency bursts (25 and 50 simultaneous orders via `Promise.all`): SQLite LibSQL upsert with `RETURNING last_number` generated contiguous, unique numbers for all concurrent requests without locking errors or collision.

5. **Midnight Rollover in Asia/Kolkata (Observation 1.1, 1.2 -> 2.5)**:
   - In simulated time at `23:59:59 IST` (`2026-11-02T23:59:59+05:30`), orders stay on Day B.
   - At `00:00:01 IST` (`2026-11-03T00:00:01+05:30`), orders immediately advance to Day C and reset to `#1`.
   - Multi-day queries (`?date=2026-11-01` vs `?date=2026-11-02`) return isolated sets, and both days can have order `#1` without primary key or unique constraint conflict due to `CONSTRAINT uq_daily_order UNIQUE(date_key, daily_order_number)`.
   - 5-day continuous endurance test confirmed that every single day begins at order `#1`.

6. **Kitchen Read-Only Surface (Observation 1.1, 1.2 -> 2.6)**:
   - `/api/kitchen/orders` is accessible without authentication, cleanly separates pending and settled queues, and strictly excludes cancelled orders.

---

## 3. Caveats

- **Kitchen Web Audio API and Real-Time SSE**: Real-Time Server-Sent Events (`/api/events`) and automatic audio alerts are slated for Milestone 4 (Kitchen Display & Real-Time Sync). In Milestone 3, polling (`/api/kitchen/orders`) provides read-only synchronization.
- **Multi-Day Historical Date-Picker Analytics**: Detailed analytics date-picker aggregation is scheduled for Milestone 5. M3 provides the daily operational queues (Pending, Settled, Kitchen).

---

## 4. Conclusion

**Verdict: APPROVE**

Milestone 3's order lifecycle state machine, atomic sequence generation, price snapshot invariance, and concurrency safety have been adversarially challenged and empirically verified. All invalid state transitions return HTTP 409 Conflict, all input validation boundaries return HTTP 400 Bad Request, line-item price freezing survives catalog price modifications, and daily order numbering resets cleanly to `#1` on midnight rollover in `Asia/Kolkata` with zero duplicate numbers under concurrent bursts.

Milestone 3 is ready to advance.

---

## 5. Verification Method

To independently reproduce and verify this empirical challenge:

1. **Run the Milestone 3 Adversarial Challenge Suite**:
   ```bash
   node node_modules/tsx/dist/cli.mjs tests/challenger_m3_1_order_lifecycle.test.ts
   ```
   *Expected result*: All 8 sections pass cleanly with exit code 0.

2. **Run TypeScript Check**:
   ```bash
   npm run typecheck
   ```
   *Expected result*: Exit code 0, 0 diagnostic errors.

3. **Run Regression Suites**:
   ```bash
   npm run test:m1
   npm run test:m2
   npm run test:m3
   ```
   *Expected result*: All verification suites pass cleanly with exit code 0.

4. **Verify Client Build**:
   ```bash
   npm run build
   ```
   *Expected result*: Vite builds `dist/client/index.html` without errors.
