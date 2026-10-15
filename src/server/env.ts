/**
 * Runtime environment helpers.
 *
 * "Production-like" means the app is serving real cafe data: either NODE_ENV is
 * 'production' OR the database is a remote (cloud) LibSQL/Turso database.
 * Test-only hooks (clock mocking, /api/test/* reset endpoints, the fixed dev JWT
 * secret) are NEVER active in production-like mode, even if NODE_ENV was
 * forgotten during deployment.
 */

export function isRemoteDatabase(): boolean {
  const url = (process.env.DATABASE_URL || '').trim();
  if (!url) return false;
  if (url.startsWith('file:') || url === ':memory:') return false;
  return true;
}

export function isProductionLike(): boolean {
  return process.env.NODE_ENV === 'production' || isRemoteDatabase();
}

export function testHooksEnabled(): boolean {
  return !isProductionLike();
}
