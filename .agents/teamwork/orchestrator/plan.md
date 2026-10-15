# Orchestration Plan: Kotha & Coffee POS / Order-Ticket System

## Phase 0: Survey & Scope Mapping
- Spawn 3 parallel Explorers to survey the problem, constraints, environment, and requirements.
  - Explorer 1 (System Architecture, Tech Stack, Free-tier Cloud & Local Storage, Concurrency/Day Reset)
  - Explorer 2 (Feature Inventory, Business Logic, Asia/Kolkata date boundary, R1-R8 Acceptance Criteria)
  - Explorer 3 (Automated E2E Testing Strategy, Multi-session Playwright/Puppeteer harness, Audio/sound alert verification, Viewport overflow detection, Injected clock for date roll)
- Synthesize findings into `PROJECT.md` at root.

## Phase 1: Dual-Track Execution
- **Track A: E2E Testing Orchestrator**
  - Setup test framework (e.g. Playwright / test runner).
  - Write Tier 1 (Feature coverage >= 5 per feature), Tier 2 (Boundary & Corner >= 5 per feature), Tier 3 (Cross-feature interactions), Tier 4 (Real-world café scenarios).
  - Generate `TEST_INFRA.md` and publish `TEST_READY.md`.
- **Track B: Implementation Sub-orchestrators**
  - M1: Foundation, Data Layer, Real-time Sync, Server/API, PIN Auth, Multi-client Sync (Free-tier cloud / SQLite / Supabase / Firebase / WebSockets / SSE / Polling).
  - M2: Menu Management & Seeding (Initial menu from menu.jpeg or defaults, price history isolation).
  - M3: Reception UI & Order Lifecycle (Add order, #1 daily sequence Asia/Kolkata, large confirmation slip, edit/cancel, move to settled, 375px responsive).
  - M4: Kitchen UI (Live sync without refresh, read-only, audio alert on new order, pending/settled sections, 375px responsive).
  - M5: Analytics Engine & Dashboard (Date picker, previous days, per-item qty & sales, payment breakdown, settled & non-cancelled only).
  - M6: Deliverables & Screenshots (Phone viewport screenshots, comprehensive README with local run/test instructions and free-tier cloud deployment guide).

## Phase 2: Final Verification & Hardening
- Pass 100% of E2E tests (Tiers 1-4).
- Adversarial coverage hardening (Tier 5 with Challenger).
- Independent Forensic Audit verification (zero tolerance for integrity violations).
- Send completion report to Sentinel.
