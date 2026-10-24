import crypto from 'crypto';
import express, { type Request, type Response } from 'express';
import { getDbClient } from '../db/client.js';
import { requireReceptionAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { getCafeDateKey, getCafeNow, type CafeRequest } from '../middleware/timezone.js';
import { broadcastOrderEvent } from './events.js';

export interface OrderItemInput {
  menuItemId?: string;
  menu_item_id?: string;
  id?: string;
  name?: string;
  item_name?: string;
  unitPrice?: number;
  unit_price?: number;
  price?: number;
  quantity?: number;
  qty?: number;
  isParcel?: boolean;
  is_parcel?: boolean;
  isDelivered?: boolean;
  is_delivered?: boolean;
}

export interface CreateOrderInput {
  items: OrderItemInput[];
  paymentMethod?: 'Cash' | 'UPI' | 'Card';
  payment_method?: 'Cash' | 'UPI' | 'Card';
  notes?: string;
}

export interface UpdateOrderInput {
  items?: OrderItemInput[];
  paymentMethod?: 'Cash' | 'UPI' | 'Card';
  payment_method?: 'Cash' | 'UPI' | 'Card';
  notes?: string;
}

export interface OrderItemRecord {
  id: string;
  order_id: string;
  orderId?: string;
  menu_item_id: string | null;
  menuItemId?: string | null;
  item_name: string;
  name?: string;
  unit_price: number;
  unitPrice?: number;
  price?: number;
  quantity: number;
  qty?: number;
  subtotal: number;
  is_delivered: boolean;
  isDelivered?: boolean;
  is_parcel: boolean;
  isParcel?: boolean;
  created_at: string;
  createdAt?: string;
}

export interface OrderRecord {
  id: string;
  date_key: string;
  dateKey?: string;
  daily_order_number: number;
  dailyOrderNumber?: number;
  order_number?: number;
  orderNumber?: number;
  status: 'PENDING' | 'SETTLED' | 'CANCELLED';
  payment_method: 'Cash' | 'UPI' | 'Card';
  paymentMethod?: 'Cash' | 'UPI' | 'Card';
  total_amount: number;
  totalAmount?: number;
  notes: string | null;
  created_at: string;
  createdAt?: string;
  settled_at: string | null;
  settledAt?: string | null;
  updated_at: string;
  updatedAt?: string;
  items: OrderItemRecord[];
}

const router = express.Router();

/**
 * Normalizes an order row and its items into OrderRecord with dual-case aliases.
 */
function formatOrderResponse(row: any, items: any[]): OrderRecord {
  const formattedItems: OrderItemRecord[] = items.map((it: any) => ({
    id: String(it.id),
    order_id: String(it.order_id),
    orderId: String(it.order_id),
    menu_item_id: it.menu_item_id ? String(it.menu_item_id) : null,
    menuItemId: it.menu_item_id ? String(it.menu_item_id) : null,
    item_name: String(it.item_name),
    name: String(it.item_name),
    unit_price: Number(it.unit_price),
    unitPrice: Number(it.unit_price),
    price: Number(it.unit_price),
    quantity: Number(it.quantity),
    qty: Number(it.quantity),
    subtotal: Number(it.subtotal),
    is_delivered: Boolean(it.is_delivered),
    isDelivered: Boolean(it.is_delivered),
    is_parcel: Boolean(it.is_parcel),
    isParcel: Boolean(it.is_parcel),
    created_at: String(it.created_at),
    createdAt: String(it.created_at)
  }));

  const dailyNum = Number(row.daily_order_number);
  const total = Number(row.total_amount);

  return {
    id: String(row.id),
    date_key: String(row.date_key),
    dateKey: String(row.date_key),
    daily_order_number: dailyNum,
    dailyOrderNumber: dailyNum,
    order_number: dailyNum,
    orderNumber: dailyNum,
    status: row.status as 'PENDING' | 'SETTLED' | 'CANCELLED',
    payment_method: row.payment_method as 'Cash' | 'UPI' | 'Card',
    paymentMethod: row.payment_method as 'Cash' | 'UPI' | 'Card',
    total_amount: total,
    totalAmount: total,
    notes: row.notes ? String(row.notes) : null,
    created_at: String(row.created_at),
    createdAt: String(row.created_at),
    settled_at: row.settled_at ? String(row.settled_at) : null,
    settledAt: row.settled_at ? String(row.settled_at) : null,
    updated_at: String(row.updated_at),
    updatedAt: String(row.updated_at),
    items: formattedItems
  };
}

/**
 * Validates and normalizes line item inputs, computing subtotals and freezing unit prices.
 */
async function processOrderItems(rawItems: any[], db: any): Promise<{
  processedItems: Array<{
    id?: string;
    menuItemId: string | null;
    itemName: string;
    unitPrice: number;
    quantity: number;
    subtotal: number;
    isParcel?: boolean;
    isDelivered?: boolean;
  }>;
  totalAmount: number;
}> {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error('Order must contain at least one item');
  }

  // Fetch active menu catalog to cross-reference prices if menuItemId is provided
  const menuRes = await db.execute(`SELECT id, name, price, is_active FROM menu_items;`);
  const menuCatalog = new Map<string, { id: string; name: string; price: number }>();
  for (const row of menuRes.rows || []) {
    menuCatalog.set(String(row.id), {
      id: String(row.id),
      name: String(row.name),
      price: Number(row.price)
    });
  }

  const processedItems = [];
  let totalAmount = 0;

  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object') {
      throw new Error('Invalid item payload');
    }

    const qty = raw.quantity !== undefined ? raw.quantity : raw.qty;
    if (typeof qty !== 'number' || !Number.isInteger(qty) || qty <= 0) {
      throw new Error('Item quantity must be a positive integer');
    }

    const menuItemId = raw.menuItemId || raw.menu_item_id || raw.id || null;
    const catalogItem = menuItemId ? menuCatalog.get(String(menuItemId)) : null;

    // Resolve item name
    let itemName = raw.name || raw.item_name || '';
    if (!itemName && catalogItem) {
      itemName = catalogItem.name;
    }
    if (!itemName || typeof itemName !== 'string' || itemName.trim().length === 0) {
      throw new Error('Item name is required');
    }
    itemName = itemName.trim();

    // Resolve unit price
    let unitPrice: number | undefined = undefined;
    if (raw.unitPrice !== undefined && typeof raw.unitPrice === 'number' && !isNaN(raw.unitPrice)) {
      unitPrice = raw.unitPrice;
    } else if (raw.unit_price !== undefined && typeof raw.unit_price === 'number' && !isNaN(raw.unit_price)) {
      unitPrice = raw.unit_price;
    } else if (raw.price !== undefined && typeof raw.price === 'number' && !isNaN(raw.price)) {
      unitPrice = raw.price;
    } else if (catalogItem) {
      unitPrice = catalogItem.price;
    }

    if (unitPrice === undefined || typeof unitPrice !== 'number' || isNaN(unitPrice) || unitPrice < 0) {
      throw new Error(`Invalid unit price for item "${itemName}"`);
    }

    // Exact subtotal with rounding
    const subtotal = Math.round(unitPrice * qty * 100) / 100;
    totalAmount += subtotal;

    const isParcel = Boolean(raw.isParcel || raw.is_parcel);
    const isDelivered = Boolean(raw.isDelivered ?? raw.is_delivered ?? false);
    const id = raw.id ? String(raw.id) : undefined;

    processedItems.push({
      id,
      menuItemId: menuItemId ? String(menuItemId) : null,
      itemName,
      unitPrice,
      quantity: qty,
      subtotal,
      isParcel,
      isDelivered
    });
  }

  totalAmount = Math.round(totalAmount * 100) / 100;

  return { processedItems, totalAmount };
}

async function getNextDailyOrderNumber(db: any, dateKey: string): Promise<number> {
  // Query current maximum order number for today
  const maxRes = await db.execute({
    sql: `SELECT COALESCE(MAX(daily_order_number), 0) as max_num FROM orders WHERE date_key = ?;`,
    args: [dateKey]
  });
  const currentMax = Number(maxRes.rows[0]?.max_num || 0);

  if (currentMax === 0) {
    await db.execute({
      sql: `INSERT INTO daily_counters (date_key, last_number)
            VALUES (?, 1)
            ON CONFLICT(date_key) DO UPDATE SET last_number = 1;`,
      args: [dateKey]
    });
    return 1;
  }

  const nextNumber = currentMax + 1;
  await db.execute({
    sql: `INSERT INTO daily_counters (date_key, last_number)
          VALUES (?, ?)
          ON CONFLICT(date_key) DO UPDATE SET last_number = ?;`,
    args: [dateKey, nextNumber, nextNumber]
  });

  return nextNumber;
}

/**
 * POST /api/orders
 * Protected by requireReceptionAuth.
 * Creates an order, assigns atomic daily order number (#1, #2, ...),
 * freezes line-item unit prices and subtotals, and sets status = 'PENDING'.
 */
router.post('/', requireReceptionAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDbClient();
    const body: CreateOrderInput = req.body || {};

    // Validate payment method
    const paymentMethod = body.paymentMethod || body.payment_method || 'Cash';
    if (!['Cash', 'UPI', 'Card'].includes(paymentMethod)) {
      return res.status(400).json({ error: 'Invalid payment method. Allowed: Cash, UPI, Card' });
    }

    // Process line items and compute totals
    let itemData;
    try {
      itemData = await processOrderItems(body.items, db);
    } catch (valErr: any) {
      return res.status(400).json({ error: valErr.message || 'Invalid line items' });
    }

    const { processedItems, totalAmount } = itemData;

    // Resolve date_key in Asia/Kolkata timezone
    const cafeReq = req as CafeRequest;
    const dateKey = cafeReq.cafeDateKey || getCafeDateKey(req);
    const nowIso = (cafeReq.cafeTime || getCafeNow(req)).toISOString();

    // Generate atomic daily sequence number
    let orderNumber: number;
    let orderId: string;
    let attempts = 0;
    const maxAttempts = 3;

    while (true) {
      attempts++;
      orderNumber = await getNextDailyOrderNumber(db, dateKey);
      orderId = `order_${crypto.randomUUID()}`;

      try {
        await db.execute({
          sql: `INSERT INTO orders (id, date_key, daily_order_number, status, payment_method, total_amount, notes, created_at, settled_at, updated_at)
                VALUES (?, ?, ?, 'PENDING', ?, ?, ?, ?, NULL, ?);`,
          args: [
            orderId,
            dateKey,
            orderNumber,
            paymentMethod,
            totalAmount,
            body.notes || null,
            nowIso,
            nowIso
          ]
        });
        break; // Successfully inserted
      } catch (insertErr: any) {
        if (attempts >= maxAttempts) {
          throw insertErr;
        }
      }
    }

    // Insert frozen line items
    const insertedItems: any[] = [];
    for (const item of processedItems) {
      const lineItemId = `item_${crypto.randomUUID()}`;
      const parcelFlag = item.isParcel ? 1 : 0;
      await db.execute({
        sql: `INSERT INTO order_items (id, order_id, menu_item_id, item_name, unit_price, quantity, subtotal, is_delivered, is_parcel, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?);`,
        args: [
          lineItemId,
          orderId,
          item.menuItemId,
          item.itemName,
          item.unitPrice,
          item.quantity,
          item.subtotal,
          parcelFlag,
          nowIso
        ]
      });

      insertedItems.push({
        id: lineItemId,
        order_id: orderId,
        menu_item_id: item.menuItemId,
        item_name: item.itemName,
        unit_price: item.unitPrice,
        quantity: item.quantity,
        subtotal: item.subtotal,
        is_delivered: 0,
        is_parcel: parcelFlag,
        created_at: nowIso
      });
    }

    const orderRow = {
      id: orderId,
      date_key: dateKey,
      daily_order_number: orderNumber,
      status: 'PENDING',
      payment_method: paymentMethod,
      total_amount: totalAmount,
      notes: body.notes || null,
      created_at: nowIso,
      settled_at: null,
      updated_at: nowIso
    };

    const responsePayload = formatOrderResponse(orderRow, insertedItems);
    broadcastOrderEvent({ type: 'order:created', order: responsePayload });
    return res.status(201).json(responsePayload);
  } catch (err: any) {
    console.error('[API /api/orders POST] Error:', err);
    return res.status(500).json({ error: err.message || 'Failed to create order' });
  }
});

/**
 * GET /api/orders
 * Protected by requireReceptionAuth.
 * Query params:
 *   ?date=YYYY-MM-DD
 *   ?status=PENDING|SETTLED|CANCELLED
 * Returns orders with items sorted by order number.
 */
router.get('/', requireReceptionAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDbClient();
    const { date, status } = req.query;

    const conditions: string[] = [];
    const args: any[] = [];

    if (date && typeof date === 'string' && date !== 'all') {
      conditions.push('date_key = ?');
      args.push(date.trim());
    }

    if (status && typeof status === 'string') {
      conditions.push('status = ?');
      args.push(status.trim().toUpperCase());
    }

    const isPending = status && String(status).toUpperCase() === 'PENDING';
    const sortClause = isPending
      ? 'ORDER BY date_key DESC, daily_order_number ASC, created_at ASC'
      : 'ORDER BY date_key DESC, settled_at DESC, daily_order_number DESC, created_at DESC';

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT id, date_key, daily_order_number, status, payment_method, total_amount, notes, created_at, settled_at, updated_at
                 FROM orders
                 ${whereClause}
                 ${sortClause};`;

    const ordersRes = await db.execute({ sql, args });
    const orderRows = ordersRes.rows || [];

    if (orderRows.length === 0) {
      return res.status(200).json([]);
    }

    // Fetch line items for these orders
    const placeholders = orderRows.map(() => '?').join(',');
    const itemsRes = await db.execute({
      sql: `SELECT id, order_id, menu_item_id, item_name, unit_price, quantity, subtotal, is_delivered, is_parcel, created_at
            FROM order_items
            WHERE order_id IN (${placeholders})
            ORDER BY rowid ASC;`,
      args: orderRows.map((r: any) => String(r.id))
    });

    const itemsByOrderId = new Map<string, any[]>();
    for (const itemRow of itemsRes.rows || []) {
      const oid = String(itemRow.order_id);
      if (!itemsByOrderId.has(oid)) {
        itemsByOrderId.set(oid, []);
      }
      itemsByOrderId.get(oid)!.push(itemRow);
    }

    const results = orderRows.map((row: any) => {
      const items = itemsByOrderId.get(String(row.id)) || [];
      return formatOrderResponse(row, items);
    });

    return res.status(200).json(results);
  } catch (err: any) {
    console.error('[API /api/orders GET] Error:', err);
    return res.status(500).json({ error: err.message || 'Failed to list orders' });
  }
});

/**
 * In-place edit of pending order (PATCH /api/orders/:id and PUT /api/orders/:id).
 * Protected by requireReceptionAuth.
 * Re-validates items, recalculates totals, updates order_items snapshot and order total.
 * Rejects with HTTP 400/409 if order is already Settled or Cancelled.
 */
async function handleEditOrder(req: AuthenticatedRequest, res: Response) {
  try {
    const db = getDbClient();
    const orderId = req.params.id;
    const body: UpdateOrderInput = req.body || {};

    const findRes = await db.execute({
      sql: `SELECT * FROM orders WHERE id = ?;`,
      args: [orderId]
    });

    if (!findRes.rows || findRes.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const existingOrder = findRes.rows[0];
    if (existingOrder.status === 'SETTLED') {
      return res.status(409).json({ error: 'Settled orders cannot be edited' });
    }
    if (existingOrder.status === 'CANCELLED') {
      return res.status(409).json({ error: 'Cancelled orders cannot be edited' });
    }

    const cafeReq = req as CafeRequest;
    const nowIso = (cafeReq.cafeTime || getCafeNow(req)).toISOString();

    let newTotal = Number(existingOrder.total_amount);
    let newPayment = String(existingOrder.payment_method);
    let newNotes = existingOrder.notes ? String(existingOrder.notes) : null;

    if (body.paymentMethod || body.payment_method) {
      const pm = body.paymentMethod || body.payment_method!;
      if (!['Cash', 'UPI', 'Card'].includes(pm)) {
        return res.status(400).json({ error: 'Invalid payment method' });
      }
      newPayment = pm;
    }

    if (body.notes !== undefined) {
      newNotes = body.notes ? String(body.notes) : null;
    }

    // If items are provided, revalidate and replace order_items
    if (body.items !== undefined) {
      let itemData;
      try {
        itemData = await processOrderItems(body.items, db);
      } catch (valErr: any) {
        return res.status(400).json({ error: valErr.message || 'Invalid line items' });
      }

      newTotal = itemData.totalAmount;

      // Fetch existing line items to preserve delivery status if needed
      const existingItemsRes = await db.execute({
        sql: `SELECT id, item_name, is_delivered, is_parcel FROM order_items WHERE order_id = ? ORDER BY rowid ASC;`,
        args: [orderId]
      });
      const existingById = new Map<string, any>();
      for (const row of existingItemsRes.rows || []) {
        existingById.set(String(row.id), row);
      }

      // Delete existing line items
      await db.execute({
        sql: `DELETE FROM order_items WHERE order_id = ?;`,
        args: [orderId]
      });

      // Insert updated line items
      for (const item of itemData.processedItems) {
        const lineItemId = item.id || `item_${crypto.randomUUID()}`;
        const parcelFlag = item.isParcel ? 1 : 0;

        // Preserve delivery status if explicitly set, or if existing item in DB was delivered
        let isDelivered = Boolean(item.isDelivered);
        if (!isDelivered && item.id && existingById.has(item.id)) {
          isDelivered = Boolean(existingById.get(item.id).is_delivered);
        }
        const deliveredFlag = isDelivered ? 1 : 0;

        await db.execute({
          sql: `INSERT INTO order_items (id, order_id, menu_item_id, item_name, unit_price, quantity, subtotal, is_delivered, is_parcel, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          args: [
            lineItemId,
            orderId,
            item.menuItemId,
            item.itemName,
            item.unitPrice,
            item.quantity,
            item.subtotal,
            deliveredFlag,
            parcelFlag,
            nowIso
          ]
        });
      }
    }

    // Update orders table
    await db.execute({
      sql: `UPDATE orders
            SET total_amount = ?, payment_method = ?, notes = ?, updated_at = ?
            WHERE id = ?;`,
      args: [newTotal, newPayment, newNotes, nowIso, orderId]
    });

    // Fetch updated order and items
    const updatedOrderRes = await db.execute({
      sql: `SELECT * FROM orders WHERE id = ?;`,
      args: [orderId]
    });
    const updatedItemsRes = await db.execute({
      sql: `SELECT * FROM order_items WHERE order_id = ? ORDER BY rowid ASC;`,
      args: [orderId]
    });

    const responsePayload = formatOrderResponse(updatedOrderRes.rows[0], updatedItemsRes.rows);
    broadcastOrderEvent({ type: 'order:updated', order: responsePayload });
    return res.status(200).json(responsePayload);
  } catch (err: any) {
    console.error('[API /api/orders/:id PATCH/PUT] Error:', err);
    return res.status(500).json({ error: err.message || 'Failed to edit order' });
  }
}

router.patch('/:id', requireReceptionAuth, handleEditOrder);
router.put('/:id', requireReceptionAuth, handleEditOrder);

/**
 * POST /api/orders/:id/done (and PATCH/POST /api/orders/:id/settle)
 * Protected by requireReceptionAuth.
 * Moves order from PENDING to SETTLED. Records settled_at ISO timestamp.
 * Rejects if already settled or cancelled.
 */
async function handleSettleOrder(req: AuthenticatedRequest, res: Response) {
  try {
    const db = getDbClient();
    const orderId = req.params.id;

    const findRes = await db.execute({
      sql: `SELECT * FROM orders WHERE id = ?;`,
      args: [orderId]
    });

    if (!findRes.rows || findRes.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = findRes.rows[0];
    if (order.status === 'SETTLED') {
      return res.status(409).json({ error: 'Order is already settled' });
    }
    if (order.status === 'CANCELLED') {
      return res.status(409).json({ error: 'Cannot settle a cancelled order' });
    }

    // Strict requirement: all items in the order must be delivered before settling
    const undeliveredRes = await db.execute({
      sql: `SELECT COUNT(*) as count FROM order_items WHERE order_id = ? AND is_delivered = 0;`,
      args: [orderId]
    });
    const undeliveredCount = Number(undeliveredRes.rows[0]?.count || 0);
    if (undeliveredCount > 0) {
      return res.status(400).json({
        error: `Cannot settle order: all items must be marked as delivered first (${undeliveredCount} item(s) pending).`
      });
    }

    const cafeReq = req as CafeRequest;
    const nowIso = (cafeReq.cafeTime || getCafeNow(req)).toISOString();

    const paymentMethod = req.body?.paymentMethod || req.body?.payment_method;
    if (paymentMethod && ['Cash', 'UPI', 'Card'].includes(paymentMethod)) {
      await db.execute({
        sql: `UPDATE orders
              SET status = 'SETTLED', payment_method = ?, settled_at = ?, updated_at = ?
              WHERE id = ?;`,
        args: [paymentMethod, nowIso, nowIso, orderId]
      });
    } else {
      await db.execute({
        sql: `UPDATE orders
              SET status = 'SETTLED', settled_at = ?, updated_at = ?
              WHERE id = ?;`,
        args: [nowIso, nowIso, orderId]
      });
    }

    const updatedOrderRes = await db.execute({
      sql: `SELECT * FROM orders WHERE id = ?;`,
      args: [orderId]
    });
    const itemsRes = await db.execute({
      sql: `SELECT id, order_id, menu_item_id, item_name, unit_price, quantity, subtotal, is_delivered, is_parcel, created_at
            FROM order_items WHERE order_id = ? ORDER BY rowid ASC;`,
      args: [orderId]
    });

    const responsePayload = formatOrderResponse(updatedOrderRes.rows[0], itemsRes.rows);
    broadcastOrderEvent({ type: 'order:settled', orderId, order: responsePayload });
    return res.status(200).json(responsePayload);
  } catch (err: any) {
    console.error('[API /api/orders/:id/done] Error:', err);
    return res.status(500).json({ error: err.message || 'Failed to settle order' });
  }
}

/**
 * Helper to fetch full order with items and format as OrderRecord.
 */
async function fetchFullOrderById(orderId: string, db: any): Promise<OrderRecord | null> {
  const orderRes = await db.execute({
    sql: `SELECT * FROM orders WHERE id = ?;`,
    args: [orderId]
  });
  if (!orderRes.rows || orderRes.rows.length === 0) return null;
  const itemsRes = await db.execute({
    sql: `SELECT id, order_id, menu_item_id, item_name, unit_price, quantity, subtotal, is_delivered, is_parcel, created_at
          FROM order_items
          WHERE order_id = ?
          ORDER BY rowid ASC;`,
    args: [orderId]
  });
  return formatOrderResponse(orderRes.rows[0], itemsRes.rows);
}

/**
 * PATCH /api/orders/:orderId/items/:itemId/deliver
 * Toggles or sets delivery status of an individual item in an order.
 * Broadcasts 'order:updated' via SSE to keep Kitchen and Reception in real-time sync.
 */
router.patch('/:orderId/items/:itemId/deliver', async (req: Request, res: Response) => {
  try {
    const db = getDbClient();
    const { orderId, itemId } = req.params;

    const itemRes = await db.execute({
      sql: `SELECT * FROM order_items WHERE id = ? AND order_id = ?;`,
      args: [itemId, orderId]
    });

    if (!itemRes.rows || itemRes.rows.length === 0) {
      return res.status(404).json({ error: 'Order item not found' });
    }

    const currentItem = itemRes.rows[0];
    let newStatus: number;
    if (typeof req.body?.isDelivered === 'boolean') {
      newStatus = req.body.isDelivered ? 1 : 0;
    } else if (typeof req.body?.is_delivered === 'boolean') {
      newStatus = req.body.is_delivered ? 1 : 0;
    } else {
      newStatus = Number(currentItem.is_delivered) === 1 ? 0 : 1;
    }

    await db.execute({
      sql: `UPDATE order_items SET is_delivered = ? WHERE id = ?;`,
      args: [newStatus, itemId]
    });

    const cafeReq = req as CafeRequest;
    const nowIso = (cafeReq.cafeTime || getCafeNow(req)).toISOString();
    await db.execute({
      sql: `UPDATE orders SET updated_at = ? WHERE id = ?;`,
      args: [nowIso, orderId]
    });

    const updatedOrder = await fetchFullOrderById(orderId, db);
    if (updatedOrder) {
      broadcastOrderEvent({ type: 'order:updated', order: updatedOrder });
    }

    return res.status(200).json({
      success: true,
      itemId,
      isDelivered: Boolean(newStatus),
      is_delivered: Boolean(newStatus),
      order: updatedOrder
    });
  } catch (err: any) {
    console.error('[API /api/orders/:orderId/items/:itemId/deliver] Error:', err);
    return res.status(500).json({ error: err.message || 'Failed to update item delivery status' });
  }
});

/**
 * PATCH /api/orders/:orderId/deliver-all
 * Sets all items in an order as delivered or pending.
 */
router.patch('/:orderId/deliver-all', async (req: Request, res: Response) => {
  try {
    const db = getDbClient();
    const { orderId } = req.params;
    const isDelivered = req.body?.isDelivered !== false ? 1 : 0;

    await db.execute({
      sql: `UPDATE order_items SET is_delivered = ? WHERE order_id = ?;`,
      args: [isDelivered, orderId]
    });

    const cafeReq = req as CafeRequest;
    const nowIso = (cafeReq.cafeTime || getCafeNow(req)).toISOString();
    await db.execute({
      sql: `UPDATE orders SET updated_at = ? WHERE id = ?;`,
      args: [nowIso, orderId]
    });

    const updatedOrder = await fetchFullOrderById(orderId, db);
    if (updatedOrder) {
      broadcastOrderEvent({ type: 'order:updated', order: updatedOrder });
    }

    return res.status(200).json({
      success: true,
      isDelivered: Boolean(isDelivered),
      order: updatedOrder
    });
  } catch (err: any) {
    console.error('[API /api/orders/:orderId/deliver-all] Error:', err);
    return res.status(500).json({ error: err.message || 'Failed to update delivery status' });
  }
});

/**
 * PATCH /api/orders/:orderId/items/:itemId/parcel
 * Toggles or sets parcel/takeaway status of an individual item in an order.
 * Broadcasts 'order:updated' via SSE to keep Kitchen and Reception in real-time sync.
 */
router.patch('/:orderId/items/:itemId/parcel', async (req: Request, res: Response) => {
  try {
    const db = getDbClient();
    const { orderId, itemId } = req.params;

    const itemRes = await db.execute({
      sql: `SELECT * FROM order_items WHERE id = ? AND order_id = ?;`,
      args: [itemId, orderId]
    });

    if (!itemRes.rows || itemRes.rows.length === 0) {
      return res.status(404).json({ error: 'Order item not found' });
    }

    const currentItem = itemRes.rows[0];
    let newStatus: number;
    if (typeof req.body?.isParcel === 'boolean') {
      newStatus = req.body.isParcel ? 1 : 0;
    } else if (typeof req.body?.is_parcel === 'boolean') {
      newStatus = req.body.is_parcel ? 1 : 0;
    } else {
      newStatus = Number(currentItem.is_parcel) === 1 ? 0 : 1;
    }

    await db.execute({
      sql: `UPDATE order_items SET is_parcel = ? WHERE id = ?;`,
      args: [newStatus, itemId]
    });

    const cafeReq = req as CafeRequest;
    const nowIso = (cafeReq.cafeTime || getCafeNow(req)).toISOString();
    await db.execute({
      sql: `UPDATE orders SET updated_at = ? WHERE id = ?;`,
      args: [nowIso, orderId]
    });

    const updatedOrder = await fetchFullOrderById(orderId, db);
    if (updatedOrder) {
      broadcastOrderEvent({ type: 'order:updated', order: updatedOrder });
    }

    return res.status(200).json({
      success: true,
      itemId,
      isParcel: Boolean(newStatus),
      is_parcel: Boolean(newStatus),
      order: updatedOrder
    });
  } catch (err: any) {
    console.error('[API /api/orders/:orderId/items/:itemId/parcel] Error:', err);
    return res.status(500).json({ error: err.message || 'Failed to update item parcel status' });
  }
});

/**
 * PATCH /api/orders/:orderId/parcel-all
 * Sets all items in an order as parcel or dine-in.
 */
router.patch('/:orderId/parcel-all', async (req: Request, res: Response) => {
  try {
    const db = getDbClient();
    const { orderId } = req.params;
    const isParcel = req.body?.isParcel !== false ? 1 : 0;

    await db.execute({
      sql: `UPDATE order_items SET is_parcel = ? WHERE order_id = ?;`,
      args: [isParcel, orderId]
    });

    const cafeReq = req as CafeRequest;
    const nowIso = (cafeReq.cafeTime || getCafeNow(req)).toISOString();
    await db.execute({
      sql: `UPDATE orders SET updated_at = ? WHERE id = ?;`,
      args: [nowIso, orderId]
    });

    const updatedOrder = await fetchFullOrderById(orderId, db);
    if (updatedOrder) {
      broadcastOrderEvent({ type: 'order:updated', order: updatedOrder });
    }

    return res.status(200).json({
      success: true,
      isParcel: Boolean(isParcel),
      order: updatedOrder
    });
  } catch (err: any) {
    console.error('[API /api/orders/:orderId/parcel-all] Error:', err);
    return res.status(500).json({ error: err.message || 'Failed to update parcel status' });
  }
});

router.post('/:id/done', requireReceptionAuth, handleSettleOrder);
router.patch('/:id/settle', requireReceptionAuth, handleSettleOrder);
router.post('/:id/settle', requireReceptionAuth, handleSettleOrder);

/**
 * DELETE /api/orders/:id
 * Protected by requireReceptionAuth.
 * Deletes/cancels order and synchronizes the daily order number counter
 * so that if order #1 is deleted, the next order reuses #1.
 * Rejects with 409 if order is already settled.
 */
router.delete('/:id', requireReceptionAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDbClient();
    const orderId = req.params.id;

    const findRes = await db.execute({
      sql: `SELECT * FROM orders WHERE id = ?;`,
      args: [orderId]
    });

    if (!findRes.rows || findRes.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = findRes.rows[0];
    if (order.status === 'SETTLED') {
      return res.status(409).json({ error: 'Cannot cancel a settled order' });
    }

    const dateKey = String(order.date_key);

    // Delete associated line items
    await db.execute({
      sql: `DELETE FROM order_items WHERE order_id = ?;`,
      args: [orderId]
    });

    // Delete order row completely so order number can be reused
    await db.execute({
      sql: `DELETE FROM orders WHERE id = ?;`,
      args: [orderId]
    });

    // Resynchronize daily counter to highest remaining order number for today
    const maxRes = await db.execute({
      sql: `SELECT COALESCE(MAX(daily_order_number), 0) as max_num FROM orders WHERE date_key = ?;`,
      args: [dateKey]
    });
    const newMax = Number(maxRes.rows[0]?.max_num || 0);

    await db.execute({
      sql: `UPDATE daily_counters SET last_number = ? WHERE date_key = ?;`,
      args: [newMax, dateKey]
    });

    broadcastOrderEvent({ type: 'order:cancelled', orderId });

    return res.status(200).json({
      success: true,
      message: 'Order deleted and sequence synchronized',
      id: orderId,
      status: 'CANCELLED'
    });
  } catch (err: any) {
    console.error('[API /api/orders/:id DELETE] Error:', err);
    return res.status(500).json({ error: err.message || 'Failed to cancel order' });
  }
});

export default router;
