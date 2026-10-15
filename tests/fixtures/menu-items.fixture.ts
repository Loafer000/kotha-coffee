export interface MenuItemFixture {
  name: string;
  category: 'Drinks' | 'Snacks' | 'Pasta' | 'Sandwich' | 'Mocktails' | 'Ice Cream';
  price: number;
}

/**
 * All 34 cafe menu items exactly matching menu.jpeg across 6 categories.
 */
export const MENU_ITEMS_34: MenuItemFixture[] = [
  // DRINKS (9 items)
  { name: 'Tea', category: 'Drinks', price: 15 },
  { name: 'Cappuccino (Milk Coffee)', category: 'Drinks', price: 30 },
  { name: 'Cold Coffee', category: 'Drinks', price: 50 },
  { name: 'Cold Coffee / with Ice Cream', category: 'Drinks', price: 70 },
  { name: 'Chocolate Shake', category: 'Drinks', price: 99 },
  { name: 'Oreo Shake', category: 'Drinks', price: 99 },
  { name: 'KitKat Shake', category: 'Drinks', price: 99 },
  { name: 'Strawberry Shake', category: 'Drinks', price: 99 },
  { name: 'Biscoff Shake', category: 'Drinks', price: 110 },

  // SNACKS (13 items)
  { name: 'Chicken Momo (5 pcs)', category: 'Snacks', price: 60 },
  { name: 'Chicken Fried Momo (5 pcs)', category: 'Snacks', price: 69 },
  { name: 'Peri Peri Fried Momo (5 pcs)', category: 'Snacks', price: 75 },
  { name: 'Cheese Corn Momo (5 pcs)', category: 'Snacks', price: 60 },
  { name: 'Fish Fry', category: 'Snacks', price: 70 },
  { name: 'Fish Finger (3 pcs)', category: 'Snacks', price: 89 },
  { name: 'Fish Ball (5 pcs)', category: 'Snacks', price: 89 },
  { name: 'Chicken Strips (3 pcs)', category: 'Snacks', price: 69 },
  { name: 'Chicken Popcorn (10 pc)', category: 'Snacks', price: 79 },
  { name: 'Chicken Cheese Finger (3 pcs)', category: 'Snacks', price: 79 },
  { name: 'French Fries', category: 'Snacks', price: 50 },
  { name: 'Cheese Loaded Fries', category: 'Snacks', price: 69 },
  { name: 'Chicken Cheese Loaded Fries', category: 'Snacks', price: 89 },

  // PASTA (1 item)
  { name: 'White Sauce Pasta', category: 'Pasta', price: 70 },

  // SANDWICH (4 items)
  { name: 'Veg grill sandwich', category: 'Sandwich', price: 59 },
  { name: 'Corn cheese grill sandwich', category: 'Sandwich', price: 69 },
  { name: 'Chicken grill sandwich', category: 'Sandwich', price: 79 },
  { name: 'Chicken cheese grill sandwich', category: 'Sandwich', price: 89 },

  // MOCKTAILS (4 items)
  { name: 'Green Mint Mojito', category: 'Mocktails', price: 49 },
  { name: 'Blue Lagoon', category: 'Mocktails', price: 49 },
  { name: 'Masala Cold Drink', category: 'Mocktails', price: 49 },
  { name: 'Minty Bliss', category: 'Mocktails', price: 49 },

  // ICE CREAM (3 items)
  { name: 'Chocolate', category: 'Ice Cream', price: 40 },
  { name: 'Vanilla', category: 'Ice Cream', price: 40 },
  { name: 'Butterscotch', category: 'Ice Cream', price: 40 }
];
