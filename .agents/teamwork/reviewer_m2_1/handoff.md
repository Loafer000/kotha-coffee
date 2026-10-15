# Milestone 2 Reviewer 1 Handoff Report: Menu Management & Catalog Seeding

**Reviewer:** Reviewer 1 (`reviewer_m2_1`)  
**Role:** Reviewer & Adversarial Critic  
**Date:** 2026-10-15  
**Target:** Milestone 2 (`worker_m2` deliverables)  
**Gate Verdict:** **APPROVE**  

---

## 1. Observation

1. **Direct Inspection of `menu.jpeg` vs `src/server/db/seed.ts`**:
   - `menu.jpeg` was visually inspected. It displays 34 menu items across 6 distinct categories.
   - In `src/server/db/seed.ts` (lines 16–62), `AUTHENTIC_MENU_ITEMS` defines exactly 34 items:
     - **Drinks** (9 items):
       - `Tea`: ₹15 (`drinks-tea`)
       - `Cappuccino (Milk Coffee)`: ₹30 (`drinks-cappuccino`)
       - `Cold Coffee`: ₹50 (`drinks-cold-coffee`)
       - `Cold Coffee / with Ice Cream`: ₹70 (`drinks-cold-coffee-ice-cream`)
       - `Chocolate Shake`: ₹99 (`drinks-chocolate-shake`)
       - `Oreo Shake`: ₹99 (`drinks-oreo-shake`)
       - `KitKat Shake`: ₹99 (`drinks-kitkat-shake`)
       - `Strawberry Shake`: ₹99 (`drinks-strawberry-shake`)
       - `Biscoff Shake`: ₹110 (`drinks-biscoff-shake`)
     - **Snacks** (13 items):
       - `Chicken Momo (5 pcs)`: ₹60 (`snacks-chicken-momo-5pcs`)
       - `Chicken Fried Momo (5 pcs)`: ₹69 (`snacks-chicken-fried-momo-5pcs`)
       - `Peri Peri Fried Momo (5 pcs)`: ₹75 (`snacks-peri-peri-fried-momo-5pcs`)
       - `Cheese Corn Momo (5 pcs)`: ₹60 (`snacks-cheese-corn-momo-5pcs`)
       - `Fish Fry`: ₹70 (`snacks-fish-fry`)
       - `Fish Finger (3 pcs)`: ₹89 (`snacks-fish-finger-3pcs`)
       - `Fish Ball (5 pcs)`: ₹89 (`snacks-fish-ball-5pcs`)
       - `Chicken Strips (3 pcs)`: ₹69 (`snacks-chicken-strips-3pcs`)
       - `Chicken Popcorn (10 pc)`: ₹79 (`snacks-chicken-popcorn-10pc`)
       - `Chicken Cheese Finger (3 pcs)`: ₹79 (`snacks-chicken-cheese-finger-3pcs`)
       - `French Fries`: ₹50 (`snacks-french-fries`)
       - `Cheese Loaded Fries`: ₹69 (`snacks-cheese-loaded-fries`)
       - `Chicken Cheese Loaded Fries`: ₹89 (`snacks-chicken-cheese-loaded-fries`)
     - **Pasta** (1 item):
       - `White Sauce Pasta`: ₹70 (`pasta-white-sauce`)
     - **Sandwich** (4 items):
       - `Veg grill sandwich`: ₹59 (`sandwich-veg-grill`)
       - `Corn cheese grill sandwich`: ₹69 (`sandwich-corn-cheese-grill`)
       - `Chicken grill sandwich`: ₹79 (`sandwich-chicken-grill`)
       - `Chicken cheese grill sandwich`: ₹89 (`sandwich-chicken-cheese-grill`)
     - **Mocktails** (4 items):
       - `Green Mint Mojito`: ₹49 (`mocktails-green-mint-mojito`)
       - `Blue Lagoon`: ₹49 (`mocktails-blue-lagoon`)
       - `Masala Cold Drink`: ₹49 (`mocktails-masala-cold-drink`)
       - `Minty Bliss`: ₹49 (`mocktails-minty-bliss`)
     - **Ice Cream** (3 items):
       - `Chocolate`: ₹40 (`icecream-chocolate`)
       - `Vanilla`: ₹40 (`icecream-vanilla`)
       - `Butterscotch`: ₹40 (`icecream-butterscotch`)
   - Every single item name, price, and category matches `menu.jpeg` with 100% precision.

2. **Database State Verification (`data/kotha.db`)**:
   - Querying the active SQLite database directly via `@libsql/client`:
     ```bash
     SELECT COUNT(*) as total, category FROM menu_items GROUP BY category;
     ```
     Returned:
     ```
     Drinks: 9, Ice Cream: 3, Mocktails: 4, Pasta: 1, Sandwich: 4, Snacks: 13
     Total items in DB: 34
     ```
   - All 34 items possess `is_active = 1` and sequential `display_order` (1 to 34).

3. **Idempotency & Re-seed Verification**:
   - In `src/server/db/seed.ts` (lines 81–86):
     ```ts
     const checkResult = await db.execute('SELECT COUNT(*) as cnt FROM menu_items;');
     const currentCount = Number(checkResult.rows[0]?.cnt || 0);
     if (currentCount > 0) {
       return { seeded: false, count: currentCount };
     }
     ```
   - Executed 5 consecutive calls to `seedMenuItems()` on existing database. Every call returned `{ seeded: false, count: 34 }` without duplicating rows or mutating existing data.
   - Executed on a fresh in-memory database (`file::memory:`). Initial call seeded 34 items; subsequent calls returned `{ seeded: false, count: 34 }`.

4. **Historical Price Immutability Invariant**:
   - In `src/server/db/schema.ts` (lines 48–57), `order_items` stores historical snapshot fields:
     `unit_price REAL NOT NULL, quantity INTEGER NOT NULL, subtotal REAL NOT NULL`.
   - In `src/server/routes/menu.ts` (lines 155–252), `PUT /api/menu/:id` only modifies `menu_items`. It never updates or touches `order_items`.
   - Verified via Step 9 of `tests/m2_verification.test.ts`: Creating an order with Cold Coffee @ ₹50, updating catalog price to ₹80, and then soft-deleting the item confirmed that `order_items.unit_price` remained 50 and `order_items.subtotal` remained 100.

5. **Security & Route Guarding**:
   - `GET /api/menu`: Public (unauthenticated). Returns 200 with active items (`is_active = 1`).
   - `POST /api/menu`: Protected with `requireReceptionAuth`. Unauthenticated request returns HTTP 401 `{ error: "Unauthorized" }`.
   - `PUT /api/menu/:id`: Protected with `requireReceptionAuth`. Unauthenticated request returns HTTP 401.
   - `DELETE /api/menu/:id`: Protected with `requireReceptionAuth`. Unauthenticated request returns HTTP 401.

6. **Automated Verification Command Results**:
   - `npm run typecheck` (`tsc --noEmit`): Exit code 0, 0 errors.
   - `npm run test:m2` (`tests/m2_verification.test.ts`): Exit code 0, 9/9 verification steps passed.
   - `npm run test:m1` (`tests/m1_verification.test.ts`): Exit code 0, 11/11 verification steps passed (zero regressions on Milestone 1).
   - `node node_modules/tsx/dist/cli.mjs tests/challenger_m1_auth_edge.test.ts`: Exit code 0, 66/66 adversarial security tests passed.

7. **Integrity Violations Audit**:
   - Hardcoded test outputs in source code: **None found**. All endpoints execute dynamic SQL against `@libsql/client`.
   - Facade or dummy implementations: **None found**. Full CRUD operations with genuine input validation, database persistence, and soft delete logic are implemented in `src/server/routes/menu.ts`.
   - Bypassing or delegating core work: **None found**. All logic is written in-tree.
   - Self-certifying or fabricated tests: **None found**. Test suites boot live servers and assert directly against database queries and HTTP response payloads.

---

## 2. Logic Chain

1. **Menu Accuracy (Observation 1.1 -> Observation 1.2)**:
   - The user specification (R3, PROJECT.md) requires seeding 34 menu items matching `menu.jpeg`.
   - Visual inspection of `menu.jpeg` and code inspection of `src/server/db/seed.ts` confirm exact 1-to-1 correspondence across all 34 items and 6 categories (Drinks: 9, Snacks: 13, Pasta: 1, Sandwich: 4, Mocktails: 4, Ice Cream: 3). Direct SQL queries on `data/kotha.db` confirm these 34 records are seeded with `is_active = 1`.

2. **Idempotency (Observation 1.3)**:
   - `seedMenuItems` checks if the `menu_items` table contains any records before executing inserts.
   - Empirical testing with 5 back-to-back invocations verified that subsequent calls exit immediately with `{ seeded: false, count: 34 }`.
   - Furthermore, the `menu_items` table has `id TEXT PRIMARY KEY`, providing a second hardware-enforced barrier against record duplication.

3. **Historical Price Protection (Observation 1.4)**:
   - Requirement R3 explicitly states: *"Changing a price later must not change the totals of orders already placed."*
   - By structuring `order_items` with independent `unit_price` and `subtotal` columns (rather than dynamically joining against `menu_items.price`), past orders remain immutable snapshots even when catalog prices fluctuate or items are soft-deleted.

4. **Security & Route Guarding (Observation 1.5 -> Observation 1.6)**:
   - Mutating menu operations (`POST`, `PUT`, `DELETE`) require `requireReceptionAuth`.
   - Requests lacking a valid Bearer token or with invalid tokens are rejected with HTTP 401, preserving the security boundary established in Milestone 1.

5. **Absence of Integrity Violations (Observation 1.7)**:
   - All tests execute actual network I/O and query SQLite records. No dummy responses, mocks, or hardcoded return stubs were detected.

---

## 3. Caveats

- **Soft Delete Visibility**: `DELETE /api/menu/:id` performs a soft-delete (`is_active = 0`). The item remains in the SQLite database to maintain foreign key integrity for historical orders. `GET /api/menu` filters these out by default, but passing `?include_inactive=true` allows reception staff to inspect and restore archived items.
- **Concurrent Seeding on Fresh DB**: If multiple processes trigger `seedMenuItems()` concurrently on a completely empty table, SQLite's primary key constraint will throw a `UNIQUE constraint failed: menu_items.id` in the losing process while the winning process successfully seeds all 34 items. In standard execution, `initSchema()` is called serially at server boot, so this does not affect normal operations.

---

## 4. Conclusion

**Verdict: APPROVE**

Milestone 2 (Menu Management & Catalog Seeding) satisfies all requirements:
1. All 34 authentic items across 6 categories from `menu.jpeg` are accurately codified and seeded into SQLite.
2. `seedMenuItems()` is fully idempotent and safe against repeated executions.
3. Menu CRUD API endpoints are properly guarded by reception PIN authentication and validate input rigorously.
4. Historical line-item price immutability is strictly enforced.
5. All verification commands (`npm run typecheck`, `npm run test:m2`, `npm run test:m1`) pass with zero errors and zero regressions.
6. Zero integrity violations detected.

---

## 5. Verification Method

To independently verify this review:

1. **Type Check**:
   ```powershell
   npm run typecheck
   ```
   *Expected*: Exit code 0, no diagnostic errors.

2. **Run Milestone 2 Verification Suite**:
   ```powershell
   npm run test:m2
   ```
   *Expected*: All 9 steps pass cleanly with exit code 0.

3. **Run Milestone 1 Regression Suite**:
   ```powershell
   npm run test:m1
   ```
   *Expected*: All 11 steps pass cleanly with exit code 0.

4. **Verify Catalog in Active Database**:
   ```powershell
   node node_modules/tsx/dist/cli.mjs -e "import('./src/server/db/client.js').then(async m => { const db = m.getDbClient(); const r = await db.execute('SELECT COUNT(*) as total, category FROM menu_items GROUP BY category'); console.table(r.rows); })"
   ```
   *Expected*: Exactly 34 items across Drinks (9), Snacks (13), Pasta (1), Sandwich (4), Mocktails (4), Ice Cream (3).
