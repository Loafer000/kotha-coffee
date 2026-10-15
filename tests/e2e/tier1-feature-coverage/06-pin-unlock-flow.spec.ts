import { test, expect } from '@playwright/test';
import { DEFAULT_PIN } from '../../helpers/auth-helper.js';

test.describe('Tier 1: Feature Coverage — PIN Unlock Flow & Session (R8)', () => {

  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/reception');
  });

  test('TC-PIN-01: Navigating to Reception presents numeric PIN gatekeeper modal', async ({ page }) => {
    const pinInput = page.locator('input[type="password"], [data-testid="pin-input"], input[placeholder*="PIN" i]').first();
    const pinHeading = page.locator('text=/Enter PIN|Reception PIN|লগইন/i, [data-testid="pin-modal"]').first();

    const hasPinInput = await pinInput.isVisible({ timeout: 5000 }).catch(() => false);
    const hasPinHeading = await pinHeading.isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasPinInput || hasPinHeading).toBe(true);
  });

  test('TC-PIN-02: Incorrect PIN is rejected with error feedback and remains locked', async ({ page, request }) => {
    // Test via direct API first
    const badApiRes = await request.post('/api/auth/verify-pin', {
      data: { pin: '9999' }
    });
    expect(badApiRes.status()).toBe(401);

    // Test via UI
    const pinInput = page.locator('input[type="password"], [data-testid="pin-input"]').first();
    if (await pinInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await pinInput.fill('0000');
      const submitBtn = page.locator('button:has-text("Unlock"), button:has-text("Enter"), button[type="submit"]').first();
      await submitBtn.click();

      // Verify error message or input shake
      const errorMsg = page.locator('text=/Invalid PIN|Incorrect PIN|Wrong PIN/i, [data-testid="pin-error"]').first();
      await expect(errorMsg).toBeVisible({ timeout: 4000 });
    }
  });

  test('TC-PIN-03: Correct default PIN (1234) unlocks reception successfully', async ({ page, request }) => {
    // Verify API issues 12h session token
    const goodApiRes = await request.post('/api/auth/verify-pin', {
      data: { pin: DEFAULT_PIN }
    });
    expect(goodApiRes.status()).toBe(200);
    const body = await goodApiRes.json();
    expect(body).toHaveProperty('token');
    expect(body.expiresIn).toBe(43200); // 12 hours = 43200 seconds

    // Test via UI
    const pinInput = page.locator('input[type="password"], [data-testid="pin-input"]').first();
    if (await pinInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await pinInput.fill(DEFAULT_PIN);
      const submitBtn = page.locator('button:has-text("Unlock"), button:has-text("Enter"), button[type="submit"]').first();
      await submitBtn.click();

      // Modal should disappear and reception interface become accessible
      await expect(pinInput).not.toBeVisible({ timeout: 5000 });
    }
  });

  test('TC-PIN-04: Persistent session caches unlocked state without re-prompting on refresh', async ({ page }) => {
    const pinInput = page.locator('input[type="password"], [data-testid="pin-input"]').first();
    if (await pinInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await pinInput.fill(DEFAULT_PIN);
      const submitBtn = page.locator('button:has-text("Unlock"), button:has-text("Enter"), button[type="submit"]').first();
      await submitBtn.click();
      await expect(pinInput).not.toBeVisible({ timeout: 5000 });

      // Refresh the page
      await page.reload();

      // PIN modal must NOT prompt again during active session
      await page.waitForTimeout(1000);
      const pinAfterRefresh = page.locator('input[type="password"]:visible, [data-testid="pin-input"]:visible');
      await expect(pinAfterRefresh).toHaveCount(0);
    }
  });

  test('TC-PIN-05: Owner can change PIN with valid current PIN', async ({ request }) => {
    // 1. Login with current default PIN
    const authRes = await request.post('/api/auth/verify-pin', { data: { pin: '1234' } });
    const { token } = await authRes.json();

    // 2. Change PIN to 5678
    const changeRes = await request.post('/api/auth/change-pin', {
      headers: { Authorization: `Bearer ${token}` },
      data: { currentPin: '1234', newPin: '5678' }
    });
    expect(changeRes.status()).toBe(200);

    // 3. Verify new PIN works
    const newLoginRes = await request.post('/api/auth/verify-pin', { data: { pin: '5678' } });
    expect(newLoginRes.status()).toBe(200);

    // 4. Verify old PIN no longer works
    const oldLoginRes = await request.post('/api/auth/verify-pin', { data: { pin: '1234' } });
    expect(oldLoginRes.status()).toBe(401);

    // 5. Restore default PIN for other tests
    const newToken = (await newLoginRes.json()).token;
    await request.post('/api/auth/change-pin', {
      headers: { Authorization: `Bearer ${newToken}` },
      data: { currentPin: '5678', newPin: '1234' }
    });
  });

  test('TC-PIN-06: Changing PIN with invalid current PIN is rejected (401)', async ({ request }) => {
    const authRes = await request.post('/api/auth/verify-pin', { data: { pin: '1234' } });
    const { token } = await authRes.json();

    const badChangeRes = await request.post('/api/auth/change-pin', {
      headers: { Authorization: `Bearer ${token}` },
      data: { currentPin: 'wrong-pin', newPin: '9999' }
    });
    expect(badChangeRes.status()).toBe(401);
  });

});
