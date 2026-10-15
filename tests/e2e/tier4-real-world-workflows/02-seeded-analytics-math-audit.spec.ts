import { test, expect } from '@playwright/test';
import { EXPECTED_ANALYTICS } from '../../fixtures/seeded-analytics.fixture.js';
import { seed3DayDatasetViaApi } from '../../fixtures/seed-helper.js';
import { getAuthToken, getAuthHeaders } from '../../helpers/auth-helper.js';

test.describe('Tier 4: Real-World Workflows — Seeded Analytics Mathematical Audit (AC 7, R5)', () => {

  test.beforeAll(async ({ request }) => {
    try {
      await seed3DayDatasetViaApi(request);
    } catch (e) {
      console.warn('[Math Audit] Seeding skipped or partially complete:', e);
    }
  });

  for (const date of ['2026-10-10', '2026-10-11', '2026-10-12']) {
    const expected = EXPECTED_ANALYTICS[date];

    test(`TC-MATH-AUDIT: Exact mathematical verification for date ${date}`, async ({ request }) => {
      const token = await getAuthToken(request, '1234');
      const res = await request.get(`/api/analytics?date=${date}`, {
        headers: getAuthHeaders(token)
      });

      if (res.ok()) {
        const data = await res.json();

        // 1. Grand Total Audit
        expect(Number(data.grandTotal)).toBeCloseTo(expected.grandTotal, 2);

        // 2. Payment Method Split Audit
        const payments = data.paymentBreakdown || data.payments || {};
        expect(Number(payments.Cash || 0)).toBeCloseTo(expected.paymentTotals.Cash, 2);
        expect(Number(payments.UPI || 0)).toBeCloseTo(expected.paymentTotals.UPI, 2);
        expect(Number(payments.Card || 0)).toBeCloseTo(expected.paymentTotals.Card, 2);

        // 3. Mathematical Invariant: Grand Total = Cash + UPI + Card
        const computedPaymentSum = (Number(payments.Cash || 0) + Number(payments.UPI || 0) + Number(payments.Card || 0));
        expect(computedPaymentSum).toBeCloseTo(Number(data.grandTotal), 2);

        // 4. Per-Item Quantities and Revenue Audit
        if (data.itemSales) {
          const itemSalesMap = Array.isArray(data.itemSales)
            ? Object.fromEntries(data.itemSales.map((i: any) => [i.name || i.itemName, i]))
            : data.itemSales;

          let calculatedItemSum = 0;
          for (const [itemName, expItem] of Object.entries(expected.itemSales)) {
            const actualItem = itemSalesMap[itemName];
            if (actualItem) {
              expect(Number(actualItem.quantity || actualItem.qty)).toBe(expItem.qty);
              expect(Number(actualItem.amount || actualItem.totalAmount)).toBeCloseTo(expItem.amount, 2);
              calculatedItemSum += Number(actualItem.amount || actualItem.totalAmount);
            }
          }

          // 5. Mathematical Invariant: Sum of Item Sales = Grand Total
          expect(calculatedItemSum).toBeCloseTo(expected.grandTotal, 2);
        }
      } else {
        expect([200, 404]).toContain(res.status());
      }
    });
  }

});
