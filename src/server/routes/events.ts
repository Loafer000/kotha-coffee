import express, { type Request, type Response } from 'express';
import type { OrderRecord } from './orders.js';

export type OrderEvent =
  | { type: 'order:created'; order: OrderRecord }
  | { type: 'order:updated'; order: OrderRecord }
  | { type: 'order:settled'; orderId: string; order: OrderRecord }
  | { type: 'order:cancelled'; orderId: string };

const router = express.Router();

/**
 * Set of currently active SSE client response objects.
 */
const activeClients = new Set<Response>();

let heartbeatInterval: NodeJS.Timeout | null = null;

function ensureHeartbeat(): void {
  if (heartbeatInterval) return;

  heartbeatInterval = setInterval(() => {
    if (activeClients.size === 0) return;

    for (const client of activeClients) {
      try {
        client.write(': heartbeat\n\n');
      } catch {
        activeClients.delete(client);
      }
    }
  }, 20000);

  if (heartbeatInterval.unref) {
    heartbeatInterval.unref();
  }
}

/**
 * GET /api/events
 * Public Server-Sent Events (SSE) stream.
 * Accessible without PIN authentication.
 */
router.get('/', (req: Request, res: Response) => {
  // Set required SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*'
  });

  // Send initial comment to acknowledge connection
  res.write(': connected\n\n');

  activeClients.add(res);
  ensureHeartbeat();

  // Clean up on client disconnect
  req.on('close', () => {
    activeClients.delete(res);
  });
});

/**
 * Broadcasts an order event to all connected SSE clients.
 */
export function broadcastOrderEvent(event: OrderEvent): void {
  const payload = JSON.stringify(event);
  // Send both named event and data payload for maximum client compatibility
  const message = `event: ${event.type}\ndata: ${payload}\n\n`;

  for (const client of activeClients) {
    try {
      client.write(message);
    } catch {
      activeClients.delete(client);
    }
  }
}

/**
 * Returns the number of currently connected SSE clients (useful for diagnostics & tests).
 */
export function getConnectedClientCount(): number {
  return activeClients.size;
}

/**
 * Gracefully closes all active SSE client connections and clears timers.
 */
export function closeAllSseClients(): void {
  for (const client of activeClients) {
    try {
      client.end();
    } catch {
      // Ignore errors on closing dead sockets
    }
  }
  activeClients.clear();

  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

export default router;
