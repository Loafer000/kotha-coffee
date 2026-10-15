export interface SeedOrderItem {
  name: string;
  qty: number;
  price: number;
}

export interface SeedOrder {
  orderNumber: number;
  items: SeedOrderItem[];
  paymentMethod: 'Cash' | 'UPI' | 'Card';
  status: 'SETTLED' | 'CANCELLED' | 'PENDING';
}

export interface ExpectedDayAnalytics {
  date: string; // YYYY-MM-DD
  itemSales: Record<string, { qty: number; amount: number }>;
  paymentTotals: {
    Cash: number;
    UPI: number;
    Card: number;
  };
  grandTotal: number;
  settledOrderCount: number;
}

/**
 * Multi-day dataset spanning 3 days with >=5 unique items,
 * mixed payment methods (Cash, UPI, Card), and pending/cancelled orders.
 */
export const SEEDED_3DAY_DATASET: Record<string, SeedOrder[]> = {
  '2026-10-10': [
    {
      orderNumber: 1,
      paymentMethod: 'Cash',
      status: 'SETTLED',
      items: [
        { name: 'Tea', qty: 2, price: 15 },           // ₹30
        { name: 'Chicken Momo', qty: 1, price: 60 }   // ₹60
      ]                                               // Total: ₹90
    },
    {
      orderNumber: 2,
      paymentMethod: 'UPI',
      status: 'SETTLED',
      items: [
        { name: 'Cold Coffee', qty: 1, price: 50 },    // ₹50
        { name: 'French Fries', qty: 2, price: 50 }   // ₹100
      ]                                               // Total: ₹150
    },
    {
      orderNumber: 3,
      paymentMethod: 'Card',
      status: 'SETTLED',
      items: [
        { name: 'Cappuccino (Milk Coffee)', qty: 1, price: 30 } // ₹30
      ]                                                         // Total: ₹30
    },
    {
      orderNumber: 4,
      paymentMethod: 'Cash',
      status: 'CANCELLED', // Cancelled MUST NOT count in analytics
      items: [
        { name: 'Veg grill sandwich', qty: 1, price: 59 }
      ]
    }
  ],
  '2026-10-11': [
    {
      orderNumber: 1,
      paymentMethod: 'UPI',
      status: 'SETTLED',
      items: [
        { name: 'White Sauce Pasta', qty: 2, price: 70 }, // ₹140
        { name: 'Green Mint Mojito', qty: 2, price: 49 }  // ₹98
      ]                                                   // Total: ₹238
    },
    {
      orderNumber: 2,
      paymentMethod: 'Card',
      status: 'SETTLED',
      items: [
        { name: 'Chocolate Shake', qty: 1, price: 99 },        // ₹99
        { name: 'Chicken grill sandwich', qty: 1, price: 79 }  // ₹79
      ]                                                        // Total: ₹178
    },
    {
      orderNumber: 3,
      paymentMethod: 'UPI',
      status: 'PENDING', // Pending MUST NOT count in analytics until settled
      items: [
        { name: 'Peri Peri Fried Momo', qty: 1, price: 75 }
      ]
    }
  ],
  '2026-10-12': [
    {
      orderNumber: 1,
      paymentMethod: 'Cash',
      status: 'SETTLED',
      items: [
        { name: 'Fish Finger (3 pcs)', qty: 2, price: 89 }, // ₹178
        { name: 'Biscoff Shake', qty: 1, price: 110 }       // ₹110
      ]                                                     // Total: ₹288
    },
    {
      orderNumber: 2,
      paymentMethod: 'Cash',
      status: 'SETTLED',
      items: [
        { name: 'Tea', qty: 4, price: 15 },            // ₹60
        { name: 'Chicken Popcorn', qty: 1, price: 79 } // ₹79
      ]                                                // Total: ₹139
    },
    {
      orderNumber: 3,
      paymentMethod: 'Card',
      status: 'SETTLED',
      items: [
        { name: 'Blue Lagoon', qty: 2, price: 49 }     // ₹98
      ]                                                // Total: ₹98
    }
  ]
};

/**
 * Mathematically derived ground-truth analytics.
 * Strictly accounts only for SETTLED, non-cancelled orders.
 */
export const EXPECTED_ANALYTICS: Record<string, ExpectedDayAnalytics> = {
  '2026-10-10': {
    date: '2026-10-10',
    settledOrderCount: 3,
    itemSales: {
      'Tea': { qty: 2, amount: 30 },
      'Chicken Momo': { qty: 1, amount: 60 },
      'Cold Coffee': { qty: 1, amount: 50 },
      'French Fries': { qty: 2, amount: 100 },
      'Cappuccino (Milk Coffee)': { qty: 1, amount: 30 }
    },
    paymentTotals: {
      Cash: 90,
      UPI: 150,
      Card: 30
    },
    grandTotal: 270
  },
  '2026-10-11': {
    date: '2026-10-11',
    settledOrderCount: 2,
    itemSales: {
      'White Sauce Pasta': { qty: 2, amount: 140 },
      'Green Mint Mojito': { qty: 2, amount: 98 },
      'Chocolate Shake': { qty: 1, amount: 99 },
      'Chicken grill sandwich': { qty: 1, amount: 79 }
    },
    paymentTotals: {
      Cash: 0,
      UPI: 238,
      Card: 178
    },
    grandTotal: 416
  },
  '2026-10-12': {
    date: '2026-10-12',
    settledOrderCount: 3,
    itemSales: {
      'Fish Finger (3 pcs)': { qty: 2, amount: 178 },
      'Biscoff Shake': { qty: 1, amount: 110 },
      'Tea': { qty: 4, amount: 60 },
      'Chicken Popcorn': { qty: 1, amount: 79 },
      'Blue Lagoon': { qty: 2, amount: 98 }
    },
    paymentTotals: {
      Cash: 427,
      UPI: 0,
      Card: 98
    },
    grandTotal: 525
  }
};
