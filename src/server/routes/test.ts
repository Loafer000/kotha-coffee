import { Router } from 'express';
import { setMockClock, resetMockClock, getCafeDateKey, getCafeNow } from '../middleware/timezone.js';
import { getDbClient } from '../db/client.js';
import { testHooksEnabled } from '../env.js';

const router = Router();

// Guard: Test routes are disabled in production and whenever a cloud database is configured
router.use((_req, res, next) => {
  if (!testHooksEnabled()) {
    return res.status(403).json({ error: "Test endpoints disabled in production" });
  }
  next();
});

/**
 * POST /api/test/set-time
 * Overrides simulated server clock to verify midnight date rollover in Asia/Kolkata.
 * Body: { timestamp?: string, dateKey?: string }
 */
router.post('/set-time', (req, res) => {
  try {
    const { timestamp, dateKey } = req.body || {};
    if (!timestamp && !dateKey) {
      return res.status(400).json({ error: "Either timestamp or dateKey is required" });
    }

    const result = setMockClock({ timestamp, dateKey });
    return res.status(200).json({
      success: true,
      dateKey: result.dateKey,
      time: result.time
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || "Failed to set test time" });
  }
});

/**
 * POST /api/test/reset-time
 * Restores simulated clock to real system clock.
 */
router.post('/reset-time', (_req, res) => {
  resetMockClock();
  return res.status(200).json({
    restored: true,
    dateKey: getCafeDateKey(),
    time: getCafeNow().toISOString()
  });
});

/**
 * POST /api/test/reset
 * Clears orders, order items, and daily counters for test isolation.
 */
router.post('/reset', async (_req, res) => {
  try {
    const db = getDbClient();
    await db.execute(`DELETE FROM order_items;`);
    await db.execute(`DELETE FROM orders;`);
    await db.execute(`DELETE FROM daily_counters;`);

    return res.status(200).json({ reset: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to reset test database" });
  }
});

export default router;
