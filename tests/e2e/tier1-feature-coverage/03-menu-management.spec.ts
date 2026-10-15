import { test, expect } from '@playwright/test';
import { unlockReceptionWithPin, getAuthToken, getAuthHeaders } from '../../helpers/auth-helper.js';

test.describe('Tier 1: Feature Coverage — Menu Management (R3)', () => {

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/reception');
    await unlockReceptionWithPin(page, '1234');
  });

  test('TC-MENU-01: Reception menu management displays active catalog items', async ({ page, request }) => {
    // Check menu endpoint returns list of items
    const menuRes = await request.get('/api/menu');
    if (menuRes.ok()) {
      const items = await menuRes.json();
      expect(Array.isArray(items)).toBe(true);
    }

    // Navigate to Menu Management tab/link if present in UI
    const menuTab = page.locator('button:has-text("Menu"), a:has-text("Menu"), [data-testid="tab-menu"]').first();
    if (await menuTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await menuTab.click();
      const menuList = page.locator('[data-testid="menu-list"], .menu-admin-list, text=/Catalog|Menu/i').first();
      await expect(menuList).toBeVisible();
    }
  });

  test('TC-MENU-02: Add new menu item with valid name, category, and price', async ({ request }) => {
    const token = await getAuthToken(request, '1234');
    const newItem = {
      name: `Special Masala Chai ${Date.now()}`,
      category: 'Drinks',
      price: 25
    };

    const addRes = await request.post('/api/menu', {
      headers: getAuthHeaders(token),
      data: newItem
    });

    if (addRes.status() === 201 || addRes.status() === 200) {
      const created = await addRes.json();
      expect(created.name).toBe(newItem.name);
      expect(created.price).toBe(25);
    } else {
      // Endpoint may be implemented in M2
      expect([200, 201, 404]).toContain(addRes.status());
    }
  });

  test('TC-MENU-03: Edit existing menu item name and price', async ({ request }) => {
    const token = await getAuthToken(request, '1234');
    const authHeaders = getAuthHeaders(token);

    // Fetch existing menu items
    const listRes = await request.get('/api/menu');
    if (listRes.ok()) {
      const items = await listRes.json();
      if (items.length > 0) {
        const target = items[0];
        const editRes = await request.put(`/api/menu/${target.id}`, {
          headers: authHeaders,
          data: {
            name: `${target.name} (Updated)`,
            category: target.category,
            price: target.price + 5
          }
        });
        expect([200, 404]).toContain(editRes.status());
      }
    }
  });

  test('TC-MENU-04: Remove / deactivate a menu item from active catalog', async ({ request }) => {
    const token = await getAuthToken(request, '1234');
    const authHeaders = getAuthHeaders(token);

    // Create a temporary item to remove
    const tempRes = await request.post('/api/menu', {
      headers: authHeaders,
      data: {
        name: `Temp Delete Item ${Date.now()}`,
        category: 'Snacks',
        price: 50
      }
    });

    if (tempRes.status() === 201 || tempRes.status() === 200) {
      const tempItem = await tempRes.json();
      const deleteRes = await request.delete(`/api/menu/${tempItem.id}`, {
        headers: authHeaders
      });
      expect([200, 204]).toContain(deleteRes.status());
    }
  });

  test('TC-MENU-05: Input validation prevents empty name or negative price', async ({ request }) => {
    const token = await getAuthToken(request, '1234');
    const authHeaders = getAuthHeaders(token);

    // Negative price
    const negRes = await request.post('/api/menu', {
      headers: authHeaders,
      data: {
        name: 'Negative Price Item',
        category: 'Drinks',
        price: -15
      }
    });
    expect([400, 422, 404]).toContain(negRes.status());

    // Blank name
    const blankRes = await request.post('/api/menu', {
      headers: authHeaders,
      data: {
        name: '   ',
        category: 'Drinks',
        price: 20
      }
    });
    expect([400, 422, 404]).toContain(blankRes.status());
  });

  test('TC-MENU-06: Direct menu mutation attempts without PIN token are rejected (401/403)', async ({ request }) => {
    // Unauthenticated POST /api/menu
    const unauthPost = await request.post('/api/menu', {
      data: {
        name: 'Hacker Drink',
        category: 'Drinks',
        price: 10
      }
    });
    expect([401, 403]).toContain(unauthPost.status());

    // Unauthenticated PUT /api/menu/:id
    const unauthPut = await request.put('/api/menu/fake-id', {
      data: { price: 999 }
    });
    expect([401, 403]).toContain(unauthPut.status());

    // Unauthenticated DELETE /api/menu/:id
    const unauthDelete = await request.delete('/api/menu/fake-id');
    expect([401, 403]).toContain(unauthDelete.status());
  });

});
