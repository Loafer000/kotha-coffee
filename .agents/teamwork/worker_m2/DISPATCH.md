## 2026-10-15T03:17:09Z
You are the Implementation Worker for Milestone 2 (Menu Management & Catalog Seeding) of the Kotha & Coffee POS project.
Your working directory is: d:\kotha&coffee\.agents\teamwork\worker_m2

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

You MUST read these files before doing anything:
1. d:\kotha&coffee\.agents\teamwork\ORIGINAL_REQUEST.md
2. d:\kotha&coffee\PROJECT.md
3. d:\kotha&coffee\.agents\teamwork\spec_miner_survey\handoff.md
4. d:\kotha&coffee\.agents\teamwork\worker_m1_gen2\handoff.md

Your Scope:
1. Create `src/server/db/seed.ts`:
   - Contains all 34 authentic items from `menu.jpeg` across 6 categories (Drinks, Snacks, Pasta, Sandwich, Mocktails, Ice Cream) with exact prices.
   - Seed function `seedMenuItems(client)` runs automatically on `initSchema()` if `menu_items` table is empty.
2. Create `src/server/routes/menu.ts`:
   - `GET /api/menu`: Public. Returns all active menu items (`is_active = 1`) sorted by category and display order.
   - `POST /api/menu`: Protected by `requireReceptionAuth`. Adds new item. Validates non-empty name and price > 0.
   - `PUT /api/menu/:id`: Protected by `requireReceptionAuth`. Edits existing item (name, category, price, is_active).
   - `DELETE /api/menu/:id`: Protected by `requireReceptionAuth`. Soft-deletes (`is_active = 0`) to preserve historical integrity.
3. Wire `/api/menu` route in `src/server/index.ts`.
4. Ensure historical price immutability:
   - Modifying a menu item's price must never change the `unit_price` or `subtotal` of existing order line items in `order_items`.
5. Create frontend menu client components:
   - Provide menu service in `src/client/services/api.ts` for fetching and managing menu items.
   - Create Menu Management UI component/page (`src/client/pages/MenuAdmin.tsx` or modal) for adding, editing, and archiving items with 375px phone-friendly layout.
6. Create automated verification test `tests/m2_verification.test.ts` to test:
   - Seed data verification (34 items across 6 categories).
   - Public GET /api/menu returns active items.
   - Protected routes (POST, PUT, DELETE) reject unauthenticated requests with 401.
   - Adding, editing, and soft-deleting items works with valid PIN session.
   - Price immutability invariant test (changing menu price does not alter existing order items).
7. Execute verification commands (`npm run typecheck`, run test suite).

Write Ownership:
- `src/server/db/seed.ts`
- `src/server/routes/menu.ts`
- `src/server/index.ts` (wiring menu router)
- `src/client/services/api.ts`, `src/client/pages/MenuAdmin.tsx`
- `tests/m2_verification.test.ts`
(Do NOT touch tests/e2e/ or playwright.config.ts).

Deliverables:
- Maintain `d:\kotha&coffee\.agents\teamwork\worker_m2\progress.md` with timestamps.
- Write your complete handoff report to `d:\kotha&coffee\.agents\teamwork\worker_m2\handoff.md`.
- Send a completion message back to me (the orchestrator).
