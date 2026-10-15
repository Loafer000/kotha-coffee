import http from 'http';
import assert from 'assert';
import { startServer, stopServer } from '../src/server/index.js';
import { getDbClient } from '../src/server/db/client.js';

const TEST_PORT = 3185;
const BASE_URL = `http://localhost:${TEST_PORT}`;

interface HttpResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: any;
  raw: string;
}

function httpRequest(options: {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: any;
}): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(options.path, BASE_URL);
    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    let payload: string | undefined;
    if (options.body !== undefined) {
      payload = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      reqHeaders['Content-Length'] = Buffer.byteLength(payload).toString();
    }

    const req = http.request(
      url,
      {
        method: options.method,
        headers: reqHeaders
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          let parsed: any = data;
          try {
            parsed = JSON.parse(data);
          } catch {
            // raw string fallback
          }
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: parsed,
            raw: data
          });
        });
      }
    );

    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

let checksPassed = 0;
let checksFailed = 0;

function check(description: string, fn: () => void | boolean) {
  try {
    const res = fn();
    if (res === false) {
      throw new Error('Condition returned false');
    }
    checksPassed++;
    console.log(`  [PASS] ${description}`);
  } catch (err: any) {
    checksFailed++;
    console.error(`  [FAIL] ${description} -> ${err.message}`);
  }
}

async function runChallengerM5Suite() {
  console.log('========================================================================');
  console.log('=== CHALLENGER 1: Empirical Adversarial Mathematical Integrity & Edge ===');
  console.log('=== (Milestone 5: Reception Analytics Engine & Invariant Verification) ===');
  console.log('========================================================================\n');

  let server: any = null;
  let authToken = '';
  let authHeaders: Record<string, string> = {};

  try {
    // -------------------------------------------------------------------------
    // Setup: Launch Server & Authenticate
    // -------------------------------------------------------------------------
    console.log(`[Setup] Starting Express server on port ${TEST_PORT}...`);
    process.env.PORT = String(TEST_PORT);
    server = await startServer(TEST_PORT);
    console.log(`[Setup] Server active at ${BASE_URL}`);

    // Clean DB & Clock
    await httpRequest({ method: 'POST', path: '/api/test/reset' });
    await httpRequest({ method: 'POST', path: '/api/test/reset-time' });

    // Authenticate with PIN 1234
    const loginRes = await httpRequest({
      method: 'POST',
      path: '/api/auth/verify-pin',
      body: { pin: '1234' }
    });
    assert.strictEqual(loginRes.status, 200, 'PIN login must succeed');
    authToken = loginRes.body.token;
    authHeaders = { Authorization: `Bearer ${authToken}` };
    console.log('  [Setup] Authenticated successfully with PIN 1234.\n');

    // Fetch initial menu items to retrieve IDs
    const menuRes = await httpRequest({ method: 'GET', path: '/api/menu' });
    assert.strictEqual(menuRes.status, 200, 'Menu listing must return 200');
    const menuList: any[] = menuRes.body;
    const findItem = (name: string) => {
      const it = menuList.find((m) => m.name.toLowerCase() === name.toLowerCase());
      if (!it) throw new Error(`Menu item not found: ${name}`);
      return it;
    };

    const coldCoffee = findItem('Cold Coffee');
    const chickenSandwich = findItem('Chicken Sandwich');
    const tea = findItem('Darjeeling Tea');
    const espresso = findItem('Espresso');
    const vegBurger = findItem('Veg Burger');
    const chickenMomo = findItem('Chicken Momo (5 pcs)');

    console.log('  [Setup] Loaded 6 reference menu items from seeded catalog.\n');

    // =========================================================================
    // SECTION 1: Route Authentication & Guarding
    // =========================================================================
    console.log('--- SECTION 1: Route Authentication & Security Guarding ---');

    // 1.1 Unauthenticated request rejected
    const unauthRes = await httpRequest({ method: 'GET', path: '/api/analytics' });
    check('Unauthenticated GET /api/analytics returns 401', () => unauthRes.status === 401);

    // 1.2 Invalid bearer token rejected
    const invalidTokenRes = await httpRequest({
      method: 'GET',
      path: '/api/analytics',
      headers: { Authorization: 'Bearer totally-bogus-token' }
    });
    check('Invalid Bearer token returns 401', () => invalidTokenRes.status === 401);

    // 1.3 Non-Bearer auth header rejected
    const basicAuthRes = await httpRequest({
      method: 'GET',
      path: '/api/analytics',
      headers: { Authorization: 'Basic dXNlcjpwYXNz' }
    });
    check('Basic Auth header rejected with 401', () => basicAuthRes.status === 401);

    // 1.4 Non-GET methods rejected
    const postRes = await httpRequest({
      method: 'POST',
      path: '/api/analytics',
      headers: authHeaders,
      body: { date: '2026-10-10' }
    });
    check('POST /api/analytics returns 404/405', () => postRes.status === 404 || postRes.status === 405);

    // =========================================================================
    // SECTION 2: Empty Date Clean Zeros & Mathematical Equality
    // =========================================================================
    console.log('\n--- SECTION 2: Empty Date Clean Zeros & Invariant Preservation ---');

    const emptyDate = '2026-01-01';
    const emptyRes = await httpRequest({
      method: 'GET',
      path: `/api/analytics?date=${emptyDate}`,
      headers: authHeaders
    });

    check('Empty date returns HTTP 200', () => emptyRes.status === 200);
    const emptyBody = emptyRes.body;
    check('Empty date reports grandTotal === 0', () => emptyBody.grandTotal === 0);
    check('Empty date reports orderCount === 0', () => emptyBody.orderCount === 0);
    check('Empty date Cash total is 0 and count is 0', () => emptyBody.paymentBreakdown.Cash.total === 0 && emptyBody.paymentBreakdown.Cash.count === 0);
    check('Empty date UPI total is 0 and count is 0', () => emptyBody.paymentBreakdown.UPI.total === 0 && emptyBody.paymentBreakdown.UPI.count === 0);
    check('Empty date Card total is 0 and count is 0', () => emptyBody.paymentBreakdown.Card.total === 0 && emptyBody.paymentBreakdown.Card.count === 0);
    check('Empty date itemSales is empty array', () => Array.isArray(emptyBody.itemSales) && emptyBody.itemSales.length === 0);

    const emptyPaySum = emptyBody.paymentBreakdown.Cash.total + emptyBody.paymentBreakdown.UPI.total + emptyBody.paymentBreakdown.Card.total;
    const emptyItemSum = emptyBody.itemSales.reduce((acc: number, it: any) => acc + (it.totalRevenue || 0), 0);
    check('Empty date invariant holds: grandTotal === Cash + UPI + Card === sum(itemSales)', () => {
      return emptyBody.grandTotal === emptyPaySum && emptyBody.grandTotal === emptyItemSum && emptyBody.grandTotal === 0;
    });

    // =========================================================================
    // SECTION 3: Multi-Day Adversarial Dataset (>= 3 Days, >= 5 Items, Mixed Payments)
    // =========================================================================
    console.log('\n--- SECTION 3: Multi-Day Adversarial Dataset & Exact Mathematical Equality ---');

    // -------------------------------------------------------------------------
    // Day 1: 2026-10-10 (4 Settled, 1 Pending, 1 Cancelled)
    // -------------------------------------------------------------------------
    const day1 = '2026-10-10';
    console.log(`\n  [Day 1 Setup: ${day1}] Seeding mixed orders...`);
    await httpRequest({ method: 'POST', path: '/api/test/set-time', body: { dateKey: day1 } });

    // Order 1.1: Settled, Cash, Cold Coffee (10x @ 50 = 500) + Chicken Sandwich (5x @ 150 = 750) -> ₹1250
    const o1_1 = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [
          { menuItemId: coldCoffee.id, quantity: 10 },
          { menuItemId: chickenSandwich.id, quantity: 5 }
        ],
        paymentMethod: 'Cash'
      }
    });
    assert.strictEqual(o1_1.status, 201);
    await httpRequest({ method: 'POST', path: `/api/orders/${o1_1.body.id}/done`, headers: authHeaders });

    // Order 1.2: Settled, UPI, Darjeeling Tea (20x @ 30 = 600) -> ₹600
    const o1_2 = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [{ menuItemId: tea.id, quantity: 20 }],
        paymentMethod: 'UPI'
      }
    });
    assert.strictEqual(o1_2.status, 201);
    await httpRequest({ method: 'POST', path: `/api/orders/${o1_2.body.id}/done`, headers: authHeaders });

    // Order 1.3: Settled, Card, Espresso (10x @ 90 = 900) -> ₹900
    const o1_3 = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [{ menuItemId: espresso.id, quantity: 10 }],
        paymentMethod: 'Card'
      }
    });
    assert.strictEqual(o1_3.status, 201);
    await httpRequest({ method: 'POST', path: `/api/orders/${o1_3.body.id}/done`, headers: authHeaders });

    // Order 1.4: PENDING (Cash) - Veg Burger (8x @ 100 = 800) -> MUST PRODUCE ZERO LEAKAGE
    const o1_4 = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [{ menuItemId: vegBurger.id, quantity: 8 }],
        paymentMethod: 'Cash'
      }
    });
    assert.strictEqual(o1_4.status, 201);
    assert.strictEqual(o1_4.body.status, 'PENDING');

    // Order 1.5: CANCELLED (UPI) - Chicken Momo (10x @ 60 = 600) -> MUST PRODUCE ZERO LEAKAGE
    const o1_5 = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [{ menuItemId: chickenMomo.id, quantity: 10 }],
        paymentMethod: 'UPI'
      }
    });
    assert.strictEqual(o1_5.status, 201);
    const cancelRes = await httpRequest({
      method: 'DELETE',
      path: `/api/orders/${o1_5.body.id}`,
      headers: authHeaders
    });
    assert.strictEqual(cancelRes.status, 200);

    // Order 1.6: PENDING, then EDITED items & payment, then SETTLED:
    // Started with 1x Espresso (₹90 Cash) -> Edited to 5x Cold Coffee (250) + 5x Darjeeling Tea (150) = ₹400 Card
    const o1_6 = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [{ menuItemId: espresso.id, quantity: 1 }],
        paymentMethod: 'Cash'
      }
    });
    assert.strictEqual(o1_6.status, 201);

    const editRes = await httpRequest({
      method: 'PATCH',
      path: `/api/orders/${o1_6.body.id}`,
      headers: authHeaders,
      body: {
        items: [
          { menuItemId: coldCoffee.id, quantity: 5 },
          { menuItemId: tea.id, quantity: 5 }
        ],
        paymentMethod: 'Card'
      }
    });
    assert.strictEqual(editRes.status, 200);
    assert.strictEqual(editRes.body.totalAmount, 400);

    // Settle Order 1.6
    await httpRequest({ method: 'POST', path: `/api/orders/${o1_6.body.id}/done`, headers: authHeaders });

    // Verify Day 1 Analytics
    console.log(`\n  [Day 1 Verification: ${day1}] Checking mathematical integrity and zero leakage...`);
    const day1AnalyticsRes = await httpRequest({
      method: 'GET',
      path: `/api/analytics?date=${day1}`,
      headers: authHeaders
    });
    check('Day 1 analytics request succeeds with HTTP 200', () => day1AnalyticsRes.status === 200);
    const d1 = day1AnalyticsRes.body;

    // Expected Day 1 calculations:
    // Settled orders: o1_1 (1250 Cash), o1_2 (600 UPI), o1_3 (900 Card), o1_6 (400 Card)
    // grandTotal: 1250 + 600 + 900 + 400 = 3150
    // orderCount: 4
    // Cash: 1250 (1 order)
    // UPI: 600 (1 order)
    // Card: 1300 (2 orders)
    check('Day 1 orderCount === 4', () => d1.orderCount === 4);
    check('Day 1 grandTotal === 3150.00', () => d1.grandTotal === 3150);
    check('Day 1 Cash total === 1250.00, count === 1', () => d1.paymentBreakdown.Cash.total === 1250 && d1.paymentBreakdown.Cash.count === 1);
    check('Day 1 UPI total === 600.00, count === 1', () => d1.paymentBreakdown.UPI.total === 600 && d1.paymentBreakdown.UPI.count === 1);
    check('Day 1 Card total === 1300.00, count === 2', () => d1.paymentBreakdown.Card.total === 1300 && d1.paymentBreakdown.Card.count === 2);

    const d1PaymentSum = d1.paymentBreakdown.Cash.total + d1.paymentBreakdown.UPI.total + d1.paymentBreakdown.Card.total;
    check('Day 1 exact equality: grandTotal === Cash + UPI + Card', () => d1.grandTotal === d1PaymentSum);

    // Item sales verification:
    // Cold Coffee: 10 + 5 = 15 qty, ₹750
    // Chicken Sandwich: 5 qty, ₹750
    // Darjeeling Tea: 20 + 5 = 25 qty, ₹750
    // Espresso: 10 qty, ₹900
    // Veg Burger (Pending o1_4): 0 qty, ₹0 revenue (MUST BE ABSENT)
    // Chicken Momo (Cancelled o1_5): 0 qty, ₹0 revenue (MUST BE ABSENT)
    const findItemSale = (name: string) => d1.itemSales.find((it: any) => it.itemName.toLowerCase() === name.toLowerCase());

    const d1CoffeeSale = findItemSale('Cold Coffee');
    check('Day 1 Cold Coffee totalQuantity === 15', () => d1CoffeeSale && d1CoffeeSale.totalQuantity === 15);
    check('Day 1 Cold Coffee totalRevenue === 750', () => d1CoffeeSale && d1CoffeeSale.totalRevenue === 750);

    const d1SandwichSale = findItemSale('Chicken Sandwich');
    check('Day 1 Chicken Sandwich totalQuantity === 5', () => d1SandwichSale && d1SandwichSale.totalQuantity === 5);
    check('Day 1 Chicken Sandwich totalRevenue === 750', () => d1SandwichSale && d1SandwichSale.totalRevenue === 750);

    const d1TeaSale = findItemSale('Darjeeling Tea');
    check('Day 1 Darjeeling Tea totalQuantity === 25', () => d1TeaSale && d1TeaSale.totalQuantity === 25);
    check('Day 1 Darjeeling Tea totalRevenue === 750', () => d1TeaSale && d1TeaSale.totalRevenue === 750);

    const d1EspressoSale = findItemSale('Espresso');
    check('Day 1 Espresso totalQuantity === 10', () => d1EspressoSale && d1EspressoSale.totalQuantity === 10);
    check('Day 1 Espresso totalRevenue === 900', () => d1EspressoSale && d1EspressoSale.totalRevenue === 900);

    // ZERO LEAKAGE ASSERTIONS FOR DAY 1
    const d1BurgerSale = findItemSale('Veg Burger');
    check('ZERO LEAKAGE: Pending order item "Veg Burger" is 100% absent from itemSales', () => d1BurgerSale === undefined);

    const d1MomoSale = findItemSale('Chicken Momo (5 pcs)');
    check('ZERO LEAKAGE: Cancelled order item "Chicken Momo" is 100% absent from itemSales', () => d1MomoSale === undefined);

    // Mathematical sum of item revenues
    const d1ItemRevSum = d1.itemSales.reduce((acc: number, it: any) => acc + it.totalRevenue, 0);
    check('Day 1 exact equality: grandTotal === sum(itemSales.totalRevenue)', () => d1.grandTotal === d1ItemRevSum);

    // Verify itemSales ordering: totalRevenue DESC, then totalQuantity DESC
    // Espresso (900) should be index 0
    check('Day 1 itemSales sorted by totalRevenue DESC (Espresso is first)', () => d1.itemSales[0].itemName === 'Espresso');

    // -------------------------------------------------------------------------
    // Day 2: 2026-10-11 (2 Settled, 1 Pending, 1 Cancelled)
    // -------------------------------------------------------------------------
    const day2 = '2026-10-11';
    console.log(`\n  [Day 2 Setup: ${day2}] Seeding cross-day partition orders...`);
    await httpRequest({ method: 'POST', path: '/api/test/set-time', body: { dateKey: day2 } });

    // Order 2.1: Settled, UPI, Veg Burger (3x @ 100 = 300) + Cold Coffee (2x @ 50 = 100) -> ₹400
    const o2_1 = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [
          { menuItemId: vegBurger.id, quantity: 3 },
          { menuItemId: coldCoffee.id, quantity: 2 }
        ],
        paymentMethod: 'UPI'
      }
    });
    assert.strictEqual(o2_1.status, 201);
    await httpRequest({ method: 'POST', path: `/api/orders/${o2_1.body.id}/done`, headers: authHeaders });

    // Order 2.2: Settled, Cash, Chicken Momo (5x @ 60 = 300) -> ₹300
    const o2_2 = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [{ menuItemId: chickenMomo.id, quantity: 5 }],
        paymentMethod: 'Cash'
      }
    });
    assert.strictEqual(o2_2.status, 201);
    await httpRequest({ method: 'POST', path: `/api/orders/${o2_2.body.id}/done`, headers: authHeaders });

    // Order 2.3: PENDING (Card) - Espresso (5x @ 90 = 450) -> ZERO LEAKAGE
    const o2_3 = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [{ menuItemId: espresso.id, quantity: 5 }],
        paymentMethod: 'Card'
      }
    });
    assert.strictEqual(o2_3.status, 201);

    // Order 2.4: CANCELLED (Cash) - Darjeeling Tea (10x @ 30 = 300) -> ZERO LEAKAGE
    const o2_4 = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [{ menuItemId: tea.id, quantity: 10 }],
        paymentMethod: 'Cash'
      }
    });
    assert.strictEqual(o2_4.status, 201);
    await httpRequest({ method: 'DELETE', path: `/api/orders/${o2_4.body.id}`, headers: authHeaders });

    // Verify Day 2 Analytics
    console.log(`\n  [Day 2 Verification: ${day2}] Checking date partitioning and math...`);
    const day2AnalyticsRes = await httpRequest({
      method: 'GET',
      path: `/api/analytics?date=${day2}`,
      headers: authHeaders
    });
    check('Day 2 analytics request succeeds with HTTP 200', () => day2AnalyticsRes.status === 200);
    const d2 = day2AnalyticsRes.body;

    check('Day 2 orderCount === 2', () => d2.orderCount === 2);
    check('Day 2 grandTotal === 700.00', () => d2.grandTotal === 700);
    check('Day 2 Cash total === 300.00, count === 1', () => d2.paymentBreakdown.Cash.total === 300 && d2.paymentBreakdown.Cash.count === 1);
    check('Day 2 UPI total === 400.00, count === 1', () => d2.paymentBreakdown.UPI.total === 400 && d2.paymentBreakdown.UPI.count === 1);
    check('Day 2 Card total === 0.00, count === 0', () => d2.paymentBreakdown.Card.total === 0 && d2.paymentBreakdown.Card.count === 0);

    const d2PaymentSum = d2.paymentBreakdown.Cash.total + d2.paymentBreakdown.UPI.total + d2.paymentBreakdown.Card.total;
    check('Day 2 exact equality: grandTotal === Cash + UPI + Card', () => d2.grandTotal === d2PaymentSum);

    const d2ItemRevSum = d2.itemSales.reduce((acc: number, it: any) => acc + it.totalRevenue, 0);
    check('Day 2 exact equality: grandTotal === sum(itemSales.totalRevenue)', () => d2.grandTotal === d2ItemRevSum);

    const d2Espresso = d2.itemSales.find((it: any) => it.itemName.toLowerCase() === 'espresso');
    check('ZERO LEAKAGE: Pending Espresso in Day 2 is 100% absent from Day 2 itemSales', () => d2Espresso === undefined);

    const d2Tea = d2.itemSales.find((it: any) => it.itemName.toLowerCase() === 'darjeeling tea');
    check('ZERO LEAKAGE: Cancelled Tea in Day 2 is 100% absent from Day 2 itemSales', () => d2Tea === undefined);

    // Cross-Day Invariance Check: Re-query Day 1 to ensure zero cross-day leakage
    const reDay1 = await httpRequest({ method: 'GET', path: `/api/analytics?date=${day1}`, headers: authHeaders });
    check('Cross-day isolation: Day 1 grandTotal remains 3150 after Day 2 operations', () => reDay1.body.grandTotal === 3150);
    check('Cross-day isolation: Day 1 orderCount remains 4 after Day 2 operations', () => reDay1.body.orderCount === 4);

    // -------------------------------------------------------------------------
    // Day 3: 2026-10-12 (ONLY Pending and Cancelled Orders, 0 Settled)
    // -------------------------------------------------------------------------
    const day3 = '2026-10-12';
    console.log(`\n  [Day 3 Setup: ${day3}] Seeding day with 100% unfulfilled (pending & cancelled) orders...`);
    await httpRequest({ method: 'POST', path: '/api/test/set-time', body: { dateKey: day3 } });

    // Order 3.1: PENDING Cash ₹900
    const o3_1 = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: { items: [{ menuItemId: espresso.id, quantity: 10 }], paymentMethod: 'Cash' }
    });
    assert.strictEqual(o3_1.status, 201);

    // Order 3.2: PENDING UPI ₹500
    const o3_2 = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: { items: [{ menuItemId: vegBurger.id, quantity: 5 }], paymentMethod: 'UPI' }
    });
    assert.strictEqual(o3_2.status, 201);

    // Order 3.3: CANCELLED Card ₹600
    const o3_3 = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: { items: [{ menuItemId: chickenSandwich.id, quantity: 4 }], paymentMethod: 'Card' }
    });
    assert.strictEqual(o3_3.status, 201);
    await httpRequest({ method: 'DELETE', path: `/api/orders/${o3_3.body.id}`, headers: authHeaders });

    // Verify Day 3 Analytics: MUST RETURN CLEAN ZEROS EVEN WITH EXISTING PENDING/CANCELLED ORDERS
    console.log(`\n  [Day 3 Verification: ${day3}] Checking strict exclusion of non-settled orders...`);
    const day3AnalyticsRes = await httpRequest({
      method: 'GET',
      path: `/api/analytics?date=${day3}`,
      headers: authHeaders
    });
    check('Day 3 analytics request succeeds with HTTP 200', () => day3AnalyticsRes.status === 200);
    const d3 = day3AnalyticsRes.body;

    check('Day 3 with only pending/cancelled orders reports grandTotal === 0', () => d3.grandTotal === 0);
    check('Day 3 orderCount === 0', () => d3.orderCount === 0);
    check('Day 3 Cash total === 0 and count === 0', () => d3.paymentBreakdown.Cash.total === 0 && d3.paymentBreakdown.Cash.count === 0);
    check('Day 3 UPI total === 0 and count === 0', () => d3.paymentBreakdown.UPI.total === 0 && d3.paymentBreakdown.UPI.count === 0);
    check('Day 3 Card total === 0 and count === 0', () => d3.paymentBreakdown.Card.total === 0 && d3.paymentBreakdown.Card.count === 0);
    check('Day 3 itemSales is empty array', () => Array.isArray(d3.itemSales) && d3.itemSales.length === 0);

    const d3PaySum = d3.paymentBreakdown.Cash.total + d3.paymentBreakdown.UPI.total + d3.paymentBreakdown.Card.total;
    const d3ItemSum = d3.itemSales.reduce((acc: number, it: any) => acc + (it.totalRevenue || 0), 0);
    check('Day 3 invariant holds: grandTotal === Cash + UPI + Card === sum(itemSales)', () => {
      return d3.grandTotal === d3PaySum && d3.grandTotal === d3ItemSum && d3.grandTotal === 0;
    });

    // =========================================================================
    // SECTION 4: Tamper Resistance & Order Lifecycle Invariants
    // =========================================================================
    console.log('\n--- SECTION 4: Tamper Resistance & Order Transition Invariants ---');

    // 4.1 Attempt to cancel an already-settled order (Order 1.1)
    const cancelSettledRes = await httpRequest({
      method: 'DELETE',
      path: `/api/orders/${o1_1.body.id}`,
      headers: authHeaders
    });
    check('Attempt to cancel a SETTLED order rejected with HTTP 409', () => cancelSettledRes.status === 409);

    // Verify analytics for Day 1 is completely intact
    const postCancelCheck = await httpRequest({ method: 'GET', path: `/api/analytics?date=${day1}`, headers: authHeaders });
    check('Day 1 analytics grandTotal remains 3150 after rejected cancel attempt', () => postCancelCheck.body.grandTotal === 3150);

    // 4.2 Attempt to settle an already-cancelled order (Order 1.5)
    const settleCancelledRes = await httpRequest({
      method: 'POST',
      path: `/api/orders/${o1_5.body.id}/done`,
      headers: authHeaders
    });
    check('Attempt to settle a CANCELLED order rejected with HTTP 409', () => settleCancelledRes.status === 409);

    // 4.3 Pending order edited then cancelled: verify zero leakage
    const day4 = '2026-10-13';
    await httpRequest({ method: 'POST', path: '/api/test/set-time', body: { dateKey: day4 } });

    const o4_temp = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: { items: [{ menuItemId: espresso.id, quantity: 2 }], paymentMethod: 'Cash' }
    });
    assert.strictEqual(o4_temp.status, 201);

    // Edit while pending
    await httpRequest({
      method: 'PATCH',
      path: `/api/orders/${o4_temp.body.id}`,
      headers: authHeaders,
      body: { items: [{ menuItemId: espresso.id, quantity: 20 }], paymentMethod: 'UPI' }
    });

    // Now cancel
    await httpRequest({ method: 'DELETE', path: `/api/orders/${o4_temp.body.id}`, headers: authHeaders });

    const day4Analytics = await httpRequest({ method: 'GET', path: `/api/analytics?date=${day4}`, headers: authHeaders });
    check('Edited-then-cancelled order produces zero leakage on Day 4 (grandTotal === 0)', () => day4Analytics.body.grandTotal === 0);

    // =========================================================================
    // SECTION 5: Menu Price Immutability vs Historical Analytics
    // =========================================================================
    console.log('\n--- SECTION 5: Menu Price Immutability vs Historical Analytics ---');

    const day5 = '2026-10-14';
    await httpRequest({ method: 'POST', path: '/api/test/set-time', body: { dateKey: day5 } });

    // Mutate menu item price: Change Cold Coffee from ₹50 to ₹95
    const originalPrice = coldCoffee.price;
    const mutateMenuRes = await httpRequest({
      method: 'PUT',
      path: `/api/menu/${coldCoffee.id}`,
      headers: authHeaders,
      body: {
        name: coldCoffee.name,
        category: coldCoffee.category,
        price: 95
      }
    });
    check('Menu item price update to ₹95 succeeds', () => mutateMenuRes.status === 200);

    // Create and settle an order at new price ₹95 (2x @ 95 = ₹190)
    const o5_newPrice = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [{ menuItemId: coldCoffee.id, quantity: 2 }],
        paymentMethod: 'Cash'
      }
    });
    assert.strictEqual(o5_newPrice.status, 201);
    assert.strictEqual(o5_newPrice.body.totalAmount, 190);
    await httpRequest({ method: 'POST', path: `/api/orders/${o5_newPrice.body.id}/done`, headers: authHeaders });

    // Verify Day 5 analytics shows ₹190
    const d5Res = await httpRequest({ method: 'GET', path: `/api/analytics?date=${day5}`, headers: authHeaders });
    check('Day 5 analytics reflects new price total ₹190', () => d5Res.body.grandTotal === 190);

    // Adversarial verification: Historical Day 1 analytics MUST BE UNCHANGED
    const reCheckDay1 = await httpRequest({ method: 'GET', path: `/api/analytics?date=${day1}`, headers: authHeaders });
    check('HISTORICAL IMMUTABILITY: Day 1 grandTotal is still 3150 after menu price change', () => reCheckDay1.body.grandTotal === 3150);
    const d1CoffeeAfter = reCheckDay1.body.itemSales.find((it: any) => it.itemName.toLowerCase() === 'cold coffee');
    check('HISTORICAL IMMUTABILITY: Day 1 Cold Coffee revenue is still 750 (not recalculated at new price)', () => d1CoffeeAfter.totalRevenue === 750);

    // Revert price back to original
    await httpRequest({
      method: 'PUT',
      path: `/api/menu/${coldCoffee.id}`,
      headers: authHeaders,
      body: {
        name: coldCoffee.name,
        category: coldCoffee.category,
        price: originalPrice
      }
    });

    // =========================================================================
    // SECTION 6: High Precision, Fractional Amounts & Extreme Quantities
    // =========================================================================
    console.log('\n--- SECTION 6: High Precision, Fractional Amounts & Extreme Quantities ---');

    const day6 = '2026-10-15';
    await httpRequest({ method: 'POST', path: '/api/test/set-time', body: { dateKey: day6 } });

    // Order 6.1: Fractional paise amounts (e.g., 3x @ ₹33.33 = ₹99.99 Cash)
    const o6_1 = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [{ name: 'Custom Fractional Tea', unitPrice: 33.33, quantity: 3 }],
        paymentMethod: 'Cash'
      }
    });
    assert.strictEqual(o6_1.status, 201);
    assert.strictEqual(o6_1.body.totalAmount, 99.99);
    await httpRequest({ method: 'POST', path: `/api/orders/${o6_1.body.id}/done`, headers: authHeaders });

    // Order 6.2: 7x @ ₹14.28 = ₹99.96 (UPI)
    const o6_2 = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [{ name: 'Custom Cookie', unitPrice: 14.28, quantity: 7 }],
        paymentMethod: 'UPI'
      }
    });
    assert.strictEqual(o6_2.status, 201);
    assert.strictEqual(o6_2.body.totalAmount, 99.96);
    await httpRequest({ method: 'POST', path: `/api/orders/${o6_2.body.id}/done`, headers: authHeaders });

    // Order 6.3: Large quantity order: 10,000x @ ₹50.00 = ₹500,000.00 (Card)
    const o6_3 = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [{ name: 'Bulk Catering Coffee', unitPrice: 50.00, quantity: 10000 }],
        paymentMethod: 'Card'
      }
    });
    assert.strictEqual(o6_3.status, 201);
    assert.strictEqual(o6_3.body.totalAmount, 500000);
    await httpRequest({ method: 'POST', path: `/api/orders/${o6_3.body.id}/done`, headers: authHeaders });

    // Verify Day 6 analytics
    const d6Res = await httpRequest({ method: 'GET', path: `/api/analytics?date=${day6}`, headers: authHeaders });
    check('Day 6 request returns 200', () => d6Res.status === 200);
    const d6 = d6Res.body;

    const expectedGrandTotal = 500199.95; // 99.99 + 99.96 + 500000
    check('Day 6 grandTotal matches exact sum with paise precision (500199.95)', () => d6.grandTotal === expectedGrandTotal);
    check('Day 6 Cash matches 99.99', () => d6.paymentBreakdown.Cash.total === 99.99);
    check('Day 6 UPI matches 99.96', () => d6.paymentBreakdown.UPI.total === 99.96);
    check('Day 6 Card matches 500000.00', () => d6.paymentBreakdown.Card.total === 500000);

    const d6PaySum = Math.round((d6.paymentBreakdown.Cash.total + d6.paymentBreakdown.UPI.total + d6.paymentBreakdown.Card.total) * 100) / 100;
    const d6ItemSum = Math.round(d6.itemSales.reduce((acc: number, it: any) => acc + it.totalRevenue, 0) * 100) / 100;
    check('Day 6 exact equality: grandTotal === Cash + UPI + Card', () => d6.grandTotal === d6PaySum);
    check('Day 6 exact equality: grandTotal === sum(itemSales.totalRevenue)', () => d6.grandTotal === d6ItemSum);

    // =========================================================================
    // SECTION 7: Adversarial Inputs, SQL Injections, Malformed Dates
    // =========================================================================
    console.log('\n--- SECTION 7: Adversarial Inputs, SQL Injection & Malformed Dates ---');

    // 7.1 SQL Injection payloads in `date` param
    const sqliPayloads = [
      "' OR 1=1 --",
      "2026-10-10' OR '1'='1",
      "2026-10-10'; DROP TABLE orders; --",
      "2026-10-10' UNION SELECT 1,2,3,4,5,6,7,8,9,10--",
      "2026-10-10' AND status='PENDING'--",
      "admin'--",
      "' OR ''='",
      "'; EXEC xp_cmdshell('dir');--"
    ];

    for (const sqli of sqliPayloads) {
      const res = await httpRequest({
        method: 'GET',
        path: `/api/analytics?date=${encodeURIComponent(sqli)}`,
        headers: authHeaders
      });
      check(`SQL Injection rejected with 400: ${sqli.slice(0, 30)}`, () => res.status === 400);
    }

    // 7.2 SQL Injection payloads in `dateKey` param
    const dateKeyPayloads = [
      "' OR 1=1 --",
      "2026-10-10; DELETE FROM orders; --"
    ];
    for (const sqli of dateKeyPayloads) {
      const res = await httpRequest({
        method: 'GET',
        path: `/api/analytics?dateKey=${encodeURIComponent(sqli)}`,
        headers: authHeaders
      });
      check(`dateKey SQL Injection rejected with 400: ${sqli.slice(0, 30)}`, () => res.status === 400);
    }

    // 7.3 Malformed dates
    const malformedDates = [
      "2026/10/10",
      "10-10-2026",
      "2026-1-1",
      "not-a-date",
      "2026-10-10T00:00:00.000Z",
      "2026-10-10 extra",
      "undefined",
      "null",
      "-026-10-10"
    ];

    for (const badDate of malformedDates) {
      const res = await httpRequest({
        method: 'GET',
        path: `/api/analytics?date=${encodeURIComponent(badDate)}`,
        headers: authHeaders
      });
      check(`Malformed date rejected with 400: "${badDate}"`, () => res.status === 400);
    }

    // 7.4 Non-existent dates that pass regex format (YYYY-MM-DD)
    const nonExistentDates = [
      "2099-12-31",
      "1900-01-01"
    ];
    for (const nonDate of nonExistentDates) {
      const res = await httpRequest({
        method: 'GET',
        path: `/api/analytics?date=${nonDate}`,
        headers: authHeaders
      });
      check(`Non-existent date ${nonDate} returns 200 with clean zeros`, () => {
        return res.status === 200 && res.body.grandTotal === 0 && res.body.orderCount === 0;
      });
    }

    // 7.5 Query param variations
    // dateKey alias working
    const dateKeyRes = await httpRequest({
      method: 'GET',
      path: `/api/analytics?dateKey=${day1}`,
      headers: authHeaders
    });
    check('Param alias dateKey retrieves target date analytics', () => dateKeyRes.status === 200 && dateKeyRes.body.grandTotal === 3150);

    // Empty date param falls back to current cafe date
    const emptyDateParamRes = await httpRequest({
      method: 'GET',
      path: `/api/analytics?date=`,
      headers: authHeaders
    });
    check('Empty ?date= falls back gracefully to current cafe date (HTTP 200)', () => emptyDateParamRes.status === 200);

    // Whitespace date param falls back to current cafe date
    const whitespaceDateParamRes = await httpRequest({
      method: 'GET',
      path: `/api/analytics?date=%20%20%20`,
      headers: authHeaders
    });
    check('Whitespace ?date= falls back gracefully to current cafe date (HTTP 200)', () => whitespaceDateParamRes.status === 200);

    // Missing param defaults to current cafe date
    const defaultDateRes = await httpRequest({
      method: 'GET',
      path: `/api/analytics`,
      headers: authHeaders
    });
    check('Omitted date param defaults to current cafe date (HTTP 200)', () => defaultDateRes.status === 200);

    // Array date param (?date=2026-10-10&date=2026-10-11)
    const arrayDateRes = await httpRequest({
      method: 'GET',
      path: `/api/analytics?date=2026-10-10&date=2026-10-11`,
      headers: authHeaders
    });
    check('Array date query parameter does not crash server (HTTP 200)', () => arrayDateRes.status === 200);

    // =========================================================================
    // FINAL SUMMARY
    // =========================================================================
    console.log('\n========================================================================');
    console.log('=== CHALLENGER 1 ADVERSARIAL STRESS TEST SUMMARY ===');
    console.log(`Total Checks Executed : ${checksPassed + checksFailed}`);
    console.log(`Passed                : ${checksPassed}`);
    console.log(`Failed                : ${checksFailed}`);
    console.log('========================================================================\n');

    if (checksFailed > 0) {
      console.error(`❌ FAILED: ${checksFailed} adversarial check(s) did not meet invariants.`);
      process.exitCode = 1;
    } else {
      console.log('✅ SUCCESS: All empirical adversarial mathematical and edge invariants verified cleanly!');
    }
  } catch (err: any) {
    console.error('[Fatal Error in Test Harness]', err);
    process.exitCode = 1;
  } finally {
    if (server) {
      console.log('[Teardown] Stopping test server...');
      await stopServer();
      console.log('[Teardown] Server terminated.');
    }
  }
}

runChallengerM5Suite();
