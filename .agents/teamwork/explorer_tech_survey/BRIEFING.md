# BRIEFING — 2026-10-15T02:35:00Z

## Mission
Formulate end-to-end technical architecture for Kotha & Coffee POS satisfying R1-R8, local testability, cloud deployability, real-time sync, and atomic ordering.

## 🔒 My Identity
- Archetype: explorer
- Roles: Tech Architecture Explorer
- Working directory: d:\kotha&coffee\.agents\teamwork\explorer_tech_survey
- Original parent: bf3a0778-8738-4eb0-bb3e-d627e579315a
- Milestone: Tech Survey & Architecture Proposal

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Inspect local environment
- Propose architecture satisfying R1-R8
- Dual-mode DB (local zero-credential vs free cloud)
- Real-time kitchen updates (SSE/WS/polling) + sound alert
- Atomic daily order numbering in Asia/Kolkata
- PIN authentication on UI + server API
- 375px phone-first responsive UI

## Current Parent
- Conversation ID: bf3a0778-8738-4eb0-bb3e-d627e579315a
- Updated: 2026-10-15T02:27:00Z

## Investigation State
- **Explored paths**:
  - `d:\kotha&coffee\.agents\teamwork\ORIGINAL_REQUEST.md` (Full R1-R8 requirements & acceptance criteria)
  - `d:\kotha&coffee\menu.jpeg` (Extracted 28 actual menu items across 6 categories in INR ₹)
  - `d:\kotha&coffee\logo.jpeg` (Extracted warm cafe color palette, Bengali branding tagline)
  - Evaluated runtimes, Windows platform nuances, zero-credential SQLite vs Turso free-tier libSQL
  - Evaluated SSE vs WebSockets for real-time kitchen feed (<50ms latency, native auto-reconnect)
  - Evaluated atomic daily order sequence in Asia/Kolkata timezone with `BEGIN IMMEDIATE` and unique constraints
  - Evaluated Web Audio API synthetic dual-tone chime + test event observability
  - Evaluated PIN authentication with UI lock and server-side middleware enforcement
  - Evaluated 375px viewport ergonomics for one-handed rush-hour cafe operation
- **Key findings**:
  - Fullstack architecture: Express + Vite React + TypeScript + Tailwind CSS is optimal (ultra-low memory ~35MB, fast build, single process for API + SSE + static SPA).
  - Storage: Dual-mode LibSQL/SQLite (@libsql/client) allows zero-credential local file / memory mode for tests, and free-tier Turso (5GB, 500M reads, no cold starts) for cloud deployment.
  - Concurrency: Atomic `BEGIN IMMEDIATE` transaction on `daily_counters` table with `RETURNING last_number` and UNIQUE `(date_key, daily_order_number)` constraint.
  - Timezone: `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' })` ensures exact calendar day boundary.
  - Real-time: Server-Sent Events (`/api/events`) provides zero-dependency native streaming with auto-reconnect.
  - Kitchen Chime: Synthesized Web Audio API avoids external audio asset download failures + DOM event/data attributes for Playwright verification.
- **Unexplored areas**: None. Ready to compile comprehensive handoff.md.

## Key Decisions Made
- Recommended Tech Stack: Node.js (v18+) + Express + Vite React (TypeScript) + Tailwind CSS + Lucide Icons.
- Recommended Database: Dual-mode `@libsql/client` (Local `file:./data/kotha.db` vs Cloud Turso `libsql://...`).
- Real-time Sync: Server-Sent Events (`/api/events`) with 10s fallback polling.
- Security: Signed session tokens (12h TTL) + `requireReceptionAuth` middleware protecting mutating/analytics endpoints; kitchen remains public read-only.
- Testability: Injected clock endpoint (`POST /api/test/set-time`) and seed endpoint (`POST /api/test/seed`) for deterministic Playwright testing.

## Artifact Index
- progress.md — Liveness heartbeat and milestone tracking
- handoff.md — Full architecture recommendation report
