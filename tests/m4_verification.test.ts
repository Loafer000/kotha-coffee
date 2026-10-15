import http from 'http';
import assert from 'assert';
import { chromium, type Browser, type Page } from '@playwright/test';
import { startServer, stopServer } from '../src/server/index.js';

const TEST_PORT = 3114;
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

interface SseParsedMessage {
  eventType?: string;
  data: any;
  raw: string;
  receivedAt: number;
}

class SseStreamClient {
  private req: http.ClientRequest | null = null;
  public headers: http.IncomingHttpHeaders = {};
  public statusCode: number = 0;
  public messages: SseParsedMessage[] = [];
  private listeners: Array<(msg: SseParsedMessage) => void> = [];
  private buffer = '';

  connect(): Promise<{ status: number; headers: http.IncomingHttpHeaders }> {
    return new Promise((resolve, reject) => {
      const url = new URL('/api/events', BASE_URL);
      this.req = http.request(
        url,
        {
          method: 'GET',
          headers: {
            Accept: 'text/event-stream'
          }
        },
        (res) => {
          this.statusCode = res.statusCode || 0;
          this.headers = res.headers;

          res.on('data', (chunk: Buffer) => {
            this.handleChunk(chunk.toString('utf-8'));
          });

          resolve({ status: this.statusCode, headers: this.headers });
        }
      );

      this.req.on('error', (err) => {
        // Ignore abort/destroy errors
        if ((err as any).code !== 'ECONNRESET') {
          reject(err);
        }
      });

      this.req.end();
    });
  }

  private handleChunk(chunk: string) {
    this.buffer += chunk;
    const blocks = this.buffer.split('\n\n');
    this.buffer = blocks.pop() || '';

    for (const block of blocks) {
      const lines = block.split('\n');
      let eventType = '';
      let dataStr = '';

      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventType = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataStr = line.slice(5).trim();
        }
      }

      if (dataStr) {
        let parsedData: any = dataStr;
        try {
          parsedData = JSON.parse(dataStr);
        } catch {}

        const msg: SseParsedMessage = {
          eventType: eventType || (parsedData?.type ?? 'message'),
          data: parsedData,
          raw: block,
          receivedAt: Date.now()
        };

        this.messages.push(msg);
        for (const listener of this.listeners) {
          listener(msg);
        }
      }
    }
  }

  waitForEvent(
    predicate: (msg: SseParsedMessage) => boolean,
    timeoutMs: number = 1000
  ): Promise<{ message: SseParsedMessage; elapsedMs: number }> {
    const startTime = Date.now();

    // Check existing messages first
    for (const msg of this.messages) {
      if (predicate(msg)) {
        return Promise.resolve({ message: msg, elapsedMs: msg.receivedAt - startTime });
      }
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timeout of ${timeoutMs}ms waiting for SSE event`));
      }, timeoutMs);

      const listener = (msg: SseParsedMessage) => {
        if (predicate(msg)) {
          cleanup();
          resolve({ message: msg, elapsedMs: Date.now() - startTime });
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        const idx = this.listeners.indexOf(listener);
        if (idx !== -1) this.listeners.splice(idx, 1);
      };

      this.listeners.push(listener);
    });
  }

  close() {
    if (this.req) {
      this.req.destroy();
      this.req = null;
    }
    this.listeners = [];
  }
}

async function runM4VerificationSuite() {
  console.log('================================================================');
  console.log('=== Starting Milestone 4 Verification Test Suite ===');
  console.log('=== (Kitchen Display, Real-Time SSE Broadcaster & Web Audio) ===');
  console.log('================================================================\n');

  let server: any;
  let sseClient: SseStreamClient | null = null;
  let browser: Browser | null = null;
  let page: Page | null = null;
  let authToken = '';

  try {
    // -------------------------------------------------------------------------
    // Setup: Start Express server and initialize database schema
    // -------------------------------------------------------------------------
    console.log('[Setup] Starting Express server on port', TEST_PORT, '...');
    server = await startServer(TEST_PORT);
    console.log(`[Setup] Server running at ${BASE_URL}`);

    // Reset test database & clock
    await httpRequest({ method: 'POST', path: '/api/test/reset' });
    await httpRequest({ method: 'POST', path: '/api/test/reset-time' });

    // Acquire reception auth session token
    const authRes = await httpRequest({
      method: 'POST',
      path: '/api/auth/verify-pin',
      body: { pin: '1234' }
    });
    assert.strictEqual(authRes.status, 200, 'Reception PIN verification should succeed');
    authToken = authRes.body.token;
    assert.ok(authToken, 'Session token acquired');
    const authHeaders = { Authorization: `Bearer ${authToken}` };

    // -------------------------------------------------------------------------
    // Step 1: GET /api/events connects and receives SSE stream headers
    // -------------------------------------------------------------------------
    console.log('\nStep 1: Connecting to GET /api/events and verifying SSE stream headers...');
    sseClient = new SseStreamClient();
    const sseConn = await sseClient.connect();

    assert.strictEqual(sseConn.status, 200, 'GET /api/events must return HTTP 200');
    
    const contentType = String(sseConn.headers['content-type'] || '');
    assert.ok(
      contentType.includes('text/event-stream'),
      `Content-Type must be 'text/event-stream', got: ${contentType}`
    );

    const cacheControl = String(sseConn.headers['cache-control'] || '');
    assert.ok(
      cacheControl.includes('no-cache'),
      `Cache-Control must contain 'no-cache', got: ${cacheControl}`
    );

    const connectionHeader = String(sseConn.headers['connection'] || '');
    assert.ok(
      connectionHeader.toLowerCase().includes('keep-alive'),
      `Connection header must be 'keep-alive', got: ${connectionHeader}`
    );

    console.log('   ✓ Step 1 PASSED: SSE stream connected with valid headers (text/event-stream, no-cache, keep-alive).\n');

    // -------------------------------------------------------------------------
    // Step 2: Creating order broadcasts order:created within <1s
    // -------------------------------------------------------------------------
    console.log('Step 2: Creating order and verifying order:created SSE broadcast latency (<1s)...');
    const preCreateTs = Date.now();

    const createOrderPromise = httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [
          { name: 'Tea', unitPrice: 15, quantity: 2 },
          { name: 'Chicken Momo (5 pcs)', unitPrice: 60, quantity: 1 }
        ],
        paymentMethod: 'Cash',
        notes: 'Extra ginger in tea'
      }
    });

    const waitCreatedPromise = sseClient.waitForEvent(
      (msg) => msg.data?.type === 'order:created',
      1000
    );

    const [order1Res, createdEventResult] = await Promise.all([
      createOrderPromise,
      waitCreatedPromise
    ]);

    assert.strictEqual(order1Res.status, 201, 'POST /api/orders should return 201');
    const order1 = order1Res.body;
    const sseBroadcastLatency = createdEventResult.message.receivedAt - preCreateTs;

    console.log(`   -> Broadcast latency: ${sseBroadcastLatency}ms (Requirement: < 1000ms)`);
    assert.ok(
      sseBroadcastLatency < 1000,
      `Broadcast latency must be <1000ms, got ${sseBroadcastLatency}ms`
    );

    const createdEvent = createdEventResult.message.data;
    assert.strictEqual(createdEvent.type, 'order:created', 'Event type must be order:created');
    assert.strictEqual(createdEvent.order.id, order1.id, 'Broadcast order ID must match created order ID');
    assert.strictEqual(createdEvent.order.daily_order_number, 1, 'First order number must be #1');
    assert.strictEqual(createdEvent.order.total_amount, 90, 'Total amount must be ₹90');
    assert.strictEqual(createdEvent.order.notes, 'Extra ginger in tea', 'Notes must match');

    console.log('   ✓ Step 2 PASSED: order:created broadcast received in', sseBroadcastLatency, 'ms (<1s) with full order payload.\n');

    // -------------------------------------------------------------------------
    // Step 3: Editing pending order broadcasts order:updated
    // -------------------------------------------------------------------------
    console.log('Step 3: Editing pending order and verifying order:updated SSE broadcast...');
    const preEditTs = Date.now();

    const editOrderPromise = httpRequest({
      method: 'PATCH',
      path: `/api/orders/${order1.id}`,
      headers: authHeaders,
      body: {
        items: [
          { name: 'Tea', unitPrice: 15, quantity: 3 },                  // 45
          { name: 'Chicken Momo (5 pcs)', unitPrice: 60, quantity: 2 }   // 120
        ],
        paymentMethod: 'Card',
        notes: 'Updated: spicy sauce'
      }
    });

    const waitUpdatedPromise = sseClient.waitForEvent(
      (msg) => msg.data?.type === 'order:updated' && msg.data?.order?.id === order1.id,
      1000
    );

    const [editRes, updatedEventResult] = await Promise.all([
      editOrderPromise,
      waitUpdatedPromise
    ]);

    assert.strictEqual(editRes.status, 200, 'PATCH /api/orders/:id should return 200');
    const editLatency = updatedEventResult.message.receivedAt - preEditTs;
    console.log(`   -> Edit broadcast latency: ${editLatency}ms`);
    assert.ok(editLatency < 1000, `Edit broadcast latency must be <1000ms, got ${editLatency}ms`);

    const updatedEvent = updatedEventResult.message.data;
    assert.strictEqual(updatedEvent.type, 'order:updated', 'Event type must be order:updated');
    assert.strictEqual(updatedEvent.order.id, order1.id);
    assert.strictEqual(updatedEvent.order.total_amount, 165, 'Total recalculated to ₹165');
    assert.strictEqual(updatedEvent.order.payment_method, 'Card', 'Payment updated to Card');
    assert.strictEqual(updatedEvent.order.notes, 'Updated: spicy sauce');

    console.log('   ✓ Step 3 PASSED: order:updated broadcast received with updated items and recalculated total.\n');

    // -------------------------------------------------------------------------
    // Step 4: Marking order Done broadcasts order:settled
    // -------------------------------------------------------------------------
    console.log('Step 4: Marking order Done and verifying order:settled SSE broadcast...');
    const preDoneTs = Date.now();

    const doneOrderPromise = httpRequest({
      method: 'POST',
      path: `/api/orders/${order1.id}/done`,
      headers: authHeaders
    });

    const waitSettledPromise = sseClient.waitForEvent(
      (msg) => msg.data?.type === 'order:settled' && msg.data?.orderId === order1.id,
      1000
    );

    const [doneRes, settledEventResult] = await Promise.all([
      doneOrderPromise,
      waitSettledPromise
    ]);

    assert.strictEqual(doneRes.status, 200, 'POST /api/orders/:id/done should return 200');
    const doneLatency = settledEventResult.message.receivedAt - preDoneTs;
    console.log(`   -> Settled broadcast latency: ${doneLatency}ms`);
    assert.ok(doneLatency < 1000, `Done broadcast latency must be <1000ms, got ${doneLatency}ms`);

    const settledEvent = settledEventResult.message.data;
    assert.strictEqual(settledEvent.type, 'order:settled');
    assert.strictEqual(settledEvent.orderId, order1.id);
    assert.strictEqual(settledEvent.order.status, 'SETTLED');
    assert.ok(settledEvent.order.settled_at, 'settled_at timestamp must be present');

    console.log('   ✓ Step 4 PASSED: order:settled broadcast received with status SETTLED.\n');

    // -------------------------------------------------------------------------
    // Step 5: Cancelling order broadcasts order:cancelled
    // -------------------------------------------------------------------------
    console.log('Step 5: Cancelling pending order and verifying order:cancelled SSE broadcast...');
    
    // Create order 2 first
    const createOrder2Res = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [{ name: 'Cold Coffee', unitPrice: 50, quantity: 1 }],
        paymentMethod: 'UPI'
      }
    });
    assert.strictEqual(createOrder2Res.status, 201);
    const order2 = createOrder2Res.body;

    const preCancelTs = Date.now();
    const cancelOrderPromise = httpRequest({
      method: 'DELETE',
      path: `/api/orders/${order2.id}`,
      headers: authHeaders
    });

    const waitCancelledPromise = sseClient.waitForEvent(
      (msg) => msg.data?.type === 'order:cancelled' && msg.data?.orderId === order2.id,
      1000
    );

    const [cancelRes, cancelEventResult] = await Promise.all([
      cancelOrderPromise,
      waitCancelledPromise
    ]);

    assert.strictEqual(cancelRes.status, 200, 'DELETE /api/orders/:id should return 200');
    const cancelLatency = cancelEventResult.message.receivedAt - preCancelTs;
    console.log(`   -> Cancel broadcast latency: ${cancelLatency}ms`);
    assert.ok(cancelLatency < 1000, `Cancel broadcast latency must be <1000ms, got ${cancelLatency}ms`);

    const cancelledEvent = cancelEventResult.message.data;
    assert.strictEqual(cancelledEvent.type, 'order:cancelled');
    assert.strictEqual(cancelledEvent.orderId, order2.id);

    console.log('   ✓ Step 5 PASSED: order:cancelled broadcast received for cancelled order.\n');

    // -------------------------------------------------------------------------
    // Steps 6, 7, 8: Real-Time Kitchen Display Live Sync & Web Audio Chime in Headless Browser
    // -------------------------------------------------------------------------
    console.log('Steps 6, 7 & 8: Verifying Kitchen UI live updates without reload, sound chime alerts & public access...');
    
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 }
    });
    page = await context.newPage();

    // -------------------------------------------------------------------------
    // Step 8: Kitchen page and /api/events load without PIN
    // -------------------------------------------------------------------------
    console.log('\n[Step 8] Verifying Kitchen page loads publicly with zero PIN prompt...');
    const kitchenResponse = await page.goto(`${BASE_URL}/kitchen`, { waitUntil: 'networkidle' });
    assert.strictEqual(kitchenResponse?.status(), 200, 'Kitchen view must return HTTP 200');

    // Confirm no PIN prompt is presented on the Kitchen page
    const pinModalCount = await page.locator('[data-testid="pin-modal"], input[type="password"], input[inputmode="numeric"]').count();
    assert.strictEqual(pinModalCount, 0, 'Kitchen view must NOT require or display a PIN prompt');

    // Verify Kitchen header is visible
    const kitchenHeader = await page.locator('h2:has-text("Kitchen Order Tickets")').isVisible();
    assert.ok(kitchenHeader, 'Kitchen header "Kitchen Order Tickets" must be visible');

    // Verify read-only invariant: No Done, Edit, or Cancel controls in Kitchen view
    const mutationButtons = await page.locator('button:has-text("Done"), button:has-text("Edit"), button:has-text("Cancel")').count();
    assert.strictEqual(mutationButtons, 0, 'Kitchen view must have zero mutation controls (Done, Edit, Cancel)');

    console.log('   ✓ Step 8 PASSED: Kitchen page and /api/events load publicly without PIN.\n');

    // -------------------------------------------------------------------------
    // Setup for Step 7: Listen for 'kitchen-sound-alert' CustomEvent and data-kitchen-alert-count
    // -------------------------------------------------------------------------
    console.log('[Setup] Registering sound alert listener on kitchen page...');
    const capturedSoundAlerts: any[] = [];
    await page.exposeFunction('onKitchenSoundAlertDispatched', (detail: any) => {
      capturedSoundAlerts.push(detail);
    });

    await page.evaluate(() => {
      window.addEventListener('kitchen-sound-alert', (event: any) => {
        (window as any).onKitchenSoundAlertDispatched(event.detail);
      });
    });

    // Tap unlock banner or sound toggle button to simulate user gesture for Web Audio API
    const enableSoundBtn = page.locator('button:has-text("Enable Sound")').first();
    if (await enableSoundBtn.isVisible()) {
      await enableSoundBtn.click();
      await page.waitForTimeout(100);
      console.log('   -> Sound chime enabled via mobile gesture button.');
    }

    // -------------------------------------------------------------------------
    // Step 6a: Live creation sync without reload
    // -------------------------------------------------------------------------
    console.log('\n[Step 6a] Creating new Order #3 in reception; verifying live appearance in Kitchen view (<5s without reload)...');
    const startSyncCreate = Date.now();

    const order3Res = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [
          { name: 'Cappuccino (Milk Coffee)', unitPrice: 30, quantity: 2 },
          { name: 'Chicken Cheese Sandwich', unitPrice: 80, quantity: 1 }
        ],
        paymentMethod: 'UPI',
        notes: 'Chef special: less milk'
      }
    });
    assert.strictEqual(order3Res.status, 201);
    const order3 = order3Res.body;

    // Wait for the ticket to appear in Kitchen DOM without page reload (timeout 5s)
    const ticketLocator = page.locator(`[data-testid="kitchen-ticket-${order3.id}"]`);
    await ticketLocator.waitFor({ state: 'visible', timeout: 5000 });
    const createSyncElapsed = Date.now() - startSyncCreate;

    console.log(`   -> Live creation sync completed in ${createSyncElapsed}ms (Requirement: < 5000ms)`);
    assert.ok(createSyncElapsed < 5000, `Live creation sync must take < 5000ms, took ${createSyncElapsed}ms`);

    // Verify ticket contents
    const ticketText = await ticketLocator.innerText();
    assert.ok(ticketText.includes(`#${order3.daily_order_number}`), `Ticket must show order #${order3.daily_order_number}`);
    assert.ok(ticketText.includes('2x'), 'Ticket must show 2x quantity');
    assert.ok(ticketText.includes('Cappuccino (Milk Coffee)'), 'Ticket must show item name');
    assert.ok(ticketText.includes('Chicken Cheese Sandwich'), 'Ticket must show sandwich item');
    assert.ok(ticketText.includes('Chef special: less milk'), 'Ticket must show chef note');

    // -------------------------------------------------------------------------
    // Step 7: Sound alert event kitchen-sound-alert is triggered and observable
    // -------------------------------------------------------------------------
    console.log('\n[Step 7] Verifying Web Audio chime alert event was dispatched for new order...');
    await page.waitForTimeout(200);

    assert.ok(capturedSoundAlerts.length >= 1, 'kitchen-sound-alert CustomEvent must have been dispatched');
    const latestAlert = capturedSoundAlerts[capturedSoundAlerts.length - 1];
    assert.strictEqual(
      latestAlert.orderNumber,
      order3.daily_order_number,
      `Sound alert event detail.orderNumber must equal ${order3.daily_order_number}`
    );

    const alertCountAttr = await page.evaluate(() => document.body.getAttribute('data-kitchen-alert-count'));
    assert.ok(
      parseInt(alertCountAttr || '0', 10) >= 1,
      'document.body data-kitchen-alert-count must be incremented'
    );
    console.log('   ✓ Step 7 PASSED: Sound alert CustomEvent observed with correct orderNumber, attribute counter incremented.\n');

    // -------------------------------------------------------------------------
    // Step 6b: Live edit sync without reload
    // -------------------------------------------------------------------------
    console.log('[Step 6b] Editing Order #3 in reception; verifying live edit in Kitchen view (<5s without reload)...');
    const startSyncEdit = Date.now();

    await httpRequest({
      method: 'PATCH',
      path: `/api/orders/${order3.id}`,
      headers: authHeaders,
      body: {
        items: [
          { name: 'Cappuccino (Milk Coffee)', unitPrice: 30, quantity: 4 }, // changed from 2 to 4
          { name: 'Chicken Cheese Sandwich', unitPrice: 80, quantity: 1 }
        ],
        notes: 'Chef special: urgent rush order'
      }
    });

    // Wait for the updated quantity 4x to be rendered in Kitchen ticket without reload
    await page.locator(`[data-testid="kitchen-ticket-${order3.id}"]:has-text("4x")`).waitFor({
      state: 'visible',
      timeout: 5000
    });
    const editSyncElapsed = Date.now() - startSyncEdit;
    console.log(`   -> Live edit sync completed in ${editSyncElapsed}ms`);
    assert.ok(editSyncElapsed < 5000);

    const updatedTicketText = await ticketLocator.innerText();
    assert.ok(updatedTicketText.includes('4x'), 'Ticket must reflect updated 4x quantity');
    assert.ok(updatedTicketText.includes('Chef special: urgent rush order'), 'Ticket must reflect updated note');

    // -------------------------------------------------------------------------
    // Step 6c: Live settle ("Done") sync without reload
    // -------------------------------------------------------------------------
    console.log('[Step 6c] Marking Order #3 Done; verifying removal from Pending and addition to Settled (<5s without reload)...');
    const startSyncDone = Date.now();

    await httpRequest({
      method: 'POST',
      path: `/api/orders/${order3.id}/done`,
      headers: authHeaders
    });

    // Order #3 ticket should disappear from Pending
    await ticketLocator.waitFor({ state: 'detached', timeout: 5000 });
    const doneSyncElapsed = Date.now() - startSyncDone;
    console.log(`   -> Live settle sync completed in ${doneSyncElapsed}ms`);
    assert.ok(doneSyncElapsed < 5000);

    // Order #3 should now appear in Settled Orders section
    const settledCard = page.locator(`[data-testid="kitchen-settled-${order3.id}"]`);
    await settledCard.waitFor({ state: 'visible', timeout: 5000 });
    const settledText = await settledCard.innerText();
    assert.ok(settledText.includes(`#${order3.daily_order_number}`), 'Settled section must show order number');

    // -------------------------------------------------------------------------
    // Step 6d: Live cancel sync without reload
    // -------------------------------------------------------------------------
    console.log('[Step 6d] Creating Order #4 and cancelling it; verifying removal from Kitchen view (<5s without reload)...');
    
    const order4Res = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [{ name: 'Brownie', unitPrice: 40, quantity: 1 }],
        paymentMethod: 'Cash'
      }
    });
    const order4 = order4Res.body;
    const ticket4Locator = page.locator(`[data-testid="kitchen-ticket-${order4.id}"]`);
    await ticket4Locator.waitFor({ state: 'visible', timeout: 5000 });

    const startSyncCancel = Date.now();
    await httpRequest({
      method: 'DELETE',
      path: `/api/orders/${order4.id}`,
      headers: authHeaders
    });

    // Order #4 ticket should disappear from Kitchen display without reload
    await ticket4Locator.waitFor({ state: 'detached', timeout: 5000 });
    const cancelSyncElapsed = Date.now() - startSyncCancel;
    console.log(`   -> Live cancel sync completed in ${cancelSyncElapsed}ms`);
    assert.ok(cancelSyncElapsed < 5000);

    // Cancelled order must not appear in settled section either
    const cancelledInSettled = await page.locator(`[data-testid="kitchen-settled-${order4.id}"]`).count();
    assert.strictEqual(cancelledInSettled, 0, 'Cancelled order must NOT appear in settled section');

    console.log('   ✓ Step 6 PASSED: Kitchen view live synchronization (create, edit, done, cancel) verified in <5s without page reload.\n');

    console.log('================================================================');
    console.log('✅ ALL 8 MILESTONE 4 VERIFICATION STEPS PASSED CLEANLY!');
    console.log('================================================================\n');

  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
    if (browser) {
      await browser.close().catch(() => {});
    }
    if (sseClient) {
      sseClient.close();
    }
    if (server) {
      await stopServer();
      console.log('[Teardown] Express server stopped.');
    }
  }
}

runM4VerificationSuite().catch((err) => {
  console.error('\n❌ Milestone 4 Verification Test Suite Failed:\n', err);
  process.exit(1);
});
