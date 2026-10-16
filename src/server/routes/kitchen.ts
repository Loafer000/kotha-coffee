import express, { type Request, type Response } from 'express';
import { getDbClient } from '../db/client.js';
import { getCafeDateKey, type CafeRequest } from '../middleware/timezone.js';
import type { OrderRecord, OrderItemRecord } from './orders.js';

const router = express.Router();

function formatOrder(row: any, items: any[]): OrderRecord {
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
 * GET /api/kitchen/orders
 * Public read-only endpoint for kitchen display.
 * Returns { pending: OrderRecord[], settled: OrderRecord[] }
 */
router.get('/orders', async (req: Request, res: Response) => {
  try {
    const db = getDbClient();
    const cafeReq = req as CafeRequest;
    const dateKey = cafeReq.cafeDateKey || getCafeDateKey(req);

    // Fetch pending orders (all active pending orders, ordered by daily sequence)
    const pendingRes = await db.execute(`
      SELECT id, date_key, daily_order_number, status, payment_method, total_amount, notes, created_at, settled_at, updated_at
      FROM orders
      WHERE status = 'PENDING'
      ORDER BY daily_order_number ASC, created_at ASC;
    `);

    // Fetch settled orders for today (ordered by settled_at DESC)
    const settledRes = await db.execute({
      sql: `SELECT id, date_key, daily_order_number, status, payment_method, total_amount, notes, created_at, settled_at, updated_at
            FROM orders
            WHERE status = 'SETTLED' AND date_key = ?
            ORDER BY settled_at DESC, daily_order_number DESC
            LIMIT 50;`,
      args: [dateKey]
    });

    const allOrderRows = [...(pendingRes.rows || []), ...(settledRes.rows || [])];
    const itemsByOrderId = new Map<string, any[]>();

    if (allOrderRows.length > 0) {
      const placeholders = allOrderRows.map(() => '?').join(',');
      const itemsRes = await db.execute({
        sql: `SELECT id, order_id, menu_item_id, item_name, unit_price, quantity, subtotal, is_delivered, created_at
              FROM order_items
              WHERE order_id IN (${placeholders})
              ORDER BY rowid ASC;`,
        args: allOrderRows.map((r: any) => String(r.id))
      });

      for (const itemRow of itemsRes.rows || []) {
        const oid = String(itemRow.order_id);
        if (!itemsByOrderId.has(oid)) {
          itemsByOrderId.set(oid, []);
        }
        itemsByOrderId.get(oid)!.push(itemRow);
      }
    }

    const pending = (pendingRes.rows || []).map((r: any) =>
      formatOrder(r, itemsByOrderId.get(String(r.id)) || [])
    );
    const settled = (settledRes.rows || []).map((r: any) =>
      formatOrder(r, itemsByOrderId.get(String(r.id)) || [])
    );

    return res.status(200).json({ pending, settled });
  } catch (err: any) {
    console.error('[API /api/kitchen/orders] Error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch kitchen orders' });
  }
});

export default router;
