export interface MenuItem {
  id: string;
  name: string;
  category: string;
  price: number;
  is_active: number;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface CreateMenuItemInput {
  name: string;
  category: string;
  price: number;
  display_order?: number;
}

export interface UpdateMenuItemInput {
  name?: string;
  category?: string;
  price?: number;
  is_active?: boolean | number;
  display_order?: number;
}

const TOKEN_KEY = 'kotha_reception_token';

/**
 * Retrieves the stored reception session token from localStorage.
 */
export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Stores the reception session token in localStorage.
 */
export function setStoredToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
}

/**
 * Clears the reception session token from localStorage.
 */
export function clearStoredToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Verifies staff PIN and stores the returned session token.
 */
export async function verifyPin(pin: string): Promise<{ token: string; expiresIn: number }> {
  const res = await fetch('/api/auth/verify-pin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Invalid PIN');
  }

  const data = await res.json();
  if (data.token) {
    setStoredToken(data.token);
  }
  return data;
}

/**
 * Changes staff/owner PIN. Requires reception authentication.
 */
export async function changePin(
  currentPin: string,
  newPin: string,
  token?: string
): Promise<{ success: boolean; message: string }> {
  const authToken = token || getStoredToken();
  const res = await fetch('/api/auth/change-pin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
    },
    body: JSON.stringify({ currentPin, newPin })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to change PIN');
  }

  return res.json();
}

/**
 * Fetches menu items from the server.
 * @param includeInactive If true, fetches both active and archived menu items.
 */
export async function getMenuItems(includeInactive = false): Promise<MenuItem[]> {
  const url = includeInactive ? '/api/menu?include_inactive=true' : '/api/menu';
  const res = await fetch(url);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch menu items');
  }

  return res.json();
}

/**
 * Adds a new item to the menu catalog. Requires reception authentication.
 */
export async function addMenuItem(item: CreateMenuItemInput, token?: string): Promise<MenuItem> {
  const authToken = token || getStoredToken();
  const res = await fetch('/api/menu', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
    },
    body: JSON.stringify(item)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to add menu item');
  }

  return res.json();
}

/**
 * Updates an existing menu item (name, category, price, is_active, display_order).
 * Requires reception authentication.
 */
export async function updateMenuItem(
  id: string,
  updates: UpdateMenuItemInput,
  token?: string
): Promise<MenuItem> {
  const authToken = token || getStoredToken();
  const res = await fetch(`/api/menu/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
    },
    body: JSON.stringify(updates)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update menu item');
  }

  return res.json();
}

/**
 * Soft-deletes a menu item (sets is_active = 0). Requires reception authentication.
 */
export async function deleteMenuItem(
  id: string,
  token?: string
): Promise<{ success: boolean; message: string }> {
  const authToken = token || getStoredToken();
  const res = await fetch(`/api/menu/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: {
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
    }
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to deactivate menu item');
  }

  return res.json();
}

export interface OrderItem {
  id: string;
  order_id: string;
  orderId?: string;
  menu_item_id: string | null;
  menuItemId?: string | null;
  item_name: string;
  name: string;
  unit_price: number;
  unitPrice: number;
  quantity: number;
  qty: number;
  subtotal: number;
  created_at: string;
}

export interface Order {
  id: string;
  date_key: string;
  dateKey: string;
  daily_order_number: number;
  dailyOrderNumber: number;
  order_number: number;
  orderNumber: number;
  status: 'PENDING' | 'SETTLED' | 'CANCELLED';
  payment_method: 'Cash' | 'UPI' | 'Card';
  paymentMethod: 'Cash' | 'UPI' | 'Card';
  total_amount: number;
  totalAmount: number;
  notes: string | null;
  created_at: string;
  createdAt: string;
  settled_at: string | null;
  settledAt: string | null;
  updated_at: string;
  items: OrderItem[];
}

export interface CreateOrderItemInput {
  menuItemId?: string;
  name?: string;
  unitPrice?: number;
  quantity: number;
}

export interface CreateOrderInput {
  items: CreateOrderItemInput[];
  paymentMethod: 'Cash' | 'UPI' | 'Card';
  notes?: string;
}

export interface UpdateOrderInput {
  items?: CreateOrderItemInput[];
  paymentMethod?: 'Cash' | 'UPI' | 'Card';
  notes?: string;
}

/**
 * Fetches reception orders, filtered by date and/or status.
 */
export async function getOrders(
  params?: { date?: string; status?: string },
  token?: string
): Promise<Order[]> {
  const authToken = token || getStoredToken();
  const query = new URLSearchParams();
  if (params?.date) query.set('date', params.date);
  if (params?.status) query.set('status', params.status);

  const url = query.toString() ? `/api/orders?${query.toString()}` : '/api/orders';
  const res = await fetch(url, {
    headers: {
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
    }
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch orders');
  }

  return res.json();
}

/**
 * Places a new order via reception POS.
 */
export async function createOrder(
  data: CreateOrderInput,
  token?: string
): Promise<Order> {
  const authToken = token || getStoredToken();
  const res = await fetch('/api/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
    },
    body: JSON.stringify(data)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create order');
  }

  return res.json();
}

/**
 * Edits a pending order.
 */
export async function updateOrder(
  id: string,
  updates: UpdateOrderInput,
  token?: string
): Promise<Order> {
  const authToken = token || getStoredToken();
  const res = await fetch(`/api/orders/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
    },
    body: JSON.stringify(updates)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update order');
  }

  return res.json();
}

/**
 * Marks an order as Done (moves from PENDING to SETTLED).
 */
export async function settleOrder(id: string, token?: string): Promise<Order> {
  const authToken = token || getStoredToken();
  const res = await fetch(`/api/orders/${encodeURIComponent(id)}/done`, {
    method: 'POST',
    headers: {
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
    }
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to settle order');
  }

  return res.json();
}

/**
 * Cancels an order.
 */
export async function cancelOrder(
  id: string,
  token?: string
): Promise<{ success: boolean; message: string; id: string }> {
  const authToken = token || getStoredToken();
  const res = await fetch(`/api/orders/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: {
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
    }
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to cancel order');
  }

  return res.json();
}

/**
 * Public kitchen orders endpoint.
 */
export async function getKitchenOrders(): Promise<{ pending: Order[]; settled: Order[] }> {
  const res = await fetch('/api/kitchen/orders');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch kitchen orders');
  }
  return res.json();
}

export interface PaymentMethodBreakdown {
  total: number;
  count: number;
}

export interface PaymentBreakdown {
  Cash: PaymentMethodBreakdown;
  UPI: PaymentMethodBreakdown;
  Card: PaymentMethodBreakdown;
}

export interface ItemSaleRecord {
  itemName: string;
  item_name?: string;
  category: string;
  totalQuantity: number;
  total_quantity?: number;
  quantity?: number;
  totalRevenue: number;
  total_revenue?: number;
  revenue?: number;
  percentage: number;
}

export interface DailyAnalytics {
  date: string;
  dateKey: string;
  grandTotal: number;
  orderCount: number;
  paymentBreakdown: PaymentBreakdown;
  payments?: PaymentBreakdown;
  itemSales: ItemSaleRecord[];
  items?: ItemSaleRecord[];
}

/**
 * Fetches daily sales analytics. Requires reception authentication.
 * @param date Optional target date in YYYY-MM-DD. Defaults to current Asia/Kolkata date.
 */
export async function getDailyAnalytics(
  date?: string,
  token?: string
): Promise<DailyAnalytics> {
  const authToken = token || getStoredToken();
  const query = date ? `?date=${encodeURIComponent(date)}` : '';
  const res = await fetch(`/api/analytics${query}`, {
    headers: {
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
    }
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch analytics');
  }

  return res.json();
}

/**
 * Helper to trigger browser file download from Blob.
 */
function triggerBlobDownload(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, 100);
}

/**
 * Downloads the selected date's Excel report (.xlsx).
 */
export async function downloadDailyExcelReport(
  date?: string,
  token?: string
): Promise<void> {
  const authToken = token || getStoredToken();
  const query = date ? `?date=${encodeURIComponent(date)}` : '';
  const res = await fetch(`/api/analytics/export${query}`, {
    headers: {
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
    }
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to download daily Excel report');
  }

  const blob = await res.blob();
  const filename = `kotha-coffee-daily-report-${date || 'today'}.xlsx`;
  triggerBlobDownload(blob, filename);
}

/**
 * Downloads the overall cumulative Excel report (.xlsx) across all dates.
 */
export async function downloadOverallExcelReport(
  token?: string
): Promise<void> {
  const authToken = token || getStoredToken();
  const res = await fetch('/api/analytics/export-overall', {
    headers: {
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
    }
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to download overall Excel report');
  }

  const blob = await res.blob();
  triggerBlobDownload(blob, 'kotha-coffee-overall-report.xlsx');
}

