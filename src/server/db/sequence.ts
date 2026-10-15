import type { Client } from '@libsql/client';
import { getDbClient } from './client.js';

// Internal serialization queue to prevent in-process race conditions
let sequenceQueue: Promise<any> = Promise.resolve();

/**
 * Executes the atomic upsert statement with retry backoff for multi-process/busy locks.
 */
async function executeUpsertWithRetry(dateKey: string, db: Client, maxRetries = 5): Promise<number> {
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      // Direct atomic upsert using SQLite ON CONFLICT RETURNING
      const result = await db.execute({
        sql: `INSERT INTO daily_counters (date_key, last_number)
              VALUES (?, 1)
              ON CONFLICT(date_key) DO UPDATE SET last_number = daily_counters.last_number + 1
              RETURNING last_number;`,
        args: [dateKey]
      });

      if (result.rows && result.rows.length > 0 && result.rows[0].last_number !== undefined) {
        return Number(result.rows[0].last_number);
      }

      // If returning did not return rows, query the current value
      const selectResult = await db.execute({
        sql: `SELECT last_number FROM daily_counters WHERE date_key = ?;`,
        args: [dateKey]
      });

      if (selectResult.rows && selectResult.rows.length > 0) {
        return Number(selectResult.rows[0].last_number);
      }

      return 1;
    } catch (err: any) {
      attempt++;
      const isBusy = err.code === 'SQLITE_BUSY' ||
                    (err.message && err.message.includes('database is locked'));

      if (isBusy && attempt < maxRetries) {
        // Exponential backoff with jitter
        const delay = 20 * Math.pow(2, attempt) + Math.floor(Math.random() * 20);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }

  throw new Error(`Failed to generate daily order number after ${maxRetries} attempts`);
}

/**
 * Atomically increments and returns the next daily order sequence number
 * for the given date key (in 'YYYY-MM-DD' format).
 *
 * Guarantees:
 * 1. For a fresh dateKey, returns 1.
 * 2. Monotonically increments sequentially (1, 2, 3...).
 * 3. Atomic under concurrency using queue serialization and upsert retry.
 */
export async function getNextDailyOrderNumber(dateKey: string, customClient?: Client): Promise<number> {
  if (!dateKey || typeof dateKey !== 'string') {
    throw new Error(`Invalid dateKey: ${dateKey}`);
  }

  const db = customClient || getDbClient();

  // Chain request onto in-process queue to serialize concurrent calls
  const currentTask = sequenceQueue.then(() => executeUpsertWithRetry(dateKey, db));
  sequenceQueue = currentTask.catch(() => {});

  return currentTask;
}

/**
 * Returns current daily order number for a given dateKey without incrementing it
 */
export async function getCurrentDailyOrderNumber(dateKey: string, customClient?: Client): Promise<number> {
  const db = customClient || getDbClient();
  const res = await db.execute({
    sql: `SELECT last_number FROM daily_counters WHERE date_key = ?;`,
    args: [dateKey]
  });
  if (res.rows && res.rows.length > 0 && res.rows[0].last_number !== undefined) {
    return Number(res.rows[0].last_number);
  }
  return 0;
}

/**
 * Clears or resets daily counter (primarily for test fixtures)
 */
export async function resetDailyCounter(dateKey?: string, customClient?: Client): Promise<void> {
  const db = customClient || getDbClient();
  if (dateKey) {
    await db.execute({
      sql: `DELETE FROM daily_counters WHERE date_key = ?;`,
      args: [dateKey]
    });
  } else {
    await db.execute(`DELETE FROM daily_counters;`);
  }
}
