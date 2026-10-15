# Comprehensive Specification & Requirements Inventory: Kotha & Coffee POS

**File**: `.agents/teamwork/spec_miner_survey/handoff.md`  
**Date**: 2026-10-15  
**Author**: Requirements Spec Miner (`spec_miner_survey`)  
**Parent Agent**: `bf3a0778-8738-4eb0-bb3e-d627e579315a`  
**Integrity Mode**: development  

---

## 1. Observation

### 1.1 Direct Observations from `ORIGINAL_REQUEST.md`
From `d:\kotha&coffee\.agents\teamwork\ORIGINAL_REQUEST.md`:
- **Line 5**: *"Build a simple, phone-friendly web-based POS / order-ticket system for a small cafe ('Kotha & Coffee'). Reception staff create numbered orders (#1, #2, …) that show up live on the kitchen's phone. When reception marks an order done, it moves from Pending to Settled on both screens. The reception side also has menu management and daily sales analytics. The system is for real day-to-day use in the cafe, so it must be reliable and simple enough to use one-handed on a phone during a rush."*
- **Line 13 (R1)**: *"Opening the website shows two choices: **Add Order** (reception) and **See Orders** (kitchen)."*
- **Line 16-20 (R2)**:
  - *"Create an order by picking menu items and quantities. The total is calculated automatically. A payment method is recorded: Cash, UPI or Card."*
  - *"Each new order gets an order number that starts at **#1 every day** (cafe local time, Asia/Kolkata) and goes up by one for each order that day. Reception writes this number on a paper slip for the customer, so it must be large and clearly shown after the order is created."*
  - *"Reception can **edit** a pending order (items, quantities, payment method) and **cancel/delete** an order. Cancelled orders never count in analytics."*
  - *"Reception has three sections: **Pending Orders**, **Settled Orders** and **Analytics**."*
  - *"Only reception can click **Done**, which moves an order from Pending to Settled."*
- **Line 23 (R3)**: *"Reception can add, edit (name, price) and remove menu items. Changing a price later must not change the totals of orders already placed."*
- **Line 26-28 (R4)**:
  - *"Shows only **Pending Orders** and **Settled Orders**, with each order's number and its items/quantities. The kitchen view is read-only."*
  - *"New orders, edits, cancellations and settlements from reception show up on the kitchen screen within a few seconds, without a manual refresh."*
  - *"The kitchen phone plays a sound/alert when a new order arrives."*
- **Line 31 (R5)**: *"Date-wise view: pick a day (and browse previous days) to see each item's quantity sold and amount, the day's grand total, and a breakdown by payment method. Only settled, non-cancelled orders count."*
- **Line 34-36 (R6)**:
  - *"Data is stored in a free-tier cloud service. Reception, kitchen and the owner (from home) all see the same data from anywhere over the internet, and nothing is lost on restarts or redeploys."*
  - *"The team cannot create cloud accounts for the owner. Deliver the app ready to deploy, with a step-by-step beginner-friendly deployment guide (accounts to create, keys to paste, how to publish, the URL to open on each phone). The app must also run fully locally for development and testing."*
  - *"Order numbering must stay correct when two devices act at the same time (no duplicate numbers on the same day)."*
- **Line 39 (R7)**: *"Designed mainly for phones: large tap targets, readable order numbers, and no horizontal scrolling at a 375px-wide viewport."*
- **Line 42 (R8)**: *"The reception (Add Order) side, including menu management and analytics, is protected by a simple numeric PIN that the owner can set or change. Phones should stay unlocked for a reasonable period, so staff don't have to re-enter the PIN for every order. The kitchen view needs no PIN, but it stays read-only. The PIN must be enforced on the server/data side too, not just hidden in the UI: someone without the PIN must not be able to create, edit, cancel or settle orders, or change the menu."*
- **Lines 47-58 (Acceptance Criteria)**:
  - Multi-session live sync within 5 seconds without reload (reception -> kitchen).
  - Sequence resets to #1 at day boundary (Asia/Kolkata), previous days retained.
  - Concurrency: two simultaneous creations receive different numbers.
  - Done action moves order to Settled in both sessions within 5s; kitchen has no Done/Edit/Cancel.
  - Edit pending order updates kitchen within 5s and recalculates total.
  - Cancelled order disappears from Pending in both views and excluded from analytics.
  - Analytics for seeded dataset ($\ge 3$ days, $\ge 5$ items, mixed payments) match exact calculations.
  - Menu price changes do not mutate past order totals or past analytics.
  - Data persists across server restarts.
  - Kitchen audio alert triggered on order creation.
  - Viewport 375px zero horizontal overflow across all screens.
  - PIN protection on reception routes and server-side API writes; wrong PIN rejected; kitchen accessible without PIN.

### 1.2 Direct Observations from Workspace Assets
Inspection of image assets in `d:\kotha&coffee`:

1. **`logo.jpeg`** (Size: 144,282 bytes):
   - Brand typography: Bengali script "কথা" ("Kotha") prominently styled in dark roasted coffee brown, followed by "& Coffee" in flowing script.
   - Tagline: "— এক কাপ কফি, না বলা কিছু কথা —" ("A cup of coffee, some unspoken words") set between delicate floral/heart ornaments.
   - Graphic elements: Steaming coffee cup with heart latte art, coffee beans, tea leaves, circular cafe badge seal.
   - Visual color palette:
     - Dark Espresso: `#3B2219` / `#4A2E1B`
     - Coffee Bean Accent: `#6D4C41`
     - Warm Milk / Cream / Parchment background: `#FFF8F0` / `#FDFBF7` / `#F7EFE5`
     - Fresh Leaf Green accent: `#4F6D43`
     - Heart / Terracotta accent: `#8D493A`

2. **`menu.jpeg`** (Size: 235,135 bytes):
   - Authenticated real-world cafe menu containing **34 items** in **6 categories** with exact Indian Rupee (₹) prices:
     - **DRINKS**:
       1. Tea — ₹15
       2. Cappuccino (Milk Coffee) — ₹30
       3. Cold Coffee — ₹50
       4. Cold Coffee / with Ice Cream — ₹70
       5. Chocolate Shake — ₹99
       6. Oreo Shake — ₹99
       7. KitKat Shake — ₹99
       8. Strawberry Shake — ₹99
       9. Biscoff Shake — ₹110
     - **SNACKS**:
       10. Chicken Momo (5 pcs) — ₹60
       11. Chicken Fried Momo (5 pcs) — ₹69
       12. Peri Peri Fried Momo (5 pcs) — ₹75
       13. Cheese Corn Momo (5 pcs) — ₹60
       14. Fish Fry — ₹70
       15. Fish Finger (3 pcs) — ₹89
       16. Fish Ball (5 pcs) — ₹89
       17. Chicken Strips (3 pcs) — ₹69
       18. Chicken Popcorn (10 pc) — ₹79
       19. Chicken Cheese Finger (3 pcs) — ₹79
       20. French Fries — ₹50
       21. Cheese Loaded Fries — ₹69
       22. Chicken Cheese Loaded Fries — ₹89
     - **PASTA**:
       23. White Sauce Pasta — ₹70
     - **SANDWICH**:
       24. Veg grill sandwich — ₹59
       25. Corn cheese grill sandwich — ₹69
       26. Chicken grill sandwich — ₹79
       27. Chicken cheese grill sandwich — ₹89
     - **MOCKTAILS**:
       28. Green Mint Mojito — ₹49
       29. Blue Lagoon — ₹49
       30. Masala Cold Drink — ₹49
       31. Minty Bliss — ₹49
     - **ICE CREAM**:
       32. Chocolate — ₹40
       33. Vanilla — ₹40
       34. Butterscotch — ₹40
     - Bottom tagline on menu: *"Good Food Good Vibes ♥"*

---

## 2. Logic Chain

### Step 1: Dual-Role Entry & Routing Architecture (R1)
- **Observation**: R1 requires opening the website to present two choices: **Add Order** (reception) and **See Orders** (kitchen).
- **Reasoning**:
  - The root path (`/`) functions as a dedicated, friction-free role selector.
  - Choosing "Add Order" routes to `/reception` (subject to PIN protection per R8).
  - Choosing "See Orders" routes to `/kitchen` (read-only, zero PIN prompt per R4/R8).
  - On both child screens, a clear header brand mark ("কথা & Coffee") allows fast switching if a staff member accidentally taps the wrong tile.

### Step 2: Timezone Handling & Concurrency Invariant (R2, R6)
- **Observation**:
  - Order numbers must start at **#1 every day** based on cafe local time (`Asia/Kolkata`, UTC+05:30).
  - Concurrent order creations must never generate duplicate numbers on the same day.
- **Reasoning**:
  - Standard UTC timestamps cannot be directly grouped by UTC date because 00:00:00 IST corresponds to 18:30:00 UTC of the previous day.
  - The server must format the transaction timestamp using `Intl.DateTimeFormat` or a timezone-aware library into an explicit local date string:
    $$\text{DateKey} = \text{formatInTimeZone}(\text{timestamp}, \text{'Asia/Kolkata'}, \text{'yyyy-MM-dd'})$$
  - To guarantee atomicity without race conditions under concurrency:
    - A dedicated relational counter or database-level sequence table is required:
      `daily_counters(date_key TEXT PRIMARY KEY, last_number INTEGER NOT NULL)`
    - When creating an order, an atomic atomic upsert / transaction must be executed:
      ```sql
      INSERT INTO daily_counters (date_key, last_number)
      VALUES (:date_key, 1)
      ON CONFLICT(date_key) DO UPDATE SET last_number = daily_counters.last_number + 1
      RETURNING last_number;
      ```
    - In addition, a unique constraint `UNIQUE(date_key, order_number)` on the `orders` table ensures that even under network retries or distributed races, duplicate daily sequence numbers are strictly prohibited.
  - For automated test verification, an injectable clock mechanism (e.g. `X-Simulated-Clock` header or test harness time offset) is required to test the 23:59:59 -> 00:00:01 rollover without waiting for real calendar midnight.

### Step 3: Order Lifecycle State Machine & Immutability (R2, R3)
- **Observation**:
  - Orders start in `Pending`.
  - Only reception can mark `Done`, which moves them to `Settled`.
  - Reception can edit a pending order (items, quantities, payment method).
  - Reception can cancel an order.
  - Menu price changes must NOT alter past orders or past analytics.
- **Reasoning**:
  - Valid states: `PENDING`, `SETTLED`, `CANCELLED`.
  - **State Transitions**:
    1. `NEW` $\xrightarrow{\text{create\_order}}$ `PENDING`
    2. `PENDING` $\xrightarrow{\text{edit\_order}}$ `PENDING` (recalculating total from updated quantities and current menu snapshot)
    3. `PENDING` $\xrightarrow{\text{click Done}}$ `SETTLED` (terminal state for kitchen; permanently recorded for analytics)
    4. `PENDING` $\xrightarrow{\text{cancel}}$ `CANCELLED` (soft-deleted or purged from active queues; permanently excluded from analytics)
  - **Price Immutability Model**:
    - Storing only `item_id` and querying current price on the fly would violate R3 when prices change.
    - Each line item in `order_items` must store a frozen snapshot:
      - `item_id` (foreign key, nullable to allow menu item deletion)
      - `item_name` (verbatim string snapshot at time of order)
      - `unit_price` (exact numeric snapshot at time of order)
      - `quantity` (positive integer)
      - `subtotal` = `unit_price * quantity`
    - Order `total_amount` is stored directly on the order record as $\sum \text{subtotal}$.

### Step 4: Kitchen Live Synchronization & Audio Feedback (R4)
- **Observation**:
  - Kitchen display is read-only.
  - Updates (new orders, edits, cancellations, settlements) must reflect within $<5\text{s}$ without manual refresh.
  - Kitchen plays a sound/alert when a new order arrives.
- **Reasoning**:
  - **Transport**: Server-Sent Events (SSE) `/api/events` or ultra-reliable short-polling ($\le 2\text{s}$ interval) provides zero-maintenance, firewall-friendly real-time updates across free-tier hosting platforms.
  - **Audio Trigger**:
    - The kitchen client maintains a local cache of known order IDs.
    - When a server push or poll response contains an order ID in `PENDING` that was not previously seen, the client invokes the audio chime.
    - Autoplay mitigation: Browsers block unprompted audio until user interaction. Kitchen staff entering the page via "See Orders" provides the necessary user activation gesture to initialize the Web Audio API context. An on-screen "Audio Alert Active 🔔" pill provides visual assurance.
    - Testability: A test-observable DOM attribute or window property (e.g. `window.__lastAudioAlertTime`) is recorded whenever an audio alert is emitted.

### Step 5: Analytics Calculations & Invariants (R5)
- **Observation**:
  - Date-wise view: pick a day, browse previous days.
  - Per-item quantity sold and total amount.
  - Daily grand total.
  - Breakdown by payment method (`Cash`, `UPI`, `Card`).
  - Strict rule: *"Only settled, non-cancelled orders count."*
- **Reasoning**:
  - Define dataset $\mathcal{O}_{\text{target}}$:
    $$\mathcal{O}_{\text{target}} = \{ o \mid o.\text{date\_key} = D \land o.\text{status} = \text{'SETTLED'} \land o.\text{is\_cancelled} = \text{false} \}$$
  - Any order where $o.\text{status} = \text{'PENDING'}$ is excluded from all counts and sums.
  - Any order where $o.\text{status} = \text{'CANCELLED'}$ or $o.\text{is\_cancelled} = \text{true}$ is excluded from all counts and sums.
  - Mathematical Invariants:
    1. $\text{GrandTotal} = \sum_{o \in \mathcal{O}_{\text{target}}} o.\text{total\_amount}$
    2. $\text{GrandTotal} \equiv \text{Total}_{\text{Cash}} + \text{Total}_{\text{UPI}} + \text{Total}_{\text{Card}}$
    3. $\text{GrandTotal} \equiv \sum_{m \in \text{Items}} \text{Amount}(m)$
    4. For any item $m$: $\text{Amount}(m) = \sum_{i \in \text{Items of } \mathcal{O}_{\text{target}}, i.\text{name} = m} (i.\text{unit\_price} \times i.\text{quantity})$

### Step 6: Security, PIN Authentication & Server-Side Guarding (R8)
- **Observation**:
  - Reception (Add Order, Pending, Settled, Menu, Analytics) is locked by a numeric PIN.
  - Kitchen is unauthenticated and read-only.
  - Staff must stay unlocked for a reasonable period (not re-entering PIN for every order).
  - PIN must be enforced on the server/data side: direct unauthenticated mutations must be rejected.
- **Reasoning**:
  - Security architecture:
    - Default PIN configured in database or environment (e.g. `1234`), owner can update it via Reception Settings.
    - Reception login endpoint: `POST /api/auth/pin` verifies the numeric string and issues a cryptographically signed session token (JWT or secure session cookie) valid for a 12-hour shift duration.
    - Client stores token in `localStorage` or `sessionStorage` / cookie, automatically attaching it to protected API headers (`Authorization: Bearer <token>`).
    - Protected endpoints (`POST /api/orders`, `PUT /api/orders/:id`, `PATCH /api/orders/:id/settle`, `DELETE /api/orders/:id`, `/api/menu/*`, `/api/analytics`) inspect and validate this token. Missing or invalid tokens return HTTP `401 Unauthorized`.
    - Kitchen endpoints (`GET /api/kitchen/orders`, `/api/events`) are public and read-only. Attempts to submit mutations without a valid PIN token are blocked.

### Step 7: Mobile Viewport & One-Handed Ergonomics (R7)
- **Observation**:
  - Designed for phones: large tap targets, readable order numbers, no horizontal scroll at 375px width.
- **Reasoning**:
  - Mobile ergonomics require critical controls within easy one-handed thumb reach:
    - Sticky bottom bar for "Place Order" and running total.
    - Category pills with horizontal scroll (internal component scroll without causing document-level overflow).
    - Stepper buttons (`+` and `-`) with touch target dimensions $\ge 48\text{px} \times 48\text{px}$.
    - Large order confirmation banner displaying `#N` in $\ge 3rem$ typography, allowing instant transcription to paper slips.
  - Page layout enforcement: `width: 100%`, `max-width: 100vw`, `overflow-x: hidden` on viewport roots.

---

## 3. Caveats

1. **Browser Audio Autoplay Policies**: Modern mobile browsers (iOS Safari, Android Chrome) restrict audio playback until an explicit user interaction (click/tap) occurs on the page. Therefore, kitchen audio must be initialized upon the user tapping "See Orders" on the landing page, supplemented by an un-mute toggle if the browser ever suspends the context.
2. **Clock Source Authority**: Order dates and sequence numbers MUST be determined by the authoritative server clock converted to `Asia/Kolkata`, NEVER by the client device's clock, because client device clocks can drift, be set incorrectly, or be manipulated.
3. **Free-Tier Cloud Cold Starts**: On free-tier platforms (e.g., Render, Fly.io, Supabase free projects), idle containers may sleep. The architecture must feature lightweight health-checks and resilient client-side retry logic so cashiers experience seamless reconnection without dropped orders.
4. **Offline Resilience**: While cloud shared storage is mandated, brief cafe Wi-Fi drops must be handled with friendly UI error toasts ("Network error, retrying...") rather than silent crashes.

---

## 4. Conclusion: Features Discovered, Edge Cases & Specifications

### 4.1 Features Discovered Inventory Table

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| F1 | Navigation | Two-Role Landing Portal | Splash/landing page displaying dual access tiles: "Add Order" (reception) and "See Orders" (kitchen). | User click/tap on role tile. | Route transition to `/reception` or `/kitchen`. | Graceful fallback if URL route invalid. | R1 (ORIGINAL_REQUEST.md line 13) |
| F2 | Auth | Reception PIN Gatekeeper | Numeric PIN modal protecting all reception views and management features. | 4-6 digit numeric PIN. | Valid session token, unlock reception UI. | HTTP 401, error message "Incorrect PIN", PIN shake animation. | R8 (ORIGINAL_REQUEST.md line 42) |
| F3 | Auth | Persistent Shift Session | Session token caching to prevent re-entering PIN on every single order during a rush. | Session token in storage/cookie. | Automatic bypass of PIN screen if session active (<12h). | Auto-prompt for PIN if token expired or invalid. | R8 (ORIGINAL_REQUEST.md line 42) |
| F4 | Auth | Server-Side API Guard | Server middleware rejecting data mutations without valid session token. | `Authorization: Bearer <token>` or session cookie. | Request allowed through to controller. | HTTP 401 Unauthorized / 403 Forbidden with `{error: "Unauthorized"}`. | R8 (ORIGINAL_REQUEST.md line 42) |
| F5 | Auth | Owner PIN Management | Ability for cafe owner to update the reception PIN code. | Current PIN, New PIN, Confirm New PIN. | Updated PIN hash in database, success toast. | HTTP 400 if mismatch or weak, HTTP 401 if current PIN incorrect. | R8 (ORIGINAL_REQUEST.md line 42) |
| F6 | Order POS | Visual Menu Catalog Picker | Phone-optimized category filter tabs and item cards for quick order assembly. | Category tap, item tap, search filter. | Item added to active cart at quantity 1. | Non-blocking empty state if category has no items. | R2 (ORIGINAL_REQUEST.md line 16), menu.jpeg |
| F7 | Order POS | Cart Quantity Stepper | Increment/decrement buttons for line items with real-time subtotal updates. | `+` / `-` tap, direct numeric quantity input. | Updated item count, updated item subtotal, updated cart total. | Minimum quantity 1; decremented to 0 triggers item removal. | R2 (ORIGINAL_REQUEST.md line 16) |
| F8 | Order POS | Payment Method Selector | Single-select choice between Cash, UPI, and Card. | Tap on Cash / UPI / Card pill. | Active payment method highlighted and bound to order. | Form validation error if no payment method selected. | R2 (ORIGINAL_REQUEST.md line 16) |
| F9 | Order POS | Dynamic Cart Total Calculation | Real-time calculation of order grand total: $\sum (\text{unit\_price} \times \text{qty})$. | Cart item changes, quantity updates. | Computed ₹ Total displayed in sticky bottom bar. | Automatic precision rounding to 2 decimal places. | R2 (ORIGINAL_REQUEST.md line 16) |
| F10 | Order POS | Atomic Daily Order Numbering | Sequential order numbering starting at #1 every day at 00:00:00 Asia/Kolkata with concurrency safety. | Place Order request with cart payload. | Assigned order number (`#1`, `#2`, …) guaranteed unique per day. | DB transaction retry if conflict occurs; never duplicates. | R2, R6 (ORIGINAL_REQUEST.md lines 17, 36) |
| F11 | Order POS | Prominent Order Slip Confirmation | High-visibility confirmation screen showing the assigned order number in large font for paper slip writing. | Successful order creation response. | Large modal/card with `#N`, total, payment method, "Next Order" button. | Dismissable by cashier tap or auto-reset. | R2 (ORIGINAL_REQUEST.md line 17) |
| F12 | Order Lifecycle | Pending Orders Queue (Reception) | List of active pending orders awaiting preparation and settlement with items, notes, totals. | Reception navigates to "Pending Orders" tab. | Card list of pending orders with Edit, Done, Cancel buttons. | Displays friendly empty state when no pending orders. | R2 (ORIGINAL_REQUEST.md lines 19, 20) |
| F13 | Order Lifecycle | Edit Pending Order | In-place modification of pending order items, quantities, or payment method. | Order ID, updated items array, updated payment method. | Updated order stored, total recalculated, synced to kitchen. | HTTP 400/409 if order is already Settled or Cancelled. | R2 (ORIGINAL_REQUEST.md line 18) |
| F14 | Order Lifecycle | Settle Order ("Done" Action) | Moves order status from Pending to Settled; locks order from future edits. | Tap "Done" button on pending order card. | Status set to `SETTLED`, order moves to Settled list. | HTTP 400 if already settled; kitchen cannot invoke this. | R2 (ORIGINAL_REQUEST.md line 20) |
| F15 | Order Lifecycle | Cancel / Delete Order | Cancels an order, removing it from active lists and strictly excluding from analytics. | Tap "Cancel", confirm prompt. | Status set to `CANCELLED` (or soft-deleted). | HTTP 400 if already settled; confirmation prompt prevents mis-taps. | R2 (ORIGINAL_REQUEST.md line 18) |
| F16 | Order Lifecycle | Settled Orders Queue (Reception) | Archive view of completed orders for the current day. | Reception navigates to "Settled Orders" tab. | Card list of settled orders with order #, items, total, payment. | Read-only view for reference. | R2 (ORIGINAL_REQUEST.md line 19) |
| F17 | Menu Mgmt | Add Menu Item | Reception interface to introduce a new offering to the menu catalog. | Name, Category, Price (INR). | New item saved to menu database, appears in POS catalog. | Validation error if name is blank or price is $\le 0$. | R3 (ORIGINAL_REQUEST.md line 23) |
| F18 | Menu Mgmt | Edit Menu Item | Update existing menu item's name, category, or price. | Item ID, updated name/category/price. | Updated catalog listing. | Validation error if price is non-numeric or negative. | R3 (ORIGINAL_REQUEST.md line 23) |
| F19 | Menu Mgmt | Remove Menu Item | Remove an item from the active menu catalog without affecting past orders. | Item ID, delete confirmation. | Item deactivated/soft-deleted from POS ordering catalog. | Safe removal; past orders and analytics remain intact. | R3 (ORIGINAL_REQUEST.md line 23) |
| F20 | Menu Mgmt | Price Immutability Protection | Historical price locking: past orders preserve snapshot prices regardless of menu price changes. | Menu item price modification. | Historical `order_items.unit_price` remain unchanged. | Invariant verified: past order totals never alter. | R3 (ORIGINAL_REQUEST.md line 23) |
| F21 | Kitchen Display | Read-Only Kitchen Interface | Hands-free display showing Pending and Settled queues; no mutation controls. | Kitchen navigation to `/kitchen`. | Live order list; zero Done/Edit/Cancel buttons. | UI renders no interactive action controls for orders. | R4 (ORIGINAL_REQUEST.md line 26) |
| F22 | Kitchen Display | Real-Time Sync (<5s) | Automatic propagation of new orders, edits, cancellations, and settlements to kitchen screen. | Reception state changes. | Kitchen UI reflects changes in $<5\text{s}$ without browser reload. | Auto-reconnect if network drops; syncs on reconnect. | R4 (ORIGINAL_REQUEST.md line 27) |
| F23 | Kitchen Display | Audible New Order Alert | Acoustic chime/tone triggered on kitchen device whenever a new order is received. | Event: new pending order ID detected. | Audio chime played via Web Audio API synth / audio element. | Visual notification pill displayed if browser blocks audio. | R4 (ORIGINAL_REQUEST.md line 28) |
| F24 | Analytics | Historical Date-Wise Picker | Reception calendar selector allowing staff/owner to inspect any past date. | Selected Date (`YYYY-MM-DD`). | Analytics metrics rendered for chosen calendar day. | Defaults to today in `Asia/Kolkata` if none specified. | R5 (ORIGINAL_REQUEST.md line 31) |
| F25 | Analytics | Item Quantity & Revenue Breakdown | Aggregated table/cards showing total quantity sold and total revenue per menu item. | Target date filter. | List of items with Qty Sold and Total Amount (₹). | Excludes items with 0 sales or displays zero-fill. | R5 (ORIGINAL_REQUEST.md line 31) |
| F26 | Analytics | Daily Grand Total Calculation | Total gross revenue for the day across all settled orders. | Target date filter. | Bold display of Day's Grand Total (₹). | Renders ₹0.00 if no settled orders on date. | R5 (ORIGINAL_REQUEST.md line 31) |
| F27 | Analytics | Payment Method Split | Breakdown of settled revenue by Cash, UPI, and Card. | Target date filter. | Separate totals for Cash (₹), UPI (₹), and Card (₹). | Sum of payment totals strictly matches Grand Total. | R5 (ORIGINAL_REQUEST.md line 31) |
| F28 | Analytics | Strict Non-Settled Exclusion | Invariant: Pending and Cancelled orders are strictly omitted from all financial metrics. | Target date query. | Filtered dataset: `status = 'SETTLED' AND NOT cancelled`. | Zero contribution from pending/cancelled orders. | R5 (ORIGINAL_REQUEST.md line 31) |
| F29 | Infrastructure | Shared Cloud & Local Storage | Database storage supporting multi-device internet sync and full offline/local development. | Database connection config. | Persistent persistence across reboots, restarts, redeploys. | Graceful error on DB connection drop. | R6 (ORIGINAL_REQUEST.md line 34) |
| F30 | Infrastructure | Deployment Guide & Seed Script | Step-by-step beginner guide for free-tier cloud deployment + initial menu seed from menu.jpeg. | Setup guide execution. | Deployed production app + seeded menu catalog. | Clear error troubleshooting steps in README. | R6 (ORIGINAL_REQUEST.md line 35) |
| F31 | UI / UX | 375px Responsive Mobile Layout | Strict phone-first layout with zero horizontal overflow and thumb-friendly tap targets. | Viewport width 375px (iPhone SE). | Clean layout, zero horizontal scrollbar (`overflow-x: hidden`). | Elements wrap or scroll internally within containers. | R7 (ORIGINAL_REQUEST.md line 39) |
| F32 | UI / UX | Bengali Heritage & Cafe Theme | Authentic "কথা & Coffee" branding with warm cafe palette, Bengali logo, and tagline. | Page render. | Warm latte/coffee aesthetic, high contrast, branded header. | Accessible color contrast ratios (WCAG AA). | logo.jpeg, menu.jpeg |

---

### 4.2 Edge Cases Specification Table

| # | Feature | Input / Condition | Expected / Observed Behavior |
|---|---------|-------------------|-----------------------------|
| E1 | Daily Sequence Reset | Order placed at 23:59:58 IST on Date $D$, followed by order placed at 00:00:02 IST on Date $D+1$. | First order receives `#N` under Date $D$; second order receives `#1` under Date $D+1$. Previous day orders remain intact and queryable. |
| E2 | Atomic Concurrency | Two cashier devices submit orders at the exact same millisecond on Date $D$. | Database atomic sequence assigns two distinct sequential numbers (e.g. `#14` and `#15`). No duplicate numbers exist. |
| E3 | Midnight Boundary Concurrency | Device A submits at 23:59:59.990 IST and Device B submits at 00:00:00.010 IST. | Device A receives `#N` for Date $D$; Device B receives `#1` for Date $D+1$. Clean partition across date boundary. |
| E4 | Edit Settled Order | Direct API call or UI attempt to edit an order that has already been marked `Done`. | Server rejects mutation with HTTP 400/409 (`"Settled orders cannot be edited"`). UI disables edit controls. |
| E5 | Edit Order Price After Menu Change | Order placed with Tea @ ₹15. Menu price of Tea updated to ₹20. Staff edits pending order to add 1 more Tea (total 2). | The edited order updates the newly selected quantity using the current catalog price (₹20), OR applies updated price uniformly with clear notification. Total recalculated: $2 \times 20 = ₹40$. Old settled orders with Tea @ ₹15 remain unchanged. |
| E6 | Cancel Pending Order | Order `#3` is cancelled by reception. Later, Order `#4` is placed. | Order `#3` is marked cancelled, disappears from Pending views. Order `#4` retains `#4` (sequence numbers are monotonic audit tickets; do NOT reassign or shift #4 to #3). Cancelled `#3` contributes ₹0 to analytics. |
| E7 | Cancel Already Settled Order | Cashier attempts to cancel an order already in `Settled` state. | If permitted by cafe policy: order is cancelled, removed from Settled view, and immediately deducted from analytics. If prohibited: HTTP 400 (`"Cannot cancel settled order"`). |
| E8 | Empty Order Submission | Cashier attempts to click "Place Order" with 0 items selected in cart. | Submission blocked client-side with validation message ("Cart is empty"); server rejects `POST /api/orders` with HTTP 400 (`"Order must contain at least one item"`). |
| E9 | Zero or Negative Quantity | Malicious or buggy payload sent with quantity `0` or `-5`. | Server validation rejects with HTTP 400 (`"Item quantity must be a positive integer"`). |
| E10 | Non-Existent Menu Item in Cart | Cart references an item ID that does not exist in catalog. | Server rejects with HTTP 400 (`"Invalid menu item ID"`). |
| E11 | Deleted Menu Item Impact | Menu item "Masala Cold Drink" is deleted from catalog. Past orders contain this item. | Past order line items retain `item_name: "Masala Cold Drink"`, `unit_price: 49.00`. Analytics for that day shows "Masala Cold Drink" with correct sales and quantity. |
| E12 | Menu Price Reduced to Lower Amount | Cappuccino price dropped from ₹30 to ₹25. | Existing orders placed at ₹30 retain `unit_price: 30.00` and original total. New orders placed after the change calculate at ₹25. |
| E13 | All Orders on a Day Cancelled | On Date $D$, 3 orders were placed, and all 3 were subsequently cancelled. | Analytics for Date $D$ displays ₹0.00 Grand Total, 0 quantities for all items, ₹0 Cash, ₹0 UPI, ₹0 Card. No errors or `NaN`. |
| E14 | Day with Only Pending Orders | Cafe opens at 8:00 AM; 5 orders created in Pending; none yet marked Done. | Analytics for today displays ₹0.00 Grand Total, ₹0 Cash/UPI/Card, and 0 items sold (pending orders do not count). |
| E15 | Kitchen View Mutation Attempt | Direct HTTP POST/PUT/DELETE sent to `/api/orders` without auth token from kitchen terminal. | Server rejects with HTTP 401 Unauthorized. Kitchen UI provides no controls for mutations. |
| E16 | Invalid PIN Entry | Cashier enters `9999` when PIN is `1234`. | Screen shakes, displays "Invalid PIN", input clears. No session token issued. Mutation attempts remain unauthorized. |
| E17 | Session Expiry Mid-Shift | Reception phone remains open for 14 hours past session expiry. | Upon next mutation attempt, server returns HTTP 401. Client catches 401, displays PIN entry modal gracefully preserving current draft cart. |
| E18 | Mobile Horizontal Scroll Overflow | Large item names (e.g. "Chicken Cheese Loaded Fries") or large amounts (₹1,500.00). | Text wraps cleanly or truncates with ellipsis; containers enforce `box-sizing: border-box`, `max-width: 100%`. Page `scrollWidth <= 375px` strictly preserved. |
| E19 | Rapid Successive Taps on "Done" | Reception cashier double-taps "Done" button rapidly. | Button disables immediately on first tap. Backend idempotency ensures order is marked settled once without duplicate state transitions. |
| E20 | Browser Autoplay Audio Policy | Kitchen view opened without prior user interaction in the tab. | AudioContext starts in `suspended` state. An unobtrusive banner/pill "Tap to enable kitchen alert sound 🔔" is shown. Tapping resumes AudioContext. Tapping "See Orders" from landing also initializes audio. |
| E21 | Server Restart Persistence | Node/Server process is killed and restarted (`SIGTERM` / `reboot`). | SQLite file / cloud DB retains all orders, menu items, sequence numbers, and PIN configuration. Pending orders re-render on reboot. |
| E22 | Multiple Browser Tabs Open | Staff opens reception in Tab A and kitchen in Tab B on the same computer/phone. | Tab A creates order; Tab B receives live update and plays chime within $<5\text{s}$ without page reload. |

---

### 4.3 Database Schema & Data Contracts Specification

#### 1. Table: `menu_items`
```sql
CREATE TABLE IF NOT EXISTS menu_items (
  id TEXT PRIMARY KEY,               -- UUID or slug (e.g. 'cappuccino')
  name TEXT NOT NULL,                -- e.g. 'Cappuccino (Milk Coffee)'
  category TEXT NOT NULL,            -- 'Drinks', 'Snacks', 'Pasta', 'Sandwich', 'Mocktails', 'Ice Cream'
  price REAL NOT NULL,               -- e.g. 30.00
  is_active INTEGER NOT NULL DEFAULT 1, -- 1 = active in POS, 0 = soft deleted
  created_at TEXT NOT NULL,          -- ISO-8601 UTC timestamp
  updated_at TEXT NOT NULL           -- ISO-8601 UTC timestamp
);
```

#### 2. Table: `daily_sequences`
```sql
CREATE TABLE IF NOT EXISTS daily_sequences (
  date_key TEXT PRIMARY KEY,         -- 'YYYY-MM-DD' in Asia/Kolkata timezone
  last_number INTEGER NOT NULL DEFAULT 0
);
```

#### 3. Table: `orders`
```sql
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,               -- UUID
  date_key TEXT NOT NULL,            -- 'YYYY-MM-DD' in Asia/Kolkata
  order_number INTEGER NOT NULL,     -- 1, 2, 3, ... (reset daily per date_key)
  status TEXT NOT NULL,              -- 'PENDING', 'SETTLED', 'CANCELLED'
  payment_method TEXT NOT NULL,      -- 'Cash', 'UPI', 'Card'
  total_amount REAL NOT NULL,        -- Computed sum of items at time of placement
  notes TEXT,                        -- Optional customer instructions
  is_cancelled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,          -- ISO-8601 UTC
  settled_at TEXT,                   -- ISO-8601 UTC when marked Done
  updated_at TEXT NOT NULL,
  UNIQUE(date_key, order_number)     -- Concurrency invariant
);
```

#### 4. Table: `order_items`
```sql
CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,               -- UUID
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id TEXT,                      -- References menu_items(id), nullable
  item_name TEXT NOT NULL,           -- Snapshot of item name
  unit_price REAL NOT NULL,          -- Snapshot of unit price at order time
  quantity INTEGER NOT NULL,         -- e.g. 2
  subtotal REAL NOT NULL             -- unit_price * quantity
);
```

#### 5. Table: `settings`
```sql
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,              -- 'reception_pin_hash'
  value TEXT NOT NULL,               -- bcrypt / argon2 / sha256 salt+hash
  updated_at TEXT NOT NULL
);
```

---

### 4.4 API Endpoint Contracts Specification

| Method | Route | Auth Required | Description | Request Body | Response (Success / Error) |
|---|---|---|---|---|---|
| `GET` | `/api/health` | None | Service liveness and timestamp check | None | `200 { status: "ok", time: "..." }` |
| `POST` | `/api/auth/pin` | None | Verify PIN and establish session | `{ pin: "1234" }` | `200 { token: "...", expiresAt: "..." }` / `401 { error: "Invalid PIN" }` |
| `POST` | `/api/auth/pin/change` | Bearer Token | Update reception PIN | `{ oldPin: "1234", newPin: "5678" }` | `200 { message: "PIN updated" }` / `400, 401` |
| `GET` | `/api/menu` | None | Fetch active menu items for POS | None | `200 [ { id, name, category, price }, ... ]` |
| `POST` | `/api/menu` | Bearer Token | Add new menu item | `{ name, category, price }` | `201 { id, name, category, price }` / `400, 401` |
| `PUT` | `/api/menu/:id` | Bearer Token | Edit menu item name or price | `{ name, category, price }` | `200 { id, name, category, price }` / `400, 401, 404` |
| `DELETE` | `/api/menu/:id` | Bearer Token | Remove / deactivate menu item | None | `200 { message: "Item removed" }` / `401, 404` |
| `GET` | `/api/orders` | Bearer Token | List all orders with filters (date, status) | Query params: `?status=PENDING&date=...` | `200 [ { id, order_number, status, items, total, ... } ]` / `401` |
| `POST` | `/api/orders` | Bearer Token | Create new order (atomic numbering) | `{ items: [{ id, name, price, quantity }], payment_method: "Cash"\|"UPI"\|"Card" }` | `201 { id, order_number: 1, date_key, ... }` / `400, 401` |
| `PUT` | `/api/orders/:id` | Bearer Token | Edit pending order items/payment | `{ items: [...], payment_method: "UPI" }` | `200 { id, ...updatedOrder }` / `400, 401, 404, 409` |
| `PATCH` | `/api/orders/:id/settle` | Bearer Token | Mark order as Done (moves to Settled) | None | `200 { id, status: "SETTLED", settled_at: "..." }` / `401, 404, 409` |
| `DELETE` | `/api/orders/:id` | Bearer Token | Cancel order (purge from active & analytics) | None | `200 { id, status: "CANCELLED" }` / `401, 404` |
| `GET` | `/api/kitchen/orders` | None | Public read-only pending and settled orders | None | `200 { pending: [...], settled: [...] }` |
| `GET` | `/api/events` | None | SSE stream for real-time kitchen updates | None | `text/event-stream` with events `order:created`, `order:updated`, `order:settled`, `order:cancelled` |
| `GET` | `/api/analytics` | Bearer Token | Daily analytics breakdown | Query params: `?date=YYYY-MM-DD` | `200 { date, grandTotal, items: [...], payments: { Cash, UPI, Card } }` / `401` |

---

### 4.5 Acceptance Criteria Pass/Fail Verification Matrix

| AC # | Acceptance Criterion | Test Condition / Input | Pass Criteria | Fail Criteria |
|---|---|---|---|---|
| **AC-1** | Real-Time Sync to Kitchen | Order created in Reception in Browser A while Kitchen view is open in Browser B. | Kitchen view displays the new order in Pending section within $\le 5.0\text{s}$ without manual refresh. | Order does not appear within 5s, or requires manual page reload. |
| **AC-2** | Daily Sequence Reset | Create 3 orders on Date $D$ (#1, #2, #3). Advance simulated server clock to Date $D+1$ 00:00:05 Asia/Kolkata. Create next order. | Order created on Date $D+1$ is assigned `#1`. Orders from Date $D$ remain accessible in history. | Order on Date $D+1$ receives `#4`, or Date $D$ orders are deleted/overwritten. |
| **AC-3** | Concurrency Safety | Two order creation requests dispatched simultaneously via parallel async network calls. | Both requests succeed; each receives a unique, distinct order number (e.g. `#5` and `#6`). | Duplicate order numbers generated (e.g. two `#5`s), or request crashes. |
| **AC-4** | Settle ("Done") Sync | Reception clicks "Done" on Order `#X` in Browser A. | Order `#X` moves from Pending to Settled in both Browser A and Browser B within $\le 5.0\text{s}$. Kitchen UI renders zero Done/Edit/Cancel buttons. | Order remains in Pending in Kitchen, or Kitchen UI shows mutation buttons. |
| **AC-5** | Edit Pending Order Sync | Reception edits items/quantities/payment of pending Order `#X` in Browser A. | Kitchen view updates items and quantities within $\le 5.0\text{s}$. Total amount is correctly recalculated. | Changes not visible in kitchen, or old total remains unchanged. |
| **AC-6** | Cancellation Exclusion | Reception cancels Order `#X`. | Order `#X` immediately disappears from Pending in both Reception and Kitchen. Order `#X` contributes 0 to all Analytics metrics. | Order remains visible in active queues, or order amount appears in daily analytics. |
| **AC-7** | Seeded Analytics Exactness | Seed database with $\ge 3$ days of orders, $\ge 5$ items, mixed payment methods, including pending and cancelled orders. | Per-item quantities, per-item revenues, daily grand totals, and Cash/UPI/Card sums match independently calculated values to 0.00 accuracy. Excludes pending & cancelled. | Math discrepancy $> 0.00$, or inclusion of pending/cancelled orders. |
| **AC-8** | Price Immutability | Order `#1` created with Cold Coffee @ ₹50. Menu item price updated to ₹70. | Order `#1` total remains ₹50. Past analytics report Cold Coffee revenue based on ₹50 unit price. | Order `#1` total mutates to ₹70, or past analytics report inflated numbers. |
| **AC-9** | Process Restart Persistence | Seed orders and menu, then gracefully shut down server (`SIGTERM`) and restart process. | All orders, statuses, menu items, and counter sequence resume intact from disk/DB. | Empty database, lost orders, or reset counter on same day. |
| **AC-10** | Kitchen Audio Alert Trigger | Kitchen view open. Order created in Reception. | Web Audio API / Audio playback event or observable test flag (`window.__lastAudioAlertTime`) is triggered upon order arrival. | No audio event emitted or recorded. |
| **AC-11** | 375px Viewport Overflow | Automated browser test sets viewport to 375px width on Landing, Reception (all tabs), and Kitchen. | `document.documentElement.scrollWidth <= 375` (zero horizontal overflow) on all pages. | `scrollWidth > 375` (horizontal scroll bar appears). |
| **AC-12** | PIN Security & API Route Guard | Access Reception without PIN; attempt direct HTTP POST/PUT/DELETE without token; access Kitchen without PIN. | Reception UI requires PIN; invalid PIN rejected; direct API mutations return HTTP 401; Kitchen view loads without PIN prompt. | Unauthenticated mutations succeed (HTTP 200), or Kitchen prompts for PIN. |

---

## 5. Verification Method

To independently verify the completeness and accuracy of this specification:

1. **Compare Against `ORIGINAL_REQUEST.md`**:
   - Inspect `d:\kotha&coffee\.agents\teamwork\ORIGINAL_REQUEST.md` lines 1-63.
   - Confirm every requirement R1, R2, R3, R4, R5, R6, R7, R8 has direct corresponding features in Section 4.1 and test criteria in Section 4.5.
2. **Compare Against Image Assets**:
   - Inspect `d:\kotha&coffee\menu.jpeg`: verify all 34 menu items, 6 categories, and exact prices match Section 1.2.
   - Inspect `d:\kotha&coffee\logo.jpeg`: verify Bengali branding ("কথা & Coffee"), tagline, and espresso color palette match Section 1.2.
3. **Validate Business Invariants**:
   - Timezone: Verify `Asia/Kolkata` day boundary math ($UTC + 05:30$).
   - Concurrency: Verify atomic counter table upsert query.
   - Analytics: Verify $\text{GrandTotal} \equiv \text{Cash} + \text{UPI} + \text{Card} \equiv \sum \text{Item Amounts}$.
   - Security: Verify all mutation routes require authentication while kitchen read-only routes are public.
