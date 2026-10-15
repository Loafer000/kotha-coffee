import http from 'http';
import assert from 'assert';
import jwt from 'jsonwebtoken';
import { chromium, type Browser, type Page } from 'playwright';
import { startServer, stopServer } from '../src/server/index.js';

const TEST_PORT = 3125;
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
            // retain raw string
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

export interface TestResult {
  name: string;
  category: 'Security & Auth' | 'Input Validation' | 'Route Serving' | 'Phone Viewport & Ergonomics';
  passed: boolean;
  actual?: string;
  expected?: string;
  details?: string;
}

export const results: TestResult[] = [];

async function record(
  name: string,
  category: TestResult['category'],
  fn: () => void | Promise<void>
) {
  try {
    await fn();
    results.push({ name, category, passed: true });
    console.log(`  [PASS] [${category}] ${name}`);
  } catch (err: any) {
    results.push({
      name,
      category,
      passed: false,
      details: err.message || String(err)
    });
    console.error(`  [FAIL] [${category}] ${name}: ${err.message || err}`);
  }
}

async function runAdversarialAudit() {
  console.log('================================================================');
  console.log('=== KOTHA & COFFEE - CHALLENGER 2 ADVERSARIAL AUDIT (M3) ===');
  console.log('================================================================\n');

  let server: any;
  let validToken: string;
  let testOrderId: string = '';

  try {
    server = await startServer(TEST_PORT);
    await httpRequest({ method: 'POST', path: '/api/test/reset' });
    await httpRequest({ method: 'POST', path: '/api/test/reset-time' });

    // Acquire valid token
    const authRes = await httpRequest({
      method: 'POST',
      path: '/api/auth/verify-pin',
      body: { pin: '1234' }
    });
    assert.strictEqual(authRes.status, 200, 'PIN verification must return 200');
    validToken = authRes.body.token;

    // Create setup order for mutation tests
    const initOrderRes = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: { Authorization: `Bearer ${validToken}` },
      body: {
        items: [{ name: 'Tea', unitPrice: 15, quantity: 1 }],
        paymentMethod: 'Cash'
      }
    });
    assert.strictEqual(initOrderRes.status, 201);
    testOrderId = initOrderRes.body.id;

    console.log('\n--- 1. SECURITY & AUTH BOUNDARY ATTACKS ---');

    const mutatingEndpoints = [
      { name: 'POST /api/orders', method: 'POST', path: '/api/orders', body: { items: [{ name: 'Tea', unitPrice: 15, quantity: 1 }], paymentMethod: 'Cash' } },
      { name: 'PATCH /api/orders/:id', method: 'PATCH', path: `/api/orders/${testOrderId}`, body: { paymentMethod: 'UPI' } },
      { name: 'POST /api/orders/:id/done', method: 'POST', path: `/api/orders/${testOrderId}/done`, body: {} },
      { name: 'DELETE /api/orders/:id', method: 'DELETE', path: `/api/orders/${testOrderId}`, body: {} }
    ];

    // 1.1 Unauthenticated requests
    for (const ep of mutatingEndpoints) {
      await record(`${ep.name} without token -> 401`, 'Security & Auth', async () => {
        const res = await httpRequest({ method: ep.method, path: ep.path, body: ep.body });
        assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
      });
    }

    // 1.2 Expired token
    const expiredToken = createExpiredToken();
    for (const ep of mutatingEndpoints) {
      await record(`${ep.name} with expired token -> 401`, 'Security & Auth', async () => {
        const res = await httpRequest({
          method: ep.method,
          path: ep.path,
          headers: { Authorization: `Bearer ${expiredToken}` },
          body: ep.body
        });
        assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
      });
    }

    // 1.3 Forged secret token
    const forgedSecretToken = createForgedSecretToken();
    for (const ep of mutatingEndpoints) {
      await record(`${ep.name} with forged secret token -> 401`, 'Security & Auth', async () => {
        const res = await httpRequest({
          method: ep.method,
          path: ep.path,
          headers: { Authorization: `Bearer ${forgedSecretToken}` },
          body: ep.body
        });
        assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
      });
    }

    // 1.4 Forged role token (role: 'kitchen')
    const forgedRoleToken = createForgedRoleToken();
    for (const ep of mutatingEndpoints) {
      await record(`${ep.name} with wrong role ('kitchen') token -> 401`, 'Security & Auth', async () => {
        const res = await httpRequest({
          method: ep.method,
          path: ep.path,
          headers: { Authorization: `Bearer ${forgedRoleToken}` },
          body: ep.body
        });
        assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
      });
    }

    // 1.5 Malformed garbage token
    for (const ep of mutatingEndpoints) {
      await record(`${ep.name} with malformed token -> 401`, 'Security & Auth', async () => {
        const res = await httpRequest({
          method: ep.method,
          path: ep.path,
          headers: { Authorization: 'Bearer this.is.not.a.valid.jwt' },
          body: ep.body
        });
        assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
      });
    }

    // 1.6 Alg:none token
    const noneAlgToken = createNoneAlgorithmToken();
    for (const ep of mutatingEndpoints) {
      await record(`${ep.name} with alg:none token -> 401`, 'Security & Auth', async () => {
        const res = await httpRequest({
          method: ep.method,
          path: ep.path,
          headers: { Authorization: `Bearer ${noneAlgToken}` },
          body: ep.body
        });
        assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
      });
    }

    // 1.7 GET /api/orders without auth -> 401
    await record('GET /api/orders without auth -> 401', 'Security & Auth', async () => {
      const res = await httpRequest({ method: 'GET', path: '/api/orders' });
      assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
    });

    // 1.8 GET /api/kitchen/orders without auth -> 200 OK (Public Read-Only)
    await record('GET /api/kitchen/orders works without auth -> 200 OK', 'Security & Auth', async () => {
      const res = await httpRequest({ method: 'GET', path: '/api/kitchen/orders' });
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
      assert.ok(Array.isArray(res.body.pending), 'Must return pending array');
      assert.ok(Array.isArray(res.body.settled), 'Must return settled array');
    });

    console.log('\n--- 2. INPUT VALIDATION EDGE CASES ---');
    const authHeaders = { Authorization: `Bearer ${validToken}` };

    // 2.1 Empty cart (items: [])
    await record('POST /api/orders with empty cart (items: []) -> 400', 'Input Validation', async () => {
      const res = await httpRequest({
        method: 'POST',
        path: '/api/orders',
        headers: authHeaders,
        body: { items: [], paymentMethod: 'Cash' }
      });
      assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
    });

    // 2.2 Missing items field
    await record('POST /api/orders with missing items field -> 400', 'Input Validation', async () => {
      const res = await httpRequest({
        method: 'POST',
        path: '/api/orders',
        headers: authHeaders,
        body: { paymentMethod: 'Cash' }
      });
      assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
    });

    // 2.3 Non-array items
    await record('POST /api/orders with items: "string" -> 400', 'Input Validation', async () => {
      const res = await httpRequest({
        method: 'POST',
        path: '/api/orders',
        headers: authHeaders,
        body: { items: "non-array", paymentMethod: 'Cash' }
      });
      assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
    });

    // 2.4 Negative quantity
    await record('POST /api/orders with negative quantity (-2) -> 400', 'Input Validation', async () => {
      const res = await httpRequest({
        method: 'POST',
        path: '/api/orders',
        headers: authHeaders,
        body: {
          items: [{ name: 'Tea', unitPrice: 15, quantity: -2 }],
          paymentMethod: 'Cash'
        }
      });
      assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
    });

    // 2.5 Zero quantity
    await record('POST /api/orders with zero quantity (0) -> 400', 'Input Validation', async () => {
      const res = await httpRequest({
        method: 'POST',
        path: '/api/orders',
        headers: authHeaders,
        body: {
          items: [{ name: 'Tea', unitPrice: 15, quantity: 0 }],
          paymentMethod: 'Cash'
        }
      });
      assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
    });

    // 2.6 Non-integer float quantity (1.5)
    await record('POST /api/orders with non-integer quantity (1.5) -> 400', 'Input Validation', async () => {
      const res = await httpRequest({
        method: 'POST',
        path: '/api/orders',
        headers: authHeaders,
        body: {
          items: [{ name: 'Tea', unitPrice: 15, quantity: 1.5 }],
          paymentMethod: 'Cash'
        }
      });
      assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
    });

    // 2.7 Fractional quantity (0.2)
    await record('POST /api/orders with fractional quantity (0.2) -> 400', 'Input Validation', async () => {
      const res = await httpRequest({
        method: 'POST',
        path: '/api/orders',
        headers: authHeaders,
        body: {
          items: [{ name: 'Tea', unitPrice: 15, quantity: 0.2 }],
          paymentMethod: 'Cash'
        }
      });
      assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
    });

    // 2.8 Invalid payment method ("crypto")
    await record('POST /api/orders with invalid paymentMethod ("crypto") -> 400', 'Input Validation', async () => {
      const res = await httpRequest({
        method: 'POST',
        path: '/api/orders',
        headers: authHeaders,
        body: {
          items: [{ name: 'Tea', unitPrice: 15, quantity: 1 }],
          paymentMethod: 'crypto'
        }
      });
      assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
    });

    // 2.9 Invalid payment method (numeric 999)
    await record('POST /api/orders with numeric paymentMethod (999) -> 400', 'Input Validation', async () => {
      const res = await httpRequest({
        method: 'POST',
        path: '/api/orders',
        headers: authHeaders,
        body: {
          items: [{ name: 'Tea', unitPrice: 15, quantity: 1 }],
          paymentMethod: 999
        }
      });
      assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
    });

    // 2.10 Empty item name
    await record('POST /api/orders with empty item name ("") -> 400', 'Input Validation', async () => {
      const res = await httpRequest({
        method: 'POST',
        path: '/api/orders',
        headers: authHeaders,
        body: {
          items: [{ name: '', unitPrice: 15, quantity: 1 }],
          paymentMethod: 'Cash'
        }
      });
      assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
    });

    // 2.11 Negative unit price
    await record('POST /api/orders with negative unit price (-10) -> 400', 'Input Validation', async () => {
      const res = await httpRequest({
        method: 'POST',
        path: '/api/orders',
        headers: authHeaders,
        body: {
          items: [{ name: 'Tea', unitPrice: -10, quantity: 1 }],
          paymentMethod: 'Cash'
        }
      });
      assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
    });

    // 2.12 Null item in array
    await record('POST /api/orders with null element in items -> 400', 'Input Validation', async () => {
      const res = await httpRequest({
        method: 'POST',
        path: '/api/orders',
        headers: authHeaders,
        body: {
          items: [null],
          paymentMethod: 'Cash'
        }
      });
      assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
    });

    // 2.13 Input validation on PATCH
    await record('PATCH /api/orders/:id with negative quantity -> 400', 'Input Validation', async () => {
      const res = await httpRequest({
        method: 'PATCH',
        path: `/api/orders/${testOrderId}`,
        headers: authHeaders,
        body: { items: [{ name: 'Tea', unitPrice: 15, quantity: -1 }] }
      });
      assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
    });

    await record('PATCH /api/orders/:id with non-integer quantity -> 400', 'Input Validation', async () => {
      const res = await httpRequest({
        method: 'PATCH',
        path: `/api/orders/${testOrderId}`,
        headers: authHeaders,
        body: { items: [{ name: 'Tea', unitPrice: 15, quantity: 1.25 }] }
      });
      assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
    });

    await record('PATCH /api/orders/:id with invalid payment method -> 400', 'Input Validation', async () => {
      const res = await httpRequest({
        method: 'PATCH',
        path: `/api/orders/${testOrderId}`,
        headers: authHeaders,
        body: { paymentMethod: 'Gold' }
      });
      assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
    });

    console.log('\n--- 3. ROUTE SERVING CHECK ---');
    const routesToCheck = ['/', '/reception', '/kitchen', '/analytics', '/any-spa-path'];
    for (const route of routesToCheck) {
      await record(`GET ${route} returns HTTP 200 with HTML (no Express "Cannot GET")`, 'Route Serving', async () => {
        const res = await httpRequest({
          method: 'GET',
          path: route,
          headers: { Accept: 'text/html' }
        });
        assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
        assert.ok(String(res.headers['content-type']).includes('text/html'), 'Must be text/html');
        assert.ok(!res.raw.includes('Cannot GET'), 'Must not contain Express Cannot GET');
        assert.ok(res.raw.includes('কথা') || res.raw.includes('Coffee'), 'Must contain cafe branding');
      });
    }

    console.log('\n--- 4. PHONE VIEWPORT (375px) & TAP TARGET ERGONOMICS ---');
    const browser: Browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true
    });
    const page: Page = await context.newPage();

    try {
      // 4.1 Landing Page
      await record('Landing page at 375px: zero horizontal overflow', 'Phone Viewport & Ergonomics', async () => {
        await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
        const overflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });
        assert.strictEqual(overflow, false, 'Landing page has horizontal overflow');
      });

      await record('Landing page at 375px: Add Order & See Orders buttons >= 44px tap targets', 'Phone Viewport & Ergonomics', async () => {
        const addOrderBox = await page.locator('[data-testid="role-reception"]').boundingBox();
        const seeOrdersBox = await page.locator('[data-testid="role-kitchen"]').boundingBox();
        assert.ok(addOrderBox && addOrderBox.width >= 44 && addOrderBox.height >= 44, `Add Order: ${addOrderBox?.width}x${addOrderBox?.height}`);
        assert.ok(seeOrdersBox && seeOrdersBox.width >= 44 && seeOrdersBox.height >= 44, `See Orders: ${seeOrdersBox?.width}x${seeOrdersBox?.height}`);
      });

      // 4.2 Reception PIN Modal
      await record('Reception PIN Modal at 375px: zero overflow & keypad tap targets >= 44px', 'Phone Viewport & Ergonomics', async () => {
        await page.goto(`${BASE_URL}/reception`, { waitUntil: 'networkidle' });
        await page.waitForSelector('text=Reception PIN Required');

        const overflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });
        assert.strictEqual(overflow, false, 'PIN modal has horizontal overflow');

        // Check keypad buttons
        const keypadButtons = await page.locator('form button[type="button"], form button[type="submit"]').all();
        for (const btn of keypadButtons) {
          const box = await btn.boundingBox();
          if (box) {
            assert.ok(box.width >= 44, `Keypad button width < 44px: got ${box.width}px`);
            assert.ok(box.height >= 44, `Keypad button height < 44px: got ${box.height}px`);
          }
        }

        // Enter PIN 1234
        for (const digit of ['1', '2', '3', '4']) {
          await page.click(`button:has-text("${digit}")`);
        }
        await page.waitForTimeout(300);
      });

      // 4.3 Order Create POS
      await record('Reception Add Order tab at 375px: zero horizontal overflow', 'Phone Viewport & Ergonomics', async () => {
        await page.waitForSelector('[data-testid="tab-create-order"]');
        const overflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });
        assert.strictEqual(overflow, false, 'Reception POS has horizontal overflow');
      });

      await record('Reception Add Order tab at 375px: tabs, categories, steppers, payment, submit >= 44px', 'Phone Viewport & Ergonomics', async () => {
        // Tab buttons
        const tabs = await page.locator('[data-testid^="tab-"]').all();
        for (const tab of tabs) {
          const box = await tab.boundingBox();
          if (box) {
            assert.ok(box.height >= 44, `Tab button height < 44px: got ${box.height}px`);
          }
        }

        // Payment buttons
        for (const m of ['cash', 'upi', 'card']) {
          const box = await page.locator(`[data-testid="pay-${m}"]`).boundingBox();
          assert.ok(box && box.width >= 44 && box.height >= 44, `Payment ${m} < 44px: got ${box?.width}x${box?.height}`);
        }

        // Place Order button
        const submitBox = await page.locator('[data-testid="btn-submit-order"]').boundingBox();
        assert.ok(submitBox && submitBox.height >= 44, `Place Order button height < 44px: got ${submitBox?.height}`);
      });

      // 4.4 Order Placement & Slip Modal
      await record('OrderSlip modal at 375px: zero overflow & Next Order button >= 44px', 'Phone Viewport & Ergonomics', async () => {
        // Add item
        await page.locator('.menu-item-card button').first().click();
        await page.waitForTimeout(200);

        // Stepper buttons
        const minusBox = await page.locator('[data-testid="qty-minus"]').first().boundingBox();
        const plusBox = await page.locator('[data-testid="qty-plus"]').first().boundingBox();
        assert.ok(minusBox && minusBox.width >= 44 && minusBox.height >= 44, `Stepper -: ${minusBox?.width}x${minusBox?.height}`);
        assert.ok(plusBox && plusBox.width >= 44 && plusBox.height >= 44, `Stepper +: ${plusBox?.width}x${plusBox?.height}`);

        // Submit order
        await page.click('[data-testid="pay-card"]');
        await page.click('[data-testid="btn-submit-order"]');
        await page.waitForSelector('[data-testid="order-confirmation-slip"]');

        const slipOverflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });
        assert.strictEqual(slipOverflow, false, 'Order confirmation slip causes overflow');

        const nextBox = await page.locator('[data-testid="btn-next-order"]').boundingBox();
        assert.ok(nextBox && nextBox.height >= 44, `Next Order button height < 44px: got ${nextBox?.height}`);

        // Navigate to pending queue
        await page.click('[data-testid="btn-view-pending"]');
        await page.waitForTimeout(300);
      });

      // 4.5 Pending Queue Orders & Actions
      await record('Pending queue at 375px: zero overflow', 'Phone Viewport & Ergonomics', async () => {
        await page.waitForSelector('[data-testid="pending-queue"]');
        const overflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });
        assert.strictEqual(overflow, false, 'Pending queue has overflow');
      });

      await record('Pending queue at 375px: Done, Edit, Cancel buttons >= 44px tap target size', 'Phone Viewport & Ergonomics', async () => {
        const doneBox = await page.locator('[data-testid^="btn-done-"]').first().boundingBox();
        const editBox = await page.locator('[data-testid^="btn-edit-"]').first().boundingBox();
        const cancelBox = await page.locator('[data-testid^="btn-cancel-"]').first().boundingBox();

        console.log(`     -> Done button size: ${doneBox?.width}px x ${doneBox?.height}px`);
        console.log(`     -> Edit button size: ${editBox?.width}px x ${editBox?.height}px`);
        console.log(`     -> Cancel button size: ${cancelBox?.width}px x ${cancelBox?.height}px`);

        assert.ok(doneBox && doneBox.height >= 44, `Done button height must be >= 44px (got ${doneBox?.height}px)`);
        assert.ok(editBox && editBox.height >= 44, `Edit button height must be >= 44px (got ${editBox?.height}px)`);
        assert.ok(cancelBox && cancelBox.width >= 44 && cancelBox.height >= 44,
          `Cancel button tap target must be >= 44x44px (got ${cancelBox?.width}px x ${cancelBox?.height}px)`
        );
      });

      // 4.6 Edit Order Modal Tap Targets
      await record('Edit Order Modal at 375px: item steppers & action buttons >= 44px tap targets', 'Phone Viewport & Ergonomics', async () => {
        const editBtn = page.locator('[data-testid^="btn-edit-"]').first();
        await editBtn.click();
        await page.waitForTimeout(200);

        try {
          // Check close button
          const closeBtn = page.locator('.fixed button:has(svg.lucide-x)');
          const closeBox = await closeBtn.boundingBox();
          console.log(`     -> Edit modal close (X) button size: ${closeBox?.width}px x ${closeBox?.height}px`);

          // Check steppers in Edit Modal
          const editSteppers = await page.locator('.fixed button:has-text("-"), .fixed button:has-text("+")').all();
          let allSteppersValid = true;
          for (const s of editSteppers) {
            const box = await s.boundingBox();
            const txt = (await s.innerText()).trim();
            console.log(`     -> Edit modal stepper [${txt}] size: ${box?.width}px x ${box?.height}px`);
            if (!box || box.width < 44 || box.height < 44) {
              allSteppersValid = false;
            }
          }

          // Check Cancel and Save buttons in Edit Modal
          const modalCancelBtn = page.locator('.fixed button:has-text("Cancel")');
          const modalSaveBtn = page.locator('.fixed button:has-text("Save")');
          const mCancelBox = await modalCancelBtn.boundingBox();
          const mSaveBox = await modalSaveBtn.boundingBox();
          console.log(`     -> Edit modal Cancel button size: ${mCancelBox?.width}px x ${mCancelBox?.height}px`);
          console.log(`     -> Edit modal Save button size: ${mSaveBox?.width}px x ${mSaveBox?.height}px`);

          assert.ok(allSteppersValid, `Edit modal steppers must be >= 44x44px (got 28px x 28px)`);
          assert.ok(mCancelBox && mCancelBox.height >= 44, `Edit modal Cancel button height must be >= 44px (got ${mCancelBox?.height}px)`);
          assert.ok(mSaveBox && mSaveBox.height >= 44, `Edit modal Save button height must be >= 44px (got ${mSaveBox?.height}px)`);
        } finally {
          // Always dismiss edit modal
          const modalCancelBtn = page.locator('.fixed button:has-text("Cancel")');
          if (await modalCancelBtn.count() > 0) {
            await modalCancelBtn.first().click().catch(() => {});
            await page.waitForTimeout(300);
          }
        }
      });

      // 4.7 Cancel Order Confirmation Modal Tap Targets
      await record('Cancel Order Modal at 375px: confirmation buttons >= 44px tap targets', 'Phone Viewport & Ergonomics', async () => {
        const cancelBtn = page.locator('[data-testid^="btn-cancel-"]').first();
        await cancelBtn.click();
        await page.waitForTimeout(200);

        const noKeepBtn = page.locator('.fixed button:has-text("No, Keep")');
        const yesCancelBtn = page.locator('.fixed button:has-text("Yes, Cancel")');
        const noKeepBox = await noKeepBtn.boundingBox();
        const yesCancelBox = await yesCancelBtn.boundingBox();
        console.log(`     -> Cancel modal 'No, Keep' button size: ${noKeepBox?.width}px x ${noKeepBox?.height}px`);
        console.log(`     -> Cancel modal 'Yes, Cancel' button size: ${yesCancelBox?.width}px x ${yesCancelBox?.height}px`);

        assert.ok(noKeepBox && noKeepBox.height >= 44, `'No, Keep' button height must be >= 44px (got ${noKeepBox?.height}px)`);
        assert.ok(yesCancelBox && yesCancelBox.height >= 44, `'Yes, Cancel' button height must be >= 44px (got ${yesCancelBox?.height}px)`);

        // Dismiss modal
        await noKeepBtn.click();
        await page.waitForTimeout(200);
      });

      // 4.7 Kitchen View at 375px
      await record('Kitchen view at 375px: zero overflow, sound toggle >= 44px, no mutation buttons', 'Phone Viewport & Ergonomics', async () => {
        await page.goto(`${BASE_URL}/kitchen`, { waitUntil: 'networkidle' });

        const overflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });
        assert.strictEqual(overflow, false, 'Kitchen page has overflow');

        const soundBox = await page.locator('button:has-text("Enable Sound"), button:has-text("Sound ON")').boundingBox();
        assert.ok(soundBox && soundBox.height >= 44, `Sound button height < 44px: got ${soundBox?.height}`);

        const mutationButtons = await page.locator('button:has-text("Done"), button:has-text("Edit"), button:has-text("Cancel")').all();
        assert.strictEqual(mutationButtons.length, 0, 'Kitchen view must have 0 mutation buttons');
      });

    } finally {
      await browser.close();
    }

  } finally {
    if (server) {
      await stopServer();
    }
  }

  console.log('\n================================================================');
  console.log('=== ADVERSARIAL AUDIT COMPLETE ===');
  console.log('================================================================\n');

  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => !r.passed).length;

  console.log(`Total Adversarial Checks: ${results.length}`);
  console.log(`Passed: ${passedCount}`);
  console.log(`Failed: ${failedCount}`);

  if (failedCount > 0) {
    console.log('\n❌ FAILED CHALLENGES:');
    for (const f of results.filter(r => !r.passed)) {
      console.log(` - [${f.category}] ${f.name}`);
      console.log(`   Details: ${f.details}\n`);
    }
  } else {
    console.log('\n✅ ALL CHALLENGES PASSED!');
  }
}

runAdversarialAudit().catch((err) => {
  console.error('Test execution crashed:', err);
  process.exit(1);
});
