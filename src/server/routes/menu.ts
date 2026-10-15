import crypto from 'crypto';
import express, { type Request, type Response } from 'express';
import { getDbClient } from '../db/client.js';
import { requireReceptionAuth } from '../middleware/auth.js';

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

const router = express.Router();

/**
 * GET /api/menu
 * Public endpoint.
 * Returns all active menu items (is_active = 1) sorted by category and display order.
 * Optional query param: ?all=true or ?include_inactive=true to return all items.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const db = getDbClient();
    const includeInactive = req.query.all === 'true' || req.query.all === '1' || req.query.include_inactive === 'true';

    const sql = includeInactive
      ? `SELECT id, name, category, price, is_active, display_order, created_at, updated_at
         FROM menu_items
         ORDER BY category ASC, display_order ASC, name ASC;`
      : `SELECT id, name, category, price, is_active, display_order, created_at, updated_at
         FROM menu_items
         WHERE is_active = 1
         ORDER BY category ASC, display_order ASC, name ASC;`;

    const result = await db.execute(sql);

    const items: MenuItem[] = (result.rows || []).map((row: any) => ({
      id: String(row.id),
      name: String(row.name),
      category: String(row.category),
      price: Number(row.price),
      is_active: Number(row.is_active),
      display_order: Number(row.display_order ?? 0),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at)
    }));

    res.status(200).json(items);
  } catch (error) {
    console.error('[GET /api/menu] Database error:', error);
    res.status(500).json({ error: 'Failed to retrieve menu items' });
  }
});

/**
 * POST /api/menu
 * Protected by requireReceptionAuth.
 * Adds a new item to the menu catalog.
 * Validates non-empty name and price > 0.
 */
router.post('/', requireReceptionAuth, async (req: Request, res: Response) => {
  try {
    const { name, category, price, display_order } = req.body;

    // Validation: non-empty name
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Item name is required and cannot be empty' });
    }

    // Validation: non-empty category
    if (!category || typeof category !== 'string' || category.trim().length === 0) {
      return res.status(400).json({ error: 'Category is required and cannot be empty' });
    }

    // Validation: price must be a number > 0
    const numericPrice = typeof price === 'number' ? price : parseFloat(String(price));
    if (isNaN(numericPrice) || !isFinite(numericPrice) || numericPrice <= 0) {
      return res.status(400).json({ error: 'Price must be a valid number greater than 0' });
    }

    const trimmedName = name.trim();
    const trimmedCategory = category.trim();
    const db = getDbClient();

    // Determine display order
    let orderNum = 0;
    if (display_order !== undefined && !isNaN(Number(display_order))) {
      orderNum = Number(display_order);
    } else {
      const maxOrderRes = await db.execute({
        sql: `SELECT MAX(display_order) as max_order FROM menu_items WHERE category = ?;`,
        args: [trimmedCategory]
      });
      const maxVal = maxOrderRes.rows[0]?.max_order;
      orderNum = maxVal !== null && maxVal !== undefined ? Number(maxVal) + 1 : 1;
    }

    // Generate unique ID
    const slugBase = trimmedName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 24);
    const id = `${trimmedCategory.toLowerCase().replace(/[^a-z0-9]/g, '')}-${slugBase || 'item'}-${crypto.randomBytes(3).toString('hex')}`;
    const now = new Date().toISOString();

    await db.execute({
      sql: `INSERT INTO menu_items (id, name, category, price, is_active, display_order, created_at, updated_at)
            VALUES (?, ?, ?, ?, 1, ?, ?, ?);`,
      args: [id, trimmedName, trimmedCategory, numericPrice, orderNum, now, now]
    });

    const newItem: MenuItem = {
      id,
      name: trimmedName,
      category: trimmedCategory,
      price: numericPrice,
      is_active: 1,
      display_order: orderNum,
      created_at: now,
      updated_at: now
    };

    res.status(201).json(newItem);
  } catch (error) {
    console.error('[POST /api/menu] Error adding item:', error);
    res.status(500).json({ error: 'Failed to create menu item' });
  }
});

/**
 * PUT /api/menu/:id
 * Protected by requireReceptionAuth.
 * Edits existing menu item (name, category, price, is_active, display_order).
 */
router.put('/:id', requireReceptionAuth, async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Menu item ID is required' });
    }

    const db = getDbClient();
    const existingRes = await db.execute({
      sql: `SELECT id, name, category, price, is_active, display_order, created_at, updated_at
            FROM menu_items WHERE id = ?;`,
      args: [id]
    });

    if (!existingRes.rows || existingRes.rows.length === 0) {
      return res.status(404).json({ error: 'Menu item not found' });
    }

    const existing = existingRes.rows[0];
    const { name, category, price, is_active, display_order } = req.body;

    let updatedName = String(existing.name);
    let updatedCategory = String(existing.category);
    let updatedPrice = Number(existing.price);
    let updatedIsActive = Number(existing.is_active);
    let updatedDisplayOrder = Number(existing.display_order ?? 0);

    // Validate name if provided
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'Item name cannot be empty' });
      }
      updatedName = name.trim();
    }

    // Validate category if provided
    if (category !== undefined) {
      if (typeof category !== 'string' || category.trim().length === 0) {
        return res.status(400).json({ error: 'Category cannot be empty' });
      }
      updatedCategory = category.trim();
    }

    // Validate price if provided
    if (price !== undefined) {
      const numPrice = typeof price === 'number' ? price : parseFloat(String(price));
      if (isNaN(numPrice) || !isFinite(numPrice) || numPrice <= 0) {
        return res.status(400).json({ error: 'Price must be a valid number greater than 0' });
      }
      updatedPrice = numPrice;
    }

    // Validate is_active if provided
    if (is_active !== undefined) {
      if (typeof is_active === 'boolean') {
        updatedIsActive = is_active ? 1 : 0;
      } else if (is_active === 0 || is_active === 1 || is_active === '0' || is_active === '1') {
        updatedIsActive = Number(is_active);
      } else {
        return res.status(400).json({ error: 'is_active must be a boolean or 0/1' });
      }
    }

    // Validate display_order if provided
    if (display_order !== undefined) {
      const numOrder = Number(display_order);
      if (isNaN(numOrder) || !isFinite(numOrder)) {
        return res.status(400).json({ error: 'display_order must be a valid number' });
      }
      updatedDisplayOrder = numOrder;
    }

    const now = new Date().toISOString();

    await db.execute({
      sql: `UPDATE menu_items
            SET name = ?, category = ?, price = ?, is_active = ?, display_order = ?, updated_at = ?
            WHERE id = ?;`,
      args: [updatedName, updatedCategory, updatedPrice, updatedIsActive, updatedDisplayOrder, now, id]
    });

    const updatedItem: MenuItem = {
      id,
      name: updatedName,
      category: updatedCategory,
      price: updatedPrice,
      is_active: updatedIsActive,
      display_order: updatedDisplayOrder,
      created_at: String(existing.created_at),
      updated_at: now
    };

    res.status(200).json(updatedItem);
  } catch (error) {
    console.error('[PUT /api/menu/:id] Error updating item:', error);
    res.status(500).json({ error: 'Failed to update menu item' });
  }
});

/**
 * DELETE /api/menu/:id
 * Protected by requireReceptionAuth.
 * Soft-deletes a menu item (is_active = 0) to preserve historical integrity.
 */
router.delete('/:id', requireReceptionAuth, async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Menu item ID is required' });
    }

    const db = getDbClient();
    const existingRes = await db.execute({
      sql: `SELECT id, name, is_active FROM menu_items WHERE id = ?;`,
      args: [id]
    });

    if (!existingRes.rows || existingRes.rows.length === 0) {
      return res.status(404).json({ error: 'Menu item not found' });
    }

    const now = new Date().toISOString();
    await db.execute({
      sql: `UPDATE menu_items SET is_active = 0, updated_at = ? WHERE id = ?;`,
      args: [now, id]
    });

    res.status(200).json({ success: true, message: 'Menu item deactivated' });
  } catch (error) {
    console.error('[DELETE /api/menu/:id] Error deactivating item:', error);
    res.status(500).json({ error: 'Failed to deactivate menu item' });
  }
});

export default router;
