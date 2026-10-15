import { createServer } from 'http';
import express from 'express';
import analyticsRouter from '../src/server/routes/analytics.js';
import authRouter from '../src/server/routes/auth.js';
import { initSchema } from '../src/server/db/schema.js';

async function verifyExcelExport() {
  console.log('1. Initializing schema...');
  await initSchema();

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api/analytics', analyticsRouter);

  const server = createServer(app).listen(3125);

  try {
    console.log('2. Authenticating with PIN 1234...');
    const authRes = await fetch('http://localhost:3125/api/auth/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '1234' })
    });
    const { token } = await authRes.json();
    if (!token) throw new Error('Failed to get token');

    console.log('3. Testing GET /api/analytics/export?date=2026-10-15 ...');
    const dayRes = await fetch('http://localhost:3125/api/analytics/export?date=2026-10-15', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('   Status:', dayRes.status);
    console.log('   Content-Type:', dayRes.headers.get('content-type'));
    console.log('   Content-Disposition:', dayRes.headers.get('content-disposition'));
    const dayBuf = await dayRes.arrayBuffer();
    console.log('   File Size (bytes):', dayBuf.byteLength);

    if (dayRes.status !== 200 || dayBuf.byteLength < 1000) {
      throw new Error('Day export verification failed');
    }

    console.log('4. Testing GET /api/analytics/export-overall ...');
    const overallRes = await fetch('http://localhost:3125/api/analytics/export-overall', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('   Status:', overallRes.status);
    console.log('   Content-Type:', overallRes.headers.get('content-type'));
    console.log('   Content-Disposition:', overallRes.headers.get('content-disposition'));
    const overallBuf = await overallRes.arrayBuffer();
    console.log('   File Size (bytes):', overallBuf.byteLength);

    if (overallRes.status !== 200 || overallBuf.byteLength < 1000) {
      throw new Error('Overall export verification failed');
    }

    console.log('✅ ALL EXCEL EXPORT VERIFICATION TESTS PASSED!');
  } finally {
    server.close();
  }
}

verifyExcelExport().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
