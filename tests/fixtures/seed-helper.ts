import { APIRequestContext } from '@playwright/test';
import { SEEDED_3DAY_DATASET } from './seeded-analytics.fixture.js';
import { MENU_ITEMS_34 } from './menu-items.fixture.js';
import { getAuthToken, getAuthHeaders } from '../helpers/auth-helper.js';

/**
 * Seeds the 3-day dataset using the REST API.
 * Ensures orders are placed with respective mock dates, payment methods, and statuses.
 */
export async function seed3DayDatasetViaApi(
  request: APIRequestContext,
  baseURL: string = ''
): Promise<void> {
  const token = await getAuthToken(request, '1234', baseURL);
  const authHeaders = getAuthHeaders(token);

  // 1. Ensure test database is clean
  await request.post(`${baseURL}/api/test/reset`);

  // 2. Ensure menu items exist
  const existingMenuRes = await request.get(`${baseURL}/api/menu`);
  let existingItems: Array<{ id: string; name: string; price: number }> = [];
  if (existingMenuRes.ok()) {
    existingItems = await existingMenuRes.json().catch(() => []);
  }

  // If menu is empty, seed 34 items
  if (existingItems.length === 0) {
    for (const item of MENU_ITEMS_34) {
      const res = await request.post(`${baseURL}/api/menu`, {
        headers: authHeaders,
        data: item
      });
      if (res.ok()) {
        const created = await res.json();
        existingItems.push(created);
      }
    }
  }

  const itemMap = new Map<string, { id: string; name: string; price: number }>();
  for (const it of existingItems) {
    itemMap.set(it.name, it);
  }

  // 3. For each date, set mock date and create orders
  for (const [dateKey, orders] of Object.entries(SEEDED_3DAY_DATASET)) {
    // Set server mock clock for this date
    await request.post(`${baseURL}/api/test/set-time`, {
      data: { dateKey }
    });

    for (const ord of orders) {
      // Build order items payload
      const itemsPayload = ord.items.map(it => {
        const found = itemMap.get(it.name);
        return {
          menuItemId: found ? found.id : undefined,
          name: it.name,
          unitPrice: it.price,
          quantity: it.qty
        };
      });

      // Create order
      const createRes = await request.post(`${baseURL}/api/orders`, {
        headers: {
          ...authHeaders,
          'X-Mock-Date': dateKey
        },
        data: {
          items: itemsPayload,
          paymentMethod: ord.paymentMethod,
        }
      });

      if (!createRes.ok()) {
        const errText = await createRes.text();
        throw new Error(`Failed to create order on ${dateKey}: ${errText}`);
      }

      const createdOrder = await createRes.json();

      // If SETTLED, invoke Done
      if (ord.status === 'SETTLED') {
        const doneRes = await request.post(`${baseURL}/api/orders/${createdOrder.id}/done`, {
          headers: {
            ...authHeaders,
            'X-Mock-Date': dateKey
          }
        });
        if (!doneRes.ok()) {
          const errText = await doneRes.text();
          throw new Error(`Failed to settle order ${createdOrder.id}: ${errText}`);
        }
      } else if (ord.status === 'CANCELLED') {
        // If CANCELLED, invoke cancel
        const cancelRes = await request.delete(`${baseURL}/api/orders/${createdOrder.id}`, {
          headers: {
            ...authHeaders,
            'X-Mock-Date': dateKey
          }
        });
        if (!cancelRes.ok()) {
          const errText = await cancelRes.text();
          throw new Error(`Failed to cancel order ${createdOrder.id}: ${errText}`);
        }
      }
    }
  }

  // Restore clock
  await request.post(`${baseURL}/api/test/reset-time`);
}
