import http from 'http';
import assert from 'assert';
import jwt from 'jsonwebtoken';
import { chromium, type Browser, type Page } from '@playwright/test';
import { startServer, stopServer } from '../src/server/index.js';

const TEST_PORT = 3133;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const JWT_SECRET = process.env.JWT_SECRET || 'kotha-coffee-reception-session-secret-2026';

function httpRequest(options: {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: any;
}): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any; raw: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(options.path, BASE_URL);
    const reqHeaders: Record<string, string> = {
      ...(options.headers || {})
    };

    let payload: string | undefined;
    if (options.body !== undefined) {
      payload = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      if (!reqHeaders['Content-Type']) {
        reqHeaders['Content-Type'] = 'application/json';
      }
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
            // Keep raw string
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

function createExpiredToken(): string {
  return jwt.sign(
    { role: 'reception', cafe: 'kotha-coffee', exp: Math.floor(Date.now() / 1000) - 3600 },
    JWT_SECRET
  );
}

function createForgedSecretToken(): string {
  return jwt.sign(
    { role: 'reception', cafe: 'kotha-coffee' },
    'malicious-attacker-secret-xyz'
  );
}

function createForgedRoleToken(): string {
  return jwt.sign(
    { role: 'kitchen', cafe: 'kotha-coffee' },
    JWT_SECRET
  );
}

function createNoneAlgorithmToken(): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ role: 'reception', cafe: 'kotha-coffee' })).toString('base64url');
  return `${header}.${payload}.`;
}

interface TestCheckRecord {
  section: string;
  check: string;
  passed: boolean;
  details?: string;
}

const checkResults: TestCheckRecord[] = [];

function recordCheck(section: string, check: string, passed: boolean, details?: string) {
  checkResults.push({ section, check, passed, details });
  const statusMark = passed ? '✓ PASS' : '✗ FAIL';
  console.log(`  [${statusMark}] [${section}] ${check}${details ? ` -> ${details}` : ''}`);
  if (!passed) {
    throw new Error(`Assertion failed: [${section}] ${check} - ${details}`);
  }
}

async function runAdversarialEdgeSuite() {
  console.log('========================================================================');
  console.log('=== Challenger 2: Milestone 4 Kitchen Edge & Adversarial Test Suite ===');
  console.log('=== Security, UI Isolation, Chime Triggers, Viewport & SSE Fallback  ===');
  console.log('========================================================================\n');

  let server: any;
  let browser: Browser | null = null;
  let authToken = '';

  try {
    // -------------------------------------------------------------------------
    // Setup: Start Express Server & initialize clean database
    // -------------------------------------------------------------------------
    console.log(`[Setup] Starting test server on port ${TEST_PORT} ...`);
    server = await startServer(TEST_PORT);
    console.log(`[Setup] Server running at ${BASE_URL}`);

    // Reset DB and Mock Clock
    await httpRequest({ method: 'POST', path: '/api/test/reset' });
    await httpRequest({ method: 'POST', path: '/api/test/reset-time' });

    // Acquire legitimate reception token for test setup actions
    const authRes = await httpRequest({
      method: 'POST',
      path: '/api/auth/verify-pin',
      body: { pin: '1234' }
    });
    assert.strictEqual(authRes.status, 200, 'PIN 1234 should verify');
    authToken = authRes.body.token;
    assert.ok(authToken, 'Obtained reception token');
    const authHeaders = { Authorization: `Bearer ${authToken}` };

    // Launch Chromium browser
    browser = await chromium.launch({ headless: true });

    // =========================================================================
    // SECTION 1: Direct Unauthenticated API Mutations (HTTP 401 Rejection)
    // =========================================================================
    console.log('\n--- Section 1: Direct Unauthenticated API Mutations (HTTP 401 Rejection) ---');

    // 1.1 POST /api/orders without Authorization header
    const unauthCreate = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      body: { items: [{ name: 'Tea', unitPrice: 15, quantity: 1 }] }
    });
    recordCheck('API Security', 'POST /api/orders without Authorization returns HTTP 401', unauthCreate.status === 401, `Status: ${unauthCreate.status}`);

    // 1.2 POST /api/orders with empty Authorization header
    const emptyAuthCreate = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: { Authorization: '' },
      body: { items: [{ name: 'Tea', unitPrice: 15, quantity: 1 }] }
    });
    recordCheck('API Security', 'POST /api/orders with empty Authorization returns HTTP 401', emptyAuthCreate.status === 401, `Status: ${emptyAuthCreate.status}`);

    // 1.3 POST /api/orders with invalid Bearer token
    const malformedTokenCreate = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: { Authorization: 'Bearer this-is-not-a-valid-token' },
      body: { items: [{ name: 'Tea', unitPrice: 15, quantity: 1 }] }
    });
    recordCheck('API Security', 'POST /api/orders with malformed token returns HTTP 401', malformedTokenCreate.status === 401, `Status: ${malformedTokenCreate.status}`);

    // 1.4 POST /api/orders with expired token
    const expiredTokenCreate = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: { Authorization: `Bearer ${createExpiredToken()}` },
      body: { items: [{ name: 'Tea', unitPrice: 15, quantity: 1 }] }
    });
    recordCheck('API Security', 'POST /api/orders with expired token returns HTTP 401', expiredTokenCreate.status === 401, `Status: ${expiredTokenCreate.status}`);

    // 1.5 POST /api/orders with forged secret token
    const forgedSecretCreate = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: { Authorization: `Bearer ${createForgedSecretToken()}` },
      body: { items: [{ name: 'Tea', unitPrice: 15, quantity: 1 }] }
    });
    recordCheck('API Security', 'POST /api/orders with forged secret token returns HTTP 401', forgedSecretCreate.status === 401, `Status: ${forgedSecretCreate.status}`);

    // 1.6 POST /api/orders with role="kitchen" token (kitchen role cannot mutate)
    const kitchenRoleCreate = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: { Authorization: `Bearer ${createForgedRoleToken()}` },
      body: { items: [{ name: 'Tea', unitPrice: 15, quantity: 1 }] }
    });
    recordCheck('API Security', 'POST /api/orders with non-reception role token returns HTTP 401', kitchenRoleCreate.status === 401, `Status: ${kitchenRoleCreate.status}`);

    // 1.7 POST /api/orders with alg="none" token
    const noneAlgCreate = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: { Authorization: `Bearer ${createNoneAlgorithmToken()}` },
      body: { items: [{ name: 'Tea', unitPrice: 15, quantity: 1 }] }
    });
    recordCheck('API Security', 'POST /api/orders with alg="none" token returns HTTP 401', noneAlgCreate.status === 401, `Status: ${noneAlgCreate.status}`);

    // 1.8 POST /api/orders with incorrect x-admin-pin header
    const badPinCreate = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: { 'x-admin-pin': '9999' },
      body: { items: [{ name: 'Tea', unitPrice: 15, quantity: 1 }] }
    });
    recordCheck('API Security', 'POST /api/orders with wrong x-admin-pin returns HTTP 401', badPinCreate.status === 401, `Status: ${badPinCreate.status}`);

    // Create an authenticated seed order for mutation testing
    const seedOrderRes = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [{ name: 'Cold Coffee', unitPrice: 50, quantity: 1 }],
        paymentMethod: 'Cash'
      }
    });
    assert.strictEqual(seedOrderRes.status, 201);
    const seedOrderId = seedOrderRes.body.id;

    // 1.9 Unauthenticated PATCH /api/orders/:id
    const unauthPatch = await httpRequest({
      method: 'PATCH',
      path: `/api/orders/${seedOrderId}`,
      body: { items: [{ name: 'Cold Coffee', unitPrice: 50, quantity: 3 }] }
    });
    recordCheck('API Security', 'PATCH /api/orders/:id without auth returns HTTP 401', unauthPatch.status === 401, `Status: ${unauthPatch.status}`);

    // 1.10 Unauthenticated PUT /api/orders/:id
    const unauthPut = await httpRequest({
      method: 'PUT',
      path: `/api/orders/${seedOrderId}`,
      body: { items: [{ name: 'Cold Coffee', unitPrice: 50, quantity: 3 }] }
    });
    recordCheck('API Security', 'PUT /api/orders/:id without auth returns HTTP 401', unauthPut.status === 401, `Status: ${unauthPut.status}`);

    // 1.11 Unauthenticated POST /api/orders/:id/done
    const unauthDone = await httpRequest({
      method: 'POST',
      path: `/api/orders/${seedOrderId}/done`
    });
    recordCheck('API Security', 'POST /api/orders/:id/done without auth returns HTTP 401', unauthDone.status === 401, `Status: ${unauthDone.status}`);

    // 1.12 Unauthenticated POST /api/orders/:id/settle
    const unauthSettle = await httpRequest({
      method: 'POST',
      path: `/api/orders/${seedOrderId}/settle`
    });
    recordCheck('API Security', 'POST /api/orders/:id/settle without auth returns HTTP 401', unauthSettle.status === 401, `Status: ${unauthSettle.status}`);

    // 1.13 Unauthenticated PATCH /api/orders/:id/settle
    const unauthPatchSettle = await httpRequest({
      method: 'PATCH',
      path: `/api/orders/${seedOrderId}/settle`
    });
    recordCheck('API Security', 'PATCH /api/orders/:id/settle without auth returns HTTP 401', unauthPatchSettle.status === 401, `Status: ${unauthPatchSettle.status}`);

    // 1.14 Unauthenticated DELETE /api/orders/:id
    const unauthDelete = await httpRequest({
      method: 'DELETE',
      path: `/api/orders/${seedOrderId}`
    });
    recordCheck('API Security', 'DELETE /api/orders/:id without auth returns HTTP 401', unauthDelete.status === 401, `Status: ${unauthDelete.status}`);

    // 1.15 Unauthenticated POST /api/menu
    const unauthMenuPost = await httpRequest({
      method: 'POST',
      path: '/api/menu',
      body: { name: 'Hacker Drink', category: 'Beverages', price: 999 }
    });
    recordCheck('API Security', 'POST /api/menu without auth returns HTTP 401', unauthMenuPost.status === 401, `Status: ${unauthMenuPost.status}`);

    // 1.16 Unauthenticated PUT /api/menu/:id
    const unauthMenuPut = await httpRequest({
      method: 'PUT',
      path: '/api/menu/beverages-tea-001',
      body: { name: 'Hacked Tea', price: 1 }
    });
    recordCheck('API Security', 'PUT /api/menu/:id without auth returns HTTP 401', unauthMenuPut.status === 401, `Status: ${unauthMenuPut.status}`);

    // 1.17 Unauthenticated DELETE /api/menu/:id
    const unauthMenuDelete = await httpRequest({
      method: 'DELETE',
      path: '/api/menu/beverages-tea-001'
    });
    recordCheck('API Security', 'DELETE /api/menu/:id without auth returns HTTP 401', unauthMenuDelete.status === 401, `Status: ${unauthMenuDelete.status}`);

    // 1.18 Verify legitimate public read-only endpoints return 200 without auth
    const publicKitchenOrders = await httpRequest({ method: 'GET', path: '/api/kitchen/orders' });
    recordCheck('API Security', 'GET /api/kitchen/orders is public and returns HTTP 200', publicKitchenOrders.status === 200, `Status: ${publicKitchenOrders.status}`);

    const publicMenu = await httpRequest({ method: 'GET', path: '/api/menu' });
    recordCheck('API Security', 'GET /api/menu is public and returns HTTP 200', publicMenu.status === 200, `Status: ${publicMenu.status}`);

    const publicHealth = await httpRequest({ method: 'GET', path: '/api/health' });
    recordCheck('API Security', 'GET /api/health is public and returns HTTP 200', publicHealth.status === 200, `Status: ${publicHealth.status}`);


    // =========================================================================
    // SECTION 2: Kitchen View UI Isolation & Read-Only Invariant
    // =========================================================================
    console.log('\n--- Section 2: Kitchen View UI Isolation & Read-Only Invariant ---');

    const context = await browser.newContext({
      viewport: { width: 375, height: 667 }
    });
    const page = await context.newPage();

    // Track all HTTP requests from this page
    const pageRequests: Array<{ method: string; url: string }> = [];
    page.on('request', (req) => {
      pageRequests.push({ method: req.method(), url: req.url() });
    });

    await page.goto(`${BASE_URL}/kitchen`, { waitUntil: 'networkidle' });

    // 2.1 Verify NO PIN prompt is shown
    const pinModals = await page.locator('[data-testid="pin-modal"], input[type="password"]').count();
    recordCheck('UI Isolation', 'Zero PIN modals or password inputs rendered on /kitchen', pinModals === 0, `Count: ${pinModals}`);

    // 2.2 Verify NO mutation buttons ("Done", "Edit", "Cancel", "Delete", "Add Order", etc.)
    const forbiddenLabels = ['Done', 'Edit', 'Cancel', 'Delete', 'Add Order', 'Create Order', 'Settle', 'Remove Item', 'Update'];
    for (const label of forbiddenLabels) {
      const btnCount = await page.locator(`button:has-text("${label}")`).count();
      recordCheck('UI Isolation', `No button with text "${label}" in kitchen display`, btnCount === 0, `Found: ${btnCount}`);
    }

    // 2.3 Verify NO input fields, forms, or selects exist
    const formControlsCount = await page.locator('input, textarea, select, form').count();
    recordCheck('UI Isolation', 'Zero input/form/select controls exist on kitchen display', formControlsCount === 0, `Count: ${formControlsCount}`);

    // 2.4 Verify all interactive controls in kitchen display are strictly sound-related
    const mainControls = await page.locator('main button, main [role="button"]').all();
    for (const btn of mainControls) {
      const text = (await btn.innerText()).trim();
      const title = (await btn.getAttribute('title')) || '';
      const aria = (await btn.getAttribute('aria-label')) || '';
      const combined = `${text} ${title} ${aria}`.toLowerCase();
      const isSoundControl = combined.includes('sound') || combined.includes('chime') || combined.includes('activate');
      recordCheck('UI Isolation', `Interactive control in kitchen is sound-related: "${text.slice(0, 30)}"`, isSoundControl, `Text: ${text}, Title: ${title}`);
    }

    // Verify header navigation button is strictly Home navigation (no mutation controls)
    const headerButtons = await page.locator('header button').all();
    for (const hBtn of headerButtons) {
      const title = (await hBtn.getAttribute('title')) || '';
      recordCheck('UI Isolation', `Header button is strictly navigation: "${title}"`, title === 'Home', `Title: ${title}`);
    }

    // 2.5 Verify clicking elements on the page NEVER fires mutating HTTP methods (POST, PUT, PATCH, DELETE)
    pageRequests.length = 0; // Clear requests log

    // Click sound button
    const soundToggle = page.locator('button:has-text("Enable Sound"), button:has-text("Sound ON")').first();
    if (await soundToggle.isVisible()) {
      await soundToggle.click();
      await page.waitForTimeout(100);
    }

    // Click ticket card if present
    const ticketCard = page.locator(`[data-testid="kitchen-ticket-${seedOrderId}"]`).first();
    if (await ticketCard.isVisible()) {
      await ticketCard.click();
      await page.waitForTimeout(100);
    }

    // Check if any mutating request was fired
    const mutatingRequests = pageRequests.filter((r) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method));
    recordCheck('UI Isolation', 'No mutating HTTP requests triggered by user interactions on /kitchen', mutatingRequests.length === 0, `Mutations observed: ${mutatingRequests.length}`);

    await page.close();
    await context.close();


    // =========================================================================
    // SECTION 3: Audio Chime Event Triggers & Monotonic Counter Increment
    // =========================================================================
    console.log('\n--- Section 3: Audio Chime Event Triggers & Monotonic Counter Increment ---');

    // Reset database to ensure clean sequence for sound tests
    await httpRequest({ method: 'POST', path: '/api/test/reset' });
    await httpRequest({ method: 'POST', path: '/api/test/reset-time' });

    const chimeContext = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const chimePage = await chimeContext.newPage();

    // Array to record dispatched custom events
    const dispatchedChimeEvents: Array<{ orderNumber: number; timestamp: number }> = [];
    await chimePage.exposeFunction('onSoundChimeCaptured', (detail: any) => {
      dispatchedChimeEvents.push({ orderNumber: detail.orderNumber, timestamp: Date.now() });
    });

    await chimePage.goto(`${BASE_URL}/kitchen`, { waitUntil: 'networkidle' });

    // Attach event listener to window in page context
    await chimePage.evaluate(() => {
      window.addEventListener('kitchen-sound-alert', (e: any) => {
        (window as any).onSoundChimeCaptured(e.detail);
      });
    });

    // Verify initial attribute
    const initialCountAttr = await chimePage.evaluate(() => document.body.getAttribute('data-kitchen-alert-count'));
    const initialCount = parseInt(initialCountAttr || '0', 10);
    recordCheck('Chime Triggers', 'Initial data-kitchen-alert-count is 0 or null', initialCount === 0, `Initial: ${initialCountAttr}`);

    // Unlock audio via mobile user gesture banner or button
    const enableBtn = chimePage.locator('button:has-text("Enable Sound"), [data-testid="enable-audio-banner"]').first();
    if (await enableBtn.isVisible()) {
      await enableBtn.click();
      await chimePage.waitForTimeout(100);
    }

    // Helper to create an order via reception API
    async function createOrderViaApi(items: any[], notes?: string) {
      return httpRequest({
        method: 'POST',
        path: '/api/orders',
        headers: authHeaders,
        body: { items, paymentMethod: 'Cash', notes }
      });
    }

    // Order 1 Creation
    console.log('   -> Creating Order #1 ...');
    const o1Res = await createOrderViaApi([{ name: 'Tea', unitPrice: 15, quantity: 1 }]);
    assert.strictEqual(o1Res.status, 201);
    const o1 = o1Res.body;
    await chimePage.locator(`[data-testid="kitchen-ticket-${o1.id}"]`).waitFor({ state: 'visible', timeout: 5000 });
    await chimePage.waitForTimeout(200);

    const countAfterO1 = await chimePage.evaluate(() => document.body.getAttribute('data-kitchen-alert-count'));
    recordCheck('Chime Triggers', 'Order #1 triggers kitchen-sound-alert and sets alert count to 1', countAfterO1 === '1' && dispatchedChimeEvents.length === 1 && dispatchedChimeEvents[0].orderNumber === 1, `Count: ${countAfterO1}, Events: ${dispatchedChimeEvents.length}`);

    // Order 2 Creation
    console.log('   -> Creating Order #2 ...');
    const o2Res = await createOrderViaApi([{ name: 'Espresso', unitPrice: 25, quantity: 2 }]);
    assert.strictEqual(o2Res.status, 201);
    const o2 = o2Res.body;
    await chimePage.locator(`[data-testid="kitchen-ticket-${o2.id}"]`).waitFor({ state: 'visible', timeout: 5000 });
    await chimePage.waitForTimeout(200);

    const countAfterO2 = await chimePage.evaluate(() => document.body.getAttribute('data-kitchen-alert-count'));
    recordCheck('Chime Triggers', 'Order #2 increments alert count to 2 monotonically', countAfterO2 === '2' && dispatchedChimeEvents.length === 2 && dispatchedChimeEvents[1].orderNumber === 2, `Count: ${countAfterO2}, Events: ${dispatchedChimeEvents.length}`);

    // Order 3 Creation
    console.log('   -> Creating Order #3 ...');
    const o3Res = await createOrderViaApi([{ name: 'Chicken Momo (5 pcs)', unitPrice: 60, quantity: 1 }]);
    assert.strictEqual(o3Res.status, 201);
    const o3 = o3Res.body;
    await chimePage.locator(`[data-testid="kitchen-ticket-${o3.id}"]`).waitFor({ state: 'visible', timeout: 5000 });
    await chimePage.waitForTimeout(200);

    const countAfterO3 = await chimePage.evaluate(() => document.body.getAttribute('data-kitchen-alert-count'));
    recordCheck('Chime Triggers', 'Order #3 increments alert count to 3 monotonically', countAfterO3 === '3' && dispatchedChimeEvents.length === 3 && dispatchedChimeEvents[2].orderNumber === 3, `Count: ${countAfterO3}, Events: ${dispatchedChimeEvents.length}`);

    // Non-creation events MUST NOT trigger chime alert:
    // A: Edit Order 2
    console.log('   -> Editing Order #2 (should NOT trigger sound alert) ...');
    await httpRequest({
      method: 'PATCH',
      path: `/api/orders/${o2.id}`,
      headers: authHeaders,
      body: { items: [{ name: 'Espresso', unitPrice: 25, quantity: 4 }] }
    });
    // Wait for the kitchen ticket to reflect edit
    await chimePage.locator(`[data-testid="kitchen-ticket-${o2.id}"]:has-text("4x")`).waitFor({ state: 'visible', timeout: 5000 });
    await chimePage.waitForTimeout(200);

    const countAfterEdit = await chimePage.evaluate(() => document.body.getAttribute('data-kitchen-alert-count'));
    recordCheck('Chime Triggers', 'Order edit does NOT increment alert count (stays 3)', countAfterEdit === '3' && dispatchedChimeEvents.length === 3, `Count: ${countAfterEdit}, Events: ${dispatchedChimeEvents.length}`);

    // B: Settle Order 1 ("Done")
    console.log('   -> Settling Order #1 (should NOT trigger sound alert) ...');
    await httpRequest({
      method: 'POST',
      path: `/api/orders/${o1.id}/done`,
      headers: authHeaders
    });
    await chimePage.locator(`[data-testid="kitchen-settled-${o1.id}"]`).waitFor({ state: 'visible', timeout: 5000 });
    await chimePage.waitForTimeout(200);

    const countAfterSettle = await chimePage.evaluate(() => document.body.getAttribute('data-kitchen-alert-count'));
    recordCheck('Chime Triggers', 'Order settlement does NOT increment alert count (stays 3)', countAfterSettle === '3' && dispatchedChimeEvents.length === 3, `Count: ${countAfterSettle}, Events: ${dispatchedChimeEvents.length}`);

    // C: Cancel Order 3
    console.log('   -> Cancelling Order #3 (should NOT trigger sound alert) ...');
    await httpRequest({
      method: 'DELETE',
      path: `/api/orders/${o3.id}`,
      headers: authHeaders
    });
    await chimePage.locator(`[data-testid="kitchen-ticket-${o3.id}"]`).waitFor({ state: 'detached', timeout: 5000 });
    await chimePage.waitForTimeout(200);

    const countAfterCancel = await chimePage.evaluate(() => document.body.getAttribute('data-kitchen-alert-count'));
    recordCheck('Chime Triggers', 'Order cancellation does NOT increment alert count (stays 3)', countAfterCancel === '3' && dispatchedChimeEvents.length === 3, `Count: ${countAfterCancel}, Events: ${dispatchedChimeEvents.length}`);

    // D: Order 4 Creation
    console.log('   -> Creating Order #4 ...');
    const o4Res = await createOrderViaApi([{ name: 'Brownie', unitPrice: 40, quantity: 1 }]);
    assert.strictEqual(o4Res.status, 201);
    const o4 = o4Res.body;
    await chimePage.locator(`[data-testid="kitchen-ticket-${o4.id}"]`).waitFor({ state: 'visible', timeout: 5000 });
    await chimePage.waitForTimeout(200);

    const countAfterO4 = await chimePage.evaluate(() => document.body.getAttribute('data-kitchen-alert-count'));
    recordCheck('Chime Triggers', 'Order #4 increments alert count to 4 monotonically', countAfterO4 === '4' && dispatchedChimeEvents.length === 4 && dispatchedChimeEvents[3].orderNumber === 4, `Count: ${countAfterO4}, Events: ${dispatchedChimeEvents.length}`);

    // Verify full monotonic order sequence
    const orderNumSequence = dispatchedChimeEvents.map((e) => e.orderNumber);
    const isStrictlyMonotonic = orderNumSequence.every((val, idx, arr) => idx === 0 || val > arr[idx - 1]);
    recordCheck('Chime Triggers', 'Dispatched order numbers sequence [1, 2, 3, 4] is strictly monotonic', isStrictlyMonotonic, `Sequence: [${orderNumSequence.join(', ')}]`);

    await chimePage.close();
    await chimeContext.close();


    // =========================================================================
    // SECTION 4: 375px Mobile Viewport & Ergonomics Conformance
    // =========================================================================
    console.log('\n--- Section 4: 375px Mobile Viewport & Ergonomics Conformance ---');

    // Create a few more orders with long titles and long notes to stress layout at 375px
    await createOrderViaApi(
      [
        { name: 'Chicken Cheese Sandwich (Club Deluxe Special)', unitPrice: 80, quantity: 3 },
        { name: 'Cappuccino (Milk Coffee - Extra Froth)', unitPrice: 30, quantity: 2 }
      ],
      'Super urgent chef instruction: please ensure items are packed separately in aluminum foil for takeout customer waiting outside.'
    );

    const mobileContext = await browser.newContext({
      viewport: { width: 375, height: 667 },
      deviceScaleFactor: 1
    });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(`${BASE_URL}/kitchen`, { waitUntil: 'networkidle' });

    // 4.1 Check window innerWidth is strictly 375
    const innerWidth = await mobilePage.evaluate(() => window.innerWidth);
    recordCheck('Mobile Ergonomics', 'Window innerWidth is 375px', innerWidth === 375, `Width: ${innerWidth}`);

    // 4.2 Document-level overflow check: scrollWidth <= clientWidth
    const docOverflow = await mobilePage.evaluate(() => {
      const docEl = document.documentElement;
      const body = document.body;
      return {
        docScrollWidth: docEl.scrollWidth,
        docClientWidth: docEl.clientWidth,
        bodyScrollWidth: body.scrollWidth,
        bodyClientWidth: body.clientWidth,
        hasDocOverflow: docEl.scrollWidth > docEl.clientWidth,
        hasBodyOverflow: body.scrollWidth > body.clientWidth
      };
    });

    recordCheck(
      'Mobile Ergonomics',
      'document.documentElement scrollWidth <= clientWidth (no horizontal scrollbar)',
      !docOverflow.hasDocOverflow,
      `docScroll: ${docOverflow.docScrollWidth}, docClient: ${docOverflow.docClientWidth}`
    );
    recordCheck(
      'Mobile Ergonomics',
      'document.body scrollWidth <= clientWidth (no horizontal overflow)',
      !docOverflow.hasBodyOverflow,
      `bodyScroll: ${docOverflow.bodyScrollWidth}, bodyClient: ${docOverflow.bodyClientWidth}`
    );

    // 4.3 Attempt horizontal scroll, verify scrollX remains 0
    const scrollX = await mobilePage.evaluate(() => {
      window.scrollTo(100, 0);
      return window.scrollX;
    });
    recordCheck('Mobile Ergonomics', 'Window scrollX is 0 after horizontal scroll attempt', scrollX === 0, `scrollX: ${scrollX}`);

    // 4.4 DOM Element Bounding Box Crawler (every visible element must fit within 375px)
    const overflowingElements = await mobilePage.evaluate(() => {
      const badElements: Array<{ tag: string; id: string; className: string; right: number; width: number }> = [];
      const allEls = document.querySelectorAll('*');
      for (let i = 0; i < allEls.length; i++) {
        const el = allEls[i] as HTMLElement;
        const rect = el.getBoundingClientRect();
        // Ignore invisible or zero-width elements
        if (rect.width === 0 || rect.height === 0) continue;
        // Check if right edge exceeds 375.5px (accounting for sub-pixel rendering)
        if (rect.right > 375.5) {
          badElements.push({
            tag: el.tagName.toLowerCase(),
            id: el.id,
            className: el.className ? String(el.className).slice(0, 50) : '',
            right: Math.round(rect.right * 10) / 10,
            width: Math.round(rect.width * 10) / 10
          });
        }
      }
      return badElements;
    });

    recordCheck(
      'Mobile Ergonomics',
      'All DOM elements fit within 375px viewport (zero horizontal overflow)',
      overflowingElements.length === 0,
      overflowingElements.length > 0 ? `Overflowing: ${JSON.stringify(overflowingElements.slice(0, 3))}` : '0 elements overflowing'
    );

    // 4.5 Touch target sizing checks (min-height >= 44px)
    const buttonDimensions = await mobilePage.evaluate(() => {
      const soundBtn = document.querySelector('button');
      if (!soundBtn) return { width: 0, height: 0 };
      const rect = soundBtn.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    recordCheck(
      'Mobile Ergonomics',
      'Sound toggle button satisfies minimum touch target >= 44px height',
      buttonDimensions.height >= 44,
      `Height: ${buttonDimensions.height}px, Width: ${buttonDimensions.width}px`
    );

    await mobilePage.close();
    await mobileContext.close();


    // =========================================================================
    // SECTION 5: SSE Abort / Block Resilience & Fallback Polling
    // =========================================================================
    console.log('\n--- Section 5: SSE Abort / Block Resilience & Fallback Polling ---');

    const fallbackContext = await browser.newContext({
      viewport: { width: 375, height: 667 }
    });
    const fallbackPage = await fallbackContext.newPage();

    // Listen for sound alerts on fallback page as well
    const fallbackSoundAlerts: any[] = [];
    await fallbackPage.exposeFunction('onFallbackSoundAlert', (detail: any) => {
      fallbackSoundAlerts.push(detail);
    });

    // Abort all connections to /api/events to simulate network failure or SSE blocked by proxy
    console.log('   -> Intercepting and aborting /api/events to force fallback polling mode ...');
    await fallbackPage.route('**/api/events', (route) => {
      route.abort('failed');
    });

    await fallbackPage.goto(`${BASE_URL}/kitchen`, { waitUntil: 'domcontentloaded' });

    await fallbackPage.evaluate(() => {
      window.addEventListener('kitchen-sound-alert', (e: any) => {
        (window as any).onFallbackSoundAlert(e.detail);
      });
    });

    // Wait for SSE failure to trigger fallback polling and POLL badge
    console.log('   -> Waiting for kitchen display to indicate POLL mode ...');
    const pollBadge = fallbackPage.locator('span:has-text("POLL")');
    await pollBadge.waitFor({ state: 'visible', timeout: 5000 });
    recordCheck('Fallback Polling', 'Display automatically switches to POLL mode when SSE fails', true, 'POLL badge rendered');

    // 5.1 Create Order #5 via API and verify polling picks it up within 5 seconds
    console.log('   -> Creating Order #5 via API during blocked SSE; checking sync within 5s ...');
    const startPollCreate = Date.now();
    const order5Res = await createOrderViaApi(
      [{ name: 'Cold Coffee', unitPrice: 50, quantity: 2 }],
      'Fallback polling test order'
    );
    assert.strictEqual(order5Res.status, 201);
    const order5 = order5Res.body;

    const ticket5Locator = fallbackPage.locator(`[data-testid="kitchen-ticket-${order5.id}"]`);
    await ticket5Locator.waitFor({ state: 'visible', timeout: 5500 });
    const pollCreateElapsed = Date.now() - startPollCreate;

    console.log(`      Order #5 appeared via fallback polling in ${pollCreateElapsed}ms`);
    recordCheck(
      'Fallback Polling',
      'New order syncs via fallback polling within 5 seconds (< 5500ms)',
      pollCreateElapsed <= 5500,
      `Elapsed: ${pollCreateElapsed}ms`
    );

    // Verify ticket 5 content
    const ticket5Text = await ticket5Locator.innerText();
    assert.ok(ticket5Text.includes('2x'), 'Ticket shows 2x quantity');
    assert.ok(ticket5Text.includes('Cold Coffee'), 'Ticket shows Cold Coffee');
    assert.ok(ticket5Text.includes('Fallback polling test order'), 'Ticket shows note');

    // 5.2 Verify audio chime triggered during fallback polling for new order
    await fallbackPage.waitForTimeout(200);
    const pollAlertAttr = await fallbackPage.evaluate(() => document.body.getAttribute('data-kitchen-alert-count'));
    recordCheck(
      'Fallback Polling',
      'New order detected via polling triggers chime event hook',
      parseInt(pollAlertAttr || '0', 10) >= 1 && fallbackSoundAlerts.some((a) => a.orderNumber === order5.daily_order_number),
      `Alert count: ${pollAlertAttr}, Events captured: ${fallbackSoundAlerts.length}`
    );

    // 5.3 Edit Order #5 via API and verify polling updates the ticket within 5 seconds
    console.log('   -> Editing Order #5 via API during blocked SSE; checking sync within 5s ...');
    const startPollEdit = Date.now();
    await httpRequest({
      method: 'PATCH',
      path: `/api/orders/${order5.id}`,
      headers: authHeaders,
      body: {
        items: [{ name: 'Cold Coffee', unitPrice: 50, quantity: 5 }],
        notes: 'Updated to 5 cups via polling'
      }
    });

    await fallbackPage.locator(`[data-testid="kitchen-ticket-${order5.id}"]:has-text("5x")`).waitFor({
      state: 'visible',
      timeout: 5500
    });
    const pollEditElapsed = Date.now() - startPollEdit;
    console.log(`      Order #5 edit appeared via fallback polling in ${pollEditElapsed}ms`);
    recordCheck(
      'Fallback Polling',
      'Order edit syncs via fallback polling within 5 seconds (< 5500ms)',
      pollEditElapsed <= 5500,
      `Elapsed: ${pollEditElapsed}ms`
    );

    // 5.4 Settle Order #5 via API and verify polling moves it to Settled within 5 seconds
    console.log('   -> Settling Order #5 via API during blocked SSE; checking sync within 5s ...');
    const startPollSettle = Date.now();
    await httpRequest({
      method: 'POST',
      path: `/api/orders/${order5.id}/done`,
      headers: authHeaders
    });

    // Wait for detachment from pending
    await ticket5Locator.waitFor({ state: 'detached', timeout: 5500 });
    // Wait for appearance in settled
    await fallbackPage.locator(`[data-testid="kitchen-settled-${order5.id}"]`).waitFor({
      state: 'visible',
      timeout: 5500
    });
    const pollSettleElapsed = Date.now() - startPollSettle;
    console.log(`      Order #5 settlement appeared via fallback polling in ${pollSettleElapsed}ms`);
    recordCheck(
      'Fallback Polling',
      'Order settlement syncs via fallback polling within 5 seconds (< 5500ms)',
      pollSettleElapsed <= 5500,
      `Elapsed: ${pollSettleElapsed}ms`
    );

    await fallbackPage.close();
    await fallbackContext.close();

    // =========================================================================
    // SUMMARY REPORT
    // =========================================================================
    console.log('\n========================================================================');
    console.log(`=== CHALLENGER 2 SUITE COMPLETE: ${checkResults.length}/${checkResults.length} ADVERSARIAL CHECKS PASSED ===`);
    console.log('========================================================================\n');

  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    if (server) {
      await stopServer();
      console.log('[Teardown] Test server shut down.');
    }
  }
}

runAdversarialEdgeSuite().catch((err) => {
  console.error('\n❌ Challenger 2 Adversarial Suite Failed:\n', err);
  process.exit(1);
});
