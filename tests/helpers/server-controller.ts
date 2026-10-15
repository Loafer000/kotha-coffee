import { APIRequestContext } from '@playwright/test';
import http from 'http';

/**
 * Polls the health endpoint (GET /api/health) until it responds with 200 OK or times out.
 */
export async function pollHealth(
  baseURL: string = 'http://localhost:3000',
  timeoutMs: number = 15000,
  intervalMs: number = 300
): Promise<{ status: string; time: string; dateKey: string }> {
  const startTime = Date.now();
  const healthUrl = `${baseURL}/api/health`;

  while (Date.now() - startTime < timeoutMs) {
    try {
      const data = await new Promise<{ status: string; time: string; dateKey: string }>((resolve, reject) => {
        const req = http.get(healthUrl, (res) => {
          if (res.statusCode === 200) {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
              try {
                resolve(JSON.parse(body));
              } catch (e) {
                reject(e);
              }
            });
          } else {
            reject(new Error(`Non-200 status: ${res.statusCode}`));
          }
        });

        req.on('error', reject);
        req.setTimeout(1000, () => {
          req.destroy(new Error('Timeout'));
        });
      });

      return data;
    } catch {
      await new Promise(r => setTimeout(r, intervalMs));
    }
  }

  throw new Error(`Server health check at ${healthUrl} failed after ${timeoutMs}ms`);
}

/**
 * Helper to reset test database state between tests.
 * Invokes POST /api/test/reset
 */
export async function resetTestDatabase(
  request: APIRequestContext,
  baseURL: string = ''
): Promise<void> {
  const url = `${baseURL}/api/test/reset`;
  const res = await request.post(url);
  if (!res.ok()) {
    const text = await res.text();
    console.warn(`[test-reset] Reset returned status ${res.status()}: ${text}`);
  }
}
