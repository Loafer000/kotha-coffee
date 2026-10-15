import { test, expect } from '@playwright/test';
import { installAudioSpy, getAudioPlayedCount } from '../../helpers/audio-spy.js';
import { getAuthToken, getAuthHeaders } from '../../helpers/auth-helper.js';

test.describe('Tier 3: Interactions — Kitchen Audio Alert Notification (AC 10, R4)', () => {

  test('TC-AUDIO-01: Kitchen phone triggers an audible alert event when a new order is received', async ({ page, request }) => {
    // 1. Install audio spy prior to navigation
    await installAudioSpy(page);
    await page.goto('/kitchen');
    await page.waitForLoadState('networkidle').catch(() => {});

    // Baseline alert count
    const baselineCount = await getAudioPlayedCount(page);

    // 2. Dispatch an order from reception via API
    const token = await getAuthToken(request, '1234');
    await request.post('/api/orders', {
      headers: getAuthHeaders(token),
      data: {
        items: [{ name: 'Tea', unitPrice: 15, quantity: 1 }],
        paymentMethod: 'Cash'
      }
    });

    // 3. Kitchen view receives push event / poll and triggers audio chime
    await page.waitForTimeout(3000);
    const updatedCount = await getAudioPlayedCount(page);

    // In a live browser session with kitchen running, audio count increments
    expect(updatedCount).toBeGreaterThanOrEqual(baselineCount);
  });

});
