## 2026-10-15T05:24:57Z

You are the Implementation Worker for Milestone 4 (Kitchen Display & Real-Time Sync) of the Kotha & Coffee POS project.
Your working directory is: d:\kotha&coffee\.agents\teamwork\worker_m4

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

You MUST read these files before doing anything:
1. d:\kotha&coffee\.agents\teamwork\ORIGINAL_REQUEST.md
2. d:\kotha&coffee\PROJECT.md
3. d:\kotha&coffee\.agents\teamwork\worker_m3_gen2\handoff.md

Your Scope:
1. Server-Sent Events (SSE) Broadcaster (`src/server/routes/events.ts`):
   - Endpoint: `GET /api/events` (public, no auth required).
   - Headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`.
   - Maintain active SSE client connections; clean up on `close` event.
   - Periodic heartbeat comment (`: heartbeat\n\n`) every 20s to prevent reverse-proxy timeouts.
   - Export `broadcastOrderEvent(event: OrderEvent)` supporting:
     - `order:created` -> `{ type: 'order:created', order: Order }`
     - `order:updated` -> `{ type: 'order:updated', order: Order }`
     - `order:settled` -> `{ type: 'order:settled', orderId: string, order: Order }`
     - `order:cancelled` -> `{ type: 'order:cancelled', orderId: string }`
   - Wire event broadcasting into `src/server/routes/orders.ts`:
     - In `POST /api/orders`: broadcast `order:created`.
     - In `PATCH /api/orders/:id` and `PUT`: broadcast `order:updated`.
     - In `POST /api/orders/:id/done`: broadcast `order:settled`.
     - In `DELETE /api/orders/:id`: broadcast `order:cancelled`.
   - Mount `eventsRouter` on `/api/events` in `src/server/index.ts`.

2. Real-Time Kitchen Display & Web Audio Chime (`src/client/pages/Kitchen.tsx`):
   - Public read-only view: Accessible without PIN prompt.
   - Display pending orders with large, prominent order numbers (#1, #2, …), item details, quantities, notes, order time, and settled orders archive.
   - Real-time live synchronization:
     - Connect to `/api/events` using `EventSource`.
     - Update React state automatically on events (`order:created`, `order:updated`, `order:settled`, `order:cancelled`) without manual page refresh.
     - Fallback polling every 5s if EventSource disconnects.
   - Audible new-order alert (Web Audio API):
     - Implement synthetic dual-tone bell chime using Web Audio API `AudioContext` (e.g. 587Hz -> 880Hz, D5-A5 pleasant chime) so no external audio files are required.
     - Prominent audio unlock banner / button ("Tap to enable kitchen sound chime") to handle browser autoplay policies.
     - Test hook: On playing sound alert, dispatch `window.dispatchEvent(new CustomEvent('kitchen-sound-alert', { detail: { orderNumber: order.daily_order_number } }))` and update `document.body.setAttribute('data-kitchen-alert-count', ...)` so tests can reliably detect chimes.

3. Automated Verification Suite (`tests/m4_verification.test.ts`):
   - Add `"test:m4": "node node_modules/tsx/dist/cli.mjs tests/m4_verification.test.ts"` to `package.json`.
   - Test suite steps:
     1. `GET /api/events` connects and receives SSE stream headers.
     2. Creating order broadcasts `order:created` within <1s.
     3. Editing pending order broadcasts `order:updated`.
     4. Marking order Done broadcasts `order:settled`.
     5. Cancelling order broadcasts `order:cancelled`.
     6. Kitchen view reflects order creation, Done, and Cancel within <5s without page reload.
     7. Sound alert event `kitchen-sound-alert` is triggered and observable.
     8. Kitchen page and `/api/events` load without PIN.

4. Execute Verification:
   - `npm run build` (must pass in ~4.5s with exit code 0)
   - `npm run typecheck` (must pass with exit code 0)
   - `npm run test:m4` (must pass all steps)
   - `npm run test:m3`, `npm run test:m2`, `npm run test:m1` (regression tests)

Deliverables:
- Maintain `d:\kotha&coffee\.agents\teamwork\worker_m4\progress.md` with timestamps.
- Write your complete handoff report to `d:\kotha&coffee\.agents\teamwork\worker_m4\handoff.md`.
- Send a completion message back to me (the orchestrator).


## 2026-10-15T05:41:16Z

**Context**: Milestone 4 Verification Commands
**Content**: When executing commands on this Windows environment via `run_command`, set `BypassSandbox: true` on your `run_command` tool calls to avoid sandbox permission prompt timeouts.
**Action**: Execute `npm run typecheck`, `npm run build`, and `npm run test:m4` with `BypassSandbox: true`, verify the results, and deliver your handoff report.
