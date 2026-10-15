## 2026-10-15T05:59:37Z

You are the Implementation Worker for Milestone 5 (Reception Analytics Engine & Dashboard) of the Kotha & Coffee POS project.
Your working directory is: d:\kotha&coffee\.agents\teamwork\worker_m5

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

You MUST read these files before doing anything:
1. d:\kotha&coffee\.agents\teamwork\ORIGINAL_REQUEST.md
2. d:\kotha&coffee\PROJECT.md
3. d:\kotha&coffee\.agents\teamwork\spec_miner_survey\handoff.md
4. d:\kotha&coffee\.agents\teamwork\worker_m4\handoff.md

Your Scope:
1. Backend Analytics Route (`src/server/routes/analytics.ts`):
   - Endpoint: `GET /api/analytics?date=YYYY-MM-DD` (or `dateKey`).
   - Guarded by `requireReceptionAuth` (HTTP 401 if missing or invalid session token).
   - Query parameter `date` defaults to current date in `Asia/Kolkata` (`YYYY-MM-DD`) if omitted.
   - Database queries against `orders` and `order_items`:
     - Strictly filter `status = 'SETTLED'` and `date_key = ?`.
     - Strictly exclude `status = 'PENDING'` and `status = 'CANCELLED'`.
     - Calculate:
       - `grandTotal`: sum of `total_amount` for settled orders (0 if none).
       - `orderCount`: count of settled orders (0 if none).
       - `paymentBreakdown`: totals and counts for Cash, UPI, Card. Ensure all 3 keys are always present with `{ total, count }`.
       - `itemSales`: join `orders` with `order_items`, group by `item_name`, calculate `totalQuantity` and `totalRevenue`, sorted by `totalRevenue DESC`.
     - Mathematical Invariant:
       `grandTotal === Cash.total + UPI.total + Card.total === sum(itemSales.totalRevenue)`
     - When no settled orders exist for the date, return clean zeros (`grandTotal: 0`, `orderCount: 0`, empty `itemSales: []`, zero payment splits).
2. Wire Analytics Router (`src/server/index.ts`):
   - Mount `analyticsRouter` on `/api/analytics`.
3. Client Service (`src/client/services/api.ts`):
   - Add typed `getDailyAnalytics(date: string, token: string)` API helper.
4. Frontend Analytics Dashboard (`src/client/pages/Analytics.tsx`):
   - Date picker with calendar input (`<input type="date">`) and quick navigation buttons ("Today", "Yesterday", "Previous", "Next").
   - Summary KPI cards:
     - Grand Total Revenue (`₹{grandTotal}`) with prominent styling.
     - Settled Orders count.
     - Average Order Value (`₹{avg}`).
   - Payment method breakdown cards: Cash, UPI, Card with amounts, counts, and percentage distribution bars.
   - Itemized sales list/table: item name, category pill, quantity sold (`Nx`), revenue (`₹X`), percentage of sales.
   - Empty state when no settled orders exist for the selected date.
   - Strict 375px mobile viewport ergonomics: `overflow-x: hidden`, touch targets >= 44px.
5. Wire into Reception Views (`src/client/pages/Reception.tsx`):
   - In Tab 5 (`activeTab === 'analytics'`), render `<Analytics token={token} />` replacing the inline placeholder.
6. Automated Verification Test Suite (`tests/m5_verification.test.ts`):
   - Add `"test:m5": "node node_modules/tsx/dist/cli.mjs tests/m5_verification.test.ts"` to `package.json`.
   - Test suite steps:
     1. `GET /api/analytics` without token returns HTTP 401.
     2. Authenticated `GET /api/analytics` for date with zero orders returns clean zeros.
     3. Multi-order seed test:
        - Settle Order 1: ₹500 via Cash.
        - Settle Order 2: ₹350 via UPI.
        - Settle Order 3: ₹150 via Card.
        - Create Order 4: PENDING ₹400 via UPI (assert excluded from analytics).
        - Create & Cancel Order 5: CANCELLED ₹600 via Cash (assert excluded from analytics).
     4. Mathematical equality assertions:
        - `grandTotal === 1000` (500 + 350 + 150).
        - `orderCount === 3`.
        - `paymentBreakdown.Cash.total === 500`.
        - `paymentBreakdown.UPI.total === 350`.
        - `paymentBreakdown.Card.total === 150`.
        - `grandTotal === sum(itemSales.totalRevenue)`.
     5. Date isolation: orders on Date A do not appear in Date B.
     6. Playwright browser test of Analytics UI:
        - Grand total, payment split cards, and itemized list render correctly.
        - Switching date picker to empty date displays empty state.
        - 375px mobile viewport check (`scrollWidth <= clientWidth`, touch targets >= 44px).
7. Execute verification:
   - `npm run build`
   - `npm run typecheck`
   - `npm run test:m5`
   - `npm run test:m4`, `npm run test:m3`
   - Note for Windows command execution: specify BypassSandbox: true if permission dialogs trigger.
