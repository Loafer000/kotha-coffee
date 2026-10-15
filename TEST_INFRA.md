# Kotha & Coffee POS — Automated E2E Testing Infrastructure

This document describes the complete automated End-to-End (E2E) testing architecture, methodology, and runner commands for the **Kotha & Coffee** ("কথা & Coffee") phone-first POS and kitchen ticket system.

---

## 1. Test Architecture Overview

The test harness is built on **Playwright** (`@playwright/test`), configured specifically for phone-first ergonomics, Indian Standard Time (`Asia/Kolkata`), multi-session isolation, and cross-platform Windows execution without Unix shell dependencies.

```
d:\kotha&coffee\
├── playwright.config.ts                      # Core Playwright configuration
├── screenshots/                              # 7 deliverable mobile screenshots (375px)
│   ├── 01_landing.png
│   ├── 02_create_order.png
│   ├── 03_order_confirmation_slip.png
│   ├── 04_reception_pending.png
│   ├── 05_reception_settled.png
│   ├── 06_reception_analytics.png
│   └── 07_kitchen_view.png
└── tests/
    ├── fixtures/                             # Authoritative data fixtures
    │   ├── menu-items.fixture.ts             # 34 menu items matching menu.jpeg
    │   ├── seeded-analytics.fixture.ts       # 3-day dataset & exact mathematical sums
    │   └── seed-helper.ts                    # REST & DB seeding utility
    ├── helpers/                              # Specialized test controllers
    │   ├── audio-spy.ts                      # Spies on HTMLAudioElement & Web Audio API
    │   ├── overflow-checker.ts               # 375px scrollWidth <= clientWidth crawler
    │   ├── clock-controller.ts               # Asia/Kolkata date injection & mock clock
    │   ├── server-controller.ts              # Process restart & health polling
    │   └── auth-helper.ts                    # 12h session token & PIN unlock
    └── e2e/                                  # 4 Test Tiers + Screenshot Generator
        ├── tier1-feature-coverage/           # 6 files, >=5 tests per feature
        ├── tier2-boundary-edge/              # Concurrency, PIN 401, 375px overflow, restart
        ├── tier3-interactions/               # Live sync <5s, date roll #1 reset, immutability, audio
        ├── tier4-real-world-workflows/       # 20-order rush hour, 3-day math audit, lifecycle
        └── screenshots/                      # Automated deliverable screenshot generator
```

### Key Architectural Decisions:
1. **Phone-First Viewport**: All browser contexts default to `{ width: 375, height: 667 }` (iPhone SE standard), validating one-handed thumb ergonomics and asserting zero horizontal scrolling (`scrollWidth <= clientWidth`).
2. **Authoritative Server Timezone (`Asia/Kolkata`)**: Timezone emulation (`timezoneId: 'Asia/Kolkata'`) and server mock clock injection (`X-Mock-Date` or `/api/test/set-time`) ensure daily sequence resets to #1 at 00:00:00 IST are deterministically verifiable.
3. **Multi-Session Incognito Isolation**: Tests for real-time kitchen synchronization instantiate distinct browser contexts (`browser.newContext()`) for Reception and Kitchen, verifying zero page reload via DOM session tokens.
4. **Deterministic Audio Spying**: Intercepts `HTMLAudioElement.prototype.play` and Web Audio API `AudioContext.prototype.createOscillator` to verify kitchen acoustic alerts in headless environments without physical audio hardware.
5. **Sequential Single Worker (`workers: 1`)**: Ensures complete database state isolation during concurrency burst, date rollover, and process restart tests.

---

## 2. Test Tiers & Coverage Mapping

| Tier | Directory | Focus & Scope | Acceptance Criteria Covered |
| :--- | :--- | :--- | :--- |
| **Tier 1** | `tests/e2e/tier1-feature-coverage/` | Primary behavior & UI controls across Landing, Reception, Menu, Kitchen, Analytics, and PIN. | R1, R2, R3, R4, R5, R8 |
| **Tier 2** | `tests/e2e/tier2-boundary-edge/` | Concurrency bursts, PIN security 401 route guards, 375px horizontal overflow, process restart persistence, and cart boundaries. | AC 3, AC 9, AC 11, AC 12 |
| **Tier 3** | `tests/e2e/tier3-interactions/` | Cross-device live synchronization (<5s without reload), Asia/Kolkata midnight rollover (#1 reset), price immutability, and audio alert trigger. | AC 1, AC 2, AC 4, AC 5, AC 6, AC 8, AC 10 |
| **Tier 4** | `tests/e2e/tier4-real-world-workflows/` | Full 20-order cafe rush hour simulation, 3-day seeded analytics mathematical audit (exact ₹0.00 accuracy), and complete opening-to-closing lifecycle. | AC 7, Real-World Workflows |
| **Screenshots** | `tests/e2e/screenshots/` | Automated high-fidelity PNG capture of all 7 deliverable views at 375px mobile width. | Deliverable 2 |

---

## 3. Test Fixtures & Ground-Truth Mathematics

### Menu Items Fixture (`tests/fixtures/menu-items.fixture.ts`)
Contains all **34 authentic cafe items** across 6 categories directly transcribed from `menu.jpeg`:
- **Drinks** (9 items): Tea (₹15), Cappuccino (₹30), Cold Coffee (₹50), Cold Coffee with Ice Cream (₹70), 5 Milkshakes (₹99-₹110).
- **Snacks** (13 items): Momos (₹60-₹75), Fish Fry (₹70), Fish Finger (₹89), Fish Ball (₹89), Chicken Strips (₹69), Chicken Popcorn (₹79), Chicken Cheese Finger (₹79), French Fries (₹50), Cheese Loaded Fries (₹69), Chicken Cheese Loaded Fries (₹89).
- **Pasta** (1 item): White Sauce Pasta (₹70).
- **Sandwich** (4 items): Veg grill (₹59), Corn cheese grill (₹69), Chicken grill (₹79), Chicken cheese grill (₹89).
- **Mocktails** (4 items): Green Mint Mojito (₹49), Blue Lagoon (₹49), Masala Cold Drink (₹49), Minty Bliss (₹49).
- **Ice Cream** (3 items): Chocolate (₹40), Vanilla (₹40), Butterscotch (₹40).

### Seeded Analytics Mathematical Fixture (`tests/fixtures/seeded-analytics.fixture.ts`)
Multi-day dataset spanning 3 days with mixed payment methods, pending orders, and cancelled orders.
**Ground-Truth Invariants**:
1. **Strict Exclusion**: Cancelled orders and pending orders contribute ₹0.00 to all sales and revenue totals.
2. **Formula Integrity**:
   $$\text{Grand Total} \equiv \text{Total}_{\text{Cash}} + \text{Total}_{\text{UPI}} + \text{Total}_{\text{Card}} \equiv \sum (\text{Qty} \times \text{Historical Unit Price})$$

- **Day 1 (2026-10-10)**: Grand Total = ₹270 (Cash: ₹90, UPI: ₹150, Card: ₹30). Order #4 (Cancelled, ₹59) excluded.
- **Day 2 (2026-10-11)**: Grand Total = ₹416 (Cash: ₹0, UPI: ₹238, Card: ₹178). Order #3 (Pending, ₹75) excluded.
- **Day 3 (2026-10-12)**: Grand Total = ₹525 (Cash: ₹427, UPI: ₹0, Card: ₹98).

---

## 4. Test Runner Commands

The test suite is fully turnkey and executable on Windows PowerShell using npm scripts:

### Single Turnkey Command (Runs Entire Test Suite):
```powershell
npm test
```
or
```powershell
npm run test:e2e
```

### Targeted Tier Execution:
```powershell
# Tier 1: Feature Coverage (Landing, Reception, Menu, Kitchen, Analytics, PIN)
npm run test:tier1

# Tier 2: Boundary & Edge (Concurrency burst, PIN 401, 375px overflow, Restart)
npm run test:tier2

# Tier 3: Interactions (Live sync <5s, Date roll #1 reset, Price immutability, Audio alert)
npm run test:tier3

# Tier 4: Real-World Workflows (Rush hour, 3-day math audit, Full day lifecycle)
npm run test:tier4

# Automated Deliverable Screenshots (Captures 7 mobile screenshots into ./screenshots/)
npm run test:screenshots
```

### TypeScript Type-Checking:
```powershell
npm run typecheck
```
