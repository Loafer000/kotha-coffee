import fs from 'fs';
import path from 'path';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import { initSchema } from './db/schema.js';
import { closeDbClient } from './db/client.js';
import { initJwtSecret } from './middleware/auth.js';
import { timezoneMiddleware, type CafeRequest, getCafeDateKey, getCafeNow } from './middleware/timezone.js';
import authRouter from './routes/auth.js';
import testRouter from './routes/test.js';
import menuRouter from './routes/menu.js';
import ordersRouter from './routes/orders.js';
import kitchenRouter from './routes/kitchen.js';
import eventsRouter, { closeAllSseClients } from './routes/events.js';
import analyticsRouter from './routes/analytics.js';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Behind a hosting provider's load balancer (e.g. Render) — use the real client IP
app.set('trust proxy', 1);

// Basic middleware
app.use(cors());
app.use(express.json());
app.use(timezoneMiddleware);

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/menu', menuRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/kitchen', kitchenRouter);
app.use('/api/events', eventsRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/test', testRouter);

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  const cafeReq = req as CafeRequest;
  const time = cafeReq.cafeTime ? cafeReq.cafeTime.toISOString() : getCafeNow(req).toISOString();
  const dateKey = cafeReq.cafeDateKey || getCafeDateKey(req);

  res.status(200).json({
    status: "ok",
    time,
    dateKey
  });
});

// Ensure public directory has brand assets
const publicDir = path.resolve(process.cwd(), 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}
const logoRoot = path.resolve(process.cwd(), 'logo.jpeg');
const logoPublic = path.join(publicDir, 'logo.jpeg');
if (fs.existsSync(logoRoot) && !fs.existsSync(logoPublic)) {
  fs.copyFileSync(logoRoot, logoPublic);
}
const menuRoot = path.resolve(process.cwd(), 'menu.jpeg');
const menuPublic = path.join(publicDir, 'menu.jpeg');
if (fs.existsSync(menuRoot) && !fs.existsSync(menuPublic)) {
  fs.copyFileSync(menuRoot, menuPublic);
}

// Static assets (public folder and compiled client only — never the project root,
// which contains the database file and source code)
const clientDist = path.resolve(process.cwd(), 'dist/client');

app.use(express.static(publicDir));
app.use(express.static(clientDist));

// SPA fallback for non-API routes
app.get('*', (req: Request, res: Response, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  const distIndexPath = path.join(clientDist, 'index.html');
  if (fs.existsSync(distIndexPath)) {
    return res.sendFile(distIndexPath);
  }
  const rootIndexPath = path.resolve(process.cwd(), 'index.html');
  if (fs.existsSync(rootIndexPath)) {
    return res.sendFile(rootIndexPath);
  }
  return res.status(200).send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>কথা & Coffee</title>
</head>
<body style="font-family: sans-serif; background: #FFF8E7; color: #3E2723; padding: 2rem; text-align: center;">
  <h1>কথা & Coffee</h1>
  <p>Client build in progress. Please run npm run build.</p>
</body>
</html>`);
});

let serverInstance: any = null;

export async function startServer(port: number = PORT): Promise<any> {
  // Initialize database tables on server startup
  await initSchema();
  await initJwtSecret();

  if (serverInstance) {
    return serverInstance;
  }

  return new Promise((resolve) => {
    serverInstance = app.listen(port, '0.0.0.0', () => {
      console.log(`[Kotha & Coffee] Server running on http://localhost:${port}`);
      resolve(serverInstance);
    });
  });
}

export async function stopServer(): Promise<void> {
  closeAllSseClients();
  if (serverInstance) {
    await new Promise<void>((resolve, reject) => {
      serverInstance.close((err: any) => {
        if (err) reject(err);
        else resolve();
      });
    });
    serverInstance = null;
  }
  await closeDbClient();
}

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  console.log('[Kotha & Coffee] Received SIGTERM, shutting down gracefully...');
  await stopServer();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Kotha & Coffee] Received SIGINT, shutting down gracefully...');
  await stopServer();
  process.exit(0);
});

// Auto-start if executed directly as entrypoint
const isMain = process.argv[1] && (
  process.argv[1].endsWith('index.ts') ||
  process.argv[1].endsWith('index.js')
);

if (isMain && process.env.NODE_ENV !== 'test') {
  startServer(PORT).catch((err) => {
    console.error('[Kotha & Coffee] Failed to start server:', err);
    process.exit(1);
  });
}

export default app;
