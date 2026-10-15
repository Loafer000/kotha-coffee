import express, { type Response } from 'express';
import ExcelJS from 'exceljs';
import { getDbClient } from '../db/client.js';
import { requireReceptionAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { getCafeDateKey } from '../middleware/timezone.js';

function styleHeaderRow(row: ExcelJS.Row, bgArgb = 'FF3E2723') {
  row.height = 24;
  row.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: bgArgb }
    };
    cell.font = {
      bold: true,
      color: { argb: 'FFFFFFF8' },
      size: 11
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF2C1810' } },
      bottom: { style: 'medium', color: { argb: 'FF2C1810' } },
      left: { style: 'thin', color: { argb: 'FF5D4037' } },
      right: { style: 'thin', color: { argb: 'FF5D4037' } }
    };
  });
}

function autoFitColumns(worksheet: ExcelJS.Worksheet) {
  worksheet.columns.forEach((column) => {
    let maxLength = 12;
    column.eachCell?.({ includeEmpty: false }, (cell) => {
      const cellLength = cell.value ? String(cell.value).length : 0;
      if (cellLength > maxLength) {
        maxLength = cellLength;
      }
    });
    column.width = Math.min(maxLength + 4, 45);
  });
}

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

/**
 * GET /api/analytics/export
 * Downloads the selected day's detailed analysis as an Excel (.xlsx) spreadsheet.
 * Guarded by requireReceptionAuth.
 */
router.get('/export', requireReceptionAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawDate = (req.query.date || req.query.dateKey) as string | undefined;
    let targetDate: string;

    if (rawDate && typeof rawDate === 'string' && rawDate.trim().length > 0) {
      targetDate = rawDate.trim();
    } else {
      targetDate = getCafeDateKey(req);
    }

    const db = getDbClient();
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Kotha & Coffee POS';
    workbook.created = new Date();

    // 1. Sheet: Daily Summary
    const summarySheet = workbook.addWorksheet('Daily Summary');
    summarySheet.mergeCells('A1:C1');
    const titleCell = summarySheet.getCell('A1');
    titleCell.value = 'Kotha & Coffee (কথা & Coffee) — Daily Sales Report';
    titleCell.font = { bold: true, size: 14, color: { argb: 'FF3E2723' } };
    titleCell.alignment = { horizontal: 'center' };

    summarySheet.mergeCells('A2:C2');
    const dateCell = summarySheet.getCell('A2');
    dateCell.value = `Date: ${targetDate} (Asia/Kolkata Timezone)`;
    dateCell.font = { italic: true, size: 10, color: { argb: 'FF8D493A' } };
    dateCell.alignment = { horizontal: 'center' };

    summarySheet.addRow([]);

    const summaryHeader = summarySheet.addRow(['Metric', 'Details', 'Amount (₹) / Count']);
    styleHeaderRow(summaryHeader);

    const summaryResult = await db.execute({
      sql: `SELECT COUNT(*) as order_count, COALESCE(SUM(total_amount), 0) as grand_total FROM orders WHERE status = 'SETTLED' AND date_key = ?;`,
      args: [targetDate]
    });
    const orderCount = Number(summaryResult.rows[0]?.order_count || 0);
    const grandTotal = Math.round(Number(summaryResult.rows[0]?.grand_total || 0) * 100) / 100;
    const avgOrder = orderCount > 0 ? Math.round((grandTotal / orderCount) * 100) / 100 : 0;

    const paymentResult = await db.execute({
      sql: `SELECT payment_method, COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total FROM orders WHERE status = 'SETTLED' AND date_key = ? GROUP BY payment_method;`,
      args: [targetDate]
    });

    let cashTotal = 0, cashCount = 0, upiTotal = 0, upiCount = 0, cardTotal = 0, cardCount = 0;
    for (const row of paymentResult.rows) {
      const m = String(row.payment_method || '').toLowerCase();
      const count = Number(row.count || 0);
      const total = Math.round(Number(row.total || 0) * 100) / 100;
      if (m === 'cash') { cashTotal += total; cashCount += count; }
      else if (m === 'upi') { upiTotal += total; upiCount += count; }
      else if (m === 'card') { cardTotal += total; cardCount += count; }
    }

    summarySheet.addRow(['Gross Revenue', 'Total settled sales for the day', grandTotal]);
    summarySheet.addRow(['Settled Orders', 'Completed tickets fulfilled', orderCount]);
    summarySheet.addRow(['Average Order Value', 'Average per settled ticket', avgOrder]);
    summarySheet.addRow(['Cash Sales', `${cashCount} orders fulfilled via Cash`, cashTotal]);
    summarySheet.addRow(['UPI Sales', `${upiCount} orders fulfilled via UPI (GPay/PhonePe)`, upiTotal]);
    summarySheet.addRow(['Card Sales', `${cardCount} orders fulfilled via Card`, cardTotal]);
    autoFitColumns(summarySheet);

    // 2. Sheet: Itemized Sales Breakdown
    const itemSheet = workbook.addWorksheet('Itemized Sales');
    const itemHeader = itemSheet.addRow(['Item Name', 'Category', 'Quantity Sold', 'Revenue (₹)', '% of Day Total']);
    styleHeaderRow(itemHeader);

    const itemResult = await db.execute({
      sql: `
        SELECT 
          oi.item_name,
          COALESCE((SELECT category FROM menu_items WHERE id = oi.menu_item_id OR name = oi.item_name LIMIT 1), 'General') as category,
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

    for (const r of itemResult.rows) {
      const rev = Math.round(Number(r.total_revenue || 0) * 100) / 100;
      const pct = grandTotal > 0 ? (rev / grandTotal) * 100 : 0;
      itemSheet.addRow([
        String(r.item_name),
        String(r.category || 'General'),
        Number(r.total_quantity || 0),
        rev,
        `${pct.toFixed(1)}%`
      ]);
    }
    autoFitColumns(itemSheet);

    // 3. Sheet: Order Transactions
    const txSheet = workbook.addWorksheet('Transactions');
    const txHeader = txSheet.addRow(['Order #', 'Time (IST)', 'Payment Method', 'Total (₹)', 'Items Ordered', 'Notes']);
    styleHeaderRow(txHeader);

    const ordersResult = await db.execute({
      sql: `
        SELECT 
          o.id,
          o.daily_order_number,
          o.created_at,
          o.payment_method,
          o.total_amount,
          o.notes
        FROM orders o
        WHERE o.status = 'SETTLED' AND o.date_key = ?
        ORDER BY o.daily_order_number ASC;
      `,
      args: [targetDate]
    });

    for (const ord of ordersResult.rows) {
      const itemsRes = await db.execute({
        sql: `SELECT quantity, item_name, subtotal FROM order_items WHERE order_id = ?;`,
        args: [String(ord.id)]
      });
      const itemsSummary = itemsRes.rows.map(it => `${it.quantity}x ${it.item_name}`).join(', ');

      let formattedTime = String(ord.created_at);
      try {
        formattedTime = new Intl.DateTimeFormat('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        }).format(new Date(String(ord.created_at)));
      } catch {}

      txSheet.addRow([
        `#${ord.daily_order_number}`,
        formattedTime,
        String(ord.payment_method),
        Number(ord.total_amount || 0),
        itemsSummary || 'N/A',
        String(ord.notes || '')
      ]);
    }
    autoFitColumns(txSheet);

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="kotha-coffee-report-${targetDate}.xlsx"`);
    return res.send(Buffer.from(buffer));
  } catch (err: any) {
    console.error('[Export Daily Excel Error]', err);
    return res.status(500).json({ error: err.message || 'Failed to export daily Excel report' });
  }
});

/**
 * GET /api/analytics/export-overall
 * Downloads all-time cumulative analytics across all dates as an Excel (.xlsx) spreadsheet.
 * Guarded by requireReceptionAuth.
 */
router.get('/export-overall', requireReceptionAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDbClient();
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Kotha & Coffee POS';
    workbook.created = new Date();

    // 1. Sheet: Overall Lifetime Summary
    const summarySheet = workbook.addWorksheet('Lifetime Summary');
    summarySheet.mergeCells('A1:C1');
    const titleCell = summarySheet.getCell('A1');
    titleCell.value = 'Kotha & Coffee (কথা & Coffee) — Overall Lifetime Analysis';
    titleCell.font = { bold: true, size: 14, color: { argb: 'FF3E2723' } };
    titleCell.alignment = { horizontal: 'center' };

    summarySheet.addRow([]);

    const summaryHeader = summarySheet.addRow(['Metric', 'Details', 'Lifetime Total']);
    styleHeaderRow(summaryHeader);

    const overallRes = await db.execute(`
      SELECT 
        COUNT(*) as total_orders,
        COALESCE(SUM(total_amount), 0) as total_revenue,
        COUNT(DISTINCT date_key) as total_days
      FROM orders
      WHERE status = 'SETTLED';
    `);

    const totalOrders = Number(overallRes.rows[0]?.total_orders || 0);
    const totalRevenue = Math.round(Number(overallRes.rows[0]?.total_revenue || 0) * 100) / 100;
    const totalDays = Number(overallRes.rows[0]?.total_days || 0);
    const avgOrderVal = totalOrders > 0 ? Math.round((totalRevenue / totalOrders) * 100) / 100 : 0;
    const avgDailyRev = totalDays > 0 ? Math.round((totalRevenue / totalDays) * 100) / 100 : 0;

    summarySheet.addRow(['Lifetime Gross Revenue', 'Cumulative settled sales', `₹${totalRevenue}`]);
    summarySheet.addRow(['Total Settled Orders', 'Total tickets completed', totalOrders]);
    summarySheet.addRow(['Total Operating Days', 'Days with recorded sales', totalDays]);
    summarySheet.addRow(['Average Order Value', 'Average revenue per customer ticket', `₹${avgOrderVal}`]);
    summarySheet.addRow(['Average Daily Revenue', 'Average revenue per operating day', `₹${avgDailyRev}`]);

    const payRes = await db.execute(`
      SELECT payment_method, COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total
      FROM orders
      WHERE status = 'SETTLED'
      GROUP BY payment_method;
    `);

    for (const r of payRes.rows) {
      summarySheet.addRow([
        `Lifetime ${r.payment_method} Sales`,
        `${r.count} orders paid via ${r.payment_method}`,
        `₹${Math.round(Number(r.total || 0) * 100) / 100}`
      ]);
    }
    autoFitColumns(summarySheet);

    // 2. Sheet: Daily Breakdown
    const dailySheet = workbook.addWorksheet('Daily Breakdown');
    const dailyHeader = dailySheet.addRow(['Date', 'Settled Orders', 'Cash (₹)', 'UPI (₹)', 'Card (₹)', 'Day Total (₹)']);
    styleHeaderRow(dailyHeader);

    const dailyRes = await db.execute(`
      SELECT 
        date_key,
        COUNT(*) as order_count,
        COALESCE(SUM(CASE WHEN LOWER(payment_method) = 'cash' THEN total_amount ELSE 0 END), 0) as cash_total,
        COALESCE(SUM(CASE WHEN LOWER(payment_method) = 'upi' THEN total_amount ELSE 0 END), 0) as upi_total,
        COALESCE(SUM(CASE WHEN LOWER(payment_method) = 'card' THEN total_amount ELSE 0 END), 0) as card_total,
        COALESCE(SUM(total_amount), 0) as day_total
      FROM orders
      WHERE status = 'SETTLED'
      GROUP BY date_key
      ORDER BY date_key DESC;
    `);

    for (const r of dailyRes.rows) {
      dailySheet.addRow([
        String(r.date_key),
        Number(r.order_count || 0),
        Math.round(Number(r.cash_total || 0) * 100) / 100,
        Math.round(Number(r.upi_total || 0) * 100) / 100,
        Math.round(Number(r.card_total || 0) * 100) / 100,
        Math.round(Number(r.day_total || 0) * 100) / 100
      ]);
    }
    autoFitColumns(dailySheet);

    // 3. Sheet: All-Time Top Selling Items
    const itemsSheet = workbook.addWorksheet('Top Selling Items');
    const itemsHeader = itemsSheet.addRow(['Item Name', 'Category', 'Total Units Sold', 'Lifetime Revenue (₹)', '% of Lifetime Revenue']);
    styleHeaderRow(itemsHeader);

    const itemsRes = await db.execute(`
      SELECT 
        oi.item_name,
        COALESCE((SELECT category FROM menu_items WHERE id = oi.menu_item_id OR name = oi.item_name LIMIT 1), 'General') as category,
        SUM(oi.quantity) as total_quantity,
        SUM(oi.subtotal) as total_revenue
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.status = 'SETTLED'
      GROUP BY oi.item_name
      ORDER BY total_revenue DESC, total_quantity DESC;
    `);

    for (const r of itemsRes.rows) {
      const rev = Math.round(Number(r.total_revenue || 0) * 100) / 100;
      const pct = totalRevenue > 0 ? (rev / totalRevenue) * 100 : 0;
      itemsSheet.addRow([
        String(r.item_name),
        String(r.category || 'General'),
        Number(r.total_quantity || 0),
        rev,
        `${pct.toFixed(1)}%`
      ]);
    }
    autoFitColumns(itemsSheet);

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="kotha-coffee-overall-report.xlsx"');
    return res.send(Buffer.from(buffer));
  } catch (err: any) {
    console.error('[Export Overall Excel Error]', err);
    return res.status(500).json({ error: err.message || 'Failed to export overall Excel report' });
  }
});

export default router;
