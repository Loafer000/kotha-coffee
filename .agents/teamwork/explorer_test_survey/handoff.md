# E2E Testing Architecture & Strategy Report: Kotha & Coffee POS

**Author**: E2E Testing Architect Explorer  
**Working Directory**: `d:\kotha&coffee\.agents\teamwork\explorer_test_survey`  
**Date**: 2026-10-15  
**Target Project**: Kotha & Coffee Phone-Friendly POS System (`d:\kotha&coffee`)  

---

## 1. Observation

Direct observations from workspace analysis, requirements specification, and project assets:

1. **Original Request & Acceptance Criteria**:
   - Location: `d:\kotha&coffee\.agents\teamwork\ORIGINAL_REQUEST.md`
   - Lines 5-8: Simple phone-friendly web POS for "Kotha & Coffee". Working directory `d:\kotha&coffee`, development integrity mode.
   - Lines 12-43: Detailed requirements R1 through R8 covering two-role entry screen, reception order lifecycle (create, large # slip, #1 daily sequence in `Asia/Kolkata`, edit, cancel, settle), menu management with historical price immutability, kitchen read-only live sync (<5s, no reload, sound alert), reception date-wise analytics (settled/non-cancelled only), cloud hosting & persistent storage (restarts retain state, atomic concurrent numbering), 375px phone-first viewport with no horizontal scroll, and PIN security on both client and server API.
   - Lines 46-59: Twelve explicitly enumerated Acceptance Criteria:
     1. Multi-session sync (<5s latency without reload) between reception and kitchen.
     2. Daily sequence #1, #2, #3 reset to #1 upon day change (`Asia/Kolkata`) with injected clock, keeping previous orders.
     3. Concurrent order creation yielding distinct consecutive numbers.
     4. Done button moves order to Settled within 5s; kitchen has no Done/Edit/Cancel controls.
     5. Order editing updates kitchen within 5s with recalculated totals.
     6. Cancelled order disappears from Pending in both views and is excluded from analytics.
     7. Seeded dataset analytics spanning $\ge 3$ days, $\ge 5$ items, mixed payments matching exact mathematical values.
     8. Menu price mutation does not alter past order totals or historical analytics.
     9. Persistent storage retains all state across full server/app process restart.
     10. Kitchen sound/notification alert event observable during new order creation.
     11. 375px viewport with zero horizontal overflow (`scrollWidth <= clientWidth`) on landing, 3 reception views, and kitchen.
     12. Reception UI blocked without PIN, wrong PIN rejected, and direct API writes rejected with 401/403. Kitchen loads without PIN.
   - Lines 60-63: Deliverables requiring a README with local run/test command and deployment guide, plus automated 7 mobile screenshots (phone viewport): landing, create order, order confirmation slip (#), pending, settled, analytics, kitchen view.

2. **Project Assets**:
   - `d:\kotha&coffee\menu.jpeg`: Official cafe menu containing 34 distinct items across 6 categories (Drinks: Tea ₹15, Cappuccino ₹30, Cold Coffee ₹50, etc.; Snacks: Chicken Momo ₹60, French Fries ₹50, etc.; Pasta: White Sauce Pasta ₹70; Mocktails: Green Mint Mojito ₹49, etc.; Sandwiches: Veg grill ₹59, etc.; Ice Cream: ₹40).
   - `d:\kotha&coffee\logo.jpeg`: Official branding "কথা & Coffee" with tagline "এক কাপ কফি, না বলা কিছু কথা".

3. **Runtime & OS Environment**:
   - Host OS: Windows (PowerShell environment).
   - Turnkey execution constraint: Suite must execute reliably via a single documented command (`npm test` or `npm run test:e2e`) without interactive prompts or platform-specific bash-isms.

---

## 2. Logic Chain

From the observations above, we deduce the following structural testing architecture:

1. **Tooling Selection — Playwright over Cypress/Selenium/Puppeteer**:
   - *Observation Reference*: AC 1, AC 3, AC 7, AC 12 require concurrent multi-browser sessions, simultaneous API bursts, and direct HTTP testing.
   - *Reasoning*:
     - Playwright natively supports `browser.newContext()` to create completely isolated incognito contexts in a single browser process. This allows simultaneous testing of `receptionContext` and `kitchenContext` in parallel without session or cookie bleed.
     - Playwright's `playwright.request` API enables issuing unauthenticated and authenticated REST calls directly, essential for verifying PIN 401/403 security without UI overhead.
     - Playwright provides cross-platform child process management via `webServer` in `playwright.config.ts`, handling server lifecycle on Windows automatically.
     - Playwright 1.45+ has built-in clock manipulation (`page.clock.install()`), timezone emulation (`timezoneId: 'Asia/Kolkata'`), and native network/console/event inspection.

2. **Multi-Session Isolation & Real-Time Sync Verification (<5s, No Reload)**:
   - *Observation Reference*: AC 1, AC 4, AC 5.
   - *Reasoning*:
     - The test instantiates `receptionPage` and `kitchenPage` from distinct browser contexts.
     - To strictly verify the "no reload" requirement, the test injects a token via `page.addInitScript(() => { window.__pageSessionId = Math.random(); })`.
     - When reception triggers an order creation, edit, or settlement, Playwright records timestamp $T_0$.
     - Kitchen page awaits DOM element update via web-first assertions (`expect(kitchenPage.getByTestId(...)).toBeVisible({ timeout: 5000 })`).
     - Upon appearance, timestamp $T_1$ is recorded; test asserts $(T_1 - T_0) < 5000\text{ ms}$, and verifies `window.__pageSessionId` remains strictly identical.

3. **Timezone & Date Roll Injected Clock Architecture**:
   - *Observation Reference*: AC 2 requires date rollover at 00:00:00 `Asia/Kolkata` (IST, UTC+5:30), resetting order numbering to #1 while keeping previous orders intact.
   - *Reasoning*:
     - Server-side order numbering is authoritative. Mocking client browser clock alone will not alter server-generated sequence numbers.
     - Therefore, the application architecture must provide a test-only deterministic clock interface:
       1. Request header: `x-mock-date: 2026-10-15T23:59:55+05:30`, or
       2. Dedicated test endpoint: `POST /api/test/set-clock { "timestamp": "2026-10-16T00:00:05+05:30" }` and `POST /api/test/reset-clock` (active only when `NODE_ENV !== 'production'`).
     - In the test:
       - Set clock to Day 1 $\rightarrow$ submit 3 orders $\rightarrow$ verify orders are assigned `#1`, `#2`, `#3`.
       - Advance clock past midnight IST to Day 2 $\rightarrow$ submit 1 order $\rightarrow$ verify order is assigned `#1`.
       - Query Day 1 orders $\rightarrow$ assert Orders #1, #2, #3 are fully preserved and queryable in historical views.

4. **Concurrency Race Condition Verification**:
   - *Observation Reference*: AC 3 requires simultaneous order creation yielding distinct consecutive numbers without collisions or duplicates.
   - *Reasoning*:
     - True concurrency requires parallel HTTP dispatch rather than sequential UI typing.
     - Test executes an atomic burst of $N=5$ simultaneous order creations using `Promise.all()` over Playwright's `request` context with valid reception auth headers.
     - Test asserts all $N$ requests resolve with status 201/200, extracts `order_number`s, and validates:
       $$\text{uniqueNumbers.size} == N \quad \text{and} \quad \max(\text{nums}) - \min(\text{nums}) + 1 == N$$

5. **Audio Alert Verification on Kitchen Display**:
   - *Observation Reference*: AC 10 requires kitchen phone playing an audible alert on new orders, observable in tests.
   - *Reasoning*:
     - Headless browsers run without active audio output devices, and browser autoplay policies can restrict unprompted audio playback.
     - To make audio alerts 100% deterministically verifiable, the test injects an audio spy into the kitchen page prior to navigation:
       ```ts
       await kitchenPage.addInitScript(() => {
         window.__audioAlertsFired = [];
         const origPlay = HTMLAudioElement.prototype.play;
         HTMLAudioElement.prototype.play = function() {
           window.__audioAlertsFired.push({ src: this.src, time: Date.now() });
           window.dispatchEvent(new CustomEvent('kotha-sound-played', { detail: { src: this.src } }));
           return Promise.resolve();
         };
       });
       ```
     - When reception creates an order, test asserts `window.__audioAlertsFired.length >= 1` within 5 seconds.

6. **375px Viewport Overflow Detection**:
   - *Observation Reference*: AC 11 requires landing, 3 reception views, and kitchen to have zero horizontal overflow (`scrollWidth <= clientWidth`) at 375px width.
   - *Reasoning*:
     - The test configures viewport `{ width: 375, height: 667 }` (standard mobile width).
     - Test executes a robust DOM crawler script:
       ```ts
       const { scrollWidth, clientWidth } = document.documentElement;
       const bodyScrollWidth = document.body.scrollWidth;
       // Validates no element extends past clientWidth
       ```
     - It runs across all 5 key views: Landing (`/`), Reception Pending, Reception Settled, Reception Analytics, and Kitchen Display, plus Create Order modal/view and Menu Management.

7. **Server Process Restart & State Persistence**:
   - *Observation Reference*: AC 9 requires data persistence after server/app process is fully restarted.
   - *Reasoning*:
     - On Windows, child process killing and respawning must be handled cleanly without zombie ports.
     - In test harness:
       1. Populate database with menu items and orders #1 (settled) and #2 (pending).
       2. Capture state snapshot.
       3. Test helper sends restart command to app or invokes `POST /api/test/restart-runtime` (or terminates and respawns the Node process via `child_process`).
       4. Polls `GET /api/health` until 200 OK.
       5. Re-opens browser, verifies all orders, menu items, settled states, and order sequence counters are intact.

8. **Mathematical Analytics Verification**:
   - *Observation Reference*: AC 7 requires exact matching of daily totals, item sales, and payment breakdowns over $\ge 3$ days, $\ge 5$ items.
   - *Reasoning*:
     - Define an explicit mathematical fixture with deterministic orders, prices, quantities, and payment methods.
     - Formula checks:
       $$\text{Daily Total} = \sum_{i \in \text{Settled}} \text{ItemQty}_i \times \text{PriceAtOrder}_i$$
       $$\text{Daily Total} = \text{Total}_{\text{Cash}} + \text{Total}_{\text{UPI}} + \text{Total}_{\text{Card}}$$
     - Explicitly verify that `CANCELLED` orders and `PENDING` orders contribute ₹0 to all metrics.

9. **PIN Security Verification (UI + Direct API)**:
   - *Observation Reference*: AC 12 requires UI blocking and direct API write rejection with 401/403.
   - *Reasoning*:
     - UI tests verify entering wrong PIN rejects and keeps reception locked. Correct PIN unlocks and sets session.
     - Direct API tests issue raw HTTP requests without auth cookies/tokens to `POST /api/orders`, `PUT /api/orders/:id`, `DELETE /api/orders/:id`, `POST /api/orders/:id/settle`, `POST /api/menu`, `PUT /api/menu/:id`, `DELETE /api/menu/:id`. All MUST return 401/403.
     - Kitchen read endpoint `GET /api/kitchen/orders` MUST return 200 OK without PIN.

10. **Automated Screenshot Generation for Deliverables**:
    - *Observation Reference*: Deliverable 2 requires phone viewport screenshots for 7 views.
    - *Reasoning*:
      - Integrated Playwright script captures high-fidelity PNG screenshots into `./screenshots/`:
        1. `01_landing.png`
        2. `02_create_order.png`
        3. `03_order_confirmation_slip.png`
        4. `04_reception_pending.png`
        5. `05_reception_settled.png`
        6. `06_reception_analytics.png`
        7. `07_kitchen_view.png`

---

## 3. Caveats

1. **Server Clock Injection Mechanism**:
   - Playwright's `page.clock` manipulates client-side JavaScript time, but order numbering and analytics grouping are executed on the backend server.
   - *Assumption*: The backend server implementation will support test clock mocking via a header (e.g. `x-mock-date`) or a test-only API endpoint (`/api/test/set-clock`) enabled in non-production environments.
2. **Audio Hardware in Headless CI/Windows**:
   - Headless Chromium does not emit physical sound; audio verification relies on spying on `HTMLAudioElement.prototype.play` or Web Audio API synthesis events. This satisfies AC 10 completely without requiring audio hardware.
3. **Database Concurrency on Windows**:
   - If SQLite is used for local storage, WAL (Write-Ahead Logging) mode and busy timeouts must be enabled to prevent `SQLITE_BUSY` database lock errors during the concurrent order burst test.
4. **No Test Code Written Yet**:
   - In accordance with our explorer read-only role, this report defines the architectural design, test file structures, and verification specifications. The implementation of test suites will be handled by the implementation sub-orchestrators and testing engineers in Phase 1.

---

## 4. Conclusion & Test Suite Architecture

We specify a 4-Tier test suite structure plus automated screenshot generation, runnable on Windows with a single command: `npm test` or `npm run test:e2e`.

### 4.1 Test Hierarchy Structure

```
d:\kotha&coffee\
├── package.json
├── playwright.config.ts
├── screenshots/                                # Output directory for deliverable screenshots
│   ├── 01_landing.png
│   ├── 02_create_order.png
│   ├── 03_order_confirmation_slip.png
│   ├── 04_reception_pending.png
│   ├── 05_reception_settled.png
│   ├── 06_reception_analytics.png
│   └── 07_kitchen_view.png
└── tests/
    ├── fixtures/
    │   ├── menu-items.fixture.ts               # Menu items & prices matching menu.jpeg
    │   ├── seeded-analytics.fixture.ts         # Multi-day dataset & expected mathematical sums
    │   └── test-harness.ts                     # Multi-context & audio spy fixtures
    ├── helpers/
    │   ├── audio-spy.ts                        # HTMLAudioElement & WebAudio spy injection
    │   ├── clock-controller.ts                 # Asia/Kolkata date injection helper
    │   ├── overflow-checker.ts                 # 375px scrollWidth <= clientWidth evaluator
    │   └── server-controller.ts                # Server restart & health check orchestrator
    └── e2e/
        ├── tier1-feature-coverage/             # Core functional requirements (>=5 tests/feature)
        │   ├── 01-landing-role-selection.spec.ts
        │   ├── 02-reception-order-crud.spec.ts
        │   ├── 03-menu-management.spec.ts
        │   ├── 04-kitchen-display.spec.ts
        │   ├── 05-analytics-daily-views.spec.ts
        │   └── 06-pin-unlock-flow.spec.ts
        ├── tier2-boundary-edge/                # Concurrency, security, overflow, restart
        │   ├── 01-concurrency-atomic-orders.spec.ts
        │   ├── 02-pin-security-api-bypass.spec.ts
        │   ├── 03-viewport-overflow-375px.spec.ts
        │   ├── 04-server-restart-persistence.spec.ts
        │   └── 05-cart-and-input-boundaries.spec.ts
        ├── tier3-interactions/                 # Real-time multi-session, date rollover, immutability
        │   ├── 01-realtime-kitchen-sync.spec.ts
        │   ├── 02-date-roll-kolkata-reset.spec.ts
        │   ├── 03-menu-price-immutability.spec.ts
        │   ├── 04-kitchen-audio-alert.spec.ts
        │   └── 05-order-settle-cancel-sync.spec.ts
        ├── tier4-real-world-workflows/         # Cafe rush hour, 3-day seeded math audit
        │   ├── 01-cafe-rush-hour-simulation.spec.ts
        │   ├── 02-seeded-analytics-math-audit.spec.ts
        │   └── 03-full-day-lifecycle-e2e.spec.ts
        └── screenshots/
            └── generate-deliverable-screenshots.spec.ts
```

### 4.2 Comprehensive Test Case Mapping to Requirements

| Tier | Test File | Requirement | Test Cases Description | Acceptance Criteria Covered |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 1** | `01-landing-role-selection.spec.ts` | R1 | 1. Landing displays "Add Order" & "See Orders".<br>2. Clicking "Add Order" routes to Reception PIN.<br>3. Clicking "See Orders" routes directly to Kitchen.<br>4. Branding & Cafe title visible.<br>5. Back/home navigation works. | R1 |
| **Tier 1** | `02-reception-order-crud.spec.ts` | R2 | 1. Add order with items & quantities.<br>2. Automatic total calculation.<br>3. Payment method selection (Cash, UPI, Card).<br>4. Order confirmation slip shows large order #.<br>5. Order appears in Pending list.<br>6. Edit order modifies items and updates total.<br>7. Cancel order removes it from list. | R2 |
| **Tier 1** | `03-menu-management.spec.ts` | R3 | 1. View menu items list.<br>2. Add new menu item with name & price.<br>3. Edit existing item name & price.<br>4. Remove/archive menu item.<br>5. Input validation (positive prices, non-empty names). | R3 |
| **Tier 1** | `04-kitchen-display.spec.ts` | R4 | 1. Kitchen displays Pending orders with order # and items.<br>2. Kitchen displays Settled orders.<br>3. Verify Kitchen is read-only (zero Done/Edit/Cancel buttons).<br>4. Order cards format item quantities clearly.<br>5. Kitchen loads without PIN prompt. | R4, AC 4 |
| **Tier 1** | `05-analytics-daily-views.spec.ts` | R5 | 1. View current day sales summary.<br>2. Date picker to browse previous days.<br>3. Per-item sold quantity & amount list.<br>4. Payment method totals (Cash/UPI/Card).<br>5. Daily grand total matches item sums. | R5, AC 7 |
| **Tier 1** | `06-pin-unlock-flow.spec.ts` | R8 | 1. Reception requires PIN prompt.<br>2. Incorrect PIN shows error and stays locked.<br>3. Correct PIN unlocks reception.<br>4. Session remains unlocked across page tabs/refreshes.<br>5. Owner can change PIN. | R8, AC 12 |
| **Tier 2** | `01-concurrency-atomic-orders.spec.ts` | R6, AC 3 | 1. Parallel burst of 5 simultaneous order creations.<br>2. All orders assigned unique consecutive numbers.<br>3. Zero duplicate numbers.<br>4. Zero database deadlocks or 500 errors.<br>5. Order sequence integrity preserved under load. | AC 3 |
| **Tier 2** | `02-pin-security-api-bypass.spec.ts` | R8, AC 12 | 1. Unauthenticated `POST /api/orders` rejected (401/403).<br>2. Unauthenticated `PUT /api/orders/:id` rejected.<br>3. Unauthenticated `DELETE /api/orders/:id` rejected.<br>4. Unauthenticated `POST /api/orders/:id/settle` rejected.<br>5. Unauthenticated `POST /api/menu` rejected.<br>6. Direct kitchen `GET /api/kitchen/orders` allowed (200 OK). | AC 12 |
| **Tier 2** | `03-viewport-overflow-375px.spec.ts` | R7, AC 11 | 1. Landing: `scrollWidth <= clientWidth` at 375px.<br>2. Reception Pending: zero overflow.<br>3. Reception Settled: zero overflow.<br>4. Reception Analytics: zero overflow.<br>5. Reception Menu Management: zero overflow.<br>6. Kitchen view: zero overflow. | AC 11 |
| **Tier 2** | `04-server-restart-persistence.spec.ts` | R6, AC 9 | 1. Create orders & modify menu.<br>2. Capture data snapshot.<br>3. Stop and restart server process.<br>4. Re-query all data: orders, menu, settled status retained.<br>5. Next created order picks up next sequential number. | AC 9 |
| **Tier 2** | `05-cart-and-input-boundaries.spec.ts` | R2, R3 | 1. Prevent submitting empty cart.<br>2. Prevent quantity 0 or negative quantities.<br>3. Menu item name length limits.<br>4. Menu price decimal rounding (paisa/rupee).<br>5. Handle rapid double-clicking of submit button. | R2, R3 |
| **Tier 3** | `01-realtime-kitchen-sync.spec.ts` | R4, AC 1 | 1. Isolated `receptionContext` and `kitchenContext`.<br>2. Create order in reception.<br>3. Kitchen Pending updates in $< 5000\text{ ms}$.<br>4. Verify zero page reload via page load token.<br>5. Network latency tolerance check. | AC 1 |
| **Tier 3** | `02-date-roll-kolkata-reset.spec.ts` | R2, AC 2 | 1. Mock time: Day 1 (Asia/Kolkata).<br>2. Create Orders #1, #2, #3.<br>3. Mock time: Cross midnight (00:00:01 IST Day 2).<br>4. Create next order $\rightarrow$ verify assigned `#1`.<br>5. Historical query retains Day 1 orders #1, #2, #3. | AC 2 |
| **Tier 3** | `03-menu-price-immutability.spec.ts` | R3, AC 8 | 1. Order #1 contains Tea @ ₹15 (Total ₹15).<br>2. Update Menu: Tea becomes ₹25.<br>3. Verify Order #1 total remains ₹15.<br>4. Verify Day 1 Analytics Tea total remains ₹15.<br>5. Create Order #2: Tea charged at new price ₹25. | AC 8 |
| **Tier 3** | `04-kitchen-audio-alert.spec.ts` | R4, AC 10 | 1. Attach audio play spy on Kitchen page.<br>2. Reception creates order.<br>3. Assert `window.__audioAlertsFired.length >= 1` within 5s.<br>4. Verify alert triggers only on new orders (not edits/settles). | AC 10 |
| **Tier 3** | `05-order-settle-cancel-sync.spec.ts` | R2, AC 4, AC 5, AC 6 | 1. Settle in reception $\rightarrow$ moves to Settled in kitchen within 5s.<br>2. Edit order in reception $\rightarrow$ updates items in kitchen within 5s.<br>3. Cancel order in reception $\rightarrow$ disappears from kitchen Pending within 5s.<br>4. Cancelled order excluded from analytics. | AC 4, AC 5, AC 6 |
| **Tier 4** | `01-cafe-rush-hour-simulation.spec.ts` | R1-R8 | 1. Simulate 20 rapid orders with mixed menu items.<br>2. Kitchen keeps pace in real time without lag.<br>3. Reception staff edits 3 orders on the fly.<br>4. Settle 15 orders, cancel 2 orders, leave 3 pending.<br>5. Sequence numbers remain strictly contiguous. | Workflow |
| **Tier 4** | `02-seeded-analytics-math-audit.spec.ts` | R5, AC 7 | 1. Seed deterministic 3-day dataset ($\ge 5$ items, mixed payments, cancelled orders).<br>2. Validate Day 1 item qtys, amounts, grand total, payment breakdown.<br>3. Validate Day 2 analytics matching exact math.<br>4. Validate Day 3 analytics matching exact math.<br>5. Ensure zero variance with manual spreadsheet calculation. | AC 7 |
| **Tier 4** | `03-full-day-lifecycle-e2e.spec.ts` | R1-R8 | 1. Full cafe day lifecycle: open morning with PIN.<br>2. Update menu special item.<br>3. Process lunch orders.<br>4. Mark orders settled as kitchen finishes them.<br>5. End-of-day reconciliation in Analytics dashboard. | Workflow |
| **Screenshots** | `generate-deliverable-screenshots.spec.ts` | Deliverables | 1. Capture 7 phone viewport (375px) screenshots for deliverables.<br>2. Store in `./screenshots/` with exact names specified in AC. | Deliverable 2 |

---

### 4.3 Technical Blueprint & Fixture Code

#### 1. Playwright Windows Configuration (`playwright.config.ts`)
```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: false, // Ensure sequential execution for stateful tests
  workers: 1,           // Single worker prevents DB collisions during restart & concurrency tests
  retries: 0,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }]
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    viewport: { width: 375, height: 667 }, // iPhone SE / standard 375px mobile viewport
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    timezoneId: 'Asia/Kolkata',
    locale: 'en-IN',
  },
  webServer: {
    command: 'npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
```

#### 2. Package.json Script Definitions
```json
{
  "scripts": {
    "test": "playwright test",
    "test:e2e": "playwright test",
    "test:tier1": "playwright test tests/e2e/tier1-feature-coverage",
    "test:tier2": "playwright test tests/e2e/tier2-boundary-edge",
    "test:tier3": "playwright test tests/e2e/tier3-interactions",
    "test:tier4": "playwright test tests/e2e/tier4-real-world-workflows",
    "test:screenshots": "playwright test tests/e2e/screenshots",
    "test:headed": "playwright test --headed"
  }
}
```

#### 3. Viewport 375px Overflow Checker Helper (`tests/helpers/overflow-checker.ts`)
```ts
import { Page, expect } from '@playwright/test';

export async function assertNoHorizontalOverflow(page: Page, viewName: string) {
  const result = await page.evaluate(() => {
    const docWidth = document.documentElement.clientWidth;
    const bodyScrollWidth = document.body.scrollWidth;
    const docScrollWidth = document.documentElement.scrollWidth;

    const offendingElements: Array<{ tag: string; id: string; className: string; right: number }> = [];
    const elements = document.querySelectorAll('*');
    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      if (rect.right > docWidth + 1) { // 1px margin of error for subpixel antialiasing
        offendingElements.push({
          tag: el.tagName,
          id: el.id,
          className: el.className,
          right: rect.right
        });
      }
    }

    return {
      docWidth,
      bodyScrollWidth,
      docScrollWidth,
      hasOverflow: bodyScrollWidth > docWidth || docScrollWidth > docWidth || offendingElements.length > 0,
      offending: offendingElements.slice(0, 5)
    };
  });

  expect(
    result.hasOverflow,
    `Horizontal overflow detected on "${viewName}"! Viewport clientWidth: ${result.docWidth}px, Body scrollWidth: ${result.bodyScrollWidth}px. Offending: ${JSON.stringify(result.offending)}`
  ).toBe(false);
}
```

#### 4. Kitchen Audio Spy Helper (`tests/helpers/audio-spy.ts`)
```ts
import { Page } from '@playwright/test';

export async function installAudioSpy(page: Page) {
  await page.addInitScript(() => {
    window.__kothaAudioPlayedCount = 0;
    window.__kothaAudioPlayedEvents = [];

    // Spy on HTMLAudioElement
    const originalPlay = HTMLAudioElement.prototype.play;
    HTMLAudioElement.prototype.play = function() {
      window.__kothaAudioPlayedCount++;
      window.__kothaAudioPlayedEvents.push({
        source: this.src || 'inline',
        timestamp: Date.now()
      });
      window.dispatchEvent(new CustomEvent('kotha-sound-played', { detail: { src: this.src } }));
      return Promise.resolve(); // Prevent unhandled rejection in headless mode
    };

    // Spy on Web Audio API AudioContext if synthesizer sound is used
    if (window.AudioContext || (window as any).webkitAudioContext) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const originalResume = AudioCtx.prototype.resume;
      AudioCtx.prototype.resume = function() {
        window.__kothaAudioPlayedCount++;
        return originalResume ? originalResume.apply(this) : Promise.resolve();
      };
    }
  });
}
```

#### 5. Seeded Analytics Mathematical Fixture (`tests/fixtures/seeded-analytics.fixture.ts`)
```ts
export interface SeedOrderItem {
  name: string;
  qty: number;
  price: number;
}

export interface SeedOrder {
  orderNumber: number;
  items: SeedOrderItem[];
  paymentMethod: 'Cash' | 'UPI' | 'Card';
  status: 'SETTLED' | 'CANCELLED' | 'PENDING';
}

export interface ExpectedDayAnalytics {
  date: string; // YYYY-MM-DD
  itemSales: Record<string, { qty: number; amount: number }>;
  paymentTotals: {
    Cash: number;
    UPI: number;
    Card: number;
  };
  grandTotal: number;
}

export const SEEDED_3DAY_DATASET: Record<string, SeedOrder[]> = {
  '2026-10-10': [
    {
      orderNumber: 1,
      paymentMethod: 'Cash',
      status: 'SETTLED',
      items: [
        { name: 'Tea', qty: 2, price: 15 },            // ₹30
        { name: 'Chicken Momo', qty: 1, price: 60 }    // ₹60
      ]                                                // Order Total: ₹90
    },
    {
      orderNumber: 2,
      paymentMethod: 'UPI',
      status: 'SETTLED',
      items: [
        { name: 'Cold Coffee', qty: 1, price: 50 },     // ₹50
        { name: 'French Fries', qty: 2, price: 50 }    // ₹100
      ]                                                // Order Total: ₹150
    },
    {
      orderNumber: 3,
      paymentMethod: 'Card',
      status: 'SETTLED',
      items: [
        { name: 'Cappuccino', qty: 1, price: 30 }      // ₹30
      ]                                                // Order Total: ₹30
    },
    {
      orderNumber: 4,
      paymentMethod: 'Cash',
      status: 'CANCELLED', // Cancelled MUST NOT count in analytics
      items: [
        { name: 'Veg grill sandwich', qty: 1, price: 59 }
      ]
    }
  ],
  '2026-10-11': [
    {
      orderNumber: 1,
      paymentMethod: 'UPI',
      status: 'SETTLED',
      items: [
        { name: 'White Sauce Pasta', qty: 2, price: 70 }, // ₹140
        { name: 'Green Mint Mojito', qty: 2, price: 49 }  // ₹98
      ]                                                   // Order Total: ₹238
    },
    {
      orderNumber: 2,
      paymentMethod: 'Card',
      status: 'SETTLED',
      items: [
        { name: 'Chocolate Shake', qty: 1, price: 99 },        // ₹99
        { name: 'Chicken grill sandwich', qty: 1, price: 79 }  // ₹79
      ]                                                        // Order Total: ₹178
    },
    {
      orderNumber: 3,
      paymentMethod: 'UPI',
      status: 'PENDING', // Pending MUST NOT count in analytics until settled
      items: [
        { name: 'Peri Peri Fried Momo', qty: 1, price: 75 }
      ]
    }
  ],
  '2026-10-12': [
    {
      orderNumber: 1,
      paymentMethod: 'Cash',
      status: 'SETTLED',
      items: [
        { name: 'Fish Finger', qty: 2, price: 89 },    // ₹178
        { name: 'Biscoff Shake', qty: 1, price: 110 }  // ₹110
      ]                                                // Order Total: ₹288
    },
    {
      orderNumber: 2,
      paymentMethod: 'Cash',
      status: 'SETTLED',
      items: [
        { name: 'Tea', qty: 4, price: 15 },             // ₹60
        { name: 'Chicken Popcorn', qty: 1, price: 79 }  // ₹79
      ]                                                // Order Total: ₹139
    },
    {
      orderNumber: 3,
      paymentMethod: 'Card',
      status: 'SETTLED',
      items: [
        { name: 'Blue Lagoon', qty: 2, price: 49 }     // ₹98
      ]                                                // Order Total: ₹98
    }
  ]
};

// Mathematically computed ground truth:
export const EXPECTED_ANALYTICS: Record<string, ExpectedDayAnalytics> = {
  '2026-10-10': {
    date: '2026-10-10',
    itemSales: {
      'Tea': { qty: 2, amount: 30 },
      'Chicken Momo': { qty: 1, amount: 60 },
      'Cold Coffee': { qty: 1, amount: 50 },
      'French Fries': { qty: 2, amount: 100 },
      'Cappuccino': { qty: 1, amount: 30 }
    },
    paymentTotals: {
      Cash: 90,
      UPI: 150,
      Card: 30
    },
    grandTotal: 270
  },
  '2026-10-11': {
    date: '2026-10-11',
    itemSales: {
      'White Sauce Pasta': { qty: 2, amount: 140 },
      'Green Mint Mojito': { qty: 2, amount: 98 },
      'Chocolate Shake': { qty: 1, amount: 99 },
      'Chicken grill sandwich': { qty: 1, amount: 79 }
    },
    paymentTotals: {
      Cash: 0,
      UPI: 238,
      Card: 178
    },
    grandTotal: 416
  },
  '2026-10-12': {
    date: '2026-10-12',
    itemSales: {
      'Fish Finger': { qty: 2, amount: 178 },
      'Biscoff Shake': { qty: 1, amount: 110 },
      'Tea': { qty: 4, amount: 60 },
      'Chicken Popcorn': { qty: 1, amount: 79 },
      'Blue Lagoon': { qty: 2, amount: 98 }
    },
    paymentTotals: {
      Cash: 427,
      UPI: 0,
      Card: 98
    },
    grandTotal: 525
  }
};
```

#### 6. Multi-Session Sync & Audio Verification Test Blueprint (`tests/e2e/tier3-interactions/01-realtime-kitchen-sync.spec.ts`)
```ts
import { test, expect } from '@playwright/test';
import { installAudioSpy } from '../../helpers/audio-spy';

test('Order created in reception appears in kitchen within 5s with audio alert and no reload', async ({ browser }) => {
  // 1. Create two isolated contexts (Reception and Kitchen)
  const receptionContext = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const kitchenContext = await browser.newContext({ viewport: { width: 375, height: 667 } });

  const receptionPage = await receptionContext.newPage();
  const kitchenPage = await kitchenContext.newPage();

  // 2. Install audio spy & page reload token on kitchen
  await installAudioSpy(kitchenPage);
  await kitchenPage.addInitScript(() => {
    (window as any).__initialPageLoadToken = Math.random();
  });

  // 3. Open Kitchen page
  await kitchenPage.goto('/kitchen');
  const kitchenLoadToken = await kitchenPage.evaluate(() => (window as any).__initialPageLoadToken);

  // 4. Open Reception page and authenticate with PIN
  await receptionPage.goto('/reception');
  await receptionPage.fill('input[type="password"]', '1234'); // Default PIN
  await receptionPage.click('button:has-text("Unlock")');

  // 5. Create new order
  await receptionPage.click('button:has-text("New Order")');
  await receptionPage.click('[data-testid="item-cappuccino"]');
  await receptionPage.click('[data-testid="item-cappuccino"]'); // Qty 2
  await receptionPage.click('[data-testid="item-chicken-momo"]'); // Qty 1
  await receptionPage.click('button:has-text("UPI")');

  const startTime = Date.now();
  await receptionPage.click('button:has-text("Create Order")');

  // 6. Assert order appears on kitchen screen in < 5 seconds
  const kitchenOrderCard = kitchenPage.locator('[data-testid^="order-card-"]').first();
  await expect(kitchenOrderCard).toBeVisible({ timeout: 5000 });
  const elapsed = Date.now() - startTime;
  expect(elapsed).toBeLessThan(5000);

  // 7. Verify no reload occurred
  const currentKitchenToken = await kitchenPage.evaluate(() => (window as any).__initialPageLoadToken);
  expect(currentKitchenToken).toBe(kitchenLoadToken);

  // 8. Verify audio alert was triggered
  const audioCount = await kitchenPage.evaluate(() => (window as any).__kothaAudioPlayedCount);
  expect(audioCount).toBeGreaterThanOrEqual(1);

  // Cleanup
  await receptionContext.close();
  await kitchenContext.close();
});
```

#### 7. Automated Screenshot Generator Blueprint (`tests/e2e/screenshots/generate-deliverable-screenshots.spec.ts`)
```ts
import { test } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('Automated Deliverable Screenshots', () => {
  const screenshotDir = path.resolve(process.cwd(), 'screenshots');

  test.beforeAll(() => {
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
  });

  test('Capture 7 mobile viewport screenshots', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    // 1. Landing View
    await page.goto('/');
    await page.screenshot({ path: path.join(screenshotDir, '01_landing.png') });

    // 2. Reception PIN Unlock & Create Order View
    await page.goto('/reception');
    await page.fill('input[type="password"]', '1234');
    await page.click('button:has-text("Unlock")');
    await page.click('button:has-text("New Order")');
    await page.click('[data-testid="item-cappuccino"]');
    await page.click('[data-testid="item-chicken-momo"]');
    await page.screenshot({ path: path.join(screenshotDir, '02_create_order.png') });

    // 3. Order Confirmation Slip
    await page.click('button:has-text("UPI")');
    await page.click('button:has-text("Create Order")');
    await page.waitForSelector('[data-testid="order-confirmation-slip"]');
    await page.screenshot({ path: path.join(screenshotDir, '03_order_confirmation_slip.png') });

    // 4. Reception Pending Orders View
    await page.goto('/reception/pending');
    await page.screenshot({ path: path.join(screenshotDir, '04_reception_pending.png') });

    // 5. Reception Settled Orders View
    await page.goto('/reception/settled');
    await page.screenshot({ path: path.join(screenshotDir, '05_reception_settled.png') });

    // 6. Reception Analytics View
    await page.goto('/reception/analytics');
    await page.screenshot({ path: path.join(screenshotDir, '06_reception_analytics.png') });

    // 7. Kitchen View
    await page.goto('/kitchen');
    await page.screenshot({ path: path.join(screenshotDir, '07_kitchen_view.png') });
  });
});
```

---

## 5. Verification Method

To independently verify this E2E testing architecture once implementation is in place:

1. **Turnkey Test Command Execution**:
   - Run in Windows PowerShell:
     ```powershell
     npm test
     ```
   - Alternatively:
     ```powershell
     npm run test:e2e
     ```
   - Expected Result: Playwright launches the local web server via `webServer` block in `playwright.config.ts`, executes all 4 test tiers sequentially (or with configured workers), and reports 100% passing tests with zero timeouts.

2. **Targeted Tier Execution**:
   ```powershell
   npm run test:tier1      # Feature coverage
   npm run test:tier2      # Concurrency, PIN 401/403, 375px overflow, restart
   npm run test:tier3      # Real-time sync <5s, date roll #1 reset, price immutability, audio
   npm run test:tier4      # Rush hour simulation, 3-day seeded analytics math audit
   npm run test:screenshots # Automated screenshot capture
   ```

3. **Deliverable Screenshots Verification**:
   - Inspect directory: `d:\kotha&coffee\screenshots`
   - Confirm presence of all 7 PNG files:
     - `01_landing.png`
     - `02_create_order.png`
     - `03_order_confirmation_slip.png`
     - `04_reception_pending.png`
     - `05_reception_settled.png`
     - `06_reception_analytics.png`
     - `07_kitchen_view.png`
   - Check image dimensions are exactly 375px wide (phone viewport) with readable UI elements.

4. **Invalidation Conditions**:
   - Any test requiring manual browser interactions or external cloud accounts.
   - Any test failing on Windows due to Unix shell commands (e.g. `export`, `kill -9`).
   - Failure of real-time sync taking $>5\text{ seconds}$ or relying on page refresh.
   - Any horizontal scrollbar detected (`scrollWidth > clientWidth`) at 375px width.
   - Inability to verify audio playback or clock rollover deterministically.
