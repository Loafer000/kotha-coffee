import { APIRequestContext, Page } from '@playwright/test';

export const DEFAULT_PIN = '1234';

/**
 * Obtains a 12-hour session token directly via POST /api/auth/verify-pin.
 */
export async function getAuthToken(
  request: APIRequestContext,
  pin: string = DEFAULT_PIN,
  baseURL: string = ''
): Promise<string> {
  const url = `${baseURL}/api/auth/verify-pin`;
  const res = await request.post(url, {
    data: { pin }
  });

  if (!res.ok()) {
    const text = await res.text();
    throw new Error(`Failed to obtain auth token (${res.status()}): ${text}`);
  }

  const json = await res.json();
  return json.token;
}

/**
 * Returns Authorization header with Bearer token.
 */
export function getAuthHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`
  };
}

/**
 * Unlocks the Reception view in a Playwright Page by entering PIN into the UI.
 * Handles PIN modal or page keypad.
 */
export async function unlockReceptionWithPin(
  page: Page,
  pin: string = DEFAULT_PIN
): Promise<void> {
  // If PIN input is present on screen, fill and submit
  const pinInput = page.locator('input[type="password"], input[data-testid="pin-input"], input[placeholder*="PIN" i]').first();
  const isInputVisible = await pinInput.isVisible({ timeout: 2000 }).catch(() => false);

  if (isInputVisible) {
    await pinInput.fill(pin);
    const unlockBtn = page.locator('button:has-text("Unlock"), button:has-text("Enter"), button[type="submit"], button[data-testid="pin-submit"]').first();
    await unlockBtn.click();
    await page.waitForLoadState('networkidle').catch(() => {});
  }
}

/**
 * Seeds session token into page's localStorage so it starts in unlocked state.
 */
export async function seedSessionToken(page: Page, token: string): Promise<void> {
  await page.addInitScript((tok) => {
    try {
      localStorage.setItem('kotha_reception_token', tok);
      localStorage.setItem('auth_token', tok);
      localStorage.setItem('token', tok);
    } catch (_) {}
  }, token);
}
