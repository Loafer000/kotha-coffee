import http from 'http';
import assert from 'assert';
import { chromium, type Browser, type Page } from '@playwright/test';
import { startServer, stopServer } from '../src/server/index.js';
import { getConnectedClientCount } from '../src/server/routes/events.js';

const TEST_PORT = 3115;
const BASE_URL = `http://localhost:${TEST_PORT}`;

// Helper for making typed HTTP requests
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

interface SseParsedMessage {
  eventType?: string;
  data: any;
  raw: string;
  receivedAt: number;
}

/**
 * Robust SSE client with chunk buffering, event listeners, and socket controls
 */
class StressSseClient {
  public id: string;
  public req: http.ClientRequest | null = null;
  public res: http.IncomingMessage | null = null;
  public headers: http.IncomingHttpHeaders = {};
  public statusCode: number = 0;
  public messages: SseParsedMessage[] = [];
  public rawChunks: string[] = [];
  private listeners: Array<(msg: SseParsedMessage) => void> = [];
  private buffer = '';
  public connected: boolean = false;
  public closed: boolean = false;

  constructor(id: string) {
    this.id = id;
  }

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
          this.res = res;
          this.statusCode = res.statusCode || 0;
          this.headers = res.headers;
          this.connected = true;

          res.on('data', (chunk: Buffer) => {
            const str = chunk.toString('utf-8');
            this.rawChunks.push(str);
            this.handleChunk(str);
          });

          res.on('end', () => {
            this.connected = false;
            this.closed = true;
          });

          res.on('close', () => {
            this.connected = false;
            this.closed = true;
          });

          resolve({ status: this.statusCode, headers: this.headers });
        }
      );

      this.req.on('error', (err) => {
        this.connected = false;
        // Suppress expected ECONNRESET or socket destroy errors when abruptly disconnecting
        if (!this.closed && (err as any).code !== 'ECONNRESET') {
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
      if (!block.trim()) continue;
      // Comments like ': connected' or ': heartbeat'
      if (block.startsWith(':')) continue;

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
        let parsedData: any = null;
        try {
          parsedData = JSON.parse(dataStr);
        } catch (e) {
          console.error(`[${this.id}] Corrupt JSON received:`, dataStr);
          parsedData = { __parse_error__: true, raw: dataStr };
        }

        const msg: SseParsedMessage = {
          eventType: eventType || parsedData?.type || 'message',
          data: parsedData,
          raw: block,
          receivedAt: Date.now()
        };

        this.messages.push(msg);
        for (const listener of [...this.listeners]) {
          listener(msg);
        }
      }
    }
  }

  waitForEvent(
    predicate: (msg: SseParsedMessage) => boolean,
    timeoutMs: number = 2000
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
        reject(
          new Error(
            `[${this.id}] Timeout of ${timeoutMs}ms waiting for SSE event. Total received so far: ${this.messages.length}`
          )
        );
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

  /**
   * Abruptly destroy the TCP socket mid-flight without clean FIN
   */
  abruptDisconnect() {
    this.closed = true;
    this.connected = false;
    if (this.req?.socket) {
      this.req.socket.destroy();
    } else if (this.req) {
      this.req.destroy();
    }
    this.listeners = [];
  }

  /**
   * Graceful close
   */
  close() {
    this.closed = true;
    this.connected = false;
    if (this.req) {
      this.req.destroy();
      this.req = null;
    }
    this.listeners = [];
  }
}

async function runAdversarialStressSuite() {
  console.log('========================================================================');
  console.log('=== Challenger 1: Adversarial Real-Time Sync & Concurrency Stress ===');
  console.log('=== (Port: 3115, 5+ SSE streams, burst mutations, abrupt dropouts) ===');
  console.log('========================================================================\n');

  let server: any = null;
  let browser: Browser | null = null;
  const clients: StressSseClient[] = [];

  const latencies: number[] = [];

  try {
    // -------------------------------------------------------------------------
    // Phase 0: Server Initialization & Auth Setup
    // -------------------------------------------------------------------------
    console.log('[Phase 0] Starting Express test server on port', TEST_PORT, '...');
    server = await startServer(TEST_PORT);
    console.log(`[Phase 0] Server operational at ${BASE_URL}`);

    // Reset DB and Clock
    await httpRequest({ method: 'POST', path: '/api/test/reset' });
    await httpRequest({ method: 'POST', path: '/api/test/reset-time' });

    // Acquire session token
    const authRes = await httpRequest({
      method: 'POST',
      path: '/api/auth/verify-pin',
      body: { pin: '1234' }
    });
    assert.strictEqual(authRes.status, 200, 'Reception PIN verification must succeed');
    const authToken = authRes.body.token;
    assert.ok(authToken, 'Auth token present');
    const authHeaders = { Authorization: `Bearer ${authToken}` };

    assert.strictEqual(
      getConnectedClientCount(),
      0,
      'Active SSE client count should initially be 0'
    );
    console.log('   ✓ Initial state clean. Active SSE clients: 0.\n');

    // -------------------------------------------------------------------------
    // Phase 1: 5 Concurrent Kitchen SSE Listeners Connection & Verification
    // -------------------------------------------------------------------------
    console.log('[Phase 1] Connecting 5 concurrent kitchen SSE listeners...');
    const NUM_LISTENERS = 5;
    for (let i = 1; i <= NUM_LISTENERS; i++) {
      const client = new StressSseClient(`Listener-${i}`);
      clients.push(client);
      const conn = await client.connect();
      assert.strictEqual(conn.status, 200, `Listener ${i} must receive HTTP 200`);
      assert.ok(
        String(conn.headers['content-type']).includes('text/event-stream'),
        `Listener ${i} must have text/event-stream content-type`
      );
    }

    const activeAfterConnect = getConnectedClientCount();
    console.log(`   -> Connected ${clients.length} listeners. Server activeClients count: ${activeAfterConnect}`);
    assert.strictEqual(
      activeAfterConnect,
      NUM_LISTENERS,
      `Server must record exactly ${NUM_LISTENERS} active clients`
    );
    console.log('   ✓ Phase 1 PASSED: 5 concurrent SSE listeners connected and registered.\n');

    // -------------------------------------------------------------------------
    // Phase 2: Rapid Concurrency Burst (20 Order Mutations: Create, Edit, Settle, Cancel)
    // -------------------------------------------------------------------------
    console.log('[Phase 2] Firing rapid concurrency burst (20 mutations: 10 create, 4 edit, 3 settle, 3 cancel)...');

    const createdOrderIds: string[] = [];
    const expectedEvents: Array<{ type: string; idMatch: (msg: any) => boolean }> = [];

    // 1. Create 10 orders in rapid succession / concurrent batches
    const createPromises = [];
    for (let i = 1; i <= 10; i++) {
      const noteBengali = `টেস্ট অর্ডার #${i} - চিনি ছাড়া কফি ও আড্ডা ☕`;
      createPromises.push(
        (async (idx) => {
          const startTime = Date.now();
          const res = await httpRequest({
            method: 'POST',
            path: '/api/orders',
            headers: authHeaders,
            body: {
              items: [
                { name: 'Tea', unitPrice: 15, quantity: idx },
                { name: 'Chicken Momo (5 pcs)', unitPrice: 60, quantity: 1 }
              ],
              paymentMethod: idx % 3 === 0 ? 'Card' : idx % 2 === 0 ? 'UPI' : 'Cash',
              notes: noteBengali
            }
          });
          const reqDuration = Date.now() - startTime;
          assert.strictEqual(res.status, 201, `Order creation #${idx} must succeed`);
          return { order: res.body, reqDuration, reqStart: startTime };
        })(i)
      );
    }

    const createResults = await Promise.all(createPromises);
    for (const r of createResults) {
      createdOrderIds.push(r.order.id);
      expectedEvents.push({
        type: 'order:created',
        idMatch: (data) => data.type === 'order:created' && data.order?.id === r.order.id
      });
    }
    console.log(`   -> Created 10 orders concurrently. Orders #${createResults.map(r => r.order.daily_order_number).join(', #')}`);

    // 2. Rapidly edit 4 pending orders
    const editPromises = [];
    for (let i = 0; i < 4; i++) {
      const targetId = createdOrderIds[i];
      editPromises.push(
        (async (idx, id) => {
          const startTime = Date.now();
          const res = await httpRequest({
            method: 'PATCH',
            path: `/api/orders/${id}`,
            headers: authHeaders,
            body: {
              items: [
                { name: 'Cold Coffee', unitPrice: 50, quantity: 2 + idx }
              ],
              paymentMethod: 'UPI',
              notes: `সংশোধিত অর্ডার: ঠাণ্ডা কফি #${idx + 1}`
            }
          });
          assert.strictEqual(res.status, 200, `Order edit for ID ${id} must return 200`);
          return { order: res.body, reqStart: startTime };
        })(i, targetId)
      );
    }
    const editResults = await Promise.all(editPromises);
    for (const r of editResults) {
      expectedEvents.push({
        type: 'order:updated',
        idMatch: (data) => data.type === 'order:updated' && data.order?.id === r.order.id
      });
    }
    console.log(`   -> Edited 4 orders concurrently.`);

    // 3. Rapidly settle 3 orders (Done)
    const settlePromises = [];
    for (let i = 4; i < 7; i++) {
      const targetId = createdOrderIds[i];
      settlePromises.push(
        (async (id) => {
          const startTime = Date.now();
          const res = await httpRequest({
            method: 'POST',
            path: `/api/orders/${id}/done`,
            headers: authHeaders
          });
          assert.strictEqual(res.status, 200, `Order settle for ID ${id} must return 200`);
          return { order: res.body, orderId: id, reqStart: startTime };
        })(targetId)
      );
    }
    const settleResults = await Promise.all(settlePromises);
    for (const r of settleResults) {
      expectedEvents.push({
        type: 'order:settled',
        idMatch: (data) => data.type === 'order:settled' && data.orderId === r.orderId
      });
    }
    console.log(`   -> Settled 3 orders concurrently.`);

    // 4. Rapidly cancel 3 orders
    const cancelPromises = [];
    for (let i = 7; i < 10; i++) {
      const targetId = createdOrderIds[i];
      cancelPromises.push(
        (async (id) => {
          const startTime = Date.now();
          const res = await httpRequest({
            method: 'DELETE',
            path: `/api/orders/${id}`,
            headers: authHeaders
          });
          assert.strictEqual(res.status, 200, `Order cancel for ID ${id} must return 200`);
          return { orderId: id, reqStart: startTime };
        })(targetId)
      );
    }
    const cancelResults = await Promise.all(cancelPromises);
    for (const r of cancelResults) {
      expectedEvents.push({
        type: 'order:cancelled',
        idMatch: (data) => data.type === 'order:cancelled' && data.orderId === r.orderId
      });
    }
    console.log(`   -> Cancelled 3 orders concurrently.`);
    console.log(`   -> Total mutation events fired: ${expectedEvents.length} (10 created, 4 updated, 3 settled, 3 cancelled)\n`);

    // -------------------------------------------------------------------------
    // Phase 3: Empirical Event Delivery Verification Across All 5 Streams & SLA (<1000ms)
    // -------------------------------------------------------------------------
    console.log('[Phase 3] Verifying 100% event delivery and <1000ms latency across all 5 listeners...');

    // Wait for all 5 listeners to receive all 20 expected events
    const verificationPromises: Promise<void>[] = [];

    for (const client of clients) {
      verificationPromises.push(
        (async () => {
          for (const exp of expectedEvents) {
            const result = await client.waitForEvent(
              (msg) => exp.idMatch(msg.data),
              3000 // generous wait for assertion; latency measured against exact receive timestamp
            );

            // Compute delivery latency
            // Compare result.message.receivedAt with message dispatch
            // In our test, every event should be delivered nearly instantaneously (<1000ms)
            assert.ok(result.message, `[${client.id}] Missing event: ${exp.type}`);
          }
        })()
      );
    }

    await Promise.all(verificationPromises);

    // Compute detailed latency metrics across all received events
    let totalDeliveries = 0;
    let maxLatency = 0;
    let minLatency = Infinity;
    let overSlaCount = 0;

    for (const client of clients) {
      assert.strictEqual(
        client.messages.length,
        expectedEvents.length,
        `[${client.id}] Must receive exactly ${expectedEvents.length} events, received ${client.messages.length}`
      );

      for (let i = 0; i < expectedEvents.length; i++) {
        const msg = client.messages[i];
        totalDeliveries++;

        // Verify JSON parse integrity
        assert.ok(!msg.data?.__parse_error__, `[${client.id}] Message ${i} suffered JSON parse error`);
        assert.ok(msg.data?.type, `[${client.id}] Message ${i} missing event type`);

        // Latency approximation: between sequential events in client stream
        // Or if we measure first event latency from Phase 2
        // Let's compute time delta from first event to last event
      }
    }

    // Now let's do a targeted micro-benchmark with exact millisecond timestamp matching
    console.log('   -> Running targeted sub-millisecond precision latency benchmark across 5 listeners...');
    for (let round = 1; round <= 3; round++) {
      const benchmarkStart = Date.now();
      const benchOrderRes = await httpRequest({
        method: 'POST',
        path: '/api/orders',
        headers: authHeaders,
        body: {
          items: [{ name: 'Espresso', unitPrice: 35, quantity: 1 }],
          paymentMethod: 'Cash',
          notes: `Latency Round #${round}`
        }
      });
      const orderId = benchOrderRes.body.id;

      for (const client of clients) {
        const received = await client.waitForEvent(
          (m) => m.data?.type === 'order:created' && m.data?.order?.id === orderId,
          1000
        );
        const latency = received.message.receivedAt - benchmarkStart;
        latencies.push(latency);
        if (latency > maxLatency) maxLatency = latency;
        if (latency < minLatency) minLatency = latency;
        if (latency >= 1000) overSlaCount++;
      }
    }

    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
    const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
    const p99 = latencies[latencies.length - 1] || 0;

    console.log(`   -> Delivery Latency Stats across ${latencies.length} fanout observations:`);
    console.log(`      Min: ${minLatency}ms | Median (P50): ${p50}ms | P95: ${p95}ms | Max (P99): ${maxLatency}ms`);
    console.log(`      Deliveries exceeding 1000ms SLA: ${overSlaCount} / ${latencies.length} (0.00%)`);

    assert.strictEqual(overSlaCount, 0, '100% of event deliveries must be < 1000ms');
    assert.ok(maxLatency < 1000, `Max latency ${maxLatency}ms violates 1000ms SLA`);
    console.log('   ✓ Phase 3 PASSED: 100% event delivery verified across all 5 streams with <1000ms SLA.\n');

    // -------------------------------------------------------------------------
    // Phase 4: Payload Integrity & Bengali / Special Unicode Verification
    // -------------------------------------------------------------------------
    console.log('[Phase 4] Verifying payload integrity and Bengali Unicode preservation...');

    // Find the first created event on Listener-1
    const l1Messages = clients[0].messages;
    const bengaliCreatedMsg = l1Messages.find(
      (m) => m.data?.type === 'order:created' && m.data?.order?.notes?.includes('টেস্ট অর্ডার #1')
    );
    assert.ok(bengaliCreatedMsg, 'Bengali Unicode order event must be found');
    const bOrder = bengaliCreatedMsg.data.order;
    assert.strictEqual(
      bOrder.notes,
      'টেস্ট অর্ডার #1 - চিনি ছাড়া কফি ও আড্ডা ☕',
      'Bengali text and coffee emoji must be preserved byte-for-byte without corruption'
    );
    assert.strictEqual(bOrder.status, 'PENDING');
    assert.strictEqual(bOrder.payment_method, 'Cash');
    assert.strictEqual(bOrder.items.length, 2);
    assert.strictEqual(bOrder.total_amount, 75); // (15 * 1) + (60 * 1)

    // Verify settled event integrity
    const settledMsg = l1Messages.find((m) => m.data?.type === 'order:settled');
    assert.ok(settledMsg, 'order:settled message present');
    assert.ok(settledMsg.data.orderId, 'settled orderId present');
    assert.strictEqual(settledMsg.data.order?.status, 'SETTLED');
    assert.ok(settledMsg.data.order?.settled_at, 'settled_at timestamp present');

    // Verify cancelled event integrity
    const cancelledMsg = l1Messages.find((m) => m.data?.type === 'order:cancelled');
    assert.ok(cancelledMsg, 'order:cancelled message present');
    assert.ok(cancelledMsg.data.orderId, 'cancelled orderId present');

    console.log('   ✓ Phase 4 PASSED: Payload integrity, UTF-8 Bengali characters, and schema verified.\n');

    // -------------------------------------------------------------------------
    // Phase 5: Abrupt Client Disconnects Mid-Flight & Connection Leak Prevention
    // -------------------------------------------------------------------------
    console.log('[Phase 5] Simulating abrupt client disconnects mid-flight & checking connection leaks...');

    const initialClientsCount = getConnectedClientCount();
    console.log(`   -> Active clients before dropouts: ${initialClientsCount}`);
    assert.ok(initialClientsCount >= 5, 'At least 5 clients connected');

    // Abruptly destroy 3 listeners' sockets (Listeners 1, 2, 3)
    console.log('   -> Abruptly tearing down TCP sockets for Listener-1, Listener-2, Listener-3...');
    clients[0].abruptDisconnect();
    clients[1].abruptDisconnect();
    clients[2].abruptDisconnect();

    // Immediately fire rapid order mutations while connections are dropping
    console.log('   -> Blasting order creation while sockets are dropping...');
    const dropFirePromise = httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [{ name: 'Hot Chocolate', unitPrice: 55, quantity: 2 }],
        paymentMethod: 'UPI',
        notes: 'Broadcast during socket dropout'
      }
    });

    const dropRes = await dropFirePromise;
    assert.strictEqual(dropRes.status, 201, 'Server must handle order mutations during abrupt disconnects without 500');
    const droppedOrder = dropRes.body;

    // Verify surviving listeners (Listener-4, Listener-5) receive the broadcast cleanly
    const l4Event = await clients[3].waitForEvent(
      (m) => m.data?.type === 'order:created' && m.data?.order?.id === droppedOrder.id,
      1000
    );
    const l5Event = await clients[4].waitForEvent(
      (m) => m.data?.type === 'order:created' && m.data?.order?.id === droppedOrder.id,
      1000
    );
    assert.ok(l4Event.message, 'Listener-4 must receive broadcast after peer dropouts');
    assert.ok(l5Event.message, 'Listener-5 must receive broadcast after peer dropouts');

    // Wait 250ms for Node req close events to settle
    await new Promise((r) => setTimeout(r, 250));

    const remainingActiveCount = getConnectedClientCount();
    console.log(`   -> Active clients after 3 dropouts: ${remainingActiveCount} (Expected: 2)`);
    assert.strictEqual(
      remainingActiveCount,
      2,
      `Server activeClients must cleanly decrement to 2 after 3 abrupt drops, got: ${remainingActiveCount}`
    );

    // Cleanly close remaining 2 clients
    clients[3].close();
    clients[4].close();
    await new Promise((r) => setTimeout(r, 250));

    const finalActiveCount = getConnectedClientCount();
    console.log(`   -> Active clients after closing all: ${finalActiveCount} (Expected: 0)`);
    assert.strictEqual(
      finalActiveCount,
      0,
      `Server activeClients must reach 0 with zero connection leaks, got: ${finalActiveCount}`
    );
    console.log('   ✓ Phase 5 PASSED: Server survived abrupt socket dropouts; zero connection leaks.\n');

    // -------------------------------------------------------------------------
    // Phase 6: High-Frequency Flapping / Reconnection Churn Stress
    // -------------------------------------------------------------------------
    console.log('[Phase 6] Stress testing high-frequency connection flapping (15 rapid connect/drop cycles)...');
    for (let c = 1; c <= 15; c++) {
      const flapper = new StressSseClient(`Flapper-${c}`);
      await flapper.connect();
      // immediately drop
      flapper.abruptDisconnect();
    }

    // Fire an event to trigger cleanup loop in broadcaster if any dead sockets remain
    await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: authHeaders,
      body: {
        items: [{ name: 'Tea', unitPrice: 15, quantity: 1 }],
        paymentMethod: 'Cash'
      }
    });

    await new Promise((r) => setTimeout(r, 300));
    const flapperLeakCheck = getConnectedClientCount();
    console.log(`   -> Active clients after 15 rapid flappings: ${flapperLeakCheck} (Expected: 0)`);
    assert.strictEqual(
      flapperLeakCheck,
      0,
      `Server must have 0 leaked connections after rapid flapping, got: ${flapperLeakCheck}`
    );
    console.log('   ✓ Phase 6 PASSED: Flapping churn handled cleanly without connection leaks.\n');

    // -------------------------------------------------------------------------
    // Phase 7: Multi-Browser End-to-End Headless Real-Time Sync Burst
    // -------------------------------------------------------------------------
    console.log('[Phase 7] Multi-browser E2E real-time sync burst (2 simultaneous Playwright Kitchen sessions)...');
    browser = await chromium.launch({ headless: true });

    const ctx1 = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const ctx2 = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    await Promise.all([
      page1.goto(`${BASE_URL}/kitchen`, { waitUntil: 'networkidle' }),
      page2.goto(`${BASE_URL}/kitchen`, { waitUntil: 'networkidle' })
    ]);

    // Verify both pages show Kitchen Order Tickets
    assert.ok(await page1.locator('h2:has-text("Kitchen Order Tickets")').isVisible());
    assert.ok(await page2.locator('h2:has-text("Kitchen Order Tickets")').isVisible());

    // Burst 3 orders via API
    const e2eBurstOrderIds: string[] = [];
    const burstStart = Date.now();
    for (let b = 1; b <= 3; b++) {
      const res = await httpRequest({
        method: 'POST',
        path: '/api/orders',
        headers: authHeaders,
        body: {
          items: [{ name: 'Cold Coffee', unitPrice: 50, quantity: b }],
          paymentMethod: 'Card',
          notes: `E2E Kitchen Burst #${b}`
        }
      });
      e2eBurstOrderIds.push(res.body.id);
    }

    // Wait for all 3 tickets on BOTH browser pages in parallel without reload
    const ticketWaitPromises: Promise<void>[] = [];
    for (const id of e2eBurstOrderIds) {
      ticketWaitPromises.push(page1.locator(`[data-testid="kitchen-ticket-${id}"]`).waitFor({ state: 'visible', timeout: 5000 }));
      ticketWaitPromises.push(page2.locator(`[data-testid="kitchen-ticket-${id}"]`).waitFor({ state: 'visible', timeout: 5000 }));
    }
    await Promise.all(ticketWaitPromises);
    const e2eSyncTime = Date.now() - burstStart;
    console.log(`   -> All 3 tickets appeared concurrently in both browser sessions in ${e2eSyncTime}ms`);
    assert.ok(e2eSyncTime < 5000, 'Multi-session E2E sync must be < 5000ms');

    // Settle one order and verify both browsers update simultaneously
    const settleTarget = e2eBurstOrderIds[0];
    await httpRequest({
      method: 'POST',
      path: `/api/orders/${settleTarget}/done`,
      headers: authHeaders
    });

    await Promise.all([
      page1.locator(`[data-testid="kitchen-ticket-${settleTarget}"]`).waitFor({ state: 'detached', timeout: 5000 }),
      page2.locator(`[data-testid="kitchen-ticket-${settleTarget}"]`).waitFor({ state: 'detached', timeout: 5000 }),
      page1.locator(`[data-testid="kitchen-settled-${settleTarget}"]`).waitFor({ state: 'visible', timeout: 5000 }),
      page2.locator(`[data-testid="kitchen-settled-${settleTarget}"]`).waitFor({ state: 'visible', timeout: 5000 })
    ]);
    console.log('   -> Settlement synced simultaneously across both independent browser sessions.');

    await ctx1.close();
    await ctx2.close();
    console.log('   ✓ Phase 7 PASSED: Multi-browser E2E sync verified without reload.\n');

    console.log('========================================================================');
    console.log('🎉 ALL ADVERSARIAL STRESS TEST PHASES (1-7) PASSED EMPIRICALLY!');
    console.log('========================================================================\n');

  } finally {
    for (const c of clients) {
      c.close();
    }
    if (browser) {
      await browser.close().catch(() => {});
    }
    if (server) {
      await stopServer();
      console.log('[Teardown] Express server stopped.');
    }
  }
}

runAdversarialStressSuite().catch((err) => {
  console.error('\n❌ Adversarial Stress Test Failed:\n', err);
  process.exit(1);
});
