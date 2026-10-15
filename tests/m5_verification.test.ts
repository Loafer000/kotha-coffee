import http from 'http';
import assert from 'assert';
import { chromium, type Browser, type Page } from '@playwright/test';
import { startServer, stopServer } from '../src/server/index.js';

const TEST_PORT = 3115;
const BASE_URL = `http://localhost:${TEST_PORT}`;

function httpRequest(options: {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: any;
}): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any; raw: string }> {
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
            // keep raw string
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

async function runM5VerificationSuite() {
  console.log('================================================================');
  console.log('=== Starting Milestone 5 Verification Test Suite ===');
  console.log('=== (Reception Analytics Engine & Dashboard) ===');
  console.log('================================================================\n');

  let server: any = null;
  let browser: Browser | null = null;
  let page: Page | null = null;
  let authToken: string = '';
  let authHeaders: Record<string, string> = {};

  try {
    // -------------------------------------------------------------------------
    // Setup: Start server on TEST_PORT and acquire auth token
    // -------------------------------------------------------------------------
    console.log(`[Setup] Starting Express server on port ${TEST_PORT}...`);
    server = await startServer(TEST_PORT);
    console.log(`[Setup] Server running at ${BASE_URL}`);

    // Reset database and simulated clock
    await httpRequest({ method: 'POST', path: '/api/test/reset' });
    await httpRequest({ method: 'POST', path: '/api/test/reset-time' });

    // Authenticate with reception PIN 1234
    const loginRes = await httpRequest({
      method: 'POST',
      path: '/api/auth/verify-pin',
      body: { pin: '1234' }
    });
    assert.strictEqual(loginRes.status, 200, 'PIN verification must succeed');
    authToken = loginRes.body.token;
    authHeaders = { Authorization: `Bearer ${authToken}` };
    console.log('   Authenticated with default PIN (1234), acquired session token.\n');

    // -------------------------------------------------------------------------
    // Step 1: GET /api/analytics without token returns HTTP 401
    // -------------------------------------------------------------------------
    console.log('Step 1: Verifying GET /api/analytics route guard returns HTTP 401 without auth...');
    const unauthRes = await httpRequest({
      method: 'GET',
      path: '/api/analytics'
    });
    assert.strictEqual(unauthRes.status, 401, 'GET /api/analytics without token must return HTTP 401');
    assert.ok(unauthRes.body?.error, 'Response must contain error message');

    const invalidAuthRes = await httpRequest({
      method: 'GET',
      path: '/api/analytics',
      headers: { Authorization: 'Bearer invalid-token-string' }
    });
    assert.strictEqual(invalidAuthRes.status, 401, 'GET /api/analytics with invalid token must return HTTP 401');
    console.log('   ✓ Step 1 PASSED: Unauthenticated and invalid token requests rejected with HTTP 401.\n');

    // -------------------------------------------------------------------------
    // Step 2: Authenticated GET /api/analytics for date with zero orders returns clean zeros
    // -------------------------------------------------------------------------
    console.log('Step 2: Verifying authenticated GET /api/analytics for empty date returns clean zeros...');
    const zeroDate = '2026-01-01';
    const zeroRes = await httpRequest({
      method: 'GET',
      path: `/api/analytics?date=${zeroDate}`,
      headers: authHeaders
    });
    assert.strictEqual(zeroRes.status, 200, 'GET /api/analytics should return HTTP 200');
    const zeroData = zeroRes.body;

    assert.strictEqual(zeroData.date, zeroDate, `Date must match queried date ${zeroDate}`);
    assert.strictEqual(zeroData.grandTotal, 0, 'Grand total must be 0');
    assert.strictEqual(zeroData.orderCount, 0, 'Order count must be 0');

    // Verify all 3 payment methods are present with clean zeros
    assert.ok(zeroData.paymentBreakdown, 'paymentBreakdown must be present');
    assert.strictEqual(zeroData.paymentBreakdown.Cash.total, 0, 'Cash total must be 0');
    assert.strictEqual(zeroData.paymentBreakdown.Cash.count, 0, 'Cash count must be 0');
    assert.strictEqual(zeroData.paymentBreakdown.UPI.total, 0, 'UPI total must be 0');
    assert.strictEqual(zeroData.paymentBreakdown.UPI.count, 0, 'UPI count must be 0');
    assert.strictEqual(zeroData.paymentBreakdown.Card.total, 0, 'Card total must be 0');
    assert.strictEqual(zeroData.paymentBreakdown.Card.count, 0, 'Card count must be 0');

    // Verify itemSales is an empty array
    assert.ok(Array.isArray(zeroData.itemSales), 'itemSales must be an array');
    assert.strictEqual(zeroData.itemSales.length, 0, 'itemSales must be empty');

    // Invariant: grandTotal === Cash + UPI + Card === sum(itemSales)
    const zeroCash = zeroData.paymentBreakdown.Cash.total;
    const zeroUpi = zeroData.paymentBreakdown.UPI.total;
    const zeroCard = zeroData.paymentBreakdown.Card.total;
    const zeroItemSum = zeroData.itemSales.reduce((s: number, i: any) => s + (i.totalRevenue || 0), 0);
    assert.strictEqual(zeroData.grandTotal, zeroCash + zeroUpi + zeroCard);
    assert.strictEqual(zeroData.grandTotal, zeroItemSum);

    console.log('   ✓ Step 2 PASSED: Empty date returns clean zeros and maintains mathematical invariant.\n');

    // -------------------------------------------------------------------------
    // Step 3: Multi-order seed test
    // -------------------------------------------------------------------------
    console.log('Step 3: Seeding multi-order dataset on Date A (2026-10-15)...');
    const dateA = '2026-10-15';
    await httpRequest({
      method: 'POST',
      path: '/api/test/set-time',
      body: { dateKey: dateA }
    });

    // Order 1: Settle ₹500 via Cash (Cold Coffee 10x @ ₹50)
    const o1Create = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [{ name: 'Cold Coffee', unitPrice: 50, quantity: 10 }],
        paymentMethod: 'Cash'
      }
    });
    assert.strictEqual(o1Create.status, 201);
    const o1 = o1Create.body;
    assert.strictEqual(o1.totalAmount, 500);

    const o1Settle = await httpRequest({
      method: 'POST',
      path: `/api/orders/${o1.id}/done`,
      headers: authHeaders
    });
    assert.strictEqual(o1Settle.status, 200, 'Order 1 must settle successfully');

    // Order 2: Settle ₹350 via UPI (White Sauce Pasta 5x @ ₹70)
    const o2Create = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [{ name: 'White Sauce Pasta', unitPrice: 70, quantity: 5 }],
        paymentMethod: 'UPI'
      }
    });
    assert.strictEqual(o2Create.status, 201);
    const o2 = o2Create.body;
    assert.strictEqual(o2.totalAmount, 350);

    const o2Settle = await httpRequest({
      method: 'POST',
      path: `/api/orders/${o2.id}/done`,
      headers: authHeaders
    });
    assert.strictEqual(o2Settle.status, 200, 'Order 2 must settle successfully');

    // Order 3: Settle ₹150 via Card (Tea 10x @ ₹15)
    const o3Create = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [{ name: 'Tea', unitPrice: 15, quantity: 10 }],
        paymentMethod: 'Card'
      }
    });
    assert.strictEqual(o3Create.status, 201);
    const o3 = o3Create.body;
    assert.strictEqual(o3.totalAmount, 150);

    const o3Settle = await httpRequest({
      method: 'POST',
      path: `/api/orders/${o3.id}/done`,
      headers: authHeaders
    });
    assert.strictEqual(o3Settle.status, 200, 'Order 3 must settle successfully');

    // Order 4: PENDING ₹400 via UPI (French Fries 8x @ ₹50) - MUST BE EXCLUDED FROM ANALYTICS
    const o4Create = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [{ name: 'French Fries', unitPrice: 50, quantity: 8 }],
        paymentMethod: 'UPI'
      }
    });
    assert.strictEqual(o4Create.status, 201);
    const o4 = o4Create.body;
    assert.strictEqual(o4.status, 'PENDING');
    assert.strictEqual(o4.totalAmount, 400);

    // Order 5: Create and CANCEL ₹600 via Cash (Chicken Momo 10x @ ₹60) - MUST BE EXCLUDED FROM ANALYTICS
    const o5Create = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [{ name: 'Chicken Momo (5 pcs)', unitPrice: 60, quantity: 10 }],
        paymentMethod: 'Cash'
      }
    });
    assert.strictEqual(o5Create.status, 201);
    const o5 = o5Create.body;
    assert.strictEqual(o5.totalAmount, 600);

    const o5Cancel = await httpRequest({
      method: 'DELETE',
      path: `/api/orders/${o5.id}`,
      headers: authHeaders
    });
    assert.strictEqual(o5Cancel.status, 200, 'Order 5 must cancel successfully');

    console.log('   ✓ Step 3 PASSED: Seeded 3 Settled orders (₹500 Cash, ₹350 UPI, ₹150 Card), 1 Pending (₹400), 1 Cancelled (₹600).\n');

    // -------------------------------------------------------------------------
    // Step 4: Mathematical equality assertions
    // -------------------------------------------------------------------------
    console.log('Step 4: Verifying mathematical equality assertions & non-settled exclusion...');
    const analyticsRes = await httpRequest({
      method: 'GET',
      path: `/api/analytics?date=${dateA}`,
      headers: authHeaders
    });
    assert.strictEqual(analyticsRes.status, 200);
    const data = analyticsRes.body;

    // 1. grandTotal === 1000 (500 + 350 + 150)
    assert.strictEqual(data.grandTotal, 1000, 'grandTotal must be exactly ₹1000');

    // 2. orderCount === 3
    assert.strictEqual(data.orderCount, 3, 'orderCount must be exactly 3');

    // 3. paymentBreakdown splits
    assert.strictEqual(data.paymentBreakdown.Cash.total, 500, 'Cash total must be ₹500');
    assert.strictEqual(data.paymentBreakdown.Cash.count, 1, 'Cash order count must be 1');
    assert.strictEqual(data.paymentBreakdown.UPI.total, 350, 'UPI total must be ₹350');
    assert.strictEqual(data.paymentBreakdown.UPI.count, 1, 'UPI order count must be 1');
    assert.strictEqual(data.paymentBreakdown.Card.total, 150, 'Card total must be ₹150');
    assert.strictEqual(data.paymentBreakdown.Card.count, 1, 'Card order count must be 1');

    // 4. grandTotal === Cash + UPI + Card
    const splitSum = data.paymentBreakdown.Cash.total + data.paymentBreakdown.UPI.total + data.paymentBreakdown.Card.total;
    assert.strictEqual(data.grandTotal, splitSum, 'grandTotal must equal Cash.total + UPI.total + Card.total');

    // 5. itemSales checks
    assert.strictEqual(data.itemSales.length, 3, 'Only 3 items from settled orders should appear');
    const itemRevenueSum = data.itemSales.reduce((sum: number, it: any) => sum + it.totalRevenue, 0);
    assert.strictEqual(data.grandTotal, itemRevenueSum, 'grandTotal must equal sum of itemSales.totalRevenue');

    // Verify ordering by totalRevenue DESC
    assert.strictEqual(data.itemSales[0].itemName, 'Cold Coffee');
    assert.strictEqual(data.itemSales[0].totalRevenue, 500);
    assert.strictEqual(data.itemSales[0].totalQuantity, 10);
    assert.strictEqual(data.itemSales[0].percentage, 50);

    assert.strictEqual(data.itemSales[1].itemName, 'White Sauce Pasta');
    assert.strictEqual(data.itemSales[1].totalRevenue, 350);
    assert.strictEqual(data.itemSales[1].totalQuantity, 5);
    assert.strictEqual(data.itemSales[1].percentage, 35);

    assert.strictEqual(data.itemSales[2].itemName, 'Tea');
    assert.strictEqual(data.itemSales[2].totalRevenue, 150);
    assert.strictEqual(data.itemSales[2].totalQuantity, 10);
    assert.strictEqual(data.itemSales[2].percentage, 15);

    // Verify strict exclusion of pending and cancelled items
    const frenchFries = data.itemSales.find((it: any) => it.itemName === 'French Fries');
    assert.strictEqual(frenchFries, undefined, 'Pending order item "French Fries" must be strictly excluded');

    const chickenMomo = data.itemSales.find((it: any) => it.itemName === 'Chicken Momo (5 pcs)');
    assert.strictEqual(chickenMomo, undefined, 'Cancelled order item "Chicken Momo" must be strictly excluded');

    console.log('   ✓ Step 4 PASSED: Mathematical invariant (grandTotal === Cash + UPI + Card === sum(itemSales)) verified.\n');

    // -------------------------------------------------------------------------
    // Step 5: Date isolation
    // -------------------------------------------------------------------------
    console.log('Step 5: Verifying date isolation (orders on Date A do not appear in Date B)...');
    const dateB = '2026-10-16';
    await httpRequest({
      method: 'POST',
      path: '/api/test/set-time',
      body: { dateKey: dateB }
    });

    // Create & settle 1 order on Date B: ₹200 via Card (French Fries 4x @ ₹50)
    const oDateBCreate = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [{ name: 'French Fries', unitPrice: 50, quantity: 4 }],
        paymentMethod: 'Card'
      }
    });
    assert.strictEqual(oDateBCreate.status, 201);
    await httpRequest({
      method: 'POST',
      path: `/api/orders/${oDateBCreate.body.id}/done`,
      headers: authHeaders
    });

    // Query Date B analytics
    const dateBAnalytics = await httpRequest({
      method: 'GET',
      path: `/api/analytics?date=${dateB}`,
      headers: authHeaders
    });
    assert.strictEqual(dateBAnalytics.status, 200);
    assert.strictEqual(dateBAnalytics.body.grandTotal, 200, 'Date B grand total must be ₹200');
    assert.strictEqual(dateBAnalytics.body.orderCount, 1, 'Date B order count must be 1');
    assert.strictEqual(dateBAnalytics.body.paymentBreakdown.Card.total, 200);
    assert.strictEqual(dateBAnalytics.body.paymentBreakdown.Cash.total, 0);

    // Re-query Date A analytics to confirm total is untouched
    const dateARecheck = await httpRequest({
      method: 'GET',
      path: `/api/analytics?date=${dateA}`,
      headers: authHeaders
    });
    assert.strictEqual(dateARecheck.status, 200);
    assert.strictEqual(dateARecheck.body.grandTotal, 1000, 'Date A grand total must remain ₹1000');
    assert.strictEqual(dateARecheck.body.orderCount, 3, 'Date A order count must remain 3');

    console.log('   ✓ Step 5 PASSED: Strict date isolation verified between Date A and Date B.\n');

    // -------------------------------------------------------------------------
    // Step 6: Playwright browser test of Analytics UI
    // -------------------------------------------------------------------------
    console.log('Step 6: Executing Playwright browser test on Reception Analytics dashboard...');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 }
    });
    page = await context.newPage();

    // Set stored token in browser localStorage to bypass PIN modal
    await page.goto(`${BASE_URL}/reception`);
    await page.evaluate((tok: string) => {
      localStorage.setItem('kotha_reception_token', tok);
    }, authToken);
    await page.reload({ waitUntil: 'networkidle' });

    // Click Analytics Tab
    const analyticsTabBtn = page.locator('[data-testid="tab-analytics"]');
    await analyticsTabBtn.waitFor({ state: 'visible' });
    await analyticsTabBtn.click();

    // Wait for Analytics page container
    const analyticsPage = page.locator('[data-testid="analytics-page"]');
    await analyticsPage.waitFor({ state: 'visible' });

    // Set Date Picker to Date A (2026-10-15) to inspect seeded metrics
    const datePicker = page.locator('[data-testid="analytics-date-picker"]');
    await datePicker.fill(dateA);
    // Wait for analytics data fetch to finish
    await page.waitForTimeout(500);

    // Verify KPI Grand Total
    const grandTotalKpi = page.locator('[data-testid="kpi-grand-total"]');
    await grandTotalKpi.waitFor({ state: 'visible' });
    const grandTotalText = await grandTotalKpi.innerText();
    assert.ok(grandTotalText.includes('1000'), `Grand total KPI must include ₹1000, got: ${grandTotalText}`);

    // Verify KPI Order Count
    const orderCountKpi = page.locator('[data-testid="kpi-order-count"]');
    const orderCountText = await orderCountKpi.innerText();
    assert.ok(orderCountText.includes('3'), `Order count KPI must include 3, got: ${orderCountText}`);

    // Verify Payment Breakdown Cards
    const cashCard = page.locator('[data-testid="payment-split-cash"]');
    assert.ok((await cashCard.innerText()).includes('500'), 'Cash card must display ₹500');

    const upiCard = page.locator('[data-testid="payment-split-upi"]');
    assert.ok((await upiCard.innerText()).includes('350'), 'UPI card must display ₹350');

    const cardCard = page.locator('[data-testid="payment-split-card"]');
    assert.ok((await cardCard.innerText()).includes('150'), 'Card card must display ₹150');

    // Verify Itemized Sales List
    const itemList = page.locator('[data-testid="item-sales-list"]');
    await itemList.waitFor({ state: 'visible' });
    const itemListText = await itemList.innerText();
    assert.ok(itemListText.includes('Cold Coffee'), 'Item list must show Cold Coffee');
    assert.ok(itemListText.includes('White Sauce Pasta'), 'Item list must show White Sauce Pasta');
    assert.ok(itemListText.includes('Tea'), 'Item list must show Tea');
    assert.ok(!itemListText.includes('French Fries'), 'Item list must NOT show French Fries (pending)');
    assert.ok(!itemListText.includes('Chicken Momo'), 'Item list must NOT show Chicken Momo (cancelled)');

    // Test Switching Date Picker to Empty Date displays Empty State
    console.log('   -> Switching date picker to empty date (2026-01-01) ...');
    await datePicker.fill('2026-01-01');
    await page.waitForTimeout(500);

    const emptyState = page.locator('[data-testid="analytics-empty-state"]');
    await emptyState.waitFor({ state: 'visible' });
    const emptyStateText = await emptyState.innerText();
    assert.ok(emptyStateText.includes('No Settled Orders'), 'Empty state must be visible for empty date');

    // Mobile Viewport Check (375px width: scrollWidth <= clientWidth)
    console.log('   -> Verifying 375px mobile viewport ergonomics...');
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    console.log(`   -> Mobile viewport dimensions: scrollWidth=${scrollWidth}px, clientWidth=${clientWidth}px`);
    assert.ok(
      scrollWidth <= clientWidth,
      `Horizontal overflow detected! scrollWidth (${scrollWidth}) > clientWidth (${clientWidth})`
    );

    // Touch Targets Ergonomics Check: all navigation and action buttons >= 44px
    const touchButtons = page.locator(
      '[data-testid="btn-date-prev"], [data-testid="btn-date-next"], [data-testid="btn-date-today"], [data-testid="btn-date-yesterday"], [data-testid="analytics-date-picker"]'
    );
    const btnCount = await touchButtons.count();
    for (let i = 0; i < btnCount; i++) {
      const btn = touchButtons.nth(i);
      const box = await btn.boundingBox();
      assert.ok(box, `Button ${i} must have a bounding box`);
      assert.ok(
        box.height >= 43.5,
        `Touch target height must be >= 44px (got ${box.height.toFixed(1)}px for button ${i})`
      );
    }
    console.log('   -> Touch targets (prev/next/today/yesterday/picker) meet >= 44px ergonomics requirement.');

    console.log('   ✓ Step 6 PASSED: Playwright browser verification of Analytics dashboard complete.\n');

    console.log('================================================================');
    console.log('✅ ALL 6 MILESTONE 5 VERIFICATION STEPS PASSED CLEANLY!');
    console.log('================================================================\n');
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (server) {
      await stopServer().catch(() => {});
      console.log('[Teardown] Express server stopped.');
    }
  }
}

runM5VerificationSuite().catch((err) => {
  console.error('\n❌ Milestone 5 Verification Suite FAILED:\n', err);
  process.exit(1);
});
