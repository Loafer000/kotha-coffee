import type { Client } from '@libsql/client';
import { getDbClient } from './client.js';

export interface SeedMenuItem {
  id: string;
  name: string;
  category: string;
  price: number;
  display_order: number;
}

/**
 * All 34 authentic menu items from the official Kotha & Coffee menu (menu.jpeg)
 * across 6 distinct categories with exact INR prices.
 */
export const AUTHENTIC_MENU_ITEMS: ReadonlyArray<SeedMenuItem> = [
  // 1. DRINKS (9 items)
  { id: 'drinks-tea', name: 'Tea', category: 'Drinks', price: 15, display_order: 1 },
  { id: 'drinks-cappuccino', name: 'Cappuccino (Milk Coffee)', category: 'Drinks', price: 30, display_order: 2 },
  { id: 'drinks-cold-coffee', name: 'Cold Coffee', category: 'Drinks', price: 50, display_order: 3 },
  { id: 'drinks-cold-coffee-ice-cream', name: 'Cold Coffee / with Ice Cream', category: 'Drinks', price: 70, display_order: 4 },
  { id: 'drinks-chocolate-shake', name: 'Chocolate Shake', category: 'Drinks', price: 99, display_order: 5 },
  { id: 'drinks-oreo-shake', name: 'Oreo Shake', category: 'Drinks', price: 99, display_order: 6 },
  { id: 'drinks-kitkat-shake', name: 'KitKat Shake', category: 'Drinks', price: 99, display_order: 7 },
  { id: 'drinks-strawberry-shake', name: 'Strawberry Shake', category: 'Drinks', price: 99, display_order: 8 },
  { id: 'drinks-biscoff-shake', name: 'Biscoff Shake', category: 'Drinks', price: 110, display_order: 9 },

  // 2. SNACKS (13 items)
  { id: 'snacks-chicken-momo-5pcs', name: 'Chicken Momo (5 pcs)', category: 'Snacks', price: 60, display_order: 10 },
  { id: 'snacks-chicken-fried-momo-5pcs', name: 'Chicken Fried Momo (5 pcs)', category: 'Snacks', price: 69, display_order: 11 },
  { id: 'snacks-peri-peri-fried-momo-5pcs', name: 'Peri Peri Fried Momo (5 pcs)', category: 'Snacks', price: 75, display_order: 12 },
  { id: 'snacks-cheese-corn-momo-5pcs', name: 'Cheese Corn Momo (5 pcs)', category: 'Snacks', price: 60, display_order: 13 },
  { id: 'snacks-fish-fry', name: 'Fish Fry', category: 'Snacks', price: 70, display_order: 14 },
  { id: 'snacks-fish-finger-3pcs', name: 'Fish Finger (3 pcs)', category: 'Snacks', price: 89, display_order: 15 },
  { id: 'snacks-fish-ball-5pcs', name: 'Fish Ball (5 pcs)', category: 'Snacks', price: 89, display_order: 16 },
  { id: 'snacks-chicken-strips-3pcs', name: 'Chicken Strips (3 pcs)', category: 'Snacks', price: 69, display_order: 17 },
  { id: 'snacks-chicken-popcorn-10pc', name: 'Chicken Popcorn (10 pc)', category: 'Snacks', price: 79, display_order: 18 },
  { id: 'snacks-chicken-cheese-finger-3pcs', name: 'Chicken Cheese Finger (3 pcs)', category: 'Snacks', price: 79, display_order: 19 },
  { id: 'snacks-french-fries', name: 'French Fries', category: 'Snacks', price: 50, display_order: 20 },
  { id: 'snacks-cheese-loaded-fries', name: 'Cheese Loaded Fries', category: 'Snacks', price: 69, display_order: 21 },
  { id: 'snacks-chicken-cheese-loaded-fries', name: 'Chicken Cheese Loaded Fries', category: 'Snacks', price: 89, display_order: 22 },

  // 3. PASTA (1 item)
  { id: 'pasta-white-sauce', name: 'White Sauce Pasta', category: 'Pasta', price: 70, display_order: 23 },

  // 4. SANDWICH (4 items)
  { id: 'sandwich-veg-grill', name: 'Veg grill sandwich', category: 'Sandwich', price: 59, display_order: 24 },
  { id: 'sandwich-corn-cheese-grill', name: 'Corn cheese grill sandwich', category: 'Sandwich', price: 69, display_order: 25 },
  { id: 'sandwich-chicken-grill', name: 'Chicken grill sandwich', category: 'Sandwich', price: 79, display_order: 26 },
  { id: 'sandwich-chicken-cheese-grill', name: 'Chicken cheese grill sandwich', category: 'Sandwich', price: 89, display_order: 27 },

  // 5. MOCKTAILS (4 items)
  { id: 'mocktails-green-mint-mojito', name: 'Green Mint Mojito', category: 'Mocktails', price: 49, display_order: 28 },
  { id: 'mocktails-blue-lagoon', name: 'Blue Lagoon', category: 'Mocktails', price: 49, display_order: 29 },
  { id: 'mocktails-masala-cold-drink', name: 'Masala Cold Drink', category: 'Mocktails', price: 49, display_order: 30 },
  { id: 'mocktails-minty-bliss', name: 'Minty Bliss', category: 'Mocktails', price: 49, display_order: 31 },

  // 6. ICE CREAM (3 items)
  { id: 'icecream-chocolate', name: 'Chocolate', category: 'Ice Cream', price: 40, display_order: 32 },
  { id: 'icecream-vanilla', name: 'Vanilla', category: 'Ice Cream', price: 40, display_order: 33 },
  { id: 'icecream-butterscotch', name: 'Butterscotch', category: 'Ice Cream', price: 40, display_order: 34 }
];

export const AUTHENTIC_CATEGORIES = [
  'Drinks',
  'Snacks',
  'Pasta',
  'Sandwich',
  'Mocktails',
  'Ice Cream'
] as const;

/**
 * Seeds the menu_items table with all 34 authentic items if the table is currently empty.
 * Idempotent: If items already exist, does not overwrite or duplicate.
 */
export async function seedMenuItems(customClient?: Client): Promise<{ seeded: boolean; count: number }> {
  const db = customClient || getDbClient();

  try {
    const checkResult = await db.execute('SELECT COUNT(*) as cnt FROM menu_items;');
    const currentCount = Number(checkResult.rows[0]?.cnt || 0);

    if (currentCount > 0) {
      return { seeded: false, count: currentCount };
    }

    const now = new Date().toISOString();

    for (const item of AUTHENTIC_MENU_ITEMS) {
      await db.execute({
        sql: `INSERT INTO menu_items (id, name, category, price, is_active, display_order, created_at, updated_at)
              VALUES (?, ?, ?, ?, 1, ?, ?, ?);`,
        args: [
          item.id,
          item.name,
          item.category,
          item.price,
          item.display_order,
          now,
          now
        ]
      });
    }

    return { seeded: true, count: AUTHENTIC_MENU_ITEMS.length };
  } catch (error) {
    console.error('[seedMenuItems] Failed to seed menu items:', error);
    throw error;
  }
}
