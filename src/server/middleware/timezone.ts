import type { Request, Response, NextFunction } from 'express';
import { testHooksEnabled } from '../env.js';

export const CAFE_TIMEZONE = 'Asia/Kolkata';

// In-memory simulated clock for testing purposes
let mockDate: Date | null = null;
let mockDateKey: string | null = null;

/**
 * Formats any given Date object into YYYY-MM-DD in Asia/Kolkata timezone (UTC+05:30).
 */
export function formatDateKey(date: Date): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: CAFE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(date);
}

/**
 * Formats any given Date object into human-readable Indian Standard Time string.
 */
export function formatKolkataTime(date: Date): string {
  return date.toLocaleString('en-IN', { timeZone: CAFE_TIMEZONE });
}

/**
 * Sets simulated clock for testing purposes (used by test route /api/test/set-time).
 */
export function setMockClock(options: { timestamp?: string; dateKey?: string }): { dateKey: string; time: string } {
  if (options.dateKey) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(options.dateKey)) {
      throw new Error(`Invalid dateKey format (expected YYYY-MM-DD): ${options.dateKey}`);
    }
    mockDateKey = options.dateKey;
    // Set a midday time on that date in IST (+05:30)
    mockDate = new Date(`${options.dateKey}T12:00:00+05:30`);
  } else if (options.timestamp) {
    const d = new Date(options.timestamp);
    if (isNaN(d.getTime())) {
      throw new Error(`Invalid timestamp: ${options.timestamp}`);
    }
    mockDate = d;
    mockDateKey = formatDateKey(d);
  } else {
    throw new Error('Either timestamp or dateKey must be provided');
  }

  return {
    dateKey: mockDateKey,
    time: mockDate.toISOString()
  };
}

/**
 * Restores simulated clock to real system clock.
 */
export function resetMockClock(): void {
  mockDate = null;
  mockDateKey = null;
}

/**
 * Resolves effective current Date object, taking into account:
 * 1. X-Mock-Date request header (if present)
 * 2. Simulated clock state (if set)
 * 3. Real system clock (default)
 */
export function getCafeNow(req?: Request): Date {
  const isProduction = !testHooksEnabled();

  if (!isProduction && req) {
    const headerMock = req.header('X-Mock-Date') || req.header('x-mock-date');
    if (headerMock) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(headerMock)) {
        const d = new Date(`${headerMock}T12:00:00+05:30`);
        if (!isNaN(d.getTime())) return d;
      } else {
        const d = new Date(headerMock);
        if (!isNaN(d.getTime())) return d;
      }
    }
  }

  if (!isProduction && mockDate) {
    return new Date(mockDate.getTime());
  }

  return new Date();
}

/**
 * Resolves current Asia/Kolkata date key in 'YYYY-MM-DD' format,
 * respecting request headers, simulated clock, and real system time.
 */
export function getCafeDateKey(req?: Request): string {
  const isProduction = !testHooksEnabled();

  if (!isProduction && req) {
    const headerMock = req.header('X-Mock-Date') || req.header('x-mock-date');
    if (headerMock) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(headerMock)) {
        return headerMock;
      }
      const d = new Date(headerMock);
      if (!isNaN(d.getTime())) {
        return formatDateKey(d);
      }
    }
  }

  if (!isProduction && mockDateKey) {
    return mockDateKey;
  }

  return formatDateKey(getCafeNow(req));
}

export interface CafeRequest extends Request {
  cafeDateKey?: string;
  cafeTime?: Date;
}

/**
 * Express middleware attaching cafeDateKey and cafeTime to incoming requests.
 */
export function timezoneMiddleware(req: CafeRequest, _res: Response, next: NextFunction): void {
  req.cafeDateKey = getCafeDateKey(req);
  req.cafeTime = getCafeNow(req);
  next();
}
