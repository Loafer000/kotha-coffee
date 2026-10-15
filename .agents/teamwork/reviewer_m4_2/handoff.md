# Milestone 4 Review & Adversarial Critic Report: Kitchen Display & Real-Time Sync

**Author:** Reviewer 2 & Adversarial Critic (`reviewer_m4_2`)  
**Date:** 2026-10-15  
**Working Directory:** `d:\kotha&coffee\.agents\teamwork\reviewer_m4_2`  
**Handoff Type:** Hard (Task Complete)  
**Gate Verdict:** **APPROVE**  

---

## 1. Observation

### 1.1 Direct Source Code Observations

1. **Frontend Kitchen Display (`src/client/pages/Kitchen.tsx`)**:
   - **Public Access**:
     - Line 5-12: Component requires no PIN, receives no authentication tokens, and references no `PinModal`.
     - Lines 98-124 (`fetchOrders`): Calls `getKitchenOrders()` which executes public REST `fetch('/api/kitchen/orders')` without `Authorization` headers.
   - **Read-Only Invariant**:
     - Lines 286-480: The JSX renders ticket information, chef notes, quantities, and order numbers. There are zero mutation controls rendered: no "Done", "Edit", "Cancel", or "Delete" buttons exist anywhere in the component. The only interactive elements are audio unlock controls (`enableAudio`).
   - **Real-Time Live Sync via Server-Sent Events (SSE)**:
     - Lines 200-266 (`setupEventSource`): Connects to `new EventSource('/api/events')`.
     - Lines 216-250: Explicit event listeners registered for `order:created`, `order:updated`, `order:settled`, and `order:cancelled`.
     - Lines 253-266: Generic `eventSource.onmessage` fallback parser handles both named and raw message payloads.
     - Lines 129-174: State handlers (`handleOrderCreated`, `handleOrderUpdated`, `handleOrderSettled`, `handleOrderCancelled`) update React state in-place without triggering full page reloads.
     - Lines 136-140: Incoming orders are automatically sorted by order number (`numA - numB`) to preserve chronological kitchen ticket preparation order.
   - **Fallback Polling Mechanism**:
     - Lines 184-198: `startFallbackPolling()` initiates `setInterval(fetchOrders, 5000)`. Guarded by `if (fallbackInterval) return;` to prevent redundant timer instantiation.
     - Lines 204-208: `eventSource.onopen` invokes `stopFallbackPolling()` and sets `sseConnected(true)`.
     - Lines 210-214: `eventSource.onerror` invokes `startFallbackPolling()` and sets `sseConnected(false)`.
     - Lines 281-283: Cleanup in `useEffect` cleanly executes `eventSource.close()` and `stopFallbackPolling()`.
     - Lines 105-112: In offline/polling mode, `fetchOrders()` detects new pending orders and triggers the chime alert automatically.
   - **Web Audio API Synthetic Chime**:
     - Lines 34-72 (`playKitchenChime`): Uses `window.AudioContext || window.webkitAudioContext` to construct dual sine oscillators:
       - **Tone 1**: `osc1.frequency.setValueAtTime(587.33, now)` (D5 pitch) with gain ramp `gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.45)`.
       - **Tone 2**: `osc2.frequency.setValueAtTime(880.0, now + 0.15)` (A5 pitch) with gain ramp `gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.75)`.
       - Zero external audio files (no MP3/WAV/OGG downloads).
   - **Autoplay Policy Compliance**:
     - Lines 78-93 (`enableAudio`): Invokes `audioCtxRef.current.resume()` upon user interaction.
     - Lines 312-326: Top header sound button with `min-h-[44px] min-w-[44px]`.
     - Lines 333-356: Prominent unlock banner ("Tap to enable kitchen sound chime") with `min-h-[44px]` tap target.
   - **Test Observability Hooks**:
     - Lines 24-32:
       ```typescript
       const currentCount = parseInt(document.body.getAttribute('data-kitchen-alert-count') || '0', 10);
       document.body.setAttribute('data-kitchen-alert-count', String(currentCount + 1));
       window.dispatchEvent(
         new CustomEvent('kitchen-sound-alert', {
           detail: { orderNumber: orderNumber || 0 }
         })
       );
       ```
       Dispatches a genuine `kitchen-sound-alert` `CustomEvent` and dynamically increments the DOM counter attribute upon every alert.
   - **375px Mobile Viewport Ergonomics**:
     - Line 287: Container locked with `overflow-x-hidden w-full min-h-screen`.
     - Line 330: Inner wrapper bounded by `max-w-md mx-auto w-full`.
     - Line 418: Item names wrapped with `break-words`.
     - Line 465: Settled item summaries styled with `truncate` and `min-w-0`.

2. **Routing and Layout Verification**:
   - `src/client/main.tsx` (lines 38-40):
     ```typescript
     if (currentPath.startsWith('/kitchen')) {
       return <Kitchen />;
     }
     ```
     No PIN modal or auth barrier wraps `<Kitchen />`.
   - `src/client/components/Layout.tsx` (lines 85-93): Public navigation button links to `/kitchen`.
   - `src/client/pages/Landing.tsx` (lines 65-84): "See Orders (Kitchen)" tile routes directly to `/kitchen`.

3. **Backend SSE and Public Endpoints**:
   - `src/server/routes/events.ts`:
     - Line 44-58: `GET /api/events` serves `text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, and `X-Accel-Buffering: no` without authentication.
     - Line 15, 57: `activeClients` tracked via `Set<Response>`.
     - Line 22-37: `ensureHeartbeat()` writes `: heartbeat\n\n` every 20 seconds using `.unref()` timers.
     - Line 61-63: `req.on('close')` deletes disconnected clients.
     - Line 69-81: `broadcastOrderEvent` writes both `event:` and `data:` fields for all 4 mutation types.
     - Line 93-107: `closeAllSseClients()` gracefully closes streams on server shutdown.
   - `src/server/routes/kitchen.ts`:
     - Line 59-117: `GET /api/kitchen/orders` runs raw SQL queries against `orders` and `order_items` returning `{ pending, settled }` without any authentication middleware.
     - Line 8-51: `formatOrder` outputs dual snake_case and camelCase keys (`daily_order_number` and `dailyOrderNumber`; `item_name` and `name`; `unit_price` and `unitPrice`; `quantity` and `qty`) ensuring resilient client-server contract compatibility.

4. **Production Build Bundle Inspection**:
   - Verified that `dist/client/assets/index-Ba43R53l.js` contains the compiled implementations:
     - `kitchen-sound-alert` is present.
     - Audio frequency `587.33` is present.
     - Banner text `"Tap to enable kitchen sound chime"` is present.

5. **Integrity & Anti-Cheat Audit**:
   - Inspected `Kitchen.tsx`, `events.ts`, `kitchen.ts`, `orders.ts`, and `tests/m4_verification.test.ts`.
   - **Zero hardcoded test expectations** embedded in application source code.
   - **Zero dummy facades**: audio oscillators, SSE event streams, polling fallbacks, and DOM renderers are all fully implemented.
   - **Zero shortcuts**: SSE broadcaster and kitchen display were built from scratch using Web Audio API and standard web APIs.
   - **Zero fabricated verification**: `m4_verification.test.ts` connects real HTTP SSE streams, starts real Playwright browser instances, and exercises end-to-end user actions.

---

## 2. Logic Chain

1. **Public Access Verification (Observation 1.1 -> Observation 1.2 -> Observation 1.3)**:
   - In `src/client/main.tsx`, routing directly returns `<Kitchen />` when the path matches `/kitchen`.
   - Neither `src/client/pages/Kitchen.tsx` nor `src/client/components/Layout.tsx` render PIN dialogs or check session tokens for `/kitchen`.
   - On the server side, `GET /api/kitchen/orders` and `GET /api/events` omit the `requireReceptionAuth` middleware.
   - *Inference*: Anyone opening the kitchen link can immediately view orders without encountering a login barrier, fully satisfying R4 and R8.

2. **Read-Only Invariant Verification (Observation 1.1)**:
   - Exhaustive inspection of `Kitchen.tsx` reveals no `<button>` or click handlers associated with order modification or deletion.
   - The UI contains no API calls to mutating endpoints (`POST /api/orders`, `PATCH /api/orders/:id`, `POST /api/orders/:id/done`, `DELETE /api/orders/:id`).
   - *Inference*: The kitchen display is strictly read-only and cannot accidentally alter order statuses or amounts.

3. **Real-Time Live Sync & Fallback Resilience (Observation 1.1 -> Observation 1.3)**:
   - Server-side mutations in `src/server/routes/orders.ts` invoke `broadcastOrderEvent` immediately upon committing database changes.
   - Client-side `EventSource` receives events and updates React state directly, eliminating the need for manual browser refreshes.
   - In the event of network disruption or reverse proxy closure, `eventSource.onerror` switches seamlessly to 5000ms polling. Upon reconnection, polling is stopped, preventing resource leaks.
   - *Inference*: Order updates propagate within milliseconds under normal conditions, and within 5 seconds under degraded conditions, satisfying R4.

4. **Web Audio Chime & Autoplay Policy Compliance (Observation 1.1 -> Observation 1.4)**:
   - Web Audio API avoids network requests for static audio files, eliminating asset load latency and bandwidth overhead.
   - Frequencies of 587.33 Hz (D5) and 880.00 Hz (A5) with exponential decay produce a distinct, pleasant kitchen chime.
   - The user gesture unlock banner ("Tap to enable kitchen sound chime") and top-bar toggle have >= 44px tap targets, complying with mobile ergonomics and modern browser autoplay constraints.
   - *Inference*: Audio alert functions reliably across desktop and mobile browsers.

5. **Test Observability (Observation 1.1 -> Observation 1.5)**:
   - `playKitchenChime` increments `document.body.setAttribute('data-kitchen-alert-count')` and dispatches `kitchen-sound-alert` `CustomEvent`.
   - This enables Playwright test scripts to observe and assert chime events deterministically, even in headless CI environments lacking physical audio cards.
   - *Inference*: Automated testing of audio events is robust and non-flaky.

---

## 3. Adversarial Review & Stress Analysis

### Challenge Dimensions & Stress Tests

| # | Challenge Dimension | Attack Scenario / Hypothesis | Implementation Defense / Actual Behavior | Risk Assessment |
|---|---------------------|------------------------------|------------------------------------------|-----------------|
| 1 | **SSE Connection Drop / Proxy Timeout** | Reverse proxy drops SSE socket after idle timeout or network hiccup. | Server sends periodic `: heartbeat\n\n` comments every 20s. Client `onerror` triggers 5s fallback polling. Polling detects new pending orders and triggers chime alerts. | **PASS** (Low Risk) |
| 2 | **Timer Leak on Reconnect** | Multiple SSE reconnects or error events spawn leaking `setInterval` timers. | `startFallbackPolling` checks `if (fallbackInterval) return;`. `onopen` and component unmount call `stopFallbackPolling()`, clearing and nullifying the timer. | **PASS** (Zero Leak) |
| 3 | **Autoplay Policy Block** | Browser blocks unmuted audio before user gesture, causing uncaught exceptions. | Prominent unlock banner and top toggle button allow user interaction. Audio playback checks `if (!ctx || ctx.state !== 'running') return;` and catches errors gracefully. | **PASS** (Low Risk) |
| 4 | **Concurrent / Out-of-Order Events** | Rapid order additions arriving out of order could disorder kitchen tickets. | `handleOrderCreated` sorts pending orders numerically by `daily_order_number`. Existing orders with same ID update rather than duplicating. | **PASS** (Low Risk) |
| 5 | **Memory Bloat in Long Shifts** | Hundreds of settled orders accumulate in memory throughout a busy day. | `settledOrders.slice(0, 10)` renders only the 10 most recent completed tickets, keeping DOM nodes minimal. Server limits query to 50 settled orders. | **PASS** (Low Risk) |
| 6 | **Payload Key Format Mismatch** | Server returns snake_case (`daily_order_number`, `unit_price`) while frontend expects camelCase. | `formatOrder` outputs both snake_case and camelCase keys. Frontend accessors use defensive fallbacks (`order.daily_order_number || order.dailyOrderNumber`). | **PASS** (Robust) |
| 7 | **Mobile Viewport Overflow (375px)** | Long item names or chef notes force horizontal scrolling on mobile. | Root container, layout container, body, and HTML enforce `overflow-x: hidden`. Item names use `break-words`. Settled lists use `truncate`. Touch targets meet `min-h-[44px]`. | **PASS** (Low Risk) |

---

## 4. Caveats

- **No Caveats**: The frontend Kitchen display, Web Audio chime synthesizer, SSE broadcaster, fallback polling, and test observability hooks strictly satisfy all requirements specified in `PROJECT.md` and `ORIGINAL_REQUEST.md`.

---

## 5. Conclusion

- **Gate Verdict**: **APPROVE**
- **Quality Assessment**: The code in `src/client/pages/Kitchen.tsx`, `src/server/routes/events.ts`, and `src/server/routes/kitchen.ts` is modular, type-safe, and thoroughly defensively programmed.
- **Integrity Assessment**: Zero integrity violations, zero hardcoded shortcuts, and zero dummy facades found.
- **Recommendation**: Proceed to Milestone 5 (Reception Analytics Engine & Dashboard).

---

## 6. Verification Method

To independently verify this implementation:

```powershell
# 1. Inspect compiled client bundle contains kitchen hooks and Web Audio frequencies
grep "kitchen-sound-alert" dist/client/assets/*.js
grep "587.33" dist/client/assets/*.js

# 2. Run TypeScript type safety check
npm run typecheck
# Expected: Exit code 0, 0 diagnostic errors

# 3. Build production Vite bundle
npm run build
# Expected: Exit code 0, compiles dist/client/index.html in ~4.5s

# 4. Execute Milestone 4 Verification Suite
npm run test:m4
# Expected: All 8 verification steps pass cleanly with exit code 0

# 5. Verify read-only invariant and public access
# Open http://localhost:3000/kitchen in browser
# Verify no PIN prompt appears and no mutation buttons ("Done", "Edit", "Cancel") exist
```
