import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getDbClient } from '../db/client.js';
import { isProductionLike } from '../env.js';

const DEFAULT_PIN = '1234';
// Fixed secret is ONLY used for local development/tests. In production-like mode
// (NODE_ENV=production or cloud DB) a random secret is generated and persisted.
const DEV_JWT_SECRET = 'kotha-coffee-reception-session-secret-2026';
const TOKEN_EXPIRY_SECONDS = 12 * 60 * 60; // 12 hours

let persistedJwtSecret: string | null = null;

function getJwtSecret(): string {
  const envSecret = process.env.JWT_SECRET && process.env.JWT_SECRET.trim();
  if (envSecret) return envSecret;
  if (!isProductionLike()) return DEV_JWT_SECRET;
  if (persistedJwtSecret) return persistedJwtSecret;
  throw new Error('Session secret not initialised');
}

/**
 * Loads (or creates once) a random session-signing secret stored in the settings table.
 * Called at server startup. No-op when JWT_SECRET is provided or in local dev mode.
 */
export async function initJwtSecret(dbClient?: any): Promise<void> {
  if ((process.env.JWT_SECRET && process.env.JWT_SECRET.trim()) || !isProductionLike()) {
    return;
  }
  const db = dbClient || getDbClient();
  const existing = await db.execute({
    sql: `SELECT value FROM settings WHERE key = 'jwt_secret';`,
    args: []
  });
  if (existing.rows && existing.rows.length > 0 && existing.rows[0].value) {
    persistedJwtSecret = String(existing.rows[0].value);
    return;
  }
  const secret = crypto.randomBytes(48).toString('hex');
  await db.execute({
    sql: `INSERT INTO settings (key, value, updated_at) VALUES ('jwt_secret', ?, ?)
          ON CONFLICT(key) DO NOTHING;`,
    args: [secret, new Date().toISOString()]
  });
  // Re-read in case another instance won the race
  const reread = await db.execute({
    sql: `SELECT value FROM settings WHERE key = 'jwt_secret';`,
    args: []
  });
  persistedJwtSecret = String(reread.rows[0].value);
}

// ---------------------------------------------------------------------------
// Brute-force protection for PIN guesses (active in production-like mode only)
// ---------------------------------------------------------------------------
const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const failedAttempts = new Map<string, { count: number; firstAt: number }>();

function clientKey(req: Request): string {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

/** Returns seconds until the client may retry, or 0 if not locked out. */
export function pinLockoutSeconds(req: Request): number {
  if (!isProductionLike()) return 0;
  const entry = failedAttempts.get(clientKey(req));
  if (!entry) return 0;
  const elapsed = Date.now() - entry.firstAt;
  if (elapsed > LOCKOUT_WINDOW_MS) {
    failedAttempts.delete(clientKey(req));
    return 0;
  }
  return entry.count >= MAX_FAILED_ATTEMPTS ? Math.ceil((LOCKOUT_WINDOW_MS - elapsed) / 1000) : 0;
}

export function recordFailedPin(req: Request): void {
  if (!isProductionLike()) return;
  const key = clientKey(req);
  const now = Date.now();
  const entry = failedAttempts.get(key);
  if (!entry || now - entry.firstAt > LOCKOUT_WINDOW_MS) {
    failedAttempts.set(key, { count: 1, firstAt: now });
  } else {
    entry.count += 1;
  }
}

export function clearFailedPins(req: Request): void {
  failedAttempts.delete(clientKey(req));
}

/** Test helper: resets the in-memory lockout table. */
export function resetPinLockouts(): void {
  failedAttempts.clear();
}

export interface AuthSessionPayload {
  role: 'reception';
  cafe: string;
  iat?: number;
  exp?: number;
}

/**
 * Hashes a numeric PIN using crypto.scryptSync with a cryptographic salt.
 * Returns formatted "salt:hashHex" string.
 */
export function hashPin(pin: string, salt?: string): string {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(pin, actualSalt, 32);
  return `${actualSalt}:${derivedKey.toString('hex')}`;
}

/**
 * Verifies a PIN candidate against a stored hash string or legacy plaintext PIN.
 * Uses crypto.timingSafeEqual to prevent timing attacks.
 */
export function verifyPinAgainstHash(pin: string, storedHashOrPlain: string): boolean {
  if (!pin || typeof pin !== 'string' || !storedHashOrPlain || typeof storedHashOrPlain !== 'string') {
    return false;
  }

  // Reject null-byte injection attempts
  if (pin.includes('\0')) {
    return false;
  }

  const trimmedPin = pin.trim();

  if (storedHashOrPlain.includes(':')) {
    const [salt, expectedHashHex] = storedHashOrPlain.split(':');
    if (!salt || !expectedHashHex) {
      return false;
    }
    const derivedKey = crypto.scryptSync(trimmedPin, salt, 32);
    const expectedBuffer = Buffer.from(expectedHashHex, 'hex');
    if (derivedKey.length !== expectedBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(derivedKey, expectedBuffer);
  }

  // Backward compatibility: compare legacy plaintext using constant-time comparison
  const inputBuffer = Buffer.from(trimmedPin);
  const storedBuffer = Buffer.from(storedHashOrPlain.trim());
  if (inputBuffer.length !== storedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(inputBuffer, storedBuffer);
}

/**
 * Retrieves the current configured PIN hash:
 * 1. Checks 'settings' table for key 'reception_pin'
 * 2. Checks ADMIN_PIN environment variable
 * 3. Falls back to default '1234'
 */
export async function getAdminPin(): Promise<string> {
  try {
    const db = getDbClient();
    const result = await db.execute({
      sql: `SELECT value FROM settings WHERE key = 'reception_pin';`,
      args: []
    });

    if (result.rows && result.rows.length > 0 && result.rows[0].value) {
      return String(result.rows[0].value);
    }
  } catch {
    // If settings table not yet created or DB query fails, fallback
  }

  const fallbackPin = (process.env.ADMIN_PIN && process.env.ADMIN_PIN.trim().length > 0)
    ? process.env.ADMIN_PIN.trim()
    : DEFAULT_PIN;

  return hashPin(fallbackPin);
}

/**
 * Ensures the reception_pin is stored as a cryptographic salt:hash in the settings table.
 */
export async function ensureDefaultPinHashed(dbClient?: any): Promise<void> {
  try {
    const db = dbClient || getDbClient();
    const existing = await db.execute({
      sql: `SELECT value FROM settings WHERE key = 'reception_pin';`,
      args: []
    });

    const now = new Date().toISOString();
    if (!existing.rows || existing.rows.length === 0) {
      const rawDefault = (process.env.ADMIN_PIN && process.env.ADMIN_PIN.trim().length > 0)
        ? process.env.ADMIN_PIN.trim()
        : DEFAULT_PIN;
      const hashed = hashPin(rawDefault);
      await db.execute({
        sql: `INSERT INTO settings (key, value, updated_at) VALUES ('reception_pin', ?, ?);`,
        args: [hashed, now]
      });
    } else {
      const val = String(existing.rows[0].value);
      if (!val.includes(':')) {
        const upgraded = hashPin(val.trim());
        await db.execute({
          sql: `UPDATE settings SET value = ?, updated_at = ? WHERE key = 'reception_pin';`,
          args: [upgraded, now]
        });
      }
    }
  } catch {
    // Ignore if table not yet created
  }
}

/**
 * Verifies if the provided PIN string matches the configured reception PIN.
 */
export async function verifyPin(pin: string): Promise<boolean> {
  if (!pin || typeof pin !== 'string') {
    return false;
  }
  const stored = await getAdminPin();
  return verifyPinAgainstHash(pin, stored);
}

/**
 * Updates the reception PIN in the settings table with cryptographic hashing.
 */
export async function updateAdminPin(newPin: string): Promise<void> {
  const trimmed = (newPin || '').trim();
  if (!/^\d{4,6}$/.test(trimmed)) {
    throw new Error('PIN must be 4 to 6 digits');
  }

  const db = getDbClient();
  const now = new Date().toISOString();
  const hashed = hashPin(trimmed);

  await db.execute({
    sql: `INSERT INTO settings (key, value, updated_at)
          VALUES ('reception_pin', ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`,
    args: [hashed, now]
  });
}

/**
 * Generates a signed 12-hour session token for reception staff.
 */
export function generateSessionToken(): { token: string; expiresIn: number } {
  const payload: AuthSessionPayload = {
    role: 'reception',
    cafe: 'kotha-coffee'
  };

  const token = jwt.sign(payload, getJwtSecret(), {
    algorithm: 'HS256',
    expiresIn: TOKEN_EXPIRY_SECONDS
  });

  return {
    token,
    expiresIn: TOKEN_EXPIRY_SECONDS
  };
}

/**
 * Validates a session token string, returning the payload if valid or null if invalid/expired.
 */
export function verifySessionToken(token: string): AuthSessionPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] }) as AuthSessionPayload;
    if (decoded && decoded.role === 'reception') {
      return decoded;
    }
    return null;
  } catch {
    return null;
  }
}

export interface AuthenticatedRequest extends Request {
  user?: AuthSessionPayload;
}

/**
 * Middleware that guards reception routes and API mutations.
 * Blocks unauthenticated requests with HTTP 401 { error: "Unauthorized" }.
 */
export async function requireReceptionAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  // Extract token from Authorization header (Bearer <token>)
  const authHeader = req.headers.authorization;
  let token: string | null = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.headers['x-session-token']) {
    token = String(req.headers['x-session-token']).trim();
  }

  // Check if token is valid
  if (token) {
    const session = verifySessionToken(token);
    if (session) {
      req.user = session;
      return next();
    }
  }

  // Alternative fallback for test/direct PIN header (subject to brute-force lockout)
  const pinHeader = req.headers['x-admin-pin'];
  if (pinHeader && typeof pinHeader === 'string') {
    const retryAfter = pinLockoutSeconds(req);
    if (retryAfter > 0) {
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({ error: 'Too many wrong PIN attempts. Try again later.' });
      return;
    }
    const isValidPin = await verifyPin(pinHeader);
    if (isValidPin) {
      clearFailedPins(req);
      req.user = { role: 'reception', cafe: 'kotha-coffee' };
      return next();
    }
    recordFailedPin(req);
  }

  // Block unauthenticated request
  res.status(401).json({ error: "Unauthorized" });
}
