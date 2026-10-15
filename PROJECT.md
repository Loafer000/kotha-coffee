# Project: Kotha & Coffee POS / Order-Ticket System

## Architecture
The system is a phone-first, web-based Point of Sale (POS) and live kitchen ticket application built for Kotha & Coffee ("কথা & Coffee").
It operates in a single lightweight Node.js process serving an Express backend and a Vite React Single-Page Application (SPA) on a single port (3000), optimized for 375px mobile viewports and free-tier cloud hosting (Render + Turso libSQL).

```
[ Reception Phone / Owner PC ]                   [ Kitchen Phone ]
       │ (PIN authenticated)                            │ (Read-only, no PIN)
       │ HTTP /api/orders, /menu, /analytics            │ SSE /api/events, GET /kitchen
       ▼                                                ▼
┌─────────────────────────────────────────────────────────────┐
│                   Express HTTP Server                       │
│  - PIN Auth Middleware (12h session token, 401 guard)       │
│  - Asia/Kolkata Clock Engine (Atomic daily reset to #1)     │
│  - Real-time SSE Broadcaster (sub-second order events)      │
│  - Analytics Aggregator (Settled, non-cancelled only)       │
│  - Static Asset / React SPA File Server                     │
└──────────────────────────────┬──────────────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
   [ Local SQLite DB ]                  [ Turso Cloud LibSQL ]
   `data/kotha.db` (Local/Test)         `libsql://...` (Cloud Deploy)
```

- **Persistence Layer**: Dual-mode LibSQL client (`@libsql/client`). In local dev and testing, runs zero-config against `file:./data/kotha.db` or in-memory. In cloud production, connects to Turso serverless database via `DATABASE_URL` and `DATABASE_AUTH_TOKEN`.
- **Concurrency & Sequence Invariant**: Order numbers start at `#1` every day based on `Asia/Kolkata` (UTC+05:30) local time. An atomic counter table (`daily_counters`) with `BEGIN IMMEDIATE` / upsert and a strict table constraint `UNIQUE(date_key, order_number)` guarantees no duplicate sequence numbers exist under concurrent requests.
- **Real-Time Push**: Server-Sent Events (SSE) on `/api/events` pushes state mutations (`order:created`, `order:updated`, `order:settled`, `order:cancelled`) to kitchen phones within milliseconds without manual page reloads. Includes 10s fallback polling.
- **Audio Feedback**: Kitchen phone synthesizes a dual-tone chime (Web Audio API) upon receiving new pending orders, with a friendly mobile user-gesture unlock banner.
- **Security Boundary**: Reception routes and mutating API endpoints (`/api/orders/*`, `/api/menu/*`, `/api/analytics`) require a valid 12-hour session token issued via PIN verification (`ADMIN_PIN`, default `1234`). Kitchen views and `/api/orders/kitchen` are strictly public and read-only.
- **Responsive Layout**: Tailwind CSS mobile shell locked to `overflow-x: hidden` with `scrollWidth <= clientWidth` at 375px width (iPhone SE standard), large $\ge 48\text{px}$ touch targets, and Bengali brand theme.

---

## Feature Inventory

Every feature discovered in the survey phase is mapped to a specific implementation milestone below.

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | Two-Role Landing Portal | Splash/landing page displaying dual access tiles: "Add Order" (reception) and "See Orders" (kitchen). | M3 | R1 |
| F2 | Reception PIN Gatekeeper | Numeric PIN modal protecting all reception views and management features. | M1 | R8 |
| F3 | Persistent Shift Session | 12-hour session token caching to avoid repeated PIN prompts during rush hours. | M1 | R8 |
| F4 | Server-Side API Guard | Server middleware rejecting data mutations without valid session token with HTTP 401. | M1 | R8 |
| F5 | Owner PIN Management | Ability for cafe owner to update the reception PIN code. | M1 | R8 |
| F6 | Visual Menu Catalog Picker | Phone-optimized category filter tabs and item cards for quick order assembly. | M3 | R2 |
| F7 | Cart Quantity Stepper | Increment/decrement buttons (`+` / `-`) for line items with real-time subtotal updates. | M3 | R2 |
| F8 | Payment Method Selector | Single-select choice between Cash, UPI, and Card. | M3 | R2 |
| F9 | Dynamic Cart Total Calculation | Real-time calculation of order grand total: $\sum (\text{unit\_price} \times \text{qty})$. | M3 | R2 |
| F10 | Atomic Daily Order Numbering | Sequential order numbering starting at #1 every day at 00:00:00 Asia/Kolkata with concurrency safety. | M1 | R2, R6 |
| F11 | Prominent Order Slip Confirmation | High-visibility confirmation screen showing the assigned order number in large font for paper slips. | M3 | R2 |
| F12 | Pending Orders Queue (Reception) | List of active pending orders awaiting preparation and settlement with items, notes, totals. | M3 | R2 |
| F13 | Edit Pending Order | In-place modification of pending order items, quantities, or payment method with total recalculation. | M3 | R2 |
| F14 | Settle Order ("Done" Action) | Moves order status from Pending to Settled; locks order from future edits. | M3 | R2 |
| F15 | Cancel / Delete Order | Cancels an order, removing it from active lists and strictly excluding from analytics. | M3 | R2 |
| F16 | Settled Orders Queue (Reception) | Archive view of completed orders for the current day. | M3 | R2 |
| F17 | Add Menu Item | Reception interface to introduce a new offering to the menu catalog. | M2 | R3 |
| F18 | Edit Menu Item | Update existing menu item's name, category, or price. | M2 | R3 |
| F19 | Remove Menu Item | Remove an item from the active menu catalog without affecting past orders. | M2 | R3 |
| F20 | Price Immutability Protection | Historical price locking: past orders preserve snapshot prices regardless of menu price changes. | M2 | R3 |
| F21 | Read-Only Kitchen Interface | Hands-free display showing Pending and Settled queues; no mutation controls. | M4 | R4 |
| F22 | Real-Time Sync (<5s) | Automatic propagation of new orders, edits, cancellations, and settlements to kitchen screen in <5s without reload. | M4 | R4 |
| F23 | Audible New Order Alert | Acoustic chime/tone triggered on kitchen device whenever a new order is received. | M4 | R4 |
| F24 | Historical Date-Wise Picker | Reception calendar selector allowing staff/owner to inspect any past date. | M5 | R5 |
| F25 | Item Quantity & Revenue Breakdown | Aggregated table/cards showing total quantity sold and total revenue per menu item. | M5 | R5 |
| F26 | Daily Grand Total Calculation | Total gross revenue for the day across all settled orders. | M5 | R5 |
| F27 | Payment Method Split | Breakdown of settled revenue by Cash, UPI, and Card. | M5 | R5 |
| F28 | Strict Non-Settled Exclusion | Invariant: Pending and Cancelled orders are strictly omitted from all financial metrics. | M5 | R5 |
| F29 | Shared Cloud & Local Storage | Database storage supporting multi-device internet sync and full offline/local development. | M1 | R6 |
| F30 | Deployment Guide & Seed Script | Step-by-step beginner guide for free-tier cloud deployment + initial menu seed from menu.jpeg. | M6 | R6 |
| F31 | 375px Responsive Mobile Layout | Strict phone-first layout with zero horizontal overflow and thumb-friendly tap targets. | M3 | R7 |
| F32 | Bengali Heritage & Cafe Theme | Authentic "কথা & Coffee" branding with warm cafe palette, Bengali logo, and tagline. | M3 | logo.jpeg, menu.jpeg |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| **M1** | Foundation, Data Layer, Server & PIN Auth | Express setup, TypeScript, `@libsql/client` dual mode, DB schema & migrations, atomic sequence counter table in `Asia/Kolkata`, PIN verification middleware (12h session token, 401 rejection on mutations), clock injection test endpoints. (Features: F2, F3, F4, F5, F10, F29) | none | DONE |
| **M2** | Menu Management & Catalog Seeding | Seed 34 items from `menu.jpeg` across 6 categories, menu CRUD REST endpoints, historical line-item snapshot model (`unit_price` immutable), reception menu management UI. (Features: F17, F18, F19, F20) | M1 | DONE |
| **M3** | Reception POS & Order Lifecycle | Two-role entry portal, PIN keypad modal, order creation POS with category tabs, steppers, Cash/UPI/Card payment picker, large confirmation slip modal, pending queue, edit pending modal, cancel action, settle action, settled queue, 375px phone layout. (Features: F1, F6, F7, F8, F9, F11, F12, F13, F14, F15, F16, F31, F32) | M1, M2 | DONE |
| **M4** | Kitchen Display & Real-Time Sync | Public `/kitchen` view (zero PIN prompt), read-only order queues, SSE `/api/events` real-time broadcaster (<5s latency without reload), fallback polling, Web Audio API synthetic chime alert, audio unlock gesture banner, test-observable sound event hooks. (Features: F21, F22, F23) | M1, M3 | DONE |
| **M5** | Reception Analytics Engine & Dashboard | Analytics REST endpoint `GET /api/analytics?date=YYYY-MM-DD` (settled, non-cancelled only), date-wise calendar picker, daily grand total, payment breakdown (Cash/UPI/Card), item sales breakdown, math invariant verification. (Features: F24, F25, F26, F27, F28) | M1, M3 | PLANNED |
| **M6** | Deliverables, Automated Screenshots & E2E Test Suite | Comprehensive README with local run/test instructions and free-tier cloud deployment guide (Render + Turso), automated Playwright capture of 7 mobile screenshots (375px), 100% pass of E2E test suite (Tiers 1-4), adversarial hardening (Tier 5), and final Forensic Audit. (Features: F30) | M1, M2, M3, M4, M5, E2E Test Track | PLANNED |

---

## Interface Contracts

### 1. Database Schema Contracts
```sql
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS menu_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price REAL NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_counters (
  date_key TEXT PRIMARY KEY,
  last_number INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  date_key TEXT NOT NULL,
  daily_order_number INTEGER NOT NULL,
  status TEXT NOT NULL,           -- 'PENDING', 'SETTLED', 'CANCELLED'
  payment_method TEXT NOT NULL,   -- 'Cash', 'UPI', 'Card'
  total_amount REAL NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  settled_at TEXT,
  updated_at TEXT NOT NULL,
  CONSTRAINT uq_daily_order UNIQUE (date_key, daily_order_number)
);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id TEXT,
  item_name TEXT NOT NULL,
  unit_price REAL NOT NULL,
  quantity INTEGER NOT NULL,
  subtotal REAL NOT NULL,
  created_at TEXT NOT NULL
);
```

### 2. REST & SSE API Contracts

| Method | Endpoint | Auth | Purpose | Request Body / Query | Success Response | Error Response |
|---|---|---|---|---|---|---|
| `GET` | `/api/health` | None | Health check & clock | None | `200 { status: "ok", time: string, dateKey: string }` | `500` |
| `POST` | `/api/auth/verify-pin` | None | Verify PIN & issue 12h token | `{ pin: string }` | `200 { token: string, expiresIn: number }` | `401 { error: "Invalid PIN" }` |
| `POST` | `/api/auth/change-pin` | Bearer Token | Update owner PIN | `{ currentPin: string, newPin: string }` | `200 { success: true }` | `400 / 401` |
| `GET` | `/api/menu` | None | List active menu items | None | `200 MenuItem[]` | `500` |
| `POST` | `/api/menu` | Bearer Token | Add menu item | `{ name: string, category: string, price: number }` | `201 MenuItem` | `400 / 401` |
| `PUT` | `/api/menu/:id` | Bearer Token | Edit menu item | `{ name: string, category: string, price: number, is_active?: boolean }` | `200 MenuItem` | `400 / 401 / 404` |
| `DELETE` | `/api/menu/:id` | Bearer Token | Deactivate/remove menu item | None | `200 { success: true }` | `401 / 404` |
| `GET` | `/api/orders` | Bearer Token | Reception orders query | `?date=YYYY-MM-DD&status=PENDING` | `200 OrderWithItems[]` | `401` |
| `POST` | `/api/orders` | Bearer Token | Create order (atomic sequence) | `{ items: [{ menuItemId, name, unitPrice, quantity }], paymentMethod: "Cash"|"UPI"|"Card", notes?: string }` | `201 OrderWithItems` | `400 / 401` |
| `PATCH` | `/api/orders/:id` | Bearer Token | Edit pending order | `{ items: [{ menuItemId, name, unitPrice, quantity }], paymentMethod: "Cash"|"UPI"|"Card" }` | `200 OrderWithItems` | `400 / 401 / 404 / 409` |
| `POST` | `/api/orders/:id/done` | Bearer Token | Settle order ("Done") | None | `200 OrderWithItems` | `401 / 404 / 409` |
| `DELETE` | `/api/orders/:id` | Bearer Token | Cancel order | None | `200 { success: true }` | `401 / 404 / 409` |
| `GET` | `/api/kitchen/orders` | None | Public kitchen orders | None | `200 { pending: OrderWithItems[], settled: OrderWithItems[] }` | `500` |
| `GET` | `/api/events` | None | SSE live stream | None | `text/event-stream` (`order:created`, `order:updated`, `order:settled`, `order:cancelled`) | `500` |
| `GET` | `/api/analytics` | Bearer Token | Daily sales breakdown | `?date=YYYY-MM-DD` | `200 { date, grandTotal, orderCount, paymentBreakdown: { Cash, UPI, Card }, itemSales: [...] }` | `401` |
| `POST` | `/api/test/set-time` | None (Test env only) | Override clock | `{ timestamp?: string, dateKey?: string }` | `200 { dateKey: string }` | `403 in prod` |
| `POST` | `/api/test/reset-time`| None (Test env only) | Restore clock | None | `200 { restored: true }` | `403 in prod` |
| `POST` | `/api/test/seed` | None (Test env only) | Seed test orders | `{ days: number }` | `200 { seededOrders: number }` | `403 in prod` |
| `POST` | `/api/test/reset` | None (Test env only) | Clean test DB | None | `200 { reset: true }` | `403 in prod` |

---

## Code Layout

```
d:\kotha&coffee\
├── .agents/                    # Agent metadata & teamwork records
├── data/                       # Local SQLite storage directory
│   └── kotha.db                # SQLite database file (created automatically)
├── public/                     # Static assets
│   ├── logo.jpeg               # Brand logo
│   └── menu.jpeg               # Official cafe menu reference
├── src/
│   ├── client/                 # Frontend React SPA
│   │   ├── assets/             # Brand logos & icons
│   │   ├── components/         # Mobile UI components
│   │   │   ├── Layout.tsx      # 375px responsive phone container
│   │   │   ├── PinModal.tsx    # Numeric PIN modal with 12h session caching
│   │   │   ├── OrderCard.tsx   # Touch-friendly order summary card
│   │   │   ├── OrderSlip.tsx   # Huge order # confirmation modal
│   │   │   └── SoundBanner.tsx # Audio unlock gesture banner
│   │   ├── pages/
│   │   │   ├── Landing.tsx     # Two-role entry screen ("Add Order" / "See Orders")
│   │   │   ├── Kitchen.tsx     # Read-only live kitchen board
│   │   │   ├── Reception.tsx   # Order creation, pending & settled queues
│   │   │   ├── MenuAdmin.tsx   # Menu CRUD & price management
│   │   │   └── Analytics.tsx   # Date picker, daily grand total & payment split
│   │   ├── hooks/
│   │   │   ├── useKitchenSync.ts # SSE subscriber with fallback polling
│   │   │   └── useAudioAlert.ts  # Web Audio API dual-tone chime synthesizer
│   │   ├── services/
│   │   │   └── api.ts          # Typed REST client
│   │   ├── index.css           # Tailwind CSS directives & mobile ergonomics
│   │   └── main.tsx            # React router & root mount
│   ├── server/                 # Backend Node.js Express Server
│   │   ├── db/
│   │   │   ├── client.ts       # Dual-mode LibSQL / SQLite client
│   │   │   ├── schema.ts       # Table DDL & index creation
│   │   │   └── seed.ts         # 34-item menu seed from menu.jpeg
│   │   ├── middleware/
│   │   │   ├── auth.ts         # PIN verification & 401 route guard
│   │   │   └── timezone.ts     # Asia/Kolkata date calculations & mock clock
│   │   ├── routes/
│   │   │   ├── auth.ts         # PIN login & change
│   │   │   ├── orders.ts       # Atomic numbering, create, edit, settle, cancel
│   │   │   ├── menu.ts         # Menu CRUD & price snapshot isolation
│   │   │   ├── analytics.ts    # Date-wise analytics calculator
│   │   │   ├── events.ts       # Server-Sent Events hub
│   │   │   └── test.ts         # Mock clock & test fixtures
│   │   └── index.ts            # Express server initialization
├── tests/                      # Automated E2E Test Suite (Playwright)
│   ├── fixtures/               # Seeded datasets & test fixtures
│   ├── helpers/                # Audio spy, overflow crawler, clock controller
│   └── e2e/
│       ├── tier1-feature-coverage/
│       ├── tier2-boundary-edge/
│       ├── tier3-interactions/
│       ├── tier4-real-world-workflows/
│       └── screenshots/        # Automated deliverable screenshot generator
├── screenshots/                # 7 deliverable mobile screenshots (375px)
├── playwright.config.ts        # Playwright test config with webServer
├── package.json                # Project dependencies & npm run scripts
├── tsconfig.json               # TypeScript configuration
├── vite.config.ts              # Vite build configuration
├── tailwind.config.js          # Tailwind CSS styling configuration
└── README.md                   # Local run guide, test command & cloud deployment
```
