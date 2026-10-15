import { APIRequestContext, Page } from '@playwright/test';

export const CAFE_TIMEZONE = 'Asia/Kolkata';

/**
 * Formats a Date into YYYY-MM-DD string according to Asia/Kolkata timezone (UTC+05:30).
 */
export function formatKolkataDateKey(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: CAFE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(date);
}

/**
 * Overrides server clock dateKey and timestamp via the server's test endpoint:
 * POST /api/test/set-time { dateKey?: string, timestamp?: string }
 */
export async function setServerDate(
  request: APIRequestContext,
  options: { dateKey?: string; timestamp?: string; baseURL?: string }
): Promise<{ dateKey: string; time: string }> {
  const url = `${options.baseURL || ''}/api/test/set-time`;
  const res = await request.post(url, {
    data: {
      dateKey: options.dateKey,
      timestamp: options.timestamp,
    }
  });

  if (!res.ok()) {
    const text = await res.text();
    throw new Error(`Failed to set mock server date (${res.status()}): ${text}`);
  }

  return await res.json();
}

/**
 * Resets server simulated clock back to the real system clock:
 * POST /api/test/reset-time
 */
export async function resetServerDate(
  request: APIRequestContext,
  baseURL: string = ''
): Promise<{ restored: boolean; dateKey: string; time: string }> {
  const url = `${baseURL}/api/test/reset-time`;
  const res = await request.post(url);

  if (!res.ok()) {
    const text = await res.text();
    throw new Error(`Failed to reset mock server date (${res.status()}): ${text}`);
  }

  return await res.json();
}

/**
 * Returns header object with X-Mock-Date set for per-request clock injection.
 */
export function getMockDateHeaders(dateKeyOrIso: string): Record<string, string> {
  return {
    'X-Mock-Date': dateKeyOrIso
  };
}

/**
 * Configures Playwright Page instance to attach X-Mock-Date header to all outbound requests.
 */
export async function injectPageMockDate(page: Page, dateKeyOrIso: string): Promise<void> {
  await page.setExtraHTTPHeaders({
    'X-Mock-Date': dateKeyOrIso
  });
}
