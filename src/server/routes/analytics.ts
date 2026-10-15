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
 * Downloads the selected day's analysis as an Excel spreadsheet.
 * Shows:
 * - Date
 * - Total Items Sold & Overall Revenue
 * - Table: Item Name, Category, Price (₹), Quantity Sold, Total Revenue (₹)
 * - Bottom Total Row
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

    const sheet = workbook.addWorksheet('Daily Sales Report');

    // Title Row
    sheet.mergeCells('A1:E1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'Kotha & Coffee (কথা & Coffee) — Daily Sales Report';
    titleCell.font = { bold: true, size: 14, color: { argb: 'FF3E2723' } };
    titleCell.alignment = { horizontal: 'center' };

    // Date Row
    sheet.mergeCells('A2:E2');
    const dateCell = sheet.getCell('A2');
    dateCell.value = `Date: ${targetDate}`;
    dateCell.font = { bold: true, size: 11, color: { argb: 'FF8D493A' } };
    dateCell.alignment = { horizontal: 'center' };

    // Query item sales for target date
    const itemResult = await db.execute({
      sql: `
        SELECT 
          oi.item_name,
          COALESCE((SELECT category FROM menu_items WHERE id = oi.menu_item_id OR name = oi.item_name LIMIT 1), 'General') as category,
          MAX(oi.unit_price) as unit_price,
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

    let overallRevenue = 0;
    let totalItemsQuantity = 0;

    for (const r of itemResult.rows) {
      overallRevenue += Number(r.total_revenue || 0);
      totalItemsQuantity += Number(r.total_quantity || 0);
    }
    overallRevenue = Math.round(overallRevenue * 100) / 100;

    // KPI Summary Row
    sheet.mergeCells('A3:E3');
    const kpiCell = sheet.getCell('A3');
    kpiCell.value = `Total Items Sold: ${totalItemsQuantity}  |  Overall Revenue: ₹${overallRevenue}`;
    kpiCell.font = { bold: true, size: 11, color: { argb: 'FF1B5E20' } };
    kpiCell.alignment = { horizontal: 'center' };

    sheet.addRow([]); // Blank line

    // Table Header
    const headerRow = sheet.addRow(['Item Name', 'Category', 'Price (₹)', 'Quantity Sold', 'Total Revenue (₹)']);
    styleHeaderRow(headerRow);

    for (const r of itemResult.rows) {
      const price = Number(r.unit_price || 0);
      const qty = Number(r.total_quantity || 0);
      const rev = Math.round(Number(r.total_revenue || 0) * 100) / 100;
      sheet.addRow([
        String(r.item_name),
        String(r.category || 'General'),
        price,
        qty,
        rev
      ]);
    }

    // Bottom Total Row
    const totalRow = sheet.addRow(['TOTAL', '', '', totalItemsQuantity, overallRevenue]);
    totalRow.height = 22;
    totalRow.eachCell((cell) => {
      cell.font = { bold: true, size: 11, color: { argb: 'FF3E2723' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF5EBE1' }
      };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF3E2723' } },
        bottom: { style: 'double', color: { argb: 'FF3E2723' } }
      };
    });

    autoFitColumns(sheet);

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="kotha-coffee-sales-${targetDate}.xlsx"`);
    return res.send(Buffer.from(buffer));
  } catch (err: any) {
    console.error('[Export Daily Excel Error]', err);
    return res.status(500).json({ error: err.message || 'Failed to export daily Excel report' });
  }
});

/**
 * GET /api/analytics/export-overall
 * Downloads all-time cumulative analytics as an Excel spreadsheet.
 * Shows:
 * - Mentioning the date range (minDate to maxDate)
 * - Total Items Sold & Overall Lifetime Revenue
 * - Table: Item Name, Category, Price (₹), Total Quantity Sold, Total Revenue (₹)
 * - Bottom Total Row
 */
router.get('/export-overall', requireReceptionAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDbClient();
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Kotha & Coffee POS';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Overall Sales Report');

    // Query date range
    const rangeRes = await db.execute(`
      SELECT 
        COALESCE(MIN(date_key), 'N/A') as min_date,
        COALESCE(MAX(date_key), 'N/A') as max_date,
        COUNT(DISTINCT date_key) as total_days
      FROM orders
      WHERE status = 'SETTLED';
    `);

    const minDate = String(rangeRes.rows[0]?.min_date || 'N/A');
    const maxDate = String(rangeRes.rows[0]?.max_date || 'N/A');
    const totalDays = Number(rangeRes.rows[0]?.total_days || 0);

    // Title Row
    sheet.mergeCells('A1:E1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'Kotha & Coffee (কথা & Coffee) — Overall Sales Report';
    titleCell.font = { bold: true, size: 14, color: { argb: 'FF3E2723' } };
    titleCell.alignment = { horizontal: 'center' };

    // Dates Row
    sheet.mergeCells('A2:E2');
    const dateCell = sheet.getCell('A2');
    dateCell.value = `Dates: From ${minDate} to ${maxDate} (${totalDays} Active Days)`;
    dateCell.font = { bold: true, size: 11, color: { argb: 'FF8D493A' } };
    dateCell.alignment = { horizontal: 'center' };

    // Query all items sold across all settled orders
    const itemResult = await db.execute(`
      SELECT 
        oi.item_name,
        COALESCE((SELECT category FROM menu_items WHERE id = oi.menu_item_id OR name = oi.item_name LIMIT 1), 'General') as category,
        MAX(oi.unit_price) as unit_price,
        SUM(oi.quantity) as total_quantity,
        SUM(oi.subtotal) as total_revenue
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.status = 'SETTLED'
      GROUP BY oi.item_name
      ORDER BY total_revenue DESC, total_quantity DESC;
    `);

    let overallRevenue = 0;
    let totalItemsQuantity = 0;

    for (const r of itemResult.rows) {
      overallRevenue += Number(r.total_revenue || 0);
      totalItemsQuantity += Number(r.total_quantity || 0);
    }
    overallRevenue = Math.round(overallRevenue * 100) / 100;

    // KPI Summary Row
    sheet.mergeCells('A3:E3');
    const kpiCell = sheet.getCell('A3');
    kpiCell.value = `Total Items Sold: ${totalItemsQuantity}  |  Overall Revenue: ₹${overallRevenue}`;
    kpiCell.font = { bold: true, size: 11, color: { argb: 'FF1B5E20' } };
    kpiCell.alignment = { horizontal: 'center' };

    sheet.addRow([]); // Blank line

    // Table Header
    const headerRow = sheet.addRow(['Item Name', 'Category', 'Price (₹)', 'Total Quantity Sold', 'Total Revenue (₹)']);
    styleHeaderRow(headerRow);

    for (const r of itemResult.rows) {
      const price = Number(r.unit_price || 0);
      const qty = Number(r.total_quantity || 0);
      const rev = Math.round(Number(r.total_revenue || 0) * 100) / 100;
      sheet.addRow([
        String(r.item_name),
        String(r.category || 'General'),
        price,
        qty,
        rev
      ]);
    }

    // Bottom Total Row
    const totalRow = sheet.addRow(['TOTAL', '', '', totalItemsQuantity, overallRevenue]);
    totalRow.height = 22;
    totalRow.eachCell((cell) => {
      cell.font = { bold: true, size: 11, color: { argb: 'FF3E2723' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF5EBE1' }
      };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF3E2723' } },
        bottom: { style: 'double', color: { argb: 'FF3E2723' } }
      };
    });

    autoFitColumns(sheet);

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="kotha-coffee-overall-sales.xlsx"');
    return res.send(Buffer.from(buffer));
  } catch (err: any) {
    console.error('[Export Overall Excel Error]', err);
    return res.status(500).json({ error: err.message || 'Failed to export overall Excel report' });
  }
});

export default router;
