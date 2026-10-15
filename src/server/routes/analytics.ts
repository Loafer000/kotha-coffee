import express, { type Response } from 'express';
import { getDbClient } from '../db/client.js';
import { requireReceptionAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { getCafeDateKey } from '../middleware/timezone.js';

const router = express.Router();

export interface PaymentSplit {
  total: number;
  count: number;
}

export interface PaymentBreakdown {
  Cash: PaymentSplit;
  UPI: PaymentSplit;
  Card: PaymentSplit;
}

export interface ItemSaleDto {
  itemName: string;
  item_name: string;
  category: string;
  totalQuantity: number;
  total_quantity: number;
  quantity: number;
  totalRevenue: number;
  total_revenue: number;
  revenue: number;
  percentage: number;
}

export interface AnalyticsResponse {
  date: string;
  dateKey: string;
  grandTotal: number;
  orderCount: number;
  paymentBreakdown: PaymentBreakdown;
  payments: PaymentBreakdown;
  itemSales: ItemSaleDto[];
  items: ItemSaleDto[];
}

/**
 * GET /api/analytics
 * Query params:
 *   - date (optional, YYYY-MM-DD): Target calendar date. Defaults to current Asia/Kolkata date.
 * Guarded by requireReceptionAuth (HTTP 401 if missing/invalid).
 * Strictly filters status = 'SETTLED' and date_key = ?.
 * Strictly excludes status = 'PENDING' and status = 'CANCELLED'.
 */
router.get('/', requireReceptionAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawDate = (req.query.date || req.query.dateKey) as string | undefined;
    let targetDate: string;

    if (rawDate && typeof rawDate === 'string' && rawDate.trim().length > 0) {
      const trimmed = rawDate.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return res.status(400).json({ error: 'Invalid date format. Expected YYYY-MM-DD' });
      }
      targetDate = trimmed;
    } else {
      targetDate = getCafeDateKey(req);
    }

    const db = getDbClient();

    // 1. Query settled orders summary (count and grand total)
    const summaryResult = await db.execute({
      sql: `
        SELECT 
          COUNT(*) as order_count,
          COALESCE(SUM(total_amount), 0) as grand_total
        FROM orders
        WHERE status = 'SETTLED' AND date_key = ?;
      `,
      args: [targetDate]
    });

    const orderCount = Number(summaryResult.rows[0]?.order_count || 0);
    const rawGrandTotal = Number(summaryResult.rows[0]?.grand_total || 0);
    const grandTotal = Math.round(rawGrandTotal * 100) / 100;

    // 2. Query payment breakdown (Cash, UPI, Card)
    const paymentResult = await db.execute({
      sql: `
        SELECT 
          payment_method,
          COUNT(*) as count,
          COALESCE(SUM(total_amount), 0) as total
        FROM orders
        WHERE status = 'SETTLED' AND date_key = ?
        GROUP BY payment_method;
      `,
      args: [targetDate]
    });

    const paymentBreakdown: PaymentBreakdown = {
      Cash: { total: 0, count: 0 },
      UPI: { total: 0, count: 0 },
      Card: { total: 0, count: 0 }
    };

    for (const row of paymentResult.rows) {
      const methodRaw = String(row.payment_method || '').toLowerCase();
      const count = Number(row.count || 0);
      const total = Math.round(Number(row.total || 0) * 100) / 100;

      if (methodRaw === 'cash') {
        paymentBreakdown.Cash.total += total;
        paymentBreakdown.Cash.count += count;
      } else if (methodRaw === 'upi') {
        paymentBreakdown.UPI.total += total;
        paymentBreakdown.UPI.count += count;
      } else if (methodRaw === 'card') {
        paymentBreakdown.Card.total += total;
        paymentBreakdown.Card.count += count;
      }
    }

    // Ensure payment totals are clean rounded numbers
    paymentBreakdown.Cash.total = Math.round(paymentBreakdown.Cash.total * 100) / 100;
    paymentBreakdown.UPI.total = Math.round(paymentBreakdown.UPI.total * 100) / 100;
    paymentBreakdown.Card.total = Math.round(paymentBreakdown.Card.total * 100) / 100;

    // 3. Query itemized sales joined with settled orders
    const itemResult = await db.execute({
      sql: `
        SELECT 
          oi.item_name,
          COALESCE(
            (SELECT category FROM menu_items WHERE id = oi.menu_item_id OR name = oi.item_name LIMIT 1),
            'General'
          ) as category,
          SUM(oi.quantity) as total_quantity,
          SUM(oi.subtotal) as total_revenue
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.status = 'SETTLED' AND o.date_key = ?
        GROUP BY oi.item_name
        ORDER BY total_revenue DESC, total_quantity DESC;
      `,
      args: [targetDate]
    });

    const itemSales: ItemSaleDto[] = itemResult.rows.map((row: any) => {
      const itemRevenue = Math.round(Number(row.total_revenue || 0) * 100) / 100;
      const quantity = Number(row.total_quantity || 0);
      const percentage = grandTotal > 0
        ? Math.round((itemRevenue / grandTotal) * 1000) / 10
        : 0;

      return {
        itemName: String(row.item_name),
        item_name: String(row.item_name),
        category: String(row.category || 'General'),
        totalQuantity: quantity,
        total_quantity: quantity,
        quantity,
        totalRevenue: itemRevenue,
        total_revenue: itemRevenue,
        revenue: itemRevenue,
        percentage
      };
    });

    const responsePayload: AnalyticsResponse = {
      date: targetDate,
      dateKey: targetDate,
      grandTotal,
      orderCount,
      paymentBreakdown,
      payments: paymentBreakdown,
      itemSales,
      items: itemSales
    };

    return res.status(200).json(responsePayload);
  } catch (err: any) {
    console.error('[Analytics Error]', err);
    return res.status(500).json({ error: err.message || 'Failed to retrieve analytics' });
  }
});

export default router;
