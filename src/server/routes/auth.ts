import { Router } from 'express';
import {
  verifyPin,
  generateSessionToken,
  updateAdminPin,
  requireReceptionAuth,
  pinLockoutSeconds,
  recordFailedPin,
  clearFailedPins
} from '../middleware/auth.js';

const router = Router();

function rejectIfLockedOut(req: any, res: any): boolean {
  const retryAfter = pinLockoutSeconds(req);
  if (retryAfter > 0) {
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({
      error: `Too many wrong PIN attempts. Try again in ${Math.ceil(retryAfter / 60)} minute(s).`
    });
    return true;
  }
  return false;
}

/**
 * POST /api/auth/verify-pin
 * Verifies staff/owner PIN and returns 12-hour signed session token.
 */
router.post('/verify-pin', async (req, res) => {
  try {
    if (rejectIfLockedOut(req, res)) return;

    const { pin } = req.body || {};

    if (!pin || typeof pin !== 'string') {
      return res.status(401).json({ error: "Invalid PIN" });
    }

    const isValid = await verifyPin(pin);
    if (!isValid) {
      recordFailedPin(req);
      return res.status(401).json({ error: "Invalid PIN" });
    }

    clearFailedPins(req);
    const { token, expiresIn } = generateSessionToken();
    return res.status(200).json({ token, expiresIn });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
});

/**
 * POST /api/auth/change-pin
 * Protected endpoint for owner to update PIN in settings table.
 */
router.post('/change-pin', requireReceptionAuth, async (req, res) => {
  try {
    if (rejectIfLockedOut(req, res)) return;

    const { currentPin, newPin } = req.body || {};

    // Validate newPin: must be a numeric string of 4 to 6 digits
    if (!newPin || typeof newPin !== 'string' || !/^\d{4,6}$/.test(newPin.trim())) {
      return res.status(400).json({ error: "PIN must be 4 to 6 digits" });
    }

    // Verify currentPin: must be present and valid against stored hash
    if (!currentPin || typeof currentPin !== 'string') {
      return res.status(401).json({ error: "Invalid current PIN" });
    }

    const isCurrentValid = await verifyPin(currentPin);
    if (!isCurrentValid) {
      recordFailedPin(req);
      return res.status(401).json({ error: "Invalid current PIN" });
    }

    await updateAdminPin(newPin.trim());
    return res.status(200).json({ success: true, message: "PIN updated successfully" });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to update PIN" });
  }
});

export default router;
