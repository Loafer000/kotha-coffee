import type { Client } from '@libsql/client';
import { getDbClient, configureLocalPragmas } from './client.js';
import { ensureDefaultPinHashed } from '../middleware/auth.js';
import { seedMenuItems } from './seed.js';

export const SCHEMA_SQL = [
  // 1. Settings & Config
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,

  // 2. Menu Items
  `CREATE TABLE IF NOT EXISTS menu_items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price REAL NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,

  // 3. Daily Sequence Counters (Atomic sequence per Asia/Kolkata date key)
  `CREATE TABLE IF NOT EXISTS daily_counters (
    date_key TEXT PRIMARY KEY,
    last_number INTEGER NOT NULL DEFAULT 0
  );`,

  // 4. Orders
  `CREATE TABLE IF NOT EXISTS orders (
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
  );`,

  // 5. Order Line Items (Price snapshot preservation)
  `CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id TEXT,
    item_name TEXT NOT NULL,
    unit_price REAL NOT NULL,
    quantity INTEGER NOT NULL,
    subtotal REAL NOT NULL,
    created_at TEXT NOT NULL
  );`,

  // Indexes
  `CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);`,
  `CREATE INDEX IF NOT EXISTS idx_orders_date_key ON orders(date_key);`,
  `CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);`
];

/**
 * Initializes database schema by creating all required tables and indexes.
 * Safe to run multiple times (uses CREATE TABLE IF NOT EXISTS).
 */
export async function initSchema(customClient?: Client): Promise<void> {
  const db = customClient || getDbClient();

  // Configure local pragmas (WAL mode and busy timeout)
  await configureLocalPragmas(db);

  for (const statement of SCHEMA_SQL) {
    await db.execute(statement);
  }

  // Ensure default PIN is hashed and stored in settings table
  await ensureDefaultPinHashed(db);

  // Seed authentic menu catalog if menu_items table is empty
  await seedMenuItems(db);
}
