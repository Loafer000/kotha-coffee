# Original User Request

## 2026-10-15T02:24:03Z

Build a simple, phone-friendly web-based POS / order-ticket system for a small cafe ("Kotha & Coffee"). Reception staff create numbered orders (#1, #2, …) that show up live on the kitchen's phone. When reception marks an order done, it moves from Pending to Settled on both screens. The reception side also has menu management and daily sales analytics. The system is for real day-to-day use in the cafe, so it must be reliable and simple enough to use one-handed on a phone during a rush.

Working directory: d:\kotha&coffee
Integrity mode: development

## Requirements

### R1. Two-role entry screen
Opening the website shows two choices: **Add Order** (reception) and **See Orders** (kitchen).

### R2. Reception — orders
- Create an order by picking menu items and quantities. The total is calculated automatically. A payment method is recorded: Cash, UPI or Card.
- Each new order gets an order number that starts at **#1 every day** (cafe local time, Asia/Kolkata) and goes up by one for each order that day. Reception writes this number on a paper slip for the customer, so it must be large and clearly shown after the order is created.
- Reception can **edit** a pending order (items, quantities, payment method) and **cancel/delete** an order. Cancelled orders never count in analytics.
- Reception has three sections: **Pending Orders**, **Settled Orders** and **Analytics**.
- Only reception can click **Done**, which moves an order from Pending to Settled.

### R3. Reception — menu management
Reception can add, edit (name, price) and remove menu items. Changing a price later must not change the totals of orders already placed.

### R4. Kitchen — See Orders
- Shows only **Pending Orders** and **Settled Orders**, with each order's number and its items/quantities. The kitchen view is read-only.
- New orders, edits, cancellations and settlements from reception show up on the kitchen screen within a few seconds, without a manual refresh.
- The kitchen phone plays a sound/alert when a new order arrives.

### R5. Analytics (reception only)
Date-wise view: pick a day (and browse previous days) to see each item's quantity sold and amount, the day's grand total, and a breakdown by payment method. Only settled, non-cancelled orders count.

### R6. Cloud hosting & shared persistent storage
- Data is stored in a free-tier cloud service. Reception, kitchen and the owner (from home) all see the same data from anywhere over the internet, and nothing is lost on restarts or redeploys.
- The team cannot create cloud accounts for the owner. Deliver the app ready to deploy, with a step-by-step beginner-friendly deployment guide (accounts to create, keys to paste, how to publish, the URL to open on each phone). The app must also run fully locally for development and testing.
- Order numbering must stay correct when two devices act at the same time (no duplicate numbers on the same day).

### R7. Phone-first UI
Designed mainly for phones: large tap targets, readable order numbers, and no horizontal scrolling at a 375px-wide viewport.

### R8. Simple PIN for reception
The reception (Add Order) side, including menu management and analytics, is protected by a simple numeric PIN that the owner can set or change. Phones should stay unlocked for a reasonable period, so staff don't have to re-enter the PIN for every order. The kitchen view needs no PIN, but it stays read-only. The PIN must be enforced on the server/data side too, not just hidden in the UI: someone without the PIN must not be able to create, edit, cancel or settle orders, or change the menu.

## Acceptance Criteria

### Automated end-to-end tests (must be runnable with one documented command and all pass)
- [ ] Two separate browser sessions (reception and kitchen): an order created in reception shows up in kitchen Pending within 5 seconds, with no reload.
- [ ] The first three orders of a day are numbered #1, #2, #3. When the day changes (simulated/injected clock), the next order is #1. Previous days' orders are kept.
- [ ] Two orders created at the same moment from two sessions get different numbers.
- [ ] Clicking Done in reception moves the order to Settled in both sessions within 5 seconds. The kitchen UI has no Done/Edit/Cancel controls.
- [ ] Editing a pending order (items/qty/payment) shows up in kitchen within 5 seconds, and the total is recalculated correctly.
- [ ] A cancelled order disappears from Pending in both views and is excluded from analytics.
- [ ] Analytics for a seeded dataset spanning ≥3 days with ≥5 items and mixed payment methods match independently computed expected per-item quantities, amounts, daily totals and per-payment-method totals exactly.
- [ ] Changing a menu item's price does not change totals of existing orders or past analytics.
- [ ] Data persists after the server/app process is fully restarted.
- [ ] A kitchen new-order alert is triggered (sound/notification event observable in the test) when an order is created.
- [ ] At a 375px viewport, the landing, reception (all 3 sections) and kitchen pages have no horizontal overflow.
- [ ] Reception pages cannot be used without the correct PIN, and a wrong PIN is rejected. Direct data/API write attempts (create/edit/cancel/settle order, menu change) without a valid PIN session are rejected. The kitchen view loads without a PIN.

### Deliverables
- [ ] A README with local run instructions, the test command, and a beginner-friendly cloud deployment guide that relies only on free tiers.
- [ ] Screenshots (phone viewport) of: landing, create order, order-number confirmation, pending, settled, analytics and kitchen view.

## 2026-10-15T03:31:08Z

Parent-agent spot-check: the 7 files in d:\kotha&coffee\screenshots\ (generated ~08:57 IST) are NOT valid deliverables. Each is ~3KB and shows an Express error page, e.g. 02_create_order.png shows "Cannot GET /reception". The UI routes were not built or served when the screenshots were taken. Please make sure the screenshot deliverable and the "Deliverables Generated" status are not counted as done. Regenerate the screenshots only after the reception/kitchen/analytics UI is built and served, and have the final audit actually look at the image contents. Also make sure E2E tests are not marked passing while the pages return 404.

