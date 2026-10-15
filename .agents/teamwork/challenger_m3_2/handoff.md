# Milestone 3 Challenger 2 Report: Adversarial Security, Input Boundaries, Route Serving & Mobile Ergonomics

**Author:** Challenger 2 (`challenger_m3_2`)  
**Target:** Milestone 3 (`worker_m3`)  
**Date:** 2026-10-15  
**Working Directory:** `d:\kotha&coffee\.agents\teamwork\challenger_m3_2`  
**Gate Verdict:** **REQUEST_CHANGES**  

---

## 1. Observation

### 1.1 Test Execution & Raw Results
The empirical test suite was constructed at `tests/challenger2_m3_adversarial.test.ts` and executed against the live Express server and Playwright headless Chromium engine at 375px viewport (`width: 375, height: 667`):

**Command:**
```powershell
node node_modules/tsx/dist/cli.mjs tests/challenger2_m3_adversarial.test.ts
```

**Verbatim Execution Summary:**
```
================================================================
=== KOTHA & COFFEE - CHALLENGER 2 ADVERSARIAL AUDIT (M3) ===
================================================================

[Kotha & Coffee] Server running on http://localhost:3125

--- 1. SECURITY & AUTH BOUNDARY ATTACKS ---
  [PASS] [Security & Auth] POST /api/orders without token -> 401
  [PASS] [Security & Auth] PATCH /api/orders/:id without token -> 401
  [PASS] [Security & Auth] POST /api/orders/:id/done without token -> 401
  [PASS] [Security & Auth] DELETE /api/orders/:id without token -> 401
  [PASS] [Security & Auth] POST /api/orders with expired token -> 401
  [PASS] [Security & Auth] PATCH /api/orders/:id with expired token -> 401
  [PASS] [Security & Auth] POST /api/orders/:id/done with expired token -> 401
  [PASS] [Security & Auth] DELETE /api/orders/:id with expired token -> 401
  [PASS] [Security & Auth] POST /api/orders with forged secret token -> 401
  [PASS] [Security & Auth] PATCH /api/orders/:id with forged secret token -> 401
  [PASS] [Security & Auth] POST /api/orders/:id/done with forged secret token -> 401
  [PASS] [Security & Auth] DELETE /api/orders/:id with forged secret token -> 401
  [PASS] [Security & Auth] POST /api/orders with wrong role ('kitchen') token -> 401
  [PASS] [Security & Auth] PATCH /api/orders/:id with wrong role ('kitchen') token -> 401
  [PASS] [Security & Auth] POST /api/orders/:id/done with wrong role ('kitchen') token -> 401
  [PASS] [Security & Auth] DELETE /api/orders/:id with wrong role ('kitchen') token -> 401
  [PASS] [Security & Auth] POST /api/orders with malformed token -> 401
  [PASS] [Security & Auth] PATCH /api/orders/:id with malformed token -> 401
  [PASS] [Security & Auth] POST /api/orders/:id/done with malformed token -> 401
  [PASS] [Security & Auth] DELETE /api/orders/:id with malformed token -> 401
  [PASS] [Security & Auth] POST /api/orders with alg:none token -> 401
  [PASS] [Security & Auth] PATCH /api/orders/:id with alg:none token -> 401
  [PASS] [Security & Auth] POST /api/orders/:id/done with alg:none token -> 401
  [PASS] [Security & Auth] DELETE /api/orders/:id with alg:none token -> 401
  [PASS] [Security & Auth] GET /api/orders without auth -> 401
  [PASS] [Security & Auth] GET /api/kitchen/orders works without auth -> 200 OK

--- 2. INPUT VALIDATION EDGE CASES ---
  [PASS] [Input Validation] POST /api/orders with empty cart (items: []) -> 400
  [PASS] [Input Validation] POST /api/orders with missing items field -> 400
  [PASS] [Input Validation] POST /api/orders with items: "string" -> 400
  [PASS] [Input Validation] POST /api/orders with negative quantity (-2) -> 400
  [PASS] [Input Validation] POST /api/orders with zero quantity (0) -> 400
  [PASS] [Input Validation] POST /api/orders with non-integer quantity (1.5) -> 400
  [PASS] [Input Validation] POST /api/orders with fractional quantity (0.2) -> 400
  [PASS] [Input Validation] POST /api/orders with invalid paymentMethod ("crypto") -> 400
  [PASS] [Input Validation] POST /api/orders with numeric paymentMethod (999) -> 400
  [PASS] [Input Validation] POST /api/orders with empty item name ("") -> 400
  [PASS] [Input Validation] POST /api/orders with negative unit price (-10) -> 400
  [PASS] [Input Validation] POST /api/orders with null element in items -> 400
  [PASS] [Input Validation] PATCH /api/orders/:id with negative quantity -> 400
  [PASS] [Input Validation] PATCH /api/orders/:id with non-integer quantity -> 400
  [PASS] [Input Validation] PATCH /api/orders/:id with invalid payment method -> 400

--- 3. ROUTE SERVING CHECK ---
  [PASS] [Route Serving] GET / returns HTTP 200 with HTML (no Express "Cannot GET")
  [PASS] [Route Serving] GET /reception returns HTTP 200 with HTML (no Express "Cannot GET")
  [PASS] [Route Serving] GET /kitchen returns HTTP 200 with HTML (no Express "Cannot GET")
  [PASS] [Route Serving] GET /analytics returns HTTP 200 with HTML (no Express "Cannot GET")
  [PASS] [Route Serving] GET /any-spa-path returns HTTP 200 with HTML (no Express "Cannot GET")

--- 4. PHONE VIEWPORT (375px) & TAP TARGET ERGONOMICS ---
  [PASS] [Phone Viewport & Ergonomics] Landing page at 375px: zero horizontal overflow
  [PASS] [Phone Viewport & Ergonomics] Landing page at 375px: Add Order & See Orders buttons >= 44px tap targets
  [PASS] [Phone Viewport & Ergonomics] Reception PIN Modal at 375px: zero overflow & keypad tap targets >= 44px
  [PASS] [Phone Viewport & Ergonomics] Reception Add Order tab at 375px: zero horizontal overflow
  [PASS] [Phone Viewport & Ergonomics] Reception Add Order tab at 375px: tabs, categories, steppers, payment, submit >= 44px
  [PASS] [Phone Viewport & Ergonomics] OrderSlip modal at 375px: zero overflow & Next Order button >= 44px
  [PASS] [Phone Viewport & Ergonomics] Pending queue at 375px: zero overflow
     -> Done button size: 187.859375px x 44px
     -> Edit button size: 69.140625px x 44px
     -> Cancel button size: 42px x 44px
  [FAIL] [Phone Viewport & Ergonomics] Pending queue at 375px: Done, Edit, Cancel buttons >= 44px tap target size: Cancel button tap target must be >= 44x44px (got 42px x 44px)
     -> Edit modal close (X) button size: 28px x 28px
     -> Edit modal stepper [-] size: 28px x 28px
     -> Edit modal stepper [+] size: 28px x 28px
     -> Edit modal Cancel button size: 147.5px x 38px
     -> Edit modal Save button size: 145.5px x 38px
  [FAIL] [Phone Viewport & Ergonomics] Edit Order Modal at 375px: item steppers & action buttons >= 44px tap targets: Edit modal steppers must be >= 44x44px (got 28px x 28px)
     -> Cancel modal 'No, Keep' button size: 136px x 38px
     -> Cancel modal 'Yes, Cancel' button size: 134px x 38px
  [FAIL] [Phone Viewport & Ergonomics] Cancel Order Modal at 375px: confirmation buttons >= 44px tap targets: 'No, Keep' button height must be >= 44px (got 38px)
  [PASS] [Phone Viewport & Ergonomics] Kitchen view at 375px: zero overflow, sound toggle >= 44px, no mutation buttons

================================================================
=== ADVERSARIAL AUDIT COMPLETE ===
================================================================

Total Adversarial Checks: 57
Passed: 54
Failed: 3
```

### 1.2 Code Inspection Observations
1. **Pending Queue Order Card Cancel Button**:
   - Location: `src/client/pages/Reception.tsx`, lines 363-368:
     ```tsx
     <button
       onClick={() => setCancellingOrderId(order.id)}
       data-testid={`btn-cancel-${order.id}`}
       className="min-h-[44px] px-3 py-2 bg-rose-50 text-rose-700 rounded-xl font-semibold text-xs border border-rose-200 hover:bg-rose-100 active:scale-95 transition-all flex items-center justify-center"
     >
       <Trash2 className="w-4 h-4" />
     </button>
     ```
   - Direct measurement: The rendered bounding box is **`42px width x 44px height`**.
   - Because only `<Trash2 className="w-4 h-4" />` (16px) is rendered inside with `px-3` (12px * 2) and 2px border, the total width is `16 + 24 + 2 = 42px`, which violates the $\ge 44\text{px}$ touch target requirement.

2. **Edit Order Modal Steppers & Action Buttons**:
   - Location: `src/client/pages/Reception.tsx`, lines 508-536:
     ```tsx
     <button
       type="button"
       onClick={() => { ... }}
       className="w-7 h-7 rounded-lg bg-white border border-[#D7CCC8] text-[#3E2723] font-bold flex items-center justify-center active:scale-95"
     >
       -
     </button>
     <span className="font-bold text-xs px-1 min-w-[16px] text-center">
       {item.quantity}
     </span>
     <button
       type="button"
       data-testid="qty-plus"
       onClick={() => { ... }}
       className="w-7 h-7 rounded-lg bg-[#3E2723] text-white font-bold flex items-center justify-center active:scale-95"
     >
       +
     </button>
     ```
   - Direct measurement: Both `-` and `+` steppers measure **`28px width x 28px height`** (Tailwind `w-7 h-7` is 1.75rem = 28px).
   - In contrast, `src/client/components/OrderCreate.tsx` (lines 226-242) explicitly used `min-h-[44px] min-w-[44px]`.
   - The close button (line 491) measures **`28px x 28px`** (`p-1` with `w-5 h-5`).
   - The Cancel and Save action buttons (lines 576-588) measure **`147.5px x 38px`** and **`145.5px x 38px`** (`py-2.5 rounded-xl`, missing `min-h-[44px]`).

3. **Cancel Order Confirmation Modal Buttons**:
   - Location: `src/client/pages/Reception.tsx`, lines 606-619:
     ```tsx
     <button
       onClick={() => setCancellingOrderId(null)}
       className="flex-1 py-2.5 rounded-xl border border-[#D7CCC8] text-xs font-semibold text-[#5D4037] hover:bg-[#FAF3E0]"
     >
       No, Keep
     </button>
     <button
       onClick={handleConfirmCancel}
       disabled={cancelLoading}
       className="flex-1 py-2.5 rounded-xl bg-rose-700 text-white text-xs font-bold hover:bg-rose-800 shadow"
     >
       {cancelLoading ? 'Cancelling...' : 'Yes, Cancel'}
     </button>
     ```
   - Direct measurement: "No, Keep" is **`136px x 38px`** and "Yes, Cancel" is **`134px x 38px`**. Both are under the required 44px minimum height.

---

## 2. Logic Chain

1. **Security & Authentication Boundary Integrity (Observation 1.1)**:
   - All 4 mutating order endpoints (`POST /api/orders`, `PATCH /api/orders/:id`, `POST /api/orders/:id/done`, `DELETE /api/orders/:id`) and reception listing (`GET /api/orders`) enforce `requireReceptionAuth`.
   - Tested 6 distinct auth bypass scenarios: missing token, expired token, token with forged HMAC secret, token with unauthorized role (`role: 'kitchen'`), malformed garbage token, and `alg: 'none'` token. Every single scenario returned HTTP 401 Unauthorized without leaking data or executing DB mutations.
   - Public kitchen endpoint `GET /api/kitchen/orders` successfully returned HTTP 200 with `{ pending, settled }` without requiring credentials.
   - Security boundary is robust and conforms to Requirement R8 and Acceptance Criteria.

2. **Input Validation & Crash Resilience (Observation 1.1)**:
   - Evaluated 15 boundary attack payloads on `POST /api/orders` and `PATCH /api/orders/:id`.
   - Payloads with empty cart, missing item fields, non-array inputs, negative quantities (-2), zero quantities, non-integer floats (1.5), fractions (0.2), invalid payment methods ("crypto", numeric 999), empty item names, negative unit prices, and null items in arrays are all rejected with HTTP 400 Bad Request.
   - No payload triggered an unhandled exception or HTTP 500 error. Conforms to API contract.

3. **Route Serving & Static Asset Delivery (Observation 1.1)**:
   - Tested direct HTTP GET requests with `Accept: text/html` on `/`, `/reception`, `/kitchen`, `/analytics`, and arbitrary client subroutes.
   - All returned HTTP 200 with `Content-Type: text/html`, complete HTML doctype, cafe branding ("কথা & Coffee"), and zero Express "Cannot GET" errors. Conforms to parent agent spot-check directive.

4. **Phone Viewport Layout & Overflow (Observation 1.1)**:
   - Evaluated DOM layout at iPhone SE viewport (`375px x 667px`) across Landing, Reception (Add Order, Pending queue, Settled queue), OrderSlip modal, and Kitchen view.
   - In all states, `document.documentElement.scrollWidth <= document.documentElement.clientWidth` evaluated to true. Zero horizontal scroll exists at 375px.

5. **Mobile Touch Target Ergonomics Discrepancy (Observations 1.1 & 1.2)**:
   - Requirement R7 explicitly specifies: *"Designed mainly for phones: large tap targets, readable order numbers, and no horizontal scrolling at a 375px-wide viewport."*
   - Acceptance Criteria explicitly specifies: *"At a 375px viewport... large tap targets >= 44px."*
   - The worker correctly implemented $\ge 44\text{px}$ targets on `OrderCreate.tsx` (`min-h-[44px] min-w-[44px]` on steppers, 44px category pills, 48px submit button) and `PinModal.tsx` ($50\text{px} \times 50\text{px}$ keypad buttons).
   - However, in `src/client/pages/Reception.tsx`:
     1. The Cancel button on each pending order card is an icon button measuring only **42px wide** (`min-h-[44px] px-3 py-2`).
     2. The item quantity steppers (`-` and `+`) in the Edit Order modal measure only **28px x 28px** (`w-7 h-7`), which is 36% below the standard and severely hampers one-handed phone usage during rush hours.
     3. The Edit Modal Cancel/Save buttons and Cancel Confirmation Modal buttons use `py-2.5` without `min-h-[44px]`, measuring only **38px high**.
   - These touch target defects violate Requirement R7 and the 44px acceptance standard.

---

## 3. Caveats

- **Kitchen SSE Streaming**: As noted in `worker_m3/handoff.md`, live Server-Sent Events (`/api/events`) and automatic chime alerts are scheduled for Milestone 4. In Milestone 3, polling every 3 seconds was verified.
- **Analytics Date Picker**: Full multi-day calendar aggregation is planned for Milestone 5.
- No other caveats; all 57 empirical adversarial tests executed cleanly in an automated harness.

---

## 4. Conclusion

**Gate Verdict:** **REQUEST_CHANGES**

While the security boundary, input validation, daily sequence numbering, and SPA route serving are properly built and verified:
1. `src/client/pages/Reception.tsx` line 365: Order card Cancel button tap target is **42px** (under 44px).
2. `src/client/pages/Reception.tsx` lines 508-535: Edit Order modal quantity steppers are **28px x 28px** (severely under 44px).
3. `src/client/pages/Reception.tsx` lines 576-588 & 606-619: Edit modal Cancel/Save buttons and Cancel Confirmation modal buttons are **38px** tall (under 44px).

### Required Remediation for Worker M3:
1. In `src/client/pages/Reception.tsx` (line 365): Add `min-w-[44px]` (e.g. `min-h-[44px] min-w-[44px] px-3 py-2`) to the order card Cancel button.
2. In `src/client/pages/Reception.tsx` (lines 517 & 532): Replace `w-7 h-7` with `min-h-[44px] min-w-[44px]` (matching `OrderCreate.tsx`) for the Edit Order modal `-` and `+` steppers.
3. In `src/client/pages/Reception.tsx` (lines 576, 584, 608, 616): Add `min-h-[44px]` to the Cancel/Save buttons in Edit modal and the "No, Keep" / "Yes, Cancel" buttons in Cancel modal.
4. Run `npm run build` and re-run `node node_modules/tsx/dist/cli.mjs tests/challenger2_m3_adversarial.test.ts` to confirm 57/57 tests pass.

---

## 5. Verification Method

To independently reproduce and verify these findings:

1. **Execute Challenger 2 Adversarial Suite**:
   ```bash
   node node_modules/tsx/dist/cli.mjs tests/challenger2_m3_adversarial.test.ts
   ```
   *Observed*: 54 passes, 3 failures.
   - Fails on Pending queue Cancel button (got 42px x 44px, expected $\ge 44\text{px}$).
   - Fails on Edit Order modal steppers (got 28px x 28px, expected $\ge 44\text{px}$).
   - Fails on Cancel confirmation modal buttons (got 38px, expected $\ge 44\text{px}$).

2. **Run Standard Milestone Tests (Regression)**:
   ```bash
   npm run test:m1
   npm run test:m2
   npm run test:m3
   ```
   *Observed*: All pass cleanly.
