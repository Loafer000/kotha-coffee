# কথা & Coffee — Cafe POS & Order-Ticket System

> **A lightweight, mobile-first web Point of Sale (POS) and real-time kitchen order ticket system built specifically for small cafes.**

---

## ☕ Overview

**কথা & Coffee** is designed for fast, seamless cafe operations during busy rush hours:
- **Reception (Add Order)**: Staff quickly select items from a categorized menu, select a payment method (Cash, UPI, Card), and generate orders. An auto-incrementing order number starting at **#1 every day** (Asia/Kolkata timezone) is generated to write on a paper slip for the customer.
- **Kitchen (See Orders)**: Real-time, read-only display that receives orders in **<50ms** via Server-Sent Events (SSE) without manual page refreshes. Plays an audio notification chime when a new ticket arrives.
- **Order Lifecycle**: Orders start in **Pending**. Once prepared, reception staff tap **Done**, moving the order to **Settled** across both screens. Orders can also be edited or cancelled before settlement.
- **Daily Analytics**: Reception dashboard provides date-wise daily gross sales, order count, payment method splits, and an itemized breakdown of quantity sold and revenue.
- **Security & PIN Protection**: Reception controls and analytics are protected by a 4–6 digit staff PIN with 12-hour session persistence and brute-force protection. Kitchen view remains open and read-only.
- **Phone-First Design**: Optimized for 375px mobile viewports (e.g. iPhone SE) with touch targets $\ge 44\text{px} \times 44\text{px}$.

---

## 📱 System Screenshots

The system produces 7 verified mobile-viewport deliverables located in `./screenshots/`:

| # | Screen | Description |
|---|---|---|
| 1 | `01_landing.png` | Role selection landing page (Add Order vs See Orders) with Bengali cafe branding |
| 2 | `02_create_order.png` | Reception POS: categorized menu items, quantity selectors, live cart calculation |
| 3 | `03_order_confirmation_slip.png` | Large confirmation slip showing today's order ID (e.g. `#1`) to give to customer |
| 4 | `04_reception_pending.png` | Reception queue of active pending orders with Edit, Done, and Cancel actions |
| 5 | `05_reception_settled.png` | History of completed/settled orders with settlement timestamps |
| 6 | `06_reception_analytics.png` | Daily gross revenue, payment method breakdown (Cash/UPI/Card), and item sales ranking |
| 7 | `07_kitchen_view.png` | Dedicated kitchen display with live SSE sync and Web Audio alert chime |

---

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
- **Node.js** (v18.0.0 or higher)
- **npm** (v9.0.0 or higher)

### 2. Installation
```bash
git clone <repo-url> kotha-coffee
cd kotha-coffee
npm install
```

### 3. Build & Run
```bash
# Build the React production bundle
npm run build

# Start the full-stack server (defaults to port 3000)
npm start
```

### 4. Accessing the System
Open your browser and navigate to:
- **Landing Page**: `http://localhost:3000/`
- **Reception POS**: `http://localhost:3000/reception`  
  *(Default PIN: `1234`)*
- **Kitchen Display**: `http://localhost:3000/kitchen`

---

## 🧪 Automated Testing

All automated acceptance criteria can be executed locally:

```bash
# 1. Typecheck & Frontend Production Build
npm run typecheck
npm run build

# 2. Run Milestone Integration Suites
npm run test:m1   # Data layer, atomic sequence, PIN auth
npm run test:m2   # Menu catalog, CRUD, price snapshot isolation
npm run test:m3   # Order lifecycle, editing, cancellation, daily reset
npm run test:m4   # Kitchen SSE real-time sync & audio alert chime
npm run test:m5   # Analytics mathematical consistency & payment splits

# 3. Run Full Turnkey Playwright E2E Suite
npm test

# 4. Re-generate Deliverable Mobile Screenshots
npm run test:screenshots
```

---

## ☁️ Beginner-Friendly Cloud Deployment Guide (100% Free Tier)

You can host this entire system online completely free so that:
- Reception phone, Kitchen phone, and your home laptop all access the exact same live orders.
- Orders and analytics persist forever across server restarts.

### Architecture Overview
- **Database**: [Turso](https://turso.tech) (Free Tier provides 9 GB storage and 500 databases using serverless LibSQL).
- **Web App Hosting**: [Render](https://render.com) (Free Web Service tier with automatic SSL, HTTPS, and continuous git deployment).

---

### Step 1: Create Your Free Cloud Database (Turso)

1. Go to **[turso.tech](https://turso.tech)** and click **Sign Up** (using GitHub or Google).
2. Install the Turso CLI on your computer, or use the Turso Web Dashboard:
   - In the Turso Web Dashboard, click **Create Database**.
   - Name your database: `kotha-coffee`
   - Select the region closest to you (e.g. `BOM` - Mumbai, India).
3. Once created, click on your database to find its connection details:
   - **Database URL**: looks like `libsql://kotha-coffee-[your-username].turso.io`
4. Click **Generate Token** to create an authentication token:
   - Copy the long token string (this is your `DATABASE_AUTH_TOKEN`).

---

### Step 2: Deploy the Web Application to Render (Free Tier)

1. Push this project to your GitHub account (public or private repository).
2. Go to **[render.com](https://render.com)** and sign in.
3. In your Render Dashboard, click **New +** and select **Web Service**.
4. Connect your GitHub repository (`kotha-coffee`).
5. Configure the web service settings:
   - **Name**: `kotha-coffee-pos` (or any name you like)
   - **Region**: Singapore or nearest to India
   - **Branch**: `main`
   - **Runtime**: `Node`
   - **Build Command**:
     ```bash
     npm install && npm run build
     ```
   - **Start Command**:
     ```bash
     npm start
     ```
   - **Instance Type**: `Free`
6. Scroll down to **Environment Variables** and add:
   | Key | Value | Description |
   |---|---|---|
   | `DATABASE_URL` | `libsql://kotha-coffee-...turso.io` | Your Turso database URL from Step 1 |
   | `DATABASE_AUTH_TOKEN` | `your-turso-token...` | Your Turso auth token from Step 1 |
   | `ADMIN_PIN` | `1234` | The initial reception PIN (you can change it anytime in the app) |
   | `JWT_SECRET` | `generate-any-32-char-random-string` | Used to sign 12-hour session tokens |
   | `NODE_ENV` | `production` | Enables production security and disables test hooks |
   | `PORT` | `10000` | Render default port |
7. Click **Create Web Service**. Render will now build the frontend, initialize the cloud database tables automatically, seed the 34 menu items, and give you a live URL like:
   `https://kotha-coffee-pos.onrender.com`

---

### Step 3: Setting Up Cafe Phones & Devices

Once your live URL is ready:

#### On the Reception Phone:
1. Open Chrome or Safari on the phone and go to:  
   `https://kotha-coffee-pos.onrender.com/reception`
2. Enter your PIN (`1234`). The phone will remember the login for 12 hours.
3. Tap the browser menu (three dots or share button) and select **"Add to Home Screen"**.  
   *Now reception has a one-tap app icon right on their phone screen!*
4. To change the PIN at any time, tap the key icon (`🔑`) in the reception navigation bar.

#### On the Kitchen Phone / Tablet:
1. Open Chrome or Safari on the kitchen device and go to:  
   `https://kotha-coffee-pos.onrender.com/kitchen`
2. Tap the green banner **"Tap to enable sound alerts"** once (required by mobile browsers to allow audio chimes).
3. Tap **"Add to Home Screen"**.  
   *Now the kitchen screen stays active and chimes every time a new order arrives!*

#### Checking from Home:
1. Open the URL on your phone or laptop from home anytime.
2. Tap **Add Order (Reception)** and enter your PIN to view live daily sales, order counts, and category analytics in real time!

---

## 🔒 Security & Data Integrity

- **Price Snapshot Freeze**: Every order stores its unit prices in `order_items`. Changing a menu item price tomorrow will never alter past order records or past daily sales totals.
- **Kolkata Midnight Boundary**: Order IDs reset to `#1` at 00:00:00 IST every calendar day. Previous days' orders remain permanently archived.
- **Atomic Concurrency**: Simultaneous order submissions are serialized through SQLite transaction queues and retry backoffs, eliminating duplicate order numbers.
- **Brute-Force Guard**: Failed PIN attempts are throttled after 10 consecutive incorrect tries with exponential lockouts.
- **No Mock Leakage**: Date-mocking and database-reset routes are completely deactivated whenever running in production or connected to a cloud database.

---

## 📄 License
ISC License — Created with ❤️ for কথা & Coffee.
